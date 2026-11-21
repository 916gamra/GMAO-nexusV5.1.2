import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import { indexedDBService } from '../../infrastructure/database/IndexedDBService';
import { serverSyncService } from '../../services/serverSyncService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useGmaoPersistence } from '../../hooks/useGmaoPersistence';
import {
  MASTER_REFERENTIAL_KEYS,
  OPERATIONS_HISTORY_KEYS,
} from '../../core/backup/AutoBackupService';

describe('Batch 1 Client Persistence, Real-Factory Hydration, Polling Stability & AutoBackup', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
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
  });

  it('allows storageService.hydrateFromIndexedDB in Real Factory Mode (DEMO_MODE=false, START_MODE=custom) while still blocking START_MODE=empty', async () => {
    const idbSpy = vi
      .spyOn(indexedDBService, 'getItem')
      .mockResolvedValue([{ id: 'M-REAL-1', code: 'M-REAL-1' }]);

    // 1. Real Factory Mode: DEMO_MODE=false, START_MODE='custom'
    storageService.setItem(STORAGE_KEYS.DEMO_MODE, false);
    storageService.setItem(STORAGE_KEYS.START_MODE, 'custom');
    storageService.removeItem(STORAGE_KEYS.MACHINES);

    const hydratedReal = await storageService.hydrateFromIndexedDB(STORAGE_KEYS.MACHINES, []);
    expect(hydratedReal).toEqual([{ id: 'M-REAL-1', code: 'M-REAL-1' }]);
    expect(idbSpy).toHaveBeenCalledWith(STORAGE_KEYS.MACHINES, null);

    // 2. Empty Factory Mode: START_MODE='empty' MUST remain protected
    idbSpy.mockClear();
    storageService.setItem(STORAGE_KEYS.START_MODE, 'empty');
    storageService.setItem(STORAGE_KEYS.MACHINES, []);

    const hydratedEmpty = await storageService.hydrateFromIndexedDB(STORAGE_KEYS.MACHINES, []);
    expect(hydratedEmpty).toEqual([]);
    expect(idbSpy).not.toHaveBeenCalled();
  });

  it('triggers useAutoSave persistence and serverSyncService.scheduleAutoPush when workshopOrders or needRequests mutate', async () => {
    vi.useFakeTimers();
    const pushSpy = vi.spyOn(serverSyncService, 'scheduleAutoPush').mockImplementation(() => {});

    const baseState: Record<string, any> = {
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
      machines: [],
      generalSystemTypes: [],
      machineElementsLedger: [],
      warehouseItems: [],
      entrepotComponents: [],
      zones: [],
      users: [],
      technicians: [],
      operations: [],
      mouvements: [],
      sortieDemands: [],
      replenishmentOrders: [],
      rawStock: [],
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

    function Harness({ state }: { state: Record<string, any> }) {
      useAutoSave(state, 50);
      return null;
    }

    // Initial mount save (sets isInitialSave = false without scheduling auto-push)
    await act(async () => {
      root!.render(React.createElement(Harness, { state: baseState }));
    });
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    expect(pushSpy).not.toHaveBeenCalled();

    // Mutate previously omitted collections (workshopOrders + needRequests)
    const updatedState = {
      ...baseState,
      workshopOrders: [{ id: 'BA-100', statut: 'EN_COURS', designation: 'Usinage axe' }],
      needRequests: [{ id: 'BES-200', statut: 'SOUMISE', ref_pdr: 'PDR-01' }],
    };

    await act(async () => {
      root!.render(React.createElement(Harness, { state: updatedState }));
    });
    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    const pushedState = pushSpy.mock.calls[0][0] as Record<string, any>;
    expect(pushedState.workshopOrders).toHaveLength(1);
    expect(pushedState.needRequests).toHaveLength(1);
    expect(storageService.getItem(STORAGE_KEYS.WORKSHOP_ORDERS)).toHaveLength(1);
    expect(storageService.getItem(STORAGE_KEYS.NEED_REQUESTS)).toHaveLength(1);
  });

  it('keeps LAN polling interval stable across re-renders with new setters objects AND pulls on mount in Real Factory Mode', async () => {
    storageService.setItem(STORAGE_KEYS.DEMO_MODE, false);
    storageService.setItem(STORAGE_KEYS.START_MODE, 'custom');
    storageService.setItem(STORAGE_KEYS.POLLING_INTERVAL, '10s');

    const fetchSpy = vi.spyOn(serverSyncService, 'fetchServerState').mockResolvedValue({
      online: true,
      state: { version: 5, updatedAt: '2026-05-01T10:00:00Z', machines: [{ id: 'M-1' }] },
      summary: { totalItems: 1, updatedAt: '2026-05-01T10:00:00Z', version: 5 },
    } as any);
    const pullSpy = vi.spyOn(serverSyncService, 'pullFromServer').mockResolvedValue({
      success: true,
    } as any);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    function PersistenceHarness({ tick }: { tick: number }) {
      useGmaoPersistence({
        state: { machines: [], tick },
        // Intentionally fresh object literal on every render (mirrors useGmaoState)
        setters: {
          applyRemoteStateUpdate: () => {},
          setPreventiveTasks: () => {},
          setPreventiveExecutions: () => {},
        },
        validators: {},
        onStateChange: null,
      });
      return null;
    }

    await act(async () => {
      root!.render(React.createElement(PersistenceHarness, { tick: 1 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Startup pull MUST run in Real Factory Mode (DEMO_MODE=false, START_MODE='custom')
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pullSpy).toHaveBeenCalledTimes(1);

    const initialIntervalCount = setIntervalSpy.mock.calls.length;
    const initialClearCount = clearIntervalSpy.mock.calls.length;

    // Re-render 3 times with fresh setters objects — polling interval MUST NOT be torn down or recreated
    for (let tick = 2; tick <= 4; tick++) {
      await act(async () => {
        root!.render(React.createElement(PersistenceHarness, { tick }));
      });
    }

    expect(setIntervalSpy.mock.calls.length).toBe(initialIntervalCount);
    expect(clearIntervalSpy.mock.calls.length).toBe(initialClearCount);
  });

  it('includes PART_GROUPS, WORKSHOP_ORDERS, NEED_REQUESTS, FINANCIAL_BUDGETS, and CURRENCY_CONFIG in AutoBackupService canonical keys', () => {
    const allKeys = new Set([...MASTER_REFERENTIAL_KEYS, ...OPERATIONS_HISTORY_KEYS]);
    expect(allKeys.has(STORAGE_KEYS.PART_GROUPS)).toBe(true);
    expect(allKeys.has(STORAGE_KEYS.WORKSHOP_ORDERS)).toBe(true);
    expect(allKeys.has(STORAGE_KEYS.NEED_REQUESTS)).toBe(true);
    expect(allKeys.has(STORAGE_KEYS.FINANCIAL_BUDGETS)).toBe(true);
    expect(allKeys.has(STORAGE_KEYS.CURRENCY_CONFIG)).toBe(true);
  });
});
