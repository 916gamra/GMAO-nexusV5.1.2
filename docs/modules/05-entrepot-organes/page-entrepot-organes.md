---
id: page-entrepot-organes
groupId: 05-entrepot-organes
groupTitle: Entrepôt Organes & Pièces Détachées
docType: page
audience: user
tabId: entrepot
title: Entrepôt Organes & Pièces Détachées
subtitle: Gestion du parc d'organes rotatifs et blocs complets, statut opérationnel, montage sur machines et suivi d'usure
summary: Guide opérationnel complet pour l'écran Entrepôt. Couvre la double vue Composants / Pièces, l'attribution sur machine, les mouvements rapides, le suivi des états (Disponible, Installé, En Réparation) et l'indice de santé.
relatedTabs:
  - comp_groups
  - comp_families
  - comp_templates
  - part_types
  - part_designations
  - machines
  - nexus
---

# 📦 Guide Utilisateur : Entrepôt Organes & Pièces Détachées

> **Module :** Entrepôt Organes & Pièces  
> **Identifiant d'accès :** `#entrepot`  
> **Public cible :** Magasiniers industriels, Techniciens de maintenance, Chefs d'atelier et Responsables Méthodes.

---

## 1. Rôle et Objectif de l'Écran

L'écran **Entrepôt Organes & Pièces** est dédié à la gestion des ensembles électromécaniques stratégiques de l'usine (moteurs, réducteurs, motopompes, variateurs, vérins) ainsi que des pièces de rechange mécaniques lourdes.

Contrairement aux petites pièces fongibles du magasin général (vis, joints, roulements), les organes stockés ici :
- Sont interchangeables et réutilisables après réparation.
- Possèdent un cycle de vie individuel : neuf ➔ monté sur machine ➔ démonté pour panne ➔ rebobiné / révisé ➔ remis en stock disponible.
- Participent à la nomenclature réelle des machines (`Nexus BOM`).

---

## 2. Double Vue : Organes Complets (`Components`) vs Pièces d'Atelier (`Parts`)

L'écran propose deux onglets principaux qui respectent chacun une hiérarchie complète en **4 niveaux** :

1. **Onglet « Composants / Organes » (`nature: 'COMPONENT'`) :**
   - **Chaîne de création :** `Groupes Organes (#comp_groups) ➔ Familles (#comp_families) ➔ Modèles (#comp_templates) ➔ Entrepôt`.
   - **Colonnes réelles :** Code Composant & Réf Fabricant (A), Famille & Template (D), Désignation & Spécifications / Plaque signalétique / Alertes Usure (C), Machine & Localisation (E), Responsable (F — affiché en `TEAM_FULL`), Statut (G), Stock Actuel & Seuil (H), Actions (`•••`).
2. **Onglet « Pièces / Parts » (`nature: 'PART'`) :**
   - **Chaîne de création :** `Groupes Parts (#part_groups) ➔ Types Parts (#part_types) ➔ Désignations Parts (#part_designations) ➔ Entrepôt`.
   - **Colonnes réelles :** Code Part (A), Type & Désignation (D), Description & Politiques Matières (C), Machine / Zone / Emplacement (E), Responsable (F — affiché en `TEAM_FULL`), Statut (G), Stock Actuel & Seuil (H), Actions (`•••`).

---

## 3. Comprendre les Statuts Opérationnels & Badges

Chaque élément porte un badge normalisé dans la colonne **Statut (G)** :

- 🟢 **En service :** L'organe ou la pièce est monté sur une machine active (son code machine est cliquable vers la fiche machine).
- 🔵 **En stock :** L'élément est disponible en entrepôt et prêt à être prélevé ou monté.
- 🟠 **En révision :** L'organe est démonté et envoyé en réparation atelier ou en rebobinage externe.
- 🔴 **Arrêt / Archivé (`ARCHIVEE`) :** Élément hors service ou archivé avec conservation complète de son historique.

---

## 4. Mouvements Rapides, Fiche Technique 360° & Archivage Sécurisé

Depuis le menu d'actions (`•••`) ou le bouton **Sortie** sur chaque ligne :
- **Sortie / Retour / Réception / Ajustement (`QuickMovementModal`) :** Enregistre un mouvement rapide indexé strictement sur `id_warehouse_item`, avec sélection de la machine active cible (`filterActiveMachines`) et de la zone.
- **Fiche Technique & Détails (`EntrepotDetailsModal`) :** Affiche la plaque signalétique héritée du Modèle/Template, l'historique des interventions et rebobinages, ainsi que le **Score de Santé Technique (`/100`)** et les alertes d'usure/réforme.
- **Suppression contrôlée & Archivage Sécurisé (`Safe Archive`) :**
  - Si l'élément est **monté sur une machine active**, la suppression est **bloquée** jusqu'à son démontage préalable.
  - Si l'élément possède un **historique** (mouvements, BT correctifs, préventifs, sorties externes ou rebobinages), il est **archivé (`ARCHIVEE`)** sans effacement afin de préserver la traçabilité et le registre `AUDIT_EVENTS`.
- **Export Excel (Type B) :** Le bouton **« Export Excel (Type B) »** génère un fichier CSV opérationnel sécurisé contre l'injection de formules (destiné à l'analyse et non réimportable).

---

## 5. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

| Aspect | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Terrain) |
| :--- | :--- | :--- |
| **Structure & Hiérarchie d'ajout** | Double hiérarchie complète 4 niveaux (`Components` & `Parts`) | **100 % identique** : les 7 écrans et le même ordre hiérarchique sont conservés |
| **Colonne `Responsable` & Sélecteur Technicien** | Affichés dans les tableaux, les formulaires d'ajout/édition et `QuickMovementModal` | **Masqués** ; les mouvements rapides sont automatiquement attribués à votre session active |
| **Valorisation & Coûts BER** | Coûts cumulés de réparation, valeur de remplacement et ratio économique affichés dans la **devise ISO active** (`useCurrency`) | **Masqués** (`showFinance: false`) ; seule la **Santé Technique (`/100`)**, les pannes 6 mois et les cycles de rebobinage restent affichés |
| **Stock initial `0` & Seuils `0`** | Préservés exactement sans substitution par défaut | Préservés exactement sans substitution par défaut |
