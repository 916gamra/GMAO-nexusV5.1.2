---
id: group-03-preventive-meters-architecture
groupId: 03-preventive-meters
groupTitle: Maintenance Préventive & Compteurs (Meter PM)
docType: architecture
audience: developer
title: Architecture & Logique Métier — Groupe Maintenance Préventive, Compteurs & CBM (v5.1.2)
summary: Spécification d'ingénierie du moteur préventif hybride (Calendrier 52S + Compteurs Meter PM + CBM Terrain), mémoire temporelle immuable (PreventiveExecution), analytique de charge techniciens, gouvernance Maker-Checker vs SOLO_DIRECT et isolation RBAC.
relatedTabs:
  - preventive
  - preventive_referentiel
---

# Architecture & Logique Métier — Groupe 03 : Maintenance Préventive, Compteurs & CBM (`v5.1.2`)

## 1. Philosophie du Moteur Préventif Hybride (Temps + Usage + Conditionnel)

Dans **CIOB GMAO Nexus v5.1.2**, la maintenance préventive unifie trois moteurs complémentaires sur un **SSOT** unique (`useGmaoStore.ts` + `DataGateway.ts`) :

1. **Maintenance Systématique Calendaire (`CALENDRIER`)** : Cadencée sur une matrice annuelle de **52 semaines (`S1` à `S52`)**, une grille journalière (`J1..J31`) et un calendrier mensuel, avec fréquences normalisées (`Hebdomadaire`, `Mensuel`, `Trimestriel`, `Semestriel`, `Annuel`) et mode de récurrence `FIXE` ou `GLISSANT` (`preventiveScheduleEngine.ts`).
2. **Maintenance par Compteurs (`COMPTEUR` / `HYBRIDE`)** : Pilotée par l'usage réel de l'équipement (`Heures`, `Cycles`, `Km`) via `src/application/services/meter/MeterService.ts` et `STORAGE_KEYS.METER_READINGS`.
3. **Maintenance Conditionnelle Terrain (`CBM Manuel`)** : Pilotée par relevés physiques manuels (`protocol: 'MANUEL'`) via `src/domain/preventive/cbmTelemetryService.ts` et `STORAGE_KEYS.CBM_MANUAL_RULES`, avec validation des bornes physiques, hystérésis `HIGH_BAD` / `LOW_BAD` et génération dédupliquée de DI corrective en cas de dépassement `CRITICAL`.

---

## 2. Mémoire Temporelle Immuable & Cohérence de Cycle (`ExecutionService.ts` & `preventiveSlice.ts`)

### 2.1 Séparation `PreventiveTask` vs `PreventiveExecution`
- **`STORAGE_KEYS.PREVENTIVE_TASKS` (`tasks`)** : Définition de la gamme planifiée sur une machine active (organe, code action AFNOR, fréquence, `pdr_requises` / `pdr_ref`, prochain seuil compteur, `responsable`, état courant).
- **`STORAGE_KEYS.PREVENTIVE_EXECUTIONS` (`executions`)** : Journal historique immuable de chaque exécution datée (`executedAt`, `periodMonth: 'YYYY-MM'`, `periodWeek: 'SXX'`, `executorName`, `durationMinutes`, `laborRate`, `sparesUsed`, `sparesCost`, `totalCost`, `validation_status`, `hasAnomaly`).
- **Recalcul d'état à la suppression (`handleDeletePreventiveExecution`) :** supprimer une exécution invalide recalcule automatiquement `derniere_realisation` et `etat` sur la tâche parente à partir des exécutions restantes (retour à `'À faire'` et `''` si aucune exécution ne subsiste).
- **Nettoyage Usine Réelle (`handleClearPreventiveForRealFactory`) :** purge l'ensemble des collections préventives canoniques **ainsi que** `STORAGE_KEYS.CBM_MANUAL_RULES` (`[]`), garantissant `0` règle fantôme.

### 2.2 Formules de Coût & Analytique (`ExecutionService.ts` & `preventiveAnalyticsEngine.ts`)
Lorsqu'une exécution préventive est validée (devise dynamique via `useCurrency()`) :

