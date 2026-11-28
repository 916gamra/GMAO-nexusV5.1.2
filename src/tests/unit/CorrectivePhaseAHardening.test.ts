import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { CorrectiveCalculationService } from '../../domain/corrective/services/CorrectiveCalculationService';
import {
  AvailabilityCalculationService,
  countWorkingDaysBetween,
} from '../../domain/services/AvailabilityCalculationService';
import { validateLotoDeconsignation } from '../../domain/corrective/lotoService';
import { reconcileFieldClaim } from '../../core/security/validationReconciliation';
import { sanitizeExcelCell, sanitizeAoaRows, sanitizeJsonRecords } from '../../utils/safeExcelExport';
import { SecurityService } from '../../core/security/SecurityService';
import { useGmaoStore } from '../../store/useGmaoStore';
import type { CorrectiveInterventionItem } from '../../types/store';

function resetStoreState() {
  localStorage.clear();
  sessionStorage.clear();
  SecurityService.removeSecure('gmao_session_v2');
  useGmaoStore.setState({
    correctiveInterventions: [],
    auditEvents: [],
    sortieDemands: [],
    preventiveExecutions: [],
    mouvements: [],
    rawStock: [],
    workshopOrders: [],
    needRequests: [],
    activeLiveInterventionId: null,
  });
}

describe('Corrective Phase A — Real Shift Time Math & Recommendations', () => {
  it('excludes the 45-minute lunch break (13:15-14:00) on working days', () => {
    // Monday 2026-06-01: 12:00 -> 15:00 = (12:00..13:15 = 75m) + (14:00..15:00 = 60m) = 135m
    const res = CorrectiveCalculationService.calculateWorkingTime(
      '2026-06-01',
      '12:00',
      '2026-06-01',
      '15:00'
    );
    expect(res.minutes).toBe(135);
    expect(res.isOvertime).toBe(false);
    expect(res.formatted).toBe('2h 15m');
  });

  it('freezes overnight non-shift hours between working days', () => {
    // Mon 16:00 -> Tue 09:00 = (Mon 16:00..17:00 = 60m) + (Tue 08:00..09:00 = 60m) = 120m
    const res = CorrectiveCalculationService.calculateWorkingTime(
      '2026-06-01',
      '16:00',
      '2026-06-02',
      '09:00'
    );
    expect(res.minutes).toBe(120);
    expect(res.isOvertime).toBe(false);
  });

  it('excludes Sunday completely across a Saturday-to-Monday span', () => {
    // Sat 2026-06-06 16:00 -> Mon 2026-06-08 09:00 (Sun 2026-06-07 excluded) = 60m + 60m = 120m
    const res = CorrectiveCalculationService.calculateWorkingTime(
      '2026-06-06',
      '16:00',
      '2026-06-08',
      '09:00'
    );
    expect(res.minutes).toBe(120);
  });

  it('returns 0 (never a fabricated 60m fallback) for invalid or zero-length ranges', () => {
    expect(
      CorrectiveCalculationService.calculateWorkingTime('2026-06-01', '10:00', '2026-06-01', '10:00')
        .minutes
    ).toBe(0);
    expect(
      CorrectiveCalculationService.calculateWorkingTime('2026-06-02', '10:00', '2026-06-01', '09:00')
        .minutes
    ).toBe(0);
    expect(
      CorrectiveCalculationService.calculateWorkingTime('invalid', '10:00', '2026-06-01', '11:00')
        .minutes
    ).toBe(0);
  });

  it('records same-day emergency overtime outside shift hours with isOvertime=true', () => {
    // Night emergency 18:00 -> 19:30 = 90m
    const night = CorrectiveCalculationService.calculateWorkingTime(
      '2026-06-01',
      '18:00',
      '2026-06-01',
      '19:30'
    );
    expect(night.minutes).toBe(90);
    expect(night.isOvertime).toBe(true);

    // Sunday emergency 2026-06-07 09:00 -> 10:30 = 90m
    const sunday = CorrectiveCalculationService.calculateWorkingTime(
      '2026-06-07',
      '09:00',
      '2026-06-07',
      '10:30'
    );
    expect(sunday.minutes).toBe(90);
    expect(sunday.isOvertime).toBe(true);
  });

  it('restricts preventive recommendations to rolling 90-day window with type-specific actions', () => {
    const refDate = new Date('2026-06-15T12:00:00');
    const interventions = [
      // 3 old failures (> 90 days ago) on OLD-M1 -> must NOT trigger recommendation
      { code_machine: 'OLD-M1', anomalie: 'Fuite', type_panne: 'H', statut: 'CLOTURE', date_cloture: '2025-11-01' },
      { code_machine: 'OLD-M1', anomalie: 'Fuite', type_panne: 'H', statut: 'CLOTURE', date_cloture: '2025-11-10' },
      { code_machine: 'OLD-M1', anomalie: 'Fuite', type_panne: 'H', statut: 'CLOTURE', date_cloture: '2025-11-20' },
      // 3 recent electrical failures on NEW-E1 -> MUST trigger electrical recommendation
      { code_machine: 'NEW-E1', anomalie: 'Disjoncteur_declenche', type_panne: 'E', statut: 'CLOTURE', date_cloture: '2026-05-01' },
      { code_machine: 'NEW-E1', anomalie: 'Disjoncteur_declenche', type_panne: 'E', statut: 'CLOTURE', date_cloture: '2026-05-20' },
      { code_machine: 'NEW-E1', anomalie: 'Disjoncteur_declenche', type_panne: 'E', statut: 'CLOTURE', date_cloture: '2026-06-10' },
      // Cancelled records should be ignored
      { code_machine: 'CANCEL-M1', anomalie: 'Bruit', type_panne: 'M', statut: 'ANNULE', date_cloture: '2026-06-01' },
      { code_machine: 'CANCEL-M1', anomalie: 'Bruit', type_panne: 'M', statut: 'ANNULE', date_cloture: '2026-06-02' },
      { code_machine: 'CANCEL-M1', anomalie: 'Bruit', type_panne: 'M', statut: 'ANNULE', date_cloture: '2026-06-03' },
    ];

    const recs = CorrectiveCalculationService.detectPreventiveRecommendations(interventions, {
      windowDays: 90,
      minRecurrences: 3,
      referenceDate: refDate,
    });

    expect(recs).toHaveLength(1);
    expect(recs[0].code_machine).toBe('NEW-E1');
    expect(recs[0].recommendedAction).toContain('électrique');
    expect(recs[0].recommendedAction).toContain('Disjoncteur declenche');
  });
});

