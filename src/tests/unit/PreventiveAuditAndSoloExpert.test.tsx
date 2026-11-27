import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nContext';
import { applyWorkspacePreset, refreshWorkspaceProfileCache } from '../../core/workspace/workspaceProfile';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import { useGmaoStore } from '../../store/useGmaoStore';
import {
  taskHasRequiredPdr,
  default as PreventiveWeeklyCockpit,
} from '../../presentation/pages/preventive/components/PreventiveWeeklyCockpit';
import {
  CBM_PARAMETER_PRESETS,
  validateCbmRuleThresholds,
  ingestTelemetryPayload,
  type ICbmSensorRule,
} from '../../domain/preventive/cbmTelemetryService';
import { computePreventiveAnalytics } from '../../domain/preventive/preventiveAnalyticsEngine';
import CbmIoTSensorPanel from '../../presentation/pages/preventive/components/CbmIoTSensorPanel';
import PrintWorkOrderModal from '../../presentation/pages/preventive/components/PrintWorkOrderModal';
import PreventiveAnalyticsView from '../../presentation/pages/preventive/components/PreventiveAnalyticsView';
import PreventiveExecutionsHistoryView from '../../presentation/pages/preventive/components/PreventiveExecutionsHistoryView';
import DetailedTaskListView from '../../presentation/pages/preventive/components/DetailedTaskListView';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
    currentUser: { id: 'admin-1', username: 'admin', name: 'Admin', role: 'ADMIN' },
  }),
}));

