import { DataGateway } from '../DataGateway';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import {
  loadWorkspaceProfile,
  normalizeWorkspaceProfile,
  refreshWorkspaceProfileCache,
} from '../../core/workspace/workspaceProfile';
import { applyAppearanceDomFromStorage } from '../../presentation/components/layout/appearanceBootstrap';
import {
  computeDiscoveredAuditItems,
  type DiscoveredAuditItem,
} from '../../presentation/pages/settings/components/settingsAuditDiscovery';
import {
  exportAssetsMachinesBundle,
  exportCmCatalogBundle,
  exportEntrepotBomBundle,
  exportPmCatalogBundle,
  exportRefParcBundle,
  exportRefPdrBundle,
  exportRefPersonnelBundle,
  validateAndCommitDemoBundle,
} from '../../services/import/unifiedImportPipeline';
import type {
  AssetsMachinesBundleInput,
  CmCatalogBundleInput,
  EntrepotBomBundleInput,
  ImportIssue,
  PmCatalogBundleInput,
  RefParcBundleInput,
  RefPdrBundleInput,
  RefPersonnelBundleInput,
} from '../../services/import/types/unifiedImportTypes';
import { useGmaoStore } from '../../store/useGmaoStore';
import type { IMachine, IStockItem } from '../../types/domain';
import { storageService } from '../../utils/storageService';
import { createManifestRecord, type FolderSsotManifest } from './folderManifest';
import {
  ALL_CANONICAL_FILES,
  buildManifestFilesMap,
  CANONICAL_FOLDER_DIRECTORIES,
  getFolderFileSpecByPath,
} from './folderStructure';
import type { FolderMaterializedEntry } from './folderStoreEngine';
import {
  FOLDER_MANIFEST_FILENAME,
  joinFolderRelativePath,
  normalizeFolderRelativePath,
  withDataFolderRoot,
} from './folderStorePaths';

export interface FolderParseError {
  path: string;
  error: string;
}

export interface FolderHydrationReport {
  success: boolean;
  filesLoadedCount: number;
  parseErrors: FolderParseError[];
  catalogIssues: ImportIssue[];
  catalogWarnings: ImportIssue[];
  discoveredMissingReferences: DiscoveredAuditItem[];
  summary: {
    machinesCount: number;
    rawStockCount: number;
    mouvementsCount: number;
    correctiveCount: number;
    preventiveTasksCount: number;
    preventiveExecutionsCount: number;
    blueprintsCount: number;
  };
}

function readOperationalArrayByStorageKey(storageKey: string): unknown[] {
  const store = useGmaoStore.getState();
  switch (storageKey) {
    case STORAGE_KEYS.MOUVEMENTS:
      return Array.isArray(store.mouvements) ? store.mouvements : [];
    case STORAGE_KEYS.CORRECTIVE_INTERVENTIONS:
      return Array.isArray(store.correctiveInterventions) ? store.correctiveInterventions : [];
    case STORAGE_KEYS.CORRECTIVE_TRAVAUX:
      return Array.isArray(store.correctiveTravauxAFaire) ? store.correctiveTravauxAFaire : [];
    case STORAGE_KEYS.CORRECTIVE_INTERVENANTS:
      return Array.isArray(store.correctiveIntervenants) ? store.correctiveIntervenants : [];
    case STORAGE_KEYS.PREVENTIVE_TASKS:
      return Array.isArray(store.preventiveTasks) ? store.preventiveTasks : [];
    case STORAGE_KEYS.PREVENTIVE_PLANS:
      return Array.isArray(store.preventivePlans) ? store.preventivePlans : [];
    case STORAGE_KEYS.PREVENTIVE_EXECUTIONS:
      return Array.isArray(store.preventiveExecutions) ? store.preventiveExecutions : [];
    case STORAGE_KEYS.CBM_MANUAL_RULES: {
      const cbm = storageService.getItem(STORAGE_KEYS.CBM_MANUAL_RULES);
      return Array.isArray(cbm) ? cbm : [];
    }
    case STORAGE_KEYS.WORKSHOP_ORDERS:
      return Array.isArray(store.workshopOrders) ? store.workshopOrders : [];
    case STORAGE_KEYS.NEED_REQUESTS:
      return Array.isArray(store.needRequests) ? store.needRequests : [];
    case STORAGE_KEYS.SORTIE_DEMANDS:
      return Array.isArray(store.sortieDemands) ? store.sortieDemands : [];
    case STORAGE_KEYS.WAREHOUSE_ITEMS:
      return Array.isArray(store.warehouseItems) ? store.warehouseItems : [];
    case STORAGE_KEYS.MACHINE_BOM:
      return Array.isArray(store.machineElementsLedger) ? store.machineElementsLedger : [];
    case STORAGE_KEYS.METER_READINGS:
      return Array.isArray(store.meterReadings) ? store.meterReadings : [];
    case STORAGE_KEYS.REPLENISHMENT_ORDERS:
      return Array.isArray(store.replenishmentOrders) ? store.replenishmentOrders : [];
    case STORAGE_KEYS.ENTREPOT_COMPONENTS:
      return Array.isArray(store.entrepotComponents) ? store.entrepotComponents : [];
    case STORAGE_KEYS.SORTIE_EXTERNE:
      return Array.isArray(store.sortiesExterne) ? store.sortiesExterne : [];
    case STORAGE_KEYS.BLUEPRINTS:
      return Array.isArray(store.blueprints) ? store.blueprints : [];
    case STORAGE_KEYS.AUDIT_EVENTS:
      return Array.isArray(store.auditEvents) ? store.auditEvents : [];
    default: {
      const val = storageService.getItem(storageKey);
      return Array.isArray(val) ? val : [];
    }
  }
}

