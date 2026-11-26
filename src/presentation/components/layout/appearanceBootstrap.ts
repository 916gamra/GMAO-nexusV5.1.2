import { STORAGE_KEYS } from '../../../infrastructure/persistence/storageKeys';
import { storageService } from '../../../utils/storageService';
import { AuthorizationService, type AuthActorInput } from '../../../core/security/AuthorizationService';
import { isTechnicianRole } from '../../../core/security/technicianScope';
import { loadWorkspaceProfile } from '../../../core/workspace/workspaceProfile';

export interface AppliedAppearanceDomState {
  accentColor: string;
  density: 'comfortable' | 'compact';
  theme: 'light' | 'dark';
  animations: 'on' | 'off';
  deviceMode: string;
  sidebarStyle: string;
}

/**
 * Hydrates root <html> visual attributes from canonical STORAGE_KEYS before React mounts
 * (Cold Boot SSOT) so F5 reloads preserve density, accent, dark sidebar/theme, and animation prefs.
 */
export function applyAppearanceDomFromStorage(
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): AppliedAppearanceDomState {
  const accentColor = String(storageService.getItem(STORAGE_KEYS.ACCENT_COLOR) || 'emerald');
  const rawDensity = String(storageService.getItem(STORAGE_KEYS.DENSITY) || 'comfortable');
  const density: 'comfortable' | 'compact' = rawDensity === 'compact' ? 'compact' : 'comfortable';
  const rawTheme = String(
    storageService.getItem(STORAGE_KEYS.THEME) ||
      storageService.getItem(STORAGE_KEYS.SIDEBAR_THEME) ||
      'light'
  );
  const theme: 'light' | 'dark' = rawTheme === 'dark' ? 'dark' : 'light';
  const animations: 'on' | 'off' =
    storageService.getItem(STORAGE_KEYS.ANIMATIONS) === 'false' ? 'off' : 'on';
  const deviceMode = String(storageService.getItem(STORAGE_KEYS.DEVICE_MODE) || 'auto');
  const sidebarStyle = String(storageService.getItem(STORAGE_KEYS.SIDEBAR_STYLE) || 'floating');

  if (doc?.documentElement) {
    doc.documentElement.setAttribute('data-accent', accentColor);
    doc.documentElement.setAttribute('data-density', density);
    doc.documentElement.setAttribute('data-animations', animations);
    doc.documentElement.setAttribute('data-device-mode', deviceMode);
    doc.documentElement.setAttribute('data-sidebar-style', sidebarStyle);
    doc.documentElement.setAttribute('data-sidebar-theme', theme);
    // Keep workspace strictly coherent in Light UI Excel; dark contrast is scoped to navigation/sidebars via data-sidebar-theme="dark"
    doc.documentElement.classList.remove('dark');
  }

  return { accentColor, density, theme, animations, deviceMode, sidebarStyle };
}

/**
 * Fail-closed guard for Maker-Checker validation badges and navigation shortcuts.
 * Prevents unauthenticated sessions, TECHNICIEN, OPERATEUR, VIEWER, and SOLO_DIRECT workspace mode
 * from seeing or clicking Maker-Checker validation badges.
 */
export function canViewMakerCheckerValidation(user: AuthActorInput): boolean {
  if (!user) return false;
  if (loadWorkspaceProfile().governanceMode === 'SOLO_DIRECT') return false;
  const actorObj = typeof user === 'string' ? { role: user } : { role: user.role };
  if (isTechnicianRole(actorObj)) return false;
  return AuthorizationService.canAccessTab(user, 'validation_center');
}
