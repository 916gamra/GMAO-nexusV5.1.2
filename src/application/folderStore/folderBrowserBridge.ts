import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import { serializeLiveStateToFolderFiles } from './folderDataSerializer';
import {
  BrowserDirectoryFsAdapter,
  type ReadWriteBrowserDirectoryHandleLike,
  saveDirectoryHandleToIdb,
} from './folderFsAdapter';
import {
  buildEmptyStructure,
  inspectPath,
  planRepair,
  type FolderEntryDescriptor,
  type FolderInspectionResult,
  type FolderMaterializedEntry,
  type FolderRepairPlan,
} from './folderStoreEngine';
import {
  FOLDER_MANIFEST_FILENAME,
  GMAO_DATA_ROOT_DIR,
  isSafeRelativePath,
  normalizeFolderRelativePath,
} from './folderStorePaths';

/**
 * Browser / Desktop Bridge for Phase L1 + Phase L2.2 (Local Folder Read/Write & ZIP Folder Exchange).
 */

export type BrowserDirectoryHandleLike = ReadWriteBrowserDirectoryHandleLike;
export type BrowserFileHandleLike = {
  name: string;
  kind: 'file';
  getFile: () => Promise<{ text: () => Promise<string> }>;
};
export type BrowserFsHandleLike = BrowserDirectoryHandleLike | BrowserFileHandleLike;

export interface PickerInspectionReport {
  folderLabel: string;
  entries: FolderEntryDescriptor[];
  inspection: FolderInspectionResult;
  repairPlan: FolderRepairPlan;
  adapter?: BrowserDirectoryFsAdapter;
}

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<ReadWriteBrowserDirectoryHandleLike>;
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

/**
 * Opens the browser directory picker (in `readwrite` mode by default for Phase L2, falling back to `read` if needed),
 * wraps the selected folder in `BrowserDirectoryFsAdapter`, persists the handle in IndexedDB,
 * and runs `inspectPath` + `planRepair`.
 */
