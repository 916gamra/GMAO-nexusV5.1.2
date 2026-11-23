import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import type { TypeAExcelBundleKind } from '../../services/import/typeAExcelBridge';
import type { FolderFileRole, FolderManifestFileEntry } from './folderManifest';

/**
 * Canonical Tree Definition for `GMAO_Data/` (Phase L1 — Structure Contract Only).
 *
 * IMPORTANT ARCHITECTURAL BOUNDARY (Phase L1):
 * - Live operational reads/writes STILL run exclusively through `DataGateway` + `storageService`
 *   (RAM / IndexedDB / localStorage).
 * - Live structured imports STILL run exclusively through `UnifiedImportPipeline`.
 * - This module defines the future durable folder layout aligned 1:1 with the 7 official Type A
 *   bundles (`catalog/*.json`) and canonical `STORAGE_KEYS` operational slices (`operational/*.json`).
 *
 * JSON Shape Choice (Documented Contract):
 * - `catalog/*.json` files are **JSON Objects (`{ "bundleType": "...", ... }`)** matching the
 *   exact top-level contract of official Type A templates (`templates/import/*.template.json`),
 *   so each catalog file can be round-tripped cleanly with `UnifiedImportPipeline` in Phase L2.
 * - `operational/*.json` files are **JSON Arrays (`[]`)**, matching 1:1 the array collections
 *   persisted in `STORAGE_KEYS` (`DataGateway` / repositories).
 *
 * Deferred Domain Keys (explicitly NOT included in L1 tree yet — reserved for L2):
 * - `BLUEPRINTS` (`gmao_blueprints_v2`): Tier 3 cognitive twin derived inside the app.
 * - `PREVENTIVE_PLANS`, `CBM_MANUAL_RULES`, `FINANCIAL_BUDGETS`, `CURRENCY_CONFIG`,
 *   `CORRECTIVE_TRAVAUX`, `CORRECTIVE_INTERVENANTS`: secondary/config slices deferred to L2.
 * - `AUTH_ACCOUNTS`, `LICENSE_RECORD`, `REMEMBERED_LICENSE_KEY`: strictly excluded from the
 *   human-readable data folder for security isolation.
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
    purpose: 'Daily operational ledgers mapped 1:1 to canonical STORAGE_KEYS collections.',
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
    storageKeys: [STORAGE_KEYS.TECHNICIANS, STORAGE_KEYS.OPERATIONS],
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
    path: 'operational/preventive_tasks.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.PREVENTIVE_TASKS],
    description: 'Active machine-level preventive maintenance tasks.',
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
    path: 'operational/audit_events.json',
    role: 'operational',
    required: true,
    jsonRootShape: 'array',
    storageKeys: [STORAGE_KEYS.AUDIT_EVENTS],
    description: 'Institutional append-only audit ledger.',
    buildEmptyBody: () => [],
  },
] as const;

export const ALL_CANONICAL_FILES: readonly FolderFileSpec[] = [
  ...CANONICAL_CATALOG_FILES,
  ...CANONICAL_OPERATIONAL_FILES,
];

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
