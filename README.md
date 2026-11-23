# ContractGuard AI

ContractGuard AI helps review fictional or appropriately redacted agreements. The Chrome web app combines local photo OCR, PDF and text extraction, exact wording checks, an educational Clause Library, and Firebase AI Logic Hybrid inference. Its local deadline matcher checks reviewed text up to 256,000 characters, including text beyond the AI excerpt. PDF import checks up to 30 pages. Confirmed calendar reminders can be downloaded as a generic event.

## Run locally

Use Node.js 24.12 or later.

    npm ci
    npm test
    npx tsc -b
    npm run build
    npm run dev

Open the loopback URL printed by Vite. OCR, the Clause Library, and deadline tools can run without a Firebase project. The production build is in dist. OCR assets are generated from the installed packages.

To exercise inference, copy .env.example to .env.local. Supply the public web identifiers for your own Firebase test project and enable Firebase AI Logic. For loopback development, explicitly enable the App Check debug flag and privately register that browser's generated credential in your test project's App Check settings. Keep credential values out of files, recordings and shared instructions. A hosted build needs a reCAPTCHA Enterprise site key registered for its exact HTTPS origin.

Use supported desktop Chrome with a downloaded Prompt API model. Load the fictional sample, choose On-device and Micro Scan, and check the SDK's On-device AI badge. Test Hybrid with cloud-fallback consent. In a separate browser with no local inference available, expect the Cloud AI badge. A source badge identifies where inference ran. Check the model version separately in chrome://on-device-internals. Android Chrome can scan photographs locally and use cloud inference.

Firebase Hybrid setup: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
Chrome model management: https://developer.chrome.com/docs/ai/understand-built-in-model-management

## Review limits and license

This is an informational tool. Check all captured wording, dates and amounts against the original. Use fictional material for judging. The policy pages are drafts with owner actions identified.

Project source is MIT-licensed. Third-party packages have their own terms. DM Sans and Manrope font licenses are included in public/font-licenses.
