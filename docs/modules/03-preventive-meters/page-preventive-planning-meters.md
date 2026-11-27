---
id: page-preventive-planning-meters
groupId: 03-preventive-meters
groupTitle: Maintenance Préventive & Compteurs (Meter PM)
docType: page
audience: user
tabId: preventive
title: Planning Annuel, Compteurs (Meter PM) & Contrôle Conditionnel CBM
subtitle: Cockpit hebdomadaire, 4 espaces de travail (Planning, Compteurs & CBM terrain, Historique & Analytics, Plans & Guides) en TEAM_FULL et SOLO_EXPERT
summary: Guide opérationnel complet pour piloter le planning préventif (TEAM_FULL & SOLO_EXPERT), dispatcher et suivre l'équipe de techniciens, valider les visites avec PDR, réaliser les tournées d'horomètres et les relevés conditionnels CBM terrain, imprimer les Ordres de Travail (OT) et analyser la conformité.
relatedTabs:
  - preventive_referentiel
  - machines
  - utilisateurs
  - validation_center
  - corrective_di
---

# 🗓️ Guide Utilisateur : Planning Préventif, Compteurs & CBM (`#preventive`)

> **Module :** Maintenance Préventive & Compteurs (`Meter PM`)  
> **Identifiant d'accès :** `#preventive`  
> **Public cible :** Administrateurs GMAO, Responsables Maintenance (`TEAM_FULL`), Techniciens de terrain (`TEAM_FULL`), et Ingénieurs Maintenance autonomes pilotant une équipe terrain (`SOLO_EXPERT`).

---

## 1. Rôle de cet Écran et Architecture en 4 Espaces

L'écran **Planning & Compteurs Préventifs** est le centre de pilotage de la maintenance systématique (calendaire) et conditionnelle (compteurs & mesures terrain). Il est organisé autour d'une barre supérieure unifiée donnant accès à **4 espaces opérationnels** :

1. **Espace 1 — `Planning & Exécution`** :
   - **Cockpit Hebdomadaire (`Aujourd'hui & Cette Semaine`)** placé en tête de vue : file prioritaire des tâches en retard et de la semaine ISO courante (`S1..S52`), filtre de dispatch par technicien assigné, sélecteur d'exécutant rapide, bouton **« Voir tout »**, bouton **« OT »** (impression du Bon d'Intervention) et accès aux **Rondes Système Général**.
   - **5 vues de planning commutables** :
     - **`Liste Tâches`** : tableau détaillé virtualisé avec édition/réaffectation (`✏️`), suppression (`🗑️`), impression `OT` (`🖨️`), déclenchement `BT` correctif et validation.
     - **`Matrice S1-S52`** : grille annuelle 52 semaines croisant machines/organes et codes d'action `AFNOR` (`C`, `N`, `G`, `V`, `R`, `S`, `L`).
     - **`Grille Jours J1-J31`** : suivi journalier sur le mois sélectionné.
     - **`Par Machine`** : accordéon synthétique par équipement avec taux d'avancement, charge horaire estimée, édition/réaffectation (`✏️`) et suppression (`🗑️`) de chaque gamme.
     - **`Calendrier Mensuel`** : vue mois / focus semaine avec densité de charge et inspecteur journalier détaillé.
2. **Espace 2 — `Compteurs & Heures`** (`Meter PM` & `CBM Terrain`) :
   - Suivi des horomètres (`Heures`, `Cycles`, `Km`), barres de progression vers les seuils, **Tournée d'Atelier** groupée avec attribution du technicien ayant effectué le relevé, et panneau **Relevés Conditionnels Terrain (`CBM Manuel`)** pour saisir des mesures physiques (thermomètre IR, vibromètre, manomètre, pince ampèremétrique, débitmètre).
3. **Espace 3 — `Historique & Analytics`** :
   - **`Journal des Exécutions & Validation`** : mémoire temporelle immuable (`PREVENTIVE_EXECUTIONS`) filtrable par période, statut Maker-Checker (`TEAM_FULL`) et **technicien exécutant**, avec export Excel Type B.
   - **`Analytics, Ponctualité & Coûts / Charge Techniciens`** : taux de conformité dynamique, ponctualité `OTCR`, équilibre `PM / CM`, santé par zone, machines à risque, radar des pénuries `PDR` à venir, et tableau **« Charge & Performance par Technicien »**.
