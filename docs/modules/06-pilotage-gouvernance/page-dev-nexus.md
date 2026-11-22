---
id: page-dev-nexus
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance & Gouvernance
docType: architecture
audience: developer
tabId: nexus
title: Spécification Technique — Nexus BOM & Jumeaux Numériques (As-Built SSOT)
summary: Architecture réelle de la nomenclature As-Built : Blueprint.ts (buildUnifiedMachineNexusElements, computeBlueprintGaps), assetNexusSlice.ts, suivi RUL par delta compteur, boucle fermée corrective/préventive/sorties et clonage propre vers machines jumelles.
relatedTabs:
  - nexus
  - dashboard
  - machines
  - validation_center
---

# 💻 Spécification Développeur : Nexus BOM & Jumeaux Numériques (`#nexus`)

> **Public :** Architectes Systèmes, Développeurs Core & Ingénieurs Fiabilité.  
> **Composants sources :** `src/presentation/pages/system/NexusView.tsx`, `src/presentation/pages/system/components/NexusModals.tsx`  
> **Moteurs métier réels :** `src/core/domain/Blueprint.ts`, `src/store/slices/assetNexusSlice.ts`, `src/presentation/hooks/buildNexusAutomationCallbacks.ts`, `src/utils/activeMachines.ts` (`filterProductionMachines`).  
> **Clés SSOT :** `STORAGE_KEYS.MACHINE_BOM` (`gmao_machine_bom_ledger_v1`), `STORAGE_KEYS.WAREHOUSE_ITEMS` (`gmao_warehouse_items_v3`), `STORAGE_KEYS.BLUEPRINTS` (`gmao_blueprints_v2`).

---

## 1. Séparation 3-Tiers & Isolation Production

- **Tier 1 (`Family` / `Template`) :** Classification industrielle et spécifications constructeur.
- **Tier 2 (`Machine Registered`) :** Actif physique en atelier possédant sa `Zone`, son `technicien`, son compteur vivant (`compteur_actuel`) et ses éléments montés (`MACHINE_BOM` + `WAREHOUSE_ITEMS` au statut `MONTE`).
- **Tier 3 (`Blueprint`) :** Jumeau cognitif virtuel lié au `Template` (ne possède jamais de `Zone` ni de `Technicien`).
- **Isolation `SYSTEM_GENERAL` :** `filterProductionMachines` exclut les équipements `SYSTEM_GENERAL` de `NexusView`, renforcé par une garde double dans `assetNexusSlice.ts` et `dataIntegrityService.ts`.

---

## 2. Unification As-Built (`buildUnifiedMachineNexusElements`)

Définie dans `src/core/domain/Blueprint.ts`, cette fonction fusionne sans mélanger les tables de stockage :
1. **Registre explicite (`machineElementsLedger` ➔ `STORAGE_KEYS.MACHINE_BOM`) :** Éléments `COMPONENT`, `PART` et `PDR` déclarés directement sur la machine.
2. **Organes rotatifs d'entrepôt (`warehouseItems` ➔ `STORAGE_KEYS.WAREHOUSE_ITEMS`) :** Articles dont le statut canonique est `MONTE` (compatibilité de lecture pour l'ancien statut `INSTALLE`) et rattachés à la machine.
3. **Protection anti-shadowing :** La modification d'un élément `_source === 'ENTREPOT'` met à jour l'enregistrement `warehouseItems` correspondant (et verrouille `element_type` / `ref_element` dans `NexusModals`) au lieu de créer une copie fantôme dans `machineElementsLedger`.

---

## 3. Boucle Fermée d'Usure (RUL Compteur & Réinitialisation)

1. **Priorité Compteur Machine (`compteur_actuel - compteur_installation`) :**
   - Lors de l'installation ou du remplacement d'un élément, `compteur_installation` capture le compteur vivant de la machine.
   - La synchronisation d'usure calcule le delta réel du compteur machine avant de recourir au calcul calendaire de secours (`date_installation`).
2. **Réinitialisation Automatique sur Remplacement Validé :**
   - Les remplacements issus de **Sortie Rapide** (ou validés via **Maker-Checker**), de **Clôture Corrective** ou d'exécution **Préventive** réinitialisent `heures_actuelles: 0`, mettent à jour `date_installation` et recapturent `compteur_installation`.
3. **Écritures Atomiques par Lot :**
   - Les opérations multi-lignes (`handleInitializeFromBlueprint`, `handleSyncFromMovements`, `handleSyncWearHours`, import Excel BOM) utilisent `batchAddMachineElements` et `batchUpdateMachineElements` pour exécuter un seul commit Zustand + `DataGateway.saveMachineBom` + un événement d'audit agrégé.

---

## 4. Duplication Propre vers Machines Jumelles (`duplicateBOMToTwins`)

- Cible uniquement les machines de production actives partageant le même `id_templates` (ou `id_family`).
- Réinitialise les données d'instance sur chaque jumelle : `heures_actuelles: 0`, `statut: 'OPERATIONNEL'`, `date_installation` au jour J, `compteur_installation` capturé sur la machine cible, et technicien de la machine cible.
- Ne duplique jamais les numéros de série physiques d'un organe `ENTREPOT` et n'écrase jamais un élément `ENTREPOT` déjà monté sur la jumelle.

---

## 5. Passerelles Opérationnelles (`buildNexusAutomationCallbacks.ts`)

- **Sortie Rapide PDR :** pré-remplit machine + référence PDR.
- **Demande / BT Correctif :** crée une intervention ciblée sur la machine et le composant.
- **Tâche Préventive :** rattache une gamme d'entretien au composant sélectionné.
- **Contrôle RBAC :** toutes les mutations Nexus (ajout, édition, suppression, import, clonage, sync) sont protégées par `machine.edit` / `machine.update`.
