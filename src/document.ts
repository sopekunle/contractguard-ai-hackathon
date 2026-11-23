import { combinePages, completeBatch, matchesPageJob, type PageJob, type PhotoBatch, type PhotoPage } from './photoPages.ts';

export const MAX_LOCAL_REVIEW_CHARS = 256_000;

export type DocumentDraft = { text: string; name: string; note?: string; edited?: boolean; sourceIncomplete?: boolean };
type TextDocument = DocumentDraft & { kind: 'text' };
type FileSelection = { kind: 'file'; name: string; error: string | null };
type RestorableDocument = TextDocument | PhotoBatch;

export type DocumentState = {
  revision: number;
  current: RestorableDocument | FileSelection | null;
  previous: RestorableDocument | null;
};

export type DocumentAction =
  | { type: 'select-file'; name: string }
  | { type: 'finish-file'; revision: number; draft: DocumentDraft }
  | { type: 'fail-file'; revision: number; error: string }
  | { type: 'replace'; draft: DocumentDraft | null }
  | { type: 'restore' }
  | { type: 'edit'; text: string }
  | { type: 'photos'; batch: PhotoBatch; savePrevious?: boolean }
  | { type: 'start-page'; job: PageJob }
  | { type: 'update-page'; job: PageJob; update: Partial<Pick<PhotoPage, 'status' | 'progress' | 'message' | 'preview' | 'text' | 'confidence' | 'needsReview'>> };

export const initialDocument: DocumentState = { revision: 0, current: null, previous: null };

export function photoBatch(state: DocumentState): PhotoBatch | null {
  return state.current?.kind === 'photos' ? state.current : null;
}

function restorable(current: DocumentState['current']): RestorableDocument | null {
  if (current?.kind === 'text' && current.text.trim()) return current;
  if (current?.kind === 'photos' && completeBatch(current)) return current;
  return null;
}

export function activeDraft(state: DocumentState): DocumentDraft | null {
  const current = state.current;
  if (current?.kind === 'text') return current;
  if (current?.kind !== 'photos' || !completeBatch(current)) return null;
  return { text: combinePages(current.pages), name: current.pages.length === 1 ? current.pages[0].name : 'Photographed agreement' };
}

export function canAnalyzeDocument(state: DocumentState): boolean {
  const batch = photoBatch(state);
  const draft = activeDraft(state);
  return Boolean(draft && draft.text.trim().length >= 80 &&
    !batch?.pages.some((page) => page.needsReview && !page.reviewed));
}

export function previewUrls(state: DocumentState): Set<string> {
  const urls = new Set<string>();
  for (const document of [state.current, state.previous]) {
    if (document?.kind !== 'photos') continue;
    for (const page of document.pages) if (page.preview) urls.add(page.preview.previewUrl);
  }
  return urls;
}

export function updateDocument(state: DocumentState, action: DocumentAction): DocumentState {
  const revision = state.revision + 1;
  const current = state.current;
  switch (action.type) {
    case 'select-file':
      return { revision, current: { kind: 'file', name: action.name, error: null }, previous: restorable(current) ?? state.previous };
    case 'finish-file':
    case 'fail-file': {
      if (current?.kind !== 'file' || current.error !== null || state.revision !== action.revision) return state;
      return action.type === 'finish-file'
        ? { ...state, current: { ...action.draft, kind: 'text' }, previous: null }
        : { ...state, current: { ...current, error: action.error } };
    }
    case 'replace':
      return { revision, current: action.draft && { ...action.draft, kind: 'text' }, previous: null };
    case 'restore':
      return state.previous ? { revision, current: state.previous, previous: null } : state;
    case 'edit':
      if (current && current.kind !== 'text') return state;
      return {
        revision, previous: null,
        current: { kind: 'text', name: 'Pasted or typed text', ...current, text: action.text, edited: true },
      };
    case 'photos':
      return {
        revision, current: action.batch,
        previous: completeBatch(action.batch) ? null : (action.savePrevious && restorable(current)) || state.previous,
      };
    case 'start-page':
    case 'update-page': {
      if (current?.kind !== 'photos') return state;
      const { job } = action;
      const index = current.pages.findIndex((page) => action.type === 'start-page'
        ? page.id === job.id && page.attempt === job.attempt && page.status === 'queued'
        : matchesPageJob(page, job));
      if (index < 0) return state;
      const change = action.type === 'start-page'
        ? { status: 'reading' as const, message: 'Preparing the photo…' } : action.update;
      const pages = current.pages.map((page, position) => position === index ? { ...page, ...change } : page);
      const batch = { ...current, pages };
      return { ...state, current: batch, previous: completeBatch(batch) ? null : state.previous };
    }
  }
}
