// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nContext';
import { applyWorkspacePreset } from '../../../core/workspace/workspaceProfile';
import { saveCurrencyConfig } from '../../../utils/currencyService';
import { storageService } from '../../../utils/storageService';
import { useGmaoStore } from '../../../store/useGmaoStore';
import { escapeCsvCell } from '../../../utils/safeExcelExport';
import QuickMovementModal from './QuickMovementModal';
import { EntrepotDetailsModal } from './components/EntrepotDetailsModal';
import ComponentsTable from './components/ComponentsTable';
import PartsTable from './components/PartsTable';
import { EntrepotDeleteModal } from './components/EntrepotModals';
import PartGroupView from '../referentiel/PartGroupView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement) {
  act(() => {
    root.render(<I18nProvider>{ui}</I18nProvider>);
  });
}

describe('Group 03 (Entrepôt — Components & Parts) Audit & SOLO_EXPERT Parity', () => {
  beforeEach(() => {
    localStorage.clear();
    storageService.clearCache();
    applyWorkspacePreset('TEAM_FULL');
    saveCurrencyConfig({
      activeCurrencyCode: 'MAD',
      baseCurrencyCode: 'MAD',
      madSymbolVariant: 'DH',
      applyExchangeRateConversion: false,
    });
    useGmaoStore.setState({
      correctiveInterventions: [],
      preventiveExecutions: [],
      sortiesExterne: [],
      compFamilies: [],
      compTemplates: [],
      partTypes: [],
      partDesignations: [],
      machines: [],
      zones: [],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('neutralizes CSV formula injection and escapes quotes/delimiters in escapeCsvCell', () => {
    expect(escapeCsvCell('=CMD()')).toBe("'=CMD()");
    expect(escapeCsvCell('+1+2')).toBe("'+1+2");
    expect(escapeCsvCell('-SUM(A1:A2)')).toBe("'-SUM(A1:A2)");
    expect(escapeCsvCell('@HYPERLINK("http://evil")')).toBe('"\'@HYPERLINK(""http://evil"")"');
    expect(escapeCsvCell('Moteur; 4kW')).toBe('"Moteur; 4kW"');
    expect(escapeCsvCell('Ligne 1\nLigne 2')).toBe('"Ligne 1\nLigne 2"');
    expect(escapeCsvCell(0)).toBe('0');
  });

  it('QuickMovementModal prefers id_warehouse_item over ref and hides technician picker in SOLO_EXPERT', () => {
    const onAddMouvement = vi.fn();
    const article = {
      id_warehouse_item: 'MOT-01',
      ref: 'LEGACY-REF-99',
      designation: 'Moteur 5.5kW',
      stockActuel: 4,
      id_machine_registered: 'M-100',
      id_zone: 'Z-01',
    };
    const machines = [
      { id_machine_registered: 'M-100', nom: 'Presse 100', id_zone_default: 'Z-01', status: 'ACTIVE' },
    ];
    const zones = [{ id_zone: 'Z-01', nom: 'Atelier A' }];
    const technicians = [{ id: 'T1', nom: 'Ahmed Tech', is_active: true }];

    // 1. TEAM_FULL: Technician selector is visible
    applyWorkspacePreset('TEAM_FULL');
    render(
      <QuickMovementModal
        isOpen={true}
        onClose={vi.fn()}
        article={article}
        machines={machines}
        zones={zones}
        technicians={technicians}
        mouvements={[]}
        onAddMouvement={onAddMouvement}
      />
    );
    expect(container.textContent).toContain('Ahmed Tech');

    // 2. SOLO_EXPERT: Technician selector is hidden and submitted ref is strictly id_warehouse_item
    act(() => {
      applyWorkspacePreset('SOLO_EXPERT');
    });
    render(
      <QuickMovementModal
        isOpen={true}
        onClose={vi.fn()}
        article={article}
        machines={machines}
        zones={zones}
        technicians={technicians}
        mouvements={[]}
        onAddMouvement={onAddMouvement}
      />
    );
    expect(container.textContent).not.toContain('Ahmed Tech');

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onAddMouvement).toHaveBeenCalledTimes(1);
    const emitted = onAddMouvement.mock.calls[0][0];
    expect(emitted.ref).toBe('MOT-01');
    expect(emitted.id_machine_registered).toBe('M-100');
  });

  it('EntrepotDetailsModal formats dynamic EUR currency in TEAM_FULL and hides financial amounts in SOLO_EXPERT', () => {
    saveCurrencyConfig({
      activeCurrencyCode: 'EUR',
      baseCurrencyCode: 'EUR',
      applyExchangeRateConversion: false,
    });

    const componentItem = {
      id_warehouse_item: 'MOT-01',
      nature: 'COMPONENT',
      designation: 'Moteur Triphasé 7.5kW',
      status: 'EN_SERVICE',
      id_family: 'FAM-MOT',
      id_templates: 'TPL-MOT-01',
      prix_remplacement: 12000,
    };

    useGmaoStore.setState({
      compFamilies: [{ id_family: 'FAM-MOT', libelle: 'Moteurs Électriques' }],
      compTemplates: [{ id_templates: 'TPL-MOT-01', libelle: 'Moteur 7.5kW B3', id_family: 'FAM-MOT' }],
      sortiesExterne: [
        {
          id: 'SE-01',
          id_warehouse_item: 'MOT-01',
          prestataire: 'Bobinage Atlas',
          nature_travaux: 'Rebobinage complet',
          cout: 5000,
          date_sortie: '2026-01-15',
        },
      ],
    });

    // TEAM_FULL: EUR symbol shown, zero hardcoded DH
    act(() => {
      applyWorkspacePreset('TEAM_FULL');
    });
    render(<EntrepotDetailsModal selectedDetails={componentItem} onClose={vi.fn()} t={(k) => k} />);
    expect(container.textContent).toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);

    // SOLO_EXPERT: financial cost block hidden, pure technical health preserved
    act(() => {
      applyWorkspacePreset('SOLO_EXPERT');
    });
    render(<EntrepotDetailsModal selectedDetails={componentItem} onClose={vi.fn()} t={(k) => k} />);
    expect(container.textContent).not.toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);
    expect(container.textContent).toContain('/100');
  });

  it('ComponentsTable & PartsTable hide Responsable column in SOLO_EXPERT and preserve 0 stock/seuil cleanly', () => {
    const compItem = {
      id_warehouse_item: 'MOT-00',
      nature: 'COMPONENT',
      designation: 'Moteur Neuf 0',
      stockInitial: 0,
      stockActuel: 0,
      seuil: 0,
      status: 'En stock',
      technician: 'Tech One',
    };

    const partItem = {
      id_warehouse_item: 'PRT-00',
      nature: 'PART',
      designation: 'Joint Torique',
      stockInitial: 0,
      stockActuel: 0,
      seuil: 0,
      status: 'EN SERVICE',
      technician: 'Tech One',
    };

    // TEAM_FULL shows Responsable
    act(() => {
      applyWorkspacePreset('TEAM_FULL');
    });
    render(
      <ComponentsTable
        displayedData={[compItem]}
        handleSort={vi.fn()}
        renderSortIcon={() => null}
        setActiveActionMenuId={vi.fn()}
        handleOpenQuickModal={vi.fn()}
        setSelectedDetails={vi.fn()}
        handleOpenEditModal={vi.fn()}
        setToDelete={vi.fn()}
        onNavigateToFamily={vi.fn()}
        onNavigateToTemplate={vi.fn()}
        onNavigateToMachine={vi.fn()}
        onNavigateToZone={vi.fn()}
        handleOpenAddModal={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Tech One');
    expect(container.textContent).toContain('Init: 0 • Seuil: 0');

    // SOLO_EXPERT hides Responsable column
    act(() => {
      applyWorkspacePreset('SOLO_EXPERT');
    });
    render(
      <ComponentsTable
        displayedData={[compItem]}
        handleSort={vi.fn()}
        renderSortIcon={() => null}
        setActiveActionMenuId={vi.fn()}
        handleOpenQuickModal={vi.fn()}
        setSelectedDetails={vi.fn()}
        handleOpenEditModal={vi.fn()}
        setToDelete={vi.fn()}
        onNavigateToFamily={vi.fn()}
        onNavigateToTemplate={vi.fn()}
        onNavigateToMachine={vi.fn()}
        onNavigateToZone={vi.fn()}
        handleOpenAddModal={vi.fn()}
      />
    );
    expect(container.textContent).not.toContain('Tech One');

    // PartsTable hides Responsable in SOLO_EXPERT and renders normalized En service badge
    render(
      <PartsTable
        displayedData={[partItem]}
        handleSort={vi.fn()}
        renderSortIcon={() => null}
        setActiveActionMenuId={vi.fn()}
        handleOpenQuickModal={vi.fn()}
        setSelectedDetails={vi.fn()}
        handleOpenEditModal={vi.fn()}
        setToDelete={vi.fn()}
      />
    );
    expect(container.textContent).not.toContain('Tech One');
    expect(container.textContent).toContain('En service');
  });

  it('EntrepotDeleteModal blocks deletion when mounted on a machine and warns archive when history exists', () => {
    const onConfirm = vi.fn();

    render(
      <EntrepotDeleteModal
        open={true}
        item={{ id_warehouse_item: 'MOT-01', designation: 'Moteur Principal' } as any}
        dependencyInfo={{
          attachedMachine: 'M-01',
          movementsCount: 0,
          interventionsCount: 0,
          preventiveCount: 0,
          sortiesExterneCount: 0,
          bobinageCount: 0,
          totalHistoryCount: 0,
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        t={(k) => k}
      />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const confirmBtn = buttons[buttons.length - 1];
    expect(confirmBtn.disabled).toBe(true);
    expect(container.textContent).toContain('Suppression bloquée');

    render(
      <EntrepotDeleteModal
        open={true}
        item={{ id_warehouse_item: 'MOT-02', designation: 'Moteur Réserve' } as any}
        dependencyInfo={{
          attachedMachine: null,
          movementsCount: 3,
          interventionsCount: 1,
          preventiveCount: 0,
          sortiesExterneCount: 0,
          bobinageCount: 0,
          totalHistoryCount: 4,
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        t={(k) => k}
      />
    );
    const archiveButtons = Array.from(container.querySelectorAll('button'));
    const archiveConfirm = archiveButtons[archiveButtons.length - 1];
    expect(archiveConfirm.disabled).toBe(false);
    expect(archiveConfirm.textContent).toContain('Archiver');
  });

  it('PartGroupView counts only PART/PARTIE items and excludes COMPONENT/COMPOSANT items', () => {
    render(
      <PartGroupView
        partGroups={[{ id: 'GRP-PRT-01', id_group: 'GRP-PRT-01', code: 'MEC', libelle: 'Mécanique' }]}
        partTypes={[{ id_type: 'TYPE-MEC', id_group: 'GRP-PRT-01', libelle: 'Roulements' }]}
        partDesignations={[]}
        warehouseItems={[
          { id_warehouse_item: 'P-1', nature: 'PART', id_type: 'TYPE-MEC', designation: 'Roulement 6205' } as any,
          { id_warehouse_item: 'C-1', nature: 'COMPONENT', id_type: 'TYPE-MEC', designation: 'Moteur Component' } as any,
          { id_warehouse_item: 'C-2', nature: 'COMPOSANT', id_type: 'TYPE-MEC', designation: 'Réducteur Composant' } as any,
        ]}
      />
    );
    expect(container.textContent).toContain('1 part(s)');
    expect(container.textContent).not.toContain('2 part(s)');
    expect(container.textContent).not.toContain('3 part(s)');
  });
});
