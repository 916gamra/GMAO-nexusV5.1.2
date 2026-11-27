import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_PROFILE,
  WORKSPACE_PRESET_DEFINITIONS,
  applyWorkspacePreset,
  isSoloDirectAllowedForActor,
  isTabVisibleInWorkspace,
  loadWorkspaceProfile,
  normalizeWorkspaceProfile,
  refreshWorkspaceProfileCache,
  updateWorkspaceModuleVisibility,
} from '../../core/workspace/workspaceProfile';
import { isMakerCheckerSelfApproval } from '../../store/slices/storeBootstrapSlice';
import { useGmaoStore } from '../../store/useGmaoStore';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import { canViewMakerCheckerValidation } from '../../presentation/components/layout/appearanceBootstrap';
import {
  serializeLiveStateToFolderFiles,
  hydrateLiveStateFromFolderFiles,
} from '../../application/folderStore/folderDataSerializer';
import { ALL_CANONICAL_FILES } from '../../application/folderStore/folderStructure';
import WorkspaceModeSelectorCard from '../../presentation/pages/settings/components/WorkspaceModeSelectorCard';
import MachinePassport360Modal from '../../presentation/pages/machines/components/MachinePassport360Modal';
import {
  canNavigateToGuideTab,
  resolveGuideTabNavigation,
} from '../../presentation/pages/system/guideNavigation';

