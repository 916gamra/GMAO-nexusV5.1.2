import { useState, useMemo } from 'react';
import {
  X,
  Gauge,
  Wrench,
  Calendar,
  Layers,
  AlertTriangle,
  Printer,
  ShieldCheck,
  Info,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { useGmaoStore } from '../../../../store/useGmaoStore';
import { getMachineAssetClass } from '../../../../utils/activeMachines';
import { resolveMachineHierarchyContext } from '../../../../utils/assetHierarchy';
import { buildUnifiedMachineNexusElements } from '../../../../core/domain';
import { computeMachineHealthPassport } from '../../../../application/services/MachineHealthPassportService';
import { useCurrency } from '../../../../utils/currencyService';
import { useWorkspaceProfile } from '../../../../core/workspace/workspaceProfile';
import { APP_VERSION } from '../../../../config/appVersion';
import { IMeterReading } from '../../../../types/meter';
import type {
  IBlueprint,
  IGeneralSystemType,
  IMachine,
  IMachineFamily,
  IMachineTemplate,
  ITechnician,
  IZone,
} from '../../../../types/domain';
import type { PreventiveExecutionRecord as PreventiveExecutionItem } from '../../../../types/preventive';
import type {
  CorrectiveInterventionItem,
  MachineElement as MachineElementLedgerItem,
  PreventiveTaskItem,
} from '../../../../types/store';

interface MachinePassport360ModalProps {
  machine: IMachine | null;
  onClose: () => void;
  onNavigateToPreventive?: (machineCode: string) => void;
  onNavigateToQuickSortie?: (machine: IMachine) => void;
  onOpenQrSticker?: (machine: IMachine) => void;
}

export default function MachinePassport360Modal({
  machine,
  onClose,
  onNavigateToPreventive,
  onNavigateToQuickSortie,
  onOpenQrSticker,
}: MachinePassport360ModalProps) {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'COMPTEURS' | 'BOM' | 'CORRECTIF' | 'PREVENTIF'>('OVERVIEW');
  const [showAddBomForm, setShowAddBomForm] = useState(false);
  const [bomElementType, setBomElementType] = useState<'COMPOSANT' | 'PART' | 'PDR'>('COMPOSANT');
  const [bomDesignation, setBomDesignation] = useState('');
  const [bomRef, setBomRef] = useState('');
  const [bomQty, setBomQty] = useState('1');
  const [bomPosition, setBomPosition] = useState('');
  const [bomNotes, setBomNotes] = useState('');
  const [bomFeedback, setBomFeedback] = useState<string | null>(null);

  const { formatCurrency, currencySymbol } = useCurrency();
  const workspaceProfile = useWorkspaceProfile();
  const { showFinance, showBlueprintsInPrimaryNav, showTeamManagement } =
    workspaceProfile.moduleVisibility;

  const machines = useGmaoStore((s) => s.machines) || [];
  const zones = useGmaoStore((s) => s.zones) || [];
  const families = useGmaoStore((s) => s.families) || [];
  const templates = useGmaoStore((s) => s.templates) || [];
  const technicians = useGmaoStore((s) => s.technicians) || [];
  const preventiveTasks = useGmaoStore((s) => s.preventiveTasks) || [];
  const preventiveExecutions = useGmaoStore((s) => s.preventiveExecutions) || [];
  const correctiveInterventions = useGmaoStore((s) => s.correctiveInterventions) || [];
  const sortiesExterne = useGmaoStore((s) => s.sortiesExterne) || [];
  const rawStock = useGmaoStore((s) => s.rawStock) || [];
  const machineElementsLedger = useGmaoStore((s) => s.machineElementsLedger) || [];
  const warehouseItems = useGmaoStore((s) => s.warehouseItems) || [];
  const blueprints = useGmaoStore((s) => s.blueprints) || [];
  const generalSystemTypes = useGmaoStore((s) => s.generalSystemTypes) || [];
  const meterReadings: IMeterReading[] = useGmaoStore((s) => s.meterReadings) || [];

  const machineCode = String(
    machine?.id_machine_registered || machine?.id || machine?.code || ''
  ).trim();
  const machineCodeUpper = machineCode.toUpperCase();

  // Health & TCO Passport (12 Months)
  const healthPassport = useMemo(() => {
    if (!machine) {
      return {
        machineCode: '',
        windowMonths: 12,
        healthScore: 100,
        healthStatus: 'SAIN' as const,
        correctiveCount12m: 0,
        preventiveCount12m: 0,
        externalBobinageCount12m: 0,
        correctivePdrCost12m: 0,
        preventiveTotalCost12m: 0,
        externalBobinageCost12m: 0,
        totalMaintenanceCost12m: 0,
        totalDowntimeHours12m: 0,
        hourlyDowntimeCost: 0,
        downtimeProductionLossCost12m: 0,
        totalEconomicImpact12m: 0,
        acquisitionValue: 0,
        berRatioPercent: null,
        berThresholdPercent: 50,
        isEconomicBerExceeded: false,
        regimeTravail: '2x8',
        monthlyOperatingHours: 352,
        plannedOperatingHours12m: 4224,
        availabilityRate12m: 100,
        mttrHours12m: 0,
        mtbfHours12m: null,
        recurrentOrganAlerts: [],
      };
    }
    return computeMachineHealthPassport({
      machine,
      correctiveInterventions,
      preventiveExecutions,
      sortiesExterne,
      stockItems: rawStock,
    });
  }, [machine, correctiveInterventions, preventiveExecutions, sortiesExterne, rawStock]);

  // Machine Meter History (supports both canonical machineId and legacy id_machine)
  const machineMeters = useMemo(() => {
    if (!machineCodeUpper) return [];
    return meterReadings
      .filter(
        (r) =>
          String(r.machineId || (r as IMeterReading & { id_machine?: string }).id_machine || '')
            .trim()
            .toUpperCase() === machineCodeUpper
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.date_releve || 0).getTime() -
          new Date(a.createdAt || a.date_releve || 0).getTime()
      );
  }, [meterReadings, machineCodeUpper]);

  // Machine Corrective History
  const machineCorrective = useMemo(() => {
    if (!machineCodeUpper) return [];
    return (correctiveInterventions || [])
      .filter(
        (ci: CorrectiveInterventionItem) =>
          String(ci.code_machine || ci.id_machine_registered || '')
            .trim()
            .toUpperCase() === machineCodeUpper
      )
      .sort((a: CorrectiveInterventionItem, b: CorrectiveInterventionItem) => {
        const dateA = new Date(String(a.date_cloture || a.date_demande || 0)).getTime();
        const dateB = new Date(String(b.date_cloture || b.date_demande || 0)).getTime();
        return dateB - dateA;
      });
  }, [correctiveInterventions, machineCodeUpper]);

  // Machine Preventive Tasks
  const machineTasks = useMemo(() => {
    if (!machineCodeUpper) return [];
    return (preventiveTasks || []).filter(
      (tItem: PreventiveTaskItem) =>
        String(tItem.id_machine || tItem.code_machine || '')
          .trim()
          .toUpperCase() === machineCodeUpper
    );
  }, [preventiveTasks, machineCodeUpper]);

  // Machine Preventive Executions
  const machineExecutions = useMemo(() => {
    if (!machineCodeUpper) return [];
    return (preventiveExecutions || [])
      .filter(
        (ex: PreventiveExecutionItem) =>
          String(ex.machineCode || ex.id_machine || '')
            .trim()
            .toUpperCase() === machineCodeUpper
      )
      .sort(
        (a: PreventiveExecutionItem, b: PreventiveExecutionItem) =>
          new Date(String(b.executedAt || 0)).getTime() - new Date(String(a.executedAt || 0)).getTime()
      );
  }, [preventiveExecutions, machineCodeUpper]);

  // Unified Machine Components & Elements Ledger (explicit BOM + mounted Entrepôt items)
  const machineElements = useMemo(() => {
    if (!machineCode) return [];
    return buildUnifiedMachineNexusElements(
      machineCode,
      machineElementsLedger,
      warehouseItems
    );
  }, [machineCode, machineElementsLedger, warehouseItems]);

  // Associated Blueprint
  const blueprint = useMemo(() => {
    if (!machine) return undefined;
    return (blueprints || []).find(
      (bp: IBlueprint) =>
        bp.id_blueprint === machine.id_blueprint ||
        (machine.id_templates && bp.id_templates === machine.id_templates)
    );
  }, [blueprints, machine]);

  const hierarchyContext = useMemo(
    () => (machine ? resolveMachineHierarchyContext(machine, machines) : null),
    [machine, machines]
  );

  if (!machine) return null;

  const assetClass = getMachineAssetClass(machine);
  const sysTypeObj = generalSystemTypes.find(
    (tItem: IGeneralSystemType) => tItem.id === machine.id_general_system_type
  );
  const zoneRef = machine.id_zone_default || machine.id_zone || machine.zone || '';
  const zoneObj = (zones || []).find(
    (z: IZone) =>
      z.id_zone === zoneRef ||
      z.code_zone === zoneRef ||
      z.libelle === zoneRef
  );
  const familyObj = (families || []).find(
    (f: IMachineFamily) => f.id_family === machine.id_family
  );
  const templateObj = (templates || []).find(
    (tItem: IMachineTemplate) => tItem.id_templates === machine.id_templates
  );
  const techObj = (technicians || []).find(
    (tItem: ITechnician) =>
      tItem.id_technician === machine.technician || tItem.nom === machine.technician
  );

  // Current counter value & unit
  const currentMeterVal =
    machine.dernier_releve_compteur ??
    machine.compteur_heures ??
    machineMeters[0]?.valeur ??
    0;
  const meterUnit =
    machine.compteur_unite_defaut ||
    machine.unite_compteur ||
    machineMeters[0]?.unite ||
    'Heures';
  const lastMeterDate =
    machine.date_releve_compteur ||
    machine.date_dernier_releve ||
    machineMeters[0]?.date_releve ||
    'Non enregistrée';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-800">
                  Dossier Technique 360°
                </span>
                <span className="font-mono text-base font-black text-white">
                  {machineCode}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  machine.status === 'ARCHIVEE' || machine.statut === 'Archivée'
                    ? 'bg-slate-700 text-slate-300'
                    : machine.status === 'ARRET' || machine.statut === 'En Panne'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {machine.status || machine.statut || 'EN_SERVICE'}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-200 truncate mt-0.5">
                {machine.designation || 'Machine sans désignation'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenQrSticker && (
              <button
                type="button"
                onClick={() => onOpenQrSticker(machine)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                title="Imprimer Étiquette QR"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Étiquette QR</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Vital KPI Strip */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0">
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Santé & Fiabilité 12M
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-base font-black font-mono text-slate-800">
                {healthPassport.healthScore}/100
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                healthPassport.healthStatus === 'CRITIQUE_BER'
                  ? 'bg-rose-100 text-rose-800'
                  : healthPassport.healthStatus === 'SURVEILLANCE'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {healthPassport.healthStatus}
              </span>
            </div>
          </div>

          {showFinance ? (
            <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Coût Maintenance &amp; Impact 12M
              </span>
              <div className="text-base font-black font-mono text-indigo-700 mt-0.5">
                {formatCurrency(healthPassport.totalMaintenanceCost12m, { decimals: 0 })}
              </div>
              {healthPassport.downtimeProductionLossCost12m > 0 ? (
                <div className="text-[10px] font-mono text-rose-700 font-semibold mt-0.5">
                  + {formatCurrency(healthPassport.downtimeProductionLossCost12m, { decimals: 0 })} perte arrêt (Total: {formatCurrency(healthPassport.totalEconomicImpact12m, { decimals: 0 })})
                </div>
              ) : healthPassport.berRatioPercent !== null ? (
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                  Ratio BER : <b className={healthPassport.isEconomicBerExceeded ? 'text-rose-700' : 'text-slate-700'}>{healthPassport.berRatioPercent}%</b> de la valeur à neuf
                </div>
              ) : null}
            </div>
          ) : (
            <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Interventions 12M
              </span>
              <div className="text-base font-black font-mono text-indigo-700 mt-0.5">
                {healthPassport.correctiveCount12m + healthPassport.preventiveCount12m}{' '}
                <span className="text-xs font-sans font-normal text-slate-500">BT &amp; PM</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                {healthPassport.correctiveCount12m} pannes • {healthPassport.preventiveCount12m} PM
              </div>
            </div>
          )}

          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Arrêt & Disponibilité ({healthPassport.regimeTravail})
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-base font-black font-mono text-amber-700">
                {healthPassport.totalDowntimeHours12m} <span className="text-xs font-sans font-normal text-slate-500">h</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold text-[10px]">
                Dispo {healthPassport.availabilityRate12m}%
              </span>
            </div>
            {healthPassport.correctiveCount12m > 0 && (
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                MTTR: <b>{healthPassport.mttrHours12m}h</b>
                {healthPassport.mtbfHours12m !== null && (
                  <span> • MTBF: <b>{healthPassport.mtbfHours12m}h</b></span>
                )}
              </div>
            )}
          </div>

          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Compteur d&apos;Heures
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Gauge className="w-4 h-4 text-cyan-600 shrink-0" />
              <span className="text-base font-black font-mono text-cyan-800">
                {Number(currentMeterVal).toLocaleString('fr-FR')} <span className="text-[10px] font-sans font-normal text-slate-500">{meterUnit}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white flex gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'OVERVIEW'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>Vue Générale & Spécifications</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('COMPTEURS')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'COMPTEURS'
                ? 'border-cyan-600 text-cyan-700 bg-cyan-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Gauge className="w-4 h-4" />
            <span>Compteurs & Horomètres ({machineMeters.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('BOM')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'BOM'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Organes & BOM ({machineElements.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CORRECTIF')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'CORRECTIF'
                ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Historique Pannes ({machineCorrective.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PREVENTIF')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'PREVENTIF'
                ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Préventif & Exécutions ({machineExecutions.length})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-700 text-xs">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Technical Identity Card */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Caractéristiques Techniques & Emplacement
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Zone / Emplacement</span>
                    <span className="font-semibold text-slate-800">
                      {zoneObj
                        ? `${zoneObj.code_zone ? zoneObj.code_zone + ' • ' : ''}${zoneObj.libelle}`
                        : zoneRef || 'Atelier Principal'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Rôle / Ligne Mère</span>
                    <span className="font-semibold text-slate-800">
                      {hierarchyContext?.parentMachine
                        ? `Sous ${hierarchyContext.parentMachine.id_machine_registered} (${hierarchyContext.parentMachine.designation})`
                        : hierarchyContext?.level === 'LINE'
                        ? `Ligne Mère (${hierarchyContext.childrenCount} machine(s))`
                        : 'Machine Indépendante'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Famille (Tier 1)</span>
                    <span className="font-semibold text-slate-800">
                      {familyObj
                        ? `${familyObj.libelle} (${familyObj.id_family})`
                        : machine.id_family || machine.famille || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">N° Série Fabricant</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {machine.serial_number || machine.numero_serie || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Template Modèle (Tier 1)</span>
                    <span className="font-semibold text-slate-800">
                      {templateObj
                        ? `${templateObj.libelle} (${templateObj.id_templates})`
                        : machine.id_templates || machine.modele || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Date Mise en Service</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {machine.date_mise_en_service || machine.date_installation || machine.annee || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Classe d&apos;Actif</span>
                    <span className="font-semibold text-slate-800">
                      {assetClass === 'SYSTEM_GENERAL'
                        ? `Système Général (${sysTypeObj?.name || sysTypeObj?.code || 'Utilités'})`
                        : 'Machine de Production'}
                    </span>
                  </div>
                  {showTeamManagement && (
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Technicien Assigné</span>
                      <span className="font-semibold text-slate-800">
                        {techObj ? `${techObj.nom} (${techObj.id_technician})` : machine.technician || '—'}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Régime d&apos;Ouverture</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {healthPassport.regimeTravail} ({healthPassport.monthlyOperatingHours} h/mois)
                    </span>
                  </div>
                  {showFinance && (
                    <>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">Coût Horaire d&apos;Arrêt</span>
                        <span className="font-mono font-semibold text-amber-800">
                          {healthPassport.hourlyDowntimeCost > 0
                            ? `${formatCurrency(healthPassport.hourlyDowntimeCost, { decimals: 0 })}/h`
                            : `Non configuré (0 ${currencySymbol}/h)`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">Valeur d&apos;Acquisition (RAV)</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {healthPassport.acquisitionValue > 0
                            ? formatCurrency(healthPassport.acquisitionValue, { decimals: 0 })
                            : 'Non renseignée'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">Indice BER Économique (12M)</span>
                        <span
                          className={`font-mono font-bold ${
                            healthPassport.isEconomicBerExceeded
                              ? 'text-rose-700'
                              : healthPassport.berRatioPercent !== null
                              ? 'text-emerald-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {healthPassport.berRatioPercent !== null
                            ? `${healthPassport.berRatioPercent}% (Seuil ${healthPassport.berThresholdPercent}%)`
                            : '—'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Economic BER & Recurrent Organ Failure Alert Banner if any */}
              {((showFinance && healthPassport.isEconomicBerExceeded) ||
                healthPassport.recurrentOrganAlerts.length > 0) && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      {showFinance
                        ? 'Alerte Récurrence & Seuil Économique (Beyond Economical Repair - BER)'
                        : 'Alerte Récurrence Organes (Fiabilité 12M)'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {showFinance && healthPassport.isEconomicBerExceeded && (
                      <div className="text-xs bg-white/90 p-2.5 rounded-xl border border-rose-300 flex items-start justify-between gap-3">
                        <div>
                          <span className="font-bold text-rose-950 block">
                            Dépassement du Seuil BER Économique ({healthPassport.berRatioPercent}% &ge; {healthPassport.berThresholdPercent}%)
                          </span>
                          <span className="text-[11px] text-slate-600">
                            Le coût cumulé de maintenance sur 12 mois ({formatCurrency(healthPassport.totalMaintenanceCost12m, { decimals: 0 })}) dépasse {healthPassport.berThresholdPercent}% de la valeur d&apos;acquisition ({formatCurrency(healthPassport.acquisitionValue, { decimals: 0 })}). Évaluer la réforme ou le remplacement de l&apos;équipement.
                          </span>
                        </div>
                        <span className="font-mono font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[11px] shrink-0">
                          BER {healthPassport.berRatioPercent}%
                        </span>
                      </div>
                    )}
                    {healthPassport.recurrentOrganAlerts.map((al) => (
                      <div key={al.organKey} className="text-xs bg-white/80 p-2.5 rounded-xl border border-rose-200 flex items-start justify-between gap-3">
                        <div>
                          <span className="font-bold text-rose-950 block">{al.organLabel}</span>
                          <span className="text-[11px] text-slate-600">{al.recommendation}</span>
                        </div>
                        <span className="font-mono font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[11px] shrink-0">
                          {al.count12m} pannes (12m)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions Footer */}
              <div className="flex items-center gap-3 pt-2">
                {onNavigateToQuickSortie && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToQuickSortie(machine);
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-sm"
                  >
                    <Wrench className="w-4 h-4" />
                    <span>Sortie Rapide PDR pour cette Machine</span>
                  </button>
                )}
                {onNavigateToPreventive && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToPreventive(machineCode);
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Voir Plan Préventif Dédié</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: COMPTEURS & HOROMETRES */}
          {activeTab === 'COMPTEURS' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-cyan-50/70 border border-cyan-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-black tracking-wider text-cyan-800 block">
                    Horomètre de Bord Actuel
                  </span>
                  <div className="text-2xl font-black font-mono text-cyan-950 mt-0.5">
                    {Number(currentMeterVal).toLocaleString('fr-FR')} {meterUnit}
                  </div>
                  <span className="text-[11px] text-cyan-700 mt-1 block">
                    Dernière saisie : {lastMeterDate}
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-cyan-600 text-white flex items-center justify-center">
                  <Gauge className="w-6 h-6" />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                  Historique Chronologique des Relevés de Compteur ({machineMeters.length})
                </h4>
                {machineMeters.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    Aucun relevé d'horomètre enregistré pour cet équipement.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                    {machineMeters.map((m) => (
                      <div key={m.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold text-xs">
                            <Gauge className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-mono font-bold text-slate-800 text-sm">
                              {Number(m.valeur).toLocaleString('fr-FR')} {m.unite}
                            </span>
                            <div className="text-[10.5px] text-slate-500">
                              {m.date_releve} • Relevé par <span className="font-semibold text-slate-700">{m.releve_par}</span>
                            </div>
                          </div>
                        </div>
                        {m.delta !== undefined && m.delta > 0 && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            +{m.delta} {m.unite}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: BOM & ORGANES */}
          {activeTab === 'BOM' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Organes &amp; Composants Enregistrés ({machineElements.length})
                  </h4>
                  {showBlueprintsInPrimaryNav && blueprint ? (
                    <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                      Blueprint : {blueprint.id_blueprint} • {blueprint.libelle || blueprint.ref_plan || ''}
                    </span>
                  ) : assetClass !== 'SYSTEM_GENERAL' ? (
                    <span
                      data-testid="bom-direct-tier2-badge"
                      className="text-[10.5px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"
                    >
                      Mode direct Tier 2 — sans Blueprint requis
                    </span>
                  ) : null}
                </div>

                {assetClass !== 'SYSTEM_GENERAL' && (
                  <button
                    type="button"
                    data-testid="bom-toggle-add-form-btn"
                    onClick={() => {
                      setShowAddBomForm((prev) => !prev);
                      setBomFeedback(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold shadow-2xs transition cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showAddBomForm ? 'Fermer le formulaire' : 'Ajouter Composant / Part / PDR'}
                  </button>
                )}
              </div>

              {assetClass === 'SYSTEM_GENERAL' && (
                <div
                  data-testid="bom-system-general-guard"
                  className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Actif classé <strong>SYSTEM_GENERAL</strong> : la nomenclature BOM / Organes montés
                    est réservée aux machines de production (Tier 2).
                  </span>
                </div>
              )}

              {bomFeedback && (
                <div
                  data-testid="bom-add-feedback"
                  className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{bomFeedback}</span>
                </div>
              )}

              {showAddBomForm && assetClass !== 'SYSTEM_GENERAL' && (
                <form
                  data-testid="bom-direct-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleanDesignation = bomDesignation.trim();
                    if (!cleanDesignation) return;
                    const parsedQty = Math.max(1, Number(bomQty) || 1);
                    const cleanRef = bomRef.trim() || `${bomElementType}-${Date.now().toString(36).toUpperCase()}`;

                    useGmaoStore.getState().addMachineElement?.({
                      id_machine_registered: machineCode,
                      element_type: bomElementType,
                      ref_element: cleanRef,
                      id_element: cleanRef,
                      designation: cleanDesignation,
                      nom_element: cleanDesignation,
                      qte_montee: parsedQty,
                      unite: 'U',
                      emplacement_machine: bomPosition.trim() || undefined,
                      remarques: bomNotes.trim() || undefined,
                      statut: 'MONTE',
                    });

                    setBomDesignation('');
                    setBomRef('');
                    setBomQty('1');
                    setBomPosition('');
                    setBomNotes('');
                    setShowAddBomForm(false);
                    setBomFeedback(
                      `${bomElementType} "${cleanDesignation}" rattaché directement à ${machineCode} (Tier 2).`
                    );
                  }}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="text-xs font-extrabold text-slate-800">
                    Rattachement Direct sur {machineCode} (Registre BOM Tier 2)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Nature de l&apos;élément
                      </label>
                      <select
                        data-testid="bom-input-type"
                        value={bomElementType}
                        onChange={(e) =>
                          setBomElementType(e.target.value as 'COMPOSANT' | 'PART' | 'PDR')
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                      >
                        <option value="COMPOSANT">COMPOSANT (Organe / Moteur / Réducteur)</option>
                        <option value="PART">PART (Pièce usinée / Arbre / Carter)</option>
                        <option value="PDR">PDR (Pièce de rechange / Roulement / Joint)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Désignation *
                      </label>
                      <input
                        type="text"
                        required
                        data-testid="bom-input-designation"
                        value={bomDesignation}
                        onChange={(e) => setBomDesignation(e.target.value)}
                        placeholder="Ex: Moteur principal 15kW, Roulement 6308-2RS, Arbre d'entrée..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Référence / Code (Optionnel)
                      </label>
                      <input
                        type="text"
                        list="passport-bom-ref-suggestions"
                        data-testid="bom-input-ref"
                        value={bomRef}
                        onChange={(e) => setBomRef(e.target.value)}
                        placeholder="Ex: MOT-15KW-01 ou réf PDR"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold text-slate-900"
                      />
                      <datalist id="passport-bom-ref-suggestions">
                        {(rawStock || []).slice(0, 60).map((item: any) => {
                          const ref = String(item?.ref || item?.code || '').trim();
                          if (!ref) return null;
                          return (
                            <option
                              key={`pdr-${ref}`}
                              value={ref}
                              label={String(item?.designation || ref)}
                            />
                          );
                        })}
                        {(warehouseItems || []).slice(0, 60).map((item: any) => {
                          const ref = String(
                            item?.code || item?.id_entrepot || item?.reference || ''
                          ).trim();
                          if (!ref) return null;
                          return (
                            <option
                              key={`wh-${ref}`}
                              value={ref}
                              label={String(item?.designation || item?.nom || ref)}
                            />
                          );
                        })}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Quantité montée
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        data-testid="bom-input-qty"
                        value={bomQty}
                        onChange={(e) => setBomQty(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Emplacement machine
                      </label>
                      <input
                        type="text"
                        data-testid="bom-input-position"
                        value={bomPosition}
                        onChange={(e) => setBomPosition(e.target.value)}
                        placeholder="Ex: Côté entraînement, Palier AR..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Observations techniques (Optionnel)
                    </label>
                    <input
                      type="text"
                      data-testid="bom-input-notes"
                      value={bomNotes}
                      onChange={(e) => setBomNotes(e.target.value)}
                      placeholder="Ex: Monté lors de la révision T2, couple de serrage, numéro de série..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddBomForm(false)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      data-testid="bom-submit-btn"
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Enregistrer sur la machine
                    </button>
                  </div>
                </form>
              )}

              {machineElements.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  Aucun organe spécifique rattaché à cette machine dans le registre BOM / Entrepôt.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {machineElements.map((el: MachineElementLedgerItem) => (
                    <div key={String(el.id_element || el.id)} className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 transition shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {String(el.designation || el.nom_element || el.ref_element || '')}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                          {String(el.element_type || el.nature || 'PDR')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                        <span>
                          Réf / Code :{' '}
                          <span className="font-mono font-semibold text-slate-800">
                            {String(el.ref_element || el.ref || el.code_element || '—')}
                          </span>
                        </span>
                        {Boolean(el.qte_montee) && (
                          <span className="font-mono font-bold text-emerald-700">
                            Qté: {String(el.qte_montee)} {String(el.unite || 'U')}
                          </span>
                        )}
                      </div>
                      {Boolean(el.emplacement_machine) && (
                        <div className="text-[10.5px] text-slate-500">
                          Position : <span className="font-medium text-slate-700">{String(el.emplacement_machine)}</span>
                        </div>
                      )}
                      {Boolean(el.remarques || el.observations) && (
                        <div className="text-[10.5px] text-slate-600 bg-slate-50 p-2 rounded-xl">
                          {String(el.remarques || el.observations)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HISTORIQUE PANNES & CORRECTIF */}
          {activeTab === 'CORRECTIF' && (
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Interventions et Bons de Travail Correctifs ({machineCorrective.length})
              </h4>

              {machineCorrective.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  Aucun historique de panne ou d'intervention corrective pour cette machine.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                  {machineCorrective.map((ci: CorrectiveInterventionItem, idx: number) => {
                    const ciAny = ci as unknown as Record<string, unknown>;
                    const btCode = String(ci.num_bt || ci.id || ciAny.id_intervention || `BT-${idx + 1}`);
                    const faultTitle = String(
                      ci.panne ||
                        ci.anomalie ||
                        ciAny.description_panne ||
                        ciAny.description ||
                        ciAny.titre ||
                        'Dépannage'
                    );
                    const dateLabel = String(
                      ci.date_cloture ||
                        ci.date_demande ||
                        ciAny.date_intervention ||
                        ciAny.date_creation ||
                        '—'
                    );
                    const downtimeHours = Number(ci.duree_arret_heures ?? ciAny.temps_arret_heures ?? 0);
                    return (
                      <div key={btCode} className="p-3.5 hover:bg-slate-50 transition space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-indigo-700">
                              {btCode}
                            </span>
                            <span className="font-bold text-slate-900">{faultTitle}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ci.statut === 'CLOTURE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ci.statut === 'EN_COURS'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {String(ci.statut || 'EN_COURS')}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
                          <span>Date : <span className="font-semibold text-slate-700">{dateLabel}</span></span>
                          {showTeamManagement && (
                            <span>Technicien : <span className="font-semibold text-slate-700">{String(ci.technicien || ci.intervenant || '—')}</span></span>
                          )}
                          {downtimeHours > 0 && (
                            <span className="text-amber-700 font-semibold">Arrêt : {downtimeHours}h</span>
                          )}
                          {showFinance && Boolean(ci.cout_total) && (
                            <span className="text-emerald-700 font-bold font-mono">
                              Coût : {formatCurrency(Number(ci.cout_total), { decimals: 0 })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: HISTORIQUE PREVENTIF */}
          {activeTab === 'PREVENTIF' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Journal des Exécutions Préventives ({machineExecutions.length})
                </h4>
                <span className="text-xs text-slate-500">
                  {machineTasks.length} tâche(s) planifiée(s)
                </span>
              </div>

              {machineExecutions.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  Aucune exécution préventive enregistrée pour cette machine.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                  {machineExecutions.map((ex: PreventiveExecutionItem, idx: number) => {
                    const exAny = ex as unknown as Record<string, unknown>;
                    const durationText = ex.duree_reelle
                      ? String(ex.duree_reelle)
                      : Number(exAny.durationMinutes || 0) > 0
                      ? `${Number(exAny.durationMinutes)} min`
                      : '';
                    return (
                      <div key={String(ex.id || `exec-${idx}`)} className="p-3.5 hover:bg-slate-50 transition space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">
                            {String(ex.taskTitle || ex.taskCode || ex.action_code || 'Visite Préventive')}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {String(ex.periodMonth || String(exAny.completedAt || ex.executedAt || '').slice(0, 10) || '—')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                          {showTeamManagement && (
                            <span>Réalisé par : <span className="font-semibold text-slate-700">{String(ex.technicianName || ex.technicien || '—')}</span></span>
                          )}
                          {Boolean(durationText) && <span>Durée : {durationText}</span>}
                          {Boolean(ex.anomalie_detectee) && (
                            <span className="text-rose-600 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Anomalie constatée
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 font-mono">
            {machineCode} • CIOB GMAO Nexus v{APP_VERSION}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            Fermer le Dossier
          </button>
        </div>

      </div>
    </div>
  );
}
