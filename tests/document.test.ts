import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeDraft, canAnalyzeDocument, initialDocument, photoBatch, previewUrls, updateDocument, type DocumentState } from '../src/document.ts';
import { combinePages, editPageText, movePhotoPage, newPhotoPage, pageCoverage, queuedAgain, removePhotoPage, splitCombinedPages, type PhotoBatch, type PhotoPage } from '../src/photoPages.ts';

const first = { name: 'Contract A.txt', text: 'Contract A terms. '.repeat(8) };
const second = { name: 'Contract B.txt', text: 'Contract B terms. '.repeat(8) };
const ready = updateDocument(initialDocument, { type: 'replace', draft: first });
const contents = ['First page sets out fees.', 'The second page lists renewal terms.', 'The last page specifies the notice period.'];

function page(id: number, error: string | null = null): PhotoPage {
  return newPhotoPage(id, new File(['fixture'], `Page ${id}.png`, { type: 'image/png' }), error);
}

function batch(pages: PhotoPage[], selectionError: string | null = null): PhotoBatch {
  return { kind: 'photos', pages, selectionError, omitted: [] };
}

function scan(state: DocumentState, id: number, text: string, confidence = 95): DocumentState {
  const job = photoBatch(state)?.pages.find((entry) => entry.id === id);
  assert.ok(job);
  const reading = updateDocument(state, { type: 'start-page', job });
  return updateDocument(reading, { type: 'update-page', job, update: {
    status: text ? 'ready' : 'failed', text, confidence, needsReview: confidence < 60,
  } });
}

function threePages(): DocumentState {
  return contents.reduce((state, text, index) => scan(state, index + 1, text),
    updateDocument(ready, { type: 'photos', batch: batch([page(1), page(2), page(3)]), savePrevious: true }));
}

describe('document selection and recovery', () => {
  for (const error of ['Image decode failed.', 'OCR was cancelled.', 'No readable text.', 'Unsupported photo.']) {
    it(`keeps the old draft inactive after ${error}`, () => {
      const scanned = updateDocument(ready, { type: 'photos', batch: batch([page(1, error)]), savePrevious: true });
      assert.equal(activeDraft(scanned), null);
      assert.equal(canAnalyzeDocument(scanned), false);
      assert.equal(photoBatch(scanned)?.pages[0].name, 'Page 1.png');
      assert.equal(updateDocument(scanned, { type: 'edit', text: second.text }), scanned);
      assert.deepEqual(activeDraft(updateDocument(scanned, { type: 'restore' }))?.text, first.text);
    });
  }

  it('discards out-of-order PDF completions and failures across input paths', () => {
    const readingFile = updateDocument(ready, { type: 'select-file', name: 'Slow.pdf' });
    const readingLatest = updateDocument(readingFile, { type: 'photos', batch: batch([page(1)]), savePrevious: true });
    assert.equal(updateDocument(readingLatest, { type: 'finish-file', revision: readingFile.revision, draft: first }), readingLatest);
    assert.equal(updateDocument(readingLatest, { type: 'fail-file', revision: readingFile.revision, error: 'Unreadable PDF.' }), readingLatest);
    const selected = updateDocument(readingLatest, { type: 'select-file', name: second.name });
    const replaced = updateDocument(selected, { type: 'finish-file', revision: selected.revision, draft: second });
    assert.equal(activeDraft(replaced)?.text, second.text);
  });

  it('starts a new pasted draft independently of a pending photo', () => {
    const readingPhoto = updateDocument(ready, { type: 'photos', batch: batch([page(1)]), savePrevious: true });
    const blank = updateDocument(readingPhoto, { type: 'replace', draft: null });
    const manual = updateDocument(blank, { type: 'edit', text: second.text });
    assert.equal(activeDraft(manual)?.name, 'Pasted or typed text');
    assert.equal(activeDraft(manual)?.text, second.text);
    assert.equal(updateDocument(manual, { type: 'update-page', job: page(1), update: { status: 'ready' } }), manual);
  });
});

