/**
 * Shared deployment utilities used by vite.config.ts, verify-build-channel.mjs,
 * and contract-tested against scripts/slugify-branch.py for parity.
 */

/**
 * Ensures a base path has both a leading and trailing slash.
 * @param {string} value - The base path to normalize.
 * @returns {string} The normalized base path.
 */
export const normalizeBasePath = (value) => {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

/**
 * Converts a branch name into a path-safe preview slug.
 * Uses per-character encoding identical to scripts/slugify-branch.py:
 * only [a-z0-9-] pass through; everything else becomes _{hex}_.
 * @param {string} value - The branch name.
 * @returns {string} The path-safe slug.
 */
export const toPreviewSlug = (value) => {
  const name = value.trim().toLowerCase();
  const encoded = [];

  for (const char of name) {
    if (/[a-z0-9-]/.test(char)) {
      encoded.push(char);
    } else {
      encoded.push(`_${char.codePointAt(0).toString(16)}_`);
    }
  }

  return encoded.join('').replace(/^-+|-+$/g, '');
};
