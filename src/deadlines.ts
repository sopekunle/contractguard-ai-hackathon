import { MAX_LOCAL_REVIEW_CHARS } from './document.ts';

const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.toLowerCase().split(' ');
const monthPattern = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const namedDatePattern = String.raw`(?:\d{1,2} (?:${monthPattern})|(?:${monthPattern}) \d{1,2}),? \d{4}`;
const datePattern = new RegExp(String.raw`\b(?:\d{4}-\d{2}-\d{2}|\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|${namedDatePattern})\b`, 'gi');
const relativePattern = /\b(?:within|at least|no later than|not less than|no fewer than)\s+(?:(?:\w+|\d+)[\s-]+){1,4}?(?:business\s+|calendar\s+)?(?:days?|weeks?|months?|years?)\b|\b(?:\d+|one|two|three|seven|fourteen|thirty|sixty|ninety)\s+(?:business\s+|calendar\s+)?(?:days?|weeks?|months?|years?)\s+(?:before|after|from|prior)\b/i;
const deadlineWording = /\b(?:due|deadline|by|before|on|until|within|payable|expires?|expiration|expiry|renew(?:s|al)?|notice|terminat\w*|cancel\w*|deliver(?:ed|y)?|installment|instalment)\b/i;
const consequencePattern = /\b(?:late (?:payment )?(?:fee|charge|interest)|penalt(?:y|ies)|forfeit\w*|interest (?:accrues|applies)|liquidated damages|additional (?:fee|charge|cost)|non-refundable)\b/i;
const categories = [
  ['Cancellation or renewal notice', /\b(?:cancel\w*|non[- ]?renew\w*|opt[- ]out|renew\w*[^.\n]{0,100}\bnotice)\b/i],
  ['Renewal', /\b(?:renews?|renewal|rollover|auto-renew\w*)\b/i],
  ['Contract expiry', /\b(?:expires?|expiration|expiry|end of (?:the )?term|term ends)\b/i],
  ['Termination or notice', /\b(?:terminat\w*|notice)\b/i],
  ['Deposit or installment', /\b(?:deposit|install?ments?)\b/i],
  ['Payment deadline', /\b(?:payment|invoice|payable|shall pay|must pay|balance|late charges?)\b/i],
  ['Deliverable deadline', /\b(?:deliver\w*|milestone)\b/i],
  ['Financial obligation', /\b(?:fee|charge|rent|refund|reimburse\w*|interest|penalt(?:y|ies))\b/i],
] as const;

export type Deadline = {
  id: number;
  event: string;
  date: string | null;
  quote: string;
  consequence: string | null;
  warning: string;
};

export function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1000 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

function parseStatedDate(text: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return isoDate(year, month, day);
  }
  const words = text.toLowerCase().replace(',', '').split(' ');
  if (words.length !== 3) return null;
  const monthFirst = /^\p{L}/u.test(words[0]);
  const name = words[monthFirst ? 0 : 1].slice(0, 3);
  return isoDate(Number(words[2]), months.indexOf(name) + 1, Number(words[monthFirst ? 1 : 0]));
}

export function scanReviewedDeadlines(reviewedText: string) {
  const text = reviewedText.slice(0, MAX_LOCAL_REVIEW_CHARS);
  return { deadlines: findDeadlines(text), scannedChars: text.length, limited: text.length < reviewedText.length };
}

export function findDeadlines(text: string): Deadline[] {
  const deadlines: Deadline[] = [];
  const firstDateByEvent = new Map<string, string>();
  const conflictingEvents = new Set<string>();
  // Split on paragraph/line boundaries and sentence punctuation followed by whitespace.
  // Keep punctuation and the original characters for direct comparison with the source.
  const clauses = text.match(/[^\r\n]+/g)?.flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z£$€₦0-9])/)) ?? [];
  for (const raw of clauses) {
    const quote = raw.trim();
    const event = categories.find(([, pattern]) => pattern.test(quote))?.[0];
    if (!event || !deadlineWording.test(quote)) continue;
    const dates = [...quote.matchAll(datePattern)].map(([wording]) => wording);
    const relative = relativePattern.test(quote);
    const attachedDate = dates.length === 1 && !relative && dateIntroducesDeadline(quote, dates[0]);
    const date = attachedDate ? parseStatedDate(dates[0]) : null;
    const warning = relative
      ? 'Relative deadline. Calculate and confirm the date using the trigger, business-day rules and notice terms.'
      : dates.length > 1 ? 'Multiple dates in this wording. Confirm which date applies.'
        : date ? 'Check the date against the original and confirm the time and time zone.'
          : dates.length ? 'Date format, validity, or relationship to this obligation needs manual confirmation.'
            : 'No complete calendar date identified here. Enter a date only after checking the agreement.';
    const consequence = quote.match(consequencePattern);
    if (date) {
      const firstDate = firstDateByEvent.get(event);
      if (!firstDate) firstDateByEvent.set(event, date);
      else if (firstDate !== date) conflictingEvents.add(event);
    }
    deadlines.push({ id: deadlines.length + 1, event, date, quote,
      consequence: consequence?.index === undefined ? null : quote.slice(consequence.index), warning });
  }
  return deadlines.map((deadline) => deadline.date && conflictingEvents.has(deadline.event)
    ? { ...deadline, date: null, warning: 'Other wording lists a different date for this type of deadline. Check whether these are separate obligations or conflicting terms.' }
    : deadline);
}

function dateIntroducesDeadline(quote: string, wording: string): boolean {
  const index = quote.indexOf(wording);
  const prefix = quote.slice(0, index);
  return /\b(?:due(?: on)?|payable|(?:payment|delivery|renewal|termination) date(?: is)?|deadline(?: is)?|expires?(?: on)?|ends? on|renews? on|by|before|until)\s*[: ]*$/i.test(prefix)
    || /\b(?:pay(?:able)?|paid|deliver(?:ed)?|cancel(?:led)?)\b[^.!?;]{0,50}\bon\s*$/i.test(prefix);
}
