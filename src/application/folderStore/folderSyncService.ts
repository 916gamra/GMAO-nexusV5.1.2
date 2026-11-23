import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import {
  hydrateLiveStateFromFolderFiles,
  serializeLiveStateToFolderFiles,
  serializeSingleFolderFile,
  type FolderHydrationReport,
} from './folderDataSerializer';
import {
  BrowserDirectoryFsAdapter,
  clearDirectoryHandleFromIdb,
  loadDirectoryHandleFromIdb,
  type IFolderFsAdapter,
  type ReadWriteBrowserDirectoryHandleLike,
} from './folderFsAdapter';
import {
  buildEmptyStructure,
  inspectPath,
  planRepair,
  type FolderInspectionResult,
  type FolderRepairPlan,
} from './folderStoreEngine';
import { FOLDER_MANIFEST_FILENAME, GMAO_DATA_ROOT_DIR } from './folderStorePaths';
import { getFolderFilesForStorageKey } from './folderStructure';

export type GmaoStorageMode = 'BROWSER_STORAGE' | 'LOCAL_FOLDER_SSOT';

export type FolderConnectionState =
  | 'DISCONNECTED'
  | 'NEEDS_PERMISSION'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ERROR';

export interface FolderSyncStatusSnapshot {
  storageMode: GmaoStorageMode;
  connectionState: FolderConnectionState;
  activeAdapterLabel: string | null;
  activeAdapterKind: 'browser-fs' | 'memory' | null;
  pendingHandleLabel: string | null;
  dirtyFiles: string[];
  lastSyncAt: string | null;
  lastError: string | null;
}

type FolderSyncStateListener = (snapshot: FolderSyncStatusSnapshot) => void;

class FolderSyncService {
  private activeAdapter: IFolderFsAdapter | null = null;
  private pendingSavedHandle: ReadWriteBrowserDirectoryHandleLike | null = null;
  private manifestCreatedAt: string | null = null;
  private readonly dirtyPaths = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private activeFlushPromise: Promise<string[]> | null = null;
  private isSyncing = false;
  private lastError: string | null = null;
  private readonly listeners = new Set<FolderSyncStateListener>();
  private unsubscribeStorageListener: (() => void) | null = null;
  private lifecycleListenersBound = false;

  constructor() {
    this.ensureStorageHookSubscribed();
    this.bindBrowserLifecycleFlush();
  }

  private ensureStorageHookSubscribed(): void {
    if (this.unsubscribeStorageListener) return;
    this.unsubscribeStorageListener = storageService.subscribeKeyChange((changedKeys) => {
      if (this.getStorageMode() !== 'LOCAL_FOLDER_SSOT') return;

      // Queue dirty paths even while `NEEDS_PERMISSION` after a browser reload so zero edits are lost!
      let touched = false;
      for (const changedKey of changedKeys) {
        const affectedSpecs = getFolderFilesForStorageKey(changedKey);
        for (const spec of affectedSpecs) {
          this.dirtyPaths.add(spec.path);
          touched = true;
        }
      }
      if (!touched) return;

      this.dirtyPaths.add(FOLDER_MANIFEST_FILENAME);
      this.notifyListeners();

      if (this.activeAdapter) {
        this.scheduleDebouncedFlush();
      }
    });
  }

