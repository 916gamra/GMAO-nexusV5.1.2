---
id: group-05-entrepot-organes-architecture
groupId: 05-entrepot-organes
groupTitle: Entrepôt Organes & Pièces Détachées
docType: architecture
audience: developer
title: Architecture & Spécifications Techniques — Groupe 05 : Entrepôt Organes & Pièces
summary: Spécification technique de l'entrepôt des organes et pièces, arborescence à 4 niveaux (Groupes ➔ Familles ➔ Modèles ➔ Entrepôt), taxonomie des pièces détachées, cycle de vie physique des organes (DISPONIBLE, INSTALLE, EN_REPARATION, REFORME), montage sur machines Nexus et intégrité référentielle.
relatedTabs:
  - entrepot
  - comp_groups
  - comp_families
  - comp_templates
  - part_groups
  - part_types
  - part_designations
  - nexus
---

# 🏛️ Group 05 : Entrepôt Organes & Pièces Détachées — Architecture & Spécifications Techniques

> **Destination :** Développeurs, Architectes Logiciels, Auditeurs Système & Modèles IA.  
> **Périmètre applicatif :** Entrepôt physique des organes complets et pièces (`warehouseItems`), double arborescence à 4 niveaux des sous-ensembles électromécaniques (`CompGroup ➔ CompFamily ➔ CompTemplate ➔ Entrepôt`) et des pièces mécaniques d'atelier (`PartGroup ➔ PartType ➔ PartDesignation ➔ Entrepôt`), cycle de vie physique des organes, et montage sur le parc machines (`machineElementsLedger` / `Nexus BOM`).

---

## 1. Vue d'Ensemble & Distinction Fondamentale des 3 Familles (`PDR` vs `Components` vs `Parts`)

Dans **CIOB GMAO Nexus v5.1.2**, la philosophie industrielle distingue strictement **trois univers matériels** qui ne partagent jamais la même table de groupes :

1. **Magasin PDR classique (`rawStock` / `gmao_pdr_groups_v1` — `#pdr_groups`) :**
   - Articles fongibles et consommables achetés sur catalogue : roulements, filtres, fusibles, joints toriques, courroies, huiles.
   - Gérés par quantité mathématique brute (`stockActuel = stockInitial + entrées − sorties`) avec unité de mesure (`unite_mesure`), criticité `A/B/C` et délai d'approvisionnement (`delai_appro_jours`). Politique dominante : `REPLACING`.
2. **Organes Rotatifs & Sous-Ensembles (`Components` / `gmao_comp_groups_v2` — `#comp_groups`) :**
   - Sous-ensembles électromécaniques complets : moteurs électriques (triphasés, servo), réducteurs à engrenages, pompes hydrauliques/centrifuges, variateurs de vitesse, vérins lourds.
   - Ils possèdent une identité physique, une plaque signalétique (`tension_nominale`, `courant_nominal_a`, `indice_protection`, `type_fixation`), un mode de réparation par défaut (`mode_reparation_defaut`: `BOBINAGE`, `REVISION_INTERNE`, `ECHANGE_STANDARD`, `SOUS_TRAITANCE_EXTERNE`, `REMPLACEMENT_NEUF`), et traversent un cycle d'état (`Actif`, `En réserve`, `En bobinage`, `Réformé`).
3. **Pièces Mécaniques & Structurelles d'Atelier (`Parts` / `gmao_part_groups_v1` — `#part_groups`) :**
   - Pièces d'usure, de structure ou d'usinage mécanique localisées sur la machine : arbres, flasques, engrenages, paliers usinés, carters, bagues bronze.
   - Caractérisées par leur **triptyque d'atelier** (`matiere_nuance` ex. `42CrMo4`, `ref_plan` ex. `PLN-ARB-014`, `dimensions_brut` ex. `Ø85 x 420 mm`, et `traitement_thermique` ex. `Trempe + Revenu 58 HRC`). Elles servent à la localisation précise des pannes (`Pareto par Organe/Pièce`) et aux ordres de fabrication/rectification (`BR` / `RECT`) à l'Atelier Mécanique.

