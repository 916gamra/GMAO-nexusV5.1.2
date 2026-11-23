import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  HardDrive,
  Info,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Unlink,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  ALL_CANONICAL_FILES,
  buildEmptyStructure,
  CANONICAL_CATALOG_FILES,
  CANONICAL_CONFIG_FILES,
  CANONICAL_FOLDER_DIRECTORIES,
  CANONICAL_OPERATIONAL_FILES,
  downloadEmptyDataFolderZip,
  downloadLiveStateDataFolderZip,
  FOLDER_MANIFEST_FILENAME,
  FOLDER_SCHEMA_VERSION,
  folderSyncService,
  getSavedDataFolderLabel,
  GMAO_DATA_ROOT_DIR,
  inspectPath,
  isDirectoryPickerSupported,
  MemoryFolderFsAdapter,
  parseZipArchiveEntriesAsync,
  pickAndInspectDirectory,
  planRepair,
  serializeLiveStateToFolderFiles,
  type FolderConnectionState,
  type FolderHydrationReport,
  type FolderInspectionResult,
  type FolderInspectionStatus,
  type FolderRepairPlan,
  type FolderSyncStatusSnapshot,
  type GmaoStorageMode,
  type IFolderFsAdapter,
} from '../../../../application/folderStore';
import { SETTINGS_BUTTON_STYLES, SettingsSectionCard } from './settingsUi';

