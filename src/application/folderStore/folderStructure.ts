import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import type { TypeAExcelBundleKind } from '../../services/import/typeAExcelBridge';
import type { FolderFileRole, FolderManifestFileEntry } from './folderManifest';
import { normalizeFolderRelativePath } from './folderStorePaths';

/**
 * Canonical Tree Definition for `GMAO_Data/` (Phase L1 + Phase L2 Full Application Coverage).
 *
 * Covers 100% of application data, tables, cognitive blueprints, financial budgets, currency config,
 * and UI appearance / ergonomics preferences:
 * - `catalog/*.json` (7 files): JSON Objects (`{ "bundleType": "...", ... }`) matching 1:1 the 7 official
 *   Type A templates (`REF_PARC`, `REF_PERSONNEL`, `ASSETS_MACHINES`, `REF_PDR`, `PM_CATALOG`,
 *   `ENTREPOT_BOM`, `CM_CATALOG`).
 * - `operational/*.json` (19 files): JSON Arrays (`[]`) matching 1:1 every operational and historical
 *   collection in `STORAGE_KEYS` (including `blueprints.json`, `preventive_plans.json`, `cbm_manual_rules.json`,
 *   `corrective_travaux.json`, `corrective_intervenants.json`, `audit_events.json`, etc.).
 * - `config/*.json` (3 files): JSON Objects (`{}`) persisting all UI appearance preferences, currency &
 *   fiscal budgets, and system operating flags.
 * - `exports/`: Empty directory reserved for human-readable Type B Excel mirrors.
 */

export interface FolderDirectorySpec {
  path: string;
  required: boolean;
  purpose: string;
}

export interface FolderFileSpec {
  path: string;
  role: FolderFileRole;
  required: boolean;
  jsonRootShape: 'object' | 'array';
  /** 1:1 Type A bundle mapping (only for `catalog/*.json`). */
  typeABundleKind?: TypeAExcelBundleKind;
  /** Canonical `STORAGE_KEYS` entries mapped to this file. */
  storageKeys: readonly string[];
  /** Human-readable description for documentation & Settings preview. */
  description: string;
  /** Produces the canonical empty JSON body for initialization or missing-file repair. */
  buildEmptyBody: () => Record<string, unknown> | unknown[];
}

export const CANONICAL_FOLDER_DIRECTORIES: readonly FolderDirectorySpec[] = [
  {
    path: 'catalog',
    required: true,
    purpose: 'Level 2 & Level 1 structured catalogs aligned 1:1 with the 7 official Type A bundles.',
  },
  {
    path: 'operational',
    required: true,
    purpose: 'Daily operational ledgers, cognitive blueprints, and historical records mapped 1:1 to STORAGE_KEYS.',
  },
  {
    path: 'config',
    required: true,
    purpose: 'User interface preferences, appearance customizations, currency/tax settings, financial budgets, and system flags.',
  },
  {
    path: 'exports',
    required: true,
    purpose: 'Empty outbound directory reserved for future Type B Excel/PDF human-readable mirrors.',
  },
] as const;

