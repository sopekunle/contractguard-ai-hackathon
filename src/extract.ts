import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { MAX_LOCAL_REVIEW_CHARS } from './document';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 30;
const localLimit = MAX_LOCAL_REVIEW_CHARS.toLocaleString();

export async function readContractFile(file: File): Promise<{ text: string; note: string; sourceIncomplete: boolean }> {
  if (file.size > MAX_BYTES) throw new Error('File is too large. Please upload a file under 8 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'txt') {
    const text = (await file.text()).trim();
    if (!text) throw new Error('The text file is empty.');
    const sourceIncomplete = text.length > MAX_LOCAL_REVIEW_CHARS;
    return {
      text: text.slice(0, MAX_LOCAL_REVIEW_CHARS),
      sourceIncomplete,
      note: sourceIncomplete ? `Only the first ${localLimit} of ${text.length.toLocaleString()} TXT characters were loaded.` : 'Text loaded locally.',
    };
  }
  if (extension !== 'pdf') throw new Error('Please select a PDF or TXT file.');

  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    const unread: number[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_PAGES); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim();
      const block = `[Page ${pageNumber}]\n${pageText}`;
      pages.push(block);
      if (!pageText) unread.push(pageNumber);
      length += block.length + (pageNumber > 1 ? 2 : 0);
      if (length >= MAX_LOCAL_REVIEW_CHARS) break;
    }
    const skipped = pages.length < pdf.numPages;
    const omittedNote = skipped ? ` Later PDF pages (${pages.length + 1} to ${pdf.numPages}) were not loaded.` : '';
    if (unread.length === pages.length) throw new Error(`No selectable text found on the PDF pages checked.${omittedNote} Use "Upload document photos" or "Take photo" to read pages with local OCR instead.`);
    const charLimited = length > MAX_LOCAL_REVIEW_CHARS || (length === MAX_LOCAL_REVIEW_CHARS && skipped);
    const limitNote = charLimited ? ` PDF text was limited to the first ${localLimit} characters.` : '';
    const pageLimitNote = skipped && pages.length === MAX_PAGES ? ` The PDF importer checks up to ${MAX_PAGES} pages.` : '';
    const unreadNote = unread.length ? ` No selectable text on pages ${unread.join(', ')}. Check those pages in the original.` : '';
    return {
      text: pages.join('\n\n').slice(0, MAX_LOCAL_REVIEW_CHARS).trim(),
      sourceIncomplete: charLimited || skipped || unread.length > 0,
      note: `Checked ${pages.length} of ${pdf.numPages} PDF pages locally.${limitNote}${omittedNote}${pageLimitNote}${unreadNote}`,
    };
  } finally {
    await task.destroy();
  }
}

export const EXAMPLE_CONTRACT = `FREELANCE DESIGN SERVICES AGREEMENT

1. Services. Designer agrees to deliver a website redesign and brand assets by December 15, 2026.

2. Payment. Client shall pay a total fee of $2,500, with $1,000 due upon signing and the balance within 14 days after delivery.

3. Late Payment. Any amount unpaid after the due date incurs a non-compounding charge of 5% per month.

4. Automatic Renewal. This agreement automatically renews for twelve (12) months unless either party gives written notice at least 60 days before expiry.

5. Early Termination. A party ending the agreement before completion must pay a termination penalty equal to 40% of the remaining contract value.

6. Intellectual Property. All work product, including preliminary drafts, transfers to the Client immediately upon creation, whether or not payment has been made.

7. Dispute Resolution. Any dispute must be resolved through binding arbitration in a venue selected solely by the Client.`;
