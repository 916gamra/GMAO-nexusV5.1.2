import { constantTimeEqual, sha256Hex, symmetricDecrypt } from '../core/security/nativeCrypto';
import { Logger } from '../core/logger/LoggerService';
import { indexedDBService } from '../infrastructure/database/IndexedDBService';
import {
  STORAGE_KEYS,
  ALL_LEGACY_KEYS,
  IDB_PRIMARY_KEYS,
  IDB_ONLY_KEYS,
} from '../infrastructure/persistence/storageKeys';
import { getSafeLocalStorage } from '../infrastructure/persistence/safeStorage';

// Cache configuration
const MAX_CACHE_SIZE = 50;
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
// Domain collections larger than 128KB automatically offload from 5MB localStorage to IndexedDB Primary
const LOCALSTORAGE_OFFLOAD_THRESHOLD_BYTES = 128 * 1024;

const SECURITY_MANAGED_PREFIXES = ['gmao_auth_', 'gmao_security_', 'gmao_vault_'];
const SECURITY_MANAGED_EXACT = new Set([
  'gmao_auth_accounts_v2',
  'gmao_security_audit_log_v1',
  'gmao_security_audit_head_v1',
]);

function isSecurityManagedKey(key: string): boolean {
  if (SECURITY_MANAGED_EXACT.has(key)) return true;
  return SECURITY_MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// Map for memory cache with access timestamp
const memoryCache = new Map<string, any>();
let lastCleanupTime = Date.now();

// Batch 5: IndexedDB-Primary tracking state
const offloadedToIdbKeys = new Set<string>();
const pendingIdbWrites = new Set<Promise<unknown>>();
const idbWriteFailures = new Map<string, string>();
let lastIdbCommitAt: number | null = null;
let isIdbHydrated = false;
let hydrateAllPromise: Promise<{
  hydratedCount: number;
  migratedUpCount: number;
  source: 'indexeddb' | 'localstorage';
}> | null = null;

function loadOffloadedKeysFromLocalStorage(): void {
  offloadedToIdbKeys.clear();
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return;
    const raw = ls.getItem(STORAGE_KEYS.IDB_OFFLOADED_KEYS);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const k of parsed) {
        if (typeof k === 'string' && k.trim()) {
          offloadedToIdbKeys.add(k);
        }
      }
    }
  } catch {
    // ignore malformed offload index
  }
}

function persistOffloadedKeysIndex(): void {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return;
    if (offloadedToIdbKeys.size === 0) {
      ls.removeItem(STORAGE_KEYS.IDB_OFFLOADED_KEYS);
    } else {
      ls.setItem(STORAGE_KEYS.IDB_OFFLOADED_KEYS, JSON.stringify(Array.from(offloadedToIdbKeys)));
    }
  } catch {
    // ignore quota error on tiny index
  }
}

function markKeyOffloadedToIdb(key: string): void {
  if (!offloadedToIdbKeys.has(key)) {
    offloadedToIdbKeys.add(key);
    persistOffloadedKeysIndex();
  }
}

function unmarkKeyOffloadedToIdb(key: string): void {
  if (offloadedToIdbKeys.has(key)) {
    offloadedToIdbKeys.delete(key);
    persistOffloadedKeysIndex();
  }
}

function isProtectedFromCacheEviction(key: string): boolean {
  return IDB_PRIMARY_KEYS.has(key) || offloadedToIdbKeys.has(key);
}

function emitStorageHealthChanged(): void {
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gmao:storage_health_changed', {
          detail: {
            failedKeys: Array.from(idbWriteFailures.keys()),
            offloadedCount: offloadedToIdbKeys.size,
            lastIdbCommitAt,
          },
        })
      );
    }
  } catch {
    // ignore event dispatch errors in headless environments
  }
}

function trackIdbWrite(keys: string[], promise: Promise<boolean>): Promise<boolean> {
  const tracked = promise
    .then((ok) => {
      if (ok) {
        let hadFailure = false;
        for (const k of keys) {
          if (idbWriteFailures.delete(k)) hadFailure = true;
        }
        lastIdbCommitAt = Date.now();
        if (hadFailure) emitStorageHealthChanged();
      } else {
        for (const k of keys) {
          idbWriteFailures.set(k, 'IndexedDB transaction returned false');
        }
        emitStorageHealthChanged();
      }
      return ok;
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err || 'IndexedDB write error');
      for (const k of keys) {
        idbWriteFailures.set(k, msg);
      }
      Logger.warn(`[StorageService] IndexedDB primary write error for [${keys.join(', ')}]:`, err, 'storageService');
      emitStorageHealthChanged();
      return false;
    })
    .finally(() => {
      pendingIdbWrites.delete(tracked);
    });

  pendingIdbWrites.add(tracked);
  return tracked;
}

loadOffloadedKeysFromLocalStorage();

