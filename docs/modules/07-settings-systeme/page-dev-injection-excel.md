---
id: page-dev-injection-excel
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: architecture
audience: developer
tabId: settings_injection
title: Spécification Technique — UnifiedImportPipeline & Pont Excel Type A
summary: Architecture du pipeline unifié d'ingestion Type A (REF_PARC, REF_PERSONNEL, ASSETS_MACHINES, REF_PDR, PM_CATALOG, ENTREPOT_BOM, CM_CATALOG, DEMO_BUNDLE), blocage des exports Type B et règles de cohérence SSOT.
relatedTabs:
  - settings_injection
  - settings_json_editor
  - stock
---

# 💻 Spécification Développeur : UnifiedImportPipeline & Type A (`#settings_injection`)

> **Public :** Développeurs Core, Ingénieurs Données & Auditeurs.  
> **Composant source :** `src/presentation/pages/settings/components/SettingsInjectionTab.tsx`  
> **Pipeline canonique :** `src/services/import/unifiedImportPipeline.ts`, `src/services/import/typeAExcelBridge.ts`.  
> **Garde d'import global :** `executeGuardedGlobalFileImport` (`src/presentation/hooks/useAppExcelOperations.ts`).  
> **Référence complète :** `docs/DATA_INGESTION_AND_BUNDLES.md`.

---

## 1. Contrat de Séparation Type A vs Type B

1. **Type A (Ingestion Officielle & Round-Trip) :**
   - Fichiers conformes aux templates officiels (`templates/import/*.template.json`) ou classeurs `.xlsx` contenant l'onglet de signature `README_TYPE_A` convertis par `typeAExcelBridge.ts`.
   - Domaines canoniques pris en charge :
     - `REF_PARC`
     - `REF_PERSONNEL`
     - `ASSETS_MACHINES`
     - `REF_PDR`
     - `PM_CATALOG`
     - `ENTREPOT_BOM`
     - `CM_CATALOG`
     - `DEMO_BUNDLE`
2. **Type B (Exports Opérationnels de Consultation — Non Réimportables) :**
   - Tous les classeurs d'écran ou exports JSON issus de `SettingsJsonEditorTab` sont explicitement marqués Type B et **rejetés** par `executeGuardedGlobalFileImport`.
   - Les mouvements de stock (`Sortie / Entrée / Ajustement`) sont des transactions opérationnelles vivantes et ne sont **jamais** ingérés en lot via `UnifiedImportPipeline`.

---

## 2. Cycle d'Exécution Transactionnel (`UnifiedImportPipeline`)

```text
[ Modèle Type A (.template.json ou .xlsx avec README_TYPE_A) ]
                         │
                         ▼
[ 1. Détection d'Enveloppe & Conversion Bridge ]
  • typeAExcelBridge.ts valide README_TYPE_A et reconstruit le bundle JSON Type A.
  • Rejet immédiat des fichiers Type B ou des schémas inconnus.
                         │
                         ▼
[ 2. Validation Schéma & Intégrité Référentielle (Dry-Run) ]
  • Contrôle des types, doublons et clés étrangères actives (ex. filterActiveMachines).
  • PreventiveService.bulkImportTasks protège l'historique d'exécution existant.
  • Aucune mutation du store tant que dryRun === true ou qu'une erreur bloquante existe.
                         │
                         ▼
[ 3. Commit Atomique SSOT & Sync LAN ]
  • Écriture via DataGateway dans STORAGE_KEYS canoniques.
  • Mise à jour du store Zustand + journalisation AUDIT_EVENTS.
  • Notification propre de synchronisation vers le serveur hôte LAN.
```

---

## 3. Règle « Zéro Réinjection Silencieuse »

- Lorsque `STORAGE_KEYS.START_MODE === 'empty'`, l'application démarre à `0` enregistrement et reste à `0` après rechargement (`F5`).
- `DataGateway.loadDemoData` et `DataGateway.loadDemoSection` passent tous deux par `UnifiedImportPipeline` (`validateAndCommitDemoBundle`) uniquement sur déclenchement explicite de l'administrateur.
- Aucun module de production hors `src/application/DataGateway.ts` n'est autorisé à importer `src/data/*.json`.
