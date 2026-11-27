---
id: page-modeles-organes
groupId: 05-entrepot-organes
groupTitle: Entrepôt Organes & Pièces Détachées
docType: page
audience: user
tabId: comp_templates
title: Modèles & Templates d'Organes (Niveau 3)
subtitle: Fiches techniques standardisées de sous-ensembles (Puissance kW, Vitesse tr/min, Tension, Constructeur)
summary: Guide d'utilisation pour la gestion des Modèles et Templates d'organes. Présente le Niveau 3 de la taxonomie, la standardisation des caractéristiques électromécaniques et la liaison avec l'Entrepôt physique.
relatedTabs:
  - comp_families
  - comp_groups
  - entrepot
  - nexus
---

# 🔮 Guide Utilisateur : Modèles & Templates d'Organes (Niveau 3)

> **Module :** Référentiel Technique & Entrepôt  
> **Identifiant d'accès :** `#comp_templates`  
> **Public cible :** Ingénieurs Maintenance, Techniciens Méthodes, Acheteurs Techniques.

---

## 1. Rôle et Objectif du Niveau 3

Le **Modèle / Template d'Organe** représente la **fiche technique standardisée** d'un équipement industriel, indépendamment du nombre d'unités physiques présentes dans l'usine.

Plutôt que de ressaisir les caractéristiques complètes (puissance en kW, vitesse de rotation en tr/min, intensité en Ampères, tension nominale, type de carcasse B3/B5) à chaque fois qu'un nouveau moteur est livré au magasin, vous créez **une seule fois** le modèle dans le référentiel.

Tous les organes physiques commandés par la suite héritent automatiquement de cette fiche technique.

---

## 2. Exemple Concret de Déclinaison de Modèles

Sous la Famille `MOT-3PH` (Moteurs Asynchrones Triphasés) :

| Code Modèle | Référence Fabricant | Constructeur | Caractéristiques Normalisées |
| :--- | :--- | :--- | :--- |
| `MOT-3PH-40KW-1430` | `1LA7083-4AA` | Siemens | 4.0 kW • 1430 tr/min • 8.8 A • 380V • Bride B3 |
| `MOT-3PH-75KW-2910` | `M2BAX-132SMA` | ABB | 7.5 kW • 2910 tr/min • 14.2 A • 380V • 10 CV |
| `MOT-3PH-185KW-1420`| `LSES-160` | Leroy Somer | 18.5 kW • 1420 tr/min • 36 A • 380V • 25 CV |
| `MOT-3PH-075KW-900` | `DRS71S4` | SEW Eurodrive | 0.75 kW • 900 tr/min • 2.1 A • 230/400V • B5 |

---

## 3. Structure d'une Fiche Template

Chaque modèle enregistre :
1. **Identifiant Unique Système (`id_template`) :** Clé primaire immuable (ex. `TPL-MOT-3PH-40KW-1430-001`).
2. **Famille d'Appartenance (`id_family`) :** Lien obligatoire vers la famille de Niveau 2.
3. **Code Modèle (`code_template` ou `code`) :** Mnémonique atelier facilement identifiable par les équipes de terrain.
4. **Référence Constructeur Officielle (`ref_constructeur` ou `ref_fabricant`) :** Référence de catalogue exacte indispensable aux achats.
5. **Constructeur / Fabricant :** Marque d'origine (Siemens, ABB, SEW, Bonfiglioli, Schneider, Grundfos...).
6. **Plaque Signalétique & Politique Réparation (`C2`) :**
   - `puissance` (kW), `vitesse` (tr/min), `tension_nominale` (ex. `400V`), `courant_nominal_a` (A), `indice_protection` (ex. `IP55`), `type_fixation` (`B3`, `B5`, `B14`, `B35`) et `mode_reparation_defaut` (`BOBINAGE`, `REVISION_INTERNE`, `ECHANGE_STANDARD`, `SOUS_TRAITANCE_EXTERNE`, `REMPLACEMENT_NEUF`).

---

## 4. Filtrage Dynamique, Tri & Liaison Entrepôt

- **Filtrage en Cascade & Pré-sélection :** Le sélecteur supérieur permet de filtrer par Groupe et par Famille ; lors de la création d'un nouveau modèle, la famille filtrée est automatiquement pré-sélectionnée avec génération d'ID sans collision (`max + 1`).
- **Tri calculé & compteurs exacts :** Tri disponible sur le **Groupe parent (`groupe`)** et le nombre d'**Organes en Entrepôt (`warehouse_count`)** calculé strictement via `isWarehouseComponent`.

---

## 5. Règles de Verrouillage, Unicité & Export

- **Anti-doublon & Protection orphelins :** Les codes/IDs dupliqués sont rejetés en maintenant le formulaire ouvert, et le bouton de confirmation de suppression reste bloqué tant qu'au moins un organe physique (`isWarehouseComponent`) référence ce modèle.
- **Export Excel (Type B) :** Génère un CSV opérationnel sécurisé contre l'injection de formules `(Type B)`.

---

## 6. Comportement en Mode `TEAM_FULL` vs `SOLO_EXPERT`

- **Parité totale :** L'écran **Modèles & Templates d'Organes (Niveau 3)** fonctionne à l'identique en `TEAM_FULL` et `SOLO_EXPERT`, assurant l'héritage automatique de la plaque signalétique dans l'Entrepôt.
