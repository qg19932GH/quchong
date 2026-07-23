/**
 * Filename cleaner and ID extractor.
 * Extract FC2 and AV codes from filename.
 */

// Blacklist of common non-AV prefixes in uppercase
const BLACKLIST = new Set([
  'PART', 'VOL', 'VOLUME', 'CH', 'CHAPTER', 'EP', 'EPISODE', 'PAGE', 
  'VLOG', 'VER', 'VERSION', 'SIZE', 'DATE', 'YEAR', 'TEMP', 'TEST', 
  'FILE', 'IMAGE', 'PHOTO', 'VIDEO', 'TRACK', 'DISC', 'DISK', 'ITEM', 
  'CODE', 'REF', 'ID', 'NUM', 'NUMBER', 'STEP', 'LEVEL', 'STAGE', 'RANK', 
  'TOP', 'WIN', 'MAC', 'WEB', 'LINK', 'SITE', 'URL', 'HTTP', 'HTTPS', 'WWW'
]);

function extractSuffixes(trailingStr) {
  let part = '';
  let sp = '';

  if (!trailingStr) {
    return { part, sp };
  }

  // 1. Check for SP indicators: SP1, SP2, SP, 特典, BONUS, EXTRA
  const spMatch = trailingStr.match(/(?:^|[-_\s])(SP\d*|特典|BONUS|EXTRA)(?![A-Z0-9])/i);
  if (spMatch) {
    sp = spMatch[1].toUpperCase();
  }

  // 2. Check for Part indicators: CD1, DISC2, PART3, etc.
  const partMatch = trailingStr.match(/(?:^|[-_\s])(CD|DISC|PART)[-_\s]*(\d+|[A-H])(?![A-Z0-9])/i);
  if (partMatch) {
    part = `${partMatch[1].toUpperCase()}${partMatch[2].toUpperCase()}`;
  } else {
    // Check for single digit or character in parenthesis or preceded by hyphen/underscore
    // e.g. -1, _2, (3), (A)
    const trailingWithoutExt = trailingStr.replace(/\.[a-z0-9]+$/i, '');
    const singlePartMatch = trailingWithoutExt.match(/(?:[-_\s]|\(|（)([A-H]|\d+)(?:\)|）)?$/i);
    if (singlePartMatch) {
      const val = singlePartMatch[1];
      // Exclude common quality/subtitle indicators to avoid false positives
      if (val !== '4K' && val !== '2K' && val !== 'C' && val !== 'CN') {
        part = val.toUpperCase();
      }
    }
  }

  return { part, sp };
}

