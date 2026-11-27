---
id: group-06-pilotage-gouvernance-architecture
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance & Gouvernance
docType: architecture
audience: developer
title: Architecture & Spécifications Techniques — Groupe 06 : Pilotage, Finance & Gouvernance
summary: Spécification technique d'architecture pour le groupe 06. Couvre les 7 piliers de pilotage stratégique, gouvernance et référentiels d'usine (Dashboard, Centre de Validation, Finance & Budgets, Utilisateurs/Équipe Terrain, Zones & Ateliers, Équipements & Système Général, Nexus As-Built) ainsi que leur projection TEAM_FULL vs SOLO_EXPERT.
relatedTabs:
  - dashboard
  - validation_center
  - finance
  - utilisateurs
  - zones
  - equipment
  - nexus
---

# 🏛️ Group 06 : Pilotage, Finance & Gouvernance — Spécifications Architecturales

> **Destination :** Développeurs, Architectes Logiciels, Auditeurs de Sécurité & Modèles IA.  
> **Périmètre applicatif :** Les 7 piliers de pilotage stratégique, de gouvernance et de référentiels d'usine :
> 1. **Tableau de Bord Exécutif (`DashboardView`) :** Agrégation réactive, KPIs MTTR/MTBF et alertes temps réel.
> 2. **Centre de Validation Maker-Checker (`ValidationCenterView`) :** Protocole d'approbation hiérarchique `VAL-1..VAL-5` (masqué en `SOLO_DIRECT`).
> 3. **Pilotage des Coûts & Budgets (`FinanceView`) :** Règle `Field Claim ≠ Coût Validé ≠ Écriture ERP`, TCO et suivi budgétaire 12 mois (masqué par défaut en `SOLO_EXPERT`).
> 4. **Utilisateurs & Équipe Terrain (`UtilisateursView`) :** Annuaire terrain (`TECH/OP/RESP`), charge de travail (`PersonnelWorkloadService`), transfert de charge en 1 clic (`reconcileTechnicianReassignment`), sécurité RBAC fail-closed et coffre-fort AES-GCM.
> 5. **Zones & Ateliers (`ZonesView`) :** Cadastre géographique, moteur `ZoneOperationalAnalyticsService`, cascade de renommage 10 collections et intégrité référentielle stricte.
> 6. **Équipements & Système Général (`EquipmentView`) :** Référentiel exclusif des utilités d'usine (`SYSTEM_GENERAL` et `GENERAL_SYSTEM_TYPES`), Cockpit Utilités, Pilotage Rapide (`ZoneEquipmentPhaseCService`) et Passeport 360°.
> 7. **Nexus BOM & Jumeaux Numériques (`NexusView`) :** Nomenclature réelle As-Built, analyse d'écarts avec le Blueprint et clonage vers machines jumelles.  
> *(Note : Les Paramètres Système, Sauvegardes et Registre d'Audit forment le Groupe dédié 07).*

---

## 1. Philosophie Générale de Gouvernance

Le Groupe 06 constitue **l'épine dorsale de contrôle, de sécurité, d'arbitrage financier, d'utilités d'infrastructure et de pilotage anatomique** de l'ensemble de la GMAO :

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PILOTAGE EXÉCUTIF (DASHBOARD)                   │
│         KPIs Disponibilité Do • MTBF • MTTR • Valeur de Stock         │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌─────────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│ CENTRE DE VALIDATION    │ │ FINANCES & BUDGETS │ │ NEXUS BOM AS-BUILT │
│ Maker-Checker (VAL-1..5)│ │ Coûts MO, PDR, TCO │ │ Nomenclature réelle│
│ Séparation Rédacteur/   │ │ Atelier & Externe  │ │ Analyse écarts     │
│ Approbateur             │ │ Suivi Mensuel      │ │ Jumeaux Numériques │
└──────────┬──────────────┘ └─────────┬──────────┘ └─────────┬──────────┘
           │                          │                      │
           └──────────────────────────┼──────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│           SÉCURITÉ, TERRITOIRE & INFRASTRUCTURE SYSTÈME GÉNÉRAL        │
│   Utilisateurs / Équipe Terrain • Zones & Ateliers • Équipements       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Les 7 Piliers et leurs Invariants Non-Négociables

### Pilier 1 : Tableau de Bord (`#dashboard`)
- **Invariant :** Zéro calcul destructif ; les KPIs sont des vues dérivées pures ($O(N)$ optimisées par cache multi-niveaux L1/L2/L3).
- **Zéro Alerte Fantôme :** En mode usine vide (`START_MODE === 'empty'`), tous les compteurs affichent strictement 0 sans déclencher de fausses alertes d'anomalies.

### Pilier 2 : Centre de Validation Maker-Checker (`#validation_center`)
- **Principe :** En mode `TEAM_MAKER_CHECKER`, un technicien ou opérateur ne peut jamais valider lui-même sa propre déclaration d'intervention ou de sortie PDR.
- **Invariant Stock :** Les propositions de pièces (`pieces_proposees`) n'affectent le stock brut (`rawStock`) qu'au moment précis de l'approbation via `reconcileFieldClaim`.

### Pilier 3 : Finances, Coûts & Budgets (`#finance`)
- **Axiome :** `Déclaration Terrain (Claim)` $\neq$ `Coût Validé (GMAO)` $\neq$ `Écriture Comptable (ERP)`.
- **Ventilation Quadripartite :** Tout coût machine se décompose rigoureusement en :
  $$\text{Coût Total} = \text{Coût Main-d'Œuvre} + \text{Coût PDR Consommée (PUMP)} + \text{Coût Atelier Mécanique (BON-ATEL)} + \text{Coût Sous-Traitance Externe (SORT-EXT)}$$
- **Traçabilité Budgétaire :** Tout réajustement de dotation annuelle ou mensuelle consigne un enregistrement immuable dans `budgetChangeLog` et dans `AUDIT_EVENTS`.

### Pilier 4 : Utilisateurs, Charge Terrain & Sécurité RBAC (`#utilisateurs`)
- **Double Couche :** Annuaire personnel + charge (`PersonnelWorkloadService`) + transfert de charge en 1 clic (`reconcileTechnicianReassignment`) découplés de la couche multi-comptes RBAC (`showTeamManagement`).
- **Modèle Fail-Closed :** Tout accès non explicitement autorisé par `PERMISSIONS` (`AuthorizationService.tsx`) est rejeté par défaut.
- **Cryptographie & Sécurité :** Politique mot de passe (`validatePasswordPolicy`), hachage PBKDF2/SHA-256, coffre-fort WebCrypto AES-GCM 256 bits, anti-bruteforce (5 échecs $\rightarrow$ 15 min), et `LicenseGateService`.

### Pilier 5 : Zones & Ateliers (`#zones`)
- **Vérité Géographique :** Une Zone est une localisation physique d'atelier, jamais un parent fonctionnel de ligne ni un composant machine.
- **Analytique & Cascade :** `ZoneOperationalAnalyticsService` calcule santé (`NOMINAL`/`VIGILANCE`/`CRITIQUE`), couverture techniciens et arrêts/coûts 12m. `handleUpdateZone` propage tout renommage `id_zone` sur les 10 collections + `AuthService.cascadeZoneRename` ; `handleDeleteZone` bloque la suppression de toute zone occupée.

### Pilier 6 : Équipements & Système Général (`#equipment`)
- **SSOT Unique & Frontière d'Édition (`EQUIPMENT-PAGE-P0`) :** Les utilités d'usine (`asset_class: 'SYSTEM_GENERAL'`) résident dans `STORAGE_KEYS.MACHINES` et sont typées par `STORAGE_KEYS.GENERAL_SYSTEM_TYPES`, mais leur création, modification et gestion de catégories sont **exclusivement** opérées dans `EquipmentView.tsx` (`#equipment`).
- **Cockpit & Pilotage Rapide :** `ZoneEquipmentPhaseCService.ts` fournit `computeEquipmentCockpitMetrics`, `buildQuickEditEquipmentUpdates` et `normalizeCanonicalEquipStatus`.

### Pilier 7 : Nexus BOM & Jumeaux Numériques (`#nexus`)
- **Vérité As-Built Unifiée :** Fusion dynamique du registre d'atelier (`machineElementsLedger`) et des organes montés d'entrepôt (`warehouseItems`).
- **Analyse d'Écarts & Clonage :** Confrontation temps réel avec le `Blueprint` modèle et réplication de la nomenclature As-Built validée vers les machines jumelles.

---

## 3. Projection `TEAM_FULL` vs `SOLO_EXPERT` (Groupe 06)

| Écran | `TEAM_FULL` (Défaut) | `SOLO_EXPERT` (Ingénieur Autonome) |
| :--- | :--- | :--- |
| **`#zones` (Zones & Ateliers)** | ✅ Visible + Impact financier 12m (devise ISO) | ✅ **Visible** — bascule sur **Arrêts 12m (`h`)** sans coûts (`showFinance: false`) |
| **`#utilisateurs` (Utilisateurs / Équipe)** | ✅ Visible : Annuaire + Comptes RBAC + Onboarding Auth | ✅ **Visible** en mode **Équipe Terrain & Techniciens** (annuaire, charge, transfert 1 clic, archive ; comptes multi-utilisateurs masqués) |
| **`#equipment` (Système Général)** | ✅ Visible : Cockpit + Pilotage Rapide + TCO + Tech requis | ✅ **Visible** : Cockpit & Pilotage Rapide sans coûts, **Technicien optionnel** (`Fiches Incomplètes` = Zone uniquement) |
| **`#validation_center`** | ✅ Visible (Maker-Checker strict) | 🙈 Masqué (`governanceMode: 'SOLO_DIRECT'` pour `ADMIN`) |
| **`#finance`** | ✅ Visible (TCO & Budgets) | 🙈 Masqué par défaut (réactivable via interrupteur `showFinance`) |
| **`#dashboard` & `#nexus`** | ✅ Visibles | ✅ Visibles (projection financière adaptée selon `showFinance`) |
