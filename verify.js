/* =========================================================================
   MMLI RECEIPT GENERATOR — VERIFICATION PAGE LOGIC
   -------------------------------------------------------------------------
   IMPORTANT — READ THIS BEFORE CONNECTING A REAL BACKEND:
   This page currently checks the receipt ID against records saved in THIS
   BROWSER's localStorage only ("LOCAL VERIFICATION"). It does NOT check
   any central, online database. A receipt created on one phone will not
   verify on someone else's phone or computer yet.

   FUTURE ONLINE VERIFICATION:
   To make verification work for anyone, anywhere, replace the body of
   lookupReceipt() below with a fetch() call to a real API/database (for
   example Firebase, Supabase, or a custom backend) that looks up the
   receipt by ID and returns the same shape of object this function
   returns now. Nothing else on this page needs to change.
   ========================================================================= */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    settings: "mmli_settings_v1",
    receipts: "mmli_receipts_v1"
  };

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error("Storage read failed for", key, e);
      return fallback;
    }
  }

  function getSettings() {
    const defaults = { orgName: "Mind Masters Liberia Initiative", orgShort: "MMLI", logo: null };
    return Object.assign({}, defaults, safeGet(STORAGE_KEYS.settings, {}));
  }

  function getReceipts() {
    const stored = safeGet(STORAGE_KEYS.receipts, []);
    return Array.isArray(stored) ? stored : [];
  }

  /**
   * LOCAL lookup today. Swap this out for a real API call when a backend
   * is connected — see the note at the top of this file.
   */
  function lookupReceipt(receiptId) {
    const receipts = getReceipts();
    return receipts.find(r => (r.receiptNo || "").toLowerCase() === (receiptId || "").toLowerCase()) || null;
  }

  function formatCurrency(amount, currencyCode) {
    const n = Number(amount);
    const safeN = isNaN(n) ? 0 : n;
    return (currencyCode || "") + " " + safeN.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDateLong(isoDateStr) {
    if (!isoDateStr) return "—";
    const parts = isoDateStr.split("-");
    if (parts.length !== 3) return isoDateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return isoDateStr;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getReceiptIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  function renderNotFound(receiptId) {
    const card = document.getElementById("verify-card");
    card.innerHTML = `
      <div class="verify-icon">&#9888;</div>
      <div class="verify-banner invalid">RECEIPT NOT FOUND</div>
      <div class="verify-title">We could not verify this receipt</div>
      <div class="verify-sub">
        ${receiptId ? "No record for <strong>" + escapeHtml(receiptId) + "</strong> was found in this browser's local records." : "No receipt ID was provided in the link."}
      </div>
      <div class="verify-scope-note">
        <strong>Why this can happen</strong>
        This system currently checks only the browser that created the receipt (local verification).
        If this receipt was created on a different phone or computer, it will not be found here
        until MMLI connects a central online database. Please contact MMLI directly to confirm
        this receipt if needed.
      </div>
      <a class="back-link" href="index.html">&larr; Back to Receipt Generator</a>
    `;
  }

  function renderValid(receipt) {
    const card = document.getElementById("verify-card");
    card.innerHTML = `
      <div class="verify-icon valid">&#9989;</div>
      <div class="verify-banner valid">VALID RECEIPT</div>
      <div class="verify-title">Receipt verified locally</div>
      <div class="verify-sub">This receipt matches a record stored in this browser.</div>
      <div class="verify-details">
        <div class="verify-row"><span class="k">Receipt Number</span><span class="v">${escapeHtml(receipt.receiptNo)}</span></div>
        <div class="verify-row"><span class="k">Payer</span><span class="v">${escapeHtml(receipt.payerName || "—")}</span></div>
        <div class="verify-row"><span class="k">Organization</span><span class="v">${escapeHtml(receipt.payerOrg || "—")}</span></div>
        <div class="verify-row"><span class="k">Amount</span><span class="v">${escapeHtml(formatCurrency(receipt.amountPaid, receipt.currency))}</span></div>
        <div class="verify-row"><span class="k">Date</span><span class="v">${escapeHtml(formatDateLong(receipt.date))}</span></div>
        <div class="verify-row"><span class="k">Payment Status</span><span class="v">${escapeHtml(receipt.status || "—")}</span></div>
      </div>
      <div class="verify-scope-note">
        <strong>About this verification</strong>
        This is a <em>local</em> verification: it confirms the receipt exists in the browser that
        issued it. Future versions of this system can connect to a shared online database so any
        device can verify any MMLI receipt.
      </div>
      <a class="back-link" href="index.html">&larr; Back to Receipt Generator</a>
    `;
  }

  function init() {
    try {
      const settings = getSettings();
      document.getElementById("brand-name").textContent = settings.orgName || "Mind Masters Liberia Initiative";
      const logoImg = document.getElementById("header-logo-img");
      logoImg.src = settings.logo || MMLI_DEFAULT_LOGO_BASE64;

      const receiptId = getReceiptIdFromUrl();
      const receipt = receiptId ? lookupReceipt(receiptId) : null;
      if (receipt) renderValid(receipt);
      else renderNotFound(receiptId);
    } catch (e) {
      console.error("Verification page error", e);
      const card = document.getElementById("verify-card");
      card.innerHTML = "<p>Something went wrong while checking this receipt. Please try again.</p>";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
