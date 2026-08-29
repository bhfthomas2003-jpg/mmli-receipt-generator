/* =========================================================================
   MMLI RECEIPT GENERATOR — APPLICATION LOGIC
   Pure client-side. No server, no build step. Just HTML + CSS + JS.
   ========================================================================= */

(function () {
  "use strict";

  /* =======================================================================
     0. CONFIGURATION
     -----------------------------------------------------------------------
     Change VERIFICATION_BASE_URL once you know the final GitHub Pages URL
     for verify.html. Everything else here is only a fallback — real values
     come from Settings (localStorage) once the user saves them there.
     ======================================================================= */
  const VERIFICATION_BASE_URL = "https://mindmastersliberiainitiative.github.io/mmli-receipts/verify.html";

  const DEFAULT_SETTINGS = {
    orgName: "Mind Masters Liberia Initiative",
    orgShort: "MMLI",
    motto: "Unleashing the Genius Within",
    authorizedPerson: "Executive Director",
    phone: "0775990043 / 0889581634",
    email: "mindmastersliberiainitiative@gmail.com",
    website: "",
    address: "Monrovia, Liberia",
    footer: "Thank you for supporting Mind Masters Liberia Initiative.",
    verifyBaseUrl: VERIFICATION_BASE_URL,
    logo: null,      // data URL override; null = use built-in default
    signature: null, // data URL override; null = use built-in default
    stamp: null      // data URL override; null = use built-in default
  };

  const STORAGE_KEYS = {
    settings: "mmli_settings_v1",
    receipts: "mmli_receipts_v1",
    theme: "mmli_theme_v1",
    counterPrefix: "mmli_counter_" // + year
  };

  /* =======================================================================
     1. STORAGE HELPERS (all wrapped — never let a storage error break the UI)
     ======================================================================= */
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
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage write failed for", key, e);
      showToast("Could not save to this browser's storage. Your device storage may be full.", "error");
      return false;
    }
  }

  function loadSettings() {
    const stored = safeGet(STORAGE_KEYS.settings, null);
    return Object.assign({}, DEFAULT_SETTINGS, stored || {});
  }
  function saveSettings(settings) {
    return safeSet(STORAGE_KEYS.settings, settings);
  }
  function loadReceipts() {
    const stored = safeGet(STORAGE_KEYS.receipts, []);
    return Array.isArray(stored) ? stored : [];
  }
  function saveReceipts(receipts) {
    return safeSet(STORAGE_KEYS.receipts, receipts);
  }

  let STATE = {
    settings: loadSettings(),
    receipts: loadReceipts(),
    editingId: null,     // receipt number currently being edited (null = new)
    historyFilter: "ALL",
    historySearch: ""
  };

  /* =======================================================================
     2. RECEIPT NUMBER GENERATION
     -----------------------------------------------------------------------
     The counter in localStorage always tracks the HIGHEST receipt number
     ever actually used (auto-generated or manually typed), updated at save
     time. "Peeking" the next number (page load, Clear Form, Duplicate) does
     NOT advance the counter, so simply reloading the page never burns a
     number or creates gaps in the sequence. Clicking "Generate New Receipt
     Number" re-confirms the same next-available number until it is saved.
     ======================================================================= */
  function currentYear() {
    return new Date().getFullYear();
  }
  function counterKey(year) {
    return STORAGE_KEYS.counterPrefix + year;
  }
  function orgShortCode() {
    return (STATE.settings.orgShort || "MMLI").toUpperCase().replace(/[^A-Z0-9]/g, "") || "MMLI";
  }
  function formatReceiptNumber(short, year, n) {
    return short + "-" + year + "-" + String(n).padStart(4, "0");
  }
  function peekNextReceiptNumber() {
    const year = currentYear();
    let n = safeGet(counterKey(year), 0);
    if (typeof n !== "number" || isNaN(n)) n = 0;
    return formatReceiptNumber(orgShortCode(), year, n + 1);
  }
  // Kept for the "New No." button: same value as peek unless/until a higher
  // number gets committed by an actual save (see commitReceiptNumberIfHigher).
  function generateReceiptNumber() {
    return peekNextReceiptNumber();
  }
  // Parses "MMLI-2026-0007" style numbers and, if the numeric part is the
  // highest seen for that year, persists it so future peeks continue after it.
  function commitReceiptNumberIfHigher(receiptNo) {
    if (!receiptNo) return;
    const match = /^([A-Z0-9]+)-([0-9]{4})-([0-9]+)$/i.exec(receiptNo.trim());
    if (!match) return; // manually-typed non-standard numbers don't affect the counter
    const year = match[2];
    const n = parseInt(match[3], 10);
    if (isNaN(n)) return;
    const key = counterKey(year);
    const current = safeGet(key, 0);
    if (n > (typeof current === "number" ? current : 0)) {
      safeSet(key, n);
    }
  }

  /* =======================================================================
     3. NUMBER -> WORDS
     ======================================================================= */
  const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function threeDigitsToWords(num) {
    let str = "";
    if (num >= 100) {
      str += ONES[Math.floor(num / 100)] + " Hundred";
      num %= 100;
      if (num > 0) str += " ";
    }
    if (num >= 20) {
      str += TENS[Math.floor(num / 10)];
      if (num % 10 > 0) str += "-" + ONES[num % 10];
    } else if (num > 0) {
      str += ONES[num];
    }
    return str;
  }

  function integerToWords(num) {
    if (num === 0) return "Zero";
    const groups = [
      { value: 1000000000, label: "Billion" },
      { value: 1000000, label: "Million" },
      { value: 1000, label: "Thousand" },
      { value: 1, label: "" }
    ];
    let remaining = Math.floor(num);
    const parts = [];
    for (const g of groups) {
      const count = Math.floor(remaining / g.value);
      if (count > 0) {
        parts.push(threeDigitsToWords(count) + (g.label ? " " + g.label : ""));
        remaining %= g.value;
      }
    }
    return parts.join(" ").trim();
  }

  const CURRENCY_NAMES = {
    LRD: "Liberian Dollars",
    USD: "United States Dollars"
  };

  function amountToWords(amount, currencyCode) {
    amount = Math.abs(Number(amount) || 0);
    // Cap to keep the algorithm meaningful (spec: support up to 999,999,999)
    const whole = Math.min(Math.floor(amount), 999999999);
    const cents = Math.round((amount - Math.floor(amount)) * 100);
    const currencyLabel = CURRENCY_NAMES[currencyCode] || currencyCode;
    let words = integerToWords(whole) + " " + currencyLabel;
    if (cents > 0) {
      words += " and " + integerToWords(cents) + " Cents";
    }
    words += " Only";
    return words;
  }

  /* =======================================================================
     4. FORMATTING HELPERS
     ======================================================================= */
  function formatCurrency(amount, currencyCode) {
    const n = Number(amount);
    const safeN = isNaN(n) ? 0 : n;
    const formatted = safeN.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (currencyCode || "") + " " + formatted;
  }

  function formatDateLong(isoDateStr) {
    if (!isoDateStr) return "";
    // Parse as local date to avoid timezone shifting the day back
    const parts = isoDateStr.split("-");
    if (parts.length !== 3) return isoDateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return isoDateStr;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* =======================================================================
     4b. SELF-CONTAINED VERIFICATION (no backend required)
     -----------------------------------------------------------------------
     Each receipt's QR code encodes ONE plain URL (so phone cameras still
     treat it as a tappable link) — but that URL's query string carries a
     compact, base64url-encoded copy of the receipt's key details plus a
     short integrity checksum. That means verify.html can confirm a receipt
     on ANY device, the moment the link is opened — it never needs to find
     the receipt in that device's local storage.

     Note on the checksum: this runs entirely in the browser with no server
     or secret key, so it protects against accidental corruption / mangled
     links, not against a determined forger who edits the URL by hand. It
     is an integrity check, not a cryptographic signature.
     ======================================================================= */
  function utf8ToB64Url(str) {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fnv1aHex(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function buildVerifyPayload(data, fin) {
    const p = {
      r: data.receiptNo || "",
      n: data.payerName || "",
      o: data.payerOrg || "",
      c: data.currency || "LRD",
      a: fin.amountPaid,
      d: data.date || "",
      s: fin.statusText || "",
      g: data.category || "",
      m: data.paymentMethod || ""
    };
    // Drop empty fields to keep the QR payload (and thus the QR image) small.
    Object.keys(p).forEach(k => { if (p[k] === "" || p[k] === undefined || p[k] === null) delete p[k]; });
    return p;
  }

  function buildVerifyUrl(data) {
    const fin = calcFinancials(data.previousBalance, data.amountDue, data.amountPaid);
    const base = STATE.settings.verifyBaseUrl || VERIFICATION_BASE_URL;
    const receiptNo = data.receiptNo || "";
    let url = base + "?id=" + encodeURIComponent(receiptNo);
    try {
      const payload = buildVerifyPayload(data, fin);
      const json = JSON.stringify(payload);
      const encoded = utf8ToB64Url(json);
      const checksum = fnv1aHex(json);
      url += "&p=" + encoded + "&c=" + checksum;
    } catch (e) {
      // If encoding fails for any reason, we still hand back a working
      // (local-lookup-only) verification link rather than no link at all.
      console.error("Could not embed verification payload", e);
    }
    return url;
  }

  /* =======================================================================
     5. FINANCIAL CALCULATIONS
     ======================================================================= */
  function calcFinancials(previousBalance, amountDue, amountPaid) {
    const pb = Number(previousBalance) || 0;
    const ad = Number(amountDue) || 0;
    const ap = Number(amountPaid) || 0;
    let remaining = pb + ad - ap;
    if (!isFinite(remaining) || isNaN(remaining)) remaining = 0;
    // round to 2dp to avoid floating point noise (e.g. 0.999999999)
    remaining = Math.round(remaining * 100) / 100;
    let statusText, statusClass;
    if (remaining === 0) {
      statusText = "PAID IN FULL";
      statusClass = "paid";
    } else if (remaining > 0) {
      statusText = "BALANCE DUE";
      statusClass = "balance";
    } else {
      statusText = "OVERPAYMENT";
      statusClass = "over";
    }
    return { previousBalance: pb, amountDue: ad, amountPaid: ap, remaining, statusText, statusClass };
  }

  /* =======================================================================
     6. TOASTS + MODALS
     ======================================================================= */
  function showToast(message, kind) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.setAttribute("role", "status");
    el.textContent = message;
    region.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity 300ms ease, transform 300ms ease";
      el.style.opacity = "0";
      el.style.transform = "translateY(-6px)";
      setTimeout(() => el.remove(), 320);
    }, 3600);
  }

  function showConfirmModal(title, message, confirmLabel, onConfirm) {
    const region = document.getElementById("modal-region");
    region.innerHTML = "";
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<h3 id="modal-title">' + escapeHtml(title) + "</h3>" +
      "<p>" + escapeHtml(message) + "</p>" +
      '<div class="modal-actions">' +
      '<button class="btn btn-outline" id="modal-cancel-btn" type="button">Cancel</button>' +
      '<button class="btn btn-danger" id="modal-confirm-btn" type="button">' + escapeHtml(confirmLabel) + "</button>" +
      "</div></div>";
    region.appendChild(backdrop);
    function close() { region.innerHTML = ""; }
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.getElementById("modal-cancel-btn").addEventListener("click", close);
    document.getElementById("modal-confirm-btn").addEventListener("click", () => { close(); onConfirm(); });
  }

  function showViewModal(title, innerHtml) {
    const region = document.getElementById("modal-region");
    region.innerHTML = "";
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML =
      '<div class="modal-card" style="max-width:660px;" role="dialog" aria-modal="true" aria-labelledby="modal-title2">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<h3 id="modal-title2" style="margin:0;">' + escapeHtml(title) + "</h3>" +
      '<button class="icon-btn" id="modal-close-btn" type="button" aria-label="Close">&times;</button>' +
      "</div>" +
      '<div class="view-modal-body">' + innerHtml + "</div>" +
      "</div>";
    region.appendChild(backdrop);
    function close() { region.innerHTML = ""; }
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.getElementById("modal-close-btn").addEventListener("click", close);
  }

  /* =======================================================================
     7. FORM <-> DATA
     ======================================================================= */
  const form = document.getElementById("receipt-form");

  function getFormData() {
    return {
      receiptNo: document.getElementById("f-receipt-no").value.trim(),
      date: document.getElementById("f-date").value,
      status: document.getElementById("f-status").value,
      payerName: document.getElementById("f-name").value.trim(),
      payerOrg: document.getElementById("f-org").value.trim(),
      payerPhone: document.getElementById("f-phone").value.trim(),
      payerEmail: document.getElementById("f-email").value.trim(),
      payerAddress: document.getElementById("f-address").value.trim(),
      category: document.getElementById("f-category").value,
      description: document.getElementById("f-description").value.trim(),
      amountPaid: document.getElementById("f-amount-paid").value,
      currency: document.getElementById("f-currency").value,
      amountDue: document.getElementById("f-amount-due").value,
      previousBalance: document.getElementById("f-prev-balance").value,
      paymentMethod: document.getElementById("f-method").value,
      refNumber: document.getElementById("f-ref").value.trim(),
      notes: document.getElementById("f-notes").value.trim()
    };
  }

  function setFormData(data) {
    document.getElementById("f-receipt-no").value = data.receiptNo || "";
    document.getElementById("f-date").value = data.date || todayIso();
    document.getElementById("f-status").value = data.status || "PAID";
    document.getElementById("f-name").value = data.payerName || "";
    document.getElementById("f-org").value = data.payerOrg || "";
    document.getElementById("f-phone").value = data.payerPhone || "";
    document.getElementById("f-email").value = data.payerEmail || "";
    document.getElementById("f-address").value = data.payerAddress || "";
    document.getElementById("f-category").value = data.category || "Competition Registration";
    document.getElementById("f-description").value = data.description || "";
    document.getElementById("f-amount-paid").value = data.amountPaid !== undefined ? data.amountPaid : "";
    document.getElementById("f-currency").value = data.currency || "LRD";
    document.getElementById("f-amount-due").value = data.amountDue !== undefined ? data.amountDue : "";
    document.getElementById("f-prev-balance").value = data.previousBalance !== undefined ? data.previousBalance : "";
    document.getElementById("f-method").value = data.paymentMethod || "Cash";
    document.getElementById("f-ref").value = data.refNumber || "";
    document.getElementById("f-notes").value = data.notes || "";
  }

  function clearAllFieldErrors() {
    document.querySelectorAll(".field-error").forEach(el => el.classList.remove("show"));
    document.querySelectorAll("input.invalid, select.invalid").forEach(el => el.classList.remove("invalid"));
  }

  function markInvalid(inputId, errorId) {
    const input = document.getElementById(inputId);
    const err = document.getElementById(errorId);
    if (input) input.classList.add("invalid");
    if (err) err.classList.add("show");
  }

  function validateForm(data) {
    clearAllFieldErrors();
    let valid = true;
    let firstInvalidId = null;

    if (!data.payerName) {
      markInvalid("f-name", "err-name"); valid = false; firstInvalidId = firstInvalidId || "f-name";
    }
    if (!data.date) {
      markInvalid("f-date", "err-date"); valid = false; firstInvalidId = firstInvalidId || "f-date";
    }
    if (!data.status) {
      markInvalid("f-status", "err-status"); valid = false; firstInvalidId = firstInvalidId || "f-status";
    }
    if (!data.currency) {
      markInvalid("f-currency", "err-currency"); valid = false; firstInvalidId = firstInvalidId || "f-currency";
    }
    const amt = Number(data.amountPaid);
    if (data.amountPaid === "" || isNaN(amt) || amt < 0) {
      markInvalid("f-amount-paid", "err-amount-paid"); valid = false; firstInvalidId = firstInvalidId || "f-amount-paid";
    }
    if (!data.receiptNo) {
      markInvalid("f-receipt-no", "err-receipt-no"); valid = false; firstInvalidId = firstInvalidId || "f-receipt-no";
    }

    if (!valid && firstInvalidId) {
      const el = document.getElementById(firstInvalidId);
      if (el) el.focus({ preventScroll: false });
    }
    return valid;
  }

  /* =======================================================================
     8. RECEIPT RENDERING (the actual document — used for preview, PDF, PNG,
        print, and the view-history modal)
     ======================================================================= */
  function getLogoSrc() {
    return STATE.settings.logo || MMLI_DEFAULT_LOGO_BASE64;
  }
  function getSignatureSrc() {
    return STATE.settings.signature || MMLI_DEFAULT_SIGNATURE_BASE64;
  }
  function getStampSrc() {
    return STATE.settings.stamp || MMLI_DEFAULT_STAMP_BASE64;
  }

  function buildReceiptHtml(data) {
    const fin = calcFinancials(data.previousBalance, data.amountDue, data.amountPaid);
    const words = amountToWords(data.amountPaid, data.currency || "LRD");
    const status = (data.status || "PAID").toUpperCase();
    const settings = STATE.settings;

    let bannerLabel = fin.statusText;
    if (fin.statusClass !== "paid") {
      bannerLabel = fin.statusText + ": " + formatCurrency(Math.abs(fin.remaining), data.currency);
    }

    const logoBlock = getLogoSrc()
      ? '<div class="r-logo"><img src="' + getLogoSrc() + '" alt=""></div>'
      : '<div class="r-logo-placeholder">' + escapeHtml((settings.orgShort || "MMLI").slice(0, 4)) + "</div>";

    const html = `
      <div class="r-inner" id="r-inner-content">
        <div class="r-brandbar">
          ${logoBlock}
          <div class="r-org-name">${escapeHtml(settings.orgName)}</div>
          <div class="r-motto">&ldquo;${escapeHtml(settings.motto)}&rdquo;</div>
          <div class="r-doctitle">Payment Receipt</div>
          <div class="r-meta-row">
            <span>Receipt No: <span class="mono">${escapeHtml(data.receiptNo || "—")}</span></span>
            <span>Date: <span class="mono">${escapeHtml(formatDateLong(data.date))}</span></span>
            <span>Status: <span class="r-badge ${escapeHtml(status)}">${escapeHtml(status)}</span></span>
          </div>
        </div>

        <div class="r-section" style="border-top:none;padding-top:0;">
          <div class="r-section-title">Received From</div>
          <div class="r-grid">
            <div class="r-row"><span class="k">Name:</span><span class="v">${escapeHtml(data.payerName || "—")}</span></div>
            <div class="r-row"><span class="k">Organization:</span><span class="v">${escapeHtml(data.payerOrg || "—")}</span></div>
            <div class="r-row"><span class="k">Phone:</span><span class="v">${escapeHtml(data.payerPhone || "—")}</span></div>
            <div class="r-row"><span class="k">Email:</span><span class="v">${escapeHtml(data.payerEmail || "—")}</span></div>
            ${data.payerAddress ? '<div class="r-row full"><span class="k">Address:</span><span class="v">' + escapeHtml(data.payerAddress) + "</span></div>" : ""}
          </div>
        </div>

        <div class="r-section">
          <div class="r-section-title">Payment Details</div>
          <div class="r-grid">
            <div class="r-row"><span class="k">Category:</span><span class="v">${escapeHtml(data.category || "—")}</span></div>
            <div class="r-row"><span class="k">Method:</span><span class="v">${escapeHtml(data.paymentMethod || "—")}</span></div>
            <div class="r-row full"><span class="k">Reference:</span><span class="v">${escapeHtml(data.refNumber || "—")}</span></div>
          </div>
          ${data.description ? '<div class="r-desc-box">' + escapeHtml(data.description) + "</div>" : ""}
        </div>

        <div class="r-section">
          <div class="r-section-title">Financial Summary</div>
          <div class="r-financial">
            <div class="r-financial-row"><span>Previous Balance</span><span>${formatCurrency(fin.previousBalance, data.currency)}</span></div>
            <div class="r-financial-row"><span>Amount Due</span><span>${formatCurrency(fin.amountDue, data.currency)}</span></div>
            <div class="r-financial-row"><span>Amount Paid</span><span>${formatCurrency(fin.amountPaid, data.currency)}</span></div>
            <div class="r-financial-row total"><span>${fin.remaining < 0 ? "Overpayment" : "Balance"}</span><span>${formatCurrency(Math.abs(fin.remaining), data.currency)}</span></div>
          </div>
          <div class="r-words">Amount in Words: ${escapeHtml(words)}</div>
        </div>

        <div class="r-status-banner ${fin.statusClass}">${escapeHtml(bannerLabel)}</div>

        ${data.notes ? '<div class="r-section r-notes"><div class="r-section-title">Notes</div>' + escapeHtml(data.notes) + "</div>" : ""}

        <div class="r-qr-row">
          <div id="r-qr-canvas-holder"></div>
          <div class="r-qr-caption">
            <strong>Scan to verify receipt</strong>
            This code carries the receipt's details with it, so it can be verified on any device, instantly.
          </div>
        </div>

        <div class="r-sign-row">
          <div class="r-sign-block">
            <div class="r-sign-img r-sign-img--plain"><img src="${getSignatureSrc()}" alt="Authorized signature"></div>
            <div class="r-sign-line r-sign-line--plain">${escapeHtml(settings.authorizedPerson || "Authorized Signatory")}</div>
            <div class="r-sign-label">Authorized By</div>
          </div>
          <div class="r-sign-block">
            <div class="r-sign-img"><img class="r-stamp-img" src="${getStampSrc()}" alt="MMLI official stamp"></div>
            <div class="r-sign-line">&nbsp;</div>
            <div class="r-sign-label">MMLI Official Stamp</div>
          </div>
        </div>

        <div class="r-contact-box">
          <div class="r-contact-org">${escapeHtml(settings.orgShort || "MMLI")} &middot; ${escapeHtml(settings.orgName)}</div>
          ${(settings.website || settings.email) ? '<div class="r-contact-links">' + [settings.website, settings.email].filter(Boolean).map(escapeHtml).join(" &middot; ") + "</div>" : ""}
          ${settings.phone ? '<div class="r-contact-phone">' + escapeHtml(settings.phone) + "</div>" : ""}
          ${settings.address ? '<div class="r-contact-address">' + escapeHtml(settings.address) + "</div>" : ""}
        </div>
        <div class="r-footer">${escapeHtml(settings.footer)}<br>&copy; ${new Date(data.date || Date.now()).getFullYear()} ${escapeHtml(settings.orgName)}</div>
      </div>
    `;
    return html;
  }

  function renderQrInto(container, data) {
    container.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "QR code to verify this receipt");
    container.appendChild(canvas);
    // The whole payload is still ONE valid URL (details ride along as query
    // parameters), so phone cameras recognise it as a tappable link — see
    // buildVerifyUrl() / the note above section 4b for how verification
    // data is embedded. qrcode-lib.js is bundled locally, so this works
    // identically online or fully offline; no CDN, no network request.
    const verifyUrl = buildVerifyUrl(data);
    try {
      MMLIQRCode.toCanvas(verifyUrl, canvas, {
        ecLevel: "M",
        cellSize: 4,
        margin: 2,
        dark: "#0b2545",
        light: "#ffffff"
      });
    } catch (e) {
      console.error("QR generation failed", e);
      container.innerHTML = "";
      const note = document.createElement("div");
      note.className = "r-qr-error";
      note.textContent = "Could not generate QR for this receipt.";
      container.appendChild(note);
    }
  }

  function renderReceiptPreview(data) {
    const doc = document.getElementById("receipt-document");
    doc.innerHTML = buildReceiptHtml(data);
    const qrHolder = document.getElementById("r-qr-canvas-holder");
    if (qrHolder) renderQrInto(qrHolder, data);
  }

  function refreshPreviewFromForm() {
    renderReceiptPreview(getFormData());
  }

  /* =======================================================================
     9. SAVE / EDIT / DUPLICATE / DELETE
     ======================================================================= */
  function findReceiptIndex(receiptNo) {
    return STATE.receipts.findIndex(r => r.receiptNo === receiptNo);
  }

  function saveCurrentReceipt() {
    try {
      const data = getFormData();
      if (!validateForm(data)) {
        showToast("Please fill in the required fields before saving.", "error");
        return;
      }
      const now = new Date().toISOString();
      const existingIdx = STATE.editingId ? findReceiptIndex(STATE.editingId) : findReceiptIndex(data.receiptNo);

      if (existingIdx > -1) {
        data.createdAt = STATE.receipts[existingIdx].createdAt || now;
        data.updatedAt = now;
        STATE.receipts[existingIdx] = data;
        showToast("Receipt " + data.receiptNo + " updated.", "success");
      } else {
        data.createdAt = now;
        data.updatedAt = now;
        STATE.receipts.push(data);
        showToast("Receipt " + data.receiptNo + " saved.", "success");
      }
      STATE.editingId = data.receiptNo;
      commitReceiptNumberIfHigher(data.receiptNo);
      saveReceipts(STATE.receipts);
      renderReceiptPreview(data);
      renderHistory();
      renderStats();
    } catch (e) {
      console.error(e);
      showToast("Something went wrong while saving. Please check your entries and try again.", "error");
    }
  }

  function loadReceiptIntoForm(receiptNo) {
    const r = STATE.receipts.find(r => r.receiptNo === receiptNo);
    if (!r) { showToast("That receipt could not be found.", "error"); return; }
    setFormData(r);
    STATE.editingId = r.receiptNo;
    switchView("create");
    refreshPreviewFromForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicateReceipt(receiptNo) {
    const source = receiptNo ? STATE.receipts.find(r => r.receiptNo === receiptNo) : getFormData();
    if (!source) { showToast("Nothing to duplicate.", "error"); return; }
    const copy = Object.assign({}, source);
    copy.receiptNo = generateReceiptNumber();
    copy.date = todayIso();
    setFormData(copy);
    STATE.editingId = null; // duplicating always creates a new record on save
    switchView("create");
    refreshPreviewFromForm();
    showToast("Duplicated as new receipt " + copy.receiptNo + ". Remember to save it.", "success");
  }

  function deleteReceipt(receiptNo) {
    showConfirmModal(
      "Delete Receipt",
      "Delete receipt " + receiptNo + "? This cannot be undone.",
      "Delete",
      () => {
        STATE.receipts = STATE.receipts.filter(r => r.receiptNo !== receiptNo);
        saveReceipts(STATE.receipts);
        renderHistory();
        renderStats();
        showToast("Receipt " + receiptNo + " deleted.", "success");
      }
    );
  }

  function viewReceipt(receiptNo) {
    const r = STATE.receipts.find(r => r.receiptNo === receiptNo);
    if (!r) { showToast("That receipt could not be found.", "error"); return; }
    const wrapper = document.createElement("div");
    wrapper.className = "receipt-scale-outer";
    wrapper.style.background = "none";
    wrapper.style.padding = "0";
    const inner = document.createElement("div");
    inner.id = "receipt-document";
    wrapper.appendChild(inner);
    showViewModal("Receipt " + receiptNo, wrapper.outerHTML);
    // The modal was inserted via innerHTML (string), so re-select the live node to render into it.
    const liveDoc = document.querySelector("#modal-region #receipt-document");
    if (liveDoc) {
      liveDoc.innerHTML = buildReceiptHtml(r);
      const qrHolder = liveDoc.querySelector("#r-qr-canvas-holder");
      if (qrHolder) renderQrInto(qrHolder, r);
    }
    const modalCard = document.querySelector("#modal-region .modal-card");
    if (modalCard) {
      const actions = document.createElement("div");
      actions.className = "modal-actions";
      actions.innerHTML =
        '<button class="btn btn-outline" id="modal-pdf-btn" type="button">&#8681; Download PDF</button>' +
        '<button class="btn btn-gold" id="modal-share-btn" type="button">&#128228; Share</button>';
      modalCard.appendChild(actions);
      document.getElementById("modal-pdf-btn").addEventListener("click", () => downloadPdfForReceipt(r));
      document.getElementById("modal-share-btn").addEventListener("click", () => shareReceiptImage(r));
    }
  }

  /* =======================================================================
     10. HISTORY TABLE
     ======================================================================= */
  function matchesSearch(r, term) {
    if (!term) return true;
    term = term.toLowerCase();
    return (
      (r.receiptNo || "").toLowerCase().includes(term) ||
      (r.payerName || "").toLowerCase().includes(term) ||
      (r.payerOrg || "").toLowerCase().includes(term) ||
      (r.payerPhone || "").toLowerCase().includes(term)
    );
  }

  function renderHistory() {
    const tbody = document.getElementById("history-tbody");
    const emptyState = document.getElementById("history-empty");
    let list = STATE.receipts.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    if (STATE.historyFilter !== "ALL") {
      list = list.filter(r => (r.status || "").toUpperCase() === STATE.historyFilter);
    }
    if (STATE.historySearch) {
      list = list.filter(r => matchesSearch(r, STATE.historySearch));
    }

    tbody.innerHTML = "";
    if (list.length === 0) {
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    for (const r of list) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="mono-cell">' + escapeHtml(r.receiptNo) + "</td>" +
        "<td>" + escapeHtml(formatDateLong(r.date)) + "</td>" +
        "<td>" + escapeHtml(r.payerName || "—") + "</td>" +
        '<td class="mono-cell">' + escapeHtml(formatCurrency(r.amountPaid, r.currency)) + "</td>" +
        '<td><span class="badge-status ' + escapeHtml(r.status) + '">' + escapeHtml(r.status) + "</span></td>" +
        '<td><div class="row-actions">' +
        '<button class="icon-btn" data-action="view" title="View" aria-label="View receipt ' + escapeHtml(r.receiptNo) + '">&#128065;</button>' +
        '<button class="icon-btn" data-action="edit" title="Edit" aria-label="Edit receipt ' + escapeHtml(r.receiptNo) + '">&#9998;</button>' +
        '<button class="icon-btn" data-action="duplicate" title="Duplicate" aria-label="Duplicate receipt ' + escapeHtml(r.receiptNo) + '">&#8942;</button>' +
        '<button class="icon-btn" data-action="pdf" title="Download PDF" aria-label="Download PDF for receipt ' + escapeHtml(r.receiptNo) + '">&#8681;</button>' +
        '<button class="icon-btn" data-action="share" title="Share" aria-label="Share receipt ' + escapeHtml(r.receiptNo) + '">&#128228;</button>' +
        '<button class="icon-btn" data-action="delete" title="Delete" aria-label="Delete receipt ' + escapeHtml(r.receiptNo) + '">&#128465;</button>' +
        "</div></td>";
      tr.querySelector('[data-action="view"]').addEventListener("click", () => viewReceipt(r.receiptNo));
      tr.querySelector('[data-action="edit"]').addEventListener("click", () => loadReceiptIntoForm(r.receiptNo));
      tr.querySelector('[data-action="duplicate"]').addEventListener("click", () => duplicateReceipt(r.receiptNo));
      tr.querySelector('[data-action="delete"]').addEventListener("click", () => deleteReceipt(r.receiptNo));
      tr.querySelector('[data-action="pdf"]').addEventListener("click", () => downloadPdfForReceipt(r));
      tr.querySelector('[data-action="share"]').addEventListener("click", () => shareReceiptImage(r));
      tbody.appendChild(tr);
    }
  }

  function renderStats() {
    const total = STATE.receipts.length;
    const paid = STATE.receipts.filter(r => (r.status || "").toUpperCase() === "PAID").length;
    const partial = STATE.receipts.filter(r => (r.status || "").toUpperCase() === "PARTIAL").length;
    const pending = STATE.receipts.filter(r => (r.status || "").toUpperCase() === "PENDING").length;
    animateCount("stat-total", total);
    animateCount("stat-paid", paid);
    animateCount("stat-partial", partial);
    animateCount("stat-pending", pending);
  }

  function animateCount(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const start = Number(el.textContent) || 0;
    if (start === target) { el.textContent = String(target); return; }
    const duration = 500;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + (target - start) * eased);
      el.textContent = String(value);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* =======================================================================
     11. EXPORT: PDF / PNG / PRINT
     ======================================================================= */
  // Master export width, in CSS px. This MUST match the #receipt-document
  // design width in style.css (480px) exactly, so a downloaded/shared PNG or
  // PDF is pixel-proportional to what the user sees in the live preview —
  // never a re-flowed 620px (or mobile-shrunk) version of the layout.
  const RECEIPT_EXPORT_WIDTH_PX = 480;

  async function renderReceiptOffscreenForExport(data) {
    // Build a detached, theme-independent clone at the exact on-screen
    // design width (not the responsive/shrunk width the live preview may
    // be displayed at on a narrow phone screen), so exports always match
    // the true receipt proportions.
    const clone = document.createElement("div");
    clone.id = "receipt-document";
    clone.style.width = RECEIPT_EXPORT_WIDTH_PX + "px";
    clone.style.maxWidth = "none";
    clone.innerHTML = buildReceiptHtml(data);
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.top = "0";
    host.style.background = "#ffffff";
    host.appendChild(clone);
    document.body.appendChild(host);
    const qrHolder = clone.querySelector("#r-qr-canvas-holder");
    if (qrHolder) renderQrInto(qrHolder, data);
    // give the QR canvas a tick to paint
    await new Promise(res => setTimeout(res, 120));
    return { host, clone };
  }

  async function captureReceiptCanvas(data) {
    if (typeof html2canvas === "undefined") {
      throw new Error("html2canvas library did not load (no internet connection?).");
    }
    const { host, clone } = await renderReceiptOffscreenForExport(data);
    try {
      const canvas = await html2canvas(clone, { scale: 2.5, backgroundColor: "#fdfcf9", useCORS: true });
      return canvas;
    } finally {
      host.remove();
    }
  }

  async function downloadPdfForReceipt(data) {
    try {
      if (!data.receiptNo) { showToast("This receipt has no receipt number.", "error"); return; }
      showToast("Preparing PDF for " + data.receiptNo + "…", "success");
      const canvas = await captureReceiptCanvas(data);
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error("jsPDF library did not load (no internet connection?).");

      // Custom page sized to the receipt's own aspect ratio (at CSS pixel
      // scale, converted to millimetres at 96 DPI) so it always fits on a
      // single page with no cropping, scaling distortion, or overlap.
      const widthMm = (canvas.width / 2.5) * (25.4 / 96); // 96 CSS px per inch
      const heightMm = (canvas.height / 2.5) * (25.4 / 96);

      const pdf = new jsPDF({
        orientation: widthMm > heightMm ? "landscape" : "portrait",
        unit: "mm",
        format: [widthMm, heightMm]
      });
      pdf.addImage(imgData, "PNG", 0, 0, widthMm, heightMm, undefined, "FAST");
      pdf.save((data.receiptNo || "receipt") + ".pdf");
      showToast("PDF downloaded.", "success");
    } catch (e) {
      console.error(e);
      showToast("Could not generate the PDF. " + (e && e.message ? e.message : "Please try again."), "error");
    }
  }

  async function downloadPngForReceipt(data) {
    try {
      if (!data.receiptNo) { showToast("This receipt has no receipt number.", "error"); return; }
      showToast("Preparing image for " + data.receiptNo + "…", "success");
      const canvas = await captureReceiptCanvas(data);
      const link = document.createElement("a");
      link.download = (data.receiptNo || "receipt") + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      showToast("PNG downloaded.", "success");
    } catch (e) {
      console.error(e);
      showToast("Could not generate the image. " + (e && e.message ? e.message : "Please try again."), "error");
    }
  }

  function printCurrentReceipt() {
    window.print();
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob); else reject(new Error("Could not create image data."));
      }, "image/png");
    });
  }

  /* =======================================================================
     11b. SHARE (native share sheet — email, WhatsApp, etc.)
     ======================================================================= */
  async function shareReceiptImage(data) {
    try {
      if (!data.receiptNo) { showToast("This receipt has no receipt number.", "error"); return; }
      showToast("Preparing receipt to share…", "success");

      // Same fixed-width offscreen capture as PDF/PNG export, so the shared
      // image is always the exact receipt proportions, never a resized or
      // cropped version.
      const canvas = await captureReceiptCanvas(data);
      const blob = await canvasToPngBlob(canvas);
      const filename = (data.receiptNo || "receipt") + ".png";
      const shareText = "Payment receipt " + data.receiptNo + " — Mind Masters Liberia Initiative.";

      let file = null;
      if (typeof File !== "undefined") {
        file = new File([blob], filename, { type: "image/png" });
      }

      // Preferred path: native share sheet with the image file attached
      // directly — this is what lets WhatsApp, Mail, Gmail, etc. show up
      // as share targets on phones and most modern desktop browsers.
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "MMLI Payment Receipt " + data.receiptNo,
          text: shareText
        });
        showToast("Receipt shared.", "success");
        return;
      }

      // Browser supports Web Share but not file attachments — share the
      // text/title, and separately download the image so it can be
      // attached manually.
      if (navigator.share) {
        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        await navigator.share({ title: "MMLI Payment Receipt " + data.receiptNo, text: shareText });
        showToast("Image downloaded — attach it in the share sheet.", "success");
        return;
      }

      // No Web Share API at all (older/desktop browsers): download the
      // image and open a pre-filled email as the most useful fallback.
      // Neither mailto: nor WhatsApp's click-to-chat link can attach a
      // file programmatically, so the file must be attached by hand.
      const link = document.createElement("a");
      link.download = filename;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      const mailto = "mailto:?subject=" + encodeURIComponent("MMLI Payment Receipt " + data.receiptNo) +
        "&body=" + encodeURIComponent(shareText + "\n\nThe receipt image has been downloaded to your device — please attach it to this email before sending.");
      window.location.href = mailto;
      showToast("Image downloaded — attach it to the email that just opened, or to a WhatsApp chat.", "success");
    } catch (e) {
      if (e && e.name === "AbortError") return; // user closed the native share sheet
      console.error(e);
      showToast("Could not share the receipt. " + (e && e.message ? e.message : "Please try again."), "error");
    }
  }

  // Creates the Share button next to the download buttons if the page's
  // HTML doesn't already define one with id="btn-share-receipt".
  function ensureShareButton() {
    let btn = document.getElementById("btn-share-receipt");
    if (btn) return btn;
    const anchor = document.getElementById("btn-download-png") || document.getElementById("btn-download-pdf") || document.getElementById("btn-print");
    if (!anchor || !anchor.parentNode) return null;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-share-receipt";
    btn.className = "btn btn-gold";
    btn.innerHTML = "&#128228; Share";
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    return btn;
  }

  /* =======================================================================
     12. VIEW SWITCHING (tabs)
     ======================================================================= */
  function switchView(viewName) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById("view-" + viewName);
    if (target) target.classList.add("active");

    document.querySelectorAll(".tab-btn").forEach(btn => {
      const isActive = btn.dataset.view === viewName;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    positionTabIndicator();

    if (viewName === "history") { renderHistory(); renderStats(); }
    if (viewName === "settings") { populateSettingsForm(); }
  }

  function positionTabIndicator() {
    const activeBtn = document.querySelector(".tab-btn.active");
    const indicator = document.getElementById("tab-indicator");
    if (!activeBtn || !indicator) return;
    indicator.style.width = activeBtn.offsetWidth + "px";
    indicator.style.transform = "translateX(" + activeBtn.offsetLeft + "px)";
  }

  /* =======================================================================
     13. SETTINGS VIEW
     ======================================================================= */
  function populateSettingsForm() {
    const s = STATE.settings;
    document.getElementById("s-org-name").value = s.orgName || "";
    document.getElementById("s-org-short").value = s.orgShort || "";
    document.getElementById("s-motto").value = s.motto || "";
    document.getElementById("s-authorized").value = s.authorizedPerson || "";
    document.getElementById("s-phone").value = s.phone || "";
    document.getElementById("s-email").value = s.email || "";
    document.getElementById("s-website").value = s.website || "";
    document.getElementById("s-address").value = s.address || "";
    document.getElementById("s-footer").value = s.footer || "";
    document.getElementById("s-verify-url").value = s.verifyBaseUrl || "";

    const logoPreview = document.getElementById("logo-preview");
    const logoHint = document.getElementById("logo-upload-hint");
    if (s.logo) { logoPreview.src = s.logo; logoPreview.style.display = "inline-block"; logoHint.style.display = "none"; }
    else { logoPreview.style.display = "none"; logoHint.style.display = "block"; }

    const sigPreview = document.getElementById("sig-preview");
    const sigHint = document.getElementById("sig-upload-hint");
    if (s.signature) { sigPreview.src = s.signature; sigPreview.style.display = "inline-block"; sigHint.style.display = "none"; }
    else { sigPreview.style.display = "none"; sigHint.style.display = "block"; }

    const stampPreview = document.getElementById("stamp-preview");
    const stampHint = document.getElementById("stamp-upload-hint");
    if (s.stamp) { stampPreview.src = s.stamp; stampPreview.style.display = "inline-block"; stampHint.style.display = "none"; }
    else { stampPreview.style.display = "none"; stampHint.style.display = "block"; }
  }

  function collectSettingsFromForm() {
    return {
      orgName: document.getElementById("s-org-name").value.trim() || DEFAULT_SETTINGS.orgName,
      orgShort: document.getElementById("s-org-short").value.trim() || DEFAULT_SETTINGS.orgShort,
      motto: document.getElementById("s-motto").value.trim() || DEFAULT_SETTINGS.motto,
      authorizedPerson: document.getElementById("s-authorized").value.trim(),
      phone: document.getElementById("s-phone").value.trim(),
      email: document.getElementById("s-email").value.trim(),
      website: document.getElementById("s-website").value.trim(),
      address: document.getElementById("s-address").value.trim(),
      footer: document.getElementById("s-footer").value.trim() || DEFAULT_SETTINGS.footer,
      verifyBaseUrl: document.getElementById("s-verify-url").value.trim() || DEFAULT_SETTINGS.verifyBaseUrl,
      logo: STATE.settings.logo,
      signature: STATE.settings.signature,
      stamp: STATE.settings.stamp
    };
  }

  function applyBrandingToHeader() {
    const s = STATE.settings;
    document.getElementById("brand-shortname").textContent = s.orgShort || "MMLI";
    document.getElementById("brand-name").textContent = s.orgName || "";
    document.getElementById("brand-motto").textContent = '"' + (s.motto || "") + '"';
    const headerLogo = document.getElementById("header-logo-img");
    headerLogo.src = getLogoSrc();
    document.title = (s.orgShort || "MMLI") + " Receipt Generator";
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* =======================================================================
     14. DARK MODE
     ======================================================================= */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("theme-toggle").setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    document.getElementById("theme-toggle-label").textContent = theme === "dark" ? "Light mode" : "Dark mode";
    document.getElementById("theme-toggle-icon").textContent = theme === "dark" ? "\u2600" : "\u263D";
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    safeSet(STORAGE_KEYS.theme, next);
  }

  /* =======================================================================
     15. WIRE UP EVENTS
     ======================================================================= */
  function attachLiveRecalcListeners() {
    const ids = ["f-receipt-no", "f-date", "f-status", "f-name", "f-org", "f-phone", "f-email", "f-address",
      "f-category", "f-description", "f-amount-paid", "f-currency", "f-amount-due", "f-prev-balance",
      "f-method", "f-ref", "f-notes"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", refreshPreviewFromForm);
      el.addEventListener("change", refreshPreviewFromForm);
    });
  }

  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
    window.addEventListener("resize", positionTabIndicator);
  }

  function initFormActions() {
    document.getElementById("btn-new-receipt-no").addEventListener("click", () => {
      document.getElementById("f-receipt-no").value = generateReceiptNumber();
      STATE.editingId = null;
      refreshPreviewFromForm();
    });
    document.getElementById("btn-today").addEventListener("click", () => {
      document.getElementById("f-date").value = todayIso();
      refreshPreviewFromForm();
    });
    document.getElementById("btn-save-receipt").addEventListener("click", saveCurrentReceipt);
    document.getElementById("btn-duplicate-receipt").addEventListener("click", () => duplicateReceipt(null));
    document.getElementById("btn-clear-form").addEventListener("click", () => {
      showConfirmModal("Clear Form", "Clear all fields in the current form? The receipt number sequence will not be affected.", "Clear", () => {
        form.reset();
        setFormData({ receiptNo: generateReceiptNumber(), date: todayIso(), status: "PAID", currency: "LRD", category: "Competition Registration", paymentMethod: "Cash" });
        STATE.editingId = null;
        refreshPreviewFromForm();
        showToast("Form cleared.", "success");
      });
    });
    document.getElementById("btn-download-pdf").addEventListener("click", () => downloadPdfForReceipt(getFormData()));
    document.getElementById("btn-download-png").addEventListener("click", () => downloadPngForReceipt(getFormData()));
    document.getElementById("btn-print").addEventListener("click", printCurrentReceipt);
    const shareBtn = ensureShareButton();
    if (shareBtn) shareBtn.addEventListener("click", () => shareReceiptImage(getFormData()));
  }

  function initHistoryActions() {
    document.getElementById("history-search").addEventListener("input", (e) => {
      STATE.historySearch = e.target.value;
      renderHistory();
    });
    document.querySelectorAll(".filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        STATE.historyFilter = chip.dataset.filter;
        renderHistory();
      });
    });
    document.getElementById("btn-clear-history").addEventListener("click", () => {
      showConfirmModal("Clear Receipt History", "This will permanently delete all " + STATE.receipts.length + " saved receipt(s) from this browser. This cannot be undone.", "Clear All", () => {
        STATE.receipts = [];
        saveReceipts(STATE.receipts);
        renderHistory();
        renderStats();
        showToast("Receipt history cleared.", "success");
      });
    });
  }

  function initSettingsActions() {
    document.getElementById("btn-save-settings").addEventListener("click", () => {
      STATE.settings = Object.assign({}, STATE.settings, collectSettingsFromForm());
      saveSettings(STATE.settings);
      applyBrandingToHeader();
      refreshPreviewFromForm();
      showToast("Settings saved.", "success");
    });
    document.getElementById("btn-reset-settings").addEventListener("click", () => {
      showConfirmModal("Reset Settings", "Reset all organization settings to their defaults? Your saved receipts will not be affected.", "Reset", () => {
        STATE.settings = Object.assign({}, DEFAULT_SETTINGS);
        saveSettings(STATE.settings);
        populateSettingsForm();
        applyBrandingToHeader();
        refreshPreviewFromForm();
        showToast("Settings reset to defaults.", "success");
      });
    });

    const logoArea = document.getElementById("logo-upload-area");
    const logoInput = document.getElementById("logo-file-input");
    logoArea.addEventListener("click", () => logoInput.click());
    logoArea.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); logoInput.click(); } });
    logoInput.addEventListener("change", async () => {
      const file = logoInput.files[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        STATE.settings.logo = dataUrl;
        saveSettings(STATE.settings);
        populateSettingsForm();
        applyBrandingToHeader();
        refreshPreviewFromForm();
        showToast("Logo updated.", "success");
      } catch (e) {
        showToast("Could not read that image file.", "error");
      }
    });
    document.getElementById("btn-reset-logo").addEventListener("click", () => {
      STATE.settings.logo = null;
      saveSettings(STATE.settings);
      populateSettingsForm();
      applyBrandingToHeader();
      refreshPreviewFromForm();
      showToast("Logo reset to the default MMLI logo.", "success");
    });

    const sigArea = document.getElementById("sig-upload-area");
    const sigInput = document.getElementById("sig-file-input");
    sigArea.addEventListener("click", () => sigInput.click());
    sigArea.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sigInput.click(); } });
    sigInput.addEventListener("change", async () => {
      const file = sigInput.files[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        STATE.settings.signature = dataUrl;
        saveSettings(STATE.settings);
        populateSettingsForm();
        refreshPreviewFromForm();
        showToast("Signature updated.", "success");
      } catch (e) {
        showToast("Could not read that image file.", "error");
      }
    });
    document.getElementById("btn-reset-sig").addEventListener("click", () => {
      STATE.settings.signature = null;
      saveSettings(STATE.settings);
      populateSettingsForm();
      refreshPreviewFromForm();
      showToast("Signature reset to the default.", "success");
    });

    const stampArea = document.getElementById("stamp-upload-area");
    const stampInput = document.getElementById("stamp-file-input");
    stampArea.addEventListener("click", () => stampInput.click());
    stampArea.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stampInput.click(); } });
    stampInput.addEventListener("change", async () => {
      const file = stampInput.files[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        STATE.settings.stamp = dataUrl;
        saveSettings(STATE.settings);
        populateSettingsForm();
        refreshPreviewFromForm();
        showToast("Stamp updated.", "success");
      } catch (e) {
        showToast("Could not read that image file.", "error");
      }
    });
    document.getElementById("btn-reset-stamp").addEventListener("click", () => {
      STATE.settings.stamp = null;
      saveSettings(STATE.settings);
      populateSettingsForm();
      refreshPreviewFromForm();
      showToast("Stamp reset to the default.", "success");
    });
  }

  function initThemeToggle() {
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  }

  /* =======================================================================
     16. INITIALIZATION
     ======================================================================= */
  function init() {
    try {
      const savedTheme = safeGet(STORAGE_KEYS.theme, null) ||
        (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      applyTheme(savedTheme);

      applyBrandingToHeader();

      // seed a fresh receipt number + today's date on first load
      setFormData({
        receiptNo: generateReceiptNumber(),
        date: todayIso(),
        status: "PAID",
        currency: "LRD",
        category: "Competition Registration",
        paymentMethod: "Cash"
      });

      initTabs();
      initFormActions();
      initHistoryActions();
      initSettingsActions();
      initThemeToggle();
      attachLiveRecalcListeners();

      refreshPreviewFromForm();
      renderHistory();
      renderStats();
      positionTabIndicator();
      // Re-align the tab indicator once the display webfont finishes
      // loading, since it can subtly change tab button widths.
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(positionTabIndicator).catch(() => {});
      }
      setTimeout(positionTabIndicator, 400);

      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") document.getElementById("modal-region").innerHTML = "";
      });
    } catch (e) {
      console.error("Initialization error", e);
      showToast("The app hit a snag while starting up. Try reloading the page.", "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
