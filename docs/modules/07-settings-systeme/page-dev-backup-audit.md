---
id: page-dev-settings-backup-audit
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: architecture
audience: developer
tabId: settings_backup_audit
title: Spécification Technique — Sauvegardes & Registre d'Audit Append-Only
summary: Architecture du moteur de sauvegarde (BackupService / AutoBackupService / FULL_STATE_SNAPSHOT) et du registre d'audit immuable STORAGE_KEYS.AUDIT_EVENTS via DataGateway.appendAuditEvent.
relatedTabs:
  - settings_backup_audit
  - settings
  - validation_center
---

# 💻 Spécification Développeur : Sauvegardes & Audit Ledger (`#settings_backup_audit`)

> **Public :** Développeurs Core, Architectes Sécurité & Auditeurs Conformité.  
> **Composant source :** `src/presentation/pages/settings/components/SettingsBackupAuditTab.tsx`  
> **Services sous-jacents :** `src/utils/AuditService.ts`, `src/utils/BackupService.ts`, `src/core/backup/AutoBackupService.ts`, `src/application/DataGateway.ts`.  
> **Clés SSOT :** `STORAGE_KEYS.AUDIT_EVENTS` (`gmao_audit_events_v1`), `STORAGE_KEYS.FULL_STATE_SNAPSHOT` (`gmao_full_state_v1`, stocké en IndexedDB via `IDB_ONLY_KEYS`).

---

## 1. Registre d'Audit Append-Only (`STORAGE_KEYS.AUDIT_EVENTS`)

Le registre d'audit institutionnel garantit la traçabilité immuable des mutations critiques via `DataGateway.appendAuditEvent` (exposé par `useGmaoStore.getState().appendAuditEvent`) :

```typescript
export interface AuditEvent {
  id: string;
  ts: string;               // Horodatage ISO 8601 UTC
  actorId: string;
  actorName: string;
  actorRole: string;
  actionType: string;       // ex. 'STOCK_ADJUST', 'MACHINE_ARCHIVE', 'CURRENCY_CONFIG_UPDATED', ...
  entityType: string;       // ex. 'MACHINE', 'ARTICLE', 'NEXUS_BOM', 'CURRENCY_CONFIG', 'BUDGET'
  entityId: string;
  before?: unknown;         // Snapshot avant mutation
  after?: unknown;          // Snapshot après mutation
  meta?: Record<string, unknown>;
}
```

### Invariants Non-Négociables :
1. **Append-Only Stricte :** Les événements enregistrés ne sont ni modifiables ni supprimables depuis l'interface métier.
2. **Diff Avant/Après :** Chaque événement critique capture les valeurs `before` et `after` pour audit et réconciliation.
3. **Persistance Durable IndexedDB :** `STORAGE_KEYS.AUDIT_EVENTS` fait partie de `IDB_PRIMARY_KEYS` afin d'éviter toute troncature liée au plafond `5 MB` de `localStorage`.

---

## 2. Points de Déclenchement Obligatoires

| Opération Métier | Domaine / Action | Contenu Capturé |
| :--- | :--- | :--- |
| **Ajustement Stock / Prix** | `STOCK_ADJUST` / `PRICE_UPDATE` | Ancien stock ou prix vs nouvelle valeur |
| **Archivage / Restauration Machine** | `MACHINE_ARCHIVE` | Statut actif / archivé et détachement des enfants |
| **Visa Maker-Checker (BT / PM / Sorties)** | `VALIDATION_APPROVED` / `REJECTED` | Quantités déclarées vs validées |
| **Mutations Nexus BOM** | `NEXUS_BOM_*` | Ajout, mise à jour, suppression, clonage jumelles, import lot |
| **Configuration Devises & Fiscalité** | `CURRENCY_CONFIG_UPDATED` | Ancienne et nouvelle devise, TVA, taux FX |
| **Budgets & Commandes (PO)** | `BUDGET_UPDATE` / `PO_*` | Dotation ou transition de statut commande |

---

## 3. Moteur de Sauvegarde & Restauration (`BackupService` & `AutoBackupService`)

1. **Snapshot Complet (`FULL_STATE_SNAPSHOT`) :**
   - Agrège les collections métier `STORAGE_KEYS` sans jamais inclure les secrets du coffre-fort ni les clés de licence brutes.
   - `STORAGE_KEYS.FULL_STATE_SNAPSHOT` est stocké dans IndexedDB (`IDB_ONLY_KEYS`) pour supporter des historiques industriels volumineux.
2. **Restauration Atomique :**
   - Valide le schéma et la structure du snapshot avant de restaurer le store Zustand et les collections `DataGateway`.
   - Enregistre un événement d'audit lors de toute restauration complète.
