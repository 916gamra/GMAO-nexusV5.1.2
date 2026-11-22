---
id: page-user-executive-report
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance & Gouvernance
docType: page
audience: user
tabId: executive_report
title: Rapport Mensuel Exécutif (Direction)
subtitle: Synthèse mensuelle Direction avec variations M vs M-1 (Month-over-Month), coûts officiels, fiabilité et exports exécutifs
summary: Guide d'utilisation du Rapport Mensuel Exécutif destiné à la Direction. Couvre la sélection mensuelle, les badges de variation M/M-1, la décomposition des coûts maintenance par équipement et les exports officiels.
relatedTabs:
  - shift_weekly_report
  - finance
  - dashboard
---

# 📊 Guide Utilisateur : Rapport Mensuel Exécutif (`#executive_report`)

> **Module :** Pilotage, Finance & Gouvernance  
> **Composant source :** `src/presentation/components/views/MonthlyExecutiveReportView.tsx`  
> **Moteur de calcul :** `MonthlyReportCalculationService` + `MonthlyReportExportService`.  
> **Public cible :** Direction Générale, Directeurs d'Usine, Responsables Maintenance, Contrôle de Gestion (`VIEWER`, `RESPONSABLE_MAGASIN`, `RESPONSABLE_MAINTENANCE`, `ADMIN`).

---

## 1. Vue Direction Consolidée

Le **Rapport Mensuel Exécutif** transforme l'ensemble des données de terrain du mois en une synthèse prête pour le comité de direction :
- **KPIs de fiabilité et d'activité :** volume de pannes, temps d'arrêt, taux de réalisation préventive et réactivité corrective.
- **Variations Mensuelles (`M vs M-1`) :** chaque indicateur clé affiche automatiquement un badge d'évolution par rapport au mois précédent (`DeltaBadge`), avec inversion visuelle intelligente (une baisse des pannes ou des coûts est mise en valeur positivement).
- **Consolidation Financière Multi-Sources :** agrège les consommations PDR correctives, le coût du préventif et les réparations externes / bobinage dans la devise active configurée dans `#settings_currency`.

---

## 2. Analyse par Machine & Filtrage d'Actifs

- **Filtre de classe d'actifs :** sépare les coûts des lignes de production de ceux des utilités (*Système Général*).
- **Classement Pareto des Coûts (`C1`) :** trie les équipements par coût officiel total, coût PDR correctif, préventif, bobinage externe ou fréquence de panne afin d'identifier immédiatement les machines « bad actors ».
- **Pagination & Recherche rapide :** permet d'auditer rapidement une machine précise ou une famille d'équipements.

---

## 3. Exports Direction & Impression

- **Impression mise en page :** génère une sortie imprimable structurée pour les revues mensuelles.
- **Export Excel officiel (`MonthlyReportExportService`) :** disponible pour les profils autorisés (`report.export`) avec conservation de la devise active et des métadonnées de période.
