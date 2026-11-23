export {
  GMAO_DATA_ROOT_DIR,
  FOLDER_MANIFEST_FILENAME,
  normalizeFolderRelativePath,
  isSafeRelativePath,
  joinFolderRelativePath,
  withDataFolderRoot,
} from './folderStorePaths';

export {
  FOLDER_MANIFEST_FORMAT,
  FOLDER_SCHEMA_VERSION,
  validateManifest,
  createManifestRecord,
  type FolderFileRole,
  type FolderManifestFileEntry,
  type FolderSsotManifest,
  type ManifestValidationResult,
} from './folderManifest';

export {
  CANONICAL_FOLDER_DIRECTORIES,
  CANONICAL_CATALOG_FILES,
  CANONICAL_OPERATIONAL_FILES,
  CANONICAL_CONFIG_FILES,
  ALL_CANONICAL_FILES,
  buildManifestFilesMap,
  getFolderFileSpecByPath,
  getFolderFilesForStorageKey,
  type FolderDirectorySpec,
  type FolderFileSpec,
} from './folderStructure';

export {
  inspectPath,
  buildEmptyStructure,
  planRepair,
  type FolderInspectionStatus,
  type FolderEntryDescriptor,
  type FolderInspectionResult,
  type FolderMaterializedEntry,
  type FolderRepairPlan,
  type BuildEmptyStructureOptions,
} from './folderStoreEngine';

export {
  serializeSingleFolderFile,
  serializeLiveStateToFolderFiles,
  hydrateLiveStateFromFolderFiles,
  type FolderParseError,
  type FolderHydrationReport,
} from './folderDataSerializer';

export {
  IDB_FOLDER_HANDLE_STORAGE_KEY,
  MemoryFolderFsAdapter,
  BrowserDirectoryFsAdapter,
  saveDirectoryHandleToIdb,
  loadDirectoryHandleFromIdb,
  clearDirectoryHandleFromIdb,
  type IFolderFsAdapter,
  type ReadWriteBrowserDirectoryHandleLike,
  type WritableBrowserFileHandleLike,
  type WritableFileStreamLike,
} from './folderFsAdapter';

export {
  folderSyncService,
  type GmaoStorageMode,
  type FolderConnectionState,
  type FolderSyncStatusSnapshot,
} from './folderSyncService';

export {
  isDirectoryPickerSupported,
  getSavedDataFolderLabel,
  saveDataFolderLabel,
  clearSavedDataFolderLabel,
  pickAndInspectDirectory,
  buildEmptyStructureZipBytes,
  buildLiveStateFolderZipBytes,
  parseZipArchiveEntries,
  parseZipArchiveEntriesAsync,
  downloadEmptyDataFolderZip,
  downloadLiveStateDataFolderZip,
  type BrowserDirectoryHandleLike,
  type BrowserFileHandleLike,
  type BrowserFsHandleLike,
  type PickerInspectionReport,
} from './folderBrowserBridge';
