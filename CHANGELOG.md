# Changelog

All notable changes to **CIOB GMAO Nexus** are documented in this file.

The format is based on [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Official Git release tag convention: `GMAO-nexusV{MAJOR}.{MINOR}.{PATCH}` (with legacy `ciobGMAO-nexusV*` and SemVer `v{MAJOR}.{MINOR}.{PATCH}` aliases).

---

## [Unreleased]

---

## [5.1.2] — `GMAO-nexusV5.1.2` (2026-11-21)

### Security & Concurrency
- **Server RBAC & Atomic Locks:** Enforced server-side RBAC on backup/restore/Excel import routes (`storageRoutes.ts`, `excelRoutes.ts`), added `STRICT_ADMIN_ONLY_ENTITIES`, and serialized read-modify-write state mutations via `withMutationLock` (`stateStore.ts`, `sqliteStateStore.ts`).
- **PWA / Service Worker Shared-Device Hardening:** Switched `/api/gmao/*` to strict `NetworkOnly` in both `vite.config.ts` (Workbox) and `public/service-worker.js` (purging legacy shared `gmao-nexus-data-*` caches on activation) to prevent cross-user RBAC cache leakage on shared shopfloor tablets; removed unused external CDN cache rules.
- **Honest Local Activation Code (`Code d'activation local`):** Renamed user-facing UI labels, prompts, and `docs/SECURITY_LICENSE_GATE.md` from `"Clé de licence commerciale"` to `"Code d'activation local"` to accurately reflect its local workstation double-key (`AND`) security posture without claiming server-signed DRM.

### Fixed
- **Persistence & Real Factory Hydration:** Expanded `useAutoSave` across all 40 persisted store collections, aligned `AutoBackupService` restore keys, prevented silent hydration regressions in Real Factory Mode (`START_MODE === 'empty'`), and stabilized LAN polling lifecycle.
- **Stock & Preventive Logic:** Fixed `"Stock disponible:"` wording and `isAchatUnique` parity in `StockCalculationService.calculateAllStocks`, switched numeric alias lookups to nullish coalescing (`??`), and preserved original pending execution IDs during resubmission deduplication in `ExecutionService.recordExecution`.
- **CBM Manual Rules Lifecycle:** Integrated `STORAGE_KEYS.CBM_MANUAL_RULES` (`cbmManualRules`) end-to-end across `ALLOWED_ENTITIES`, `FIELD_WRITABLE_ENTITIES`, `serverSyncService`, `DataGateway`, `AutoBackupService`, and `CbmIoTSensorPanel` without corrupting engineering units (`mm/s`).
- **Type Safety & Strict Gate Expansion:** Eliminated all 38 `typecheck` errors and all 63 `typecheck:strict` errors (`0` errors across `typecheck`, `typecheck:strict`, and `typecheck:server`) and expanded `tsconfig.strict.json` to include `StockCalculationService.ts`, `Container.ts`, and 15 core services under `src/application/services/**` (excluding only 3 legacy `DataGateway`-coupled preventive facades).

### Chore & Release Engineering
- **Unified Release Identity (`5.1.2` / `GMAO-nexusV5.1.2`):** Synchronized `appVersion.ts`, `package.json`, `package-lock.json`, `public/service-worker.js`, modals, Excel exports, and documentation; upgraded `.github/workflows/release.yml` to Node 22, `npm ci`, full 3-tier typecheck, and blocking `npm audit --audit-level=high`.
- Removed unused temporary chat/log attachments under `public/assets/aistudio/`.
- Corrected `AppRouter` ErrorBoundary section labels (`"Arborescence & BOM Nexus"`, `"Référentiel Zones & Secteurs"`) and synced `docs/DATA_SSOT.md` and `CAPABILITIES_AND_STRENGTHS.md`.

---

## [5.0.2] — `ciobGMAO-nexusV5.0.2` (2026-11-12)

### Security
- **SEC-LAN-P0 (Fail-Closed RBAC & Trust Boundary):** Removed untrusted claimed-role elevation on `server.ts`; unknown or unauthenticated identities default to fail-closed read-only posture, enforced CORS origin allowlist, and gated `/api/network/info` & `/api/docs` behind `authenticateApi`.
- **SEC-LAN-P1 (Server-Issued Actor Proof):** Enforced signed session verification (`src/core/security/serverSession.ts`) to prevent registered `actorId` spoofing on the LAN and aligned built-in client login identities with `dbState.users`.
- **SEC-LAN-P2 (Session Lifecycle Hardening):** Added durable restart-safe session revocation (`gmao_revoked_sessions.json` with expired entry pruning), token rotation via `POST /api/gmao/auth/refresh`, and explicit production session secrets.
- **Read Sanitization Layer:** Added `src/core/security/serverReadPolicy.ts` to strip `passwordHash`, `defaultPass`, `pin`, `resetToken`, and `securityAnswer` from `users` / `technicians` responses and full state snapshots, and restricted `auditEvents` reads to verified `ADMIN` roles.

### Architecture & Refactoring
- **Modular Zustand Store Slices:** Decomposed monolithic `useGmaoStore.ts` into clean domain slices under `src/store/slices/`:
  - `stockSlice.ts` (Inventory, PDR movements, Sortie Demands Maker-Checker, Replenishment PO lifecycle)
  - `assetNexusSlice.ts` (3-Tier Asset topology, `SYSTEM_GENERAL` assets, BOM Nexus ledger, Entrepôt, Personnel)
  - `preventiveSlice.ts` (Calendar + Meter PM tasks/executions, Maker-Checker validation, External Sorties)
  - `correctiveSlice.ts` (DI/BT WorkOrder FSM, Workshop Orders `BR/RECT`, NeedRequests, MTTR/MTBF/Pareto selectors)
- **Unified Versioning (`5.0.2` / `ciobGMAO-nexusV5.0.2`):** Created `src/config/appVersion.ts` as version SSOT and synchronized `package.json` (`ciobgmao-nexus`), `package-lock.json`, OpenAPI spec (`swaggerConfig.ts`), Service Worker cache keys (`public/service-worker.js`), `AutoBackupService`, Excel report titles, modals, and documentation.

### Governance & Legal
- Added international-standard repository files: `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1), `CHANGELOG.md`, and automated tag-release workflow `.github/workflows/release.yml`.

---

## [4.2.0] — `v4.2.0`

### Added
- 3-Tier Asset & Cognitive Blueprint architecture (`Family/Template` ➔ `Machine Registered` ➔ `Blueprint`) with optional `MACHINE | LINE` KPI rollup.
- Corrective Atelier Fabrication (`IWorkshopOrder`: `BR / RECT`) and Need Request (`NeedRequest`) handoff with WorkOrder closure guards.
- Maker-Checker Validation Center (`VAL-1..VAL-5`), Smart Replenishment PO Engine, Meter-based Preventive Maintenance (`MeterService`), and Append-Only Audit Ledger (`AUDIT_EVENTS`).
- Machine Passport 360° with Health Score, TCO, BER alerts, and offline QR field labels.

---

## [4.0.0] — `v4.0.0`

### Added
- Initial CIOB GMAO Enterprise platform release: Offline-First PWA, Excel Twin Engine (`SUMIFS`, `COUNTIF`, HyperFormula), Single Source of Truth (`DataGateway`), Incremental O(1) Stock Index, OpenAPI 3.0 specification, and LAN Multi-Postes atomic sync server (`server.ts`).
