import { indexedDBService } from '../../utils/indexedDBService';
import type { FolderEntryDescriptor, FolderMaterializedEntry } from './folderStoreEngine';
import {
  GMAO_DATA_ROOT_DIR,
  isSafeRelativePath,
  normalizeFolderRelativePath,
} from './folderStorePaths';

/**
 * Unified File System Adapter (`IFolderFsAdapter`) for Phase L2.2.
 *
 * Abstracts over:
 * 1. `BrowserDirectoryFsAdapter` — Real local disk folder via `FileSystemDirectoryHandle`
 *    (`window.showDirectoryPicker({ mode: 'readwrite' })`), with serialized writes,
 *    atomic-safe `abort()` rollback on write error, path-traversal guards, and IndexedDB handle persistence.
 * 2. `MemoryFolderFsAdapter` — In-memory virtual folder with real scoped subdirectory mounting
 *    (`createSubdirectoryAdapter` shares the parent backing store under `mountPrefix`, mirroring OS semantics).
 * 3. Future `NativeDesktopFsAdapter` (Electron / Tauri) — Drop-in implementation using native OS
 *    atomic write-temp-and-rename (`fs.promises.writeFile(tmp) -> fs.promises.rename(tmp, target)`).
 */

export const IDB_FOLDER_HANDLE_STORAGE_KEY = '__folder_ssot_directory_handle_v1__';

export interface IFolderFsAdapter {
  readonly kind: 'browser-fs' | 'memory';
  getLabel(): string;
  listEntries(maxDepth?: number): Promise<FolderEntryDescriptor[]>;
  readTextFile(relativePath: string): Promise<string | null>;
  writeTextFile(relativePath: string, content: string): Promise<void>;
  ensureDirectory(relativePath: string): Promise<void>;
  createSubdirectoryAdapter(subdirectoryName: string): Promise<IFolderFsAdapter>;
  readAllTextFiles(): Promise<Map<string, string>>;
}

function assertSafeRelativePathOrThrow(rawPath: string): string {
  if (!isSafeRelativePath(rawPath)) {
    throw new Error(`Chemin relatif interdit (hors racine du dossier) : "${rawPath}"`);
  }
  const clean = normalizeFolderRelativePath(rawPath, { stripRootPrefix: true });
  if (!clean) {
    throw new Error(`Chemin relatif vide ou invalide : "${rawPath}"`);
  }
  return clean;
}

function sanitizeSubdirectoryNameOrThrow(subdirectoryName: string): string {
  const raw = String(subdirectoryName || GMAO_DATA_ROOT_DIR).trim();
  if (!isSafeRelativePath(raw)) {
    throw new Error(`Nom de sous-dossier interdit : "${subdirectoryName}"`);
  }
  const clean = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean || clean.includes('/') || clean === '.' || clean === '..') {
    throw new Error(`Nom de sous-dossier invalide (un seul segment requis) : "${subdirectoryName}"`);
  }
  return clean;
}

// ============================================================================
// 1. In-Memory Folder Adapter (Scoped Subdirectory Backing Store)
// ============================================================================

interface MemoryBackingStore {
  directories: Set<string>;
  files: Map<string, string>;
}

export class MemoryFolderFsAdapter implements IFolderFsAdapter {
  public readonly kind = 'memory' as const;
  private label: string;
  private readonly store: MemoryBackingStore;
  private readonly mountPrefix: string;

