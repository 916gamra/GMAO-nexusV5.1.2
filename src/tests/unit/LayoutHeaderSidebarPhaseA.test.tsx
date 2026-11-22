import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Header from '../../presentation/components/layout/Header';
import FloatingSidebar from '../../presentation/components/layout/FloatingSidebar';
import MobileSidebarDrawer from '../../presentation/components/layout/MobileSidebarDrawer';
import MainLayout from '../../presentation/components/layout/MainLayout';
import AppearanceLayoutSelector from '../../presentation/components/settings/AppearanceLayoutSelector';
import {
  PARENT_MODULES,
  SETTINGS_PARENT_MODULE,
  SIDEBAR_NAV_GROUPS,
  getParentModuleForTab,
} from '../../presentation/components/layout/navConfig';
import {
  applyAppearanceDomFromStorage,
  canViewMakerCheckerValidation,
} from '../../presentation/components/layout/appearanceBootstrap';
import { I18nProvider } from '../../i18n/I18nContext';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import fs from 'fs';
import path from 'path';

const mockAuthState: {
  user: { id: string; username: string; name: string; role: string; titleFr?: string } | null;
  logout: ReturnType<typeof vi.fn>;
} = {
  user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN', titleFr: 'Administrateur' },
  logout: vi.fn(),
};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

