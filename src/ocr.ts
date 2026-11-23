// Local, privacy-first OCR for photographed contracts.
//
// Everything in this module runs in the browser. The photo is decoded, rotated and
// downscaled on a canvas, then read by a Tesseract WebAssembly worker that is downloaded
// from this app's own origin. No image, canvas, or OCR text is sent to Firebase, Gemini,
// or any OCR service. Tesseract.js is imported lazily so normal PDF/TXT use never pays for
// the OCR bundle or its runtime assets.

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 50_000_000;
export const MAX_IMAGE_EDGE = 2400;
export const MIN_OCR_CHARS = 20;
export const LOW_CONFIDENCE = 60;

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

export type ImageFileInfo = { name: string; type: string; size: number };
export type OcrQuality = 'empty' | 'low' | 'good';
export type OcrProgressEvent = { status: string; progress: number };
export type OcrResult = { text: string; confidence: number; rotateRadians: number | null };
export type OcrTask = { promise: Promise<OcrResult>; cancel: () => void };

export type PreparedImage = {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  size: number;
  scaled: boolean;
  rotation: number;
};

export class OcrCancelledError extends Error {
  constructor() {
    super('OCR cancelled');
    this.name = 'OcrCancelledError';
  }
}

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// Returns a user-facing problem, or null when the file is acceptable. MIME checks are
// backed up by extension checks because some mobile browsers report an empty type.
export function validateImageFile(file: ImageFileInfo): string | null {
  const extension = extensionOf(file.name);
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/heic') || mime.startsWith('image/heif') || HEIC_EXTENSIONS.has(extension)) {
    return 'HEIC / HEIF photos are not readable in most browsers. On iPhone, choose Settings → Camera → Formats → Most Compatible (JPEG), or share the photo as JPEG, then try again.';
  }
  if (!ACCEPTED_MIME.has(mime) && !ACCEPTED_EXTENSIONS.has(extension)) {
    return 'Please choose a JPEG, PNG, or WebP photo. Other image formats are not supported.';
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return 'That image file is empty or unreadable.';
  if (file.size > MAX_IMAGE_BYTES) {
    return `That photo is ${formatBytes(file.size)}. Please use a photo under ${formatBytes(MAX_IMAGE_BYTES)}.`;
  }
  return null;
}

export function normalizeRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

export function rotatedDimensions(width: number, height: number, rotation: number) {
  return normalizeRotation(rotation) % 180 === 0 ? { width, height } : { width: height, height: width };
}

// Aspect-preserving downscale. Small images are never upscaled: Tesseract gains nothing
// from interpolation and the extra pixels only cost time.
export function fitDimensions(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { width: 1, height: 1, scaled: false };
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height), scaled: false };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

// Tesseract inserts form feeds between pages and may pad lines with spaces. Line breaks are
// preserved because contract structure matters; only runs of 3+ newlines are collapsed.
export function normalizeOcrText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // A form feed marks a page boundary; fold it (and adjacent newlines) into one break.
    .replace(/\n*\f\n*/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function assessOcr(confidence: number, textLength: number): OcrQuality {
  if (!Number.isFinite(textLength) || textLength < MIN_OCR_CHARS) return 'empty';
  if (!Number.isFinite(confidence) || confidence < LOW_CONFIDENCE) return 'low';
  return 'good';
}

// Progress bands keep the bar monotonic while Tesseract moves through separate phases that
// each report 0..1 on their own.
const STATUS_BANDS: Record<string, [number, number]> = {
  'loading tesseract core': [0, 12],
  'initializing tesseract': [12, 18],
  'loading language traineddata': [18, 30],
  'initializing api': [30, 36],
  'recognizing text': [36, 100],
};

export function describeOcrStatus(status: string): string {
  switch (status) {
    case 'loading tesseract core': return 'Downloading the OCR engine (one-time, from this app)…';
    case 'initializing tesseract': return 'Starting the OCR engine…';
    case 'loading language traineddata': return 'Downloading the English text model (one-time)…';
    case 'initializing api': return 'Preparing text recognition…';
    case 'recognizing text': return 'Reading the photo on this device…';
    default: return 'Preparing OCR…';
  }
}

export function overallOcrProgress(status: string, progress: number): number {
  const band = STATUS_BANDS[status];
  const fraction = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  if (!band) return Math.round(fraction * 5);
  return Math.min(100, Math.max(0, Math.round(band[0] + (band[1] - band[0]) * fraction)));
}

export function isOcrAssetError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|importscripts|failed to load tesseractcore|worker\.min\.js|traineddata|\b404\b/i.test(message);
}

export function describeOcrError(err: unknown): string {
  if (err instanceof OcrCancelledError) return 'OCR cancelled.';
  const message = err instanceof Error ? err.message : String(err);
  if (/dynamically imported module|importing a module script failed/i.test(message)) {
    return 'The OCR module could not be loaded. Reload the page and try again; normal PDF / TXT analysis is unaffected.';
  }
  if (isOcrAssetError(err)) {
    return 'The OCR engine files could not be loaded. They are served from this app, so run "npm run prepare:ocr", restart the dev server, and reload. Your photo was not uploaded.';
  }
  if (/decode|could not be opened|unsupported image|corrupt/i.test(message)) {
    return 'This image could not be opened. It may be corrupt or in a format this browser cannot decode. Try a JPEG or PNG photo.';
  }
  return `OCR failed${message ? `: ${message}` : ''}. Try a clearer photo, or reload and retry.`;
}

