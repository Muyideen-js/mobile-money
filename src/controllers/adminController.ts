/**
 * Admin Controller — Compliance manual-override actions.
 *
 * Lets admin users override automated KYC decisions after manual review.
 * Per issue #1574:
 *   1. Override fields exist on compliance tables (kyc_applicants,
 *      kyc_tier_upgrade_requests) so the override state is auditable.
 *   2. Override endpoints are mounted behind the `requireAdmin` middleware
 *      — compliance_officer and lower roles cannot execute overrides.
 *   3. The frontend toggles on/off; the underlying SQL UPDATE flips both
 *      `is_manual_override` and the canonical `verification_status` so
 *      downstream services require no schema changes to honor the
 *      override.
 */

import { Request, Response } from "express";
import { Pool } from "pg";
import { z } from "zod";
import logger from "../utils/logger";
import { ERROR_CODES } from "../constants/errorCodes";
import { createError } from "../middleware/errorHandler";
import { pool as defaultPool } from "../config/database";

// ─── validation schemas ──────────────────────────────────────────────────────

const OverrideToggleSchema = z
  .object({
    override: z.boolean({
      message: "override must be a boolean",
    }),
    new_status: z
      .enum(["approved", "rejected", "review", "pending"])
      .optional(),
    reason: z
      .string()
      .trim()
      .min(5, "A reason of at least 5 characters is required")
      .optional(),
  })
  .refine((v) => typeof v.override === "boolean", {
    message: "override is required",
    path: ["override"],
  });

// Allowed canonical KYC statuses — keep in sync with the CHECK constraint on
// kyc_applicants.verification_status.
const KYC_OVERRIDE_STATUSES = ["approved", "rejected", "review", "pending"] as const;

// ─── shared helpers ───────────────────────────────────────────────────────────

interface AdminUser {
  id?: string;
  role?: string;
  [key: string]: unknown;
}

const getAdminUser = (req: Request): Required<Pick<AdminUser, "id">> => {
  const user = (req as Request & { user?: AdminUser }).user;
  if (!user?.id) {
    throw createError(ERROR_CODES.UNAUTHORIZED, "Authentication required", {
      message: "Authentication required",
    });
  }
  return { id: user.id };
};

const paginate = <T>(data: T[], page: number, limit: number) => {
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    data: data.slice(start, end),
    pagination: {
      total: data.length,
      page,
      limit,
      totalPages: Math.ceil(data.length / limit),
    },
  };
};

// ─── controller ──────────────────────────────────────────────────────────────

export class AdminController {
  private db: Pool;

  constructor(db: Pool = defaultPool) {
    this.db = db;
  }

