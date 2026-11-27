---
id: page-user-settings-workspace-modes
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: page
audience: user
tabId: settings_workspace_modes
title: Modes d'Exploitation (Équipe Complète, Solo Expert & Solo Light)
subtitle: Adapter l'interface et la gouvernance à votre réalité terrain sans aucune perte de données
summary: Comprendre la philosophie des 3 modes d'exploitation (Équipe Complète, Solo Expert et futur Solo Light), leurs bénéfices respectifs, la matrice de comparaison et la procédure de bascule réversible.
relatedTabs:
  - settings_admin
  - machines
  - corrective
  - preventive
---

# 🧭 Guide Utilisateur : Modes d'Exploitation (`#settings_workspace_modes`)

> **Module :** Paramètres Système & Audit  
> **Emplacement :** *Paramètres ➔ Sécurité & Comptes ➔ Modes d'Exploitation & Profil d'Espace de Travail*  
> **Public cible :** Administrateurs, Responsables Maintenance, Ingénieurs Maintenance Autonomes.

---

## 1. Pourquoi 3 Modes d'Exploitation ?

Toutes les équipes de maintenance ne travaillent pas avec la même organisation :
- Une **grande usine** a besoin d'une séparation stricte entre techniciens, magasiniers, superviseurs et direction financière.
- Un **ingénieur ou technicien de maintenance autonome** qui gère seul son parc machines veut aller droit au but : enregistrer ses machines, suivre ses composants/pièces, exécuter ses préventifs et correctifs, piloter ses travaux d'atelier et demandes d'achat, puis sortir des statistiques fiables (`MTTR`, `MTBF`, heures de travail) — sans valider deux fois ses propres tâches ni gérer un inventaire comptable complet.

**CIOB GMAO Nexus** répond à ces réalités avec **un seul moteur industriel** et **3 profils d'exploitation**.

> **Garantie Zéro Perte :** Changer de mode ne supprime **jamais** vos données. Toutes vos machines, historiques, pièces, blueprints, budgets et comptes restent intégralement conservés dans la base locale (`SSOT`). Vous pouvez basculer librement entre **Équipe Complète** et **Solo Expert** à tout moment.

---

## 2. Les 3 Modes en Détail

### 1. Équipe Complète (`TEAM_FULL`) — *Actif par défaut*
- **Pour qui ?** Usines industrielles multi-équipes avec magasin PDR et direction technique/financière.
- **Ce qu'il offre :**
  - Tous les modules visibles simultanément (Finance & Budgets, Stock Magasin complet, Parc Machines 3-Tiers avec Familles/Modèles/Blueprints, Préventif, Correctif, Entrepôt, Utilisateurs & Rôles).
  - **Gouvernance Maker-Checker :** les interventions et demandes de sortie saisies par les techniciens passent par le *Centre de Validation* avant d'impacter le stock ou les coûts validés.
- **Avantage principal :** Contrôle interne rigoureux et séparation claire des responsabilités.

### 2. Solo Expert (`SOLO_EXPERT`) — *Actif & Basculable*
- **Pour qui ?** Ingénieur maintenance terrain ou technicien expert qui pilote et exécute l'ensemble de la maintenance par lui-même.
- **Ce qu'il offre :**
  - **Exécution directe (`SOLO_DIRECT`) :** en tant qu'administrateur unique, vous créez, exécutez et clôturez directement vos interventions correctives/préventives et sorties de pièces sans étape de double validation artificielle.
  - **Interface centrée terrain :** les pages *Finance*, *Inventaire Magasin complet*, *Centre de Validation*, *Gestion d'équipe* et *Blueprints Machine* sont masquées par défaut pour épurer le menu.
  - **Tout le cœur technique reste actif :** Parc Machines complet (**Familles ➔ Templates ➔ Machines Registered** dans le même ordre hiérarchique), Passeport 360° (avec **ajout direct de Composants / Parts / PDR sans Blueprint requis**), Préventif & Compteurs, Correctif complet (`DI`, `BT`, `Live`, `Besoins d'achat`, `Atelier Mécanique BR/RECT`, `Clôture`, `Pareto`), Entrepôt Organes & Pièces, et Journal de retrait rapide (`Sortie Rapide`).
  - **Affichage à la carte :** 4 interrupteurs dédiés permettent de réafficher individuellement la Finance, le Stock Magasin, les Blueprints ou la Gestion d'équipe si besoin.
- **Avantage principal :** Toute la puissance analytique et technique de CIOB GMAO Nexus, avec la rapidité d'un outil pensé pour une seule personne sur le terrain.

### 3. Solo Light (`SOLO_LIGHT`) — *Bientôt disponible (Verrouillé)*
- **Statut actuel :** Visible dans les paramètres pour préparer la feuille de route, mais **volontairement verrouillé** tant que son ergonomie simplifiée n'est pas finalisée.
- **Vision :** Un futur mode ultra-simplifié destiné aux petits ateliers cherchant un carnet d'entretien minimaliste sans hiérarchies techniques avancées.

---

## 3. Tableau Comparatif Rapide

| Fonctionnalité | Équipe Complète (`TEAM_FULL`) | Solo Expert (`SOLO_EXPERT`) | Solo Light (`SOLO_LIGHT`) |
| :--- | :---: | :---: | :---: |
| **Disponibilité** | ✅ Actif (Défaut) | ✅ Actif (Basculable) | 🔒 En conception |
| **Validation croisée (`Maker-Checker`)** | Obligatoire | Exécution directe (`ADMIN`) | Non requise (prévu) |
| **Machines + BOM directe sans Blueprint** | ✅ Disponible | ✅ Mise en avant | Simplifié (prévu) |
| **Correctif (`DI / BT / Atelier / Besoins`)** | ✅ Complet | ✅ Complet | Simplifié (prévu) |
| **Préventif & Compteurs** | ✅ Complet | ✅ Complet | Simplifié (prévu) |
| **Entrepôt Organes & Parts** | ✅ Complet | ✅ Complet | Optionnel (prévu) |
| **Journal de retrait PDR (`Sortie Rapide`)** | ✅ Actif | ✅ Actif | Simplifié (prévu) |
| **Inventaire Magasin & Finance** | ✅ Visibles | Masqués (réactivables) | Masqués |
| **Sécurité `LOTO` & Journal d'Audit** | ✅ Toujours actifs | ✅ Toujours actifs | ✅ Toujours actifs |

---

## 4. Comment Changer de Mode en Toute Sécurité ?

1. Connectez-vous avec votre compte **Administrateur** (`@admin`).
2. Ouvrez **Paramètres ➔ Sécurité & Comptes**.
3. Repérez la carte **Modes d'Exploitation & Profil d'Espace de Travail**.
4. Cliquez sur **Activer Solo Expert** (ou **Activer Équipe Complète** pour revenir au mode initial).
5. Un badge discret **SOLO EXPERT** apparaît alors dans la barre supérieure pour vous rappeler le mode actif ; cliquez dessus à tout moment pour revenir rapidement au réglage.
6. Si vous souhaitez conserver un module habituellement masqué (par exemple les *Blueprints* ou *Stock Articles*), cochez simplement son interrupteur dans **Projection Modulaire de la Navigation**.
