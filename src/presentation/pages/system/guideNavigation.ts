import { AuthorizationService, type AuthActorInput } from '../../../core/security/AuthorizationService';
import { STORAGE_KEYS } from '../../../infrastructure/persistence/storageKeys';
import { storageService } from '../../../utils/storageService';

export interface GuideSettingsRouteSpec {
  /** Target sub-tab ID understood by SettingsView (`STORAGE_KEYS.SETTINGS_TARGET_TAB`). */
  settingsSubTab: string;
  /** User needs at least one of these permissions (mirrors SettingsView.allowedTabIds). */
  anyOf?: readonly string[];
  /** User needs all of these permissions (mirrors SettingsView.allowedTabIds). */
  allOf?: readonly string[];
}

/**
 * Canonical mapping from Guide documentation tab IDs (`settings*`) to
 * AppRouter route `'settings'` + SettingsView sub-tab ID + RBAC requirements.
 */
export const SETTINGS_GUIDE_TAB_MAP: Readonly<Record<string, GuideSettingsRouteSpec>> = {
  settings: { settingsSubTab: 'overview', anyOf: ['settings.view', 'settings.backup'] },
  settings_mvt_logic: { settingsSubTab: 'mvt-logic', anyOf: ['settings.view', 'settings.backup'] },
  settings_injection: { settingsSubTab: 'injection', allOf: ['settings.manage'] },
  settings_directory: { settingsSubTab: 'directory', anyOf: ['settings.view', 'settings.backup'] },
  settings_matching: { settingsSubTab: 'matching', anyOf: ['settings.view', 'settings.backup'] },
  settings_json_editor: { settingsSubTab: 'json-editor', allOf: ['settings.manage'] },
  settings_backup_audit: { settingsSubTab: 'backup-audit', anyOf: ['settings.view', 'settings.backup'] },
  settings_admin: { settingsSubTab: 'admin', allOf: ['settings.manage', 'users.manage'] },
  settings_performance: { settingsSubTab: 'performance', allOf: ['settings.view'] },
  settings_currency: { settingsSubTab: 'currency', anyOf: ['settings.view', 'settings.manage'] },
};

export interface ResolvedGuideNavigation {
  routeTab: string;
  settingsSubTab?: string;
}

export function resolveGuideTabNavigation(rawTabId: string): ResolvedGuideNavigation {
  const cleanId = String(rawTabId || '').trim();
  const settingsSpec = SETTINGS_GUIDE_TAB_MAP[cleanId];
  if (settingsSpec) {
    return {
      routeTab: 'settings',
      settingsSubTab: settingsSpec.settingsSubTab,
    };
  }
  return { routeTab: cleanId };
}

/**
 * Fail-closed RBAC check for Guide "Open screen" buttons.
 * Mirrors AppRouter (`canAccessTab`) AND SettingsView internal sub-tab guards (`allowedTabIds`).
 */
export function canNavigateToGuideTab(user: AuthActorInput, rawTabId: string): boolean {
  const cleanId = String(rawTabId || '').trim();
  if (!user || !cleanId) return false;

  const { routeTab } = resolveGuideTabNavigation(cleanId);
  if (!AuthorizationService.canAccessTab(user, routeTab)) {
    return false;
  }

  const settingsSpec = SETTINGS_GUIDE_TAB_MAP[cleanId];
  if (settingsSpec) {
    if (settingsSpec.allOf && !settingsSpec.allOf.every((perm) => AuthorizationService.hasPermission(user, perm))) {
      return false;
    }
    if (settingsSpec.anyOf && !settingsSpec.anyOf.some((perm) => AuthorizationService.hasPermission(user, perm))) {
      return false;
    }
  }

  return true;
}

/**
 * Executes a guarded navigation from GuideView to the target application screen,
 * persisting `STORAGE_KEYS.SETTINGS_TARGET_TAB` when jumping directly into a Settings sub-tab.
 */
export function executeGuideTabNavigation(
  user: AuthActorInput,
  rawTabId: string,
  onNavigateToTab?: (tabId: string) => void
): boolean {
  if (!onNavigateToTab || !canNavigateToGuideTab(user, rawTabId)) {
    return false;
  }
  const { routeTab, settingsSubTab } = resolveGuideTabNavigation(rawTabId);
  if (settingsSubTab) {
    storageService.setItem(STORAGE_KEYS.SETTINGS_TARGET_TAB, settingsSubTab);
  }
  onNavigateToTab(routeTab);
  return true;
}

export interface GuideDocLookupCandidate {
  id: string;
  groupId: string;
  docType: 'architecture' | 'page';
  audience: 'developer' | 'user';
  tabId?: string;
  filePath: string;
}

/**
 * Context-aware document resolver for duplicate tabIds (e.g., `nexus` in both Group 02 and Group 06).
 */
export function findGuideDocForTab<T extends GuideDocLookupCandidate>(
  docs: readonly T[],
  tabId: string,
  preferredGroupId?: string | null,
  preferredAudience: 'all' | 'user' | 'developer' = 'all'
): T | undefined {
  const matches = docs.filter((d) => d.tabId === tabId);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  const groupMatches =
    preferredGroupId && preferredGroupId !== 'all'
      ? matches.filter((d) => d.groupId === preferredGroupId)
      : [];

  const pool = groupMatches.length > 0 ? groupMatches : matches;

  if (preferredAudience !== 'all') {
    const audienceMatch = pool.find((d) => d.audience === preferredAudience);
    if (audienceMatch) return audienceMatch;
  }

  return pool.find((d) => d.docType === 'page') || pool[0];
}

/**
 * Resolves a relative or internal markdown link target (e.g. `./page-blueprints-machines.md`, `#nexus`, `settings_currency`)
 * to either a matching doc in `docs` or a direct tabId.
 */
export function resolveGuideInternalHref<T extends GuideDocLookupCandidate>(
  docs: readonly T[],
  href: string,
  currentDoc?: T | null
): { doc?: T; tabId?: string; externalUrl?: string } | null {
  const trimmed = String(href || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return { externalUrl: trimmed };
  }

  // Block dangerous schemes (javascript:, data:, vbscript:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith('#')) {
    const targetTab = trimmed.slice(1).trim();
    if (!targetTab) return null;
    const doc = findGuideDocForTab(docs, targetTab, currentDoc?.groupId);
    return doc ? { doc } : { tabId: targetTab };
  }

  const normalizedHref = trimmed.replace(/^\.\//, '').replace(/^\//, '').split('#')[0];
  if (normalizedHref.toLowerCase().endsWith('.md')) {
    const exactPathMatch = docs.find((d) => {
      const normalizedDocPath = d.filePath.replace(/^\//, '');
      return normalizedDocPath === normalizedHref || normalizedDocPath.endsWith(`/${normalizedHref}`);
    });
    if (exactPathMatch) return { doc: exactPathMatch };

    // Try resolving relative to currentDoc's folder
    if (currentDoc) {
      const folder = currentDoc.filePath.slice(0, currentDoc.filePath.lastIndexOf('/') + 1);
      const siblingPath = `${folder}${normalizedHref}`;
      const siblingMatch = docs.find((d) => d.filePath === siblingPath);
      if (siblingMatch) return { doc: siblingMatch };
    }
  }

  return null;
}
