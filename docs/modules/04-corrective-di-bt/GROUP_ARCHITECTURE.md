---
id: group-04-corrective-di-bt-architecture
groupId: 04-corrective-di-bt
groupTitle: Maintenance Corrective (DI / BT & Clôture)
docType: architecture
audience: developer
title: Architecture & Spécifications Techniques — Groupe 04 : Maintenance Corrective (v5.1.2)
summary: Spécification complète du cycle curatif en TEAM_FULL & SOLO_EXPERT, machine à états finis WorkOrderStateMachine, consignation LOTO (PACK2-LOTO), passerelle Atelier Mécanique (COR-ATELIER-P0), expressions de besoin (COR-HANDOFF-P0), protocole Maker-Checker vs SOLO_DIRECT, rapport technique RCA SSOT, horloge industrielle 08h-17h et calculs MTTR/MTBF/Pareto.
relatedTabs:
  - corrective_di
  - corrective_bt
  - corrective_live
  - corrective_atelier
  - corrective_cloture
  - corrective_history
  - corrective_referentiel
---

# 🏛️ Group 04 : Maintenance Corrective (DI / BT / Live / LOTO / Atelier / Clôture & Catalogue) — Architecture & Spécifications Techniques (`v5.1.2`)

> **Destination :** Développeurs, Architectes Logiciels, Auditeurs Système & Modèles IA.  
> **Périmètre applicatif :** Cycle de vie complet des interventions curatives en **`TEAM_FULL`** et **`SOLO_EXPERT`**, machine à états finis (`src/domain/corrective/services/WorkOrderStateMachine.ts`), protocole de consignation énergétique **`LOTO` (`src/domain/corrective/lotoService.ts`)**, passerelle **Atelier Fabrication Mécanique (`COR-ATELIER-P0`)**, **Expressions de Besoin & Handoff Multi-Acteurs (`COR-HANDOFF-P0`)**, horloge industrielle avec gestion d'équipes (Shifts 08:00–17:00), réconciliation **Maker-Checker (`VAL-1..VAL-5`)** vs **`SOLO_DIRECT`**, persistance SSOT du **Rapport Technique `RCA` (`handleSaveInterventionReport`)**, et catalogue référentiel de pannes / techniciens.

---

## 1. Vue d'Ensemble & Invariants Architecturaux (Audit `Phase 1 & Phase 2`)

La maintenance corrective dans **CIOB GMAO Nexus v5.1.2** est un **moteur transactionnel déterministe** gouverné par un SSOT unique (`useGmaoStore.ts` + `DataGateway.ts`) et protégé par des invariants stricts :

1. **Cycle de Vie Verrouillé (Strict FSM & Anti-Bypass) :**
   - Aucune intervention ne peut transiter d'un statut à un autre sans validation de préconditions explicites (`WorkOrderStateMachine.validateTransition`).
   - `handleUpdateCorrectiveIntervention` interdit tout court-circuit direct vers `statut: 'CLOTURE'` ou `validation_status: 'APPROVED'` : toute clôture doit obligatoirement emprunter `handleClotureIntervention` ou `handleReviewInterventionValidation`.
2. **Protection des Machines Archivées & Intégrité Référentielle :**
   - `handleAddDemandeIntervention` et `handleConvertToBt` rejettent toute création ou conversion ciblant une machine archivée (`status: 'ARCHIVEE'` ou `is_active === false` via `filterActiveMachines`).
   - `handleDeleteCorrectiveIntervention` interdit la suppression d'un `BT` possédant un Bon d'Atelier Mécanique actif (`EMIS`, `EN_COURS_FABRICATION`, `PRET_LIVRAISON`) ou une Expression de Besoin ouverte (`!isTerminalNeedStatus`), empêchant tout orphelin transactionnel.
