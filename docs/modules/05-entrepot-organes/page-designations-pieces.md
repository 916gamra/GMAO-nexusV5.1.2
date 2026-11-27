---
id: page-designations-pieces
groupId: 05-entrepot-organes
groupTitle: Entrepôt Organes & Pièces Détachées
docType: page
audience: user
tabId: part_designations
title: Désignations de Pièces Détachées (Niveau 3 — Parts)
subtitle: Répertoire normatif des références élémentaires, dimensions brut, plans d'usinage et spécifications matière
summary: Guide d'utilisation pour la gestion des Désignations de Pièces (Niveau 3 : PartGroup ➔ PartType ➔ PartDesignation ➔ Entrepôt), dossier d'usinage C3, filtres actifs et liaison Entrepôt.
relatedTabs:
  - part_groups
  - part_types
  - entrepot
  - corrective_atelier
---

# 📝 Guide Utilisateur : Désignations de Pièces Détachées

> **Module :** Référentiel Technique & Entrepôt  
> **Identifiant d'accès :** `#part_designations`  
> **Public cible :** Magasiniers industriels, Responsables des achats techniques, Mécaniciens de maintenance.

---

## 1. Rôle et Objectif

L'écran **Désignations de Pièces Détachées** constitue le répertoire précis et normalisé des pièces mécaniques et électriques élémentaires.

Alors que le *Type de Pièce* définit la catégorie générale (ex. `ARBRE`), la *Désignation de Pièce* précise les dimensions, le matériau et la référence exacte :
- `ARBRE-CAN-D35-L250` : Arbre cannelé diamètre 35 mm, longueur 250 mm, acier traité 42CrMo4.
- `FLASQUE-B5-M200` : Flasque de fixation B5 diamètre extérieur 200 mm pour carcasse moteur 90L.
- `ENGRENAGE-M2-Z32` : Pignon droit module 2, 32 dents, alésage 25 mm avec rainure de clavette.

Ce catalogue normalisé évite les saisies anarchiques ou les doublons lors des réapprovisionnements en usinage ou commandes externes.

---

## 2. Structure d'une Fiche de Désignation

Chaque enregistrement comprend :
1. **Identifiant Unique Système (`id_designation`) :** Clé primaire immuable générée sans collision (`max + 1`, ex. `DES-ARB-0042`).
2. **Groupe & Type de Pièce Associés (`id_group`, `id_type`) :** Lien hiérarchique vers les Niveaux 1 et 2 (pré-rempli automatiquement selon le filtre actif lors de la création).
3. **Libellé Technique Complet :** Description exhaustive comprenant les cotes dimensionnelles critiques.
4. **Dossier d'Atelier Mécanique (`C3`) :** `matiere_nuance` (ex. `42CrMo4`, `Inox 316L`, `Bronze CuSn12`), `ref_plan` (ex. `PLN-ARB-204-A`), `dimensions_brut` (ex. `Ø90 x 450 mm`) et `traitement_thermique` (ex. `Trempe + Revenu 58 HRC`).
5. **Constructeur ou Référence Fournisseur :** Référence standardisée de pièce.

---

## 3. Recherche, Filtrage en Cascade et Liens Entrepôt

- **Filtres par Groupe & par Type :** Des filtres dédiés (avec puces de filtres actifs effaçables en 1 clic pour **Groupe Parts** et **Type Parts**) permettent d'isoler immédiatement un périmètre mécanique.
- **Compteur exact de Pièces Physiques (`isWarehousePart`) :** Chaque ligne agrège uniquement les articles de nature **Part** présents en entrepôt (préservant exactement la valeur `0` pour `stockActuel` et `seuil`).
- En cliquant sur le badge d'entrepôt, vous basculez directement vers **Entrepôt — Onglet Parts (`#entrepot`)** pré-filtré sur cette désignation.

---

## 4. Ajout d'une Nouvelle Désignation

1. Cliquez sur le bouton principal **« + Nouvelle Désignation »**.
2. Vérifiez ou sélectionnez le **Groupe Parts** et le **Type de Pièce** parent (pré-sélectionnés si un filtre est actif).
3. Renseignez l'identifiant court et le libellé technique complet.
4. Précisez la nuance matière, la référence plan, les cotes brutes et le traitement thermique si applicables.
5. Cliquez sur **« Enregistrer »** (les doublons d'identifiant sont bloqués sans perte de saisie).

---

## 5. Règles d'Intégrité Référentielle & Export

- **Protection orphelins :** Une désignation ne peut pas être supprimée tant que des articles physiques (`isWarehousePart`) existent sous cette référence dans l'entrepôt.
- **Export Excel (Type B) :** Exporte le catalogue des désignations au format CSV opérationnel sécurisé `(Type B)`.

---

## 6. Comportement en Mode `TEAM_FULL` vs `SOLO_EXPERT`

- **Parité totale :** L'écran **Désignations de Pièces (Niveau 3)** est strictement identique en `TEAM_FULL` et `SOLO_EXPERT`, permettant d'alimenter directement l'Entrepôt et les Bons de Réalisation/Rectification (`BR / RECT`) de l'Atelier Mécanique.
