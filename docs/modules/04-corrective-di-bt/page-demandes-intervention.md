---
id: page-demandes-intervention
groupId: 04-corrective-di-bt
groupTitle: Maintenance Corrective (DI / BT & Clôture)
docType: page
audience: user
tabId: corrective_di
title: Demandes d'Intervention (DI)
subtitle: Signalement d'anomalies, pré-remplissage depuis le Catalogue, niveaux d'urgence P1-P4, consignation LOTO et conversion 1-clic en Bon de Travail Live
summary: Guide opérationnel des Demandes d'Intervention (#corrective_di) en mode TEAM_FULL et SOLO_EXPERT. Couvre la déclaration de panne sur machines actives, l'injection directe depuis le Catalogue des Pannes, l'indicateur LOTO et le bouton d'accélération « Créer BT & Démarrer Live ⚡ ».
relatedTabs:
  - corrective_bt
  - corrective_live
  - corrective_referentiel
  - machines
---

# 📋 Guide Utilisateur : Demandes d'Intervention (`#corrective_di`)

> **Module :** Maintenance Corrective (`v5.1.2`)  
> **Identifiant d'accès :** `#corrective_di`  
> **Onglet :** *Demandes d'Intervention* dans la vue Maintenance Corrective  
> **Public cible :** Opérateurs de production, Techniciens, Superviseurs de maintenance (`TEAM_FULL`) et Ingénieurs Maintenance autonomes pilotant une équipe terrain (`SOLO_EXPERT`).

---

## 1. Rôle et Objectif de la Page

La **Demande d'Intervention (`DI`)** est le point d'entrée normalisé de toute défaillance non planifiée (arrêt franc, dérive de cadence, bruit anormal, échauffement, fuite ou alarme `CBM Terrain`).

Chaque `DI` créée est horodatée, rattachée à une **machine active non archivée** (`filterActiveMachines`) et journalisée dans le registre d'audit immuable (`CORRECTIVE_DI_CREATED`).

---

## 2. Éléments Visuels & Tableau de Bord DI

1. **Bandeau des Compteurs Synthétiques :**
   - **Total DI :** Volume global des demandes enregistrées.
   - **En Attente (`DEMANDE`) :** Demandes en attente de qualification ou de prise en charge.
   - **Urgences Critiques (`URGENTE` / Arrêt Machine) :** Pannes bloquantes nécessitant une réaction immédiate.
   - **Converties en BT :** Demandes transformées en Bons de Travail actifs (`BT_PLANIFIE` ou `EN_COURS`).
2. **Barre de Recherche et Filtres Multi-Critères :**
   - Recherche instantanée par numéro de demande, code machine, zone, symptôme ou demandeur.
   - Filtrage par priorité (`BASSE`, `NORMALE`, `HAUTE`, `URGENTE`), type de panne (`Mécanique M`, `Électrique E`, `Pneumatique P`, `Hydraulique H`, `Automatisme A`) et statut.
3. **Protection du Périmètre & RBAC :**
   - En mode `TEAM_FULL`, un **Opérateur** ou un **Technicien** peut déclarer une `DI`. La conversion en `BT` est réservée aux profils disposant du droit de pilotage (`Responsable Maintenance` / `Admin`).
   - Les profils **Observateur (`VIEWER`)** et **Magasinier (`RESPONSABLE_MAGASIN`)** consultent la liste en lecture seule.

---

## 3. Deux Méthodes pour Déclarer une Nouvelle DI

### Méthode A — Saisie Directe depuis `#corrective_di`
1. Cliquez sur **« + Nouvelle Demande (DI) »** en haut à droite.
2. Renseignez les champs normalisés :
   - **Machine concernée :** Sélectionnez l'équipement parmi les machines actives du parc (les machines archivées sont automatiquement exclues et rejetées par le moteur SSOT).
   - **Type de Panne (`M / E / P / H / A`) & Symptôme (`Anomalie`) :** Choisissez la catégorie technique et sélectionnez ou saisissez le symptôme constaté.
   - **Travail demandé / Action suggérée :** Si le symptôme est répertorié dans la **Matrice Symptôme ➔ Action**, l'action standard recommandée est proposée automatiquement.
   - **Priorité & Arrêt Machine :** `BASSE`, `NORMALE`, `HAUTE` ou `URGENTE` + indicateur d'arrêt machine (`OUI / NON`).
   - **Consignation Énergétique (`LOTO Requis`) :** Cochez cette option si l'intervention exige une coupure d'énergie et la pose d'un cadenas (`Lockout / Tagout`) avant tout démontage.
