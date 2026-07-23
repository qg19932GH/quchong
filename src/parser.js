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

function extractVideoId(filename) {
  // Remove extension
  const dotIndex = filename.lastIndexOf('.');
  let name = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;
  
  // Replace standard website domains with spaces to avoid interference (e.g. hjd2048.com, t66y.com)
  name = name.replace(/\b[a-zA-Z0-9-]+\.(?:com|net|org|xyz|info|cc|me|vip|top|club|biz|co|click|asia|io|tv|us|cn|tk)\b/gi, ' ');
  
  // Normalize string to uppercase for parsing
  const upperName = name.toUpperCase();
  
  // 1. Check for FC2 codes
  // Patterns: FC2-1234567, FC2123456, FC2-PTS-123456, FC2_PTS_123456, etc.
  // Use (?![0-9]) to ensure we capture the full digit sequence and avoid word boundary conflicts on trailing underscores
  const fc2Match = upperName.match(/FC2(?:[-_\s]|PTS)*(?:PTS)?(?:[-_\s])*(\d{5,8})(?![0-9])/i);
  if (fc2Match) {
    return `FC2-${fc2Match[1]}`;
  }
  
  // 2. Check for Heyzo codes
  // Patterns: HEYZO-1234, HEYZO1234
  const heyzoMatch = upperName.match(/HEYZO(?:[-_\s])*(\d{3,5})(?![0-9])/i);
  if (heyzoMatch) {
    return `HEYZO-${heyzoMatch[1]}`;
  }

  // 3. Check for standard AV codes
  // Format: [PREFIX]-[DIGITS] or [PREFIX]_[DIGITS] or [PREFIX] [DIGITS]
  // e.g. SSIS-123, abp-456, MIDE-789, T28-123, 1Pondo-123456 (often has numbers)
  // PREFIX: 2 to 8 characters (letters and digits, must contain at least one letter)
  // Use (?![0-9]) instead of \b to handle suffixes like _uncensored or _HD safely
  const stdMatch = upperName.match(/(?:^|[^A-Z0-9])([A-Z0-9]{2,8})[-_\s]+(\d{3,6})(?![0-9])/);
  if (stdMatch) {
    const prefix = stdMatch[1];
    const digits = stdMatch[2];
    // Check if prefix has at least one letter and is not in blacklist
    if (/[A-Z]/.test(prefix) && !BLACKLIST.has(prefix)) {
      return `${prefix}-${digits}`;
    }
  }
  
  // 4. Check for standard AV codes directly concatenated, e.g. SSIS123, ABP001, ipx888
  // Format: [LETTERS][DIGITS] where LETTERS is 3 to 6 chars, DIGITS is 3 to 5 chars
  const concatMatch = upperName.match(/(?:^|[^A-Z])([A-Z]{3,6})(\d{3,5})(?![0-9])/);
  if (concatMatch) {
    const prefix = concatMatch[1];
    const digits = concatMatch[2];
    if (!BLACKLIST.has(prefix)) {
      return `${prefix}-${digits}`;
    }
  }

  // 5. Check for Caribbeancom/Uncensored date codes
  // Patterns: 123456-789, 123456_789 (usually 6 digits, hyphen/underscore, 3-4 digits)
  const caribMatch = upperName.match(/(?:^|[^0-9])(\d{6})[-_](\d{3,4})(?![0-9])/);
  if (caribMatch) {
    return `${caribMatch[1]}-${caribMatch[2]}`;
  }
  
  // Tokyo Hot format: n1234 or N1234
  const tokyoHotMatch = upperName.match(/(?:^|[^A-Z0-9])(N\d{3,5})(?![0-9])/);
  if (tokyoHotMatch) {
    return tokyoHotMatch[1];
  }

  // 6. Fallback: Clean name for regular duplicate videos (non-AV/non-FC2)
  // Remove common video extension if present in upperName
  let cleanName = upperName;
  const lastDot = cleanName.lastIndexOf('.');
  if (lastDot !== -1 && lastDot > cleanName.length - 6) {
    cleanName = cleanName.substring(0, lastDot);
  }

  // Remove content in brackets, parenthesis and braces
  cleanName = cleanName.replace(/\[.*?\]/g, ' ')
                       .replace(/\(.*?\)/g, ' ')
                       .replace(/\{.*?\}/g, ' ');

  // Remove common quality / release indicators
  cleanName = cleanName.replace(/[-_](?:HD|UNCENSORED|4K|1080P|720P|2K|C|CN|SUB|SUBBED)\b/gi, ' ');

  // Keep letters, digits, and Chinese characters, and replace other punctuation/spaces with empty
  cleanName = cleanName.replace(/[^A-Z0-9\u4e00-\u9fa5]/gi, '');

  // Trim and ignore if name is generic or too short
  const GENERIC_KEYS = new Set(['SAMPLE', 'INTRO', 'TRAILER', 'PREVIEW', 'TEST', 'TEMP', 'DEMO', 'VIDEO', 'MOVIE', 'PART1', 'PART2', 'PART3', 'VOL1', 'VOL2', 'VOL3']);
  if (cleanName.length >= 3 && !GENERIC_KEYS.has(cleanName)) {
    return cleanName;
  }

  // If no patterns match, return null.
  return null;
}

module.exports = {
  extractVideoId
};
