export type SignalKind = 'amount' | 'percentage' | 'date' | 'term';

export type ContractSignal = {
  kind: SignalKind;
  quote: string;
  index: number;
};

// Mechanical detection only. These patterns surface candidate text for the model
// to verify; they are never treated as legal conclusions on their own.
const MONEY = /(?:[$€£¥]\s?\d+(?:,\d{3})*(?:\.\d{1,2})?|\b\d+(?:,\d{3})*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|CHF|CAD|AUD|dollars?|euros?|pounds?)\b)/gi;
const PERCENT = /\b\d{1,3}(?:\.\d+)?\s?%/g;
const DATE = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:within|after|before|by)\s+\d{1,3}\s+(?:calendar\s+)?days?\b|\b\d{1,3}\s+(?:calendar\s+)?days?\s+(?:before|after|prior to)\b|\bnet\s+\d{1,3}\b/gi;
const TERM = /\b(?:auto(?:matic(?:ally)?)?[-\s]?renew(?:al|s|ed|ing)?|renew(?:al|s|ed|ing)?|terminat(?:e|es|ed|ion|ing)|early termination|late (?:fee|fees|payment|payments|charge|charges)|penalt(?:y|ies)|interest|deposit|refund|cancel(?:lation|llations)?|notice period)\b/gi;

const PRIORITY: Record<SignalKind, number> = { amount: 0, percentage: 0, date: 1, term: 2 };
const LABELS: Record<SignalKind, string> = { amount: 'amount', percentage: 'percentage', date: 'date', term: 'term' };

function contextAround(text: string, index: number, length: number): string {
  const windowStart = Math.max(0, index - 150);
  const windowEnd = Math.min(text.length, index + length + 150);
  const before = text.slice(windowStart, index);
  const after = text.slice(index + length, windowEnd);

  let start = windowStart;
  const previousBreak = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; '), before.lastIndexOf('\n'));
  if (previousBreak >= 0) start = windowStart + previousBreak + 1;

  let end = windowEnd;
  const nextBreak = after.search(/[.;\n]/);
  if (nextBreak >= 0) end = index + length + nextBreak + 1;

  let quote = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (quote.length > 260) quote = quote.slice(0, 260).trim();
  return quote;
}

export function extractSignals(text: string): ContractSignal[] {
  if (!text) return [];
  const found: ContractSignal[] = [];
  const collect = (kind: SignalKind, pattern: RegExp) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) { pattern.lastIndex += 1; continue; }
      const quote = contextAround(text, match.index, match[0].length);
      if (quote.length >= 30) found.push({ kind, quote, index: match.index });
      if (found.length > 200) break;
    }
  };

  collect('amount', MONEY);
  collect('percentage', PERCENT);
  collect('term', TERM);
  collect('date', DATE);

  const seen = new Set<string>();
  const unique = found.filter((signal) => {
    const key = signal.quote.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.index - b.index)
    .slice(0, 10)
    .sort((a, b) => a.index - b.index);
}

export type FinancialFact = {
  kind: SignalKind;
  value: string;
  context: string;
  index: number;
};

