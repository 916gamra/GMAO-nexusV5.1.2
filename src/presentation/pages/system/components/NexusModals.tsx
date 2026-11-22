import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  Layers,
  Plus,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTranslation } from '../../../../i18n/I18nContext';
import type { IMachine, ITechnician, IZone } from '../../../../types/domain';
import type { MachineElement } from '../../../../types/store';
import type { BlueprintLedgerElement } from '../../../../core/domain/Blueprint';

export interface NexusElementFormData {
  element_type: string;
  ref_element: string;
  designation: string;
  qte_montee: number;
  unite: string;
  criticalite: string;
  duree_vie_estimee_heures: number;
  heures_actuelles: number;
  date_installation: string;
  emplacement_machine: string;
  parent_component_key: string;
  technicien: string;
  statut: string;
  remarques: string;
}

export interface NexusBlueprintConformity {
  blueprintId: string;
  totalTheoretical: number;
  mountedCount: number;
  missingCount: number;
  conformityRate: number;
  missingEntries: BlueprintLedgerElement[];
  matchedEntries: BlueprintLedgerElement[];
  extraEntries: BlueprintLedgerElement[];
}

export interface NexusPdrStockStatus {
  isPdr: boolean;
  available: number | null;
  status: string;
  label: string;
}

export interface NexusModalsProps {
  isGapModalOpen: boolean;
  setIsGapModalOpen: (v: boolean) => void;
  blueprintConformity: NexusBlueprintConformity | null;
  activeMachine: IMachine | null;
  canManageNexus: boolean;
  handleInitializeFromBlueprint: () => void;
  getPdrLiveStockStatus: (item: BlueprintLedgerElement) => NexusPdrStockStatus;
  handleMountSingleMissingEntry: (entry: BlueprintLedgerElement) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (v: boolean) => void;
  editingElement: BlueprintLedgerElement | MachineElement | null;
  formData: NexusElementFormData;
  setFormData: React.Dispatch<React.SetStateAction<NexusElementFormData>>;
  handleSaveElement: (e: React.FormEvent) => void;
  referenceOptions: Array<{ ref: string; designation: string; stock: number }>;
  machineOrganes: BlueprintLedgerElement[];
  defaultMachineTechnician: string;
  activeTechnicians: ITechnician[];
}

