import {
  createManifestRecord,
  validateManifest,
  type FolderSsotManifest,
  type ManifestValidationResult,
} from './folderManifest';
import {
  FOLDER_MANIFEST_FILENAME,
  isSafeRelativePath,
  normalizeFolderRelativePath,
  withDataFolderRoot,
} from './folderStorePaths';
import {
  ALL_CANONICAL_FILES,
  buildManifestFilesMap,
  CANONICAL_FOLDER_DIRECTORIES,
} from './folderStructure';

export type FolderInspectionStatus =
  | 'EMPTY'
  | 'VALID_FULL'
  | 'PARTIAL'
  | 'FOREIGN_NONEMPTY'
  | 'INVALID_MANIFEST';

export interface FolderEntryDescriptor {
  path: string;
  isDirectory: boolean;
}

export interface FolderInspectionResult {
  status: FolderInspectionStatus;
  hasManifest: boolean;
  manifestValidation: ManifestValidationResult | null;
  presentDirectories: string[];
  missingDirectories: string[];
  presentFiles: string[];
  missingFiles: string[];
  /** Entries found in the folder that are outside the canonical GMAO tree. */
  foreignEntries: string[];
  /** Paths where a canonical directory exists as a file or vice-versa. */
  typeConflicts: string[];
  warnings: string[];
  stats: {
    totalEntriesScanned: number;
    requiredDirectories: number;
    requiredFiles: number;
    matchedCanonicalPaths: number;
  };
}

export interface FolderMaterializedEntry {
  path: string;
  isDirectory: boolean;
  /** `null` for directories; UTF-8 JSON text for files. */
  content: string | null;
}

export interface FolderRepairPlan {
  status: FolderInspectionStatus;
  canRepair: boolean;
  /** Canonical directories and files to create (never includes already-present files). */
  create: string[];
  /** Already-present canonical paths preserved untouched (never wiped). */
  skip: string[];
  warnings: string[];
}

export interface BuildEmptyStructureOptions {
  nowIso?: string;
  /** When true, prefixes all paths with `GMAO_Data/` (useful for ZIP generation). */
  includeRootPrefix?: boolean;
}

export { validateManifest };

const REQUIRED_DIR_SET = new Set(
  CANONICAL_FOLDER_DIRECTORIES.filter((d) => d.required).map((d) => d.path)
);
const REQUIRED_FILE_SET = new Set(
  ALL_CANONICAL_FILES.filter((f) => f.required).map((f) => f.path)
);

/**
 * Inspects a directory listing (pure & OS-agnostic) and classifies it into one of:
 * - `EMPTY`: no entries at all — safe to initialize full canonical tree.
 * - `VALID_FULL`: valid manifest + all required directories and JSON files present.
 * - `PARTIAL`: recognized GMAO structure (or valid manifest) with missing dirs/files.
 * - `FOREIGN_NONEMPTY`: non-empty folder containing no canonical GMAO markers — refuse silent init.
 * - `INVALID_MANIFEST`: `manifest.json` exists or was supplied but fails schema validation.
 */
