import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';

/**
 * Workspace Operating Modes (Phase SOLO-EXPERT-P1)
 *
 * Orthogonal 2-axis model + modular UI projection:
 * - `TEAM_FULL` (Default): Full enterprise multi-role GMAO with Maker-Checker governance.
 * - `SOLO_EXPERT` (Active): Field Maintenance Engineer mode with direct ADMIN execution (`SOLO_DIRECT`),
 *   focused navigation (Machines, Components/Parts, Preventive, Corrective, PDR Sortie, Reports),
 *   optional Blueprint layer, and zero data loss when toggling back to `TEAM_FULL`.
 * - `SOLO_LIGHT` (Locked / Coming Soon): Future simplified solo mode — defined in architecture & docs
 *   but strictly blocked from activation until its dedicated design phase is approved.
 */

export type WorkspacePreset = 'TEAM_FULL' | 'SOLO_EXPERT' | 'SOLO_LIGHT';
export type WorkspaceGovernanceMode = 'TEAM_MAKER_CHECKER' | 'SOLO_DIRECT';
export type WorkspaceUiComplexity = 'FULL' | 'LIGHT';

export interface WorkspaceModuleVisibility {
  /** Show Coûts & Budgets (`finance`) in primary navigation. */
  showFinance: boolean;
  /** Show Magasin Stock Balances (`stock` articles view) in primary navigation (Sortie & PDR catalogs stay visible). */
  showStockInventory: boolean;
  /** Show Tier 3 Blueprints (`blueprints` & Blueprint fields) in primary navigation; Families -> Templates -> Machines remain visible. */
  showBlueprintsInPrimaryNav: boolean;
  /** Show Team & Users management (`utilisateurs`) in primary navigation. */
  showTeamManagement: boolean;
}

export interface WorkspaceProfile {
  preset: WorkspacePreset;
  governanceMode: WorkspaceGovernanceMode;
  uiComplexity: WorkspaceUiComplexity;
  moduleVisibility: WorkspaceModuleVisibility;
  updatedAt?: string;
}

export interface WorkspacePresetDefinition {
  preset: WorkspacePreset;
  enabled: boolean;
  status: 'ACTIVE' | 'COMING_SOON';
  defaultProfile: WorkspaceProfile;
}

export const WORKSPACE_PROFILE_EVENT = 'gmao:workspace_profile_changed';

export const WORKSPACE_PRESET_DEFINITIONS: Readonly<Record<WorkspacePreset, WorkspacePresetDefinition>> = {
  TEAM_FULL: {
    preset: 'TEAM_FULL',
    enabled: true,
    status: 'ACTIVE',
    defaultProfile: {
      preset: 'TEAM_FULL',
      governanceMode: 'TEAM_MAKER_CHECKER',
      uiComplexity: 'FULL',
      moduleVisibility: {
        showFinance: true,
        showStockInventory: true,
        showBlueprintsInPrimaryNav: true,
        showTeamManagement: true,
      },
    },
  },
  SOLO_EXPERT: {
    preset: 'SOLO_EXPERT',
    enabled: true,
    status: 'ACTIVE',
    defaultProfile: {
      preset: 'SOLO_EXPERT',
      governanceMode: 'SOLO_DIRECT',
      uiComplexity: 'FULL',
      moduleVisibility: {
        showFinance: false,
        showStockInventory: false,
        showBlueprintsInPrimaryNav: false,
        showTeamManagement: false,
      },
    },
  },
  SOLO_LIGHT: {
    preset: 'SOLO_LIGHT',
    enabled: false,
    status: 'COMING_SOON',
    defaultProfile: {
      preset: 'SOLO_LIGHT',
      governanceMode: 'SOLO_DIRECT',
      uiComplexity: 'LIGHT',
      moduleVisibility: {
        showFinance: false,
        showStockInventory: false,
        showBlueprintsInPrimaryNav: false,
        showTeamManagement: false,
      },
    },
  },
};

export const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = Object.freeze({
  ...WORKSPACE_PRESET_DEFINITIONS.TEAM_FULL.defaultProfile,
  moduleVisibility: Object.freeze({
    ...WORKSPACE_PRESET_DEFINITIONS.TEAM_FULL.defaultProfile.moduleVisibility,
  }),
});

export function isWorkspacePresetEnabled(preset: unknown): preset is 'TEAM_FULL' | 'SOLO_EXPERT' {
  const clean = String(preset || '').trim().toUpperCase();
  if (clean === 'TEAM_FULL' || clean === 'SOLO_EXPERT') {
    return WORKSPACE_PRESET_DEFINITIONS[clean].enabled;
  }
  return false;
}

