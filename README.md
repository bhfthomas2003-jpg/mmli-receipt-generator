# MMLI Receipt Generator

A complete, professional, mobile-friendly receipt generator for **Mind Masters
Liberia Initiative (MMLI)** — *"Unleashing the Genius Within."*

Runs entirely in the browser. No server, no database, no build step, no
Node.js, no npm. Upload the files to GitHub Pages and it works.

The MMLI logo, the authorized signature, and the official MMLI stamp are
**already built into the
app** (embedded as Base64 image data inside `assets.js`), so there is
nothing extra to upload or link — the receipts look right the moment you
publish the site.

---

## 1. Files in this project

| File | Purpose |
|---|---|
| `index.html` | The main application: Create Receipt, Receipt History, Settings. |
| `verify.html` | The public receipt-verification page (`verify.html?id=MMLI-2026-0001`). |
| `style.css` | All styling — navy & gold theme, layout, dark mode, print rules, animation. |
| `assets.js` | The MMLI logo, the authorized signature, and the official stamp, embedded as Base64 image data. |
| `qrcode-lib.js` | Self-contained QR code generator (no CDN, no network request) — see section 3.5. |
| `script.js` | All application logic for the main app (see section 6 below). |
| `verify.js` | Logic for the verification page. |
| `assets/logo.png`, `assets/signature.png` | Reference copies of the images (not required by the app — kept for your records). |
| `README.md` | This file. |

---

## 2. How each file works

**`index.html`** — Structure only. Three tabs (Create Receipt / Receipt
History / Settings), a live receipt preview, and the dashboard stat cards.
Loads three CDN libraries (QR code, jsPDF, html2canvas), then `assets.js`,
then `script.js`.

**`style.css`** — The design system: CSS custom properties define the navy
(`--navy-900`) and gold (`--gold-500`) palette, plus a separate dark-mode
palette that only affects the *app chrome*. The receipt document itself
(`#receipt-document`) uses fixed, theme-independent colors so it always
prints and exports the same way, in light mode or dark mode. Also contains
the `@media print` rules that hide everything except the receipt.

**`assets.js`** — Two constants, `MMLI_DEFAULT_LOGO_BASE64` and
`MMLI_DEFAULT_SIGNATURE_BASE64`, and `MMLI_DEFAULT_STAMP_BASE64`, holding the logo, signature, and stamp as
`data:image/png;base64,...` strings. Because these are plain JavaScript
values, they need no separate image request — they render instantly,
offline, and survive being copied between GitHub repos with zero broken
links.

**`script.js`** — Everything the app *does*:
1. Configuration & defaults
2. `localStorage` read/write helpers (all wrapped in try/catch)
3. Receipt number generation (peek/commit model — see section 7)
4. Number-to-words conversion
5. Currency & date formatting
6. Balance/status calculations
7. Toasts & confirmation modals
8. Form ⇄ data binding and validation
9. Receipt HTML rendering (used by the live preview, PDF, PNG, print, and
   the "View" modal)
10. Save / Edit / Duplicate / Delete
11. Receipt History table, search, and filters
12. PDF, PNG, and Print export
13. Tab switching
14. Settings (including logo/signature/stamp upload)
15. Dark mode
16. Event wiring and startup

**`verify.js`** — First checks the link's `?p=` / `?c=` query parameters for
an embedded, checksummed copy of the receipt's details (see section 3.5) and
verifies it instantly, on any device. Only if a link has no embedded payload
does it fall back to checking this browser's own saved receipts.

---

## 3. Deploying to GitHub Pages from your phone

You do **not** need a computer or a ZIP file. Do this directly in the
GitHub app or mobile browser:

1. Go to **github.com** and sign in (or create a free account).
2. Tap **+** → **New repository**.
   - Repository name: `mmli-receipts` (or any name you like)
   - Set it to **Public**
   - Tap **Create repository**
3. In the new repository, tap **Add file → Create new file**.
4. For the file name, type `index.html`. Tap into the text area and paste
   the full contents of `index.html` from this project. Scroll down and
   tap **Commit changes**.