3. Cliquez sur **« Enregistrer la DI »** : la demande est créée et tracée dans `AUDIT_EVENTS`.

### Méthode B — Création Pré-remplie en 1 Clic depuis le Catalogue (`#corrective_referentiel`)
Depuis n'importe lequel des 4 onglets du **Catalogue des Données Correctives** :
- **Pannes & Symptômes :** cliquez sur **`+ DI`** en face d'un symptôme pour ouvrir directement la modale `DI` avec la catégorie et l'anomalie pré-remplies.
- **Travaux Standards :** cliquez sur **`+ DI`** sur un mode opératoire standard pour pré-remplir le travail demandé.
- **Matrice Symptôme ➔ Action :** cliquez sur **`Créer DI`** sur un couple symptôme/action : le système **déduit automatiquement la catégorie technique (`M`, `E`, `P`, `H`, `A`)**, remplit l'anomalie et l'action recommandée, et ouvre la modale `DI`.
- **Équipe & Intervenants :** cliquez sur **`Affecter DI`** sur la carte d'un technicien actif pour pré-sélectionner cet intervenant.

---

## 4. Conversion en Bon de Travail (`BT`) : Mode Standard vs Accélération `Live ⚡`

Lorsqu'une `DI` est prise en charge, cliquez sur **« Convertir en BT »** (🔧) pour ouvrir la modale de qualification :
- Vérifiez ou complétez le **Numéro de BT** (généré séquentiellement ex. `BT-2026-042`), le **Technicien assigné** (parmi l'équipe active), la **Priorité** et l'option **Consignation `LOTO`**.
- **Deux boutons d'exécution sont proposés au bas de la modale :**
  1. **« Créer le Bon de Travail » (Flux Planifié Standard) :**
     - Convertit la `DI` en `BT` (`BT_PLANIFIE` ou `EN_COURS`) et conserve l'opérateur sur la liste pour continuer le tri des demandes.
  2. **« Créer BT & Démarrer Live ⚡ » (Flux Rapide `SOLO_EXPERT` & Urgence Terrain) :**
     - Convertit la `DI` en `BT`, **démarre immédiatement la session de chronométrage (`handleStartLiveIntervention`)** et **bascule automatiquement l'écran vers la console `Intervention Live` (`#corrective_live`)** sur ce `BT`.
     - *Note de sécurité `LOTO` :* si le `BT` requiert une consignation `LOTO` (`requires_loto: true`), l'écran Live s'ouvre directement sur le **Panneau de Consignation LOTO** en état `ATTENTE_CONSIGNATION` afin que l'intervenant consigne ses cadenas et valide la `VAT` avant le lancement du chronomètre de réparation.

---

## 5. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

| Étape | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Terrain + Équipe) |
| :--- | :--- | :--- |
| **Qui déclare la DI ?** | Opérateur de production, Rondier, Technicien ou Superviseur (ou alarme `CBM Terrain`). | L'Ingénieur Maintenance (`@admin`) suite à un appel atelier, un constat terrain ou une alerte `CBM`. |
| **Conversion DI ➔ BT** | Le Responsable Maintenance qualifie la `DI`, assigne le technicien et planifie le `BT`. | Utilisez **« Créer BT & Démarrer Live ⚡ »** pour transformer l'appel en intervention active et lancer le chrono en **1 seul clic**, tout en attribuant le technicien terrain concerné. |
| **Traçabilité Audit** | `CORRECTIVE_DI_CREATED` + `CORRECTIVE_DI_CONVERTED_TO_BT` par rôle. | Identique, avec conservation intégrale des statistiques par technicien et par machine. |