describe('Corrective Phase A — Honest Availability, Downtime Separation & Period Math', () => {
  it('never fabricates a 45-minute default when duration fields are missing', () => {
    expect(
      AvailabilityCalculationService.getInterventionDurationMinutes({
        code_machine: 'M1',
        statut: 'CLOTURE',
      })
    ).toBe(0);
    expect(
      AvailabilityCalculationService.getDowntimeMinutes({
        code_machine: 'M1',
        statut: 'CLOTURE',
      })
    ).toBe(0);
  });

  it('strictly separates repair time (TTR) from machine downtime (TTA) when arret_machine is false', () => {
    const runningRepair = {
      code_machine: 'M1',
      statut: 'CLOTURE',
      arret_machine: false,
      temps_intervention_mins: 120,
    };
    expect(AvailabilityCalculationService.getInterventionDurationMinutes(runningRepair)).toBe(120);
    expect(AvailabilityCalculationService.getDowntimeMinutes(runningRepair)).toBe(0);

    const stoppedRepair = {
      code_machine: 'M1',
      statut: 'CLOTURE',
      arret_machine: true,
      temps_intervention_mins: 120,
      temps_arret_minutes: 45,
    };
    expect(AvailabilityCalculationService.getInterventionDurationMinutes(stoppedRepair)).toBe(120);
    expect(AvailabilityCalculationService.getDowntimeMinutes(stoppedRepair)).toBe(45);
  });

  it('excludes ANNULE, REJECTED, and PENDING_VALIDATION records from Availability, MTTR, and MTBF', () => {
    const records = [
      { code_machine: 'M1', statut: 'CLOTURE', arret_machine: true, temps_intervention_mins: 60, temps_arret_minutes: 60 },
      { code_machine: 'M1', statut: 'ANNULE', arret_machine: true, temps_intervention_mins: 600, temps_arret_minutes: 600 },
      { code_machine: 'M1', statut: 'CLOTURE', validation_status: 'REJECTED', arret_machine: true, temps_intervention_mins: 600, temps_arret_minutes: 600 },
      { code_machine: 'M1', statut: 'EN_ATTENTE_VALIDATION', validation_status: 'PENDING_VALIDATION', arret_machine: true, temps_intervention_mins: 600, temps_arret_minutes: 600 },
    ];

    // 100h scheduled - 1h real downtime = 99% availability
    expect(AvailabilityCalculationService.calculateAvailability(records, 100)).toBe(99);
    expect(AvailabilityCalculationService.calculateMTTR(records)).toBe(1);
    // (100 - 1) / 1 = 99h MTBF
    expect(AvailabilityCalculationService.calculateMTBF(records, 100)).toBe(99);
  });

  it('computes Mon-Sat working days and scheduled period hours accurately', () => {
    // 2026-06-01 (Mon) to 2026-06-07 (Sun) = 6 working days
    expect(countWorkingDaysBetween('2026-06-01', '2026-06-07')).toBe(6);

    const period = AvailabilityCalculationService.calculateScheduledHoursForPeriod(
      2,
      { preset: 'CUSTOM_RANGE', startDate: '2026-06-01', endDate: '2026-06-07' },
      []
    );
    expect(period.workingDays).toBe(6);
    // 2 machines * 6 working days * 8.25h = 99h
    expect(period.scheduledHours).toBe(99);
  });
});