export function NexusModals({
  isGapModalOpen,
  setIsGapModalOpen,
  blueprintConformity,
  activeMachine,
  canManageNexus,
  handleInitializeFromBlueprint,
  getPdrLiveStockStatus,
  handleMountSingleMissingEntry,
  isAddModalOpen,
  setIsAddModalOpen,
  editingElement,
  formData,
  setFormData,
  handleSaveElement,
  referenceOptions,
  machineOrganes,
  defaultMachineTechnician,
  activeTechnicians,
}: NexusModalsProps) {
  const { t } = useTranslation();
  const isEditingEntrepot = Boolean(editingElement && editingElement._source === 'ENTREPOT');

  return (
    <>
      {/* 5. MODAL NEX-6 : ANALYSE D'ÉCARTS BLUEPRINT (AS-DESIGNED) VS NEXUS (AS-BUILT) */}
      {isGapModalOpen && blueprintConformity && activeMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 space-y-5 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <GitCompare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('nexus.modals.gapTitle', {
                      machine: activeMachine.id_machine_registered,
                      blueprint: blueprintConformity.blueprintId,
                    })}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t('nexus.modals.gapSubtitle', {
                      rate: blueprintConformity.conformityRate,
                      mounted: blueprintConformity.mountedCount,
                      total: blueprintConformity.totalTheoretical,
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGapModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 text-xs">
              {/* Section A: Éléments Manquants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-rose-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      {t('nexus.modals.gapMissingSection', {
                        machine: activeMachine.id_machine_registered,
                        count: blueprintConformity.missingEntries.length,
                      })}
                    </span>
                  </h4>
                  {canManageNexus && blueprintConformity.missingEntries.length > 0 && (
                    <button
                      type="button"
                      onClick={handleInitializeFromBlueprint}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>
                        {t('nexus.actions.mountAll', {
                          count: blueprintConformity.missingEntries.length,
                        })}
                      </span>
                    </button>
                  )}
                </div>

                {blueprintConformity.missingEntries.length === 0 ? (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{t('nexus.modals.gapNoMissing')}</span>
                  </div>
                ) : (
                  <div className="border border-rose-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-rose-50/70 border-b border-rose-200 text-rose-900 font-bold text-[10px] uppercase">
                        <tr>
                          <th className="py-2 px-3">{t('nexus.modals.colType')}</th>
                          <th className="py-2 px-3">{t('nexus.modals.colRef')}</th>
                          <th className="py-2 px-3">{t('nexus.modals.colDesignation')}</th>
                          <th className="py-2 px-3">{t('nexus.modals.colLocation')}</th>
                          <th className="py-2 px-3 text-center">{t('nexus.modals.colQty')}</th>
                          <th className="py-2 px-3">{t('nexus.modals.colStock')}</th>
                          {canManageNexus && (
                            <th className="py-2 px-3 text-right">{t('nexus.modals.colAction')}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {blueprintConformity.missingEntries.map((entry: BlueprintLedgerElement) => {
                          const st = getPdrLiveStockStatus(entry);
                          return (
                            <tr key={entry.ref_element} className="hover:bg-rose-50/30">
                              <td className="py-2 px-3 font-mono font-bold">{entry.element_type}</td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                {entry.ref_element}
                              </td>
                              <td className="py-2 px-3 text-slate-700">{entry.designation}</td>
                              <td className="py-2 px-3 text-slate-500">
                                {entry.emplacement_machine || entry.parent_component_key || '—'}
                              </td>
                              <td className="py-2 px-3 text-center font-mono font-bold">
                                {entry.qte_montee}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px]">{st.label}</td>
                              {canManageNexus && (
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleMountSingleMissingEntry(entry)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>{t('nexus.actions.mountSingle')}</span>
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section B: Éléments Conformes */}
              <div className="space-y-2">
                <h4 className="font-bold text-emerald-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {t('nexus.modals.gapMatchedSection', {
                      count: blueprintConformity.matchedEntries.length,
                    })}
                  </span>
                </h4>
                {blueprintConformity.matchedEntries.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-500">
                    {t('nexus.modals.gapNoMatched')}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {blueprintConformity.matchedEntries.map((el: BlueprintLedgerElement) => (
                      <span
                        key={el.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-semibold"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>
                          {el.ref_element} ({el.designation}) ×{el.qte_montee}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Section C: Éléments Hors-Blueprint (Ajouts Terrain As-Built) */}
              <div className="space-y-2">
                <h4 className="font-bold text-indigo-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    {t('nexus.modals.gapExtraSection', {
                      count: blueprintConformity.extraEntries.length,
                    })}
                  </span>
                </h4>
                {blueprintConformity.extraEntries.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-500">
                    {t('nexus.modals.gapNoExtra')}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {blueprintConformity.extraEntries.map((el: BlueprintLedgerElement) => (
                      <span
                        key={el.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[11px] font-semibold"
                      >
                        <span>
                          [{el.element_type}] {el.ref_element} — {el.designation}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsGapModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                {t('nexus.actions.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL INTERACTIF D'AJOUT / MODIFICATION D'UN ÉLÉMENT */}
      {isAddModalOpen && canManageNexus && activeMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full p-6 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingElement
                    ? t('nexus.modals.editTitle')
                    : t('nexus.modals.addTitle', {
                        machine: activeMachine.id_machine_registered,
                      })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEditingEntrepot && (
              <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-800 font-medium">
                {t('nexus.modals.entrepotReadOnlyNotice')}
              </div>
            )}

            <form onSubmit={handleSaveElement} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {/* Type de pièce */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldType')}
                  </label>
                  <select
                    value={formData.element_type}
                    disabled={isEditingEntrepot}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        element_type: e.target.value,
                        ...(editingElement ? {} : { ref_element: '', designation: '' }),
                      })
                    }
                    className={`w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 ${
                      isEditingEntrepot ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                    }`}
                  >
                    <option value="PDR">{t('nexus.modals.typePdr')}</option>
                    <option value="COMPONENT">{t('nexus.modals.typeComponent')}</option>
                    <option value="PART">{t('nexus.modals.typePart')}</option>
                  </select>
                </div>

                {/* Criticité */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldCriticality')}
                  </label>
                  <select
                    value={formData.criticalite}
                    onChange={(e) => setFormData({ ...formData, criticalite: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="CRITIQUE">{t('nexus.modals.critCritical')}</option>
                    <option value="MAJEURE">{t('nexus.modals.critMajor')}</option>
                    <option value="MINEURE">{t('nexus.modals.critMinor')}</option>
                  </select>
                </div>
              </div>

              {/* Sélection ou Saisie de la référence */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {t('nexus.modals.fieldRef')}
                </label>
                <div className="space-y-1.5">
                  {!isEditingEntrepot && (
                    <select
                      value={formData.ref_element}
                      onChange={(e) => {
                        const selectedRef = e.target.value;
                        const found = referenceOptions.find((o) => o.ref === selectedRef);
                        setFormData({
                          ...formData,
                          ref_element: selectedRef,
                          designation: found?.designation || formData.designation,
                        });
                      }}
                      className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono text-xs"
                    >
                      <option value="">
                        {t('nexus.modals.selectRefPlaceholder', {
                          count: referenceOptions.length,
                        })}
                      </option>
                      {referenceOptions.map((opt) => (
                        <option key={opt.ref} value={opt.ref}>
                          {opt.ref} — {opt.designation} (
                          {t('nexus.modals.availLabel', { qty: opt.stock })})
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="text"
                    disabled={isEditingEntrepot}
                    placeholder={t('nexus.modals.freeRefPlaceholder')}
                    value={formData.ref_element}
                    onChange={(e) => setFormData({ ...formData, ref_element: e.target.value })}
                    className={`w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono text-xs ${
                      isEditingEntrepot ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Désignation */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {t('nexus.modals.fieldDesignation')}
                </label>
                <input
                  type="text"
                  placeholder={t('nexus.modals.designationPlaceholder')}
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* NEX-4: Rattachement hiérarchique à un Organe/Composant Parent sur la machine */}
              {formData.element_type === 'PDR' && machineOrganes.length > 0 && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldParentOrgane', {
                      machine: activeMachine.id_machine_registered,
                    })}
                  </label>
                  <select
                    value={formData.parent_component_key}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({
                        ...formData,
                        parent_component_key: val,
                        emplacement_machine: formData.emplacement_machine || val,
                      });
                    }}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-purple-50/40 focus:outline-hidden focus:border-emerald-500 font-mono text-xs"
                  >
                    <option value="">{t('nexus.modals.parentNone')}</option>
                    {machineOrganes.map((org) => (
                      <option key={org.ref_element} value={org.ref_element}>
                        [{org.element_type}] {org.ref_element} — {org.designation}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Quantité montée */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldQty')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.qte_montee}
                    onChange={(e) =>
                      setFormData({ ...formData, qte_montee: Number(e.target.value) || 1 })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                </div>

                {/* Unité */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldUnit')}
                  </label>
                  <input
                    type="text"
                    list="nexus-unit-options"
                    value={formData.unite}
                    onChange={(e) => setFormData({ ...formData, unite: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                  <datalist id="nexus-unit-options">
                    <option value="U" />
                    <option value="pcs" />
                    <option value="m" />
                    <option value="L" />
                    <option value="kg" />
                    <option value="jeu" />
                    <option value="kit" />
                  </datalist>
                </div>

                {/* Durée de vie estimée */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldLifeHours')}
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    value={formData.duree_vie_estimee_heures}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        duree_vie_estimee_heures: Number(e.target.value) || 5000,
                      })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                </div>

                {/* Heures actuelles */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldCurrentHours')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.heures_actuelles}
                    onChange={(e) =>
                      setFormData({ ...formData, heures_actuelles: Number(e.target.value) || 0 })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Date d'installation */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldInstallDate')}
                  </label>
                  <input
                    type="date"
                    value={formData.date_installation}
                    onChange={(e) =>
                      setFormData({ ...formData, date_installation: e.target.value })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                </div>

                {/* Technicien Responsable (SSOT Actif) */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldTechnician')}
                  </label>
                  <select
                    value={formData.technicien}
                    onChange={(e) => setFormData({ ...formData, technicien: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value={defaultMachineTechnician}>
                      {defaultMachineTechnician} {t('nexus.modals.machineReferentSuffix')}
                    </option>
                    {activeTechnicians
                      .filter((tItem) => String(tItem.nom || tItem.name || '') !== defaultMachineTechnician)
                      .map((tItem) => {
                        const tName = String(tItem.nom || tItem.name || '');
                        return (
                          <option key={String(tItem.id_technician || tItem.id || tName)} value={tName}>
                            {tName} ({String(tItem.id_zone || tItem.zone || 'Usine')})
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Emplacement machine */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldLocation')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('nexus.modals.locationPlaceholder')}
                    value={formData.emplacement_machine}
                    onChange={(e) =>
                      setFormData({ ...formData, emplacement_machine: e.target.value })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                {/* Statut */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {t('nexus.modals.fieldStatus')}
                  </label>
                  <select
                    value={formData.statut}
                    onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="OPERATIONNEL">{t('nexus.modals.statusOperational')}</option>
                    <option value="A_REMPLACER">{t('nexus.modals.statusToReplace')}</option>
                    <option value="EN_REVISION">{t('nexus.modals.statusInRevision')}</option>
                  </select>
                </div>
              </div>

              {/* Remarques & Observations */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {t('nexus.modals.fieldRemarks')}
                </label>
                <textarea
                  rows={2}
                  placeholder={t('nexus.modals.remarksPlaceholder')}
                  value={formData.remarques}
                  onChange={(e) => setFormData({ ...formData, remarques: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-emerald-500 resize-y"
                />
              </div>

              {/* Boutons d'action du formulaire */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition cursor-pointer"
                >
                  {t('nexus.actions.cancel')}
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95 cursor-pointer"
                >
                  {editingElement
                    ? t('nexus.actions.saveChanges')
                    : t('nexus.actions.mountThisElement')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function downloadNexusTemplateExcel(
  activeMachine: IMachine | null,
  defaultMachineTechnician: string,
  showToast?: (message: string, type?: string) => void
) {
  try {
    const wb = XLSX.utils.book_new();
    const targetMach = activeMachine?.id_machine_registered || 'DET-01';
    const targetTech = defaultMachineTechnician || 'Technicien';
    const today = new Date().toISOString().split('T')[0];

    const templateRows = [
      {
        'Machine ID': targetMach,
        Type: 'PDR',
        'Référence Élément': 'ROUL-6205-2RS',
        Désignation: 'Roulement SKF 6205-2RS C3',
        'Organe Parent': 'MOT-01',
        'Emplacement Machine': 'Palier Avant Broche',
        'Qté Montée': 2,
        Unité: 'U',
        Criticité: 'CRITIQUE',
        'Durée de Vie (H)': 5000,
        'Heures Actuelles': 0,
        'Date Installation': today,
        Technicien: targetTech,
        Statut: 'OPERATIONNEL',
        Remarques: 'Exemple de ligne PDR à importer',
      },
      {
        'Machine ID': targetMach,
        Type: 'COMPONENT',
        'Référence Élément': 'MOT-01',
        Désignation: 'Moteur Asynchrone 5.5kW',
        'Organe Parent': '',
        'Emplacement Machine': 'Entraînement Principal',
        'Qté Montée': 1,
        Unité: 'U',
        Criticité: 'CRITIQUE',
        'Durée de Vie (H)': 15000,
        'Heures Actuelles': 0,
        'Date Installation': today,
        Technicien: targetTech,
        Statut: 'OPERATIONNEL',
        Remarques: 'Exemple de composant parent',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    const headers = Object.keys(templateRows[0]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 6, 16) }));
    XLSX.utils.book_append_sheet(wb, ws, 'MODELE_BOM_NEXUS');
    XLSX.writeFile(wb, `Modele_Import_Nexus_BOM_${targetMach}.xlsx`);
    showToast?.('Modèle Excel BOM téléchargé avec succès.', 'success');
  } catch {
    showToast?.('Erreur lors de la génération du modèle Excel.', 'error');
  }
}

export function exportNexusBomExcel({
  activeMachine,
  activeZone,
  currentMachineElements,
  machineElementsLedger,
  computeEffectiveWearHours,
  getPdrLiveStockStatus,
  showToast,
}: {
  activeMachine: IMachine | null;
  activeZone: IZone | null | undefined;
  currentMachineElements: BlueprintLedgerElement[];
  machineElementsLedger: MachineElement[];
  computeEffectiveWearHours: (item: BlueprintLedgerElement) => { hours: number; isEstimated: boolean };
  getPdrLiveStockStatus: (item: BlueprintLedgerElement) => NexusPdrStockStatus;
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info' | string) => void;
}) {
  try {
    const wb = XLSX.utils.book_new();
    const applyCols = (ws: XLSX.WorkSheet, rows: Record<string, unknown>[]) => {
      if (!rows || rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      ws['!cols'] = headers.map((h) => {
        const maxLen = rows.reduce(
          (acc, r) => Math.max(acc, String(r[h] ?? '').length),
          h.length
        );
        return { wch: Math.min(Math.max(maxLen + 3, 12), 42) };
      });
    };

    const machineCode = activeMachine?.id_machine_registered || 'USINE';

    const currentBOMData = currentMachineElements.map((item) => {
      const { hours } = computeEffectiveWearHours(item);
      const maxH = Number(item.duree_vie_estimee_heures) || 5000;
      const remainingH = Math.max(0, maxH - hours);
      const wearPct = Math.min(100, Math.round((hours / maxH) * 100));
      const stockSt = getPdrLiveStockStatus(item);

      return {
        'Machine ID': item.id_machine_registered,
        'Désignation Machine': activeMachine?.designation || activeMachine?.nom || '',
        Zone: activeZone?.nom || activeZone?.code_zone || activeMachine?.id_zone_default || '',
        Type: item.element_type,
        'Référence Élément': item.ref_element,
        Désignation: item.designation,
        'Organe Parent': item.parent_component_key || '—',
        'Emplacement Machine': item.emplacement_machine || '—',
        'Qté Montée': item.qte_montee,
        Unité: item.unite || 'U',
        Criticité: item.criticalite,
        'Stock Magasin Dispo': stockSt.isPdr ? stockSt.available : 'N/A (Organe)',
        'Statut Stock': stockSt.label,
        'Durée de Vie (H)': maxH,
        'Heures Usure': hours,
        'RUL Restant (H)': remainingH,
        'Usure (%)': `${wearPct}%`,
        'Date Installation': item.date_installation || '—',
        Technicien: item.technicien || '—',
        Statut: item.statut || 'OPERATIONNEL',
        Source: item._source || 'LEDGER',
        Remarques: item.remarques || '',
      };
    });

    const wsCurrent = XLSX.utils.json_to_sheet(
      currentBOMData.length > 0
        ? currentBOMData
        : [{ Info: `Aucun élément monté sur ${machineCode}` }]
    );
    applyCols(wsCurrent, currentBOMData);
    XLSX.utils.book_append_sheet(wb, wsCurrent, `BOM_${machineCode}`.slice(0, 31));

    const fullBOMData = (machineElementsLedger || []).map((item) => ({
      'Machine ID': item.id_machine_registered,
      Type: item.element_type,
      'Référence Élément': item.ref_element,
      Désignation: item.designation,
      'Organe Parent': item.parent_component_key || '—',
      'Emplacement Machine': item.emplacement_machine || '—',
      'Qté Montée': item.qte_montee,
      Unité: item.unite || 'U',
      Criticité: item.criticalite,
      'Durée de Vie (H)': item.duree_vie_estimee_heures,
      'Heures Actuelles': item.heures_actuelles,
      'Date Installation': item.date_installation,
      Technicien: item.technicien,
      Statut: item.statut,
      Remarques: item.remarques,
    }));
    const wsFull = XLSX.utils.json_to_sheet(
      fullBOMData.length > 0 ? fullBOMData : [{ Info: 'Registre BOM Usine vide' }]
    );
    applyCols(wsFull, fullBOMData);
    XLSX.utils.book_append_sheet(wb, wsFull, 'REGISTRE_BOM_COMPLET');

    XLSX.writeFile(wb, `GMAO_Nexus_BOM_${machineCode}.xlsx`);
    showToast?.('Nomenclature BOM exportée avec succès en Excel (.xlsx).', 'success');
  } catch {
    showToast?.("Erreur lors de l'export Excel.", 'error');
  }
}
