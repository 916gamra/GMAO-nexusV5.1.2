import { APP_VERSION } from '../../config/appVersion';
import { TYPE_A_SCHEMA_VERSION } from '../../services/import/typeAExcelBridge';
import type { TypeAExcelBundleKind } from '../../services/import/typeAExcelBridge';

/**
 * Canonical manifest contract for GMAO Data Folder SSOT (Phase L1 + L2).
 *
 * Schema Version Policy:
 * - `schemaVersion` aligns directly with `TYPE_A_SCHEMA_VERSION` (`'5.0.2'`) from
 *   `src/services/import/typeAExcelBridge.ts`, because `catalog/*.json` files mirror
 *   the exact Type A bundle contract (`REF_PARC`, `REF_PERSONNEL`, `ASSETS_MACHINES`,
 *   `REF_PDR`, `PM_CATALOG`, `ENTREPOT_BOM`, `CM_CATALOG`).
 * - `appVersion` tracks the running application build (`APP_VERSION`, currently `'5.1.2'`).
 * - Keeping `schemaVersion` decoupled from patch-level `appVersion` prevents unnecessary
 *   structural migration prompts on minor/patch app updates while still flagging breaking
 *   schema changes.
 */

export const FOLDER_MANIFEST_FORMAT = 'GMAO_FOLDER_SSOT' as const;
export const FOLDER_SCHEMA_VERSION = TYPE_A_SCHEMA_VERSION;

export type FolderFileRole = 'catalog' | 'operational' | 'config';

export interface FolderManifestFileEntry {
  required: boolean;
  role: FolderFileRole;
  /** Present on catalog entries to bind 1:1 with Type A bundle kinds. */
  typeABundleKind?: TypeAExcelBundleKind;
  /** Canonical STORAGE_KEYS identifiers mapped to this file. */
  storageKeys?: readonly string[];
}

export interface FolderSsotManifest {
  format: typeof FOLDER_MANIFEST_FORMAT;
  schemaVersion: string;
  appVersion: string;
  createdAt: string;
  lastStructureCheckAt: string;
  lastUpdatedAt?: string;
  files: Record<string, FolderManifestFileEntry>;
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: string[];
  manifest?: FolderSsotManifest;
}

const VALID_ROLES: ReadonlySet<string> = new Set<string>(['catalog', 'operational', 'config']);

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

/**
 * Validates raw manifest input (either a parsed object or raw JSON string).
 * Fails closed on malformed JSON, wrong format signature, missing timestamps/versions,
 * or invalid file table entries.
 */
export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = [];
  let candidate: unknown = raw;

  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ['manifest.json is not valid JSON.'] };
    }
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: ['manifest.json root must be a JSON object.'] };
  }

  const obj = candidate as Record<string, unknown>;

  if (obj.format !== FOLDER_MANIFEST_FORMAT) {
    errors.push(
      `Invalid manifest format: expected "${FOLDER_MANIFEST_FORMAT}", got "${String(obj.format ?? '')}".`
    );
  }

  if (typeof obj.schemaVersion !== 'string' || !obj.schemaVersion.trim()) {
    errors.push('Missing or invalid "schemaVersion" string.');
  }

  if (typeof obj.appVersion !== 'string' || !obj.appVersion.trim()) {
    errors.push('Missing or invalid "appVersion" string.');
  }

  if (!isIsoDateString(obj.createdAt)) {
    errors.push('Missing or invalid ISO timestamp "createdAt".');
  }

  if (!isIsoDateString(obj.lastStructureCheckAt)) {
    errors.push('Missing or invalid ISO timestamp "lastStructureCheckAt".');
  }

  if (!obj.files || typeof obj.files !== 'object' || Array.isArray(obj.files)) {
    errors.push('Missing or invalid "files" dictionary.');
  } else {
    const fileEntries = Object.entries(obj.files as Record<string, unknown>);
    if (fileEntries.length === 0) {
      errors.push('Manifest "files" dictionary must declare at least one canonical file.');
    }
    for (const [filePath, meta] of fileEntries) {
      if (!filePath.trim()) {
        errors.push('Manifest "files" contains an empty file path key.');
        continue;
      }
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        errors.push(`Manifest entry "${filePath}" must be an object.`);
        continue;
      }
      const entry = meta as Record<string, unknown>;
      if (typeof entry.required !== 'boolean') {
        errors.push(`Manifest entry "${filePath}" must define boolean "required".`);
      }
      if (typeof entry.role !== 'string' || !VALID_ROLES.has(entry.role)) {
        errors.push(
          `Manifest entry "${filePath}" has invalid role "${String(entry.role ?? '')}" (expected "catalog", "operational", or "config").`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    manifest: obj as unknown as FolderSsotManifest,
  };
}

/**
 * Helper used by structure builders to assemble a valid manifest with current versions.
 */
export function createManifestRecord(
  files: Record<string, FolderManifestFileEntry>,
  nowIso: string = new Date().toISOString()
): FolderSsotManifest {
  return {
    format: FOLDER_MANIFEST_FORMAT,
    schemaVersion: FOLDER_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: nowIso,
    lastStructureCheckAt: nowIso,
    lastUpdatedAt: nowIso,
    files,
  };
}