function ocrAssetBase(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}ocr/`;
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies EXIF orientation, so phone photos taken sideways are upright
      // before OCR. Browsers that do not support the option still decode the image.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to <img>, which applies EXIF orientation in current browsers.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The image could not be decoded.'));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

// The thumbnail uses the same orientation as the full-size JPEG sent to OCR.
export async function prepareImage(file: File, rotation = 0): Promise<PreparedImage> {
  const decoded = await decodeImage(file);
  const canvas = document.createElement('canvas');
  const thumbnail = document.createElement('canvas');
  try {
    if (decoded.width * decoded.height > MAX_IMAGE_PIXELS) {
      throw new Error(
        `This image is very large (${decoded.width} × ${decoded.height}). Please use a photo under ${Math.round(MAX_IMAGE_PIXELS / 1_000_000)} megapixels.`,
      );
    }
    const normalized = normalizeRotation(rotation);
    const rotated = rotatedDimensions(decoded.width, decoded.height, normalized);
    const fitted = fitDimensions(rotated.width, rotated.height);
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare images for OCR.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = fitted.width / rotated.width;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((normalized * Math.PI) / 180);
    context.drawImage(
      decoded.source,
      -(decoded.width * scale) / 2,
      -(decoded.height * scale) / 2,
      decoded.width * scale,
      decoded.height * scale,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('The image could not be prepared for OCR.'))),
        'image/jpeg',
        0.92,
      );
    });
    const thumbnailSize = fitDimensions(fitted.width, fitted.height, 240);
    thumbnail.width = thumbnailSize.width;
    thumbnail.height = thumbnailSize.height;
    const thumbnailContext = thumbnail.getContext('2d');
    if (!thumbnailContext) throw new Error('This browser cannot create a photo thumbnail.');
    thumbnailContext.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
    const thumb = await new Promise<Blob>((resolve, reject) => {
      thumbnail.toBlob(
        (value) => value ? resolve(value) : reject(new Error('The photo thumbnail could not be created.')),
        'image/jpeg', 0.8,
      );
    });

    return {
      blob,
      previewUrl: URL.createObjectURL(thumb),
      width: canvas.width,
      height: canvas.height,
      originalWidth: decoded.width,
      originalHeight: decoded.height,
      size: file.size,
      scaled: fitted.scaled,
      rotation: normalized,
    };
  } finally {
    decoded.close();
    canvas.width = canvas.height = thumbnail.width = thumbnail.height = 0;
  }
}

type OcrWorker = {
  recognize: (
    image: Blob,
    options?: { rotateAuto?: boolean },
  ) => Promise<{ data: { text: string; confidence: number; rotateRadians: number | null } }>;
  terminate: () => Promise<unknown>;
};

// Creates one short-lived worker per run. Cancelling terminates it immediately, and the
// finally block guarantees termination on success and failure alike.
export function runOcr(image: Blob, onProgress: (event: OcrProgressEvent) => void): OcrTask {
  let cancelled = false;
  let worker: OcrWorker | null = null;
  let terminating: Promise<unknown> | null = null;
  let rejectRecognition: ((reason: OcrCancelledError) => void) | undefined;

  const terminate = (): Promise<unknown> => {
    if (!worker) return Promise.resolve();
    if (!terminating) terminating = worker.terminate().catch(() => undefined);
    return terminating;
  };

  const promise = (async () => {
    const tesseract = await import('tesseract.js');
    if (cancelled) throw new OcrCancelledError();
    const base = ocrAssetBase();
    const created = await tesseract.createWorker('eng', tesseract.OEM.LSTM_ONLY, {
      workerBlobURL: false,
      workerPath: `${base}worker.min.js`,
      corePath: `${base}core`,
      langPath: `${base}lang`,
      logger: (message) => {
        if (!cancelled) onProgress({ status: message.status, progress: message.progress });
      },
    });
    worker = created as unknown as OcrWorker;
    if (cancelled) {
      await terminate();
      throw new OcrCancelledError();
    }
    // rotateAuto corrects small skew from a hand-held photo. 90° turns are handled by the
    // rotation controls because Tesseract's auto-rotate only detects slight page skew.
    const cancellation = new Promise<never>((_, reject) => { rejectRecognition = reject; });
    const result = await Promise.race([worker.recognize(image, { rotateAuto: true }), cancellation]);
    return {
      text: normalizeOcrText(result.data.text),
      confidence: Math.round(Number(result.data.confidence) || 0),
      rotateRadians: result.data.rotateRadians ?? null,
    };
  })().finally(async () => {
    rejectRecognition = undefined;
    await terminate();
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      rejectRecognition?.(new OcrCancelledError());
      void terminate();
    },
  };
}
