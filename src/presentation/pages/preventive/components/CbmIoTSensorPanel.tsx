import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Activity,
  Thermometer,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Zap,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Trash2,
  ClipboardCheck,
} from 'lucide-react';
import {
  CBM_PARAMETER_PRESETS,
  ingestTelemetryPayload,
  validateCbmRuleThresholds,
  type CbmParameterType,
  type ICbmEvaluationResult,
  type ICbmSensorRule,
} from '../../../../domain/preventive/cbmTelemetryService';
import { useGmaoStore } from '../../../../store/useGmaoStore';
import { useAuth } from '../../../../context/AuthContext';
import { AuthorizationService } from '../../../../core/security/AuthorizationService';
import { filterActiveMachines } from '../../../../utils/activeMachines';
import { storageService } from '../../../../utils/storageService';
import { indexedDBService } from '../../../../utils/indexedDBService';
import { serverSyncService } from '../../../../services/serverSyncService';
import { STORAGE_KEYS } from '../../../../infrastructure/persistence/storageKeys';
import type { IMachine } from '../../../../types/domain';

export function loadPersistedCbmRules(): ICbmSensorRule[] {
  try {
    const raw = storageService.getItem(STORAGE_KEYS.CBM_MANUAL_RULES);
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePersistedCbmRules(rules: ICbmSensorRule[], notifySync = true): void {
  try {
    storageService.setItem(STORAGE_KEYS.CBM_MANUAL_RULES, rules);
    indexedDBService.setItem(STORAGE_KEYS.CBM_MANUAL_RULES, rules).catch(() => {});
    if (notifySync) {
      serverSyncService.markLocalModified();
      if (storageService.getItem(STORAGE_KEYS.AUTO_WRITE_EXCEL) !== false) {
        serverSyncService.scheduleAutoPush(undefined, 2000);
      }
    }
  } catch {
    // ignore storage errors
  }
}

interface CbmIoTSensorPanelProps {
  machines: IMachine[];
  showToast?: ((msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void) | null;
  defaultExpanded?: boolean;
  canManage?: boolean;
  canExecute?: boolean;
}

export default function CbmIoTSensorPanel({
  machines = [],
  showToast = null,
  defaultExpanded = false,
  canManage,
  canExecute,
}: CbmIoTSensorPanelProps) {
  const { user } = useAuth();
  const canManageCbm =
    canManage !== undefined
      ? canManage
      : AuthorizationService.hasPermission(user, 'preventive.manage');
  const canExecuteCbm =
    canExecute !== undefined
      ? canExecute
      : AuthorizationService.hasPermission(user, 'preventive.execute') || canManageCbm;

  const activeMachines = useMemo(() => filterActiveMachines(machines || []), [machines]);
  const correctiveInterventions = useGmaoStore((s) => s.correctiveInterventions) || [];
  const handleSaveIntervention = useGmaoStore((s) => s.handleSaveIntervention);

  // Zero Silent Seed Reinjection: starts empty ([]), persisted in canonical storage
  const [sensorRules, setSensorRules] = useState<ICbmSensorRule[]>(() => loadPersistedCbmRules());
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [selectedSensorId, setSelectedSensorId] = useState<string>('');
  const [manualInputValues, setManualInputValues] = useState<Record<string, string>>({});
  const [lastEvaluation, setLastEvaluation] = useState<ICbmEvaluationResult | null>(null);
  const [showAddRuleForm, setShowAddRuleForm] = useState(false);

  const [newRuleMachine, setNewRuleMachine] = useState('');
  const [newRuleOrgane, setNewRuleOrgane] = useState('Palier Moteur Principal');
  const [newRuleParam, setNewRuleParam] = useState<CbmParameterType>('TEMPERATURE_PALIER');
  const [newRuleEndpoint, setNewRuleEndpoint] = useState('Thermomètre IR — Point terrain #1');
  const [newRuleWarn, setNewRuleWarn] = useState<string>('75');
  const [newRuleCrit, setNewRuleCrit] = useState<string>('90');

  useEffect(() => {
    const handleExternalUpdate = (ev: Event) => {
      const customEv = ev as CustomEvent<ICbmSensorRule[]>;
      if (Array.isArray(customEv?.detail)) {
        setSensorRules(customEv.detail);
      } else {
        setSensorRules(loadPersistedCbmRules());
      }
    };
    window.addEventListener('gmao:cbm-rules-updated', handleExternalUpdate);
    return () => window.removeEventListener('gmao:cbm-rules-updated', handleExternalUpdate);
  }, []);

  const activeSensor =
    sensorRules.find((r) => r.id === selectedSensorId) || sensorRules[0] || null;

  const handleParamPresetChange = (param: CbmParameterType) => {
    setNewRuleParam(param);
    const preset = CBM_PARAMETER_PRESETS[param];
    if (preset) {
      setNewRuleWarn(String(preset.warningThreshold));
      setNewRuleCrit(String(preset.criticalThreshold));
      const defaultInstrument =
        param === 'TEMPERATURE_PALIER'
          ? 'Thermomètre IR — Point terrain #1'
          : param === 'VIBRATION_RMS'
          ? 'Vibromètre portable — Palier #1'
          : param === 'PRESSION_HYDRAULIQUE'
          ? 'Manomètre circuit — Point #1'
          : param === 'COURANT_MOTEUR'
          ? 'Pince ampèremétrique — Armoire'
          : 'Débitmètre réseau air — Collecteur';
      setNewRuleEndpoint(defaultInstrument);
    }
  };

  const handleRecordMeasurement = useCallback(
    (targetRule: ICbmSensorRule, rawInputStr?: string) => {
      if (!canExecuteCbm) {
        showToast?.('Action refusée : rôle en lecture seule.', 'warning');
        return;
      }
      const valueToParse =
        rawInputStr !== undefined ? rawInputStr : manualInputValues[targetRule.id] ?? '';
      const numVal = Number(valueToParse);
      if (String(valueToParse).trim() === '' || !Number.isFinite(numVal)) {
        showToast?.('Veuillez saisir une valeur numérique valide.', 'warning');
        return;
      }

      const operatorName = String(user?.name || user?.nom || '').trim();
      const result = ingestTelemetryPayload(
        {
          sensorId: targetRule.id,
          protocol: targetRule.protocol,
          endpointAddress: targetRule.endpointAddress,
          machineCode: targetRule.machineCode,
          value: numVal,
          operatorName,
        },
        sensorRules,
        correctiveInterventions
      );

      setSensorRules(result.updatedRules);
      savePersistedCbmRules(result.updatedRules);
      setLastEvaluation(result.evaluation);

      if (result.autoCreatedDiPayload && typeof handleSaveIntervention === 'function') {
        handleSaveIntervention(result.autoCreatedDiPayload);
        showToast?.(
          `Alerte Critique sur ${targetRule.machineCode} (${numVal} ${targetRule.unit}) : DI Corrective ouverte automatiquement !`,
          'error'
        );
      } else if (result.skippedDuplicateOpenDi) {
        showToast?.(
          `Seuil critique franchi (${numVal} ${targetRule.unit}) — Une DI Corrective est déjà ouverte pour ce point.`,
          'warning'
        );
      } else if (result.evaluation?.status === 'WARNING') {
        showToast?.(
          `Pré-alerte sur ${targetRule.machineCode} (${targetRule.organe}) : ${numVal} ${targetRule.unit}.`,
          'warning'
        );
      } else if (result.evaluation?.status === 'OUT_OF_RANGE_FAULT') {
        showToast?.(result.evaluation.diagnosticMessageFr, 'error');
      } else {
        showToast?.(
          `Relevé enregistré : ${numVal} ${targetRule.unit} (Conforme).`,
          'success'
        );
      }
    },
    [
      canExecuteCbm,
      manualInputValues,
      sensorRules,
      correctiveInterventions,
      handleSaveIntervention,
      showToast,
      user,
    ]
  );

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCbm) {
      showToast?.('Permissions insuffisantes pour configurer un point de contrôle CBM.', 'warning');
      return;
    }
    const firstMachineCode = String(
      activeMachines[0]?.id_machine_registered || activeMachines[0]?.code_machine || ''
    ).trim();
    const machCode = (newRuleMachine || firstMachineCode).trim();
    if (!machCode) {
      showToast?.(
        'Aucune machine active enregistrée. Veuillez enregistrer une machine dans Parc Machines avant de créer un point CBM.',
        'warning'
      );
      return;
    }

    const preset = CBM_PARAMETER_PRESETS[newRuleParam];
    const warnNum = Number(newRuleWarn);
    const critNum = Number(newRuleCrit);
    const validation = validateCbmRuleThresholds({
      direction: preset.direction,
      warningThreshold: warnNum,
      criticalThreshold: critNum,
      hysteresis: preset.hysteresis,
      minPhysicalBound: preset.minPhysicalBound,
      maxPhysicalBound: preset.maxPhysicalBound,
      unit: preset.unit,
    });
    if (!validation.valid) {
      showToast?.(validation.errorFr || 'Seuils CBM invalides.', 'error');
      return;
    }

    const rule: ICbmSensorRule = {
      id: `CBM-${machCode}-${Date.now().toString().slice(-4)}`,
      machineCode: machCode,
      organe: newRuleOrgane.trim() || 'Organe Principal',
      parameter: newRuleParam,
      unit: preset.unit,
      protocol: 'MANUEL',
      endpointAddress: newRuleEndpoint.trim() || 'Point de contrôle terrain',
      direction: preset.direction,
      warningThreshold: warnNum,
      criticalThreshold: critNum,
      hysteresis: preset.hysteresis,
      minPhysicalBound: preset.minPhysicalBound,
      maxPhysicalBound: preset.maxPhysicalBound,
      autoTriggerDi: true,
      lastStatus: 'NORMAL',
    };

    const nextRules = [...sensorRules, rule];
    setSensorRules(nextRules);
    savePersistedCbmRules(nextRules);
    setSelectedSensorId(rule.id);
    setShowAddRuleForm(false);
    showToast?.(
      `Point de contrôle conditionnel ajouté sur ${machCode} (${rule.organe}).`,
      'success'
    );
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!canManageCbm) {
      showToast?.('Permissions insuffisantes pour supprimer un point CBM.', 'warning');
      return;
    }
    const nextRules = sensorRules.filter((r) => r.id !== ruleId);
    setSensorRules(nextRules);
    savePersistedCbmRules(nextRules);
    if (selectedSensorId === ruleId) {
      setSelectedSensorId(nextRules[0]?.id || '');
    }
    showToast?.('Point de contrôle conditionnel supprimé.', 'info');
  };

  const criticalCount = sensorRules.filter((r) => r.lastStatus === 'CRITICAL').length;
  const warningCount = sensorRules.filter((r) => r.lastStatus === 'WARNING').length;

  return (
    <div
      data-testid="cbm-iot-sensor-panel"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition-all"
    >
      {/* Collapsible Header (Collapsed by default so Batch Horomètre stays primary) */}
      <div className="px-4 py-3.5 bg-slate-50/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-3 text-left cursor-pointer flex-1 min-w-0"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
            <Thermometer className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Relevés Conditionnels Terrain — CBM Manuel (Température / Vibration / Pression)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700">
                {sensorRules.length} point(s) configuré(s)
              </span>
              {criticalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-100 text-rose-800 border border-rose-300">
                  {criticalCount} Critique(s)
                </span>
              )}
              {warningCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  {warningCount} Pré-alerte(s)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Saisie manuelle terrain (thermomètre IR, manomètre, vibromètre, pince) avec seuils ISO et ouverture automatique d&apos;une DI Corrective en cas de dépassement critique.
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {canManageCbm && (
            <button
              type="button"
              onClick={() => {
                setIsExpanded(true);
                setShowAddRuleForm(true);
              }}
              className="h-8 px-3 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter un point</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="h-8 px-3 rounded-xl bg-slate-200/70 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
          >
            <span>{isExpanded ? 'Masquer' : 'Ouvrir'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 border-t border-slate-200 space-y-4">
          {/* Add New Manual Inspection Point Form */}
          {showAddRuleForm && canManageCbm && (
            <form
              onSubmit={handleAddRule}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs"
            >
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Machine active *
                </label>
                <select
                  value={newRuleMachine}
                  onChange={(e) => setNewRuleMachine(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold"
                  required
                >
                  <option value="">Sélectionner...</option>
                  {activeMachines.map((m) => {
                    const code = String(m.id_machine_registered || m.code_machine || '');
                    return (
                      <option key={code} value={code}>
                        {code} — {String(m.designation || m.nom_machine || code)}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Organe / Point *
                </label>
                <input
                  type="text"
                  value={newRuleOrgane}
                  onChange={(e) => setNewRuleOrgane(e.target.value)}
                  placeholder="Ex: Palier Moteur"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Grandeur Physique
                </label>
                <select
                  value={newRuleParam}
                  onChange={(e) => handleParamPresetChange(e.target.value as CbmParameterType)}
                  className="w-full h-8 px-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold"
                >
                  {Object.entries(CBM_PARAMETER_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.labelFr} ({preset.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Seuils ({CBM_PARAMETER_PRESETS[newRuleParam]?.direction === 'LOW_BAD' ? 'Alerte > Crit.' : 'Alerte < Crit.'})
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={newRuleWarn}
                    onChange={(e) => setNewRuleWarn(e.target.value)}
                    title="Seuil pré-alerte"
                    className="w-1/2 h-8 px-2 rounded-lg bg-white border border-amber-300 text-slate-800 font-mono text-xs"
                    required
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={newRuleCrit}
                    onChange={(e) => setNewRuleCrit(e.target.value)}
                    title="Seuil critique (déclenche DI)"
                    className="w-1/2 h-8 px-2 rounded-lg bg-white border border-rose-300 text-slate-800 font-mono text-xs"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Instrument / Repère (Manuel)
                </label>
                <input
                  type="text"
                  value={newRuleEndpoint}
                  onChange={(e) => setNewRuleEndpoint(e.target.value)}
                  placeholder="Ex: Thermomètre IR #1"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs"
                  required
                />
              </div>
              <div className="flex items-end gap-1.5">
                <button
                  type="submit"
                  className="flex-1 h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddRuleForm(false)}
                  className="h-8 px-2.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* Empty State — Zero Fake Sensors */}
          {sensorRules.length === 0 ? (
            <div className="py-6 px-4 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 space-y-2">
              <ClipboardCheck className="w-7 h-7 text-slate-400 mx-auto" />
              <div className="text-xs font-bold text-slate-700">
                Aucun point de contrôle conditionnel configuré (0 capteur fictif)
              </div>
              <p className="text-[11px] text-slate-500 max-w-lg mx-auto">
                Ajoutez uniquement les points critiques que votre équipe mesure réellement sur le terrain (ex: température roulement broche, pression hydraulique presse) pour suivre les seuils d&apos;alerte.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sensorRules.map((rule) => {
                const status = rule.lastStatus || 'NORMAL';
                const statusBadge =
                  status === 'CRITICAL'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : status === 'WARNING'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : status === 'OUT_OF_RANGE_FAULT'
                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300';

                const inputVal =
                  manualInputValues[rule.id] !== undefined
                    ? manualInputValues[rule.id]
                    : rule.lastValue !== undefined
                    ? String(rule.lastValue)
                    : '';

                const op = rule.direction === 'LOW_BAD' ? '≤' : '≥';

                return (
                  <div
                    key={rule.id}
                    onClick={() => setSelectedSensorId(rule.id)}
                    className={`p-3.5 rounded-xl border transition-all ${
                      activeSensor?.id === rule.id
                        ? 'bg-indigo-50/30 border-indigo-300 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {rule.parameter === 'TEMPERATURE_PALIER' ? (
                          <Thermometer className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : rule.parameter === 'VIBRATION_RMS' ? (
                          <Activity className="w-4 h-4 text-cyan-600 shrink-0" />
                        ) : (
                          <Gauge className="w-4 h-4 text-indigo-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate">
                            {rule.machineCode} • {rule.organe}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate" title={rule.endpointAddress}>
                            {rule.endpointAddress || CBM_PARAMETER_PRESETS[rule.parameter]?.labelFr || rule.parameter}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9.5px] font-mono font-black border ${statusBadge}`}
                        >
                          {status}
                        </span>
                        {canManageCbm && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRule(rule.id);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Supprimer ce point de contrôle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2.5">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">
                          Dernière mesure
                        </span>
                        <span className="text-base font-black font-mono text-slate-900">
                          {rule.lastValue !== undefined ? `${rule.lastValue} ${rule.unit}` : '—'}
                        </span>
                      </div>
                      <div className="text-right text-[10px] font-mono text-slate-500">
                        <div>
                          Alerte: <b className="text-amber-700">{op} {rule.warningThreshold} {rule.unit}</b>
                        </div>
                        <div>
                          Critique (DI): <b className="text-rose-700">{op} {rule.criticalThreshold} {rule.unit}</b>
                        </div>
                      </div>
                    </div>

                    {/* Fast Manual Reading Input — RBAC guarded */}
                    {canExecuteCbm && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.1"
                          placeholder={`Mesure (${rule.unit})`}
                          value={inputVal}
                          onChange={(e) =>
                            setManualInputValues((prev) => ({
                              ...prev,
                              [rule.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono font-bold text-xs focus:bg-white focus:border-indigo-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRecordMeasurement(rule)}
                          className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer transition"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Valider relevé</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {lastEvaluation && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                lastEvaluation.status === 'CRITICAL'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : lastEvaluation.status === 'WARNING'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : lastEvaluation.status === 'OUT_OF_RANGE_FAULT'
                  ? 'bg-purple-50 border-purple-300 text-purple-900'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}
            >
              {lastEvaluation.status === 'CRITICAL' ? (
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              ) : lastEvaluation.status === 'WARNING' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span className="font-semibold">{lastEvaluation.diagnosticMessageFr}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