describe('Corrective Phase A — Store Integrity, Stock Guard, RBAC & Audit Trail', () => {
  beforeEach(() => {
    resetStoreState();
  });

  afterEach(() => {
    resetStoreState();
  });

  it('normalizes type_panne and priorite across mobile and desktop inputs', () => {
    const store = useGmaoStore.getState();
    const di = store.handleAddDemandeIntervention({
      code_machine: 'M-100',
      machine: 'Press 100T',
      anomalie: 'Surchauffe variateur',
      type_panne: 'Électrique',
      priorite: 'Critique (Arrêt)',
    } as any);

    expect(di.type_panne).toBe('E');
    expect(di.priorite).toBe('HAUTE');
    expect(di.statut).toBe('DEMANDE');
  });

  it('generates monotonic BT numbers (maxSeq + 1) even after deleting an intermediate BT', () => {
    const year = new Date().getFullYear();
    useGmaoStore.setState({
      correctiveInterventions: [
        { id: '1', num_bt: `BT-${year}-001`, statut: 'CLOTURE' } as CorrectiveInterventionItem,
        { id: '3', num_bt: `BT-${year}-005`, statut: 'EN_COURS' } as CorrectiveInterventionItem,
      ],
    });

    const store = useGmaoStore.getState();
    const di = store.handleAddDemandeIntervention({
      code_machine: 'M-200',
      anomalie: 'Courroie cassée',
      type_panne: 'Mécanique',
    } as any);

    const converted = useGmaoStore.getState().handleConvertToBt(di.id, {
      intervenant: 'Ali',
      requires_loto: true,
    });

    expect(converted).not.toBeNull();
    expect(converted?.num_bt).toBe(`BT-${year}-006`);
    expect(converted?.statut).toBe('BT_PLANIFIE');
    expect(converted?.requires_loto).toBe(true);
    expect(converted?.loto_status).toBe('ATTENTE_CONSIGNATION');
  });

  it('blocks negative stock on direct closure AND supervisor approval', () => {
    useGmaoStore.setState({
      rawStock: [
        {
          id: 'PDR-1',
          ref: 'RLT-6205',
          reference: 'RLT-6205',
          designation: 'Roulement 6205',
          stockInitial: 2,
          stockMin: 1,
          prix_unitaire: 40,
        } as any,
      ],
      mouvements: [],
      correctiveInterventions: [
        {
          id: 'BT-DIRECT',
          num_bt: 'BT-2026-010',
          code_machine: 'M-10',
          statut: 'EN_COURS',
          arret_machine: true,
        } as CorrectiveInterventionItem,
        {
          id: 'BT-PENDING',
          num_bt: 'BT-2026-011',
          code_machine: 'M-10',
          statut: 'EN_ATTENTE_VALIDATION',
          validation_status: 'PENDING_VALIDATION',
          pieces_proposees: [{ ref: 'RLT-6205', designation: 'Roulement 6205', quantite: 5 }],
          pdr_utilisees: [{ ref: 'RLT-6205', designation: 'Roulement 6205', quantite: 5 }],
        } as CorrectiveInterventionItem,
      ],
    });

    // Direct closure requesting 5 when only 2 available -> blocked
    const directRes = useGmaoStore.getState().handleClotureIntervention('BT-DIRECT', {
      date_debut: '2026-06-01',
      heure_debut: '08:00',
      date_fin: '2026-06-01',
      heure_fin: '10:00',
      action_realisee: 'Remplacement roulement',
      arret_machine: true,
      pdr_utilisees: [{ ref: 'RLT-6205', designation: 'Roulement 6205', quantite: 5 }],
    });
    expect(directRes).toBeNull();
    expect(useGmaoStore.getState().mouvements).toHaveLength(0);
    expect(
      useGmaoStore.getState().correctiveInterventions.find((i) => i.id === 'BT-DIRECT')?.statut
    ).toBe('EN_COURS');

    // Supervisor approval requesting 5 when only 2 available -> blocked
    const reviewRes = useGmaoStore.getState().handleReviewInterventionValidation('BT-PENDING', {
      decision: 'APPROVED',
      reviewerName: 'Superviseur',
    });
    expect(reviewRes).toBeNull();
    expect(useGmaoStore.getState().mouvements).toHaveLength(0);
  });

  it('honors skipStockDeduction during supervisor approval to avoid double deduction', () => {
    useGmaoStore.setState({
      rawStock: [
        {
          id: 'PDR-1',
          reference: 'RLT-6205',
          designation: 'Roulement 6205',
          stockInitial: 10,
          stockMin: 1,
          prix_unitaire: 40,
        } as any,
      ],
      mouvements: [],
      correctiveInterventions: [
        {
          id: 'BT-SKIP',
          num_bt: 'BT-2026-012',
          code_machine: 'M-10',
          statut: 'EN_ATTENTE_VALIDATION',
          validation_status: 'PENDING_VALIDATION',
          date_debut: '2026-06-01',
          heure_debut: '08:00',
          date_fin: '2026-06-01',
          heure_fin: '10:00',
          pdr_utilisees: [{ ref: 'RLT-6205', designation: 'Roulement 6205', quantite: 3 }],
        } as CorrectiveInterventionItem,
      ],
    });

    const approved = useGmaoStore.getState().handleReviewInterventionValidation('BT-SKIP', {
      decision: 'APPROVED',
      reviewerName: 'Superviseur',
      skipStockDeduction: true,
    });

    expect(approved).not.toBeNull();
    expect(approved?.statut).toBe('CLOTURE');
    expect(useGmaoStore.getState().mouvements).toHaveLength(0);
  });

  it('writes an immutable audit event on direct closure and separates repair vs downtime minutes', () => {
    useGmaoStore.setState({
      correctiveInterventions: [
        {
          id: 'BT-CLOSE',
          num_bt: 'BT-2026-020',
          code_machine: 'M-20',
          statut: 'EN_COURS',
        } as CorrectiveInterventionItem,
      ],
    });

    const closed = useGmaoStore.getState().handleClotureIntervention('BT-CLOSE', {
      date_debut: '2026-06-01',
      heure_debut: '12:00',
      date_fin: '2026-06-01',
      heure_fin: '15:00',
      action_realisee: 'Alignement courroie et test à vide',
      arret_machine: true,
      temps_arret: '00:45',
      pdr_utilisees: [],
    });

    expect(closed).not.toBeNull();
    expect(closed?.statut).toBe('CLOTURE');
    expect(closed?.temps_intervention_mins).toBe(135); // lunch excluded
    expect(closed?.temps_arret_minutes).toBe(45); // explicit stoppage kept separate
    expect(
      useGmaoStore
        .getState()
        .auditEvents.some(
          (e) => e.actionType === 'CORRECTIVE_BT_CLOSED' && e.entityId === 'BT-CLOSE'
        )
    ).toBe(true);
  });

  it('blocks direct CLOTURE bypass in handleUpdateCorrectiveIntervention and enforces fail-closed RBAC on delete', () => {
    useGmaoStore.setState({
      correctiveInterventions: [
        {
          id: 'BT-GUARD',
          num_bt: 'BT-2026-030',
          code_machine: 'M-30',
          statut: 'EN_COURS',
        } as CorrectiveInterventionItem,
      ],
    });

    // Attempting to bypass handleClotureIntervention via raw update must be rejected
    const bypassResult = useGmaoStore
      .getState()
      .handleUpdateCorrectiveIntervention('BT-GUARD', { statut: 'CLOTURE' });
    expect(bypassResult).toBe(false);
    expect(
      useGmaoStore.getState().correctiveInterventions.find((i) => i.id === 'BT-GUARD')?.statut
    ).toBe('EN_COURS');

    // Technician session MUST be blocked from deleting a BT (fail-closed)
    SecurityService.saveSessionSecure('gmao_session_v2', {
      userId: 'TECH-01',
      nom: 'Karim',
      role: 'TECHNICIEN',
    });
    const techDelete = useGmaoStore.getState().handleDeleteCorrectiveIntervention('BT-GUARD');
    expect(techDelete).toBe(false);
    expect(useGmaoStore.getState().correctiveInterventions).toHaveLength(1);

    // Admin session CAN delete and writes CORRECTIVE_BT_DELETED audit event
    SecurityService.saveSessionSecure('gmao_session_v2', {
      userId: 'ADM-01',
      nom: 'Directeur',
      role: 'ADMIN',
    });
    const adminDelete = useGmaoStore.getState().handleDeleteCorrectiveIntervention('BT-GUARD');
    expect(adminDelete).toBe(true);
    expect(useGmaoStore.getState().correctiveInterventions).toHaveLength(0);
    expect(
      useGmaoStore
        .getState()
        .auditEvents.some(
          (e) => e.actionType === 'CORRECTIVE_BT_DELETED' && e.entityId === 'BT-GUARD'
        )
    ).toBe(true);
  });
});

