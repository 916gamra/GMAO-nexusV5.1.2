import { useState, useEffect, type ComponentType } from 'react';
import { storageService } from '../../../utils/storageService';
import SortieEntreeIcon from '../common/SortieEntreeIcon';
import PWAInstallButton from '../common/PWAInstallButton';
import {
  LayoutDashboard,
  FileBarChart2,
  Package,
  Tag,
  BadgeCheck,
  MapPin,
  Users,
  GitBranch,
  BookOpen,
  Database,
  Factory,
  Warehouse,
  Lightbulb,
  Settings,
  Settings2,
  Sun,
  Moon,
  LogOut,
  FingerprintPattern,
  Boxes,
  Calendar,
  Wrench,
  Download,
  Upload,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  Clock,
  PanelLeftClose,
} from 'lucide-react';
import { HubIcon } from '../common/icons/HubIcon';
import { CategoryIcon } from '../common/icons/CategoryIcon';
import PartInfoIcon from '../common/icons/PartInfoIcon';
import { SpokeIcon } from '../common/icons/SpokeIcon';
import { CubeIcon } from '../common/icons/CubeIcon';
import { LayersIcon } from '../common/icons/LayersIcon';
import { AuthorizationService } from '../../../core/security/AuthorizationService';
import { isTechnicianRole } from '../../../core/security/technicianScope';
import { canViewMakerCheckerValidation } from './appearanceBootstrap';
import { PARENT_MODULES, SIDEBAR_NAV_GROUPS, type ParentModuleDef } from './navConfig';
import { useTranslation } from '../../../i18n/I18nContext';

interface SidebarItemVisualMeta {
  icon?: ComponentType<{ className?: string }>;
  isSubItem?: boolean;
  l1ColorLight?: string;
  l1ColorDark?: string;
  labelKey?: string;
  defaultLabel?: string;
  hideForTech?: boolean;
  testId?: string;
  truncate?: boolean;
  useSortieIcon?: boolean;
}

