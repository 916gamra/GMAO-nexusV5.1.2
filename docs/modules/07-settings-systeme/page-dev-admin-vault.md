---
id: page-dev-settings-admin-vault
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: architecture
audience: developer
tabId: settings_admin
title: Spécification Technique — Compte Administrateur, Licence & Coffre-Fort AES-GCM
summary: Architecture de sécurité du coffre-fort Zero-Knowledge (gmao_vault_*_v2), dérivation PBKDF2, chiffrement AES-GCM 256 bits, masquage DOM des secrets et double porte Licence / Authentification.
relatedTabs:
  - settings_admin
  - settings
  - utilisateurs
---

# 💻 Spécification Développeur : Compte Admin & Coffre-Fort (`#settings_admin`)

> **Public :** Ingénieurs Sécurité, Développeurs Core & Auditeurs.  
> **Composant source :** `src/presentation/pages/settings/components/SettingsAdminTab.tsx`  
> **Services cryptographiques :** `src/utils/vaultService.ts`, `src/core/security/SecurityService.ts`, `src/context/AuthContext.tsx`.  
> **Clés de persistance réelles :** `gmao_vault_salt_v2`, `gmao_vault_cipher_v2`, `gmao_vault_iv_v2`, `gmao_vault_pin_hash_v2` (via `SecurityService`), `STORAGE_KEYS.AUTH_ACCOUNTS` (`gmao_auth_accounts_v2`), `STORAGE_KEYS.LICENSE_RECORD` (`gmao_license_record_v1`).  
> **Garde RBAC :** `settings.manage` **ET** `users.manage` (`ADMIN` uniquement).

---

## 1. Architecture du Coffre-Fort Chiffré (`vaultService.ts`)

Pour protéger les comptes locaux, mots de passe et jetons sensibles en environnement d'atelier, **CIOB GMAO Nexus** repose sur un coffre-fort WebCrypto local :

```text
[ Saisie du Master PIN par l'Administrateur ]
                     │
                     ▼
[ Dérivation de Clé Cryptographique (PBKDF2) ]
  • Algorithme : PBKDF2 avec HMAC-SHA256
  • Sel aléatoire persisté sous `gmao_vault_salt_v2`
  • Empreinte PIN vérifiée contre `gmao_vault_pin_hash_v2`
                     │
                     ▼
[ Déchiffrement AES-GCM 256 bits (WebCrypto API) ]
  • Payload chiffré : `gmao_vault_cipher_v2`
  • Vecteur d'initialisation (IV) : `gmao_vault_iv_v2`
                     │
         ┌───────────┴───────────┐
      SUCCÈS                  ÉCHEC
         ▼                       ▼
[ Coffre Déverrouillé ]   [ Protection Anti-Bruteforce ]
Données actives en RAM    Verrouillage temporaire après échecs répétés
```

---

## 2. Invariants de Sécurité & Masquage DOM

1. **Aucun Secret Exposé dans le DOM :** `SettingsAdminTab.tsx` masque strictement `installSalt`, le texte chiffré `gmao_vault_cipher_v2` et le sel `gmao_vault_salt_v2` dans tout rendu UI ou export diagnostic.
2. **Double Porte Licence + Coffre-Fort (`LOGIN-LICENSE-P0`) :** Même si un coffre-fort existe déjà localement, tant que la licence commerciale (`STORAGE_KEYS.LICENSE_RECORD`) n'est pas active, le flux d'activation initiale reste prioritaire (voir `docs/SECURITY_LICENSE_GATE.md`).
3. **Éphémérité en RAM :** Les données déchiffrées restent en mémoire vive durant la session et sont purgées au verrouillage/rechargement.
4. **Réinitialisation Contrôlée :** `handleResetAllAccounts` exige à la fois `settings.manage`, `users.manage` et le **Master PIN** valide avant toute réinitialisation du coffre-fort.
