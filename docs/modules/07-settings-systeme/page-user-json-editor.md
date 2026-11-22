---
id: page-user-settings-json-editor
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: page
audience: user
tabId: settings_json_editor
title: Inspecteur JSON SSOT (Lecture Seule & Export Type B)
subtitle: Consultation technique des collections stockées et export externe JSON non réimportable
summary: Guide d'utilisation de l'inspecteur JSON réservé aux administrateurs. Explique comment consulter chaque collection SSOT en lecture seule, exporter un instantané externe Type B (.json) et pourquoi la modification directe brute est bloquée.
relatedTabs:
  - settings
  - settings_injection
  - settings_backup_audit
---

# 💻 Guide Utilisateur : Inspecteur JSON SSOT (`#settings_json_editor`)

> **Module :** Paramètres Système & Audit  
> **Onglet :** *Base JSON* dans Paramètres  
> **Public cible :** Administrateurs Système (`ADMIN` — permission `settings.manage`).  
> 🔒 **Gouvernance INGEST-GOV-P9 :** Cet écran est volontairement **verrouillé en lecture seule**. Aucune écriture JSON directe n'est autorisée afin de protéger les clés étrangères, l'invariant mathématique du stock et le journal d'audit.

---

## 1. À Quoi Sert l'Inspecteur JSON ?

L'onglet **Base JSON** permet aux administrateurs d'auditer l'état exact des collections stockées dans `DataGateway` sans passer par les filtres des écrans métier :
- Vérifier rapidement un enregistrement technique (ex. fiche machine, mouvement, pièce d'entrepôt, registre BOM Nexus).
- Rechercher une référence ou un identifiant précis dans le texte affiché (`Ctrl+F`).
- Télécharger un export externe au format `.json` (**Type B — consultation uniquement**) pour analyse externe ou support technique.

---

## 2. Consulter et Exporter une Collection

1. Ouvrez le sélecteur de collection en haut à droite pour choisir la table à inspecter :
   - **Stock PDR & Mouvements :** `rawStock`, `mouvements`, `types`.
   - **Entrepôt & Nexus BOM :** `warehouseItems`, `machineElementsLedger`, `sortiesExterne`.
   - **Parc Machines & Architecture :** `machines`, `families`, `templates`, `zones`.
   - **Maintenance & Équipe :** `preventiveTasks`, `correctiveInterventions`, `technicians`, `operations`.
   - **Système (Lecture seule) :** `users` (résumé des comptes sans aucun mot de passe ni secret du coffre-fort).
2. La zone de texte affiche la collection formatée en lecture seule (`Lecture seule (SSOT verrouillé)`).
3. Cliquez sur **« Exporter .json (Type B) »** pour télécharger le fichier `gmao_typeB_<collection>_YYYY-MM-DD.json`.

---

## 3. Comment Modifier ou Importer des Données en Toute Sécurité ?

Comme l'écriture JSON brute est bloquée (`RAW_JSON_OVERWRITE_BLOCKED`), utilisez le canal officiel adapté :
1. **Importer ou mettre à jour des référentiels / machines / catalogues :** utilisez **Paramètres ➔ Injection & Mode Démo ➔ Mode B (Type A)** via les modèles officiels validés par `UnifiedImportPipeline`.
2. **Restaurer une sauvegarde complète de l'usine :** utilisez **Paramètres ➔ Sauvegardes & Audit** (`Centre de Sauvegarde`).
3. **Corriger un stock, un mouvement ou une intervention :** utilisez les écrans opérationnels dédiés afin que `StockCalculationService` et `AUDIT_EVENTS` restent parfaitement cohérents.