export const CANONICAL_CATALOG_FILES: readonly FolderFileSpec[] = [
  {
    path: 'catalog/ref_parc.json',
    role: 'catalog',
    required: true,
    jsonRootShape: 'object',
    typeABundleKind: 'REF_PARC',
    storageKeys: [
      STORAGE_KEYS.ZONES,
      STORAGE_KEYS.FAMILIES,
      STORAGE_KEYS.TEMPLATES,
      STORAGE_KEYS.GENERAL_SYSTEM_TYPES,
    ],
    description: 'Zones, families, equipment templates, and general system types (Type A: REF_PARC).',
    buildEmptyBody: () => ({
      bundleType: 'REF_PARC',
      zones: [],
      families: [],
      templates: [],
      generalSystemTypes: [],
    }),
  },
  {
    path: 'catalog/ref_personnel.json',
    role: 'catalog',
    required: true,
    jsonRootShape: 'object',
    typeABundleKind: 'REF_PERSONNEL',
    storageKeys: [STORAGE_KEYS.TECHNICIANS, STORAGE_KEYS.OPERATIONS, STORAGE_KEYS.PERSONNEL],
    description: 'Operational technicians and managers without any auth secrets (Type A: REF_PERSONNEL).',
    buildEmptyBody: () => ({
      bundleType: 'REF_PERSONNEL',
      technicians: [],
      operations: [],
    }),
  },
  {
    path: 'catalog/assets_machines.json',
    role: 'catalog',
    required: true,
    jsonRootShape: 'object',
    typeABundleKind: 'ASSETS_MACHINES',
    storageKeys: [STORAGE_KEYS.MACHINES],
    description: 'Registered physical shopfloor machines and lines (Type A: ASSETS_MACHINES).',
    buildEmptyBody: () => ({
      bundleType: 'ASSETS_MACHINES',
      machines: [],
    }),
  },
  {
    path: 'catalog/ref_pdr.json',
    role: 'catalog',
    required: true,
    jsonRootShape: 'object',
    typeABundleKind: 'REF_PDR',
    storageKeys: [
      STORAGE_KEYS.PDR_GROUPS,
      STORAGE_KEYS.STOCK_TYPES,
      STORAGE_KEYS.RAW_STOCK,
      STORAGE_KEYS.DESIGNATIONS,
    ],
    description: 'Spare parts groups, types, and PDR items without stock movements (Type A: REF_PDR).',
    buildEmptyBody: () => ({
      bundleType: 'REF_PDR',
      groups: [],
      types: [],
      items: [],
    }),
  },
  {
    path: 'catalog/pm_catalog.json',
    role: 'catalog',
    required: true,
    jsonRootShape: 'object',
    typeABundleKind: 'PM_CATALOG',
    storageKeys: [STORAGE_KEYS.PREVENTIVE_ACTIONS, STORAGE_KEYS.PREVENTIVE_GUIDES],
    description: 'Machine-agnostic preventive actions and maintenance guides (Type A: PM_CATALOG).',
    buildEmptyBody: () => ({
      bundleType: 'PM_CATALOG',
      actions: [],
      guides: [],
    }),
  },
  {
    path: 'catalog/entrepot_bom.json',
    role: 'catalog',
    required: true,
    jsonRootShape: 'object',
    typeABundleKind: 'ENTREPOT_BOM',
    storageKeys: [
      STORAGE_KEYS.COMP_GROUPS,
      STORAGE_KEYS.COMP_FAMILIES,
      STORAGE_KEYS.COMP_TEMPLATES,
      STORAGE_KEYS.PART_GROUPS,
      STORAGE_KEYS.PART_TYPES,
      STORAGE_KEYS.PART_DESIGNATIONS,
    ],
    description: 'Component and part BOM classifications (Type A: ENTREPOT_BOM).',
    buildEmptyBody: () => ({
      bundleType: 'ENTREPOT_BOM',
      compGroups: [],
      compFamilies: [],
      compTemplates: [],
      partGroups: [],
      partTypes: [],
      partDesignations: [],
    }),
  },
  {
    path: 'catalog/cm_catalog.json',
    role: 'catalog',
    required: true,
    jsonRootShape: 'object',
    typeABundleKind: 'CM_CATALOG',
    storageKeys: [
      STORAGE_KEYS.CORRECTIVE_PANNE_CATEGORIES,
      STORAGE_KEYS.CORRECTIVE_ACTIONS_BY_PANNE,
    ],
    description: 'Corrective fault categories and standard troubleshooting actions (Type A: CM_CATALOG).',
    buildEmptyBody: () => ({
      bundleType: 'CM_CATALOG',
      categories: [],
      faults: [],
    }),
  },
] as const;