  private bindBrowserLifecycleFlush(): void {
    if (this.lifecycleListenersBound || typeof window === 'undefined') return;
    this.lifecycleListenersBound = true;

    const triggerEagerFlush = () => {
      if (
        this.getStorageMode() === 'LOCAL_FOLDER_SSOT' &&
        this.activeAdapter &&
        this.dirtyPaths.size > 0
      ) {
        this.flushDirtyFilesNow().catch(() => {});
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          triggerEagerFlush();
        }
      });
    }
    window.addEventListener('pagehide', triggerEagerFlush);
  }

  public getStorageMode(): GmaoStorageMode {
    const raw = storageService.getItem(STORAGE_KEYS.STORAGE_MODE);
    return raw === 'LOCAL_FOLDER_SSOT' ? 'LOCAL_FOLDER_SSOT' : 'BROWSER_STORAGE';
  }

  public setStorageMode(mode: GmaoStorageMode): void {
    storageService.setItem(STORAGE_KEYS.STORAGE_MODE, mode);
    if (mode === 'LOCAL_FOLDER_SSOT' && this.activeAdapter && this.dirtyPaths.size > 0) {
      this.scheduleDebouncedFlush(50);
    }
    this.notifyListeners();
  }

  public getActiveAdapter(): IFolderFsAdapter | null {
    return this.activeAdapter;
  }

  public setActiveAdapter(adapter: IFolderFsAdapter | null): void {
    this.activeAdapter = adapter;
    if (adapter) {
      this.pendingSavedHandle = null;
      this.lastError = null;
      storageService.setItem(STORAGE_KEYS.DATA_FOLDER_LABEL, adapter.getLabel());
    }
    this.notifyListeners();
  }

  public getLastSyncAt(): string | null {
    const val = storageService.getItem(STORAGE_KEYS.DATA_FOLDER_LAST_SYNC_AT);
    return typeof val === 'string' && val.trim() ? val.trim() : null;
  }

  private setLastSyncAt(iso: string): void {
    storageService.setItem(STORAGE_KEYS.DATA_FOLDER_LAST_SYNC_AT, iso);
  }

  private computeConnectionState(): FolderConnectionState {
    if (this.isSyncing) return 'SYNCING';
    if (this.lastError) return 'ERROR';
    if (this.activeAdapter) return 'CONNECTED';
    if (this.pendingSavedHandle) return 'NEEDS_PERMISSION';
    return 'DISCONNECTED';
  }

  public getSnapshot(): FolderSyncStatusSnapshot {
    return {
      storageMode: this.getStorageMode(),
      connectionState: this.computeConnectionState(),
      activeAdapterLabel: this.activeAdapter ? this.activeAdapter.getLabel() : null,
      activeAdapterKind: this.activeAdapter ? this.activeAdapter.kind : null,
      pendingHandleLabel: this.pendingSavedHandle
        ? this.pendingSavedHandle.name || GMAO_DATA_ROOT_DIR
        : null,
      dirtyFiles: Array.from(this.dirtyPaths),
      lastSyncAt: this.getLastSyncAt(),
      lastError: this.lastError,
    };
  }

  public subscribe(listener: FolderSyncStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch {
        /* ignore subscriber error */
      }
    }
  }

  private captureManifestCreatedAt(manifestRaw: unknown): void {
    if (typeof manifestRaw !== 'string' || !manifestRaw.trim()) return;
    try {
      const parsed = JSON.parse(manifestRaw) as { createdAt?: unknown };
      if (typeof parsed?.createdAt === 'string' && Number.isFinite(Date.parse(parsed.createdAt))) {
        this.manifestCreatedAt = parsed.createdAt;
      }
    } catch {
      /* ignore malformed manifest */
    }
  }

  /**
   * Restores a previously selected `FileSystemDirectoryHandle` from IndexedDB on app boot.
   * - If browser permission is already `'granted'`, binds the adapter immediately (`CONNECTED`).
   * - If browser permission is `'prompt'` (standard Chromium security after page reload),
   *   stores the handle in `pendingSavedHandle` and sets `connectionState = 'NEEDS_PERMISSION'`
   *   so a single user click can re-authorize without reopening the OS folder picker.
   */
  public async bootstrapFromSavedHandle(): Promise<{
    restored: boolean;
    needsPermission: boolean;
    adapter: BrowserDirectoryFsAdapter | null;
  }> {
    if (this.activeAdapter) {
      return {
        restored: true,
        needsPermission: false,
        adapter: this.activeAdapter instanceof BrowserDirectoryFsAdapter ? this.activeAdapter : null,
      };
    }

    const savedHandle = await loadDirectoryHandleFromIdb();
    if (!savedHandle) {
      this.pendingSavedHandle = null;
      this.notifyListeners();
      return { restored: false, needsPermission: false, adapter: null };
    }

    const candidate = new BrowserDirectoryFsAdapter(savedHandle);
    const alreadyGranted = await candidate.verifyReadWritePermission(false);
    if (alreadyGranted) {
      this.pendingSavedHandle = null;
      this.setActiveAdapter(candidate);
      const manifestRaw = await candidate.readTextFile(FOLDER_MANIFEST_FILENAME);
      this.captureManifestCreatedAt(manifestRaw);
      if (this.getStorageMode() === 'LOCAL_FOLDER_SSOT' && this.dirtyPaths.size > 0) {
        this.scheduleDebouncedFlush(50);
      }
      return { restored: true, needsPermission: false, adapter: candidate };
    }

    this.pendingSavedHandle = savedHandle;
    storageService.setItem(STORAGE_KEYS.DATA_FOLDER_LABEL, savedHandle.name || GMAO_DATA_ROOT_DIR);
    this.notifyListeners();
    return { restored: false, needsPermission: true, adapter: null };
  }

  /**
   * Called from a user click gesture when `connectionState === 'NEEDS_PERMISSION'` to re-authorize
   * the saved IndexedDB folder handle and flush any dirty edits queued prior to reconnection.
   */
  public async requestSavedHandlePermissionAndReconnect(): Promise<{
    adapter: BrowserDirectoryFsAdapter;
    flushedFiles: string[];
  }> {
    const handle = this.pendingSavedHandle ?? (await loadDirectoryHandleFromIdb());
    if (!handle) {
      throw new Error('Aucun dossier mémorisé à réautoriser. Sélectionnez un dossier local.');
    }

    const candidate = new BrowserDirectoryFsAdapter(handle);
    const granted = await candidate.verifyReadWritePermission(true);
    if (!granted) {
      this.lastError = "Autorisation d'écriture refusée par le navigateur.";
      this.notifyListeners();
      throw new Error(this.lastError);
    }

    this.pendingSavedHandle = null;
    this.lastError = null;
    this.setActiveAdapter(candidate);

    const manifestRaw = await candidate.readTextFile(FOLDER_MANIFEST_FILENAME);
    this.captureManifestCreatedAt(manifestRaw);

    let flushedFiles: string[] = [];
    if (this.getStorageMode() === 'LOCAL_FOLDER_SSOT' && this.dirtyPaths.size > 0) {
      flushedFiles = await this.flushDirtyFilesNow();
    }

    this.notifyListeners();
    return { adapter: candidate, flushedFiles };
  }

  /**
   * Cleanly disconnects the active folder adapter and clears the saved IndexedDB handle
   * without deleting or modifying any file on the user's computer disk.
   */
  public async disconnectFolder(
    options: { switchToBrowserMode?: boolean } = {}
  ): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.activeAdapter = null;
    this.pendingSavedHandle = null;
    this.manifestCreatedAt = null;
    this.dirtyPaths.clear();
    this.lastError = null;
    await clearDirectoryHandleFromIdb();
    storageService.removeItem(STORAGE_KEYS.DATA_FOLDER_LABEL);
    if (options.switchToBrowserMode !== false) {
      storageService.setItem(STORAGE_KEYS.STORAGE_MODE, 'BROWSER_STORAGE');
    }
    this.notifyListeners();
  }

  private scheduleDebouncedFlush(delayMs = 120): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flushDirtyFilesNow().catch(() => {});
    }, delayMs);
  }

  /**
   * Serialized, re-entrancy-safe flush of all dirty canonical JSON files to the active folder adapter.
   * Preserves `manifest.createdAt` across incremental updates and re-queues unwritten files on error.
   */
  public async flushDirtyFilesNow(): Promise<string[]> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.activeFlushPromise) {
      await this.activeFlushPromise.catch(() => {});
      if (this.dirtyPaths.size === 0) return [];
    }

    const runFlush = async (): Promise<string[]> => {
      const adapter = this.activeAdapter;
      if (!adapter || this.dirtyPaths.size === 0) {
        return [];
      }

      this.isSyncing = true;
      this.notifyListeners();

      const allWritten: string[] = [];
      let safetyRounds = 0;

      try {
        // Drain dirty paths in bounded rounds in case a write triggers secondary storage updates
        while (this.dirtyPaths.size > 0 && safetyRounds < 4) {
          safetyRounds++;
          const batch = Array.from(this.dirtyPaths);
          this.dirtyPaths.clear();

          // Always write data files first and manifest.json last (commit marker semantics)
          batch.sort((a, b) => {
            if (a === FOLDER_MANIFEST_FILENAME) return 1;
            if (b === FOLDER_MANIFEST_FILENAME) return -1;
            return a.localeCompare(b);
          });

          const nowIso = new Date().toISOString();
          if (!this.manifestCreatedAt) {
            this.manifestCreatedAt = nowIso;
          }

          const batchWritten: string[] = [];
          try {
            for (const relPath of batch) {
              const content = serializeSingleFolderFile(relPath, {
                nowIso,
                existingCreatedAt: this.manifestCreatedAt,
              });
              await adapter.writeTextFile(relPath, content);
              batchWritten.push(relPath);
              if (!allWritten.includes(relPath)) {
                allWritten.push(relPath);
              }
            }
            this.lastError = null;
            this.setLastSyncAt(nowIso);
          } catch (err) {
            this.lastError =
              err instanceof Error ? err.message : "Erreur d'écriture vers le dossier.";
            for (const p of batch) {
              if (!batchWritten.includes(p)) {
                this.dirtyPaths.add(p);
              }
            }
            throw err;
          }
        }
      } finally {
        this.isSyncing = false;
        this.notifyListeners();
      }

      return allWritten;
    };

    const flushPromise = runFlush();
    this.activeFlushPromise = flushPromise;
    try {
      return await flushPromise;
    } finally {
      if (this.activeFlushPromise === flushPromise) {
        this.activeFlushPromise = null;
      }
    }
  }

  /**
   * Inspects the provided folder adapter using `inspectPath` + `planRepair`.
   */
  public async inspectAdapter(adapter: IFolderFsAdapter): Promise<{
    inspection: FolderInspectionResult;
    repairPlan: FolderRepairPlan;
  }> {
    const entries = await adapter.listEntries(2);
    const hasManifest = entries.some(
      (e) => !e.isDirectory && e.path === FOLDER_MANIFEST_FILENAME
    );
    let manifestRaw: unknown = undefined;
    if (hasManifest) {
      const text = await adapter.readTextFile(FOLDER_MANIFEST_FILENAME);
      manifestRaw = text ?? '';
      this.captureManifestCreatedAt(manifestRaw);
    }
    const inspection = inspectPath(entries, manifestRaw);
    const repairPlan = planRepair(inspection);
    return { inspection, repairPlan };
  }

  /**
   * Writes 100% of current live application state (`catalog/`, `operational/`, `config/`, `manifest.json`)
   * into the target folder adapter and activates `LOCAL_FOLDER_SSOT` mode.
   */
  public async pushLiveStateToFolder(
    adapter?: IFolderFsAdapter,
    options: { activateFolderMode?: boolean } = {}
  ): Promise<{ filesWrittenCount: number; syncedAt: string }> {
    const target = adapter ?? this.activeAdapter;
    if (!target) {
      throw new Error('Aucun dossier local actif sélectionné.');
    }

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const existingManifest = await target.readTextFile(FOLDER_MANIFEST_FILENAME);
      this.captureManifestCreatedAt(existingManifest);

      const nowIso = new Date().toISOString();
      if (!this.manifestCreatedAt) {
        this.manifestCreatedAt = nowIso;
      }

      const entries = serializeLiveStateToFolderFiles({
        nowIso,
        includeRootPrefix: false,
      });

      let filesWrittenCount = 0;
      for (const entry of entries) {
        if (entry.isDirectory) {
          await target.ensureDirectory(entry.path);
        } else {
          const content =
            entry.path === FOLDER_MANIFEST_FILENAME
              ? serializeSingleFolderFile(FOLDER_MANIFEST_FILENAME, {
                  nowIso,
                  existingCreatedAt: this.manifestCreatedAt,
                })
              : (entry.content ?? '');
          await target.writeTextFile(entry.path, content);
          filesWrittenCount++;
        }
      }

      this.dirtyPaths.clear();
      this.setActiveAdapter(target);
      if (options.activateFolderMode !== false) {
        this.setStorageMode('LOCAL_FOLDER_SSOT');
      }
      this.lastError = null;
      this.setLastSyncAt(nowIso);

      return { filesWrittenCount, syncedAt: nowIso };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : "Erreur d'écriture vers le dossier.";
      throw err;
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Workflow 1A (`EMPTY` folder ➔ Inject Live App State):
   * Materializes all canonical directories and writes current application data & settings to the folder.
   */
  public async initializeEmptyFolderWithLiveState(
    adapter: IFolderFsAdapter
  ): Promise<{ filesWrittenCount: number; syncedAt: string }> {
    this.manifestCreatedAt = null;
    return this.pushLiveStateToFolder(adapter, { activateFolderMode: true });
  }

  /**
   * Workflow 1B (`EMPTY` folder ➔ Blank Factory Initialization):
   * Materializes the canonical empty structure on disk and hydrates the live application to a clean factory 0 state.
   */
  public async initializeEmptyFolderAsBlankFactory(
    adapter: IFolderFsAdapter
  ): Promise<FolderHydrationReport> {
    this.isSyncing = true;
    this.notifyListeners();

    try {
      const nowIso = new Date().toISOString();
      this.manifestCreatedAt = nowIso;
      const emptyEntries = buildEmptyStructure({ nowIso, includeRootPrefix: false });

      for (const entry of emptyEntries) {
        if (entry.isDirectory) {
          await adapter.ensureDirectory(entry.path);
        } else {
          await adapter.writeTextFile(entry.path, entry.content ?? '');
        }
      }

      this.dirtyPaths.clear();
      this.setActiveAdapter(adapter);
      this.setStorageMode('LOCAL_FOLDER_SSOT');
      this.setLastSyncAt(nowIso);

      const filesMap = await adapter.readAllTextFiles();
      const report = hydrateLiveStateFromFolderFiles(filesMap);
      this.lastError = null;
      return report;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : "Échec de l'initialisation vierge.";
      throw err;
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Workflow 2 (`VALID_FULL` folder ➔ Pull & Hydrate Live State):
   * Reads all JSON files from the folder, hydrates `DataGateway` + `useGmaoStore` + `storageService`,
   * rebuilds `IncrementalStockIndex`, runs Nexus missing-reference discovery, and activates `LOCAL_FOLDER_SSOT`.
   */
  public async loadLiveStateFromFolder(
    adapter?: IFolderFsAdapter,
    options: { activateFolderMode?: boolean } = {}
  ): Promise<FolderHydrationReport> {
    const target = adapter ?? this.activeAdapter;
    if (!target) {
      throw new Error('Aucun dossier local actif sélectionné.');
    }

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const filesMap = await target.readAllTextFiles();
      this.captureManifestCreatedAt(filesMap.get(FOLDER_MANIFEST_FILENAME));

      const report = hydrateLiveStateFromFolderFiles(filesMap);

      this.dirtyPaths.clear();
      this.setActiveAdapter(target);
      if (options.activateFolderMode !== false) {
        this.setStorageMode('LOCAL_FOLDER_SSOT');
      }
      this.lastError = null;
      this.setLastSyncAt(new Date().toISOString());

      return report;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Échec de la lecture depuis le dossier.';
      throw err;
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Workflow 3 (`PARTIAL` folder ➔ Safe Non-Destructive Repair + Hydrate + Missing Reference Audit):
   * Creates ONLY missing directories and missing JSON files (with canonical empty bodies),
   * strictly preserving all existing JSON files in `skip`, then loads the folder data
   * and returns the Nexus missing-reference discovery report.
   */
  public async repairPartialFolderAndLoad(
    adapter: IFolderFsAdapter
  ): Promise<{
    repairPlan: FolderRepairPlan;
    hydrationReport: FolderHydrationReport;
  }> {
    const { inspection, repairPlan } = await this.inspectAdapter(adapter);
    if (!repairPlan.canRepair && inspection.status !== 'VALID_FULL') {
      throw new Error(
        repairPlan.warnings[0] || 'Réparation automatique impossible sur ce dossier.'
      );
    }

    const emptyStructureByPath = new Map(
      buildEmptyStructure({ includeRootPrefix: false }).map((e) => [e.path, e])
    );

    for (const pathToCreate of repairPlan.create) {
      const templateEntry = emptyStructureByPath.get(pathToCreate);
      if (!templateEntry) continue;
      if (templateEntry.isDirectory) {
        await adapter.ensureDirectory(templateEntry.path);
      } else {
        // Double guard: verify file does not already exist on disk before writing empty body
        const existing = await adapter.readTextFile(templateEntry.path);
        if (existing === null) {
          await adapter.writeTextFile(templateEntry.path, templateEntry.content ?? '');
        }
      }
    }

    const hydrationReport = await this.loadLiveStateFromFolder(adapter, {
      activateFolderMode: true,
    });

    return {
      repairPlan,
      hydrationReport,
    };
  }

  /**
   * Workflow 4 (`FOREIGN_NONEMPTY` folder ➔ Create & Use Clean `GMAO_Data/` Subfolder):
   * Leaves all foreign user files untouched in the parent folder, creates a dedicated `GMAO_Data/`
   * subfolder, and initializes it with either the current live app state or a blank factory structure.
   */
  public async createCleanSubfolderInForeignDirectory(
    parentAdapter: IFolderFsAdapter,
    initMode: 'live-state' | 'blank-factory' = 'live-state',
    subfolderName: string = GMAO_DATA_ROOT_DIR
  ): Promise<{
    subfolderAdapter: IFolderFsAdapter;
    hydrationReport?: FolderHydrationReport;
  }> {
    const subfolderAdapter = await parentAdapter.createSubdirectoryAdapter(subfolderName);
    if (initMode === 'blank-factory') {
      const hydrationReport = await this.initializeEmptyFolderAsBlankFactory(subfolderAdapter);
      return { subfolderAdapter, hydrationReport };
    }
    await this.initializeEmptyFolderWithLiveState(subfolderAdapter);
    return { subfolderAdapter };
  }
}

export const folderSyncService = new FolderSyncService();
