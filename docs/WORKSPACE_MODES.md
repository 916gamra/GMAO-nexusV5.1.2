# 🧭 Modes d'Exploitation & Profils d'Espace de Travail (`WORKSPACE_MODES.md`)

> **Statut :** Implémenté (Phase 1 — `SOLO-EXPERT-P1`)  
> **Source de Vérité (`SSOT`) :** `STORAGE_KEYS.WORKSPACE_PROFILE` (`gmao_workspace_profile_v1`) + `src/core/workspace/workspaceProfile.ts`  
> **Synchronisation Disque Local (`GMAO_Data/`) :** `config/system_flags.json` (`workspaceProfile`)  
> **Écran de configuration :** *Paramètres ➔ Sécurité & Comptes* (`WorkspaceModeSelectorCard.tsx`)

---

## 1. Philosophie Fondamentale : Un Seul Moteur Industriel, Trois Projections d'Usage

**CIOB GMAO Nexus** repose sur un principe architectural unique : **ne jamais forker ni appauvrir le noyau industriel**, mais projeter la navigation et la gouvernance selon la réalité opérationnelle de l'atelier.

Dans l'industrie réelle, un même moteur GMAO sert trois profils très différents :
1. **L'Usine Structurée Multi-Rôles (`TEAM_FULL`)** — où les responsabilités sont séparées entre Opérateurs, Techniciens, Magasinier, Responsable Maintenance et Direction Financière.
2. **L'Ingénieur ou Technicien de Maintenance Autonome (`SOLO_EXPERT`)** — un expert terrain qui gère seul ses machines, ses organes (`Components` & `Parts`), ses interventions correctives/préventives, ses ateliers mécaniques et ses demandes d'achat, sans vouloir subir la bureaucratie d'une validation croisée ou la gestion comptable/magasinier.
3. **Le Technicien Terrain Simplifié (`SOLO_LIGHT` — En conception)** — futur profil ultra-allégé dédié aux petites structures ou au dépannage rapide sans ingénierie lourde.

> **Règle d'or absolue (Garantie Zéro Perte) :**  
> Le choix d'un mode d'exploitation **ne supprime jamais aucune donnée du SSOT** (`machines`, `mouvements`, `rawStock`, `blueprints`, `finance`, `utilisateurs`, `auditEvents`). Changer de mode entre `TEAM_FULL` et `SOLO_EXPERT` est **instantané, non destructif et 100 % réversible**.

---

## 2. Présentation Détaillée des 3 Modes

### Mode 1 — Équipe Complète (`TEAM_FULL`) — *Actif par défaut*
- **Statut :** ✅ Actif et par défaut.
- **Public cible :** Usines industrielles, équipes multi-postes, services maintenance avec magasin PDR dédié et direction financière.
- **Gouvernance :** `TEAM_MAKER_CHECKER` (séparation stricte des pouvoirs `VAL-1..VAL-5` : le créateur d'un BT ou d'une demande de sortie ne peut jamais s'auto-valider ; les mouvements restent en `PENDING_VALIDATION` jusqu'au contrôle superviseur).
- **Périmètre visible :** 100 % des modules (Dashboard, Centre de Validation, Finance & Budgets ISO 4217, Stock Magasin complet, Parc Machines 3-Tiers avec Familles/Modèles/Blueprints, Préventif & Compteurs, Correctif DI/BT/Atelier/Besoins, Entrepôt Organes/Parts, Nexus, Zones, Utilisateurs & RBAC, Système Général).
- **Bénéfices clés :**
  - Contrôle interne et conformité d'audit multi-acteurs.
  - Pilotage financier complet (Budgets, TCO, BER, PO fournisseurs).
  - Standardisation par Familles, Modèles constructeurs et Blueprints cognitifs sur flottes homogènes.

---

