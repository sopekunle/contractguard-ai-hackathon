import { ArrowLeft } from 'lucide-react';
import { policyPaths } from './policies';

export const HELP_HASH = '#help';
export const LOCAL_AI_HELP_HASH = `${HELP_HASH}/local-ai`;

const topics = {
  'first-scan': 'Run your first scan',
  documents: 'Add a document or photos',
  modes: 'Choose a mode and scan depth',
  'local-ai': 'Turn on local AI in Chrome',
  findings: 'Read findings and check deadlines',
  privacy: 'Understand privacy and cloud consent',
  faq: 'Troubleshooting and FAQ',
};

function TopicHeading({ topic }: { topic: keyof typeof topics }) {
  return <h2 id={`${HELP_HASH.slice(1)}/${topic}`} tabIndex={-1}>{topics[topic]}</h2>;
}

export function HelpPage() {
  return <article className="policy-page help-page">
    <header className="policy-hero">
      <div>
        <a href="#contract-analyzer"><ArrowLeft size={16} aria-hidden="true"/> Contract analyzer</a>
        <h1 tabIndex={-1}>Help &amp; FAQ</h1>
        <p>ContractGuard AI helps you spot fees, deadlines and clauses to review before signing. Use it for information and ask a qualified lawyer for legal advice.</p>
      </div>
    </header>

    <div className="policy-body">
      <nav className="help-topics" aria-label="Help topics">
        <ul>{Object.entries(topics).map(([key, label]) => <li key={key}><a href={`${HELP_HASH}/${key}`}>{label}</a></li>)}</ul>
      </nav>

      <section>
        <TopicHeading topic="first-scan"/>
        <ol>
          <li>Open <a href="#contract-analyzer">Contract analyzer</a> and choose <strong>Load sample contract</strong>. The sample is fictional.</li>
          <li>Choose <strong>On-device</strong> if local AI is ready in Chrome. To try <strong>Cloud</strong>, select it and read and tick the consent box.</li>
          <li>Choose <strong>Micro scan</strong> and select <strong>Analyze agreement</strong>.</li>
          <li>Read <strong>Contract findings</strong>. The badge shows where the AI ran. Check any important details against the contract text.</li>
        </ol>
      </section>

      <section>
        <TopicHeading topic="documents"/>
        <ul>
          <li><strong>Paste text.</strong> Copy the agreement into <strong>Contract text</strong>. For a Word document, copy the text or export a PDF or plain text file.</li>
          <li><strong>Upload a file.</strong> Select <strong>Upload PDF / TXT</strong> for files up to 8 MB. The PDF reader checks selectable text on up to 30 pages. Read the import message for blank or skipped pages and other limits. For an image-only scan, capture each page as a photo or image.</li>
          <li><strong>Use photos.</strong> Select <strong>Upload document photos</strong> for JPEG, PNG or WebP images, or use <strong>Take photo</strong>. Take one well-lit photo per page with every edge visible. Use <strong>Take another photo</strong> or <strong>Add another page</strong> to continue the same document. You can add up to 10 pages, 15 MB per photo and 45 MB total.</li>
        </ul>
        <p>Photo OCR reads the words in an image. In <strong>Document pages</strong>, check the page order and open <strong>Review page text</strong> to correct errors. Compare names, numbers and clauses with the originals even if the confidence score is high. Confirm any requested low-confidence reviews after checking the text.</p>
        <p>Use <strong>Retry OCR</strong> or <strong>Replace page</strong> if a page is unreadable. Analysis stays disabled while a selected page is unresolved. Removing an unreadable page can leave out important clauses. Read the incomplete-agreement warning before continuing.</p>
      </section>

      <section>
        <TopicHeading topic="modes"/>
        <h3>Where the AI runs</h3>
        <ul>
          <li><strong>Hybrid.</strong> Prefers local AI when it is available. With your consent, it can send an excerpt to Google’s Gemini service if it needs to use cloud AI.</li>
          <li><strong>On-device.</strong> Uses Chrome’s local model only. The excerpt stays on your device and the app never falls back to the cloud for that scan.</li>
          <li><strong>Cloud.</strong> Sends the selected excerpt to Google’s Gemini service for analysis after you give consent.</li>
        </ul>
        <h3>How much the AI reviews</h3>
        <ul>
          <li><strong>Micro scan.</strong> The default. Aims for 40–70 words and one or two risks.</li>
          <li><strong>Quick scan.</strong> Aims for about 180 words. It can take longer, especially on-device.</li>
          <li><strong>Detailed.</strong> Available in Hybrid and Cloud. Gives a longer review with up to five priority findings, which can vary between runs.</li>
        </ul>
        <p>Micro and Quick normally read up to the first 6,000 characters. Detailed reads up to the first 12,000. Check the character count in the results and any excerpt warning. Read later clauses yourself if they fall outside the scan.</p>
      </section>

      <section>
        <TopicHeading topic="local-ai"/>
        <p>Use an up-to-date desktop Google Chrome. Chrome documents the web feature this app uses, the Prompt API, from version 148. Local AI requires a compatible computer and a downloaded model. Chrome on Android or iPhone cannot run this local web model. You can still use local OCR on supported phones and choose Cloud after giving consent. <a href="https://developer.chrome.com/docs/ai/prompt-api">Chrome’s Prompt API requirements</a></p>
        <ul>
          <li>Use Windows 10 or 11, macOS 13 or later, Linux, or an eligible Chromebook Plus.</li>
          <li>Keep at least 22 GB free on the drive that holds your Chrome profile.</li>
          <li>Chrome lists either more than 4 GB of graphics memory, or at least 16 GB of RAM and four CPU cores.</li>
          <li>Use Wi-Fi or Ethernet with no metered data limit for the first model download.</li>
        </ul>
        <ol>
          <li>In Chrome, open the three-dot menu, choose <strong>Help</strong>, then <strong>About Google Chrome</strong>. Let Chrome update and choose <strong>Relaunch</strong> if offered.</li>
          <li>In <strong>Settings</strong>, look for <strong>On-device AI</strong>. Google lists it under <strong>AI innovations</strong>. If the switch is available and off, turn it on to allow Chrome to download the model. If it is already on or you cannot find it, try the sample scan below with your current settings. <a href="https://support.google.com/chrome/answer/16961953">Google’s guide to the On-device AI setting</a></li>
          <li>Open <a href="#contract-analyzer">Contract analyzer</a>. Select <strong>Load sample contract</strong>, <strong>On-device</strong>, then <strong>Micro scan</strong>.</li>
          <li>Select <strong>Analyze agreement</strong>. On an eligible device, this asks Chrome to prepare its model and download it if needed. Keep Chrome open and connected while the app shows <strong>Preparing on-device model</strong> or download progress.</li>
          <li>Wait for <strong>Contract findings</strong> with an <strong>On-device AI</strong> badge. A completed scan with this badge confirms local AI worked. The Analyze button can be enabled before the model is ready.</li>
        </ol>
        <p>Our verified Windows Chrome run used <strong>Gemini Nano v3 GPU</strong>. The result badge tells you where the scan ran. Chrome manages the installed model.</p>
        <details>
          <summary>Advanced Chrome troubleshooting</summary>
          <p>If a sample scan still fails after updating and relaunching, check the computer requirements and give any download time to finish. You can open <code>chrome://on-device-internals</code> in Chrome and check <strong>Broker State</strong> for the installed model’s status and version and whether <code>prompt_api</code> is available. The sample scan is the final check that the app can use it.</p>
          <p>Leave experimental flags at their defaults when trying the hosted app on current Chrome. Firebase lists an experimental flag for its local development setup. If a work or school browser blocks the feature, ask the device administrator or use an available mode. <a href="https://firebase.google.com/docs/ai-logic/hybrid/web/get-started">Firebase’s Chrome setup documentation</a></p>
        </details>
      </section>

      <section>
        <TopicHeading topic="findings"/>
        <p><strong>Local Extraction</strong> copies recognizable amounts, dates and terms from the text in your browser. It can show matches before you run any AI. <strong>Contract findings</strong> are AI-generated summaries and interpretations. They can miss clauses or misread their meaning. A matched quotation confirms the words appear in the excerpt. Read the surrounding clause yourself to check the interpretation.</p>
        <p>Check who pays, the amount and currency, and when payment is due. Read how fees, renewal, cancellation and notice periods are written. For a deadline like “within 14 days after delivery,” confirm the delivery date and whether the contract counts calendar or business days.</p>
        <ol>
          <li>In <strong>Important Contract Deadlines</strong>, compare the quoted text and any proposed date against the original. Local matching reviews the available text separately from the AI scan. It can still miss dates, especially when pages are missing or hard to read.</li>
          <li>Choose <strong>Prepare a calendar reminder</strong>. Enter or check the date, time, time zone and reminder choices, then confirm your review.</li>
          <li>Choose <strong>Download calendar reminder</strong> and import the file into your calendar. Check that the event time and notifications are correct there. The downloaded event uses a generic title and excludes contract text.</li>
        </ol>
      </section>

      <section>
        <TopicHeading topic="privacy"/>
        <p>Your files, photos, OCR, local text matches and deadline checks stay in your browser. On-device analysis keeps the contract excerpt there too. The app holds your draft and findings in this tab while you work. Save anything you need before reloading or closing it.</p>
        <p>Cloud and Hybrid require you to tick a consent box before analyzing. Cloud sends the chosen text excerpt to Google. Hybrid may send that excerpt if it falls back to cloud AI. The original PDF and photos stay in the browser. Hosting and abuse protection can process technical data separately. <a href={policyPaths.privacy.href}>Privacy Policy</a></p>
        <p>Use the fictional sample whenever possible. Only submit confidential material if you have permission and are comfortable with the applicable data handling. Remove personal or sensitive details before any cloud scan.</p>
      </section>

      <section>
        <TopicHeading topic="faq"/>
        <details>
          <summary>Why is Analyze agreement disabled?</summary>
          <p>Add usable contract text and check the message below the button. Resolve failed or cancelled photo pages and confirm any required OCR reviews. If a new upload failed, use <strong>Restore previous document</strong> when offered to return to the previous draft. In Hybrid or Cloud, check the consent box and wait for the site’s security check. If it still fails, test with the fictional sample.</p>
        </details>
        <details>
          <summary>Can I use the app offline?</summary>
          <p>On-device scans can work offline in an already loaded tab after Chrome has prepared the model. Opening the hosted site and downloading the model or OCR assets for the first time need a connection. Cloud scans and Hybrid cloud fallback need internet access.</p>
        </details>
        <details>
          <summary>What if local AI is unavailable?</summary>
          <p>Try the <a href={LOCAL_AI_HELP_HASH}>Chrome setup walkthrough</a> on a supported computer. You can still read text matches and deadline suggestions locally. If you are comfortable sending an excerpt, choose Cloud or allow Hybrid cloud fallback. Check the findings badge to see where the scan ran.</p>
        </details>
        <details>
          <summary>What is the cloud limit, and how do I retry an error?</summary>
          <p>The judging site allows <strong>5 cloud generation requests per minute per user, per region</strong>. Cloud scans and Hybrid cloud fallback count toward it. On-device scans run locally. <a href="https://firebase.google.com/docs/ai-logic/quotas">Firebase rate limits</a></p>
          <p>If you hit a rate limit, wait at least a minute before trying again. If you see a high-demand message or “Failed to parse stream,” wait briefly, check your connection and retry once. Each cloud retry can send the excerpt again. Keep the current tab open to preserve your draft, and avoid repeated clicks. If errors continue, try the fictional sample with Micro scan or use On-device if ready.</p>
        </details>
        <details>
          <summary>What if a quotation or result looks wrong?</summary>
          <p>Find the clause in the original and check the wording, who it applies to and any exceptions. If text is wrong or missing, correct the draft or replace the unreadable page before trying again. Treat unverified quotations and inconsistent findings as items for manual review.</p>
        </details>
      </section>
    </div>
  </article>;
}
