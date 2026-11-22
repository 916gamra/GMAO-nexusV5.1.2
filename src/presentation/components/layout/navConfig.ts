import {
  LayoutDashboard,
  Package,
  Factory,
  Warehouse,
  MapPin,
  Users,
  ShieldAlert,
  GitBranch,
  BookOpen,
  Calendar,
  Wrench,
  Landmark,
  Settings,
} from 'lucide-react';
import type React from 'react';

export interface NavChildItem {
  id: string;
  label: string;
}

export interface ParentModuleDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  color: string;
  colorDark: string;
  bgLight: string;
  children: NavChildItem[];
}

export const PARENT_MODULES: ParentModuleDef[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    color: 'text-blue-500',
    colorDark: 'text-blue-400',
    bgLight: 'bg-blue-50',
    children: [
      { id: 'dashboard', label: 'Dashboard Opérations' },
      { id: 'validation_center', label: 'Centre de Validation (À valider)' },
      { id: 'shift_weekly_report', label: 'Rapport Vacation / Hebdo' },
      { id: 'executive_report', label: 'Rapport Mensuel Direction' },
    ],
  },
  {
    id: 'finance',
    label: 'Coûts & Budgets',
    icon: Landmark,
    color: 'text-emerald-500',
    colorDark: 'text-emerald-400',
    bgLight: 'bg-emerald-50',
    children: [{ id: 'finance', label: 'Pilotage Coûts & Budgets' }],
  },
  {
    id: 'stock',
    label: 'Stock PDR',
    icon: Package,
    color: 'text-cyan-500',
    colorDark: 'text-cyan-400',
    bgLight: 'bg-cyan-50',
    children: [
      { id: 'stock', label: 'Stock Articles' },
      { id: 'sortie', label: 'Sortie & Entrée Rapide' },
      { id: 'pdr_groups', label: 'Groupes PDR' },
      { id: 'types', label: 'Types PDR' },
      { id: 'designations', label: 'Désignations PDR' },
    ],
  },
  {
    id: 'machines',
    label: 'Machines',
    icon: Factory,
    color: 'text-emerald-500',
    colorDark: 'text-emerald-400',
    bgLight: 'bg-emerald-50',
    children: [
      { id: 'machines', label: 'Machines Registered' },
      { id: 'families', label: 'Familles' },
      { id: 'templates', label: 'Templates' },
      { id: 'blueprints', label: 'Blueprints' },
    ],
  },
  {
    id: 'preventive',
    label: 'Préventif',
    icon: Calendar,
    color: 'text-indigo-500',
    colorDark: 'text-indigo-400',
    bgLight: 'bg-indigo-50',
    children: [
      { id: 'preventive', label: 'Planning Préventif' },
      { id: 'preventive_referentiel', label: 'Ingénierie & Référentiel' },
    ],
  },
  {
    id: 'corrective',
    label: 'Correctif Nexus',
    icon: Wrench,
    color: 'text-amber-500',
    colorDark: 'text-amber-400',
    bgLight: 'bg-amber-50',
    children: [
      { id: 'corrective', label: 'Correctif Hub' },
      { id: 'corrective_referentiel', label: 'Catalogue' },
    ],
  },
  {
    id: 'entrepot',
    label: 'Entrepôt',
    icon: Warehouse,
    color: 'text-indigo-500',
    colorDark: 'text-indigo-400',
    bgLight: 'bg-indigo-50',
    children: [
      { id: 'entrepot', label: 'Stock Entrepôt' },
      { id: 'comp_groups', label: 'Groupes Composants' },
      { id: 'comp_families', label: 'Familles Composants' },
      { id: 'comp_templates', label: 'Templates Composants' },
      { id: 'part_groups', label: 'Groupes Parts' },
      { id: 'part_types', label: 'Types Parts' },
      { id: 'part_designations', label: 'Désignations Parts' },
    ],
  },
  {
    id: 'zones',
    label: 'Zones & Ateliers',
    icon: MapPin,
    color: 'text-purple-500',
    colorDark: 'text-purple-400',
    bgLight: 'bg-purple-50',
    children: [{ id: 'zones', label: 'Zones & Ateliers' }],
  },
  {
    id: 'utilisateurs',
    label: 'Utilisateurs',
    icon: Users,
    color: 'text-violet-500',
    colorDark: 'text-violet-400',
    bgLight: 'bg-violet-50',
    children: [{ id: 'utilisateurs', label: 'Utilisateurs & Rôles' }],
  },
  {
    id: 'equipment',
    label: 'Équipements',
    icon: ShieldAlert,
    color: 'text-amber-500',
    colorDark: 'text-amber-400',
    bgLight: 'bg-amber-50',
    children: [{ id: 'equipment', label: 'Équipements & Système Général' }],
  },
  {
    id: 'nexus',
    label: 'Nexus Matrix',
    icon: GitBranch,
    color: 'text-emerald-500',
    colorDark: 'text-emerald-400',
    bgLight: 'bg-emerald-50',
    children: [{ id: 'nexus', label: 'Nexus Matrix' }],
  },
  {
    id: 'guide',
    label: 'Guide & Manuel',
    icon: BookOpen,
    color: 'text-amber-500',
    colorDark: 'text-amber-400',
    bgLight: 'bg-amber-50',
    children: [{ id: 'guide', label: "Guide d'utilisation" }],
  },
];