interface DataFolderPhaseL1CardProps {
  showToast?: (message: string, type?: string) => void;
  onOpenIntegrityTab?: () => void;
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

const CONNECTION_BADGE_MAP: Record<
  FolderConnectionState,
  { label: string; className: string }
> = {
  CONNECTED: {
    label: 'Connecté',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  SYNCING: {
    label: 'Synchronisation...',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  NEEDS_PERMISSION: {
    label: 'Autorisation requise',
    className: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  ERROR: {
    label: 'Erreur disque',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  DISCONNECTED: {
    label: 'Non connecté',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

function createVirtualScenarioAdapter(scenario: VirtualScenario): {
  label: string;
  adapter: MemoryFolderFsAdapter;
  inspection: FolderInspectionResult;
  repairPlan: FolderRepairPlan;
} {
  const fullEntries = serializeLiveStateToFolderFiles({ includeRootPrefix: false });
  const fullManifestRaw = fullEntries.find((e) => e.path === FOLDER_MANIFEST_FILENAME)?.content;

  if (scenario === 'EMPTY') {
    const adapter = new MemoryFolderFsAdapter(`${GMAO_DATA_ROOT_DIR} (simulation vide)`);
    const inspection = inspectPath([]);
    return {
      label: adapter.getLabel(),
      adapter,
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  if (scenario === 'VALID_FULL') {
    const adapter = new MemoryFolderFsAdapter(
      `${GMAO_DATA_ROOT_DIR} (simulation complète)`,
      fullEntries
    );
    const descriptors = fullEntries.map((e) => ({ path: e.path, isDirectory: e.isDirectory }));
    const inspection = inspectPath(descriptors, fullManifestRaw);
    return {
      label: adapter.getLabel(),
      adapter,
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  if (scenario === 'PARTIAL') {
    const partialEntries = fullEntries.filter(
      (e) =>
        e.path === 'catalog' ||
        e.path === 'operational' ||
        e.path === FOLDER_MANIFEST_FILENAME ||
        e.path === 'catalog/ref_parc.json' ||
        e.path === 'operational/mouvements.json'
    );
    const adapter = new MemoryFolderFsAdapter(
      `${GMAO_DATA_ROOT_DIR} (simulation partielle)`,
      partialEntries
    );
    const descriptors = partialEntries.map((e) => ({ path: e.path, isDirectory: e.isDirectory }));
    const inspection = inspectPath(descriptors, fullManifestRaw);
    return {
      label: adapter.getLabel(),
      adapter,
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  if (scenario === 'FOREIGN_NONEMPTY') {
    const foreignEntries = [
      { path: 'Documents', isDirectory: true, content: null },
      { path: 'factures_2026.pdf', isDirectory: false, content: '%PDF-1.7' },
    ];
    const adapter = new MemoryFolderFsAdapter(
      'Dossier_Tiers (simulation non vide)',
      foreignEntries
    );
    const inspection = inspectPath([
      { path: 'Documents', isDirectory: true },
      { path: 'factures_2026.pdf', isDirectory: false },
    ]);
    return {
      label: adapter.getLabel(),
      adapter,
      inspection,
      repairPlan: planRepair(inspection),
    };
  }

  // INVALID_MANIFEST
  const invalidEntries = buildEmptyStructure({ includeRootPrefix: false }).map((e) =>
    e.path === FOLDER_MANIFEST_FILENAME
      ? { ...e, content: '{"format":"UNKNOWN","files":{}}' }
      : e
  );
  const adapter = new MemoryFolderFsAdapter(
    `${GMAO_DATA_ROOT_DIR} (simulation manifeste invalide)`,
    invalidEntries
  );
  const descriptors = invalidEntries.map((e) => ({ path: e.path, isDirectory: e.isDirectory }));
  const inspection = inspectPath(descriptors, '{"format":"UNKNOWN","files":{}}');
  return {
    label: adapter.getLabel(),
    adapter,
    inspection,
    repairPlan: planRepair(inspection),
  };
}

/**
 * Phase L1 + Phase L2 (L2.1–L2.4) Local Folder Storage & Dual-Mode Persistence Control Panel.
 */
export default function DataFolderPhaseL1Card({
  showToast,
  onOpenIntegrityTab,
}: DataFolderPhaseL1CardProps) {
  const [savedLabel, setSavedLabel] = useState<string>(() => getSavedDataFolderLabel());
  const [syncSnapshot, setSyncSnapshot] = useState<FolderSyncStatusSnapshot>(() =>
    folderSyncService.getSnapshot()
  );
  const [busy, setBusy] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [virtualScenario, setVirtualScenario] = useState<VirtualScenario>('PARTIAL');
  const [confirmOverwriteValidFolder, setConfirmOverwriteValidFolder] = useState(false);
  const [hydrationReport, setHydrationReport] = useState<FolderHydrationReport | null>(null);
  const [report, setReport] = useState<{
    source: 'picker' | 'virtual' | 'zip';
    label: string;
    adapter: IFolderFsAdapter;
    inspection: FolderInspectionResult;
    repairPlan: FolderRepairPlan;
  } | null>(null);

  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const pickerAvailable = isDirectoryPickerSupported();

  const refreshAdapterInspection = async (
    adapter: IFolderFsAdapter,
    source: 'picker' | 'virtual' | 'zip' = 'picker'
  ) => {
    const { inspection, repairPlan } = await folderSyncService.inspectAdapter(adapter);
    setSavedLabel(adapter.getLabel());
    setConfirmOverwriteValidFolder(false);
    setReport({
      source,
      label: adapter.getLabel(),
      adapter,
      inspection,
      repairPlan,
    });
  };

  useEffect(() => {
    const unsub = folderSyncService.subscribe((nextSnap) => {
      setSyncSnapshot(nextSnap);
      if (nextSnap.activeAdapterLabel) {
        setSavedLabel(nextSnap.activeAdapterLabel);
      } else if (nextSnap.pendingHandleLabel) {
        setSavedLabel(nextSnap.pendingHandleLabel);
      }
    });

    const existingAdapter = folderSyncService.getActiveAdapter();
    if (existingAdapter) {
      void refreshAdapterInspection(
        existingAdapter,
        existingAdapter.kind === 'browser-fs' ? 'picker' : 'virtual'
      );
    } else {
      void folderSyncService.bootstrapFromSavedHandle().then(async (res) => {
        if (res.restored && res.adapter) {
          await refreshAdapterInspection(res.adapter, 'picker');
        }
      });
    }

    return unsub;
  }, []);

  const handleSwitchStorageMode = (nextMode: GmaoStorageMode) => {
    folderSyncService.setStorageMode(nextMode);
    if (nextMode === 'BROWSER_STORAGE') {
      showToast?.('Mode Stockage Navigateur (IndexedDB / RAM) activé.', 'info');
    } else {
      showToast?.(
        report?.adapter
          ? `Mode Stockage Dossier Local activé (${report.adapter.getLabel()}).`
          : 'Mode Stockage Dossier Local sélectionné — choisissez ou réautorisez un dossier ci-dessous.',
        'success'
      );
    }
  };

  const handleReconnectSavedHandle = async () => {
    setBusy(true);
    try {
      const { adapter, flushedFiles } =
        await folderSyncService.requestSavedHandlePermissionAndReconnect();
      await refreshAdapterInspection(adapter, 'picker');
      showToast?.(
        flushedFiles.length > 0
          ? `Dossier "${adapter.getLabel()}" réautorisé et ${flushedFiles.length} fichier(s) en attente synchronisé(s).`
          : `Dossier "${adapter.getLabel()}" réautorisé et connecté.`,
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : "Impossible de réautoriser l'accès au dossier.",
        'warning'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleFlushDirtyNow = async () => {
    setBusy(true);
    try {
      const written = await folderSyncService.flushDirtyFilesNow();
      showToast?.(
        written.length > 0
          ? `${written.length} fichier(s) modifié(s) écrit(s) sur le disque local.`
          : 'Tous les fichiers sont déjà synchronisés.',
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : 'Échec de synchronisation vers le dossier.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectFolder = async () => {
    setBusy(true);
    try {
      await folderSyncService.disconnectFolder({ switchToBrowserMode: true });
      setReport(null);
      setHydrationReport(null);
      setSavedLabel('');
      setConfirmOverwriteValidFolder(false);
      showToast?.(
        'Dossier local déconnecté proprement (aucun fichier supprimé sur votre ordinateur). Retour au Stockage Navigateur.',
        'info'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleInspectViaPicker = async () => {
    setBusy(true);
    try {
      const result = await pickAndInspectDirectory('readwrite');
      if (result && result.adapter) {
        folderSyncService.setActiveAdapter(result.adapter);
        setSavedLabel(result.folderLabel);
        setConfirmOverwriteValidFolder(false);
        setReport({
          source: 'picker',
          label: result.folderLabel,
          adapter: result.adapter,
          inspection: result.inspection,
          repairPlan: result.repairPlan,
        });
        showToast?.(
          `Dossier inspecté (${result.folderLabel}) : ${result.inspection.status}`,
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
      setBusy(false);
    }
  };

  const handleRunVirtualInspection = () => {
    const res = createVirtualScenarioAdapter(virtualScenario);
    folderSyncService.setActiveAdapter(res.adapter);
    setConfirmOverwriteValidFolder(false);
    setReport({
      source: 'virtual',
      label: res.label,
      adapter: res.adapter,
      inspection: res.inspection,
      repairPlan: res.repairPlan,
    });
  };

  const handleImportZipFolder = async (file: File) => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const { entries } = await parseZipArchiveEntriesAsync(new Uint8Array(buffer));
      const zipLabel = file.name.replace(/\.zip$/i, '') || GMAO_DATA_ROOT_DIR;
      const memAdapter = new MemoryFolderFsAdapter(zipLabel, entries);
      folderSyncService.setActiveAdapter(memAdapter);
      await refreshAdapterInspection(memAdapter, 'zip');
      showToast?.(
        `Archive dossier "${file.name}" chargée (${entries.length} entrées vérifiées CRC-32).`,
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : "Impossible de lire l'archive ZIP.",
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  // ==========================================================================
  // 4 Smart Workflow Action Handlers
  // ==========================================================================

  const handleInjectLiveStateToFolder = async () => {
    const targetAdapter = report?.adapter ?? folderSyncService.getActiveAdapter();
    if (!targetAdapter) return;
    setBusy(true);
    try {
      const res = await folderSyncService.initializeEmptyFolderWithLiveState(targetAdapter);
      await refreshAdapterInspection(targetAdapter, report?.source ?? 'picker');
      showToast?.(
        `Données actuelles injectées dans "${targetAdapter.getLabel()}" (${res.filesWrittenCount} fichiers JSON écrits). Synchronisation locale active.`,
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : "Échec de l'écriture dans le dossier.",
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleInitBlankFactoryFolder = async () => {
    const targetAdapter = report?.adapter ?? folderSyncService.getActiveAdapter();
    if (!targetAdapter) return;
    setBusy(true);
    try {
      const hydReport = await folderSyncService.initializeEmptyFolderAsBlankFactory(targetAdapter);
      setHydrationReport(hydReport);
      await refreshAdapterInspection(targetAdapter, report?.source ?? 'picker');
      showToast?.(
        `Structure usine vierge initialisée dans "${targetAdapter.getLabel()}" (${ALL_CANONICAL_FILES.length} fichiers JSON).`,
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : "Échec de l'initialisation vierge.",
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLoadFromFolder = async () => {
    const targetAdapter = report?.adapter ?? folderSyncService.getActiveAdapter();
    if (!targetAdapter) return;
    setBusy(true);
    try {
      const hydReport = await folderSyncService.loadLiveStateFromFolder(targetAdapter, {
        activateFolderMode: true,
      });
      setHydrationReport(hydReport);
      await refreshAdapterInspection(targetAdapter, report?.source ?? 'picker');
      showToast?.(
        `Données chargées depuis "${targetAdapter.getLabel()}" (${hydReport.filesLoadedCount} fichiers JSON · ${hydReport.summary.machinesCount} machines · ${hydReport.summary.rawStockCount} articles PDR).`,
        hydReport.discoveredMissingReferences.length > 0 ? 'warning' : 'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : 'Échec de la lecture depuis le dossier.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRepairPartialAndLoad = async () => {
    const targetAdapter = report?.adapter ?? folderSyncService.getActiveAdapter();
    if (!targetAdapter) return;
    setBusy(true);
    try {
      const { repairPlan, hydrationReport: hydReport } =
        await folderSyncService.repairPartialFolderAndLoad(targetAdapter);
      setHydrationReport(hydReport);
      await refreshAdapterInspection(targetAdapter, report?.source ?? 'picker');
      showToast?.(
        `Dossier réparé (${repairPlan.create.length} élément(s) manquant(s) créés, ${repairPlan.skip.length} élément(s) existant(s) préservés) et données chargées.`,
        hydReport.discoveredMissingReferences.length > 0 ? 'warning' : 'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : 'Échec de la réparation du dossier.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCleanSubfolder = async (initMode: 'live-state' | 'blank-factory') => {
    const targetAdapter = report?.adapter ?? folderSyncService.getActiveAdapter();
    if (!targetAdapter) return;
    setBusy(true);
    try {
      const { subfolderAdapter, hydrationReport: hydReport } =
        await folderSyncService.createCleanSubfolderInForeignDirectory(
          targetAdapter,
          initMode,
          GMAO_DATA_ROOT_DIR
        );
      if (hydReport) {
        setHydrationReport(hydReport);
      }
      await refreshAdapterInspection(subfolderAdapter, report?.source ?? 'picker');
      showToast?.(
        `Sous-dossier propre "${subfolderAdapter.getLabel()}" créé et activé sans toucher aux fichiers tiers.`,
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : 'Impossible de créer le sous-dossier GMAO_Data.',
        'error'
      );
    } finally {
      setBusy(false);
    }
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

  const handleDownloadLiveZip = () => {
    try {
      downloadLiveStateDataFolderZip();
      showToast?.(
        'Dossier complet avec toutes les données et préférences exporté (.zip).',
        'success'
      );
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : "Échec de l'export ZIP complet.",
        'error'
      );
    }
  };

  const statusMeta = report ? STATUS_BADGE_MAP[report.inspection.status] : null;
  const connBadge = CONNECTION_BADGE_MAP[syncSnapshot.connectionState];
  const isLocalFolderMode = syncSnapshot.storageMode === 'LOCAL_FOLDER_SSOT';
  const presentFilesSet = new Set(report?.inspection.presentFiles ?? []);
  const dirtyFilesSet = new Set(syncSnapshot.dirtyFiles);

  return (
    <SettingsSectionCard
      title="Dossier de données & Stockage Local (Phase L1 / L2)"
      description={`Contrat d'arborescence ${GMAO_DATA_ROOT_DIR}/ aligné sur les 7 paquets Type A (schema v${FOLDER_SCHEMA_VERSION}). Permet de basculer entre le stockage navigateur et la lecture/écriture directe dans un dossier local sur votre ordinateur (100 % des tables + préférences d'interface).`}
      icon={<FolderOpen className="w-4 h-4" />}
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleImportZipFolder(file);
              }
              e.target.value = '';
            }}
          />
          {pickerAvailable && (
            <button
              type="button"
              onClick={() => {
                void handleInspectViaPicker();
              }}
              disabled={busy}
              className={SETTINGS_BUTTON_STYLES.secondary}
            >
              <FolderSearch className="w-3.5 h-3.5" />
              <span>{busy ? 'Analyse...' : 'Inspecter / Choisir un dossier'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => zipInputRef.current?.click()}
            disabled={busy}
            className={SETTINGS_BUTTON_STYLES.secondary}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Monter dossier (.zip)</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadLiveZip}
            className={SETTINGS_BUTTON_STYLES.secondary}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter dossier complet (.zip)</span>
          </button>
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
        {/* Dual-Mode Storage Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-slate-100/80 border border-slate-200">
          <button
            type="button"
            onClick={() => handleSwitchStorageMode('BROWSER_STORAGE')}
            className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition cursor-pointer ${
              !isLocalFolderMode
                ? 'bg-white border-emerald-500 shadow-xs text-slate-900'
                : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Database
                className={`w-4 h-4 shrink-0 ${
                  !isLocalFolderMode ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <div>
                <div className="text-xs font-bold">Mode 1 — Stockage Navigateur (IDB / RAM)</div>
                <div className="text-[11px] text-slate-500">
                  Persistance standard dans le navigateur (IndexedDB + localStorage)
                </div>
              </div>
            </div>
            {!isLocalFolderMode && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Actif
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSwitchStorageMode('LOCAL_FOLDER_SSOT')}
            className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition cursor-pointer ${
              isLocalFolderMode
                ? 'bg-white border-emerald-500 shadow-xs text-slate-900'
                : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <HardDrive
                className={`w-4 h-4 shrink-0 ${
                  isLocalFolderMode ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <div>
                <div className="text-xs font-bold">
                  Mode 2 — Stockage Dossier Local sur Ordinateur ({GMAO_DATA_ROOT_DIR}/)
                </div>
                <div className="text-[11px] text-slate-500">
                  Lecture/écriture JSON directe par table + préférences (prêt pour Windows Desktop)
                </div>
              </div>
            </div>
            {isLocalFolderMode && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Actif
              </span>
            )}
          </button>
        </div>

        {/* L2.3 Permission Reconnect Banner (after F5 reload in Chromium) */}
        {syncSnapshot.connectionState === 'NEEDS_PERMISSION' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-300 px-3.5 py-2.5">
            <div className="flex items-start gap-2 text-xs text-amber-950">
              <KeyRound className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  Réautorisation requise pour le dossier mémorisé ({syncSnapshot.pendingHandleLabel || savedLabel})
                </div>
                <div className="text-[11px] text-amber-900 mt-0.5">
                  Par sécurité du navigateur après actualisation, cliquez pour rétablir la lecture/écriture.
                  {syncSnapshot.dirtyFiles.length > 0 && (
                    <>
                      {' '}
                      <strong>{syncSnapshot.dirtyFiles.length} fichier(s) modifié(s)</strong> en file
                      d&apos;attente seront écrits immédiatement sans aucune perte.
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void handleReconnectSavedHandle();
              }}
              className={SETTINGS_BUTTON_STYLES.primary}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Réautoriser et synchroniser</span>
            </button>
          </div>
        )}

        {/* L2.3 Disk Write Error Banner with Retry */}
        {syncSnapshot.lastError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5">
            <div className="flex items-start gap-2 text-xs text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Erreur de synchronisation disque</div>
                <div className="text-[11px]">{syncSnapshot.lastError}</div>
              </div>
            </div>
            {syncSnapshot.dirtyFiles.length > 0 && report && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleFlushDirtyNow();
                }}
                className={SETTINGS_BUTTON_STYLES.danger}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Réessayer ({syncSnapshot.dirtyFiles.length})</span>
              </button>
            )}
          </div>
        )}

        {/* Status Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-500">Dossier connecté</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${connBadge.className}`}
              >
                {connBadge.label}
              </span>
            </div>
            <div className="text-xs font-bold font-mono text-slate-800 mt-1 truncate">
              {syncSnapshot.activeAdapterLabel ||
                syncSnapshot.pendingHandleLabel ||
                savedLabel ||
                'Aucun dossier sélectionné'}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
              <span>
                {syncSnapshot.lastSyncAt
                  ? `Synchro : ${new Date(syncSnapshot.lastSyncAt).toLocaleTimeString()}`
                  : 'En attente de liaison'}
              </span>
              {(syncSnapshot.activeAdapterLabel || syncSnapshot.pendingHandleLabel) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void handleDisconnectFolder();
                  }}
                  className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                >
                  <Unlink className="w-3 h-3" />
                  <span>Déconnecter</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-mono text-slate-500">Couverture canonique 100 %</span>
              <button
                type="button"
                onClick={() => setShowFileTree((prev) => !prev)}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
              >
                {showFileTree ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>{showFileTree ? 'Masquer' : 'Voir les 29 fichiers'}</span>
              </button>
            </div>
            <div className="text-xs font-bold font-mono text-slate-800 mt-1">
              {CANONICAL_FOLDER_DIRECTORIES.length} dossiers · {CANONICAL_CATALOG_FILES.length} Type A ·{' '}
              {CANONICAL_OPERATIONAL_FILES.length} opér. · {CANONICAL_CONFIG_FILES.length} config
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              manifest.json + catalog/ + operational/ + config/ + exports/
            </div>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-mono text-slate-500">Simulateur de cas (4 scénarios)</div>
            <div className="flex items-center gap-1.5 mt-1">
              <select
                aria-label="Scénario d'inspection virtuelle"
                value={virtualScenario}
                onChange={(e) => setVirtualScenario(e.target.value as VirtualScenario)}
                className="flex-1 min-w-0 text-xs font-mono bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
              >
                <option value="EMPTY">EMPTY (Dossier vide)</option>
                <option value="PARTIAL">PARTIAL (Fichiers manquants)</option>
                <option value="VALID_FULL">VALID_FULL (Dossier complet)</option>
                <option value="FOREIGN_NONEMPTY">FOREIGN_NONEMPTY (Fichiers tiers)</option>
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

        {/* Collapsible 29-File Canonical Tree Inspector */}
        {showFileTree && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5 text-sky-700" />
                Arborescence canonique ({ALL_CANONICAL_FILES.length} fichiers JSON + manifest.json)
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {GMAO_DATA_ROOT_DIR}/
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              {ALL_CANONICAL_FILES.map((spec) => {
                const isDirty = dirtyFilesSet.has(spec.path);
                const isPresent = report ? presentFilesSet.has(spec.path) : null;
                return (
                  <div
                    key={spec.path}
                    className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[10px] font-mono"
                    title={spec.description}
                  >
                    <span className="truncate text-slate-700">{spec.path}</span>
                    {isDirty ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                        En attente
                      </span>
                    ) : isPresent === true ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                        OK
                      </span>
                    ) : isPresent === false ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold">
                        Absent
                      </span>
                    ) : (
                      <span className="shrink-0 text-slate-400">{spec.role}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Folder Read/Write Toolbar when an adapter is active */}
        {report && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50/60 border border-emerald-200 px-3 py-2">
            <div className="text-xs text-emerald-950">
              <span className="font-bold">Synchronisation directe avec le dossier :</span>{' '}
              vous pouvez modifier un fichier <code>.json</code> sur votre ordinateur puis cliquer sur{' '}
              <strong>Recharger depuis le dossier</strong> pour voir la modification instantanément dans l&apos;application.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {syncSnapshot.dirtyFiles.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void handleFlushDirtyNow();
                  }}
                  className={SETTINGS_BUTTON_STYLES.secondary}
                >
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                  <span>Synchroniser en attente ({syncSnapshot.dirtyFiles.length})</span>
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleLoadFromFolder();
                }}
                className={SETTINGS_BUTTON_STYLES.secondary}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recharger depuis le dossier (Pull)</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleInjectLiveStateToFolder();
                }}
                className={SETTINGS_BUTTON_STYLES.primary}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Écrire vers le dossier (Push)</span>
              </button>
            </div>
          </div>
        )}

        {/* Smart 4-Workflow Decision Banner */}
        {report && statusMeta && (
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
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

            {/* CASE 1: EMPTY */}
            {report.inspection.status === 'EMPTY' && (
              <div className="rounded-xl bg-sky-50/70 border border-sky-200 p-3 space-y-2">
                <div className="text-xs font-bold text-sky-950">
                  Cas 1 — Ce dossier est vide. Que souhaitez-vous faire ?
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleInjectLiveStateToFolder();
                    }}
                    className={SETTINGS_BUTTON_STYLES.primary}
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>1. Injecter les données actuelles de l&apos;application dans ce dossier</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleInitBlankFactoryFolder();
                    }}
                    className={SETTINGS_BUTTON_STYLES.secondary}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>2. Initialiser un dossier usine vierge (0 enregistrement)</span>
                  </button>
                </div>
              </div>
            )}

            {/* CASE 2: VALID_FULL */}
            {report.inspection.status === 'VALID_FULL' && (
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3 space-y-2">
                <div className="text-xs font-bold text-emerald-950">
                  Cas 2 — Ce dossier contient déjà une structure GMAO complète et valide.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleLoadFromFolder();
                    }}
                    className={SETTINGS_BUTTON_STYLES.primary}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>1. Charger et utiliser les données de ce dossier dans l&apos;application</span>
                  </button>
                  {!confirmOverwriteValidFolder ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmOverwriteValidFolder(true)}
                      className={SETTINGS_BUTTON_STYLES.secondary}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>2. Écraser ce dossier avec les données actuelles de l&apos;application</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void handleInjectLiveStateToFolder();
                      }}
                      className={SETTINGS_BUTTON_STYLES.danger}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Confirmer l&apos;écrasement du dossier par les données de l&apos;application</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* CASE 3: PARTIAL */}
            {report.inspection.status === 'PARTIAL' && (
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 space-y-2">
                <div className="text-xs font-bold text-amber-950">
                  Cas 3 — Structure GMAO partielle détectée ({report.inspection.missingFiles.length} fichier(s) manquant(s)).
                </div>
                <div className="text-[11px] text-amber-900">
                  La réparation additive créera uniquement les fichiers manquants sans jamais effacer les{' '}
                  <strong>{report.repairPlan.skip.length}</strong> éléments déjà présents, puis
                  analysera les références manquantes (machines, articles PDR, zones, intervenants).
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleRepairPartialAndLoad();
                    }}
                    className={SETTINGS_BUTTON_STYLES.primary}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Réparer les fichiers manquants, charger les données & analyser les références</span>
                  </button>
                </div>
              </div>
            )}

            {/* CASE 4: FOREIGN_NONEMPTY */}
            {report.inspection.status === 'FOREIGN_NONEMPTY' && (
              <div className="rounded-xl bg-rose-50/80 border border-rose-200 p-3 space-y-2">
                <div className="text-xs font-bold text-rose-950">
                  Cas 4 — Ce dossier contient des fichiers tiers ({report.inspection.foreignEntries.length} élément(s) non-GMAO).
                </div>
                <div className="text-[11px] text-rose-900">
                  Pour protéger vos fichiers personnels, l&apos;application ne modifie rien à la racine et vous propose
                  de créer un sous-dossier isolé <code>{GMAO_DATA_ROOT_DIR}/</code> à l&apos;intérieur.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleCreateCleanSubfolder('live-state');
                    }}
                    className={SETTINGS_BUTTON_STYLES.primary}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>
                      Créer le sous-dossier {GMAO_DATA_ROOT_DIR}/ et y injecter les données actuelles
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleCreateCleanSubfolder('blank-factory');
                    }}
                    className={SETTINGS_BUTTON_STYLES.secondary}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Créer le sous-dossier {GMAO_DATA_ROOT_DIR}/ vierge</span>
                  </button>
                </div>
              </div>
            )}

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

        {/* Hydration & Nexus Missing-Reference Explorer Report */}
        {hydrationReport && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                Bilan de lecture du dossier ({hydrationReport.filesLoadedCount} fichiers JSON chargés)
              </div>
              <div className="text-[11px] font-mono text-slate-600">
                Machines: <strong>{hydrationReport.summary.machinesCount}</strong> · PDR:{' '}
                <strong>{hydrationReport.summary.rawStockCount}</strong> · Mouvements:{' '}
                <strong>{hydrationReport.summary.mouvementsCount}</strong> · BT:{' '}
                <strong>{hydrationReport.summary.correctiveCount}</strong> · PM:{' '}
                <strong>{hydrationReport.summary.preventiveTasksCount}</strong> · Blueprints:{' '}
                <strong>{hydrationReport.summary.blueprintsCount}</strong>
              </div>
            </div>

            {hydrationReport.discoveredMissingReferences.length > 0 ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      Explorateur Nexus : {hydrationReport.discoveredMissingReferences.length} référence(s)
                      utilisée(s) dans les journaux mais absente(s) des catalogues
                    </span>
                  </div>
                  {onOpenIntegrityTab && (
                    <button
                      type="button"
                      onClick={onOpenIntegrityTab}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Ouvrir Audit &amp; Intégrité</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hydrationReport.discoveredMissingReferences.slice(0, 12).map((item, idx) => (
                    <span
                      key={`${item.entityType}-${item.code}-${idx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-300 text-[10px] font-mono text-amber-950"
                    >
                      <strong>[{item.entityType.toUpperCase()}]</strong> {item.code} ({item.count}x dans{' '}
                      {item.sourceList})
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Intégrité référentielle complète : aucune référence orpheline détectée dans les fichiers chargés.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200/90 px-3 py-2 text-[11px] text-slate-600">
          <Info className="w-3.5 h-3.5 text-sky-700 shrink-0 mt-0.5" />
          <span>
            Architecture prête pour Windows Desktop : chaque table (7 catalogues Type A, 19 journaux opérationnels
            incluant les Blueprints, et 3 fichiers de préférences/devises/budgets) est stockée dans son propre
            fichier JSON lisible dans <code>{GMAO_DATA_ROOT_DIR}/</code>.
          </span>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