  constructor(
    label: string = GMAO_DATA_ROOT_DIR,
    initialEntries?: readonly FolderMaterializedEntry[] | ReadonlyMap<string, string>,
    backingStore?: MemoryBackingStore,
    mountPrefix = ''
  ) {
    this.label = label || GMAO_DATA_ROOT_DIR;
    this.store = backingStore ?? {
      directories: new Set<string>(),
      files: new Map<string, string>(),
    };
    this.mountPrefix = mountPrefix.replace(/^\/+|\/+$/g, '');

    if (this.mountPrefix) {
      this.ensureAbsoluteDirectorySync(this.mountPrefix);
    }

    if (Array.isArray(initialEntries)) {
      for (const entry of initialEntries) {
        if (!entry || typeof entry.path !== 'string' || !isSafeRelativePath(entry.path)) continue;
        const clean = normalizeFolderRelativePath(entry.path, { stripRootPrefix: true });
        if (!clean) continue;
        const absPath = this.toStorePath(clean);
        if (entry.isDirectory) {
          this.ensureAbsoluteDirectorySync(absPath);
        } else {
          this.ensureParentAbsoluteDirectoriesSync(absPath);
          this.store.files.set(absPath, entry.content ?? '');
        }
      }
    } else if (initialEntries instanceof Map) {
      for (const [rawPath, content] of initialEntries.entries()) {
        if (!isSafeRelativePath(rawPath)) continue;
        const clean = normalizeFolderRelativePath(rawPath, { stripRootPrefix: true });
        if (!clean) continue;
        const absPath = this.toStorePath(clean);
        this.ensureParentAbsoluteDirectoriesSync(absPath);
        this.store.files.set(absPath, content);
      }
    }
  }

  private toStorePath(relPath: string): string {
    return this.mountPrefix ? `${this.mountPrefix}/${relPath}` : relPath;
  }

  private fromStorePath(storePath: string): string | null {
    if (!this.mountPrefix) return storePath;
    const prefixSlash = `${this.mountPrefix}/`;
    if (!storePath.startsWith(prefixSlash)) return null;
    return storePath.slice(prefixSlash.length);
  }

  private ensureAbsoluteDirectorySync(absPath: string): void {
    const segments = absPath.split('/').filter(Boolean);
    let accum = '';
    for (const seg of segments) {
      accum = accum ? `${accum}/${seg}` : seg;
      this.store.directories.add(accum);
    }
  }

  private ensureParentAbsoluteDirectoriesSync(absFilePath: string): void {
    if (!absFilePath.includes('/')) return;
    const parent = absFilePath.slice(0, absFilePath.lastIndexOf('/'));
    this.ensureAbsoluteDirectorySync(parent);
  }

  public getLabel(): string {
    return this.label;
  }

  public setLabel(nextLabel: string): void {
    this.label = nextLabel || GMAO_DATA_ROOT_DIR;
  }

  public async listEntries(maxDepth = 2): Promise<FolderEntryDescriptor[]> {
    const entries: FolderEntryDescriptor[] = [];
    for (const absDir of Array.from(this.store.directories).sort()) {
      const rel = this.fromStorePath(absDir);
      if (!rel) continue;
      const depth = rel.split('/').length - 1;
      if (depth <= maxDepth) {
        entries.push({ path: rel, isDirectory: true });
      }
    }
    for (const absFile of Array.from(this.store.files.keys()).sort()) {
      const rel = this.fromStorePath(absFile);
      if (!rel) continue;
      const depth = rel.split('/').length - 1;
      if (depth <= maxDepth) {
        entries.push({ path: rel, isDirectory: false });
      }
    }
    return entries;
  }

  public async readTextFile(relativePath: string): Promise<string | null> {
    if (!isSafeRelativePath(relativePath)) {
      throw new Error(`Chemin relatif interdit (hors racine du dossier) : "${relativePath}"`);
    }
    const clean = normalizeFolderRelativePath(relativePath, { stripRootPrefix: true });
    if (!clean) return null;
    const absPath = this.toStorePath(clean);
    return this.store.files.has(absPath) ? (this.store.files.get(absPath) ?? '') : null;
  }

  public async writeTextFile(relativePath: string, content: string): Promise<void> {
    const clean = assertSafeRelativePathOrThrow(relativePath);
    const absPath = this.toStorePath(clean);
    this.ensureParentAbsoluteDirectoriesSync(absPath);
    this.store.files.set(absPath, content);
  }

  public async ensureDirectory(relativePath: string): Promise<void> {
    const clean = assertSafeRelativePathOrThrow(relativePath);
    this.ensureAbsoluteDirectorySync(this.toStorePath(clean));
  }

  public async createSubdirectoryAdapter(subdirectoryName: string): Promise<IFolderFsAdapter> {
    const cleanName = sanitizeSubdirectoryNameOrThrow(subdirectoryName);
    const childPrefix = this.toStorePath(cleanName);
    this.ensureAbsoluteDirectorySync(childPrefix);
    return new MemoryFolderFsAdapter(
      `${this.label}/${cleanName}`,
      undefined,
      this.store,
      childPrefix
    );
  }

