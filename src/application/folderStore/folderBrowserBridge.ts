import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import {
  buildEmptyStructure,
  inspectPath,
  planRepair,
  type FolderEntryDescriptor,
  type FolderInspectionResult,
  type FolderMaterializedEntry,
  type FolderRepairPlan,
} from './folderStoreEngine';
import { FOLDER_MANIFEST_FILENAME, GMAO_DATA_ROOT_DIR } from './folderStorePaths';

/**
 * Browser / Desktop Bridge Stub for Phase L1 (Structure Inspection & Empty Tree Export).
 *
 * EXPLICIT PLATFORM BOUNDARY:
 * - Browser File System Access API (`window.showDirectoryPicker`) handles are session-scoped
 *   and CANNOT guarantee permanent native OS paths across restarts or LAN shares.
 * - Therefore, Phase L1 persists ONLY the user-chosen folder display label in
 *   `STORAGE_KEYS.DATA_FOLDER_LABEL` (`gmao_data_folder_label`) — never claiming native
 *   Windows path permanence in the browser.
 * - Full persistent path binding (e.g. `D:\GMAO_Data` or `\\SERVER\GMAO_Data`) and live
 *   atomic reads/writes are reserved for Phase L2 under the future native Windows shell
 *   (Electron / Tauri).
 * - Empty structure initialization in browser mode produces a standard downloadable `.zip`
 *   archive (`GMAO_Data_Structure_L1.zip`) so every OS/browser can unpack a clean tree safely
 *   without fragile browser write permissions.
 */

export interface BrowserDirectoryHandleLike {
  name: string;
  kind: 'directory';
  entries?: () => AsyncIterable<[string, BrowserFsHandleLike]>;
  values?: () => AsyncIterable<BrowserFsHandleLike>;
  getFileHandle?: (name: string) => Promise<BrowserFileHandleLike>;
}

export interface BrowserFileHandleLike {
  name: string;
  kind: 'file';
  getFile: () => Promise<{ text: () => Promise<string> }>;
}

export type BrowserFsHandleLike = BrowserDirectoryHandleLike | BrowserFileHandleLike;

export interface PickerInspectionReport {
  folderLabel: string;
  entries: FolderEntryDescriptor[];
  inspection: FolderInspectionResult;
  repairPlan: FolderRepairPlan;
}

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<BrowserDirectoryHandleLike>;
};

export function isDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === 'function'
  );
}

export function getSavedDataFolderLabel(): string {
  const val = storageService.getItem(STORAGE_KEYS.DATA_FOLDER_LABEL);
  return typeof val === 'string' ? val.trim() : '';
}

export function saveDataFolderLabel(label: string): void {
  const clean = String(label || '').trim();
  if (!clean) {
    storageService.removeItem(STORAGE_KEYS.DATA_FOLDER_LABEL);
    return;
  }
  storageService.setItem(STORAGE_KEYS.DATA_FOLDER_LABEL, clean);
}

export function clearSavedDataFolderLabel(): void {
  storageService.removeItem(STORAGE_KEYS.DATA_FOLDER_LABEL);
}

async function listDirectoryHandlesShallow(
  dirHandle: BrowserDirectoryHandleLike,
  prefix = '',
  depth = 0,
  maxDepth = 2
): Promise<FolderEntryDescriptor[]> {
  const results: FolderEntryDescriptor[] = [];
  if (depth > maxDepth) return results;

  const iterator = dirHandle.values
    ? dirHandle.values()
    : dirHandle.entries
      ? (async function* () {
          for await (const [, h] of dirHandle.entries!()) {
            yield h;
          }
        })()
      : null;

  if (!iterator) return results;

  for await (const handle of iterator) {
    const relPath = prefix ? `${prefix}/${handle.name}` : handle.name;
    const isDirectory = handle.kind === 'directory';
    results.push({ path: relPath, isDirectory });

    if (isDirectory && depth < maxDepth) {
      const children = await listDirectoryHandlesShallow(handle, relPath, depth + 1, maxDepth);
      results.push(...children);
    }
  }

  return results;
}

/**
 * Opens the browser directory picker in READ-ONLY mode, scans up to 2 levels deep,
 * reads `manifest.json` if present, runs pure `inspectPath` + `planRepair`,
 * and remembers ONLY the folder's display label.
 */
export async function pickAndInspectDirectory(): Promise<PickerInspectionReport | null> {
  if (!isDirectoryPickerSupported()) {
    throw new Error('File System Access API (showDirectoryPicker) is not available in this browser.');
  }

  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker!;
  const dirHandle = await picker({ mode: 'read' });
  const entries = await listDirectoryHandlesShallow(dirHandle, '', 0, 2);

  let manifestRaw: unknown = undefined;
  const hasManifestEntry = entries.some(
    (e) => !e.isDirectory && e.path === FOLDER_MANIFEST_FILENAME
  );
  if (hasManifestEntry && typeof dirHandle.getFileHandle === 'function') {
    try {
      const fh = await dirHandle.getFileHandle(FOLDER_MANIFEST_FILENAME);
      const file = await fh.getFile();
      manifestRaw = await file.text();
    } catch {
      manifestRaw = ''; // Triggers fail-closed INVALID_MANIFEST
    }
  }

  const inspection = inspectPath(entries, manifestRaw);
  const repairPlan = planRepair(inspection);

  saveDataFolderLabel(dirHandle.name || GMAO_DATA_ROOT_DIR);

  return {
    folderLabel: dirHandle.name || GMAO_DATA_ROOT_DIR,
    entries,
    inspection,
    repairPlan,
  };
}

// ============================================================================
// Pure Standard Store (Method 0) ZIP Archive Builder (zero external deps)
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Builds an uncompressed (STORE method 0) PKZIP archive containing the canonical
 * `GMAO_Data/` folder tree and empty JSON files. Compatible with Windows Explorer,
 * PowerShell `Expand-Archive`, macOS Archive Utility, and 7-Zip.
 */
export function buildEmptyStructureZipBytes(
  entries: readonly FolderMaterializedEntry[] = buildEmptyStructure({ includeRootPrefix: true }),
  now: Date = new Date()
): Uint8Array {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = encodeDosDateTime(now);

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedName = entry.isDirectory
      ? entry.path.endsWith('/')
        ? entry.path
        : `${entry.path}/`
      : entry.path;

    const nameBytes = encoder.encode(normalizedName);
    const dataBytes = entry.isDirectory ? new Uint8Array(0) : encoder.encode(entry.content ?? '');
    const crc = computeCrc32(dataBytes);

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature PK\x03\x04
    lv.setUint16(4, 20, true); // version needed 2.0
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // compression method: 0 (STORE)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true); // compressed size
    lv.setUint32(22, dataBytes.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature PK\x01\x02
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // compression: STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, entry.isDirectory ? 0x10 : 0x20, true); // external attrs (DOS dir/archive)
    cv.setUint32(42, offset, true); // relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const part of centralParts) {
    centralDirSize += part.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // signature PK\x05\x06
  ev.setUint16(4, 0, true); // disk number
  ev.setUint16(6, 0, true); // central dir start disk
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true); // comment length

  const totalSize = centralDirOffset + centralDirSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);

  return output;
}

/**
 * Triggers a browser download of `GMAO_Data_Structure_L1.zip` containing the canonical empty tree.
 */
export function downloadEmptyDataFolderZip(fileName = 'GMAO_Data_Structure_L1.zip'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Browser download API is unavailable in this environment.');
  }
  const zipBytes = buildEmptyStructureZipBytes(buildEmptyStructure({ includeRootPrefix: true }));
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