$$\text{Coût Main-d'Œuvre} = \left(\frac{\text{durationMinutes}}{60}\right) \times \text{laborRate}$$

$$\text{Coût PDR} = \sum_{i} \left(\text{qty}_i \times \text{unitPrice}_i\right)$$

$$\text{Coût Total Exécution} = \text{Coût Main-d'Œuvre} + \text{Coût PDR}$$

Le moteur pur `computePreventiveAnalytics` (`src/domain/preventive/preventiveAnalyticsEngine.ts`) calcule également **`techniciansStats: TechnicianWorkloadStat[]`** (tâches assignées, terminées, en retard, taux de conformité, exécutions approuvées, temps cumulé en minutes et coût total par technicien), exploitable aussi bien en `TEAM_FULL` qu'en `SOLO_EXPERT`.

---

## 3. Mathématiques des Compteurs (`MeterService.ts`) & Seuils CBM (`cbmTelemetryService.ts`)

### 3.1 Évaluation de Déclenchement Compteur (`MeterService.evaluateTaskTrigger`)
Pour toute tâche `COMPTEUR` / `HYBRIDE` ou `compteur_seuil_intervalle > 0` :
- **Intervalle ($\Delta_{\text{seuil}}$)** : `interval = Number(task.compteur_seuil_intervalle || 500)`
- **Prochain seuil cible ($C_{\text{target}}$)** :
  $$C_{\text{target}} = \text{task.compteur\_prochain\_declenchement} \ ?? \ (C_{\text{last}} + \Delta_{\text{seuil}})$$
- **Marge d'alerte ($M_{\text{warn}}$)** : `Math.round(interval * 0.1)` par défaut (10 %).
- **Reliquat ($R = C_{\text{target}} - C_{\text{actuel}}$)** : `isOverdue` si $R \le 0$ ; `isWarning` si $0 < R \le M_{\text{warn}}$.
- À chaque exécution validée au relevé $C_{\text{exec}}$, `advanceTaskCounterOnExecution` décale $C_{\text{last}} \leftarrow C_{\text{exec}}$ et $C_{\text{target}} \leftarrow C_{\text{exec}} + \Delta_{\text{seuil}}$.

### 3.2 Validation & Hystérésis CBM Terrain (`cbmTelemetryService.ts`)
- **`validateCbmRuleThresholds`** interdit les seuils non numériques, hors bornes physiques `[minPhysicalBound..maxPhysicalBound]`, ou inversés (`warning >= critical` en `HIGH_BAD`, `warning <= critical` en `LOW_BAD`).
- **`evaluateSensorTelemetry`** applique une bande morte d'hystérésis (`± hyst`) pour éviter le battement d'alarmes et classe les lectures hors plage en `OUT_OF_RANGE_FAULT` sans fausse DI.
- **`ingestTelemetryPayload`** déduplique les DI ouvertes pour le même capteur/machine, formate `≤` / *« Chute critique »* en `LOW_BAD` (et `≥` / *« Dépassement critique »* en `HIGH_BAD`), et attribue explicitement `demandeur: Relevé CBM Terrain (<operatorName>)`.

---

## 4. Gouvernance `TEAM_MAKER_CHECKER` vs `SOLO_DIRECT` & Contrats UI

1. **Mode `TEAM_FULL` (`TEAM_MAKER_CHECKER`, `VAL-1..VAL-5`) :**
   - Une exécution par un `TECHNICIEN` passe obligatoirement en `PENDING_VALIDATION` (`stock_deducted: false`), réservant les PDR via `computeReservedStockMap` jusqu'à approbation superviseur (`VALIDATION_APPROVED` dans `AUDIT_EVENTS`).
2. **Mode `SOLO_EXPERT` (`SOLO_DIRECT`, fail-closed) :**
   - `isSoloDirectAllowedForActor(role)` autorise l'exécution directe **uniquement** pour un `ADMIN` vérifié (`executionMode: 'SOLO_DIRECT'` tracé dans `AUDIT_EVENTS`).
   - Projection d'interface via `useWorkspaceProfile()` :
     - `showFinance === false` masque les KPI/colonnes/exports financiers (`Coût`, `P.U`), remplace la carte Coût d'Analytics par **Charge Horaire Préventive**, et conserve le tableau **Charge & Performance par Technicien**.
     - `showBlueprintsInPrimaryNav === false` masque les filtres et sections Blueprint dans `TabMainView` et `TabPlanBuilder` sans altérer le SSOT.
     - Dans `PreventiveExecutionsHistoryView`, les pastilles et la colonne Maker-Checker sont masquées en `SOLO_DIRECT` dès que `pendingCount === 0 && clarificationCount === 0`.
3. **Contrat `taskHasRequiredPdr` (`PreventiveWeeklyCockpit.tsx`) :**
   - Inspecte `pdr_requises`, `pdr_ref` et l'ancien alias `pieces_requises` afin d'empêcher la validation 1-clic de contourner la déclaration et la déduction des pièces prescrites.

---

## 5. Sécurité RBAC (`AuthorizationService`), Isolation R4 & Cartographie

| Permission / Action | `VIEWER` | `OPERATOR` | `TECHNICIAN` | `MANAGER` | `ADMIN` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Consulter planning & compteurs (`preventive.view`) | **Oui (RO)** | Non | **Périmètre R4** | **Oui** | **Oui** |
| Exécuter tâches, relevés compteurs & CBM (`preventive.execute`) | Non | Non | **Oui (`PENDING_VALIDATION`)** | **Oui** | **Oui** |
| Créer/Éditer/Supprimer Plans, Tâches, Guides, Actions, Règles CBM (`preventive.manage`) | Non | Non | Non | **Oui** | **Oui** |
| Approuver exécutions `PENDING_VALIDATION` (`validation.approve`) | Non | Non | Non | **Oui** | **Oui** |

- **Isolation `R4` (`scopedTasks`) :** `TabMainView` transmet strictement `tasks={scopedTasks}`, `canExecutePreventive` et `canManagePreventive` à `PreventiveMetersView` et `CbmIoTSensorPanel` — aucune fuite de tâches hors périmètre ni de boutons d'écriture pour `VIEWER`.
- **Codes AFNOR socles protégés :** `TabActions.tsx` protège `C`, `N`, `G`, `V` contre toute suppression en vue grille et tableau.

| Fichier Source | Rôle Architectural |
| :--- | :--- |
| `src/presentation/pages/preventive/PreventiveView.tsx` | Conteneur principal, modales Formules & Philosophie, câblage `handleUpdateTask` & `useCurrency`. |
| `src/presentation/pages/preventive/components/TabMainView.tsx` | Orchestrateur des 4 espaces consolidés, isolation `scopedTasks`, édition/suppression tâches, export Type B. |
| `src/presentation/pages/preventive/components/PreventiveWeeklyCockpit.tsx` | File prioritaire hebdomadaire, filtre technicien, garde `taskHasRequiredPdr`, bouton `OT`. |
| `src/presentation/pages/preventive/components/PreventiveMetersView.tsx` | Horomètres, Tournée d'Atelier avec attribution technicien, RBAC et intégration CBM. |
| `src/presentation/pages/preventive/components/CbmIoTSensorPanel.tsx` | Relevés conditionnels terrain (`MANUEL`), validation seuils, génération DI dédupliquée, RBAC. |
| `src/presentation/pages/preventive/components/PreventiveAnalyticsView.tsx` | KPI dynamiques, ponctualité `OTCR`, `Charge & Performance par Technicien`, projection `SOLO_EXPERT`. |
| `src/presentation/pages/preventive/components/PreventiveExecutionsHistoryView.tsx` | Historique immuable, filtre technicien, validation Maker-Checker, projection `SOLO_EXPERT`. |
| `src/presentation/pages/preventive/components/PrintWorkOrderModal.tsx` | Impression `OT` PDF, résolution `pdr_requises`, checklist `LOTO`, lignes terrain vierges. |
| `src/presentation/pages/preventive/PreventiveSecondaryView.tsx` | Atelier `#preventive_referentiel` (`TabPlanBuilder`, `TabGuide`, `TabActions`) gardé par `preventive.manage`. |
| `src/domain/preventive/cbmTelemetryService.ts` | Validation seuils, évaluation hystérésis `HIGH_BAD`/`LOW_BAD` et construction DI CBM. |
| `src/domain/preventive/preventiveAnalyticsEngine.ts` | Moteur analytique pur (`computePreventiveAnalytics`, `techniciansStats`). |
| `src/store/slices/preventiveSlice.ts` | Store Zustand SSOT, rollback exécution, purge usine incluant `CBM_MANUAL_RULES`. |