function buildConfigPreferencesObject(): Record<string, unknown> {
  return {
    deviceMode: storageService.getItem(STORAGE_KEYS.DEVICE_MODE) ?? 'auto',
    sidebarStyle: storageService.getItem(STORAGE_KEYS.SIDEBAR_STYLE) ?? 'floating',
    sidebarBehavior: storageService.getItem(STORAGE_KEYS.SIDEBAR_BEHAVIOR) ?? 'push',
    sidebarTheme: storageService.getItem(STORAGE_KEYS.SIDEBAR_THEME) ?? 'light',
    theme: storageService.getItem(STORAGE_KEYS.THEME) ?? 'light',
    density: storageService.getItem(STORAGE_KEYS.DENSITY) ?? 'comfortable',
    accentColor: storageService.getItem(STORAGE_KEYS.ACCENT_COLOR) ?? 'emerald',
    animations: storageService.getItem(STORAGE_KEYS.ANIMATIONS) ?? 'true',
    headerClock: storageService.getItem(STORAGE_KEYS.HEADER_CLOCK) ?? 'true',
    language: storageService.getItem(STORAGE_KEYS.LANGUAGE) ?? 'fr',
    activeTab: storageService.getItem(STORAGE_KEYS.ACTIVE_TAB) ?? 'dashboard',
    wizardFeatureFlags: storageService.getItem(STORAGE_KEYS.WIZARD_FEATURE_FLAGS) ?? {},
    onboardingDismissed: storageService.getItem(STORAGE_KEYS.ONBOARDING_DISMISSED) ?? 'false',
  };
}

function buildConfigFinanceCurrencyObject(): Record<string, unknown> {
  return {
    currencyConfig: storageService.getItem(STORAGE_KEYS.CURRENCY_CONFIG) ?? null,
    financialBudgets: storageService.getItem(STORAGE_KEYS.FINANCIAL_BUDGETS) ?? null,
  };
}

function buildConfigSystemFlagsObject(): Record<string, unknown> {
  return {
    startMode: storageService.getItem(STORAGE_KEYS.START_MODE) ?? 'empty',
    demoMode: Boolean(storageService.getItem(STORAGE_KEYS.DEMO_MODE)),
    autoWriteExcel: storageService.getItem(STORAGE_KEYS.AUTO_WRITE_EXCEL) ?? 'false',
    pollingInterval: storageService.getItem(STORAGE_KEYS.POLLING_INTERVAL) ?? '15',
    cacheCeilingMb: storageService.getItem(STORAGE_KEYS.CACHE_CEILING_MB) ?? '256',
    storageCeilingMb: storageService.getItem(STORAGE_KEYS.STORAGE_CEILING_MB) ?? '1024',
    sharedFolderPath: storageService.getItem(STORAGE_KEYS.SHARED_FOLDER_PATH) ?? '',
    workspaceProfile: loadWorkspaceProfile(),
  };
}

