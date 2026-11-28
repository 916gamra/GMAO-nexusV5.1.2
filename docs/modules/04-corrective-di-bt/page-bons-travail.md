---
id: page-bons-travail
groupId: 04-corrective-di-bt
groupTitle: Maintenance Corrective (DI / BT & Clôture)
docType: page
audience: user
tabId: corrective_bt
title: Bons de Travail (BT), Consignation LOTO & Intervention Live
subtitle: Pilotage des ordres de travail, consignation énergétique LOTO, chronomètre Shift-Aware, contrôle de stock temps réel, expressions de besoin et gouvernance Maker-Checker vs SOLO_DIRECT
summary: Guide d'exécution terrain pour les techniciens, superviseurs (TEAM_FULL) et ingénieurs Solo Expert (SOLO_EXPERT). Décrit le cycle BT, le cadenas LOTO, le chronométrage Live (pause déjeuner neutralisée), le calcul temps réel du stock PDR, les Bons d'Atelier (BR/RECT), les Expressions de Besoin (BES) et la clôture directe vs Maker-Checker.
relatedTabs:
  - corrective_di
  - corrective_live
  - corrective_atelier
  - corrective_cloture
  - validation_center
  - stock
---

# 🛠️ Guide Utilisateur : Bons de Travail (`#corrective_bt`), Consignation `LOTO` & Intervention Live (`#corrective_live`)

> **Module :** Maintenance Corrective (`v5.1.2`)  
> **Identifiants d'accès :** `#corrective_bt` et `#corrective_live`  
> **Onglets :** *Bons de Travail* & *Intervention en Direct (Live)*  
> **Public cible :** Techniciens d'atelier, Chefs d'équipe, Responsables Maintenance (`TEAM_FULL`) et Ingénieurs Maintenance autonomes pilotant une équipe terrain (`SOLO_EXPERT`).

---

## 1. Rôle et Objectif

Le **Bon de Travail (`BT`)** est le dossier d'exécution technique et transactionnel d'un dépannage. Il gouverne :
- La sécurité énergétique avant et après démontage (**Consignation `LOTO`**).
- Le chronométrage réel d'immobilisation (**Shifts industriels `08:00–17:00`** avec neutralisation automatique de la pause déjeuner `13:15–14:00`).
- La consommation contrôlée des **Pièces de Rechange (`PDR`)** avec vérification du stock disponible en temps réel (`StockCalculationService`).
- Les passerelles d'attente réelle : **Bons d'Atelier Fabrication Mécanique (`BR / RECT`)**, **Sorties Externes (`SORT-EXT`)** et **Expressions de Besoin (`BES`)**.
- La synchronisation optionnelle de la nomenclature physique montée (**Nexus BOM As-Built**).

---

## 2. Cycle Opérationnel & Distinction Sémantique des Statuts

```text
[ BT Planifié ] ➔ (Consignation LOTO si requis) ➔ [ En Cours (Live) ]
       │
       ├──► [ ATTENTE ATELIER ] (Bon BR / RECT ou Sortie Externe actif — Clôture verrouillée)
       ├──► [ ATTENTE PDR / BESOIN ] (Rupture magasin ou Besoin BES ouvert — Clôture verrouillée)
       ▼
(Déconsignation LOTO si requis) ➔ [ Validation Maker-Checker (TEAM_FULL) OU Clôture Directe (SOLO_DIRECT) ] ➔ [ Clôturé ]
```

- **`BT_PLANIFIE` :** Ordre de travail émis et attribué à un technicien actif, ou en **`ATTENTE_CONSIGNATION` (`LOTO`)**.
- **`EN_COURS` :** Intervention active sur le terrain avec chronomètre Live.
- **`ATTENTE ATELIER` (Badge Indigo) :** Un Bon de Réalisation (`BR-YYYY-NNN`), de Rectification (`RECT-YYYY-NNN`) ou une Sortie Externe est en cours d'usinage/réparation.
- **`ATTENTE PDR` (Badge Ambre) :** Suspension pour rupture de stock PDR ou Expression de Besoin (`BES-YYYY-NNN`) en cours d'approvisionnement.
- **`PENDING_VALIDATION` (`Maker-Checker` en `TEAM_FULL`) :** Travail terminé par le technicien ; pièces réservées sans déduction physique tant que le superviseur n'a pas approuvé.
- **`CLOTURE` :** État terminal immuable ; stock PDR déduit **une seule fois (`1×`)**, coûts consolidés (`cout_pdr + cout_atelier`), machine remise en service.

---

## 3. Sécurité Énergétique : Protocole de Consignation `LOTO` (`Lockout / Tagout`)

Lorsqu'un `BT` comporte l'exigence **`LOTO Requis`** (`requires_loto: true`) :
1. **Avant le démarrage des travaux (`ATTENTE_CONSIGNATION` ➔ `CONSIGNE`) :**
   - Dans la console **Intervention Live (`#corrective_live`)**, ouvrez le panneau **Permis de Consignation LOTO**.
   - Sélectionnez les **Énergies coupées** (`Électrique`, `Pneumatique`, `Hydraulique`, `Mécanique / Gravité`, `Thermique / Vapeur`, `Chimique`), saisissez le **Numéro de Cadenas** et le **Point d'isolement**, puis cochez la **Vérification d'Absence de Tension / Énergie (`VAT Vérifiée`)**.
   - Cliquez sur **« Valider la Consignation »** : l'événement `LOTO_CONSIGNED` est gravé dans `AUDIT_EVENTS` et le `BT` est autorisé à passer en `EN_COURS`.
