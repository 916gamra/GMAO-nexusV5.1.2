import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeMachinesCockpitMetrics } from '../../domain/machines/machinesCockpitService';
import {
  applyWorkspacePreset,
  refreshWorkspaceProfileCache,
} from '../../core/workspace/workspaceProfile';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import {
  DEFAULT_CURRENCY_CONFIG,
  saveCurrencyConfig,
} from '../../utils/currencyService';
import { useGmaoStore } from '../../store/useGmaoStore';
import { I18nProvider } from '../../i18n/I18nContext';
import AuthContext from '../../context/AuthContext';
import AddMachineModal from '../../presentation/pages/machines/AddMachineModal';
import { BlueprintFormModal } from '../../presentation/pages/machines/components/BlueprintModals';
import type {
  BlueprintComponentItem,
  BlueprintPartItem,
  BlueprintPreventiveDraft,
  BlueprintCommonFailureDraft,
} from '../../presentation/pages/machines/components/BlueprintInspectModal';
import type { BlueprintPdrItem } from '../../core/domain';
import MachinePassport360Modal from '../../presentation/pages/machines/components/MachinePassport360Modal';
import { MachinesRegisteredModals } from '../../presentation/pages/machines/components/MachinesRegisteredModals';
import MachineQrFieldModal from '../../presentation/pages/machines/components/MachineQrFieldModal';
import FamilyView from '../../presentation/pages/machines/FamilyView';
import TemplatesView from '../../presentation/pages/machines/TemplatesView';

const mockAdminAuth = {
  user: {
    id: 'ADMIN-01',
    username: 'admin',
    name: 'Admin Test',
    role: 'ADMIN',
  },
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  hasPermission: () => true,
  can: () => true,
} as any;