/**
 * Serializes a single canonical `GMAO_Data/` relative path from live application state (`useGmaoStore` + `storageService`)
 * into pretty-printed 2-space indented JSON with a trailing newline.
 */
export function serializeSingleFolderFile(
  relativePath: string,
  options: { nowIso?: string; existingCreatedAt?: string } = {}
): string {
  const cleanPath = normalizeFolderRelativePath(relativePath, { stripRootPrefix: true });
  const nowIso = options.nowIso ?? new Date().toISOString();

  if (cleanPath === FOLDER_MANIFEST_FILENAME) {
    const manifest: FolderSsotManifest = {
      ...createManifestRecord(buildManifestFilesMap(), nowIso),
      createdAt: options.existingCreatedAt ?? nowIso,
      lastStructureCheckAt: nowIso,
      lastUpdatedAt: nowIso,
    };
    return `${JSON.stringify(manifest, null, 2)}\n`;
  }

  switch (cleanPath) {
    // 1. Catalog Type A JSON bundles (7 files — strictly no auth secrets)
    case 'catalog/ref_parc.json':
      return `${JSON.stringify(exportRefParcBundle(), null, 2)}\n`;
    case 'catalog/ref_personnel.json':
      return `${JSON.stringify(exportRefPersonnelBundle(), null, 2)}\n`;
    case 'catalog/assets_machines.json':
      return `${JSON.stringify(exportAssetsMachinesBundle(), null, 2)}\n`;
    case 'catalog/ref_pdr.json':
      return `${JSON.stringify(exportRefPdrBundle(), null, 2)}\n`;
    case 'catalog/pm_catalog.json':
      return `${JSON.stringify(exportPmCatalogBundle(), null, 2)}\n`;
    case 'catalog/entrepot_bom.json':
      return `${JSON.stringify(exportEntrepotBomBundle(), null, 2)}\n`;
    case 'catalog/cm_catalog.json':
      return `${JSON.stringify(exportCmCatalogBundle(), null, 2)}\n`;

    // 2. Config JSON files (3 files — strictly no license keys or auth hashes)
    case 'config/preferences.json':
      return `${JSON.stringify(buildConfigPreferencesObject(), null, 2)}\n`;
    case 'config/finance_currency.json':
      return `${JSON.stringify(buildConfigFinanceCurrencyObject(), null, 2)}\n`;
    case 'config/system_flags.json':
      return `${JSON.stringify(buildConfigSystemFlagsObject(), null, 2)}\n`;

    default: {
      // 3. Operational JSON arrays (19 files)
      const spec = getFolderFileSpecByPath(cleanPath);
      if (spec && spec.role === 'operational' && spec.storageKeys.length > 0) {
        const arr = readOperationalArrayByStorageKey(spec.storageKeys[0]);
        return `${JSON.stringify(arr, null, 2)}\n`;
      }
      if (spec) {
        return `${JSON.stringify(spec.buildEmptyBody(), null, 2)}\n`;
      }
      throw new Error(`Chemin de fichier GMAO_Data inconnu : ${cleanPath}`);
    }
  }
}

/**
 * Serializes 100% of live application state (`catalog/`, `operational/`, `config/`, `manifest.json`)
 * into materialized folder entries ready for disk writing or `.zip` export.
 */
export function serializeLiveStateToFolderFiles(
  options: { nowIso?: string; includeRootPrefix?: boolean } = {}
): FolderMaterializedEntry[] {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const includeRootPrefix = Boolean(options.includeRootPrefix);
  const formatPath = (relPath: string): string =>
    includeRootPrefix ? withDataFolderRoot(relPath) : joinFolderRelativePath(relPath);

  const entries: FolderMaterializedEntry[] = [];

  for (const dir of CANONICAL_FOLDER_DIRECTORIES) {
    entries.push({
      path: formatPath(dir.path),
      isDirectory: true,
      content: null,
    });
  }

  entries.push({
    path: formatPath(FOLDER_MANIFEST_FILENAME),
    isDirectory: false,
    content: serializeSingleFolderFile(FOLDER_MANIFEST_FILENAME, { nowIso }),
  });

  for (const fileSpec of ALL_CANONICAL_FILES) {
    entries.push({
      path: formatPath(fileSpec.path),
      isDirectory: false,
      content: serializeSingleFolderFile(fileSpec.path, { nowIso }),
    });
  }

  return entries;
}