2. **Avant la clôture du BT (`CONSIGNE` ➔ `DECONSIGNE`) :**
   - Tant que le cadenas est posé (`CONSIGNE`), le système **interdit toute clôture du `BT`** (`canCloseWorkWithLoto`).
   - Une fois les carters remontés et la zone sécurisée, validez la **Déconsignation** (`LOTO_DECONSIGNED`). En cas d'absence du consignateur initial, seuls un **Responsable Maintenance** ou un **Admin** peuvent exécuter un **Forçage de Cadenas (`Break-Lock Override`)** avec motif obligatoire tracé en audit (`LOTO_BREAK_LOCK_OVERRIDE`).

---

## 4. Console `Intervention Live` (`#corrective_live`) : PDR Temps Réel, Besoins (`BES`) & Atelier (`BR / RECT`)

1. **Sélection & Contrôle Temps Réel des Pièces de Rechange (`PDR`) :**
   - Le sélecteur d'articles met en tête les pièces appartenant à la nomenclature de la machine (**`★ BOM`**).
   - **Solde Temps Réel Garanti :** pour chaque article, le solde disponible est calculé dynamiquement selon l'invariant $\text{Stock Actuel} = \text{Stock Initial} + \text{Entrées} - \text{Sorties}$.
   - **Garde Anti-Surconsommation :** le contrôleur additionne les quantités déjà présentes dans la liste du `BT` et bloque immédiatement toute tentative d'ajouter une quantité supérieure au stock disponible réel (ou de clôturer si le stock a été consommé entre-temps).
2. **Émission d'un Bon Atelier Mécanique (`BR / RECT`) en 1 Clic :**
   - Cliquez sur **« Bon atelier mécanique (BR / RECT) »**, choisissez `REALISATION` (`BR`) ou `RECTIFICATION` (`RECT`), la quantité et la description d'usinage.
   - Le bon est émis sans impacter le stock PDR et le `BT` passe automatiquement en **`ATTENTE ATELIER`**. Dès que l'atelier marque la pièce **`PRET_LIVRAISON`**, le bouton **« Réceptionner Montage »** apparaît directement dans la console Live pour passer à `RECEPTIONNE_MONTAGE` et déverrouiller la clôture.
3. **Expression de Besoin Corrective (`BES-YYYY-NNN` — `NeedRequestsModal`) :**
   - Si une pièce est absente ou nécessite un arbitrage (Magasin `STOCK`, Commande `ACHAT`, Usinage `ATELIER` ou `EXTERNE`), cliquez sur **« Exprimer un Besoin »**.
   - Le moteur `policyTagsService` suggère les canaux valides (en interdisant par exemple le canal `ATELIER` pour un consommable `PDR` standard) et verrouille la clôture du `BT` tant que le besoin bloquant n'est pas servi et posé (`POSE_ESSAI_OK`).

---

## 5. Clôture et Gouvernance : `TEAM_FULL` (`Maker-Checker`) vs `SOLO_EXPERT` (`SOLO_DIRECT`)

| Fonctionnalité | Mode `TEAM_FULL` (Équipe Complète) | Mode `SOLO_EXPERT` (Ingénieur Terrain + Équipe) |
| :--- | :--- | :--- |
| **Démarrage depuis une DI** | Conversion en `BT_PLANIFIE` puis lancement par le technicien. | Bouton 1-clic **`Créer BT & Démarrer Live ⚡`** qui ouvre directement la console Live sur le nouveau `BT`. |
| **Fin d'intervention & Stock PDR** | Le **Technicien** clique sur **« Soumettre pour Validation »** (`PENDING_VALIDATION`, stock réservé mais non déduit). Le **Superviseur** valide dans `#corrective_bt` ou `#validation_center` ➔ déduction unique `1×`. | L'Ingénieur (`@admin`) clique sur **« Clôturer le BT »** : clôture directe en **1 seule étape** (`SOLO_DIRECT`), déduction immédiate et unique (`1×`) du stock PDR, et événement `CORRECTIVE_BT_CLOSED` avec `executionMode: 'SOLO_DIRECT'`. |
| **Traitement d'un Besoin (`BES`)** | Workflow multi-acteurs (Soumission ➔ Revue Superviseur ➔ Approvisionnement ➔ Pose & Essai). | Bouton **`Fast-Track ⚡`** (`handleFastTrackNeedRequest`) permettant de valider et réceptionner un besoin terrain en circuit court sans étapes bureaucratiques. |
| **Gestion de l'Équipe de Techniciens** | Chaque technicien se connecte avec son compte (isolation `R4` : ne voit et n'édite que ses `BT`). | Vous gérez toute votre équipe depuis votre session `@admin` : assignez le technicien réel sur chaque `BT`, filtrez par intervenant et suivez son temps de réparation (`MTTR`) et ses interventions réalisées. |
| **Gardes de Sécurité & Vérité Terrain** | Bloque la clôture si `LOTO` non déconsigné, `BR/RECT` actif ou `BES` ouvert. | **Strictement identiques :** même en `SOLO_EXPERT`, aucun `BT` ne peut être clôturé par erreur si un cadenas `LOTO` est encore posé ou si une pièce est encore à l'atelier d'usinage. |