export async function pickAndInspectDirectory(
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<PickerInspectionReport | null> {
  if (!isDirectoryPickerSupported()) {
    throw new Error('File System Access API (showDirectoryPicker) is not available in this browser.');
  }

  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker!;
  let dirHandle: ReadWriteBrowserDirectoryHandleLike;
  try {
    dirHandle = await picker({ mode });
  } catch (err) {
    if (mode === 'readwrite') {
      dirHandle = await picker({ mode: 'read' });
    } else {
      throw err;
    }
  }

  const adapter = new BrowserDirectoryFsAdapter(dirHandle);
  await saveDirectoryHandleToIdb(dirHandle);

  const entries = await adapter.listEntries(2);

  let manifestRaw: unknown = undefined;
  const hasManifestEntry = entries.some(
    (e) => !e.isDirectory && e.path === FOLDER_MANIFEST_FILENAME
  );
  if (hasManifestEntry) {
    const text = await adapter.readTextFile(FOLDER_MANIFEST_FILENAME);
    manifestRaw = text ?? '';
  }

  const inspection = inspectPath(entries, manifestRaw);
  const repairPlan = planRepair(inspection);

  saveDataFolderLabel(dirHandle.name || GMAO_DATA_ROOT_DIR);

  return {
    folderLabel: dirHandle.name || GMAO_DATA_ROOT_DIR,
    entries,
    inspection,
    repairPlan,
    adapter,
  };
}

// ============================================================================
// Pure Standard PKZIP Builder (STORE) & Central-Directory Reader (STORE + DEFLATE)
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
 * Builds an uncompressed (STORE method 0) PKZIP archive containing the provided
 * `GMAO_Data/` folder tree and JSON files. Compatible with Windows Explorer,
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
 * Builds a PKZIP archive containing 100% of the live application state (`GMAO_Data/` with all 29 JSON files + `manifest.json`).
 */
export function buildLiveStateFolderZipBytes(now: Date = new Date()): Uint8Array {
  const entries = serializeLiveStateToFolderFiles({
    nowIso: now.toISOString(),
    includeRootPrefix: true,
  });
  return buildEmptyStructureZipBytes(entries, now);
}

interface RawZipRecord {
  rawName: string;
  isDir: boolean;
  compressionMethod: number;
  expectedCrc32: number;
  compressedBytes: Uint8Array;
}

/**
 * Reads ZIP records reliably from the Central Directory (supports Data Descriptor bit 3 used by
 * Windows Explorer / 7-Zip / macOS Archive Utility), falling back to Local File Header scan if needed.
 */
function extractRawZipRecords(zipBytes: Uint8Array): RawZipRecord[] {
  const decoder = new TextDecoder();
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const records: RawZipRecord[] = [];

  // 1. Locate End of Central Directory (PK\x05\x06) scanning backwards up to 65557 bytes
  const minEocdOffset = Math.max(0, zipBytes.byteLength - 65557);
  let eocdOffset = -1;
  for (let pos = zipBytes.byteLength - 22; pos >= minEocdOffset; pos--) {
    if (view.getUint32(pos, true) === 0x06054b50) {
      eocdOffset = pos;
      break;
    }
  }

  if (eocdOffset >= 0) {
    const centralDirSize = view.getUint32(eocdOffset + 12, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);
    const centralDirEnd = Math.min(zipBytes.byteLength, centralDirOffset + centralDirSize);
    let cursor = centralDirOffset;

    while (cursor + 46 <= centralDirEnd) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;

      const compressionMethod = view.getUint16(cursor + 10, true);
      const expectedCrc32 = view.getUint32(cursor + 16, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const fileNameLength = view.getUint16(cursor + 28, true);
      const extraFieldLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localHeaderOffset = view.getUint32(cursor + 42, true);

      const nameStart = cursor + 46;
      const nameEnd = nameStart + fileNameLength;
      if (nameEnd > centralDirEnd) break;
      const rawName = decoder.decode(zipBytes.subarray(nameStart, nameEnd));
      const isDir = rawName.endsWith('/');

      let compressedBytes = new Uint8Array(0);
      if (!isDir && localHeaderOffset + 30 <= zipBytes.byteLength) {
        if (view.getUint32(localHeaderOffset, true) === 0x04034b50) {
          const localNameLen = view.getUint16(localHeaderOffset + 26, true);
          const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
          const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
          const dataEnd = dataStart + compressedSize;
          if (dataEnd <= zipBytes.byteLength) {
            compressedBytes = zipBytes.subarray(dataStart, dataEnd);
          }
        }
      }

      records.push({
        rawName,
        isDir,
        compressionMethod,
        expectedCrc32,
        compressedBytes,
      });

      cursor = nameEnd + extraFieldLength + commentLength;
    }

    return records;
  }

  // 2. Fallback: sequential Local File Header scan (for stream-only archives without EOCD)
  let cursor = 0;
  while (cursor + 30 <= zipBytes.byteLength) {
    if (view.getUint32(cursor, true) !== 0x04034b50) break;
    const compressionMethod = view.getUint16(cursor + 8, true);
    const expectedCrc32 = view.getUint32(cursor + 14, true);
    const compressedSize = view.getUint32(cursor + 18, true);
    const fileNameLength = view.getUint16(cursor + 26, true);
    const extraFieldLength = view.getUint16(cursor + 28, true);

    const nameStart = cursor + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > zipBytes.byteLength) break;
    const rawName = decoder.decode(zipBytes.subarray(nameStart, nameEnd));
    const dataStart = nameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipBytes.byteLength) break;

    const isDir = rawName.endsWith('/');
    records.push({
      rawName,
      isDir,
      compressionMethod,
      expectedCrc32,
      compressedBytes: isDir ? new Uint8Array(0) : zipBytes.subarray(dataStart, dataEnd),
    });

    cursor = dataEnd;
  }

  return records;
}

async function inflateDeflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'Décompression DEFLATE indisponible dans cet environnement. Utilisez une archive ZIP non compressée (STORE).'
    );
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const writePromise = (async () => {
    await writer.write(
      compressed.slice() as unknown as BufferSource
    );
    await writer.close();
  })();

  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.byteLength;
    }
  }
  await writePromise;

  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function registerParsedEntry(
  rawName: string,
  isDir: boolean,
  contentBytes: Uint8Array | null,
  expectedCrc32: number,
  decoder: TextDecoder,
  seenDirs: Set<string>,
  entries: FolderMaterializedEntry[],
  filesMap: Map<string, string>
): void {
  // Reject Zip-Slip traversal paths (`../`, absolute drive letters, null bytes)
  if (!isSafeRelativePath(rawName)) {
    throw new Error(`Archive ZIP rejetée : chemin dangereux détecté ("${rawName}").`);
  }

  const cleanPath = normalizeFolderRelativePath(rawName, { stripRootPrefix: true });
  if (!cleanPath) return;

  if (isDir) {
    if (!seenDirs.has(cleanPath)) {
      seenDirs.add(cleanPath);
      entries.push({ path: cleanPath, isDirectory: true, content: null });
    }
    return;
  }

  if (contentBytes === null) return;

  // Verify CRC-32 integrity when non-zero checksum is recorded
  if (expectedCrc32 !== 0) {
    const actualCrc = computeCrc32(contentBytes);
    if (actualCrc !== expectedCrc32) {
      throw new Error(
        `Archive ZIP corrompue : somme de contrôle CRC-32 invalide sur "${cleanPath}".`
      );
    }
  }

  const content = decoder.decode(contentBytes);
  const slashIdx = cleanPath.lastIndexOf('/');
  if (slashIdx > 0) {
    const parentDir = cleanPath.slice(0, slashIdx);
    if (!seenDirs.has(parentDir)) {
      seenDirs.add(parentDir);
      entries.push({ path: parentDir, isDirectory: true, content: null });
    }
  }
  entries.push({ path: cleanPath, isDirectory: false, content });
  filesMap.set(cleanPath, content);
}

