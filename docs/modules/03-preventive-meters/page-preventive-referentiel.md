---
id: page-preventive-referentiel
groupId: 03-preventive-meters
groupTitle: Maintenance Préventive & Compteurs (Meter PM)
docType: page
audience: user
tabId: preventive_referentiel
title: Ingénierie & Référentiel Préventif
subtitle: Concepteur de plans (Calendrier / Compteur / Hybride), Fiches Guides Organes-PDR et Catalogue d'Actions AFNOR en TEAM_FULL et SOLO_EXPERT
summary: Guide opérationnel de l'atelier d'ingénierie préventive : créer des plans récurrents sur mesure (avec ou sans Blueprint), structurer les fiches guides par organe reliées aux vrais consommables PDR, administrer les codes AFNOR protégés et comparer TEAM_FULL vs SOLO_EXPERT.
relatedTabs:
  - preventive
  - blueprints
  - machines
  - entrepot
  - utilisateurs
---

# 🛠️ Guide Utilisateur : Ingénierie & Référentiel Préventif (`#preventive_referentiel`)

> **Module :** Maintenance Préventive & Compteurs (`Meter PM`)  
> **Identifiant d'accès :** `#preventive_referentiel`  
> **Condition d'accès (`RBAC`) :** Réservé aux rôles disposant de la permission **`preventive.manage`** (`ADMIN` et `RESPONSABLE_MAINTENANCE` en `TEAM_FULL` ; `@admin` en `SOLO_EXPERT`). Les comptes `TECHNICIEN`, `OPERATEUR` et `VIEWER` sont redirigés vers un écran de garde sécurisé.

---

## 1. Rôle de cet Écran

Accessible depuis le menu latéral ou depuis l'espace **« Plans & Guides »** du planning préventif, cet écran regroupe les **3 ateliers de conception** permettant de standardiser la maintenance préventive de votre usine :

1. **Onglet 1 — `Concepteur de Plans` (`Plan Builder`)** : Générateur de gammes préventives complètes pour toute **machine active** (en mode formulaire rapide ou **Assistant Pas-à-Pas Wizard**).
2. **Onglet 2 — `Guide & PDR` (`Fiches Guides Organes`)** : Bibliothèque de modes opératoires par type d'organe reliée directement aux articles réels de votre stock `PDR` (sans aucune donnée fictive injectée).
3. **Onglet 3 — `Catalogue Actions` (`Actions AFNOR`)** : Référentiel des codes normalisés affichés dans toute la matrice annuelle (`C`, `N`, `G`, `V` protégés contre la suppression + codes personnalisables `R`, `S`, `L`...).

---

## 2. Onglet 1 : Utiliser le `Concepteur de Plans` (`Plan Builder`)

Lorsque vous sélectionnez une **Machine Active** *(les machines archivées sont automatiquement exclues)* :

