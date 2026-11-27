---
id: page-user-zones
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance, Validation Maker-Checker & Système
docType: page
audience: user
tabId: zones
title: Zones Géographiques & Ateliers d'Usine
subtitle: Cadastre physique de l'usine, cockpit ateliers en temps réel, affectation des actifs & équipes et navigation croisée
summary: Guide d'utilisation complet pour la gestion des Zones et Ateliers en mode Équipe Complète (TEAM_FULL) et Solo Expert (SOLO_EXPERT). Explique le découpage spatial, les 4 KPIs, le Cockpit Ateliers, la navigation croisée vers Machines/Utilités/Équipe, le renommage en cascade et la suppression sécurisée.
relatedTabs:
  - machines
  - equipment
  - utilisateurs
  - entrepot
---

# 🗺️ Guide Utilisateur : Zones & Ateliers d'Usine (`#zones`)

> **Module :** Pilotage & Gouvernance (Référentiels d'Usine)  
> **Identifiant d'accès :** `#zones`  
> **Public cible :** Administrateurs, Chefs d'Atelier, Responsables Maintenance & Production, Ingénieurs Terrain (`SOLO_EXPERT`).

---

## 1. Rôle et Objectif du Référentiel Spatial

L'écran **Zones & Ateliers** structure le **cadastre physique de votre usine**.

Chaque **machine de production**, chaque **équipement du Système Général (utilités)**, chaque **organe d'entrepôt** et chaque **membre de l'équipe terrain** (technicien, opérateur, responsable) est rattaché à une zone précise. Ce découpage permet :
- De cartographier instantanément la répartition des actifs (`Prod` et `Sys.Gén`) et des intervenants par secteur.
- De repérer en un coup d'œil les **zones critiques ou en vigilance** (BT ouverts, PM en retard, machines à l'arrêt) et les **zones sans technicien actif**.
- De filtrer les équipements et intervenants lors de la déclaration d'une urgence ou de la préparation d'une tournée terrain.
- D'analyser l'impact opérationnel par atelier sur 12 mois glissants : **Coûts de maintenance + perte d'arrêt** (en `TEAM_FULL`) ou **Heures d'arrêt cumulées** (en `SOLO_EXPERT`).

---

## 2. Tableau de Bord KPI & Cockpit Ateliers

En haut de l'écran, **4 cartes KPI interactives** et le bandeau **Cockpit Ateliers** pilotent le filtrage en 1 clic :

1. **Total Zones & Ateliers** : Nombre total de secteurs répertoriés et compteur de zones en alerte (`Toutes nominales` ou `X zone(s) à surveiller`). Cliquer réinitialise le filtre de santé.
2. **Machines Actives** : Total des équipements actifs ventilés en **`Prod` (Production)** et **`Sys.Gén` (Utilités)**, avec indication des machines archivées. Un clic ouvre le parc machines.
3. **Techniciens Actifs** : Effectif terrain actif ventilé avec le nombre de **Responsables (`Resp.`)** et **Opérateurs (`Op.`)**, ainsi que le compteur de **zones sans technicien**. Un clic ouvre l'annuaire `#utilisateurs`.
4. **Risques & Coût Maint. 12m** *(ou **Risques & Arrêts 12m** en `SOLO_EXPERT`)* : Nombre de **BT ouverts**, tâches **PM en retard**, machines **à l'arrêt**, et **Impact 12 mois** (en devise ISO active en `TEAM_FULL`, ou en **heures d'arrêt `h`** en `SOLO_EXPERT`).

### Bandeau Cockpit Ateliers (Filtres Rapides)
- **Zones Critiques / Alerte** : Isole immédiatement les ateliers dont l'état opérationnel est `CRITIQUE` ou `VIGILANCE`.
- **Zones sans Tech.** : Filtre les zones comportant au moins une machine active mais aucun technicien actif affecté.
- **Raccourci `Utilités Sys.Gén`** : Ouvre directement l'écran **Équipements & Système Général (`#equipment`)**.
- **Synthèse 12m** : Affiche l'impact consolidé (devise ISO ou heures d'arrêt selon le mode actif).

---

## 3. Typologie des Zones & Navigation Croisée Intelligente

### Catégories d'Exploitation
Le référentiel permet de classer vos ateliers par type d'activité (filtrable dans la barre d'outils) :
1. 🏭 **PRODUCTION** : Halles et lignes de fabrication principales (ex. *Laminoir*, *Extrusion*, *Usinage*).
2. ⚡ **UTILITÉS** : Locaux techniques et infrastructures (ex. *Salle des Compresseurs*, *Poste HT/BT*, *Chaufferie*, *Station Eau*).
3. 📦 **FINITION** : Emballage, palettisation, contrôle qualité et expédition.
4. 🏪 **MAGASIN** : Rayonnages PDR et entrepôt des organes rotatifs de secours.

