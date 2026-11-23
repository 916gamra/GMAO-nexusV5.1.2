/**
 * Pure relative path helpers for the GMAO Data Folder SSOT contract (Phase L1).
 *
 * All core engine logic operates strictly on normalized POSIX-style relative paths
 * (e.g. `manifest.json`, `catalog/ref_parc.json`, `operational/mouvements.json`)
 * so the contract stays OS-agnostic and ready for future Windows native shells.
 */

export const GMAO_DATA_ROOT_DIR = 'GMAO_Data' as const;
export const FOLDER_MANIFEST_FILENAME = 'manifest.json' as const;

/**
 * Normalizes a folder-relative path:
 * - Converts Windows backslashes (`\`) to `/`
 * - Trims whitespace, leading `./` or `/`, and trailing `/`
 * - Collapses repeated slashes
 * - Optionally strips a leading `GMAO_Data/` root prefix when `stripRootPrefix` is enabled
 */
export function normalizeFolderRelativePath(
  rawPath: string,
  options: { stripRootPrefix?: boolean } = { stripRootPrefix: true }
): string {
  if (typeof rawPath !== 'string') return '';
  let normalized = rawPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (options.stripRootPrefix !== false) {
    const rootLower = GMAO_DATA_ROOT_DIR.toLowerCase();
    const normLower = normalized.toLowerCase();
    if (normLower === rootLower) {
      return '';
    }
    if (normLower.startsWith(`${rootLower}/`)) {
      normalized = normalized.slice(GMAO_DATA_ROOT_DIR.length + 1);
    }
  }

  return normalized;
}

/**
 * Rejects path traversal segments (`..`) or Windows drive prefixes (`C:`)
 * to keep relative contract paths strictly confined inside the data folder root.
 */
export function isSafeRelativePath(relativePath: string): boolean {
  if (!relativePath || typeof relativePath !== 'string') return false;
  if (/^[a-zA-Z]:/.test(relativePath)) return false;
  if (relativePath.includes('\0')) return false;
  const segments = relativePath.replace(/\\/g, '/').split('/');
  return segments.every((seg) => seg !== '..');
}

/**
 * Joins relative path segments cleanly using POSIX separators.
 */
export function joinFolderRelativePath(...segments: string[]): string {
  return segments
    .map((s) => normalizeFolderRelativePath(s, { stripRootPrefix: false }))
    .filter((s) => s.length > 0)
    .join('/');
}

/**
 * Prefixes a relative path with `GMAO_Data/` for archive/ZIP export or display.
 */
export function withDataFolderRoot(relativePath: string): string {
  const clean = normalizeFolderRelativePath(relativePath, { stripRootPrefix: true });
  return clean ? `${GMAO_DATA_ROOT_DIR}/${clean}` : GMAO_DATA_ROOT_DIR;
}