/**
 * Normalizes any persisted/imported raw value into a safe, valid WorkspaceProfile.
 * Fail-closed: `SOLO_LIGHT` (locked) or malformed payloads safely resolve to `TEAM_FULL`.
 */
export function normalizeWorkspaceProfile(raw: unknown): WorkspaceProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneProfile(DEFAULT_WORKSPACE_PROFILE);
  }
  const obj = raw as Record<string, unknown>;
  const rawPreset = String(obj.preset || '').trim().toUpperCase();

  if (!isWorkspacePresetEnabled(rawPreset)) {
    return cloneProfile(DEFAULT_WORKSPACE_PROFILE);
  }

  const base = WORKSPACE_PRESET_DEFINITIONS[rawPreset].defaultProfile;
  const rawGov = String(obj.governanceMode || '').trim().toUpperCase();
  const governanceMode: WorkspaceGovernanceMode =
    rawGov === 'SOLO_DIRECT' || rawGov === 'TEAM_MAKER_CHECKER'
      ? (rawGov as WorkspaceGovernanceMode)
      : base.governanceMode;

  const rawVis =
    obj.moduleVisibility && typeof obj.moduleVisibility === 'object' && !Array.isArray(obj.moduleVisibility)
      ? (obj.moduleVisibility as Record<string, unknown>)
      : {};

  const moduleVisibility: WorkspaceModuleVisibility = {
    showFinance:
      typeof rawVis.showFinance === 'boolean' ? rawVis.showFinance : base.moduleVisibility.showFinance,
    showStockInventory:
      typeof rawVis.showStockInventory === 'boolean'
        ? rawVis.showStockInventory
        : base.moduleVisibility.showStockInventory,
    showBlueprintsInPrimaryNav:
      typeof rawVis.showBlueprintsInPrimaryNav === 'boolean'
        ? rawVis.showBlueprintsInPrimaryNav
        : base.moduleVisibility.showBlueprintsInPrimaryNav,
    showTeamManagement:
      typeof rawVis.showTeamManagement === 'boolean'
        ? rawVis.showTeamManagement
        : base.moduleVisibility.showTeamManagement,
  };

  return {
    preset: rawPreset,
    governanceMode,
    uiComplexity: 'FULL',
    moduleVisibility,
    ...(typeof obj.updatedAt === 'string' && obj.updatedAt.trim() ? { updatedAt: obj.updatedAt.trim() } : {}),
  };
}

function cloneProfile(profile: WorkspaceProfile): WorkspaceProfile {
  return {
    preset: profile.preset,
    governanceMode: profile.governanceMode,
    uiComplexity: profile.uiComplexity,
    moduleVisibility: { ...profile.moduleVisibility },
    ...(profile.updatedAt ? { updatedAt: profile.updatedAt } : {}),
  };
}

let cachedSerializedKey = '';
let cachedSnapshot: WorkspaceProfile = DEFAULT_WORKSPACE_PROFILE;
const listeners = new Set<() => void>();

function notifyWorkspaceListeners(profile: WorkspaceProfile): void {
  const serialized = JSON.stringify(profile);
  cachedSerializedKey = serialized;
  cachedSnapshot = profile;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber failure
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(WORKSPACE_PROFILE_EVENT, { detail: profile }));
    } catch {
      // ignore non-DOM environments
    }
  }
}

export function loadWorkspaceProfile(): WorkspaceProfile {
  try {
    const raw = storageService.getItem(STORAGE_KEYS.WORKSPACE_PROFILE);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const normalized = normalizeWorkspaceProfile(parsed);
    const serialized = JSON.stringify(normalized);
    if (serialized === cachedSerializedKey) {
      return cachedSnapshot;
    }
    cachedSerializedKey = serialized;
    cachedSnapshot = normalized;
    return normalized;
  } catch {
    return DEFAULT_WORKSPACE_PROFILE;
  }
}

export function saveWorkspaceProfile(next: WorkspaceProfile): WorkspaceProfile {
  const normalized = normalizeWorkspaceProfile({
    ...next,
    updatedAt: next.updatedAt || new Date().toISOString(),
  });
  storageService.setItem(STORAGE_KEYS.WORKSPACE_PROFILE, normalized);
  notifyWorkspaceListeners(normalized);
  return normalized;
}