function extractVideoId(filename) {
  if (!filename) return null;
  
  // Normalize string by removing website domains permanently from the string we process
  let cleanUpperName = filename.toUpperCase();
  cleanUpperName = cleanUpperName.replace(/\b[A-Z0-9-]+\.(?:COM|NET|ORG|XYZ|INFO|CC|ME|VIP|TOP|CLUB|BIZ|CO|CLICK|ASIA|IO|TV|US|CN|TK)\b/g, ' ');

  // Helper to format ID with suffixes
  function formatWithSuffix(coreId, matchIndex, matchLength) {
    const trailingStr = cleanUpperName.substring(matchIndex + matchLength);
    const { part, sp } = extractSuffixes(trailingStr);
    let result = coreId;
    if (part) result += `-${part}`;
    if (sp) result += `-${sp}`;
    return result;
  }

  // 1. Check for FC2 codes
  const fc2Match = cleanUpperName.match(/FC2(?:[-_\s]|PTS)*(?:PTS)?(?:[-_\s])*(\d{5,8})(?![0-9])/i);
  if (fc2Match) {
    const coreId = `FC2-${fc2Match[1]}`;
    return formatWithSuffix(coreId, fc2Match.index, fc2Match[0].length);
  }
  
  // 2. Check for Heyzo codes
  const heyzoMatch = cleanUpperName.match(/HEYZO(?:[-_\s])*(\d{3,5})(?![0-9])/i);
  if (heyzoMatch) {
    const coreId = `HEYZO-${heyzoMatch[1]}`;
    return formatWithSuffix(coreId, heyzoMatch.index, heyzoMatch[0].length);
  }

  // 3. Check for standard AV codes
  const stdMatch = cleanUpperName.match(/(?:^|[^A-Z0-9])([A-Z0-9]{2,8})[-_\s]+(\d{3,6})(?![0-9])/);
  if (stdMatch) {
    const prefix = stdMatch[1];
    const digits = stdMatch[2];
    if (/[A-Z]/.test(prefix) && !BLACKLIST.has(prefix)) {
      const coreId = `${prefix}-${digits}`;
      const prefixStart = cleanUpperName.indexOf(stdMatch[1], stdMatch.index);
      const matchLength = (stdMatch.index + stdMatch[0].length) - prefixStart;
      return formatWithSuffix(coreId, prefixStart, matchLength);
    }
  }
  
  // 4. Check for standard AV codes directly concatenated
  const concatMatch = cleanUpperName.match(/(?:^|[^A-Z])([A-Z]{3,6})(\d{3,5})(?![0-9])/);
  if (concatMatch) {
    const prefix = concatMatch[1];
    const digits = concatMatch[2];
    if (!BLACKLIST.has(prefix)) {
      const coreId = `${prefix}-${digits}`;
      const prefixStart = cleanUpperName.indexOf(concatMatch[1], concatMatch.index);
      const matchLength = (concatMatch.index + concatMatch[0].length) - prefixStart;
      return formatWithSuffix(coreId, prefixStart, matchLength);
    }
  }

  // 5. Check for Caribbeancom/Uncensored date codes
  const caribMatch = cleanUpperName.match(/(?:^|[^0-9])(\d{6})[-_](\d{3,4})(?![0-9])/);
  if (caribMatch) {
    const coreId = `${caribMatch[1]}-${caribMatch[2]}`;
    const startIdx = cleanUpperName.indexOf(caribMatch[1], caribMatch.index);
    const matchLength = (caribMatch.index + caribMatch[0].length) - startIdx;
    return formatWithSuffix(coreId, startIdx, matchLength);
  }
  
  // Tokyo Hot format
  const tokyoHotMatch = cleanUpperName.match(/(?:^|[^A-Z0-9])(N\d{3,5})(?![0-9])/);
  if (tokyoHotMatch) {
    const coreId = tokyoHotMatch[1];
    const startIdx = cleanUpperName.indexOf(tokyoHotMatch[1], tokyoHotMatch.index);
    const matchLength = (tokyoHotMatch.index + tokyoHotMatch[0].length) - startIdx;
    return formatWithSuffix(coreId, startIdx, matchLength);
  }

  // B. Check for Advertising Videos SECOND! (Only if standard patterns didn't match)
  const AD_KEYWORDS = [
    '社 區 最 新 情 報', '社区最新情报', '最新情报', '最新情報',
    'hjd2048', '2048社区', 't66y', '地址发布', '发布地址',
    '永久地址', '永久域名', '最新地址', '防迷路'
  ];
  for (const kw of AD_KEYWORDS) {
    if (cleanUpperName.includes(kw.toUpperCase())) {
      return '[ADVERTISEMENT]';
    }
  }

  // 6. Fallback: Clean name for regular duplicate videos (non-AV/non-FC2)
  let cleanName = cleanUpperName;
  const lastDot = cleanName.lastIndexOf('.');
  if (lastDot !== -1 && lastDot > cleanName.length - 6) {
    cleanName = cleanName.substring(0, lastDot);
  }

  // Preserve suffixes for fallback names too
  const { part, sp } = extractSuffixes(cleanName);

  cleanName = cleanName.replace(/\[.*?\]/g, ' ')
                       .replace(/\(.*?\)/g, ' ')
                       .replace(/\{.*?\}/g, ' ');

  cleanName = cleanName.replace(/[-_](?:HD|UNCENSORED|4K|1080P|720P|2K|C|CN|SUB|SUBBED)\b/gi, ' ');
  cleanName = cleanName.replace(/[^A-Z0-9\u4e00-\u9fa5]/gi, '');

  const GENERIC_KEYS = new Set(['SAMPLE', 'INTRO', 'TRAILER', 'PREVIEW', 'TEST', 'TEMP', 'DEMO', 'VIDEO', 'MOVIE', 'PART1', 'PART2', 'PART3', 'VOL1', 'VOL2', 'VOL3']);
  
  // Ignore fallback keys that represent generic series segment markers
  if (/^(?:EPISODE|EP|PART|VOL|VOLUME)\d*$/i.test(cleanName)) {
    return null;
  }

  if (cleanName.length >= 3 && !GENERIC_KEYS.has(cleanName)) {
    let result = cleanName;
    if (part) result += `-${part}`;
    if (sp) result += `-${sp}`;
    return result;
  }

  return null;
}

module.exports = {
  extractVideoId
};
