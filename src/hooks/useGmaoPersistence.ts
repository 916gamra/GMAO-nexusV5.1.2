import { useEffect, useRef } from 'react';
import { useAutoSave } from './useAutoSave';
import { useStateSync } from './useStateSync';
import { useEnterpriseDbSync } from './useEnterpriseDbSync';
import { indexedDBService } from '../infrastructure/database/IndexedDBService';
import { storageService } from '../utils/storageService';
import { STORAGE_KEYS } from '../infrastructure/persistence/storageKeys';
import { serverSyncService } from '../services/serverSyncService';

/**
 * Handles persistence, debounced storage, multi-tab sync, and Enterprise database sync
 * Modularized and composed of useAutoSave, useStateSync, and useEnterpriseDbSync
 */
export function useGmaoPersistence({
  state,
  setters,
  validators,
  onStateChange,
}) {
  const hydratedFromIdb = useRef(false);
  const settersRef = useRef(setters);

  useEffect(() => {
    settersRef.current = setters;
  });

  // 0. L2 -> L1 Self-Healing Hydration from IndexedDB & Server-Authoritative Sync on initial mount
  useEffect(() => {
    if (hydratedFromIdb.current) return;
    hydratedFromIdb.current = true;

    const startMode = storageService.getItem(STORAGE_KEYS.START_MODE);
    // Block auto-hydration ONLY when factory was explicitly cleared to empty mode.
    // Real Factory Mode has DEMO_MODE === false and START_MODE === 'custom' (or unset) and MUST sync cleanly.
    if (startMode === 'empty') {
      return;
    }

    (async () => {
      try {
        // First check if Server has authoritative persisted state
        const serverCheck = await serverSyncService.fetchServerState();
        if (serverCheck.online && serverCheck.state && serverCheck.summary.totalItems > 0) {
          const lastSyncAt = serverSyncService.getLastSyncAt();
          const localModifiedAt = serverSyncService.getLocalModifiedAt();
          const serverTime = serverCheck.summary.updatedAt
            ? new Date(serverCheck.summary.updatedAt).getTime()
            : 0;
          const localTime = localModifiedAt ? new Date(localModifiedAt).getTime() : 0;

          // If never synced on this browser OR server state is newer than local modifications, pull cleanly
          if (!lastSyncAt || serverTime >= localTime) {
            await serverSyncService.pullFromServer({ force: true, setters: settersRef.current });
            return;
          }
        }

        const idbSnap = await indexedDBService.getItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT);
        if (!idbSnap || typeof idbSnap !== 'object') return;

        const offloadedSet = new Set(storageService.getPersistenceDiagnostics().offloadedKeys);
        const fieldStorageKeyMap: Record<string, string> = {
          pdrGroups: STORAGE_KEYS.PDR_GROUPS,
          types: STORAGE_KEYS.STOCK_TYPES,
          designations: STORAGE_KEYS.DESIGNATIONS,
          rawStock: STORAGE_KEYS.RAW_STOCK,
          families: STORAGE_KEYS.FAMILIES,
          templates: STORAGE_KEYS.TEMPLATES,
          blueprints: STORAGE_KEYS.BLUEPRINTS,
          machines: STORAGE_KEYS.MACHINES,
          generalSystemTypes: STORAGE_KEYS.GENERAL_SYSTEM_TYPES,
          zones: STORAGE_KEYS.ZONES,
          machineElementsLedger: STORAGE_KEYS.MACHINE_BOM,
          warehouseItems: STORAGE_KEYS.WAREHOUSE_ITEMS,
          entrepotComponents: STORAGE_KEYS.ENTREPOT_COMPONENTS,
          compGroups: STORAGE_KEYS.COMP_GROUPS,
          compFamilies: STORAGE_KEYS.COMP_FAMILIES,
          compTemplates: STORAGE_KEYS.COMP_TEMPLATES,
          partGroups: STORAGE_KEYS.PART_GROUPS,
          partTypes: STORAGE_KEYS.PART_TYPES,
          partDesignations: STORAGE_KEYS.PART_DESIGNATIONS,
          users: STORAGE_KEYS.PERSONNEL,
          technicians: STORAGE_KEYS.TECHNICIANS,
          operations: STORAGE_KEYS.OPERATIONS,
          mouvements: STORAGE_KEYS.MOUVEMENTS,
          sortieDemands: STORAGE_KEYS.SORTIE_DEMANDS,
          replenishmentOrders: STORAGE_KEYS.REPLENISHMENT_ORDERS,
          preventiveTasks: STORAGE_KEYS.PREVENTIVE_TASKS,
          preventiveActions: STORAGE_KEYS.PREVENTIVE_ACTIONS,
          preventiveGuides: STORAGE_KEYS.PREVENTIVE_GUIDES,
          preventivePlans: STORAGE_KEYS.PREVENTIVE_PLANS,
          preventiveExecutions: STORAGE_KEYS.PREVENTIVE_EXECUTIONS,
          meterReadings: STORAGE_KEYS.METER_READINGS,
          auditEvents: STORAGE_KEYS.AUDIT_EVENTS,
          sortiesExterne: STORAGE_KEYS.SORTIE_EXTERNE,
          correctiveInterventions: STORAGE_KEYS.CORRECTIVE_INTERVENTIONS,
          correctiveTravauxAFaire: STORAGE_KEYS.CORRECTIVE_TRAVAUX,
          correctiveIntervenants: STORAGE_KEYS.CORRECTIVE_INTERVENANTS,
          workshopOrders: STORAGE_KEYS.WORKSHOP_ORDERS,
          needRequests: STORAGE_KEYS.NEED_REQUESTS,
        };

        const patch: Record<string, unknown> = {};
        for (const [field, storageKey] of Object.entries(fieldStorageKeyMap)) {
          const currentVal = state?.[field];
          const idbVal = idbSnap[field];
          const isCurrentEmpty = !Array.isArray(currentVal) || currentVal.length === 0;
          const isOffloadedAndRicher =
            offloadedSet.has(storageKey) &&
            Array.isArray(idbVal) &&
            (!Array.isArray(currentVal) || idbVal.length > currentVal.length);
          if ((isCurrentEmpty && Array.isArray(idbVal) && idbVal.length > 0) || isOffloadedAndRicher) {
            patch[field] = idbVal;
          }
        }

        if (Object.keys(patch).length > 0 && settersRef.current?.applyRemoteStateUpdate) {
          settersRef.current.applyRemoteStateUpdate(patch);
        }
      } catch {
        // Ignore IndexedDB or network read errors in restricted environments
      }
    })();
  }, []);

  // Synchronize external preventive_tasks_updated events (e.g. Excel / JSON import) with Zustand store
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleTasksUpdated = (e: any) => {
      if (e?.detail && Array.isArray(e.detail) && typeof settersRef.current?.setPreventiveTasks === 'function') {
        settersRef.current.setPreventiveTasks(e.detail);
      }
    };
    const handleExecutionsUpdated = (e: any) => {
      if (e?.detail && Array.isArray(e.detail) && typeof settersRef.current?.setPreventiveExecutions === 'function') {
        settersRef.current.setPreventiveExecutions(e.detail);
      }
    };
    window.addEventListener('preventive_tasks_updated', handleTasksUpdated);
    window.addEventListener('preventive_executions_updated', handleExecutionsUpdated);
    return () => {
      window.removeEventListener('preventive_tasks_updated', handleTasksUpdated);
      window.removeEventListener('preventive_executions_updated', handleExecutionsUpdated);
    };
  }, []);

  // 0.5 Periodic Network Polling controlled by SettingsDirectoryTab (gmao_polling_interval: 'off' | '5s' | '10s' | '30s')
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const parseIntervalMs = (raw: string | null): number => {
      const val = String(raw || '10s').trim().toLowerCase();
      if (val === 'off' || val === 'manual') return 0;
      if (val === '5s') return 5000;
      if (val === '30s') return 30000;
      return 10000; // default 10s
    };

    const setupPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      const rawInterval = storageService.getItem(STORAGE_KEYS.POLLING_INTERVAL);
      const ms = parseIntervalMs(rawInterval != null ? String(rawInterval) : null);
      if (ms <= 0) return;

      intervalId = setInterval(async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const startMode = storageService.getItem(STORAGE_KEYS.START_MODE);
        if (startMode === 'empty') return;
        try {
          const check = await serverSyncService.fetchServerState();
          if (!check.online || !check.state) return;
          const serverVersion = Number(check.state.version || 0);
          const localVersion = Number(serverSyncService.getLastServerVersion() || 0);
          if (serverVersion > 0 && serverVersion > localVersion) {
            await serverSyncService.pullFromServer({ force: false, setters: settersRef.current });
          }
        } catch {
          // Silent background check
        }
      }, ms);
    };

    setupPolling();
    window.addEventListener('gmao:sync_settings_updated', setupPolling);
    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('gmao:sync_settings_updated', setupPolling);
    };
  }, []);

  // 1. Debounced auto-save to LocalStorage and IndexedDB batch writes
  const { saveAllState } = useAutoSave(state, 1000, onStateChange);

  // 2. Real-time Multi-Window / Multi-Tab Synchronization via storage events
  useStateSync(setters, validators);

  // 3. Enterprise Domain Repositories synchronization with IndexedDB
  const { syncEnterpriseDb } = useEnterpriseDbSync(state);
  // Manual sync function is now exposed
  const manualSyncToIdb = syncEnterpriseDb;

  return { saveAllState, manualSyncToIdb };
}
