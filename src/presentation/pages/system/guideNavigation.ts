import { AuthorizationService, type AuthActorInput } from '../../../core/security/AuthorizationService';
import { loadWorkspaceProfile, type WorkspaceProfile } from '../../../core/workspace/workspaceProfile';
import { STORAGE_KEYS } from '../../../infrastructure/persistence/storageKeys';
import { storageService } from '../../../utils/storageService';

export interface GuideSettingsRouteSpec {
  /** Target sub-tab ID understood by SettingsView (`STORAGE_KEYS.SETTINGS_TARGET_TAB`). */
  settingsSubTab: string;
  /** User needs at least one of these permissions (mirrors SettingsView.allowedTabIds). */
  anyOf?: readonly string[];
  /** User needs all of these permissions (mirrors SettingsView.allowedTabIds). */
  allOf?: readonly string[];
}

/**
 * Canonical mapping from Guide documentation tab IDs (`settings*`) to
 * AppRouter route `'settings'` + SettingsView sub-tab ID + RBAC requirements.
 */
export const SETTINGS_GUIDE_TAB_MAP: Readonly<Record<string, GuideSettingsRouteSpec>> = {
  settings: { settingsSubTab: 'overview', anyOf: ['settings.view', 'settings.backup'] },
  settings_mvt_logic: { settingsSubTab: 'mvt-logic', anyOf: ['settings.view', 'settings.backup'] },
  settings_injection: { settingsSubTab: 'injection', allOf: ['settings.manage'] },
  settings_directory: { settingsSubTab: 'directory', anyOf: ['settings.view', 'settings.backup'] },
  settings_matching: { settingsSubTab: 'matching', anyOf: ['settings.view', 'settings.backup'] },
  settings_json_editor: { settingsSubTab: 'json-editor', allOf: ['settings.manage'] },
  settings_backup_audit: { settingsSubTab: 'backup-audit', anyOf: ['settings.view', 'settings.backup'] },
  settings_admin: { settingsSubTab: 'admin', allOf: ['settings.manage', 'users.manage'] },
  settings_workspace_modes: { settingsSubTab: 'admin', allOf: ['settings.manage', 'users.manage'] },
  settings_performance: { settingsSubTab: 'performance', allOf: ['settings.view'] },
  settings_currency: { settingsSubTab: 'currency', anyOf: ['settings.view', 'settings.manage'] },
};

export interface ResolvedGuideNavigation {
  routeTab: string;
  settingsSubTab?: string;
}

export function resolveGuideTabNavigation(rawTabId: string): ResolvedGuideNavigation {
  const cleanId = String(rawTabId || '').trim();
  const settingsSpec = SETTINGS_GUIDE_TAB_MAP[cleanId];
  if (settingsSpec) {
    return {
      routeTab: 'settings',
      settingsSubTab: settingsSpec.settingsSubTab,
    };
  }
  return { routeTab: cleanId };
}

/**
 * Fail-closed RBAC check for Guide "Open screen" buttons.
 * Mirrors AppRouter (`canAccessTab`) AND SettingsView internal sub-tab guards (`allowedTabIds`).
 */
export function canNavigateToGuideTab(user: AuthActorInput, rawTabId: string): boolean {
  const cleanId = String(rawTabId || '').trim();
  if (!user || !cleanId) return false;

  const { routeTab } = resolveGuideTabNavigation(cleanId);
  if (!AuthorizationService.canAccessTab(user, routeTab)) {
    return false;
  }

  const settingsSpec = SETTINGS_GUIDE_TAB_MAP[cleanId];
  if (settingsSpec) {
    if (settingsSpec.allOf && !settingsSpec.allOf.every((perm) => AuthorizationService.hasPermission(user, perm))) {
      return false;
    }
    if (settingsSpec.anyOf && !settingsSpec.anyOf.some((perm) => AuthorizationService.hasPermission(user, perm))) {
      return false;
    }
  }

  return true;
}

