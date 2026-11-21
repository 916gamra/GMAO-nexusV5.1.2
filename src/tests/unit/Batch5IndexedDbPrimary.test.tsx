import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { indexedDBService } from '../../infrastructure/database/IndexedDBService';
import { storageService } from '../../utils/storageService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { AutoBackupService } from '../../core/backup/AutoBackupService';
import { serverSyncService } from '../../services/serverSyncService';

describe('Batch 5: IndexedDB-Primary Persistence Engine, Pre-Boot Hydration & Quota Safety', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    await indexedDBService.clear('app_data');
    storageService.clearCache();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns an exact key-value map from IndexedDBService.getAllEntries("app_data")', async () => {
    await indexedDBService.setItemsBatch({
      [STORAGE_KEYS.MACHINES]: [{ id: 'M-01', nom: 'Compresseur 1' }],
      [STORAGE_KEYS.RAW_STOCK]: [{ ref: 'ROUL-6205', stockInitial: 10 }],
    });

    const entries = await indexedDBService.getAllEntries('app_data');
    expect(entries[STORAGE_KEYS.MACHINES]).toEqual([{ id: 'M-01', nom: 'Compresseur 1' }]);
    expect(entries[STORAGE_KEYS.RAW_STOCK]).toEqual([{ ref: 'ROUL-6205', stockInitial: 10 }]);

    // getAll('app_data') must behave identically to getAllEntries('app_data')
    const allMap = await indexedDBService.getAll('app_data');
    expect(allMap).toEqual(entries);
  });

  it('offloads FULL_STATE_SNAPSHOT and >128KB collections to IndexedDB Primary without stale localStorage copies or LRU cache eviction', async () => {
    const idbBacking = new Map<string, unknown>();
    vi.spyOn(indexedDBService, 'isSupported').mockReturnValue(true);
    vi.spyOn(indexedDBService, 'setItem').mockImplementation(async (k, v) => {
      idbBacking.set(k, v);
      return true;
    });
    vi.spyOn(indexedDBService, 'removeItem').mockImplementation(async (k) => {
      idbBacking.delete(k);
      return true;
    });

    // Seed an older stale copy in localStorage before writing a large >128KB movements list
    localStorage.setItem(STORAGE_KEYS.MOUVEMENTS, JSON.stringify([{ id: 'STALE-MVT' }]));
    const largeMovements = Array.from({ length: 1200 }, (_, i) => ({
      id: `MVT-${i + 1}`,
      ref: `PDR-${String(i).padStart(4, '0')}`,
      type: 'SORTIE',
      quantite: 2,
      date: '2026-10-15',
      motif: 'Remplacement roulement palier principal ligne extrusion',
    }));

    expect(storageService.setItem(STORAGE_KEYS.MOUVEMENTS, largeMovements)).toBe(true);
    expect(storageService.setItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT, { mouvements: largeMovements })).toBe(
      true
    );
    await storageService.flushPendingWrites();

    // Both must be in IndexedDB and REMOVED from localStorage (no stale shadow copy!)
    expect(localStorage.getItem(STORAGE_KEYS.MOUVEMENTS)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT)).toBeNull();
    expect(idbBacking.get(STORAGE_KEYS.MOUVEMENTS)).toHaveLength(1200);
    expect(idbBacking.has(STORAGE_KEYS.FULL_STATE_SNAPSHOT)).toBe(true);

    const diag = storageService.getPersistenceDiagnostics();
    expect(diag.engine).toBe('indexeddb-primary');
    expect(diag.offloadedKeys).toContain(STORAGE_KEYS.MOUVEMENTS);
    expect(diag.offloadedKeys).toContain(STORAGE_KEYS.FULL_STATE_SNAPSHOT);

    // Flood cache with 65 transient non-primary keys (> MAX_CACHE_SIZE = 50)
    for (let i = 0; i < 65; i++) {
      storageService.setItem(`temp_ui_pref_${i}`, { step: i });
    }

    // Protected IndexedDB-Primary collections must NEVER be evicted from RAM mirror
    expect(storageService.getItem<unknown[]>(STORAGE_KEYS.MOUVEMENTS)).toHaveLength(1200);
    expect(storageService.getItem<Record<string, unknown>>(STORAGE_KEYS.FULL_STATE_SNAPSHOT)).toBeTruthy();
  });

  it('pre-hydrates offloaded IndexedDB-Primary data on reload, migrates legacy localStorage keys upward, and strictly respects START_MODE=empty', async () => {
    const idbBacking = new Map<string, unknown>([
      [STORAGE_KEYS.MOUVEMENTS, [{ id: 'IDB-MVT-1', ref: 'PDR-01', quantite: 5 }]],
      [STORAGE_KEYS.IDB_PRIMARY_MIGRATED, 'true'],
    ]);

    vi.spyOn(indexedDBService, 'isSupported').mockReturnValue(true);
    vi.spyOn(indexedDBService, 'getAllEntries').mockImplementation(async () =>
      Object.fromEntries(idbBacking.entries())
    );
    const batchSpy = vi.spyOn(indexedDBService, 'setItemsBatch').mockImplementation(async (map) => {
      for (const [k, v] of Object.entries(map)) {
        idbBacking.set(k, v);
      }
      return true;
    });

    // Simulate reload: localStorage has legacy-only MACHINES + stale bloated FULL_STATE_SNAPSHOT + offload index for MOUVEMENTS
    localStorage.setItem(
      STORAGE_KEYS.IDB_OFFLOADED_KEYS,
      JSON.stringify([STORAGE_KEYS.MOUVEMENTS])
    );
    localStorage.setItem(STORAGE_KEYS.MACHINES, JSON.stringify([{ id: 'M-LEGACY-1' }]));
    localStorage.setItem(
      STORAGE_KEYS.FULL_STATE_SNAPSHOT,
      JSON.stringify({ machines: [{ id: 'M-LEGACY-1' }] })
    );
    storageService.clearCache();

    const result = await storageService.hydrateAllFromIndexedDB();
    expect(result.source).toBe('indexeddb');
    expect(result.hydratedCount).toBeGreaterThanOrEqual(1);
    expect(result.migratedUpCount).toBeGreaterThanOrEqual(1);

    // Offloaded MOUVEMENTS is hydrated synchronously into RAM from IndexedDB
    expect(storageService.getItem(STORAGE_KEYS.MOUVEMENTS)).toEqual([
      { id: 'IDB-MVT-1', ref: 'PDR-01', quantite: 5 },
    ]);
    // Legacy MACHINES was migrated upward into IndexedDB in batch
    expect(batchSpy).toHaveBeenCalled();
    expect(idbBacking.get(STORAGE_KEYS.MACHINES)).toEqual([{ id: 'M-LEGACY-1' }]);
    // Bloated FULL_STATE_SNAPSHOT was reclaimed from localStorage
    expect(localStorage.getItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT)).toBeNull();

    // Now test START_MODE='empty' protection: must NEVER revive non-empty IDB domain data
    localStorage.clear();
    localStorage.setItem(STORAGE_KEYS.START_MODE, 'empty');
    localStorage.setItem(STORAGE_KEYS.MOUVEMENTS, '[]');
    storageService.clearCache();

    await storageService.hydrateAllFromIndexedDB();
    expect(storageService.getItem(STORAGE_KEYS.MOUVEMENTS)).toEqual([]);
  });

  it('handles QuotaExceededError via clean IndexedDB offload and reports honest failures when IndexedDB rejects', async () => {
    vi.spyOn(indexedDBService, 'isSupported').mockReturnValue(true);
    const idbSetSpy = vi.spyOn(indexedDBService, 'setItem').mockResolvedValue(true);

    // Force QuotaExceededError on localStorage.setItem for RAW_STOCK
    const originalSetItem = Storage.prototype.setItem;
    const lsSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === STORAGE_KEYS.RAW_STOCK) {
        const quotaErr = new Error('QuotaExceededError');
        quotaErr.name = 'QuotaExceededError';
        throw quotaErr;
      }
      return originalSetItem.call(this, key, value);
    });

    const ok = storageService.setItem(STORAGE_KEYS.RAW_STOCK, [{ ref: 'PDR-Q1', stockInitial: 8 }]);
    await storageService.flushPendingWrites();

    expect(ok).toBe(true);
    expect(idbSetSpy).toHaveBeenCalledWith(STORAGE_KEYS.RAW_STOCK, [
      { ref: 'PDR-Q1', stockInitial: 8 },
    ]);
    expect(storageService.getPersistenceDiagnostics().offloadedKeys).toContain(
      STORAGE_KEYS.RAW_STOCK
    );
    expect(storageService.getPersistenceDiagnostics().failedKeys).toEqual([]);

    // Now simulate IndexedDB transaction failure -> diagnostics must report failure honestly
    idbSetSpy.mockResolvedValueOnce(false);
    storageService.setItem(STORAGE_KEYS.AUDIT_EVENTS, [{ id: 'AUD-1' }]);
    await storageService.flushPendingWrites();

    expect(storageService.getPersistenceDiagnostics().failedKeys).toContain(
      STORAGE_KEYS.AUDIT_EVENTS
    );

    lsSpy.mockRestore();
  });

  it('commits useAutoSave in ONE atomic IndexedDB setItemsBatch transaction and includes offloaded keys in AutoBackupService', async () => {
    vi.useFakeTimers();
    vi.spyOn(serverSyncService, 'scheduleAutoPush').mockImplementation(() => {});
    vi.spyOn(indexedDBService, 'isSupported').mockReturnValue(true);
    const singleSetSpy = vi.spyOn(indexedDBService, 'setItem').mockResolvedValue(true);
    const batchSetSpy = vi.spyOn(indexedDBService, 'setItemsBatch').mockResolvedValue(true);

    const largeMovements = Array.from({ length: 1200 }, (_, i) => ({
      id: `M-${i}`,
      ref: 'ROUL-6205',
      type: 'SORTIE',
      quantite: 1,
      motif: 'Consommation atelier extrusion principale',
    }));

    const state: Record<string, any> = {
      pdrGroups: [],
      types: [],
      designations: [],
      families: [],
      templates: [],
      blueprints: [],
      compGroups: [],
      compFamilies: [],
      compTemplates: [],
      partGroups: [],
      partTypes: [],
      partDesignations: [],
      machines: [{ id: 'M-1', nom: 'Presse 1' }],
      generalSystemTypes: [],
      machineElementsLedger: [],
      warehouseItems: [],
      entrepotComponents: [],
      zones: [],
      users: [],
      technicians: [],
      operations: [],
      mouvements: largeMovements,
      sortieDemands: [],
      replenishmentOrders: [],
      rawStock: [{ ref: 'ROUL-6205', stockInitial: 50 }],
      preventiveTasks: [],
      preventiveActions: [],
      preventiveGuides: [],
      preventivePlans: [],
      preventiveExecutions: [],
      meterReadings: [],
      auditEvents: [],
      sortiesExterne: [],
      correctiveInterventions: [],
      correctiveActionsByPanne: {},
      correctivePanneCategories: {},
      correctiveTravauxAFaire: [],
      correctiveIntervenants: [],
      workshopOrders: [],
      needRequests: [],
    };

    function Harness() {
      useAutoSave(state, 50);
      return null;
    }

    await act(async () => {
      root!.render(React.createElement(Harness));
    });
    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    // Exactly ONE atomic batch commit to IndexedDB (zero per-key setItem amplification!)
    expect(batchSetSpy).toHaveBeenCalledTimes(1);
    expect(singleSetSpy).not.toHaveBeenCalled();

    // MOUVEMENTS was offloaded from localStorage (>128KB), yet AutoBackupService MUST capture it cleanly
    expect(localStorage.getItem(STORAGE_KEYS.MOUVEMENTS)).toBeNull();
    const collected = AutoBackupService.collectStorageDataForKeys([
      STORAGE_KEYS.MOUVEMENTS,
      STORAGE_KEYS.MACHINES,
    ]);
    expect(collected[STORAGE_KEYS.MOUVEMENTS]).toHaveLength(1200);
    expect(collected[STORAGE_KEYS.MACHINES]).toEqual([{ id: 'M-1', nom: 'Presse 1' }]);
  });
});
