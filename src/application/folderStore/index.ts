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
  ALL_CANONICAL_FILES,
  buildManifestFilesMap,
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
  isDirectoryPickerSupported,
  getSavedDataFolderLabel,
  saveDataFolderLabel,
  clearSavedDataFolderLabel,
  pickAndInspectDirectory,
  buildEmptyStructureZipBytes,
  downloadEmptyDataFolderZip,
  type BrowserDirectoryHandleLike,
  type BrowserFileHandleLike,
  type BrowserFsHandleLike,
  type PickerInspectionReport,
} from './folderBrowserBridge';
