import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calendarInstant, makeCalendarReminder } from '../src/calendar.ts';
import { findDeadlines, isoDate, scanReviewedDeadlines } from '../src/deadlines.ts';
import { activeDraft, initialDocument, MAX_LOCAL_REVIEW_CHARS, updateDocument } from '../src/document.ts';
import { newPhotoPage, type PhotoPage } from '../src/photoPages.ts';
import { policyAt, policyContent, policyPaths } from '../src/policies.ts';

describe('local contractual deadline matches', () => {
  it('checks reviewed text past 12,000 characters and keeps the exact wording', () => {
    const quote = 'The rent is payable by 2035-04-18; a late charge of 5% applies.';
    const reviewedText = 'The printed copy is for reference.\n'.repeat(425) + quote;
    assert.ok(reviewedText.indexOf(quote) > 12_000);
    assert.equal(findDeadlines(reviewedText.slice(0, 12_000)).length, 0);
    const scan = scanReviewedDeadlines(reviewedText);
    assert.equal(scan.scannedChars, reviewedText.length);
    assert.equal(scan.limited, false);
    assert.equal(scan.deadlines[0].quote, quote);
    assert.equal(scan.deadlines[0].date, '2035-04-18');
  });

  it('uses later corrected photo pages in the current agreement', () => {
    const quote = 'The final installment is due by 2035-06-26.';
    const photo = (id: number, text: string): PhotoPage => ({
      ...newPhotoPage(id, new File([''], `page-${id}.png`), null),
      status: 'ready', text, edited: true, reviewed: true,
    });
    const document = updateDocument(initialDocument, { type: 'photos', batch: {
      kind: 'photos',
      pages: [photo(1, 'The terms are listed in this agreement.\n'.repeat(350)), photo(2, 'The schedule follows.'), photo(3, quote)],
      selectionError: null, omitted: [],
    } });
    const draft = activeDraft(document);
    assert.ok(draft && draft.text.indexOf(quote) > 12_000);
    assert.ok(draft.text.includes(`[Page 3]\n${quote}`));
    assert.equal(scanReviewedDeadlines(draft.text).deadlines[0].quote, quote);
  });

  it('reports the independent local limit when input goes beyond it', () => {
    const scan = scanReviewedDeadlines('Filler.\n'.repeat(MAX_LOCAL_REVIEW_CHARS / 8) + 'Payment is due by 2035-01-08.');
    assert.equal(scan.limited, true);
    assert.equal(scan.scannedChars, MAX_LOCAL_REVIEW_CHARS);
    assert.equal(scan.deadlines.length, 0);
  });

  it('extracts explicit dates and exact supporting wording including a stated consequence', () => {
    const text = [
      'Payment is due by 15 January 2027; a late charge of 5% applies.',
      'The agreement renews on February 1, 2027.',
      'The deposit is due by 2027-03-05.',
      'Deliver the mockups by April 4, 2027.',
      'The term expires on 30 May 2027.',
    ].join('\r\n');
    const deadlines = findDeadlines(text);
    assert.deepEqual(deadlines.map((entry) => entry.date),
      ['2027-01-15', '2027-02-01', '2027-03-05', '2027-04-04', '2027-05-30']);
    assert.ok(deadlines.every((entry) => text.includes(entry.quote)));
    assert.equal(deadlines[0].consequence, 'late charge of 5% applies.');
    assert.equal(deadlines[1].consequence, null);
  });

  it('withholds invalid, ambiguous, unrelated, and missing dates', () => {
    const cases = [
      'Payment is due by 04/05/2027.',
      'Payment is due by 29 February 2027.',
      'Payment is due by January 2027.',
      'Payment is due by 2027-13-01.',
      'The payment invoice was issued on 1 March 2027.',
      'Payment is due by 2027-11-02 or 2027-11-03.',
      'Payment is due on delivery.',
    ];
    for (const text of cases) {
      const [entry] = findDeadlines(text);
      assert.ok(entry, text);
      assert.equal(entry.date, null, text);
    }
    assert.equal(isoDate(2028, 2, 29), '2028-02-29');
    assert.equal(isoDate(2027, 2, 29), null);
    assert.equal(findDeadlines('This agreement was signed on 2 June 2027.').length, 0);
  });

  it('requires review for relative notice and for competing dates', () => {
    const [notice] = findDeadlines('Written cancellation notice is required at least thirty days before renewal on December 1, 2027.');
    assert.equal(notice.date, null);
    assert.match(notice.warning, /Relative deadline/);
    const competing = findDeadlines('Payment is due by 2027-12-05. Payment is due by 2027-12-15.');
    assert.equal(competing.length, 2);
    assert.ok(competing.every((entry) => !entry.date && /different date/.test(entry.warning)));
  });
});

describe('calendar export', () => {
  it('converts local time in IANA zones to UTC and rejects DST gaps and folds', () => {
    assert.equal(calendarInstant('2027-04-01', '09:00', 'Africa/Lagos').toISOString(), '2027-04-01T08:00:00.000Z');
    assert.equal(calendarInstant('2027-04-01', '09:00', 'Asia/Kathmandu').toISOString(), '2027-04-01T03:15:00.000Z');
    assert.throws(() => calendarInstant('2027-03-14', '02:30', 'America/New_York'), /skipped or occurs twice/);
    assert.throws(() => calendarInstant('2027-11-07', '01:30', 'America/New_York'), /skipped or occurs twice/);
    assert.throws(() => calendarInstant('2027-02-29', '09:00', 'UTC'), /valid date/);
    assert.throws(() => calendarInstant('2027-04-01', '24:00', 'UTC'), /valid date and time/);
    assert.throws(() => calendarInstant('2027-04-01', '09:00', 'something else'), /time zone/);
  });

  it('generates a private generic UTC event with RFC 5545 display alarms', () => {
    const now = new Date('2027-04-01T00:00:00Z');
    const event = calendarInstant('2027-06-01', '09:00', 'Africa/Lagos');
    const ics = makeCalendarReminder(event, [1, 7, 30, 7], now);
    assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0/);
    assert.match(ics, /\r\nUID:[a-f0-9]{32}@contractguard-local\r\n/);
    assert.match(ics, /\r\nDTSTAMP:20270401T000000Z\r\nDTSTART:20270601T080000Z\r\n/);
    assert.match(ics, /\r\nSUMMARY:Contract deadline\r\nCLASS:PRIVATE\r\n/);
    assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 3);
    for (const day of [30, 7, 1]) assert.match(ics, new RegExp('TRIGGER:-P' + day + 'D\\r\\n'));
    assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.doesNotMatch(makeCalendarReminder(event, [], now), /BEGIN:VALARM|DESCRIPTION:/);
    assert.throws(() => makeCalendarReminder(now, [], now), /future deadline/);
    assert.throws(() => makeCalendarReminder(new Date('2027-04-03T00:00:00Z'), [7], now), /past/);
    assert.throws(() => makeCalendarReminder(event, [5], now), /supported/);
  });
});

describe('legal policy routes', () => {
  it('resolves each distinct direct link with a draft and owner action', () => {
    assert.equal(new Set(Object.values(policyPaths).map(({ href }) => href)).size, 3);
    for (const [key, { href }] of Object.entries(policyPaths)) {
      const policy = policyAt(href);
      assert.equal(policy, key);
      assert.ok(policy && policyContent[policy].sections.some(({ text }) => text.some((item) => item.includes('OWNER ACTION REQUIRED'))));
    }
    for (const hash of ['', '#contract-analyzer', '#clause-library', '#privacy-extra']) assert.equal(policyAt(hash), undefined);
  });
});
