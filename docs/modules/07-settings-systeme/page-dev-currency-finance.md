---
id: page-dev-settings-currency-finance
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: architecture
audience: developer
tabId: settings_currency
title: Spécification Technique — Moteur Multi-Devises ISO 4217 & Fiscalité
summary: Architecture réelle de currencyService.ts (MAD, USD, EUR), persistance sous STORAGE_KEYS.CURRENCY_CONFIG, contrôle RBAC settings.manage, audit append-only et valorisation live du stock PDR.
relatedTabs:
  - settings_currency
  - finance
  - stock
---

# 💻 Spécification Développeur : Moteur Multi-Devises ISO 4217 (`#settings_currency`)

> **Public :** Développeurs Finance, Architectes Core & Auditeurs.  
> **Composant source :** `src/presentation/pages/settings/components/SettingsCurrencyTab.tsx`  
> **Service monétaire :** `src/utils/currencyService.ts` (`useCurrency`, `ISO_4217_CURRENCIES`).  
> **Clé SSOT :** `STORAGE_KEYS.CURRENCY_CONFIG` (`gmao_currency_config_v1`).  
> **Garde RBAC :** `AuthorizationService.hasPermission(currentUser, 'settings.manage')`.

---

## 1. Modèle de Configuration Monétaire (`currencyService.ts`)

Le moteur monétaire conforme **ISO 4217** supporte trois devises canoniques (`MAD`, `USD`, `EUR`) avec une base comptable unique en `MAD` :

```typescript
export type CurrencyCode = 'MAD' | 'USD' | 'EUR';
export type MadSymbolVariant = 'DH' | 'MAD' | 'د.م.';

export interface CurrencyConfig {
  currencyCode: CurrencyCode;
  madSymbolVariant: MadSymbolVariant;
  vatRatePercent: number;               // Défaut : 20
  fiscalYear: number;                   // Année fiscale active (ex. 2026)
  applyExchangeRateConversion: boolean; // Multiplie les valeurs base MAD à l'affichage si true
  exchangeRates: Record<CurrencyCode, number>; // Direction : 1 MAD -> devise cible (MAD: 1, USD: 0.1, EUR: 0.092)
}
```

---

## 2. Invariants de Persistance, Calcul & Sécurité

1. **Base Comptable Unique (`MAD`) :**
   - Tous les montants persistés dans `rawStock`, `mouvements`, `replenishmentOrders` et `financialBudgets` restent stockés dans la base `MAD` sans jamais écraser les chiffres d'origine lors d'un changement de devise d'affichage.
2. **Conversion Non-Destructive à l'Affichage :**
   - Lorsque `applyExchangeRateConversion === true` et `currencyCode !== 'MAD'`, `formatCurrency()` calcule :
     $$\text{Montant Affiché} = \text{Montant Base MAD} \times \text{exchangeRates}[\text{currencyCode}]$$
   - L'interface affiche également l'équivalence inverse (`1 / rate`) sous chaque champ de saisie (`1 USD ≈ ... MAD`, `1 EUR ≈ ... MAD`) afin d'éviter toute erreur de sens de conversion.
3. **Valorisation Live Sans Données Fictives :**
   - La carte **3. Aperçu du Formatage Monétaire & Valorisation Réelle** s'abonne à `useGmaoStore` (`rawStock`, `mouvements`, `stockItems()`) via `IncrementalStockIndex` pour calculer la valorisation réelle du stock PDR (`0` lorsque l'usine est vide).
4. **Traçabilité & Synchronisation LAN :**
   - Chaque mutation autorisée (`settings.manage`) appelle `useGmaoStore.getState().appendAuditEvent({ actionType: 'CURRENCY_CONFIG_UPDATED', entityType: 'CURRENCY_CONFIG', ... })` puis `serverSyncService.scheduleAutoPush(...)`.