  public async readAllTextFiles(): Promise<Map<string, string>> {
    const scoped = new Map<string, string>();
    for (const [absPath, content] of this.store.files.entries()) {
      const rel = this.fromStorePath(absPath);
      if (rel) {
        scoped.set(rel, content);
      }
    }
    return scoped;
  }

  public getFilesSnapshotSync(): Map<string, string> {
    const scoped = new Map<string, string>();
    for (const [absPath, content] of this.store.files.entries()) {
      const rel = this.fromStorePath(absPath);
      if (rel) {
        scoped.set(rel, content);
      }
    }
    return scoped;
  }
}

// ============================================================================
// 2. Browser File System Access API Directory Adapter (Local Disk Read/Write)
// ============================================================================

export interface WritableFileStreamLike {
  write: (data: string | Uint8Array | Blob) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
}

export interface WritableBrowserFileHandleLike {
  name: string;
  kind: 'file';
  getFile: () => Promise<{ text: () => Promise<string> }>;
  createWritable?: () => Promise<WritableFileStreamLike>;
}

export interface ReadWriteBrowserDirectoryHandleLike {
  name: string;
  kind: 'directory';
  entries?: () => AsyncIterable<[string, ReadWriteBrowserDirectoryHandleLike | WritableBrowserFileHandleLike]>;
  values?: () => AsyncIterable<ReadWriteBrowserDirectoryHandleLike | WritableBrowserFileHandleLike>;
  getDirectoryHandle?: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<ReadWriteBrowserDirectoryHandleLike>;
  getFileHandle?: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<WritableBrowserFileHandleLike>;
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

export class BrowserDirectoryFsAdapter implements IFolderFsAdapter {
  public readonly kind = 'browser-fs' as const;
  private readonly rootHandle: ReadWriteBrowserDirectoryHandleLike;
  private readonly labelOverride?: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(rootHandle: ReadWriteBrowserDirectoryHandleLike, labelOverride?: string) {
    this.rootHandle = rootHandle;
    this.labelOverride = labelOverride;
  }

  public getHandle(): ReadWriteBrowserDirectoryHandleLike {
    return this.rootHandle;
  }

  public getLabel(): string {
    return this.labelOverride || this.rootHandle.name || GMAO_DATA_ROOT_DIR;
  }