describe('Corrective Phase A — LOTO Personal Lock-Holder & Store Reconciliation', () => {
  beforeEach(() => {
    resetStoreState();
  });

  afterEach(() => {
    resetStoreState();
  });

  it('blocks a different TECHNICIEN from removing another worker LOTO padlock while allowing audited SUPERVISOR break-lock override', () => {
    const activePermit = {
      required: true,
      status: 'CONSIGNE' as const,
      consignateur_id: 'TECH-A',
      consignateur_name: 'Ahmed',
      energy_types: ['ELECTRIQUE' as const],
      vat_verified: true,
      num_cadenas: 'CAD-04',
    };

    // Different technician blocked
    const blocked = validateLotoDeconsignation(activePermit, {
      deconsignateur_id: 'TECH-B',
      deconsignateur_name: 'Omar',
      actorRole: 'TECHNICIEN',
      zone_cleared: true,
    });
    expect(blocked.valid).toBe(false);
    expect(blocked.reason).toContain('Ahmed');

    // Supervisor allowed with audited break-lock override
    const override = validateLotoDeconsignation(activePermit, {
      deconsignateur_id: 'SUP-01',
      deconsignateur_name: 'Chef Atelier',
      actorRole: 'SUPERVISEUR',
      zone_cleared: true,
      supervisor_override_reason: 'Technicien absent - fin de poste',
    });
    expect(override.valid).toBe(true);
    expect(override.permit?.override_break_lock).toBe(true);
    expect(override.permit?.override_reason).toBe('Technicien absent - fin de poste');

    // Verify store writes LOTO_BREAK_LOCK_OVERRIDE audit event
    useGmaoStore.setState({
      correctiveInterventions: [
        {
          id: 'BT-LOTO',
          num_bt: 'BT-2026-040',
          code_machine: 'M-40',
          statut: 'EN_COURS',
          requires_loto: true,
          loto_status: 'CONSIGNE',
          loto: activePermit,
        } as CorrectiveInterventionItem,
      ],
    });

    const storeRes = useGmaoStore.getState().handleDeconsignInterventionLoto('BT-LOTO', {
      deconsignateur_id: 'SUP-01',
      deconsignateur_name: 'Chef Atelier',
      actorRole: 'SUPERVISEUR',
      zone_cleared: true,
      supervisor_override_reason: 'Urgence redémarrage ligne',
    });

    expect(storeRes.valid).toBe(true);
    expect(
      useGmaoStore
        .getState()
        .auditEvents.some(
          (e) => e.actionType === 'LOTO_BREAK_LOCK_OVERRIDE' && e.entityId === 'BT-LOTO'
        )
    ).toBe(true);
  });

  it('detects CANDIDATE_STORE_BON_MATCH for CORRECTIVE claims with mismatched or blank numBonSaisi', () => {
    const todayIso = new Date().toISOString();
    const stockItems = [{ ref: 'RLT-6205', reference: 'RLT-6205', designation: 'Roulement 6205', stockActuel: 10 }];
    const mouvements = [
      {
        id: 'MOV-1',
        type: 'SORTIE',
        ref: 'RLT-6205',
        quantite: 2,
        machine: 'M-50',
        code_bon: 'BS-900',
        date: todayIso,
      },
    ];

    // Blank bon number on corrective claim
    const blankRes = reconcileFieldClaim({
      claimType: 'CORRECTIVE',
      claimId: 'BT-50',
      numBonSaisi: '',
      machineCode: 'M-50',
      proposedSpares: [{ ref: 'RLT-6205', designation: 'Roulement 6205', quantite: 2 }],
      stockItems,
      mouvements,
    });
    expect(blankRes.alerts.some((a) => a.code === 'CANDIDATE_STORE_BON_MATCH')).toBe(true);
    expect(blankRes.candidateStoreMovements).toHaveLength(1);

    // Mismatched bon number on corrective claim
    const mismatchRes = reconcileFieldClaim({
      claimType: 'CORRECTIVE',
      claimId: 'BT-51',
      numBonSaisi: 'BS-WRONG',
      machineCode: 'M-50',
      proposedSpares: [{ ref: 'RLT-6205', designation: 'Roulement 6205', quantite: 2 }],
      stockItems,
      mouvements,
    });
    expect(mismatchRes.alerts.some((a) => a.code === 'CANDIDATE_STORE_BON_MATCH')).toBe(true);
  });
});

