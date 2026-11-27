---
id: page-dev-zones
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance, Validation Maker-Checker & Système
docType: architecture
audience: developer
tabId: zones
title: Spécification Technique — Cadastre Géographique des Zones & Ateliers
summary: Architecture du référentiel spatial. Séparation stricte Zone vs Hiérarchie Machine/BOM, moteur analytique ZoneOperationalAnalyticsService, cascade de renommage 10 collections dans handleUpdateZone, blocage de suppression handleDeleteZone et projection SOLO_EXPERT.
relatedTabs:
  - zones
  - machines
  - equipment
  - utilisateurs
---

# 💻 Spécification Développeur : Cadastre Géographique des Zones (`#zones`)

> **Public :** Développeurs Backend/Frontend, Architectes de Données & Modèles IA.  
> **Composant source :** `src/presentation/pages/referentiel/ZonesView.tsx`, `src/presentation/pages/referentiel/AddZoneModal.tsx`  
> **Moteur analytique pur :** `src/application/services/ZoneOperationalAnalyticsService.ts`  
> **Gestionnaires métier :** `src/hooks/useAppComplexHandlers.ts` (`handleUpdateZone`, `handleDeleteZone`)  
> **Clés SSOT :** `STORAGE_KEYS.ZONES`, `STORAGE_KEYS.MACHINES`, `STORAGE_KEYS.TECHNICIENS`, `STORAGE_KEYS.OPERATIONS`, `STORAGE_KEYS.WAREHOUSE_ITEMS`, `STORAGE_KEYS.AUDIT_EVENTS`.

---

## 1. Séparation Stricte : Géographie vs Arborescence Technique

**CIOB GMAO Nexus** applique une séparation d'intérêts absolue entre la topologie géographique et la structure industrielle :

```text
1. VECTEUR GÉOGRAPHIQUE (Spatial Location)
   └── Zone (id_zone / code_zone : ZONE-01, Z-PROD-01...)
       Attribut physique de l'usine (bâtiment, halle, atelier, local technique).
       Chaque machine (PRODUCTION ou SYSTEM_GENERAL) porte id_zone_default.
       Chaque technicien/opérateur/responsable porte id_zone (ou zones[]).

2. VECTEUR HIÉRARCHIQUE OPÉRATIONNEL (Asset Rollup)
   └── Machine / Ligne (asset_level: 'LINE' | 'MACHINE', parent_id)
       Gouverne les rollups de disponibilité et de MTBF (src/utils/assetHierarchy.ts).
       Une Ligne ne remplace jamais une Zone et n'hérite pas de sa Zone.

3. VECTEUR TECHNOLOGIQUE INTERNE (BOM / Nexus)
   └── Blueprint & Warehouse Items (Organes & Pièces montées)
       Gouverne la nomenclature interne (Tier 2 / Tier 3).
```

---

## 2. Modèle de Données & Moteur `ZoneOperationalAnalyticsService`

```typescript
export interface ZoneEntity {
  id_zone: string;        // Identifiant canonique normalisé en majuscules (ex. 'Z-PROD-01')
  code_zone: string;      // Code d'atelier séquentiel ou mnémonique (ex. 'ZONE-01')
  libelle: string;        // Libellé complet (ex. 'Atelier de Laminage à Chaud')
  type: string;           // Catégorie fonctionnelle ('PRODUCTION' | 'UTILITES' | 'FINITION' | 'MAGASIN'...)
  description?: string;   // Consignes de sécurité, EPI, informations d'accès
}
```

### Agrégation Pure (`computeZoneOperationalAnalytics`)
- **Résolution canonique :** `getCanonicalZoneKey`, `matchesZoneRef` et `matchesMemberZone` unifient la correspondance entre `id_zone`, `code_zone`, `code` et les affectations multi-zones (`operations.zones[]`).
- **Exclusion des archivés :** `isArchivedMachine` et `isArchivedPersonnel` isolent les entités archivées des compteurs actifs tout en exposant `archivedMachinesCount` pour la transparence du cycle de vie.
- **Ventilation actifs & risques par zone :**
  - `activeProductionCount`, `activeSystemGeneralCount`, `stoppedMachinesCount`
  - `activeTechniciansCount`, `activeResponsablesCount`, `activeOperatorsCount`, `zonesWithoutActiveTechCount`
  - `openCorrectiveCount`, `overduePreventiveCount`, `downtimeHours12m`, `totalMaintenanceCost12m`, `downtimeProductionLossCost12m`
  - Statut synthétique `zoneStatus: 'NOMINAL' | 'VIGILANCE' | 'CRITIQUE'`.

---

## 3. Cascade Intégrale de Renommage (`handleUpdateZone`)

Dans `src/hooks/useAppComplexHandlers.ts`, `handleUpdateZone(id, updatedZone)` applique :
1. **Validation & Anti-Collision :** refuse les champs vides (`id_zone`, `libelle`) et bloque toute collision sur `id_zone` ou `code_zone` avec une autre zone.
2. **Propagation transactionnelle en mémoire (si `id_zone` change) :**
   - `technicians` (`id_zone`)
   - `operations` (`zones[]` et chaîne `id_zone` multi-tokens)
   - `machines` (`id_zone_default` et `id_zone`)
   - `warehouseItems` (`id_zone` et `id_zone_default`)
   - `mouvements`, `preventiveTasks`, `preventiveExecutions`, `correctiveInterventions` (`id_zone` / `zone`), `sortieDemands`, `machineElementsLedger`
   - Synchronisation des comptes auth via `new AuthService().cascadeZoneRename(oldZoneIdNorm, nextZoneId)`.
3. **Traçabilité Audit :** enregistre `ZONE_UPDATED` (`before` / `after`) dans `STORAGE_KEYS.AUDIT_EVENTS`.

---

## 4. Garde de Suppression & Intégrité Référentielle (`handleDeleteZone`)

Une zone ne peut jamais être supprimée si des entités actives y sont encore rattachées :
- Vérifie simultanément `machines` (`PRODUCTION` + `SYSTEM_GENERAL`), `technicians`, `operations` et `warehouseItems` via correspondance normalisée `id_zone` / `code_zone`.
- Si au moins une dépendance existe : blocage immédiat + notification `warning` (aucune mutation de state).
- Sinon : suppression propre + événement `ZONE_DELETED` dans `AUDIT_EVENTS`.

---

## 5. Projection `TEAM_FULL` vs `SOLO_EXPERT` & Export

- **Visibilité Navigation :** `isTabVisibleInWorkspace('zones', profile)` retourne **`true`** dans tous les modes (`TEAM_FULL` et `SOLO_EXPERT`).
- **Projection Finance (`showFinance = workspaceProfile.moduleVisibility.showFinance`) :**
  - Lorsque `showFinance === false` (défaut en `SOLO_EXPERT`), `ZonesView.tsx` bascule :
    - KPI 4 : `Risques & Coût Maint. 12m` $\rightarrow$ `Risques & Arrêts 12m` (`totalDowntimeHours12m` en heures).
    - Colonne `health` : `État & Coût 12m` $\rightarrow$ `État & Arrêts 12m`.
    - Bandeau Cockpit Ateliers : `Impact 12m` (devise ISO) $\rightarrow$ `Arrêts 12m` (`h`).
    - Export Excel Type B (`exportTypeBWorkbook`) : omet les colonnes monétaires (`Coût Maint. 12m`, `Perte Arrêt 12m`).
- **Navigation Croisée :** les callbacks `onNavigateToTechs`, `onNavigateToOps`, `onNavigateToMachines` et `onNavigateToEquipment` injectent le filtre de zone cible sans altérer le SSOT.
