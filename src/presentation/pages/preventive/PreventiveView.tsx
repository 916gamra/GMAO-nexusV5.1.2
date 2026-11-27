import { useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  Table2,
  X,
  Calculator,
  Clock,
  CheckCircle2,
  DollarSign,
  Upload,
  BookOpen,
  Package,
  Sparkles,
  Plus,
  Gauge,
} from 'lucide-react';
import AnimatedPage from '../../components/common/AnimatedPage';
import Action3DButton from '../../components/common/Action3DButton';
import FormulasModalButton from '../../components/common/FormulasModalButton';
import PageHeaderIcon from '../../components/common/PageHeaderIcon';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import PreventiveService from '../../../application/services/PreventiveService';
import { useGmaoStore } from '../../../store/useGmaoStore';
import TabMainView from './components/TabMainView';
import TaskImportModal from './components/TaskImportModal';
import { useI18n } from '../../../i18n/I18nContext';
import { isComponentNature, isPartNature } from '../../../core/domain/EntrepotItem';
import { useAuth } from '../../../context/AuthContext';
import {
  isTechnicianRole,
  getTechnicianBadgeLabel,
  getTechnicianDisplayName,
} from '../../../core/security/technicianScope';
import { AuthorizationService } from '../../../core/security/AuthorizationService';
import { useCurrency } from '../../../utils/currencyService';
import { useWorkspaceProfile } from '../../../core/workspace/workspaceProfile';

