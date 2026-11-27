---
id: page-dev-settings-workspace-modes
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: architecture
audience: developer
tabId: settings_workspace_modes
title: Spécification Technique — WorkspaceProfile, Projection UI & Gouvernance SOLO_DIRECT
summary: Architecture du SSOT STORAGE_KEYS.WORKSPACE_PROFILE, garde fail-closed isSoloDirectAllowedForActor, projection dynamique des menus sans perte de routes, synchronisation GMAO_Data/config/system_flags.json et BOM Tier 2 directe sans Blueprint.
relatedTabs:
  - settings_workspace_modes
  - settings_admin
  - machines
---

# 💻 Spécification Développeur : Modes d'Exploitation (`#settings_workspace_modes`)

> **Public :** Architectes Logiciels, Développeurs Core & Auditeurs Sécurité.  
> **Source de vérité (`SSOT`) :** `src/core/workspace/workspaceProfile.ts`, `STORAGE_KEYS.WORKSPACE_PROFILE` (`gmao_workspace_profile_v1`).  
> **Composant UI :** `src/presentation/pages/settings/components/WorkspaceModeSelectorCard.tsx` (monté dans `SettingsAdminTab.tsx`).  
> **Persistance Disque Local :** `config/system_flags.json` (`folderStructure.ts` & `folderDataSerializer.ts` — conserve exactement 29 fichiers canoniques).  
> **Garde RBAC :** `settings.manage` **ET** `users.manage` (`ADMIN` uniquement).

---

## 1. Contrat de Données (`WorkspaceProfile`)

```ts
export type WorkspacePreset = 'TEAM_FULL' | 'SOLO_EXPERT' | 'SOLO_LIGHT';
export type WorkspaceGovernanceMode = 'TEAM_MAKER_CHECKER' | 'SOLO_DIRECT';
export type WorkspaceUiComplexity = 'FULL' | 'LIGHT';

export interface WorkspaceModuleVisibility {
  showFinance: boolean;
  showStockInventory: boolean;
  showBlueprintsInPrimaryNav: boolean;
  showTeamManagement: boolean;
}
```

- **Valeur par défaut (`DEFAULT_WORKSPACE_PROFILE`) :** `TEAM_FULL` avec `governanceMode: 'TEAM_MAKER_CHECKER'` et les 4 drapeaux de `moduleVisibility` à `true` (garantit 100 % de rétrocompatibilité avec les installations existantes et tous les tests unitaires).
- **Verrouillage strict de `SOLO_LIGHT` :**
  - `WORKSPACE_PRESET_DEFINITIONS.SOLO_LIGHT` porte `enabled: false, status: 'COMING_SOON'`.
  - `applyWorkspacePreset('SOLO_LIGHT')` retourne `{ ok: false, profile, error }`.
  - `normalizeWorkspaceProfile(raw)` rejette toute valeur `SOLO_LIGHT` injectée manuellement dans le stockage ou un fichier `system_flags.json` et la ramène automatiquement vers `TEAM_FULL`.

---

## 2. Projection de Navigation Non Destructive (`isTabVisibleInWorkspace`)

La projection agit **uniquement sur la couche de présentation** (`FloatingSidebar.tsx`, `MobileSidebarDrawer.tsx`, `Header.tsx`, `appearanceBootstrap.ts`) sans jamais supprimer de route dans `AppRouter` ni altérer le store Zustand :

