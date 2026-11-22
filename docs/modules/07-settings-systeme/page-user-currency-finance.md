---
id: page-user-settings-currency-finance
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: page
audience: user
tabId: settings_currency
title: Devises, Fiscalité (TVA) & Taux de Change ISO 4217
subtitle: Choix de la devise d'affichage (MAD, USD, EUR), variante du Dirham, année fiscale, TVA et aperçu de valorisation réelle
summary: Guide d'utilisation pour configurer la devise active (MAD, USD, EUR), la variante d'affichage du Dirham (DH / MAD / د.م.), la TVA standard, l'année fiscale et les taux de change par rapport à la base comptable usine (MAD).
relatedTabs:
  - finance
  - stock
  - settings
---

# 💱 Guide Utilisateur : Devises & Fiscalité ISO 4217 (`#settings_currency`)

> **Module :** Paramètres Système & Audit  
> **Onglet :** *Devises & Fiscalité* dans Paramètres  
> **Public cible :** Administrateurs Système (`ADMIN` en écriture), Direction Financière et Contrôleurs de Gestion (en lecture).

---

## 1. Principe Comptable (Base Usine MAD)

Dans **CIOB GMAO Nexus**, tous les montants sources stockés dans la base (prix unitaires PDR, coûts d'intervention, budgets annuels) sont conservés sur une **base comptable unique en Dirham Marocain (`MAD`)**.

L'écran **Devises & Fiscalité** permet de :
- Choisir la devise d'affichage active parmi les 3 devises ISO 4217 prises en charge : **MAD (504)**, **USD (840)** et **EUR (978)**.
- Choisir la variante d'affichage du Dirham Marocain lorsque `MAD` est actif (`DH`, `MAD` ou `د.م.`).
- Paramétrer l'**Année Fiscale de Référence** et le **Taux de TVA Standard (%)**.
- Activer ou désactiver la **conversion mathématique automatique à l'affichage** lorsque `USD` ou `EUR` est sélectionné.

---

## 2. Choisir la Devise Active & la Variante MAD

1. Cliquez directement sur l'une des 3 cartes ISO 4217 :
   - **MAD (ISO #504)** : Dirham Marocain (devise par défaut).
   - **USD (ISO #840)** : Dollar Américain (`$`).
   - **EUR (ISO #978)** : Euro (`€`).
2. Lorsque **MAD** est sélectionné, choisissez la variante de symbole souhaitée dans le bloc **« Variante d'Affichage du Dirham Marocain (MAD) »** (`DH`, `MAD` ou `د.م.`).
3. Le changement est appliqué immédiatement à tous les écrans (Stock PDR, Finance, Achats, Rapports) et journalisé dans le registre d'audit (`CURRENCY_CONFIG_UPDATED`).
4. Utilisez le bouton **« Par défaut »** pour rétablir `MAD / DH` avec la TVA standard (`20%`).

---

## 3. Paramétrer la TVA, l'Année Fiscale et les Taux de Change

1. Renseignez l'**Année Fiscale de Référence** (ex. `2026`) et le **Taux de TVA Standard (%)** (ex. `20`).
2. Saisissez les taux de change dans le sens **`1 MAD ➔ Devise cible`** :
   - **Taux 1 MAD ➔ USD ($)** : par exemple `0.10` (l'écran affiche automatiquement l'équivalence inverse `1 USD ≈ 10.00 MAD`).
   - **Taux 1 MAD ➔ EUR (€)** : par exemple `0.092` (l'écran affiche automatiquement `1 EUR ≈ 10.87 MAD`).
3. Cochez **« Conversion mathématique automatique à l'affichage »** si vous souhaitez multiplier automatiquement les montants de base (`MAD`) par le taux configuré lorsque `USD` ou `EUR` est sélectionné.
4. Cliquez sur **« Enregistrer Taux & Fiscalité »** (réservé au rôle `ADMIN`).

---

## 4. Aperçu du Formatage & Valorisation Réelle du Stock PDR

La carte **« 3. Aperçu du Formatage Monétaire & Valorisation Réelle »** n'est **ni une facture ni un bon de commande**. Elle fournit deux repères en temps réel :
- **Échelle d'aperçu (base 1 000 MAD) :** vérifie le formatage des décimales, du symbole monétaire et du calcul HT / TVA / TTC.
- **Valorisation Réelle du Stock PDR (Live SSOT) :** lit directement la valeur réelle du stock magasin actuel (`0` si le stock usine est vide, sans aucune valeur fictive).
