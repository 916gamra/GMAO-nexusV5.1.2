---
id: page-historique-pieces-correctif
groupId: 04-corrective-di-bt
groupTitle: Maintenance Corrective (DI / BT, Atelier Mécanique & Clôture)
docType: page
audience: user
tabId: corrective_history
title: Historique Complet & Pièces Consommées en Correctif
subtitle: Traçabilité chronologique des interventions clôturées et suivi consolidé des pièces de rechange consommées sur pannes
summary: Guide opérationnel des vues Historique Correctif (#corrective_history) et Pièces Correctives (#corrective_pieces). Explique la recherche rétrospective des BT clôturés, l'analyse des pièces consommées par panne/machine et le lien avec le stock PDR.
relatedTabs:
  - corrective_pieces
  - corrective_bt
  - corrective_cloture
  - corrective_analyse
  - stock
---

# 🗂️ Guide Utilisateur : Historique & Pièces Consommées en Correctif (`#corrective_history` / `#corrective_pieces`)

> **Module :** Maintenance Corrective (DI / BT & Clôture)  
> **Identifiants d'accès :** `#corrective_history` et `#corrective_pieces`  
> **Public cible :** Techniciens, Chefs d'Atelier, Responsables Maintenance et Contrôle de Gestion.

---

## 1. Historique des Interventions Correctives (`#corrective_history`)

La vue **Historique Correctif** centralise la mémoire technique complète de toutes les pannes traitées et clôturées :
- Consultation chronologique filtrable par **machine**, **zone**, **catégorie de panne**, **technicien** et **période**.
- Accès direct aux détails de chaque Bon de Travail (`BT`) : symptôme déclaré, cause racine, travaux exécutés, durée d'arrêt (`MTTR`) et pièces remplacées.
- Aide au diagnostic rapide : avant de démonter un équipement, le technicien peut vérifier en quelques secondes si la même panne s'est déjà produite et quelle action l'a résolue durablement.

---

## 2. Suivi des Pièces Consommées en Correctif (`#corrective_pieces`)

La vue **Pièces Correctives** agrège les consommations de pièces de rechange (`PDR`) rattachées aux interventions curatives :
- Identifie les références PDR les plus consommées en dépannage d'urgence et les machines les plus gourmandes en pièces.
- Distingue les sorties déjà **validées** (déduites du stock réel via `StockCalculationService`) des déclarations terrain encore en attente de visa **Maker-Checker** dans `#validation_center`.
- Permet d'ajuster les seuils de réapprovisionnement dans `#stock` et d'alimenter la boucle fermée d'usure **Nexus BOM** (`#nexus`) lors des remplacements validés.