3. **Invariant de Déduction Unique du Stock PDR (`C1` — Zéro Double Déduction) :**
   - Lors de la clôture directe (`handleClotureIntervention`) ou de l'approbation superviseur (`handleReviewInterventionValidation`), les mouvements de sortie PDR (`type: 'SORTIE'`, `id: MVT-COR-...`) sont émis **une seule fois** dans `store.mouvements` via `handleAddMouvement` (sans double écriture dans `useAppRouterProps.ts` et avec déduplication par `id` dans `stockSlice.ts`).
   - Dans la console Live (`useInterventionLiveController.ts`), le solde disponible de chaque article `rawStock` est enrichi en temps réel via `StockCalculationService.calculateStockActuel(item, mouvements)` et tout dépassement cumulé du stock disponible est bloqué avant soumission ou clôture.
4. **Consignation Énergétique `LOTO` (`Lockout / Tagout` — `lotoService.ts`) :**
   - Tout `BT` marqué `requires_loto: true` démarre en `loto_status: 'ATTENTE_CONSIGNATION'`.
   - `canStartWorkWithLoto` bloque le passage effectif du `BT` en `EN_COURS` tant que la consignation (`handleConsignInterventionLoto` : pose cadenas, types d'énergie, vérification d'absence de tension `VAT`) n'est pas validée (`CONSIGNE`).
   - `canCloseWorkWithLoto` bloque la clôture définitive (`CLOTURE`) tant que la déconsignation (`handleDeconsignInterventionLoto` : retrait cadenas par le consignateur ou override tracé `LOTO_BREAK_LOCK_OVERRIDE`) n'est pas finalisée (`DECONSIGNE`).
5. **Vérité Industrielle des Délais d'Atelier (`COR-ATELIER-P0`) & Besoins (`COR-HANDOFF-P0`) :**
   - Tant qu'un Bon d'Atelier Mécanique interne (`BR-YYYY-NNN` / `RECT-YYYY-NNN`), une Sortie Externe (`SORT-EXT-xxx`) ou une Expression de Besoin bloquante (`BES-YYYY-NNN`) rattaché au `BT` est actif, le `BT` demeure en `EN_ATTENTE_PDR` (affiché sémantiquement **`ATTENTE ATELIER`** lorsqu'un ordre d'atelier est actif) et sa clôture est verrouillée.
