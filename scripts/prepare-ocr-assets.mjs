// Copies the OCR runtime (worker, WebAssembly core, English model) into public/ocr so the
// app serves every OCR asset from its own origin. Nothing is fetched from a third-party CDN
// at runtime, and no user document is involved in this step.
//
// public/ocr is generated (see .gitignore) and is recreated by postinstall / predev / prebuild.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'ocr');

// The worker picks one LSTM core based on browser feature detection. Only these three
// variants are needed because the app requests OEM.LSTM_ONLY. Each .wasm.js embeds its
// WebAssembly binary, so the separate .wasm files are not copied.
const assets = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  // 4.0.0_best_int is the integer "best" model: materially better than the fast model on
  // small print, without the 11 MB size of the float best model.
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

let total = 0;
for (const [from, to] of assets) {
  const source = join(root, from);
  const destination = join(outDir, to);
  let info;
  try {
    info = await stat(source);
  } catch {
    throw new Error(
      `Missing OCR source asset: ${from}. Run "npm install" first. ` +
      'If tesseract.js changed its layout, update scripts/prepare-ocr-assets.mjs.',
    );
  }
  if (!info.isFile() || info.size === 0) throw new Error(`OCR source asset is empty: ${from}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  total += info.size;
}

const megabytes = (total / (1024 * 1024)).toFixed(1);
console.log(`OCR assets ready in public/ocr (${megabytes} MB, served from this app only).`);
