---
id: page-user-utilisateurs
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance, Validation Maker-Checker & Système
docType: page
audience: user
tabId: utilisateurs
title: Gestion des Utilisateurs, Équipe Terrain & Habilitations
subtitle: Annuaire des techniciens/opérateurs/responsables, suivi de charge, transfert de charge en 1 clic et gestion des comptes RBAC
summary: Guide d'utilisation complet pour les administrateurs et responsables maintenance en mode Équipe Complète (TEAM_FULL) et Solo Expert (SOLO_EXPERT). Explique l'annuaire terrain, la charge de travail, le transfert de charge en 1 clic, la création de comptes RBAC en 1 étape et la désactivation douce (Soft Archive).
relatedTabs:
  - zones
  - equipment
  - machines
  - settings_admin
  - validation_center
---

# 👥 Guide Utilisateur : Utilisateurs & Équipe Terrain (`#utilisateurs`)

> **Module :** Pilotage & Gouvernance (Référentiels d'Usine)  
> **Identifiant d'accès :** `#utilisateurs`  
> **Public cible :** Administrateurs GMAO, Responsables Maintenance (`TEAM_FULL`), Ingénieurs Terrain pilotant une équipe de techniciens (`SOLO_EXPERT`).

---

## 1. Rôle et Double Vocation de cet Écran

L'écran **Utilisateurs & Habilitations** (rebaptisé **Équipe Terrain & Techniciens** en mode `SOLO_EXPERT`) combine deux fonctions complémentaires :
1. **Annuaire Opérationnel du Personnel (Actif en `TEAM_FULL` ET en `SOLO_EXPERT`) :**
   - **Techniciens (`TECH-xx`) :** Mécaniciens, électromécaniciens, automaticiens, frigoristes assignés aux machines, utilités, BT correctifs et gammes préventives.
   - **Opérateurs (`OP-xx`) :** Conducteurs de ligne rattachés aux zones d'atelier et déclarants de Demandes d'Intervention (`DI`).
   - **Responsables (`RESP-xx`) :** Encadrement opérationnel typé par modèles de fonction (`RMT` Maintenance, `RZN` Zone, `RPD` Production, `RMG` Magasin).
   - **Suivi de Charge & Transfert en 1 Clic :** Mesure en direct des machines assignées, BT ouverts, tâches PM actives, alertes de surcharge (`Surchargés`) et réaffectation propre vers un autre technicien en cas d'absence ou de départ.
2. **Comptes de Connexion & Sécurité RBAC (Actifs en `TEAM_FULL`, masqués par défaut en `SOLO_EXPERT`) :**
   - Attribution des identifiants de connexion, mots de passe sécurisés, rôles système et activation/désactivation des accès individuels.

---

## 2. Tableau de Bord KPI & Filtres Rapides

Les **4 cartes KPI cliquables** filtrent instantanément la grille par profil :
1. **Total Membres Actifs** : Effectif global actif avec compteur discret des profils archivés.
2. **Techniciens Actifs** : Équipe d'intervention Préventif & Correctif.
3. **Opérateurs Actifs** : Équipe terrain de production (signalement DI).
4. **Responsables Actifs** : Cadres de gouvernance (`RMT • RZN • RPD • RMG`).

### Pastilles de Filtrage Rapide
- **Toujours visibles (`TEAM_FULL` & `SOLO_EXPERT`) :** `Tous`, `Actifs`, `Surchargés` (si au moins un membre dépasse le seuil de charge), et `Archivés`.
- **Spécifiques au multi-comptes (`TEAM_FULL` uniquement) :** `Sans accès`, `Sans MDP` (alerte rouge si un compte actif n'a pas encore de mot de passe configuré), et `Désactivés`.

---

## 3. Décryptage des Rôles Système (`TEAM_FULL`)

Lors de l'activation d'un compte de connexion GMAO en mode `TEAM_FULL`, chaque utilisateur reçoit un **Rôle RBAC** strict :

1. 👑 **Administrateur (`ADMIN`) :** Accès intégral, paramétrage de l'usine, modes d'exploitation, sauvegardes et gestion des comptes.
2. 🛠️ **Responsable Maintenance (`RESPONSABLE_MAINTENANCE`) :** Planning préventif, validation `Maker-Checker`, pilotage des BT, coûts et parc machines.
3. 📦 **Responsable Magasin (`RESPONSABLE_MAGASIN`) :** Gestion des articles PDR, inventaires, commandes fournisseurs (PO) et validation des sorties magasin.
4. 🔧 **Technicien (`TECHNICIEN`) :** Consultation du parc, exécution des interventions avec chronomètre Live, rapports préventifs/correctifs et proposition de pièces.
5. 🏭 **Opérateur (`OPERATEUR`) :** Déclaration rapide des pannes (`DI`) sur ses zones et suivi d'avancement.
6. 👁️ **Observateur (`VIEWER`) :** Lecture seule des tableaux de bord, rapports clôturés et indicateurs sans droit d'écriture.

---

## 4. Procédures Opérationnelles Clés

### A. Créer un Nouveau Membre (avec Onboarding Accès en 1 Étape en `TEAM_FULL`)
1. Cliquez sur le bouton **« + Nouvel Utilisateur / Technicien »** en haut à droite.
2. Sélectionnez le **Profil** (`TECHNICIEN`, `OPERATEUR` ou `RESPONSABLE`) : le matricule séquentiel (`TECH-01`, `OP-01`, `RESP-01`) est proposé automatiquement.
3. Renseignez le **Nom complet**, la **Spécialité** (pour un technicien) ou les **Modèles de responsabilité (`RMT/RZN/RPD/RMG`)**, et la/les **Zone(s) d'affectation** (avec raccourci pour créer une nouvelle zone à la volée).
4. **En mode `TEAM_FULL` uniquement (Administrateur) :** Cochez l'option **« Créer immédiatement un compte de connexion GMAO »** pour définir l'identifiant, le rôle RBAC et le **mot de passe sécurisé** (*minimum 8 caractères, dont au moins 1 lettre et 1 chiffre*) dans le même formulaire.
5. Enregistrez.

### B. Transférer la Charge d'un Technicien en 1 Clic (`Transfert de Charge`)
Lorsqu'un technicien part en congé, change de secteur ou quitte l'entreprise :
1. Cliquez sur l'icône **Transfert de Charge (`⇄`)** sur la ligne du technicien concerné.
2. Choisissez le **Technicien Remplaçant** actif dans la liste déroulante.
3. Sélectionnez les périmètres à transférer (cochés par défaut) :
   - **Machines & Utilités actives assignées**
   - **Bons de Travail (`BT`) correctifs encore ouverts**
   - **Tâches Préventives (`PM`) actives**
4. Confirmez : la réaffectation s'applique instantanément. **L'historique des BT déjà clôturés et des machines archivées n'est jamais altéré**, garantissant la fidélité des audits.

### C. Gérer les Accès de Connexion (`TEAM_FULL` uniquement)
- Depuis la colonne **Accès GMAO** (icône Clé / Cadenas), l'administrateur peut créer un accès, réinitialiser le mot de passe (politique ≥ 8 caractères, 1 lettre, 1 chiffre), changer le rôle RBAC ou activer/désactiver le compte en 1 clic (dans le respect du quota de licence actif).

### D. Désactivation Douce (`Soft Archive`) vs Suppression
Dans une GMAO industrielle, **on ne détruit jamais un membre ayant un historique d'interventions** :
- Utilisez l'**Archivage Sécurisé (`Archiver`)** pour un membre ayant déjà travaillé sur des BT, PM ou mouvements. Il disparaît des listes de nouvelle assignation (et son compte GMAO est désactivé), mais tout son historique reste intact et consultable via le filtre **Archivés**, avec possibilité de **Restaurer** à tout moment.
- La suppression définitive reste réservée aux fiches vierges créées par erreur (sans aucune dépendance).

---

## 5. Utilisation en Mode `TEAM_FULL` vs Mode `SOLO_EXPERT`

> **Pourquoi cet écran reste-t-il toujours visible en `SOLO_EXPERT` ?**  
> Même lorsqu'une seule personne pilote la GMAO depuis le compte `@admin` sans créer de comptes multi-utilisateurs, elle coordonne souvent des **techniciens de terrain** et doit pouvoir leur affecter des machines, des utilités, des BT ou des gammes préventives, suivre leur charge et réaffecter leurs missions en cas d'absence.

| Fonctionnalité | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Équipe Terrain & Techniciens) |
| :--- | :--- | :--- |
| **Titre & Badge** | *Utilisateurs & Habilitations* | *Équipe Terrain & Techniciens* + badge **`SOLO EXPERT`** |
| **Annuaire `TECH / OP / RESP` & Zones** | ✅ Complet | ✅ **Complet à l'identique** |
| **Suivi de Charge & Alerte `Surchargés`** | ✅ Actif (Machines, BT ouverts, PM actives) | ✅ **Actif à l'identique** |
| **Transfert de Charge en 1 Clic (`⇄`)** | ✅ Actif | ✅ **Actif à l'identique** |
| **Soft Archive / Restauration** | ✅ Actif | ✅ **Actif à l'identique** |
| **Colonne `Accès GMAO`, Modale MDP & Onboarding Auth** | ✅ Actifs (création/réinitialisation comptes RBAC) | 🙈 **Masqués** (`showTeamManagement: false` — aucun bruit multi-comptes) |
| **Filtres `Sans accès`, `Sans MDP`, `Désactivés`** | ✅ Visibles | 🙈 **Masqués automatiquement** |
| **Export Excel (Type B)** | Inclut la colonne `Accès GMAO`. | Exporte l'annuaire opérationnel sans la colonne `Accès GMAO`. |

> **Bascule réversible :** Si votre atelier passe un jour en mode multi-utilisateurs (`TEAM_FULL`), tous vos techniciens déjà créés en `SOLO_EXPERT` sont immédiatement prêts : il vous suffit d'activer leurs comptes de connexion depuis la colonne **Accès GMAO** (ou de réactiver l'interrupteur *Comptes & Accès Multi-Utilisateurs* dans *Paramètres ➔ Sécurité & Comptes*).
