---
id: page-user-injection-excel
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: page
audience: user
tabId: settings_injection
title: Injection Structurée (Type A) & Mode Démo
subtitle: Importation contrôlée par modèles officiels Type A (JSON / Excel) et gestion explicite des jeux de démonstration
summary: Guide pas-à-pas pour importer vos catalogues et équipements via les modèles officiels Type A (REF_PARC, REF_PERSONNEL, ASSETS_MACHINES, REF_PDR, PM_CATALOG, ENTREPOT_BOM, CM_CATALOG) et gérer le basculement Mode Démo / Mode Usine Réelle.
relatedTabs:
  - stock
  - machines
  - settings
---

# 📊 Guide Utilisateur : Injection Structurée (Type A) & Mode Démo (`#settings_injection`)

> **Module :** Paramètres Système & Audit  
> **Onglet :** *Injection & Mode Démo* dans Paramètres  
> **Public cible :** Administrateurs Système (`ADMIN` — permission `settings.manage`) et Chefs de Projet Déploiement.

---

## 1. Deux Modes Distincts et Maîtrisés

L'onglet **Injection & Mode Démo** sépare clairement :
1. **Mode A — Jeu de Données Démo / Mode Usine Réelle :**
   - Permet de charger des données de démonstration globales ou par section (`stock`, `parc`, `entrepot`, `zones`, `mouvements`, `preventive`, `corrective`) uniquement sur **action explicite**.
   - Permet de tout remettre à zéro (**Mode Usine Réelle**, `0` enregistrement) qui reste strictement vide après rechargement (`F5`).
2. **Mode B — Ingestion Structurée Officielle (Type A) :**
   - Seule voie autorisée pour importer vos référentiels et équipements en masse, via les modèles officiels `.template.json` ou les classeurs Excel **Type A** portant l'onglet d'enveloppe `README_TYPE_A`.

---

## 2. Les 7 Domaines Officiels d'Importation (Type A)

Respectez l'ordre recommandé des couches référentielles pour éviter les clés étrangères manquantes :
1. **`REF_PARC`** : Zones, familles de machines, modèles constructeurs et blueprints.
2. **`REF_PERSONNEL`** : Techniciens, opérateurs et équipes.
3. **`ASSETS_MACHINES`** : Parc machines enregistrées actives (rattachées aux zones/familles/modèles).
4. **`REF_PDR`** : Groupes PDR, types, désignations et catalogue initial d'articles magasin.
5. **`PM_CATALOG`** : Référentiel et gammes de maintenance préventive (sur machines actives enregistrées).
6. **`ENTREPOT_BOM`** : Taxonomie entrepôt (organes/pièces), articles physiques d'entrepôt et nomenclature BOM Nexus.
7. **`CM_CATALOG`** : Référentiel des catégories de pannes, travaux et actions correctives.

> **Important (Type B non réimportable) :** Les exports Excel opérationnels issus des écrans de consultation (**Type B**) ainsi que les **mouvements de stock** (`Sortie / Entrée / Ajustement`) ne sont jamais réimportés en masse via ce pipeline. Les mouvements restent des transactions métier contrôlées depuis l'écran **Sortie & Entrée Rapide**.

---

## 3. Procédure Sécurisée d'Importation (Dry-Run puis Validation)

1. **Téléchargez le modèle officiel Type A** (`.json` ou `.xlsx` contenant l'onglet `README_TYPE_A`) correspondant au domaine souhaité.
2. **Remplissez vos données** sans modifier les noms de colonnes techniques ni supprimer l'onglet `README_TYPE_A`.
3. **Lancez l'analyse préalable (Dry-Run) :** le système valide chaque ligne, contrôle les doublons et vérifie l'existence des clés étrangères **sans rien écrire dans la base**.
4. **Corrigez les erreurs bloquantes** signalées dans le rapport, puis confirmez la validation finale pour enregistrer les données et déclencher la synchronisation LAN.