export const CANONICAL_OPERATIONAL_FILES: readonly FolderFileSpec[] = [
  {
    path: 'operational/mouvements.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.MOUVEMENTS],
    description: 'Guarded stock movement journal (Sortie / Entrée).',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/corrective_interventions.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.CORRECTIVE_INTERVENTIONS],
    description: 'Corrective work orders and intervention requests (DI / BT).',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/corrective_travaux.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.CORRECTIVE_TRAVAUX],
    description: 'Standard and custom corrective work descriptions (Travaux à faire).',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/corrective_intervenants.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.CORRECTIVE_INTERVENANTS],
    description: 'Corrective maintenance intervenants registry.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/preventive_tasks.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.PREVENTIVE_TASKS],
    description: 'Active machine-level preventive maintenance tasks.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/preventive_plans.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.PREVENTIVE_PLANS],
    description: 'Preventive maintenance master plans.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/preventive_executions.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.PREVENTIVE_EXECUTIONS],
    description: 'Immutable dated preventive execution history (periodMonth YYYY-MM).',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/cbm_manual_rules.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.CBM_MANUAL_RULES],
    description: 'Condition-based maintenance (CBM) threshold and trigger rules.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/workshop_orders.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.WORKSHOP_ORDERS],
    description: 'Internal workshop repair and machining orders.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/need_requests.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.NEED_REQUESTS],
    description: 'Maintenance purchase/need requests.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/sortie_demands.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.SORTIE_DEMANDS],
    description: 'Maker-Checker pending stock withdrawal demands.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/warehouse_items.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.WAREHOUSE_ITEMS],
    description: 'Serialized physical warehouse units and spare sub-assemblies.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/machine_elements_ledger.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.MACHINE_BOM],
    description: 'As-Built mounted machine elements ledger (Nexus).',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/meter_readings.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.METER_READINGS],
    description: 'Dated machine operating counter readings.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/replenishment_orders.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.REPLENISHMENT_ORDERS],
    description: 'PDR replenishment purchase orders lifecycle.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/entrepot_components.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.ENTREPOT_COMPONENTS],
    description: 'Serialized warehouse electrical/mechanical components.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/sortie_externe.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.SORTIE_EXTERNE],
    description: 'External subcontractor repair / rewinding tracking.',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/blueprints.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.BLUEPRINTS],
    description: 'Tier 3 cognitive engineering digital twins (Blueprints).',
    buildEmptyBody: () => [],
  },
  {
    path: 'operational/audit_events.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.AUDIT_EVENTS],
    description: 'Institutional append-only audit ledger.',
    buildEmptyBody: () => [],
  },
] as const;

