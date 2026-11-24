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
  FolderInput,
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
  CANONICAL_CATALOG_FILES,
  CANONICAL_CONFIG_FILES,
  CANONICAL_FOLDER_DIRECTORIES,
  CANONICAL_OPERATIONAL_FILES,
  downloadEmptyDataFolderZip,
  downloadLiveStateDataFolderZip,
  FOLDER_SCHEMA_VERSION,
  folderSyncService,
  getFolderPickerCapability,
  getSavedDataFolderLabel,
  GMAO_DATA_ROOT_DIR,
  inspectFolderFromFileList,
  MemoryFolderFsAdapter,
  parseZipArchiveEntriesAsync,
  pickAndInspectDirectory,
  type FolderConnectionState,
  type FolderHydrationReport,
  type FolderInspectionResult,
  type FolderInspectionStatus,
  type FolderPickerCapability,
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

type FolderAccessMode = 'readwrite-disk' | 'readonly-disk-snapshot';

const STATUS_BADGE_MAP: Record<
  FolderInspectionStatus,
  { label: string; className: string }
> = {
  EMPTY: {
    label: 'EMPTY — Dossier vide',
    className: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  VALID_FULL: {
    label: 'VALID_FULL — Structure complète',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  PARTIAL: {
    label: 'PARTIAL — Fichiers manquants',
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
    label: 'Connecté (Disque)',
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
    label: 'Stockage navigateur',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

const RESPONSIVE_BTN_WRAP =
  '!whitespace-normal text-center leading-snug min-h-[38px] py-2 px-3 rounded-xl';

/**
 * Local Folder Storage & Dual-Mode Persistence Control Panel (Phase L1 / L2).
 * Zero simulated/fake workflows: every action talks to a real PC folder via
 * File System Access API (`showDirectoryPicker`), a real read-only OS folder picker
 * (`<input webkitdirectory>`), or a real PKZIP archive.
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
  const [confirmOverwriteValidFolder, setConfirmOverwriteValidFolder] = useState(false);
  const [hydrationReport, setHydrationReport] = useState<FolderHydrationReport | null>(null);
  const [report, setReport] = useState<{
    source: 'picker' | 'webkitdir' | 'zip';
    accessMode: FolderAccessMode;
    label: string;
    adapter: IFolderFsAdapter;
    inspection: FolderInspectionResult;
    repairPlan: FolderRepairPlan;
  } | null>(null);

  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const capability: FolderPickerCapability = getFolderPickerCapability();
  const canUseDirectReadWrite = capability === 'READWRITE_PICKER';

  // Attach non-standard webkitdirectory/directory attributes cleanly for real OS folder reading
  useEffect(() => {
    const el = dirInputRef.current;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, []);

  const refreshAdapterInspection = async (
    adapter: IFolderFsAdapter,
    source: 'picker' | 'webkitdir' | 'zip',
    accessMode: FolderAccessMode
  ) => {
    const { inspection, repairPlan } = await folderSyncService.inspectAdapter(adapter);
    setSavedLabel(adapter.getLabel());
    setConfirmOverwriteValidFolder(false);
    setReport({
      source,
      accessMode,
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
      const isRealDisk = existingAdapter.kind === 'browser-fs';
      void refreshAdapterInspection(
        existingAdapter,
        isRealDisk ? 'picker' : 'webkitdir',
        isRealDisk ? 'readwrite-disk' : 'readonly-disk-snapshot'
      );
    } else {
      void folderSyncService.bootstrapFromSavedHandle().then(async (res) => {
        if (res.restored && res.adapter) {
          await refreshAdapterInspection(res.adapter, 'picker', 'readwrite-disk');
        }
      });
    }

    return unsub;
  }, []);

  const handleSwitchStorageMode = (nextMode: GmaoStorageMode) => {
    if (nextMode === 'LOCAL_FOLDER_SSOT' && !canUseDirectReadWrite) {
      showToast?.(
        capability === 'BLOCKED_IN_IFRAME'
          ? "L'écriture directe sur votre disque est bloquée dans un aperçu intégré (iframe). Ouvrez l'application dans un onglet Chrome/Edge PC indépendant pour activer ce mode."
          : "L'écriture directe sur dossier local nécessite Chrome ou Edge sur PC (API File System Access). Utilisez « Ouvrir dossier PC (Lecture) » ou l'export `.zip`.",
        'warning'
      );
      return;
    }

    folderSyncService.setStorageMode(nextMode);
    if (nextMode === 'BROWSER_STORAGE') {
      showToast?.('Mode Stockage Navigateur (IndexedDB / RAM) activé.', 'info');
    } else {
      showToast?.(
        report?.accessMode === 'readwrite-disk'
          ? `Mode Dossier Local PC activé (${report.adapter.getLabel()}).`
          : 'Mode Dossier Local PC sélectionné — choisissez ou réautorisez un dossier sur votre ordinateur ci-dessous.',
        'success'
      );
    }
  };

  const handleReconnectSavedHandle = async () => {
    setBusy(true);
    try {
      const { adapter, flushedFiles } =
        await folderSyncService.requestSavedHandlePermissionAndReconnect();
      await refreshAdapterInspection(adapter, 'picker', 'readwrite-disk');
      showToast?.(
        flushedFiles.length > 0
          ? `Dossier "${adapter.getLabel()}" réautorisé et ${flushedFiles.length} fichier(s) synchronisé(s).`
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
          ? `${written.length} fichier(s) écrit(s) sur votre disque local.`
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
        'Dossier local déconnecté (aucun fichier supprimé sur votre ordinateur). Retour au Stockage Navigateur.',
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
          accessMode: 'readwrite-disk',
          label: result.folderLabel,
          adapter: result.adapter,
          inspection: result.inspection,
          repairPlan: result.repairPlan,
        });
        showToast?.(
          `Dossier PC ouvert en lecture/écriture (${result.folderLabel}) : ${result.inspection.status}`,
          result.inspection.status === 'VALID_FULL' || result.inspection.status === 'EMPTY'
            ? 'success'
            : 'warning'
        );
      }
    } catch (err) {
      const errorName = err instanceof Error ? err.name : '';
      if (errorName !== 'AbortError') {
        showToast?.(
          err instanceof Error ? err.message : "Impossible d'ouvrir le dossier sélectionné.",
          'warning'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReadRealDiskFolder = async (fileList: FileList) => {
    setBusy(true);
    try {
      const result = await inspectFolderFromFileList(fileList);
      if (result.adapter) {
        setSavedLabel(result.folderLabel);
        setConfirmOverwriteValidFolder(false);
        setReport({
          source: 'webkitdir',
          accessMode: 'readonly-disk-snapshot',
          label: result.folderLabel,
          adapter: result.adapter,
          inspection: result.inspection,
          repairPlan: result.repairPlan,
        });
        showToast?.(
          `Dossier PC lu (${result.folderLabel} · ${result.entries.length} entrées) : ${result.inspection.status}. Mode lecture seule (pour enregistrer des modifications, utilisez Chrome/Edge hors iframe ou l'export ZIP).`,
          result.inspection.status === 'VALID_FULL' ? 'success' : 'info'
        );
      }
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : 'Impossible de lire le dossier sélectionné.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleImportZipFolder = async (file: File) => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const { entries } = await parseZipArchiveEntriesAsync(new Uint8Array(buffer));
      const zipLabel = file.name.replace(/\.zip$/i, '') || GMAO_DATA_ROOT_DIR;
      const memAdapter = new MemoryFolderFsAdapter(zipLabel, entries);
      await refreshAdapterInspection(memAdapter, 'zip', 'readonly-disk-snapshot');
      showToast?.(
        `Archive dossier "${file.name}" analysée (${entries.length} entrées vérifiées CRC-32).`,
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
  // Real Disk Workflow Action Handlers
  // ==========================================================================

  const handleInjectLiveStateToFolder = async () => {
    const targetAdapter = report?.adapter ?? folderSyncService.getActiveAdapter();
    if (!targetAdapter || report?.accessMode !== 'readwrite-disk') return;
    setBusy(true);
    try {
      const res = await folderSyncService.initializeEmptyFolderWithLiveState(targetAdapter);
      await refreshAdapterInspection(targetAdapter, 'picker', 'readwrite-disk');
      showToast?.(
        `Données actuelles écrites dans "${targetAdapter.getLabel()}" (${res.filesWrittenCount} fichiers JSON). Synchronisation locale active.`,
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
    if (!targetAdapter || report?.accessMode !== 'readwrite-disk') return;
    setBusy(true);
    try {
      const hydReport = await folderSyncService.initializeEmptyFolderAsBlankFactory(targetAdapter);
      setHydrationReport(hydReport);
      await refreshAdapterInspection(targetAdapter, 'picker', 'readwrite-disk');
      showToast?.(
        `Structure usine vierge initialisée sur disque dans "${targetAdapter.getLabel()}" (${ALL_CANONICAL_FILES.length} fichiers JSON).`,
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
    const isDirectReadWrite = report?.accessMode === 'readwrite-disk';
    setBusy(true);
    try {
      const hydReport = await folderSyncService.loadLiveStateFromFolder(targetAdapter, {
        activateFolderMode: isDirectReadWrite,
      });
      setHydrationReport(hydReport);
      if (report) {
        await refreshAdapterInspection(targetAdapter, report.source, report.accessMode);
      }
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
    if (!targetAdapter || report?.accessMode !== 'readwrite-disk') return;
    setBusy(true);
    try {
      const { repairPlan, hydrationReport: hydReport } =
        await folderSyncService.repairPartialFolderAndLoad(targetAdapter);
      setHydrationReport(hydReport);
      await refreshAdapterInspection(targetAdapter, 'picker', 'readwrite-disk');
      showToast?.(
        `Dossier réparé sur disque (${repairPlan.create.length} élément(s) créés, ${repairPlan.skip.length} préservés) et données chargées.`,
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
    if (!targetAdapter || report?.accessMode !== 'readwrite-disk') return;
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
      await refreshAdapterInspection(subfolderAdapter, 'picker', 'readwrite-disk');
      showToast?.(
        `Sous-dossier "${subfolderAdapter.getLabel()}" créé sur votre disque sans toucher aux fichiers tiers.`,
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
        'Dossier complet avec 100 % des données et préférences exporté (.zip).',
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
  const isReadWriteReport = report?.accessMode === 'readwrite-disk';
  const presentFilesSet = new Set(report?.inspection.presentFiles ?? []);
  const dirtyFilesSet = new Set(syncSnapshot.dirtyFiles);

  return (
    <SettingsSectionCard
      title="Stockage Local sur Ordinateur & Dossier GMAO_Data"
      description={`Arborescence canonique ${GMAO_DATA_ROOT_DIR}/ alignée sur les 7 paquets Type A (schema v${FOLDER_SCHEMA_VERSION}) : 100 % des tables + préférences d'interface dans des fichiers JSON lisibles sur votre disque.`}
      icon={<FolderOpen className="w-5 h-5" />}
      headerRight={
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${connBadge.className}`}
        >
          {connBadge.label}
        </span>
      }
    >
      {/* Hidden native OS file/folder inputs */}
      <input
        ref={dirInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleReadRealDiskFolder(e.target.files);
          }
          e.target.value = '';
        }}
      />
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

      <div className="space-y-4 min-w-0">
        {/* Honest Environment Capability Notice */}
        {capability === 'BLOCKED_IN_IFRAME' && (
          <div className="rounded-xl bg-amber-50 border border-amber-300/90 p-3 flex items-start gap-2.5 text-xs text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <div className="font-bold">
                Aperçu intégré (iframe) détecté — écriture disque directe bloquée par le navigateur
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                Par sécurité Chromium, <code>showDirectoryPicker</code> (lecture/écriture directe dans un dossier PC) est interdit à l&apos;intérieur d&apos;un cadre intégré.
                Pour écrire en direct sur votre disque, ouvrez l&apos;application dans un <strong>onglet indépendant Chrome ou Edge sur PC</strong>.
                Ici, vous pouvez tout de même <strong>lire un vrai dossier de votre ordinateur</strong> ci-dessous ou échanger via <strong>archive .zip</strong>.
              </p>
            </div>
          </div>
        )}

        {capability === 'UNSUPPORTED_BROWSER' && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-start gap-2.5 text-xs text-slate-800">
            <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <div className="font-bold">
                Navigateur sans écriture dossier directe (Firefox / Safari / Mobile)
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Ce navigateur ne propose pas l&apos;API <code>showDirectoryPicker</code> pour modifier un dossier local en continu.
                Vous pouvez lire un dossier local ou utiliser l&apos;export/import <strong>.zip</strong>. Pour la synchronisation disque directe, ouvrez l&apos;application sur <strong>Chrome / Edge PC</strong> (ou la future version Windows).
              </p>
            </div>
          </div>
        )}

        {/* Dual-Mode Storage Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-slate-100/80 border border-slate-200">
          <button
            type="button"
            onClick={() => handleSwitchStorageMode('BROWSER_STORAGE')}
            className={`flex items-start justify-between gap-2.5 p-3 rounded-lg border text-left transition cursor-pointer min-w-0 ${
              !isLocalFolderMode
                ? 'bg-white border-emerald-500 shadow-xs text-slate-900'
                : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-white'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <Database
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  !isLocalFolderMode ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold break-words">
                  Mode 1 — Stockage Navigateur (IDB / RAM)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Persistance standard dans le navigateur (IndexedDB + localStorage)
                </div>
              </div>
            </div>
            {!isLocalFolderMode && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Actif
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSwitchStorageMode('LOCAL_FOLDER_SSOT')}
            className={`flex items-start justify-between gap-2.5 p-3 rounded-lg border text-left transition cursor-pointer min-w-0 ${
              isLocalFolderMode
                ? 'bg-white border-emerald-500 shadow-xs text-slate-900'
                : canUseDirectReadWrite
                  ? 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-white'
                  : 'bg-slate-50/60 border-dashed border-slate-300 text-slate-500'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <HardDrive
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isLocalFolderMode ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold break-words">
                  Mode 2 — Dossier Local sur Ordinateur ({GMAO_DATA_ROOT_DIR}/)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  {canUseDirectReadWrite
                    ? 'Lecture/écriture JSON directe par table + préférences sur votre disque'
                    : 'Écriture directe disponible uniquement sur Chrome/Edge PC hors iframe'}
                </div>
              </div>
            </div>
            {isLocalFolderMode ? (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Actif
              </span>
            ) : !canUseDirectReadWrite ? (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                PC Chrome/Edge
              </span>
            ) : null}
          </button>
        </div>

        {/* Responsive Real Disk Action Toolbar (Zero Header Overflow) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {canUseDirectReadWrite ? (
            <button
              type="button"
              onClick={() => {
                void handleInspectViaPicker();
              }}
              disabled={busy}
              className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
            >
              <FolderSearch className="w-3.5 h-3.5 shrink-0" />
              <span>{busy ? 'Analyse...' : 'Choisir dossier PC (Lecture/Écriture)'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => dirInputRef.current?.click()}
              disabled={busy}
              className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
            >
              <FolderInput className="w-3.5 h-3.5 shrink-0" />
              <span>{busy ? 'Lecture...' : 'Ouvrir dossier PC (Lecture réelle)'}</span>
            </button>
          )}

          {canUseDirectReadWrite && (
            <button
              type="button"
              onClick={() => dirInputRef.current?.click()}
              disabled={busy}
              className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
            >
              <FolderInput className="w-3.5 h-3.5 shrink-0" />
              <span>Lire dossier (Lecture seule)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => zipInputRef.current?.click()}
            disabled={busy}
            className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span>Ouvrir archive (.zip)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadLiveZip}
            className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Exporter dossier complet (.zip)</span>
          </button>

          {!canUseDirectReadWrite && (
            <button
              type="button"
              onClick={handleDownloadEmptyZip}
              className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
            >
              <FolderPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Structure vierge (.zip)</span>
            </button>
          )}
        </div>

        {/* L2.3 Permission Reconnect Banner (after F5 reload in Chromium) */}
        {syncSnapshot.connectionState === 'NEEDS_PERMISSION' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl bg-amber-50 border border-amber-300 px-3.5 py-2.5">
            <div className="flex items-start gap-2 text-xs text-amber-950 min-w-0">
              <KeyRound className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold break-words">
                  Réautorisation requise pour le dossier mémorisé ({syncSnapshot.pendingHandleLabel || savedLabel})
                </div>
                <div className="text-[11px] text-amber-900 mt-0.5 leading-snug">
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
              className={`${SETTINGS_BUTTON_STYLES.primary} w-full sm:w-auto shrink-0 ${RESPONSIVE_BTN_WRAP}`}
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>Réautoriser et synchroniser</span>
            </button>
          </div>
        )}

        {/* L2.3 Disk Write Error Banner with Retry */}
        {syncSnapshot.lastError && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5">
            <div className="flex items-start gap-2 text-xs text-rose-900 min-w-0">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold">Erreur de synchronisation disque</div>
                <div className="text-[11px] break-words">{syncSnapshot.lastError}</div>
              </div>
            </div>
            {syncSnapshot.dirtyFiles.length > 0 && isReadWriteReport && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleFlushDirtyNow();
                }}
                className={`${SETTINGS_BUTTON_STYLES.danger} w-full sm:w-auto shrink-0 ${RESPONSIVE_BTN_WRAP}`}
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Réessayer ({syncSnapshot.dirtyFiles.length})</span>
              </button>
            )}
          </div>
        )}

        {/* Status Summary Grid (2 balanced cards — zero fake simulator) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-500">Dossier lié / inspecté</span>
              {report && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    isReadWriteReport
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200'
                  }`}
                >
                  {isReadWriteReport ? 'Lecture/Écriture' : 'Lecture seule'}
                </span>
              )}
            </div>
            <div className="text-xs font-bold font-mono text-slate-800 mt-1 truncate">
              {syncSnapshot.activeAdapterLabel ||
                syncSnapshot.pendingHandleLabel ||
                report?.label ||
                savedLabel ||
                'Aucun dossier sélectionné'}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 mt-1.5">
              <span>
                {syncSnapshot.lastSyncAt
                  ? `Dernière synchro : ${new Date(syncSnapshot.lastSyncAt).toLocaleTimeString()}`
                  : 'En attente de liaison'}
              </span>
              {(syncSnapshot.activeAdapterLabel || syncSnapshot.pendingHandleLabel || report) && (
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

          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-500">Arborescence canonique</span>
              <button
                type="button"
                onClick={() => setShowFileTree((prev) => !prev)}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer shrink-0"
              >
                {showFileTree ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>{showFileTree ? 'Masquer' : `Voir les ${ALL_CANONICAL_FILES.length} fichiers`}</span>
              </button>
            </div>
            <div className="text-xs font-bold font-mono text-slate-800 mt-1 break-words">
              {CANONICAL_FOLDER_DIRECTORIES.length} dossiers · {CANONICAL_CATALOG_FILES.length} Type A ·{' '}
              {CANONICAL_OPERATIONAL_FILES.length} opér. · {CANONICAL_CONFIG_FILES.length} config
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 mt-1">
              <span className="truncate">manifest.json + catalog/ + operational/ + config/</span>
              {canUseDirectReadWrite && (
                <button
                  type="button"
                  onClick={handleDownloadEmptyZip}
                  className="text-sky-700 hover:text-sky-900 font-semibold cursor-pointer shrink-0"
                >
                  Modèle vide (.zip)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible 29-File Canonical Tree Inspector */}
        {showFileTree && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>Arborescence ({ALL_CANONICAL_FILES.length} JSON + manifest.json)</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {GMAO_DATA_ROOT_DIR}/
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              {ALL_CANONICAL_FILES.map((spec) => {
                const isDirty = dirtyFilesSet.has(spec.path);
                const isPresent = report ? presentFilesSet.has(spec.path) : null;
                return (
                  <div
                    key={spec.path}
                    className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[10px] font-mono min-w-0"
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

        {/* Live Folder Read/Write Toolbar (ONLY when real read/write disk handle is active) */}
        {report && isReadWriteReport && (
          <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-3 space-y-2.5">
            <div className="text-xs text-emerald-950 leading-relaxed">
              <span className="font-bold">Synchronisation disque directe active :</span>{' '}
              les modifications dans l&apos;application s&apos;écrivent dans ce dossier, et vous pouvez
              recharger vos modifications manuelles faites dans les fichiers <code>.json</code> sur votre PC.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {syncSnapshot.dirtyFiles.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void handleFlushDirtyNow();
                  }}
                  className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
                >
                  <HardDrive className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Écrire en attente ({syncSnapshot.dirtyFiles.length})</span>
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleLoadFromFolder();
                }}
                className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Recharger depuis disque (Pull)</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleInjectLiveStateToFolder();
                }}
                className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
              >
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                <span>Écrire vers disque (Push)</span>
              </button>
            </div>
          </div>
        )}

        {/* Smart 4-Workflow Inspection & Decision Card */}
        {report && statusMeta && (
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {report.inspection.status === 'VALID_FULL' || report.inspection.status === 'EMPTY' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : report.inspection.status === 'PARTIAL' ? (
                  <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="text-xs font-bold text-slate-800 font-mono truncate">
                  {report.label}
                </span>
              </div>
              <span
                className={`inline-flex items-center self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.className}`}
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
                <span className="text-slate-500">Présents : </span>
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
              <div className="rounded-xl bg-sky-50/70 border border-sky-200 p-3 space-y-2.5">
                <div className="text-xs font-bold text-sky-950">
                  Cas 1 — Dossier vide détecté
                </div>
                {isReadWriteReport ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void handleInjectLiveStateToFolder();
                      }}
                      className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
                    >
                      <HardDrive className="w-3.5 h-3.5 shrink-0" />
                      <span>Injecter les données actuelles</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void handleInitBlankFactoryFolder();
                      }}
                      className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
                    >
                      <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Initialiser usine vierge (0 ligne)</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-sky-900">
                      Ce dossier est ouvert en <strong>lecture seule</strong>. Téléchargez le paquet prêt à
                      décompresser dans ce dossier, ou ouvrez l&apos;application sur Chrome/Edge PC hors iframe
                      pour écrire directement.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadLiveZip}
                        className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>Télécharger données actuelles (.zip)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadEmptyZip}
                        className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
                      >
                        <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                        <span>Télécharger structure vierge (.zip)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CASE 2: VALID_FULL */}
            {report.inspection.status === 'VALID_FULL' && (
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3 space-y-2.5">
                <div className="text-xs font-bold text-emerald-950">
                  Cas 2 — Structure GMAO complète et valide
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleLoadFromFolder();
                    }}
                    className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Charger les données dans l&apos;application</span>
                  </button>
                  {isReadWriteReport ? (
                    !confirmOverwriteValidFolder ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmOverwriteValidFolder(true)}
                        className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Écraser le dossier par l&apos;application</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void handleInjectLiveStateToFolder();
                        }}
                        className={`${SETTINGS_BUTTON_STYLES.danger} w-full ${RESPONSIVE_BTN_WRAP}`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Confirmer l&apos;écrasement sur disque</span>
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handleDownloadLiveZip}
                      className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Exporter la copie mise à jour (.zip)</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* CASE 3: PARTIAL */}
            {report.inspection.status === 'PARTIAL' && (
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 space-y-2.5">
                <div className="text-xs font-bold text-amber-950">
                  Cas 3 — Structure GMAO partielle ({report.inspection.missingFiles.length} fichier(s) manquant(s))
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  {isReadWriteReport
                    ? `La réparation additive créera uniquement les fichiers manquants sur votre disque sans toucher aux ${report.repairPlan.skip.length} éléments déjà présents, puis chargera les données.`
                    : `Mode lecture seule : vous pouvez charger les ${report.inspection.presentFiles.length} fichier(s) présents dans l'application, puis exporter le dossier complet réparé (.zip).`}
                </p>
                {isReadWriteReport ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleRepairPartialAndLoad();
                    }}
                    className={`${SETTINGS_BUTTON_STYLES.primary} w-full sm:w-auto ${RESPONSIVE_BTN_WRAP}`}
                  >
                    <Wrench className="w-3.5 h-3.5 shrink-0" />
                    <span>Réparer sur disque, charger &amp; analyser les références</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void handleLoadFromFolder();
                      }}
                      className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                      <span>Charger les fichiers présents</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadLiveZip}
                      className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Exporter dossier complété (.zip)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CASE 4: FOREIGN_NONEMPTY */}
            {report.inspection.status === 'FOREIGN_NONEMPTY' && (
              <div className="rounded-xl bg-rose-50/80 border border-rose-200 p-3 space-y-2.5">
                <div className="text-xs font-bold text-rose-950">
                  Cas 4 — Dossier tiers protégé ({report.inspection.foreignEntries.length} élément(s) non-GMAO)
                </div>
                <p className="text-[11px] text-rose-900 leading-relaxed">
                  Vos fichiers personnels ne sont jamais modifiés ni supprimés.{' '}
                  {isReadWriteReport
                    ? `Vous pouvez créer un sous-dossier isolé ${GMAO_DATA_ROOT_DIR}/ à l'intérieur.`
                    : `Choisissez un dossier dédié ${GMAO_DATA_ROOT_DIR}/ ou téléchargez l'archive .zip à extraire séparément.`}
                </p>
                {isReadWriteReport ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void handleCreateCleanSubfolder('live-state');
                      }}
                      className={`${SETTINGS_BUTTON_STYLES.primary} w-full ${RESPONSIVE_BTN_WRAP}`}
                    >
                      <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Créer {GMAO_DATA_ROOT_DIR}/ avec données</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void handleCreateCleanSubfolder('blank-factory');
                      }}
                      className={`${SETTINGS_BUTTON_STYLES.secondary} w-full ${RESPONSIVE_BTN_WRAP}`}
                    >
                      <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Créer {GMAO_DATA_ROOT_DIR}/ vierge</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleDownloadLiveZip}
                    className={`${SETTINGS_BUTTON_STYLES.secondary} w-full sm:w-auto ${RESPONSIVE_BTN_WRAP}`}
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Télécharger {GMAO_DATA_ROOT_DIR}.zip</span>
                  </button>
                )}
              </div>
            )}

            {report.repairPlan.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50/70 border border-amber-200 px-3 py-2 space-y-1">
                {report.repairPlan.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span className="break-words">{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hydration & Nexus Missing-Reference Explorer Report */}
        {hydrationReport && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 min-w-0">
            <div className="text-xs font-bold text-slate-800">
              Bilan de lecture ({hydrationReport.filesLoadedCount} fichiers JSON chargés)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 text-[11px] font-mono">
              <div className="bg-white rounded-lg px-2 py-1 border border-slate-200/80">
                <span className="text-slate-500">Machines: </span>
                <strong>{hydrationReport.summary.machinesCount}</strong>
              </div>
              <div className="bg-white rounded-lg px-2 py-1 border border-slate-200/80">
                <span className="text-slate-500">PDR: </span>
                <strong>{hydrationReport.summary.rawStockCount}</strong>
              </div>
              <div className="bg-white rounded-lg px-2 py-1 border border-slate-200/80">
                <span className="text-slate-500">Mvt: </span>
                <strong>{hydrationReport.summary.mouvementsCount}</strong>
              </div>
              <div className="bg-white rounded-lg px-2 py-1 border border-slate-200/80">
                <span className="text-slate-500">BT: </span>
                <strong>{hydrationReport.summary.correctiveCount}</strong>
              </div>
              <div className="bg-white rounded-lg px-2 py-1 border border-slate-200/80">
                <span className="text-slate-500">PM: </span>
                <strong>{hydrationReport.summary.preventiveTasksCount}</strong>
              </div>
              <div className="bg-white rounded-lg px-2 py-1 border border-slate-200/80">
                <span className="text-slate-500">Blueprints: </span>
                <strong>{hydrationReport.summary.blueprintsCount}</strong>
              </div>
            </div>

            {hydrationReport.discoveredMissingReferences.length > 0 ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-1.5 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Explorateur Nexus : {hydrationReport.discoveredMissingReferences.length} référence(s)
                      absente(s) des catalogues
                    </span>
                  </div>
                  {onOpenIntegrityTab && (
                    <button
                      type="button"
                      onClick={onOpenIntegrityTab}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer self-start sm:self-auto shrink-0"
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
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-300 text-[10px] font-mono text-amber-950 break-all"
                    >
                      <strong>[{item.entityType.toUpperCase()}]</strong> {item.code} ({item.count}x ·{' '}
                      {item.sourceList})
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Intégrité référentielle complète : aucune référence orpheline détectée.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsSectionCard>
  );
}
