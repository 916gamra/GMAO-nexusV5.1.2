import type { Dispatch, SetStateAction } from 'react';
import { Cpu, User } from 'lucide-react';
import type { IWarehouseItem } from '../../../../types/domain';
import type { CorrectiveInterventionItem } from '../../../../types/store';
import type {
  LiveInterventionFormState,
  LiveWarehouseOption,
} from '../hooks/useInterventionLiveController';

interface InterventionLiveLifecycleStepProps {
  activeIntervention: CorrectiveInterventionItem;
  formState: LiveInterventionFormState;
  setFormState: Dispatch<SetStateAction<LiveInterventionFormState>>;
  machineComponents: IWarehouseItem[];
  machineParts: IWarehouseItem[];
  isWizardMode: boolean;
  liveWorkingTime: { formatted: string; minutes: number };
  isTechUser?: boolean;
  canManageCorrective?: boolean;
  activeTechnicianOptions?: Array<{ id_technician: string; nom: string; specialite: string }>;
}

export function InterventionLiveLifecycleStep({
  activeIntervention,
  formState,
  setFormState,
  machineComponents,
  machineParts,
  isWizardMode,
  liveWorkingTime,
  isTechUser = false,
  canManageCorrective = !isTechUser,
  activeTechnicianOptions = [],
}: InterventionLiveLifecycleStepProps) {
  return (
    <div className="space-y-4">
      {/* Intervenant exécutant (Attribution / Modification directe pour Solo Expert & Responsable) */}
      {canManageCorrective && (
        <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-700 shrink-0" />
            <div>
              <div className="text-[10.5px] font-black uppercase tracking-wider text-indigo-950">
                Technicien / Intervenant Exécutant (Col D)
              </div>
              <div className="text-[10px] text-indigo-700">
                Permet d&apos;affecter ou d&apos;ajuster l&apos;intervenant réel avant clôture pour le calcul MTTR
              </div>
            </div>
          </div>
          <select
            data-testid="live-closure-intervenant-select"
            value={formState.intervenant || activeIntervention.intervenant || ''}
            onChange={(e) => {
              const nextName = e.target.value;
              const matched = activeTechnicianOptions.find(
                (t) => t.nom.toLowerCase() === nextName.toLowerCase()
              );
              setFormState((prev) => ({
                ...prev,
                intervenant: nextName,
                technicien_matricule: matched?.id_technician || prev.technicien_matricule || '',
              }));
            }}
            className="py-1.5 px-3 text-xs font-bold rounded-xl border border-indigo-200 bg-white text-slate-900 focus:border-indigo-400 focus:outline-hidden min-w-[220px]"
          >
            <option value="">— Sélectionner un intervenant —</option>
            {activeTechnicianOptions.map((tech) => (
              <option key={tech.id_technician || tech.nom} value={tech.nom}>
                {tech.nom} ({tech.specialite})
              </option>
            ))}
            {Boolean(formState.intervenant || activeIntervention.intervenant) &&
              !activeTechnicianOptions.some(
                (t) =>
                  t.nom.toLowerCase() ===
                  String(formState.intervenant || activeIntervention.intervenant || '')
                    .trim()
                    .toLowerCase()
              ) && (
                <option value={String(formState.intervenant || activeIntervention.intervenant)}>
                  {String(formState.intervenant || activeIntervention.intervenant)}
                </option>
              )}
          </select>
        </div>
      )}

      {/* Organe / Composant (Cycle de vie) & Part (Localisation Structurelle — Sans déstockage) */}
      {(machineComponents.length > 0 ||
        machineParts.length > 0 ||
        formState.id_composant ||
        formState.id_part ||
        isWizardMode) && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-cyan-700" />
              <span>Organe / Composant (Cycle de vie)</span>
            </label>
            <select
              value={formState.id_composant || ''}
              onChange={(e) => {
                const val = e.target.value;
                const found = (machineComponents as LiveWarehouseOption[]).find(
                  (c) => String(c.id_warehouse_item || c.id || c.id_item || '') === val
                );
                setFormState({
                  ...formState,
                  id_composant: val,
                  nom_composant: found
                    ? String(found.designation || found.nom_composant || found.nom || val)
                    : '',
                });
              }}
              className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:border-cyan-400 focus:outline-hidden"
            >
              <option value="">— Aucun composant spécifique —</option>
              {(machineComponents as LiveWarehouseOption[]).map((comp) => {
                const cId = String(comp.id_warehouse_item || comp.id || comp.id_item || '');
                return (
                  <option key={cId} value={cId}>
                    {cId} · {comp.designation || comp.nom || 'Composant'} (
                    {comp.status || 'En service'})
                  </option>
                );
              })}
            </select>
          </div>
          {formState.id_composant && (
            <div>
              <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">
                État du Composant après clôture
              </label>
              <select
                value={formState.statut_composant_cloture || 'En service'}
                onChange={(e) =>
                  setFormState({ ...formState, statut_composant_cloture: e.target.value })
                }
                className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white focus:border-cyan-400 focus:outline-hidden"
              >
                <option value="En service">En service (Opérationnel sur machine)</option>
                <option value="En réparation">En réparation (Déposé atelier / révision)</option>
                <option value="Hors service">Hors service (À réformer / remplacer)</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">
              Localisation / Part Structurelle (Sans déstockage)
            </label>
            <select
              value={formState.id_part || ''}
              onChange={(e) => {
                const val = e.target.value;
                const found = (machineParts as LiveWarehouseOption[]).find(
                  (p) => String(p.id_warehouse_item || p.id || p.id_item || '') === val
                );
                setFormState({
                  ...formState,
                  id_part: val,
                  nom_part: found
                    ? String(found.designation_part || found.designation || found.nom || val)
                    : '',
                });
              }}
              className="w-full py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:border-cyan-400 focus:outline-hidden"
            >
              <option value="">— Aucun site structurel —</option>
              {(machineParts as LiveWarehouseOption[]).map((part) => {
                const pId = String(part.id_warehouse_item || part.id || part.id_item || '');
                return (
                  <option key={pId} value={pId}>
                    {pId} · {part.designation_part || part.designation || part.nom || 'Part'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      )}

      {/* Synthèse finale en mode Wizard */}
      {isWizardMode && (
        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-amber-950">
              Synthèse du Bon de Travail ({activeIntervention.num_bt || 'BT'})
            </span>
            <span className="font-mono font-bold text-amber-900 bg-white px-2.5 py-0.5 rounded border border-amber-200">
              Temps Ouvré : {liveWorkingTime.formatted}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px] text-slate-700">
            <div>
              <span className="text-slate-500">Machine : </span>
              <strong className="font-mono text-slate-900">{activeIntervention.code_machine}</strong>
            </div>
            <div>
              <span className="text-slate-500">PDR déclarées : </span>
              <strong className="font-mono text-slate-900">
                {Array.isArray(formState.pieces_utilisees) && formState.pieces_utilisees.length > 0
                  ? `${formState.pieces_utilisees.length} réf.`
                  : formState.pdr_ref
                    ? `1 réf. (${formState.pdr_ref})`
                    : 'Aucune PDR'}
              </strong>
            </div>
            <div className="sm:col-span-2 truncate">
              <span className="text-slate-500">Action Réalisée (Col K) : </span>
              <strong className="text-slate-900">
                {formState.action_realisee || formState.travail_a_faire || 'Non renseignée'}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