/**
 * Executes a guarded navigation from GuideView to the target application screen,
 * persisting `STORAGE_KEYS.SETTINGS_TARGET_TAB` when jumping directly into a Settings sub-tab.
 */
export function executeGuideTabNavigation(
  user: AuthActorInput,
  rawTabId: string,
  onNavigateToTab?: (tabId: string) => void
): boolean {
  if (!onNavigateToTab || !canNavigateToGuideTab(user, rawTabId)) {
    return false;
  }
  const { routeTab, settingsSubTab } = resolveGuideTabNavigation(rawTabId);
  if (settingsSubTab) {
    storageService.setItem(STORAGE_KEYS.SETTINGS_TARGET_TAB, settingsSubTab);
  }
  onNavigateToTab(routeTab);
  return true;
}

export interface GuideDocLookupCandidate {
  id: string;
  groupId: string;
  docType: 'architecture' | 'page';
  audience: 'developer' | 'user';
  tabId?: string;
  filePath: string;
}

/**
 * Context-aware document resolver for duplicate tabIds (e.g., `nexus` in both Group 02 and Group 06).
 */
export function findGuideDocForTab<T extends GuideDocLookupCandidate>(
  docs: readonly T[],
  tabId: string,
  preferredGroupId?: string | null,
  preferredAudience: 'all' | 'user' | 'developer' = 'all'
): T | undefined {
  const matches = docs.filter((d) => d.tabId === tabId);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  const groupMatches =
    preferredGroupId && preferredGroupId !== 'all'
      ? matches.filter((d) => d.groupId === preferredGroupId)
      : [];

  const pool = groupMatches.length > 0 ? groupMatches : matches;

  if (preferredAudience !== 'all') {
    const audienceMatch = pool.find((d) => d.audience === preferredAudience);
    if (audienceMatch) return audienceMatch;
  }

  return pool.find((d) => d.docType === 'page') || pool[0];
}

/**
 * Resolves a relative or internal markdown link target (e.g. `./page-blueprints-machines.md`, `#nexus`, `settings_currency`)
 * to either a matching doc in `docs` or a direct tabId.
 */
