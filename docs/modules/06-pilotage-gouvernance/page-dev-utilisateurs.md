---
id: page-dev-utilisateurs
groupId: 06-pilotage-gouvernance
groupTitle: Pilotage, Finance, Validation Maker-Checker & Système
docType: architecture
audience: developer
tabId: utilisateurs
title: Spécification Technique — Utilisateurs, Charge Terrain, RBAC & Projection SOLO_EXPERT
summary: Architecture complète de l'annuaire personnel et de la sécurité RBAC : AuthorizationService fail-closed, PersonnelWorkloadService, réaffectation atomique reconcileTechnicianReassignment, politique mot de passe & PBKDF2/AES-GCM, LicenseGateService et projection showTeamManagement en SOLO_EXPERT.
relatedTabs:
  - utilisateurs
  - zones
  - equipment
  - settings_admin
  - validation_center
---

# 💻 Spécification Développeur : Utilisateurs, Charge & Sécurité RBAC (`#utilisateurs`)

> **Public :** Ingénieurs Sécurité, Développeurs Core & Auditeurs.  
> **Composants sources :** `src/presentation/pages/utilisateurs/UtilisateursView.tsx`, `src/presentation/pages/utilisateurs/components/UtilisateursModals.tsx`, `src/presentation/pages/utilisateurs/AddUserModal.tsx`  
> **Services domaine :** `src/application/services/PersonnelWorkloadService.ts`, `src/application/services/ZoneEquipmentPhaseCService.ts` (`reconcileTechnicianReassignment`), `src/domain/users/responsableTemplates.ts`  
> **Sécurité & Auth :** `src/core/security/AuthorizationService.tsx`, `src/core/security/AuthService.ts`, `src/core/security/LicenseGateService.ts`, `src/context/AuthContext.tsx`, `src/utils/vaultService.ts`  
> **Clés SSOT :** `STORAGE_KEYS.TECHNICIENS`, `STORAGE_KEYS.OPERATIONS`, `STORAGE_KEYS.USERS`, `STORAGE_KEYS.AUDIT_EVENTS`.

---

## 1. Modèle d'Autorisation Fail-Closed (`AuthorizationService.tsx`)

Le contrôle d'accès applique le principe **Least Privilege & Fail-Closed** :

```text
Requête PermissionGate(permission)
  ├── Utilisateur non authentifié ──────────────────► REFUS (false)
  └── Authentifié ──► normalizeRole(user.role)
        ├── Permission absente de PERMISSIONS ──────► REFUS (false)
        └── Rôle dans PERMISSIONS[permission] ?
              ├── OUI ──► AUTORISÉ (true)
              └── NON ──► REFUS (false)
```

| Rôle Canonique | Périmètre & Droits Autorisés |
| :--- | :--- |
| **`ADMIN`** | Droits complets : configuration usine, modes d'exploitation, comptes utilisateurs, sauvegardes et audit. |
| **`RESPONSABLE_MAINTENANCE`** | Approbation `Maker-Checker`, budget, planning préventif, BT correctifs et parc machines/utilités. |
| **`RESPONSABLE_MAGASIN`** | Catalogue PDR, inventaires, commandes fournisseurs (`PO`) et validation des sorties magasin. |
| **`TECHNICIEN`** | Exécution terrain : chronomètre Live, saisie des rapports curatifs/préventifs et propositions PDR (Maker). |
| **`OPERATEUR`** | Émission de Demandes d'Intervention (`DI`) et suivi sur ses zones d'affectation. |
| **`VIEWER`** | Lecture seule stricte sur les tableaux de bord, rapports et indicateurs. |

---

## 2. Annuaire Unifié, Charge & Transfert de Charge en 1 Clic