---

## 2. Taxonomie en 4 Niveaux des Organes (`Components` — `CompGroup ➔ CompFamily ➔ CompTemplate ➔ Entrepôt`)

Afin d'éviter les catalogues plats impossibles à maintenir, la structure des organes adopte une hiérarchie stricte en 4 niveaux (`docs/COMPOSANTS_HIERARCHIE_ET_IDENTIFIANTS.md`) :

```text
[ Niveau 1 : GROUPE D'ORGANES (CompGroup — #comp_groups / gmao_comp_groups_v2) ]
  │   Ex: MOTEUR, REDUCTEUR, POMPE, VARIATEUR (avec default_policy_tags: REPAIRABLE / REPLACING)
  │
  └───► [ Niveau 2 : FAMILLE COMPOSANT (CompFamily — #comp_families / gmao_comp_families_v3) ]
          │   Ex: MOT-3PH (Moteur Asynchrone Triphasé, rattaché via getGroupId)
          │
          └───► [ Niveau 3 : MODÈLE / TEMPLATE (CompTemplate — #comp_templates / gmao_comp_templates_v3) ]
                  │   Ex: MOT-3PH-40KW-1430 (4.0 kW, 1430 tr/min, 380V, 8.8A, IP55, B3, BOBINAGE)
                  │
                  └───► [ Niveau 4 : ÉLÉMENT PHYSIQUE EN ENTREPÔT (WarehouseItem — nature: 'COMPONENT') ]
                          Ex: Moteur N° Série SEW-88421, Rayon B-02, Statut: DISPONIBLE / INSTALLE
```

### Attributs Industriels de Plaque Signalétique (`C2` sur `CompTemplate`)
- **`mode_reparation_defaut` :** `BOBINAGE` | `REVISION_INTERNE` | `ECHANGE_STANDARD` | `SOUS_TRAITANCE_EXTERNE` | `REMPLACEMENT_NEUF`.
- **Plaque électrique & mécanique :** `puissance` (`kW`), `vitesse` (`tr/min`), `tension_nominale` (`230V`, `400V`, `24V DC`), `courant_nominal_a` (`A`), `indice_protection` (`IP55`, `IP65`), `type_fixation` (`B3`, `B5`, `B14`, `B35`, `Bride`, `Patte`).
- **Lecture rétrocompatible :** `CompTemplateView.tsx` lit directement ces champs typés et assure un fallback sur `specs.*` pour les anciens enregistrements.

---

## 3. Taxonomie Jumeau en 4 Niveaux des Pièces (`Parts` — `PartGroup ➔ PartType ➔ PartDesignation ➔ Entrepôt`)

Les pièces mécaniques et structurelles disposent désormais de leur propre **hiérarchie complète à 4 niveaux** symétrique à celle des organes, mais stockée dans des clés SSOT totalement indépendantes :

```text
[ Niveau 1 : GROUPE DE PIÈCES (PartGroup — #part_groups / gmao_part_groups_v1) ]
  │   Ex: GRP-PART-01 (Transmission & Guidage), GRP-PART-02 (Structure & Bâti),
  │       GRP-PART-03 (Outillage & Coupe), GRP-PART-04 (Hydraulique & Fluides Mécaniques),
  │       GRP-PART-05 (Éléments d'Usure & Protection)
  │
  └───► [ Niveau 2 : TYPE DE PIÈCE (PartType — #part_types / gmao_part_types_v2) ]
          │   Ex: ARBRE, ENGRENAGE, CARTER, FLASQUE (rattaché au groupe via id_group + filtre Non classé)
          │
          └───► [ Niveau 3 : DÉSIGNATION DE PIÈCE (PartDesignation — #part_designations / gmao_part_designations_v2) ]
                  │   Ex: Arbre d'entraînement principal (matiere_nuance, ref_plan, dimensions_brut, traitement_thermique)
                  │
                  └───► [ Niveau 4 : PIÈCE PHYSIQUE EN ENTREPÔT (WarehouseItem — nature: 'PART') ]
                          Ex: Pièce usinée en réserve ou montée sur machine
```

