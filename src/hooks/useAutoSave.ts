import { useEffect, useRef, useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { STORAGE_KEYS } from '../infrastructure/persistence/storageKeys';
import { Logger } from '../core/logger/LoggerService';
import { AutoBackupService } from '../core/backup/AutoBackupService';
import { tabSyncService } from '../services/TabSyncService';
import { serverSyncService } from '../services/serverSyncService';

/**
 * High-Performance Hook to manage debounced auto-saving of GMAO application state to LocalStorage and IndexedDB,
 * with storage quota checks, persistent storage protection, and instant BroadcastChannel multi-tab broadcasting.
 * Writes exclusively to canonical STORAGE_KEYS.
 */
export function useAutoSave(state, debounceMs = 1000, onStateChange = null) {
  const {
    pdrGroups,
    types,
    designations,
    families,
    templates,
    blueprints,
    compGroups,
    compFamilies,
    compTemplates,
    partGroups,
    partTypes,
    partDesignations,
    machines,
    generalSystemTypes,
    machineElementsLedger,
    warehouseItems,
    entrepotComponents,
    zones,
    users,
    technicians,
    operations,
    mouvements,
    sortieDemands,
    replenishmentOrders,
    rawStock,
    preventiveTasks,
    preventiveActions,
    preventiveGuides,
    preventivePlans,
    preventiveExecutions,
    meterReadings,
    auditEvents,
    sortiesExterne,
    correctiveInterventions,
    correctiveActionsByPanne,
    correctivePanneCategories,
    correctiveTravauxAFaire,
    correctiveIntervenants,
    workshopOrders,
    needRequests,
  } = state;

  const saveTimer = useRef(null);
  const lastSavedState = useRef(null);
  const isInitialSave = useRef(true);

  // Request persistent storage protection on mount
  useEffect(() => {
    AutoBackupService.requestPersistentStorage();
  }, []);

  const saveAllState = useCallback(() => {
    const fullState = {
      pdrGroups,
      types,
      designations,
      families,
      templates,
      blueprints,
      compGroups,
      compFamilies,
      compTemplates,
      partGroups,
      partTypes,
      partDesignations,
      machines,
      generalSystemTypes,
      machineElementsLedger,
      warehouseItems,
      entrepotComponents,
      zones,
      users,
      technicians,
      operations,
      mouvements,
      sortieDemands,
      replenishmentOrders,
      rawStock,
      preventiveTasks,
      preventiveActions,
      preventiveGuides,
      preventivePlans,
      preventiveExecutions,
      meterReadings,
      auditEvents,
      sortiesExterne,
      correctiveInterventions,
      correctiveActionsByPanne,
      correctivePanneCategories,
      correctiveTravauxAFaire,
      correctiveIntervenants,
      workshopOrders,
      needRequests,
    };

    const currentStateStr = JSON.stringify(fullState);
    if (lastSavedState.current === currentStateStr) {
      return;
    }
    lastSavedState.current = currentStateStr;

    try {
      AutoBackupService.checkStorageQuota();

      // Build unified canonical key-value batch (committed to RAM + tiered localStorage + ONE atomic IndexedDB transaction)
      const canonicalBatch: Record<string, unknown> = {
        [STORAGE_KEYS.FULL_STATE_SNAPSHOT]: fullState,
      };
      if (users !== undefined) canonicalBatch[STORAGE_KEYS.PERSONNEL] = users;
      if (technicians !== undefined) canonicalBatch[STORAGE_KEYS.TECHNICIANS] = technicians;
      if (operations !== undefined) canonicalBatch[STORAGE_KEYS.OPERATIONS] = operations;
      if (machines !== undefined) canonicalBatch[STORAGE_KEYS.MACHINES] = machines;
      if (generalSystemTypes !== undefined) canonicalBatch[STORAGE_KEYS.GENERAL_SYSTEM_TYPES] = generalSystemTypes;
      if (families !== undefined) canonicalBatch[STORAGE_KEYS.FAMILIES] = families;
      if (templates !== undefined) canonicalBatch[STORAGE_KEYS.TEMPLATES] = templates;
      if (blueprints !== undefined) canonicalBatch[STORAGE_KEYS.BLUEPRINTS] = blueprints;
      if (zones !== undefined) canonicalBatch[STORAGE_KEYS.ZONES] = zones;
      if (machineElementsLedger !== undefined) canonicalBatch[STORAGE_KEYS.MACHINE_BOM] = machineElementsLedger;
      if (pdrGroups !== undefined) canonicalBatch[STORAGE_KEYS.PDR_GROUPS] = pdrGroups;
      if (rawStock !== undefined) canonicalBatch[STORAGE_KEYS.RAW_STOCK] = rawStock;
      if (types !== undefined) canonicalBatch[STORAGE_KEYS.STOCK_TYPES] = types;
      if (designations !== undefined) canonicalBatch[STORAGE_KEYS.DESIGNATIONS] = designations;
      if (mouvements !== undefined) canonicalBatch[STORAGE_KEYS.MOUVEMENTS] = mouvements;
      if (sortieDemands !== undefined) canonicalBatch[STORAGE_KEYS.SORTIE_DEMANDS] = sortieDemands;
      if (replenishmentOrders !== undefined) canonicalBatch[STORAGE_KEYS.REPLENISHMENT_ORDERS] = replenishmentOrders;
      if (warehouseItems !== undefined) canonicalBatch[STORAGE_KEYS.WAREHOUSE_ITEMS] = warehouseItems;
      if (entrepotComponents !== undefined) canonicalBatch[STORAGE_KEYS.ENTREPOT_COMPONENTS] = entrepotComponents;
      if (compGroups !== undefined) canonicalBatch[STORAGE_KEYS.COMP_GROUPS] = compGroups;
      if (compFamilies !== undefined) canonicalBatch[STORAGE_KEYS.COMP_FAMILIES] = compFamilies;
      if (compTemplates !== undefined) canonicalBatch[STORAGE_KEYS.COMP_TEMPLATES] = compTemplates;
      if (partGroups !== undefined) canonicalBatch[STORAGE_KEYS.PART_GROUPS] = partGroups;
      if (partTypes !== undefined) canonicalBatch[STORAGE_KEYS.PART_TYPES] = partTypes;
      if (partDesignations !== undefined) canonicalBatch[STORAGE_KEYS.PART_DESIGNATIONS] = partDesignations;
      if (preventiveTasks !== undefined) canonicalBatch[STORAGE_KEYS.PREVENTIVE_TASKS] = preventiveTasks;
      if (preventiveActions !== undefined) canonicalBatch[STORAGE_KEYS.PREVENTIVE_ACTIONS] = preventiveActions;
      if (preventiveGuides !== undefined) canonicalBatch[STORAGE_KEYS.PREVENTIVE_GUIDES] = preventiveGuides;
      if (preventivePlans !== undefined) canonicalBatch[STORAGE_KEYS.PREVENTIVE_PLANS] = preventivePlans;
      if (preventiveExecutions !== undefined) canonicalBatch[STORAGE_KEYS.PREVENTIVE_EXECUTIONS] = preventiveExecutions;
      if (meterReadings !== undefined) canonicalBatch[STORAGE_KEYS.METER_READINGS] = meterReadings;
      if (auditEvents !== undefined) canonicalBatch[STORAGE_KEYS.AUDIT_EVENTS] = auditEvents;
      if (sortiesExterne !== undefined) canonicalBatch[STORAGE_KEYS.SORTIE_EXTERNE] = sortiesExterne;
      if (correctiveInterventions !== undefined) canonicalBatch[STORAGE_KEYS.CORRECTIVE_INTERVENTIONS] = correctiveInterventions;
      if (correctiveActionsByPanne !== undefined) canonicalBatch[STORAGE_KEYS.CORRECTIVE_ACTIONS_BY_PANNE] = correctiveActionsByPanne;
      if (correctivePanneCategories !== undefined) canonicalBatch[STORAGE_KEYS.CORRECTIVE_PANNE_CATEGORIES] = correctivePanneCategories;
      if (correctiveTravauxAFaire !== undefined) canonicalBatch[STORAGE_KEYS.CORRECTIVE_TRAVAUX] = correctiveTravauxAFaire;
      if (correctiveIntervenants !== undefined) canonicalBatch[STORAGE_KEYS.CORRECTIVE_INTERVENANTS] = correctiveIntervenants;
      if (workshopOrders !== undefined) canonicalBatch[STORAGE_KEYS.WORKSHOP_ORDERS] = workshopOrders;
      if (needRequests !== undefined) canonicalBatch[STORAGE_KEYS.NEED_REQUESTS] = needRequests;

      void storageService.setItemsBatch(canonicalBatch);

      // Broadcast state update instantly to other open browser tabs
      tabSyncService.broadcastState(fullState);

      if (isInitialSave.current) {
        isInitialSave.current = false;
      } else {
        serverSyncService.markLocalModified();
        const autoWriteRaw = storageService.getItem(STORAGE_KEYS.AUTO_WRITE_EXCEL);
        const autoWriteEnabled = autoWriteRaw !== false && autoWriteRaw !== 'false';
        if (autoWriteEnabled) {
          serverSyncService.scheduleAutoPush(fullState, 2000);
        }
      }

      window.dispatchEvent(new CustomEvent('gmao:state_saved', { detail: { timestamp: Date.now() } }));
      if (typeof onStateChange === 'function') {
        onStateChange(fullState);
      }
    } catch (err) {
      Logger.error('Failed to auto-save state:', err, 'useAutoSave');
    }
  }, [
    pdrGroups,
    types,
    designations,
    families,
    templates,
    blueprints,
    compGroups,
    compFamilies,
    compTemplates,
    partGroups,
    partTypes,
    partDesignations,
    machines,
    generalSystemTypes,
    machineElementsLedger,
    warehouseItems,
    entrepotComponents,
    zones,
    users,
    technicians,
    operations,
    mouvements,
    sortieDemands,
    replenishmentOrders,
    rawStock,
    preventiveTasks,
    preventiveActions,
    preventiveGuides,
    preventivePlans,
    preventiveExecutions,
    meterReadings,
    auditEvents,
    sortiesExterne,
    correctiveInterventions,
    correctiveActionsByPanne,
    correctivePanneCategories,
    correctiveTravauxAFaire,
    correctiveIntervenants,
    workshopOrders,
    needRequests,
    onStateChange,
  ]);

  // Debounce saving
  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    window.dispatchEvent(new CustomEvent('gmao:state_saving'));

    saveTimer.current = setTimeout(() => {
      saveAllState();
    }, debounceMs);

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [saveAllState, debounceMs]);

  return { saveAllState };
}