describe('Corrective Phase A — Excel Formula Injection Defense (Type B Export)', () => {
  it('neutralizes all OWASP formula trigger prefixes while preserving numbers, booleans, and clean text', () => {
    expect(sanitizeExcelCell('=CMD|"/C calc"!A0')).toBe("'=CMD|\"/C calc\"!A0");
    expect(sanitizeExcelCell('+1+1')).toBe("'+1+1");
    expect(sanitizeExcelCell('-2+3')).toBe("'-2+3");
    expect(sanitizeExcelCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(sanitizeExcelCell('\t=1+1')).toBe("'\t=1+1");
    expect(sanitizeExcelCell('\r=1+1')).toBe("'\r=1+1");

    // Clean values untouched
    expect(sanitizeExcelCell(42)).toBe(42);
    expect(sanitizeExcelCell(true)).toBe(true);
    expect(sanitizeExcelCell('BT-2026-001')).toBe('BT-2026-001');
    expect(sanitizeExcelCell(null)).toBe('');

    const sanitizedAoa = sanitizeAoaRows([['=HYPERLINK("http://evil")', 100]]);
    expect(sanitizedAoa[0][0]).toBe('\'=HYPERLINK("http://evil")');
    expect(sanitizedAoa[0][1]).toBe(100);

    const sanitizedJson = sanitizeJsonRecords([{ anomalie: '+DDE', duree: 30 }]);
    expect(sanitizedJson[0].anomalie).toBe("'+DDE");
    expect(sanitizedJson[0].duree).toBe(30);
  });
});

describe('Corrective Phase 1 Audit Hardening — C1 Double Stock Deduction Defense, C2 Store RBAC & Referential Integrity, M3 Solo Expert Audit', () => {
  beforeEach(() => {
    resetStoreState();
    useGmaoStore.setState({
      machines: [
        { id_machine: 'M-ACTIVE', code_machine: 'M-ACTIVE', nom: 'CNC Active', status: 'OPERATIONNELLE' } as any,
        { id_machine: 'M-ARCH', code_machine: 'M-ARCH', nom: 'Old Press', status: 'ARCHIVEE' } as any,
      ],
    });
  });

  afterEach(() => {
    resetStoreState();
  });

  it('C1: prevents double stock deduction (2x) even if onAddMouvement re-inserts the same movement into setMouvements', () => {
    useGmaoStore.setState({
      rawStock: [
        {
          id: 'PDR-100',
          ref: 'PDR-100',
          reference: 'PDR-100',
          designation: 'Contacteur 24V',
          stockInitial: 10,
          stockMin: 2,
          prix_unitaire: 55,
        } as any,
      ],
      mouvements: [],
      correctiveInterventions: [
        {
          id: 'BT-C1',
          num_bt: 'BT-2026-100',
          code_machine: 'M-ACTIVE',
          statut: 'EN_COURS',
        } as CorrectiveInterventionItem,
      ],
    });

    const closed = useGmaoStore.getState().handleClotureIntervention(
      'BT-C1',
      {
        date_debut: '2026-06-01',
        heure_debut: '08:00',
        date_fin: '2026-06-01',
        heure_fin: '09:30',
        action_realisee: 'Remplacement contacteur',
        arret_machine: true,
        pdr_utilisees: [{ ref: 'PDR-100', designation: 'Contacteur 24V', quantite: 2 }],
      },
      // Simulate a legacy callback that re-pushes the movement into setMouvements
      (mv) => {
        useGmaoStore.getState().setMouvements((prev) => [mv, ...prev]);
      }
    );

    expect(closed).not.toBeNull();
    expect(closed?.statut).toBe('CLOTURE');
    // Must strictly record ONLY 1 movement (quantity = 2, NOT 2 movements totaling 4)
    const mvts = useGmaoStore.getState().mouvements;
    expect(mvts).toHaveLength(1);
    expect(Number(mvts[0].quantite)).toBe(2);
    const totalDeducted = mvts.reduce((acc, m) => acc + Number(m.quantite || 0), 0);
    expect(totalDeducted).toBe(2);
  });

  it('C2: blocks VIEWER and RESPONSABLE_MAGASIN from corrective mutations and blocks OPERATEUR from workshop/need creation', () => {
    useGmaoStore.setState({
      correctiveInterventions: [
        {
          id: 'DI-1',
          num_bt: 'DI-2026-001',
          code_machine: 'M-ACTIVE',
          statut: 'DEMANDE',
        } as CorrectiveInterventionItem,
        {
          id: 'BT-1',
          num_bt: 'BT-2026-001',
          code_machine: 'M-ACTIVE',
          statut: 'EN_COURS',
        } as CorrectiveInterventionItem,
      ],
    });

    // 1. VIEWER blocked across DI creation, BT conversion, live start, and closure
    SecurityService.saveSessionSecure('gmao_session_v2', {
      userId: 'VW-01',
      nom: 'Auditeur',
      role: 'VIEWER',
    });
    const viewerDi = useGmaoStore.getState().handleAddDemandeIntervention({
      code_machine: 'M-ACTIVE',
      anomalie: 'Test viewer',
    } as any);
    expect(viewerDi).toBeNull();
    expect(useGmaoStore.getState().handleConvertToBt('DI-1', { intervenant: 'Ali' })).toBeNull();
    expect(useGmaoStore.getState().handleStartLiveIntervention('BT-1', 'Ali')).toBeFalsy();
    expect(
      useGmaoStore.getState().handleClotureIntervention('BT-1', {
        action_realisee: 'Tentative viewer',
      })
    ).toBeNull();

    // 2. RESPONSABLE_MAGASIN blocked from closing or deleting BTs or converting DI -> BT
    SecurityService.saveSessionSecure('gmao_session_v2', {
      userId: 'MAG-01',
      nom: 'Magasinier Chef',
      role: 'RESPONSABLE_MAGASIN',
    });
    expect(useGmaoStore.getState().handleConvertToBt('DI-1', { intervenant: 'Ali' })).toBeNull();
    expect(
      useGmaoStore.getState().handleClotureIntervention('BT-1', {
        action_realisee: 'Tentative magasinier',
      })
    ).toBeNull();
    expect(useGmaoStore.getState().handleDeleteCorrectiveIntervention('BT-1')).toBe(false);

    // 3. OPERATEUR can create a DI, but cannot create Workshop Orders or Need Requests
    SecurityService.saveSessionSecure('gmao_session_v2', {
      userId: 'OP-01',
      nom: 'Opérateur Ligne',
      role: 'OPERATEUR',
    });
    const opDi = useGmaoStore.getState().handleAddDemandeIntervention({
      code_machine: 'M-ACTIVE',
      anomalie: 'Bruit suspect',
    } as any);
    expect(opDi).not.toBeNull();
    expect(opDi?.id).toBeTruthy();
    expect(
      useGmaoStore.getState().handleCreateWorkshopOrder({
        id_bt: 'BT-1',
        code_machine: 'M-ACTIVE',
        organe_nom: 'Broche',
        nature_travail: 'USINAGE',
        description_travail: 'Rectification',
      } as any)
    ).toBeNull();
    expect(
      useGmaoStore.getState().handleCreateNeedRequest({
        id_bt: 'BT-1',
        code_machine: 'M-ACTIVE',
        designation: 'Joint torique',
        classe_materiel: 'PDR',
        canal_cible: 'STOCK',
        quantite: 1,
      } as any)
    ).toBeNull();
  });

  it('C2: rejects archived machines on DI creation and BT conversion, and protects BTs with active workshop orders or open need requests from deletion', () => {
    SecurityService.saveSessionSecure('gmao_session_v2', {
      userId: 'ADM-01',
      nom: 'Admin',
      role: 'ADMIN',
    });

    // Reject DI on archived machine
    const archivedDi = useGmaoStore.getState().handleAddDemandeIntervention({
      code_machine: 'M-ARCH',
      anomalie: 'Panne sur machine archivée',
    } as any);
    expect(archivedDi).toBeNull();

    // Valid DI on active machine emits CORRECTIVE_DI_CREATED audit event
    const validDi = useGmaoStore.getState().handleAddDemandeIntervention({
      code_machine: 'M-ACTIVE',
      anomalie: 'Défaut capteur',
    } as any);
    expect(validDi).not.toBeNull();
    expect(
      useGmaoStore.getState().auditEvents.some(
        (e) => e.actionType === 'CORRECTIVE_DI_CREATED' && e.entityId === validDi.id
      )
    ).toBe(true);

    // Valid conversion emits CORRECTIVE_DI_CONVERTED_TO_BT audit event
    const bt = useGmaoStore.getState().handleConvertToBt(validDi.id, { intervenant: 'Karim' });
    expect(bt).not.toBeNull();
    expect(
      useGmaoStore.getState().auditEvents.some(
        (e) => e.actionType === 'CORRECTIVE_DI_CONVERTED_TO_BT' && e.entityId === validDi.id
      )
    ).toBe(true);

    // Attach active workshop order -> deletion MUST be blocked
    useGmaoStore.setState({
      workshopOrders: [
        {
          id: 'OT-ATEL-1',
          code_bon: 'BR-2026-001',
          id_bt: validDi.id,
          statut: 'EN_COURS_FABRICATION',
        } as any,
      ],
    });
    expect(useGmaoStore.getState().handleDeleteCorrectiveIntervention(validDi.id)).toBe(false);

    // Once workshop order is terminal (RECEPTIONNE_MONTAGE), deletion succeeds and detaches id_bt cleanly
    useGmaoStore.setState({
      workshopOrders: [
        {
          id: 'OT-ATEL-1',
          code_bon: 'BR-2026-001',
          id_bt: validDi.id,
          statut: 'RECEPTIONNE_MONTAGE',
        } as any,
      ],
    });
    expect(useGmaoStore.getState().handleDeleteCorrectiveIntervention(validDi.id)).toBe(true);
    expect(useGmaoStore.getState().workshopOrders[0].id_bt).toBeNull();
  });

  it('M3: tags CORRECTIVE_BT_CLOSED audit event with executionMode=SOLO_DIRECT when SOLO_EXPERT profile is active', () => {
    localStorage.setItem(
      'gmao_workspace_profile_v1',
      JSON.stringify({ preset: 'SOLO_EXPERT', governanceMode: 'SOLO_DIRECT' })
    );
    SecurityService.saveSessionSecure('gmao_session_v2', {
      userId: 'ADM-SOLO',
      nom: 'Ingénieur Maintenance Solo',
      role: 'ADMIN',
    });

    useGmaoStore.setState({
      correctiveInterventions: [
        {
          id: 'BT-SOLO',
          num_bt: 'BT-2026-777',
          code_machine: 'M-ACTIVE',
          statut: 'EN_COURS',
        } as CorrectiveInterventionItem,
      ],
    });

    const closed = useGmaoStore.getState().handleClotureIntervention('BT-SOLO', {
      date_debut: '2026-06-01',
      heure_debut: '08:00',
      date_fin: '2026-06-01',
      heure_fin: '09:00',
      action_realisee: 'Réglage capteur solo expert',
      pdr_utilisees: [],
    });

    expect(closed).not.toBeNull();
    expect(closed?.statut).toBe('CLOTURE');
    const auditEvent = useGmaoStore
      .getState()
      .auditEvents.find((e) => e.actionType === 'CORRECTIVE_BT_CLOSED' && e.entityId === 'BT-SOLO');
    expect(auditEvent).toBeDefined();
    expect((auditEvent?.after as any)?.executionMode).toBe('SOLO_DIRECT');
  });
});