6. **Persistance SSOT du Rapport Technique `RCA` (`handleSaveInterventionReport`) :**
   - Les rapports techniques A4 et analyses de cause racine (`ICorrectiveTechnicalReport` : synthèse, tableau d'expertise composant/observation/impact, `extraRcaRows`, `root_cause_detail`, actions préventives proposées et visas) sont persistés directement dans `intervention.technical_report`, synchronisent `cause_racine` et `rapport_redige = 'OUI'`, et émettent un événement immuable `CORRECTIVE_RCA_SAVED` dans `STORAGE_KEYS.AUDIT_EVENTS`.

---

## 2. Machine à États Finis : `WorkOrderStateMachine`

Le fichier `src/domain/corrective/services/WorkOrderStateMachine.ts` gouverne toutes les transitions valides.

### 2.1 Diagramme d'États (avec Gardes `LOTO`, `Atelier` et `Besoins`)

```text
[ DEMANDE ] (Demande d'Intervention - DI : CORRECTIVE_DI_CREATED)
     │
     ├─────────────► [ ANNULE ] (Motif obligatoire)
     │
     ├─────────────► [ EN_COURS ] (Conversion 1-Clic "Créer BT & Démarrer Live ⚡" si requires_loto === false)
     ▼
[ BT_PLANIFIE ] (Bon de Travail émis : CORRECTIVE_DI_CONVERTED_TO_BT)
     │
     ├─────────────► [ ANNULE ]
     │
     ▼ (Garde LOTO : si requires_loto === true, exige loto.status === 'CONSIGNE')
[ EN_COURS ] (Intervention déclenchée sur le terrain / Live Chronometer actif)
     │   ▲
     │   │ (PDR reçue OU Bon Atelier RECEPTIONNE_MONTAGE OU Besoin POSE_ESSAI_OK)
     ▼   │
[ EN_ATTENTE_PDR / ATTENTE ATELIER ] (Attente pièce magasin, usinage BR/RECT ou besoin BES)
     │
     ▼ (Gardes strictes : !hasOpenWorkshopOrder && !hasOpenNeedRequest && canCloseWorkWithLoto)
[ CLOTURE ] (État Terminal : PDR déduites 1×, coût PDR + Atelier consolidé, CORRECTIVE_BT_CLOSED)
```

### 2.2 Table de Décision et Gardes Métier

| État Initial | Transition Cible | Gardes Obligatoires (`WorkOrderGuard`) | Effet de Bord / Audit (`AUDIT_EVENTS`) |
| :--- | :--- | :--- | :--- |
| *Création DI* | `DEMANDE` | • Rôle `canExecuteCorrectiveSession`.<br>• Machine active non archivée (`!isMachineArchivedInStore`). | Génération `DI-YYYY-XXXX` + audit `CORRECTIVE_DI_CREATED`. |
| `DEMANDE` | `BT_PLANIFIE` / `EN_COURS` | • Rôle `canManageCorrectiveValidationSession`.<br>• Machine active non archivée.<br>• Si `requires_loto`, initialise `ATTENTE_CONSIGNATION`. | Attribution `BT-YYYY-XXXX` + audit `CORRECTIVE_DI_CONVERTED_TO_BT`. |
| `BT_PLANIFIE` | `EN_COURS` | • Intervenant assigné.<br>• Garde `canStartWorkWithLoto` (`CONSIGNE` requis si `requires_loto`). | Activation `activeLiveInterventionId` et démarrage chrono Shift-Aware. |
| `EN_COURS` | `EN_ATTENTE_PDR` | • Émission d'un `WorkshopOrder` (`BR / RECT`), d'une `SortieExterne` ou d'un `NeedRequest` (`BES`). | Suspension du chrono actif ; badge `ATTENTE ATELIER` ou `ATTENTE PDR`. |
| `EN_COURS` / `EN_ATTENTE_PDR` | `CLOTURE` | • Rôle autorisé (`!isTechnician` en `TEAM_FULL`, ou `@admin` en `SOLO_DIRECT`).<br>• Travaux renseignés (`action_realisee` / `travail_a_faire`).<br>• `!hasOpenWorkshopOrder` & `!hasOpenNeedRequest`.<br>• `canCloseWorkWithLoto` (`DECONSIGNE` si `requires_loto`). | Déduction stock PDR (`1×`), consolidation `cout_total = cout_pdr + cout_atelier`, synchronisation optionnelle Nexus BOM (`updateMountedElementAfterMaintenance`), et audit `CORRECTIVE_BT_CLOSED` (avec `executionMode: 'SOLO_DIRECT'` si applicable). |
| `CLOTURE` | *Aucun (sauf RCA)* | **État Terminal.** Statut, stock et coûts sont immuables. Seule la documentation post-mortem `RCA` (`handleSaveInterventionReport`) est autorisée. | Audit `CORRECTIVE_RCA_SAVED` / `CORRECTIVE_RCA_CLEARED`. |

---

## 3. Passerelle Atelier Mécanique (`COR-ATELIER-P0`), Besoins (`COR-HANDOFF-P0`) & Pont Catalogue ➔ DI

### 3.1 Bon de Réalisation / Rectification Interne (`IWorkshopOrder` — `STORAGE_KEYS.WORKSHOP_ORDERS`)
- **Service & Persistance :** `src/domain/corrective/workshopOrderService.ts`, persisté dans `gmao_workshop_orders_v1`.
- **Types (`type_demande`) :** `REALISATION` (`BR-YYYY-NNN` — confection pièce neuve, tag `FABRICABLE_ATELIER`) et `RECTIFICATION` (`RECT-YYYY-NNN` — reprise/tournage/rectification, tag `REPARABLE_ATELIER`).
- **Cycle FSM :** `EMIS ➔ EN_COURS_FABRICATION ➔ PRET_LIVRAISON ➔ RECEPTIONNE_MONTAGE` (ou `ANNULE`).
- **Zéro impact Stock PDR & Anti-Clôture Fictive :** ne modifie jamais `rawStock`, suspend le `BT` parent en `ATTENTE ATELIER` et bloque sa clôture jusqu'à `RECEPTIONNE_MONTAGE`.

### 3.2 Expression de Besoin & Handoff Multi-Acteurs (`INeedRequest` — `STORAGE_KEYS.NEED_REQUESTS`)
- **Service & Persistance :** `src/domain/corrective/needRequestService.ts`, persisté dans `gmao_need_requests_v1`.
- **Cycle de Vie Complet :** `BROUILLON / SOUMIS ➔ REVUE_SUPERVISEUR ➔ APPROVISIONNEMENT (STOCK | ACHAT | ATELIER | EXTERNE) ➔ PRET_POUR_POSE ➔ POSE_ESSAI_OK ➔ CLOTURE` (avec support de l'accélération **`handleFastTrackNeedRequest`** pour le mode `SOLO_EXPERT` / urgence superviseur).
- **Contrôle de Cohérence Matérielle :** `getSuggestedChannelsForMaterialClass('PDR')` autorise strictement `['STOCK', 'ACHAT']` et exclut `ATELIER` pour les consommables standards non usinables.

### 3.3 Pont Inter-Onglets Catalogue ➔ DI (`STORAGE_KEYS.CORRECTIVE_DI_PRESET`)
- Depuis la vue autonome `#corrective_referentiel` (`CatalogueDonneesView.tsx`) ou l'onglet intégré du Référentiel (`PannesCatalogTab`, `TravauxStandardTab`, `MatricesActionsTab`, `EquipeIntervenantsTab`), cliquer sur **`+ DI` / `Créer DI` / `Affecter DI`** persiste le preset dans `STORAGE_KEYS.CORRECTIVE_DI_PRESET` et bascule sur `#corrective_di`.
- `CorrectiveView.tsx` et `DemandesInterventionTab.tsx` consomment automatiquement ce preset, ouvrent la modale de création `DI`, pré-remplissent `anomalie`, `travail_a_faire` (ou `travail_demande`), `intervenant`, et **infèrent automatiquement la catégorie `type_panne` (`M`, `E`, `P`, `H`, `A`)** à partir de `correctivePanneCategories` lorsqu'un symptôme est issu de la Matrice Symptôme ➔ Action.

---

## 4. Gouvernance `TEAM_FULL` (`Maker-Checker`) vs `SOLO_EXPERT` (`SOLO_DIRECT` & Pilotage Techniciens)

| Dimension | Mode `TEAM_FULL` (`TEAM_MAKER_CHECKER`) | Mode `SOLO_EXPERT` (`SOLO_DIRECT` — Ingénieur Terrain + Équipe) |
| :--- | :--- | :--- |
| **Création DI & Conversion BT** | Opérateur crée la `DI` ➔ Superviseur convertit en `BT` et assigne un technicien. | Création `DI` + bouton 1-clic **`Créer BT & Démarrer Live ⚡`** (`handleConvertAndStartLive`) qui convertit la `DI` en `BT` (`EN_COURS`) et ouvre immédiatement le chronomètre Live. |
| **Clôture & Déstockage PDR** | Le `TECHNICIEN` soumet (`PENDING_VALIDATION`, `stock_deducted: false`). Le superviseur réconcilie via `MakerCheckerReviewModal` (`VALIDATION_APPROVED`). | Clôture directe en 1 étape par `@admin` (`isSoloDirectAllowedForActor('ADMIN') === true`), déduction immédiate `1×` du stock PDR et traçabilité `executionMode: 'SOLO_DIRECT'` dans `AUDIT_EVENTS`. |
| **Besoins (`BES`) & Atelier (`BR/RECT`)** | Circuit multi-acteurs complet (Technicien ➔ Superviseur ➔ Magasin / Atelier / Achats). | Circuit accéléré disponible via **`Fast-Track`** (`handleFastTrackNeedRequest`) et réception montage en 1 clic directement depuis la console Live. |
| **Gestion des Techniciens Terrain** | Comptes individuels RBAC (`isTechnicianRole` / `matchesTechnicianRecord`) + assignation et suivi. | **100 % active sans multi-comptes :** répertoire des techniciens (`EquipeIntervenantsTab` avec préservation intégrale des métadonnées `...tech` et ID `TECH-XX` anti-collision), assignation sur `DI`/`BT`/`BR`, filtrage par intervenant et statistiques MTTR/charge par technicien. |
| **Consignation `LOTO` & Rapport `RCA`** | Actifs avec contrôle croisé (override cadenas réservé aux superviseurs/admin). | **Actifs à l'identique** pour la sécurité physique et la mémoire technique post-mortem (`handleSaveInterventionReport`). |

---

## 5. Calculs Mathématiques, Horloge Shift-Aware & Fiabilité (`CorrectiveCalculationService.ts`)

1. **Chronomètre Industriel Shift-Aware (`calculateWorkingTime`) :**
   - Équipe Matin : `08:00 – 13:15` | Pause Déjeuner neutralisée automatiquement : `13:15 – 14:00` (`45 min` déduites) | Équipe Après-Midi : `14:00 – 17:00` | Hors-Shift & Dimanches : gelés.
2. **Formules Normées (`EN 13306`) :**
   $$\text{MTTR} = \frac{\sum \text{Durée effective d'arrêt (h)}}{\text{Nombre de BT clôturés}}, \quad \text{MTBF} = \frac{\text{Temps d'ouverture} - \sum \text{Arrêts curatifs}}{\text{Nombre de pannes}}, \quad D_o = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \times 100\%$$
   $$C_{\text{BT}} = \text{cout\_pdr} + \text{cout\_atelier} = \sum (\text{Qté PDR} \times \text{PUMP}) + \sum \text{Coût Bons Atelier / Externe}$$

---

## 6. Matrice des Droits d'Accès (RBAC — Store & UI Fail-Closed)

| Rôle Utilisateur | Créer une DI (`corrective.execute`) | Convertir DI ➔ BT / Valider Maker-Checker (`corrective.manage`) | Lancer Live & Soumettre / Consigner LOTO (`corrective.execute`) | Émettre Besoin `BES` / Bon Atelier `BR/RECT` | Éditer Catalogue Pannes / Travaux / Équipe (`canManageCatalog`) | Sauvegarder Rapport Technique `RCA` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **OPERATEUR** | ✅ | ❌ | ❌ | ❌ | ❌ (Masqué UI + Bloqué Store) | ❌ |
| **TECHNICIEN** | ✅ | ❌ | ✅ (Périmètre assigné) | ✅ | ❌ (Lecture + Bouton `+ DI` uniquement) | ✅ |
| **RESPONSABLE_MAINT** | ✅ | ✅ | ✅ | ✅ (Validation & Fast-Track) | ✅ (CRUD Complet) | ✅ |
| **ADMIN (`TEAM` & `SOLO`)** | ✅ | ✅ (+ `Créer BT & Démarrer Live ⚡`) | ✅ (+ Clôture directe `SOLO_DIRECT`) | ✅ (Complet + Fast-Track) | ✅ (CRUD Complet) | ✅ |
| **RESPONSABLE_MAGASIN** | ❌ | ❌ | ❌ | 👁️ (Servi Stock sur Besoin) | ❌ | ❌ |
| **VIEWER (Observateur)** | ❌ | ❌ | ❌ | 👁️ (Lecture seule) | ❌ (Aucun bouton d'action) | ❌ (Refusé RO) |
