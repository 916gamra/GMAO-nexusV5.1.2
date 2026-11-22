---
id: page-user-shift-weekly-report
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance & Gouvernance
docType: page
audience: user
tabId: shift_weekly_report
title: Rapport de Vacation & Hebdomadaire (Exploitation)
subtitle: Suivi opérationnel par poste, semaine ou période personnalisée : pannes, préventif, coûts PDR et bobinage externe
summary: Guide d'utilisation du Rapport de Vacation / Hebdomadaire. Explique les filtres de période (Aujourd'hui, Hier, 7 jours, 12 mois, Personnalisé), la séparation Production / Système Général, la ventilation des coûts officiels par machine et les exports Excel / CSV / JSON / Impression.
relatedTabs:
  - executive_report
  - dashboard
  - finance
  - validation_center
---

# 📋 Guide Utilisateur : Rapport de Vacation & Hebdomadaire (`#shift_weekly_report`)

> **Module :** Pilotage, Finance & Gouvernance  
> **Composant source :** `src/presentation/components/views/ShiftWeeklyReportView.tsx`  
> **Moteur de calcul :** `src/application/services/MonthlyReportCalculationService.ts` (`buildShiftOrWeeklyReport`).  
> **Public cible :** Chefs d'Atelier, Responsables Maintenance, Responsables Magasin et Administrateurs.

---

## 1. Objectif Opérationnel

Le **Rapport de Vacation / Hebdomadaire** permet de piloter la passation de consignes et la revue hebdomadaire d'exploitation sans ressaisie manuelle dans Excel.

Il consolide en direct :
- Les interventions correctives (`DI / BT`) ouvertes, en cours et clôturées sur la période.
- Les exécutions de maintenance préventive horodatées (`PreventiveExecution`).
- Les mouvements de stock PDR validés, les demandes en attente Maker-Checker et les sorties externes / bobinage.
- Les coûts officiels ventilés par machine (coût PDR correctif, préventif, bobinage externe et total officiel).

---

## 2. Filtres & Périmètre d'Analyse

1. **Périodes prédéfinies (`PeriodPreset`) :**
   - `TODAY` (Aujourd'hui / vacation en cours)
   - `YESTERDAY` (Hier)
   - `LAST_7_DAYS` (7 derniers jours)
   - `LAST_12_MONTHS` (12 derniers mois glissants)
   - `CUSTOM` (plage de dates libre `du ... au ...`)
2. **Filtre de classe d'actifs (`ReportAssetClassFilter`) :** permet d'isoler les **Machines de Production**, les équipements du **Système Général** ou la vue globale de l'usine.
3. **Tri & Recherche multi-critères :** tri direct par coût total officiel, coût PDR correctif, préventif, bobinage externe, nombre de pannes ou code machine.

---

## 3. Transparence des Formules & Exports

- Le bouton **Formules** affiche les équations exactes utilisées pour les KPIs et coûts consolidés.
- Les profils disposant de la permission `report.export` peuvent exporter le rapport en **Excel**, **CSV**, **JSON** ou lancer une **impression directe**.