/**
 * Dedicated Settings parent module decoupled from Guide & Manuel.
 * Rendered in the bottom system toolbar (FloatingSidebar & MobileSidebarDrawer)
 * while owning its own clean Header breadcrumbs and sub-tabs (Paramètres | Apparence).
 */
export const SETTINGS_PARENT_MODULE: ParentModuleDef = {
  id: 'settings',
  label: 'Paramètres',
  icon: Settings,
  color: 'text-sky-700',
  colorDark: 'text-sky-400',
  bgLight: 'bg-sky-50',
  children: [
    { id: 'settings', label: 'Paramètres' },
    { id: 'appearance', label: 'Apparence & Ergonomie' },
  ],
};

export interface SidebarNavGroupDef {
  id: string;
  titleKey?: string;
  defaultTitle?: string;
  hasTopDivider?: boolean;
  /** References canonical PARENT_MODULES IDs in exact display order (SSOT). */
  moduleIds: readonly string[];
}

/**
 * Single Source of Truth grouping for MobileSidebarDrawer / Fixed Standard Sidebar.
 * All navigation links are derived from PARENT_MODULES — never manually duplicated.
 */
export const SIDEBAR_NAV_GROUPS: readonly SidebarNavGroupDef[] = [
  {
    id: 'pilotage',
    moduleIds: ['dashboard', 'finance'],
  },
  {
    id: 'stock_articles',
    titleKey: 'nav.groups.stock_articles',
    defaultTitle: 'Stock & Articles',
    moduleIds: ['stock'],
  },
  {
    id: 'parc_machines',
    titleKey: 'nav.groups.parc_machines',
    defaultTitle: 'Parc Machines',
    moduleIds: ['machines'],
  },
  {
    id: 'maintenance_preventive',
    titleKey: 'nav.groups.maintenance_preventive',
    defaultTitle: 'Maintenance & Préventif',
    moduleIds: ['preventive'],
  },
  {
    id: 'maintenance_corrective',
    titleKey: 'nav.groups.maintenance_corrective',
    defaultTitle: 'Maintenance Corrective',
    moduleIds: ['corrective'],
  },
  {
    id: 'groupe_entrepot',
    titleKey: 'nav.groups.groupe_entrepot',
    defaultTitle: 'Groupe Entrepôt',
    moduleIds: ['entrepot'],
  },
  {
    id: 'zones_equipes',
    titleKey: 'nav.groups.zones_equipes',
    defaultTitle: 'Zones & Équipes',
    moduleIds: ['zones', 'utilisateurs', 'equipment'],
  },
  {
    id: 'outils_referentiel',
    hasTopDivider: true,
    moduleIds: ['nexus', 'guide'],
  },
];

export function getParentModuleForTab(currentTab?: string): ParentModuleDef {
  const cleanTab = String(currentTab || 'dashboard').trim();
  if (cleanTab === 'settings' || cleanTab === 'appearance') {
    return SETTINGS_PARENT_MODULE;
  }
  if (cleanTab === 'diagnostics') {
    return PARENT_MODULES.find((p) => p.id === 'stock') || PARENT_MODULES[0];
  }
  if (cleanTab.startsWith('corrective_')) {
    return PARENT_MODULES.find((p) => p.id === 'corrective') || PARENT_MODULES[0];
  }
  if (cleanTab.startsWith('preventive_')) {
    return PARENT_MODULES.find((p) => p.id === 'preventive') || PARENT_MODULES[0];
  }
  const match = PARENT_MODULES.find((p) => p.children.some((c) => c.id === cleanTab));
  return match || PARENT_MODULES[0];
}
