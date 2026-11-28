---
id: page-cloture-analyse
groupId: 04-corrective-di-bt
groupTitle: Maintenance Corrective (DI / BT & Clôture)
docType: page
audience: user
tabId: corrective_cloture
title: Clôture des Rapports, Rapport Technique A4 (RCA) & Analyse Pareto
subtitle: Archive immuable des BT clôturés, Rapport d'Expertise RCA / 5 Pourquoi persisté dans le SSOT, diagrammes de Pareto 80/20 et indicateurs MTTR/MTBF
summary: Guide opérationnel des onglets Rapports Clôturés (#corrective_cloture) et Analyse Corrective (#corrective_analyse) en TEAM_FULL et SOLO_EXPERT. Détaille la rédaction et la sauvegarde SSOT du Rapport Technique A4 (RCA), la consolidation des coûts PDR + Atelier, et l'exploitation des analyses Pareto et MTTR/MTBF.
relatedTabs:
  - corrective_bt
  - corrective_atelier
  - corrective_history
  - dashboard
  - finance
  - machines
---

# 📊 Guide Utilisateur : Clôture des Rapports, Rapport Technique `RCA` & Analyse Corrective (`#corrective_cloture` / `#corrective_analyse`)

> **Module :** Maintenance Corrective (`v5.1.2`)  
> **Identifiants d'accès :** `#corrective_cloture` et `#corrective_analyse`  
> **Onglets :** *Rapports Clôturés* & *Analyse Corrective & Pareto*  
> **Public cible :** Responsables Maintenance, Ingénieurs Fiabilité, Chefs d'Atelier (`TEAM_FULL`) et Ingénieurs Maintenance autonomes (`SOLO_EXPERT`).

---

## 1. Rôle et Objectif

La clôture d'un Bon de Travail (`BT`) transforme l'intervention terrain en mémoire technique et analytique exploitable :
- **Rapports Clôturés (`#corrective_cloture`) :** Registre immuable des interventions finalisées, permettant de consulter la fiche 360° du dépannage, de suivre les Bons d'Atelier (`BR / RECT`) associés, d'éditer le **Rapport Technique d'Intervention A4 (`RCA` — Analyse de Cause Racine)** sauvegardé directement dans le SSOT, et d'exporter les données en Excel Type B.
- **Analyse Corrective (`#corrective_analyse`) :** Moteur décisionnel calculant en temps réel les indicateurs normés **EN 13306** (`MTTR`, `MTBF`, Disponibilité opérationnelle $D_o$), les courbes de **Pareto 80/20** (par machine, par symptôme et par famille technique) et les **recommandations automatiques de plans préventifs**.

---

## 2. Rapport Technique d'Intervention A4 & Analyse de Cause Racine (`RCA` Persisté SSOT)

Au-delà du simple compte-rendu de clôture, chaque `BT` dispose d'un **Rapport Technique d'Expertise au format A4 normalisé** (`InterventionReportModal.tsx`) :

1. **Ouverture du Rapport Technique A4 :**
   - Dans `#corrective_cloture`, cliquez sur l'icône **Aperçu (`👁️`)** d'un `BT` puis sur **« Rapport Technique A4 »** (ou directement sur l'icône **`📄` Rapport** de la ligne).
   - Le rapport pré-remplit automatiquement les faits certains du `BT` (Date, Code & Désignation Machine, Référence `BT`, Type de maintenance, Durée d'arrêt, Nature du défaut, Intervenant et Référence documentaire `RT-BT-...`) **sans jamais inventer d'analyse fictive**.
2. **Saisie de l'Expertise & Analyse `RCA` :**
   - **Synthèse Exécutive :** Résumé du contexte et de l'impact opérationnel.
   - **Tableau d'Expertise Technique (`RCA`) :** Renseignez les composants inspectés, les observations physiques constatées et leur impact (avec bouton **`+ Ajouter une ligne d'observation`** pour documenter autant d'organes que nécessaire).
   - **Cause Racine (`Root Cause`) & Facteur Déclencheur :** Détaillez la cause première de la défaillance et son effet.
   - **Travaux Réalisés, Contrôles de Remise en Service & Actions Préventives / Recommandations :** Documentez les essais de validation et les actions préventives proposées pour éviter la récidive.
   - **Visas :** Signature de l'intervenant et visa du responsable maintenance.
3. **Sauvegarde Directe dans le SSOT (`handleSaveInterventionReport`) & Impression A4 :**
   - Cliquez sur **« Enregistrer » (`💾`)** :
     - Le rapport est **persisté directement dans le SSOT** sur l'intervention (`intervention.technical_report`), met à jour `cause_racine` ainsi que l'indicateur `rapport_redige = 'OUI'`, et écrit un événement d'audit immuable **`CORRECTIVE_RCA_SAVED`** dans `STORAGE_KEYS.AUDIT_EVENTS` (avec miroir local pour résilience hors-ligne).
     - *Note d'intégrité :* l'enrichissement post-mortem d'un rapport `RCA` sur un `BT` déjà `CLOTURE` est explicitement autorisé sans jamais altérer le statut, les mouvements de stock PDR ni les coûts financiers verrouillés.
   - Cliquez sur **« Imprimer / PDF A4 » (`🖨️`)** pour générer la fiche officielle A4 prête pour l'archivage qualité ISO ou la revue de direction.

---

## 3. Fiche Récapitulative du BT, Passerelle Atelier (`BR / RECT`) & Export Excel Type B

En ouvrant la fiche détaillée (`👁️`) d'une intervention dans `#corrective_cloture` :
- **Traçabilité Technique & Temporelle :** Demandeur, intervenant résolu par matricule (`TECH-XX`), heures de début/fin, temps d'intervention calculé (pause déjeuner neutralisée) et indicateur d'arrêt machine.
- **Bilan Pièces de Rechange (`PDR`) :** Liste complète des références consommées, quantités et valorisation au PUMP (`cout_pdr`).
- **Suivi & Émission des Bons d'Atelier Mécanique (`BR / RECT`) :**
  - Affiche tous les ordres d'usinage/rectification liés (`code_bon`, type, quantité, statut `EMIS` ➔ `RECEPTIONNE_MONTAGE`).
  - Permet d'émettre un bon complémentaire ou de basculer en 1 clic vers **`Ouvrir Suivi Atelier` (`#corrective_atelier`)**.
- **Export Excel Filtré (Type B) :** Le bouton **« Exporter Excel (.xlsx) »** génère un classeur structuré multi-colonnes (`Col A` à `Col N`) contenant exactement le périmètre filtré à l'écran.

---

## 4. Analyse de Fiabilité (`MTTR`, `MTBF`, Pareto 80/20 & Recommandations Préventives)

L'onglet **Analyse Corrective (`#corrective_analyse`)** exploite les données réelles des `BT` :
1. **Indicateurs Normés EN 13306 :**
   - **`MTTR` (Temps Moyen de Réparation)**, **`MTBF` (Temps Moyen Entre Pannes)** et **Disponibilité Opérationnelle ($D_o$)** calculés dynamiquement sans aucune donnée simulée.
2. **Triple Analyse de Pareto (Loi des 80/20) :**
   - **Pareto par Machine (`correctiveParetoMachines`) :** Identifie les 20 % d'équipements responsables de 80 % des arrêts ou des interventions.
   - **Pareto par Anomalie (`correctiveParetoAnomalies`) :** Classe les symptômes récurrents.
   - **Pareto par Domaine Technique (`correctiveParetoTypes`) :** Répartition `Mécanique`, `Électrique`, `Hydraulique`, `Pneumatique`, `Automatisme`.
3. **Boucle d'Amélioration Continue (`correctivePreventiveRecommendations`) :**
   - Dès qu'un couple `(Machine, Anomalie)` franchit le seuil de récurrence critique, le moteur génère automatiquement une **Recommandation de Plan Préventif** pour transformer les dépannages répétitifs en gamme préventive systématique dans `#preventive`.

---

## 5. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

| Fonctionnalité | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Terrain + Équipe) |
| :--- | :--- | :--- |
| **Périmètre de visibilité** | Les techniciens voient leurs interventions assignées (`scopedInterventions`) ; les superviseurs/admins voient toute l'usine. | L'Ingénieur (`@admin`) visualise l'ensemble de l'usine et filtre par technicien terrain pour évaluer la performance individuelle de son équipe. |
| **Rapport Technique A4 (`RCA`)** | Rédigé par le technicien ou l'ingénieur fiabilité et visé par le responsable maintenance (`CORRECTIVE_RCA_SAVED`). | **Identique et 100 % actif :** permet à l'expert solo de documenter ses analyses de causes racines (`RCA`) sur les pannes critiques et d'imprimer un rapport A4 professionnel pour la direction ou le client. |
| **Pareto 80/20, `MTTR` / `MTBF` & Recommandations PM** | Pilotage par le service Méthodes / Fiabilité. | **Outil d'aide à la décision directe :** identifie immédiatement quelle machine ou quel technicien concentre les heures d'arrêt et quelles pannes récurrentes doivent passer en préventif. |