  public async verifyReadWritePermission(promptIfNeeded = true): Promise<boolean> {
    try {
      if (typeof this.rootHandle.queryPermission === 'function') {
        const status = await this.rootHandle.queryPermission({ mode: 'readwrite' });
        if (status === 'granted') return true;
        if (promptIfNeeded && typeof this.rootHandle.requestPermission === 'function') {
          const requested = await this.rootHandle.requestPermission({ mode: 'readwrite' });
          return requested === 'granted';
        }
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private async scanRecursive(
    dirHandle: ReadWriteBrowserDirectoryHandleLike,
    prefix: string,
    depth: number,
    maxDepth: number
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
        const children = await this.scanRecursive(
          handle as ReadWriteBrowserDirectoryHandleLike,
          relPath,
          depth + 1,
          maxDepth
        );
        results.push(...children);
      }
    }

    return results;
  }

  public async listEntries(maxDepth = 2): Promise<FolderEntryDescriptor[]> {
    return this.scanRecursive(this.rootHandle, '', 0, maxDepth);
  }

  private async resolveParentDirectoryHandle(
    segments: string[],
    create: boolean
  ): Promise<ReadWriteBrowserDirectoryHandleLike | null> {
    let current: ReadWriteBrowserDirectoryHandleLike = this.rootHandle;
    for (const seg of segments) {
      if (!seg) continue;
      if (typeof current.getDirectoryHandle !== 'function') return null;
      try {
        current = await current.getDirectoryHandle(seg, { create });
      } catch {
        return null;
      }
    }
    return current;
  }

  public async ensureDirectory(relativePath: string): Promise<void> {
    const clean = assertSafeRelativePathOrThrow(relativePath);
    const segments = clean.split('/').filter(Boolean);
    const dir = await this.resolveParentDirectoryHandle(segments, true);
    if (!dir) {
      throw new Error(`Impossible de créer le sous-dossier "${clean}" dans "${this.getLabel()}".`);
    }
  }

  public async readTextFile(relativePath: string): Promise<string | null> {
    if (!isSafeRelativePath(relativePath)) {
      throw new Error(`Chemin relatif interdit (hors racine du dossier) : "${relativePath}"`);
    }
    const clean = normalizeFolderRelativePath(relativePath, { stripRootPrefix: true });
    if (!clean) return null;
    const segments = clean.split('/').filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) return null;

    const parentDir = await this.resolveParentDirectoryHandle(segments, false);
    if (!parentDir || typeof parentDir.getFileHandle !== 'function') return null;

    try {
      const fileHandle = await parentDir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  public async writeTextFile(relativePath: string, content: string): Promise<void> {
    const clean = assertSafeRelativePathOrThrow(relativePath);

    // Serialize disk writes through writeChain and abort writable stream on any error
    // so Chromium's swap-file mechanism discards partial bytes instead of corrupting JSON.
    const task = this.writeChain.then(async () => {
      const segments = clean.split('/').filter(Boolean);
      const fileName = segments.pop();
      if (!fileName) {
        throw new Error(`Nom de fichier manquant dans "${clean}".`);
      }
      const parentDir = await this.resolveParentDirectoryHandle(segments, true);
      if (!parentDir || typeof parentDir.getFileHandle !== 'function') {
        throw new Error(`Impossible d'accéder au dossier parent pour "${clean}".`);
      }
      const fileHandle = await parentDir.getFileHandle(fileName, { create: true });
      if (typeof fileHandle.createWritable !== 'function') {
        throw new Error(
          `L'écriture sur disque (createWritable) n'est pas prise en charge pour "${clean}".`
        );
      }
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(content);
        await writable.close();
      } catch (writeErr) {
        try {
          await writable.abort?.();
        } catch {
          /* ignore secondary abort failure */
        }
        throw writeErr;
      }
    });

    this.writeChain = task.catch(() => {});
    return task;
  }

  public async createSubdirectoryAdapter(subdirectoryName: string): Promise<IFolderFsAdapter> {
    const cleanName = sanitizeSubdirectoryNameOrThrow(subdirectoryName);
    if (typeof this.rootHandle.getDirectoryHandle !== 'function') {
      throw new Error("La création de sous-dossier n'est pas supportée par ce navigateur.");
    }
    const subHandle = await this.rootHandle.getDirectoryHandle(cleanName, { create: true });
    return new BrowserDirectoryFsAdapter(subHandle, `${this.getLabel()}/${cleanName}`);
  }

  public async readAllTextFiles(): Promise<Map<string, string>> {
    const entries = await this.listEntries(2);
    const map = new Map<string, string>();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (!entry.path.toLowerCase().endsWith('.json')) continue;
      const content = await this.readTextFile(entry.path);
      if (content !== null) {
        map.set(entry.path, content);
      }
    }
    return map;
  }
}

// ============================================================================
// 3. IndexedDB Persistence for Browser Directory Handle
// ============================================================================

export async function saveDirectoryHandleToIdb(
  handle: ReadWriteBrowserDirectoryHandleLike
): Promise<void> {
  try {
    await indexedDBService.setItem(IDB_FOLDER_HANDLE_STORAGE_KEY, handle);
  } catch {
    /* ignore in environments where structured cloning of FileSystemHandle is unavailable */
  }
}

export async function loadDirectoryHandleFromIdb(): Promise<ReadWriteBrowserDirectoryHandleLike | null> {
  try {
    const raw = await indexedDBService.getItem<ReadWriteBrowserDirectoryHandleLike>(
      IDB_FOLDER_HANDLE_STORAGE_KEY
    );
    if (raw && typeof raw === 'object' && raw.kind === 'directory') {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearDirectoryHandleFromIdb(): Promise<void> {
  try {
    await indexedDBService.removeItem(IDB_FOLDER_HANDLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