describe('SOLO-EXPERT-P1 — Workspace Operating Modes, Fail-Closed SOLO_DIRECT & Direct Tier 2 BOM', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storageService.removeItem(STORAGE_KEYS.WORKSPACE_PROFILE);
    refreshWorkspaceProfileCache();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    React.act(() => {
      root.unmount();
    });
    container.remove();
    storageService.removeItem(STORAGE_KEYS.WORKSPACE_PROFILE);
    refreshWorkspaceProfileCache();
  });

  it('defaults to TEAM_FULL with TEAM_MAKER_CHECKER and all modules visible (100% backwards compatible)', () => {
    const profile = loadWorkspaceProfile();
    expect(profile.preset).toBe('TEAM_FULL');
    expect(profile.governanceMode).toBe('TEAM_MAKER_CHECKER');
    expect(profile.moduleVisibility).toEqual(DEFAULT_WORKSPACE_PROFILE.moduleVisibility);
    expect(isTabVisibleInWorkspace('finance', profile)).toBe(true);
    expect(isTabVisibleInWorkspace('stock', profile)).toBe(true);
    expect(isTabVisibleInWorkspace('blueprints', profile)).toBe(true);
    expect(isTabVisibleInWorkspace('validation_center', profile)).toBe(true);
    expect(isTabVisibleInWorkspace('utilisateurs', profile)).toBe(true);
    expect(canViewMakerCheckerValidation({ role: 'ADMIN' })).toBe(true);
  });

  it('switches cleanly TEAM_FULL <-> SOLO_EXPERT without deleting domain data and strictly locks SOLO_LIGHT', () => {
    useGmaoStore.setState({
      machines: [
        {
          id_machine_registered: 'M-SOLO-01',
          designation: 'Tour CNC Principal',
          statut: 'Active',
        } as any,
      ],
      rawStock: [{ ref: 'ROUL-6308', designation: 'Roulement 6308-2RS', stockInitial: 10 } as any],
    });

    // Attempt to activate locked SOLO_LIGHT -> refused
    expect(WORKSPACE_PRESET_DEFINITIONS.SOLO_LIGHT.enabled).toBe(false);
    const rejected = applyWorkspacePreset('SOLO_LIGHT');
    expect(rejected.ok).toBe(false);
    expect(loadWorkspaceProfile().preset).toBe('TEAM_FULL');

    // Tampered storage payload trying to force SOLO_LIGHT -> coerced safely to TEAM_FULL
    const coerced = normalizeWorkspaceProfile({
      preset: 'SOLO_LIGHT',
      governanceMode: 'SOLO_DIRECT',
    });
    expect(coerced.preset).toBe('TEAM_FULL');

    // Activate SOLO_EXPERT
    const activated = applyWorkspacePreset('SOLO_EXPERT');
    expect(activated.ok).toBe(true);
    expect(activated.profile.preset).toBe('SOLO_EXPERT');
    expect(activated.profile.governanceMode).toBe('SOLO_DIRECT');

    // Verify navigation projection in SOLO_EXPERT (only Blueprints is omitted in Group 02)
    expect(isTabVisibleInWorkspace('finance', activated.profile)).toBe(false);
    expect(isTabVisibleInWorkspace('stock', activated.profile)).toBe(false);
    expect(isTabVisibleInWorkspace('blueprints', activated.profile)).toBe(false);
    expect(isTabVisibleInWorkspace('utilisateurs', activated.profile)).toBe(false);
    expect(isTabVisibleInWorkspace('validation_center', activated.profile)).toBe(false);

    // Core field maintenance, Tier 1/Tier 2 Parc hierarchy (Families -> Templates -> Machines), withdrawal log & PDR catalogs remain visible
    expect(isTabVisibleInWorkspace('dashboard', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('machines', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('families', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('templates', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('preventive', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('corrective', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('entrepot', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('sortie', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('pdr_groups', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('nexus', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('zones', activated.profile)).toBe(true);
    expect(isTabVisibleInWorkspace('equipment', activated.profile)).toBe(true);
    expect(canViewMakerCheckerValidation({ role: 'ADMIN' })).toBe(false);

    // Modular visibility override works in SOLO_EXPERT
    const withBlueprints = updateWorkspaceModuleVisibility({
      showBlueprintsInPrimaryNav: true,
    });
    expect(isTabVisibleInWorkspace('blueprints', withBlueprints)).toBe(true);
    expect(isTabVisibleInWorkspace('finance', withBlueprints)).toBe(false);

    // Switch back to TEAM_FULL -> zero data loss
    const restored = applyWorkspacePreset('TEAM_FULL');
    expect(restored.ok).toBe(true);
    expect(restored.profile.preset).toBe('TEAM_FULL');
    expect(useGmaoStore.getState().machines).toHaveLength(1);
    expect(useGmaoStore.getState().rawStock).toHaveLength(1);
    expect(canViewMakerCheckerValidation({ role: 'ADMIN' })).toBe(true);
  });

  it('enforces fail-closed SOLO_DIRECT governance (ADMIN only) and blocks non-ADMIN self-approval', () => {
    // In TEAM_FULL, even ADMIN cannot self-approve when explicit validator matches submitter
    expect(isSoloDirectAllowedForActor('ADMIN')).toBe(false);
    expect(
      isMakerCheckerSelfApproval({
        submitterId: 'USER-ADMIN-1',
        validatorId: 'USER-ADMIN-1',
        hasExplicitValidatorId: true,
        actorRole: 'ADMIN',
      })
    ).toBe(true);

    // Activate SOLO_EXPERT (SOLO_DIRECT)
    applyWorkspacePreset('SOLO_EXPERT');

    // Only verified ADMIN is allowed SOLO_DIRECT
    expect(isSoloDirectAllowedForActor('ADMIN')).toBe(true);
    expect(
      isMakerCheckerSelfApproval({
        submitterId: 'USER-ADMIN-1',
        validatorId: 'USER-ADMIN-1',
        hasExplicitValidatorId: true,
        actorRole: 'ADMIN',
      })
    ).toBe(false);

    // Non-ADMIN roles remain strictly blocked even when SOLO_DIRECT is active
    for (const nonAdminRole of [
      'TECHNICIEN',
      'RESPONSABLE_MAINTENANCE',
      'OPERATEUR',
      'VIEWER',
      '',
      null,
    ]) {
      expect(isSoloDirectAllowedForActor(nonAdminRole)).toBe(false);
      expect(
        isMakerCheckerSelfApproval({
          submitterId: 'TECH-01',
          validatorId: 'TECH-01',
          hasExplicitValidatorId: true,
          actorRole: nonAdminRole,
        })
      ).toBe(true);
    }
  });

  it('round-trips workspaceProfile in GMAO_Data/config/system_flags.json while preserving 29 canonical files', () => {
    expect(ALL_CANONICAL_FILES).toHaveLength(29);
    applyWorkspacePreset('SOLO_EXPERT');
    updateWorkspaceModuleVisibility({ showFinance: true });

    const entries = serializeLiveStateToFolderFiles();
    const filesMap = new Map<string, string>();
    for (const entry of entries) {
      if (!entry.isDirectory && typeof entry.content === 'string') {
        filesMap.set(entry.path, entry.content);
      }
    }

    const rawSystemFlags = filesMap.get('config/system_flags.json');
    expect(rawSystemFlags).toBeDefined();
    const parsedFlags = JSON.parse(rawSystemFlags || '{}');
    expect(parsedFlags.workspaceProfile.preset).toBe('SOLO_EXPERT');
    expect(parsedFlags.workspaceProfile.moduleVisibility.showFinance).toBe(true);

    // Clear storage and hydrate back from folder files
    storageService.removeItem(STORAGE_KEYS.WORKSPACE_PROFILE);
    refreshWorkspaceProfileCache();
    expect(loadWorkspaceProfile().preset).toBe('TEAM_FULL');

    hydrateLiveStateFromFolderFiles(filesMap);
    const hydrated = loadWorkspaceProfile();
    expect(hydrated.preset).toBe('SOLO_EXPERT');
    expect(hydrated.moduleVisibility.showFinance).toBe(true);

    // Tampered SOLO_LIGHT in system_flags.json is coerced to TEAM_FULL on hydration
    const tamperedMap = new Map(filesMap);
    tamperedMap.set(
      'config/system_flags.json',
      JSON.stringify({
        ...parsedFlags,
        workspaceProfile: { preset: 'SOLO_LIGHT', governanceMode: 'SOLO_DIRECT' },
      })
    );
    hydrateLiveStateFromFolderFiles(tamperedMap);
    expect(loadWorkspaceProfile().preset).toBe('TEAM_FULL');
  });

  it('renders WorkspaceModeSelectorCard with SOLO_LIGHT strictly disabled and toggles SOLO_EXPERT with audit trail', () => {
    const toastSpy = vi.fn();
    const auditBefore = (useGmaoStore.getState().auditEvents || []).length;

    React.act(() => {
      root.render(
        <WorkspaceModeSelectorCard
          currentUser={{ username: 'admin', name: 'Administrateur', role: 'ADMIN' }}
          showToast={toastSpy}
        />
      );
    });

    const soloLightBtn = container.querySelector(
      '[data-testid="workspace-select-btn-SOLO_LIGHT"]'
    ) as HTMLButtonElement | null;
    expect(soloLightBtn).not.toBeNull();
    expect(soloLightBtn?.disabled).toBe(true);
    expect(soloLightBtn?.getAttribute('aria-disabled')).toBe('true');

    const soloExpertBtn = container.querySelector(
      '[data-testid="workspace-select-btn-SOLO_EXPERT"]'
    ) as HTMLButtonElement | null;
    expect(soloExpertBtn).not.toBeNull();
    expect(soloExpertBtn?.disabled).toBe(false);

    React.act(() => {
      soloExpertBtn?.click();
    });

    expect(loadWorkspaceProfile().preset).toBe('SOLO_EXPERT');
    expect(toastSpy).toHaveBeenCalled();

    const auditEvents = useGmaoStore.getState().auditEvents || [];
    expect(auditEvents.length).toBeGreaterThan(auditBefore);
    expect(auditEvents[0]?.actionType).toBe('WORKSPACE_PROFILE_UPDATED');
  });

  it('allows direct Tier 2 BOM element addition in MachinePassport360Modal without Blueprint and blocks SYSTEM_GENERAL', () => {
    const prodMachine = {
      id_machine_registered: 'M-DIRECT-01',
      designation: 'Compresseur Vis 30kW',
      statut: 'Active',
      asset_class: 'PRODUCTION',
    } as any;

    const sysGeneralAsset = {
      id_machine_registered: 'SYS-ELEC-01',
      designation: 'TGBT Principal',
      statut: 'Active',
      asset_class: 'SYSTEM_GENERAL',
    } as any;

    useGmaoStore.setState({
      machines: [prodMachine, sysGeneralAsset],
      machineElementsLedger: [],
      blueprints: [],
    });

    // 1. Production machine without Blueprint -> direct Tier 2 BOM add works
    React.act(() => {
      root.render(<MachinePassport360Modal machine={prodMachine} onClose={() => {}} />);
    });

    const bomTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Organes & BOM')
    );
    expect(bomTabBtn).toBeDefined();

    React.act(() => {
      bomTabBtn?.click();
    });

    expect(container.querySelector('[data-testid="bom-direct-tier2-badge"]')).not.toBeNull();

    const openFormBtn = container.querySelector(
      '[data-testid="bom-toggle-add-form-btn"]'
    ) as HTMLButtonElement | null;
    expect(openFormBtn).not.toBeNull();

    React.act(() => {
      openFormBtn?.click();
    });

    const designationInput = container.querySelector(
      '[data-testid="bom-input-designation"]'
    ) as HTMLInputElement;
    const refInput = container.querySelector('[data-testid="bom-input-ref"]') as HTMLInputElement;
    const form = container.querySelector('[data-testid="bom-direct-add-form"]') as HTMLFormElement;

    React.act(() => {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeValueSetter?.call(designationInput, 'Moteur Électrique 30kW');
      designationInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeValueSetter?.call(refInput, 'MOT-30KW-01');
      refInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    React.act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const ledger = useGmaoStore.getState().machineElementsLedger || [];
    expect(ledger.length).toBe(1);
    expect(ledger[0]?.id_machine_registered).toBe('M-DIRECT-01');
    expect(ledger[0]?.designation).toBe('Moteur Électrique 30kW');
    expect(ledger[0]?.ref_element).toBe('MOT-30KW-01');

    // 2. SYSTEM_GENERAL machine -> direct BOM form is blocked
    React.act(() => {
      root.render(<MachinePassport360Modal machine={sysGeneralAsset} onClose={() => {}} />);
    });

    expect(container.querySelector('[data-testid="bom-toggle-add-form-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="bom-system-general-guard"]')).not.toBeNull();
  });

  it('resolves settings_workspace_modes Guide navigation to Settings > Sécurité & Comptes with ADMIN RBAC', () => {
    const resolved = resolveGuideTabNavigation('settings_workspace_modes');
    expect(resolved).toEqual({ routeTab: 'settings', settingsSubTab: 'admin' });
    expect(canNavigateToGuideTab({ role: 'ADMIN' }, 'settings_workspace_modes')).toBe(true);
    expect(canNavigateToGuideTab({ role: 'TECHNICIEN' }, 'settings_workspace_modes')).toBe(false);
    expect(canNavigateToGuideTab({ role: 'VIEWER' }, 'settings_workspace_modes')).toBe(false);
  });
});
