import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Camera, Image as ImageIcon, Plus, RotateCcw, RotateCw, X } from 'lucide-react';
import { formatBytes } from './ocr';
import { missingPage, PHOTO_LIMITS, type PhotoBatch, type PhotoPage } from './photoPages';

type Props = {
  batch: PhotoBatch;
  locked: boolean;
  onAdd: (camera: boolean) => void;
  onReplace: (id: number) => void;
  onMove: (id: number, offset: number) => void;
  onRemove: (id: number) => void;
  onRemovePreview: (id: number) => void;
  onRetry: (id: number, delta: number) => void;
  onCancel: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onReview: (id: number, reviewed: boolean) => void;
};

function PhotoViewer({ page, close }: { page: PhotoPage; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const blob = page.preview?.blob;
  useEffect(() => {
    if (!blob || !dialog.current || !image.current) return;
    const url = URL.createObjectURL(blob);
    image.current.src = url;
    if (!dialog.current.open) dialog.current.showModal();
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <dialog ref={dialog} className="page-photo-viewer" aria-label={`Photo of ${page.name}`} onClose={close}>
    <button type="button" className="secondary-button" onClick={close}><X size={14} aria-hidden="true"/> Close photo</button>
    <img ref={image} alt={`Full-size photo of ${page.name}`}/>
  </dialog>;
}

const statuses: Record<PhotoPage['status'], string> = {
  queued: 'Queued', reading: 'Reading', ready: 'Recognized', failed: 'Unreadable', cancelled: 'Cancelled',
};

export function PhotoPagesPanel({ batch, locked, onAdd, onReplace, onMove, onRemove, onRemovePreview,
  onRetry, onCancel, onEdit, onReview }: Props) {
  const { pages } = batch;
  const [viewing, setViewing] = useState<number | null>(null);
  const viewedPage = pages.find((page) => page.id === viewing && page.preview);
  const recognized = pages.filter((page) => !missingPage(page)).length;
  const processed = pages.filter((page) => page.status !== 'queued' && page.status !== 'reading').length;
  const progress = pages.length
    ? Math.round(pages.reduce((total, page) => total + (page.status === 'reading' || page.status === 'queued' ? page.progress : 100), 0) / pages.length)
    : 0;

  return <details className="page-manager" open>
    <summary>Document pages · {pages.length} {pages.length === 1 ? 'page' : 'pages'}</summary>
    <div className="page-manager-body">
      <div className="page-summary" aria-live="polite">{recognized} of {pages.length} pages recognized · {processed} processed</div>
      {processed < pages.length && <progress className="page-progress" aria-label="Overall OCR progress" value={progress} max={100}/>}
      <p className="page-guidance">Photos stay in this browser. OCR downloads its engine from this app and reads one page at a time. Confidence is an estimate. Check payment figures, dates, names, and clauses against the photos.</p>
      <ol className="page-list">
        {pages.map((page, index) => {
          const number = index + 1;
          const needsReview = page.needsReview && !page.reviewed;
          const inQueue = page.status === 'queued' || page.status === 'reading';
          return <li key={page.id} className="page-card" aria-label={`Page ${number}`}>
            <div className="page-row">
              {page.preview
                ? <button type="button" className="page-thumbnail" aria-label={`View photo for page ${number}`} onClick={() => setViewing(page.id)}>
                    <img src={page.preview.previewUrl} alt=""/>
                  </button>
                : <span className="page-thumbnail" aria-hidden="true"><ImageIcon size={20}/></span>}
              <div className="page-metadata">
                <div><strong>Page {number}</strong> <span className={needsReview || page.status === 'failed' || page.status === 'cancelled' ? 'page-status-warn' : ''}>{needsReview ? 'Needs review' : statuses[page.status]}{page.confidence !== null ? ` · ${page.confidence}% confidence` : ''}</span></div>
                <div className="page-filename">{page.name}{page.edited ? ' · Text corrected' : ''}</div>
                {page.message && <div className="page-message" role={page.status === 'failed' ? 'alert' : undefined}>{page.message}</div>}
                {page.status === 'reading' && <progress className="page-progress" aria-label={`OCR progress for page ${number}`} value={page.progress} max={100}/>}
              </div>
            </div>
            <div className="page-actions">
              <button type="button" className="icon-button" aria-label={`Move page ${number} up`} title="Move up" disabled={locked || index === 0} onClick={() => onMove(page.id, -1)}><ArrowUp size={14}/></button>
              <button type="button" className="icon-button" aria-label={`Move page ${number} down`} title="Move down" disabled={locked || index === pages.length - 1} onClick={() => onMove(page.id, 1)}><ArrowDown size={14}/></button>
              {page.file && <>
                <button type="button" className="icon-button" aria-label={`Rotate page ${number} left`} title="Rotate left and rescan" disabled={locked} onClick={() => onRetry(page.id, -90)}><RotateCcw size={14}/></button>
                <button type="button" className="icon-button" aria-label={`Rotate page ${number} right`} title="Rotate right and rescan" disabled={locked} onClick={() => onRetry(page.id, 90)}><RotateCw size={14}/></button>
              </>}
              <button type="button" className="link-button" aria-label={`Replace page ${number}`} disabled={locked} onClick={() => onReplace(page.id)}>Replace page</button>
              <button type="button" className="link-button" aria-label={`Remove page ${number}`} disabled={locked} onClick={() => onRemove(page.id)}>Remove page</button>
              {inQueue && <button type="button" className="link-button" aria-label={`Cancel OCR for page ${number}`} disabled={locked} onClick={() => onCancel(page.id)}>Cancel OCR</button>}
              {!inQueue && page.file && <button type="button" className="link-button" aria-label={`Retry OCR for page ${number}`} disabled={locked} onClick={() => onRetry(page.id, 0)}>{page.status === 'ready' ? 'Rescan' : 'Retry OCR'}</button>}
              {pages.length === 1 && page.status === 'ready' && page.preview &&
                <button type="button" className="link-button" disabled={locked} onClick={() => onRemovePreview(page.id)}>Remove photo preview</button>}
            </div>
            {page.status === 'ready' && <details className="page-text-review" open={needsReview || undefined}>
              <summary>Review page text</summary>
              <textarea aria-label={`Text for page ${number}`} value={page.text} readOnly={locked} spellCheck={false} onChange={(event) => onEdit(page.id, event.target.value)}/>
              {page.needsReview && <label className="ocr-review-check">
                <input type="checkbox" checked={page.reviewed} disabled={locked || !page.text.trim()} onChange={(event) => onReview(page.id, event.target.checked)}/>
                I reviewed and corrected page {number}
              </label>}
            </details>}
          </li>;
        })}
      </ol>
      <div className="page-actions">
        <button type="button" className="secondary-button" disabled={locked || pages.length >= PHOTO_LIMITS.pages} onClick={() => onAdd(false)}><Plus size={14}/> Add another page</button>
        <button type="button" className="secondary-button" disabled={locked || pages.length >= PHOTO_LIMITS.pages} onClick={() => onAdd(true)}><Camera size={14}/> Take another photo</button>
      </div>
      <p className="page-guidance">Up to {PHOTO_LIMITS.pages} pages and {formatBytes(PHOTO_LIMITS.bytes)} of photos per document.</p>
    </div>
    {viewedPage && <PhotoViewer page={viewedPage} close={() => setViewing(null)}/>}
  </details>;
}
