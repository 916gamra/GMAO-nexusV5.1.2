import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_CANONICAL_FILES,
  buildEmptyStructure,
  buildEmptyStructureZipBytes,
  CANONICAL_CATALOG_FILES,
  CANONICAL_FOLDER_DIRECTORIES,
  CANONICAL_OPERATIONAL_FILES,
  FOLDER_MANIFEST_FILENAME,
  FOLDER_MANIFEST_FORMAT,
  FOLDER_SCHEMA_VERSION,
  GMAO_DATA_ROOT_DIR,
  inspectPath,
  isSafeRelativePath,
  normalizeFolderRelativePath,
  planRepair,
  validateManifest,
} from '../../application/folderStore';
import { APP_VERSION } from '../../config/appVersion';
import { TYPE_A_SCHEMA_VERSION, TYPE_A_WORKBOOK_SPECS } from '../../services/import/typeAExcelBridge';

describe('FOLDER-SSOT-L1 — Canonical Data Folder Structure & Repair Engine', () => {
  const FIXED_ISO = '2026-11-22T18:00:00.000Z';

  it('EMPTY: detects empty folder and produces full init plan with valid manifest and canonical JSON bodies', () => {
    const inspection = inspectPath([]);
    expect(inspection.status).toBe('EMPTY');
    expect(inspection.hasManifest).toBe(false);
    expect(inspection.missingDirectories).toEqual(['catalog', 'operational', 'exports']);
    expect(inspection.missingFiles).toHaveLength(ALL_CANONICAL_FILES.length);

    const repair = planRepair(inspection);
    expect(repair.canRepair).toBe(true);
    expect(repair.skip).toEqual([]);
    expect(repair.create).toContain('catalog');
    expect(repair.create).toContain('operational');
    expect(repair.create).toContain('exports');
    expect(repair.create).toContain(FOLDER_MANIFEST_FILENAME);
    for (const file of ALL_CANONICAL_FILES) {
      expect(repair.create).toContain(file.path);
    }

    const materialized = buildEmptyStructure({ nowIso: FIXED_ISO });
    const manifestEntry = materialized.find((e) => e.path === FOLDER_MANIFEST_FILENAME);
    expect(manifestEntry).toBeDefined();
    expect(manifestEntry?.isDirectory).toBe(false);
    expect(typeof manifestEntry?.content).toBe('string');

    const manifestValidation = validateManifest(manifestEntry?.content);
    expect(manifestValidation.ok).toBe(true);
    expect(manifestValidation.errors).toEqual([]);
    expect(manifestValidation.manifest?.format).toBe(FOLDER_MANIFEST_FORMAT);
    expect(manifestValidation.manifest?.schemaVersion).toBe(FOLDER_SCHEMA_VERSION);
    expect(manifestValidation.manifest?.schemaVersion).toBe(TYPE_A_SCHEMA_VERSION);
    expect(manifestValidation.manifest?.appVersion).toBe(APP_VERSION);
    expect(manifestValidation.manifest?.createdAt).toBe(FIXED_ISO);
    expect(manifestValidation.manifest?.lastStructureCheckAt).toBe(FIXED_ISO);

    // Directories are explicit markers with null content
    for (const dir of CANONICAL_FOLDER_DIRECTORIES) {
      const dirEntry = materialized.find((e) => e.path === dir.path);
      expect(dirEntry?.isDirectory).toBe(true);
      expect(dirEntry?.content).toBeNull();
    }

    // Catalog JSON files are Type A-aligned objects; operational JSON files are arrays
    for (const cat of CANONICAL_CATALOG_FILES) {
      const entry = materialized.find((e) => e.path === cat.path);
      expect(entry?.isDirectory).toBe(false);
      const parsed = JSON.parse(entry?.content || '') as Record<string, unknown>;
      expect(Array.isArray(parsed)).toBe(false);
      expect(parsed.bundleType).toBe(cat.typeABundleKind);
    }
    for (const op of CANONICAL_OPERATIONAL_FILES) {
      const entry = materialized.find((e) => e.path === op.path);
      expect(entry?.isDirectory).toBe(false);
      const parsed = JSON.parse(entry?.content || '');
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    }
  });

  it('VALID_FULL: detects complete canonical tree with valid manifest and repair creates nothing', () => {
    const emptyTree = buildEmptyStructure({ nowIso: FIXED_ISO });
    const manifestRaw = emptyTree.find((e) => e.path === FOLDER_MANIFEST_FILENAME)?.content;
    const entries = emptyTree.map((e) => ({ path: e.path, isDirectory: e.isDirectory }));

    const inspection = inspectPath(entries, manifestRaw);
    expect(inspection.status).toBe('VALID_FULL');
    expect(inspection.hasManifest).toBe(true);
    expect(inspection.manifestValidation?.ok).toBe(true);
    expect(inspection.missingDirectories).toEqual([]);
    expect(inspection.missingFiles).toEqual([]);
    expect(inspection.foreignEntries).toEqual([]);

    const repair = planRepair(inspection);
    expect(repair.canRepair).toBe(true);
    expect(repair.create).toEqual([]);
    expect(repair.skip).toContain(FOLDER_MANIFEST_FILENAME);
    expect(repair.skip).toContain('catalog/ref_parc.json');
    expect(repair.skip).toContain('operational/mouvements.json');
  });

  it('PARTIAL: repairs ONLY missing files/dirs while preserving all existing JSON file paths untouched', () => {
    const emptyTree = buildEmptyStructure({ nowIso: FIXED_ISO });
    const manifestRaw = emptyTree.find((e) => e.path === FOLDER_MANIFEST_FILENAME)?.content;

    const existingEntries = [
      { path: 'catalog', isDirectory: true },
      { path: 'operational', isDirectory: true },
      { path: FOLDER_MANIFEST_FILENAME, isDirectory: false },
      { path: 'catalog/ref_parc.json', isDirectory: false },
      { path: 'catalog/ref_pdr.json', isDirectory: false },
      { path: 'operational/mouvements.json', isDirectory: false },
    ];

    const inspection = inspectPath(existingEntries, manifestRaw);
    expect(inspection.status).toBe('PARTIAL');
    expect(inspection.missingDirectories).toEqual(['exports']);
    expect(inspection.presentFiles).toEqual([
      'catalog/ref_parc.json',
      'catalog/ref_pdr.json',
      'operational/mouvements.json',
    ]);
    expect(inspection.missingFiles).toContain('catalog/assets_machines.json');
    expect(inspection.missingFiles).toContain('operational/corrective_interventions.json');

    const repair = planRepair(inspection);
    expect(repair.canRepair).toBe(true);
    // Missing items scheduled for creation
    expect(repair.create).toContain('exports');
    expect(repair.create).toContain('catalog/assets_machines.json');
    expect(repair.create).toContain('operational/corrective_interventions.json');
    // Existing items strictly skipped (never overwritten or wiped)
    expect(repair.skip).toContain(FOLDER_MANIFEST_FILENAME);
    expect(repair.skip).toContain('catalog');
    expect(repair.skip).toContain('operational');
    expect(repair.skip).toContain('catalog/ref_parc.json');
    expect(repair.skip).toContain('catalog/ref_pdr.json');
    expect(repair.skip).toContain('operational/mouvements.json');
    expect(repair.create).not.toContain('catalog/ref_parc.json');
    expect(repair.create).not.toContain('operational/mouvements.json');
  });

  it('FOREIGN_NONEMPTY: refuses silent initialization on unrelated non-empty directories', () => {
    const inspection = inspectPath([
      { path: 'Photos', isDirectory: true },
      { path: 'Photos/atelier.jpg', isDirectory: false },
      { path: 'notes.txt', isDirectory: false },
    ]);

    expect(inspection.status).toBe('FOREIGN_NONEMPTY');
    expect(inspection.foreignEntries).toEqual(['Photos', 'Photos/atelier.jpg', 'notes.txt']);

    const repair = planRepair(inspection);
    expect(repair.canRepair).toBe(false);
    expect(repair.create).toEqual([]);
    expect(repair.warnings.length).toBeGreaterThan(0);
  });

  it('INVALID_MANIFEST: flags malformed JSON or invalid schema and blocks automatic repair', () => {
    const emptyTree = buildEmptyStructure({ nowIso: FIXED_ISO });
    const entries = emptyTree.map((e) => ({ path: e.path, isDirectory: e.isDirectory }));

    // Case 1: Malformed JSON syntax
    const badJsonInspection = inspectPath(entries, '{not-valid-json');
    expect(badJsonInspection.status).toBe('INVALID_MANIFEST');
    expect(badJsonInspection.manifestValidation?.ok).toBe(false);
    expect(badJsonInspection.manifestValidation?.errors[0]).toContain('not valid JSON');
    const badJsonRepair = planRepair(badJsonInspection);
    expect(badJsonRepair.canRepair).toBe(false);
    expect(badJsonRepair.create).toEqual([]);

    // Case 2: Wrong format + missing fields
    const wrongFormat = validateManifest({
      format: 'LEGACY_BACKUP',
      schemaVersion: '',
      appVersion: '',
      createdAt: 'not-a-date',
      lastStructureCheckAt: null,
      files: {},
    });
    expect(wrongFormat.ok).toBe(false);
    expect(wrongFormat.errors.length).toBeGreaterThanOrEqual(5);

    const wrongFormatInspection = inspectPath(entries, { format: 'WRONG', files: {} });
    expect(wrongFormatInspection.status).toBe('INVALID_MANIFEST');
    expect(planRepair(wrongFormatInspection).canRepair).toBe(false);
  });

  it('normalizes Windows backslashes and root GMAO_Data prefix while rejecting traversal paths', () => {
    expect(normalizeFolderRelativePath('GMAO_Data\\catalog\\ref_parc.json')).toBe(
      'catalog/ref_parc.json'
    );
    expect(normalizeFolderRelativePath('./manifest.json')).toBe('manifest.json');
    expect(isSafeRelativePath('catalog/ref_parc.json')).toBe(true);
    expect(isSafeRelativePath('../outside.json')).toBe(false);
    expect(isSafeRelativePath('C:\\GMAO_Data\\manifest.json')).toBe(false);

    // Root-prefixed Windows-style listing is still recognized as VALID_FULL
    const prefixed = buildEmptyStructure({ nowIso: FIXED_ISO, includeRootPrefix: true });
    const manifestRaw = prefixed.find((e) => e.path.endsWith(FOLDER_MANIFEST_FILENAME))?.content;
    const windowsDescriptors = prefixed.map((e) => ({
      path: e.path.replace(/\//g, '\\'),
      isDirectory: e.isDirectory,
    }));
    const inspection = inspectPath(windowsDescriptors, manifestRaw);
    expect(inspection.status).toBe('VALID_FULL');
  });

  it('aligns catalog/*.json 1:1 with all 7 official Type A bundles and excludes auth secrets', () => {
    const typeAKinds = Object.keys(TYPE_A_WORKBOOK_SPECS).sort();
    const folderKinds = CANONICAL_CATALOG_FILES.map((f) => f.typeABundleKind).sort();
    expect(folderKinds).toEqual(typeAKinds);

    // REF_PERSONNEL empty body contains zero auth secret keys
    const personnelSpec = CANONICAL_CATALOG_FILES.find((f) => f.typeABundleKind === 'REF_PERSONNEL');
    expect(personnelSpec).toBeDefined();
    const personnelBody = personnelSpec!.buildEmptyBody() as Record<string, unknown>;
    expect(Object.keys(personnelBody).sort()).toEqual(['bundleType', 'operations', 'technicians']);
  });

  it('builds a valid PKZIP archive for the empty GMAO_Data tree', () => {
    const zipBytes = buildEmptyStructureZipBytes(
      buildEmptyStructure({ nowIso: FIXED_ISO, includeRootPrefix: true }),
      new Date(FIXED_ISO)
    );
    // Local file header signature PK\x03\x04
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);
    expect(zipBytes[2]).toBe(0x03);
    expect(zipBytes[3]).toBe(0x04);

    // End of Central Directory signature PK\x05\x06 at tail - 22
    const eocdOffset = zipBytes.length - 22;
    expect(zipBytes[eocdOffset]).toBe(0x50);
    expect(zipBytes[eocdOffset + 1]).toBe(0x4b);
    expect(zipBytes[eocdOffset + 2]).toBe(0x05);
    expect(zipBytes[eocdOffset + 3]).toBe(0x06);

    const decodedAscii = new TextDecoder().decode(zipBytes);
    expect(decodedAscii).toContain(`${GMAO_DATA_ROOT_DIR}/manifest.json`);
    expect(decodedAscii).toContain(`${GMAO_DATA_ROOT_DIR}/catalog/ref_parc.json`);
    expect(decodedAscii).toContain(`${GMAO_DATA_ROOT_DIR}/operational/mouvements.json`);
    expect(decodedAscii).toContain(`${GMAO_DATA_ROOT_DIR}/exports/`);
  });

  it('Phase L1 isolation guard: DataGateway does NOT route live reads/writes through folderStore', () => {
    const dataGatewaySrc = fs.readFileSync(
      path.resolve(__dirname, '../../application/DataGateway.ts'),
      'utf-8'
    );
    expect(dataGatewaySrc).not.toContain('folderStore');
    expect(dataGatewaySrc).not.toContain('folderStoreEngine');
  });
});