/**
 * Synchronously parses a standard PKZIP archive (STORE method 0) using Central Directory metadata
 * with Zip-Slip path guards and CRC-32 integrity verification.
 */
export function parseZipArchiveEntries(zipBytes: Uint8Array): {
  entries: FolderMaterializedEntry[];
  filesMap: Map<string, string>;
} {
  const decoder = new TextDecoder();
  const entries: FolderMaterializedEntry[] = [];
  const filesMap = new Map<string, string>();
  const seenDirs = new Set<string>();

  const records = extractRawZipRecords(zipBytes);
  for (const rec of records) {
    if (rec.isDir) {
      registerParsedEntry(rec.rawName, true, null, 0, decoder, seenDirs, entries, filesMap);
    } else if (rec.compressionMethod === 0) {
      registerParsedEntry(
        rec.rawName,
        false,
        rec.compressedBytes,
        rec.expectedCrc32,
        decoder,
        seenDirs,
        entries,
        filesMap
      );
    }
  }

  return { entries, filesMap };
}

/**
 * Asynchronously parses PKZIP archives supporting BOTH uncompressed (`STORE` method 0) and
 * compressed (`DEFLATE` method 8, e.g. Windows Explorer / 7-Zip / macOS Archive Utility) entries,
 * with Zip-Slip path guards and CRC-32 verification.
 */
export async function parseZipArchiveEntriesAsync(zipBytes: Uint8Array): Promise<{
  entries: FolderMaterializedEntry[];
  filesMap: Map<string, string>;
}> {
  const decoder = new TextDecoder();
  const entries: FolderMaterializedEntry[] = [];
  const filesMap = new Map<string, string>();
  const seenDirs = new Set<string>();

  const records = extractRawZipRecords(zipBytes);
  for (const rec of records) {
    if (rec.isDir) {
      registerParsedEntry(rec.rawName, true, null, 0, decoder, seenDirs, entries, filesMap);
    } else if (rec.compressionMethod === 0) {
      registerParsedEntry(
        rec.rawName,
        false,
        rec.compressedBytes,
        rec.expectedCrc32,
        decoder,
        seenDirs,
        entries,
        filesMap
      );
    } else if (rec.compressionMethod === 8) {
      const inflated = await inflateDeflateRawBytes(rec.compressedBytes);
      registerParsedEntry(
        rec.rawName,
        false,
        inflated,
        rec.expectedCrc32,
        decoder,
        seenDirs,
        entries,
        filesMap
      );
    } else {
      throw new Error(
        `Méthode de compression ZIP non prise en charge (${rec.compressionMethod}) pour "${rec.rawName}".`
      );
    }
  }

  return { entries, filesMap };
}

function triggerZipBrowserDownload(zipBytes: Uint8Array, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Browser download API is unavailable in this environment.');
  }
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

/**
 * Triggers a browser download of `GMAO_Data_Structure_L1.zip` containing the canonical empty tree.
 */
export function downloadEmptyDataFolderZip(fileName = 'GMAO_Data_Structure_L1.zip'): void {
  const zipBytes = buildEmptyStructureZipBytes(buildEmptyStructure({ includeRootPrefix: true }));
  triggerZipBrowserDownload(zipBytes, fileName);
}

/**
 * Triggers a browser download of `GMAO_Data_Complet.zip` containing the full live application data & preferences.
 */
export function downloadLiveStateDataFolderZip(fileName?: string): void {
  const dateTag = new Date().toISOString().slice(0, 10);
  const finalName = fileName || `GMAO_Data_Complet_${dateTag}.zip`;
  const zipBytes = buildLiveStateFolderZipBytes();
  triggerZipBrowserDownload(zipBytes, finalName);
}