// Function to clean up stale transient cache entries (NEVER evicts IndexedDB-Primary or offloaded keys)
function cleanupCache() {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, value] of memoryCache) {
    if (isProtectedFromCacheEviction(key)) continue;
    if (value && value._lastAccessed && now - value._lastAccessed > 10 * 60 * 1000) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => memoryCache.delete(key));

  // Count only evictable transient entries against MAX_CACHE_SIZE
  const evictableKeys = Array.from(memoryCache.keys()).filter((k) => !isProtectedFromCacheEviction(k));
  if (evictableKeys.length > MAX_CACHE_SIZE) {
    const keysToRemove = evictableKeys.slice(0, Math.floor(evictableKeys.length * 0.2));
    keysToRemove.forEach((key) => memoryCache.delete(key));
  }

  lastCleanupTime = now;
}

// CacheManager class to prevent interval memory leaks and control lifecycle
class CacheManager {
  private timerId: any = null;
  private isActive: boolean = false;

  constructor() {
    this.timerId = null;
    this.isActive = false;
  }

  startCleanup() {
    if (this.isActive) return;
    this.isActive = true;
    this.timerId = setInterval(() => {
      if (Date.now() - lastCleanupTime > CACHE_CLEANUP_INTERVAL) {
        cleanupCache();
      }
    }, CACHE_CLEANUP_INTERVAL);
    if (this.timerId && typeof this.timerId.unref === 'function') {
      this.timerId.unref();
    }
  }

  stopCleanup() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      this.isActive = false;
    }
  }

  destroy() {
    this.stopCleanup();
  }
}

export const cacheManager = new CacheManager();

// Periodic cleanup initialization
if (typeof window !== 'undefined' && (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test')) {
  cacheManager.startCleanup();
}

// Legacy keys for migration only (secure salt via environment variables)
const ENV_CRYPTO_KEY = import.meta.env.VITE_CRYPTO_KEY;

function getLegacyPersistenceSecret() {
  if (ENV_CRYPTO_KEY) return ENV_CRYPTO_KEY;
  if (import.meta.env.PROD || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production')) {
    Logger.error(
      '[storageService] VITE_CRYPTO_KEY is required in production. Refusing hardcoded fallback.',
      null,
      'storageService'
    );
    return null;
  }
  Logger.warn(
    '[storageService] VITE_CRYPTO_KEY missing — dev-only insecure fallback.',
    null,
    'storageService'
  );
  return 'CIOB_GMAO_CLIENT_PERSISTENCE_SALT_KEY_987654321!';
}

const KEY_STORE_NAME = 'gmao_crypto_keys';
const KEY_ID = 'main_aes_gcm_key';

let webCryptoKey: CryptoKey | null = null;

// Stale / Legacy keys that can be safely purged when localStorage faces quota pressure (after one-time migration)
const OBSOLETE_OR_DUPLICATE_KEYS = ALL_LEGACY_KEYS;

/**
 * Safely purges obsolete keys and stale snapshots when quota limit is approached
 */
function purgeObsoleteStorageKeys() {
  const ls = getSafeLocalStorage();
  if (!ls) return 0;
  let freedCount = 0;

  try {
    // Only purge legacy keys if one-time migration has already run
    const migrated = ls.getItem(STORAGE_KEYS.STORAGE_MIGRATED);

    if (migrated === 'true' || migrated === '"true"') {
      for (const obsoleteKey of OBSOLETE_OR_DUPLICATE_KEYS) {
        if (ls.getItem(obsoleteKey) !== null) {
          ls.removeItem(obsoleteKey);
          memoryCache.delete(obsoleteKey);
          freedCount++;
        }
      }
    }

    // 2. Remove old snapshot histories if quota is still critical
    const keysToRemove = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && (k.startsWith('gmao_snapshot_') || k.startsWith('gmao_backup_temp_') || k.includes('_legacy_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      ls.removeItem(k);
      freedCount++;
    });
  } catch (err) {
    Logger.warn('[StorageService] Failed to purge obsolete snapshot keys:', err, 'storageService');
  }

  return freedCount;
}

/**
 * Offloads heavy domain keys already held in RAM + IndexedDB out of localStorage
 * when localStorage approaches its ~5MB quota ceiling, preserving small config/auth keys.
 */
function offloadHeavyLocalStorageKeysToIdb(): number {
  if (!indexedDBService.isSupported()) return 0;
  const ls = getSafeLocalStorage();
  if (!ls) return 0;

  let freed = 0;
  const candidates: Array<{ key: string; bytes: number }> = [];

  try {
    // Always remove FULL_STATE_SNAPSHOT from localStorage first
    if (ls.getItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT) !== null) {
      ls.removeItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT);
      markKeyOffloadedToIdb(STORAGE_KEYS.FULL_STATE_SNAPSHOT);
      freed++;
    }

    for (const key of IDB_PRIMARY_KEYS) {
      if (key === STORAGE_KEYS.FULL_STATE_SNAPSHOT) continue;
      const raw = ls.getItem(key);
      if (raw && raw.length > 8 * 1024) {
        candidates.push({ key, bytes: raw.length });
      }
    }

    candidates.sort((a, b) => b.bytes - a.bytes);
    for (const item of candidates) {
      const cached = memoryCache.get(item.key);
      if (cached !== undefined) {
        const value = cached && typeof cached === 'object' && cached.data !== undefined ? cached.data : cached;
        trackIdbWrite([item.key], indexedDBService.setItem(item.key, value));
      } else {
        try {
          const raw = ls.getItem(item.key);
          if (raw) {
            const parsed = JSON.parse(raw);
            memoryCache.set(item.key, { data: parsed, _lastAccessed: Date.now() });
            trackIdbWrite([item.key], indexedDBService.setItem(item.key, parsed));
          }
        } catch {
          // ignore unparseable entry
        }
      }
      ls.removeItem(item.key);
      markKeyOffloadedToIdb(item.key);
      freed++;
    }
  } catch (err) {
    Logger.warn('[StorageService] Failed to offload heavy keys to IndexedDB:', err, 'storageService');
  }

  return freed;
}