| Drapeau | Onglets / contrôles projetés ou masqués |
| :--- | :--- |
| `moduleVisibility.showFinance === false` | Masque `finance` dans la navigation + masque coûts/TCO/pertes horaires dans `ZonesView`, `EquipmentView`, `MachinesRegisteredView`, `MachinePassport360Modal` et `Entrepôt` (`requireHourlyCost: false`). |
| `moduleVisibility.showStockInventory === false` | Masque `stock` (`sortie` et les catalogues `pdr_groups`, `types`, `designations` restent accessibles). |
| `moduleVisibility.showBlueprintsInPrimaryNav === false` | Masque `blueprints` uniquement (`families`, `templates`, `machines` et `nexus` restent **toujours** visibles dans le même ordre hiérarchique). |
| `moduleVisibility.showTeamManagement === false` | **Ne masque PAS `#utilisateurs`** (`isTabVisibleInWorkspace('utilisateurs') === true`) : bascule `UtilisateursView` en mode **Équipe Terrain & Techniciens** (masque la colonne `Accès GMAO`, la modale mot de passe/RBAC, l'onboarding auth et les filtres `NO_ACCOUNT`/`NO_PASSWORD`/`DISABLED`) et rend le champ `Technicien` optionnel dans les alertes `Fiches Incomplètes` (`requireTechnician: false`). |
| `governanceMode === 'SOLO_DIRECT'` | Masque `validation_center` + `canViewMakerCheckerValidation()` retourne `false`. |

Lorsque le parent `Stock PDR` est cliqué dans `FloatingSidebar.tsx` en mode `SOLO_EXPERT`, `handleSelectParent` sélectionne le premier enfant autorisé **et** visible dans le profil actif (`sortie`) au lieu de forcer `stock`. Les écrans `zones`, `utilisateurs` et `equipment` demeurent toujours visibles dans la navigation.

---

## 3. Garde Fail-Closed de Gouvernance (`SOLO_DIRECT`)

La fonction `isSoloDirectAllowedForActor(actorRole)` dans `src/core/workspace/workspaceProfile.ts` applique un **ET logique strict** :

```ts
export function isSoloDirectAllowedForActor(actorRole: unknown): boolean {
  const profile = loadWorkspaceProfile();
  if (profile.governanceMode !== 'SOLO_DIRECT') return false;
  return String(actorRole || '').trim().toUpperCase() === 'ADMIN';
}
```

- **Intégration dans `storeBootstrapSlice.ts` :** `isMakerCheckerSelfApproval(creator, validator, actorRole)` retourne `false` uniquement si `isSoloDirectAllowedForActor(effectiveRole)` est vrai.
- **Intégration dans les 3 tranches transactionnelles (`correctiveSlice.ts`, `preventiveSlice.ts`, `stockSlice.ts`) :**
  - Passent `resolvedValidatorRole` à `isMakerCheckerSelfApproval`.
  - Ajoutent `executionMode: 'SOLO_DIRECT'` dans le champ `after` des événements d'audit `VALIDATION_APPROVED` lorsque l'approbation s'exécute en mode direct.
- **Invariants préservés :** `lotoService.ts`, `isSystemGeneralMachine()`, `hasBlockingNeedRequestForIntervention()`, `getLinkedWorkshopOrdersForIntervention()`, `IncrementalStockIndex` et `StockCalculationService` ne sont **jamais** contournés.

---

## 4. Rattachement Direct Tier 2 BOM Sans Blueprint

Dans `src/presentation/pages/machines/components/MachinePassport360Modal.tsx` (onglet `BOM`) :
- Pour toute machine de production (`assetClass !== 'SYSTEM_GENERAL'`), un formulaire intégré permet d'appeler directement `useGmaoStore.getState().addMachineElement(...)` (écrit dans `STORAGE_KEYS.MACHINE_BOM` + journalise `MACHINE_BOM_ELEMENT_ADDED`), même lorsque `machine.id_blueprint` est vide.
- Pour un équipement `SYSTEM_GENERAL`, le formulaire est masqué, un avertissement explicite est affiché, et la garde `isSystemGeneralMachine` côté store demeure active.

---

## 5. Couverture de Tests Automatisés

- `src/tests/unit/WorkspaceProfileSoloExpert.test.tsx` :
  - Rétrocompatibilité `TEAM_FULL` par défaut.
  - Bascule réversible `TEAM_FULL ⇄ SOLO_EXPERT` et rejet strict de `SOLO_LIGHT`.
  - Projection de navigation (`isTabVisibleInWorkspace`, `canViewMakerCheckerValidation`).
  - Garde fail-closed `SOLO_DIRECT` (autorisé `ADMIN`, refusé `TECHNICIEN` / `RESPONSABLE_MAINTENANCE` / `VIEWER` / vide) + estampillage `executionMode: 'SOLO_DIRECT'` dans `AUDIT_EVENTS`.
  - Sérialisation/hydratation bidirectionnelle `config/system_flags.json` (29 fichiers canoniques préservés).
  - Ajout direct Tier 2 BOM dans `MachinePassport360Modal` sans Blueprint + blocage `SYSTEM_GENERAL`.
  - UI `WorkspaceModeSelectorCard` (`SOLO_LIGHT` verrouillé) & route Guide `settings_workspace_modes`.
