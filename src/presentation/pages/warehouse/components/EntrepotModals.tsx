import { AlertTriangle, Archive, Calculator, Trash2, X } from 'lucide-react';
import { CubeIcon } from '../../../components/common/icons/CubeIcon';
import { LayersIcon } from '../../../components/common/icons/LayersIcon';
import type { IWarehouseItem } from '../../../../types/domain';
import type { EntrepotDeleteDependencyInfo } from '../hooks/useEntrepotController';

export interface EntrepotDeleteModalProps {
  open: boolean;
  item?: IWarehouseItem | null;
  dependencyInfo?: EntrepotDeleteDependencyInfo | null;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
}

export function EntrepotDeleteModal({
  open,
  item,
  dependencyInfo,
  onCancel,
  onConfirm,
  t,
}: EntrepotDeleteModalProps) {
  if (!open) return null;

  const isBlocked = Boolean(dependencyInfo?.attachedMachine);
  const willArchive = !isBlocked && (dependencyInfo?.totalHistoryCount || 0) > 0;
  const itemCode = item?.code || item?.id_warehouse_item || '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 p-5 space-y-4 text-center">
        <div
          className={`w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto ${
            isBlocked
              ? 'bg-rose-50 border-rose-200 text-rose-600'
              : willArchive
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-rose-50 border-rose-200 text-rose-600'
          }`}
        >
          {isBlocked ? (
            <AlertTriangle className="w-6 h-6" />
          ) : willArchive ? (
            <Archive className="w-6 h-6" />
          ) : (
            <Trash2 className="w-6 h-6" />
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className="font-extrabold text-sm text-slate-900">
            {isBlocked
              ? 'Suppression bloquée'
              : willArchive
                ? "Archivage sécurisé de l'élément"
                : t('entrepot.modal.delete_title')}
          </h3>
          {itemCode && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 font-mono text-xs font-bold text-slate-800">
              <span>{itemCode}</span>
              {item?.designation && <span className="font-sans font-medium text-slate-500">— {item.designation}</span>}
            </div>
          )}

          {isBlocked ? (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-left text-xs text-rose-800 space-y-1 mt-2">
              <div className="font-bold">Cet élément est actuellement monté sur la machine [{dependencyInfo?.attachedMachine}].</div>
              <p className="text-[11px] text-rose-700">
                Détachez-le vers l&apos;entrepôt ou une zone avant de procéder à son archivage ou sa suppression.
              </p>
            </div>
          ) : willArchive ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-left text-xs text-amber-900 space-y-1 mt-2">
              <div className="font-bold">
                Historique lié détecté ({dependencyInfo?.totalHistoryCount} enregistrement(s)) :
              </div>
              <div className="text-[11px] text-amber-800 flex flex-wrap gap-1.5">
                {(dependencyInfo?.movementsCount || 0) > 0 && <span>• {dependencyInfo?.movementsCount} mouvement(s)</span>}
                {(dependencyInfo?.interventionsCount || 0) > 0 && <span>• {dependencyInfo?.interventionsCount} BT correctif(s)</span>}
                {(dependencyInfo?.preventiveCount || 0) > 0 && <span>• {dependencyInfo?.preventiveCount} préventif(s)</span>}
                {(dependencyInfo?.sortiesExterneCount || 0) > 0 && <span>• {dependencyInfo?.sortiesExterneCount} sortie(s) ext.</span>}
                {(dependencyInfo?.bobinageCount || 0) > 0 && <span>• {dependencyInfo?.bobinageCount} rebobinage(s)</span>}
              </div>
              <p className="text-[11px] text-amber-800 pt-0.5">
                Pour préserver la traçabilité GMAO, cet élément sera <b>archivé (ARCHIVEE)</b> au lieu d&apos;être effacé.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-1">{t('entrepot.modal.delete_confirm')}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer text-xs"
          >
            {t('entrepot.buttons.cancel')}
          </button>
          <button
            type="button"
            disabled={isBlocked}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl font-bold transition text-xs ${
              isBlocked
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : willArchive
                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-sm'
                  : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-[0_12px_32px_-6px_rgba(0,0,0,0.12),0_4px_12px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.16),0_6px_16px_-3px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 ease-out'
            }`}
          >
            {willArchive ? 'Archiver' : t('entrepot.buttons.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface EntrepotFormulasModalProps {
  open: boolean;
  onClose: () => void;
  t: (key: string) => string;
}

export function EntrepotFormulasModal({
  open,
  onClose,
  t,
}: EntrepotFormulasModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>{t('entrepot.formulas.title')}</span>
              </h3>
              <p className="text-xs text-slate-500">{t('entrepot.formulas.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
            title={t('entrepot.buttons.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/90 flex flex-col justify-between gap-2 hover:border-blue-300 transition">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 truncate">
                <CubeIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{t('entrepot.formulas.f1_title')}</span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-100/80 text-blue-800 border border-blue-200 shrink-0">
                Col. [H]
              </span>
            </div>
            <div className="font-mono text-xs text-blue-800 font-bold bg-white p-2 rounded-lg border border-blue-100">
              Code = Auto(Famille, Template)
            </div>
            <p className="text-[10.5px] text-slate-500 leading-tight">
              {t('entrepot.formulas.f1_desc')}
            </p>
          </div>

          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/90 flex flex-col justify-between gap-2 hover:border-indigo-300 transition">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 truncate">
                <LayersIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">{t('entrepot.formulas.f2_title')}</span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100/80 text-indigo-800 border border-indigo-200 shrink-0">
                Col. [G]
              </span>
            </div>
            <div className="font-mono text-xs text-indigo-800 font-bold bg-white p-2 rounded-lg border border-indigo-100">
              Code = Auto(Type, Désignation)
            </div>
            <p className="text-[10.5px] text-slate-500 leading-tight">
              {t('entrepot.formulas.f2_desc')}
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-medium">
            {t('entrepot.formulas.footer_note')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition shadow-[0_12px_32px_-6px_rgba(0,0,0,0.12),0_4px_12px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.16),0_6px_16px_-3px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 ease-out cursor-pointer"
          >
            {t('entrepot.buttons.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