/**
 * Merges any machine rows from `catalog/assets_machines.json` that were rejected by strict FK staging
 * (e.g., a machine edited externally with an uncatalogued zone during a partial folder restore)
 * so zero physical shopfloor assets are lost while `computeDiscoveredAuditItems` flags the missing zone.
 */
function mergeResilientMachines(
  stagedMachines: IMachine[],
  rawRows: AssetsMachinesBundleInput['machines']
): IMachine[] {
  const result = [...stagedMachines];
  if (!Array.isArray(rawRows) || rawRows.length === 0) return result;

  const presentCodes = new Set(
    result
      .map((m) => String(m.id_machine_registered || m.id || m.code || '').trim().toUpperCase())
      .filter(Boolean)
  );

  rawRows.forEach((row, idx) => {
    if (!row || typeof row !== 'object') return;
    const rec = row as Record<string, unknown>;
    const code = String(
      row.code_machine ?? rec.id_machine_registered ?? rec.id ?? rec.code ?? ''
    ).trim();
    if (!code) return;
    const upperCode = code.toUpperCase();
    if (presentCodes.has(upperCode)) return;

    const designation = String(
      row.designation ?? rec.nom ?? rec.libelle ?? code
    ).trim();
    const zoneCode = String(
      row.code_zone ?? rec.id_zone_default ?? rec.id_zone ?? rec.zone ?? ''
    ).trim();
    const familyCode = String(row.code_family ?? rec.id_family ?? '').trim();
    const templateCode = String(
      row.code_template ?? rec.id_templates ?? rec.id_template ?? ''
    ).trim();
    const techCode = String(row.code_technician ?? rec.technician ?? '').trim();
    const statusVal = String(row.status ?? rec.statut ?? 'En service').trim();
    const isArchived = statusVal.toUpperCase() === 'ARCHIVEE' || row.is_active === false;

    const recovered: IMachine = {
      id_machine_registered: code,
      id: code,
      code,
      designation,
      nom: designation,
      id_zone_default: zoneCode,
      id_zone: zoneCode,
      zone: zoneCode,
      asset_class:
        String(row.asset_class ?? '').toUpperCase() === 'SYSTEM_GENERAL'
          ? 'SYSTEM_GENERAL'
          : 'PRODUCTION',
      id_family: familyCode,
      id_templates: templateCode,
      id_general_system_type: String(
        row.code_system_type ?? rec.id_general_system_type ?? ''
      ).trim(),
      technician: techCode,
      parent_id: String(row.parent_code_machine ?? rec.parent_id ?? '').trim() || null,
      asset_level:
        String(row.asset_level ?? 'MACHINE').toUpperCase() === 'LINE' ? 'LINE' : 'MACHINE',
      id_blueprint: String(rec.id_blueprint ?? '').trim(),
      status: statusVal,
      statut: statusVal,
      is_active: !isArchived,
      serial_number: String(row.serial_number ?? rec.numero_serie ?? '').trim(),
      date_mise_en_service: String(
        row.commissioning_date ?? rec.date_mise_en_service ?? ''
      ).trim(),
      ...(rec.compteur_actuel !== undefined && Number.isFinite(Number(rec.compteur_actuel))
        ? { compteur_actuel: Number(rec.compteur_actuel) }
        : {}),
      ...(rec.unite_compteur ? { unite_compteur: String(rec.unite_compteur).trim() } : {}),
      ...(rec.cout_arret_horaire !== undefined && Number.isFinite(Number(rec.cout_arret_horaire))
        ? { cout_arret_horaire: Math.max(0, Number(rec.cout_arret_horaire)) }
        : {}),
      ...(rec.valeur_acquisition !== undefined && Number.isFinite(Number(rec.valeur_acquisition))
        ? { valeur_acquisition: Math.max(0, Number(rec.valeur_acquisition)) }
        : {}),
      ...(rec.regime_travail ? { regime_travail: String(rec.regime_travail).trim() } : {}),
    };

    presentCodes.add(upperCode);
    result.push(recovered);
    void idx;
  });

  return result;
}

/**
 * Merges any PDR items from `catalog/ref_pdr.json` that were rejected by strict FK staging
 * (e.g., an item referencing a missing group/type) so zero spare-part records or `stockInitial`
 * values are silently dropped when loading a user-edited folder.
 */
