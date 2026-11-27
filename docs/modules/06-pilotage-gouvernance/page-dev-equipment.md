---
id: page-dev-equipment
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance & Gouvernance
docType: architecture
audience: developer
tabId: equipment
title: Spécification Technique — Équipements & Système Général (Utilités & Infrastructure)
summary: Architecture du référentiel SYSTEM_GENERAL : partage SSOT STORAGE_KEYS.MACHINES, moteur analytique ZoneEquipmentPhaseCService (Cockpit & Pilotage Rapide), normalisation canonique des statuts, Passeport 360° avec garde BOM, Safe Archive et projection SOLO_EXPERT.
relatedTabs:
  - equipment
  - machines
  - zones
  - utilisateurs
  - preventive
---

# 💻 Spécification Développeur : Équipements & Système Général (`#equipment`)

> **Public :** Développeurs Backend/Frontend, Architectes Logiciels & Modèles IA.  
> **Composants sources :** `src/presentation/pages/equipment/EquipmentView.tsx`, `src/presentation/pages/equipment/components/EquipmentModals.tsx`  
> **Services domaine :** `src/application/services/ZoneEquipmentPhaseCService.ts` (`computeEquipmentCockpitMetrics`, `buildQuickEditEquipmentUpdates`, `normalizeCanonicalEquipStatus`), `src/application/services/MachineHealthPassportService.ts`, `src/utils/activeMachines.ts`  
> **Clés SSOT :** `STORAGE_KEYS.MACHINES` (`gmao_machines_v2`), `STORAGE_KEYS.GENERAL_SYSTEM_TYPES` (`gmao_general_system_types_v1`), `STORAGE_KEYS.AUDIT_EVENTS`.

---

## 1. Philosophie Architecturale : SSOT Unique & Frontière d'Édition Stricte

Les utilités industrielles et équipements d'infrastructure portent le discriminant **`asset_class: 'SYSTEM_GENERAL'`** au sein de `STORAGE_KEYS.MACHINES` :

1. **Zéro Table Dupliquée :** tous les moteurs transverses (`PreventiveService`, `MeterService`, `WorkOrderStateMachine`, `IncrementalStockIndex`, `MachineHealthPassportService`, `ZoneOperationalAnalyticsService`) résolvent les utilités via `filterActiveMachines(machines)` sans dupliquer de clés étrangères.
2. **Séparation Stricte `EQUIPMENT-PAGE-P0` :**
   - `EquipmentView.tsx` (`#equipment`) est l'**unique point d'entrée autorisé** pour créer, modifier, archiver/restaurer les équipements `SYSTEM_GENERAL` et gérer `GENERAL_SYSTEM_TYPES`.
   - `MachinesRegisteredView.tsx` (`#machines`) peut les afficher en consultation mais redirige toute création/édition vers `#equipment` via la clé transitoire `gmao_equipment_focus_id` dans `localStorage`.
   - Un équipement `SYSTEM_GENERAL` conserve strictement `id_family: ''`, `id_templates: ''`, `asset_level: 'MACHINE'`, `parent_id: null` et ne peut pas recevoir d'éléments BOM Tier 2 (`isSystemGeneralMachine()` guard dans `MachinePassport360Modal` et le store).

---

## 2. Modèle de Données & Normalisation de Statut

```typescript
export interface SystemGeneralEquipmentRecord {
  id_machine_registered: string;   // Code séquentiel généré par type (ex. 'AIR-01', 'SEC-02')
  designation: string;
  asset_class: 'SYSTEM_GENERAL';   // Discriminant lu par getMachineAssetClass()
  id_general_system_type: string;  // FK vers STORAGE_KEYS.GENERAL_SYSTEM_TYPES
  id_family: '';
  id_templates: '';
  asset_level: 'MACHINE';
  parent_id: null;
  id_zone_default: string;         // FK vers STORAGE_KEYS.ZONES
  technician: string;              // FK vers STORAGE_KEYS.TECHNICIENS (optionnel en SOLO_EXPERT)
  serial_number: string;
  date_mise_en_service: string;
  compteur_heures: number;
  compteur_unite_defaut: 'HEURES' | 'CYCLES' | 'TONNES' | 'KM';
  regime_travail: '1x8' | '2x8' | '3x8';
  cout_arret_horaire: number;
  valeur_acquisition: number;
  status: 'En Service' | 'En Maintenance' | "À l'Arrêt" | 'ARCHIVEE';
  is_active: boolean;
}
```