export function inspectPath(
  entries: readonly FolderEntryDescriptor[],
  manifestRaw?: unknown
): FolderInspectionResult {
  const warnings: string[] = [];
  const normalizedDirs = new Set<string>();
  const normalizedFiles = new Set<string>();
  const foreignEntries: string[] = [];
  const typeConflicts: string[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string') continue;
    if (!isSafeRelativePath(entry.path)) {
      warnings.push(`Ignored unsafe path outside folder root: "${entry.path}".`);
      continue;
    }
    const clean = normalizeFolderRelativePath(entry.path, { stripRootPrefix: true });
    if (!clean) continue; // Ignore bare root marker ("GMAO_Data" or "")

    if (entry.isDirectory) {
      normalizedDirs.add(clean);
    } else {
      normalizedFiles.add(clean);
    }
  }

  const totalEntriesScanned = normalizedDirs.size + normalizedFiles.size;
  const hasManifestFile = normalizedFiles.has(FOLDER_MANIFEST_FILENAME);
  const hasManifestAsDir = normalizedDirs.has(FOLDER_MANIFEST_FILENAME);

  if (hasManifestAsDir) {
    typeConflicts.push(FOLDER_MANIFEST_FILENAME);
    warnings.push(`"${FOLDER_MANIFEST_FILENAME}" exists as a directory instead of a JSON file.`);
  }

  // Evaluate canonical directories
  const presentDirectories: string[] = [];
  const missingDirectories: string[] = [];
  for (const dirSpec of CANONICAL_FOLDER_DIRECTORIES) {
    if (normalizedDirs.has(dirSpec.path)) {
      presentDirectories.push(dirSpec.path);
    } else if (normalizedFiles.has(dirSpec.path)) {
      typeConflicts.push(dirSpec.path);
      missingDirectories.push(dirSpec.path);
      warnings.push(`Canonical directory "${dirSpec.path}" conflicts with an existing file.`);
    } else if (dirSpec.required) {
      missingDirectories.push(dirSpec.path);
    }
  }

  // Evaluate canonical data files (catalog/*.json + operational/*.json)
  const presentFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const fileSpec of ALL_CANONICAL_FILES) {
    if (normalizedFiles.has(fileSpec.path)) {
      presentFiles.push(fileSpec.path);
    } else if (normalizedDirs.has(fileSpec.path)) {
      typeConflicts.push(fileSpec.path);
      missingFiles.push(fileSpec.path);
      warnings.push(`Canonical file "${fileSpec.path}" conflicts with an existing directory.`);
    } else if (fileSpec.required) {
      missingFiles.push(fileSpec.path);
    }
  }

  // Track foreign entries outside canonical tree (files inside exports/ are allowed mirrors, not foreign)
  for (const dir of normalizedDirs) {
    if (dir === FOLDER_MANIFEST_FILENAME) continue;
    if (REQUIRED_DIR_SET.has(dir) || dir.startsWith('exports/')) continue;
    if (REQUIRED_FILE_SET.has(dir)) continue; // already tracked as typeConflict
    foreignEntries.push(dir);
  }
  for (const file of normalizedFiles) {
    if (file === FOLDER_MANIFEST_FILENAME) continue;
    if (REQUIRED_FILE_SET.has(file) || file.startsWith('exports/')) continue;
    if (REQUIRED_DIR_SET.has(file)) continue; // already tracked as typeConflict
    foreignEntries.push(file);
  }

  // Validate manifest if raw payload was provided
  let manifestValidation: ManifestValidationResult | null = null;
  if (manifestRaw !== undefined) {
    manifestValidation = validateManifest(manifestRaw);
  }

  const matchedCanonicalPaths =
    (hasManifestFile ? 1 : 0) + presentDirectories.length + presentFiles.length;

  const stats = {
    totalEntriesScanned,
    requiredDirectories: CANONICAL_FOLDER_DIRECTORIES.filter((d) => d.required).length,
    requiredFiles: ALL_CANONICAL_FILES.filter((f) => f.required).length,
    matchedCanonicalPaths,
  };

  // 1. Explicit manifest error always takes precedence (fail-closed)
  if (hasManifestAsDir || (manifestValidation && !manifestValidation.ok)) {
    const errList = manifestValidation?.errors ?? ['manifest.json is not a readable JSON file.'];
    warnings.push(...errList);
    return {
      status: 'INVALID_MANIFEST',
      hasManifest: hasManifestFile,
      manifestValidation: manifestValidation ?? { ok: false, errors: errList },
      presentDirectories,
      missingDirectories,
      presentFiles,
      missingFiles,
      foreignEntries,
      typeConflicts,
      warnings,
      stats,
    };
  }

  // 2. Completely empty directory
  if (totalEntriesScanned === 0 && manifestRaw === undefined) {
    return {
      status: 'EMPTY',
      hasManifest: false,
      manifestValidation: null,
      presentDirectories,
      missingDirectories,
      presentFiles,
      missingFiles,
      foreignEntries,
      typeConflicts,
      warnings,
      stats,
    };
  }

  // 3. Non-empty folder with zero canonical GMAO markers
  if (matchedCanonicalPaths === 0 && manifestValidation === null) {
    warnings.push(
      'Folder is non-empty and contains no GMAO_FOLDER_SSOT manifest or canonical structure.'
    );
    return {
      status: 'FOREIGN_NONEMPTY',
      hasManifest: false,
      manifestValidation: null,
      presentDirectories,
      missingDirectories,
      presentFiles,
      missingFiles,
      foreignEntries,
      typeConflicts,
      warnings,
      stats,
    };
  }

  // 4. Check full structural completeness
  const isStructurallyComplete =
    hasManifestFile &&
    missingDirectories.length === 0 &&
    missingFiles.length === 0 &&
    typeConflicts.length === 0;

  if (isStructurallyComplete) {
    if (manifestValidation === null) {
      warnings.push(
        'Structure verified from directory listing only; manifest.json content was not supplied.'
      );
    }
    if (foreignEntries.length > 0) {
      warnings.push(
        `${foreignEntries.length} non-canonical item(s) detected alongside valid GMAO structure; they will be ignored.`
      );
    }
    return {
      status: 'VALID_FULL',
      hasManifest: true,
      manifestValidation,
      presentDirectories,
      missingDirectories,
      presentFiles,
      missingFiles,
      foreignEntries,
      typeConflicts,
      warnings,
      stats,
    };
  }

  // 5. Partial GMAO structure (missing manifest and/or missing dirs/files)
  if (!hasManifestFile) {
    warnings.push(`Missing "${FOLDER_MANIFEST_FILENAME}" — can be regenerated during repair.`);
  }
  if (foreignEntries.length > 0) {
    warnings.push(
      `${foreignEntries.length} non-canonical item(s) detected; repair will preserve them untouched.`
    );
  }

  return {
    status: 'PARTIAL',
    hasManifest: hasManifestFile,
    manifestValidation,
    presentDirectories,
    missingDirectories,
    presentFiles,
    missingFiles,
    foreignEntries,
    typeConflicts,
    warnings,
    stats,
  };
}

