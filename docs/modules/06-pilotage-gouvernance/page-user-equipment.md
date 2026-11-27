---
id: page-user-equipment
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance & Gouvernance
docType: page
audience: user
tabId: equipment
title: Équipements & Système Général (Utilités d'Usine)
subtitle: Pilotage centralisé des utilités industrielles, Cockpit temps réel, Pilotage Rapide en ligne et Passeport 360°
summary: Guide utilisateur complet de l'écran Équipements / Système Général en mode Équipe Complète (TEAM_FULL) et Solo Expert (SOLO_EXPERT). Explique les 4 KPIs, le Cockpit Utilités, le Mode Pilotage Rapide, le Passeport 360°, la gestion des catégories et l'archivage sécurisé.
relatedTabs:
  - zones
  - utilisateurs
  - machines
  - preventive
  - sortie
---

# ⚡ Guide Utilisateur : Équipements & Système Général (`#equipment`)

> **Module :** Pilotage & Gouvernance (Référentiels d'Usine)  
> **Identifiant d'accès :** `#equipment`  
> **Public cible :** Administrateurs, Responsables Maintenance, Ingénieurs Utilités & HSE, Chefs d'Atelier, Ingénieurs Terrain (`SOLO_EXPERT`).

---

## 1. Rôle et Objectif de cet Écran

Dans une usine, tous les équipements ne sont pas des machines de fabrication. Les **compresseurs d'air**, **groupes électrogènes**, **pompes incendie**, **refroidisseurs (`Chillers`)**, **chaudières**, **postes électriques HT/BT** et **stations d'eau** forment le **Système Général (Utilités & Infrastructure)**.

L'écran **Équipements / Système Général** est le **centre de contrôle exclusif** pour :
- Créer, modifier, archiver et restaurer tous les équipements de classe **`SYSTEM_GENERAL`**.
- Gérer le catalogue des **Types de Système Général** (`AIR`, `ELEC`, `SEC`, `EAU`, `ECL`, `CHILL`...).
- Piloter en temps réel leur **statut opérationnel** (`En Service`, `En Maintenance`, `À l'Arrêt`), leur **Zone**, leur **Technicien référent**, leur **Compteur (Horomètre)**, leur **Santé 360°** et leurs interventions.

> **Séparation stricte avec le Parc Production :** L'écran **Machines Enregistrées (`#machines`)** est réservé à la création et l'édition des machines de **Production**. Si vous consultez une utilité depuis `#machines`, le bouton **« Gérer dans Système Général »** vous redirige directement ici avec la ligne ciblée mise en surbrillance.

---

## 2. KPIs Interactifs, Cockpit Utilités & Deux Volets

### Les 4 Cartes KPI Cliquables
1. **Équipements Installés** : Total des utilités actives dans le registre SSOT (`SYSTEM_GENERAL`).
2. **En Service Opérationnel** : Nombre d'actifs disponibles et pourcentage de disponibilité instantanée.
3. **Maintenance / À l'Arrêt** : Nombre d'équipements en alerte (ventilés `Maint. • Arrêt • BT`), avec **TCO Maint. 12m** (en `TEAM_FULL`) ou compteur d'archivés (en `SOLO_EXPERT`).
4. **Types de Système** : Nombre de catégories actives / totales (clic rapide pour basculer vers le volet *Types de Système Général*).

### Bandeau Cockpit Utilités (4 Filtres d'Action Rapide)
- **Arrêt / Maint.** : Isole les utilités non disponibles (affiche aussi la **perte horaire active** en devise ISO en `TEAM_FULL`).
- **Critiques / BER** *(ou **Santé Critique** en `SOLO_EXPERT`)* : Filtre les utilités en état critique ou dépassant le seuil *Beyond Economical Repair*.
- **Maint. Requise** : Filtre les utilités ayant au moins un **BT ouvert** ou une **tâche préventive due**.
- **Fiches Incomplètes** : Repère les fiches actives auxquelles il manque un champ critique :
  - En `TEAM_FULL` : Zone, Technicien ou Coût d'arrêt horaire manquant.
  - En `SOLO_EXPERT` : uniquement **Zone géographique manquante** (le Technicien et le Coût d'arrêt restent optionnels).

### Volet 1 : `Équipements Installés`
- **Filtres multicritères :** Recherche texte (code, désignation, n° de série), pastilles de statut (`Actifs`, `En Service`, `Maintenance`, `À l'Arrêt`, `Archivés`), filtre par **Type de Système**, par **Zone** et tri Excel (le tri `TCO` s'affiche uniquement lorsque la Finance est active).
- **Mode Pilotage Rapide (Édition en ligne par lot) :** Cliquez sur **« Pilotage Rapide »** pour modifier directement dans le tableau le **Statut**, le **Technicien**, le **Régime de marche (`1x8 / 2x8 / 3x8`)** et (en `TEAM_FULL`) le **Coût d'arrêt horaire**, puis validez toutes vos modifications d'un seul clic via **« Enregistrer (N) »**.
- **Actions sur chaque ligne :**
  - **Passeport 360°** : Ouvre le dossier complet de l'utilité (Vue Générale, Compteurs, Historique Pannes, Préventif). *Note : la nomenclature BOM Tier 2 est volontairement verrouillée sur les utilités `SYSTEM_GENERAL`.*
  - **Sortie PDR Rapide** : Ouvre un bon de retrait magasin pré-rempli sur cet équipement.
  - **Planning Préventif** : Ouvre le planning préventif filtré sur cet équipement.
  - **Modifier / Archiver / Restaurer** : Édition complète ou archivage sécurisé (`Safe Archive`) sans perte d'historique.
- **Export Excel (Type B)** : Exporte la sélection filtrée vers `.xlsx` (export opérationnel non réimportable).

### Volet 2 : `Types de Système Général`
- Permet d'ajouter de nouvelles familles d'utilités avec un **Préfixe court** (`AIR`, `ELEC`, `SEC`, `CVAC`...) servant à la codification automatique (`AIR-01`, `AIR-02`...), de les renommer ou de les activer/désactiver.

---

## 3. Procédure : Ajouter un Nouvel Équipement du Système Général

1. Cliquez sur le bouton principal **« + Nouvel Équipement »** en haut à droite.
2. Sélectionnez le **Type de Système Général** (ex. `AIR — Air Comprimé`) : le code séquentiel libre (`AIR-01`, `AIR-02`) est généré automatiquement.
3. Renseignez la **Désignation complète** (ex. *Compresseur à vis Atlas Copco GA55*), la **Zone d'implantation** et (facultativement en `SOLO_EXPERT`) le **Technicien Responsable**.
4. Renseignez le **Statut initial**, le **Numéro de série**, la **Date de mise en service**, le **Compteur initial** (`HEURES`, `CYCLES`, `TONNES`, `KM`) et le **Régime de marche** (`1x8`, `2x8`, `3x8`).
5. *(En `TEAM_FULL` uniquement)* Renseignez le **Coût d'arrêt horaire** et la **Valeur d'acquisition (RAV)** pour alimenter les calculs TCO et BER économiques.
6. Enregistrez : l'équipement est aussitôt disponible dans les **Bons de Travail**, le **Préventif**, les **Compteurs** et les **Sorties PDR**.

---

## 4. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

L'écran **Équipements & Système Général (`#equipment`)** reste **pleinement opérationnel** en `SOLO_EXPERT`, car un ingénieur terrain autonome doit aussi entretenir ses compresseurs, chaudières, groupes électrogènes et organes de sécurité :

| Élément d'interface | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Autonome) |
| :--- | :--- | :--- |
| **Création / Édition & Types Système** | ✅ Complet (inclut Coût d'arrêt horaire & Valeur d'acquisition). | ✅ Complet sans champs financiers (Zone, Compteur, Régime et **Technicien optionnel**). |
| **Technicien Référent** | Requis dans l'indicateur `Fiches Incomplètes`. | **Optionnel & assignable** (alimenté par `#utilisateurs`, ne déclenche pas `Fiches Incomplètes` s'il est vide). |
| **Cockpit Utilités** | Affiche perte horaire active (`DH/€/$/h`), impact financier `Critiques / BER` et `Fiches Incomplètes` (Zone + Tech + Coût). | Affiche `Arrêt / Maint.` (nb d'équip.), `Santé Critique`, `Maint. Requise` et `Fiches Incomplètes` (**Zone uniquement**). |
| **Mode Pilotage Rapide** | Édition en ligne : Statut, Technicien, Régime et **Coût Arrêt/h**. | Édition en ligne : Statut, **Technicien** et **Régime de marche** (colonne Coût masquée). |
| **KPI 3, Tri & Export Type B** | Inclut `TCO Maint. 12m`, tri par `TCO` et colonnes financières dans l'Excel Type B. | Masque le `TCO`, retire le tri `TCO` et exporte un Excel Type B purement technique. |
| **Passeport 360° & Safe Archive** | ✅ Complets (avec TCO 12m en devise ISO active). | ✅ Complets (Santé technique `/100`, pannes, préventif, sans montants financiers). |
