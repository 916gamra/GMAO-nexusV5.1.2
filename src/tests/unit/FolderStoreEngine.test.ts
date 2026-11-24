import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataGateway } from '../../application/DataGateway';
import {
  ALL_CANONICAL_FILES,
  BrowserDirectoryFsAdapter,
  buildEmptyStructure,
  buildEmptyStructureZipBytes,
  buildLiveStateFolderZipBytes,
  CANONICAL_CATALOG_FILES,
  CANONICAL_CONFIG_FILES,
  CANONICAL_FOLDER_DIRECTORIES,
  CANONICAL_OPERATIONAL_FILES,
  FOLDER_MANIFEST_FILENAME,
  FOLDER_MANIFEST_FORMAT,
  FOLDER_SCHEMA_VERSION,
  folderSyncService,
  getFolderPickerCapability,
  GMAO_DATA_ROOT_DIR,
  hydrateLiveStateFromFolderFiles,
  IDB_FOLDER_HANDLE_STORAGE_KEY,
  inspectFolderFromFileList,
  inspectPath,
  isSafeRelativePath,
  MemoryFolderFsAdapter,
  normalizeFolderRelativePath,
  parseZipArchiveEntries,
  parseZipArchiveEntriesAsync,
  planRepair,
  serializeSingleFolderFile,
  validateManifest,
  type IFolderFsAdapter,
  type ReadWriteBrowserDirectoryHandleLike,
  type WritableBrowserFileHandleLike,
} from '../../application/folderStore';
import { stockIndexStore } from '../../application/StockIndexStore';
import { APP_VERSION } from '../../config/appVersion';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { TYPE_A_SCHEMA_VERSION, TYPE_A_WORKBOOK_SPECS } from '../../services/import/typeAExcelBridge';
import { useGmaoStore } from '../../store/useGmaoStore';
import { indexedDBService } from '../../utils/indexedDBService';
import { storageService } from '../../utils/storageService';

