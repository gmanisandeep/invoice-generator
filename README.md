# InvoiceFlow — Premium GST Invoicing & Client SaaS PWA

[![Vercel Deployment](https://img.shields.io/badge/Deploy-Vercel-blue?logo=vercel&style=flat-square)](https://vercel.com)
[![PWA Standalone](https://img.shields.io/badge/PWA-Installable-blueviolet?logo=pwa&style=flat-square)](manifest.json)
[![SaaS Database](https://img.shields.io/badge/Database-Firebase-orange?logo=firebase&style=flat-square)](https://firebase.google.com)
[![Code Structure](https://img.shields.io/badge/Architecture-Vanilla--JS-3b82f6?style=flat-square)](#architecture)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**InvoiceFlow** is an enterprise-grade, high-performance, and beautifully tailored Indian GST Invoice Generator built as an installable **Progressive Web App (PWA)**. Equipped with dynamic SaaS auth, sandbox fallback modes, multi-tier subscription gates, scan-and-pay UPI payment QRs, direct WhatsApp shares, and local A4 horizontal scroll editors, it's designed to streamline invoicing operations for wholesalers, retail outlets, and small-to-medium businesses.

---

## Key Feature Highlights

- **Installable Desktop/Mobile App (PWA)**: Completely installable standalone app with a responsive bottom navigation bar, fixed glassmorphic mobile sticky top headers, and high-performance offline caching using Service Workers (`sw.js`).
- **Zero-Config Sandbox Fallback**: Immediate, out-of-the-box local testing capabilities. It stores accounts and invoice directories in a separate Local Storage sandbox partition before you link your database keys.
- **Enterprise SaaS Auth Systems**: Full register, login, sign-out, and password reset recovery views connected to Web Firebase Compat SDKs or local sandbox mocks.
- **Strict Subscription Paywall Gates**: Includes a rigorous Feature Gatekeeper protecting three SaaS tiers:
  - **Free Tier (₹0)**: 10 invoices/calendar month. Gated logo/signature uploads, downloads, UPI scans, direct WhatsApp shares, and analytics.
  - **Basic Tier (₹99/year)**: Unlimited invoices, branding uploads, downloads, payments, and WhatsApp direct shares. Gated dashboard charts.
  - **Pro Tier (₹299/year)**: Unlimited invoices, advanced business dashboard analytics (Monthly charts, Top-Product metrics), and customer directories.
- **Professional A4 Print Sheets**: WYSIWYG printing style that preserves absolute margins and columns on all devices using a custom horizontal scroll wrapper. Includes customizable logo uploads, digital signature blocks, customizable terms, bank metadata, and amount-in-words autofills.

---

## Project Structure & Architecture

InvoiceFlow is written using pure high-performance **Vanilla HTML5, CSS3, and JavaScript**, ensuring instant loading speeds, zero bundle build latency, and offline portability:

```
invoice-generator/
├── assets/
│   └── logo.svg             # Infinite-scale SVG application branding icon
├── index.html               # Main SPA DOM structure (Auth, Invoices, Settings, Admin views)
├── script.js                # Core state managers, Firebase engines, print/captures, gatekeepers
├── style.css                # Fluid CSS layout grid tokens, glassmorphism filters, print stylesheets
├── sw.js                    # Service Worker caching static assets and CDNs for offline access
├── manifest.json            # Web App Manifest describing installation configurations
├── vercel.json              # Custom routing configurations and strict HTTP security headers
├── .gitignore               # Protects production code by ignoring local configs and databases
├── config.js.example        # Blueprint configuration template for build-time credentials
└── .env.example             # Blueprint example for environment variables
```

---

## Quick Start — Local Development

Running InvoiceFlow locally is extremely simple and requires no active database config to test:

### 1. Clone & Reorganize
Clone the files into a subdirectory of your choice:
```bash
git clone https://github.com/your-username/invoice-generator.git
cd invoice-generator
```

### 2. Start a Local Dev Server
Deploy a quick development web server using Python, Node, or VS Code Live Server:
```bash
# Node.js Static Server
npx serve . -l 3000

# Python Simple HTTP Server
python -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) inside your browser. The application loads instantly inside **Zero-Config Sandbox Mode**.

---

## Production Configurations — Firebase Cloud

To take the app into stable production and sync business settings and invoices to the cloud:

### 1. Setup Firebase Console
1. Go to the [Firebase Console](https://console.firebase.google.com/) → Click **Add Project**.
2. Under **Build** → Enable **Authentication** (enable the **Email/Password** sign-in provider).
3. Under **Build** → Enable **Cloud Firestore** database.
4. Go to Firestore Rules and specify rules to secure user data (prevent users from viewing other accounts' invoices):
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
         
         match /invoices/{invoiceId} {
           allow read, write: if request.auth != null && request.auth.uid == userId;
         }
       }
     }
   }
   ```
5. Click **Project Settings** → **Add App** → Select **Web** `</>` → Copy the configuration object `firebaseConfig`.

### 2. Configuration Options (Dynamic vs Build-time)

You have two choices to link your production credentials securely:

#### Option A: Settings Paste (Dynamic Override)
1. Run the application locally or deploy it to production.
2. Sign in to your account → Navigate to **Settings** → Scroll to the bottom card **Firebase Cloud Integration**.
3. Paste your config JSON block directly in the field and click **Save Settings**:
   ```json
   {
     "apiKey": "AIzaSyA1...",
     "authDomain": "your-app.firebaseapp.com",
     "projectId": "your-app",
     "storageBucket": "your-app.appspot.com",
     "messagingSenderId": "1234567890",
     "appId": "1:123:web:abc"
   }
   ```
4. The panel will reload and immediately bind to your cloud instance.

#### Option B: Build-time Injection (`config.js`)
If you want to bake credentials directly into your deployment bundle (e.g. for Vercel/GitHub):
1. Rename [config.js.example](config.js.example) to `config.js`:
   ```bash
   cp config.js.example config.js
   ```
2. Populate the fields in `config.js` with your Firebase config object.
3. The `.gitignore` prevents this file from being committed, keeping your secrets safe!

---

## Production Deployment Checklist

### Vercel Deployment (Recommended)
InvoiceFlow is fully optimized for **Vercel** out-of-the-box using [vercel.json](vercel.json).
1. Push your repository to GitHub (ensure `config.js` and local sandbox files are ignored).
2. Open Vercel Console → Click **Add New** → Select **Project**.
3. Import your `invoice-generator` repository.
4. Click **Deploy**. Vercel automatically hosts the static file bundle, registers clean SPA URLs, and activates high-security HTTP headers:
   - **Content-Security-Policy (CSP)**: Blocks code injections and XSS exploits.
   - **X-Frame-Options (DENY)**: Blocks clickjacking framing.
   - **Cache-Control Policies**: Serves high-speed cached assets while ensuring `sw.js` and `manifest.json` load with zero cache delay for instant service worker hot-fixes on client screens.

---

## License & Contribution

This project is licensed under the **MIT License**. Check out [LICENSE](LICENSE) for more details. 

For inquiries, bugs, or feature proposals (like active SMS notifications, auto-billing loops, or real payment gateway integrations), feel free to open a GitHub Issue or reach out to the development team!
