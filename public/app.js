// Theme Management
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll(".theme-switcher button").forEach((btn) => {
    const active = btn.dataset.theme === theme;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active);
  });
}

function saveTheme(theme) {
  localStorage.setItem("theme", theme);
  setTheme(theme);
}

function loadTheme() {
  const saved = localStorage.getItem("theme") || "carbon";
  setTheme(saved);
}

// Initialize theme before anything else
loadTheme();

// Theme switcher event listeners
document.querySelectorAll(".theme-switcher button").forEach((btn) => {
  btn.addEventListener("click", () => saveTheme(btn.dataset.theme));
});

// Live API Status Polling
async function updateSystemStatus() {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");

  try {
    const res = await fetch("/ready");
    if (res.ok) {
      const data = await res.json();
      if (data.status === "ready") {
        dot.className = "status-dot online";
        text.textContent = "System: Operational";
        return;
      }
    }
    dot.className = "status-dot offline";
    text.textContent = "System: Issues Detected";
  } catch (error) {
    dot.className = "status-dot offline";
    text.textContent = "System: Offline";
  }
}

// Initial status check and periodic updates
updateSystemStatus();
setInterval(updateSystemStatus, 15000);

// Interactive Exchange Rate Calculator
const RATES = {
  NGN: {
    USDC: 0.000645,
    XLM: 0.00645,
    label: "NGN",
    rateStr: "1 NGN = 0.00065 USDC",
  },
  XAF: {
    USDC: 0.001667,
    XLM: 0.01667,
    label: "XAF",
    rateStr: "1 XAF = 0.00167 USDC",
  },
  KES: {
    USDC: 0.007692,
    XLM: 0.07692,
    label: "KES",
    rateStr: "1 KES = 0.00769 USDC",
  },
  GHS: {
    USDC: 0.066667,
    XLM: 0.66667,
    label: "GHS",
    rateStr: "1 GHS = 0.0667 USDC",
  },
  TZS: {
    USDC: 0.000385,
    XLM: 0.003846,
    label: "TZS",
    rateStr: "1 TZS = 0.00038 USDC",
  },
  ZMW: {
    USDC: 0.037037,
    XLM: 0.37037,
    label: "ZMW",
    rateStr: "1 ZMW = 0.0370 USDC",
  },
  RWF: {
    USDC: 0.000758,
    XLM: 0.007576,
    label: "RWF",
    rateStr: "1 RWF = 0.00076 USDC",
  },
};

const sendAmountInput = document.getElementById("calc-send-amount");
const sendCurrencySelect = document.getElementById("calc-send-currency");
const receiveAmountInput = document.getElementById("calc-receive-amount");
const receiveAssetSelect = document.getElementById("calc-receive-asset");

const rateDisplay = document.getElementById("rate-display");
const feeDisplay = document.getElementById("fee-display");
const finalDisplay = document.getElementById("final-display");

function calculateConversion() {
  const sendAmt = parseFloat(sendAmountInput.value) || 0;
  const sendCurrency = sendCurrencySelect.value;
  const receiveAsset = receiveAssetSelect.value;

  const config = RATES[sendCurrency];
  const rate = config[receiveAsset];

  // Operator fee (1.5%)
  const fee = sendAmt * 0.015;
  const netAmt = Math.max(0, sendAmt - fee);
  const receiveVal = netAmt * rate;

  // Update DOM elements
  rateDisplay.textContent = config.rateStr.replace("USDC", receiveAsset);
  feeDisplay.textContent = `${fee.toFixed(0)} ${sendCurrency}`;
  receiveAmountInput.value = receiveVal.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  finalDisplay.textContent = `${receiveAmountInput.value} ${receiveAsset}`;
}

// Add event listeners for inputs
sendAmountInput.addEventListener("input", calculateConversion);
sendCurrencySelect.addEventListener("change", calculateConversion);
receiveAssetSelect.addEventListener("change", calculateConversion);

// Initial calculation
calculateConversion();

// Fetch live rates from our backend proxy
async function loadLiveRates() {
  try {
    const res = await fetch("/api/live-rates");
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.rates) {
        const rates = data.rates;
        for (const cur of Object.keys(RATES)) {
          if (rates[cur]) {
            const rawRate = rates[cur];
            RATES[cur].USDC = 1 / rawRate;
            RATES[cur].XLM = 10 / rawRate; // mock rate 1 USDC = 10 XLM
            RATES[cur].rateStr = `1 ${cur} = ${(1 / rawRate).toFixed(6)} USDC`;
          }
        }
        console.log("Live rates loaded successfully");
        calculateConversion();
      }
    }
  } catch (error) {
    console.warn("Failed to load live rates, using fallback:", error);
  }
}