describe('FOLDER-SSOT-L1 & L2 — Canonical Data Folder Structure, Repair Engine & Bidirectional Local Sync', () => {
  const FIXED_ISO = '2026-11-22T18:00:00.000Z';

  beforeEach(async () => {
    vi.restoreAllMocks();
    await folderSyncService.disconnectFolder({ switchToBrowserMode: true });
  });

  it('EMPTY: detects empty folder and produces full init plan with valid manifest and canonical JSON bodies across catalog/, operational/, config/, and exports/', () => {
    const inspection = inspectPath([]);
    expect(inspection.status).toBe('EMPTY');
    expect(inspection.hasManifest).toBe(false);
    expect(inspection.missingDirectories).toEqual(['catalog', 'operational', 'config', 'exports']);
    expect(inspection.missingFiles).toHaveLength(ALL_CANONICAL_FILES.length);
    expect(ALL_CANONICAL_FILES).toHaveLength(29); // 7 catalog + 19 operational + 3 config

    const repair = planRepair(inspection);
    expect(repair.canRepair).toBe(true);
    expect(repair.skip).toEqual([]);
    expect(repair.create).toContain('catalog');
    expect(repair.create).toContain('operational');
    expect(repair.create).toContain('config');
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

    // Catalog JSON files are Type A-aligned objects; operational JSON files are arrays; config JSON files are objects
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
    for (const cfg of CANONICAL_CONFIG_FILES) {
      const entry = materialized.find((e) => e.path === cfg.path);
      expect(entry?.isDirectory).toBe(false);
      const parsed = JSON.parse(entry?.content || '');
      expect(typeof parsed).toBe('object');
      expect(Array.isArray(parsed)).toBe(false);
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
    expect(repair.skip).toContain('config/preferences.json');
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
    expect(inspection.missingDirectories).toEqual(['config', 'exports']);
    expect(inspection.presentFiles).toEqual([
      'catalog/ref_parc.json',
      'catalog/ref_pdr.json',
      'operational/mouvements.json',
    ]);
    expect(inspection.missingFiles).toContain('catalog/assets_machines.json');
    expect(inspection.missingFiles).toContain('operational/corrective_interventions.json');
    expect(inspection.missingFiles).toContain('config/preferences.json');

    const repair = planRepair(inspection);
    expect(repair.canRepair).toBe(true);
    // Missing items scheduled for creation
    expect(repair.create).toContain('config');
    expect(repair.create).toContain('exports');
    expect(repair.create).toContain('catalog/assets_machines.json');
    expect(repair.create).toContain('operational/corrective_interventions.json');
    expect(repair.create).toContain('config/preferences.json');
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

  it('builds and parses a valid PKZIP archive for the GMAO_Data tree (ZIP round-trip)', () => {
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
    expect(decodedAscii).toContain(`${GMAO_DATA_ROOT_DIR}/config/preferences.json`);
    expect(decodedAscii).toContain(`${GMAO_DATA_ROOT_DIR}/exports/`);

    const parsedZip = parseZipArchiveEntries(zipBytes);
    expect(parsedZip.filesMap.has('manifest.json')).toBe(true);
    expect(parsedZip.filesMap.has('catalog/ref_parc.json')).toBe(true);
    expect(parsedZip.filesMap.has('config/preferences.json')).toBe(true);
  });

  it('Phase L1/L2 isolation guard: DataGateway does NOT import folderStore directly', () => {
    const dataGatewaySrc = fs.readFileSync(
      path.resolve(__dirname, '../../application/DataGateway.ts'),
      'utf-8'
    );
    expect(dataGatewaySrc).not.toContain('folderStore');
    expect(dataGatewaySrc).not.toContain('folderStoreEngine');
  });

  it('Phase L2: serializes and hydrates 100% of live state (catalogs, operational tables, blueprints, UI preferences) and reflects external JSON edits on reload', async () => {
    // 1. Seed a controlled state into live store & storageService
    DataGateway.clearAllForRealFactory(useGmaoStore.getState());
    storageService.setItem(STORAGE_KEYS.THEME, 'dark');
    storageService.setItem(STORAGE_KEYS.ACCENT_COLOR, 'amber');
    storageService.setItem(STORAGE_KEYS.DENSITY, 'compact');

    const adapter = new MemoryFolderFsAdapter('Test_PC_GMAO_Data');
    await folderSyncService.initializeEmptyFolderWithLiveState(adapter);
    expect(folderSyncService.getStorageMode()).toBe('LOCAL_FOLDER_SSOT');

    // Verify preferences were serialized to config/preferences.json
    const prefsText = await adapter.readTextFile('config/preferences.json');
    expect(prefsText).not.toBeNull();
    const prefsJson = JSON.parse(prefsText!);
    expect(prefsJson.theme).toBe('dark');
    expect(prefsJson.accentColor).toBe('amber');
    expect(prefsJson.density).toBe('compact');

    // 2. Simulate an external manual edit directly inside the folder's JSON files on disk:
    //    - Add a zone & machine in catalog/
    //    - Add a stock movement in operational/mouvements.json referencing an uncatalogued machine 'MCH-EXT-99'
    //    - Change UI theme in config/preferences.json to 'light' and language to 'ar'
    await adapter.writeTextFile(
      'catalog/ref_parc.json',
      JSON.stringify(
        {
          bundleType: 'REF_PARC',
          zones: [{ code_zone: 'ZONE-01', libelle: 'Atelier Tournage' }],
          families: [{ code_family: 'FAM-01', libelle: 'Tours CNC' }],
          templates: [
            {
              code_template: 'TPL-01',
              code_family: 'FAM-01',
              libelle: 'Tour Mazak',
              fabricant: 'Mazak',
              modele: 'QT-200',
            },
          ],
          generalSystemTypes: [],
        },
        null,
        2
      )
    );
    await adapter.writeTextFile(
      'catalog/assets_machines.json',
      JSON.stringify(
        {
          bundleType: 'ASSETS_MACHINES',
          machines: [
            {
              id_machine_registered: 'MCH-01',
              nom: 'Tour CNC Principal',
              id_zone_default: 'ZONE-01',
              id_family: 'FAM-01',
              id_template: 'TPL-01',
              status: 'OPERATIONNELLE',
            },
          ],
        },
        null,
        2
      )
    );
    await adapter.writeTextFile(
      'operational/mouvements.json',
      JSON.stringify(
        [
          {
            id: 'MVT-EXT-1',
            ref: 'PDR-ORPHAN-77',
            designation: 'Roulement Externe',
            type: 'Sortie',
            quantite: 2,
            date: '2026-11-23',
            id_machine_registered: 'MCH-EXT-99',
          },
        ],
        null,
        2
      )
    );
    await adapter.writeTextFile(
      'config/preferences.json',
      JSON.stringify(
        {
          ...prefsJson,
          theme: 'light',
          language: 'ar',
        },
        null,
        2
      )
    );

    // 3. Reload from folder (Pull) and verify live state + Nexus missing-reference explorer
    const hydReport = await folderSyncService.loadLiveStateFromFolder(adapter);
    expect(hydReport.success).toBe(true);
    expect(hydReport.summary.machinesCount).toBe(1);
    expect(hydReport.summary.mouvementsCount).toBe(1);

    const liveStore = useGmaoStore.getState();
    expect(liveStore.machines[0]?.nom).toBe('Tour CNC Principal');
    expect(storageService.getItem(STORAGE_KEYS.THEME)).toBe('light');
    expect(storageService.getItem(STORAGE_KEYS.LANGUAGE)).toBe('ar');

    // Verify Nexus missing-reference explorer detected MCH-EXT-99 and PDR-ORPHAN-77
    const discoveredCodes = hydReport.discoveredMissingReferences.map((d) => d.code);
    expect(discoveredCodes).toContain('MCH-EXT-99');
    expect(discoveredCodes).toContain('PDR-ORPHAN-77');
  });

  it('Phase L2: automatically marks affected JSON files dirty and flushes them to the folder on live state/preference change', async () => {
    const adapter = new MemoryFolderFsAdapter('Live_Dirty_Sync_Test');
    await folderSyncService.initializeEmptyFolderAsBlankFactory(adapter);
    expect(folderSyncService.getStorageMode()).toBe('LOCAL_FOLDER_SSOT');

    // Mutate a UI preference via storageService.setItem
    storageService.setItem(STORAGE_KEYS.ACCENT_COLOR, 'rose');
    const snapBeforeFlush = folderSyncService.getSnapshot();
    expect(snapBeforeFlush.dirtyFiles).toContain('config/preferences.json');
    expect(snapBeforeFlush.dirtyFiles).toContain('manifest.json');

    const written = await folderSyncService.flushDirtyFilesNow();
    expect(written).toContain('config/preferences.json');

    const updatedPrefs = JSON.parse((await adapter.readTextFile('config/preferences.json')) || '{}');
    expect(updatedPrefs.accentColor).toBe('rose');
  });

  it('Phase L2: repairs a PARTIAL folder without wiping existing files and creates a clean GMAO_Data subfolder in FOREIGN_NONEMPTY', async () => {
    // 1. PARTIAL folder containing only manifest.json and operational/corrective_travaux.json
    const fullEmpty = buildEmptyStructure({ nowIso: FIXED_ISO });
    const manifestContent = fullEmpty.find((e) => e.path === FOLDER_MANIFEST_FILENAME)!.content!;
    const partialAdapter = new MemoryFolderFsAdapter('Partial_Folder_Test', [
      { path: FOLDER_MANIFEST_FILENAME, isDirectory: false, content: manifestContent },
      {
        path: 'operational/corrective_travaux.json',
        isDirectory: false,
        content: JSON.stringify(['Remplacement roulement broche', 'Alignement laser']),
      },
    ]);

    const { repairPlan, hydrationReport } =
      await folderSyncService.repairPartialFolderAndLoad(partialAdapter);
    expect(repairPlan.skip).toContain('operational/corrective_travaux.json');
    expect(repairPlan.create.includes('operational/corrective_travaux.json')).toBe(
      false
    );
    expect(hydrationReport.success).toBe(true);
    expect(useGmaoStore.getState().correctiveTravauxAFaire).toEqual([
      'Remplacement roulement broche',
      'Alignement laser',
    ]);

    // 2. FOREIGN_NONEMPTY folder -> create GMAO_Data/ subfolder without touching foreign files
    const foreignAdapter = new MemoryFolderFsAdapter('Bureau_Utilisateur', [
      { path: 'rapport_financier.xlsx', isDirectory: false, content: 'BINARY_XLSX' },
    ]);
    const { subfolderAdapter } = await folderSyncService.createCleanSubfolderInForeignDirectory(
      foreignAdapter,
      'live-state'
    );
    expect(subfolderAdapter.getLabel()).toContain(GMAO_DATA_ROOT_DIR);
    // Foreign file in parent remains intact
    expect(await foreignAdapter.readTextFile('rapport_financier.xlsx')).toBe('BINARY_XLSX');
    // Subfolder has valid full structure
    const { inspection: subInspection } = await folderSyncService.inspectAdapter(subfolderAdapter);
    expect(subInspection.status).toBe('VALID_FULL');

    // 3. Full live state ZIP round-trip
    const liveZipBytes = buildLiveStateFolderZipBytes(new Date(FIXED_ISO));
    const parsedLiveZip = parseZipArchiveEntries(liveZipBytes);
    const rehydrated = hydrateLiveStateFromFolderFiles(parsedLiveZip.filesMap);
    expect(rehydrated.success).toBe(true);
  });

  it('Phase L2.1: upholds Stock Math Invariant (stockInitial + entrees - sorties), clears stale finance/currency on null reset, recovers uncatalogued-zone machines, and leaks zero auth/license secrets', () => {
    // Seed stale currency & financial budgets plus sensitive auth/license keys
    storageService.setItem(STORAGE_KEYS.CURRENCY_CONFIG, { activeCurrency: 'EUR', tvaRate: 20 });
    storageService.setItem(STORAGE_KEYS.FINANCIAL_BUDGETS, { annualBudget: 500000 });
    storageService.setItem(STORAGE_KEYS.LICENSE_RECORD, { secretKey: 'DO-NOT-EXPORT' });

    const files = new Map<string, string>([
      [
        'catalog/ref_pdr.json',
        JSON.stringify({
          bundleType: 'REF_PDR',
          groups: [{ code_group: 'MEC', libelle: 'Mécanique' }],
          types: [{ code_type: 'ROUL', code_group: 'MEC', libelle: 'Roulements' }],
          items: [
            {
              ref: 'PDR-MATH-01',
              designation: 'Roulement 6205',
              code_group: 'MEC',
              code_type: 'ROUL',
              stockInitial: 10,
              seuil: 2,
              prix_unitaire: 45,
            },
          ],
        }),
      ],
      [
        'catalog/assets_machines.json',
        JSON.stringify({
          bundleType: 'ASSETS_MACHINES',
          machines: [
            {
              code_machine: 'MCH-ORPHAN-ZONE',
              designation: 'Presse Hydraulique Hors-Zone',
              code_zone: 'ZONE-MISSING-99',
              code_family: 'FAM-X',
              code_template: 'TPL-X',
              status: 'En service',
            },
          ],
        }),
      ],
      [
        'operational/mouvements.json',
        JSON.stringify([
          {
            id: 'MVT-1',
            ref: 'PDR-MATH-01',
            type: 'Entrée',
            quantite: 5,
            date: '2026-11-23',
          },
          {
            id: 'MVT-2',
            ref: 'PDR-MATH-01',
            type: 'Sortie',
            quantite: 3,
            date: '2026-11-23',
          },
        ]),
      ],
      [
        'config/finance_currency.json',
        JSON.stringify({
          currencyConfig: null,
          financialBudgets: null,
        }),
      ],
    ]);

    const report = hydrateLiveStateFromFolderFiles(files);
    expect(report.success).toBe(true);

    // 1. Stock Math Invariant: 10 + 5 - 3 = 12
    expect(stockIndexStore.index.getStock('PDR-MATH-01')).toBe(12);
    expect(stockIndexStore.index.calculatePhysicalStock('PDR-MATH-01')).toBe(12);

    // 2. Finance & currency null-reset cleared stale storage keys
    expect(storageService.getItem(STORAGE_KEYS.CURRENCY_CONFIG)).toBeNull();
    expect(storageService.getItem(STORAGE_KEYS.FINANCIAL_BUDGETS)).toBeNull();

    // 3. Machine with unknown zone was resiliently preserved with canonical fields & missing zone discovered
    const liveMachines = useGmaoStore.getState().machines;
    const recoveredMachine = liveMachines.find((m) => m.id_machine_registered === 'MCH-ORPHAN-ZONE');
    expect(recoveredMachine).toBeDefined();
    expect(recoveredMachine?.id_templates).toBe('TPL-X');
    expect(recoveredMachine?.id_zone_default).toBe('ZONE-MISSING-99');
    expect(
      report.discoveredMissingReferences.some(
        (d) => d.entityType === 'zone' && d.code === 'ZONE-MISSING-99'
      )
    ).toBe(true);

    // 4. Zero auth/license secrets serialized in ref_personnel.json or system_flags.json
    const personnelSerialized = serializeSingleFolderFile('catalog/ref_personnel.json');
    const systemFlagsSerialized = serializeSingleFolderFile('config/system_flags.json');
    expect(personnelSerialized).not.toMatch(/password|salt|secretKey|LICENSE/i);
    expect(systemFlagsSerialized).not.toMatch(/DO-NOT-EXPORT|LICENSE_RECORD|AUTH_ACCOUNTS/i);
  });

  it('Phase L2.2: enforces fail-closed path traversal guards, atomic writable.abort() rollback, scoped MemoryFolderFsAdapter subdirectories, and Central-Directory DEFLATE/CRC-32 ZIP validation', async () => {
    // 1. Path traversal & drive letter rejection on MemoryFolderFsAdapter
    const mem = new MemoryFolderFsAdapter('Root_PC');
    await expect(mem.writeTextFile('../escape.json', '{}')).rejects.toThrow();
    await expect(mem.readTextFile('C:\\Windows\\win.ini')).rejects.toThrow();
    await expect(mem.createSubdirectoryAdapter('../evil')).rejects.toThrow();

    // 2. Scoped subdirectory shares backing store with parent while isolating foreign root files
    await mem.writeTextFile('notes_personnelles.txt', 'KEEP_ME');
    const sub = await mem.createSubdirectoryAdapter('GMAO_Data');
    await sub.writeTextFile('catalog/ref_parc.json', '{"bundleType":"REF_PARC"}');
    const parentEntries = await mem.listEntries(3);
    expect(parentEntries.some((e) => e.path === 'GMAO_Data' && e.isDirectory)).toBe(true);
    expect(parentEntries.some((e) => e.path === 'GMAO_Data/catalog/ref_parc.json')).toBe(true);
    expect(await mem.readTextFile('notes_personnelles.txt')).toBe('KEEP_ME');
    // Child cannot read parent's foreign file
    expect(await sub.readTextFile('notes_personnelles.txt')).toBeNull();

    // 3. BrowserDirectoryFsAdapter calls writable.abort() when write() throws (atomic-safe rollback)
    let abortCalled = false;
    const mockDirHandle = {
      name: 'Disk_Folder',
      kind: 'directory' as const,
      async getFileHandle() {
        return {
          name: 'manifest.json',
          kind: 'file' as const,
          async getFile() {
            return { async text() { return '{}'; } };
          },
          async createWritable() {
            return {
              async write() {
                throw new Error('ENOSPC: disk full');
              },
              async close() {},
              async abort() {
                abortCalled = true;
              },
            };
          },
        };
      },
    };
    const browserAdapter = new BrowserDirectoryFsAdapter(mockDirHandle);
    await expect(browserAdapter.writeTextFile('manifest.json', '{}')).rejects.toThrow('ENOSPC');
    expect(abortCalled).toBe(true);
    await expect(browserAdapter.writeTextFile('../hack.json', '{}')).rejects.toThrow();

    // 4. ZIP CRC-32 corruption detection & async parsing (STORE + DEFLATE)
    const validZip = buildEmptyStructureZipBytes(
      buildEmptyStructure({ nowIso: FIXED_ISO, includeRootPrefix: true }),
      new Date(FIXED_ISO)
    );
    const asyncParsed = await parseZipArchiveEntriesAsync(validZip);
    expect(asyncParsed.filesMap.has('manifest.json')).toBe(true);
    expect(asyncParsed.filesMap.has('config/preferences.json')).toBe(true);

    // Corrupt a byte inside the first JSON payload and verify CRC-32 check rejects the corrupted archive
    const corruptedZip = new Uint8Array(validZip);
    const manifestIdx = new TextDecoder().decode(corruptedZip).indexOf('GMAO_FOLDER_SSOT');
    expect(manifestIdx).toBeGreaterThan(0);
    corruptedZip[manifestIdx] = corruptedZip[manifestIdx] ^ 0xff;
    expect(() => parseZipArchiveEntries(corruptedZip)).toThrow(/CRC-32/i);

    // 5. Real DEFLATE (method 8) ZIP entry unpacking (Windows Explorer / 7-Zip compatibility)
    if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
      const payloadStr = JSON.stringify({ bundleType: 'REF_PARC', zones: [{ code_zone: 'Z1', libelle: 'Zone 1' }] });
      const rawBytes = new TextEncoder().encode(payloadStr);
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      const reader = cs.readable.getReader();
      const writeDone = (async () => {
        await writer.write(rawBytes);
        await writer.close();
      })();
      const defChunks: Uint8Array[] = [];
      let defLen = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          defChunks.push(value);
          defLen += value.byteLength;
        }
      }
      await writeDone;
      const deflatedBytes = new Uint8Array(defLen);
      let defOffset = 0;
      for (const ch of defChunks) {
        deflatedBytes.set(ch, defOffset);
        defOffset += ch.byteLength;
      }

      const fileNameBytes = new TextEncoder().encode('GMAO_Data/catalog/ref_parc.json');
      // Build minimal valid DEFLATE PKZIP with Local File Header + Central Directory + EOCD
      const lfh = new Uint8Array(30 + fileNameBytes.length);
      const lv = new DataView(lfh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 8, true); // DEFLATE
      lv.setUint32(14, 0, true); // omit CRC check here (0) to focus on DEFLATE inflation
      lv.setUint32(18, deflatedBytes.length, true);
      lv.setUint32(22, rawBytes.length, true);
      lv.setUint16(26, fileNameBytes.length, true);
      lfh.set(fileNameBytes, 30);

      const cdOffset = lfh.length + deflatedBytes.length;
      const cd = new Uint8Array(46 + fileNameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 8, true); // DEFLATE
      cv.setUint32(16, 0, true);
      cv.setUint32(20, deflatedBytes.length, true);
      cv.setUint32(24, rawBytes.length, true);
      cv.setUint16(28, fileNameBytes.length, true);
      cv.setUint32(42, 0, true);
      cd.set(fileNameBytes, 46);

      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, 1, true);
      ev.setUint16(10, 1, true);
      ev.setUint32(12, cd.length, true);
      ev.setUint32(16, cdOffset, true);

      const deflateZip = new Uint8Array(cdOffset + cd.length + eocd.length);
      deflateZip.set(lfh, 0);
      deflateZip.set(deflatedBytes, lfh.length);
      deflateZip.set(cd, cdOffset);
      deflateZip.set(eocd, cdOffset + cd.length);

      const inflatedResult = await parseZipArchiveEntriesAsync(deflateZip);
      expect(inflatedResult.filesMap.get('catalog/ref_parc.json')).toBe(payloadStr);
    }
  });

  it('Phase L2.3: preserves original manifest.createdAt across incremental flushes and commits manifest.json strictly after data files', async () => {
    const ORIGINAL_CREATED_AT = '2025-01-15T10:00:00.000Z';
    const initialTree = buildEmptyStructure({ nowIso: ORIGINAL_CREATED_AT, includeRootPrefix: false });
    const baseAdapter = new MemoryFolderFsAdapter('CreatedAt_Test_Folder', initialTree);

    const writeOrder: string[] = [];
    const spyAdapter: IFolderFsAdapter = {
      kind: baseAdapter.kind,
      getLabel: () => baseAdapter.getLabel(),
      listEntries: (maxDepth) => baseAdapter.listEntries(maxDepth),
      readTextFile: (relPath) => baseAdapter.readTextFile(relPath),
      writeTextFile: async (relPath, content) => {
        writeOrder.push(relPath);
        await baseAdapter.writeTextFile(relPath, content);
      },
      ensureDirectory: (relPath) => baseAdapter.ensureDirectory(relPath),
      createSubdirectoryAdapter: (name) => baseAdapter.createSubdirectoryAdapter(name),
      readAllTextFiles: () => baseAdapter.readAllTextFiles(),
    };

    await folderSyncService.loadLiveStateFromFolder(spyAdapter, { activateFolderMode: true });
    writeOrder.length = 0;

    storageService.setItem(STORAGE_KEYS.THEME, 'dark');
    storageService.setItem(STORAGE_KEYS.ACCENT_COLOR, 'emerald');

    const flushed = await folderSyncService.flushDirtyFilesNow();
    expect(flushed).toContain('config/preferences.json');
    expect(flushed).toContain(FOLDER_MANIFEST_FILENAME);
    // Data file MUST be committed before manifest.json
    expect(writeOrder.indexOf('config/preferences.json')).toBeGreaterThanOrEqual(0);
    expect(writeOrder.indexOf(FOLDER_MANIFEST_FILENAME)).toBeGreaterThan(
      writeOrder.indexOf('config/preferences.json')
    );

    const updatedManifestRaw = await baseAdapter.readTextFile(FOLDER_MANIFEST_FILENAME);
    const updatedManifest = JSON.parse(updatedManifestRaw || '{}') as {
      createdAt?: string;
      lastStructureCheckAt?: string;
    };
    expect(updatedManifest.createdAt).toBe(ORIGINAL_CREATED_AT);
    expect(updatedManifest.lastStructureCheckAt).toBeDefined();
    expect(updatedManifest.lastStructureCheckAt).not.toBe(ORIGINAL_CREATED_AT);
  });

  it('Phase L2.3: boots into NEEDS_PERMISSION after browser reload, queues dirty edits without data loss, and flushes them on 1-click reconnect', async () => {
    const virtualDisk = new Map<string, string>();
    let permissionState: 'granted' | 'prompt' | 'denied' = 'prompt';

    const makeMockDirHandle = (
      dirName: string,
      prefix: string
    ): ReadWriteBrowserDirectoryHandleLike => ({
      name: dirName,
      kind: 'directory',
      async queryPermission() {
        return permissionState;
      },
      async requestPermission() {
        permissionState = 'granted';
        return permissionState;
      },
      async getDirectoryHandle(subName: string) {
        const nextPrefix = prefix ? `${prefix}/${subName}` : subName;
        return makeMockDirHandle(subName, nextPrefix);
      },
      async getFileHandle(fileName: string, opts?: { create?: boolean }): Promise<WritableBrowserFileHandleLike> {
        const fullKey = prefix ? `${prefix}/${fileName}` : fileName;
        if (!opts?.create && !virtualDisk.has(fullKey)) {
          throw new Error(`NotFoundError: ${fullKey}`);
        }
        return {
          name: fileName,
          kind: 'file',
          async getFile() {
            return {
              async text() {
                return virtualDisk.get(fullKey) ?? '';
              },
            };
          },
          async createWritable() {
            let buffer = '';
            return {
              async write(data) {
                buffer = typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array);
              },
              async close() {
                virtualDisk.set(fullKey, buffer);
              },
              async abort() {
                buffer = '';
              },
            };
          },
        };
      },
    });

    const mockRootHandle = makeMockDirHandle('GMAO_Data_Saved', '');
    vi.spyOn(indexedDBService, 'getItem').mockImplementation(async (key: string) => {
      if (key === IDB_FOLDER_HANDLE_STORAGE_KEY) {
        return mockRootHandle as never;
      }
      return null;
    });

    // Simulate reload in LOCAL_FOLDER_SSOT mode before permission re-grant
    folderSyncService.setStorageMode('LOCAL_FOLDER_SSOT');
    const bootResult = await folderSyncService.bootstrapFromSavedHandle();
    expect(bootResult.restored).toBe(false);
    expect(bootResult.needsPermission).toBe(true);

    const snapNeedsPerm = folderSyncService.getSnapshot();
    expect(snapNeedsPerm.connectionState).toBe('NEEDS_PERMISSION');
    expect(snapNeedsPerm.pendingHandleLabel).toBe('GMAO_Data_Saved');

    // User edits settings BEFORE clicking reconnect -> must be queued, not dropped
    storageService.setItem(STORAGE_KEYS.THEME, 'dark');
    storageService.setItem(STORAGE_KEYS.LANGUAGE, 'ar');
    const snapQueued = folderSyncService.getSnapshot();
    expect(snapQueued.dirtyFiles).toContain('config/preferences.json');
    expect(snapQueued.dirtyFiles).toContain(FOLDER_MANIFEST_FILENAME);

    // 1-click user reconnect grants permission and flushes queued dirty files to disk
    const reconnectResult = await folderSyncService.requestSavedHandlePermissionAndReconnect();
    expect(reconnectResult.flushedFiles).toContain('config/preferences.json');
    expect(reconnectResult.flushedFiles).toContain(FOLDER_MANIFEST_FILENAME);

    const snapConnected = folderSyncService.getSnapshot();
    expect(snapConnected.connectionState).toBe('CONNECTED');
    expect(snapConnected.dirtyFiles).toEqual([]);
    expect(snapConnected.pendingHandleLabel).toBeNull();

    const writtenPrefs = JSON.parse(virtualDisk.get('config/preferences.json') || '{}') as {
      theme?: string;
      language?: string;
    };
    expect(writtenPrefs.theme).toBe('dark');
    expect(writtenPrefs.language).toBe('ar');
  });

  it('Phase L2.3: serializes concurrent flushes, preserves dirty queue on disk write error (ERROR state), recovers on retry, and cleanly disconnects without altering disk files', async () => {
    const baseAdapter = new MemoryFolderFsAdapter('Error_And_Disconnect_Folder');
    let failWrites = false;
    let activeWrites = 0;
    let maxConcurrentWrites = 0;

    const guardedAdapter: IFolderFsAdapter = {
      kind: baseAdapter.kind,
      getLabel: () => baseAdapter.getLabel(),
      listEntries: (maxDepth) => baseAdapter.listEntries(maxDepth),
      readTextFile: (relPath) => baseAdapter.readTextFile(relPath),
      writeTextFile: async (relPath, content) => {
        activeWrites++;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
        try {
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (failWrites) {
            throw new Error('EACCES: fichier verrouillé par un autre processus');
          }
          await baseAdapter.writeTextFile(relPath, content);
        } finally {
          activeWrites--;
        }
      },
      ensureDirectory: (relPath) => baseAdapter.ensureDirectory(relPath),
      createSubdirectoryAdapter: (name) => baseAdapter.createSubdirectoryAdapter(name),
      readAllTextFiles: () => baseAdapter.readAllTextFiles(),
    };

    await folderSyncService.initializeEmptyFolderAsBlankFactory(guardedAdapter);
    expect(folderSyncService.getSnapshot().connectionState).toBe('CONNECTED');

    // 1. Trigger a disk failure and verify ERROR state + dirty queue preservation
    failWrites = true;
    storageService.setItem(STORAGE_KEYS.DENSITY, 'compact');
    await expect(folderSyncService.flushDirtyFilesNow()).rejects.toThrow(/EACCES/);

    const errorSnap = folderSyncService.getSnapshot();
    expect(errorSnap.connectionState).toBe('ERROR');
    expect(errorSnap.lastError).toContain('EACCES');
    expect(errorSnap.dirtyFiles).toContain('config/preferences.json');
    expect(errorSnap.dirtyFiles).toContain(FOLDER_MANIFEST_FILENAME);

    // 2. Recover from error with two concurrent flush calls -> serialized, no overlap
    failWrites = false;
    const [firstResult, secondResult] = await Promise.all([
      folderSyncService.flushDirtyFilesNow(),
      folderSyncService.flushDirtyFilesNow(),
    ]);
    expect(maxConcurrentWrites).toBe(1);
    expect(firstResult.concat(secondResult)).toContain('config/preferences.json');

    const recoveredSnap = folderSyncService.getSnapshot();
    expect(recoveredSnap.connectionState).toBe('CONNECTED');
    expect(recoveredSnap.lastError).toBeNull();
    expect(recoveredSnap.dirtyFiles).toEqual([]);

    const savedPrefs = JSON.parse((await baseAdapter.readTextFile('config/preferences.json')) || '{}') as {
      density?: string;
    };
    expect(savedPrefs.density).toBe('compact');

    // 3. Disconnect folder -> switches to BROWSER_STORAGE while leaving disk files completely untouched
    await folderSyncService.disconnectFolder({ switchToBrowserMode: true });
    const disconnectedSnap = folderSyncService.getSnapshot();
    expect(disconnectedSnap.connectionState).toBe('DISCONNECTED');
    expect(disconnectedSnap.storageMode).toBe('BROWSER_STORAGE');
    expect(disconnectedSnap.activeAdapterLabel).toBeNull();
    expect(await baseAdapter.readTextFile('config/preferences.json')).toContain('"compact"');
  });

  it('Phase L2.4: verifies global app boot handle restore and Settings UI reconnect/retry/disconnect/audit/tree wiring', () => {
    const authAppSrc = fs.readFileSync(
      path.resolve(__dirname, '../../AuthenticatedApp.tsx'),
      'utf-8'
    );
    expect(authAppSrc).toContain('folderSyncService');
    expect(authAppSrc).toContain('bootstrapFromSavedHandle');

    const backupTabSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../presentation/pages/settings/components/SettingsBackupAuditTab.tsx'
      ),
      'utf-8'
    );
    expect(backupTabSrc).toContain('onOpenIntegrityTab');

    const cardSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../presentation/pages/settings/components/DataFolderPhaseL1Card.tsx'
      ),
      'utf-8'
    );
    expect(cardSrc).toContain('NEEDS_PERMISSION');
    expect(cardSrc).toContain('requestSavedHandlePermissionAndReconnect');
    expect(cardSrc).toContain('disconnectFolder');
    expect(cardSrc).toContain('flushDirtyFilesNow');
    expect(cardSrc).toContain('ALL_CANONICAL_FILES');
    expect(cardSrc).toContain('onOpenIntegrityTab');
    expect(cardSrc).toContain('inspectFolderFromFileList');
    expect(cardSrc).toContain('getFolderPickerCapability');
    expect(cardSrc).not.toContain('Simulateur de cas');
  });

  it('Phase L2.5: reads a real OS folder via webkitdirectory FileList (iframe/Firefox fallback) safely in readonly-disk-snapshot mode', async () => {
    const emptyTree = buildEmptyStructure({ nowIso: FIXED_ISO });
    const manifestJson = emptyTree.find((e) => e.path === FOLDER_MANIFEST_FILENAME)!.content!;

    const makeMockDiskFile = (relPath: string, content: string): File => {
      const file = new File([content], relPath.split('/').pop() || 'file.json', {
        type: 'application/json',
      });
      Object.defineProperty(file, 'webkitRelativePath', {
        value: relPath,
        configurable: true,
      });
      // Ensure `.text()` works cleanly in jsdom environments
      Object.defineProperty(file, 'text', {
        value: async () => content,
        configurable: true,
      });
      return file;
    };

    const files = [
      makeMockDiskFile('Mon_Usine_GMAO/manifest.json', manifestJson),
      makeMockDiskFile(
        'Mon_Usine_GMAO/catalog/ref_parc.json',
        JSON.stringify({
          bundleType: 'REF_PARC',
          zones: [{ code_zone: 'Z-PC', libelle: 'Atelier PC Réel' }],
          families: [],
          templates: [],
          generalSystemTypes: [],
        })
      ),
      makeMockDiskFile(
        'Mon_Usine_GMAO/config/preferences.json',
        JSON.stringify({ theme: 'dark', accentColor: 'emerald' })
      ),
      // Malicious traversal path must be silently ignored
      makeMockDiskFile('Mon_Usine_GMAO/../../etc/passwd.json', '{"evil":true}'),
    ];

    const report = await inspectFolderFromFileList(files);
    expect(report.folderLabel).toBe('Mon_Usine_GMAO');
    expect(report.accessMode).toBe('readonly-disk-snapshot');
    expect(report.inspection.status).toBe('PARTIAL');
    expect(report.inspection.presentFiles).toContain('catalog/ref_parc.json');
    expect(report.inspection.presentFiles).toContain('config/preferences.json');
    expect(report.entries.some((e) => e.path.includes('passwd'))).toBe(false);

    // Capability helper returns a valid typed state
    expect(['READWRITE_PICKER', 'BLOCKED_IN_IFRAME', 'UNSUPPORTED_BROWSER']).toContain(
      getFolderPickerCapability()
    );
  });
});

