---
id: page-types-pieces
groupId: 05-entrepot-organes
groupTitle: Entrepôt Organes & Pièces Détachées
docType: page
audience: user
tabId: part_types
title: Types de Pièces Détachées (Niveau 2 — Parts)
subtitle: Catégorisation technique rattachée aux Groupes Parts (Carters, Arbres, Flasques, Engrenages)
summary: Guide d'utilisation pour la gestion des Types de Pièces Détachées (Niveau 2 : PartGroup ➔ PartType ➔ PartDesignation ➔ Entrepôt), tri calculé, filtres en cascade et protection contre les suppressions orphelines.
relatedTabs:
  - part_groups
  - part_designations
  - entrepot
---

# 🏷️ Guide Utilisateur : Types de Pièces Détachées

> **Module :** Référentiel Technique & Entrepôt  
> **Identifiant d'accès :** `#part_types`  
> **Public cible :** Magasiniers industriels, Techniciens d'usinage, Mécaniciens de maintenance.

---

## 1. Rôle et Objectif

L'écran **Types de Pièces Détachées** assure la classification des pièces mécaniques, électriques et structurelles élémentaires qui composent les organes ou les machines, mais qui ne sont pas des ensembles rotatifs complets :

- `CARTER` : Corps de réducteurs, carters de pompes, boîtiers d'engrenages.
- `ARBRE` : Arbres de transmission, arbres cannelés, axes d'entraînement.
- `FLASQUE` : Flasques avant/arrière de fixation (B5, B14), flasques paliers.
- `ENGRENAGE` : Pignons droits, roues dentées hélicoïdales, couronnes.
- `VENTILATEUR` : Hélices de refroidissement moteur et capots d'aération.
- `TAMPON` : Raccords élastiques et flectors d'accouplement.

---

## 2. Structure d'un Type de Pièce

Chaque enregistrement comprend :
1. **Identifiant Unique Système (`id_type`) :** Code normalisé en majuscules avec auto-incrémentation sans collision (`max + 1`).
2. **Groupe Parts Parent (`id_group`) :** Rattachement au Niveau 1 (`#part_groups`) permettant le filtrage en cascade (avec filtre dédié *Non classé*).
3. **Libellé Complet (`libelle`) :** Intitulé en français (ex. *« Arbres de Transmission et Pignons Intégrés »*).
4. **Domaine Mécanique :** Catégorisation interne permettant de regrouper les familles d'usinage.

---

## 3. Interaction avec les Désignations et le Stock

Dans le tableau des types de pièces :
- Chaque type affiche le **nombre de désignations associées** (`X Désignations`).
- En cliquant sur l'action de navigation rapide, vous basculez instantanément vers l'écran **Désignations de Pièces (`#part_designations`)** pré-filtré sur ce type précis.
- Un lien direct vers l'**Entrepôt (Onglet Pièces)** permet de visualiser en un coup d'œil l'ensemble des articles physiques stockés sous ce type de pièce.

---

## 4. Ajout d'un Nouveau Type de Pièce

1. Cliquez sur le bouton principal **« + Nouveau Type de Pièce »**.
2. Saisissez l'identifiant court (en lettres majuscules sans espaces, ex. `POULIE_CRANTEE`).
3. Saisissez la désignation explicite.
4. Cliquez sur **« Enregistrer »**.

---

## 5. Règles d'Intégrité Référentielle, Tri & Export

- **Compteurs & Tri calculés :** Les compteurs de **Désignations** et de **Pièces en Entrepôt** (filtrées strictement via `isWarehousePart`, sans jamais mélanger les composants) sont triables directement depuis les en-têtes du tableau.
- **Anti-doublon & Suppression bloquée :** Toute clé dupliquée est rejetée sans fermer la fenêtre, et la confirmation de suppression est désactivée tant que des désignations ou des pièces en entrepôt y sont rattachées.
- **Export Excel (Type B) :** Exporte le référentiel des Types Parts au format CSV sécurisé `(Type B)`.

---

## 6. Comportement en Mode `TEAM_FULL` vs `SOLO_EXPERT`

- **Parité totale :** L'écran **Types de Pièces (Niveau 2)** est strictement identique en `TEAM_FULL` et en `SOLO_EXPERT`.