loadLiveRates();

// API Explorer Tabs
const CODE_SNIPPETS = {
  deposit: `curl -X POST http://localhost:3000/api/transactions/deposit \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: dev-admin-key" \\
  -d '{
    "amount": 2500,
    "phoneNumber": "+237670000000",
    "provider": "mtn",
    "stellarAddress": "GBNGNTEDRBGZN2N7HQ3TUKA76U2YKRMTXPFPDPPJOSVDLQX5S4PXX7E3",
    "userId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "notes": "Savings Deposit"
  }'`,
  withdraw: `curl -X POST http://localhost:3000/api/transactions/withdraw \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: dev-admin-key" \\
  -d '{
    "amount": 1500,
    "phoneNumber": "+255700000000",
    "provider": "airtel",
    "stellarAddress": "GBNGNTEDRBGZN2N7HQ3TUKA76U2YKRMTXPFPDPPJOSVDLQX5S4PXX7E3",
    "userId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "notes": "Remittance Payout"
  }'`,
  paylink: `curl -X POST http://localhost:3000/api/payment-links \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: dev-admin-key" \\
  -d '{
    "amount": 5000,
    "currency": "XAF",
    "merchantId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "description": "Invoice #88493"
  }'`,
  toml: `curl -X GET http://localhost:3000/.well-known/stellar.toml`,
  kyc: `curl -X POST http://localhost:3000/api/kyc/upload \\
  -H "X-API-Key: dev-admin-key" \\
  -F "file=@/path/to/passport.jpg" \\
  -F "type=id_card" \\
  -F "userId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"`,
  stats: `curl -X GET http://localhost:3000/api/v1/stats \\
  -H "X-API-Key: dev-admin-key"`,
  "admin-kyc": `# Compliance Officer Manual Override (issue #1574).
# Admin role only. Toggle to manually override the automated KYC
# decision for an applicant after review.

# List applicants:
curl -X GET http://localhost:3000/api/admin/kyc/applicants \\
  -H "Authorization: Bearer $ADMIN_JWT"

# Manually approve a previously-rejected applicant:
curl -X POST http://localhost:3000/api/admin/kyc/applicants/APP_123/override \\
  -H "Authorization: Bearer $ADMIN_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{
    "override": true,
    "new_status": "approved",
    "reason": "Manual review confirmed identity — utility bill matched"
  }'

# Clear the override (return to automated decision):
curl -X POST http://localhost:3000/api/admin/kyc/applicants/APP_123/override \\
  -H "Authorization: Bearer $ADMIN_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{ "override": false }'`,
};

function selectTab(tabName) {
  // Update active classes on buttons
  const tabs = [
    "deposit",
    "withdraw",
    "paylink",
    "toml",
    "kyc",
    "stats",
    "admin-kyc",
  ];
  tabs.forEach((t) => {
    const btn = document.getElementById(`tab-btn-${t}`);
    if (t === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update code content
  document.getElementById("code-snippet").textContent = CODE_SNIPPETS[tabName];

  // Show / hide admin KYC panel
  const panel = document.getElementById("admin-kyc-panel");
  if (!panel) return;
  if (tabName === "admin-kyc") {
    panel.hidden = false;
    loadAdminKycApplicants();
  } else {
    panel.hidden = true;
  }
}

// Copy Code Helper
function copyCode() {
  const codeText = document.getElementById("code-snippet").textContent;
  navigator.clipboard.writeText(codeText).then(() => {
    const btn = document.getElementById("btn-copy-code");
    const originalText = btn.textContent;
    btn.textContent = "Copied! ✓";
    btn.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
    btn.style.color = "#10b981";
    btn.style.borderColor = "#10b981";

    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.backgroundColor = "";
      btn.style.color = "";
      btn.style.borderColor = "";
    }, 2000);
  });
}

// Bind Event Listeners for CSP Compliance
document
  .getElementById("tab-btn-deposit")
  .addEventListener("click", () => selectTab("deposit"));
document
  .getElementById("tab-btn-withdraw")
  .addEventListener("click", () => selectTab("withdraw"));
document
  .getElementById("tab-btn-paylink")
  .addEventListener("click", () => selectTab("paylink"));
document
  .getElementById("tab-btn-toml")
  .addEventListener("click", () => selectTab("toml"));
document
  .getElementById("tab-btn-kyc")
  .addEventListener("click", () => selectTab("kyc"));
document
  .getElementById("tab-btn-stats")
  .addEventListener("click", () => selectTab("stats"));
const adminTabBtn = document.getElementById("tab-btn-admin-kyc");
if (adminTabBtn)
  adminTabBtn.addEventListener("click", () => selectTab("admin-kyc"));
document.getElementById("btn-copy-code").addEventListener("click", copyCode);

// ─── Admin KYC Override (issue #1574) ─────────────────────────────────────
// Lightweight admin panel that loads KYC applicants and lets an admin toggle
// a manual override on/off, plus change the override status. The override
// endpoints are admin-only — see POST /api/admin/kyc/applicants/.../override.

const ADMIN_KYC_ENDPOINTS = {
  list: "/api/admin/kyc/applicants",
  override: (applicantId) =>
    `/api/admin/kyc/applicants/${encodeURIComponent(applicantId)}/override`,
};

const escapeHtml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

function getCurrentJwt() {
  // The backend sets the JWT under several common keys — pick the first match.
  const keys = ["jwt", "authToken", "token", "admin_jwt"];
  for (const k of keys) {
    const value =
      window.localStorage.getItem(k) || window.sessionStorage.getItem(k);
    if (value) return value;
  }
  return null;
}

function decodeJwt(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload;
  } catch (_) {
    return null;
  }
}

