---
id: page-user-appearance
groupId: 07-settings-systeme
groupTitle: Paramètres Système, Sauvegardes & Registre d’Audit
docType: page
audience: user
tabId: appearance
title: Apparence, Ergonomie & Mode Appareil (Desktop / Mobile)
subtitle: Personnalisation locale de la barre latérale, de la densité des tableaux, de la couleur d'accent et du mode appareil
summary: Guide d'utilisation de l'écran Apparence. Explique le choix du mode appareil (Auto / Desktop / Mobile), le style et le thème de la barre latérale, la densité des grilles et les options d'ergonomie enregistrées localement par poste.
relatedTabs:
  - settings
  - settings_performance
---

# 🎨 Guide Utilisateur : Apparence & Ergonomie (`#appearance`)

> **Module :** Paramètres Système & Audit  
> **Composant source :** `src/presentation/components/settings/AppearanceLayoutSelector.tsx`  
> **Clés SSOT locales :** `STORAGE_KEYS.DEVICE_MODE`, `SIDEBAR_STYLE`, `SIDEBAR_BEHAVIOR`, `SIDEBAR_THEME`, `THEME`, `DENSITY`, `ACCENT_COLOR`, `ANIMATIONS`, `HEADER_CLOCK`.

---

## 1. Personnalisation Locale par Poste

Les réglages d'**Apparence** s'appliquent immédiatement sur le poste de travail courant sans impacter les données métier de l'usine ni la base partagée LAN :

1. **Mode d'affichage & Cible de l'appareil (`DEVICE_MODE`) :**
   - **Auto :** adapte automatiquement l'interface entre bureau et mobile/tablette selon la largeur d'écran.
   - **Desktop :** force le shell complet avec barre latérale et tableaux larges.
   - **Mobile :** force l'ergonomie terrain compacte adaptée aux smartphones d'atelier.
2. **Disposition & Style de la barre latérale (`SIDEBAR_STYLE` / `SIDEBAR_BEHAVIOR` / `SIDEBAR_THEME`) :**
   - Personnalise le comportement (fixe, repliable, compact) et l'apparence visuelle de la navigation tout en conservant le standard **Light UI Excel**.
3. **Densité des tableaux & Couleur d'accent (`DENSITY` / `ACCENT_COLOR`) :**
   - Permet d'ajuster l'espacement vertical des grilles de données (compact / confort) et la teinte d'accentuation.
4. **Options de barre supérieure & fluidité (`HEADER_CLOCK` / `ANIMATIONS`) :**
   - Active ou désactive l'horloge d'en-tête et les transitions animées (utile sur les terminaux atelier anciens).

---

## 2. Aperçu en Direct & Réinitialisation

- Une maquette intégrée **« Aperçu en direct de l'espace de travail »** reflète instantanément vos choix avant même de quitter l'écran.
- Le bouton de réinitialisation rétablit en un clic le profil standard **Light UI Excel** par défaut.