### 2.1 Fusion Personnel & Templates Responsables
- `UtilisateursView.tsx` consolide `technicians` (`TECH-xx`) et `operations` (`OP-xx` & `RESP-xx` portant `template_ids`: `RMT`, `RZN`, `RPD`, `RMG` via `responsableTemplates.ts`).
- `computePersonnelWorkload` (`PersonnelWorkloadService.ts`) calcule en temps réel par membre :
  - Machines/utilités actives assignées, BT ouverts, tâches PM actives, exécutions et sorties externes.
  - Indicateur de surcharge (`Surchargés`) et compteurs globaux (`totalActive`, `archivedCount`, `missingPasswordCount`, `disabledAccessCount`).

### 2.2 Réaffectation Atomique (`reconcileTechnicianReassignment`)
Implémentée dans `src/application/services/ZoneEquipmentPhaseCService.ts` et orchestrée par `useAppComplexHandlers.ts` :
- Transfère sélectivement selon les drapeaux `includeMachines`, `includeOpenBts`, `includeActivePm` :
  - **Machines actives uniquement** (les machines archivées sont ignorées).
  - **Interventions correctives ouvertes et non rejetées uniquement** (les BT dans `CLOSED_BT_STATUSES` restent immuables pour l'audit).
  - **Tâches préventives actives uniquement** (les gammes `SUSPENDUE` / `ARCHIVEE` restent intactes).
- Journalise un événement d'audit dédié dans `AUDIT_EVENTS`.

---

## 3. Sécurité des Comptes, Onboarding & Cryptographie

1. **Onboarding Auth en 1 Étape (`onboardingAccess`) :**
   - En mode `TEAM_FULL` (`showAccountControls && isAdmin`), la modale de création permet de créer simultanément la fiche personnel ET son compte de connexion via `upsertPersonnelAuthAccount`.
2. **Politique de Mot de Passe (`validatePasswordPolicy`) :**
   - Exige au minimum **8 caractères**, au moins **1 lettre** et **1 chiffre** lors de toute première activation ou réinitialisation.
3. **Hachage & Coffre-Fort :**
   - Mots de passe hachés côté client via WebCrypto (`crypto.subtle` — PBKDF2/SHA-256 + sel aléatoire `getRandomValues`). Aucun mot de passe n'est jamais persisté en clair.
   - Coffre-fort administrateur chiffré en **AES-GCM 256 bits** (`vaultService.ts`), déverrouillé uniquement en mémoire par le Master PIN.
4. **Anti-Bruteforce & Licence :**
   - Verrouillage automatique après **5 échecs consécutifs** pendant **15 minutes** (`MAX_LOGIN_ATTEMPTS = 5`, `LOCKOUT_DURATION_MS = 15 * 60 * 1000`).
   - Contrôle de conformité des sièges actifs via `LicenseGateService`.

---

## 4. Projection `SOLO_EXPERT` (`showTeamManagement`)

Contrairement aux écrans purement finance (`finance`) ou magasin complet (`stock`), l'onglet **`#utilisateurs` n'est JAMAIS retiré de la navigation en `SOLO_EXPERT`** :

- `isTabVisibleInWorkspace('utilisateurs', soloProfile)` retourne **`true`**.
- `const showAccountControls = workspaceProfile.moduleVisibility.showTeamManagement;` (`false` par défaut en `SOLO_EXPERT`, `true` en `TEAM_FULL`) contrôle strictement la couche **multi-comptes & auth** :
  - Masque la colonne `Accès GMAO`, le bouton modale d'accès/mot de passe (`openAccessModal`), la section `onboardingAccess` dans la modale de création et la colonne `Accès GMAO` dans `exportTypeBWorkbook`.
  - Masque et réinitialise automatiquement les filtres `NO_ACCOUNT`, `NO_PASSWORD` et `DISABLED` via `useEffect`.
  - Bascule l'en-tête sur **« Équipe Terrain & Techniciens »** avec badge `SOLO EXPERT`.
  - Préserve intégralement le CRUD personnel, le suivi de charge, le **Transfert de Charge (`reconcileTechnicianReassignment`)** et le **Soft Archive / Restauration**.