describe('Preventive Maintenance — Full Audit Fixes, RBAC, SOLO_EXPERT & Field Technicians', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderInRoot = (ui: React.ReactElement) => {
    React.act(() => {
      root.render(<I18nProvider>{ui}</I18nProvider>);
    });
  };

  beforeEach(() => {
    localStorage.clear();
    storageService.removeItem(STORAGE_KEYS.CBM_MANUAL_RULES);
    storageService.removeItem(STORAGE_KEYS.WORKSPACE_PROFILE);
    refreshWorkspaceProfileCache();
    applyWorkspacePreset('TEAM_FULL');
    vi.restoreAllMocks();

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

  describe('1. PDR Contract Guard (taskHasRequiredPdr)', () => {
    it('detects required PDR across pdr_requises, pdr_ref, and legacy pieces_requises', () => {
      expect(taskHasRequiredPdr({ id: 'T1' })).toBe(false);
      expect(taskHasRequiredPdr({ id: 'T2', pdr_requises: [] })).toBe(false);
      expect(taskHasRequiredPdr({ id: 'T3', pdr_requises: [{ ref: 'FILT-01', quantite: 1 }] })).toBe(true);
      expect(taskHasRequiredPdr({ id: 'T4', pdr_ref: 'BRG-6205' })).toBe(true);
      expect(taskHasRequiredPdr({ id: 'T5', pieces_requises: [{ ref: 'OIL-10', qte: 2 }] } as any)).toBe(true);
    });
  });

  describe('2. CBM Threshold Validation & LOW_BAD Honesty', () => {
    it('rejects inverted thresholds and out-of-bounds values for HIGH_BAD and LOW_BAD', () => {
      expect(
        validateCbmRuleThresholds({
          direction: 'HIGH_BAD',
          warningThreshold: 90,
          criticalThreshold: 75,
          minPhysicalBound: -40,
          maxPhysicalBound: 250,
          unit: '°C',
        }).valid
      ).toBe(false);

      expect(
        validateCbmRuleThresholds({
          direction: 'LOW_BAD',
          warningThreshold: 80,
          criticalThreshold: 120,
          minPhysicalBound: 0,
          maxPhysicalBound: 2500,
          unit: 'm³/h',
        }).valid
      ).toBe(false);

      expect(
        validateCbmRuleThresholds({
          direction: 'HIGH_BAD',
          warningThreshold: 75,
          criticalThreshold: 300,
          minPhysicalBound: -40,
          maxPhysicalBound: 250,
          unit: '°C',
        }).valid
      ).toBe(false);

      expect(
        validateCbmRuleThresholds({
          direction: 'LOW_BAD',
          warningThreshold: 120,
          criticalThreshold: 85,
          minPhysicalBound: 0,
          maxPhysicalBound: 2500,
          unit: 'm³/h',
        }).valid
      ).toBe(true);
    });

    it('uses <= operator, Chute critique wording, and operator attribution for LOW_BAD manual readings', () => {
      const preset = CBM_PARAMETER_PRESETS.DEBIT_AIR;
      const airRule: ICbmSensorRule = {
        id: 'CBM-COMP-01',
        machineCode: 'COMP-01',
        organe: 'Collecteur Air Comprimé',
        parameter: 'DEBIT_AIR',
        unit: preset.unit,
        protocol: 'MANUEL',
        endpointAddress: 'Débitmètre Ligne 1',
        direction: 'LOW_BAD',
        warningThreshold: 120,
        criticalThreshold: 85,
        hysteresis: 5,
        minPhysicalBound: 0,
        maxPhysicalBound: 2500,
        autoTriggerDi: true,
        lastStatus: 'NORMAL',
      };

      const res = ingestTelemetryPayload(
        {
          sensorId: airRule.id,
          protocol: 'MANUEL',
          value: 72,
          operatorName: 'Karim Benali',
        },
        [airRule],
        []
      );

      expect(res.evaluation?.status).toBe('CRITICAL');
      expect(res.autoCreatedDiPayload?.anomalie).toContain('Chute critique');
      expect(res.autoCreatedDiPayload?.anomalie).toContain('≤ 85 m³/h');
      expect(res.autoCreatedDiPayload?.demandeur).toBe('Relevé CBM Terrain (Karim Benali)');
    });
  });

  describe('3. Technician Workload & Compliance Analytics Engine', () => {
    it('computes per-technician task counts, compliance rate, overdue counts, and execution hours', () => {
      const tasks = [
        {
          id: 'T-1',
          id_machine: 'PRS-01',
          composant: 'Palier',
          action_code: 'G',
          responsable: 'Youssef Alami',
          etat: 'Fait',
          derniere_realisation: '2026-04-15',
          prochaine_echeance: '2026-05-15',
        },
        {
          id: 'T-2',
          id_machine: 'PRS-01',
          composant: 'Filtre',
          action_code: 'V',
          responsable: 'Youssef Alami',
          etat: 'En retard',
          prochaine_echeance: '2020-01-01',
        },
        {
          id: 'T-3',
          id_machine: 'CNV-02',
          composant: 'Courroie',
          action_code: 'C',
          responsable: 'Mehdi Tazi',
          etat: 'Fait',
          derniere_realisation: '2026-04-15',
          prochaine_echeance: '2026-05-15',
        },
      ];
      const executions = [
        {
          id: 'EX-1',
          taskId: 'T-1',
          machineId: 'PRS-01',
          technician: 'Youssef Alami',
          durationMinutes: 45,
          totalCost: 120,
          validationStatus: 'APPROVED',
          executionDate: '2026-04-15',
        },
        {
          id: 'EX-2',
          taskId: 'T-3',
          machineId: 'CNV-02',
          technician: 'Mehdi Tazi',
          durationMinutes: 30,
          totalCost: 80,
          validationStatus: 'APPROVED',
          executionDate: '2026-04-15',
        },
      ];

      const report = computePreventiveAnalytics({
        tasks: tasks as any,
        executions: executions as any,
        machines: [],
        today: '2026-04-16',
      });

      expect(report.techniciansStats).toHaveLength(2);
      const youssef = report.techniciansStats.find((s) => s.technicianName === 'Youssef Alami');
      const mehdi = report.techniciansStats.find((s) => s.technicianName === 'Mehdi Tazi');

      expect(youssef).toMatchObject({
        totalTasks: 2,
        doneTasks: 1,
        overdueTasks: 1,
        complianceRate: 50,
        approvedExecs: 1,
        totalDurationMinutes: 45,
        totalCost: 120,
      });
      expect(mehdi).toMatchObject({
        totalTasks: 1,
        doneTasks: 1,
        overdueTasks: 0,
        complianceRate: 100,
        approvedExecs: 1,
        totalDurationMinutes: 30,
        totalCost: 80,
      });
    });
  });

  describe('4. Preventive Store Slice Lifecycle Integrity', () => {
    it('recomputes linked task derniere_realisation & etat when an execution is deleted, and clears CBM rules on real factory reset', () => {
      const store = useGmaoStore.getState();

      storageService.setItem(STORAGE_KEYS.CBM_MANUAL_RULES, [{ id: 'RULE-1' }]);

      store.setPreventiveTasks([
        {
          id: 'TASK-DEL-1',
          id_machine: 'PRS-01',
          composant: 'Moteur',
          action_code: 'C',
          frequence: 'Mensuel',
          etat: 'Fait',
          derniere_realisation: '2026-04-15',
        },
      ] as any);
      store.setPreventiveExecutions([
        {
          id: 'EXEC-DEL-1',
          taskId: 'TASK-DEL-1',
          machineId: 'PRS-01',
          executionDate: '2026-04-15',
          validationStatus: 'APPROVED',
        },
      ] as any);

      store.handleDeletePreventiveExecution('EXEC-DEL-1');

      const updatedTask = useGmaoStore
        .getState()
        .preventiveTasks.find((t: any) => t.id === 'TASK-DEL-1');
      expect(updatedTask?.etat).toBe('À faire');
      expect(updatedTask?.derniere_realisation).toBe('');

      store.handleClearPreventiveForRealFactory();
      expect(storageService.getItem(STORAGE_KEYS.CBM_MANUAL_RULES)).toEqual([]);
    });
  });

  describe('5. CBM Panel RBAC & Honest Manual Protocol UI', () => {
    it('hides mutation controls for read-only Viewer and does not expose fake MQTT/OPC_UA/MODBUS_TCP options', () => {
      const machines = [
        { id: 'PRS-01', id_machine_registered: 'PRS-01', designation: 'Presse 1', status: 'ACTIVE' },
        { id: 'OLD-01', id_machine_registered: 'OLD-01', designation: 'Presse Archivée', status: 'ARCHIVEE' },
      ];

      renderInRoot(
        <CbmIoTSensorPanel
          machines={machines as any}
          defaultExpanded={true}
          canManage={false}
          canExecute={false}
        />
      );
      expect(container.textContent).not.toContain('Ajouter un point');

      renderInRoot(
        <CbmIoTSensorPanel
          machines={machines as any}
          defaultExpanded={true}
          canManage={true}
          canExecute={true}
        />
      );

      const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Ajouter un point')
      );
      expect(addBtn).toBeTruthy();

      React.act(() => {
        addBtn?.click();
      });

      const content = container.textContent || '';
      expect(content).not.toContain('MQTT');
      expect(content).not.toContain('OPC_UA');
      expect(content).not.toContain('MODBUS_TCP');
      // Archived machine excluded from selector
      expect(content).not.toContain('OLD-01');
      expect(content).toContain('PRS-01');
    });
  });

  describe('6. PrintWorkOrderModal — PDR Resolution, LOTO Toggle, Blank Observations & SOLO_EXPERT', () => {
    it('resolves pdr_requises, toggles LOTO once on click, avoids fake RAS text, and hides P.U in SOLO_EXPERT', () => {
      applyWorkspacePreset('SOLO_EXPERT');

      const task = {
        id: 'OT-1',
        id_machine: 'PRS-01',
        composant: 'Circuit Hydraulique',
        action_code: 'V',
        frequence: 'Trimestriel',
        pdr_requises: [
          {
            ref: 'FILT-HYD-10',
            designation: 'Filtre Hydraulique 10µm',
            quantite: 2,
            unite: 'U',
            prix_unitaire: 240,
          },
        ],
        consigne: 'Vidanger huile ISO VG46.',
      };

      renderInRoot(
        <PrintWorkOrderModal
          task={task as any}
          onClose={vi.fn()}
        />
      );

      const text = container.textContent || '';
      expect(text).toContain('FILT-HYD-10');
      expect(text).toContain('Filtre Hydraulique 10µm');
      expect(text).toContain('2 U');
      // SOLO_EXPERT hides unit price column
      expect(text).not.toContain('P.U');
      // Observations must not be pre-filled with fake "RAS"
      expect(text).not.toMatch(/\bRAS\b/);

      // LOTO checkbox toggles cleanly once on click (no double-toggle bug)
      const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
      expect(checkboxes.length).toBeGreaterThan(0);
      const lotoCheckbox = checkboxes[0];
      expect(lotoCheckbox.checked).toBe(true);
      React.act(() => {
        lotoCheckbox.click();
      });
      expect(lotoCheckbox.checked).toBe(false);
    });
  });

  describe('7. SOLO_EXPERT Views & Technician Management UI', () => {
    it('adapts PreventiveAnalyticsView for SOLO_EXPERT (hides costs, shows Charge Horaire & Technician Workload table)', () => {
      applyWorkspacePreset('SOLO_EXPERT');

      const tasks = [
        {
          id: 'T-SOLO-1',
          id_machine: 'PRS-01',
          composant: 'Palier',
          action_code: 'G',
          responsable: 'Youssef Alami',
          etat: 'Fait',
          derniere_realisation: '2026-04-15',
          prochaine_echeance: '2026-05-15',
        },
      ];
      const executions = [
        {
          id: 'EX-SOLO-1',
          taskId: 'T-SOLO-1',
          machineId: 'PRS-01',
          technician: 'Youssef Alami',
          durationMinutes: 60,
          totalCost: 250,
          validationStatus: 'APPROVED',
          executionDate: '2026-04-15',
        },
      ];

      renderInRoot(
        <PreventiveAnalyticsView
          tasks={tasks as any}
          executions={executions as any}
          machines={[{ id_machine_registered: 'PRS-01', designation: 'Presse 1' } as any]}
        />
      );

      const text = container.textContent || '';
      expect(text).toContain('Charge Horaire Préventive');
      expect(text).not.toContain('Coût Préventif Validé');
      expect(text).toContain('Charge & Performance par Technicien');
      expect(text).toContain('Youssef Alami');
    });

    it('adapts PreventiveExecutionsHistoryView for SOLO_EXPERT and filters by technician', () => {
      applyWorkspacePreset('SOLO_EXPERT');

      const todayIso = new Date().toISOString().split('T')[0];
      const executions = [
        {
          id: 'EX-H-1',
          taskId: 'T-1',
          machineCode: 'PRS-01',
          composant: 'Palier',
          actionCode: 'G',
          executorName: 'Youssef Alami',
          durationMinutes: 30,
          totalCost: 150,
          validation_status: 'APPROVED',
          executedAt: todayIso,
          periodMonth: todayIso.slice(0, 7),
        },
        {
          id: 'EX-H-2',
          taskId: 'T-2',
          machineCode: 'CNV-02',
          composant: 'Courroie',
          actionCode: 'C',
          executorName: 'Mehdi Tazi',
          durationMinutes: 20,
          totalCost: 90,
          validation_status: 'APPROVED',
          executedAt: todayIso,
          periodMonth: todayIso.slice(0, 7),
        },
      ];

      renderInRoot(
        <PreventiveExecutionsHistoryView
          executions={executions as any}
        />
      );

      expect(container.textContent).not.toContain('Coût Total Préventif');
      expect(container.textContent).not.toContain('En attente (0)');

      const techSelect = container.querySelector('select[aria-label="Filtrer par technicien"]') as HTMLSelectElement;
      expect(techSelect).toBeTruthy();

      React.act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(techSelect, 'Youssef Alami');
        techSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(container.textContent).toContain('PRS-01');
      expect(container.textContent).not.toContain('CNV-02');
    });

    it('renders Edit/Delete task buttons and hides Cost column in DetailedTaskListView under SOLO_EXPERT', () => {
      applyWorkspacePreset('SOLO_EXPERT');
      const onEditTask = vi.fn();
      const onDeleteTask = vi.fn();

      const tasks = [
        {
          id: 'T-LIST-1',
          id_machine: 'PRS-01',
          composant: 'Pompe Hydraulique',
          action_code: 'C',
          frequence: 'Hebdo',
          responsable: 'Youssef Alami',
          cout_cumule: 350,
          etat: 'À faire',
        },
      ];

      renderInRoot(
        <DetailedTaskListView
          tasks={tasks as any}
          machines={[{ id_machine_registered: 'PRS-01', designation: 'Presse 1' } as any]}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
        />
      );

      expect(container.textContent).not.toContain('COÛT (');

      const editBtn = container.querySelector('button[title*="Modifier ou réaffecter" i]') as HTMLButtonElement;
      const deleteBtn = container.querySelector('button[title*="Supprimer cette tâche" i]') as HTMLButtonElement;
      expect(editBtn).toBeTruthy();
      expect(deleteBtn).toBeTruthy();

      React.act(() => {
        editBtn.click();
        deleteBtn.click();
      });

      expect(onEditTask).toHaveBeenCalledTimes(1);
      expect(onDeleteTask).toHaveBeenCalledTimes(1);
    });

    it('filters Weekly Cockpit by technician and supports OT print button', () => {
      const onPrintWorkOrder = vi.fn();
      const tasks = [
        {
          id: 'T-WK-1',
          id_machine: 'PRS-01',
          composant: 'Palier Avant',
          action_code: 'G',
          frequence: 'Hebdo',
          responsable: 'Youssef Alami',
          prochaine_echeance: '2020-01-01',
          etat: 'En retard',
        },
        {
          id: 'T-WK-2',
          id_machine: 'CNV-02',
          composant: 'Rouleau',
          action_code: 'C',
          frequence: 'Hebdo',
          responsable: 'Mehdi Tazi',
          prochaine_echeance: '2020-01-01',
          etat: 'En retard',
        },
      ];

      renderInRoot(
        <PreventiveWeeklyCockpit
          tasks={tasks as any}
          machines={[
            { id: 'PRS-01', id_machine_registered: 'PRS-01', designation: 'Presse 1', status: 'ACTIVE' },
            { id: 'CNV-02', id_machine_registered: 'CNV-02', designation: 'Convoyeur 2', status: 'ACTIVE' },
          ] as any}
          technicians={[
            { id_technician: 'TECH-1', nom: 'Youssef', prenom: 'Alami', is_active: true },
            { id_technician: 'TECH-2', nom: 'Mehdi', prenom: 'Tazi', is_active: true },
          ] as any}
          currentWeekNumber={16}
          isTechUser={false}
          techDisplayName="Admin"
          canExecutePreventive={true}
          onPrintWorkOrder={onPrintWorkOrder}
        />
      );

      const techFilter = container.querySelector('select[aria-label="Filtrer la file par technicien"]') as HTMLSelectElement;
      expect(techFilter).toBeTruthy();

      React.act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(techFilter, 'Youssef Alami');
        techFilter.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(container.textContent).toContain('Palier Avant');
      expect(container.textContent).not.toContain('Rouleau');

      const otButton = container.querySelector('button[title*="Bon d\'Intervention" i]') as HTMLButtonElement;
      expect(otButton).toBeTruthy();
      React.act(() => {
        otButton.click();
      });
      expect(onPrintWorkOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'T-WK-1' }));
    });
  });
});
