import type { PreparedImage } from './ocr';

export const PHOTO_LIMITS = { pages: 10, bytes: 45 * 1024 * 1024 };

export type PhotoPage = {
  id: number;
  attempt: number;
  name: string;
  file: File | null;
  rotation: number;
  preview: PreparedImage | null;
  status: 'queued' | 'reading' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  text: string;
  confidence: number | null;
  needsReview: boolean;
  reviewed: boolean;
  edited: boolean;
};

export type PhotoBatch = {
  kind: 'photos';
  pages: PhotoPage[];
  selectionError: string | null;
  omitted: string[];
};

export type PageJob = Pick<PhotoPage, 'id' | 'attempt'>;

export function newPhotoPage(id: number, file: File, error: string | null): PhotoPage {
  return {
    id, attempt: 0, name: file.name, file: error ? null : file, rotation: 0, preview: null,
    status: error ? 'failed' : 'queued', progress: 0, message: error ?? '', text: '',
    confidence: null, needsReview: false, reviewed: false, edited: false,
  };
}

export function queuedAgain(page: PhotoPage, rotation: number, attempt: number): PhotoPage {
  return {
    ...page, attempt, rotation, status: 'queued', progress: 0, message: '',
    text: '', confidence: null, needsReview: false, reviewed: false, edited: false,
  };
}

export function matchesPageJob(page: PhotoPage, job: PageJob): boolean {
  return page.id === job.id && page.attempt === job.attempt && page.status === 'reading';
}

export function missingPage(page: PhotoPage): boolean {
  return page.status !== 'ready' || !page.text.trim();
}

export function completeBatch(batch: PhotoBatch): boolean {
  return !batch.selectionError && batch.pages.length > 0 && !batch.pages.some(missingPage);
}

export function combinePages(pages: PhotoPage[], showMissing = false): string {
  if (pages.length === 1 && pages[0].status === 'ready') return pages[0].text;
  return pages.map((page, index) => {
    const text = missingPage(page) ? (showMissing ? '[Unresolved page]' : '') : page.text;
    return `[Page ${index + 1}]\n${text}`;
  }).join('\n\n');
}

// Page text is the source of truth. Reject ambiguous changes to the separators
// so combined edits cannot shift a correction onto a different source photo.
export function splitCombinedPages(text: string, count: number): string[] | null {
  if (count === 1) return [text];
  const parts = text.split(/^\[Page (\d+)\]\n/gm);
  if (parts[0] !== '' || parts.length !== count * 2 + 1) return null;
  const texts: string[] = [];
  for (let index = 0; index < count; index++) {
    if (parts[index * 2 + 1] !== String(index + 1)) return null;
    const part = parts[index * 2 + 2];
    if (index < count - 1 && !part.endsWith('\n\n')) return null;
    texts.push(index === count - 1 ? part : part.slice(0, -2));
  }
  return texts;
}

export function editPageText(page: PhotoPage, text: string): PhotoPage {
  return page.text === text ? page : { ...page, text, reviewed: false, edited: true };
}

// Pages move as whole records, so corrections, confidence, and review state stay
// attached to their source photo while only the displayed page number changes.
export function movePhotoPage(batch: PhotoBatch, id: number, offset: number): PhotoBatch | null {
  const from = batch.pages.findIndex((page) => page.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= batch.pages.length) return null;
  const pages = [...batch.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page);
  return { ...batch, pages };
}

// Removing an unresolved page records it as omitted so the editor and completed
// findings keep warning that the agreement is incomplete.
export function removePhotoPage(batch: PhotoBatch, id: number): PhotoBatch | null {
  const index = batch.pages.findIndex((page) => page.id === id);
  if (index < 0) return null;
  const page = batch.pages[index];
  const omitted = missingPage(page) ? [...batch.omitted, `page ${index + 1} (${page.name})`] : batch.omitted;
  return { ...batch, pages: batch.pages.filter((item) => item.id !== id), omitted };
}

export function pageCoverage(pages: PhotoPage[], limit: number) {
  let end = 0;
  return pages.map((page, index) => {
    const start = end + (index === 0 ? 0 : 2);
    const headingLength = pages.length === 1 ? 0 : `[Page ${index + 1}]\n`.length;
    const textStart = start + headingLength;
    const text = pages.length === 1 ? page.text.trim() : index === pages.length - 1 ? page.text.trimEnd() : page.text;
    end = textStart + text.length;
    return { id: page.id, number: index + 1, textStart, textEnd: end, status: limit >= end ? 'full' : limit <= textStart ? 'omitted' : 'partial' };
  });
}