const SIDEBAR_ITEM_VISUALS: Record<string, SidebarItemVisualMeta> = {
  dashboard: {
    icon: LayoutDashboard,
    isSubItem: false,
    l1ColorLight: 'text-blue-600',
    l1ColorDark: 'text-blue-400',
    labelKey: 'nav.dashboard',
    defaultLabel: 'Dashboard',
  },
  validation_center: {
    icon: ShieldCheck,
    isSubItem: true,
    hideForTech: true,
    testId: 'sidebar-validation-center-btn',
    labelKey: 'nav.subtabs.validation_center_short',
    defaultLabel: 'Centre de Validation',
  },
  shift_weekly_report: {
    icon: Clock,
    isSubItem: true,
    hideForTech: true,
    labelKey: 'nav.subtabs.shift_weekly_report',
    defaultLabel: 'Rapport Vacation / Hebdo',
  },
  executive_report: {
    icon: FileBarChart2,
    isSubItem: true,
    labelKey: 'nav.subtabs.executive_report',
    defaultLabel: 'Rapport Mensuel Exécutif',
  },
  finance: {
    icon: Landmark,
    isSubItem: true,
    l1ColorLight: 'text-emerald-600',
    l1ColorDark: 'text-emerald-400',
    labelKey: 'nav.finance',
    defaultLabel: 'Pilotage Coûts & Budgets',
  },
  stock: {
    icon: Package,
    isSubItem: false,
    l1ColorLight: 'text-cyan-600',
    l1ColorDark: 'text-cyan-400',
    labelKey: 'nav.subtabs.stock',
    defaultLabel: 'Stock (Articles)',
  },
  sortie: {
    isSubItem: true,
    useSortieIcon: true,
    labelKey: 'nav.subtabs.sortie',
    defaultLabel: 'Sortie & Entrée Rapide',
  },
  pdr_groups: {
    icon: Boxes,
    isSubItem: true,
    labelKey: 'nav.subtabs.pdr_groups',
    defaultLabel: 'Groupes PDR',
  },
  types: {
    icon: Tag,
    isSubItem: true,
    labelKey: 'nav.subtabs.types',
    defaultLabel: 'Types',
  },
  designations: {
    icon: BadgeCheck,
    isSubItem: true,
    labelKey: 'nav.subtabs.designations',
    defaultLabel: 'Désignations',
  },
  machines: {
    icon: Factory,
    isSubItem: false,
    l1ColorLight: 'text-emerald-600',
    l1ColorDark: 'text-emerald-400',
    labelKey: 'nav.subtabs.machines',
    defaultLabel: 'Machines Registered',
  },
  families: {
    icon: HubIcon,
    isSubItem: true,
    labelKey: 'nav.subtabs.families',
    defaultLabel: 'Familles Machines',
  },
  templates: {
    icon: CategoryIcon,
    isSubItem: true,
    labelKey: 'nav.subtabs.templates',
    defaultLabel: 'Templates Machines',
  },
  blueprints: {
    icon: FingerprintPattern,
    isSubItem: true,
    labelKey: 'nav.subtabs.blueprints',
    defaultLabel: 'Blueprint Machine',
  },
  preventive: {
    icon: Calendar,
    isSubItem: false,
    l1ColorLight: 'text-indigo-600',
    l1ColorDark: 'text-indigo-400',
    labelKey: 'nav.subtabs.preventive',
    defaultLabel: 'Planning Préventif',
  },
  preventive_referentiel: {
    icon: Settings2,
    isSubItem: true,
    labelKey: 'nav.subtabs.preventive_referentiel',
    defaultLabel: 'Ingénierie & Référentiel',
  },
  corrective: {
    icon: Wrench,
    isSubItem: false,
    l1ColorLight: 'text-amber-600',
    l1ColorDark: 'text-amber-400',
    labelKey: 'nav.subtabs.corrective',
    defaultLabel: 'Correctif Hub',
  },
  corrective_referentiel: {
    icon: Database,
    isSubItem: true,
    truncate: true,
    labelKey: 'nav.subtabs.corrective_referentiel',
    defaultLabel: 'Catalogue',
  },
  entrepot: {
    icon: Warehouse,
    isSubItem: false,
    l1ColorLight: 'text-indigo-600',
    l1ColorDark: 'text-indigo-400',
    labelKey: 'nav.subtabs.entrepot',
    defaultLabel: 'Entrepôt (Inventaire)',
  },
  comp_groups: {
    icon: Boxes,
    isSubItem: true,
    labelKey: 'nav.subtabs.comp_groups',
    defaultLabel: 'Groupes (Composants)',
  },
  comp_families: {
    icon: SpokeIcon,
    isSubItem: true,
    labelKey: 'nav.subtabs.comp_families',
    defaultLabel: 'Familles (Composants)',
  },
  comp_templates: {
    icon: CubeIcon,
    isSubItem: true,
    labelKey: 'nav.subtabs.comp_templates',
    defaultLabel: 'Templates (Composants)',
  },
  part_groups: {
    icon: Boxes,
    isSubItem: true,
    labelKey: 'nav.subtabs.part_groups',
    defaultLabel: 'Groupes (Parts)',
  },
  part_types: {
    icon: LayersIcon,
    isSubItem: true,
    labelKey: 'nav.subtabs.part_types',
    defaultLabel: 'Types (Parts)',
  },
  part_designations: {
    icon: PartInfoIcon,
    isSubItem: true,
    labelKey: 'nav.subtabs.part_designations',
    defaultLabel: 'Désignations (Parts)',
  },
  zones: {
    icon: MapPin,
    isSubItem: false,
    l1ColorLight: 'text-purple-600',
    l1ColorDark: 'text-purple-400',
    labelKey: 'nav.subtabs.zones',
    defaultLabel: 'Zones & Ateliers',
  },
  utilisateurs: {
    icon: Users,
    isSubItem: true,
    l1ColorLight: 'text-violet-600',
    l1ColorDark: 'text-violet-400',
    labelKey: 'nav.subtabs.utilisateurs',
    defaultLabel: 'Utilisateurs (Membres)',
  },
  equipment: {
    icon: ShieldAlert,
    isSubItem: true,
    l1ColorLight: 'text-amber-600',
    l1ColorDark: 'text-amber-400',
    labelKey: 'nav.subtabs.equipment',
    defaultLabel: 'Équipements (Système Général)',
  },
  nexus: {
    icon: GitBranch,
    isSubItem: false,
    l1ColorLight: 'text-emerald-600',
    l1ColorDark: 'text-emerald-400',
    labelKey: 'nav.subtabs.nexus',
    defaultLabel: 'Nexus Matrix',
  },
  guide: {
    icon: BookOpen,
    isSubItem: false,
    l1ColorLight: 'text-amber-600',
    l1ColorDark: 'text-amber-400',
    labelKey: 'nav.subtabs.guide',
    defaultLabel: "Guide d'utilisation",
  },
};