function mergeResilientStockItems(
  stagedStock: IStockItem[],
  rawItems: RefPdrBundleInput['items']
): IStockItem[] {
  const result = [...stagedStock];
  if (!Array.isArray(rawItems) || rawItems.length === 0) return result;

  const presentRefs = new Set(
    result.map((s) => String(s.ref || '').trim().toUpperCase()).filter(Boolean)
  );

  for (const row of rawItems) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const ref = String(row.ref ?? row.code_article ?? '').trim();
    if (!ref) continue;
    const upperRef = ref.toUpperCase();
    if (presentRefs.has(upperRef)) continue;

    const recovered: IStockItem = {
      ref,
      designation: String(row.designation ?? ref).trim(),
      id_type: String(row.code_type ?? rec.id_type ?? rec.type ?? '').trim(),
      type: String(row.code_type ?? rec.id_type ?? rec.type ?? '').trim(),
      id_group: String(row.code_group ?? rec.id_group ?? '').trim(),
      stockInitial: Math.max(0, Number(row.stockInitial ?? 0) || 0),
      seuil: Math.max(0, Number(row.seuil ?? 0) || 0),
      prix_unitaire: Math.max(0, Number(row.prix_unitaire ?? 0) || 0),
      emplacement: String(row.emplacement ?? 'Magasin PDR').trim() || 'Magasin PDR',
      unite_mesure: String(row.unite_mesure ?? rec.unite ?? 'PCS').trim() || 'PCS',
      criticite: String(row.criticite ?? 'B').trim() || 'B',
      ...(row.ref_constructeur ? { ref_constructeur: String(row.ref_constructeur).trim() } : {}),
      ...(row.code_equivalents ? { code_equivalents: String(row.code_equivalents).trim() } : {}),
      ...(row.delai_appro_jours !== undefined
        ? { delai_appro_jours: Math.max(0, Number(row.delai_appro_jours) || 0) }
        : {}),
      policy_tags: Array.isArray(row.policy_tags) ? row.policy_tags : ['REPLACING'],
    };

    presentRefs.add(upperRef);
    result.push(recovered);
  }

  return result;
}

/**
 * Resiliently hydrates live application state (`DataGateway`, `useGmaoStore`, `storageService`,
 * `IncrementalStockIndex`, and DOM appearance attributes) from a dictionary/map of `GMAO_Data/` JSON files.
 *
 * Also runs the Nexus Missing-Reference Explorer (`computeDiscoveredAuditItems`) across machines,
 * articles, zones, and users so any orphan references from partial folders or manual JSON edits
 * are immediately surfaced to the user.
 */
