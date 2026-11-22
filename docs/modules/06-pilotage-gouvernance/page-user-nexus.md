---
id: page-user-nexus
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance & Gouvernance
docType: page
audience: user
tabId: nexus
title: Nexus — Nomenclature Réelle (As-Built) & Jumeaux Numériques
subtitle: Anatomie physique des machines de production, suivi RUL par compteur, analyse d'écarts Blueprint et actions 1-clic
summary: Guide d'utilisation complet de Nexus Matrix. Explique la lecture unifiée BOM + Entrepôt (MONTE), le suivi d'usure RUL basé sur les compteurs machine, la comparaison avec le Blueprint, la duplication propre vers les machines jumelles et les passerelles directes vers Sortie PDR, Correctif et Préventif.
relatedTabs:
  - dashboard
  - machines
  - blueprints
  - sortie
  - corrective_bt
---

# 🧬 Guide Utilisateur : Nexus — Nomenclature Réelle & Jumeaux Numériques (`#nexus`)

> **Module :** Pilotage & Gouvernance (voir aussi le guide synthétique dans [Arborescence Nexus — Parc Machines](../02-parc-machines/page-arborescence-nexus.md))  
> **Identifiant d'accès :** `#nexus`  
> **Public cible :** Responsables Méthodes, Ingénieurs Fiabilité, Chefs d'Atelier, Techniciens (lecture/interventions).

---

## 1. Qu'est-ce que l'Écran Nexus ?

L'écran **Nexus** présente la **nomenclature physique réelle (`As-Built`)** de chaque machine de production active (les équipements du *Système Général* sont volontairement isolés dans l'écran `#equipment`).

Il unifie automatiquement :
- Les éléments déclarés directement dans le registre BOM de la machine (`COMPONENT`, `PART`, `PDR`).
- Les organes physiques issus de l'**Entrepôt** actuellement au statut **`MONTE`** sur cette machine (avec leur référence et type verrouillés côté Nexus pour garantir la cohérence avec l'Entrepôt).

---

## 2. Suivi d'Usure (RUL) & Boucle Fermée Atelier

- **Calcul basé sur le compteur machine :** lorsque la machine dispose d'un compteur d'heures/cycles (`compteur_actuel`), l'usure cumulée est calculée à partir du delta réel depuis le compteur d'installation (`compteur_installation`). À défaut, le système utilise la durée calendaire depuis la date d'installation.
- **Remise à zéro automatique :** lorsqu'une pièce ou un organe est remplacé via une sortie magasin validée, une clôture corrective ou une exécution préventive, ses heures cumulées repartent proprement à `0` sur le nouveau compteur d'installation.
- **Disponibilité Stock PDR en direct :** chaque ligne `PDR` affiche en temps réel l'état du magasin (*En stock*, *Sous seuil* ou *Rupture*).

---

## 3. Analyse d'Écarts Blueprint & Duplication vers Machines Jumelles

1. **Analyse d'Écarts (Blueprint vs Réel) :**
   - Compare la nomenclature réelle de la machine avec le `Blueprint` théorique de son modèle.
   - Permet d'initialiser en un lot atomique les éléments manquants du Blueprint sans écraser les éléments déjà montés.
2. **Duplication vers les Machines Jumelles :**
   - Copie la structure BOM vers les autres machines de production actives partageant le même modèle (`Template`).
   - Les éléments clonés démarrent avec un état propre (`0 h`, statut `OPERATIONNEL`, compteur et technicien de la machine cible) sans copier de numéro de série physique d'entrepôt.

---

## 4. Passerelles d'Action Directe (1-Clic)

Depuis chaque élément de la nomenclature :
- ⚡ **Sortie Rapide PDR :** ouvre `#sortie` avec la machine et la pièce pré-remplies.
- 🔧 **Intervention Corrective :** ouvre la création d'un ordre curatif ciblé sur cet élément.
- 📅 **Plan Préventif :** rattache une tâche d'entretien systématique sur cet élément.
- 📊 **Import / Export BOM Excel :** permet d'exporter la nomenclature ou d'importer un lot de composants (réservé aux profils habilités `machine.edit`).