### Navigation Croisée depuis Chaque Ligne du Tableau
- **Équipe Affectée (Techniciens / Opérateurs / Responsables)** : Cliquer sur le compteur ou les badges bleus/indigo ouvre directement `#utilisateurs` pré-filtré sur cette zone (et sur les techniciens si vous cliquez sur la pastille `Techniciens`). Les membres archivés sont masqués du compteur actif et signalés discrètement (`+X archivé(s)`).
- **Machines & Utilités** :
  - Cliquer sur le badge principal ou `X Prod` ouvre `#machines` pré-filtré sur la zone.
  - Cliquer sur `X Sys.Gén` ouvre `#equipment` pré-filtré sur la zone.
- **Colonne État & Impact 12m** : Affiche le badge `NOMINAL`, `VIGILANCE` ou `CRITIQUE`, les compteurs `BT ouv.`, `PM ret.`, l'alerte `Sans tech`, et le cumul 12 mois.
- **Export Excel (Type B)** : Génère un classeur `.xlsx` opérationnel (non réimportable) respectant la devise active et les filtres appliqués. Le bouton **Formules (`∑`)** détaille les règles de calcul.

---

## 4. Procédure : Créer, Modifier ou Supprimer une Zone

### Créer une Nouvelle Zone
1. Cliquez sur le bouton **« + Nouvelle Zone »** (icône circulaire violette en haut à droite).
2. Le **Code Zone** séquentiel (`ZONE-01`, `ZONE-02`...) est proposé automatiquement (modifiable).
3. Renseignez l'**Identifiant (`ID Zone`)**, le **Libellé de l'Atelier**, le **Type d'Activité** et les **Consignes / Description** (EPI, risques, accès).
4. Validez : la zone est immédiatement utilisable dans toute la GMAO et tracée dans le journal d'audit.

### Modifier ou Renommer une Zone (Cascade Intégrale)
- Si vous modifiez l'identifiant (`id_zone`) ou le code d'une zone existante, le système vérifie l'absence de doublon puis **met à jour automatiquement toutes les références liées** (machines, utilités, techniciens, opérateurs, articles d'entrepôt, mouvements, tâches/exécutions PM, BT correctifs, demandes de sortie, registre Nexus et comptes d'accès) tout en enregistrant un événement `ZONE_UPDATED` dans `AUDIT_EVENTS`.

### Règle de Sécurité : Blocage de Suppression d'une Zone Occupée
Pour empêcher la création d'équipements ou d'intervenants orphelins :
- Il est **impossible de supprimer une zone tant qu'elle contient au moins une machine/utilité, un technicien, un opérateur/responsable ou un article d'entrepôt**.
- En cas de tentative, une alerte explicite s'affiche et la suppression est annulée. Réaffectez d'abord les éléments liés vers une autre zone avant de supprimer l'ancienne.

---

## 5. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

L'écran **Zones & Ateliers (`#zones`)** reste **100 % accessible et structurant** dans les deux modes d'exploitation :

| Élément d'interface | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Autonome) |
| :--- | :--- | :--- |
| **Accès & Cadastre des Zones** | ✅ Complet (création, édition avec cascade, suppression gardée). | ✅ **Identique** (indispensable pour localiser machines, utilités et pannes). |
| **KPI 4 & Colonne Santé** | Affiche **Risques & Coût Maint. 12m** et **Impact 12m** (Maintenance + Perte d'arrêt en devise ISO active). | Bascule automatiquement sur **Risques & Arrêts 12m** et **Arrêts 12m (en heures `h`)** sans montants financiers (`showFinance: false`). |
| **Cockpit Ateliers** | Filtres `Zones Critiques`, `Zones sans Tech.`, raccourci `Utilités Sys.Gén` + **Impact financier 12m**. | Mêmes filtres opérationnels + **Heures d'arrêt cumulées 12m** (zéro bruit comptable). |
| **Badges Techniciens & Équipe** | ✅ Visibles avec lien vers `#utilisateurs` (comptes + annuaire). | ✅ **Conservés** avec lien vers **Équipe Terrain & Techniciens (`#utilisateurs`)** pour piloter la couverture par atelier. |
| **Export Excel (Type B)** | Inclut les colonnes financières (coût maintenance & perte d'arrêt en devise active). | Exclut automatiquement les colonnes monétaires et conserve uniquement les métriques techniques et heures d'arrêt. |

> **Astuce :** En mode `SOLO_EXPERT`, vous pouvez réactiver l'affichage financier à la carte depuis *Paramètres ➔ Sécurité & Comptes ➔ Projection Modulaire* sans quitter votre mode Solo.