5. Repeat step 3–4 for each remaining file: `verify.html`, `style.css`,
   `assets.js`, `qrcode-lib.js`, `script.js`, `verify.js`, `README.md`.
   - When you type a file name that includes a folder, like
     `assets/logo.png`, GitHub creates the folder automatically. (These two
     image files are optional reference copies — you can skip them if you
     want, since the app doesn't need them.)
6. Once all files are committed, tap the repository's **Settings** tab.
7. Scroll to **Pages** in the left-hand menu (on mobile, tap the menu icon
   to find it).
8. Under **Build and deployment → Source**, choose **Deploy from a
   branch**. Under **Branch**, choose `main` and folder `/ (root)`. Tap
   **Save**.
9. Wait 1–2 minutes, then refresh the Pages settings screen. You'll see a
   green banner with your live URL, something like:
   `https://YOUR-USERNAME.github.io/mmli-receipts/`
10. Open that link — your Receipt Generator is live.

**Important:** once you know this exact URL, update the **Verification
Base URL** field in the app's **Settings** tab to:
`https://YOUR-USERNAME.github.io/mmli-receipts/verify.html`
so QR codes point to the right place. (You can also edit the
`VERIFICATION_BASE_URL` constant at the top of `script.js` before
publishing, if you prefer.)

---

## 3.5. How QR codes & verification work (no backend required)

Two things used to be a problem: QR codes needing an internet connection
to load their drawing code, and verification only working on the device
that created the receipt. Both are fixed:

- **QR codes are fully self-contained.** `qrcode-lib.js` is a small QR
  encoder bundled directly into the site — nothing is fetched from a CDN
  to draw a QR code, so it works identically online or completely
  offline.
- **Verification travels with the QR code.** Each QR still encodes one
  plain, tappable URL (so phone cameras recognize it as a link), but that
  URL's query string carries a compact, base64-encoded copy of the
  receipt's key details plus a short integrity checksum. Opening the link
  — on any device, anywhere — decodes and checks it immediately. No
  lookup, no database, no dependency on the browser that issued it.
- **The checksum is an integrity check, not a cryptographic signature.**
  This is a static, no-backend site, so there's no server-held secret key
  to sign with. The checksum catches accidental corruption or a mangled
  link; it will not stop someone determined to hand-edit a URL. If MMLI
  later wants tamper-*proof* (not just tamper-*evident*) verification,
  that requires a small backend to check a server-side signature — see
  section 8.

---

## 4. Changing the MMLI logo, signature, or stamp later

You will **not** need to touch GitHub or any code for this:

1. Open the app → **Settings**.
2. Under **Organization Logo**, **Authorized Signature**, or **MMLI Official
   Stamp**, tap the upload
   box and choose a photo from your phone.
3. Tap **Save Settings**.

The new image is stored in this browser and used everywhere (preview,
PDF, PNG, print) instead of the built-in default. Tap **Reset to Default**
at any time to go back to the original MMLI logo, signature, or stamp that came
built into the app.

---

## 5. Changing MMLI contact information

Open **Settings** and edit any of: Organization Name, Short Name, Motto,
Authorized Person, Phone, Email, Website, Address, Footer Message, or
Verification Base URL. Tap **Save Settings**. These values are stored in
`localStorage` and used to build every future receipt — no code changes
needed.

---

## 6. How receipt numbering works

Receipt numbers follow the format `MMLI-2026-0001`, where `2026` updates
automatically to the current year.

- The highest number **actually used** (saved to a receipt) is stored in
  `localStorage` per year, e.g. key `mmli_counter_2026`.
- Loading the app, clicking **Clear Form**, or **Duplicate Receipt** shows
  you the *next available* number without spending it — so refreshing the
  page never creates gaps in your sequence.
- Clicking **Generate New Receipt Number**, or actually **saving** a
  receipt, is what "uses" a number. If you type in a number by hand (e.g.
  jump ahead to `MMLI-2026-0050`), the counter catches up so future
  numbers continue after it.
- When the calendar year changes, numbering restarts at `0001` for the new
  year automatically.
- You can always edit the Receipt Number field by hand if needed.

---

## 7. Storage & verification — what's local vs. what travels with the receipt

This app stores your **Receipt History**, settings, the receipt-number
counter, and your theme choice in this **one browser, on this one
device**, using `localStorage`. That means receipts created on your phone
will not automatically appear on a laptop or a teammate's phone, and
clearing your browser's site data will lose your saved history.

**Verification is different and works everywhere, automatically.** Every
QR code this app generates carries a compact, checksummed copy of that
receipt's key details directly inside the link (see section 3.5). Opening
that link — or scanning that QR — verifies the receipt instantly on *any*
device, with no lookup, no database, and no dependency on the browser
that created it. The Settings tab explains this distinction plainly.

---

## 8. Connecting a real backend later (optional)

Cross-device verification already works out of the box (section 3.5), so
a backend is **not required** for that. A backend mainly becomes useful
if MMLI wants to:
- Keep one shared, always-current Receipt History across every team
  member's device (rather than each device holding only what it created).
- Be able to **revoke or void** a receipt after the fact (the embedded-QR
  verification confirms the data matches what was issued; it can't know
  about a cancellation that happened afterward).
- Centrally manage organization Settings across devices.

The code is structured so this upgrade doesn't require a rebuild:

- **Receipts:** `loadReceipts()` / `saveReceipts()` in `script.js` are the
  only two functions that read/write the receipt list. Replace their
  bodies with Firestore calls (e.g. `getDocs(collection(db,"receipts"))`
  and `setDoc(...)`), keeping the same function names and the same
  shape of data, and everything else (form, preview, PDF, history table)
  keeps working unchanged.
- **Verification:** `lookupReceiptLocally()` in `verify.js` is the
  fallback path for links without an embedded payload — extend it with a
  real API/Firestore lookup (e.g. to also check revocation status)
  without touching the embedded-payload path that already works.
- **Settings:** `loadSettings()` / `saveSettings()` can be swapped the
  same way if you want shared, centrally-managed organization settings.

A typical path: create a free Firebase project → enable Firestore → add
the Firebase Web SDK via a CDN `<script>` tag (still no npm/build step
required) → swap the functions above. Everything else — layout,
receipt design, PDF/PNG/print, QR codes, number-to-words — stays exactly
as it is.

---

## 9. What was tested before delivery

Before finalizing, the following were checked:
- Number-to-words conversion (including the exact examples in the brief,
  decimals, zero, and values up to 999,999,999).
- Balance/status calculations for PAID IN FULL, BALANCE DUE, and
  OVERPAYMENT, with blank/invalid inputs never producing `NaN`.
- Receipt-number sequencing across page reloads, manual number entry, and
  year rollover.
- QR generation: the bundled encoder was tested by rendering codes and
  decoding them back programmatically (short and long payloads, up to
  version-14-sized verification URLs), confirming exact round-trip
  matches.
- Verification round-trip: embedded-payload encode → URL → decode →
  checksum match, and checksum-mismatch (tamper) detection.
- All JavaScript files pass a syntax check.

Because this environment cannot run a real mobile browser, please do a
quick pass yourself after publishing: create a receipt, save it, try
Search/Filter in Receipt History, and try Download PDF / Download PNG /
Print / dark mode on your own Android phone.