function isAdminUser(payload) {
  if (!payload) return false;
  const role = payload.role || (payload.user && payload.user.role);
  return role === "admin" || role === "super-admin";
}

function setKycStatus(message, kind = "info") {
  const el = document.getElementById("admin-kyc-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function setRoleGate(payload) {
  const gate = document.getElementById("admin-kyc-role-gate");
  if (!gate) return;
  if (isAdminUser(payload)) {
    gate.textContent = "role: admin ✓";
    gate.classList.remove("is-denied");
    gate.classList.add("is-allowed");
  } else {
    gate.textContent = "role: not admin";
    gate.classList.remove("is-allowed");
    gate.classList.add("is-denied");
  }
}

async function fetchAdminKycApplicants() {
  const token = getCurrentJwt();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(ADMIN_KYC_ENDPOINTS.list, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(
      `Failed to load applicants: HTTP ${res.status} ${body.slice(0, 160)}`,
    );
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function renderKycEmpty(message) {
  const wrap = document.getElementById("admin-kyc-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="admin-kyc-empty">${escapeHtml(message)}</div>`;
}

function renderKycError(message) {
  const wrap = document.getElementById("admin-kyc-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="admin-kyc-error">${escapeHtml(message)}</div>`;
}

function buildKycRow(applicant) {
  const isOverridden = !!applicant.is_manual_override;
  const statusPill = `<span class="admin-kyc-status-pill ${escapeHtml(
    applicant.verification_status,
  )}">${escapeHtml(applicant.verification_status)}</span>`;

  const overriddenMeta = isOverridden
    ? `<div class="admin-kyc-row-meta">manual override → <strong>${escapeHtml(
        applicant.manual_override_status || applicant.verification_status,
      )}</strong>${
        applicant.manual_override_reason
          ? ` • ${escapeHtml(applicant.manual_override_reason)}`
          : ""
      }${
        applicant.manual_override_at
          ? ` • ${escapeHtml(
              new Date(applicant.manual_override_at).toLocaleString(),
            )}`
          : ""
      }</div>`
    : "";

  const reasonField = `<input type="text" class="admin-kyc-reason-input" placeholder="Reason (required for override=true)" data-field="reason" />`;

  const statusSelect = `<select class="admin-kyc-status-select" data-field="new_status">
    <option value="approved">approved</option>
    <option value="rejected">rejected</option>
    <option value="review">review</option>
    <option value="pending" selected>pending</option>
  </select>`;

  const toggle = `<label class="toggle-switch" title="Click to toggle manual override">
    <input type="checkbox" data-field="override" ${isOverridden ? "checked" : ""} />
    <span class="slider"></span>
    <span class="toggle-label">${isOverridden ? "On" : "Off"}</span>
  </label>`;

  return `<tr data-applicant-id="${escapeHtml(
    applicant.applicant_id || applicant.id,
  )}">
    <td>
      <div><strong>${escapeHtml(
        applicant.applicant_id || applicant.id || "—",
      )}</strong></div>
      <div class="admin-kyc-row-meta">user: ${escapeHtml(
        applicant.user_id || "—",
      )} • provider: ${escapeHtml(applicant.provider || "—")}</div>
    </td>
    <td>${statusPill}${overriddenMeta}</td>
    <td>${statusSelect}</td>
    <td>${reasonField}</td>
    <td>${toggle}</td>
  </tr>`;
}

function renderKycTable(applicants) {
  const wrap = document.getElementById("admin-kyc-table-wrap");
  if (!wrap) return;
  if (!applicants || applicants.length === 0) {
    renderKycEmpty("No KYC applicants found.");
    return;
  }

  wrap.innerHTML = `<table class="admin-kyc-table">
    <thead>
      <tr>
        <th>Applicant</th>
        <th>Status</th>
        <th>Override Status</th>
        <th>Reason</th>
        <th>Manual Override</th>
      </tr>
    </thead>
    <tbody>
      ${applicants.map(buildKycRow).join("")}
    </tbody>
  </table>`;
}

// in-flight token — incremented on every load so a stale response is dropped.
let adminKycLoadToken = 0;
// Mark whether the change-listener has been attached to avoid the
// addEventListener leak when the panel is rebuilt by tab switches.
let adminKycListenerBound = false;
function bindAdminKycEventDelegation() {
  if (adminKycListenerBound) return;
  const wrap = document.getElementById("admin-kyc-table-wrap");
  if (!wrap) return;
  wrap.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.field !== "override") return;
    const row = target.closest("tr[data-applicant-id]");
    if (!row) return;
    handleOverrideToggle(row, target);
  });
  adminKycListenerBound = true;
}

async function handleOverrideToggle(row, checkboxEl) {
  const applicantId = row.dataset.applicantId;
  const override = checkboxEl.checked;
  const reasonEl = row.querySelector('[data-field="reason"]');
  const statusEl = row.querySelector('[data-field="new_status"]');
  const reason = reasonEl ? reasonEl.value.trim() : "";
  const newStatus = statusEl ? statusEl.value : "approved";

  if (override && reason.length < 5) {
    checkboxEl.checked = false;
    renderKycError(
      "Reason of at least 5 characters is required to enable override.",
    );
    return;
  }

  setKycStatus(
    override
      ? `Applying override for ${applicantId}…`
      : `Clearing override for ${applicantId}…`,
  );

  try {
    const token = getCurrentJwt();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const body = override
      ? { override: true, new_status: newStatus, reason }
      : { override: false };

    const res = await fetch(ADMIN_KYC_ENDPOINTS.override(applicantId), {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      checkboxEl.checked = !override; // revert UI on error
      renderKycError(
        `Override failed: HTTP ${res.status} — ${text.slice(0, 200)}`,
      );
      setKycStatus("Override failed");
      return;
    }

    const payload = await res.json();
    setKycStatus(
      override
        ? `Override applied (status: ${payload.data?.verification_status || newStatus})`
        : "Override cleared",
      "success",
    );

    // Reflect the new state immediately in the UI without a full reload.
    const label = row.querySelector(".toggle-label");
    if (label) label.textContent = override ? "On" : "Off";
    // Update status pill
    const pill = row.querySelector(".admin-kyc-status-pill");
    if (pill && payload.data?.verification_status) {
      const newStatus = payload.data.verification_status;
      pill.textContent = newStatus;
      pill.className = `admin-kyc-status-pill ${newStatus}`;
    }
  } catch (err) {
    checkboxEl.checked = !override; // revert UI on error
    renderKycError(
      `Override failed: ${escapeHtml(err.message || "Unknown error")}`,
    );
    setKycStatus("Override failed");
  }
}

async function loadAdminKycApplicants() {
  const wrap = document.getElementById("admin-kyc-table-wrap");
  if (!wrap) return;

  const payload = decodeJwt(getCurrentJwt());
  setRoleGate(payload);

  if (!isAdminUser(payload)) {
    renderKycEmpty(
      "Admin role (admin / super-admin) is required to view this panel. Sign in with an admin JWT to enable overrides.",
    );
    setKycStatus("Read-only");
    return;
  }

  // Increment the in-flight token so any earlier in-progress load will
  // be detected as stale and its response will be discarded.
  const token = ++adminKycLoadToken;

  setKycStatus("Loading…");
  renderKycTable([]);
  bindAdminKycEventDelegation();
  try {
    const json = await fetchAdminKycApplicants();
    if (token !== adminKycLoadToken) {
      // A newer load has started, drop this response.
      return;
    }
    const list = (json.data || json.applicants || []).filter(Boolean);
    renderKycTable(list);
    setKycStatus(`Loaded ${list.length} applicants`);
  } catch (err) {
    if (token !== adminKycLoadToken) return;
    renderKycError(`Failed to load applicants: ${escapeHtml(err.message)}`);
    setKycStatus("Error");
  }
}

const refreshBtn = document.getElementById("admin-kyc-refresh");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => loadAdminKycApplicants());
}