  // ─── listings ─────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/kyc/applicants
   * Lists KYC applicants so admins can review and override their status.
   */
  listKycApplicants = async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Math.min(Number(req.query.limit) || 25, 200);
      const status =
        typeof req.query.status === "string" ? req.query.status : undefined;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (status && KYC_OVERRIDE_STATUSES.includes(status as never)) {
        params.push(status);
        conditions.push(`a.verification_status = $${params.length}`);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const result = await this.db.query<{
        id: string;
        user_id: string;
        applicant_id: string;
        provider: string;
        verification_status: string;
        kyc_level: string;
        rejection_reason: string | null;
        is_manual_override: boolean;
        manual_override_status: string | null;
        manual_override_reason: string | null;
        manual_override_by: string | null;
        manual_override_at: Date | null;
        updated_at: Date;
        created_at: Date;
      }>(
        `SELECT a.id,
                a.user_id,
                a.applicant_id,
                a.provider,
                a.verification_status,
                a.kyc_level,
                a.rejection_reason,
                a.is_manual_override,
                a.manual_override_status,
                a.manual_override_reason,
                a.manual_override_by,
                a.manual_override_at,
                a.updated_at,
                a.created_at
         FROM kyc_applicants a
         ${where}
         ORDER BY a.updated_at DESC`,
        params,
      );

      res.json(paginate(result.rows, page, limit));
    } catch (error) {
      logger.error(
        "[admin] listKycApplicants error: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw createError(
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to list KYC applicants",
      );
    }
  };

  /**
   * GET /api/admin/kyc/applicants/:applicantId
   * Single applicant detail, including override metadata.
   */
  getKycApplicant = async (req: Request, res: Response) => {
    try {
      const { applicantId } = req.params;

      const result = await this.db.query(
        `SELECT id, user_id, applicant_id, provider,
                verification_status, kyc_level, rejection_reason,
                is_manual_override, manual_override_status,
                manual_override_reason, manual_override_by,
                manual_override_at, updated_at, created_at
         FROM kyc_applicants
         WHERE applicant_id = $1 OR id::text = $1
         LIMIT 1`,
        [applicantId],
      );

      if (result.rows.length === 0) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "KYC applicant not found",
          { message: "KYC applicant not found" },
        );
      }

      res.json({ data: result.rows[0] });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode) throw error;
      logger.error(
        "[admin] getKycApplicant error: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw createError(
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to retrieve KYC applicant",
      );
    }
  };

  // ─── override ─────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/kyc/applicants/:applicantId/override
   *
   * Toggles the manual override flag and updates the canonical verification
   * status. Accepts:
   *   - { override: true,  new_status: "approved"|"rejected"|"review"|"pending", reason }
   *   - { override: false }   → clears override metadata, marks automated again
   *
   * Note: routes are wired with the existing `requireAdmin` middleware in
   * src/routes/admin.ts, which already enforces the admin-role constraint.
   */
  toggleKycOverride = async (req: Request, res: Response) => {
    try {
      const admin = getAdminUser(req);
      const parsed = OverrideToggleSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "Invalid override request body",
          { details: parsed.error.flatten().fieldErrors },
        );
      }
      const { override, new_status, reason } = parsed.data;

      if (typeof override !== "boolean") {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "override is required",
          { message: "override is required" },
        );
      }

      if (override && !new_status) {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "new_status is required when enabling override",
          { message: "new_status is required when enabling override" },
        );
      }

      if (override && (!reason || reason.length < 5)) {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "A reason of at least 5 characters is required when enabling override",
          { message: "A reason of at least 5 characters is required when enabling override" },
        );
      }

      const { applicantId } = req.params;

      // Confirm the applicant exists.
      const existing = await this.db.query<{
        id: string;
        applicant_id: string;
        verification_status: string;
      }>(
        `SELECT id, applicant_id, verification_status
         FROM kyc_applicants
         WHERE applicant_id = $1 OR id::text = $1
         LIMIT 1`,
        [applicantId],
      );

      if (existing.rows.length === 0) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "KYC applicant not found",
          { message: "KYC applicant not found" },
        );
      }

      const row = existing.rows[0];

      // Build the UPDATE dynamically based on the toggle.
      let updateSql: string;
      let updateParams: unknown[];

      if (override) {
        // Enable override — set canonical status to the override status
        // and store the audit metadata.
        updateSql = `
          UPDATE kyc_applicants
             SET verification_status     = $1,
                 is_manual_override      = TRUE,
                 manual_override_status  = $1,
                 manual_override_reason  = $2,
                 manual_override_by      = $3,
                 manual_override_at      = CURRENT_TIMESTAMP,
                 updated_at              = CURRENT_TIMESTAMP
           WHERE id = $4
           RETURNING id, applicant_id, verification_status,
                     is_manual_override, manual_override_status,
                     manual_override_reason, manual_override_by,
                     manual_override_at, updated_at`;
        updateParams = [new_status, reason, admin.id, row.id];
      } else {
        // Disable override — clear metadata, keep current canonical status
        // (we deliberately do not auto-revert to "pending"; the next
        // webhook or provider poll will refresh it).
        updateSql = `
          UPDATE kyc_applicants
             SET is_manual_override      = FALSE,
                 manual_override_status  = NULL,
                 manual_override_reason  = NULL,
                 manual_override_by      = NULL,
                 manual_override_at      = NULL,
                 updated_at              = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING id, applicant_id, verification_status,
                     is_manual_override, manual_override_status,
                     manual_override_reason, manual_override_by,
                     manual_override_at, updated_at`;
        updateParams = [row.id];
      }

      const updated = await this.db.query(updateSql, updateParams);
      const updatedRow = updated.rows[0];

      logger.info(
        `[admin] Manual override ${override ? "enabled" : "disabled"} ` +
          `for applicant ${row.applicant_id} by admin ${admin.id} ` +
          `(reason: ${reason ?? "n/a"})`,
      );

      res.json({
        message: override
          ? "KYC decision overridden"
          : "Manual override cleared",
        data: updatedRow,
      });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode) throw error;
      logger.error(
        "[admin] toggleKycOverride error: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw createError(
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to update KYC override",
      );
    }
  };

  // ─── tier-upgrade override ────────────────────────────────────────────────

  /**
   * POST /api/admin/kyc/upgrade-requests/:id/override
   * Optionally sets or clears the manual override flags on the
   * kyc_tier_upgrade_requests table (this controls the right-hand detail
   * panel on the admin UI).
   */
  toggleUpgradeOverride = async (req: Request, res: Response) => {
    try {
      const admin = getAdminUser(req);
      const parsed = OverrideToggleSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "Invalid override request body",
          { details: parsed.error.flatten().fieldErrors },
        );
      }
      const { override, reason } = parsed.data;

      if (typeof override !== "boolean") {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "override is required",
          { message: "override is required" },
        );
      }

      if (override && (!reason || reason.length < 5)) {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "A reason of at least 5 characters is required when enabling override",
          { message: "A reason of at least 5 characters is required when enabling override" },
        );
      }

      const { id } = req.params;

      const existing = await this.db.query(
        `SELECT id, status FROM kyc_tier_upgrade_requests WHERE id = $1 LIMIT 1`,
        [id],
      );

      if (existing.rows.length === 0) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Upgrade request not found",
          { message: "Upgrade request not found" },
        );
      }

      const updateSql = override
        ? `UPDATE kyc_tier_upgrade_requests
              SET is_manual_override = TRUE,
                  manual_override_reason = $1,
                  manual_override_by = $2,
                  manual_override_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, status, is_manual_override,
                      manual_override_reason, manual_override_by,
                      manual_override_at`
        : `UPDATE kyc_tier_upgrade_requests
              SET is_manual_override = FALSE,
                  manual_override_reason = NULL,
                  manual_override_by = NULL,
                  manual_override_at = NULL
            WHERE id = $1
            RETURNING id, status, is_manual_override,
                      manual_override_reason, manual_override_by,
                      manual_override_at`;
      const updateParams = override ? [reason, admin.id, id] : [id];

      const updated = await this.db.query(updateSql, updateParams);

      logger.info(
        `[admin] Upgrade request override ${override ? "enabled" : "disabled"} ` +
          `for request ${id} by admin ${admin.id}`,
      );

      res.json({
        message: override
          ? "Upgrade request override applied"
          : "Upgrade request override cleared",
        data: updated.rows[0],
      });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode) throw error;
      logger.error(
        "[admin] toggleUpgradeOverride error: %s",
        error instanceof Error ? error.message : String(error),
      );
      throw createError(
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to update upgrade override",
      );
    }
  };
}

export default AdminController;