/**
 * Generates the complete empty canonical `GMAO_Data` structure ready for initialization
 * or downloadable ZIP packaging:
 * - Directories (`catalog`, `operational`, `exports`) emitted with `isDirectory: true, content: null`
 * - `manifest.json` emitted as formatted JSON with `GMAO_FOLDER_SSOT` contract
 * - `catalog/*.json` emitted as formatted Type A-aligned empty bundle objects (`{ bundleType, ...: [] }`)
 * - `operational/*.json` emitted as empty JSON arrays (`[]`)
 */
export function buildEmptyStructure(
  options: BuildEmptyStructureOptions = {}
): FolderMaterializedEntry[] {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const includeRootPrefix = options.includeRootPrefix ?? false;
  const formatPath = (rel: string) => (includeRootPrefix ? withDataFolderRoot(rel) : rel);

  const manifest: FolderSsotManifest = createManifestRecord(buildManifestFilesMap(), nowIso);
  const entries: FolderMaterializedEntry[] = [];

  if (includeRootPrefix) {
    entries.push({
      path: formatPath(''),
      isDirectory: true,
      content: null,
    });
  }

  for (const dirSpec of CANONICAL_FOLDER_DIRECTORIES) {
    entries.push({
      path: formatPath(dirSpec.path),
      isDirectory: true,
      content: null,
    });
  }

  entries.push({
    path: formatPath(FOLDER_MANIFEST_FILENAME),
    isDirectory: false,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });

  for (const fileSpec of ALL_CANONICAL_FILES) {
    entries.push({
      path: formatPath(fileSpec.path),
      isDirectory: false,
      content: `${JSON.stringify(fileSpec.buildEmptyBody(), null, 2)}\n`,
    });
  }

  return entries;
}

/**
 * Produces a strictly non-destructive repair / initialization plan from an inspection result.
 *
 * Non-negotiable safety rules:
 * - NEVER wipes or schedules overwriting of existing JSON files (all present files go to `skip`).
 * - NEVER initializes inside a `FOREIGN_NONEMPTY` folder (`canRepair: false`, `create: []`).
 * - NEVER silently overwrites an `INVALID_MANIFEST` (`canRepair: false`, `create: []`).
 * - `VALID_FULL` produces `create: []` (idempotent no-op).
 */
export function planRepair(inspection: FolderInspectionResult): FolderRepairPlan {
  const warnings: string[] = [...inspection.warnings];

  if (inspection.status === 'FOREIGN_NONEMPTY') {
    return {
      status: inspection.status,
      canRepair: false,
      create: [],
      skip: [...inspection.foreignEntries],
      warnings: [
        ...warnings,
        'Initialisation refusée : le dossier cible contient des fichiers tiers. Choisissez un dossier vide ou créez un sous-dossier GMAO_Data.',
      ],
    };
  }

  if (inspection.status === 'INVALID_MANIFEST') {
    return {
      status: inspection.status,
      canRepair: false,
      create: [],
      skip: [
        ...(inspection.hasManifest ? [FOLDER_MANIFEST_FILENAME] : []),
        ...inspection.presentDirectories,
        ...inspection.presentFiles,
      ],
      warnings: [
        ...warnings,
        'Réparation automatique bloquée : manifest.json invalide ou corrompu. Vérifiez le fichier avant toute intervention.',
      ],
    };
  }

  if (inspection.typeConflicts.length > 0) {
    return {
      status: inspection.status,
      canRepair: false,
      create: [],
      skip: [
        ...(inspection.hasManifest ? [FOLDER_MANIFEST_FILENAME] : []),
        ...inspection.presentDirectories,
        ...inspection.presentFiles,
      ],
      warnings: [
        ...warnings,
        `Conflit de type fichier/dossier détecté sur : ${inspection.typeConflicts.join(', ')}. Résolution manuelle requise.`,
      ],
    };
  }

  if (inspection.status === 'VALID_FULL') {
    return {
      status: inspection.status,
      canRepair: true,
      create: [],
      skip: [
        FOLDER_MANIFEST_FILENAME,
        ...inspection.presentDirectories,
        ...inspection.presentFiles,
      ],
      warnings,
    };
  }

  // EMPTY or PARTIAL: create ONLY missing directories, missing manifest, and missing JSON files
  const create: string[] = [];
  const skip: string[] = [];

  for (const dir of CANONICAL_FOLDER_DIRECTORIES) {
    if (inspection.presentDirectories.includes(dir.path)) {
      skip.push(dir.path);
    } else if (dir.required) {
      create.push(dir.path);
    }
  }

  if (inspection.hasManifest) {
    skip.push(FOLDER_MANIFEST_FILENAME);
  } else {
    create.push(FOLDER_MANIFEST_FILENAME);
  }

  for (const file of ALL_CANONICAL_FILES) {
    if (inspection.presentFiles.includes(file.path)) {
      skip.push(file.path);
    } else if (file.required) {
      create.push(file.path);
    }
  }

  return {
    status: inspection.status,
    canRepair: true,
    create,
    skip,
    warnings,
  };
}