1. **Découverte Automatique du Parc (`SSOT`) :**
   - Le concepteur récupère automatiquement la **Zone réelle** (`id_zone_default`), le **Technicien titulaire** *(uniquement s'il est actif — les techniciens archivés sont exclus des sélecteurs)*, l'**index horomètre actuel** (`compteur_heures`) et les **Organes montés** sur la machine (issus de l'Entrepôt Tier 2, du registre `BOM` machine, et en `TEAM_FULL` du `Blueprint` associé s'il existe).
   - Il croise ensuite ces organes avec vos **Fiches Guides** pour pré-remplir les gammes recommandées.
2. **Mode de Déclenchement (`Calendrier`, `Compteur` ou `Hybride`) :**
   - **`CALENDRIER`** : déclenchement périodique (`Hebdomadaire`, `Mensuel`, `Trimestriel`, `Semestriel`, `Annuel`) à partir d'une semaine cible (`S1..S52`).
   - **`COMPTEUR`** : déclenchement par intervalle d'usage (ex. toutes les `500 Heures` ou `10 000 Cycles`) calculé à partir du compteur actuel de la machine.
   - **`HYBRIDE`** : déclenchement au premier des deux termes atteint (échéance calendaire **ou** seuil compteur).
3. **Fréquence Globale non destructive & Récurrence (`FIXE` vs `GLISSANT`) :**
   - Modifier la **Fréquence globale** du plan met à jour les lignes standard **sans écraser** les tâches dont vous avez déjà personnalisé la fréquence individuellement.
   - **`FIXE`** maintient la cadence calendaire d'origine ; **`GLISSANT`** recalcule la prochaine échéance depuis la date réelle de la dernière exécution.
4. **Sélection des Pièces & Consommables (`PDR`) :**
   - Le sélecteur filtre intelligemment votre inventaire sur les consommables et pièces de rechange pertinentes afin de prescrire les bonnes références sur l'Ordre de Travail (`OT`) et lors de la validation.
5. Cliquez sur **« Générer le Plan & Injecter au Planning »** : toutes les tâches sont créées et immédiatement visibles dans `#preventive`.

---

## 3. Onglet 2 : Structurer les `Fiches Guides & PDR`

Une **Fiche Guide** capitalise le savoir-faire de votre atelier sur un type d'organe (ex. *Palier Moteur*, *Centrale Hydraulique*, *Compresseur à Vis*, *Armoire Électrique*) :
- Définissez les **Actions AFNOR** associées (ex. `C` Contrôle + `N` Nettoyage + `G` Graissage + `V` Vidange), la **consigne opératoire précise** et la **durée standard estimée**.
- Associez les références **`PDR`** réelles de votre catalogue stock : leurs unités exactes (`L`, `Kg`, `U`, `m`...) sont conservées fidèlement.
- **Zéro donnée fictive (`Zero Silent Seed`) :** si votre usine démarre à vide, l'onglet reste propre (`0` fiche) et n'injecte jamais de fausse référence de démonstration.

---

## 4. Onglet 3 : Administrer le `Catalogue des Actions AFNOR`

Ce catalogue définit les codes courts colorés affichés dans la matrice annuelle, le calendrier, le cockpit hebdomadaire et les Ordres de Travail (`OT`) :

- **4 Codes Socles AFNOR Protégés** *(non supprimables en vue grille comme en vue tableau pour garantir l'intégrité du moteur)* :
  - **`C` — Contrôle & Inspection** (mesures, jeux, tension, température, sécurité)
  - **`N` — Nettoyage** (soufflage, dégraissage, propreté filtres/capteurs)
  - **`G` — Graissage & Lubrification** (appoint graisse/huile, paliers, chaînes)
  - **`V` — Vidange** (renouvellement d'huile hydraulique, réducteur, compresseur)
- **Codes Complémentaires & Personnalisés :** vous pouvez ajouter, modifier ou supprimer vos propres codes métiers (ex. **`R`** Réglage/Remplacement, **`S`** Sécurité/Consignation, **`L`** Lubrification spéciale) avec leurs durées standards et couleurs.

---

## 5. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

| Aspect d'Ingénierie | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Terrain) |
| :--- | :--- | :--- |
| **Accès à `#preventive_referentiel`** | `ADMIN` & `RESPONSABLE_MAINTENANCE` (`preventive.manage`) | **`@admin` (Accès complet direct)** |
| **Source des Organes dans `Plan Builder`** | Entrepôt (Tier 2) + BOM Machine + **Blueprints (Tier 3)** | **Entrepôt (Tier 2) + BOM Machine** (Blueprints masqués par défaut si `showBlueprintsInPrimaryNav: false`, sans bloquer la création de plans) |
| **Attribution du Technicien dans le Plan** | Sélection parmi tous les techniciens actifs (`#utilisateurs`) | **Identique** — affectez chaque plan ou tâche à un technicien terrain actif (ou laissez non assigné) |
| **Fiches Guides & Consommables PDR** | Complet (catalogue réel, zéro fausse graine) | **Complet à l'identique** |
| **Catalogue Actions AFNOR (`C/N/G/V` protégés)** | Complet | **Complet à l'identique** |
| **Réactivation des Blueprints** | Actifs par défaut | Réactivables à tout moment dans *Paramètres ➔ Sécurité & Comptes* sans aucune perte de données |