4. **Espace 4 — `Plans & Guides`** *(réservé aux profils autorisés `preventive.manage`)* :
   - Raccourci direct vers l'atelier d'ingénierie `#preventive_referentiel` (Concepteur de Plans, Fiches Guides & PDR, Catalogue Actions AFNOR).

---

## 2. Opérations Courantes Pas-à-Pas

### A. Piloter la Semaine & Dispatcher les Techniciens (`Cockpit Hebdomadaire`)
1. Ouvrez `#preventive` : le **Cockpit `Aujourd'hui & Cette Semaine`** classe automatiquement les retards (compteur puis calendaire) avant les tâches de la semaine en cours.
2. Utilisez le filtre **« Équipe : Tous »** pour isoler la charge hebdomadaire d'un technicien précis (ou les tâches `Non assigné`).
3. Cliquez sur **`OT`** sur n'importe quelle ligne pour imprimer ou exporter en PDF le **Bon d'Intervention Préventive** à remettre au technicien sur le terrain (avec protocole de consignation **LOTO** cochable, liste résolue des `PDR` prescrites et zone d'observations vierge à remplir sur le terrain).
4. **Validation 1-Clic sécurisée :**
   - Les tâches **sans pièce PDR requise** peuvent être validées en 1 clic depuis le cockpit (en choisissant le technicien exécutant réel si nécessaire).
   - Les tâches comportant des **PDR prescrites** (`pdr_requises` ou `pdr_ref`) ouvrent obligatoirement la **modale de validation complète** afin de vérifier les quantités réellement consommées et garantir l'intégrité du stock.

### B. Valider une Exécution, Consommer des PDR & Gérer les Anomalies
1. Cliquez sur **« Valider »** (ou **« Nouvelle exéc. »** pour un nouveau cycle) sur une tâche.
2. Renseignez la **Date de réalisation**, le **Technicien exécutant** *(uniquement parmi le personnel actif non archivé)*, la **Durée réelle (min)**, et les **Pièces de Rechange (`PDR`)** consommées.
3. **Circuit de gouvernance selon le mode et le rôle :**
   - **En `TEAM_FULL` — Technicien (`TECHNICIEN`) :** l'exécution est enregistrée en **`PENDING_VALIDATION`** (circuit *Maker-Checker*). Aucune déduction immédiate n'est opérée sur le stock physique tant que le superviseur n'a pas approuvé dans le **Centre de Validation** ou dans le **Journal des Exécutions**.
   - **En `TEAM_FULL` — Responsable / Admin :** validation immédiate (ou approbation des soumissions en attente), émission des mouvements de sortie `MVT-PRV` et journalisation dans `AUDIT_EVENTS`.
   - **En `SOLO_EXPERT` — Admin (`SOLO_DIRECT`) :** exécution directe sans file d'approbation croisée, tout en conservant le contrôle strict du stock disponible et la traçabilité complète `executionMode: 'SOLO_DIRECT'` dans `AUDIT_EVENTS`.
4. **Anomalie détectée pendant la visite :** cochez l'option dédiée ou cliquez sur **`BT`** pour ouvrir immédiatement une **Demande d'Intervention Corrective (`DI`)** pré-remplie sur la machine concernée.

### C. Modifier, Réaffecter ou Supprimer une Tâche Préventive
Depuis **Liste Tâches** ou **Par Machine** *(pour les rôles disposant de `preventive.manage`)* :
- Cliquez sur l'icône **`✏️` (Modifier / Réaffecter)** pour ouvrir la modale d'édition : changez le **Technicien responsable** (liste filtrée sur les techniciens actifs), la fréquence, la durée estimée, le code action AFNOR, l'organe, la zone, la référence PDR ou la consigne technique.
- Cliquez sur l'icône **`🗑️` (Supprimer)** pour retirer une tâche obsolète après confirmation sécurisée.

### D. Relevés d'Horomètres, Tournée d'Atelier & Contrôle Conditionnel (`CBM Terrain`)
Dans l'espace **Compteurs & Heures** :
1. **Relevé Individuel ou `Tournée d'Atelier` :** saisissez les nouveaux index (`Heures`, `Cycles`, `Km`) et attribuez le **technicien ayant effectué le relevé**. Les machines archivées sont automatiquement exclues et l'opération confirme le résultat réel avant toute notification.
2. **Contrôle Conditionnel Terrain (`CBM Manuel`) :**
   - Créez des points de contrôle par machine active (Vibration RMS `mm/s`, Température palier `°C`, Pression hydraulique `bar`, Intensité moteur `A`, Débit d'air comprimé `m³/h`).
   - Les seuils `Warning` et `Critique` sont validés mathématiquement selon le sens physique (`HIGH_BAD` pour dépassement haut, `LOW_BAD` pour chute basse) et les bornes physiques de l'instrument.
   - Toute saisie manuelle franchissant le seuil critique crée automatiquement (sans doublon) une **DI Corrective** haute priorité attribuée à l'opérateur ayant fait le relevé.
3. **Sécurité de périmètre (`RBAC`) :** un **Technicien** ne voit que les machines et tâches de son périmètre assigné ; un **Observateur (`VIEWER`)** consulte l'ensemble en lecture seule sans aucun bouton d'écriture ni de création CBM.

### E. Rondes Groupées « Système Général » & Suppression d'Exécution
- **Ronde Système Général :** permet de valider en lot les équipements actifs du Système Général (extincteurs, compresseurs, utilités), en excluant les équipements archivés et en signalant clairement tout échec partiel.
- **Correction d'historique :** si un administrateur supprime une exécution erronée dans le **Journal des Exécutions**, l'état (`etat`) et la `derniere_realisation` de la tâche liée sont automatiquement recalculés à partir des exécutions restantes.

---

## 3. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

> **Logique clé en `SOLO_EXPERT` :**  
> En mode `SOLO_EXPERT`, vous conservez **100 % du moteur technique préventif** (Matrice 52S, Calendrier, Compteurs, CBM terrain, OT imprimables, Rondes Système Général et **gestion complète de vos techniciens de terrain**), tout en supprimant le bruit comptable et bureaucratique inutile.

| Fonctionnalité | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Terrain + Équipe) |
| :--- | :--- | :--- |
| **Gouvernance d'exécution** | `TEAM_MAKER_CHECKER` (validation croisée des techniciens) | **`SOLO_DIRECT`** (validation directe par `@admin`, tracée en audit) |
| **Gestion & Dispatch des Techniciens** | Comptes multi-utilisateurs + assignation + charge | **Complet sans multi-comptes** : assignation, réaffectation (`✏️`), filtre Cockpit/Historique, attribution Compteurs/CBM, impression `OT`, tableau **Charge & Performance par Technicien** |
| **Affichage Financier (`Coût MO + PDR`, `P.U`, devise dynamique)** | ✅ Affiché partout (KPI, colonnes, Analytics, OT, CSV/Excel) | 🙈 **Masqué par défaut** (`showFinance: false`) — remplacé dans Analytics par **Charge Horaire Préventive (h)** ; réactivable à la carte |
| **Filtres & Colonne `Maker-Checker` dans l'Historique** | ✅ Visibles en permanence | 🙈 **Masqués automatiquement** quand 0 exécution en attente (restent visibles si un reliquat `TEAM_FULL` existe) |
| **Filtre `Blueprint` dans le Planning** | ✅ Visible | 🙈 **Masqué par défaut** (`showBlueprintsInPrimaryNav: false`) ; réactivable à la carte |
| **Compteurs (`Meter PM`), `CBM Terrain` & `OT + LOTO`** | ✅ Actifs avec RBAC strict | ✅ **Actifs à l'identique** |
| **Export Excel / CSV (Type B)** | Inclut les colonnes de coûts dans la devise active | Exporte les données techniques/horaires sans colonnes financières |

> **Conseil terrain `SOLO_EXPERT` :**  
> Créez vos techniciens dans **Équipe Terrain (`#utilisateurs`)**, affectez-leur leurs tâches dans **Planning Préventif**, imprimez leurs **OT** depuis le Cockpit du lundi matin, puis suivez chaque vendredi leur taux de conformité et leurs heures réalisées dans **Historique & Analytics ➔ Charge & Performance par Technicien**.