### Attributs d'Usinage & Bureau des Méthodes (`C3` sur `PartDesignation`)
- **`matiere_nuance` :** Nuance métallurgique ou polymère (`C45`, `42CrMo4`, `Inox 316L`, `Bronze CuSn12`, `Fonte GG25`, `PTFE`).
- **`ref_plan` :** Numéro du plan d'usinage Bureau d'Études (`PLN-ARB-204-A`).
- **`dimensions_brut` :** Cote de débit matière brute (`Ø90 x 450 mm`) nécessaire pour les Bons de Réalisation (`BR`).
- **`traitement_thermique` :** Traitement thermique ou de surface requis (`Trempe + Revenu 58 HRC`, `Cémentation`, `Nitruration`, `Brunissage`, `Zingage`).
- La fonction `isWarehouseComponent(item)` et `isWarehousePart(item)` dans `src/core/domain/EntrepotItem.ts` sépare automatiquement les deux natures (`COMPONENT` vs `PART`) sans ambiguïté.

---

## 4. Cycle de Vie Physique de l'Organe (`Physical Organ Lifecycle`)

Chaque organe enregistré dans `warehouseItems` se trouve dans un état opérationnel déterministe :

| Statut | Signification Industrielle | Emplacement / Rattachement |
| :--- | :--- | :--- |
| `DISPONIBLE` / `EN_STOCK` | Organe prêt à l'emploi, révisé ou neuf. | Stocké sur une étagère de l'entrepôt (`emplacement`: ex. `Rayon A-02`). `id_machine` est nul. |
| `MONTE` *(legacy: `INSTALLE`)* | Organe monté physiquement sur une machine active de l'usine. | Rattaché à une machine (`id_machine` renseigné). Apparaît automatiquement dans le `Nexus BOM` de l'équipement. |
| `EN_REPARATION` / `BOBINAGE` | Organe démonté envoyé à l'atelier central ou chez un sous-traitant pour révision/rebobinage. | Lié à une sortie externe (`SortieExterneBobinageView`). Sortie temporaire tracée. |
| `REFORME` / `ARCHIVE` | Organe détruit, obsolète ou irréparable. | Retiré du parc actif. Conservé dans l'historique pour traçabilité comptable et technique. |

---

## 5. Mécanique de Montage et Démontage sur Machine (`Nexus Ledger`)

1. **Montage d'un Organe sur une Machine :**
   - Le technicien sélectionne un composant au statut `DISPONIBLE`.
   - Il sélectionne la machine cible parmi le parc actif (`filterActiveMachines`).
   - Le statut passe à `MONTE`, son champ `id_machine` est mis à jour, et une ligne d'historique est ajoutée dans le registre de la machine.
2. **Démontage / Remplacement :**
   - Lorsqu'un moteur brûle sur une ligne, il est démonté : son statut passe à `EN_REPARATION` avec saisie du diagnostic de défaillance.
   - Un moteur de remplacement identique (`même CompTemplate`) est prélevé de l'entrepôt et passe à `MONTE`.
   - **Bénéfice :** L'historique d'exploitation et d'usure du moteur suit l'organe, tandis que l'historique de la machine trace le remplacement.

---

## 6. Évaluation de l'Usure, Santé Composant & Devise Dynamique (`evaluateComponentWearAndLifecycle`)

