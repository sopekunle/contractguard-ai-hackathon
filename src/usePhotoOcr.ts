import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { photoBatch, type DocumentAction, type DocumentState } from './document';
import { matchesPageJob, type PageJob } from './photoPages';
import { assessOcr, describeOcrError, describeOcrStatus, overallOcrProgress, prepareImage, runOcr } from './ocr';

type RunningPage = PageJob & { cancel?: () => void };

export function usePhotoOcr(
  state: DocumentState,
  stateRef: RefObject<DocumentState>,
  changeDocument: (action: DocumentAction) => void,
) {
  const mounted = useRef(false);
  const running = useRef<RunningPage | null>(null);

  const pump = useCallback(function readNextPage() {
    if (!mounted.current) return;
    const pages = photoBatch(stateRef.current)?.pages ?? [];
    if (running.current) {
      const job = running.current;
      if (!pages.some((page) => matchesPageJob(page, job))) job.cancel?.();
      return;
    }
    const page = pages.find((candidate) => candidate.status === 'queued');
    if (!page?.file) return;
    const file = page.file;
    const job: RunningPage = { id: page.id, attempt: page.attempt };
    running.current = job;
    changeDocument({ type: 'start-page', job });

    const stillReading = () => mounted.current &&
      Boolean(photoBatch(stateRef.current)?.pages.some((candidate) => matchesPageJob(candidate, job)));
    const update = (update: Extract<DocumentAction, { type: 'update-page' }>['update']) => {
      if (stillReading()) changeDocument({ type: 'update-page', job, update });
    };
    void (async () => {
      try {
        const prepared = await prepareImage(file, page.rotation);
        if (!stillReading()) {
          URL.revokeObjectURL(prepared.previewUrl);
          return;
        }
        update({ preview: prepared, message: 'Starting OCR…' });
        const task = runOcr(prepared.blob, (event) => update({
          progress: overallOcrProgress(event.status, event.progress), message: describeOcrStatus(event.status),
        }));
        job.cancel = task.cancel;
        const result = await task.promise;
        const quality = assessOcr(result.confidence, result.text.length);
        update(quality === 'empty'
          ? { status: 'failed', progress: 0, message: 'No readable text. Retry with a sharper photo, or replace this page.' }
          : { status: 'ready', text: result.text, confidence: result.confidence, needsReview: quality === 'low', progress: 100, message: '' });
      } catch (error) {
        update({ status: 'failed', progress: 0, message: describeOcrError(error) });
      } finally {
        running.current = null;
        readNextPage();
      }
    })();
  }, [changeDocument, stateRef]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      running.current?.cancel?.();
    };
  }, []);

  useEffect(() => { pump(); }, [pump, state]);
}