// Pre-populate memoryCache from localStorage safely on startup
try {
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gmao_')) {
        const item = localStorage.getItem(k);
        if (item && !item.startsWith('WC:') && !item.startsWith('U2FsdGVkX1') && !item.startsWith('NC1:') && !item.startsWith('NC2:') && !item.startsWith('AG1:')) {
          try {
            const parsed = JSON.parse(item);
            memoryCache.set(k, { data: parsed, _lastAccessed: Date.now() });
          } catch {
            memoryCache.set(k, { data: item, _lastAccessed: Date.now() });
          }
        }
      }
    }
  }
} catch (e) {
  Logger.warn('Initial localStorage read error:', e, 'storageService');
}

// Resilient IDB helper with strict timeout to prevent hangs in iframes
const idbKeyStore = {
  get(key: string): Promise<any> {
    return new Promise<any>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const timer = setTimeout(() => resolve(null), 300);
        const request = indexedDB.open('GMAO_Crypto_Store', 1);
        request.onupgradeneeded = (e: any) => {
          try {
            e.target.result.createObjectStore(KEY_STORE_NAME);
          } catch {}
        };
        request.onsuccess = (e: any) => {
          clearTimeout(timer);
          try {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(KEY_STORE_NAME)) return resolve(null);
            const tx = db.transaction(KEY_STORE_NAME, 'readonly');
            const store = tx.objectStore(KEY_STORE_NAME);
            const getReq = store.get(key);
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
        request.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        request.onblocked = () => {
          clearTimeout(timer);
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  },
  set(key: string, val: any): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve();
        const timer = setTimeout(() => resolve(), 300);
        const request = indexedDB.open('GMAO_Crypto_Store', 1);
        request.onupgradeneeded = (e: any) => {
          try {
            e.target.result.createObjectStore(KEY_STORE_NAME);
          } catch {}
        };
        request.onsuccess = (e: any) => {
          clearTimeout(timer);
          try {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(KEY_STORE_NAME)) return resolve();
            const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
            const store = tx.objectStore(KEY_STORE_NAME);
            store.put(val, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch {
            resolve();
          }
        };
        request.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
        request.onblocked = () => {
          clearTimeout(timer);
          resolve();
        };
      } catch {
        resolve();
      }
    });
  },
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary_string.charCodeAt(i);
  return bytes.buffer;
};