Le service `src/utils/componentHealthScore.ts` évalue l'indice de santé technique (`/100`) d'un composant (`wearScore`, `bobinageCount`, `recentBreakdowns6Months`, `cumulativeRepairCost`, `costRatioPercent`, `shouldReform`) :
- **En mode `TEAM_FULL` (`showFinance: true`) :** Affiche le score technique **et** le ratio économique BER (`coût cumulé / valeur de remplacement`) formaté exclusivement via `useCurrency().formatCurrency` (aucune chaîne `DH` en dur).
- **En mode `SOLO_EXPERT` (`showFinance: false`) :** Masque les montants financiers et la jauge de coût pour afficher une **jauge de santé technique pure (`/100`)**, le nombre de pannes sur 6 mois et le nombre de cycles de rebobinage.

---

## 7. Intégrité Référentielle, Sécurité CSV & Journal d'Audit (`AUDIT_EVENTS`)

Le système interdit toute rupture de lien orphelin ou corruption d'identifiant :
1. **Unicité des clés primaires (`PK`) & Auto-ID sans collision (`max + 1`) :** Toutes les créations (`CompGroup`, `CompFamily`, `CompTemplate`, `PartGroup`, `PartType`, `PartDesignation`, `WarehouseItem`) normalisent la clé en majuscules, rejettent les doublons (retour `false`, modale maintenue ouverte avec erreur inline), préservent explicitement la valeur `0` (`stockInitial`, `stockActuel`, `seuil`) et enregistrent un événement immuable dans `STORAGE_KEYS.AUDIT_EVENTS`.
2. **Classification canonique (`isWarehouseComponent` / `isWarehousePart`) :** Unifie tous les compteurs et filtres entre `COMPONENT / COMPOSANT` et `PART / PARTIE / ORGANE` sur les 7 écrans du groupe.
3. **Suppression bloquée & Archivage Sécurisé (`Safe Archive`) :**
   - `CompGroup`, `CompFamily`, `CompTemplate`, `PartGroup`, `PartType`, `PartDesignation` bloquent la suppression dès qu'au moins un sous-niveau ou un article d'entrepôt y fait référence (`PartGroup` bascule en désactivation `is_active: false`).
   - `WarehouseItem` bloque la suppression tant que l'élément est monté sur une machine active (`attachedMachine`), et convertit automatiquement la suppression en **Archivage (`ARCHIVEE`)** dès qu'un historique existe (mouvements, BT correctifs, préventifs, sorties externes ou bobinage).
4. **Export Excel Opérationnel (`Type B`) sécurisé :** Tous les exports du groupe passent par `exportTypeBCsv` (`escapeCsvCell`, neutralisation OWASP contre l'injection de formules `= + - @`) et portent la mention explicite `(Type B)` non réimportable.

---

## 8. Parité & Adaptation `TEAM_FULL` vs `SOLO_EXPERT`

| Aspect | Mode `TEAM_FULL` (Défaut) | Mode `SOLO_EXPERT` (Ingénieur Terrain) |
| :--- | :--- | :--- |
| **Écrans & Double Hiérarchie 4 Niveaux** | 7 écrans (`Components` 4 niveaux + `Parts` 4 niveaux + `Entrepôt`) | **Strictement identique** : mêmes 7 écrans et même séquence d'ajout |
| **Colonne `Responsable` & Sélecteur Technicien (`showTeamManagement`)** | Affichés dans `ComponentsTable`, `PartsTable`, `EntrepotFormModals` et `QuickMovementModal` | **Masqués** ; l'attribution des mouvements rapides (`QuickMovementModal`) se fait automatiquement sur l'acteur connecté |
| **Indicateurs Financiers (`showFinance`)** | Coût cumulé, valeur de remplacement et ratio BER en devise ISO dynamique (`useCurrency`) | **Masqués** ; seule la santé technique (`/100`), les pannes et les cycles de rebobinage sont affichés |
| **Traçabilité & Garde-fous (`AUDIT_EVENTS`, Safe Archive, `id_warehouse_item`)** | 100 % actifs | **100 % actifs** (aucun compromis sur l'intégrité) |
