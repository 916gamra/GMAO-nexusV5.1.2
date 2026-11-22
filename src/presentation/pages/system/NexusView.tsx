import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import AnimatedPage from '../../components/common/AnimatedPage';
import {
  GitBranch, Wrench, Boxes, Plus, Trash2, Edit2, Copy, AlertTriangle, CheckCircle2,
  Search, FileSpreadsheet, Zap, MapPin, Cpu, ShieldAlert, Sparkles, Package,
  RefreshCw, History, ExternalLink, Layers, UserCheck, Upload, Download, CalendarPlus, GitCompare,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { confirmAction } from '../../../utils/confirmAction';
import { filterActiveMachines, filterProductionMachines, isSystemGeneralMachine } from '../../../utils/activeMachines';
import {
  buildConsumablePdrInventory,
  buildUnifiedMachineNexusElements,
  buildLedgerEntriesFromBlueprint,
  matchesExactOrBoundaryToken,
} from '../../../core/domain';
import { useAuth } from '../../../context/AuthContext';
import { useTranslation } from '../../../i18n/I18nContext';
import { AuthorizationService } from '../../../core/security/AuthorizationService';
import { isTechnicianRole } from '../../../core/security/technicianScope';
import { NexusModals, downloadNexusTemplateExcel, exportNexusBomExcel } from './components/NexusModals';
import { DataGateway } from '../../../application/DataGateway';
import { storageService } from '../../../utils/storageService';
import { STORAGE_KEYS } from '../../../infrastructure/persistence/storageKeys';
import type {
  IBlueprint, ICompTemplate, IMachine, IMachineFamily, IMachineTemplate,
  IMouvement, IPartDesignation, IPartType, IStockItem, ITechnician, IWarehouseItem, IZone,
} from '../../../types/domain';
import type { IMeterReading } from '../../../types/meter';
import type {
  CorrectiveInterventionItem,
  MachineElement,
  PreventiveTaskItem,
} from '../../../types/store';

/**
 * Phase B.1 — Meter-Driven & Dynamic Calendar RUL Calculation:
 * 1. Uses machine operating counter delta (`compteur_actuel - compteur_installation` or `meterReadings` delta since `date_installation`) when available.
 * 2. Falls back to dynamic calendar estimation (`elapsedDays * (heures_fonctionnement_jour || 6.3)`), never freezing when `heures_actuelles` is persisted by `handleSyncWearHours`.
 */
export function calculateElementWearHours(
  item: Partial<MachineElement> | null | undefined,
  activeMachine?: Partial<IMachine> | null,
  meterReadings: IMeterReading[] = [],
  nowMs: number = Date.now()
): { hours: number; isEstimated: boolean; source: 'METER' | 'CALENDAR' | 'MANUAL' } {
  if (!item) return { hours: 0, isEstimated: false, source: 'MANUAL' };
  const explicitHours = Math.max(0, Number(item.heures_actuelles || 0));

  const machIdNorm = String(
    activeMachine?.id_machine_registered ||
      (activeMachine as any)?.code_machine ||
      item.id_machine_registered ||
      ''
  )
    .trim()
    .toUpperCase();

  const machineReadings =
    machIdNorm && Array.isArray(meterReadings)
      ? meterReadings
          .filter(
            (r) =>
              r &&
              String(r.machineId || (r as any).id_machine_registered || (r as any).code_machine || '')
                .trim()
                .toUpperCase() === machIdNorm &&
              Number.isFinite(Number(r.valeur))
          )
          .sort((a, b) =>
            String(a.date_releve || '').localeCompare(String(b.date_releve || ''))
          )
      : [];

  const latestReadingVal =
    machineReadings.length > 0
      ? Math.max(...machineReadings.map((r) => Number(r.valeur) || 0))
      : 0;

  const machineCurrentCounter = Math.max(
    Number((activeMachine as any)?.compteur_actuel ?? (activeMachine as any)?.compteur ?? 0) || 0,
    latestReadingVal
  );

  // 1. Meter-Driven Delta (explicit compteur_installation or meterReadings baseline at date_installation)
  if (machineCurrentCounter > 0) {
    const rawInstallCounter = (item as any).compteur_installation;
    if (
      rawInstallCounter !== undefined &&
      rawInstallCounter !== null &&
      rawInstallCounter !== '' &&
      Number.isFinite(Number(rawInstallCounter))
    ) {
      const baseCounter = Number(rawInstallCounter);
      if (machineCurrentCounter >= baseCounter) {
        const meterDelta = Math.round(machineCurrentCounter - baseCounter);
        return {
          hours: Math.max(explicitHours, meterDelta),
          isEstimated: false,
          source: 'METER',
        };
      }
    } else if (item.date_installation && machineReadings.length > 0) {
      const installDateIso = String(item.date_installation).slice(0, 10);
      const readingsOnOrBefore = machineReadings.filter(
        (r) => String(r.date_releve || '').slice(0, 10) <= installDateIso
      );
      const baselineReading =
        readingsOnOrBefore.length > 0
          ? readingsOnOrBefore[readingsOnOrBefore.length - 1]
          : machineReadings[0];
      const baseVal = Number(baselineReading?.valeur ?? 0);
      if (Number.isFinite(baseVal) && machineCurrentCounter > baseVal) {
        const meterDelta = Math.round(machineCurrentCounter - baseVal);
        return {
          hours: Math.max(explicitHours, meterDelta),
          isEstimated: false,
          source: 'METER',
        };
      }
    }
  }

  // 2. Calendar-Driven Dynamic Estimation (never frozen after handleSyncWearHours)
  const dailyRate =
    Number(
      (activeMachine as any)?.heures_fonctionnement_jour ??
        (activeMachine as any)?.cadence_journaliere ??
        6.3
    ) || 6.3;

  let calendarHours = 0;
  if (item.date_installation) {
    const installedMs = new Date(item.date_installation).getTime();
    if (!Number.isNaN(installedMs)) {
      const elapsedDays = Math.max(0, Math.floor((nowMs - installedMs) / (1000 * 60 * 60 * 24)));
      calendarHours = Math.round(elapsedDays * dailyRate);
    }
  }

  if (calendarHours > explicitHours) {
    return { hours: calendarHours, isEstimated: true, source: 'CALENDAR' };
  }

  if (explicitHours > 0) {
    const isCal = (item as any).wear_source === 'CALENDAR' || (calendarHours > 0 && calendarHours === explicitHours);
    return {
      hours: explicitHours,
      isEstimated: isCal,
      source: isCal ? 'CALENDAR' : 'MANUAL',
    };
  }

  return { hours: 0, isEstimated: false, source: 'MANUAL' };
}

export interface NexusViewProps {
  machines?: IMachine[];
  zones?: IZone[];
  families?: IMachineFamily[];
  _templates?: IMachineTemplate[];
  blueprints?: IBlueprint[];
  technicians?: ITechnician[];
  stockItems?: IStockItem[];
  warehouseItems?: IWarehouseItem[];
  partTypes?: IPartType[];
  partDesignations?: IPartDesignation[];
  compTemplates?: ICompTemplate[];
  mouvements?: IMouvement[];
  machineElementsLedger?: MachineElement[];
  preventiveTasks?: PreventiveTaskItem[];
  correctiveInterventions?: CorrectiveInterventionItem[];
  meterReadings?: IMeterReading[];
  onAddMachineElement?: (el: Partial<MachineElement>) => void;
  onUpdateMachineElement?: (id: string, el: Partial<MachineElement>) => void;
  onUpsertMachineElementsBatch?: (
    elements: Partial<MachineElement>[],
    options?: { sourceLabel?: string }
  ) => { addedCount: number; updatedCount: number; skippedSystemCount: number };
  onUpdateMachineElementsBatch?: (
    updatesList: Array<{ id: string; updates: Partial<MachineElement> }>,
    options?: { sourceLabel?: string }
  ) => { updatedCount: number };
  onDeleteMachineElement?: (id: string) => void;
  onDuplicateBOMToTwins?: (sourceMachineId: string, targetMachineIds: string[]) => number | void;
  onUpdateWarehouseItem?: (idOrCode: string | number, updatedItem: IWarehouseItem) => void;
  onNavigateToQuickSortie?: (preset?: Record<string, unknown>) => void;
  setQuickSortiePreset?: (preset: Record<string, unknown> | null) => void;
  onCreateCorrectiveFromNexus?: (machine: any, item?: any) => any;
  onCreatePreventiveFromNexus?: (machine: any, item?: any) => any;
  onNavigateToMachine?: (machId: string) => void;
  onNavigateToPreventiveForMachine?: (machId: string) => void;
  onNavigateToCorrectiveForMachine?: (machId: string) => void;
  onNavigate?: (tab: string) => void;
  showToast?: (message: string, type?: string) => void;
}

/**
 * NexusView — Registre Central des Éléments & BOM Machines (As-Built SSOT)
 * Architecture Single Source of Truth (SSOT) pour la nomenclature réelle des machines de production.
 */
export default function NexusView({
  machines = [],
  zones = [],
  families = [],
  _templates = [],
  blueprints = [],
  technicians = [],
  stockItems = [],
  warehouseItems = [],
  partTypes = [],
  partDesignations = [],
  compTemplates = [],
  mouvements = [],
  machineElementsLedger = [],
  preventiveTasks = [],
  correctiveInterventions = [],
  meterReadings = [],
  onAddMachineElement,
  onUpdateMachineElement,
  onUpsertMachineElementsBatch,
  onUpdateMachineElementsBatch,
  onDeleteMachineElement,
  onDuplicateBOMToTwins,
  onUpdateWarehouseItem,
  onNavigateToQuickSortie,
  setQuickSortiePreset,
  onCreateCorrectiveFromNexus,
  onCreatePreventiveFromNexus,
  onNavigateToMachine,
  onNavigateToPreventiveForMachine,
  onNavigateToCorrectiveForMachine,
  onNavigate = () => {},
  showToast,
}: NexusViewProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isTechUser = isTechnicianRole(user);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // NEX-1: Explicit RBAC permission guards (Boolean(user) && hasPermission)
  const canManageNexus =
    Boolean(user) &&
    !isTechUser &&
    AuthorizationService.hasPermission(user, 'machine.edit');

  const canReplaceViaSortie =
    Boolean(user) &&
    (AuthorizationService.hasPermission(user, 'movement.create') ||
      AuthorizationService.hasPermission(user, 'preventive.execute') ||
      AuthorizationService.hasPermission(user, 'corrective.execute'));

  const canTriggerCorrective =
    Boolean(user) &&
    typeof onCreateCorrectiveFromNexus === 'function' &&
    AuthorizationService.hasPermission(user, 'corrective.execute');

  const canManagePreventive =
    Boolean(user) &&
    !isTechUser &&
    typeof onCreatePreventiveFromNexus === 'function' &&
    AuthorizationService.hasPermission(user, 'preventive.manage');

  // NEX-2: Strict Production Active Machines SSOT (never fall back to archived or SYSTEM_GENERAL machines)
  const activeMachines = useMemo(() => {
    return filterProductionMachines(machines);
  }, [machines]);

  const systemGeneralCount = useMemo(() => {
    return filterActiveMachines(machines).filter((m) => isSystemGeneralMachine(m)).length;
  }, [machines]);

  const [selectedMachineId, setSelectedMachineId] = useState(() => {
    return activeMachines[0]?.id_machine_registered || '';
  });

  // Keep selectedMachineId synchronized if machines list changes
  useEffect(() => {
    if (!activeMachines.length) {
      if (selectedMachineId !== '') setSelectedMachineId('');
      return;
    }
    const exists = activeMachines.some((m) => m.id_machine_registered === selectedMachineId);
    if (!exists) {
      setSelectedMachineId(activeMachines[0].id_machine_registered);
    }
  }, [activeMachines, selectedMachineId]);

  const [machineSearch, setMachineSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'PDR' | 'COMPONENT' | 'PART' | 'CRITICAL' | 'ALERT'
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGapModalOpen, setIsGapModalOpen] = useState(false);
  const [editingElement, setEditingElement] = useState<any>(null);

  // NEX-3: Active technicians only
  const activeTechnicians = useMemo(
    () =>
      (technicians || []).filter(
        (t) =>
          t?.is_active !== false &&
          t?.actif !== false &&
          String(t?.statut || '').toUpperCase() !== 'ARCHIVE'
      ),
    [technicians]
  );

  // NEX-3: ADR-09 Consumable PDR inventory only
  const consumablePdrItems = useMemo(
    () => buildConsumablePdrInventory(stockItems),
    [stockItems]
  );

  const pdrStockMap = useMemo(() => {
    const map = new Map();
    for (const item of consumablePdrItems) {
      const key = String(item.ref || item.reference || '').trim().toUpperCase();
      if (key) map.set(key, item);
    }
    return map;
  }, [consumablePdrItems]);

  // Machine active sélectionnée
  const activeMachine = useMemo(() => {
    if (!activeMachines.length) return null;
    return (
      activeMachines.find((m) => m.id_machine_registered === selectedMachineId) ||
      activeMachines[0] ||
      null
    );
  }, [selectedMachineId, activeMachines]);

  const defaultMachineTechnician = useMemo<string>(() => {
    return String(
      activeMachine?.technician ||
        activeMachine?.technicien_responsable ||
        activeMachine?.technicien ||
        activeTechnicians[0]?.nom ||
        activeTechnicians[0]?.name ||
        'Technicien'
    );
  }, [activeMachine, activeTechnicians]);

  // Formulaire d'ajout / modification d'un élément
  const [formData, setFormData] = useState({
    element_type: 'PDR',
    ref_element: '',
    designation: '',
    qte_montee: 1,
    unite: 'U',
    criticalite: 'CRITIQUE',
    duree_vie_estimee_heures: 5000,
    heures_actuelles: 0,
    date_installation: new Date().toISOString().split('T')[0],
    emplacement_machine: '',
    parent_component_key: '',
    technicien: 'Technicien',
    statut: 'OPERATIONNEL',
    remarques: '',
  });

  // Blueprint associé à la machine active (par id_blueprint ou id_templates)
  const activeBlueprint = useMemo(() => {
    if (!activeMachine || !Array.isArray(blueprints)) return null;
    const bpId = String(activeMachine.id_blueprint || '').trim();
    const tplId = String(activeMachine.id_templates || '').trim();
    if (bpId) {
      const byBp = blueprints.find((b) => b && String(b.id_blueprint || b.id || '').trim() === bpId);
      if (byBp) return byBp;
    }
    if (tplId) {
      return blueprints.find((b) => b && String(b.id_templates || '').trim() === tplId) || null;
    }
    return null;
  }, [activeMachine, blueprints]);

  // Zone et famille de la machine active
  const activeZone = useMemo(() => {
    if (!activeMachine) return null;
    const zTarget = activeMachine.id_zone_default || activeMachine.id_zone;
    return zones.find((z) => z.id_zone === zTarget || z.code_zone === zTarget);
  }, [activeMachine, zones]);

  const activeFamily = useMemo(() => {
    if (!activeMachine) return null;
    return families.find((f) => f.id_family === activeMachine.id_family);
  }, [activeMachine, families]);

  // Liste filtrée des machines pour le sélecteur
  const filteredMachinesList = useMemo(() => {
    if (!machineSearch.trim()) return activeMachines;
    const q = machineSearch.toLowerCase();
    return activeMachines.filter(
      (m) =>
        (m.id_machine_registered && m.id_machine_registered.toLowerCase().includes(q)) ||
        (m.designation && m.designation.toLowerCase().includes(q)) ||
        (m.id_zone_default && m.id_zone_default.toLowerCase().includes(q))
    );
  }, [activeMachines, machineSearch]);

  // N2: Unified As-Built view combining explicit BOM Ledger entries + mounted Entrepôt items (MONTE / En service)
  const currentMachineElements = useMemo(() => {
    if (!activeMachine) return [];
    return buildUnifiedMachineNexusElements(
      activeMachine.id_machine_registered,
      machineElementsLedger,
      warehouseItems
    );
  }, [activeMachine, machineElementsLedger, warehouseItems]);

  // Organes & Composants montés sur la machine active (pour liaison hiérarchique Parent -> PDR)
  const machineOrganes = useMemo(() => {
    return currentMachineElements.filter(
      (el) => el.element_type === 'COMPONENT' || el.element_type === 'PART'
    );
  }, [currentMachineElements]);

  // NEX-6 & Phase B.2: Index des tâches préventives et interventions correctives ouvertes sur la machine active (correspondance exacte de jetons, sans faux positifs de sous-chaînes)
  const activeMachinePreventiveRefs = useMemo(() => {
    const refs = new Set<string>();
    if (!activeMachine || !Array.isArray(preventiveTasks)) return refs;
    const machNorm = String(activeMachine.id_machine_registered || '').trim().toUpperCase();
    for (const t of preventiveTasks) {
      if (!t || t.is_active === false || String(t.statut || '').toUpperCase() === 'ARCHIVEE') continue;
      const taskMach = String(
        t.id_machine || t.code_machine || (t as any).machine_id || (t as any).id_machine_registered || ''
      )
        .trim()
        .toUpperCase();
      if (taskMach !== machNorm) continue;

      if (t.pdr_ref) refs.add(String(t.pdr_ref).trim().toUpperCase());
      if (t.id_composant) refs.add(String(t.id_composant).trim().toUpperCase());
      if (t.id_part) refs.add(String(t.id_part).trim().toUpperCase());
      if (Array.isArray(t.pdr_requises)) {
        t.pdr_requises.forEach((p: any) => {
          const pRef = String(p?.ref || p?.reference || p?.id_pdr || '').trim().toUpperCase();
          if (pRef) refs.add(pRef);
        });
      }

      const compText = String(t.composant || '').trim();
      currentMachineElements.forEach((el) => {
        const r = String(el.ref_element || '').trim().toUpperCase();
        if (!r) return;
        const tplComp = String(el._compTemplateId || '').trim().toUpperCase();
        const tplPart = String(el._partDesignationId || '').trim().toUpperCase();
        if (
          (tplComp && refs.has(tplComp)) ||
          (tplPart && refs.has(tplPart)) ||
          (compText && matchesExactOrBoundaryToken(compText, r)) ||
          (compText && tplComp && matchesExactOrBoundaryToken(compText, tplComp)) ||
          (compText && tplPart && matchesExactOrBoundaryToken(compText, tplPart))
        ) {
          refs.add(r);
        }
      });
    }
    return refs;
  }, [activeMachine, preventiveTasks, currentMachineElements]);

  const activeMachineOpenCorrectiveRefs = useMemo(() => {
    const refs = new Set<string>();
    if (!activeMachine || !Array.isArray(correctiveInterventions)) return refs;
    const machNorm = String(activeMachine.id_machine_registered || '').trim().toUpperCase();
    for (const ci of correctiveInterventions) {
      if (!ci) continue;
      const st = String(ci.statut || ci.status || '').toUpperCase();
      if (st.includes('CLOTUR') || st.includes('FERM') || st.includes('RESOLU')) continue;
      const ciMach = String(
        ci.code_machine || ci.id_machine || ci.id_machine_registered || ci.machine || ''
      )
        .trim()
        .toUpperCase();
      if (ciMach !== machNorm) continue;

      if (ci.id_composant) refs.add(String(ci.id_composant).trim().toUpperCase());
      if (ci.id_part) refs.add(String(ci.id_part).trim().toUpperCase());
      if ((ci as any).pdr_ref) refs.add(String((ci as any).pdr_ref).trim().toUpperCase());

      const structuredSpareArrays = [
        ci.pieces_utilisees,
        ci.pieces_proposees,
        ci.pdr_utilisees,
        (ci as any).pdr_consommees,
        (ci as any).pdr_requises,
      ];
      for (const arr of structuredSpareArrays) {
        if (Array.isArray(arr)) {
          arr.forEach((p: any) => {
            const pRef = String(p?.ref || p?.reference || p?.id_pdr || p?.code || '')
              .trim()
              .toUpperCase();
            if (pRef) refs.add(pRef);
          });
        }
      }

      const anomText = `${ci.anomalie || ''} ${ci.travail_a_faire || ''}`.trim();
      currentMachineElements.forEach((el) => {
        const r = String(el.ref_element || '').trim().toUpperCase();
        if (!r) return;
        const tplComp = String(el._compTemplateId || '').trim().toUpperCase();
        const tplPart = String(el._partDesignationId || '').trim().toUpperCase();
        if (
          (tplComp && refs.has(tplComp)) ||
          (tplPart && refs.has(tplPart)) ||
          (anomText && matchesExactOrBoundaryToken(anomText, r))
        ) {
          refs.add(r);
        }
      });
    }
    return refs;
  }, [activeMachine, correctiveInterventions, currentMachineElements]);

  // NEX-4 & Phase B.1: Calcul intelligent des heures d'usure piloté par Compteur Machine / Relevés puis Estimation Calendaire Dynamique
  const computeEffectiveWearHours = useCallback(
    (item: any) => calculateElementWearHours(item, activeMachine, meterReadings),
    [activeMachine, meterReadings]
  );

  // NEX-4: Statut de stock PDR en direct pour chaque élément monté
  const getPdrLiveStockStatus = useCallback(
    (item: any) => {
      if (item.element_type !== 'PDR') {
        return {
          isPdr: false,
          available: null,
          status: 'ORGANE',
          label:
            item._source === 'ENTREPOT'
              ? t('nexus.table.stockEntrepot')
              : t('nexus.table.stockOrgane'),
        };
      }
      const refNorm = String(item.ref_element || '').trim().toUpperCase();
      const stockMatch = pdrStockMap.get(refNorm);
      if (!stockMatch) {
        return {
          isPdr: true,
          available: 0,
          status: 'UNLISTED',
          label: t('nexus.table.stockUnlisted'),
        };
      }
      const qty = Number(stockMatch.stockActuel ?? 0);
      const min = Number(stockMatch.seuil ?? 2);
      if (qty <= 0) {
        return { isPdr: true, available: 0, status: 'OUT', label: t('nexus.table.stockOut') };
      }
      if (qty <= min) {
        return {
          isPdr: true,
          available: qty,
          status: 'LOW',
          label: t('nexus.table.stockLow', { qty }),
        };
      }
      return {
        isPdr: true,
        available: qty,
        status: 'OK',
        label: t('nexus.table.stockOk', { qty }),
      };
    },
    [pdrStockMap, t]
  );

  // Filtrage selon le type et la recherche
  const displayedElements = useMemo(() => {
    return currentMachineElements.filter((item) => {
      if (typeFilter === 'PDR' && item.element_type !== 'PDR') return false;
      if (typeFilter === 'COMPONENT' && item.element_type !== 'COMPONENT') return false;
      if (typeFilter === 'PART' && item.element_type !== 'PART') return false;
      if (typeFilter === 'CRITICAL' && item.criticalite !== 'CRITIQUE') return false;
      if (typeFilter === 'ALERT') {
        const { hours } = computeEffectiveWearHours(item);
        const maxH = Number(item.duree_vie_estimee_heures) || 5000;
        const ratio = Math.round((hours / maxH) * 100);
        if (item.statut !== 'A_REMPLACER' && ratio < 85) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchRef = (item.ref_element || '').toLowerCase().includes(q);
        const matchDesig = (item.designation || '').toLowerCase().includes(q);
        const matchLoc = (item.emplacement_machine || '').toLowerCase().includes(q);
        const matchParent = (item.parent_component_key || '').toLowerCase().includes(q);
        if (!matchRef && !matchDesig && !matchLoc && !matchParent) return false;
      }

      return true;
    });
  }, [currentMachineElements, typeFilter, searchTerm, computeEffectiveWearHours]);

  // NEX-2: Machines jumelles (Twins) actives partageant un id_templates non vide
  const twinMachines = useMemo(() => {
    if (!activeMachine) return [];
    const tpl = String(activeMachine.id_templates || '').trim();
    const fam = String(activeMachine.id_family || '').trim();
    if (!tpl) return [];
    return activeMachines.filter(
      (m) =>
        m.id_machine_registered !== activeMachine.id_machine_registered &&
        String(m.id_templates || '').trim() === tpl &&
        (!fam || String(m.id_family || '').trim() === fam)
    );
  }, [activeMachine, activeMachines]);

  // NEX-5, NEX-6 & Phase B.3: Analyse complète d'écarts As-Built vs Blueprint (supporte la correspondance par _compTemplateId / _partDesignationId pour les organes sérialisés de l'Entrepôt)
  const blueprintConformity = useMemo(() => {
    if (!activeMachine || !activeBlueprint) return null;
    const { addedEntries, skippedCount, blueprintId } = buildLedgerEntriesFromBlueprint(
      activeMachine,
      activeBlueprint,
      currentMachineElements,
      consumablePdrItems
    );

    // Extraire l'ensemble de toutes les références théoriques du Blueprint
    const { addedEntries: allTheoreticalEntries } = buildLedgerEntriesFromBlueprint(
      activeMachine,
      activeBlueprint,
      [],
      consumablePdrItems
    );

    const theoreticalRefsSet = new Set(
      allTheoreticalEntries.map((e) => String(e.ref_element || '').trim().toUpperCase())
    );

    const doesElementMatchTheoreticalBlueprint = (el: any) => {
      const candidateKeys = [
        el?.ref_element,
        el?._compTemplateId,
        el?._partDesignationId,
        el?.id_composant,
        el?.id_part,
      ];
      return candidateKeys.some((k) => {
        const upper = String(k || '').trim().toUpperCase();
        return Boolean(upper && theoreticalRefsSet.has(upper));
      });
    };

    const matchedEntries = currentMachineElements.filter((el) =>
      doesElementMatchTheoreticalBlueprint(el)
    );

    const extraEntries = currentMachineElements.filter(
      (el) => !doesElementMatchTheoreticalBlueprint(el)
    );

    const totalTheoretical = addedEntries.length + skippedCount;
    if (totalTheoretical === 0) return null;
    const mountedCount = skippedCount;
    const missingCount = addedEntries.length;
    const conformityRate = Math.round((mountedCount / totalTheoretical) * 100);
    return {
      blueprintId,
      totalTheoretical,
      mountedCount,
      missingCount,
      conformityRate,
      missingEntries: addedEntries,
      matchedEntries,
      extraEntries,
    };
  }, [activeMachine, activeBlueprint, currentMachineElements, consumablePdrItems]);

  // NEX-5: Découverte automatique des PDR consommées dans l'historique des Mouvements (Sorties) mais absentes de Nexus
  const unregisteredMovementPdrs = useMemo(() => {
    if (!activeMachine || !Array.isArray(mouvements)) return [];
    const targetIdNorm = String(activeMachine.id_machine_registered || '').trim().toUpperCase();
    if (!targetIdNorm) return [];

    const mountedRefs = new Set(
      currentMachineElements.map((e) => String(e.ref_element || '').trim().toUpperCase())
    );

    const discoveredMap = new Map();
    for (const mv of mouvements) {
      if (!mv) continue;
      const mvType = String(mv.type || '').trim().toLowerCase();
      if (!mvType.includes('sortie')) continue;
      const mvMach = String(
        mv.id_machine_registered || mv.machine || mv.id_machine || mv.code_machine || ''
      )
        .trim()
        .toUpperCase();
      if (mvMach !== targetIdNorm) continue;

      const ref = String(mv.ref || mv.reference || mv.id_article || '').trim();
      const refUpper = ref.toUpperCase();
      if (!refUpper || mountedRefs.has(refUpper)) continue;

      const stockMatch = pdrStockMap.get(refUpper);
      if (!stockMatch && consumablePdrItems.length > 0) continue;

      if (!discoveredMap.has(refUpper)) {
        discoveredMap.set(refUpper, {
          ref_element: ref,
          designation: mv.designation || stockMatch?.designation || ref,
          qte_montee: Math.max(1, Number(mv.quantite || mv.qte || 1)),
          date_installation: String(mv.date || new Date().toISOString().split('T')[0]).slice(0, 10),
          technicien: mv.technicien || mv.demandeur || defaultMachineTechnician,
          emplacement_machine: mv.emplacement || '',
        });
      }
    }
    return Array.from(discoveredMap.values());
  }, [
    activeMachine,
    mouvements,
    currentMachineElements,
    pdrStockMap,
    consumablePdrItems.length,
    defaultMachineTechnician,
  ]);

  // KPI globaux et pour la machine active
  const kpis = useMemo(() => {
    const totalMounted = currentMachineElements.length;
    const criticalCount = currentMachineElements.filter((e) => e.criticalite === 'CRITIQUE').length;
    const alertCount = currentMachineElements.filter((e) => {
      const { hours } = computeEffectiveWearHours(e);
      const maxH = Number(e.duree_vie_estimee_heures) || 5000;
      return e.statut === 'A_REMPLACER' || Math.round((hours / maxH) * 100) >= 85;
    }).length;
    const outOfStockPdrCount = currentMachineElements.filter((e) => {
      const st = getPdrLiveStockStatus(e);
      return st.isPdr && st.status === 'OUT';
    }).length;
    const totalWorkshopElements = machineElementsLedger.length;

    return {
      totalMounted,
      criticalCount,
      alertCount,
      outOfStockPdrCount,
      totalWorkshopElements,
    };
  }, [currentMachineElements, machineElementsLedger, computeEffectiveWearHours, getPdrLiveStockStatus]);

  // NEX-3: Suggestions automatiques respectant strictement la frontière ADR-09
  const referenceOptions = useMemo(() => {
    if (formData.element_type === 'PDR') {
      return consumablePdrItems.map((s) => ({
        ref: String(s.ref || s.reference || ''),
        designation: String(s.designation || ''),
        stock: Number(s.stockActuel ?? 0) || 0,
      }));
    }
    if (formData.element_type === 'COMPONENT') {
      const whComps = (warehouseItems || [])
        .filter((w) => {
          const nat = String(w?.nature || w?.category || w?.type || 'COMPONENT').toUpperCase();
          const st = String(w?.status || w?.statut || '').toUpperCase();
          return nat !== 'PART' && nat !== 'ORGANE' && st !== 'ARCHIVEE' && st !== 'ARCHIVE';
        })
        .map((w) => ({
          ref: String(w.id_warehouse_item || w.ref || ''),
          designation: String(w.designation || w.nom_composant || ''),
          stock: Number(w.quantite ?? 1) || 1,
        }))
        .filter((o) => Boolean(o.ref));

      if (whComps.length > 0) return whComps;

      return (compTemplates || [])
        .map((ct) => ({
          ref: String(ct.id_comp_template || ct.id_template || ct.code || ct.id || ''),
          designation: String(ct.designation || ct.libelle || ct.nom || ''),
          stock: 1,
        }))
        .filter((o) => Boolean(o.ref));
    }

    const whParts = (warehouseItems || [])
      .filter((w) => {
        const nat = String(w?.nature || w?.category || w?.type || '').toUpperCase();
        return nat === 'PART' || nat === 'ORGANE' || Boolean(w?.part_type || w?.id_part);
      })
      .map((w) => ({
        ref: String(w.id_warehouse_item || w.ref || ''),
        designation: String(w.designation || w.designation_part || ''),
        stock: 1,
      }))
      .filter((o) => Boolean(o.ref));

    const catalogParts = [...(partTypes || []), ...(partDesignations || [])]
      .map((p) => ({
        ref: String(p.id_part_type || p.id_part_designation || p.code || p.id || ''),
        designation: String(p.designation || p.libelle || p.nom || ''),
        stock: 1,
      }))
      .filter((o) => Boolean(o.ref));

    const seen = new Set<string>();
    return [...whParts, ...catalogParts].filter((o) => {
      if (seen.has(o.ref)) return false;
      seen.add(o.ref);
      return true;
    });
  }, [
    formData.element_type,
    consumablePdrItems,
    warehouseItems,
    compTemplates,
    partTypes,
    partDesignations,
  ]);

  // Ouvrir modal d'ajout
  const handleOpenAddModal = () => {
    if (!canManageNexus || !activeMachine) return;
    setEditingElement(null);
    setFormData({
      element_type: 'PDR',
      ref_element: '',
      designation: '',
      qte_montee: 1,
      unite: 'U',
      criticalite: 'CRITIQUE',
      duree_vie_estimee_heures: 5000,
      heures_actuelles: 0,
      date_installation: new Date().toISOString().split('T')[0],
      emplacement_machine: '',
      parent_component_key: '',
      technicien: defaultMachineTechnician,
      statut: 'OPERATIONNEL',
      remarques: '',
    });
    setIsAddModalOpen(true);
  };

  // Ouvrir modal de modification
  const handleOpenEditModal = (element) => {
    if (!canManageNexus) return;
    setEditingElement(element);
    setFormData({
      element_type: element.element_type || 'PDR',
      ref_element: element.ref_element || '',
      designation: element.designation || '',
      qte_montee: element.qte_montee || 1,
      unite: element.unite || 'U',
      criticalite: element.criticalite || 'CRITIQUE',
      duree_vie_estimee_heures: element.duree_vie_estimee_heures || 5000,
      heures_actuelles: element.heures_actuelles || 0,
      date_installation: element.date_installation || new Date().toISOString().split('T')[0],
      emplacement_machine: element.emplacement_machine || '',
      parent_component_key: element.parent_component_key || '',
      technicien:
        element.technicien && element.technicien !== 'tech'
          ? element.technicien
          : defaultMachineTechnician,
      statut: element.statut || 'OPERATIONNEL',
      remarques: element.remarques || '',
    });
    setIsAddModalOpen(true);
  };

  // Sauvegarder élément (Ajout ou Mise à jour)
  const handleSaveElement = (e) => {
    e.preventDefault();
    if (!canManageNexus || !activeMachine) return;
    const cleanRef = formData.ref_element.trim();
    if (!cleanRef) {
      showToast?.(t('nexus.toasts.invalidRef'), 'error');
      return;
    }

    // Phase C.2: Guard against duplicate (Machine + Ref) mounting on this machine
    const cleanRefUpper = cleanRef.toUpperCase();
    const isDuplicateRef = currentMachineElements.some((el) => {
      const elRefUpper = String(el.ref_element || '').trim().toUpperCase();
      if (elRefUpper !== cleanRefUpper) return false;
      if (editingElement && String(el.id) === String(editingElement.id)) return false;
      return true;
    });
    if (isDuplicateRef) {
      showToast?.(
        t('nexus.toasts.duplicateRef', {
          ref: cleanRef,
          machine: activeMachine.id_machine_registered,
        }),
        'error'
      );
      return;
    }

    const payload = {
      ...formData,
      ref_element: cleanRef,
      unite: formData.unite.trim() || 'U',
      emplacement_machine:
        formData.emplacement_machine || formData.parent_component_key || '',
    };

    if (editingElement && editingElement._source === 'ENTREPOT') {
      // Phase A: Never create a shadow duplicate record in machineElementsLedger for an ENTREPOT item!
      // Update the underlying mounted warehouseItem directly in warehouseItems SSOT.
      const whId = String(editingElement._warehouseItemId || editingElement.ref_element || '').trim();
      const targetWh = (warehouseItems || []).find(
        (w) =>
          String(w.id_warehouse_item || w.id || w.ref || w.code || '')
            .trim()
            .toUpperCase() === whId.toUpperCase()
      );
      if (targetWh && typeof onUpdateWarehouseItem === 'function') {
        const mappedWhStatus =
          payload.statut === 'A_REMPLACER'
            ? 'À remplacer'
            : payload.statut === 'EN_REVISION'
            ? 'En révision'
            : targetWh.status || 'En service';
        onUpdateWarehouseItem(targetWh.id_warehouse_item || targetWh.id || whId, {
          ...targetWh,
          designation: payload.designation || targetWh.designation,
          criticalite: payload.criticalite,
          duree_vie_estimee_heures: Number(payload.duree_vie_estimee_heures) || 5000,
          heures_actuelles: Number(payload.heures_actuelles) || 0,
          date_installation: payload.date_installation,
          emplacement: payload.emplacement_machine || targetWh.emplacement,
          emplacement_machine: payload.emplacement_machine,
          technician: payload.technicien,
          technicien: payload.technicien,
          status: mappedWhStatus,
          remarques: payload.remarques,
        });
        showToast?.(t('nexus.toasts.entrepotSynced', { ref: cleanRef }), 'success');
      } else {
        showToast?.(t('nexus.toasts.entrepotOpenHint', { ref: cleanRef }), 'info');
      }
    } else if (editingElement) {
      onUpdateMachineElement?.(editingElement.id, payload);
      showToast?.(t('nexus.toasts.elementUpdated', { ref: cleanRef }), 'success');
    } else {
      const currentCounter = Number(
        (activeMachine as any)?.compteur_actuel ?? (activeMachine as any)?.compteur ?? 0
      );
      onAddMachineElement?.({
        ...payload,
        id_machine_registered: activeMachine.id_machine_registered,
        ...(Number.isFinite(currentCounter) && currentCounter > 0
          ? { compteur_installation: currentCounter }
          : {}),
      });
      showToast?.(
        t('nexus.toasts.elementAdded', {
          ref: cleanRef,
          machine: activeMachine.id_machine_registered,
        }),
        'success'
      );
    }

    setIsAddModalOpen(false);
  };

  // Duplication vers les machines jumelles
  const handleCloneToTwins = () => {
    if (!canManageNexus || !activeMachine) return;
    if (!twinMachines.length) {
      showToast?.(t('nexus.toasts.noTwins'), 'info');
      return;
    }
    const twinIds = twinMachines.map((m) => m.id_machine_registered);
    const clonedCount = onDuplicateBOMToTwins?.(activeMachine.id_machine_registered, twinIds);
    if (clonedCount === 0) {
      showToast?.(
        t('nexus.toasts.clonedUpToDate', { twins: twinIds.join(', ') }),
        'info'
      );
    } else {
      showToast?.(
        t('nexus.toasts.clonedSuccess', {
          count: typeof clonedCount === 'number' ? clonedCount : currentMachineElements.length,
          twinsCount: twinIds.length,
          twins: twinIds.join(', '),
        }),
        'success'
      );
    }
  };

  // N3: Initialiser la nomenclature As-Built de la machine depuis son Blueprint
  const handleInitializeFromBlueprint = () => {
    if (!canManageNexus) return;
    if (!activeMachine) {
      showToast?.(t('nexus.toasts.selectActiveMachine'), 'warning');
      return;
    }
    if (!activeBlueprint) {
      showToast?.(
        t('nexus.toasts.noBlueprintLinked', {
          machine: activeMachine.id_machine_registered,
        }),
        'info'
      );
      return;
    }

    const { addedEntries, skippedCount, blueprintId } = buildLedgerEntriesFromBlueprint(
      activeMachine,
      activeBlueprint,
      currentMachineElements,
      consumablePdrItems
    );

    if (addedEntries.length === 0) {
      showToast?.(
        skippedCount > 0
          ? t('nexus.toasts.blueprintAlreadyComplete', {
              id: blueprintId,
              count: skippedCount,
              machine: activeMachine.id_machine_registered,
            })
          : t('nexus.toasts.blueprintEmpty', { id: blueprintId }),
        'info'
      );
      return;
    }

    const normalizedEntries = addedEntries.map((entry) => ({
      ...entry,
      technicien:
        entry.technicien && entry.technicien !== 'tech'
          ? String(entry.technicien)
          : defaultMachineTechnician,
    }));

    if (typeof onUpsertMachineElementsBatch === 'function') {
      onUpsertMachineElementsBatch(normalizedEntries, {
        sourceLabel: `BLUEPRINT_INIT:${blueprintId}`,
      });
    } else {
      normalizedEntries.forEach((entry) => {
        onAddMachineElement?.(entry);
      });
    }

    showToast?.(
      skippedCount > 0
        ? t('nexus.toasts.blueprintInitializedSkipped', {
            added: addedEntries.length,
            id: blueprintId,
            machine: activeMachine.id_machine_registered,
            skipped: skippedCount,
          })
        : t('nexus.toasts.blueprintInitialized', {
            added: addedEntries.length,
            id: blueprintId,
            machine: activeMachine.id_machine_registered,
          }),
      'success'
    );
  };

  // NEX-6: Monter un élément manquant individuel depuis la fenêtre d'analyse d'écarts Blueprint
  const handleMountSingleMissingEntry = (entry) => {
    if (!canManageNexus || !activeMachine || !entry) return;
    onAddMachineElement?.({
      ...entry,
      id_machine_registered: activeMachine.id_machine_registered,
      technicien:
        entry.technicien && entry.technicien !== 'tech'
          ? entry.technicien
          : defaultMachineTechnician,
    });
    showToast?.(
      t('nexus.toasts.missingMounted', {
        ref: entry.ref_element,
        machine: activeMachine.id_machine_registered,
      }),
      'success'
    );
  };

  // NEX-6: Pont Direct Nexus -> DI Corrective
  const handleTriggerCorrectiveFromElement = (item) => {
    if (!canTriggerCorrective || !activeMachine || !item) return;
    onCreateCorrectiveFromNexus?.(activeMachine, item);
    showToast?.(
      t('nexus.toasts.correctiveCreated', {
        ref: item.ref_element,
        machine: activeMachine.id_machine_registered,
      }),
      'success'
    );
  };

  // NEX-6: Pont Direct Nexus -> Routine Préventive
  const handleTriggerPreventiveFromElement = (item) => {
    if (!canManagePreventive || !activeMachine || !item) return;
    const res = onCreatePreventiveFromNexus?.(activeMachine, item);
    if (res?.skipped) {
      showToast?.(
        t('nexus.toasts.preventiveExists', {
          ref: item.ref_element,
          machine: activeMachine.id_machine_registered,
        }),
        'info'
      );
      return;
    }
    showToast?.(
      t('nexus.toasts.preventiveCreated', {
        freq: res?.frequence || 'Mensuel',
        ref: item.ref_element,
        machine: activeMachine.id_machine_registered,
      }),
      'success'
    );
  };

  // NEX-5: Synchroniser automatiquement les PDR consommées dans l'historique des Sorties de cette machine
  const handleSyncFromMovements = () => {
    if (!canManageNexus || !activeMachine || unregisteredMovementPdrs.length === 0) return;

    const batchEntries: Partial<MachineElement>[] = unregisteredMovementPdrs.map((pdr, idx) => ({
      id: `BOM-HIST-${activeMachine.id_machine_registered}-${pdr.ref_element.replace(/[^a-zA-Z0-9]/g, '')}-${idx + 1}`,
      id_machine_registered: activeMachine.id_machine_registered,
      element_type: 'PDR',
      ref_element: pdr.ref_element,
      designation: pdr.designation,
      qte_montee: pdr.qte_montee,
      unite: 'U',
      criticalite: 'MAJEURE',
      duree_vie_estimee_heures: 5000,
      heures_actuelles: 0,
      date_installation: pdr.date_installation,
      emplacement_machine: pdr.emplacement_machine || 'Historique Sorties PDR',
      technicien: pdr.technicien || defaultMachineTechnician,
      statut: 'OPERATIONNEL',
      remarques: 'Synchronisé depuis historique des Sorties PDR',
    }));

    if (typeof onUpsertMachineElementsBatch === 'function') {
      onUpsertMachineElementsBatch(batchEntries, {
        sourceLabel: `MOVEMENTS_SYNC:${activeMachine.id_machine_registered}`,
      });
    } else {
      batchEntries.forEach((entry) => onAddMachineElement?.(entry));
    }

    showToast?.(
      t('nexus.toasts.historySynced', {
        count: unregisteredMovementPdrs.length,
        machine: activeMachine.id_machine_registered,
      }),
      'success'
    );
  };

  // NEX-4: Synchroniser et persister les heures d'usure estimées sur les éléments du registre de la machine
  const handleSyncWearHours = () => {
    if (!canManageNexus || !activeMachine) return;
    let alertTriggeredCount = 0;
    const batchUpdates: Array<{ id: string; updates: Partial<MachineElement> }> = [];

    currentMachineElements.forEach((item) => {
      if (item._source === 'ENTREPOT') return;
      const { hours, source } = computeEffectiveWearHours(item);
      const maxH = Number(item.duree_vie_estimee_heures) || 5000;
      const wearRatio = Math.round((hours / maxH) * 100);
      const nextStatut = wearRatio >= 85 ? 'A_REMPLACER' : item.statut;

      if (hours !== item.heures_actuelles || nextStatut !== item.statut) {
        batchUpdates.push({
          id: item.id,
          updates: {
            heures_actuelles: hours,
            statut: nextStatut,
            wear_source: source,
          } as Partial<MachineElement>,
        });
        if (nextStatut === 'A_REMPLACER' && item.statut !== 'A_REMPLACER') {
          alertTriggeredCount++;
        }
      }
    });

    if (batchUpdates.length === 0) {
      showToast?.(t('nexus.toasts.wearUpToDate'), 'info');
    } else {
      if (typeof onUpdateMachineElementsBatch === 'function') {
        onUpdateMachineElementsBatch(batchUpdates, {
          sourceLabel: `WEAR_SYNC:${activeMachine.id_machine_registered}`,
        });
      } else {
        batchUpdates.forEach((u) => onUpdateMachineElement?.(u.id, u.updates));
      }
      showToast?.(
        alertTriggeredCount > 0
          ? t('nexus.toasts.wearUpdatedAlerts', {
              count: batchUpdates.length,
              alerts: alertTriggeredCount,
            })
          : t('nexus.toasts.wearUpdated', { count: batchUpdates.length }),
        'success'
      );
    }
  };

  // N4: Remplacer un élément PDR via un mouvement de Sortie Interne pré-rempli
  const handleReplaceElementViaMouvement = (item) => {
    if (!canReplaceViaSortie || !activeMachine || !item) return;

    if (item._source === 'ENTREPOT' || item.element_type === 'COMPONENT' || item.element_type === 'PART') {
      onNavigate?.('entrepot');
      showToast?.(
        t('nexus.toasts.replaceEntrepotRedirect', { ref: item.ref_element }),
        'info'
      );
      return;
    }

    const preset = {
      source: 'STOCK_PDR',
      id_machine_registered: activeMachine.id_machine_registered,
      id_zone: activeMachine.id_zone_default || activeMachine.id_zone || '',
      technicien:
        item.technicien && item.technicien !== 'tech'
          ? item.technicien
          : defaultMachineTechnician,
      ref: item.ref_element,
      designation: item.designation || '',
      quantite: Math.max(1, Number(item.qte_montee) || 1),
      unit: item.unite || 'pcs',
      emplacement: item.emplacement_machine || item.parent_component_key || '',
      ledgerElementId: item.id,
      fromNexusReplacement: true,
    };

    if (typeof onNavigateToQuickSortie === 'function') {
      onNavigateToQuickSortie(preset);
    } else {
      setQuickSortiePreset?.(preset);
      onNavigate?.('sortie');
    }

    showToast?.(
      t('nexus.toasts.quickSortiePrefilled', {
        ref: item.ref_element,
        machine: activeMachine.id_machine_registered,
      }),
      'info'
    );
  };

  // NEX-7: Télécharger le Modèle Excel Vierge (.xlsx) pour l'import de nomenclature BOM
  const handleDownloadTemplateExcel = () =>
    downloadNexusTemplateExcel(activeMachine, defaultMachineTechnician, showToast);

  // NEX-7: Importer un fichier Excel BOM (.xlsx / .xls) avec validation stricte (PRODUCTION active) et déduplication (Upsert)
  const handleImportBOMExcel = (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !canManageNexus) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        if (wb.SheetNames.some((n) => n.trim().toUpperCase() === 'README_TYPE_A')) {
          showToast?.(
            'Ce classeur officiel Type A doit être importé via Paramètres ➔ Ingestion Structurée (Mode B).',
            'error'
          );
          return;
        }
        const sheetName =
          wb.SheetNames.find((n) => n.toUpperCase().includes('BOM') || n.toUpperCase().includes('REGISTRE')) ||
          wb.SheetNames[0];
        if (!sheetName) {
          showToast?.('Aucune feuille valide détectée dans le fichier Excel.', 'error');
          return;
        }

        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        if (!rows.length) {
          showToast?.('Le fichier Excel sélectionné est vide.', 'warning');
          return;
        }

        const activeProdMap = new Map<string, any>();
        activeMachines.forEach((m) => {
          const code = String(m.id_machine_registered || '').trim();
          if (code) activeProdMap.set(code.toUpperCase(), m);
        });

        let addedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        const today = new Date().toISOString().split('T')[0];

        // Phase A: Local deduplication Map across existing ledger AND incoming Excel rows (prevents Stale Closure duplicates)
        const existingIdByPair = new Map<string, string>();
        (machineElementsLedger || []).forEach((el) => {
          const m = String(el?.id_machine_registered || '').trim().toUpperCase();
          const r = String(el?.ref_element || '').trim().toUpperCase();
          if (m && r && el.id) {
            existingIdByPair.set(`${m}::${r}`, String(el.id));
          }
        });

        const deduplicatedPayloadsByPair = new Map<
          string,
          { payload: Partial<MachineElement>; isUpdate: boolean }
        >();

        rows.forEach((row, idx) => {
          const rawMachineId = String(
            row['Machine ID'] ||
              row['id_machine_registered'] ||
              row['Machine'] ||
              row['Code Machine'] ||
              activeMachine?.id_machine_registered ||
              ''
          ).trim();

          const matchedMachine = activeProdMap.get(rawMachineId.toUpperCase());
          const rawRef = String(
            row['Référence Élément'] ||
              row['ref_element'] ||
              row['Référence'] ||
              row['Ref'] ||
              ''
          ).trim();

          if (!matchedMachine || !rawRef) {
            skippedCount++;
            return;
          }

          const canonicalMachineId = matchedMachine.id_machine_registered;
          const rawType = String(row['Type'] || row['element_type'] || 'PDR')
            .trim()
            .toUpperCase();
          const elementType =
            rawType.includes('COMP')
              ? 'COMPONENT'
              : rawType.includes('PART') || rawType.includes('ORG')
              ? 'PART'
              : 'PDR';

          const rawCrit = String(row['Criticité'] || row['criticalite'] || 'CRITIQUE')
            .trim()
            .toUpperCase();
          const criticalite =
            rawCrit.includes('MIN')
              ? 'MINEURE'
              : rawCrit.includes('MAJ') || rawCrit.includes('MOY')
              ? 'MAJEURE'
              : 'CRITIQUE';

          const rawStatut = String(row['Statut'] || row['statut'] || 'OPERATIONNEL')
            .trim()
            .toUpperCase();
          const statut =
            rawStatut.includes('REMPLAC') || rawStatut.includes('ALERTE')
              ? 'A_REMPLACER'
              : rawStatut.includes('REV')
              ? 'EN_REVISION'
              : 'OPERATIONNEL';

          const parentKeyRaw = String(
            row['Organe Parent'] || row['parent_component_key'] || ''
          ).trim();
          const parentComponentKey = parentKeyRaw === '—' ? '' : parentKeyRaw;

          const emplacementRaw = String(
            row['Emplacement Machine'] || row['emplacement_machine'] || row['Emplacement'] || ''
          ).trim();
          const emplacementMachine =
            emplacementRaw === '—' ? parentComponentKey : emplacementRaw || parentComponentKey;

          const pairKey = `${canonicalMachineId.toUpperCase()}::${rawRef.toUpperCase()}`;
          const existingId = existingIdByPair.get(pairKey);
          const alreadyInBatch = deduplicatedPayloadsByPair.get(pairKey);
          const resolvedId =
            existingId ||
            alreadyInBatch?.payload.id ||
            `BOM-IMP-${canonicalMachineId}-${rawRef.replace(/[^a-zA-Z0-9]/g, '')}-${idx + 1}`;

          const payload: Partial<MachineElement> = {
            id: resolvedId,
            id_machine_registered: canonicalMachineId,
            element_type: elementType,
            ref_element: rawRef,
            designation:
              String(row['Désignation'] || row['designation'] || rawRef).trim() || rawRef,
            qte_montee: Math.max(
              1,
              Number(row['Qté Montée'] || row['qte_montee'] || row['Quantité'] || 1) || 1
            ),
            unite: String(row['Unité'] || row['unite'] || 'U').trim() || 'U',
            criticalite,
            duree_vie_estimee_heures: Math.max(
              100,
              Number(row['Durée de Vie (H)'] || row['duree_vie_estimee_heures'] || 5000) || 5000
            ),
            heures_actuelles: Math.max(
              0,
              Number(
                row['Heures Actuelles'] ||
                  row['Heures Usure'] ||
                  row['heures_actuelles'] ||
                  0
              ) || 0
            ),
            date_installation:
              String(row['Date Installation'] || row['date_installation'] || today)
                .trim()
                .slice(0, 10) || today,
            emplacement_machine: emplacementMachine,
            parent_component_key: parentComponentKey,
            technicien:
              String(row['Technicien'] || row['technicien'] || '').trim() ||
              matchedMachine.technician ||
              defaultMachineTechnician,
            statut,
            remarques: String(row['Remarques'] || row['remarques'] || 'Import Excel BOM').trim(),
          };

          deduplicatedPayloadsByPair.set(pairKey, {
            payload,
            isUpdate: Boolean(existingId || alreadyInBatch),
          });
        });

        const batchList: Partial<MachineElement>[] = [];
        for (const entry of deduplicatedPayloadsByPair.values()) {
          batchList.push(entry.payload);
          if (entry.isUpdate) {
            updatedCount++;
          } else {
            addedCount++;
          }
        }

        if (batchList.length > 0) {
          if (typeof onUpsertMachineElementsBatch === 'function') {
            onUpsertMachineElementsBatch(batchList, {
              sourceLabel: `EXCEL_IMPORT:${file.name}`,
            });
          } else {
            for (const entry of deduplicatedPayloadsByPair.values()) {
              if (entry.isUpdate && entry.payload.id) {
                onUpdateMachineElement?.(entry.payload.id, entry.payload);
              } else {
                onAddMachineElement?.(entry.payload);
              }
            }
          }

          DataGateway.appendAuditEvent({
            actionType: 'NEXUS_BOM_EXCEL_IMPORT',
            entityType: 'MACHINE',
            entityId: activeMachine?.id_machine_registered || 'MULTI',
            actorId: String(user?.id || user?.username || 'ADMIN'),
            actorName: String(user?.name || user?.username || 'Nexus BOM'),
            actorRole: String(user?.role || 'ADMIN'),
            before: { ledgerCount: machineElementsLedger.length },
            after: { addedCount, updatedCount, skippedCount },
            meta: { fileName: file.name },
          });
        }

        showToast?.(
          `Import Excel BOM (As-Built machine active) terminé : ${addedCount} ajouté(s), ${updatedCount} mis à jour${
            skippedCount > 0 ? `, ${skippedCount} ignoré(s)` : ''
          }.`,
          addedCount + updatedCount > 0 ? 'success' : 'warning'
        );
      } catch {
        showToast?.("Erreur lors de la lecture du fichier Excel d'import.", 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // NEX-5: Exporter la nomenclature de la machine et du registre entier en Excel avec colonnes enrichies et autofit
  const handleExportBOMExcel = () =>
    exportNexusBomExcel({
      activeMachine,
      activeZone,
      currentMachineElements,
      machineElementsLedger,
      computeEffectiveWearHours,
      getPdrLiveStockStatus,
      showToast,
    });

  return (
    <AnimatedPage className="space-y-6 max-w-7xl mx-auto p-1 sm:p-2 text-slate-800">
      {/* Input caché pour l'import Excel NEX-7 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleImportBOMExcel}
        className="hidden"
      />

      {/* 1. EN-TÊTE PRINCIPAL (Format Light UI Excel) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                {t('nexus.title')}
              </h2>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {t('nexus.badgeAsBuilt')}
              </span>
              {systemGeneralCount > 0 && (
                <span
                  className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200"
                  title={t('nexus.badgeProductionTooltip')}
                >
                  {t('nexus.badgeProductionMachines', { count: activeMachines.length })}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              {t('nexus.subtitle')}
            </p>
          </div>
        </div>

        {/* Boutons d'action globaux */}
        <div className="flex items-center gap-2 flex-wrap">
          {canManageNexus && activeMachine && (
            <button
              type="button"
              onClick={handleInitializeFromBlueprint}
              title={
                activeBlueprint
                  ? t('nexus.actions.initBlueprintTooltip', {
                      id: activeBlueprint.id_blueprint || activeBlueprint.id,
                    })
                  : t('nexus.actions.noBlueprintTooltip')
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border shadow-2xs transition active:scale-95 cursor-pointer ${
                activeBlueprint
                  ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>{t('nexus.actions.initBlueprint')}</span>
            </button>
          )}

          {canManageNexus && activeMachine && currentMachineElements.length > 0 && (
            <button
              type="button"
              onClick={handleSyncWearHours}
              title={t('nexus.actions.syncWearTooltip')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
              <span>{t('nexus.actions.syncWear')}</span>
            </button>
          )}

          {/* NEX-7: Modèle Excel & Import Excel */}
          {canManageNexus && (
            <>
              <button
                type="button"
                onClick={handleDownloadTemplateExcel}
                title={t('nexus.actions.downloadTemplateTooltip')}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs transition active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>{t('nexus.actions.downloadTemplate')}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={t('nexus.actions.importExcelTooltip')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition active:scale-95 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-600" />
                <span>{t('nexus.actions.importExcel')}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExportBOMExcel}
            title={t('nexus.actions.exportExcelTooltip')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{t('nexus.actions.exportExcel')}</span>
          </button>

          {canManageNexus && activeMachine && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('nexus.actions.mountElement')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. KPI CARDS BANNER */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {t('nexus.kpi.mountedTitle')}
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {kpis.totalMounted}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {t('nexus.kpi.machinePrefix', {
              code: activeMachine?.id_machine_registered || t('nexus.kpi.none'),
            })}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {t('nexus.kpi.criticalTitle')}
          </div>
          <div className="text-xl font-bold font-mono text-amber-600 mt-1">
            {kpis.criticalCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {t('nexus.kpi.criticalSub')}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {t('nexus.kpi.alertsTitle')}
          </div>
          <div className="text-xl font-bold font-mono text-rose-600 mt-1">
            {kpis.alertCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {t('nexus.kpi.alertsSub')}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {t('nexus.kpi.outOfStockTitle')}
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              kpis.outOfStockPdrCount > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {kpis.outOfStockPdrCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {t('nexus.kpi.outOfStockSub')}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs col-span-2 md:col-span-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {t('nexus.kpi.workshopRegistryTitle')}
          </div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {kpis.totalWorkshopElements}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {t('nexus.kpi.workshopRegistrySub')}
          </div>
        </div>
      </div>

      {/* 3. BARRE DE SÉLECTION DE LA MACHINE ET FICHE TECHNIQUE */}
      {!activeMachine ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
          <Cpu className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="text-sm font-bold text-slate-800">
            {t('nexus.empty.noMachineTitle')}
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {t('nexus.empty.noMachineDesc')}
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('machines')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('nexus.actions.openMachinesPark')}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <Cpu className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {t('nexus.machineCard.selectedTitle')}
                </h3>
                <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof onNavigateToMachine === 'function') {
                        onNavigateToMachine(activeMachine.id_machine_registered);
                      } else {
                        onNavigate?.('machines');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                    title={`${t('nexus.machineCard.parkLink')} — ${activeMachine.id_machine_registered}`}
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span>{t('nexus.machineCard.parkLink')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        storageService.setItem(
                          STORAGE_KEYS.PREVENTIVE_TARGET_MACHINE,
                          activeMachine.id_machine_registered
                        );
                      } catch {
                        // ignore storage errors
                      }
                      if (typeof onNavigateToPreventiveForMachine === 'function') {
                        onNavigateToPreventiveForMachine(activeMachine.id_machine_registered);
                      } else {
                        onNavigate?.('preventive');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer"
                    title={`${t('nexus.machineCard.preventiveLink', { count: activeMachinePreventiveRefs.size })} — ${activeMachine.id_machine_registered}`}
                  >
                    <CalendarPlus className="w-2.5 h-2.5" />
                    <span>
                      {t('nexus.machineCard.preventiveLink', {
                        count: activeMachinePreventiveRefs.size,
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof onNavigateToCorrectiveForMachine === 'function') {
                        onNavigateToCorrectiveForMachine(activeMachine.id_machine_registered);
                      } else {
                        onNavigate?.('corrective');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer"
                    title={`${t('nexus.machineCard.correctiveLink', { count: activeMachineOpenCorrectiveRefs.size })} — ${activeMachine.id_machine_registered}`}
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    <span>
                      {t('nexus.machineCard.correctiveLink', {
                        count: activeMachineOpenCorrectiveRefs.size,
                      })}
                    </span>
                  </button>
                  {activeBlueprint && (
                    <button
                      type="button"
                      onClick={() => onNavigate?.('blueprints')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
                      title={t('nexus.machineCard.blueprintLink', {
                        id: activeBlueprint.id_blueprint || activeBlueprint.id,
                      })}
                    >
                      <Layers className="w-2.5 h-2.5" />
                      <span>
                        {t('nexus.machineCard.blueprintLink', {
                          id: activeBlueprint.id_blueprint || activeBlueprint.id,
                        })}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Recherche rapide dans la liste des machines */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={t('nexus.machineCard.searchPlaceholder')}
                    value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <select
                  value={activeMachine.id_machine_registered}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  className="py-1.5 px-3 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-emerald-500"
                >
                  {filteredMachinesList.map((m) => (
                    <option key={m.id_machine_registered} value={m.id_machine_registered}>
                      {m.id_machine_registered} {m.designation ? `— ${m.designation}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fiche synthétique de la machine */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  {t('nexus.machineCard.idLabel')}
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {activeMachine.id_machine_registered}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  {t('nexus.machineCard.designationLabel')}
                </span>
                <span className="font-semibold text-slate-800 truncate block">
                  {activeMachine.designation ||
                    activeMachine.nom ||
                    t('nexus.machineCard.defaultDesignation')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  {t('nexus.machineCard.zoneLabel')}
                </span>
                <span className="font-medium text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {activeZone?.nom ||
                    activeZone?.code_zone ||
                    activeMachine.id_zone_default ||
                    t('nexus.machineCard.defaultZone')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  {t('nexus.machineCard.modelFamilyLabel')}
                </span>
                <span className="font-medium text-slate-700 truncate block">
                  {activeMachine.id_templates || t('nexus.machineCard.defaultModel')}{' '}
                  {activeFamily
                    ? `(${activeFamily.nom || activeFamily.libelle || activeFamily.name})`
                    : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  {t('nexus.machineCard.technicianLabel')}
                </span>
                <span className="font-semibold text-slate-700 flex items-center gap-1 truncate">
                  <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                  {defaultMachineTechnician}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  {t('nexus.machineCard.statusLabel')}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {activeMachine.status || t('nexus.machineCard.defaultStatus')}
                </span>
              </div>
            </div>

            {/* NEX-5 & NEX-6: Barre de conformité As-Built vs Blueprint + Bouton Analyse d'Écarts */}
            {blueprintConformity && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 text-xs">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] bg-indigo-600 text-white">
                    {t('nexus.banners.conformityBadge', {
                      rate: blueprintConformity.conformityRate,
                    })}
                  </span>
                  <span className="text-slate-700">
                    {t('nexus.banners.conformitySummary', {
                      mounted: blueprintConformity.mountedCount,
                      total: blueprintConformity.totalTheoretical,
                      id: blueprintConformity.blueprintId,
                    })}
                    {blueprintConformity.extraEntries.length > 0 && (
                      <span className="text-indigo-800 font-semibold">
                        {' '}
                        {t('nexus.banners.extraCount', {
                          count: blueprintConformity.extraEntries.length,
                        })}
                      </span>
                    )}
                    .
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsGapModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs transition cursor-pointer"
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>{t('nexus.actions.analyzeGap')}</span>
                  </button>
                  {canManageNexus && blueprintConformity.missingCount > 0 && (
                    <button
                      type="button"
                      onClick={handleInitializeFromBlueprint}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {t('nexus.actions.mountMissing', {
                          count: blueprintConformity.missingCount,
                        })}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* NEX-5: Découverte intelligente depuis l'historique des Mouvements (Sorties) */}
            {canManageNexus && unregisteredMovementPdrs.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-amber-950">
                    {t('nexus.banners.historyDiscovered', {
                      count: unregisteredMovementPdrs.length,
                      machine: activeMachine.id_machine_registered,
                    })}{' '}
                    (
                    <span className="font-mono">
                      {unregisteredMovementPdrs
                        .slice(0, 3)
                        .map((p) => p.ref_element)
                        .join(', ')}
                      {unregisteredMovementPdrs.length > 3 ? '…' : ''}
                    </span>
                    ).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSyncFromMovements}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {t('nexus.actions.importFromHistory', {
                      count: unregisteredMovementPdrs.length,
                    })}
                  </span>
                </button>
              </div>
            )}

            {/* Alerte machines jumelles (Twin Machines) */}
            {twinMachines.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs">
                <div className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {t('nexus.banners.twinsDetected', { count: twinMachines.length })} (
                    {twinMachines.map((tw) => tw.id_machine_registered).join(', ')}).
                  </span>
                </div>

                {canManageNexus && (
                  <button
                    type="button"
                    onClick={handleCloneToTwins}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('nexus.actions.cloneToTwins')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 4. TABLEAU DE LA NOMENCLATURE ET DES ÉLÉMENTS MONTÉS */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              {/* Filtres par onglets */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'ALL', label: t('nexus.filters.all', { count: currentMachineElements.length }) },
                  {
                    id: 'PDR',
                    label: t('nexus.filters.pdr', {
                      count: currentMachineElements.filter((e) => e.element_type === 'PDR').length,
                    }),
                  },
                  {
                    id: 'COMPONENT',
                    label: t('nexus.filters.component', {
                      count: currentMachineElements.filter((e) => e.element_type === 'COMPONENT').length,
                    }),
                  },
                  {
                    id: 'PART',
                    label: t('nexus.filters.part', {
                      count: currentMachineElements.filter((e) => e.element_type === 'PART').length,
                    }),
                  },
                  {
                    id: 'CRITICAL',
                    label: t('nexus.filters.critical', {
                      count: currentMachineElements.filter((e) => e.criticalite === 'CRITIQUE').length,
                    }),
                  },
                  {
                    id: 'ALERT',
                    label: t('nexus.filters.alert', { count: kpis.alertCount }),
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                      typeFilter === tab.id
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Recherche dans la nomenclature */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={t('nexus.filters.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Grille des éléments */}
            {displayedElements.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl space-y-3">
                <Boxes className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-xs font-bold text-slate-700">
                  {t('nexus.empty.noElementsTitle')}
                </div>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                  {t('nexus.empty.noElementsDesc')}
                </p>
                {canManageNexus && (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleOpenAddModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('nexus.actions.mountFirstElement')}</span>
                    </button>
                    {activeBlueprint && (
                      <button
                        type="button"
                        onClick={handleInitializeFromBlueprint}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{t('nexus.actions.initBlueprint')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">{t('nexus.table.type')}</th>
                      <th className="py-2.5 px-3">{t('nexus.table.refDesignation')}</th>
                      <th className="py-2.5 px-3">{t('nexus.table.parentLocation')}</th>
                      <th className="py-2.5 px-3 text-center">{t('nexus.table.qtyMounted')}</th>
                      <th className="py-2.5 px-3">{t('nexus.table.stockAvail')}</th>
                      <th className="py-2.5 px-3">{t('nexus.table.criticality')}</th>
                      <th className="py-2.5 px-3">{t('nexus.table.wearRul')}</th>
                      <th className="py-2.5 px-3">{t('nexus.table.statusTracking')}</th>
                      <th className="py-2.5 px-3 text-right">{t('nexus.table.actionsBridges')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedElements.map((item) => {
                      const { hours: effectiveHours, isEstimated, source: wearSource } =
                        computeEffectiveWearHours(item);
                      const maxH = Number(item.duree_vie_estimee_heures) || 5000;
                      const lifeRatio = Math.min(100, Math.round((effectiveHours / maxH) * 100));
                      const isHighWear = lifeRatio >= 85 || item.statut === 'A_REMPLACER';
                      const stockSt = getPdrLiveStockStatus(item);
                      const refUpper = String(item.ref_element || '').trim().toUpperCase();
                      const hasPreventiveRoutine = activeMachinePreventiveRefs.has(refUpper);
                      const hasOpenCorrectiveDi = activeMachineOpenCorrectiveRefs.has(refUpper);

                      return (
                        <tr
                          key={item.id}
                          className={`transition ${
                            isHighWear
                              ? 'bg-rose-50/40 hover:bg-rose-50/70'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          {/* Type Badge */}
                          <td className="py-3 px-3 shrink-0">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                item.element_type === 'PDR'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : item.element_type === 'COMPONENT'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}
                            >
                              {item.element_type}
                            </span>
                          </td>

                          {/* Réf & Désignation */}
                          <td className="py-3 px-3 max-w-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-slate-900">
                                {item.ref_element}
                              </span>
                              {item._source === 'ENTREPOT' && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  title={t('nexus.table.actionWarehouse')}
                                >
                                  {t('nexus.table.syncEntrepot')}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {item.designation}
                            </div>
                          </td>

                          {/* Organe Parent & Emplacement */}
                          <td className="py-3 px-3 text-slate-600 font-medium">
                            <div className="space-y-0.5">
                              {item.parent_component_key && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                  {t('nexus.table.parentBadge', { key: item.parent_component_key })}
                                </span>
                              )}
                              <div className="text-[11px] text-slate-600">
                                {item.emplacement_machine || t('nexus.table.unspecifiedLocation')}
                              </div>
                            </div>
                          </td>

                          {/* Quantité */}
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                            {item.qte_montee} {item.unite || 'U'}
                          </td>

                          {/* Dispo Magasin (Live Stock PDR) */}
                          <td className="py-3 px-3">
                            {stockSt.isPdr ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                                  stockSt.status === 'OK'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : stockSt.status === 'LOW'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : stockSt.status === 'OUT'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                <Package className="w-3 h-3" />
                                <span>{stockSt.label}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-400">
                                {stockSt.label}
                              </span>
                            )}
                          </td>

                          {/* Criticité */}
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                                item.criticalite === 'CRITIQUE'
                                  ? 'text-rose-600'
                                  : item.criticalite === 'MAJEURE'
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              {item.criticalite === 'CRITIQUE' && (
                                <ShieldAlert className="w-3.5 h-3.5" />
                              )}
                              {item.criticalite}
                            </span>
                          </td>

                          {/* Cycle de Vie / RUL Prédictif */}
                          <td className="py-3 px-3 w-44">
                            {(() => {
                              const remainingH = Math.max(0, maxH - effectiveHours);
                              const rulPercent = Math.max(
                                0,
                                Math.min(100, Math.round((remainingH / maxH) * 100))
                              );
                              const wearSourceHint =
                                wearSource === 'METER'
                                  ? ` — ${t('nexus.table.sourceMeter')}`
                                  : isEstimated && item.date_installation
                                  ? ` — ${t('nexus.table.sourceCalendar', {
                                      date: item.date_installation,
                                    })}`
                                  : '';

                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 font-semibold">
                                    <span
                                      className={
                                        rulPercent <= 15 ? 'text-rose-600 font-bold' : ''
                                      }
                                    >
                                      RUL: {remainingH}h
                                    </span>
                                    <span className="text-slate-400 font-normal">
                                      ({effectiveHours}h{isEstimated ? '~' : ''})
                                    </span>
                                  </div>
                                  <div
                                    className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden"
                                    title={`${effectiveHours}h / ${maxH}h (RUL: ${remainingH}h)${wearSourceHint}`}
                                  >
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        rulPercent <= 15
                                          ? 'bg-rose-500'
                                          : rulPercent <= 40
                                          ? 'bg-amber-500'
                                          : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${100 - rulPercent}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Statut & Suivi Préventif/Correctif */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  item.statut === 'A_REMPLACER' || isHighWear
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : item.statut === 'EN_REVISION'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {(item.statut === 'A_REMPLACER' || isHighWear) && (
                                  <AlertTriangle className="w-3 h-3" />
                                )}
                                {item.statut === 'OPERATIONNEL' && !isHighWear && (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                {item.statut === 'A_REMPLACER'
                                  ? 'A_REMPLACER'
                                  : isHighWear
                                  ? t('nexus.table.highWearBadge')
                                  : item.statut || 'OPERATIONNEL'}
                              </span>

                              <div className="flex items-center gap-1 flex-wrap">
                                {hasPreventiveRoutine && (
                                  <span
                                    className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                                    title={t('nexus.table.pmActive')}
                                  >
                                    {t('nexus.table.pmActive')}
                                  </span>
                                )}
                                {hasOpenCorrectiveDi && (
                                  <span
                                    className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                    title={t('nexus.table.diOpen')}
                                  >
                                    {t('nexus.table.diOpen')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Actions & Ponts Directs (NEX-6) */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* N4: Remplacer via Mouvement Rapide (uniquement pour les PDR consommables et rôles autorisés) */}
                              {canReplaceViaSortie &&
                                item._source !== 'ENTREPOT' &&
                                item.element_type === 'PDR' && (
                                  <button
                                    type="button"
                                    onClick={() => handleReplaceElementViaMouvement(item)}
                                    title={t('nexus.table.actionReplace')}
                                    className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition cursor-pointer"
                                  >
                                    <Zap className="w-3.5 h-3.5" />
                                  </button>
                                )}

                              {/* NEX-6: Pont Direct -> Ouvrir DI Corrective */}
                              {canTriggerCorrective && (
                                <button
                                  type="button"
                                  onClick={() => handleTriggerCorrectiveFromElement(item)}
                                  title={t('nexus.table.actionCorrective')}
                                  className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition cursor-pointer"
                                >
                                  <Wrench className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* NEX-6: Pont Direct -> Planifier Routine Préventive */}
                              {canManagePreventive && !hasPreventiveRoutine && (
                                <button
                                  type="button"
                                  onClick={() => handleTriggerPreventiveFromElement(item)}
                                  title={t('nexus.table.actionPreventive')}
                                  className="p-1.5 rounded-lg text-indigo-700 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition cursor-pointer"
                                >
                                  <CalendarPlus className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Édition */}
                              {canManageNexus && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(item)}
                                  title={t('nexus.table.actionEdit')}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Suppression (Ledger) ou Navigation Entrepôt (Sync Entrepôt) */}
                              {item._source === 'ENTREPOT' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onNavigate?.('entrepot');
                                    showToast?.(
                                      t('nexus.toasts.warehouseManagedHint', {
                                        ref: item.ref_element,
                                        status: item._warehouseStatus || 'Monté',
                                      }),
                                      'info'
                                    );
                                  }}
                                  title={t('nexus.table.actionWarehouse')}
                                  className="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition cursor-pointer"
                                >
                                  <Boxes className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                canManageNexus && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (
                                        await confirmAction({
                                          title: t('nexus.toasts.detachTitle'),
                                          message: t('nexus.toasts.detachConfirm', {
                                            ref: item.ref_element,
                                            machine: activeMachine.id_machine_registered,
                                          }),
                                          variant: 'danger',
                                        })
                                      ) {
                                        onDeleteMachineElement?.(item.id);
                                        showToast?.(
                                          t('nexus.toasts.detached', { ref: item.ref_element }),
                                          'info'
                                        );
                                      }
                                    }}
                                    title={t('nexus.table.actionDetach')}
                                    className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <NexusModals
        isGapModalOpen={isGapModalOpen}
        setIsGapModalOpen={setIsGapModalOpen}
        blueprintConformity={blueprintConformity}
        activeMachine={activeMachine}
        canManageNexus={canManageNexus}
        handleInitializeFromBlueprint={handleInitializeFromBlueprint}
        getPdrLiveStockStatus={getPdrLiveStockStatus}
        handleMountSingleMissingEntry={handleMountSingleMissingEntry}
        isAddModalOpen={isAddModalOpen}
        setIsAddModalOpen={setIsAddModalOpen}
        editingElement={editingElement}
        formData={formData}
        setFormData={setFormData}
        handleSaveElement={handleSaveElement}
        referenceOptions={referenceOptions}
        machineOrganes={machineOrganes}
        defaultMachineTechnician={defaultMachineTechnician}
        activeTechnicians={activeTechnicians}
      />
    </AnimatedPage>
  );
}