export const storageService = {
  _isInitializing: false,

  /**
   * Safe asynchronous initialization for legacy migration without blocking UI
   */
  async init() {
    if (this._isInitializing) return;
    const ls = getSafeLocalStorage();
    if (!ls) return;
    this._isInitializing = true;

    try {
      // 1. Safe WebCrypto key check if legacy WC: items exist
      let hasWcItems = false;
      try {
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k && k.startsWith('gmao_')) {
            const val = ls.getItem(k);
            if (val && val.startsWith('WC:')) {
              hasWcItems = true;
              break;
            }
          }
        }
      } catch (e) {
        Logger.warn('Error checking localStorage:', e, 'storageService');
      }

      if (hasWcItems && typeof crypto !== 'undefined' && crypto.subtle) {
        try {
          let key = await idbKeyStore.get(KEY_ID);
          if (key) {
            webCryptoKey = key;
          }
        } catch (e) {
          Logger.warn('Error getting WebCrypto key:', e, 'storageService');
        }
      }

      // 2. Migrate legacy encrypted items to clean JSON
      // Note: Keys managed by SecurityService.saveSecure/getSecure (like gmao_auth_accounts_v2)
      // use SecurityService's IndexedDB-wrapped AES-256-GCM key and must NOT be decrypted
      // or overwritten into plain JSON by storageService.
      const SECURITY_MANAGED_KEYS = new Set([
        'gmao_auth_accounts_v2',
        'gmao_security_audit_log_v1',
        'gmao_security_audit_head_v1',
      ]);
      const migratedKeys = new Set();
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (!k || !k.startsWith('gmao_')) continue;
        if (SECURITY_MANAGED_KEYS.has(k) || k.startsWith('gmao_auth_') || k.startsWith('gmao_security_')) continue;
        if (migratedKeys.has(k)) continue;

        try {
          const item = ls.getItem(k);
          if (!item) continue;

          let decryptedObj = null;

          if (item.startsWith('WC:') && webCryptoKey) {
            try {
              const parts = item.split(':');
              if (parts.length < 3) continue;
              const iv = base64ToArrayBuffer(parts[1]);
              const cipher = base64ToArrayBuffer(parts[2]);
              const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                webCryptoKey,
                cipher
              );
              const dec = new TextDecoder();
              decryptedObj = JSON.parse(dec.decode(decryptedBuffer));
            } catch (e) {
              Logger.warn(`WC migration skipped for ${k}:`, e, 'storageService');
            }
          } else if (item.startsWith('U2FsdGVkX1') || item.startsWith('NC1:')) {
            const legacySecret = getLegacyPersistenceSecret();
            if (legacySecret) {
              try {
                const decryptedText = symmetricDecrypt(item, legacySecret);
                if (decryptedText) decryptedObj = JSON.parse(decryptedText);
              } catch (e) {
                Logger.warn(`Legacy AES migration skipped for ${k}:`, e, 'storageService');
              }
            } else {
              Logger.warn(
                `Legacy AES migration skipped for ${k}: VITE_CRYPTO_KEY missing in production.`,
                null,
                'storageService'
              );
            }
          }

          // If decrypted successfully, update memory cache and save clean JSON in localStorage
          if (decryptedObj !== null) {
            memoryCache.set(k, { data: decryptedObj, _lastAccessed: Date.now() });
            migratedKeys.add(k);
            try {
              localStorage.setItem(k, JSON.stringify(decryptedObj));
            } catch (writeErr) {
              Logger.warn(
                `[StorageService] Failed to persist migrated key '${k}' to localStorage:`,
                writeErr,
                'storageService'
              );
            }
          }
        } catch (e) {
          Logger.warn(`Error migrating key ${k}:`, e, 'storageService');
        }
      }
    } catch (e) {
      Logger.warn('Safe background init completed with notice:', e, 'storageService');
    } finally {
      this._isInitializing = false;
    }
  },

  /**
   * Synchronous retrieval with memory cache and localStorage fallback
   */
  getItem<T = any>(key: string, fallback: unknown = null): T {
    const cached = memoryCache.get(key);
    if (cached !== undefined) {
      // True LRU: Re-insert to make it the most recently used
      memoryCache.delete(key);
      memoryCache.set(key, cached);
      if (cached && typeof cached === 'object') {
        cached._lastAccessed = Date.now();
        return (cached.data !== undefined ? cached.data : cached) as T;
      }
      return cached as T;
    }

    try {
      const ls = getSafeLocalStorage();
      if (!ls) return fallback as T;
      const item = ls.getItem(key);
      if (item === null || item === undefined) return fallback as T;

      // If it's a legacy or SecurityService encrypted token, return fallback safely
      if (typeof item === 'string' && (item.startsWith('WC:') || item.startsWith('U2FsdGVkX1') || item.startsWith('NC1:') || item.startsWith('NC2:') || item.startsWith('AG1:'))) {
        return fallback as T;
      }

      try {
        const parsed = JSON.parse(item);
        const cachedEntry = { data: parsed, _lastAccessed: Date.now() };
        memoryCache.set(key, cachedEntry);
        return parsed as T;
      } catch {
        const cachedEntry = { data: item, _lastAccessed: Date.now() };
        memoryCache.set(key, cachedEntry);
        return item as T;
      }
    } catch (err) {
      Logger.warn(`[StorageService] getItem read error for key '${key}':`, err, 'storageService');
      return fallback as T;
    }
  },

  /**
   * Pre-boot IndexedDB-Primary hydration (Batch 5).
   * Loads all persisted 'app_data' keys from IndexedDB into the non-evictable RAM mirror
   * BEFORE React mounts and BEFORE Zustand initializes, while migrating legacy localStorage-only
   * installations upward into IndexedDB in a single atomic transaction.
   */
  async hydrateAllFromIndexedDB(): Promise<{
    hydratedCount: number;
    migratedUpCount: number;
    source: 'indexeddb' | 'localstorage';
  }> {
    if (hydrateAllPromise) return hydrateAllPromise;

    hydrateAllPromise = (async () => {
      loadOffloadedKeysFromLocalStorage();

      if (!indexedDBService.isSupported()) {
        isIdbHydrated = true;
        return { hydratedCount: 0, migratedUpCount: 0, source: 'localstorage' as const };
      }

      try {
        const idbEntries = await indexedDBService.getAllEntries('app_data');
        const ls = getSafeLocalStorage();

        const lsStartMode = this.getItem(STORAGE_KEYS.START_MODE);
        const idbStartMode = idbEntries[STORAGE_KEYS.START_MODE];
        const isEmptyFactoryMode = lsStartMode === 'empty' || idbStartMode === 'empty';

        const alreadyMigrated =
          this.getItem(STORAGE_KEYS.IDB_PRIMARY_MIGRATED) === 'true' ||
          this.getItem(STORAGE_KEYS.IDB_PRIMARY_MIGRATED) === true ||
          idbEntries[STORAGE_KEYS.IDB_PRIMARY_MIGRATED] === 'true' ||
          idbEntries[STORAGE_KEYS.IDB_PRIMARY_MIGRATED] === true;

        let hydratedCount = 0;

        // 1. Hydrate RAM mirror authoritatively from IndexedDB
        for (const [k, idbVal] of Object.entries(idbEntries)) {
          if (!k.startsWith('gmao_') || isSecurityManagedKey(k)) continue;
          if (idbVal === undefined || idbVal === null) continue;

          // Respect explicit empty factory state: never revive non-empty domain data
          if (isEmptyFactoryMode && IDB_PRIMARY_KEYS.has(k)) {
            if (
              (Array.isArray(idbVal) && idbVal.length > 0) ||
              (k === STORAGE_KEYS.FULL_STATE_SNAPSHOT)
            ) {
              continue;
            }
          }

          const hasLocalCopy = ls ? ls.getItem(k) !== null : false;
          const isOffloadedOrIdbOnly = offloadedToIdbKeys.has(k) || IDB_ONLY_KEYS.has(k);
          const shouldPreferIdb =
            isOffloadedOrIdbOnly ||
            !hasLocalCopy ||
            (alreadyMigrated && IDB_PRIMARY_KEYS.has(k));

          if (shouldPreferIdb) {
            memoryCache.set(k, { data: idbVal, _lastAccessed: Date.now() });
            hydratedCount++;
          }
        }

        // 2. Upgrade Migration: copy any existing localStorage keys missing from IndexedDB upward in one atomic batch
        const toMigrateUp: Record<string, unknown> = {};
        if (ls) {
          for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (!k || !k.startsWith('gmao_') || isSecurityManagedKey(k)) continue;
            if (k === STORAGE_KEYS.IDB_OFFLOADED_KEYS || k === STORAGE_KEYS.IDB_PRIMARY_MIGRATED) continue;
            if (Object.prototype.hasOwnProperty.call(idbEntries, k)) continue;

            const raw = ls.getItem(k);
            if (
              !raw ||
              raw.startsWith('WC:') ||
              raw.startsWith('U2FsdGVkX1') ||
              raw.startsWith('NC1:') ||
              raw.startsWith('NC2:') ||
              raw.startsWith('AG1:')
            ) {
              continue;
            }
            try {
              toMigrateUp[k] = JSON.parse(raw);
            } catch {
              toMigrateUp[k] = raw;
            }
          }

          // Reclaim localStorage quota immediately by offloading FULL_STATE_SNAPSHOT once preserved in IndexedDB
          if (ls.getItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT) !== null) {
            if (!Object.prototype.hasOwnProperty.call(idbEntries, STORAGE_KEYS.FULL_STATE_SNAPSHOT)) {
              const snapRaw = ls.getItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT);
              if (snapRaw) {
                try {
                  const parsedSnap = JSON.parse(snapRaw);
                  toMigrateUp[STORAGE_KEYS.FULL_STATE_SNAPSHOT] = parsedSnap;
                  memoryCache.set(STORAGE_KEYS.FULL_STATE_SNAPSHOT, {
                    data: parsedSnap,
                    _lastAccessed: Date.now(),
                  });
                } catch {
                  // ignore malformed snapshot
                }
              }
            }
            ls.removeItem(STORAGE_KEYS.FULL_STATE_SNAPSHOT);
            markKeyOffloadedToIdb(STORAGE_KEYS.FULL_STATE_SNAPSHOT);
          }
        }

        const migratedUpCount = Object.keys(toMigrateUp).length;
        if (migratedUpCount > 0 || !alreadyMigrated) {
          toMigrateUp[STORAGE_KEYS.IDB_PRIMARY_MIGRATED] = 'true';
          await trackIdbWrite(
            Object.keys(toMigrateUp),
            indexedDBService.setItemsBatch(toMigrateUp)
          );
          if (ls) {
            try {
              ls.setItem(STORAGE_KEYS.IDB_PRIMARY_MIGRATED, 'true');
            } catch {
              // ignore quota error on tiny flag
            }
          }
          memoryCache.set(STORAGE_KEYS.IDB_PRIMARY_MIGRATED, {
            data: 'true',
            _lastAccessed: Date.now(),
          });
        }

        isIdbHydrated = true;
        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('gmao:idb_hydrated', {
              detail: { hydratedCount, migratedUpCount },
            })
          );
        }

        return { hydratedCount, migratedUpCount, source: 'indexeddb' as const };
      } catch (err) {
        Logger.warn('[StorageService] Pre-boot IndexedDB hydration notice:', err, 'storageService');
        isIdbHydrated = true;
        return { hydratedCount: 0, migratedUpCount: 0, source: 'localstorage' as const };
      } finally {
        hydrateAllPromise = null;
      }
    })();

    return hydrateAllPromise;
  },

  /**
   * Synchronous storage with IndexedDB-Primary write-through, non-evictable domain RAM mirror,
   * and automatic localStorage offloading for large/heavy collections.
   */
  setItem(key: string, value: unknown, options?: { skipIdbWrite?: boolean }): boolean {
    const idbSupported = indexedDBService.isSupported();
    const skipIdbWrite = Boolean(options?.skipIdbWrite);

    if (value === null || value === undefined) {
      memoryCache.delete(key);
      unmarkKeyOffloadedToIdb(key);
      try {
        const ls = getSafeLocalStorage();
        if (ls) ls.removeItem(key);
      } catch (e) {
        Logger.warn(`localStorage remove error for ${key}:`, e, 'storageService');
      }
      if (key.startsWith('gmao_') && !skipIdbWrite) {
        trackIdbWrite([key], indexedDBService.removeItem(key));
      }
      return true;
    }

    const cachedEntry = { data: value, _lastAccessed: Date.now() };
    if (memoryCache.has(key)) {
      memoryCache.delete(key);
    }
    memoryCache.set(key, cachedEntry);

    // Evict oldest TRANSIENT entries only (never evict IndexedDB-Primary or offloaded domain keys)
    const evictableKeys = Array.from(memoryCache.keys()).filter((k) => !isProtectedFromCacheEviction(k));
    if (evictableKeys.length > MAX_CACHE_SIZE) {
      const numToRemove = evictableKeys.length - MAX_CACHE_SIZE;
      for (let i = 0; i < numToRemove; i++) {
        memoryCache.delete(evictableKeys[i]);
      }
    }

    let persistedToLocalStorage = false;
    let offloadedCleanlyToIdb = false;

    try {
      const ls = getSafeLocalStorage();
      if (ls) {
        const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const shouldOffloadDirectly =
          idbSupported &&
          (IDB_ONLY_KEYS.has(key) ||
            (IDB_PRIMARY_KEYS.has(key) && serialized.length > LOCALSTORAGE_OFFLOAD_THRESHOLD_BYTES));

        if (shouldOffloadDirectly) {
          // Remove any older localStorage copy so stale data can never shadow IndexedDB Primary
          if (ls.getItem(key) !== null) {
            ls.removeItem(key);
          }
          markKeyOffloadedToIdb(key);
          offloadedCleanlyToIdb = true;
        } else {
          try {
            ls.setItem(key, serialized);
            persistedToLocalStorage = true;
            unmarkKeyOffloadedToIdb(key);
          } catch (writeErr: any) {
            const isQuotaError =
              writeErr?.name === 'QuotaExceededError' ||
              writeErr?.code === 22 ||
              writeErr?.code === 1014 ||
              writeErr?.message?.includes('quota') ||
              writeErr?.message?.includes('exceeded');

            if (isQuotaError) {
              purgeObsoleteStorageKeys();

              if (idbSupported && IDB_PRIMARY_KEYS.has(key)) {
                // Cleanly offload this domain key to IndexedDB Primary and clear any stale localStorage copy
                if (ls.getItem(key) !== null) {
                  ls.removeItem(key);
                }
                markKeyOffloadedToIdb(key);
                offloadedCleanlyToIdb = true;
              } else {
                // Free space by offloading heavy domain keys to IndexedDB, then retry writing this small config/auth key
                offloadHeavyLocalStorageKeysToIdb();
                try {
                  ls.setItem(key, serialized);
                  persistedToLocalStorage = true;
                  unmarkKeyOffloadedToIdb(key);
                } catch (retryErr) {
                  if (idbSupported && key.startsWith('gmao_')) {
                    if (ls.getItem(key) !== null) {
                      ls.removeItem(key);
                    }
                    markKeyOffloadedToIdb(key);
                    offloadedCleanlyToIdb = true;
                  } else {
                    Logger.warn(
                      `[StorageService] setItem retry after quota purge failed for '${key}':`,
                      retryErr,
                      'storageService'
                    );
                  }
                }
              }
            } else {
              Logger.warn(`localStorage write error for ${key}:`, writeErr, 'storageService');
            }
          }
        }
      }
    } catch (e) {
      Logger.warn(`localStorage unexpected error for ${key}:`, e, 'storageService');
    }

    // Primary durable commit to IndexedDB for all canonical GMAO keys
    if (key.startsWith('gmao_') && !skipIdbWrite) {
      try {
        trackIdbWrite([key], indexedDBService.setItem(key, value));
      } catch (err) {
        Logger.warn(`[StorageService] IndexedDB primary write error for '${key}':`, err, 'storageService');
      }
    }

    // Return false only if neither localStorage nor IndexedDB can persist the value durably
    if (!persistedToLocalStorage && !offloadedCleanlyToIdb && !idbSupported) {
      idbWriteFailures.set(key, 'Storage quota exceeded with IndexedDB unavailable');
      emitStorageHealthChanged();
      return false;
    }

    return true;
  },

  /**
   * Batch write multiple canonical keys: updates RAM mirror + tiered localStorage synchronously,
   * then commits ALL gmao_* entries to IndexedDB Primary in ONE atomic transaction (eliminates 40x write amplification).
   */
  async setItemsBatch(itemsMap: Record<string, unknown> = {}): Promise<boolean> {
    if (!itemsMap || typeof itemsMap !== 'object') return false;
    const idbPayload: Record<string, unknown> = {};
    const keysToRemoveFromIdb: string[] = [];

    for (const [key, value] of Object.entries(itemsMap)) {
      if (!key) continue;
      this.setItem(key, value, { skipIdbWrite: true });
      if (key.startsWith('gmao_')) {
        if (value === null || value === undefined) {
          keysToRemoveFromIdb.push(key);
        } else {
          idbPayload[key] = value;
        }
      }
    }

    let ok = true;
    const idbKeys = Object.keys(idbPayload);
    if (idbKeys.length > 0) {
      ok = await trackIdbWrite(idbKeys, indexedDBService.setItemsBatch(idbPayload));
    }
    if (keysToRemoveFromIdb.length > 0) {
      await Promise.all(
        keysToRemoveFromIdb.map((k) => trackIdbWrite([k], indexedDBService.removeItem(k)))
      );
    }
    return ok;
  },

  /**
   * Asynchronous setItem that awaits IndexedDB completion in addition to synchronous memoryCache + tiered localStorage write.
   * Prevents L2 -> L1 hydration races during factory clear/reset operations.
   */
  async setItemAsync(key: string, value: unknown): Promise<boolean> {
    this.setItem(key, value, { skipIdbWrite: true });
    if (key.startsWith('gmao_')) {
      try {
        if (value === null || value === undefined) {
          return await trackIdbWrite([key], indexedDBService.removeItem(key));
        }
        return await trackIdbWrite([key], indexedDBService.setItem(key, value));
      } catch (err) {
        Logger.warn(`[StorageService] setItemAsync IndexedDB error for '${key}':`, err, 'storageService');
        return false;
      }
    }
    return true;
  },

  /**
   * Remove item from memory cache, localStorage, offload index, and IndexedDB
   */
  removeItem(key: string): boolean {
    memoryCache.delete(key);
    unmarkKeyOffloadedToIdb(key);
    idbWriteFailures.delete(key);
    try {
      const ls = getSafeLocalStorage();
      if (ls) {
        ls.removeItem(key);
      }
    } catch (err) {
      Logger.warn(`[StorageService] removeItem localStorage error for '${key}':`, err, 'storageService');
    }

    if (key.startsWith('gmao_')) {
      try {
        trackIdbWrite([key], indexedDBService.removeItem(key));
      } catch (err) {
        Logger.warn(`[StorageService] removeItem IndexedDB mirror error for '${key}':`, err, 'storageService');
      }
    }

    return true;
  },

  /**
   * Asynchronous removeItem that awaits IndexedDB removal completion.
   */
  async removeItemAsync(key: string): Promise<boolean> {
    memoryCache.delete(key);
    unmarkKeyOffloadedToIdb(key);
    idbWriteFailures.delete(key);
    try {
      const ls = getSafeLocalStorage();
      if (ls) ls.removeItem(key);
    } catch (err) {
      Logger.warn(`[StorageService] removeItemAsync localStorage error for '${key}':`, err, 'storageService');
    }
    if (key.startsWith('gmao_')) {
      try {
        return await trackIdbWrite([key], indexedDBService.removeItem(key));
      } catch (err) {
        Logger.warn(`[StorageService] removeItemAsync IndexedDB error for '${key}':`, err, 'storageService');
        return false;
      }
    }
    return true;
  },

  /**
   * Synchronously and asynchronously purges a batch of keys from memoryCache, localStorage, and IndexedDB.
   */
  async removeItemsBatchAsync(keys: string[] = []): Promise<boolean> {
    if (!Array.isArray(keys) || keys.length === 0) return true;
    const ls = getSafeLocalStorage();
    for (const k of keys) {
      if (!k) continue;
      memoryCache.delete(k);
      unmarkKeyOffloadedToIdb(k);
      idbWriteFailures.delete(k);
      try {
        if (ls) {
          ls.removeItem(k);
        }
      } catch (err) {
        Logger.warn(`[StorageService] removeItemsBatchAsync localStorage error for '${k}':`, err, 'storageService');
      }
    }
    try {
      await Promise.all(
        keys.filter(Boolean).map((k) => trackIdbWrite([k], indexedDBService.removeItem(k)))
      );
    } catch (err) {
      Logger.warn('[StorageService] removeItemsBatchAsync IndexedDB batch error:', err, 'storageService');
    }
    return true;
  },

  /**
   * Awaits all in-flight IndexedDB primary commits so callers (backups, resets, tests) have durable guarantees.
   */
  async flushPendingWrites(): Promise<void> {
    if (pendingIdbWrites.size === 0) return;
    await Promise.allSettled(Array.from(pendingIdbWrites));
  },

  /**
   * Returns live persistence engine diagnostics for SettingsOverviewTab & health monitoring.
   */
  getPersistenceDiagnostics(): {
    engine: 'indexeddb-primary' | 'localstorage-fallback' | 'memory-degraded';
    isIdbSupported: boolean;
    isIdbHydrated: boolean;
    offloadedKeys: string[];
    offloadedCount: number;
    pendingWritesCount: number;
    failedKeys: string[];
    lastIdbCommitAt: number | null;
  } {
    const isIdbSupported = indexedDBService.isSupported();
    const failedKeys = Array.from(idbWriteFailures.keys());
    const engine: 'indexeddb-primary' | 'localstorage-fallback' | 'memory-degraded' =
      failedKeys.length > 0 && !isIdbSupported
        ? 'memory-degraded'
        : isIdbSupported
        ? 'indexeddb-primary'
        : 'localstorage-fallback';

    return {
      engine,
      isIdbSupported,
      isIdbHydrated,
      offloadedKeys: Array.from(offloadedToIdbKeys),
      offloadedCount: offloadedToIdbKeys.size,
      pendingWritesCount: pendingIdbWrites.size,
      failedKeys,
      lastIdbCommitAt,
    };
  },

  /**
   * Hydrate a key from IndexedDB if not found, evicted, or offloaded from localStorage.
   * Implements guarded L2 -> L1 healing flow:
   * - Never overwrites an explicit empty factory state (START_MODE === 'empty').
   * - Allows Real Factory Mode (START_MODE === 'custom' with DEMO_MODE === false) to self-heal from IndexedDB.
   * - Never overwrites a key that already has an authoritative array/object in memory unless it is offloaded.
   */
  async hydrateFromIndexedDB<T = any>(key: string, fallback: T = null as T): Promise<T> {
    try {
      const startMode = this.getItem(STORAGE_KEYS.START_MODE);
      if (startMode === 'empty') {
        const current = this.getItem(key, undefined);
        if (current !== undefined && current !== null) {
          return current;
        }
        return fallback;
      }

      const existing = this.getItem<unknown>(key, undefined);
      if (Array.isArray(existing) && existing.length > 0 && !offloadedToIdbKeys.has(key)) {
        return existing as T;
      }

      const idbVal = await indexedDBService.getItem(key, null);
      if (idbVal !== null && idbVal !== undefined) {
        memoryCache.set(key, { data: idbVal, _lastAccessed: Date.now() });
        // Only write back to localStorage if not offloaded / IDB-only
        if (!offloadedToIdbKeys.has(key) && !IDB_ONLY_KEYS.has(key)) {
          this.setItem(key, idbVal, { skipIdbWrite: true });
        }
        return idbVal;
      }
    } catch (err) {
      Logger.warn(`[StorageService] Hydrate error for ${key}:`, err);
    }
    return fallback;
  },

  /**
   * Clear entire memory cache and resync runtime offload/error metadata
   */
  clearCache() {
    memoryCache.clear();
    idbWriteFailures.clear();
    isIdbHydrated = false;
    hydrateAllPromise = null;
    loadOffloadedKeysFromLocalStorage();
  },

  /**
   * Get current cache size
   */
  getCacheSize() {
    return memoryCache.size;
  },

  /**
   * Convenience method to save updated stock articles
   */
  saveArticles(articles: unknown) {
    return this.setItem(STORAGE_KEYS.RAW_STOCK, articles);
  },

  /**
   * Hash PIN code using SHA-256 (synchronous helper for legacy callers)
   */
  hashPin(pin: string | number) {
    return sha256Hex(String(pin || '').trim());
  },

  /**
   * Verify input PIN against stored sha256 hash without writing to localStorage
   */
  verifyPin(inputPin: string | number, storedValue: unknown) {
    if (!storedValue || typeof storedValue !== 'string') return false;
    const cleanInput = String(inputPin || '').trim();
    if (storedValue.length === 64 && /^[0-9a-f]+$/i.test(storedValue)) {
      return constantTimeEqual(sha256Hex(cleanInput).toLowerCase(), storedValue.toLowerCase());
    }
    return false;
  },
};