export function resolveGuideInternalHref<T extends GuideDocLookupCandidate>(
  docs: readonly T[],
  href: string,
  currentDoc?: T | null
): { doc?: T; tabId?: string; externalUrl?: string } | null {
  const trimmed = String(href || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return { externalUrl: trimmed };
  }

  // Block dangerous schemes (javascript:, data:, vbscript:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith('#')) {
    const targetTab = trimmed.slice(1).trim();
    if (!targetTab) return null;
    const doc = findGuideDocForTab(docs, targetTab, currentDoc?.groupId);
    return doc ? { doc } : { tabId: targetTab };
  }

  const normalizedHref = trimmed.replace(/^\.\//, '').replace(/^\//, '').split('#')[0];
  if (normalizedHref.toLowerCase().endsWith('.md')) {
    const exactPathMatch = docs.find((d) => {
      const normalizedDocPath = d.filePath.replace(/^\//, '');
      return normalizedDocPath === normalizedHref || normalizedDocPath.endsWith(`/${normalizedHref}`);
    });
    if (exactPathMatch) return { doc: exactPathMatch };

    // Try resolving relative to currentDoc's folder
    if (currentDoc) {
      const folder = currentDoc.filePath.slice(0, currentDoc.filePath.lastIndexOf('/') + 1);
      const siblingPath = `${folder}${normalizedHref}`;
      const siblingMatch = docs.find((d) => d.filePath === siblingPath);
      if (siblingMatch) return { doc: siblingMatch };
    }
  }

  return null;
}

export interface RoleQuickTrackStep {
  tabId: string;
  groupId: string;
  label: { fr: string; ar: string; en: string };
}

export type CanonicalGuideRole =
  | 'ADMIN'
  | 'RESPONSABLE_MAINTENANCE'
  | 'RESPONSABLE_MAGASIN'
  | 'TECHNICIEN'
  | 'OPERATEUR'
  | 'VIEWER';

export const ROLE_QUICK_TRACKS: Readonly<Record<CanonicalGuideRole, readonly RoleQuickTrackStep[]>> = {
  ADMIN: [
    {
      tabId: 'settings_injection',
      groupId: '07-settings-systeme',
      label: {
        fr: 'Injection Type A & Mode Démo',
        ar: 'استيراد Type A والوضع التجريبي',
        en: 'Type A Ingestion & Demo Mode',
      },
    },
    {
      tabId: 'settings_currency',
      groupId: '07-settings-systeme',
      label: {
        fr: 'Devises & Fiscalité ISO',
        ar: 'العملات والضرائب ISO',
        en: 'ISO Currencies & Tax',
      },
    },
    {
      tabId: 'settings_backup_audit',
      groupId: '07-settings-systeme',
      label: {
        fr: 'Sauvegardes & Audit Ledger',
        ar: 'النسخ الاحتياطي وسجل التدقيق',
        en: 'Backups & Audit Ledger',
      },
    },
    {
      tabId: 'settings_admin',
      groupId: '07-settings-systeme',
      label: {
        fr: 'Compte Admin & Coffre-Fort',
        ar: 'حساب المدير والخزنة المشفرة',
        en: 'Admin Account & Vault',
      },
    },
    {
      tabId: 'utilisateurs',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Utilisateurs & Rôles RBAC',
        ar: 'المستخدمون وصلاحيات RBAC',
        en: 'Users & RBAC Roles',
      },
    },
  ],
  RESPONSABLE_MAINTENANCE: [
    {
      tabId: 'validation_center',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Centre de Validation (Maker-Checker)',
        ar: 'مركز الاعتماد والمصادقة',
        en: 'Maker-Checker Validation Center',
      },
    },
    {
      tabId: 'preventive',
      groupId: '03-preventive-meters',
      label: {
        fr: 'Planning & Compteurs Préventifs',
        ar: 'التخطيط والعدادات الوقائية',
        en: 'Preventive Planning & Meters',
      },
    },
    {
      tabId: 'corrective_bt',
      groupId: '04-corrective-di-bt',
      label: {
        fr: 'Pilotage des Bons de Travail (BT)',
        ar: 'توجيه أوامر العمل (BT)',
        en: 'Work Order (WO) Control',
      },
    },
    {
      tabId: 'nexus',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Nexus BOM & Jumeaux',
        ar: 'مصفوفة Nexus والتوائم الرقمية',
        en: 'Nexus As-Built BOM & Twins',
      },
    },
    {
      tabId: 'executive_report',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Rapport Mensuel Exécutif',
        ar: 'التقرير الشهري التنفيذي',
        en: 'Monthly Executive Report',
      },
    },
  ],
  RESPONSABLE_MAGASIN: [
    {
      tabId: 'stock',
      groupId: '01-stock-pdr',
      label: {
        fr: 'Stock Articles PDR & PO',
        ar: 'مخزون قطع الغيار وأوامر الشراء',
        en: 'Spare Parts Stock & PO',
      },
    },
    {
      tabId: 'sortie',
      groupId: '01-stock-pdr',
      label: {
        fr: 'Sortie & Entrée Rapide',
        ar: 'الصرف والاستلام السريع',
        en: 'Quick Issue & Receipt',
      },
    },
    {
      tabId: 'entrepot',
      groupId: '05-entrepot-organes',
      label: {
        fr: 'Entrepôt Organes & Pièces',
        ar: 'مستودع الأعضاء والقطع',
        en: 'Rotating Components Warehouse',
      },
    },
    {
      tabId: 'validation_center',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Validation des Sorties Magasin',
        ar: 'اعتماد طلبات الصرف المخزني',
        en: 'Stock Issue Approvals',
      },
    },
    {
      tabId: 'shift_weekly_report',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Rapport Vacation / Hebdo',
        ar: 'تقرير الوردية والأسبوع',
        en: 'Shift & Weekly Report',
      },
    },
  ],
  TECHNICIEN: [
    {
      tabId: 'corrective_di',
      groupId: '04-corrective-di-bt',
      label: {
        fr: 'Demandes d’Intervention (DI)',
        ar: 'طلبات التدخل العلاجي (DI)',
        en: 'Intervention Requests',
      },
    },
    {
      tabId: 'corrective_bt',
      groupId: '04-corrective-di-bt',
      label: {
        fr: 'Exécuter un Bon de Travail (BT)',
        ar: 'تنفيذ أمر العمل (BT)',
        en: 'Execute Work Order (WO)',
      },
    },
    {
      tabId: 'preventive',
      groupId: '03-preventive-meters',
      label: {
        fr: 'Exécuter le Préventif & Compteurs',
        ar: 'تنفيذ الصيانة الوقائية والعدادات',
        en: 'Preventive Tasks & Meters',
      },
    },
    {
      tabId: 'sortie',
      groupId: '01-stock-pdr',
      label: {
        fr: 'Demander une Pièce PDR',
        ar: 'طلب صرف قطعة غيار (PDR)',
        en: 'Request Spare Part',
      },
    },
    {
      tabId: 'nexus',
      groupId: '02-parc-machines',
      label: {
        fr: 'Arborescence Nexus Machine',
        ar: 'شجرة مكونات الآلة (Nexus)',
        en: 'Machine Nexus BOM Tree',
      },
    },
  ],
  OPERATEUR: [
    {
      tabId: 'corrective_di',
      groupId: '04-corrective-di-bt',
      label: {
        fr: 'Déclarer une Panne (DI)',
        ar: 'الإبلاغ عن عطل (DI)',
        en: 'Report a Breakdown',
      },
    },
    {
      tabId: 'sortie',
      groupId: '01-stock-pdr',
      label: {
        fr: 'Sortie & Entrée Rapide',
        ar: 'طلب صرف سريع من المخزن',
        en: 'Quick Store Issue',
      },
    },
    {
      tabId: 'machines',
      groupId: '02-parc-machines',
      label: {
        fr: 'Consulter les Fiches Machines',
        ar: 'مراجعة بطاقات الآلات',
        en: 'Inspect Machine Cards',
      },
    },
    {
      tabId: 'zones',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Zones & Ateliers',
        ar: 'المناطق والورشات',
        en: 'Zones & Workshops',
      },
    },
  ],
  VIEWER: [
    {
      tabId: 'dashboard',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Tableau de Bord Exécutif',
        ar: 'لوحة القيادة التنفيذية',
        en: 'Executive Dashboard',
      },
    },
    {
      tabId: 'executive_report',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Rapport Mensuel Exécutif',
        ar: 'التقرير الشهري التنفيذي',
        en: 'Monthly Executive Report',
      },
    },
    {
      tabId: 'finance',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Coûts & Budgets',
        ar: 'التكاليف والميزانيات',
        en: 'Costs & Budgets',
      },
    },
    {
      tabId: 'machines',
      groupId: '02-parc-machines',
      label: {
        fr: 'Parc Machines Enregistrées',
        ar: 'حظيرة الآلات المسجلة',
        en: 'Registered Machine Fleet',
      },
    },
    {
      tabId: 'nexus',
      groupId: '06-pilotage-gouvernance',
      label: {
        fr: 'Nexus As-Built & Jumeaux',
        ar: 'مصفوفة Nexus والتوائم الرقمية',
        en: 'Nexus As-Built & Twins',
      },
    },
  ],
};

