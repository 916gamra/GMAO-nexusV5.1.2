---
id: page-catalogue-correctif
groupId: 04-corrective-di-bt
groupTitle: Maintenance Corrective (DI / BT & Clôture)
docType: page
audience: user
tabId: corrective_referentiel
title: Catalogue des Données & Référentiel Correctif
subtitle: Normalisation des pannes (M/E/P/H/A), travaux standards, matrice Symptôme ➔ Action, gestion de l'équipe d'intervenants et création directe de DI en 1 clic
summary: Guide d'administration et d'utilisation du Référentiel Correctif (#corrective_referentiel) en TEAM_FULL et SOLO_EXPERT. Détaille les 4 piliers du catalogue, le déclenchement direct de DI pré-remplies avec inférence automatique de catégorie, la protection des données techniciens et la gouvernance RBAC.
relatedTabs:
  - corrective_di
  - corrective_bt
  - utilisateurs
---

# 📖 Guide Utilisateur : Catalogue des Données & Référentiel Correctif (`#corrective_referentiel`)

> **Module :** Maintenance Corrective (`v5.1.2`)  
> **Identifiant d'accès :** `#corrective_referentiel` (vue dédiée *Catalogue Données* ou sous-onglet *Référentiel* dans la Maintenance Corrective)  
> **Public cible :** Responsables Méthodes, Superviseurs de Maintenance, Administrateurs (`TEAM_FULL`) et Ingénieurs Maintenance autonomes gérant leur équipe terrain (`SOLO_EXPERT`).

---

## 1. Rôle et Objectif

Le **Catalogue des Données Correctives** normalise le vocabulaire technique de l'usine pour garantir des diagnostics homogènes, accélérer la saisie terrain et fiabiliser les statistiques **Pareto 80/20**.

Il s'articule autour de **4 onglets complémentaires** et intègre un **pont d'action directe (`STORAGE_KEYS.CORRECTIVE_DI_PRESET`)** permettant de déclencher une **Demande d'Intervention (`DI`) pré-remplie en 1 clic** depuis n'importe quelle entrée du catalogue.

---

## 2. Les 4 Onglets du Référentiel & Création Directe de `DI` en 1 Clic

### 2.1 Onglet 1 : Catalogue des Pannes & Symptômes (`PannesCatalogTab`)
- Classe les modes de défaillance par catégorie normalisée :
  - **`M` — Mécanique :** Vibrations anormales, échauffement palier, grippage, rupture courroie, jeu excessif.
  - **`E` — Électrique :** Disjonction, coupure phase, défaut d'isolement, claquage variateur.
  - **`P` — Pneumatique :** Fuite d'air, chute de pression réseau, distributeur bloqué.
  - **`H` — Hydraulique :** Fuite d'huile, cavitation pompe, colmatage filtre, vérin lent.
  - **`A` — Automatisme & Détection :** Défaut capteur inductif/optique, perte bus automate, décalage codeur.
- **Action rapide `+ DI` :** Cliquez sur **`+ DI`** sur n'importe quelle panne pour basculer vers `#corrective_di` et ouvrir immédiatement la fenêtre de création avec le **Type de panne** et l'**Anomalie** pré-remplis.

### 2.2 Onglet 2 : Travaux Standards (`TravauxStandardTab`)
- Bibliothèque des modes opératoires de réparation validés (ex. *« Remplacement roulement et contrôle alignement laser »*, *« Purge circuit hydraulique et remplacement joint »*).
- **Action rapide `+ DI` :** Cliquez sur **`+ DI`** en face d'une tâche standard pour ouvrir une nouvelle `DI` avec le champ **Travail demandé (`travail_a_faire`)** pré-rempli.

### 2.3 Onglet 3 : Matrice Symptôme ➔ Actions Recommandées (`MatricesActionsTab`)
- Associe chaque symptôme de panne à une ou plusieurs actions correctives types recommandées par l'ingénierie.
- **Action rapide `Créer DI` avec Inférence Automatique :** Cliquez sur **`Créer DI`** sur une action de la matrice :
  - Le système **déduit automatiquement la catégorie technique (`M`, `E`, `P`, `H`, `A`)** du symptôme parent à partir du catalogue, pré-remplit le **Symptôme (`anomalie`)** ainsi que l'**Action recommandée (`travail_a_faire`)**, et ouvre la modale de création `DI`.

### 2.4 Onglet 4 : Équipe & Intervenants (`EquipeIntervenantsTab`)
- Répertoire opérationnel des techniciens de maintenance rattaché au SSOT (`STORAGE_KEYS.TECHNICIANS`) :
  - **Génération d'identifiant anti-collision :** chaque nouveau technicien reçoit automatiquement un matricule unique **`TECH-XX`** calculé sur le maximum existant (`maxNumericId + 1`), évitant tout doublon après suppression ou archivage.
  - **Préservation Intégrale du Profil (`C4`) :** la modification d'un technicien depuis ce catalogue préserve 100 % de ses attributs SSOT (`id_zone_assignee`, `charge_actuelle`, `competences`, `taux_horaire`, `telephone`, `email`, `is_active`).
  - **Action rapide `Affecter DI` :** cliquez sur **`Affecter DI`** sur la fiche d'un technicien actif pour ouvrir directement une nouvelle `DI` pré-assignée à cet intervenant.

---

## 3. Sécurité RBAC & Gouvernance (`TEAM_FULL` vs `SOLO_EXPERT`)

| Action dans le Catalogue | `VIEWER` / `MAGASINIER` | `OPERATEUR` / `TECHNICIEN` | `RESPONSABLE_MAINT` / `ADMIN` (`TEAM_FULL` & `SOLO_EXPERT`) |
| :--- | :---: | :---: | :---: |
| **Consulter les 4 onglets & rechercher** | ✅ | ✅ | ✅ |
| **Déclencher une DI pré-remplie (`+ DI` / `Créer DI` / `Affecter DI`)** | ❌ (Masqué) | ✅ (`canCreateDi`) | ✅ (`canCreateDi`) |
| **Ajouter / Modifier / Supprimer Pannes, Travaux, Matrices & Techniciens** | ❌ (Masqué) | ❌ (Masqué — `canManageCatalog = false`) | ✅ (CRUD Complet — `canManageCatalog = true`) |
| **Import / Export JSON & Excel du Référentiel** | ❌ | ❌ | ✅ |

> **Astuce `SOLO_EXPERT` (Pilotage Rapide de votre Équipe Terrain) :**  
> En mode `SOLO_EXPERT`, utilisez l'onglet **Matrice Symptôme ➔ Actions** ou **Équipe & Intervenants** comme **console de dispatch rapide** : en 1 clic sur **`Créer DI`** puis **`Créer BT & Démarrer Live ⚡`**, vous générez un Bon de Travail normalisé, assigné au bon technicien terrain avec la consigne technique exacte, sans aucune ressaisie manuelle.
