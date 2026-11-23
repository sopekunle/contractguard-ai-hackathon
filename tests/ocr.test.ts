import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessOcr,
  describeOcrError,
  describeOcrStatus,
  fitDimensions,
  formatBytes,
  isOcrAssetError,
  LOW_CONFIDENCE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  normalizeOcrText,
  normalizeRotation,
  overallOcrProgress,
  rotatedDimensions,
  validateImageFile,
} from '../src/ocr.ts';

const photo = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'contract.jpg',
  type: 'image/jpeg',
  size: 2 * 1024 * 1024,
  ...overrides,
});

describe('photo validation', () => {
  it('accepts JPEG, PNG, and WebP photos', () => {
    assert.equal(validateImageFile(photo()), null);
    assert.equal(validateImageFile(photo({ name: 'page.png', type: 'image/png' })), null);
    assert.equal(validateImageFile(photo({ name: 'page.webp', type: 'image/webp' })), null);
  });

  it('falls back to the extension when a mobile browser reports no MIME type', () => {
    assert.equal(validateImageFile(photo({ name: 'IMG_0042.JPG', type: '' })), null);
    assert.equal(validateImageFile(photo({ name: 'scan.png', type: '' })), null);
  });

  it('rejects unsupported image and non-image formats', () => {
    assert.match(validateImageFile(photo({ name: 'anim.gif', type: 'image/gif' })) ?? '', /JPEG, PNG, or WebP/);
    assert.match(validateImageFile(photo({ name: 'vector.svg', type: 'image/svg+xml' })) ?? '', /JPEG, PNG, or WebP/);
    assert.match(validateImageFile(photo({ name: 'notes.pdf', type: 'application/pdf' })) ?? '', /JPEG, PNG, or WebP/);
  });

  it('explains the HEIC limitation instead of failing generically', () => {
    const problem = validateImageFile(photo({ name: 'IMG_0001.HEIC', type: 'image/heic' })) ?? '';
    assert.match(problem, /HEIC/);
    assert.match(problem, /Most Compatible/);
  });

  it('rejects empty and oversized files', () => {
    assert.match(validateImageFile(photo({ size: 0 })) ?? '', /empty/);
    assert.match(validateImageFile(photo({ size: MAX_IMAGE_BYTES + 1 })) ?? '', /15 MB/);
    assert.equal(validateImageFile(photo({ size: MAX_IMAGE_BYTES })), null);
  });
});

describe('image preparation math', () => {
  it('never upscales a small image', () => {
    assert.deepEqual(fitDimensions(800, 600), { width: 800, height: 600, scaled: false });
  });

  it('downscales the longest edge while preserving aspect ratio', () => {
    const fitted = fitDimensions(4000, 3000);
    assert.equal(fitted.width, MAX_IMAGE_EDGE);
    assert.equal(fitted.height, 1800);
    assert.equal(fitted.scaled, true);
  });

  it('handles portrait and invalid dimensions', () => {
    assert.deepEqual(fitDimensions(3000, 4000), { width: 1800, height: MAX_IMAGE_EDGE, scaled: true });
    assert.deepEqual(fitDimensions(0, 0), { width: 1, height: 1, scaled: false });
  });

  it('swaps dimensions for quarter turns only', () => {
    assert.deepEqual(rotatedDimensions(3000, 2000, 90), { width: 2000, height: 3000 });
    assert.deepEqual(rotatedDimensions(3000, 2000, 180), { width: 3000, height: 2000 });
    assert.deepEqual(rotatedDimensions(3000, 2000, 270), { width: 2000, height: 3000 });
  });

  it('normalizes rotation values, including negatives', () => {
    assert.equal(normalizeRotation(-90), 270);
    assert.equal(normalizeRotation(450), 90);
    assert.equal(normalizeRotation(Number.NaN), 0);
  });
});

describe('OCR text cleanup', () => {
  it('normalizes line endings, form feeds, padding, and excess blank lines', () => {
    const raw = '  PAYMENT TERMS  \r\n\r\n\r\nFee: $2,500\t\r\n\fLate charge: 5% per month\r\n\r\n';
    assert.equal(
      normalizeOcrText(raw),
      'PAYMENT TERMS\n\nFee: $2,500\nLate charge: 5% per month',
    );
  });

  it('preserves single blank lines and contract wording', () => {
    const text = 'Automatic Renewal\n\n12 months unless notice is given.';
    assert.equal(normalizeOcrText(text), text);
  });

  it('returns an empty string for empty OCR output', () => {
    assert.equal(normalizeOcrText(' \n\f\r\n '), '');
  });
});

describe('OCR quality and progress', () => {
  it('treats short output as empty regardless of confidence', () => {
    assert.equal(assessOcr(99, 0), 'empty');
    assert.equal(assessOcr(99, 19), 'empty');
  });

  it('flags low confidence but keeps readable text', () => {
    assert.equal(assessOcr(59, 500), 'low');
    assert.equal(assessOcr(60, 500), 'good');
    assert.equal(assessOcr(Number.NaN, 500), 'low');
  });

  // Real Phase 7 Chrome test reported 57% confidence on a photographed website.
  it('requires the review gate at the observed 57% confidence', () => {
    assert.equal(LOW_CONFIDENCE, 60);
    assert.equal(assessOcr(57, 500), 'low');
    assert.equal(assessOcr(59, 500), 'low');
    // Confidence is only an engine estimate; short output still wins as "empty".
    assert.equal(assessOcr(57, 10), 'empty');
  });

  it('maps Tesseract phases to a monotonic 0-100 progress bar', () => {
    const phases: [string, number][] = [
      ['loading tesseract core', 0],
      ['loading tesseract core', 1],
      ['initializing tesseract', 0],
      ['loading language traineddata', 1],
      ['initializing api', 1],
      ['recognizing text', 0],
      ['recognizing text', 0.5],
      ['recognizing text', 1],
    ];
    const values = phases.map(([status, progress]) => overallOcrProgress(status, progress));
    assert.deepEqual(values, [0, 12, 12, 30, 36, 36, 68, 100]);
    assert.ok(values.every((value) => value >= 0 && value <= 100));
  });

  it('describes known phases and falls back for unknown ones', () => {
    assert.match(describeOcrStatus('recognizing text'), /Reading the photo/);
    assert.match(describeOcrStatus('loading language traineddata'), /English text model/);
    assert.match(describeOcrStatus('something new'), /Preparing OCR/);
  });
});

describe('OCR errors and formatting', () => {
  it('recognizes missing local OCR assets and explains the fix', () => {
    const error = new Error('Failed to fetch worker.min.js');
    assert.equal(isOcrAssetError(error), true);
    assert.match(describeOcrError(error), /npm run prepare:ocr/);
    assert.match(describeOcrError(error), /not uploaded/);
  });

  it('does not mislabel an ordinary failure as a missing asset', () => {
    const error = new Error('Recognizer failed');
    assert.equal(isOcrAssetError(error), false);
    assert.match(describeOcrError(error), /OCR failed/);
  });

  it('distinguishes a failed lazy OCR chunk from missing engine assets', () => {
    const error = new Error('Failed to fetch dynamically imported module: /assets/index-abc.js');
    assert.match(describeOcrError(error), /OCR module could not be loaded/);
    assert.doesNotMatch(describeOcrError(error), /prepare:ocr/);
  });

  it('formats byte sizes for the photo metadata line', () => {
    assert.equal(formatBytes(0), '0 KB');
    assert.equal(formatBytes(1536), '2 KB');
    assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB');
    assert.equal(formatBytes(15 * 1024 * 1024), '15 MB');
  });
});