export const SOLO_EXPERT_QUICK_TRACK: readonly RoleQuickTrackStep[] = [
  {
    tabId: 'settings_workspace_modes',
    groupId: '07-settings-systeme',
    label: {
      fr: 'Guide Complet Solo Expert & Modes',
      ar: 'الدليل الشامل لوضع Solo Expert والأوضاع',
      en: 'Solo Expert & Workspace Modes Guide',
    },
  },
  {
    tabId: 'machines',
    groupId: '02-parc-machines',
    label: {
      fr: 'Parc Machines (Sans Blueprint + BOM 360°)',
      ar: 'حظيرة الآلات (بدون Blueprint + BOM 360°)',
      en: 'Machine Fleet (Direct BOM, No Blueprint)',
    },
  },
  {
    tabId: 'entrepot',
    groupId: '05-entrepot-organes',
    label: {
      fr: 'Entrepôt Organes & Pièces (4 Niveaux)',
      ar: 'مستودع الأعضاء والقطع (4 مستويات)',
      en: 'Components & Parts Warehouse (4 Levels)',
    },
  },
  {
    tabId: 'zones',
    groupId: '06-pilotage-gouvernance',
    label: {
      fr: 'Zones & Ateliers (Cockpit Arrêts)',
      ar: 'المناطق والورشات (لوحة التوقفات)',
      en: 'Zones & Workshops (Downtime Cockpit)',
    },
  },
  {
    tabId: 'utilisateurs',
    groupId: '06-pilotage-gouvernance',
    label: {
      fr: 'Équipe Terrain & Techniciens (Charge & Transfert)',
      ar: 'فريق الميدان والتقنيون (الحمولة والتحويل)',
      en: 'Field Team & Technicians (Workload & Handover)',
    },
  },
  {
    tabId: 'equipment',
    groupId: '06-pilotage-gouvernance',
    label: {
      fr: 'Équipements & Utilités (Système Général)',
      ar: 'التجهيزات والمرافق (النظام العام)',
      en: 'Utilities & General System Equipment',
    },
  },
  {
    tabId: 'corrective_bt',
    groupId: '04-corrective-di-bt',
    label: {
      fr: 'Correctif Direct (DI / BT / Atelier)',
      ar: 'الصيانة العلاجية المباشرة (DI / BT / ورشة)',
      en: 'Direct Corrective (DI / WO / Workshop)',
    },
  },
  {
    tabId: 'preventive',
    groupId: '03-preventive-meters',
    label: {
      fr: 'Préventif & Compteurs Terrain',
      ar: 'الصيانة الوقائية والعدادات الميدانية',
      en: 'Field Preventive & Meters',
    },
  },
  {
    tabId: 'sortie',
    groupId: '01-stock-pdr',
    label: {
      fr: 'Sortie Rapide PDR (Journal Retrait)',
      ar: 'السحب السريع لقطع الغيار (Sortie Rapide)',
      en: 'Quick PDR Issue Log',
    },
  },
];

