export const policyPaths = {
  terms: { title: 'Terms & Conditions', href: '#terms' },
  privacy: { title: 'Privacy Policy', href: '#privacy' },
  cookies: { title: 'Cookies Policy', href: '#cookies' },
} as const;

export type Policy = keyof typeof policyPaths;
type Reference = { label: string; href: string };
type Section = { heading: string; text: string[]; references?: Reference[] };

export function policyAt(hash: string): Policy | undefined {
  return (Object.keys(policyPaths) as Policy[]).find((policy) => policyPaths[policy].href === hash);
}

export const policyContent: Record<Policy, { intro: string; sections: Section[] }> = {
  terms: {
    intro: 'These draft terms describe the scope of ContractGuard AI and your responsibilities when using it.',
    sections: [
      { heading: 'The service', text: [
        'ContractGuard AI helps you read agreements, extract text, review possible issues, and prepare calendar files. The Clause Library provides general educational material. These tools offer informational assistance and do not provide legal, financial, or other professional advice or create a professional relationship.',
        'AI output may be inaccurate, incomplete or fabricated. OCR can misread digits, dates and words, and analysis covers only the shown excerpt. Check the original agreement, appendices and amendments yourself. Confirm amounts, notice procedures, exact deadlines, consequences and time zones before acting. Obtain qualified advice where appropriate.',
        'Calendar files require your confirmation and manual import. Your calendar controls the event and notification settings. You remain responsible for meeting deadlines.',
      ] },
      { heading: 'Your documents and acceptable use', text: [
        'You keep any rights you hold in your documents. Use only material you are entitled to process and, if you choose cloud analysis, to send to the provider. Follow confidentiality obligations, privacy law and third-party rights. Use fictional or appropriately redacted material in this preview.',
        'Use the service lawfully. Do not use it to distribute harmful content, infringe rights, impersonate others, obtain unauthorized access, bypass security controls, or interfere with the service. The app processes selected material to provide the functions you request.',
      ] },
      { heading: 'Software and third-party services', text: [
        'The repository includes an MIT license for covered source code. Third-party components, typefaces and services remain subject to their own licenses and terms. The license does not by itself grant rights in third-party documents, brands or services.',
        'Cloud analysis and Hybrid fallback use Google Gemini through Firebase AI Logic. See the Privacy Policy for the data flow. Google and your chosen calendar provider apply their own terms to their respective services.',
      ] },
      { heading: 'Availability and liability', text: [
        'Features may change, be interrupted, or be withdrawn. Access may be limited for abuse, maintenance, security, or legal reasons. Subject to applicable law, the service is provided as available, with no promise of uninterrupted access, accuracy, fitness for a specific purpose, or reminder delivery.',
        'To the extent allowed by applicable law, the operator is not responsible for indirect losses arising from use of the service. These terms do not limit any liability or rights that applicable law prohibits the operator from limiting.',
      ] },
      { heading: 'Governing law, disputes and contact', text: [
        'OWNER ACTION REQUIRED — confirm the operator’s legal name, address, public support contact, governing law and dispute resolution process before publication. Applicable mandatory rights and remedies remain available.',
      ] },
    ],
  },
  privacy: {
    intro: 'This draft describes which functions stay in your browser and what may go to service providers when you use the hosted app.',
    sections: [
      { heading: 'Documents, reviews and calendar files', text: [
        'The app reads your selected photos, PDFs and text files locally. OCR runs in your browser. Pasted text, extracted text, recovery copies, and findings are held in page memory while you work. The app has no account, document database, or feature that saves your draft across a reload.',
        'Deadline matching and calendar generation run locally. The calendar file contains a generic title, the confirmed event date and time, and any chosen reminder intervals. The download and any calendar copy are controlled by you and your calendar provider.',
      ] },
      { heading: 'AI modes and your choice', text: [
        'On-device mode uses a supported browser’s local model for inference and does not send a contract excerpt. A device may need to download the model first.',
        'Hybrid prefers available local inference and may send the submitted excerpt to Google Gemini if the local path is unavailable. Cloud always sends the excerpt for inference. The app requires an affirmative checkbox and an analysis action for both cloud-capable modes. It sends the selected text excerpt as part of a prompt, without sending the original file or photo.',
        'You can uncheck cloud consent before submitting or use On-device mode where supported. Withdrawal applies to future requests. It does not recall an in-flight request or erase processing that already occurred.',
      ] },
      { heading: 'Security, hosting and technical data', text: [
        'The hosting service receives ordinary network requests and may process technical data such as IP address and request information. Where configured, Firebase App Check and reCAPTCHA Enterprise process technical signals and use tokens to verify requests and help prevent abuse. This security processing is separate from the choice to send a contract excerpt. See the Cookies Policy for browser storage.',
        'Cloud services use encrypted transport. App Check helps protect backend requests. Browser, device, provider, and network risks remain. Use only material you may lawfully process and avoid sending sensitive or confidential information to this preview.',
      ], references: [{ label: 'Firebase privacy and security', href: 'https://firebase.google.com/support/privacy/' }] },
      { heading: 'AI provider, retention and international transfers', text: [
        'The current cloud integration uses the Gemini Developer API via Firebase AI Logic. Google’s processing and retention depend on the project plan and applicable terms. AI monitoring or logging, if configured, may capture sampled prompts and responses. Google and hosting providers may process data outside your country.',
        'OWNER ACTION REQUIRED — verify the live project plan, logging and retention, service providers, regions, applicable transfer safeguards, data-processing terms, lawful bases and hosted access-log policy before accepting real contracts.',
      ], references: [
        { label: 'Gemini API terms', href: 'https://ai.google.dev/gemini-api/terms' },
        { label: 'Firebase AI monitoring', href: 'https://firebase.google.com/docs/ai-logic/monitoring' },
      ] },
      { heading: 'Privacy choices, requests and complaints', text: [
        'Depending on applicable law, you may have rights to information, access, correction, deletion, restriction, portability, objection or withdrawal of consent. Close or reload the page to clear the app’s in-memory draft. Manage previously downloaded files and imported calendar entries separately.',
        'If Nigerian law applies, you may lodge a complaint with the Nigeria Data Protection Commission. Other jurisdictions may provide a right to complain to a local supervisory authority.',
        'OWNER ACTION REQUIRED — identify the data controller, privacy contact and request procedure, confirm the intended countries and applicable rights, and review this policy when processing changes. The review date above reflects this draft.',
      ], references: [
        { label: 'Nigeria Data Protection Act 2023', href: 'https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf' },
        { label: 'Nigeria Data Protection Commission', href: 'https://ndpc.gov.ng/' },
      ] },
    ],
  },
  cookies: {
    intro: 'This draft describes browser storage and third-party security technologies used by the current app.',
    sections: [
      { heading: 'Local app storage', text: [
        'The app does not write first-party cookies, localStorage or sessionStorage for drafts or preferences. Agreement text, photos and findings are held in page memory. Your browser may cache first-party static assets, including fonts, OCR runtime files and the language model used for OCR. These assets contain no user documents.',
        'ContractGuard AI does not add analytics, advertising, marketing or optional preference trackers. The current implementation has no optional tracking controls to enable.',
      ] },
      { heading: 'Firebase App Check and reCAPTCHA', text: [
        'Where enabled, the Firebase App Check SDK can cache a short-lived security token in IndexedDB. Debug builds can retain a browser-specific debug credential in IndexedDB. Debugging is an explicitly enabled development feature. Production uses reCAPTCHA Enterprise when configured.',
        'Google documents the _GRECAPTCHA cookie for risk analysis when its service runs. Other Google cookies may already be present on its domain. The exact cookies, token lifetime and third-party retention depend on the live configuration, browser and Google settings.',
        'OWNER ACTION REQUIRED — inventory the final HTTPS deployment in clean browsers, confirm reCAPTCHA and hosting storage and retention, and classify any additional technology before rollout.',
      ], references: [
        { label: 'Google reCAPTCHA cookie documentation', href: 'https://docs.cloud.google.com/recaptcha/docs/faq' },
        { label: 'NDPC General Application and Implementation Directive', href: 'https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf' },
      ] },
      { heading: 'Manage cookies and site data', text: [
        'Your browser can block third-party cookies and clear stored data for a site. Blocking security technologies may prevent Cloud and Hybrid from obtaining App Check tokens. The Cloud and Hybrid checkbox applies to transmitting your contract excerpt and is separate from browser cookie settings.',
        'OWNER ACTION REQUIRED — confirm the operator contact for questions and update these disclosures before enabling optional tracking. Any future optional tracker requires a prior, accessible accept-or-reject choice where applicable.',
      ] },
    ],
  },
};