function withProviders(node: React.ReactNode) {
  return (
    <I18nProvider>
      <AuthContext.Provider value={mockAdminAuth}>{node}</AuthContext.Provider>
    </I18nProvider>
  );
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectValue(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value'
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Group 02 (Parc Machines) — Audit Fixes, Multi-Currency & SOLO_EXPERT Adaptation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storageService.removeItem(STORAGE_KEYS.WORKSPACE_PROFILE);
    refreshWorkspaceProfileCache();
    saveCurrencyConfig(DEFAULT_CURRENCY_CONFIG);

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
    saveCurrencyConfig(DEFAULT_CURRENCY_CONFIG);
  });

  it('computes incompleteSetupCount accurately in TEAM_FULL vs SOLO_EXPERT', () => {
    const machines = [
      {
        id_machine_registered: 'MCH-01',
        designation: 'Tour CNC',
        id_zone_default: 'Z-01',
        technician: '',
        cout_arret_horaire: 0,
        status: 'ACTIVE',
      },
      {
        id_machine_registered: 'MCH-02',
        designation: 'Presse Sans Zone',
        id_zone_default: '',
        technician: '',
        cout_arret_horaire: 0,
        status: 'ACTIVE',
      },
    ];

    // TEAM_FULL default: requires zone + technician + hourly cost
    const teamMetrics = computeMachinesCockpitMetrics({
      machines: machines as any,
      correctiveInterventions: [],
      preventiveTasks: [],
      preventiveExecutions: [],
      sortiesExterne: [],
      stockItems: [],
    });
    expect(teamMetrics.incompleteSetupCount).toBe(2);

    // SOLO_EXPERT: only zone is required
    const soloMetrics = computeMachinesCockpitMetrics({
      machines: machines as any,
      correctiveInterventions: [],
      preventiveTasks: [],
      preventiveExecutions: [],
      sortiesExterne: [],
      stockItems: [],
      requireTechnician: false,
      requireHourlyCost: false,
    });
    expect(soloMetrics.incompleteSetupCount).toBe(1);
    expect(soloMetrics.perMachineSignals['MCH-01'].isIncompleteSetup).toBe(false);
    expect(soloMetrics.perMachineSignals['MCH-02'].isIncompleteSetup).toBe(true);
  });

  it('preserves Family -> Template -> Machine hierarchy in SOLO_EXPERT while hiding Blueprint/Technician, and still supports optional empty Family/Template with sequential MCH-XX', () => {
    applyWorkspacePreset('SOLO_EXPERT');
    const onAddMachine = vi.fn();
    const onClose = vi.fn();

    // Case A: Families & Templates present -> pre-linked just like TEAM_FULL, Blueprint & Technician omitted
    React.act(() => {
      root.render(
        withProviders(
          <AddMachineModal
            isOpen={true}
            onClose={onClose}
            onAddMachine={onAddMachine}
            families={[{ id_family: 'FAM-01', libelle: 'Presses' }]}
            templates={[
              { id_templates: 'TPL-01', id_family: 'FAM-01', libelle: 'Presse 200T' },
            ]}
            zones={[{ id_zone: 'Z-01', code_zone: 'AT-1', libelle: 'Atelier Nord' }]}
            technicians={[{ id_technician: 'TECH-01', nom: 'Karim' }]}
            machines={[{ id_machine_registered: 'MCH-01', designation: 'Existante' }]}
            blueprints={[
              { id_blueprint: 'BP-01', id_family: 'FAM-01', id_templates: 'TPL-01', libelle: 'BP Presse' },
            ]}
          />
        )
      );
    });

    // Switch to Classic mode to verify Famille (D) & Template (E) are visible while Blueprint is absent
    const classicToggleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mode Classique')
    );
    if (classicToggleBtn) {
      React.act(() => {
        classicToggleBtn.click();
      });
    }
    expect(container.textContent).toContain('Famille (D)');
    expect(container.textContent).toContain('Template (E)');
    expect(container.textContent).not.toContain('Blueprint / Schéma Machine');

    const designationInput = container.querySelector(
      'input[placeholder*="Ensacheuse"]'
    ) as HTMLInputElement;
    expect(designationInput).not.toBeNull();
    React.act(() => {
      setInputValue(designationInput, 'Presse 200T Solo');
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Enregistrer la Machine')
    );
    expect(submitBtn).toBeDefined();
    React.act(() => {
      submitBtn?.click();
    });

    expect(onAddMachine).toHaveBeenCalledTimes(1);
    const createdLinked = onAddMachine.mock.calls[0][0];
    expect(createdLinked.id_family).toBe('FAM-01');
    expect(createdLinked.id_templates).toBe('TPL-01');
    expect(createdLinked.id_blueprint).toBe('');
    expect(createdLinked.technician).toBe('');

    // Case B: Empty Families & Templates (fresh modal open) -> still allows creation with sequential MCH-02
    onAddMachine.mockClear();
    React.act(() => {
      root.render(
        withProviders(
          <AddMachineModal
            key="solo-empty-catalogs"
            isOpen={true}
            onClose={onClose}
            onAddMachine={onAddMachine}
            families={[]}
            templates={[]}
            zones={[{ id_zone: 'Z-01', code_zone: 'AT-1', libelle: 'Atelier Nord' }]}
            technicians={[{ id_technician: 'TECH-01', nom: 'Karim' }]}
            machines={[{ id_machine_registered: 'MCH-01', designation: 'Existante' }]}
            blueprints={[]}
          />
        )
      );
    });

    const designationInput2 = container.querySelector(
      'input[placeholder*="Ensacheuse"]'
    ) as HTMLInputElement;
    React.act(() => {
      setInputValue(designationInput2, 'Scie Ruban Solo');
    });
    const submitBtn2 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Enregistrer la Machine')
    );
    React.act(() => {
      submitBtn2?.click();
    });

    expect(onAddMachine).toHaveBeenCalledTimes(1);
    const createdStandalone = onAddMachine.mock.calls[0][0];
    expect(createdStandalone.id_machine_registered).toBe('MCH-02');
    expect(createdStandalone.designation).toBe('Scie Ruban Solo');
    expect(createdStandalone.id_family).toBe('');
    expect(createdStandalone.id_templates).toBe('');
    expect(createdStandalone.technician).toBe('');
  });

  it('adds canonical components and parts and persists extended Spec fields in BlueprintFormModal', () => {
    const onSave = vi.fn();

    function BlueprintFormHarness() {
      const [activeModalTab, setActiveModalTab] = React.useState('specs');
      const [form, setForm] = React.useState<any>({
        id_blueprint: 'BP-01',
        libelle: 'Blueprint Presse 200T',
        id_family: 'FAM-01',
        id_templates: 'TPL-01',
        ref_plan: 'DWG-001',
        type_schema: 'MÉCANIQUE',
        version: 'V1.0',
        description: '',
        specs: { puissance: '', poids: '', moteur: '', dimensions: '' },
        components_theoriques: [],
        parts_theoriques: [],
        pdr_theoriques: [],
        preventivePlanItems: [],
        commonFailures: [],
      });
      const [newCompItem, setNewCompItem] = React.useState<BlueprintComponentItem>({
        id_component: '',
        qte: 1,
      });
      const [newPartItem, setNewPartItem] = React.useState<BlueprintPartItem>({
        id_part: '',
        qte: 1,
      });
      const [newPdrItem, setNewPdrItem] = React.useState<BlueprintPdrItem>({
        id_pdr: '',
        qte: 1,
      });
      const [newPreventiveItem, setNewPreventiveItem] = React.useState<BlueprintPreventiveDraft>({
        composant: '',
        action_code: 'I',
        frequence: 'Mensuelle',
        duree_min: 30,
        description: '',
        pdr_ref: '',
      });
      const [newCommonFailureItem, setNewCommonFailureItem] =
        React.useState<BlueprintCommonFailureDraft>({
          title: '',
          type_panne: '',
          urgence: 'Moyenne',
          recommended_action: '',
          description: '',
          pdr_ref: '',
        });

      return (
        <BlueprintFormModal
          showAddModal={true}
          toEdit={null}
          setToEdit={vi.fn()}
          form={form}
          setForm={setForm}
          handleCloseModal={vi.fn()}
          activeModalTab={activeModalTab}
          setActiveModalTab={setActiveModalTab}
          setApplyFeedback={vi.fn()}
          applyFeedback={null}
          handleAddSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            onSave(form);
          }}
          handleEditSubmit={vi.fn()}
          autoNextBlueprintId="BP-01"
          takenBlueprintNumbers={new Set()}
          families={[{ id_family: 'FAM-01', libelle: 'Presses' }]}
          templates={[{ id_templates: 'TPL-01', id_family: 'FAM-01', libelle: 'Presse 200T' }]}
          modalTemplates={[{ id_templates: 'TPL-01', id_family: 'FAM-01', libelle: 'Presse 200T' }]}
          editModalTemplates={[]}
          compTemplates={[{ id_templates: 'COMP-MOT-15', libelle: 'Moteur Triphasé 15kW' }]}
          partTypes={[{ id_type: 'PT-ARBRE', libelle: 'Arbre Transmission' }]}
          partDesignations={[{ id_part_designation: 'PD-01', libelle: 'Pignon Hélicoïdal Z24' }]}
          machines={[]}
          stockItems={[]}
          preventiveActions={[]}
          newCompItem={newCompItem}
          setNewCompItem={setNewCompItem}
          newPartItem={newPartItem}
          setNewPartItem={setNewPartItem}
          newPdrItem={newPdrItem}
          setNewPdrItem={setNewPdrItem}
          newPreventiveItem={newPreventiveItem}
          setNewPreventiveItem={setNewPreventiveItem}
          newCommonFailureItem={newCommonFailureItem}
          setNewCommonFailureItem={setNewCommonFailureItem}
          handleExtractFromMachineHistory={vi.fn()}
          handleTriggerApplyPreventivePlan={vi.fn()}
          setFormError={vi.fn()}
        />
      );
    }

    React.act(() => {
      root.render(withProviders(<BlueprintFormHarness />));
    });

    // Fill Spec Tab 1 fields
    const moteurInput = container.querySelector(
      'input[placeholder*="1500 tr/min"]'
    ) as HTMLInputElement;
    const dimInput = container.querySelector(
      'input[placeholder*="2400"]'
    ) as HTMLInputElement;
    const descTextarea = container.querySelector('textarea') as HTMLTextAreaElement;

    React.act(() => {
      setInputValue(moteurInput, 'SEW 15kW 1450rpm');
      setInputValue(dimInput, '2200 x 1100 x 1800 mm');
      setInputValue(descTextarea, 'Blueprint validé atelier presse');
    });

    // Switch to Tab 2: Composants
    const compTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('2. Composants')
    );
    React.act(() => {
      compTabBtn?.click();
    });

    const compSelect = container.querySelector('select') as HTMLSelectElement;
    React.act(() => {
      setSelectValue(compSelect, 'COMP-MOT-15');
    });
    const addBtnComp = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Ajouter'
    );
    React.act(() => {
      addBtnComp?.click();
    });
    expect(container.textContent).toContain('Moteur Triphasé 15kW');

    // Switch to Tab 3: Pièces & Visserie
    const partsTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('3. Pièces')
    );
    React.act(() => {
      partsTabBtn?.click();
    });

    const partSelect = container.querySelector('select') as HTMLSelectElement;
    React.act(() => {
      setSelectValue(partSelect, 'PT-ARBRE');
    });
    const addBtnPart = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Ajouter'
    );
    React.act(() => {
      addBtnPart?.click();
    });
    expect(container.textContent).toContain('Arbre Transmission');

    // Submit form
    const form = container.querySelector('form') as HTMLFormElement;
    React.act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.specs.moteur).toBe('SEW 15kW 1450rpm');
    expect(saved.specs.dimensions).toBe('2200 x 1100 x 1800 mm');
    expect(saved.description).toBe('Blueprint validé atelier presse');
    expect(saved.components_theoriques).toHaveLength(1);
    expect(saved.components_theoriques[0].id_component).toBe('COMP-MOT-15');
    expect(saved.components_theoriques[0].libelle).toBe('Moteur Triphasé 15kW');
    expect(saved.parts_theoriques).toHaveLength(1);
    expect(saved.parts_theoriques[0].id_part).toBe('PT-ARBRE');
    expect(saved.parts_theoriques[0].libelle).toBe('Arbre Transmission');
  });

  it('adapts MachinePassport360Modal (Overview, BOM & Corrective) to active currency in TEAM_FULL and hides finance/blueprint in SOLO_EXPERT while keeping Family/Template and optional Technician', () => {
    const machine = {
      id_machine_registered: 'MCH-FIN-01',
      designation: 'Extrudeuse Principale',
      id_family: 'FAM-01',
      id_templates: 'TPL-01',
      id_blueprint: 'BP-01',
      id_zone_default: 'Z-01',
      statut: 'Active',
      valeur_acquisition: 100000,
      cout_arret_horaire: 500,
      technician: 'TECH-01',
    } as any;

    useGmaoStore.setState({
      machines: [machine],
      families: [{ id_family: 'FAM-01', libelle: 'Extrudeuses' } as any],
      templates: [{ id_templates: 'TPL-01', id_family: 'FAM-01', libelle: 'Extrudeuse Bi-Vis' } as any],
      blueprints: [{ id_blueprint: 'BP-01', id_family: 'FAM-01', id_templates: 'TPL-01', libelle: 'Schéma Extrudeuse' } as any],
      zones: [{ id_zone: 'Z-01', code_zone: 'Z1', libelle: 'Atelier A' } as any],
      technicians: [{ id_technician: 'TECH-01', nom: 'Youssef' } as any],
      correctiveInterventions: [
        {
          id_intervention: 'BT-FIN-01',
          id_machine_registered: 'MCH-FIN-01',
          date_intervention: '2026-03-15',
          type_panne: 'MECANIQUE',
          statut: 'CLOTURE',
          description_panne: 'Rupture courroie',
          temps_arret_heures: 2,
          cout_total: 1250,
        } as any,
      ],
      preventiveExecutions: [],
      sortiesExterne: [],
      rawStock: [],
    });

    // 1. TEAM_FULL with EUR currency -> no hardcoded DH, uses €, footer uses APP_VERSION (no stale v4)
    saveCurrencyConfig({ activeCurrencyCode: 'EUR' });
    React.act(() => {
      root.render(
        withProviders(<MachinePassport360Modal machine={machine} onClose={vi.fn()} />)
      );
    });
    expect(container.textContent).toContain('Coût Maintenance');
    expect(container.textContent).toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);
    expect(container.textContent).not.toContain('v4');
    expect(container.textContent).toContain('CIOB GMAO Nexus v');
    expect(container.textContent).toContain('Technicien Assigné');

    // Tab 4 CORRECTIF (Historique Pannes) in TEAM_FULL EUR -> formatted in €, zero DH
    const correctiveTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Historique Pannes')
    );
    expect(correctiveTabBtn).toBeDefined();
    React.act(() => {
      correctiveTabBtn?.click();
    });
    expect(container.textContent).toContain('Rupture courroie');
    expect(container.textContent).toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);

    // 2. SOLO_EXPERT -> financial & Blueprint chip hidden; Family, Template & assigned Technician preserved
    React.act(() => {
      applyWorkspacePreset('SOLO_EXPERT');
      root.render(
        withProviders(<MachinePassport360Modal machine={machine} onClose={vi.fn()} />)
      );
    });
    const overviewTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Vue Générale')
    );
    expect(overviewTabBtn).toBeDefined();
    React.act(() => {
      overviewTabBtn?.click();
    });
    expect(container.textContent).toContain('Interventions 12M');
    expect(container.textContent).toContain('Famille (Tier 1)');
    expect(container.textContent).toContain('Extrudeuses');
    expect(container.textContent).toContain('Template Modèle (Tier 1)');
    expect(container.textContent).toContain('Extrudeuse Bi-Vis');
    expect(container.textContent).toContain('Technicien Assigné');
    expect(container.textContent).toContain('Youssef (TECH-01)');
    expect(container.textContent).not.toContain('Coût Maintenance');
    expect(container.textContent).not.toContain('Valeur d\'Acquisition (RAV)');

    // Tab 3 BOM in SOLO_EXPERT -> Blueprint chip hidden
    const bomTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Organes & BOM')
    );
    expect(bomTabBtn).toBeDefined();
    React.act(() => {
      bomTabBtn?.click();
    });
    expect(container.textContent).not.toContain('Blueprint :');

    // Tab 4 CORRECTIF (Historique Pannes) in SOLO_EXPERT -> no monetary cost displayed
    const correctiveTabSolo = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Historique Pannes')
    );
    expect(correctiveTabSolo).toBeDefined();
    React.act(() => {
      correctiveTabSolo?.click();
    });
    expect(container.textContent).toContain('Rupture courroie');
    expect(container.textContent).not.toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);
  });

  it('syncs external search prop and blocks referential-integrity violations on FamilyView & TemplatesView delete', () => {
    const onDeleteFamily = vi.fn();
    const families = [
      { id_family: 'FAM-01', libelle: 'Presses Hydrauliques' },
      { id_family: 'FAM-02', libelle: 'Convoyeurs' },
    ];
    const templates = [
      { id_templates: 'TPL-01', id_family: 'FAM-01', libelle: 'Presse 200T' },
    ];
    const machines = [
      {
        id_machine_registered: 'MCH-01',
        id_family: 'FAM-01',
        id_templates: 'TPL-01',
        designation: 'Presse #1',
      },
    ];
    const blueprints = [
      { id_blueprint: 'BP-01', id_family: 'FAM-01', id_templates: 'TPL-01', libelle: 'BP Presse' },
    ];

    // 1. FamilyView honors incoming search prop ('FAM-01')
    React.act(() => {
      root.render(
        withProviders(
          <FamilyView
            families={families}
            templates={templates}
            machines={machines}
            search="FAM-01"
            setSearch={vi.fn()}
            onAddFamily={vi.fn()}
            onUpdateFamily={vi.fn()}
            onDeleteFamily={onDeleteFamily}
            onNavigateToTemplatesFiltered={vi.fn()}
            onQuickCreateTemplate={vi.fn()}
            onNavigateToMachinesByFamily={vi.fn()}
          />
        )
      );
    });

    expect(container.textContent).toContain('Presses Hydrauliques');
    expect(container.textContent).not.toContain('Convoyeurs');

    // Open row action menu and click delete on FAM-01 (which has 1 template & 1 machine)
    const moreBtns = container.querySelectorAll('.action-menu-container button');
    const menuTrigger = moreBtns[moreBtns.length - 1] as HTMLButtonElement;
    React.act(() => {
      menuTrigger.click();
    });
    const deleteMenuItem = Array.from(container.querySelectorAll('button')).find((b) =>
      b.className.includes('text-rose-600')
    );
    React.act(() => {
      deleteMenuItem?.click();
    });

    expect(container.querySelector('[data-testid="family-delete-blocked-alert"]')).not.toBeNull();
    expect(onDeleteFamily).not.toHaveBeenCalled();

    // 2. TemplatesView honors search prop, renders NB BLUEPRINTS column, and blocks delete of linked template
    const onDeleteTemplate = vi.fn();
    React.act(() => {
      root.render(
        withProviders(
          <TemplatesView
            templates={templates}
            families={families}
            blueprints={blueprints}
            machines={machines}
            search="TPL-01"
            setSearch={vi.fn()}
            templateFamilyFilter="ALL"
            setTemplateFamilyFilter={vi.fn()}
            quickCreateTemplateFamily={null}
            setQuickCreateTemplateFamily={vi.fn()}
            onAddTemplate={vi.fn()}
            onUpdateTemplate={vi.fn()}
            onDeleteTemplate={onDeleteTemplate}
            onOpenAddFamilyModal={vi.fn()}
            onNavigateToMachinesByTemplate={vi.fn()}
            onNavigateToFamilyFiltered={vi.fn()}
            onNavigateToBlueprints={vi.fn()}
            onQuickCreateBlueprint={vi.fn()}
          />
        )
      );
    });

    expect(container.textContent).toContain('1 blueprints');
    expect(container.textContent).toContain('(Type B)');

    const tplMoreBtns = container.querySelectorAll('.action-menu-container button');
    const tplMenuTrigger = tplMoreBtns[tplMoreBtns.length - 1] as HTMLButtonElement;
    React.act(() => {
      tplMenuTrigger.click();
    });
    const tplDeleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.className.includes('text-rose-600')
    );
    React.act(() => {
      tplDeleteBtn?.click();
    });

    expect(container.querySelector('[data-testid="template-delete-blocked-alert"]')).not.toBeNull();
    expect(onDeleteTemplate).not.toHaveBeenCalled();

    // 3. TemplatesView in SOLO_EXPERT hides Blueprint column & quick-create Blueprint trigger while keeping Template rows active
    React.act(() => {
      applyWorkspacePreset('SOLO_EXPERT');
      root.render(
        withProviders(
          <TemplatesView
            templates={templates}
            families={families}
            blueprints={blueprints}
            machines={machines}
            search="TPL-01"
            setSearch={vi.fn()}
            templateFamilyFilter="ALL"
            setTemplateFamilyFilter={vi.fn()}
            quickCreateTemplateFamily={null}
            setQuickCreateTemplateFamily={vi.fn()}
            onAddTemplate={vi.fn()}
            onUpdateTemplate={vi.fn()}
            onDeleteTemplate={onDeleteTemplate}
            onOpenAddFamilyModal={vi.fn()}
            onNavigateToMachinesByTemplate={vi.fn()}
            onNavigateToFamilyFiltered={vi.fn()}
            onNavigateToBlueprints={vi.fn()}
            onQuickCreateBlueprint={vi.fn()}
          />
        )
      );
    });

    expect(container.textContent).toContain('Presse 200T');
    expect(container.textContent).not.toContain('1 blueprints');
    expect(container.textContent).not.toContain('NB BLUEPRINTS');
  });

  it('eliminates hardcoded DH in Carnet Préventif (MachinesRegisteredModals) and MachineQrFieldModal across EUR TEAM_FULL and SOLO_EXPERT', () => {
    const machine = {
      id_machine_registered: 'MCH-CARNET-01',
      designation: 'Compresseur Atelier',
      id_zone_default: 'Z-01',
      statut: 'Active',
    } as any;

    const preventiveExecutions = [
      {
        id: 'EXEC-01',
        taskId: 'PM-01',
        machineId: 'MCH-CARNET-01',
        machineLabel: 'Compresseur Atelier',
        completedAt: '2026-04-10T10:00:00.000Z',
        periodMonth: '2026-04',
        durationMinutes: 45,
        status: 'VALIDATED',
        totalCost: 350,
        usedParts: [],
      } as any,
    ];

    useGmaoStore.setState({
      machines: [machine],
      zones: [{ id_zone: 'Z-01', code_zone: 'Z1', libelle: 'Atelier A' } as any],
      preventiveTasks: [
        {
          id: 'PM-01',
          machine: 'MCH-CARNET-01',
          composant: 'Filtre Air',
          actionCode: 'N',
          frequence: 'Mensuelle',
        } as any,
      ],
      preventiveExecutions,
      correctiveInterventions: [],
      sortiesExterne: [],
      rawStock: [],
      machineElementsLedger: [],
    });

    // 1. TEAM_FULL EUR -> Carnet Préventif renders € and zero DH
    saveCurrencyConfig({ activeCurrencyCode: 'EUR' });
    React.act(() => {
      root.render(
        withProviders(
          <MachinesRegisteredModals
            toEdit={null}
            setToEdit={vi.fn()}
            toDelete={null}
            setToDelete={vi.fn()}
            showFormulasModal={false}
            setShowFormulasModal={vi.fn()}
            preventiveMachine={machine}
            setPreventiveMachine={vi.fn()}
            machines={[machine]}
            families={[]}
            templates={[]}
            blueprints={[]}
            zones={[{ id_zone: 'Z-01', code_zone: 'Z1', libelle: 'Atelier A' } as any]}
            technicians={[]}
            preventiveTasks={useGmaoStore.getState().preventiveTasks}
            preventiveExecutions={preventiveExecutions}
            correctiveInterventions={[]}
            mouvements={[]}
            machineElementsLedger={[]}
            sortiesExterne={[]}
            sortieDemands={[]}
            warehouseItems={[]}
            onUpdateMachine={vi.fn()}
            onDeleteMachine={vi.fn()}
            navigateToEquipmentForMachine={vi.fn()}
            getMachineSerialNumber={() => 'SN-01'}
            getMachineCommissioningDate={() => '2024-01-01'}
            getZoneByRef={() => ({ id_zone: 'Z-01', code_zone: 'Z1', libelle: 'Atelier A' } as any)}
          />
        )
      );
    });
    expect(container.textContent).toContain('Coût Préventif Cumulé');
    expect(container.textContent).toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);

    // 2. SOLO_EXPERT -> Carnet Préventif hides financial KPI & ledger cost
    React.act(() => {
      applyWorkspacePreset('SOLO_EXPERT');
      root.render(
        withProviders(
          <MachinesRegisteredModals
            toEdit={null}
            setToEdit={vi.fn()}
            toDelete={null}
            setToDelete={vi.fn()}
            showFormulasModal={false}
            setShowFormulasModal={vi.fn()}
            preventiveMachine={machine}
            setPreventiveMachine={vi.fn()}
            machines={[machine]}
            families={[]}
            templates={[]}
            blueprints={[]}
            zones={[{ id_zone: 'Z-01', code_zone: 'Z1', libelle: 'Atelier A' } as any]}
            technicians={[]}
            preventiveTasks={useGmaoStore.getState().preventiveTasks}
            preventiveExecutions={preventiveExecutions}
            correctiveInterventions={[]}
            mouvements={[]}
            machineElementsLedger={[]}
            sortiesExterne={[]}
            sortieDemands={[]}
            warehouseItems={[]}
            onUpdateMachine={vi.fn()}
            onDeleteMachine={vi.fn()}
            navigateToEquipmentForMachine={vi.fn()}
            getMachineSerialNumber={() => 'SN-01'}
            getMachineCommissioningDate={() => '2024-01-01'}
            getZoneByRef={() => ({ id_zone: 'Z-01', code_zone: 'Z1', libelle: 'Atelier A' } as any)}
          />
        )
      );
    });
    expect(container.textContent).not.toContain('Coût Préventif Cumulé');
    expect(container.textContent).toContain("Journal d'Activité");
    expect(container.textContent).not.toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);

    // 3. MachineQrFieldModal FICHE_TERRAIN Tab 3 (Historique & BOM) -> zero DH in EUR TEAM_FULL and hidden cost in SOLO_EXPERT
    React.act(() => {
      applyWorkspacePreset('TEAM_FULL');
      root.render(
        withProviders(
          <MachineQrFieldModal
            machine={machine}
            initialMode="FICHE_TERRAIN"
            onClose={vi.fn()}
          />
        )
      );
    });
    const histTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Historique')
    );
    React.act(() => {
      histTabBtn?.click();
    });
    expect(container.textContent).not.toMatch(/\bDH\b/);

    React.act(() => {
      applyWorkspacePreset('SOLO_EXPERT');
      root.render(
        withProviders(
          <MachineQrFieldModal
            machine={machine}
            initialMode="FICHE_TERRAIN"
            onClose={vi.fn()}
          />
        )
      );
    });
    const histTabBtnSolo = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Historique')
    );
    React.act(() => {
      histTabBtnSolo?.click();
    });
    expect(container.textContent).not.toContain('€');
    expect(container.textContent).not.toMatch(/\bDH\b/);
  });
});