### Mode 2 — Solo Expert (`SOLO_EXPERT`) — *Actif & Basculable*
- **Statut :** ✅ Actif (bascule instantanée avec `TEAM_FULL` depuis *Paramètres ➔ Sécurité & Comptes*).
- **Public cible :** Ingénieur maintenance terrain, responsable technique autonome, chef d'atelier polyvalent qui exécute, suit et rapporte lui-même ses interventions.
- **Gouvernance :** `SOLO_DIRECT` (**fail-closed** : autorise l'exécution/clôture directe uniquement pour un utilisateur authentifié de rôle vérifié `ADMIN` ; tout autre rôle `TECHNICIEN`, `RESPONSABLE_MAINTENANCE`, `OPERATEUR`, `VIEWER` reste bloqué en `TEAM_MAKER_CHECKER`). Chaque action directe est explicitement estampillée `executionMode: 'SOLO_DIRECT'` dans le journal d'audit immuable `AUDIT_EVENTS`.
- **Périmètre projeté par défaut (ajustable à la carte) :**
  - **Mis au premier plan :** Parc Machines hiérarchique complet (`families` ➔ `templates` ➔ `machines`), Passeport 360° & BOM directe sans Blueprint obligatoire, Préventif, Compteurs & CBM terrain (`preventive`, `preventive_referentiel` avec dispatch techniciens, impression `OT/LOTO` et tableau *Charge & Performance par Technicien*), Correctif complet (`DI`, `BT`, `Live`, `Besoins`, `Atelier Mécanique BR/RECT`, `Clôture`, `Pareto`), Entrepôt Organes & Pièces (`entrepot`, `comp_*`, `part_*`), Journal de retrait PDR (`sortie`), Arborescence `Nexus`, `Zones`, `Équipe Terrain & Techniciens` (`utilisateurs` sans multi-comptes), `Équipements Système Général`, Rapports d'exploitation & MTTR/MTBF.
  - **Masqué par défaut de la navigation principale (sans aucune suppression) :** Finance & Budgets (`finance`), Inventaire Magasin (`stock` — tout en conservant `sortie` et les catalogues PDR), Centre de Validation (`validation_center`), Contrôles multi-comptes RBAC (`showTeamManagement: false`, tout en gardant visible l'annuaire Équipe Terrain), Blueprints Machine Tier 3 (`blueprints`).
  - **Personnalisation fine :** 4 interrupteurs modulaires permettent de réafficher individuellement *Finance*, *Inventaire Stock*, *Blueprints Machine (Tier 3)* ou *Comptes & Accès Multi-Utilisateurs* même en restant en `SOLO_EXPERT`.
- **Bénéfices clés :**
  - **Zéro friction terrain :** un seul ingénieur crée, exécute, consomme ses pièces, suit son atelier mécanique et ses besoins d'achat, puis clôture avec des statistiques MTTR/MTBF/heures de travail exactes.
  - **Hiérarchie Parc préservée & Tier 2 autonome (Blueprint non bloquant) :** la classification `Familles ➔ Templates ➔ Machines Registered` fonctionne à l'identique du mode `TEAM_FULL`, tout en permettant de rattacher directement des `COMPOSANT`, `PART` et `PDR` dans le Passeport 360° (`machineElementsLedger`) sans avoir à créer de `Blueprint`.
  - **Journal de retrait préservé :** la traçabilité des pièces retirées (`Sortie Rapide`) reste active sans imposer la charge d'un inventaire magasinier complet.

---

### Mode 3 — Solo Light (`SOLO_LIGHT`) — *En conception (Verrouillé)*
- **Statut :** 🔒 **Visible dans l'architecture et les Paramètres mais strictement non activable (`enabled: false`, `status: 'COMING_SOON'`)** tant que sa spécification fonctionnelle détaillée n'est pas finalisée.
- **Public cible (vision) :** Petits ateliers, artisans industriels ou opérateurs uniques cherchant un carnet de maintenance simplifié sans hiérarchies complexes.
- **Protection technique :**
  - Bouton désactivé (`disabled` / `aria-disabled="true"`) dans `WorkspaceModeSelectorCard.tsx`.
  - Refusé par `applyWorkspacePreset('SOLO_LIGHT')` et automatiquement ramené à `TEAM_FULL` par `normalizeWorkspaceProfile()` en cas d'altération manuelle du stockage local ou de `config/system_flags.json`.

---

## 3. Matrice Comparative des 3 Modes

| Critère | `TEAM_FULL` (Équipe Complète) | `SOLO_EXPERT` (Ingénieur Terrain) | `SOLO_LIGHT` (En conception) |
| :--- | :---: | :---: | :---: |
| **Statut actuel** | ✅ Actif (Défaut) | ✅ Actif (Basculable) | 🔒 Verrouillé (`Bientôt`) |
| **Gouvernance** | `TEAM_MAKER_CHECKER` | `SOLO_DIRECT` (`ADMIN` seul) | Simplifiée (à définir) |
| **Centre de Validation (`À valider`)** | Affiché & obligatoire | Masqué (exécution directe) | Masqué |
| **Correctif (`DI / BT / Live / Atelier / Besoins`)** | Complet (multi-acteurs) | Complet (cycle autonome 1 personne) | Simplifié (prévu) |
| **Préventif, Compteurs (`Meter PM`) & `CBM Terrain`** | Complet + Coûts + Maker-Checker | Complet (`SOLO_DIRECT`, sans coûts ni Maker-Checker, avec dispatch & bilan techniciens, `OT/LOTO` et `CBM`) | Simplifié (prévu) |
| **Parc Machines (`Familles ➔ Templates ➔ Machines`)** | Complet + Passeport 360° | Complet (identique `ADMIN`) + BOM directe | Simplifié (prévu) |
| **Blueprints Machine (Tier 3)** | Visibles par défaut | Masqués par défaut (optionnels) | Masqués |
| **Entrepôt Organes (`Components` & `Parts`)** | Complet | Complet | Optionnel (à définir) |
| **Journal de Retrait PDR (`Sortie Rapide`)** | Actif | Actif (traçabilité pièces) | Simplifié (prévu) |
| **Inventaire Magasin (`Stock`, `PO`)** | Visible par défaut | Masqué par défaut (réactivable) | Masqué |
| **Finance & Budgets (`ISO 4217`)** | Visible par défaut | Masqué par défaut (réactivable) | Masqué |
| **Équipe Terrain (`Utilisateurs`) & Comptes RBAC** | Annuaire + Comptes RBAC | Annuaire Équipe Terrain actif ; multi-comptes RBAC masqués (réactivables) | Masqué |
| **Audit immuable (`AUDIT_EVENTS`)** | ✅ Toujours actif | ✅ Toujours actif (`SOLO_DIRECT` tracé) | ✅ Toujours actif |
| **Sécurité `LOTO` & `SYSTEM_GENERAL`** | ✅ Toujours actifs | ✅ Toujours actifs | ✅ Toujours actifs |

---

## 4. Lignes Rouges de Sécurité (Invariants Non Négociables)

Activer `SOLO_EXPERT` ne désactive **jamais** les garde-fous de sécurité physique, d'intégrité ou d'audit :
1. **Rôle `ADMIN` strictement exigé (`Fail-Closed`) :** `isSoloDirectAllowedForActor(role)` retourne `true` uniquement si `governanceMode === 'SOLO_DIRECT'` **ET** `role === 'ADMIN'`. Aucun compte `TECHNICIEN`, `RESPONSABLE_MAINTENANCE`, `OPERATEUR` ou `VIEWER` ne peut contourner le Maker-Checker.
2. **Traçabilité d'audit explicite :** Toute validation directe en `SOLO_DIRECT` écrit `executionMode: 'SOLO_DIRECT'` dans le payload `after` de `AUDIT_EVENTS`. Tout changement de mode écrit un événement `WORKSPACE_PROFILE_UPDATED`.
3. **Verrouillage `LOTO` intact :** Le démarrage et l'exécution d'interventions critiques restent soumis aux règles de consignation/déconsignation `lotoService.ts`.
4. **Isolation `SYSTEM_GENERAL` intacte :** Impossible d'attacher des composants BOM de production à un équipement du Système Général, même via l'ajout direct Tier 2 du Passeport 360°.
5. **Anti-clôture prématurée intacte :** Un Bon de Travail (`BT`) ne peut pas être clôturé tant qu'un ordre d'atelier mécanique (`BR / RECT`) ou une demande de besoin bloquante (`NeedRequest`) reste ouvert.
6. **Équation de stock intacte :** `IncrementalStockIndex` et `StockCalculationService` conservent leur formule déterministe unique sans double déduction.

---

## 5. Relation avec les Blueprints (Tier 3)

Dans **CIOB GMAO Nexus**, la machine physique (`Tier 2` — `gmao_machines_v2`) est **architecturalement autonome** :
- Le champ `id_blueprint` sur une machine est **strictement optionnel**.
- Le registre BOM physique (`machineElementsLedger` — `STORAGE_KEYS.MACHINE_BOM`) et les éléments d'entrepôt montés (`warehouseItems`) sont rattachés directement à `id_machine_registered`.
- En `SOLO_EXPERT` (comme en `TEAM_FULL`), l'onglet **BOM & Organes** du Passeport 360° permet désormais d'ajouter directement des `COMPOSANT`, `PART` ou `PDR` sur toute machine de production, même sans `Blueprint` associé.
- Si l'atelier décide plus tard d'industrialiser des machines jumelles, il peut réactiver l'affichage des `Blueprints` sans perdre aucun historique déjà saisi sur ses machines.
