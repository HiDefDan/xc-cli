// Data-driven from a scan of the full ~214k-title catalog: title prefixes
// (e.g. "EN -", "DE -", "AR-SUBS -") mark audio/subtitle language directly
// on each title and are far more precise than category names. A whitelist
// is safer than a blacklist here — 188 distinct prefixes were observed,
// most cryptic and low-frequency, so unrecognized ones default to excluded
// rather than risk letting an unknown foreign code slip through as "keep".
const GOOD_PREFIXES = new Set([
  'EN', '4K-EN', 'NF', '4K-NF', 'TOP', '4K-TOP', 'AMZ', '4K-AMZ', 'D+',
  'UNV', 'PRMT', 'MRVL', '4K-MRVL', 'DWA', 'NICK', 'MAX', '4K-MAX',
  'PCOK', 'SKY', 'SHWT', '007', 'UFC', 'CR', 'A+', '4K-A+',
]);

// Category-name fallback, used only for the ~4% of titles whose prefix
// doesn't parse (e.g. "D+" titles using "+"/":" separators the regex
// below doesn't catch, or titles with no prefix at all).
const FOREIGN_KEYWORDS = [
  'GERMANY', 'FRANCE', 'TURK', 'GREECE', 'GREEK', 'ITALY', 'ESPANA', 'SPAIN', 'NETHERLANDS',
  'PT/BR', 'PTBR', 'BELGIUM', 'POLSKA', 'POLAND', 'ALBANIA', 'INDIA', 'HINDI', 'TAMIL', 'TELUGU',
  'MALAYALAM', 'KANNADA', 'PUNJABI', 'MARATHI', 'GUJARATI', 'BENGALI', 'SOMALIA', 'PAKISTAN',
  'PERSIAN', 'KURDISH', 'HEBREW', 'ROMANIAN', 'BULGARIYA', 'BULGARIA', 'HUNGARY', 'RUSSAIN',
  'RUSSIAN', 'AFRICA', 'CHINA', 'PHILIPPINES', 'TAGALOG', 'SVENSK', 'DANSK', 'NORSK', 'NORGE',
  'SUOMI', 'SUOMEN', 'MALTA', 'QUEBEC', 'LATINO', 'JAPANESE', 'KOREAN', 'KOREA', 'VIETNAM', 'THAI',
  'ARAB', 'URDU', 'ISLAND', 'NORDIC', 'NORWAY', 'SWEDEN', 'DENMARK', 'FINLAND', 'DUTCH', 'ISRAEL',
  'UKRAIN', 'CROATIA', 'SERBIA', 'CZECH', 'SLOVAK', 'PORTUGUESE', 'BRAZIL', 'MEXIC', 'MENA', 'JOYN',
  '(NL)', '(FR)', '(DE)', '(ES)', '(IT)', '(PT)', '(TR)',
];

const FOREIGN_CATEGORY_PREFIXES = [
  'ES', 'FR', 'DE', 'IT', 'NL', 'PL', 'GR', 'IL', 'RU', 'MT', 'BG', 'RO', 'AL', 'KU', 'TR', 'IR',
  'CN', 'PH', 'JP', 'AF', 'PK', 'SO', 'BN', 'QC', 'BR', 'LA', 'BE', 'IN', 'PT/BR', 'PT',
];

function normalize(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function isNonLatinScript(str) {
  return /[؀-ۿ֐-׿Ѐ-ӿͰ-Ͽ]/.test(str);
}

function titlePrefix(name) {
  const m = name.match(/^([A-Za-z0-9+]{1,8}(?:-[A-Za-z0-9+]{1,8})?)\s*[-+:]\s/);
  return m ? m[1].toUpperCase() : null;
}

export function isCategoryForeign(categoryName) {
  if (!categoryName) return false;
  if (isNonLatinScript(categoryName)) return true;
  const upper = normalize(categoryName);
  for (const code of FOREIGN_CATEGORY_PREFIXES) {
    if (new RegExp(`^${code}([\\s\\-/]|$)`).test(upper)) return true;
  }
  return FOREIGN_KEYWORDS.some((kw) => upper.includes(kw));
}

/** Best-effort guess at whether a title is in/dubbed-into English. Not a hard filter — used to rank/group, not hide. */
export function isLikelyEnglish(item) {
  const prefix = titlePrefix(item.name);
  if (prefix) {
    if (GOOD_PREFIXES.has(prefix)) return true;
    if (/^EN-|-EN$/.test(prefix)) return true; // e.g. IN-EN, AF-EN, EN-TOP: explicit English tag on non-English-origin content
    return false;
  }
  return !isCategoryForeign(item.categoryName);
}

/** Splits matches into likely-English first, everything else second — never drops results, just orders them. */
export function partitionByLanguage(items) {
  const primary = [];
  const rest = [];
  for (const item of items) {
    (isLikelyEnglish(item) ? primary : rest).push(item);
  }
  return { primary, rest };
}
