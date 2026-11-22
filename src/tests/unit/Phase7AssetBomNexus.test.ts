import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionService } from '../../application/services/preventive/ExecutionService';
import { TaskService } from '../../application/services/preventive/TaskService';
import { PlanService } from '../../application/services/preventive/PlanService';
import { PreventiveService } from '../../application/services/PreventiveService';
import {
  buildConsumablePdrInventory,
  applyBlueprintPlanToActiveMachines,
  rankStockItemsByMachineBom,
  buildUnifiedMachineNexusElements,
  buildLedgerEntriesFromBlueprint,
  applyReplacementMovementToLedger,
} from '../../core/domain';
import { buildConsumablePdrInventory as reExportedBuildConsumablePdrInventory } from '../../presentation/pages/preventive/components/TabMainView';
import { CorrectiveIntervention } from '../../domain/corrective/entities/CorrectiveIntervention';
import { storageService } from '../../utils/storageService';

describe('P0–P5 Core (alias Phase P7): Consumable PDR Truth, Organe FKs, Part Localization & Semi-Hierarchical BOM (ADR-09)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    storageService.clearCache?.();
  });

  it('P1: propagates id_composant, nom_composant, id_part, and nom_part from PreventiveTask to PreventiveExecutionRecord', () => {
    const taskWithComponentAndPart = {
      id: 'TASK-P7-001',
      code: 'PRV-DET01-MOT01',
      id_machine: 'DET-01',
      nom_machine: 'Détoureuse 01',
      id_zone: 'Détourage',
      composant: 'Moteur Asynchrone 10A (mot 01)',
      id_composant: 'mot 01',
      nom_composant: 'Moteur Asynchrone 10A (mot 01)',
      id_part: 'PART-PALIER-AV',
      nom_part: 'Palier Avant Broche',
      action_code: 'G',
      frequence: 'Mensuel',
      responsable: 'Rachid',
    };

    TaskService.saveTasks([taskWithComponentAndPart]);

    const updatedTasks = TaskService.markTaskAsDone('TASK-P7-001', {
      date_realisation: '2026-10-22',
      technicien: 'Rachid',
      durationMinutes: 30,
      laborRate: 40,
      usedPDR: [
        { ref: 'ROUL-6205-2RS', designation: 'Roulement SKF 6205-2RS', qty: 1, unitPrice: 28, unit: 'Pièce' },
      ],
    });

    const updatedTask = updatedTasks.find((t: any) => t.id === 'TASK-P7-001');
    expect(updatedTask).toBeDefined();
    expect(updatedTask.etat).toBe('Fait');
    expect(updatedTask.id_composant).toBe('mot 01');
    expect(updatedTask.nom_composant).toBe('Moteur Asynchrone 10A (mot 01)');
    expect(updatedTask.id_part).toBe('PART-PALIER-AV');
    expect(updatedTask.nom_part).toBe('Palier Avant Broche');

    const executions = ExecutionService.getExecutions();
    expect(executions.length).toBe(1);
    const exec = executions[0];
    expect(exec.taskId).toBe('TASK-P7-001');
    expect(exec.machineCode).toBe('DET-01');
    expect(exec.organe).toBe('Moteur Asynchrone 10A (mot 01)');
    expect(exec.id_composant).toBe('mot 01');
    expect(exec.nom_composant).toBe('Moteur Asynchrone 10A (mot 01)');
    expect(exec.id_part).toBe('PART-PALIER-AV');
    expect(exec.nom_part).toBe('Palier Avant Broche');
    expect(exec.sparesCost).toBe(28);
  });

  it('P1: preserves id_composant, id_part, and pdr_requises when generating tasks via PlanService.createPlanWithTasks', () => {
    const result = PlanService.createPlanWithTasks(
      {
        id_machine: 'PRH-02',
        nom_machine: 'Presse Hydraulique 02',
        id_zone: 'PRH',
        id_technicien: 'Karim',
        semaine_cible: 'S4',
      },
      [
        {
          composant: 'Pompe Hydraulique Principale',
          id_composant: 'COMP-PMP-02',
          nom_composant: 'Pompe Hydraulique Principale',
          id_part: 'PART-DISTRIB-01',
          nom_part: 'Distributeur Proportionnel',
          action_code: 'V',
          frequence: 'Trimestriel',
          duree_estimee: '45 min',
          pdr_requises: [
            { ref: 'KIT-JOINT-PRH', nom: 'Kit Joints Pompe PRH', quantite: 2 },
          ],
        },
      ]
    );

    expect(result.tasks.length).toBe(1);
    const createdTask = result.tasks[0];
    expect(createdTask.id_machine).toBe('PRH-02');
    expect(createdTask.id_composant).toBe('COMP-PMP-02');
    expect(createdTask.nom_composant).toBe('Pompe Hydraulique Principale');
    expect(createdTask.id_part).toBe('PART-DISTRIB-01');
    expect(createdTask.nom_part).toBe('Distributeur Proportionnel');
    expect(createdTask.pdr_requises).toEqual([
      {
        ref: 'KIT-JOINT-PRH',
        nom: 'Kit Joints Pompe PRH',
        designation: 'Kit Joints Pompe PRH',
        quantite: 2,
      },
    ]);
    expect(createdTask.pdr_ref).toBe('KIT-JOINT-PRH');
  });

  it('P5: prioritizes explicit task.pdr_requises in PreventiveService.getRecommendedPDRForAction', () => {
    const task = {
      id: 'TASK-P7-002',
      action_code: 'R',
      composant: 'Broche UGV',
      pdr_requises: [
        { ref: 'ROUL-7008-C', nom: 'Roulement Broche 7008C', quantite: 2, prix_unitaire: 120 },
      ],
    };

    const recommended = PreventiveService.getRecommendedPDRForAction('R', 'Broche UGV', task);
    expect(recommended.length).toBeGreaterThanOrEqual(1);
    expect(recommended[0].ref).toBe('ROUL-7008-C');
    expect(recommended[0].quantite).toBe(2);
    expect(recommended[0].prix_unitaire).toBe(120);
  });

  it('P0: strictly filters availableInventory to consumable PDR stockItems and excludes COMPONENT / PART items', () => {
    const mixedInput = [
      {
        ref: 'ROUL-6204',
        designation: 'Roulement 6204-2RS',
        stockActuel: 14,
        unite: 'pcs',
        prix_unitaire: 18.5,
      },
      {
        ref: 'COUR-SPA-1250',
        designation: 'Courroie Trapézoïdale SPA 1250',
        stockActuel: 6,
        unite: 'pcs',
        prix_unitaire: 32,
      },
      // Non-consumable rotatable component (must NEVER appear in consumable PDR deduction list)
      {
        id_warehouse_item: 'mot 01',
        ref: 'REF-10A111-NA',
        designation: 'Moteur Asynchrone 10A (mot 01)',
        nature: 'COMPONENT',
        stockActuel: 1,
      },
      // Non-consumable structural machine part (must NEVER appear in consumable PDR deduction list)
      {
        id_warehouse_item: 'PART-MANDRIN-01',
        ref: 'PART-MANDRIN-01',
        designation: 'Mandrin Hydraulique 3 Mors',
        nature: 'PART',
        stockActuel: 1,
      },
      // Legacy French category markers & warehouse item without explicit nature (must ALSO be excluded)
      {
        ref: 'LEG-COMP-01',
        designation: 'Réducteur Legacy',
        category: 'COMPOSANT',
        stockActuel: 1,
      },
      {
        id_warehouse_item: 'WH-NO-NATURE-01',
        ref: 'WH-NO-NATURE-01',
        designation: 'Élément Entrepôt Sans Nature',
        stockActuel: 1,
      },
    ];

    const consumableInventory = buildConsumablePdrInventory(mixedInput);
    expect(reExportedBuildConsumablePdrInventory).toBe(buildConsumablePdrInventory);

    expect(consumableInventory.length).toBe(2);
    expect(consumableInventory.map((i) => i.ref)).toEqual(['ROUL-6204', 'COUR-SPA-1250']);
    expect(consumableInventory.every((i) => i.source === 'PDR Magasin')).toBe(true);
    expect(consumableInventory.some((i) => i.ref === 'REF-10A111-NA')).toBe(false);
    expect(consumableInventory.some((i) => i.ref === 'PART-MANDRIN-01')).toBe(false);
    expect(consumableInventory.some((i) => i.ref === 'LEG-COMP-01')).toBe(false);
    expect(consumableInventory.some((i) => i.ref === 'WH-NO-NATURE-01')).toBe(false);
  });

  it('P2: rankStockItemsByMachineBom ranks Component BOM first, Machine/Blueprint BOM second, and general warehouse third without hiding items', () => {
    const stockItems = [
      { ref: 'GEN-VIS-M8', designation: 'Vis CHC M8', stockActuel: 100 },
      { ref: 'BP-COUR-HTD', designation: 'Courroie HTD 8M', stockActuel: 4 },
      { ref: 'COMP-ROUL-6306', designation: 'Roulement Broche 6306', stockActuel: 8 },
    ];
    const machines = [
      {
        id_machine_registered: 'CNC-01',
        code_machine: 'CNC-01',
        id_blueprint: 'BPT-CNC',
      },
    ];
    const blueprints = [
      {
        id_blueprint: 'BPT-CNC',
        pdr_theoriques: [
          { id_pdr: 'BP-COUR-HTD', libelle: 'Courroie HTD 8M', qte: 1 },
          {
            id_pdr: 'COMP-ROUL-6306',
            libelle: 'Roulement Broche 6306',
            qte: 2,
            parent_component_key: 'Broche Principale',
          },
        ],
      },
    ];

    const ranked = rankStockItemsByMachineBom(
      'CNC-01',
      stockItems,
      machines,
      blueprints,
      'Broche Principale'
    );

    expect(ranked.length).toBe(3);
    expect(ranked[0].ref).toBe('COMP-ROUL-6306');
    expect(ranked[0].bomPriority).toBe(1);
    expect(ranked[0].isBomRecommended).toBe(true);

    expect(ranked[1].ref).toBe('BP-COUR-HTD');
    expect(ranked[1].bomPriority).toBe(2);
    expect(ranked[1].isBomRecommended).toBe(true);

    expect(ranked[2].ref).toBe('GEN-VIS-M8');
    expect(ranked[2].bomPriority).toBe(3);
    expect(ranked[2].isBomRecommended).toBe(false);
  });

  it('P3: CorrectiveIntervention preserves both id_composant / nom_composant and structural localization id_part / nom_part', () => {
    const ci = new CorrectiveIntervention({
      id: 'DI-901',
      code_machine: 'TRR-11',
      id_composant: 'COMP-MOT-11',
      nom_composant: 'Moteur Broche 15kW',
      id_part: 'PART-POUPEE-FIXE',
      nom_part: 'Poupée Fixe',
      statut_composant_cloture: 'En service',
      anomalie: 'Échauffement palier',
      statut: 'CLOTURE',
      action_fermee: 'OUI',
    }).toJSON();

    expect(ci.id_composant).toBe('COMP-MOT-11');
    expect(ci.nom_composant).toBe('Moteur Broche 15kW');
    expect(ci.id_part).toBe('PART-POUPEE-FIXE');
    expect(ci.nom_part).toBe('Poupée Fixe');
    expect(ci.statut_composant_cloture).toBe('En service');
  });

  it('P4 & P5: applyBlueprintPlanToActiveMachines resolves installed id_composant from warehouseItems and inherits pdr_requises from semi-hierarchical BOM', () => {
    const blueprint = {
      id_blueprint: 'BPT-DET-100',
      libelle: 'Plan Détoureuse CNC',
      components_theoriques: [{ id_component: 'COMP-BROCHE', libelle: 'Broche Principale' }],
      pdr_theoriques: [
        {
          id_pdr: 'ROUL-7006',
          libelle: 'Roulement Céramique 7006',
          qte: 2,
          parent_component_key: 'Broche Principale',
        },
      ],
      preventivePlanItems: [
        {
          id: 'PM-ITEM-1',
          composant: 'Broche Principale',
          component_ref: 'Broche Principale',
          action_code: 'G',
          frequence: 'Mensuel',
          duree_min: 20,
          description: 'Graissage roulements broche',
        },
      ],
    };

    const machines = [
      {
        id_machine_registered: 'DET-01',
        code_machine: 'DET-01',
        designation: 'Détoureuse 01',
        id_blueprint: 'BPT-DET-100',
        statut: 'Opérationnelle',
      },
    ];

    const warehouseItems = [
      {
        id_warehouse_item: 'WH-COMP-BROCHE-01',
        designation: 'Broche Principale',
        nature: 'COMPONENT',
        id_machine_registered: 'DET-01',
        status: 'En service',
      },
    ];

    const res = applyBlueprintPlanToActiveMachines(blueprint, machines, [], warehouseItems);
    expect(res.addedCount).toBe(1);
    const generatedTask = res.addedTasks[0];
    expect(generatedTask.id_machine).toBe('DET-01');
    expect(generatedTask.id_composant).toBe('WH-COMP-BROCHE-01');
    expect(generatedTask.nom_composant).toBe('Broche Principale');
    expect(generatedTask.pdr_requises).toEqual([
      {
        ref: 'ROUL-7006',
        nom: 'Roulement Céramique 7006',
        designation: 'Roulement Céramique 7006',
        quantite: 2,
      },
    ]);
    expect(generatedTask.pdr_ref).toBe('ROUL-7006');
  });

  it('N1: rankStockItemsByMachineBom promotes consumable PDRs from machineElementsLedger (Nexus) and ignores non-PDR ledger entries', () => {
    const stockItems = [
      { ref: 'GEN-BOULON-M10', designation: 'Boulon M10', stockActuel: 50 },
      { ref: 'NEX-COURROIE-A42', designation: 'Courroie A42 Nexus', stockActuel: 5 },
      { ref: 'NEX-ROUL-PALIER', designation: 'Roulement Palier Broche', stockActuel: 3 },
      { ref: 'COMP-MOT-01', designation: 'Moteur Principal', stockActuel: 1 },
    ];
    const machines = [{ id_machine_registered: 'DET-01', code_machine: 'DET-01' }];
    const machineElementsLedger = [
      {
        id: 'BOM-1',
        id_machine_registered: 'DET-01',
        element_type: 'PDR',
        ref_element: 'NEX-COURROIE-A42',
        emplacement_machine: 'Transmission générale',
      },
      {
        id: 'BOM-2',
        id_machine_registered: 'DET-01',
        element_type: 'PDR',
        ref_element: 'NEX-ROUL-PALIER',
        emplacement_machine: 'Broche Principale',
      },
      {
        id: 'BOM-3',
        id_machine_registered: 'DET-01',
        element_type: 'COMPONENT',
        ref_element: 'COMP-MOT-01',
        emplacement_machine: 'Broche Principale',
      },
    ];

    const ranked = rankStockItemsByMachineBom(
      'DET-01',
      stockItems,
      machines,
      [],
      'Broche Principale',
      undefined,
      machineElementsLedger
    );

    expect(ranked[0].ref).toBe('NEX-ROUL-PALIER');
    expect(ranked[0].bomPriority).toBe(1);
    expect(ranked[0].isBomRecommended).toBe(true);

    expect(ranked[1].ref).toBe('NEX-COURROIE-A42');
    expect(ranked[1].bomPriority).toBe(2);
    expect(ranked[1].isBomRecommended).toBe(true);
    expect(ranked[1].bomSourceLabel).toBe('BOM Machine / Nexus');

    // COMPONENT entry in ledger is never promoted as consumable PDR
    const compItem = ranked.find((i) => i.ref === 'COMP-MOT-01');
    expect(compItem?.isBomRecommended).toBe(false);
    expect(compItem?.bomPriority).toBe(3);
  });

  it('N2: buildUnifiedMachineNexusElements combines ledger items with mounted warehouseItems (MONTE / En service) without duplicating refs or including reserve items', () => {
    const ledger = [
      {
        id: 'BOM-LEDGER-1',
        id_machine_registered: 'DET-01',
        element_type: 'PDR',
        ref_element: 'ROUL-6204',
        designation: 'Roulement SKF 6204',
        qte_montee: 2,
        statut: 'OPERATIONNEL',
      },
    ];
    const warehouseItems = [
      {
        id_warehouse_item: 'MOT-01',
        designation: 'Moteur Broche 10kW',
        nature: 'COMPONENT',
        rattachement_type: 'MACHINE',
        id_machine_registered: 'DET-01',
        status: 'En service',
        emplacement: 'Tête de coupe',
      },
      {
        id_warehouse_item: 'PART-MANDRIN-01',
        designation: 'Mandrin Pneumatique',
        nature: 'PART',
        rattachement_type: 'MACHINE',
        id_machine_registered: 'DET-01',
        status: 'MONTE',
      },
      // Unmounted / in-reserve item on same machine code must NOT appear in As-Built live view
      {
        id_warehouse_item: 'MOT-RESERVE-02',
        designation: 'Moteur de secours',
        nature: 'COMPONENT',
        id_machine_registered: 'DET-01',
        status: 'En stock réserve',
      },
      // Duplicate ref already in ledger must NOT produce a second row
      {
        id_warehouse_item: 'ROUL-6204',
        designation: 'Roulement SKF 6204 Duplicate',
        nature: 'PART',
        id_machine_registered: 'DET-01',
        status: 'En service',
      },
    ];

    const unified = buildUnifiedMachineNexusElements('DET-01', ledger, warehouseItems);
    expect(unified.length).toBe(3);
    expect(unified.map((u) => u.ref_element)).toEqual(['ROUL-6204', 'MOT-01', 'PART-MANDRIN-01']);

    const ledgerRow = unified.find((u) => u.ref_element === 'ROUL-6204');
    expect(ledgerRow?._source).toBe('LEDGER');

    const compRow = unified.find((u) => u.ref_element === 'MOT-01');
    expect(compRow?._source).toBe('ENTREPOT');
    expect(compRow?.element_type).toBe('COMPONENT');
    expect(compRow?.emplacement_machine).toBe('Tête de coupe');

    const partRow = unified.find((u) => u.ref_element === 'PART-MANDRIN-01');
    expect(partRow?._source).toBe('ENTREPOT');
    expect(partRow?.element_type).toBe('PART');
  });

  it('N3: buildLedgerEntriesFromBlueprint generates missing COMPONENT, PART, and PDR entries from Blueprint without duplicating existing machine+ref rows', () => {
    const machine = {
      id_machine_registered: 'CNC-01',
      code_machine: 'CNC-01',
      designation: 'Fraiseuse CNC 01',
      id_blueprint: 'BPT-CNC-01',
    };
    const blueprint = {
      id_blueprint: 'BPT-CNC-01',
      components_theoriques: [
        { id_component: 'COMP-BROCHE', libelle: 'Broche UGV 18k', qte: 1, criticite: 'Critique' },
      ],
      parts_theoriques: [
        { id_part: 'PART-BATI-Z', libelle: 'Colonne Axe Z', qte: 1 },
      ],
      pdr_theoriques: [
        {
          id_pdr: 'ROUL-7008C',
          libelle: 'Roulement Céramique 7008C',
          qte: 2,
          parent_component_key: 'Broche UGV 18k',
          duree_vie_heures: 4000,
        },
        {
          id_pdr: 'COUR-HTD-8M',
          libelle: 'Courroie Synchrone HTD 8M',
          qte: 1,
        },
      ],
    };

    const existingLedger = [
      {
        id: 'EXISTING-1',
        id_machine_registered: 'CNC-01',
        element_type: 'PDR' as const,
        ref_element: 'COUR-HTD-8M',
        designation: 'Courroie Synchrone HTD 8M',
        emplacement_machine: 'Axe Z',
        qte_montee: 1,
        date_installation: '2026-01-10',
        heures_actuelles: 1200,
        mtbf_cible_heures: 5000,
        statut: 'OPERATIONNEL' as const,
      },
    ];

    const res = buildLedgerEntriesFromBlueprint(machine, blueprint, existingLedger, []);
    expect(res.skippedCount).toBe(1);
    expect(res.addedEntries.length).toBe(3);
    expect(res.blueprintId).toBe('BPT-CNC-01');

    const compEntry = res.addedEntries.find((e) => e.ref_element === 'COMP-BROCHE');
    expect(compEntry?.element_type).toBe('COMPONENT');
    expect(compEntry?.designation).toBe('Broche UGV 18k');
    expect(compEntry?.id_machine_registered).toBe('CNC-01');

    const partEntry = res.addedEntries.find((e) => e.ref_element === 'PART-BATI-Z');
    expect(partEntry?.element_type).toBe('PART');

    const pdrEntry = res.addedEntries.find((e) => e.ref_element === 'ROUL-7008C');
    expect(pdrEntry?.element_type).toBe('PDR');
    expect(pdrEntry?.qte_montee).toBe(2);
    expect(pdrEntry?.parent_component_key).toBe('Broche UGV 18k');
    expect(pdrEntry?.emplacement_machine).toBe('Broche UGV 18k');
    expect(pdrEntry?.duree_vie_estimee_heures).toBe(5000);

    // Second invocation with merged ledger adds 0 entries
    const secondRun = buildLedgerEntriesFromBlueprint(
      machine,
      blueprint,
      [...existingLedger, ...res.addedEntries],
      []
    );
    expect(secondRun.addedEntries.length).toBe(0);
    expect(secondRun.skippedCount).toBe(4);
  });

  it('N4: applyReplacementMovementToLedger resets heures_actuelles, date_installation, and statut on matching machine PDR row after a Sortie movement', () => {
    const ledger = [
      {
        id: 'BOM-ROUL-01',
        id_machine_registered: 'CNC-01',
        element_type: 'PDR' as const,
        ref_element: 'ROUL-7008C',
        designation: 'Roulement Céramique 7008C',
        emplacement_machine: 'Broche UGV 18k',
        qte_montee: 2,
        date_installation: '2025-05-01',
        heures_actuelles: 3950,
        mtbf_cible_heures: 4000,
        statut: 'A_REMPLACER' as const,
      },
      {
        id: 'BOM-OTHER-MACHINE',
        id_machine_registered: 'CNC-02',
        element_type: 'PDR' as const,
        ref_element: 'ROUL-7008C',
        designation: 'Roulement Céramique 7008C',
        emplacement_machine: 'Broche UGV 18k',
        qte_montee: 2,
        date_installation: '2025-05-01',
        heures_actuelles: 1500,
        mtbf_cible_heures: 4000,
        statut: 'OPERATIONNEL' as const,
      },
    ];

    const res = applyReplacementMovementToLedger(ledger, {
      id_machine_registered: 'CNC-01',
      ref: 'roul-7008c',
      date: '2026-10-24',
      technicien: 'Karim',
    });

    expect(res.updatedElement?.id).toBe('BOM-ROUL-01');
    const updatedTarget = res.updatedLedger.find((e) => e.id === 'BOM-ROUL-01');
    expect(updatedTarget?.heures_actuelles).toBe(0);
    expect(updatedTarget?.date_installation).toBe('2026-10-24');
    expect(updatedTarget?.technicien).toBe('Karim');
    expect(updatedTarget?.statut).toBe('OPERATIONNEL');

    // Other machine's row remains untouched
    const otherMachineRow = res.updatedLedger.find((e) => e.id === 'BOM-OTHER-MACHINE');
    expect(otherMachineRow?.heures_actuelles).toBe(1500);
    expect(otherMachineRow?.date_installation).toBe('2025-05-01');
  });

  it('Phase A.1: buildUnifiedMachineNexusElements preserves _compTemplateId and _partDesignationId on mounted ENTREPOT items', () => {
    const warehouseItems = [
      {
        id_warehouse_item: 'MOT-SERIE-09',
        id_comp_template: 'TPL-MOT-5KW',
        designation: 'Moteur Broche 5kW',
        nature: 'COMPONENT',
        rattachement_type: 'MACHINE',
        id_machine_registered: 'CNC-01',
        status: 'En service',
      },
      {
        id_warehouse_item: 'PART-MANDRIN-09',
        id_part_designation: 'DES-MANDRIN-3M',
        designation: 'Mandrin 3 Mors',
        nature: 'PART',
        rattachement_type: 'MACHINE',
        id_machine_registered: 'CNC-01',
        status: 'MONTE',
      },
    ];

    const unified = buildUnifiedMachineNexusElements('CNC-01', [], warehouseItems);
    expect(unified.length).toBe(2);
    const comp = unified.find((u) => u.ref_element === 'MOT-SERIE-09');
    expect(comp?._source).toBe('ENTREPOT');
    expect(comp?._compTemplateId).toBe('TPL-MOT-5KW');

    const part = unified.find((u) => u.ref_element === 'PART-MANDRIN-09');
    expect(part?._source).toBe('ENTREPOT');
    expect(part?._partDesignationId).toBe('DES-MANDRIN-3M');
  });

  it('Phase A.2: Closed-Loop Ledger Reset automatically resets wear hours in machineElementsLedger on SortieDemand approval, Corrective BT closure, and Preventive execution approval', async () => {
    const { useGmaoStore } = await import('../../store/useGmaoStore');

    useGmaoStore.setState({
      machines: [
        {
          id_machine_registered: 'CNC-01',
          code_machine: 'CNC-01',
          designation: 'CNC 01',
          id_zone_default: 'Z1',
          is_active: true,
        } as any,
      ],
      rawStock: [
        {
          id: 'STK-1',
          ref: 'ROUL-6205',
          designation: 'Roulement 6205',
          stockInitial: 20,
          seuil: 2,
          prixUnitaire: 50,
        } as any,
        {
          id: 'STK-2',
          ref: 'COUR-HTD',
          designation: 'Courroie HTD',
          stockInitial: 20,
          seuil: 2,
          prixUnitaire: 80,
        } as any,
        {
          id: 'STK-3',
          ref: 'FILTRE-HYD',
          designation: 'Filtre Hydraulique',
          stockInitial: 20,
          seuil: 2,
          prixUnitaire: 120,
        } as any,
      ],
      mouvements: [],
      machineElementsLedger: [
        {
          id: 'BOM-1',
          id_machine_registered: 'CNC-01',
          element_type: 'PDR',
          ref_element: 'ROUL-6205',
          designation: 'Roulement 6205',
          qte_montee: 2,
          heures_actuelles: 4800,
          duree_vie_estimee_heures: 5000,
          date_installation: '2025-01-01',
          statut: 'A_REMPLACER',
        },
        {
          id: 'BOM-2',
          id_machine_registered: 'CNC-01',
          element_type: 'PDR',
          ref_element: 'COUR-HTD',
          designation: 'Courroie HTD',
          qte_montee: 1,
          heures_actuelles: 4950,
          duree_vie_estimee_heures: 5000,
          date_installation: '2025-01-01',
          statut: 'A_REMPLACER',
        },
        {
          id: 'BOM-3',
          id_machine_registered: 'CNC-01',
          element_type: 'PDR',
          ref_element: 'FILTRE-HYD',
          designation: 'Filtre Hydraulique',
          qte_montee: 1,
          heures_actuelles: 4600,
          duree_vie_estimee_heures: 5000,
          date_installation: '2025-01-01',
          statut: 'A_REMPLACER',
        },
      ],
    });

    // 1. SortieDemand approval resets ROUL-6205
    const demand = useGmaoStore.getState().handleSubmitSortieDemand({
      id_machine_registered: 'CNC-01',
      id_zone: 'Z1',
      technicien: 'Tech-A',
      submitted_by_id: 'TECH-A',
      date: '2026-11-10',
      items: [{ ref: 'ROUL-6205', designation: 'Roulement 6205', quantite: 2 }],
    });
    expect(demand).toBeTruthy();

    useGmaoStore.getState().handleReviewSortieDemandValidation(demand!.id, {
      decision: 'APPROVED',
      validated_by_id: 'ADMIN-1',
      validated_by_name: 'Admin',
      actorRole: 'ADMIN',
    });

    const afterDemandLedger = useGmaoStore.getState().machineElementsLedger;
    const roulAfterDemand = afterDemandLedger.find((e) => e.ref_element === 'ROUL-6205');
    expect(roulAfterDemand?.heures_actuelles).toBe(0);
    expect(roulAfterDemand?.statut).toBe('OPERATIONNEL');
    expect(roulAfterDemand?.date_installation).toBe('2026-11-10');

    // 2. Corrective BT closure resets COUR-HTD
    const di = useGmaoStore.getState().handleAddDemandeIntervention({
      code_machine: 'CNC-01',
      anomalie: 'Rupture courroie',
      priorite: 'HAUTE',
    });
    useGmaoStore.getState().handleConvertToBt(di.id!, { intervenant: 'Tech-B' });
    useGmaoStore.getState().handleClotureIntervention(di.id!, {
      actorRole: 'ADMIN',
      action_realisee: 'Remplacement courroie HTD',
      date_fin: '2026-11-15',
      intervenant: 'Tech-B',
      pieces_utilisees: [{ ref: 'COUR-HTD', designation: 'Courroie HTD', quantite: 1 }],
    });

    const afterBtLedger = useGmaoStore.getState().machineElementsLedger;
    const courAfterBt = afterBtLedger.find((e) => e.ref_element === 'COUR-HTD');
    expect(courAfterBt?.heures_actuelles).toBe(0);
    expect(courAfterBt?.statut).toBe('OPERATIONNEL');
    expect(courAfterBt?.date_installation).toBe('2026-11-15');

    // 3. Preventive execution approval resets FILTRE-HYD
    useGmaoStore.getState().setPreventiveTasks([
      {
        id: 'PM-TASK-1',
        code: 'PM-CNC01-HYD',
        id_machine: 'CNC-01',
        composant: 'Circuit Hydraulique',
        action_code: 'R',
        frequence: 'Mensuel',
        etat: 'À faire',
      },
    ]);
    useGmaoStore.getState().handleMarkTaskDone('PM-TASK-1', {
      actorRole: 'ADMIN',
      date_realisation: '2026-11-20',
      technicien: 'Tech-C',
      usedPDR: [{ ref: 'FILTRE-HYD', designation: 'Filtre Hydraulique', qty: 1 }],
    });

    const afterPmLedger = useGmaoStore.getState().machineElementsLedger;
    const filtreAfterPm = afterPmLedger.find((e) => e.ref_element === 'FILTRE-HYD');
    expect(filtreAfterPm?.heures_actuelles).toBe(0);
    expect(filtreAfterPm?.statut).toBe('OPERATIONNEL');
  });

  it('Phase A.3: upsertMachineElementsBatch atomically deduplicates (Machine + Ref) within the same batch and skips SYSTEM_GENERAL machines', async () => {
    const { useGmaoStore } = await import('../../store/useGmaoStore');

    useGmaoStore.setState({
      machines: [
        {
          id_machine_registered: 'CNC-01',
          code_machine: 'CNC-01',
          asset_category: 'PRODUCTION',
          is_active: true,
        } as any,
        {
          id_machine_registered: 'EQP-COMP-01',
          code_machine: 'EQP-COMP-01',
          asset_category: 'SYSTEM_GENERAL',
          is_active: true,
        } as any,
      ],
      machineElementsLedger: [],
    });

    const res = useGmaoStore.getState().upsertMachineElementsBatch(
      [
        {
          id_machine_registered: 'CNC-01',
          element_type: 'PDR',
          ref_element: 'ROUL-6205',
          designation: 'Roulement 6205 v1',
          qte_montee: 2,
        },
        // Duplicate (Machine + Ref) in the SAME batch should update in-place, not create a second row
        {
          id_machine_registered: 'CNC-01',
          element_type: 'PDR',
          ref_element: 'roul-6205',
          designation: 'Roulement 6205 v2',
          qte_montee: 4,
        },
        // SYSTEM_GENERAL machine must be rejected
        {
          id_machine_registered: 'EQP-COMP-01',
          element_type: 'PDR',
          ref_element: 'FILTRE-AIR',
          designation: 'Filtre Air Compresseur',
          qte_montee: 1,
        },
      ],
      { sourceLabel: 'UNIT_TEST_BATCH' }
    );

    expect(res.addedCount).toBe(1);
    expect(res.updatedCount).toBe(1);
    expect(res.skippedSystemCount).toBe(1);

    const ledger = useGmaoStore.getState().machineElementsLedger;
    expect(ledger.length).toBe(1);
    expect(ledger[0].qte_montee).toBe(4);
    expect(ledger[0].designation).toBe('Roulement 6205 v2');
  });

  it('Phase B.1: calculateElementWearHours prioritizes machine meter counter delta (compteur_installation & meterReadings) and never freezes calendar estimation after handleSyncWearHours', async () => {
    const { calculateElementWearHours } = await import(
      '../../presentation/pages/system/NexusView'
    );

    const activeMachine = {
      id_machine_registered: 'CNC-01',
      compteur_actuel: 3500,
      heures_fonctionnement_jour: 10,
    };

    // Case 1: Meter-Driven via explicit compteur_installation (3500 - 2000 = 1500h)
    const meterItem = {
      id: 'BOM-M1',
      id_machine_registered: 'CNC-01',
      ref_element: 'ROUL-6205',
      heures_actuelles: 0,
      compteur_installation: 2000,
      date_installation: '2026-01-01',
    };
    const resMeter = calculateElementWearHours(meterItem as any, activeMachine as any, []);
    expect(resMeter.source).toBe('METER');
    expect(resMeter.hours).toBe(1500);
    expect(resMeter.isEstimated).toBe(false);

    // Case 2: Meter-Driven via meterReadings history when compteur_installation is absent
    const meterReadings = [
      { id: 'MR-1', machineId: 'CNC-01', date_releve: '2026-05-01', valeur: 2200 },
      { id: 'MR-2', machineId: 'CNC-01', date_releve: '2026-11-01', valeur: 3500 },
    ];
    const readingItem = {
      id: 'BOM-M2',
      id_machine_registered: 'CNC-01',
      ref_element: 'COUR-HTD',
      heures_actuelles: 0,
      date_installation: '2026-05-10',
    };
    const resReading = calculateElementWearHours(
      readingItem as any,
      activeMachine as any,
      meterReadings as any
    );
    expect(resReading.source).toBe('METER');
    expect(resReading.hours).toBe(1300); // 3500 - 2200

    // Case 3: Calendar-Driven Dynamic Estimation does NOT freeze after a previous sync wrote heures_actuelles = 100
    const machineWithoutCounter = {
      id_machine_registered: 'CNC-02',
      heures_fonctionnement_jour: 10,
    };
    const nowMs = new Date('2026-11-21T00:00:00.000Z').getTime();
    const previouslySyncedCalendarItem = {
      id: 'BOM-CAL',
      id_machine_registered: 'CNC-02',
      ref_element: 'FILTRE-01',
      heures_actuelles: 100, // synced at day 10
      wear_source: 'CALENDAR',
      date_installation: '2026-11-01', // 20 days elapsed -> 20 * 10h = 200h
    };
    const resCal = calculateElementWearHours(
      previouslySyncedCalendarItem as any,
      machineWithoutCounter as any,
      [],
      nowMs
    );
    expect(resCal.source).toBe('CALENDAR');
    expect(resCal.hours).toBe(200);
    expect(resCal.isEstimated).toBe(true);
  });

  it('Phase B.2: matchesExactOrBoundaryToken and getCurrentIsoWeekKey prevent substring false positives (M6 vs M60, P1 vs COMP1) and follow ISO-8601 week rules', async () => {
    const { matchesExactOrBoundaryToken } = await import('../../core/domain');
    const { getCurrentIsoWeekKey } = await import(
      '../../presentation/router/hooks/buildNexusAutomationCallbacks'
    );

    // Substring false positives must return false
    expect(matchesExactOrBoundaryToken('M600', 'M6')).toBe(false);
    expect(matchesExactOrBoundaryToken('COMP10', 'P1')).toBe(false);
    expect(matchesExactOrBoundaryToken('Boulon M6 cassé', 'M6')).toBe(false); // 2-char code rejected in free text

    // Exact match on short codes still works
    expect(matchesExactOrBoundaryToken('M6', 'M6')).toBe(true);
    expect(matchesExactOrBoundaryToken('P1', 'p1')).toBe(true);

    // Token boundary match on multi-character refs (>= 3 chars) works cleanly
    expect(matchesExactOrBoundaryToken('Remplacement ROUL-6205 sur arbre', 'ROUL-6205')).toBe(true);
    expect(matchesExactOrBoundaryToken('Remplacement ROUL-62050 sur arbre', 'ROUL-6205')).toBe(false);

    // ISO-8601 week key check
    expect(getCurrentIsoWeekKey(new Date('2026-01-01T12:00:00Z'))).toBe('S1');
    expect(getCurrentIsoWeekKey(new Date('2026-12-31T12:00:00Z'))).toBe('S52'); // clamped to 52-week planning grid
  });

  it('Phase B.3: buildLedgerEntriesFromBlueprint recognizes mounted serialized ENTREPOT items by _compTemplateId / _partDesignationId without creating duplicate ledger rows', () => {
    const machine = {
      id_machine_registered: 'CNC-01',
      id_blueprint: 'BP-CNC',
      compteur_actuel: 1850,
    };

    const blueprint = {
      id_blueprint: 'BP-CNC',
      components_theoriques: [
        { id_component: 'TPL-MOT-5KW', libelle: 'Moteur Broche 5kW', qte: 1 },
      ],
      parts_theoriques: [
        { id_part: 'DES-MANDRIN-3M', libelle: 'Mandrin 3 Mors', qte: 1 },
      ],
      pdr_theoriques: [
        { id_pdr: 'ROUL-6205', libelle: 'Roulement 6205', qte: 2 },
      ],
    };

    const unifiedMountedElements = buildUnifiedMachineNexusElements(
      'CNC-01',
      [],
      [
        {
          id_warehouse_item: 'MOT-SERIE-09',
          id_comp_template: 'TPL-MOT-5KW',
          designation: 'Moteur Broche 5kW #09',
          nature: 'COMPONENT',
          rattachement_type: 'MACHINE',
          id_machine_registered: 'CNC-01',
          status: 'En service',
        },
        {
          id_warehouse_item: 'PART-MANDRIN-09',
          id_part_designation: 'DES-MANDRIN-3M',
          designation: 'Mandrin 3 Mors #09',
          nature: 'PART',
          rattachement_type: 'MACHINE',
          id_machine_registered: 'CNC-01',
          status: 'MONTE',
        },
      ]
    );

    const res = buildLedgerEntriesFromBlueprint(machine, blueprint, unifiedMountedElements, []);
    // Both TPL-MOT-5KW and DES-MANDRIN-3M are already mounted via ENTREPOT -> skippedCount = 2, only ROUL-6205 added
    expect(res.skippedCount).toBe(2);
    expect(res.addedEntries.length).toBe(1);
    expect(res.addedEntries[0].ref_element).toBe('ROUL-6205');
    expect(res.addedEntries[0].compteur_installation).toBe(1850);
  });

  it('Phase B.5: aligns serverRbacPolicy and AuthorizationService for Nexus BOM access and write protection', async () => {
    const { canRoleMutateEntity, sanitizeBulkStateForRole } = await import(
      '../../core/security/serverRbacPolicy'
    );
    const { AuthorizationService } = await import('../../core/security/AuthorizationService');
    const { ROLES } = await import('../../core/security/Roles');

    // TECHNICIEN & OPERATEUR cannot directly mutate machineElementsLedger on server
    expect(canRoleMutateEntity('TECHNICIEN', 'machineElementsLedger', 'POST').allowed).toBe(false);
    expect(canRoleMutateEntity('OPERATEUR', 'machineElementsLedger', 'PUT').allowed).toBe(false);
    const bulkRes = sanitizeBulkStateForRole('TECHNICIEN', {
      machineElementsLedger: [{ id: 'HACK-BOM-1' }],
    });
    expect(bulkRes.strippedKeys).toContain('machineElementsLedger');
    expect(bulkRes.sanitizedState.machineElementsLedger).toBeUndefined();

    // ADMIN, RESPONSABLE_MAINTENANCE, RESPONSABLE_MAGASIN can mutate machineElementsLedger on server
    expect(canRoleMutateEntity('ADMIN', 'machineElementsLedger', 'POST').allowed).toBe(true);
    expect(canRoleMutateEntity('RESPONSABLE_MAINTENANCE', 'machineElementsLedger', 'POST').allowed).toBe(true);
    expect(canRoleMutateEntity('RESPONSABLE_MAGASIN', 'machineElementsLedger', 'POST').allowed).toBe(true);

    // Client tab access allows RESPONSABLE_MAGASIN, TECHNICIEN, and VIEWER to open 'nexus' in read-only/operational mode
    expect(AuthorizationService.canAccessTab(ROLES.RESPONSABLE_MAGASIN, 'nexus')).toBe(true);
    expect(AuthorizationService.canAccessTab(ROLES.TECHNICIEN, 'nexus')).toBe(true);
    expect(AuthorizationService.canAccessTab(ROLES.VIEWER, 'nexus')).toBe(true);
  });

  it('Phase C.1: duplicateBOMToTwins clones clean (resets wear/statut/date, uses target meter counter, translates ENTREPOT via templateId without duplicating serials or shadowing twin ENTREPOT)', async () => {
    const { useGmaoStore } = await import('../../store/useGmaoStore');
    const today = new Date().toISOString().split('T')[0];

    useGmaoStore.setState({
      machines: [
        {
          id_machine_registered: 'CNC-01',
          code_machine: 'CNC-01',
          id_templates: 'TPL-CNC-5X',
          compteur_actuel: 9200,
          technician: 'Tech-Source',
          asset_category: 'PRODUCTION',
          is_active: true,
        } as any,
        {
          id_machine_registered: 'CNC-02',
          code_machine: 'CNC-02',
          id_templates: 'TPL-CNC-5X',
          compteur_actuel: 1450,
          technician: 'Tech-Twin-2',
          asset_category: 'PRODUCTION',
          is_active: true,
        } as any,
        {
          id_machine_registered: 'CNC-03',
          code_machine: 'CNC-03',
          id_templates: 'TPL-CNC-5X',
          compteur_actuel: 0,
          technician: 'Tech-Twin-3',
          asset_category: 'PRODUCTION',
          is_active: true,
        } as any,
        {
          id_machine_registered: 'EQP-SYS-01',
          code_machine: 'EQP-SYS-01',
          asset_category: 'SYSTEM_GENERAL',
          is_active: true,
        } as any,
      ],
      machineElementsLedger: [
        {
          id: 'BOM-SRC-1',
          id_machine_registered: 'CNC-01',
          element_type: 'PDR',
          ref_element: 'ROUL-6205',
          designation: 'Roulement SKF 6205',
          qte_montee: 2,
          unite: 'pcs',
          criticalite: 'CRITIQUE',
          duree_vie_estimee_heures: 5000,
          heures_actuelles: 4950,
          compteur_installation: 4250,
          wear_source: 'METER',
          date_installation: '2024-03-10',
          technicien: 'Tech-Source',
          statut: 'A_REMPLACER',
        },
      ],
      warehouseItems: [
        // Source mounted ENTREPOT component with template ID
        {
          id_warehouse_item: 'MOT-SERIE-01',
          id_comp_template: 'TPL-MOT-5KW',
          designation: 'Moteur Broche 5kW',
          nature: 'COMPONENT',
          rattachement_type: 'MACHINE',
          id_machine_registered: 'CNC-01',
          status: 'En service',
          heures_actuelles: 7800,
        } as any,
        // Twin CNC-02 already has its OWN serialized motor of the same template -> must NOT be shadowed
        {
          id_warehouse_item: 'MOT-SERIE-02',
          id_comp_template: 'TPL-MOT-5KW',
          designation: 'Moteur Broche 5kW #02',
          nature: 'COMPONENT',
          rattachement_type: 'MACHINE',
          id_machine_registered: 'CNC-02',
          status: 'En service',
        } as any,
      ],
    });

    const addedCount = useGmaoStore
      .getState()
      .duplicateBOMToTwins('CNC-01', ['CNC-02', 'CNC-03', 'EQP-SYS-01']);

    // CNC-02 gets ROUL-6205 (1) because TPL-MOT-5KW is already mounted via MOT-SERIE-02
    // CNC-03 gets ROUL-6205 + TPL-MOT-5KW (2)
    // EQP-SYS-01 gets 0 (SYSTEM_GENERAL skipped)
    expect(addedCount).toBe(3);

    const ledger = useGmaoStore.getState().machineElementsLedger;
    const twin2Entries = ledger.filter((e) => e.id_machine_registered === 'CNC-02');
    const twin3Entries = ledger.filter((e) => e.id_machine_registered === 'CNC-03');
    const sysEntries = ledger.filter((e) => e.id_machine_registered === 'EQP-SYS-01');

    expect(sysEntries.length).toBe(0);
    expect(twin2Entries.length).toBe(1);
    expect(twin2Entries[0].ref_element).toBe('ROUL-6205');
    expect(twin2Entries[0].heures_actuelles).toBe(0);
    expect(twin2Entries[0].statut).toBe('OPERATIONNEL');
    expect(twin2Entries[0].date_installation).toBe(today);
    expect((twin2Entries[0] as any).compteur_installation).toBe(1450); // target meter, NOT 4250
    expect((twin2Entries[0] as any).wear_source).toBeUndefined();
    expect(twin2Entries[0].technicien).toBe('Tech-Twin-2');

    expect(twin3Entries.length).toBe(2);
    const twin3Roul = twin3Entries.find((e) => e.ref_element === 'ROUL-6205');
    const twin3Mot = twin3Entries.find((e) => e.ref_element === 'TPL-MOT-5KW');
    expect(twin3Roul).toBeDefined();
    expect((twin3Roul as any).compteur_installation).toBeUndefined(); // target meter is 0
    expect(twin3Mot).toBeDefined();
    expect(twin3Mot?.element_type).toBe('COMPONENT');
    expect(twin3Mot?.heures_actuelles).toBe(0);
    expect(twin3Mot?.statut).toBe('OPERATIONNEL');
    // Physical serial ID from CNC-01 must NEVER be cloned onto any twin
    expect(ledger.some((e) => e.ref_element === 'MOT-SERIE-01')).toBe(false);

    // Re-running duplicateBOMToTwins is idempotent and returns 0
    const secondRunCount = useGmaoStore
      .getState()
      .duplicateBOMToTwins('CNC-01', ['CNC-02', 'CNC-03']);
    expect(secondRunCount).toBe(0);
  });

  it('Phase C.3: FR, AR, and EN nexus i18n dictionaries have 100% key-path parity with non-empty values', async () => {
    const frNexus = (await import('../../i18n/locales/fr/nexus.json')).default;
    const arNexus = (await import('../../i18n/locales/ar/nexus.json')).default;
    const enNexus = (await import('../../i18n/locales/en/nexus.json')).default;

    const collectKeys = (obj: Record<string, any>, prefix = ''): string[] => {
      const keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          keys.push(...collectKeys(v, path));
        } else {
          expect(typeof v).toBe('string');
          expect(String(v).trim().length).toBeGreaterThan(0);
          keys.push(path);
        }
      }
      return keys.sort();
    };

    const frKeys = collectKeys(frNexus);
    const arKeys = collectKeys(arNexus);
    const enKeys = collectKeys(enNexus);

    expect(frKeys.length).toBeGreaterThan(100);
    expect(arKeys).toEqual(frKeys);
    expect(enKeys).toEqual(frKeys);
  });
});