describe('Phase A — Header, Sidebar & MainLayout P0 Security, Cold Boot & Unified Tools', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-sidebar-theme');
    document.documentElement.removeAttribute('data-accent');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-animations');
    document.documentElement.removeAttribute('data-sidebar-style');
    storageService.setItem(STORAGE_KEYS.LANGUAGE, 'fr');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockAuthState.user = {
      id: 'admin-1',
      username: 'admin',
      name: 'Admin',
      role: 'ADMIN',
      titleFr: 'Administrateur',
    };
    mockAuthState.logout = vi.fn();
  });

  afterEach(() => {
    React.act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('Cold Boot: restores data-accent, data-density, scoped data-sidebar-theme (never leaking global .dark), and data-animations before React mounts', () => {
    document.documentElement.classList.add('dark'); // Legacy polluted state
    storageService.setItem(STORAGE_KEYS.ACCENT_COLOR, 'indigo');
    storageService.setItem(STORAGE_KEYS.DENSITY, 'compact');
    storageService.setItem(STORAGE_KEYS.THEME, 'dark');
    storageService.setItem(STORAGE_KEYS.ANIMATIONS, 'false');
    storageService.setItem(STORAGE_KEYS.SIDEBAR_STYLE, 'standard');

    const applied = applyAppearanceDomFromStorage(document);
    expect(applied).toMatchObject({
      accentColor: 'indigo',
      density: 'compact',
      theme: 'dark',
      animations: 'off',
      sidebarStyle: 'standard',
    });
    expect(document.documentElement.getAttribute('data-accent')).toBe('indigo');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-animations')).toBe('off');
    expect(document.documentElement.getAttribute('data-sidebar-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Reverting to light + comfortable + animations on updates data-sidebar-theme cleanly
    storageService.setItem(STORAGE_KEYS.THEME, 'light');
    storageService.setItem(STORAGE_KEYS.DENSITY, 'comfortable');
    storageService.setItem(STORAGE_KEYS.ANIMATIONS, 'true');
    applyAppearanceDomFromStorage(document);
    expect(document.documentElement.getAttribute('data-sidebar-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-animations')).toBe('on');
  });

  it('Fail-Closed RBAC: denies Maker-Checker validation badges and navigation to null, TECHNICIEN, OPERATEUR, and VIEWER', () => {
    expect(canViewMakerCheckerValidation(null)).toBe(false);
    expect(canViewMakerCheckerValidation({ id: 't1', role: 'TECHNICIEN' })).toBe(false);
    expect(canViewMakerCheckerValidation({ id: 'o1', role: 'OPERATEUR' })).toBe(false);
    expect(canViewMakerCheckerValidation({ id: 'v1', role: 'VIEWER' })).toBe(false);
    expect(canViewMakerCheckerValidation({ id: 'a1', role: 'ADMIN' })).toBe(true);
    expect(canViewMakerCheckerValidation({ id: 'r1', role: 'RESPONSABLE_MAINTENANCE' })).toBe(true);
  });

  it('Header fails closed when currentUser is null (no Export, Import, Sync, Validation, or child tabs)', async () => {
    const fileInputRef = { current: null };
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <Header
            currentTab="stock"
            setCurrentTab={vi.fn()}
            counts={{
              pendingSortieDemands: 4,
              pendingPreventiveValidation: 2,
              pendingCorrectiveValidation: 3,
            }}
            setMobileMenuOpen={vi.fn()}
            fileInputRef={fileInputRef}
            handleImportFile={vi.fn()}
            handleExportExcel={vi.fn()}
            currentUser={null}
          />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="header-export-menu"]')).toBeNull();
    expect(container.querySelector('[data-testid="header-import-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="header-user-menu"]')).toBeNull();
    expect(container.querySelectorAll('[role="tab"]').length).toBe(0);
    expect(container.textContent).not.toContain('À valider');
  });

  it('Header keeps Export (4 workbooks) & Import Type A available in standard mode (expanded & collapsed) and preserves mobile brand visibility', async () => {
    storageService.setItem(STORAGE_KEYS.SIDEBAR_STYLE, 'standard');
    const fileInputRef = { current: { click: vi.fn() } };
    const exportMaster = vi.fn();

    await React.act(async () => {
      root.render(
        <I18nProvider>
          <Header
            currentTab="stock"
            setCurrentTab={vi.fn()}
            counts={{ pendingSortieDemands: 1 }}
            setMobileMenuOpen={vi.fn()}
            fileInputRef={fileInputRef}
            handleImportFile={vi.fn()}
            handleExportExcel={vi.fn()}
            exportMasterTopologyWorkbook={exportMaster}
            exportInventoryMaterialsWorkbook={vi.fn()}
            exportMovementsUnifiedWorkbook={vi.fn()}
            currentUser={mockAuthState.user}
            desktopSidebarCollapsed={true}
            onToggleDesktopSidebar={vi.fn()}
          />
        </I18nProvider>
      );
    });

    // Export dropdown and Import button MUST exist even in standard + collapsed mode
    const exportMenu = container.querySelector('[data-testid="header-export-menu"]');
    expect(exportMenu).not.toBeNull();
    expect(container.querySelector('[data-testid="header-import-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="header-user-menu"]')).not.toBeNull();

    // Open dropdown and verify specialized Classeur 1 is accessible
    const exportTrigger = exportMenu?.querySelector('button') as HTMLButtonElement | null;
    await React.act(async () => {
      exportTrigger?.click();
    });
    expect(container.textContent).toContain('Classeur 1 : GMAO_Topology_Master');
    expect(container.textContent).toContain('Classeur 2 : GMAO_Inventory_Materials');
    expect(container.textContent).toContain('Classeur 3 : GMAO_Movements_Unified');

    // Re-render expanded standard mode: brand capsule must still remain in DOM with lg:hidden for <1024px viewports
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <Header
            currentTab="stock"
            setCurrentTab={vi.fn()}
            counts={{}}
            setMobileMenuOpen={vi.fn()}
            fileInputRef={fileInputRef}
            handleImportFile={vi.fn()}
            handleExportExcel={vi.fn()}
            currentUser={mockAuthState.user}
            desktopSidebarCollapsed={false}
            onToggleDesktopSidebar={vi.fn()}
          />
        </I18nProvider>
      );
    });

    const brandBtn = container.querySelector('[data-testid="header-brand-capsule"]');
    expect(brandBtn).not.toBeNull();
    expect(brandBtn?.className).toContain('flex lg:hidden');
  });

  it('FloatingSidebar hides Maker-Checker badge for OPERATEUR and VIEWER, and shows + navigates for ADMIN', async () => {
    const setCurrentTab = vi.fn();
    const pendingCounts = {
      pendingSortieDemands: 5,
      pendingPreventiveValidation: 2,
      pendingCorrectiveValidation: 1,
    };

    // OPERATEUR must NOT see validation badge
    mockAuthState.user = { id: 'op-1', username: 'op', name: 'Opérateur', role: 'OPERATEUR' };
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <FloatingSidebar currentTab="dashboard" setCurrentTab={setCurrentTab} counts={pendingCounts} />
        </I18nProvider>
      );
    });
    expect(container.querySelector('[data-testid="floating-validation-badge"]')).toBeNull();

    // VIEWER must NOT see validation badge
    mockAuthState.user = { id: 'vw-1', username: 'viewer', name: 'Direction', role: 'VIEWER' };
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <FloatingSidebar currentTab="dashboard" setCurrentTab={setCurrentTab} counts={pendingCounts} />
        </I18nProvider>
      );
    });
    expect(container.querySelector('[data-testid="floating-validation-badge"]')).toBeNull();

    // ADMIN sees badge (8) and clicking opens validation_center
    mockAuthState.user = { id: 'adm-1', username: 'admin', name: 'Admin', role: 'ADMIN' };
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <FloatingSidebar currentTab="dashboard" setCurrentTab={setCurrentTab} counts={pendingCounts} />
        </I18nProvider>
      );
    });
    const badge = container.querySelector('[data-testid="floating-validation-badge"]') as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('8');
    await React.act(async () => {
      badge?.click();
    });
    expect(setCurrentTab).toHaveBeenCalledWith('validation_center');
  });

  it('MobileSidebarDrawer hides À valider badges for OPERATEUR and separates desktop collapse from mobile drawer close', async () => {
    const setMobileMenuOpen = vi.fn();
    const onToggleDesktopSidebar = vi.fn();
    const operateur = { id: 'op-1', username: 'op', name: 'Opérateur', role: 'OPERATEUR' };

    await React.act(async () => {
      root.render(
        <I18nProvider>
          <MobileSidebarDrawer
            isFixedDesktop={true}
            desktopSidebarCollapsed={false}
            onToggleDesktopSidebar={onToggleDesktopSidebar}
            currentTab="sortie"
            setCurrentTab={vi.fn()}
            mobileMenuOpen={true}
            setMobileMenuOpen={setMobileMenuOpen}
            counts={{
              pendingSortieDemands: 6,
              pendingPreventiveValidation: 3,
              pendingCorrectiveValidation: 2,
            }}
            currentUser={operateur}
          />
        </I18nProvider>
      );
    });

    // OPERATEUR must not see any "À valider" badge in the sidebar
    expect(container.textContent).not.toContain('À valider');

    // Even when mobileMenuOpen is stale=true (resized from narrow -> lg+), clicking desktop collapse button immediately collapses desktop sidebar AND clears mobileMenuOpen
    const desktopCollapseBtn = container.querySelector(
      '[data-testid="desktop-sidebar-collapse-btn"]'
    ) as HTMLButtonElement | null;
    const mobileCloseBtn = container.querySelector(
      '[data-testid="mobile-drawer-close-btn"]'
    ) as HTMLButtonElement | null;

    expect(desktopCollapseBtn).not.toBeNull();
    expect(mobileCloseBtn).not.toBeNull();

    await React.act(async () => {
      desktopCollapseBtn?.click();
    });
    expect(onToggleDesktopSidebar).toHaveBeenCalledTimes(1);
    expect(setMobileMenuOpen).toHaveBeenCalledWith(false);
  });

  it('MainLayout reserves a non-overlapping left gutter (lg:pl-16) in floating + overlay mode', async () => {
    storageService.setItem(STORAGE_KEYS.SIDEBAR_STYLE, 'floating');
    storageService.setItem(STORAGE_KEYS.SIDEBAR_BEHAVIOR, 'overlay');

    await React.act(async () => {
      root.render(
        <I18nProvider>
          <MainLayout
            currentTab="dashboard"
            setCurrentTab={vi.fn()}
            filters={{}}
            navigation={{}}
            counts={{}}
            mobileMenuOpen={false}
            setMobileMenuOpen={vi.fn()}
            fileInputRef={{ current: null }}
            handleImportFile={vi.fn()}
            handleExportExcel={vi.fn()}
            exportMasterTopologyWorkbook={vi.fn()}
            exportInventoryMaterialsWorkbook={vi.fn()}
            exportMovementsUnifiedWorkbook={vi.fn()}
            linkedFileName={null}
            onDirectLink={vi.fn()}
            onDirectSave={vi.fn()}
            stockItems={[]}
            machines={[]}
            zones={[]}
            technicians={[]}
            preventiveTasks={[]}
            onMarkTaskDone={vi.fn()}
            onAddMouvement={vi.fn()}
            showToast={vi.fn()}
            operationProgress={null}
          >
            <div>Main Content</div>
          </MainLayout>
        </I18nProvider>
      );
    });

    const mainEl = container.querySelector('main#main-content');
    expect(mainEl?.className).toContain('lg:pl-16');
  });

  // =========================================================================
  // PHASE B — SSOT Navigation, Scoped Dark Sidebar, CSS & Event Deduplication
  // =========================================================================

  it('Phase B (navConfig SSOT): decouples settings/appearance from guide and maps corrective sub-routes cleanly', async () => {
    const guideMod = PARENT_MODULES.find((m) => m.id === 'guide');
    expect(guideMod?.children.map((c) => c.id)).toEqual(['guide']);
    expect(getParentModuleForTab('settings').id).toBe(SETTINGS_PARENT_MODULE.id);
    expect(getParentModuleForTab('appearance').id).toBe(SETTINGS_PARENT_MODULE.id);
    expect(getParentModuleForTab('corrective_atelier').id).toBe('corrective');
    expect(getParentModuleForTab('corrective_besoins').id).toBe('corrective');

    // Every module ID in SIDEBAR_NAV_GROUPS exists in PARENT_MODULES
    const moduleIds = new Set(PARENT_MODULES.map((m) => m.id));
    for (const group of SIDEBAR_NAV_GROUPS) {
      for (const modId of group.moduleIds) {
        expect(moduleIds.has(modId)).toBe(true);
      }
    }

    // Header on 'settings' shows Paramètres + Apparence sub-tabs, NOT Guide d'utilisation
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <Header
            currentTab="settings"
            setCurrentTab={vi.fn()}
            counts={{}}
            setMobileMenuOpen={vi.fn()}
            fileInputRef={{ current: null }}
            handleImportFile={vi.fn()}
            handleExportExcel={vi.fn()}
            currentUser={mockAuthState.user}
          />
        </I18nProvider>
      );
    });
    expect(container.textContent).toContain('Paramètres');
    expect(container.textContent).not.toContain("Guide d'utilisation");

    // Header on 'corrective_atelier' renders human-readable label (not raw slug)
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <Header
            currentTab="corrective_atelier"
            setCurrentTab={vi.fn()}
            counts={{}}
            setMobileMenuOpen={vi.fn()}
            fileInputRef={{ current: null }}
            handleImportFile={vi.fn()}
            handleExportExcel={vi.fn()}
            currentUser={mockAuthState.user}
          />
        </I18nProvider>
      );
    });
    expect(container.textContent).toContain('Atelier Mécanique (BR / RECT)');
  });

  it('Phase B (MobileSidebarDrawer SSOT): renders dynamically from navConfig, preserves warehouse=0 via ??, highlights settings for appearance, and uses bg-accent-main', async () => {
    const setCurrentTab = vi.fn();
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <MobileSidebarDrawer
            isFixedDesktop={true}
            desktopSidebarCollapsed={false}
            currentTab="appearance"
            setCurrentTab={setCurrentTab}
            mobileMenuOpen={true}
            setMobileMenuOpen={vi.fn()}
            counts={{ warehouse: 0, entrepot: 9 }}
            currentUser={mockAuthState.user}
          />
        </I18nProvider>
      );
    });

    // Dynamic nav links from navConfig SSOT
    const execBtn = container.querySelector('[data-testid="sidebar-nav-executive_report"]') as HTMLButtonElement | null;
    expect(execBtn).not.toBeNull();
    await React.act(async () => {
      execBtn?.click();
    });
    expect(setCurrentTab).toHaveBeenCalledWith('executive_report');

    // Nullish coalescing: counts.warehouse=0 must display 0, NOT fallback to counts.entrepot=9
    const entrepotCount = container.querySelector('[data-testid="sidebar-entrepot-count"]');
    expect(entrepotCount?.textContent?.trim()).toBe('0');

    // Settings button active when on 'appearance'
    const settingsBtn = container.querySelector('[data-testid="sidebar-settings-btn"]');
    expect(settingsBtn?.className).toContain('bg-slate-900');

    // User avatar uses dynamic accent color class (bg-accent-main), not hardcoded emerald-700
    const avatar = container.querySelector('[data-testid="sidebar-user-avatar"]');
    expect(avatar?.className).toContain('bg-accent-main');
    expect(avatar?.className).not.toContain('bg-emerald-700');
  });

  it('Phase B (AppearanceLayoutSelector): dispatches gmao_appearance_changed once per change, updates dark live preview, and resets desktop sidebar collapse on factory reset', async () => {
    storageService.setItem('gmao_desktop_sidebar_collapsed', 'true');
    const eventSpy = vi.fn();
    window.addEventListener('gmao_appearance_changed', eventSpy);

    try {
      await React.act(async () => {
        root.render(
          <I18nProvider>
            <AppearanceLayoutSelector />
          </I18nProvider>
        );
      });

      // Toggle dark sidebar theme -> exactly 1 event, scoped data-sidebar-theme="dark", no global .dark, preview sidebar turns dark
      const darkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Thème Sombre')
      );
      expect(darkBtn).toBeDefined();
      eventSpy.mockClear();
      await React.act(async () => {
        darkBtn?.click();
      });
      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(document.documentElement.getAttribute('data-sidebar-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      const previewSidebar = container.querySelector('[data-testid="appearance-preview-sidebar"]');
      expect(previewSidebar?.className).toContain('bg-slate-900');

      // Switch deviceMode -> exactly 1 event (deduplicated from setShellMode)
      const desktopBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Poste Bureau')
      );
      expect(desktopBtn).toBeDefined();
      eventSpy.mockClear();
      await React.act(async () => {
        desktopBtn?.click();
      });
      expect(eventSpy).toHaveBeenCalledTimes(1);

      // Factory reset -> clears desktop sidebar collapse and resets sidebar theme to light
      const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes("Valeurs d'usine")
      );
      expect(resetBtn).toBeDefined();
      eventSpy.mockClear();
      await React.act(async () => {
        resetBtn?.click();
      });
      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(storageService.getItem('gmao_desktop_sidebar_collapsed')).toBe('false');
      expect(document.documentElement.getAttribute('data-sidebar-theme')).toBe('light');
    } finally {
      window.removeEventListener('gmao_appearance_changed', eventSpy);
    }
  });

  it('Phase B (index.css): defines .no-scrollbar, .scrollbar-none, and [data-animations="off"] reduced-motion rules', () => {
    const cssPath = path.resolve(process.cwd(), 'src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    expect(cssContent).toContain('.no-scrollbar');
    expect(cssContent).toContain('.scrollbar-none');
    expect(cssContent).toContain('[data-animations="off"]');
    expect(cssContent).toContain('[data-sidebar-theme="dark"] aside svg.sidebar-l2-icon');
  });
});
