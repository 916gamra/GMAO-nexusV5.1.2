import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderOpen,
  FolderSearch,
  Info,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import {
  ALL_CANONICAL_FILES,
  buildEmptyStructure,
  CANONICAL_CATALOG_FILES,
  CANONICAL_FOLDER_DIRECTORIES,
  CANONICAL_OPERATIONAL_FILES,
  downloadEmptyDataFolderZip,
  FOLDER_MANIFEST_FILENAME,
  FOLDER_SCHEMA_VERSION,
  getSavedDataFolderLabel,
  GMAO_DATA_ROOT_DIR,
  inspectPath,
  isDirectoryPickerSupported,
  pickAndInspectDirectory,
  planRepair,
  type FolderInspectionResult,
  type FolderInspectionStatus,
  type FolderRepairPlan,
} from '../../../../application/folderStore';
import { SETTINGS_BUTTON_STYLES, SettingsSectionCard } from './settingsUi';

interface DataFolderPhaseL1CardProps {
  showToast?: (message: string, type?: string) => void;
}

type VirtualScenario = 'EMPTY' | 'VALID_FULL' | 'PARTIAL' | 'FOREIGN_NONEMPTY' | 'INVALID_MANIFEST';

const STATUS_BADGE_MAP: Record<
  FolderInspectionStatus,
  { label: string; className: string }