export default function PreventiveView({
  tasks = [],
  actions = [],
  guides = [],
  plans: _plans = [],
  executions = [],
  onUpdateTask = null,
  onDeleteTask: onDeleteTaskProp = null,
  onUpdateTaskCounter: onUpdateTaskCounterProp = null,
  onMarkTaskDone: onMarkTaskDoneProp = null,
  onReviewPreventiveExecution = null,
  onDeleteExecution = null,
  onResetToBaseline = null,
  onClearPreventiveForRealFactory = null,
  meterReadings = [],
  onRecordReading = null,
  onBatchRecordReadings = null,
  machines = [],
  blueprints = [],
  zones = [],
  technicians = [],
  stockItems = [],
  warehouseItems = [],
  mouvements: _mouvements = [],
  onAddMouvement = null,
  onDirectAdjustStock = null,
  showToast = null,
  onCreateCorrective = null,
  onNavigateToMachine = null,
  onNavigateToReferentiel = null,
  preventiveRecommendations = [],
  onAddAction = null,
  onCreatePlanWithTasks = null,
  onAdoptRecommendation = null,
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { symbol, currencyCode } = useCurrency();
  const workspaceProfile = useWorkspaceProfile();
  const showFinance = workspaceProfile.moduleVisibility.showFinance;
  const isTechUser = isTechnicianRole(user);
  const canExecutePreventive =
    Boolean(user) && AuthorizationService.hasPermission(user, 'preventive.execute');
  const canManagePreventive =
    Boolean(user) && !isTechUser && AuthorizationService.hasPermission(user, 'preventive.manage');
  void onResetToBaseline;
  void onClearPreventiveForRealFactory;
  void onDirectAdjustStock;
  const [showFormulasModal, setShowFormulasModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [viewMode, setViewMode] = useState('matrix'); // 'monthly_grid' | 'matrix' | 'grouped' | 'calendar' | 'list' | 'executions' | 'meters' | 'analytics'

  const pendingPreventiveValidationCount = (executions || []).filter(
    (ex) => ex.validation_status === 'PENDING_VALIDATION'
  ).length;
  const needsClarificationPreventiveCount = (tasks || []).filter(
    (tk) => tk.validation_status === 'NEEDS_CLARIFICATION' || tk.etat === 'À clarifier'
  ).length;

  const overdueCounterTasksCount = (tasks || []).filter((t) => {
    const isCounter =
      t.type_declencheur === 'COMPTEUR' ||
      t.type_declencheur === 'HYBRIDE' ||
      Number(t.compteur_seuil_intervalle) > 0;
    if (!isCounter || t.etat === 'En attente validation' || t.etat === 'À clarifier') return false;
    const tMach = String(t.id_machine || '').trim().toUpperCase();
    const machObj = (machines || []).find(
      (m) => String(m?.id_machine_registered || m?.id || m?.code || '').trim().toUpperCase() === tMach
    );
    const curr = Number(
      machObj?.compteur_heures ??
        machObj?.dernier_releve_compteur ??
        t.compteur_actuel ??
        t.dernier_releve ??
        0
    );
    const target = Number(
      t.compteur_prochain_declenchement ||
        Number(t.compteur_dernier_declenchement || 0) + Number(t.compteur_seuil_intervalle || 0)
    );
    return target > 0 && curr >= target;
  }).length;

  // ==========================================
  // MAIN VIEW HANDLERS (PRIMARY VIEW)
  // ==========================================
  const handleMarkTaskDone = (id, validationData) => {
    if (!canExecutePreventive) return;
    const targetTask = tasks.find((t) => t.id === id);
    const shouldSubmitForValidation =
      isTechUser || validationData?.submitForValidation === true;

    const enrichedValidationData = shouldSubmitForValidation
      ? {
          ...validationData,
          submitForValidation: true,
          validation_status: 'PENDING_VALIDATION',
          submitted_by_id: user?.personnelId || user?.id || '',
          submitted_by_name:
            getTechnicianDisplayName(user, technicians) ||
            validationData?.technicien ||
            '',
        }
      : {
          ...validationData,
          submitForValidation: false,
          validation_status: 'APPROVED',
          validated_by_id: user?.id || 'admin',
          validated_by_name: user?.name || user?.nom || 'Administrateur',
          ...(onAddMouvement ? { onAddMouvement } : {}),
        };

    const actionResult = onMarkTaskDoneProp
      ? onMarkTaskDoneProp(id, enrichedValidationData)
      : PreventiveService.markTaskAsDone(id, enrichedValidationData);

    if (!actionResult) {
      if (showToast) {
        showToast(
          'Validation bloquée : stock PDR insuffisant ou autorisation refusée.',
          'error'
        );
      }
      return;
    }

    // V3 Maker-Checker: If submitted by Technician, DO NOT emit stock movement until Admin approval
    if (shouldSubmitForValidation) {
      if (showToast) {
        showToast(
          `Exécution de ${targetTask?.composant || 'la tâche'} soumise pour validation responsable (sans déstockage immédiat).`,
          'info'
        );
      }
      return;
    }

    const consumedPDR = (validationData?.usedPDR && validationData.usedPDR.length > 0)
      ? validationData.usedPDR
      : (Array.isArray(validationData?.pieces_utilisees) ? validationData.pieces_utilisees : []);

    // Fallback only when onMarkTaskDoneProp (useGmaoStore.handleMarkTaskDone) is absent,
    // preventing double stock deduction since useGmaoStore.handleMarkTaskDone already emits MVT-PRV movements.
    if (
      !onMarkTaskDoneProp &&
      validationData?.skipStockDeduction !== true &&
      consumedPDR.length > 0 &&
      onAddMouvement
    ) {
      const organeTarget =
        targetTask?.composant ||
        targetTask?.nom_composant ||
        targetTask?.nom_part ||
        validationData?.nom_composant ||
        validationData?.nom_part ||
        '';
      const idComp = validationData?.id_composant || targetTask?.id_composant || '';
      const idPart = validationData?.id_part || targetTask?.id_part || '';

      consumedPDR.forEach((pdr) => {
        const explicitNature = String(pdr?.nature || pdr?.category || '').trim().toUpperCase();
        if (
          isComponentNature(explicitNature) ||
          isPartNature(explicitNature) ||
          Boolean(pdr?.id_warehouse_item)
        ) {
          return;
        }

        const pdrRef = pdr.reference || pdr.ref;
        if (!pdrRef) return;
        onAddMouvement({
          code_bon: `BS-PRV-${Date.now().toString().slice(-4)}`,
          num_commande: targetTask?.ref_plan || targetTask?.code || 'PREVENTIF',
          date: validationData.date_realisation || validationData.date_execution || new Date().toISOString().split('T')[0],
          heure: '10:00',
          ref: pdrRef,
          designation: pdr.designation || 'Pièce consommée',
          quantite: Number(pdr.quantite ?? pdr.qty ?? 1),
          unit: pdr.unite || pdr.unit || 'pcs',
          type: 'Sortie Interne',
          action_id: 'PREVENTIVE',
          usage_type: 'technician',
          id_machine_registered: targetTask?.id_machine || '',
          ...(idComp ? { id_composant: idComp } : {}),
          ...(idPart ? { id_part: idPart } : {}),
          technicien: validationData.technicien || validationData.technicien_realisateur || targetTask?.responsable || targetTask?.id_technicien || '',
          commentaire: `Consommation automatique sur maintenance préventive ${organeTarget} (${targetTask?.id_machine || ''})`,
        });
      });
    }

    if (showToast) {
      showToast(`Tâche ${targetTask?.composant || ''} validée avec succès !`, 'success');
    }
  };

  const handleUpdateTask = (id, updates) => {
    if (!canManagePreventive) return;
    if (onUpdateTask) {
      onUpdateTask(id, updates);
    } else {
      useGmaoStore.getState().handleUpdateTask(id, updates);
    }
    if (showToast) showToast('Tâche préventive mise à jour avec succès.', 'success');
  };

  const handleDeleteTask = (id) => {
    if (!canManagePreventive) return;
    if (onDeleteTaskProp) {
      onDeleteTaskProp(id);
    } else {
      PreventiveService.deleteTask(id);
    }
    if (showToast) showToast('Tâche supprimée du planning.', 'info');
  };

  const handleUpdateTaskCounter = (id, newCounterValue) => {
    if (!canExecutePreventive) return;
    if (onUpdateTaskCounterProp) {
      onUpdateTaskCounterProp(id, newCounterValue);
    } else {
      PreventiveService.updateTaskCounter(id, newCounterValue);
    }
    if (showToast) showToast('Compteur machine mis à jour.', 'success');
  };

  const handleUpdateTaskStatus = (id, newStatus) => {
    if (!canExecutePreventive) return;
    if (onUpdateTask) {
      onUpdateTask(id, { etat: newStatus });
    } else {
      PreventiveService.updateTaskStatus(id, newStatus);
    }
  };

  return (
    <AnimatedPage>
      <div className="space-y-4">
        {/* ========================================================================= */}
        {/* TOP MASTER HEADER (PRIMARY PAGE WITH 3D ELEVATION)                         */}
        {/* ========================================================================= */}
        <div className="bg-white px-4 py-3.5 md:px-5 md:py-4 rounded-2xl border border-slate-200/90 shadow-[0_12px_32px_-6px_rgba(0,0,0,0.12),0_4px_12px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.16),0_6px_16px_-3px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 ease-out flex flex-col md:flex-row items-start md:items-center justify-between gap-3 relative overflow-hidden group/header">
          {/* Ambient Glow */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover/header:bg-indigo-500/10 transition-colors duration-500" />

          {/* Left Column: Title & Overview */}
          <div className="min-w-0 flex-1 flex items-start sm:items-center gap-3 relative">
            <PageHeaderIcon icon={Calendar} colorClass="text-indigo-700" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                  {t('preventive.title')}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs">
                  {t('preventive.cycle')}
                </span>
                {isTechUser && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                    Mes Tâches · {getTechnicianBadgeLabel(user, technicians)}
                  </span>
                )}
                {canManagePreventive && pendingPreventiveValidationCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setViewMode('executions')}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs animate-pulse cursor-pointer"
                  >
                    À valider : {pendingPreventiveValidationCount} exéc.
                  </button>
                )}
                {isTechUser && needsClarificationPreventiveCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs animate-pulse">
                    À clarifier : {needsClarificationPreventiveCount}
                  </span>
                )}
                {overdueCounterTasksCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setViewMode((prev) => (prev === 'meters' ? 'matrix' : 'meters'))}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs animate-pulse cursor-pointer flex items-center gap-1"
                  >
                    <Gauge className="w-3 h-3 text-rose-700" />
                    <span>Compteurs : {overdueCounterTasksCount} échue(s)</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 max-w-3xl leading-snug line-clamp-1">
                {t('preventive.subtitle')}
              </p>
            </div>
          </div>

          {/* Right Column: Essential Page-Level Action Buttons Only */}
          <div className="flex items-center gap-2 shrink-0 relative">
            {/* 1. Formula Circular Trigger Button */}
            {!isTechUser && (
              <FormulasModalButton
                onClick={() => setShowFormulasModal(true)}
                title="Formules Excel (Matrice Préventif S1→S52)"
              />
            )}

            {/* 2. Guide & Philosophy Circular Trigger Button */}
            <Action3DButton
              variant="circle"
              color="slate"
              icon={BookOpen}
              onClick={() => setShowGuideModal(true)}
              title="Philosophie & Manuel de la Maintenance Préventive"
            />

            {/* 3. Import Tasks Button */}
            {canManagePreventive && (
              <Action3DButton
                variant="circle"
                color="slate"
                icon={Upload}
                onClick={() => setShowImportModal(true)}
                title="Importer des tâches préventives (JSON / Fichier)"
              />
            )}

            {/* 4. Primary Add Plan / Concepteur Button */}
            {canManagePreventive && (
              <Action3DButton
                variant="circle"
                color="indigo"
                icon={CalendarPlus}
                showAddBadge={true}
                onClick={onNavigateToReferentiel}
                title="Nouveau Plan / Concepteur de Plan"
              />
            )}
          </div>
        </div>

        {/* Anti-Recurrence Predictive Suggestions from Corrective Nexus */}
        {canManagePreventive && preventiveRecommendations && preventiveRecommendations.length > 0 && (() => {
          const now = new Date();
          const yearStart = new Date(now.getFullYear(), 0, 1);
          const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000));
          const currentWeekNum = Math.min(52, Math.max(1, Math.ceil((dayOfYear + yearStart.getDay() + 1) / 7)));
          const currentWeekKey = `S${currentWeekNum}`;
          const todayIso = now.toISOString().split('T')[0];

          return (
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-amber-300 dark:border-amber-700/60 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                    <span>Pont Prédictif Correctif → Préventif</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      {preventiveRecommendations.length} récidives détectées
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                      Cible immédiate : {currentWeekKey}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Machines ayant subi ≥ 3 pannes récentes sur un même organe ({preventiveRecommendations.map((r) => r.code_machine || r.machine).join(', ')}). Créez des routines rattachées dès la semaine {currentWeekKey}.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {preventiveRecommendations.slice(0, 3).map((rec, i) => {
                  const machineLabel = String(rec.code_machine || rec.machine || 'Machine').trim();
                  const anomClean = String(rec.anomalie || rec.titre || 'inspection_generale')
                    .replace(/^Maintenance Préventive Ciblée\s*:\s*/i, '')
                    .replace(/_/g, ' ')
                    .trim();
                  const composantName = `Contrôle ${anomClean}`;
                  const alreadyExists = (tasks || []).some(
                    (t) =>
                      String(t.id_machine || '').trim().toUpperCase() === machineLabel.toUpperCase() &&
                      (String(t.composant || '').trim().toLowerCase() === composantName.toLowerCase() ||
                        String(t.composant || '').trim().toLowerCase().includes(anomClean.toLowerCase()))
                  );

                  const matchedMach = (machines || []).find(
                    (m) =>
                      String(m.id_machine_registered || m.id || m.code || '')
                        .trim()
                        .toUpperCase() === machineLabel.toUpperCase()
                  );
                  const resolvedTech =
                    matchedMach?.technician ||
                    matchedMach?.technicien_responsable ||
                    matchedMach?.technicien ||
                    'Technicien';

                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={alreadyExists}
                      onClick={() => {
                        if (alreadyExists) return;
                        if (typeof onAdoptRecommendation === 'function') {
                          onAdoptRecommendation(rec);
                          return;
                        }
                        if (typeof onCreatePlanWithTasks === 'function') {
                          onCreatePlanWithTasks(
                            {
                              id_machine: machineLabel,
                              nom_machine: matchedMach?.designation || `Machine ${machineLabel}`,
                              id_zone: matchedMach?.id_zone_default || matchedMach?.id_zone || rec.zone || 'Atelier',
                              id_technicien: resolvedTech,
                              semaine_cible: currentWeekKey,
                              date_prevue: todayIso,
                              description: rec.recommendation || `Routine anti-récidive (${anomClean})`,
                            },
                            [
                              {
                                composant: composantName,
                                action_code: 'C',
                                frequence: rec.suggestedIntervalDays && rec.suggestedIntervalDays <= 10 ? 'Hebdo' : 'Mensuel',
                                duree_estimee: '20 min',
                                priorite: 'Haute',
                                consigne: rec.recommendedAction || `Contrôle préventif systématique (${anomClean})`,
                              },
                            ]
                          );
                          showToast?.(
                            `Routine préventive planifiée pour ${machineLabel} dès ${currentWeekKey}`,
                            'success'
                          );
                        } else if (onAddAction) {
                          onAddAction({
                            code: 'C',
                            libelle: `Contrôle systématique ${anomClean} (${machineLabel})`,
                            description: rec.recommendedAction || '',
                            type_maintenance: 'Préventif',
                            frequence_defaut: '1M',
                          });
                          showToast?.(`Tâche préventive créée pour ${machineLabel}`, 'success');
                        } else {
                          showToast?.(`Recommandation transmise à l'ingénierie pour ${machineLabel}`, 'success');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 ${
                        alreadyExists
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                          : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                      }`}
                    >
                      {alreadyExists ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Routine active : {machineLabel}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>
                            Créer routine ({currentWeekKey}) : {machineLabel}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ========================================================================= */}
        {/* MAIN VIEW CONTENT                                                         */}
        {/* ========================================================================= */}
        <ErrorBoundary sectionName="Matrice & Planning Préventif">
          <TabMainView
            tasks={tasks}
            executions={executions}
            machines={machines}
            blueprints={blueprints}
            zones={zones}
            technicians={technicians}
            actions={actions}
            guides={guides}
            stockItems={stockItems}
            warehouseItems={warehouseItems}
            meterReadings={meterReadings}
            onRecordReading={
              onRecordReading ||
              ((payload) => useGmaoStore.getState().handleRecordMeterReading(payload))
            }
            onBatchRecordReadings={onBatchRecordReadings}
            overdueCounterTasksCount={overdueCounterTasksCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onMarkTaskDone={canExecutePreventive ? handleMarkTaskDone : null}
            onReviewPreventiveExecution={canManagePreventive ? onReviewPreventiveExecution : null}
            showToast={showToast}
            onDeleteExecution={canManagePreventive ? onDeleteExecution : null}
            onUpdateTask={canManagePreventive ? handleUpdateTask : null}
            onDeleteTask={canManagePreventive ? handleDeleteTask : null}
            onUpdateTaskCounter={canExecutePreventive ? handleUpdateTaskCounter : null}
            onUpdateTaskStatus={canExecutePreventive ? handleUpdateTaskStatus : null}
            onNavigateToPlanBuilder={canManagePreventive ? onNavigateToReferentiel : null}
            onCreateCorrective={canExecutePreventive ? onCreateCorrective : null}
            onNavigateToMachine={onNavigateToMachine}
          />
        </ErrorBoundary>

        {/* ========================================================================= */}
        {/* FORMULAS EXCEL MODAL FOR PREVENTIVE MAINTENANCE                           */}
        {/* ========================================================================= */}
        {showFormulasModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 md:p-6 space-y-4 relative overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                    <Calculator className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>Formules Excel & Règles de Calcul Préventif</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Matrice S1 → S52
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Règles de calcul et formules automatiques du moteur de planification CIOB GMAO Nexus
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFormulasModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
                  title="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content: 4 Formula Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Formule 1: Planning Matrice */}
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/90 flex flex-col justify-between gap-2 hover:border-indigo-300 transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">Formule S1-S52 : Planning</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100/80 text-indigo-800 border border-indigo-200 shrink-0">
                      Matrice [S1..S52]
                    </span>
                  </div>
                  <div className="font-mono text-xs text-indigo-800 font-bold bg-white p-2 rounded-lg border border-indigo-100">
                    =IF(Planning[S_n]=1, "À faire", "N/A")
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-tight">
                    Génère la présence des interventions sur la semaine ISO correspondante selon la fréquence.
                  </p>
                </div>

                {/* Formule 2: Taux de Conformité */}
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/90 flex flex-col justify-between gap-2 hover:border-emerald-300 transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">Taux de Conformité (%)</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100/80 text-emerald-800 border border-emerald-200 shrink-0">
                      Performance (%)
                    </span>
                  </div>
                  <div className="font-mono text-xs text-emerald-800 font-bold bg-white p-2 rounded-lg border border-emerald-100">
                    =(COUNTIF(Etat,"Fait")/COUNTA(Etat))*100
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-tight">
                    Rapport entre les Ordres de Travail (OT) réalisés avec succès et le total planifié.
                  </p>
                </div>

                {/* Formule 3: Décalage Échéance */}
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/90 flex flex-col justify-between gap-2 hover:border-amber-300 transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 truncate">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">Prochaine Échéance</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100/80 text-amber-800 border border-amber-200 shrink-0">
                      Date (+Jours)
                    </span>
                  </div>
                  <div className="font-mono text-xs text-amber-800 font-bold bg-white p-2 rounded-lg border border-amber-100">
                    =DATE_EXEC + VLOOKUP(Freq, Table_Freq, 2, FALSE)
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-tight">
                    Calcule la date du prochain passage (Hebdo=+7j, Mensuel=+30j, Trimestriel=+90j, Annuel=+365j).
                  </p>
                </div>

                {/* Formule 4: Coût Cumulé Préventif */}
                {showFinance && (
                  <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/90 flex flex-col justify-between gap-2 hover:border-blue-300 transition">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 truncate">
                        <DollarSign className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">
                          Coût Cumulé Préventif ({symbol} / {currencyCode})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-100/80 text-blue-800 border border-blue-200 shrink-0">
                        Coût ({symbol})
                      </span>
                    </div>
                    <div className="font-mono text-xs text-blue-800 font-bold bg-white p-2 rounded-lg border border-blue-100">
                      =(M.O_Heures * Taux_MO) + SUM(PDR_Qté * PDR_Prix)
                    </div>
                    <p className="text-[10.5px] text-slate-500 leading-tight">
                      Coût total intégrant la main d&apos;œuvre technique et les pièces détachées consommées.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowFormulasModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ========================================================================= */}
        {/* INTERACTIVE PHILOSOPHY & OPERATIONAL GUIDE MODAL                          */}
        {/* ========================================================================= */}
        {showGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col relative overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between p-5 md:p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold shrink-0 shadow-sm">
                    <BookOpen className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>Philosophie &amp; Manuel Opérationnel de la Maintenance Préventive</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Planification Calendaire &amp; Horomètres, Gouvernance Solo Expert / Équipe Complète et Gestion des Techniciens
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
                  title="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-5 md:p-6 overflow-y-auto space-y-6 text-slate-700 leading-relaxed text-sm">
                {/* 1. Philosophy Section */}
                <div className="space-y-2.5">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 border-l-4 border-teal-500 pl-2.5">
                    <Clock className="w-4 h-4 text-teal-600" />
                    <span>1. Double Déclenchement : Calendaire (S1→S52) &amp; Compteurs / Horomètres</span>
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Chaque tâche préventive est rattachée à une machine active enregistrée et programmée selon un cycle calendaire (<strong>Quotidien à Annuel</strong> sur la matrice ISO 52 semaines), un seuil compteur (<strong>Heures, Cycles ou Km</strong>), ou un mode <strong>Hybride</strong> (la première échéance atteinte déclenche l&apos;alerte). Les relevés manuels conditionnels (température, vibration, pression) permettent en outre de déclencher automatiquement une DI corrective en cas de dépassement de seuil critique.
                  </p>
                </div>

                {/* 2. Operational Methodology Section */}
                <div className="space-y-2.5">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 border-l-4 border-indigo-500 pl-2.5">
                    <Table2 className="w-4 h-4 text-indigo-600" />
                    <span>2. Standard AFNOR des Actions Préventives</span>
                  </h4>
                  <div className="text-xs text-slate-600 space-y-2">
                    <p>
                      Les gammes de maintenance s&apos;appuient sur les 4 codes fondamentaux protégés du référentiel :
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                      <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px]">C</span>
                        <strong>Contrôle</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px]">N</span>
                        <strong>Nettoyage</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-[10px]">G</span>
                        <strong>Graissage</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px]">V</span>
                        <strong>Vidange</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Stock & Lifecycle Synchronization */}
                <div className="space-y-2.5">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 border-l-4 border-emerald-500 pl-2.5">
                    <Package className="w-4 h-4 text-emerald-600" />
                    <span>3. Intégration Stock PDR &amp; Traçabilité Immuable</span>
                  </h4>
                  <ul className="list-disc list-inside text-xs text-slate-600 space-y-1.5 bg-emerald-50/40 p-3.5 rounded-xl border border-emerald-100">
                    <li>
                      <strong>Journal immuable d&apos;exécutions :</strong> chaque réalisation validée est archivée dans l&apos;historique mensuel/hebdomadaire avec l&apos;exécutant, la durée réelle, les PDR consommées et la reprogrammation automatique du prochain cycle.
                    </li>
                    <li>
                      <strong>Déstockage sécurisé (zéro double sortie) :</strong> seules les pièces consommables PDR approuvées génèrent une <strong>Sortie Interne</strong>, avec réconciliation automatique sur le N° de Bon Magasin pour éviter tout doublon.
                    </li>
                    <li>
                      <strong>Pont Préventif → Correctif :</strong> toute anomalie constatée lors d&apos;une ronde ou d&apos;une validation permet d&apos;ouvrir immédiatement une DI / BT corrective liée à la machine.
                    </li>
                  </ul>
                </div>

                {/* 4. Solo Expert vs Full Team & Field Technicians */}
                <div className="space-y-2.5">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 border-l-4 border-purple-500 pl-2.5">
                    <Gauge className="w-4 h-4 text-purple-600" />
                    <span>4. Gouvernance : Équipe Complète (Maker-Checker) vs Solo Expert</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="font-black text-slate-900 uppercase text-[11px]">
                        Mode Équipe Complète (TEAM_FULL)
                      </div>
                      <p className="text-slate-600">
                        Les techniciens terrain déclarent leurs interventions sur leur périmètre assigné (<strong>En attente validation</strong>) sans déstockage immédiat ; le responsable contrôle, réconcilie les PDR et approuve dans l&apos;onglet <strong>Historique</strong>.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-teal-50/60 border border-teal-200 space-y-1">
                      <div className="font-black text-teal-950 uppercase text-[11px]">
                        Mode Solo Expert (SOLO_EXPERT)
                      </div>
                      <p className="text-teal-900">
                        Un seul pilote planifie, filtre par technicien terrain, imprime les OT papier, réassigne les tâches en un clic, enregistre directement les exécutions et suit la charge horaire et la ponctualité par technicien sans surcharge financière ni double circuit de validation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-[10px] font-mono text-slate-400">CIOB GMAO Nexus — Module Préventif</span>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                >
                  Fermer le manuel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task Import Modal */}
        <TaskImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportSuccess={(updated) => {
            if (Array.isArray(updated)) {
              useGmaoStore.getState().setPreventiveTasks(updated);
            }
            if (showToast) {
              showToast(`Importation réussie : ${updated?.length || 0} tâches prêtes !`, 'success');
            }
          }}
        />
      </div>
    </AnimatedPage>
  );
}