export function hydrateLiveStateFromFolderFiles(
  filesInput: ReadonlyMap<string, string> | Record<string, string>
): FolderHydrationReport {
  const normalizedMap = new Map<string, string>();
  if (filesInput instanceof Map) {
    for (const [rawPath, content] of filesInput.entries()) {
      const clean = normalizeFolderRelativePath(rawPath, { stripRootPrefix: true });
      if (clean && typeof content === 'string') {
        normalizedMap.set(clean, content);
      }
    }
  } else if (filesInput && typeof filesInput === 'object') {
    for (const [rawPath, content] of Object.entries(filesInput)) {
      const clean = normalizeFolderRelativePath(rawPath, { stripRootPrefix: true });
      if (clean && typeof content === 'string') {
        normalizedMap.set(clean, content);
      }
    }
  }

  const parseErrors: FolderParseError[] = [];
  let filesLoadedCount = 0;

  const parseJsonAt = <T>(relPath: string, fallback: T): T => {
    const raw = normalizedMap.get(relPath);
    if (raw === undefined || raw.trim() === '') {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as T;
      filesLoadedCount++;
      return parsed;
    } catch (err) {
      parseErrors.push({
        path: relPath,
        error: err instanceof Error ? err.message : 'Invalid JSON syntax',
      });
      return fallback;
    }
  };

  // Parse the 7 catalog JSON files
  const refParcRaw = parseJsonAt<RefParcBundleInput>('catalog/ref_parc.json', {
    bundleType: 'REF_PARC',
    zones: [],
    families: [],
    templates: [],
    generalSystemTypes: [],
  });
  const refPersonnelRaw = parseJsonAt<RefPersonnelBundleInput>('catalog/ref_personnel.json', {
    bundleType: 'REF_PERSONNEL',
    technicians: [],
    operations: [],
  });
  const assetsMachinesRaw = parseJsonAt<AssetsMachinesBundleInput>('catalog/assets_machines.json', {
    bundleType: 'ASSETS_MACHINES',
    machines: [],
  });
  const refPdrRaw = parseJsonAt<RefPdrBundleInput>('catalog/ref_pdr.json', {
    bundleType: 'REF_PDR',
    groups: [],
    types: [],
    items: [],
  });
  const pmCatalogRaw = parseJsonAt<PmCatalogBundleInput>('catalog/pm_catalog.json', {
    bundleType: 'PM_CATALOG',
    actions: [],
    guides: [],
  });
  const entrepotBomRaw = parseJsonAt<EntrepotBomBundleInput>('catalog/entrepot_bom.json', {
    bundleType: 'ENTREPOT_BOM',
    compGroups: [],
    compFamilies: [],
    compTemplates: [],
    partGroups: [],
    partTypes: [],
    partDesignations: [],
  });
  const cmCatalogRaw = parseJsonAt<CmCatalogBundleInput>('catalog/cm_catalog.json', {
    bundleType: 'CM_CATALOG',
    categories: [],
    faults: [],
  });

  // Run dryRun staging through the official Type A UnifiedImportPipeline
  const demoStageReport = validateAndCommitDemoBundle(
    {
      bundleType: 'DEMO_BUNDLE',
      refParc: refParcRaw,
      refPersonnel: refPersonnelRaw,
      assetsMachines: assetsMachinesRaw,
      refPdr: refPdrRaw,
      pmCatalog: pmCatalogRaw,
      entrepotBom: entrepotBomRaw,
      cmCatalog: cmCatalogRaw,
    },
    {
      mode: 'REPLACE_CATALOG',
      origin: 'JSON_BUNDLE',
      dryRun: true,
      strictPdrCheck: false,
      actorRole: 'ADMIN',
      existingZones: [],
      existingFamilies: [],
      existingTemplates: [],
      existingGeneralSystemTypes: [],
      existingTechnicians: [],
      existingOperations: [],
      existingUsers: [],
      existingMachines: [],
      existingPdrGroups: [],
      existingStockTypes: [],
      existingStock: [],
      existingPreventiveActions: [],
      existingPreventiveGuides: [],
      existingCompGroups: [],
      existingCompFamilies: [],
      existingCompTemplates: [],
      existingPartGroups: [],
      existingPartTypes: [],
      existingPartDesignations: [],
      existingPanneCategories: {},
      existingActionsByPanne: {},
    }
  );

  const staging = demoStageReport.staging;

  // Resilient merge for machines & PDR items so partial/externally-edited folders never silently lose rows
  const nextMachines = mergeResilientMachines(staging.nextMachines, assetsMachinesRaw?.machines);
  const nextStock = mergeResilientStockItems(staging.nextStock, refPdrRaw?.items);

  // Parse all 19 operational JSON files
  const readOpArray = (relPath: string): unknown[] => {
    const parsed = parseJsonAt<unknown>(relPath, []);
    return Array.isArray(parsed) ? parsed : [];
  };

  const mouvements = readOpArray('operational/mouvements.json');
  const correctiveInterventions = readOpArray('operational/corrective_interventions.json');
  const correctiveTravauxAFaire = readOpArray('operational/corrective_travaux.json');
  const correctiveIntervenants = readOpArray('operational/corrective_intervenants.json');
  const preventiveTasks = readOpArray('operational/preventive_tasks.json');
  const preventivePlans = readOpArray('operational/preventive_plans.json');
  const preventiveExecutions = readOpArray('operational/preventive_executions.json');
  const cbmManualRules = readOpArray('operational/cbm_manual_rules.json');
  const workshopOrders = readOpArray('operational/workshop_orders.json');
  const needRequests = readOpArray('operational/need_requests.json');
  const sortieDemands = readOpArray('operational/sortie_demands.json');
  const warehouseItems = readOpArray('operational/warehouse_items.json');
  const machineElementsLedger = readOpArray('operational/machine_elements_ledger.json');
  const meterReadings = readOpArray('operational/meter_readings.json');
  const replenishmentOrders = readOpArray('operational/replenishment_orders.json');
  const entrepotComponents = readOpArray('operational/entrepot_components.json');
  const sortiesExterne = readOpArray('operational/sortie_externe.json');
  const blueprints = readOpArray('operational/blueprints.json');
  const auditEvents = readOpArray('operational/audit_events.json');

  // Parse the 3 config JSON files
  const hasFinanceConfigFile = normalizedMap.has('config/finance_currency.json');
  const preferencesObj = parseJsonAt<Record<string, unknown>>('config/preferences.json', {});
  const financeCurrencyObj = parseJsonAt<Record<string, unknown>>('config/finance_currency.json', {});
  const systemFlagsObj = parseJsonAt<Record<string, unknown>>('config/system_flags.json', {});

  // Apply all domain & config state inside suppressed notification context so hydrating from disk
  // does not trigger redundant write-backs to the folder
  storageService.runWithKeyChangeNotificationsSuppressed(() => {
    DataGateway.loadFullServerState(
      {
        zones: staging.nextZones,
        families: staging.nextFamilies,
        templates: staging.nextTemplates,
        generalSystemTypes: staging.nextGeneralSystemTypes,
        technicians: staging.nextTechnicians,
        operations: staging.nextOperations,
        users: staging.nextUsers,
        machines: nextMachines,
        pdrGroups: staging.nextGroups,
        types: staging.nextTypes,
        rawStock: nextStock,
        designations: staging.nextDesignations,
        preventiveActions: staging.nextActions,
        preventiveGuides: staging.nextGuides,
        compGroups: staging.nextCompGroups ?? [],
        compFamilies: staging.nextCompFamilies ?? [],
        compTemplates: staging.nextCompTemplates ?? [],
        partGroups: staging.nextPartGroups ?? [],
        partTypes: staging.nextPartTypes ?? [],
        partDesignations: staging.nextPartDesignations ?? [],
        correctivePanneCategories: staging.nextPanneCategories ?? {},
        correctiveActionsByPanne: staging.nextActionsByPanne ?? {},
        mouvements,
        correctiveInterventions,
        correctiveTravauxAFaire,
        correctiveIntervenants,
        preventiveTasks,
        preventivePlans,
        preventiveExecutions,
        cbmManualRules,
        workshopOrders,
        needRequests,
        sortieDemands,
        warehouseItems,
        machineElementsLedger,
        meterReadings,
        replenishmentOrders,
        entrepotComponents,
        sortiesExterne,
        blueprints,
        auditEvents,
        currencyConfig: financeCurrencyObj?.currencyConfig ?? null,
        financialBudgets: financeCurrencyObj?.financialBudgets ?? null,
      },
      {
        applyRemoteStateUpdate: useGmaoStore.getState().applyRemoteStateUpdate,
      }
    );

    // Clear stale currency/budget entries if config/finance_currency.json explicitly resets them to null
    if (hasFinanceConfigFile && financeCurrencyObj && typeof financeCurrencyObj === 'object') {
      if (financeCurrencyObj.currencyConfig === null) {
        storageService.removeItem(STORAGE_KEYS.CURRENCY_CONFIG);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gmao:currency-config-changed', { detail: null }));
        }
      }
      if (financeCurrencyObj.financialBudgets === null) {
        storageService.removeItem(STORAGE_KEYS.FINANCIAL_BUDGETS);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gmao_financial_budget_updated', { detail: null }));
        }
      }
    }

    // Apply UI preferences from config/preferences.json
    if (preferencesObj && typeof preferencesObj === 'object') {
      const setPrefIfDefined = (key: string, val: unknown) => {
        if (val !== undefined && val !== null) {
          storageService.setItem(key, val);
        }
      };
      setPrefIfDefined(STORAGE_KEYS.DEVICE_MODE, preferencesObj.deviceMode);
      setPrefIfDefined(STORAGE_KEYS.SIDEBAR_STYLE, preferencesObj.sidebarStyle);
      setPrefIfDefined(STORAGE_KEYS.SIDEBAR_BEHAVIOR, preferencesObj.sidebarBehavior);
      setPrefIfDefined(STORAGE_KEYS.SIDEBAR_THEME, preferencesObj.sidebarTheme);
      setPrefIfDefined(STORAGE_KEYS.THEME, preferencesObj.theme);
      setPrefIfDefined(STORAGE_KEYS.DENSITY, preferencesObj.density);
      setPrefIfDefined(STORAGE_KEYS.ACCENT_COLOR, preferencesObj.accentColor);
      setPrefIfDefined(STORAGE_KEYS.ANIMATIONS, preferencesObj.animations);
      setPrefIfDefined(STORAGE_KEYS.HEADER_CLOCK, preferencesObj.headerClock);
      setPrefIfDefined(STORAGE_KEYS.LANGUAGE, preferencesObj.language);
      setPrefIfDefined(STORAGE_KEYS.ACTIVE_TAB, preferencesObj.activeTab);
      setPrefIfDefined(STORAGE_KEYS.WIZARD_FEATURE_FLAGS, preferencesObj.wizardFeatureFlags);
      setPrefIfDefined(STORAGE_KEYS.ONBOARDING_DISMISSED, preferencesObj.onboardingDismissed);
    }

    // Apply system flags from config/system_flags.json
    if (systemFlagsObj && typeof systemFlagsObj === 'object') {
      const setFlagIfDefined = (key: string, val: unknown) => {
        if (val !== undefined && val !== null) {
          storageService.setItem(key, val);
        }
      };
      setFlagIfDefined(STORAGE_KEYS.AUTO_WRITE_EXCEL, systemFlagsObj.autoWriteExcel);
      setFlagIfDefined(STORAGE_KEYS.POLLING_INTERVAL, systemFlagsObj.pollingInterval);
      setFlagIfDefined(STORAGE_KEYS.CACHE_CEILING_MB, systemFlagsObj.cacheCeilingMb);
      setFlagIfDefined(STORAGE_KEYS.STORAGE_CEILING_MB, systemFlagsObj.storageCeilingMb);
      setFlagIfDefined(STORAGE_KEYS.SHARED_FOLDER_PATH, systemFlagsObj.sharedFolderPath);
      if (systemFlagsObj.workspaceProfile !== undefined && systemFlagsObj.workspaceProfile !== null) {
        storageService.setItem(
          STORAGE_KEYS.WORKSPACE_PROFILE,
          normalizeWorkspaceProfile(systemFlagsObj.workspaceProfile)
        );
      }
    }

    try {
      applyAppearanceDomFromStorage();
      refreshWorkspaceProfileCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('gmao_appearance_changed'));
      }
    } catch {
      /* ignore DOM unavailability in headless unit test environments */
    }
  });

  // Run Nexus Missing-Reference Explorer across machines, articles, zones, and users
  const liveStore = useGmaoStore.getState();
  const auditBaseInput = {
    mouvements: liveStore.mouvements ?? [],
    rawStock: liveStore.rawStock ?? [],
    machines: liveStore.machines ?? [],
    zones: liveStore.zones ?? [],
    technicians: liveStore.technicians ?? [],
    operations: liveStore.operations ?? [],
    correctiveInterventions: liveStore.correctiveInterventions ?? [],
    preventiveTasks: liveStore.preventiveTasks ?? [],
  };

  const discoveredMissingReferences: DiscoveredAuditItem[] = [
    ...computeDiscoveredAuditItems({ ...auditBaseInput, auditTarget: 'machines' }),
    ...computeDiscoveredAuditItems({ ...auditBaseInput, auditTarget: 'articles' }),
    ...computeDiscoveredAuditItems({ ...auditBaseInput, auditTarget: 'zones' }),
    ...computeDiscoveredAuditItems({ ...auditBaseInput, auditTarget: 'utilisateurs' }),
  ];

  return {
    success: parseErrors.length === 0,
    filesLoadedCount,
    parseErrors,
    catalogIssues: demoStageReport.rejected,
    catalogWarnings: demoStageReport.warnings,
    discoveredMissingReferences,
    summary: {
      machinesCount: (liveStore.machines ?? []).length,
      rawStockCount: (liveStore.rawStock ?? []).length,
      mouvementsCount: (liveStore.mouvements ?? []).length,
      correctiveCount: (liveStore.correctiveInterventions ?? []).length,
      preventiveTasksCount: (liveStore.preventiveTasks ?? []).length,
      preventiveExecutionsCount: (liveStore.preventiveExecutions ?? []).length,
      blueprintsCount: (liveStore.blueprints ?? []).length,
    },
  };
}