export interface ApplyWorkspacePresetResult {
  ok: boolean;
  profile: WorkspaceProfile;
  error?: string;
}

/**
 * Switches between enabled presets (`TEAM_FULL` <-> `SOLO_EXPERT`) cleanly with zero data mutation.
 * Explicitly refuses `SOLO_LIGHT` until its design & specification phase is enabled.
 */
export function applyWorkspacePreset(preset: WorkspacePreset): ApplyWorkspacePresetResult {
  if (!isWorkspacePresetEnabled(preset)) {
    return {
      ok: false,
      profile: loadWorkspaceProfile(),
      error:
        preset === 'SOLO_LIGHT'
          ? 'Le mode Solo Light est en cours de conception et n’est pas encore activable.'
          : `Mode d'espace de travail non pris en charge : ${String(preset)}`,
    };
  }
  const base = WORKSPACE_PRESET_DEFINITIONS[preset].defaultProfile;
  const saved = saveWorkspaceProfile({
    ...cloneProfile(base),
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, profile: saved };
}

/**
 * Updates one or more modular visibility switches without altering the active preset or any domain data.
 */
export function updateWorkspaceModuleVisibility(
  patch: Partial<WorkspaceModuleVisibility>
): WorkspaceProfile {
  const current = loadWorkspaceProfile();
  return saveWorkspaceProfile({
    ...current,
    moduleVisibility: {
      ...current.moduleVisibility,
      ...patch,
    },
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Hydrates in-memory snapshot after an external storage load (e.g., GMAO_Data/ folder restore)
 * without re-writing storage.
 */
export function refreshWorkspaceProfileCache(): WorkspaceProfile {
  const fresh = loadWorkspaceProfile();
  notifyWorkspaceListeners(fresh);
  return fresh;
}

/**
 * Fail-closed governance check:
 * `SOLO_DIRECT` self-execution/validation is authorized ONLY when:
 * 1) Active workspace governanceMode is explicitly `'SOLO_DIRECT'`, AND
 * 2) Authenticated actor's verified role is strictly `'ADMIN'`.
 *
 * Never applies to TECHNICIEN, OPERATEUR, RESPONSABLE_MAINTENANCE, MAGASINIER, VIEWER, or null.
 */
export function isSoloDirectAllowedForActor(
  actorRole?: unknown,
  profile: WorkspaceProfile = loadWorkspaceProfile()
): boolean {
  if (profile.governanceMode !== 'SOLO_DIRECT') return false;
  const cleanRole = String(actorRole || '').trim().toUpperCase();
  return cleanRole === 'ADMIN';
}

/**
 * Pure navigation projection filter:
 * Determines whether a tab/sub-tab should be displayed in primary navigation for the active workspace profile.
 * Never deletes routes or data — hidden modules remain intact and immediately accessible if re-enabled.
 */
export function isTabVisibleInWorkspace(
  tabId: string,
  profile: WorkspaceProfile = loadWorkspaceProfile()
): boolean {
  const cleanTab = String(tabId || '').trim();
  if (!cleanTab) return false;

  if (cleanTab === 'validation_center' && profile.governanceMode === 'SOLO_DIRECT') {
    return false;
  }
  if (cleanTab === 'finance' && !profile.moduleVisibility.showFinance) {
    return false;
  }
  if (cleanTab === 'stock' && !profile.moduleVisibility.showStockInventory) {
    return false;
  }
  if (cleanTab === 'blueprints' && !profile.moduleVisibility.showBlueprintsInPrimaryNav) {
    return false;
  }
  if (cleanTab === 'utilisateurs' && !profile.moduleVisibility.showTeamManagement) {
    return false;
  }

  return true;
}

function subscribeWorkspaceProfile(callback: () => void): () => void {
  listeners.add(callback);
  const handleWindowEvent = () => callback();
  if (typeof window !== 'undefined') {
    window.addEventListener(WORKSPACE_PROFILE_EVENT, handleWindowEvent);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener(WORKSPACE_PROFILE_EVENT, handleWindowEvent);
    }
  };
}

/**
 * Reactive hook backed by `useSyncExternalStore` so Header, Sidebars, and Settings
 * update immediately on workspace mode switch without requiring a page reload.
 */
export function useWorkspaceProfile(): WorkspaceProfile {
  return useSyncExternalStore(
    subscribeWorkspaceProfile,
    loadWorkspaceProfile,
    () => DEFAULT_WORKSPACE_PROFILE
  );
}