export const CANONICAL_CONFIG_FILES: readonly FolderFileSpec[] = [
  {
    path: 'config/preferences.json',
    role: 'config',
    required: true,
    jsonRootShape: 'object',
    storageKeys: [
      STORAGE_KEYS.DEVICE_MODE,
      STORAGE_KEYS.SIDEBAR_STYLE,
      STORAGE_KEYS.SIDEBAR_BEHAVIOR,
      STORAGE_KEYS.SIDEBAR_THEME,
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.DENSITY,
      STORAGE_KEYS.ACCENT_COLOR,
      STORAGE_KEYS.ANIMATIONS,
      STORAGE_KEYS.HEADER_CLOCK,
      STORAGE_KEYS.LANGUAGE,
      STORAGE_KEYS.ACTIVE_TAB,
      STORAGE_KEYS.WIZARD_FEATURE_FLAGS,
      STORAGE_KEYS.ONBOARDING_DISMISSED,
    ],
    description: 'UI appearance, density, accent color, sidebar layout, language, and ergonomics preferences.',
    buildEmptyBody: () => ({
      deviceMode: 'auto',
      sidebarStyle: 'floating',
      sidebarBehavior: 'push',
      sidebarTheme: 'light',
      theme: 'light',
      density: 'comfortable',
      accentColor: 'emerald',
      animations: 'true',
      headerClock: 'true',
      language: 'fr',
      activeTab: 'dashboard',
      wizardFeatureFlags: {},
      onboardingDismissed: 'false',
    }),
  },
  {
    path: 'config/finance_currency.json',
    role: 'config',
    required: true,
    jsonRootShape: 'object',
    storageKeys: [STORAGE_KEYS.CURRENCY_CONFIG, STORAGE_KEYS.FINANCIAL_BUDGETS],
    description: 'Active currency, exchange rates, VAT/TVA rate, and annual/monthly maintenance budgets.',
    buildEmptyBody: () => ({
      currencyConfig: null,
      financialBudgets: null,
    }),
  },
  {
    path: 'config/system_flags.json',
    role: 'config',
    required: true,
    jsonRootShape: 'object',
    storageKeys: [
      STORAGE_KEYS.START_MODE,
      STORAGE_KEYS.DEMO_MODE,
      STORAGE_KEYS.AUTO_WRITE_EXCEL,
      STORAGE_KEYS.POLLING_INTERVAL,
      STORAGE_KEYS.CACHE_CEILING_MB,
      STORAGE_KEYS.STORAGE_CEILING_MB,
      STORAGE_KEYS.SHARED_FOLDER_PATH,
      STORAGE_KEYS.WORKSPACE_PROFILE,
    ],
    description: 'Factory start mode (empty/custom/demo), workspace mode profile, auto-mirror flags, and storage ceilings.',
    buildEmptyBody: () => ({
      startMode: 'empty',
      demoMode: false,
      autoWriteExcel: 'false',
      pollingInterval: '15',
      cacheCeilingMb: '256',
      storageCeilingMb: '1024',
      sharedFolderPath: '',
      workspaceProfile: null,
    }),
  },
] as const;

export const ALL_CANONICAL_FILES: readonly FolderFileSpec[] = [
  ...CANONICAL_CATALOG_FILES,
  ...CANONICAL_OPERATIONAL_FILES,
  ...CANONICAL_CONFIG_FILES,
];

const FILE_SPEC_BY_PATH = new Map<string, FolderFileSpec>();
const FILE_SPECS_BY_STORAGE_KEY = new Map<string, FolderFileSpec[]>();

for (const spec of ALL_CANONICAL_FILES) {
  FILE_SPEC_BY_PATH.set(spec.path, spec);
  for (const key of spec.storageKeys) {
    const existing = FILE_SPECS_BY_STORAGE_KEY.get(key) ?? [];
    if (!existing.some((s) => s.path === spec.path)) {
      existing.push(spec);
    }
    FILE_SPECS_BY_STORAGE_KEY.set(key, existing);
  }
}

/**
 * O(1) lookup of a canonical folder file specification by its relative path.
 */
export function getFolderFileSpecByPath(relativePath: string): FolderFileSpec | undefined {
  const clean = normalizeFolderRelativePath(relativePath, { stripRootPrefix: true });
  return FILE_SPEC_BY_PATH.get(clean);
}

/**
 * O(1) lookup returning all canonical folder files affected when a given `STORAGE_KEYS` key changes.
 */
export function getFolderFilesForStorageKey(storageKey: string): readonly FolderFileSpec[] {
  return FILE_SPECS_BY_STORAGE_KEY.get(storageKey) ?? [];
}

/**
 * Builds the `manifest.files` dictionary directly from the canonical file specifications.
 */
export function buildManifestFilesMap(): Record<string, FolderManifestFileEntry> {
  const files: Record<string, FolderManifestFileEntry> = {};
  for (const spec of ALL_CANONICAL_FILES) {
    files[spec.path] = {
      required: spec.required,
      role: spec.role,
      ...(spec.typeABundleKind ? { typeABundleKind: spec.typeABundleKind } : {}),
      storageKeys: [...spec.storageKeys],
    };
  }
  return files;
}
