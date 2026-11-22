import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SettingsCurrencyTab from '../../presentation/pages/settings/components/SettingsCurrencyTab';
import GuideView, { MarkdownBodyRenderer } from '../../presentation/pages/system/GuideView';
import {
  canNavigateToGuideTab,
  executeGuideTabNavigation,
  findGuideDocForTab,
  getQuickTrackForUser,
  resolveGuideInternalHref,
  resolveGuideTabNavigation,
} from '../../presentation/pages/system/guideNavigation';
import { I18nProvider } from '../../i18n/I18nContext';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import { useGmaoStore } from '../../store/useGmaoStore';

const mockAuthState: { currentUser: { id: string; username: string; name: string; role: string } | null } = {
  currentUser: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

async function waitForCondition(predicate: () => boolean, timeoutMs = 2500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Phase A/B/C — SettingsCurrencyTab Live Valuation & GuideView Routing/RBAC/Markdown/Lazy/i18n', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storageService.setItem(STORAGE_KEYS.LANGUAGE, 'fr');
    useGmaoStore.setState({ rawStock: [], mouvements: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockAuthState.currentUser = { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    React.act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('removes fake invoice simulation and hardcoded 284500 amount in SettingsCurrencyTab, showing 0 when empty and live SSOT stock valuation when populated', async () => {
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <SettingsCurrencyTab />
        </I18nProvider>
      );
    });

    const emptyText = container.textContent || '';
    expect(emptyText).not.toContain('Simulation Bon de Commande');
    expect(emptyText).not.toContain('Total TTC Facturé');
    expect(emptyText).not.toContain('284,500');
    expect(emptyText).not.toContain('284 500');
    expect(emptyText).toContain('Équivalence : 1 USD ≈');
    expect(emptyText).toContain('Équivalence : 1 EUR ≈');

    const liveBoxEmpty = container.querySelector('[data-testid="currency-live-stock-valuation"]');
    expect(liveBoxEmpty?.textContent).toContain('Stock usine vide');
    expect(liveBoxEmpty?.textContent).toMatch(/0(\s|\u00A0|\u202F)?(DH|MAD|€|\$)/);

    // Populate real stock items in SSOT store: 10 * 250 + 4 * 500 = 4500 MAD
    await React.act(async () => {
      useGmaoStore.setState({
        rawStock: [
          {
            ref: 'PDR-001',
            designation: 'Roulement SKF',
            type: 'ROULEMENT',
            stockInitial: 10,
            stockActuel: 10,
            seuil: 2,
            prix_unitaire: 250,
          },
          {
            ref: 'PDR-002',
            designation: 'Courroie',
            type: 'TRANSMISSION',
            stockInitial: 4,
            stockActuel: 4,
            seuil: 1,
            prix_unitaire: 500,
          },
        ],
        mouvements: [],
      });
    });

    const liveBoxPopulated = container.querySelector('[data-testid="currency-live-stock-valuation"]');
    expect(liveBoxPopulated?.textContent).toContain('2 article(s) PDR');
    expect(liveBoxPopulated?.textContent).toMatch(/4[\s\u00A0\u202F,]?500/);
  });

  it('maps settings_* Guide routes to SettingsView via STORAGE_KEYS.SETTINGS_TARGET_TAB and enforces fail-closed RBAC', () => {
    expect(resolveGuideTabNavigation('settings_currency')).toEqual({
      routeTab: 'settings',
      settingsSubTab: 'currency',
    });
    expect(resolveGuideTabNavigation('settings_backup_audit')).toEqual({
      routeTab: 'settings',
      settingsSubTab: 'backup-audit',
    });
    expect(resolveGuideTabNavigation('nexus')).toEqual({
      routeTab: 'nexus',
    });

    const admin = { id: '1', role: 'ADMIN' };
    const tech = { id: '2', role: 'TECHNICIEN' };
    const resp = { id: '3', role: 'RESPONSABLE_MAINTENANCE' };

    expect(canNavigateToGuideTab(admin, 'settings_currency')).toBe(true);
    expect(canNavigateToGuideTab(admin, 'settings_admin')).toBe(true);
    expect(canNavigateToGuideTab(tech, 'settings_currency')).toBe(false);
    expect(canNavigateToGuideTab(resp, 'settings_json_editor')).toBe(false);
    expect(canNavigateToGuideTab(tech, 'nexus')).toBe(true);
    expect(canNavigateToGuideTab(null, 'stock')).toBe(false);

    const onNavigate = vi.fn();
    expect(executeGuideTabNavigation(tech, 'settings_currency', onNavigate)).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();

    expect(executeGuideTabNavigation(admin, 'settings_currency', onNavigate)).toBe(true);
    expect(storageService.getItem(STORAGE_KEYS.SETTINGS_TARGET_TAB)).toBe('currency');
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('resolves duplicate tabIds (nexus) using groupId/audience context and blocks unsafe URL schemes', () => {
    const docs = [
      {
        id: 'doc-nexus-parc',
        groupId: '02-parc-machines',
        docType: 'page' as const,
        audience: 'user' as const,
        tabId: 'nexus',
        filePath: '/docs/modules/02-parc-machines/page-arborescence-nexus.md',
      },
      {
        id: 'doc-nexus-gov-user',
        groupId: '06-pilotage-gouvernance',
        docType: 'page' as const,
        audience: 'user' as const,
        tabId: 'nexus',
        filePath: '/docs/modules/06-pilotage-gouvernance/page-user-nexus.md',
      },
      {
        id: 'doc-nexus-gov-dev',
        groupId: '06-pilotage-gouvernance',
        docType: 'architecture' as const,
        audience: 'developer' as const,
        tabId: 'nexus',
        filePath: '/docs/modules/06-pilotage-gouvernance/page-dev-nexus.md',
      },
    ];

    expect(findGuideDocForTab(docs, 'nexus', '02-parc-machines', 'all')?.id).toBe('doc-nexus-parc');
    expect(findGuideDocForTab(docs, 'nexus', '06-pilotage-gouvernance', 'developer')?.id).toBe(
      'doc-nexus-gov-dev'
    );
    expect(findGuideDocForTab(docs, 'nexus', '06-pilotage-gouvernance', 'user')?.id).toBe(
      'doc-nexus-gov-user'
    );

    expect(resolveGuideInternalHref(docs, 'javascript:alert(1)', docs[0])).toBeNull();
    expect(resolveGuideInternalHref(docs, 'data:text/html,<script>x</script>', docs[0])).toBeNull();
    expect(resolveGuideInternalHref(docs, './page-dev-nexus.md', docs[1])?.doc?.id).toBe(
      'doc-nexus-gov-dev'
    );
    expect(resolveGuideInternalHref(docs, 'https://example.com/doc', docs[0])?.externalUrl).toBe(
      'https://example.com/doc'
    );
  });

  it('renders Markdown blockquotes, italics, safe external links, internal links, and neutralizes javascript: links', async () => {
    const onOpenHref = vi.fn();
    const md = [
      '> **Note SSOT :** *Toujours* vérifier `STORAGE_KEYS`.',
      '',
      'Voir [Guide Nexus](./page-arborescence-nexus.md), [Site Officiel](https://example.org) et [XSS](javascript:alert(1)).',
    ].join('\n');

    await React.act(async () => {
      root.render(<MarkdownBodyRenderer markdown={md} onOpenHref={onOpenHref} />);
    });

    const blockquote = container.querySelector('blockquote');
    expect(blockquote).not.toBeNull();
    expect(blockquote?.querySelector('em')?.textContent).toBe('Toujours');
    expect(blockquote?.querySelector('code')?.textContent).toBe('STORAGE_KEYS');

    const externalLink = container.querySelector('a[href="https://example.org"]');
    expect(externalLink).not.toBeNull();
    expect(externalLink?.getAttribute('rel')).toContain('noopener');

    // No javascript: link allowed
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.textContent).toContain('XSS');

    const internalButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Guide Nexus')
    );
    expect(internalButton).not.toBeUndefined();
    await React.act(async () => {
      internalButton?.click();
    });
    expect(onOpenHref).toHaveBeenCalledWith('./page-arborescence-nexus.md');
  });

  it('removes select-none from GuideView, lazily loads currency doc on click, routes ADMIN settings_currency button to settings + SETTINGS_TARGET_TAB, and hides it for TECHNICIEN', async () => {
    const onNavigateToTab = vi.fn();

    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={onNavigateToTab} />
        </I18nProvider>
      );
    });

    // Ensure root does not block text selection
    expect(container.innerHTML).not.toContain('select-none');

    // Open the Currency doc via quick chip in Group 07 (triggers lazy markdown load)
    const currencyChip = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Devises & Fiscalité ISO')
    );
    expect(currencyChip).not.toBeUndefined();

    await React.act(async () => {
      currencyChip?.click();
    });
    await waitForCondition(() =>
      Boolean(container.querySelector('button[aria-label*="Devises & Fiscalité ISO"]'))
    );

    // As ADMIN, the header "Ouvrir l'écran" button must be visible and route cleanly
    const openCurrencyBtn = container.querySelector(
      'button[aria-label*="Devises & Fiscalité ISO"]'
    ) as HTMLButtonElement | null;
    expect(openCurrencyBtn).not.toBeNull();

    await React.act(async () => {
      openCurrencyBtn?.click();
    });

    expect(storageService.getItem(STORAGE_KEYS.SETTINGS_TARGET_TAB)).toBe('currency');
    expect(onNavigateToTab).toHaveBeenCalledWith('settings');

    // Now switch role to TECHNICIEN and re-render
    onNavigateToTab.mockClear();
    mockAuthState.currentUser = { id: 'tech-1', username: 'tech01', name: 'Tech', role: 'TECHNICIEN' };

    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={onNavigateToTab} />
        </I18nProvider>
      );
    });

    const openCurrencyBtnTech = container.querySelector(
      'button[aria-label*="Devises & Fiscalité ISO"]'
    );
    expect(openCurrencyBtnTech).toBeNull();
  });

  it('loads newly added Phase B screen guides (shift_weekly_report, executive_report, appearance, corrective_history) in GuideView', async () => {
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={vi.fn()} />
        </I18nProvider>
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('Rapport Vacation / Hebdo');
    expect(text).toContain('Rapport Mensuel Exécutif');
    expect(text).toContain('Apparence & Ergonomie');
    expect(text).toContain('Historique & Pièces Correctives');
  });

  it('Phase C: renders role-specific Quick Track for ADMIN vs TECHNICIEN and enforces RBAC on quick-open actions', async () => {
    expect(getQuickTrackForUser({ id: '1', role: 'ADMIN' }).role).toBe('ADMIN');
    expect(getQuickTrackForUser({ id: '2', role: 'RESPONSABLE' }).role).toBe('RESPONSABLE_MAINTENANCE');
    expect(getQuickTrackForUser({ id: '3', role: 'MAGASINIER' }).role).toBe('RESPONSABLE_MAGASIN');
    expect(getQuickTrackForUser({ id: '4', role: 'TECHNICIEN' }).role).toBe('TECHNICIEN');
    expect(getQuickTrackForUser({ id: '5', role: 'OPERATEUR' }).role).toBe('OPERATEUR');
    expect(getQuickTrackForUser(null).role).toBe('VIEWER');

    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={vi.fn()} />
        </I18nProvider>
      );
    });

    const adminTrack = container.querySelector('[data-testid="guide-role-quick-track"]');
    expect(adminTrack).not.toBeNull();
    expect(adminTrack?.textContent).toContain('Parcours Rapide — Administrateur');
    expect(adminTrack?.textContent).toContain('Injection Type A & Mode Démo');
    expect(adminTrack?.textContent).toContain('Devises & Fiscalité ISO');

    // Switch to TECHNICIEN and re-render
    mockAuthState.currentUser = { id: 'tech-2', username: 'tech02', name: 'Technicien', role: 'TECHNICIEN' };
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={vi.fn()} />
        </I18nProvider>
      );
    });

    const techTrack = container.querySelector('[data-testid="guide-role-quick-track"]');
    expect(techTrack?.textContent).toContain('Parcours Rapide — Technicien');
    expect(techTrack?.textContent).toContain('Exécuter un Bon de Travail (BT)');
    expect(techTrack?.textContent).not.toContain('Injection Type A & Mode Démo');
  });

  it('Phase C: supports global landing search with lazy Markdown hydration and opens the selected result in reader mode', async () => {
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={vi.fn()} />
        </I18nProvider>
      );
    });

    const searchInput = container.querySelector(
      '[data-testid="guide-global-search-input"]'
    ) as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await React.act(async () => {
      setNativeInputValue(searchInput!, 'CURRENCY_CONFIG');
    });
    await waitForCondition(() => {
      const box = container.querySelector('[data-testid="guide-global-search-results"]');
      return Boolean(box && box.textContent?.includes('#settings_currency'));
    });

    const resultsBox = container.querySelector('[data-testid="guide-global-search-results"]');
    expect(resultsBox).not.toBeNull();
    expect(resultsBox?.textContent).toContain('#settings_currency');

    const firstResultBtn = resultsBox?.querySelector('button') as HTMLButtonElement | null;
    expect(firstResultBtn).not.toBeNull();

    await React.act(async () => {
      firstResultBtn?.click();
    });
    await waitForCondition(() => Boolean(container.textContent?.includes('CURRENCY_CONFIG')));

    // Reader opened, landing search hidden, and currency doc body rendered
    expect(container.querySelector('[data-testid="guide-global-search-input"]')).toBeNull();
    expect(container.textContent).toContain('CURRENCY_CONFIG');
  });

  it('Phase C: localizes GuideView cleanly in Arabic (AR) and English (EN) while keeping global LTR layout', async () => {
    // Arabic (AR)
    storageService.setItem(STORAGE_KEYS.LANGUAGE, 'ar');
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={vi.fn()} />
        </I18nProvider>
      );
    });

    expect(document.documentElement.dir).toBe('ltr');
    expect(container.textContent).toContain('دليل المستخدم وهندسة نظام GMAO');
    expect(container.textContent).toContain('المسار السريع — مدير النظام');
    expect(container.textContent).toContain('مخزون قطع الغيار (PDR) والحركات وأوامر الشراء (PO)');

    // Unmount and remount in English (EN)
    await React.act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    storageService.setItem(STORAGE_KEYS.LANGUAGE, 'en');

    await React.act(async () => {
      root.render(
        <I18nProvider>
          <GuideView onNavigateToTab={vi.fn()} />
        </I18nProvider>
      );
    });

    expect(document.documentElement.dir).toBe('ltr');
    expect(container.textContent).toContain('CMMS User Guide & System Architecture');
    expect(container.textContent).toContain('Quick Track — System Administrator');
    expect(container.textContent).toContain('Spare Parts Stock (PDR), Movements & Purchase Orders');
  });
});