> = {
  EMPTY: {
    label: 'EMPTY — Prêt à initialiser',
    className: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  VALID_FULL: {
    label: 'VALID_FULL — Structure complète',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  PARTIAL: {
    label: 'PARTIAL — Réparation additive possible',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  FOREIGN_NONEMPTY: {
    label: 'FOREIGN_NONEMPTY — Dossier tiers protégé',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  INVALID_MANIFEST: {
    label: 'INVALID_MANIFEST — Manifeste invalide',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

function runVirtualInspection(scenario: VirtualScenario): {
  label: string;
  inspection: FolderInspectionResult;
  repairPlan: FolderRepairPlan;
} {
  const fullEntries = buildEmptyStructure();
  const fullManifestRaw = fullEntries.find((e) => e.path === FOLDER_MANIFEST_FILENAME)?.content;

  if (scenario === 'EMPTY') {
    const inspection = inspectPath([]);
    return {
      label: `${GMAO_DATA_ROOT_DIR} (simulation vide)`,
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  if (scenario === 'VALID_FULL') {
    const descriptors = fullEntries.map((e) => ({ path: e.path, isDirectory: e.isDirectory }));
    const inspection = inspectPath(descriptors, fullManifestRaw);
    return {
      label: `${GMAO_DATA_ROOT_DIR} (simulation complète)`,
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  if (scenario === 'PARTIAL') {
    const partialDescriptors = [
      { path: 'catalog', isDirectory: true },
      { path: 'operational', isDirectory: true },
      { path: FOLDER_MANIFEST_FILENAME, isDirectory: false },
      { path: 'catalog/ref_parc.json', isDirectory: false },
      { path: 'operational/mouvements.json', isDirectory: false },
    ];
    const inspection = inspectPath(partialDescriptors, fullManifestRaw);
    return {
      label: `${GMAO_DATA_ROOT_DIR} (simulation partielle)`,
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  if (scenario === 'FOREIGN_NONEMPTY') {
    const inspection = inspectPath([
      { path: 'Documents', isDirectory: true },
      { path: 'factures_2026.pdf', isDirectory: false },
    ]);
    return {
      label: 'Dossier_Tiers (simulation non vide)',
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  // INVALID_MANIFEST
  const descriptors = fullEntries.map((e) => ({ path: e.path, isDirectory: e.isDirectory }));
  const inspection = inspectPath(descriptors, '{"format":"UNKNOWN","files":{}}');
  return {
    label: `${GMAO_DATA_ROOT_DIR} (simulation manifeste invalide)`,
    inspection,
    repairPlan: planRepair(inspection),
  };
}

/**
 * Minimal Phase L1 card under Settings -> Sauvegardes.
 *
 * Strictly read-only inspection + downloadable empty ZIP structure generator.
 * NEVER clears live application state, NEVER calls `clearAllForRealFactory`,
 * and NEVER redirects live `DataGateway` reads/writes to the folder.
 */
export default function DataFolderPhaseL1Card({ showToast }: DataFolderPhaseL1CardProps) {
  const [savedLabel, setSavedLabel] = useState<string>(() => getSavedDataFolderLabel());
  const [inspecting, setInspecting] = useState(false);
  const [virtualScenario, setVirtualScenario] = useState<VirtualScenario>('PARTIAL');
  const [report, setReport] = useState<{
    source: 'picker' | 'virtual';
    label: string;
    inspection: FolderInspectionResult;
    repairPlan: FolderRepairPlan;
  } | null>(null);

  const pickerAvailable = isDirectoryPickerSupported();

  const handleInspectViaPicker = async () => {
    setInspecting(true);
    try {
      const result = await pickAndInspectDirectory();
      if (result) {
        setSavedLabel(result.folderLabel);
        setReport({
          source: 'picker',
          label: result.folderLabel,
          inspection: result.inspection,
          repairPlan: result.repairPlan,
        });
        showToast?.(
          `Inspection L1 terminée (${result.folderLabel}) : ${result.inspection.status}`,
          result.inspection.status === 'VALID_FULL' || result.inspection.status === 'EMPTY'
            ? 'success'
            : 'warning'
        );
      }
    } catch (err) {
      const errorName = err instanceof Error ? err.name : '';
      if (errorName !== 'AbortError') {
        showToast?.(
          err instanceof Error ? err.message : "Impossible d'inspecter le dossier sélectionné.",
          'warning'
        );
      }
    } finally {
      setInspecting(false);
    }
  };

  const handleRunVirtualInspection = () => {
    const res = runVirtualInspection(virtualScenario);
    setReport({
      source: 'virtual',
      label: res.label,
      inspection: res.inspection,
      repairPlan: res.repairPlan,
    });
  };

  const handleDownloadEmptyZip = () => {
    try {
      downloadEmptyDataFolderZip();
      showToast?.(
        `Archive structure vide téléchargée (${GMAO_DATA_ROOT_DIR}/ — ${ALL_CANONICAL_FILES.length} fichiers JSON + manifest.json).`,
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : "Échec de génération de l'archive ZIP.",
        'error'
      );
    }
  };

  const statusMeta = report ? STATUS_BADGE_MAP[report.inspection.status] : null;

  return (
    <SettingsSectionCard
      title="Dossier de données (Phase L1)"
      description={`Contrat d'arborescence ${GMAO_DATA_ROOT_DIR}/ aligné sur les 7 paquets Type A (schema v${FOLDER_SCHEMA_VERSION}). Phase L1 : inspection et génération de structure vide uniquement — le SSOT actif reste DataGateway / IndexedDB.`}
      icon={<FolderOpen className="w-4 h-4" />}
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          {pickerAvailable && (
            <button
              type="button"
              onClick={() => {
                void handleInspectViaPicker();
              }}
              disabled={inspecting}
              className={SETTINGS_BUTTON_STYLES.secondary}
            >
              <FolderSearch className="w-3.5 h-3.5" />
              <span>{inspecting ? 'Inspection...' : 'Inspecter un dossier'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadEmptyZip}
            className={SETTINGS_BUTTON_STYLES.primary}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Initialiser structure vide (.zip)</span>
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-mono text-slate-500">Dossier mémorisé (libellé)</div>
            <div className="text-xs font-bold font-mono text-slate-800 mt-1 truncate">
              {savedLabel || 'Aucun dossier inspecté'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Liaison chemin natif Windows prévue en Phase L2
            </div>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-mono text-slate-500">Arborescence canonique</div>
            <div className="text-xs font-bold font-mono text-slate-800 mt-1">
              {CANONICAL_FOLDER_DIRECTORIES.length} dossiers · {CANONICAL_CATALOG_FILES.length} Type A ·{' '}
              {CANONICAL_OPERATIONAL_FILES.length} opérationnels
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              manifest.json + catalog/ + operational/ + exports/
            </div>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-mono text-slate-500">Inspection virtuelle (sans écriture)</div>
            <div className="flex items-center gap-1.5 mt-1">
              <select
                aria-label="Scénario d'inspection virtuelle"
                value={virtualScenario}
                onChange={(e) => setVirtualScenario(e.target.value as VirtualScenario)}
                className="flex-1 min-w-0 text-xs font-mono bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
              >
                <option value="EMPTY">EMPTY</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="VALID_FULL">VALID_FULL</option>
                <option value="FOREIGN_NONEMPTY">FOREIGN_NONEMPTY</option>
                <option value="INVALID_MANIFEST">INVALID_MANIFEST</option>
              </select>
              <button
                type="button"
                onClick={handleRunVirtualInspection}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                Tester
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200/90 px-3 py-2 text-[11px] text-slate-600">
          <Info className="w-3.5 h-3.5 text-sky-700 shrink-0 mt-0.5" />
          <span>
            Mode navigateur : le téléchargement génère une archive <code>GMAO_Data_Structure_L1.zip</code>{' '}
            prête à décompresser sur le poste Windows (sans écriture fragile dans le navigateur et sans jamais
            effacer les données en cours).
          </span>
        </div>

        {report && statusMeta && (
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {report.inspection.status === 'VALID_FULL' || report.inspection.status === 'EMPTY' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : report.inspection.status === 'PARTIAL' ? (
                  <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="text-xs font-bold text-slate-800 font-mono">{report.label}</span>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.className}`}
              >
                {statusMeta.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <span className="text-slate-500">À créer : </span>
                <strong className="text-slate-900">{report.repairPlan.create.length}</strong>
              </div>
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <span className="text-slate-500">Préservés : </span>
                <strong className="text-emerald-700">{report.repairPlan.skip.length}</strong>
              </div>
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <span className="text-slate-500">Manquants : </span>
                <strong className="text-amber-700">
                  {report.inspection.missingDirectories.length + report.inspection.missingFiles.length}
                </strong>
              </div>
              <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <span className="text-slate-500">Tiers : </span>
                <strong className="text-rose-700">{report.inspection.foreignEntries.length}</strong>
              </div>
            </div>

            {report.repairPlan.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50/70 border border-amber-200 px-3 py-2 space-y-1">
                {report.repairPlan.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsSectionCard>
  );
}
