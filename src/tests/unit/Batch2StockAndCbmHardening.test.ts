import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StockCalculationService } from '../../domain/pdr/services/StockCalculationService';
import { resolvePreventiveLaborRate } from '../../domain/preventive/preventiveScheduleEngine';
import { ALLOWED_ENTITIES } from '../../server/types';
import { FIELD_WRITABLE_ENTITIES } from '../../core/security/serverRbacPolicy';
import { MASTER_REFERENTIAL_KEYS } from '../../core/backup/AutoBackupService';
import { STORAGE_KEYS } from '../../infrastructure/persistence/storageKeys';
import { storageService } from '../../utils/storageService';
import { serverSyncService } from '../../services/serverSyncService';
import { DataGateway } from '../../application/DataGateway';
import { ExecutionService } from '../../application/services/preventive/ExecutionService';

describe('Batch 2 Hardening — Stock Logic, Execution ID Deduplication & CBM Lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    StockCalculationService.clearCache();
  });

  describe('1. StockCalculationService parity & nullish coalescing', () => {
    it('uses clean French wording "Stock disponible:" (never "Mousse disponible:") on shortage', () => {
      const check = StockCalculationService.checkAvailability(
        'RLT-6205',
        5,
        { ref: 'RLT-6205', stockInitial: 2, seuil: 1 },
        []
      );

      expect(check.available).toBe(false);
      expect(check.shortage).toBe(3);
      expect(check.message).toContain('Stock disponible: 2');
      expect(check.message).not.toContain('Mousse');
    });

    it('enforces isAchatUnique alert parity across calculateAllStocks, calculateStockByRef, getAlertStatus, and generateStockReport', () => {
      const oneOffArticle = {
        ref: 'ONE-OFF-01',
        designation: 'Joint spécial commande unique',
        stockInitial: 0,
        seuil: 2,
        isAchatUnique: true,
        prixUnitaire: 120,
      };
      const regularArticle = {
        ref: 'STD-01',
        designation: 'Filtre standard',
        stockInitial: 0,
        seuil: 2,
        isAchatUnique: false,
        prixUnitaire: 50,
      };

      const all = StockCalculationService.calculateAllStocks([oneOffArticle, regularArticle], []);
      const byRef = StockCalculationService.calculateStockByRef(oneOffArticle, []);
      const report = StockCalculationService.generateStockReport([oneOffArticle, regularArticle], []);

      expect(all[0].alerte).toBe('OK');
      expect(all[1].alerte).toBe('RUPTURE');
      expect(byRef.alerte).toBe('OK');
      expect(StockCalculationService.getAlertStatus(oneOffArticle, 0)).toBe('OK');
      expect(report.summary.ok).toBe(1);
      expect(report.summary.rupture).toBe(1);
    });

    it('respects explicit stockInitial: 0 without falling through to stale stock_initial alias', () => {
      const articleWithZero = {
        ref: 'ZERO-01',
        stockInitial: 0,
        stock_initial: 99,
        seuil: 0,
        minThreshold: 50,
      };

      const computed = StockCalculationService.calculateStockActuel(articleWithZero, []);
      const batch = StockCalculationService.calculateStockByRef(articleWithZero, []);
      const report = StockCalculationService.generateStockReport([articleWithZero], []);

      expect(computed).toBe(0);
      expect(batch.stockInitial).toBe(0);
      expect(batch.stockActuel).toBe(0);
      expect(batch.seuil).toBe(0);
      expect(report.totalQuantity).toBe(0);
    });
  });

  describe('2. Preventive labor rate & pending execution ID preservation', () => {
    it('resolves labor rate safely when technicians list mixes string labels and objects', () => {
      const rate = resolvePreventiveLaborRate(
        ['Legacy Label', { id: 'TECH-1', nom: 'Ahmed', taux_horaire: 145 }],
        'TECH-1',
        undefined,
        80
      );
      expect(rate).toBe(145);

      const fallbackRate = resolvePreventiveLaborRate(
        ['Legacy Label'],
        'Inconnu',
        undefined,
        95
      );
      expect(fallbackRate).toBe(95);
    });

    it('preserves the original pending execution ID when resubmitting a pending preventive claim', () => {
      const first = ExecutionService.recordExecution(
        { id: 'T-ID-KEEP', id_machine: 'M-200', composant: 'Ventilateur', action_code: 'C' },
        { submitForValidation: true, date_realisation: '2026-11-20', observations: 'Claim v1' }
      );
      const second = ExecutionService.recordExecution(
        { id: 'T-ID-KEEP', id_machine: 'M-200', composant: 'Ventilateur', action_code: 'C' },
        { submitForValidation: true, date_realisation: '2026-11-20', observations: 'Claim v2' }
      );

      expect(first.execution.id).toBeTruthy();
      expect(second.execution.id).toBe(first.execution.id);
      expect(ExecutionService.getExecutions().filter((e) => e.taskId === 'T-ID-KEEP')).toHaveLength(1);
    });
  });

  describe('3. CBM_MANUAL_RULES full persistence, sync, backup, and reset lifecycle', () => {
    it('registers cbmManualRules across server allowlist, RBAC policy, backup referentials, and buildLocalPayload', () => {
      expect(ALLOWED_ENTITIES).toContain('cbmManualRules');
      expect(FIELD_WRITABLE_ENTITIES.has('cbmManualRules')).toBe(true);
      expect(MASTER_REFERENTIAL_KEYS).toContain(STORAGE_KEYS.CBM_MANUAL_RULES);

      const sampleRule = {
        id: 'CBM-M1-001',
        machineCode: 'M-01',
        organe: 'Palier Moteur',
        parameter: 'TEMPERATURE_PALIER',
        unit: '°C',
        warningThreshold: 75,
        criticalThreshold: 90,
      };
      storageService.setItem(STORAGE_KEYS.CBM_MANUAL_RULES, [sampleRule]);

      const payload = serverSyncService.buildLocalPayload();
      expect(payload.cbmManualRules).toEqual([sampleRule]);
    });

    it('hydrates CBM_MANUAL_RULES on loadFullServerState and wipes it cleanly on clearAllForRealFactory', async () => {
      const events: unknown[] = [];
      const handler = vi.fn((ev: Event) => {
        events.push((ev as CustomEvent).detail);
      });
      window.addEventListener('gmao:cbm-rules-updated', handler);

      try {
        const remoteRules = [
          {
            id: 'CBM-REMOTE-1',
            machineCode: 'M-99',
            organe: 'Réducteur',
            parameter: 'VIBRATION_RMS',
            unit: 'mm/s',
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
          },
        ];

        DataGateway.loadFullServerState({ cbmManualRules: remoteRules });
        expect(storageService.getItem(STORAGE_KEYS.CBM_MANUAL_RULES)).toEqual(remoteRules);
        expect(storageService.getItem(STORAGE_KEYS.START_MODE)).toBe('custom');
        expect(events[events.length - 1]).toEqual(remoteRules);

        await DataGateway.clearAllForRealFactory();
        expect(storageService.getItem(STORAGE_KEYS.CBM_MANUAL_RULES)).toEqual([]);
        expect(storageService.getItem(STORAGE_KEYS.START_MODE)).toBe('empty');
        expect(events[events.length - 1]).toEqual([]);
      } finally {
        window.removeEventListener('gmao:cbm-rules-updated', handler);
      }
    });
  });
});