const PARENT_MODULE_BY_ID: ReadonlyMap<string, ParentModuleDef> = new Map(
  PARENT_MODULES.map((mod) => [mod.id, mod])
);

export default function MobileSidebarDrawer({
  isFixedDesktop = false,
  desktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
  currentTab,
  setCurrentTab,
  mobileMenuOpen,
  setMobileMenuOpen,
  counts = {} as Record<string, any>,
  currentUser,
  fileInputRef,
  _handleImportFile,
  handleImportFile: _unusedHandleImportFile,
  handleExportExcel,
  onLogout,
}: any) {
  const { t } = useTranslation();
  // Sidebar Dark / Light Theme state (persisted in storageService — NH-5 unified default 'light')
  const [sidebarTheme, setSidebarTheme] = useState(() => {
    return (
      storageService.getItem('gmao_sidebar_theme') ||
      storageService.getItem('gmao_theme') ||
      'light'
    );
  });

  const canAccess = (tabId) => Boolean(currentUser) && AuthorizationService.canAccessTab(currentUser, tabId);
  const canExportData =
    Boolean(currentUser) &&
    (AuthorizationService.hasPermission(currentUser, 'stock.export') ||
      AuthorizationService.hasPermission(currentUser, 'report.export'));
  const canImportData =
    Boolean(currentUser) &&
    (AuthorizationService.hasPermission(currentUser, 'settings.restore') ||
      AuthorizationService.hasPermission(currentUser, 'settings.manage'));
  const isTechUser = isTechnicianRole(currentUser);
  const canViewValidation = canViewMakerCheckerValidation(currentUser);
  const pendingSortieDemands = canViewValidation ? Number(counts.pendingSortieDemands || 0) : 0;
  const pendingPreventiveVal = canViewValidation ? Number(counts.pendingPreventiveValidation || 0) : 0;
  const pendingCorrectiveVal = canViewValidation ? Number(counts.pendingCorrectiveValidation || 0) : 0;

  useEffect(() => {
    const handleAppearanceChanged = (e) => {
      if (e?.detail?.theme) {
        setSidebarTheme(e.detail.theme);
      }
    };
    window.addEventListener('gmao_appearance_changed', handleAppearanceChanged);
    return () => window.removeEventListener('gmao_appearance_changed', handleAppearanceChanged);
  }, []);

  useEffect(() => {
    storageService.setItem('gmao_sidebar_theme', sidebarTheme);
  }, [sidebarTheme]);

  // Accessibility: Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, setMobileMenuOpen]);

  // NH-5: Broadcast theme change so FloatingSidebar and AppearanceLayoutSelector stay in sync
  const toggleSidebarTheme = () => {
    setSidebarTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      storageService.setItem('gmao_sidebar_theme', next);
      storageService.setItem('gmao_theme', next);
      window.dispatchEvent(
        new CustomEvent('gmao_appearance_changed', {
          detail: { theme: next },
        })
      );
      return next;
    });
  };

  const navTo = (tab) => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
  };

  const isDark = sidebarTheme === 'dark';

  const isTabRouteActive = (tabName) => {
    if (currentTab === tabName) return true;
    if (tabName === 'settings' && currentTab === 'appearance') return true;
    if (tabName === 'designations' && currentTab === 'diagnostics') return true;
    if (
      tabName === 'corrective' &&
      String(currentTab || '').startsWith('corrective_') &&
      currentTab !== 'corrective_referentiel'
    ) {
      return true;
    }
    if (
      tabName === 'preventive' &&
      String(currentTab || '').startsWith('preventive_') &&
      currentTab !== 'preventive_referentiel'
    ) {
      return true;
    }
    return false;
  };

  const renderItemBadge = (itemId: string) => {
    const totalPendingVal = pendingSortieDemands + pendingPreventiveVal + pendingCorrectiveVal;
    switch (itemId) {
      case 'dashboard':
        return <span className={getBadgeClass('dashboard')}>KPI</span>;
      case 'validation_center':
        return totalPendingVal > 0 ? (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-rose-600 text-white font-black shadow-2xs"
            title="Total en attente de validation (Maker-Checker)"
          >
            {totalPendingVal} {t('nav.groups.to_validate', 'À valider')}
          </span>
        ) : (
          <span className={getBadgeClass('validation_center')}>
            {t('nav.groups.up_to_date', 'À jour')}
          </span>
        );
      case 'shift_weekly_report':
        return <span className={getBadgeClass('shift_weekly_report')}>Exploit.</span>;
      case 'executive_report':
        return <span className={getBadgeClass('executive_report')}>Direction</span>;
      case 'finance':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-emerald-100 text-emerald-800 font-bold">
            ISO 4217
          </span>
        );
      case 'stock':
        return <span className={getBadgeClass('stock')}>{counts.stock ?? 0}</span>;
      case 'sortie':
        return (
          <span className="flex items-center gap-1">
            {pendingSortieDemands > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-rose-600 text-white font-black shadow-2xs"
                title={`${pendingSortieDemands} demande(s) de sortie à valider`}
              >
                {pendingSortieDemands} {t('nav.groups.to_validate', 'À valider')}
              </span>
            )}
            <span className={getBadgeClass('sortie')}>Mvt</span>
          </span>
        );
      case 'pdr_groups':
        return (
          <span className={getBadgeClass('pdr_groups')}>
            {counts.pdr_groups ?? counts.pdrGroups ?? 0}
          </span>
        );
      case 'types':
        return <span className={getBadgeClass('types')}>{counts.types ?? 0}</span>;
      case 'designations':
        return (
          <span className={getBadgeClass('designations')}>
            {counts.designations ?? counts.diagnostics ?? 0}
          </span>
        );
      case 'machines':
        return <span className={getBadgeClass('machines')}>{counts.machines ?? 0}</span>;
      case 'families':
        return <span className={getBadgeClass('families')}>{counts.families ?? 0}</span>;
      case 'templates':
        return <span className={getBadgeClass('templates')}>{counts.templates ?? 0}</span>;
      case 'blueprints':
        return <span className={getBadgeClass('blueprints')}>{counts.blueprints ?? 0}</span>;
      case 'preventive':
        return (
          <span className="flex items-center gap-1">
            {pendingPreventiveVal > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-amber-500 text-slate-950 font-black shadow-2xs"
                title={`${pendingPreventiveVal} exécution(s) préventive(s) à valider`}
              >
                {pendingPreventiveVal} {t('nav.groups.to_validate', 'À valider')}
              </span>
            )}
            <span className={getBadgeClass('preventive')}>{counts.preventive ?? 0}</span>
          </span>
        );
      case 'preventive_referentiel':
        return (
          <span className={getBadgeClass('preventive_referentiel')}>
            {(counts.preventiveGuides || 0) + (counts.preventiveActions || 0) || 'Guides'}
          </span>
        );
      case 'corrective':
        return (
          <span className="flex items-center gap-1">
            {pendingCorrectiveVal > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-rose-600 text-white font-black shadow-2xs"
                title={`${pendingCorrectiveVal} intervention(s) corrective(s) à valider`}
              >
                {pendingCorrectiveVal} {t('nav.groups.to_validate', 'À valider')}
              </span>
            )}
            <span className={getBadgeClass('corrective')}>{counts.corrective || 'Live'}</span>
          </span>
        );
      case 'corrective_referentiel':
        return <span className={getBadgeClass('corrective_referentiel')}>Réf</span>;
      case 'entrepot':
        return (
          <span className={getBadgeClass('entrepot')} data-testid="sidebar-entrepot-count">
            {counts.warehouse ?? counts.entrepot ?? 0}
          </span>
        );
      case 'comp_groups':
        return <span className={getBadgeClass('comp_groups')}>{counts.compGroups ?? 0}</span>;
      case 'comp_families':
        return <span className={getBadgeClass('comp_families')}>{counts.compFamilies ?? 0}</span>;
      case 'comp_templates':
        return <span className={getBadgeClass('comp_templates')}>{counts.compTemplates ?? 0}</span>;
      case 'part_groups':
        return (
          <span className={getBadgeClass('part_groups')}>
            {counts.part_groups ?? counts.partGroups ?? 0}
          </span>
        );
      case 'part_types':
        return <span className={getBadgeClass('part_types')}>{counts.partTypes ?? 0}</span>;
      case 'part_designations':
        return (
          <span className={getBadgeClass('part_designations')}>
            {counts.partDesignations ?? 0}
          </span>
        );
      case 'zones':
        return <span className={getBadgeClass('zones')}>{counts.zones ?? 0}</span>;
      case 'utilisateurs':
        return (
          <span className={getBadgeClass('utilisateurs')}>
            {(counts.technicians || 0) + (counts.operations || 0)}
          </span>
        );
      case 'equipment':
        return <span className={getBadgeClass('equipment')}>{counts.equipment ?? 0}</span>;
      default:
        return null;
    }
  };

  // Dynamic styling based on sidebarTheme
  const getTabClass = (tabName, isSubItem = false) => {
    const isActive = isTabRouteActive(tabName);
    const basePadding = isSubItem ? 'pl-6 pr-3 py-2' : 'px-3 py-2.5';

    if (isDark) {
      if (isActive) {
        return `w-full flex items-center justify-between ${basePadding} rounded-xl text-[13px] font-bold bg-white text-slate-900 shadow-sm transition-all duration-150 cursor-pointer`;
      }
      return `w-full flex items-center justify-between ${basePadding} rounded-xl text-[13px] ${
        isSubItem ? 'font-normal text-slate-300' : 'font-semibold text-slate-100'
      } hover:text-white hover:bg-slate-800/80 transition-all duration-150 cursor-pointer`;
    } else {
      if (isActive) {
        return `w-full flex items-center justify-between ${basePadding} rounded-xl text-[13px] font-bold bg-slate-900 text-white shadow-sm transition-all duration-150 cursor-pointer`;
      }
      return `w-full flex items-center justify-between ${basePadding} rounded-xl text-[13px] ${
        isSubItem ? 'font-normal text-slate-600' : 'font-semibold text-slate-800'
      } hover:text-slate-900 hover:bg-slate-100 transition-all duration-150 cursor-pointer`;
    }
  };

  // Badge styling
  const getBadgeClass = (tabName) => {
    const isActive = isTabRouteActive(tabName);
    if (isDark) {
      if (isActive) {
        return 'text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-900 text-white font-bold';
      }
      return 'text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-400 font-medium group-hover:bg-slate-700 group-hover:text-slate-200';
    } else {
      if (isActive) {
        return 'text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-100 font-bold';
      }
      return 'text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-100 text-slate-500 font-medium group-hover:bg-slate-200';
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container - Exact Rich Original Design (Fixed/Collapsible on Desktop if isFixedDesktop, Drawer on Mobile) */}
      <aside
        role={isFixedDesktop ? 'navigation' : 'dialog'}
        aria-modal={isFixedDesktop ? undefined : 'true'}
        aria-label="Menu principal de navigation"
        className={`fixed top-0 bottom-0 left-0 z-40 w-[270px] flex flex-col transition-all duration-200 ease-in-out select-none ${
          isFixedDesktop
            ? desktopSidebarCollapsed
              ? (mobileMenuOpen ? 'translate-x-0' : '-translate-x-full')
              : (mobileMenuOpen ? 'translate-x-0' : 'max-lg:-translate-x-full lg:translate-x-0')
            : (mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:hidden')
        } ${
          isDark
            ? 'bg-slate-900 text-white border-r border-slate-800 shadow-xl'
            : 'bg-white text-slate-800 border-r border-slate-200 shadow-xs'
        }`}
      >

        {/* Brand Header with Dedicated Offline SVG Excel GMAO Icon */}
        <div
          id="sidebar-header-brand"
          className={`h-16 px-4 flex items-center justify-between border-b shrink-0 ${
            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-zinc-200/90 bg-white'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Custom Modern Excel Icon: 3D-styled green workbook with iconic X and grid */}
            <div
              id="excel-brand-logo"
              className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-md shrink-0 ring-2 ring-emerald-500/30 overflow-hidden"
            >
              {/* Excel Grid Texture Behind */}
              <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:5px_5px]" />

              {/* Excel Badge & Symbol */}
              <svg
                id="excel-svg-icon"
                className="w-6 h-6 text-white relative z-10 drop-shadow-xs"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Excel Workbook Sheet */}
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="3.5"
                  fill="currentColor"
                  fillOpacity="0.15"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                {/* Spreadsheet inner division */}
                <line
                  x1="9.5"
                  y1="3"
                  x2="9.5"
                  y2="21"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeOpacity="0.6"
                  strokeDasharray="1.5 1.5"
                />
                <line
                  x1="3"
                  y1="9.5"
                  x2="21"
                  y2="9.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeOpacity="0.6"
                  strokeDasharray="1.5 1.5"
                />
                <line
                  x1="3"
                  y1="15.5"
                  x2="21"
                  y2="15.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeOpacity="0.6"
                  strokeDasharray="1.5 1.5"
                />
                {/* The Classic Excel 'X' Symbol in left panel */}
                <path
                  d="M12.5 7.5L18 16.5M18 7.5L12.5 16.5"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Left Mini Data Bars */}
                <rect x="5" y="6" width="3" height="1.8" rx="0.5" fill="currentColor" />
                <rect x="5" y="11" width="3" height="1.8" rx="0.5" fill="currentColor" />
                <rect x="5" y="16" width="3" height="1.8" rx="0.5" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div
                id="brand-title-text"
                className={`font-bold text-[15px] tracking-tight leading-tight flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}
              >
                <span>Ciob PDR</span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  XLS
                </span>
              </div>
              <div
                className={`text-[11px] font-semibold tracking-tight ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}
              >
                {t('app.subtitle', 'Pièces de Rechange & GMAO')}
              </div>
            </div>
          </div>
          {/* Mobile/Tablet Drawer Close Button (<1024px) */}
          <button
            type="button"
            data-testid="mobile-drawer-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex lg:hidden group w-8 h-8 rounded-full border items-center justify-center transition-all duration-200 cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-hidden ${
              isDark
                ? 'bg-slate-800/80 hover:bg-slate-700/90 border-slate-700/90 hover:border-slate-600 text-slate-300 hover:text-white shadow-2xs'
                : 'bg-slate-50/95 hover:bg-slate-100 border-slate-200/90 hover:border-slate-300 text-slate-500 hover:text-slate-900 shadow-2xs hover:shadow-xs'
            }`}
            title={t('common.close', 'Fermer le menu')}
            aria-label={t('common.close', 'Fermer le menu')}
          >
            <PanelLeftClose className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          </button>

          {/* Desktop Fixed Sidebar Collapse Button (>=1024px, completely decoupled from mobileMenuOpen) */}
          {isFixedDesktop && onToggleDesktopSidebar && (
            <button
              type="button"
              data-testid="desktop-sidebar-collapse-btn"
              onClick={() => {
                if (mobileMenuOpen) setMobileMenuOpen(false);
                onToggleDesktopSidebar();
              }}
              className={`hidden lg:flex group w-8 h-8 rounded-full border items-center justify-center transition-all duration-200 cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-hidden ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-700/90 border-slate-700/90 hover:border-slate-600 text-slate-300 hover:text-white shadow-2xs'
                  : 'bg-slate-50/95 hover:bg-slate-100 border-slate-200/90 hover:border-slate-300 text-slate-500 hover:text-slate-900 shadow-2xs hover:shadow-xs'
              }`}
              title={t('nav.collapse_sidebar', 'Réduire le menu latéral')}
              aria-label={t('nav.collapse_sidebar', 'Réduire le menu latéral')}
            >
              <PanelLeftClose className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            </button>
          )}
        </div>

        {/* Navigation Links — Derived dynamically from navConfig SSOT (PARENT_MODULES + SIDEBAR_NAV_GROUPS) */}
        <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4 text-xs">
          {SIDEBAR_NAV_GROUPS.map((group) => {
            const visibleItems = group.moduleIds.flatMap((moduleId) => {
              const mod = PARENT_MODULE_BY_ID.get(moduleId);
              if (!mod) return [];
              return mod.children
                .filter((child) => {
                  const visual = SIDEBAR_ITEM_VISUALS[child.id];
                  if (visual?.hideForTech && isTechUser) return false;
                  return canAccess(child.id);
                })
                .map((child) => ({ child, parentMod: mod }));
            });

            if (visibleItems.length === 0) return null;

            const renderButtons = () =>
              visibleItems.map(({ child, parentMod }) => {
                const visual = SIDEBAR_ITEM_VISUALS[child.id];
                const isSubItem = visual ? Boolean(visual.isSubItem) : child.id !== parentMod.id;
                const isActive = isTabRouteActive(child.id);
                const hasL1Color = Boolean(visual?.l1ColorLight || visual?.l1ColorDark);
                const IconComp = visual?.icon || parentMod.icon;
                const neutralL2Color = isActive
                  ? isDark
                    ? 'text-slate-900'
                    : 'text-white'
                  : isDark
                    ? 'text-slate-400'
                    : 'text-slate-500';
                const labelText = visual?.labelKey
                  ? t(visual.labelKey, visual.defaultLabel || child.label)
                  : child.label;

                return (
                  <button
                    key={child.id}
                    type="button"
                    data-testid={visual?.testId || `sidebar-nav-${child.id}`}
                    onClick={() => navTo(child.id)}
                    className={getTabClass(child.id, isSubItem)}
                  >
                    <span className={`flex items-center ${isSubItem ? 'gap-2' : 'gap-2.5'} min-w-0`}>
                      {visual?.useSortieIcon ? (
                        <SortieEntreeIcon
                          className="w-3.5 h-3.5 shrink-0 sidebar-l2-icon"
                          downColor={neutralL2Color}
                          upColor={neutralL2Color}
                        />
                      ) : (
                        <IconComp
                          className={
                            hasL1Color
                              ? `w-4 h-4 shrink-0 ${isDark ? visual?.l1ColorDark || parentMod.colorDark : visual?.l1ColorLight || parentMod.color}`
                              : `w-3.5 h-3.5 shrink-0 sidebar-l2-icon ${neutralL2Color}`
                          }
                        />
                      )}
                      <span className={visual?.truncate ? 'truncate' : undefined}>{labelText}</span>
                    </span>
                    {renderItemBadge(child.id)}
                  </button>
                );
              });

            if (group.hasTopDivider) {
              return (
                <div
                  key={group.id}
                  className={`space-y-1 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}
                >
                  {renderButtons()}
                </div>
              );
            }

            if (!group.titleKey && !group.defaultTitle) {
              return (
                <div key={group.id} className="space-y-1">
                  {renderButtons()}
                </div>
              );
            }

            return (
              <div key={group.id}>
                <div className="px-3 mb-1.5 text-[10px] font-bold tracking-[0.08em] text-slate-400 uppercase">
                  <span>
                    {group.titleKey
                      ? t(group.titleKey, group.defaultTitle || group.id)
                      : group.defaultTitle}
                  </span>
                </div>
                <div className="space-y-1">{renderButtons()}</div>
              </div>
            );
          })}
        </div>

            {/* Guided Tip Box */}
        <div
          className={`p-3 border-t ${isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}
        >
          <div
            className={`rounded-xl p-3 text-[11.5px] leading-relaxed space-y-1 border ${
              isDark
                ? 'bg-slate-800/80 text-slate-300 border-slate-700/60 shadow-inner'
                : 'bg-white text-slate-600 border-slate-200 shadow-2xs'
            }`}
          >
            <div
              className={`font-semibold flex items-center gap-1.5 text-[12px] ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{t('nav.groups.tip_title', 'Astuce Excel Twin')}</span>
            </div>
            <div
              className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
            >
              {t('nav.groups.tip_body', "• Cliquez sur n'importe quel code (Zone, Famille, Type) pour filtrer les tables associées.")}
            </div>
          </div>
        </div>

        {/* Quick Excel Synchronization for Mobile / Fixed Sidebar (RBAC Guarded — NH-1) */}
        {((handleExportExcel && canExportData) || (fileInputRef && canImportData)) && (
          <div className="px-3 pb-2 flex items-center gap-2">
            {handleExportExcel && canExportData && (
              <button
                onClick={() => {
                  handleExportExcel();
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700 text-emerald-400 hover:bg-slate-700'
                    : 'bg-white border-slate-200 text-emerald-700 hover:bg-emerald-50'
                }`}
                title={t('header.export_excel', 'Export externe Type B (consultation Excel — non réimportable)')}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('common.filters.export_excel', 'Export Excel (Type B)')}</span>
              </button>
            )}
            {fileInputRef && canImportData && (
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
                title={t('header.import_excel', 'Importer un paquet JSON officiel (Type A)')}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t('header.import_excel', 'Import (Type A)')}</span>
              </button>
            )}
          </div>
        )}

        {/* PWA Install Button Container */}
        <div className="px-3 pb-2">
          <PWAInstallButton variant="sidebar" />
        </div>

        {/* Bottom Control Actions: Settings (Parameters) & Light/Dark Theme Switcher */}
        <div
          className={`p-3 border-t flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-slate-100/70'
          }`}
        >
          {/* Settings Button */}
          {canAccess('settings') && (
            <button
              type="button"
              data-testid="sidebar-settings-btn"
              onClick={() => navTo('settings')}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                isTabRouteActive('settings')
                  ? isDark
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'bg-slate-900 text-white shadow-sm'
                  : isDark
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
              title={t('nav.settings', 'Paramètres du système')}
            >
              <Settings
                className={`w-4 h-4 shrink-0 ${
                  isTabRouteActive('settings')
                    ? isDark
                      ? 'text-sky-600'
                      : 'text-sky-400'
                    : isDark
                      ? 'text-sky-400'
                      : 'text-sky-600'
                }`}
              />
              <span>{t('nav.subtabs.settings', 'Paramètres')}</span>
            </button>
          )}

          {/* Light / Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleSidebarTheme}
            className={`p-2 rounded-xl border flex items-center justify-center transition-all duration-150 cursor-pointer ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700 hover:text-amber-300'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs'
            }`}
            title={
              isDark
                ? t('nav.theme_light', 'Passer au mode clair')
                : t('nav.theme_dark', 'Passer au mode sombre')
            }
            aria-label="Toggle Sidebar Theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
        </div>

        {/* User Account Card & Logout Section */}
        {currentUser && (
          <div
            className={`p-3 border-t flex items-center justify-between gap-2 shrink-0 ${
              isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
            }`}
          >
            {/* Account Card */}
            <div
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border min-w-0 flex-1 ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-white'
                  : 'bg-white border-slate-200/90 text-slate-900 shadow-2xs'
              }`}
            >
              <div
                data-testid="sidebar-user-avatar"
                className="w-7 h-7 rounded-lg bg-accent-main text-white font-bold text-[10.5px] flex items-center justify-center shadow-2xs shrink-0"
              >
                {currentUser.avatar || 'RM'}
              </div>
              <div className="text-left leading-tight min-w-0 flex-1">
                <div
                  className={`text-[11.5px] font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                >
                  {currentUser.name}
                </div>
                <div
                  className={`text-[9.5px] font-semibold truncate ${isDark ? 'text-emerald-400' : 'text-accent-main'}`}
                >
                  {currentUser.titleFr || currentUser.role}
                </div>
              </div>
            </div>

            {/* Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className={`p-2 rounded-xl transition shrink-0 cursor-pointer ${
                  isDark
                    ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
                    : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                }`}
                title={t('nav.logout', 'Déconnexion')}
                aria-label={t('nav.logout', 'Déconnexion')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