export function resolveCanonicalGuideRole(user: AuthActorInput): CanonicalGuideRole {
  if (!user) return 'VIEWER';
  const raw = (typeof user === 'string' ? user : String(user.role || '')).trim().toUpperCase();
  if (raw === 'ADMIN') return 'ADMIN';
  if (raw === 'RESPONSABLE' || raw === 'RESPONSABLE_MAINTENANCE') return 'RESPONSABLE_MAINTENANCE';
  if (raw === 'RESPONSABLE_MAGASIN' || raw === 'MAGASINIER') return 'RESPONSABLE_MAGASIN';
  if (raw === 'TECHNICIEN') return 'TECHNICIEN';
  if (raw === 'OPERATEUR') return 'OPERATEUR';
  return 'VIEWER';
}

export function getQuickTrackForUser(
  user: AuthActorInput,
  workspaceProfile: WorkspaceProfile = loadWorkspaceProfile()
): {
  role: CanonicalGuideRole | 'SOLO_EXPERT';
  steps: readonly RoleQuickTrackStep[];
} {
  const role = resolveCanonicalGuideRole(user);
  if (workspaceProfile?.preset === 'SOLO_EXPERT' && role === 'ADMIN') {
    return {
      role: 'SOLO_EXPERT',
      steps: SOLO_EXPERT_QUICK_TRACK,
    };
  }
  return {
    role,
    steps: ROLE_QUICK_TRACKS[role],
  };
}