describe('photographed agreement pages', () => {
  it('assembles three readable pages, then reorders and removes the middle page', () => {
    const complete = threePages();
    assert.equal(activeDraft(complete)?.text, contents.map((text, index) => `[Page ${index + 1}]\n${text}`).join('\n\n'));
    assert.equal(canAnalyzeDocument(complete), true);
    assert.equal(complete.previous, null);
    const [a, b, c] = photoBatch(complete)!.pages;
    const reordered = updateDocument(complete, { type: 'photos', batch: batch([c, b, a]) });
    const withoutMiddle = updateDocument(reordered, { type: 'photos', batch: batch([c, a]) });
    assert.equal(activeDraft(withoutMiddle)?.text, `[Page 1]\n${contents[2]}\n\n[Page 2]\n${contents[0]}`);
    assert.deepEqual(photoBatch(withoutMiddle)?.pages.map(({ id }) => id), [3, 1]);
  });

  it('keeps successful page text when page two fails and restores the earlier document on request', () => {
    const pending = updateDocument(ready, { type: 'photos', batch: batch([page(1), page(2), page(3)]), savePrevious: true });
    const partial = scan(scan(scan(pending, 1, contents[0]), 2, ''), 3, contents[2]);
    const pages = photoBatch(partial)!.pages;
    assert.equal(canAnalyzeDocument(partial), false);
    assert.equal(activeDraft(partial), null);
    assert.deepEqual(pages.map(({ text }) => text), [contents[0], '', contents[2]]);
    assert.match(combinePages(pages, true), /\[Page 2\]\n\[Unresolved page\]/);
    assert.equal(activeDraft(updateDocument(partial, { type: 'restore' }))?.text, first.text);
    const retry = updateDocument(partial, { type: 'photos', batch: batch([pages[0], queuedAgain(pages[1], 0, 99), pages[2]]) });
    assert.equal(canAnalyzeDocument(scan(retry, 2, contents[1])), true);
  });

  it('ignores cancelled jobs and old completions after reordering, replacing, and retrying', () => {
    const old = page(2);
    const pending = updateDocument(threePages(), { type: 'photos', savePrevious: true, batch: batch([page(1), old, page(3)]) });
    const reading = updateDocument(pending, { type: 'start-page', job: old });
    const [a, b, c] = photoBatch(reading)!.pages;
    const cancelled = updateDocument(reading, { type: 'photos', batch: batch([c, a, { ...b, status: 'cancelled' }]) });
    assert.equal(canAnalyzeDocument(cancelled), false);
    assert.equal(updateDocument(cancelled, { type: 'update-page', job: old, update: { status: 'ready', text: 'Old OCR' } }), cancelled);
    const replacement = { ...queuedAgain(b, 0, 100), name: 'Replacement page.png' };
    const replaced = updateDocument(cancelled, { type: 'photos', batch: batch([c, a, replacement]) });
    const current = updateDocument(replaced, { type: 'start-page', job: replacement });
    assert.equal(updateDocument(current, { type: 'update-page', job: old, update: { status: 'ready', text: 'Old OCR' } }), current);
    const done = updateDocument(current, { type: 'update-page', job: replacement, update: { status: 'ready', text: 'New OCR' } });
    assert.deepEqual(photoBatch(done)?.pages.map(({ id, text }) => [id, text]), [[3, ''], [1, ''], [2, 'New OCR']]);
  });

  it('gates low confidence per page, invalidates only edited confirmations, and restores reviewed text', () => {
    let state = updateDocument(ready, { type: 'photos', savePrevious: true, batch: batch([page(1), page(2), page(3)]) });
    state = scan(scan(scan(state, 1, contents[0], 52), 2, contents[1], 56), 3, contents[2]);
    assert.equal(canAnalyzeDocument(state), false);
    const reviewed = photoBatch(state)!.pages.map((entry) => ({ ...entry, reviewed: entry.needsReview }));
    state = updateDocument(state, { type: 'photos', batch: batch(reviewed) });
    assert.equal(canAnalyzeDocument(state), true);
    const corrected = [editPageText(reviewed[0], 'Corrected fee wording stays with its source page.'), ...reviewed.slice(1)];
    const edited = updateDocument(state, { type: 'photos', batch: batch(corrected) });
    assert.equal(canAnalyzeDocument(edited), false);
    assert.equal(photoBatch(edited)?.pages[0].edited, true);
    assert.equal(photoBatch(edited)?.pages[1].reviewed, true);
    const retry = updateDocument(edited, { type: 'photos', batch: batch([queuedAgain(corrected[0], 90, 99), ...corrected.slice(1)]), savePrevious: true });
    assert.equal(photoBatch(retry)?.pages[0].reviewed, false);
    const restored = updateDocument(retry, { type: 'restore' });
    assert.deepEqual(photoBatch(restored)?.pages, corrected);
    assert.equal(canAnalyzeDocument(restored), false);
  });

  it('round-trips combined edits while rejecting an edited page separator', () => {
    const pages = photoBatch(threePages())!.pages;
    const combined = combinePages(pages);
    assert.deepEqual(splitCombinedPages(combined, 3), contents);
    assert.equal(splitCombinedPages(combined.replace('[Page 2]', '[Page 7]'), 3), null);
    assert.equal(splitCombinedPages(combined.replace('\n\n[Page 2]', '\n[Page 2]'), 3), null);
    const edited = splitCombinedPages(combined.replace('fees', 'fees and deposits'), 3)!;
    assert.deepEqual(edited, [contents[0].replace('fees', 'fees and deposits'), ...contents.slice(1)]);
  });

  it('reports the partial page and omitted pages at the actual excerpt boundary', () => {
    const pages = photoBatch(threePages())!.pages;
    const text = combinePages(pages);
    const endOfSecondHeading = text.indexOf(contents[1]);
    assert.deepEqual(pageCoverage(pages, endOfSecondHeading + 2).map(({ status }) => status), ['full', 'partial', 'omitted']);
    assert.deepEqual(pageCoverage(pages, endOfSecondHeading).map(({ status }) => status), ['full', 'omitted', 'omitted']);
    assert.deepEqual(pageCoverage(pages, text.length).map(({ status }) => status), ['full', 'full', 'full']);
    assert.equal(pageCoverage([{ ...pages[0], text: '  One page.  ' }], 'One page.'.length)[0].status, 'full');
  });

  it('blocks rejected selections and retains only previews referenced by the current or saved document', () => {
    const [a, ...rest] = photoBatch(threePages())!.pages;
    const preview = { blob: new Blob(), previewUrl: 'blob:fixture', width: 1, height: 1, originalWidth: 1, originalHeight: 1, size: 1, scaled: false, rotation: 0 };
    const scanned = updateDocument(ready, { type: 'photos', batch: batch([{ ...a, preview }, ...rest]) });
    const rejected = updateDocument(scanned, { type: 'photos', batch: batch([], 'Page limit exceeded.'), savePrevious: true });
    assert.equal(canAnalyzeDocument(rejected), false);
    assert.deepEqual([...previewUrls(rejected)], ['blob:fixture']);
    const replaced = updateDocument(rejected, { type: 'replace', draft: second });
    assert.equal(previewUrls(replaced).size, 0);
  });

  it('keeps each corrected text with its own page through repeated reordering', () => {
    const complete = threePages();
    const [a, b, c] = photoBatch(complete)!.pages;
    const fixedA = 'Page one corrected: the fee is $1,200.';
    const fixedC = 'Page three corrected: notice is 60 days.';
    let state = updateDocument(complete, { type: 'photos', batch: batch([editPageText(a, fixedA), b, editPageText(c, fixedC)]) });
    state = updateDocument(state, { type: 'photos', batch: movePhotoPage(photoBatch(state)!, 1, 2)! });
    state = updateDocument(state, { type: 'photos', batch: movePhotoPage(photoBatch(state)!, 3, -1)! });
    const pages = photoBatch(state)!.pages;
    assert.deepEqual(pages.map(({ id, text, edited }) => [id, text, edited]), [
      [3, fixedC, true], [2, contents[1], false], [1, fixedA, true],
    ]);
    assert.equal(activeDraft(state)?.text, `[Page 1]\n${fixedC}\n\n[Page 2]\n${contents[1]}\n\n[Page 3]\n${fixedA}`);
    assert.equal(movePhotoPage(photoBatch(state)!, 3, -1), null);
    assert.equal(movePhotoPage(photoBatch(state)!, 1, 1), null);
    const texts = splitCombinedPages(activeDraft(state)!.text.replace('$1,200', '$1,250'), 3)!;
    const edited = pages.map((entry, index) => editPageText(entry, texts[index]));
    assert.deepEqual(edited.map(({ id, text }) => [id, text]), [[3, fixedC], [2, contents[1]], [1, fixedA.replace('$1,200', '$1,250')]]);
    assert.equal(edited[0], pages[0]);
    assert.equal(edited[1], pages[1]);
  });

  it('keeps the incomplete-agreement record after an unreadable page is removed', () => {
    const pending = updateDocument(ready, { type: 'photos', batch: batch([page(1), page(2), page(3)]), savePrevious: true });
    const scanned = scan(scan(scan(pending, 1, contents[0]), 2, ''), 3, contents[2]);
    assert.equal(canAnalyzeDocument(scanned), false);
    let state = updateDocument(scanned, { type: 'photos', batch: removePhotoPage(photoBatch(scanned)!, 2)! });
    assert.equal(canAnalyzeDocument(state), true);
    assert.deepEqual(photoBatch(state)?.omitted, ['page 2 (Page 2.png)']);
    assert.equal(activeDraft(state)?.text, `[Page 1]\n${contents[0]}\n\n[Page 2]\n${contents[2]}`);
    state = updateDocument(state, { type: 'photos', batch: movePhotoPage(photoBatch(state)!, 3, -1)! });
    const [first3, first1] = photoBatch(state)!.pages;
    state = updateDocument(state, { type: 'photos', batch: { ...photoBatch(state)!, pages: [first3, editPageText(first1, 'Corrected.')] } });
    assert.deepEqual(photoBatch(state)?.omitted, ['page 2 (Page 2.png)']);
    const readableRemoved = removePhotoPage(photoBatch(state)!, 3)!;
    assert.deepEqual(readableRemoved.omitted, ['page 2 (Page 2.png)']);
    assert.equal(removePhotoPage(photoBatch(state)!, 99), null);
  });
});
