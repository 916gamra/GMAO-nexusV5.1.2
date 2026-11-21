import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SettingsCurrencyTab from '../../presentation/pages/settings/components/SettingsCurrencyTab';
import SettingsAdminTab from '../../presentation/pages/settings/components/SettingsAdminTab';
import SettingsMatchingTab from '../../presentation/pages/settings/components/SettingsMatchingTab';
import { networkConfigService } from '../../services/networkConfigService';
import { realtimeMetricsService } from '../../services/realtimeMetricsService';
import { SecurityService } from '../../core/security/SecurityService';
import { useGmaoStore } from '../../store/useGmaoStore';
import { serverSyncService } from '../../services/serverSyncService';

const mockAuthState: { currentUser: any; licenseRecord: any; isLicenseActive: boolean } = {
  currentUser: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
  licenseRecord: {
    licenseKeyId: 'LIC-TEST-001',
    organizationLabel: 'Usine Test',
    installSalt: 'SUPER_SECRET_SALT_ABCDEF1234567890',
    activatedAt: '2026-01-01T00:00:00.000Z',
    lastAuthAt: '2026-01-02T00:00:00.000Z',
  },
  isLicenseActive: true,
};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    language: 'fr',
    t: (k: string) => k,
  }),
}));

describe('Settings Control Plane Hardening (P0 / P1 / P2)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockAuthState.currentUser = { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' };
    mockAuthState.isLicenseActive = true;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    React.act(() => {
      root.unmount();
    });
    container.remove();
    realtimeMetricsService.stop();
  });

  it('unlocks SettingsCurrencyTab for ADMIN (settings.manage), records audit event, schedules LAN push, and locks for TECHNICIEN', async () => {
    const appendSpy = vi.spyOn(useGmaoStore.getState(), 'appendAuditEvent');
    const pushSpy = vi.spyOn(serverSyncService, 'scheduleAutoPush').mockImplementation(() => {});

    await React.act(async () => {
      root.render(<SettingsCurrencyTab />);
    });

    const eurCard = container.querySelector('[data-testid="currency-card-EUR"]') as HTMLButtonElement | null;
    expect(eurCard).not.toBeNull();
    expect(eurCard?.disabled).toBe(false);
    expect(container.textContent).not.toContain('Mode lecture seule');

    await React.act(async () => {
      eurCard?.click();
    });

    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'CURRENCY_CONFIG_UPDATED',
        entityType: 'CURRENCY_CONFIG',
      })
    );
    expect(pushSpy).toHaveBeenCalled();

    // Switch to TECHNICIEN — controls must be disabled and read-only banner shown
    mockAuthState.currentUser = { id: 'tech-1', username: 'tech01', name: 'Tech', role: 'TECHNICIEN' };
    await React.act(async () => {
      root.render(<SettingsCurrencyTab />);
    });

    const usdCard = container.querySelector('[data-testid="currency-card-USD"]') as HTMLButtonElement | null;
    expect(usdCard?.disabled).toBe(true);
    expect(container.textContent).toContain('Mode lecture seule');
  });

  it('masks installSalt and vault ciphertext from SettingsAdminTab DOM and shows initial activation when license is inactive even if vault exists', async () => {
    const secretCipher = 'VAULT_CIPHER_LEAK_TOKEN_9876543210';
    vi.spyOn(SecurityService, 'getSecure').mockImplementation((key: string) => {
      if (key === 'gmao_vault_cipher_v2') return secretCipher;
      if (key === 'gmao_vault_salt_v2') return 'RAW_VAULT_SALT_SHOULD_NOT_APPEAR';
      return null;
    });
    mockAuthState.isLicenseActive = false;

    await React.act(async () => {
      root.render(
        <SettingsAdminTab
          currentUser={mockAuthState.currentUser}
          isVaultExists={true}
          isVaultUnlocked={false}
          accountsList={[]}
        />
      );
    });

    const domText = container.textContent || '';
    expect(domText).not.toContain('SUPER_SECRET_SALT');
    expect(domText).not.toContain('VAULT_CIPHER_LEAK_TOKEN');
    expect(domText).not.toContain('RAW_VAULT_SALT_SHOULD_NOT_APPEAR');
    expect(domText).toContain('Activation Initiale');
  });

  it('proposes distinct sequential user IDs per role in SettingsMatchingTab and disables actions when read-only', async () => {
    const items = [
      { code: 'Youssef', count: 3, inferredRole: 'TECHNICIEN', sourceList: 'Mouvements' },
      { code: 'Karim', count: 2, inferredRole: 'TECHNICIEN', sourceList: 'Mouvements' },
      { code: 'Nadia', count: 1, inferredRole: 'CHEF', sourceList: 'Mouvements' },
    ];
    const getNextUserId = (role: string) => (role === 'CHEF' ? 'CHEF-01' : 'TECH-04');

    await React.act(async () => {
      root.render(
        <SettingsMatchingTab
          auditTarget="utilisateurs"
          setAuditTarget={() => {}}
          discoveredItems={items}
          auditDisplayedItems={items}
          rawAuditDisplayedData={items}
          auditTotalItems={items.length}
          getAuditLabel={() => 'Utilisateurs'}
          getNextUserId={getNextUserId}
          canManageSettings={true}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('TECH-04');
    expect(text).toContain('TECH-05');
    expect(text).toContain('CHEF-01');

    // Read-only mode must hide bulk register and disable row actions
    await React.act(async () => {
      root.render(
        <SettingsMatchingTab
          auditTarget="utilisateurs"
          setAuditTarget={() => {}}
          discoveredItems={items}
          auditDisplayedItems={items}
          rawAuditDisplayedData={items}
          auditTotalItems={items.length}
          getAuditLabel={() => 'Utilisateurs'}
          getNextUserId={getNextUserId}
          canManageSettings={false}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const actionButtons = buttons.filter(
      (b) => b.textContent?.includes('Rattacher') || b.textContent?.includes('Enregistrer')
    );
    expect(actionButtons.length).toBeGreaterThan(0);
    expect(actionButtons.every((b) => b.disabled)).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes('Enregistrer les Utilisateurs'))).toBe(false);
  });

  it('generates real scannable ISO/IEC 18004 QR matrices and isolates HOST IP from LAN_CLIENT URL', () => {
    networkConfigService.setCustomHostIp('10.10.0.5');
    networkConfigService.setRemoteHostUrl('10.10.0.99:3000');

    expect(networkConfigService.getCustomHostIp()).toBe('10.10.0.5');
    expect(networkConfigService.getRemoteHostUrl()).toBe('http://10.10.0.99:3000');

    const shortMatrix = networkConfigService.generateQrMatrix('http://10.10.0.5:3000');
    const longMatrix = networkConfigService.generateQrMatrix(
      'http://10.10.0.5:3000/?machine_qr=PRS-HYD-250T-LINE-04&zone=ATELIER_A#mobile'
    );

    expect(shortMatrix.length).toBeGreaterThanOrEqual(21);
    expect(longMatrix.length).toBeGreaterThan(shortMatrix.length);
    expect(longMatrix.length).toBe(longMatrix[0].length);
  });

  it('cancels animation frame and interval when RealtimeMetricsService stops or loses last subscriber', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42);

    realtimeMetricsService.start();
    expect(realtimeMetricsService.isMonitoring).toBe(true);
    expect(rafSpy).toHaveBeenCalled();

    const unsub = realtimeMetricsService.subscribe(() => {});
    unsub();

    expect(realtimeMetricsService.isMonitoring).toBe(false);
    expect(cancelSpy).toHaveBeenCalledWith(42);
    expect(realtimeMetricsService.rafId).toBeNull();
    expect(realtimeMetricsService.lagInterval).toBeNull();
  });
});
