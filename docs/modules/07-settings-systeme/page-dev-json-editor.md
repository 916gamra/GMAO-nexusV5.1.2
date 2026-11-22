---
id: page-dev-settings-json-editor
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: architecture
audience: developer
tabId: settings_json_editor
title: Spécification Technique — Inspecteur JSON SSOT (Lecture Seule & Export Type B)
summary: Architecture de l'inspecteur JSON en lecture seule (INGEST-GOV-P9). Exposition sérialisée contrôlée des collections useGmaoStore, masquage des secrets comptes, export Type B et blocage strict RAW_JSON_OVERWRITE_BLOCKED.
relatedTabs:
  - settings_json_editor
  - settings_injection
  - settings_backup_audit
---

# 💻 Spécification Développeur : Inspecteur JSON SSOT (`#settings_json_editor`)

> **Public :** Développeurs Core, Ingénieurs Support & Auditeurs Sécurité.  
> **Composant source :** `src/presentation/pages/settings/components/SettingsJsonEditorTab.tsx`  
> **Contrôleur parent :** `src/presentation/pages/settings/SettingsView.tsx` (`originalJsonText`, `handleDownloadJSON`, `handleSaveJSON`, `handleUploadJSON`).  
> **Protection d'accès :** `AuthorizationService.hasPermission(currentUser, 'settings.manage')` (`ADMIN` uniquement).

---

## 1. Gouvernance `INGEST-GOV-P9` (Blocage Écriture Brute)

Afin d'empêcher tout contournement des invariants d'intégrité référentielle (`DataIntegrityService`), de la formule stock (`StockCalculationService` / `IncrementalStockIndex`) et du journal append-only (`STORAGE_KEYS.AUDIT_EVENTS`), l'écriture JSON directe est **strictement désactivée** :

- Le `<textarea>` de `SettingsJsonEditorTab.tsx` est verrouillé avec `readOnly={true}`.
- Dans `SettingsView.tsx`, les gestionnaires hérités `handleSaveJSON` et `handleUploadJSON` retournent systématiquement l'erreur bloquante :
  ```text
  RAW_JSON_OVERWRITE_BLOCKED : Écriture / Import JSON brut désactivé.
  Utilisez Paramètres ➔ Ingestion Structurée (Mode B — Type A) ou le Centre de Sauvegarde pour les snapshots.
  ```

---

## 2. Collections Exposées & Filtrage des Secrets

Le sélecteur permet d'inspecter les collections suivantes issues de `useGmaoStore` :
- **Stock & Mouvements :** `rawStock`, `mouvements`, `types`
- **Entrepôt & Nexus BOM :** `warehouseItems`, `machineElementsLedger`, `sortiesExterne`
- **Parc Machines :** `machines`, `families`, `templates`, `zones`
- **Maintenance & Personnel :** `preventiveTasks`, `correctiveInterventions`, `technicians`, `operations`
- **Comptes (`users`) :** Projection filtrée exposant uniquement `{ id, username, name, role, personnelId, isActive }` — aucun hash de mot de passe, `installSalt`, ni payload chiffré du coffre-fort n'est exposé.

---

## 3. Contrat d'Export Type B

- Le bouton **« Exporter .json (Type B) »** génère un fichier nommé `gmao_typeB_<jsonTarget>_YYYY-MM-DD.json`.
- Ce fichier est un **export de consultation externe (Type B)** : il est volontairement dépourvu d'enveloppe Type A (`UnifiedImportPipeline`) et est rejeté en cas de tentative de réimportation globale.
- Pour les imports/exports réimportables (round-trip), utiliser exclusivement les bundles **Type A** (`src/services/import/unifiedImportPipeline.ts` et `src/services/import/typeAExcelBridge.ts`).