// Exact text matches only. `value` is the literal substring from the source, never a
// normalized, converted, or inferred figure. No legal meaning is assigned here.
export function extractFinancialFacts(text: string): FinancialFact[] {
  if (!text) return [];
  const found: FinancialFact[] = [];
  const collect = (kind: SignalKind, pattern: RegExp) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) { pattern.lastIndex += 1; continue; }
      found.push({
        kind,
        value: match[0],
        context: contextAround(text, match.index, match[0].length),
        index: match.index,
      });
      if (found.length > 120) break;
    }
  };
  collect('amount', MONEY);
  collect('percentage', PERCENT);
  collect('term', TERM);
  collect('date', DATE);

  const seen = new Set<string>();
  const selected: FinancialFact[] = [];
  for (const fact of [...found].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.index - b.index)) {
    const key = `${fact.kind}|${fact.value.toLowerCase()}|${fact.context.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(fact);
    if (selected.length === 16) break;
  }
  return selected.sort((a, b) => a.index - b.index);
}

function countMeaningful(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) { pattern.lastIndex += 1; continue; }
    if (contextAround(text, match.index, match[0].length).length >= 30) count += 1;
  }
  return count;
}

export function signalSummary(text: string): string {
  const counts: Record<SignalKind, number> = {
    amount: countMeaningful(text, MONEY),
    percentage: countMeaningful(text, PERCENT),
    date: countMeaningful(text, DATE),
    term: countMeaningful(text, TERM),
  };
  return (Object.keys(counts) as SignalKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${LABELS[kind]}${counts[kind] === 1 ? '' : 's'}`)
    .join(', ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeQuote(value: string): string {
  return normalizeWhitespace(value).replace(/\*\*/g, '').replace(/`/g, '');
}

function quotationOccurrences(output: string) {
  return Array.from(output.matchAll(/["“]([^"”\n]{3,300})["”]/g), (match) => {
    const normalized = normalizeQuote(match[1]);
    return {
      text: match[1],
      normalized,
      end: match.index + match[0].length,
      abbreviated: /…|\.\.\./.test(normalized),
    };
  }).filter((quote) => quote.normalized);
}

function quotedValues(output: string): { quotes: string[]; skippedEllipsis: number } {
  const quotes: string[] = [];
  let skippedEllipsis = 0;
  for (const quote of quotationOccurrences(output)) {
    if (quote.abbreviated) { skippedEllipsis += 1; continue; }
    quotes.push(quote.normalized);
  }
  return { quotes, skippedEllipsis };
}

export function quoteMatchesSource(quote: string, source: string): boolean {
  return normalizeWhitespace(source).includes(normalizeQuote(quote));
}

export type QuoteVerification = {
  total: number;
  verified: number;
  unverified: string[];
  suspectedPunctuationOnly: string[];
  skippedEllipsis: number;
};

function stripPunctuation(value: string): string {
  return normalizeWhitespace(value).replace(/[.,;:!?()[\]{}'’“”"\-–—]/g, '').toLowerCase();
}

export function verifyQuotes(output: string, source: string): QuoteVerification {
  const normalizedSource = normalizeWhitespace(source);
  const sourceWithoutPunctuation = stripPunctuation(source);
  const unverified: string[] = [];
  const suspectedPunctuationOnly: string[] = [];
  const { quotes, skippedEllipsis } = quotedValues(output);
  let total = 0;

  for (const quote of quotes) {
    total += 1;
    if (normalizedSource.includes(quote)) continue;
    unverified.push(quote);
    // Diagnostic only: never treat this as verified. It helps distinguish a model-added
    // or changed punctuation mark from a fabricated clause or amount.
    if (sourceWithoutPunctuation.includes(stripPunctuation(quote))) {
      suspectedPunctuationOnly.push(quote);
    }
  }

  return { total, verified: total - unverified.length, unverified, suspectedPunctuationOnly, skippedEllipsis };
}

export type RiskLevel = 'High' | 'Medium' | 'Low';

export type ParsedRiskClaim = {
  raw: string;
  level: RiskLevel | null;
  quote: string | null;
  quoteVerified: boolean;
  interpretationVerified: false;
};

export type RiskFindingVerification = {
  parsedClaims: number;
  claimsWithQuote: number;
  claimsWithVerifiedQuote: number;
  claimsWithoutQuote: number;
  claimsWithUnverifiedQuote: number;
  /** A supported risk heading was present, even if no claim matched a known format. */
  riskSectionFound: boolean;
  /** The model explicitly said no contractual risks could be identified. */
  noRisksStated: boolean;
  hasRiskContradiction: boolean;
  /** Quotations in the response that are not attached to a parsed risk claim. */
  otherQuotesTotal: number;
  otherQuotesVerified: number;
  otherQuotesUnverified: number;
  quotationsToReview: { text: string; line: number; claimNumber: number | null; abbreviated: boolean }[];
  claims: ParsedRiskClaim[];
};

// Real on-device output varies: "## TOP 3 RISKS", "**TOP 3 RISKS (AI interpretation):**",
// "RISK ASSESSMENT", plain "RISKS". Normalizing markdown decoration and trailing
// qualifiers keeps a heading variation from silently disabling per-claim checks.
const RISK_SECTION_PHRASES = new Set([
  'PRIORITY RISKS', 'TOP 3 RISKS', 'TOP THREE RISKS', 'TOP RISKS', 'RISKS',
  'RISKS TO REVIEW', 'RISK ASSESSMENT', 'RISKS ASSESSED', 'KEY RISKS',
  'POTENTIAL RISKS', 'RISKS IDENTIFIED', 'RISK CLAIMS', 'CLAUSES TO REVIEW',
]);
const DETAILED_NON_RISK_HEADINGS = new Set(['OVERVIEW', 'KEY FINANCIAL OBLIGATIONS', 'BEFORE SIGNING', 'LIMITATIONS']);

function normalizeHeading(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[*_]+/, '')
    .replace(/[:：]\s*$/, '')
    .replace(/[*_]+$/, '')
    .replace(/[:：]\s*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toUpperCase();
}

function looksLikeHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line) ||
    /^\*\*[^*]+\*\*:?$/.test(line) ||
    /^[A-Z][A-Z0-9 /&,'\-]{3,70}:?$/.test(line.trim());
}

// A recognized claim starts with its risk level. Requiring the level at the start (rather
// than anywhere in the line) keeps prose such as "the High Court said ..." from being
// counted, and keeps a bare mention of High/Medium/Low from ever being treated as evidence.
// Optional prefixes cover "Risk level:", "Risk 1:", and "Severity:" variants.
const RISK_LEVEL_PREFIX =
  /^(?:\*\*|__|\*|_)?(?:(?:risk\s*\d*\s*(?:level)?|severity|level)(?:\*\*|__|\*|_)?\s*[:\-–—]\s*)?(?:\*\*|__|\*|_)?\s*(high|medium|low)(?:\*\*|__|\*|_)?(?:\s+risk\b)?(?:\s*\([^)]*\))?(?:\s*[:\-–—|,]\s*|(\s+)(?=["“])|\s*$)/i;

const QUESTION_LINE = /^(?:ask|question|q)\s*[:\-–—]/i;
const DISCLAIMER_LINE = /^(?:disclaimer|note|informational summary only|not legal advice)\b/i;
const NO_RISKS_LINE = /^(?:no\b|none\b|not applicable\b|not identified\b|n\/a\b|not an agreement\b|(?:the )?(?:submitted )?(?:text|material|content|excerpt|document)\b[^.\n]{0,90}\bnot (?:appear to be )?an agreement\b)/i;
const EXPLICIT_RISK_DENIAL = /^(?:(?:summary|overview)\s*:\s*)?(?:there (?:are|were) )?no (?:supported )?(contract(?:ual)? )?risks?(?: (?:exist|(?:were |are |could be |can be )?(?:identified|found)))?(?: (?:from|in) (?:this|the) (?:submitted )?(?:material|excerpt|agreement|contract|document|text))?[.!]?$/i;
const BULLET = /^(?:[-+*•–—]|\d+[.)])\s+(.+)$/;
const EVIDENCE_LABEL = /^(?:\*\*|__)?(?:quote|exact quote|literal (?:quote|quotation)|evidence|contract wording|what (?:the contract (?:literally )?says|it literally says))(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(["“])?/i;
const DETAILED_COMMENT_LABEL = /^(?:\*\*|__)?(?:why you should pay attention|question to ask before signing)(?:\*\*|__)?\s*:/i;

function explicitlyDeniesRisks(content: string, inRiskSection: boolean): boolean {
  // Quoted examples and generic placeholders such as "Not identified" should
  // never contradict a parsed finding. An unqualified "No risks" needs a risk heading.
  const prose = content
    .replace(/^#{1,6}\s+/, '')
    .replace(/["“][^"”]*["”]|`[^`]+`/g, '…')
    .replace(/\*\*|__/g, '');
  if (QUESTION_LINE.test(prose)) return false;
  return prose.split(/(?<=[.!?])\s+/).some((sentence) => {
    const denial = sentence.trim().match(EXPLICIT_RISK_DENIAL);
    return Boolean(denial && (denial[1] || inRiskSection));
  });
}

// Best-effort local parsing of the risk formats requested by the app's prompts.
// Bulleted and clearly structured unbulleted claims are both accepted; anything else is
// left unconfirmed rather than guessed. No claim is ever invented.
export function verifyRiskFindings(output: string, source: string): RiskFindingVerification {
  const pendingClaims: { raw: string; level: RiskLevel | null; indent: number; number: number }[] = [];
  type Quotation = ReturnType<typeof quotationOccurrences>[number] & {
    line: number;
    claimNumber: number | null;
    matched: boolean;
  };
  const occurrences: Quotation[] = [];
  const normalizedSource = normalizeWhitespace(source);
  let activeClaim: typeof pendingClaims[number] | undefined;
  let inRiskSection = false;
  let riskSectionFound = false;
  let noRisksStated = false;
  let explicitRiskDenial = false;

  for (const [index, rawLine] of output.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const bullet = line.match(BULLET);
    const content = (bullet ? bullet[1] : line).trim();
    const quotes = quotationOccurrences(content).map((quote): Quotation => ({
      ...quote,
      line: index + 1,
      claimNumber: null,
      matched: !quote.abbreviated && normalizedSource.includes(quote.normalized),
    }));
    occurrences.push(...quotes);

    const lineDeniesRisks = explicitlyDeniesRisks(content, inRiskSection);
    if (lineDeniesRisks) explicitRiskDenial = true;

    const indent = rawLine.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0;
    const isIndentedDetail = activeClaim !== undefined && indent > activeClaim.indent;
    const heading = normalizeHeading(line);
    if (RISK_SECTION_PHRASES.has(heading)) {
      activeClaim = undefined;
      inRiskSection = true;
      riskSectionFound = true;
      continue;
    }
    const startsAnotherSection = DETAILED_NON_RISK_HEADINGS.has(heading) ||
      (looksLikeHeading(line) && (!isIndentedDetail || /^#{1,6}\s+/.test(line)));
    if (!lineDeniesRisks && startsAnotherSection) {
      activeClaim = undefined;
      inRiskSection = false;
      continue;
    }

    const evidenceField = content.match(EVIDENCE_LABEL);
    const isSiblingEvidence = Boolean(activeClaim?.level && bullet && indent === activeClaim.indent && evidenceField);
    if (inRiskSection && activeClaim && (isIndentedDetail || isSiblingEvidence)) {
      // An explicit evidence field can follow a risk as an indented detail or
      // an adjacent sibling bullet. Only the text in that field supplies evidence.
      if (evidenceField?.[1]) {
        for (const quote of quotes) quote.claimNumber = activeClaim.number;
      }
      continue;
    }
    activeClaim = undefined;
    // Headings, disclaimers and questions are never evidence, with or without a quote.
    if (evidenceField || DETAILED_COMMENT_LABEL.test(content) || QUESTION_LINE.test(content) || DISCLAIMER_LINE.test(content)) continue;

    const levelMatch = content.match(RISK_LEVEL_PREFIX);
    const quote = quotes[0];
    const directQuote = Boolean(levelMatch?.[2]);
    const hasExplanation = quote && /^\s*(?:[:\-–—|])\s*\S/.test(content.slice(quote.end));
    const endsWithQuestion = /\?\s*["”']?\s*$/.test(content);
    // A structured claim has a leading level, an exact quote, and at least one separator
    // between them. Quick Scan lines add an "Ask:" segment; that trailing question is part
    // of the template and must NOT disqualify an otherwise structured claim.
    const separatorCount = (content.match(/\s[:\-–—|]\s/g) ?? []).length;
    const askMarker = /(?:^|\s)Ask\s*:/i.test(content);

    // "Not identified." belongs to the financial section; only count an explicit
    // no-risk / not-an-agreement statement when it is in the risk section or names risks.
    const noRiskWording = /\b(?:risks?|agreement|clauses?|contractual)\b/i.test(content);
    if (NO_RISKS_LINE.test(content) && !levelMatch && !quote && (inRiskSection || noRiskWording)) {
      noRisksStated = true;
      continue;
    }

    let accept = false;
    if (directQuote) {
      accept = inRiskSection && Boolean(hasExplanation);
    } else if (bullet) {
      // Bullets are trusted only inside a recognized risk section, so ordinary prose
      // bullets elsewhere in the response never become invented claims.
      accept = inRiskSection && (Boolean(levelMatch) || Boolean(quote)) &&
        !(endsWithQuestion && !levelMatch);
    } else if (inRiskSection) {
      accept = Boolean(levelMatch && quote && separatorCount >= 1);
    } else {
      // Outside a risk section, only an unmistakable self-identifying line qualifies:
      // leading level + exact quote + a full "level - quote - why" structure. Ordinary
      // prose, headings, and single-clause fragments are left unconfirmed.
      accept = Boolean(levelMatch && quote && (separatorCount >= 2 || askMarker) && content.length <= 400);
    }
    if (!accept) continue;

    const level = levelMatch
      ? (levelMatch[1][0].toUpperCase() + levelMatch[1].slice(1).toLowerCase()) as RiskLevel
      : null;
    activeClaim = { raw: content, level, indent, number: pendingClaims.length + 1 };
    pendingClaims.push(activeClaim);
    if (quote) quote.claimNumber = activeClaim.number;
  }

  // Account for occurrences, so repeating a claim quote in another section does
  // not make that other occurrence disappear from the totals.
  const checkable = occurrences.filter((quote) => !quote.abbreviated);
  const claims = pendingClaims.map(({ raw, level, number }): ParsedRiskClaim => {
    const evidence = checkable.filter((quote) => quote.claimNumber === number);
    return {
      raw, level, quote: evidence[0]?.normalized ?? null,
      quoteVerified: evidence.some((quote) => quote.matched),
      interpretationVerified: false,
    };
  });
  const otherQuotes = checkable.filter((quote) => quote.claimNumber === null);
  const otherQuotesVerified = otherQuotes.filter((quote) => quote.matched).length;

  return {
    parsedClaims: claims.length,
    claimsWithQuote: claims.filter((claim) => Boolean(claim.quote)).length,
    claimsWithVerifiedQuote: claims.filter((claim) => claim.quoteVerified).length,
    claimsWithoutQuote: claims.filter((claim) => !claim.quote).length,
    claimsWithUnverifiedQuote: new Set(checkable
      .filter((quote) => !quote.matched && quote.claimNumber !== null).map((quote) => quote.claimNumber)).size,
    riskSectionFound,
    noRisksStated: noRisksStated || explicitRiskDenial,
    hasRiskContradiction: explicitRiskDenial && claims.length > 0,
    otherQuotesTotal: otherQuotes.length,
    otherQuotesVerified,
    otherQuotesUnverified: otherQuotes.length - otherQuotesVerified,
    quotationsToReview: occurrences.filter((quote) => !quote.matched)
      .map(({ text, line, claimNumber, abbreviated }) => ({ text, line, claimNumber, abbreviated })),
    claims,
  };
}

/**
 * Local, deterministic caution about whether the submitted text looks like an agreement.
 *
 * This deliberately errs on the side of silence: a warning is raised only when there is
 * affirmative evidence of website/app content, or when a reasonably long excerpt contains
 * no recognizable agreement language at all. It never disables analysis, never changes the
 * excerpt, never calls a model, and never uploads anything. A contract written in unusual
 * wording may still produce a caution; the UI says so and leaves the decision to the user.
 */
export type DocumentSuitability = {
  /** A cautious, user-facing warning, or null when nothing looks amiss. */
  caution: string | null;
  reason: 'website-content' | 'no-agreement-language' | null;
  webSignals: string[];
  agreementSignals: number;
};

const WEB_SITE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: 'web address', pattern: /https?:\/\/|www\./i },
  { label: 'site navigation or footer labels', pattern: /\b(?:home|menu|search|login|log in|sign in|sign up|subscribe|newsletter|sitemap|back to top|share this|follow us|cookie|cookies|privacy policy|all rights reserved|copyright)\b/i },
  { label: 'listing or form labels', pattern: /\b(?:click here|learn more|read more|select (?:a )?(?:state|country|lga|local government)|postcode|postal code|zip code|local government area|page \d+ of \d+|results? found|no results|view all|browse|filter by)\b/i },
  { label: 'email address', pattern: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i },
];

const AGREEMENT_PATTERNS: RegExp[] = [
  /\b(?:agreement|contract|terms and conditions|terms of service|lease|deed|addendum|memorandum of understanding|statement of work)\b/i,
  /\b(?:party|parties|hereby|herein|whereas|in witness whereof|shall|signature|signed|executed|effective date)\b/i,
  /\b(?:client|customer|supplier|vendor|contractor|employer|employee|licensor|licensee|landlord|tenant|service provider)\b/i,
  /\b(?:obligation|termination|liability|indemnity|confidentiality|governing law|jurisdiction|renewal|breach|payment terms|consideration)\b/i,
];

export function assessDocumentSuitability(text: string): DocumentSuitability {
  const trimmed = text.trim();
  const webSignals = WEB_SITE_PATTERNS
    .filter(({ pattern }) => pattern.test(trimmed))
    .map(({ label }) => label);
  const agreementSignals = AGREEMENT_PATTERNS.filter((pattern) => pattern.test(trimmed)).length;
  const empty = { caution: null, reason: null, webSignals, agreementSignals } as DocumentSuitability;

  // Short snippets are too noisy to judge; the analyze gate already requires 80 chars.
  if (trimmed.length < 80) return empty;

  if (webSignals.length >= 2 && agreementSignals === 0) {
    return {
      caution: `This text looks like website or app content rather than an agreement (${webSignals.join(', ')}). AI findings may not describe contractual obligations.`,
      reason: 'website-content',
      webSignals,
      agreementSignals,
    };
  }
  if (agreementSignals === 0) {
    return {
      caution: 'No recognizable agreement language was found. This may not be a contract, so AI findings may be unrelated to contractual obligations. If it is an agreement written in unusual wording, you can still analyze it.',
      reason: 'no-agreement-language',
      webSignals,
      agreementSignals,
    };
  }
  return empty;
}