- `normalizeCanonicalEquipStatus(raw)` (`ZoneEquipmentPhaseCService.ts`) unifie toutes les variantes historiques (`En Panne`, `Hors Service`, `Arrêt`, `Stopped`, `Inactive`) vers les 3 statuts actifs canoniques (`En Service`, `En Maintenance`, `À l'Arrêt`).

---

## 3. Moteur Cockpit & Mode Pilotage Rapide (`ZoneEquipmentPhaseCService.ts`)

### 3.1 `computeEquipmentCockpitMetrics`
Agrège en une passe sur les actifs `SYSTEM_GENERAL` :
- `stoppedOrMaintCount` et `activeHourlyLossDh` (somme des `cout_arret_horaire` des utilités arrêtées/en maintenance).
- `badActorsCount` et `badActorsEconomicImpact12m` (basés sur `computeMachineHealthPassport`).
- `maintDueCount` et `totalOpenBtsCount` (BT ouverts non rejetés + tâches PM actives non réalisées).
- `incompleteSetupCount` paramétré dynamiquement par le profil d'espace de travail :
  ```typescript
  const isIncompleteSetup =
    !archived &&
    (missingZone ||
      (requireTechnician && missingTechnician) ||
      (requireHourlyCost && missingHourlyCost));
  ```

### 3.2 `buildQuickEditEquipmentUpdates`
Calcule le différentiel minimal des lignes modifiées en mode **Pilotage Rapide (`quickEditMode`)** :
- Ignore les équipements archivés et les lignes non modifiées.
- Synchronise `status` + `statut`, `technician`, `regime_travail` et `cout_arret_horaire` via `handleUpdateMachine` lors du clic sur `Enregistrer (N)`.

---

## 4. Projection `TEAM_FULL` vs `SOLO_EXPERT`, RBAC & Safe Archive

1. **Visibilité & Projection `SOLO_EXPERT` :**
   - `isTabVisibleInWorkspace('equipment', profile)` retourne **`true`** dans tous les modes.
   - `EquipmentView.tsx` lit `showFinance = workspaceProfile.moduleVisibility.showFinance` et `showTeamManagement = workspaceProfile.moduleVisibility.showTeamManagement` :
     - Passe `requireHourlyCost: showFinance` et `requireTechnician: showTeamManagement` à `computeEquipmentCockpitMetrics`.
     - Réinitialise automatiquement `sortField` de `'tco'` vers `'id_machine_registered'` si `showFinance` passe à `false`.
     - Masque `cout_arret_horaire`, `valeur_acquisition`, `TCO Maint. 12m`, la perte horaire du Cockpit et les colonnes monétaires de `exportTypeBWorkbook` lorsque `showFinance === false`.
     - Conserve le sélecteur de technicien (création/édition + Pilotage Rapide) aligné sur l'annuaire `#utilisateurs`.
2. **Permissions RBAC (`AuthorizationService.tsx`) :**
   - `equipment.view` pour la lecture ; `equipment.create` / `equipment.edit` / `equipment.delete` (avec fallback compatible `machine.*`) pour l'écriture.
3. **Safe Archive :**
   - Avant suppression, `dataIntegrityService.getMachineDependencies(id, state)` vérifie la présence de BT, PM, mouvements ou sorties externes. Toute dépendance bloque la destruction au profit de `transitionMachineLifecycle(equip, 'ARCHIVED')` consigné dans `AUDIT_EVENTS`.
