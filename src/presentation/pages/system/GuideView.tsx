import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import AnimatedPage from '../../components/common/AnimatedPage';
import PageHeaderIcon from '../../components/common/PageHeaderIcon';
import Action3DButton from '../../components/common/Action3DButton';
import {
  BookOpen,
  Boxes,
  Search,
  ExternalLink,
  Code2,
  UserCheck,
  Layers,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  FileText,
  ArrowUpRight,
  Cpu,
  Wrench,
  CalendarClock,
  Factory,
  BarChart3,
  Settings,
  LayoutGrid,
  X,
  Compass,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useTranslation } from '../../../i18n/I18nContext';
import {
  canNavigateToGuideTab,
  executeGuideTabNavigation,
  findGuideDocForTab,
  getQuickTrackForUser,
  resolveGuideInternalHref,
} from './guideNavigation';

interface GuideViewProps {
  onNavigateToTab?: (tabId: string) => void;
}

interface ParsedMarkdownDoc {
  id: string;
  groupId: string;
  groupTitle: string;
  docType: 'architecture' | 'page';
  audience: 'developer' | 'user';
  tabId?: string;
  title: string;
  subtitle?: string;
  summary: string;
  relatedTabs: string[];
  body: string;
  filePath: string;
}

type GuideLang = 'fr' | 'ar' | 'en';

interface RoadmapGroupMeta {
  groupId: string;
  number: string;
  title: Record<GuideLang, string>;
  description: Record<GuideLang, string>;
  icon: React.ComponentType<{ className?: string }>;
  tabs: { tabId: string; label: string }[];
}

const MODULE_ROADMAP: RoadmapGroupMeta[] = [
  {
    groupId: '01-stock-pdr',
    number: '01',
    title: {
      fr: 'Stock PDR, Mouvements & Commandes (PO)',
      ar: 'مخزون قطع الغيار (PDR) والحركات وأوامر الشراء (PO)',
      en: 'Spare Parts Stock (PDR), Movements & Purchase Orders',
    },
    description: {
      fr: 'Catalogue articles PDR (hiérarchie 3 niveaux Groupes ➔ Types ➔ Désignations/SKU, colonnes P2/P3), moteur O(1) IncrementalStockIndex, réservations Maker-Checker, 5 flux magasin et commandes fournisseurs (PO).',
      ar: 'كتالوج قطع الغيار (هرمية 3 مستويات)، محرك الحساب الفوري IncrementalStockIndex، اعتمادات Maker-Checker، تدفقات المخزن الخمسة وأوامر الشراء (PO).',
      en: '3-level PDR catalog (Groups ➔ Types ➔ Designations/SKU), O(1) IncrementalStockIndex engine, Maker-Checker reservations, 5 store workflows, and supplier POs.',
    },
    icon: Boxes,
    tabs: [
      { tabId: 'stock', label: 'Stock Articles & PO' },
      { tabId: 'sortie', label: 'Sortie & Entrée Rapide' },
      { tabId: 'pdr_groups', label: 'Groupes PDR' },
      { tabId: 'types', label: 'Types PDR' },
      { tabId: 'designations', label: 'Désignations PDR' },
    ],
  },
  {
    groupId: '02-parc-machines',
    number: '02',
    title: {
      fr: 'Parc Machines, Blueprints & Architecture 3-Tiers',
      ar: 'حظيرة الآلات والمخططات المعرفية (Blueprints) والهندسة ثلاثية الطبقات',
      en: 'Machine Fleet, Blueprints & 3-Tier Architecture',
    },
    description: {
      fr: 'Machines enregistrées, hiérarchie opérationnelle (MACHINE / LINE), Familles, Modèles constructeurs, Blueprints cognitifs et Passeport Santé.',
      ar: 'الآلات المسجلة، تجميع الخطوط التشغيلية (MACHINE / LINE)، العائلات، نماذج المصنّعين، المخططات المعرفية وجواز صحة المعدة.',
      en: 'Registered machines, operational line grouping (MACHINE / LINE), Families, OEM Templates, cognitive Blueprints, and Asset Health Passport.',
    },
    icon: Factory,
    tabs: [
      { tabId: 'machines', label: 'Machines Enregistrées' },
      { tabId: 'families', label: 'Familles de Machines' },
      { tabId: 'templates', label: 'Modèles (Templates)' },
      { tabId: 'blueprints', label: 'Blueprints Machines' },
      { tabId: 'nexus', label: 'Arborescence Nexus' },
    ],
  },
  {
    groupId: '03-preventive-meters',
    number: '03',
    title: {
      fr: 'Maintenance Préventive & Compteurs (Meter PM)',
      ar: 'الصيانة الوقائية ومتابعة العدادات (Meter PM)',
      en: 'Preventive Maintenance & Operating Meters',
    },
    description: {
      fr: 'Matrice annuelle 12 mois, exécutions horodatées (PreventiveExecution), suivi par compteurs (heures/cycles) et référentiel d’ingénierie préventive.',
      ar: 'مصفوفة سنوية من 12 شهراً، سجل تنفيذ مؤرّخ (PreventiveExecution)، صيانة بالعدادات (ساعات/دورات) ومرجعية الهندسة الوقائية.',
      en: '12-month annual matrix, dated execution history (PreventiveExecution), hour/cycle meter triggers, and preventive engineering catalog.',
    },
    icon: CalendarClock,
    tabs: [
      { tabId: 'preventive', label: 'Planning & Compteurs Préventifs' },
      { tabId: 'preventive_referentiel', label: 'Ingénierie & Référentiel Préventif' },
    ],
  },
  {
    groupId: '04-corrective-di-bt',
    number: '04',
    title: {
      fr: 'Maintenance Corrective (DI / BT, Atelier Mécanique & Clôture)',
      ar: 'الصيانة العلاجية (DI / BT، الورشة الميكانيكية والإغلاق)',
      en: 'Corrective Maintenance (DI / WO, Workshop & Closure)',
    },
    description: {
      fr: 'Cycle complet Demande d’Intervention (DI) ➔ Bon de Travail (BT) ➔ Intervention Live ➔ Atelier Fabrication Mécanique (BR / Rectification) ➔ Clôture, machine à états finis et Pareto.',
      ar: 'الدورة الكاملة من طلب التدخل (DI) إلى أمر العمل (BT) والتنفيذ الحي والورشة الميكانيكية (BR / RECT) ثم الإغلاق وتحليل Pareto.',
      en: 'Full workflow from Intervention Request (DI) ➔ Work Order (WO) ➔ Live Timer ➔ Mechanical Workshop (BR / RECT) ➔ Closure, state machine, and Pareto.',
    },
    icon: Wrench,
    tabs: [
      { tabId: 'corrective_di', label: 'Demandes d’Intervention (DI)' },
      { tabId: 'corrective_bt', label: 'Bons de Travail (BT)' },
      { tabId: 'corrective_live', label: 'Intervention Live (Chrono)' },
      { tabId: 'corrective_atelier', label: 'Atelier Mécanique (BR / RECT)' },
      { tabId: 'corrective_cloture', label: 'Clôture & Retour d’Expérience' },
      { tabId: 'corrective_history', label: 'Historique & Pièces Correctives' },
      { tabId: 'corrective_referentiel', label: 'Catalogue Symptômes / Causes' },
    ],
  },
  {
    groupId: '05-entrepot-organes',
    number: '05',
    title: {
      fr: 'Entrepôt Organes & Pièces Détachées',
      ar: 'مستودع الأعضاء الدوّارة وقطع الورشة (Entrepôt)',
      en: 'Rotating Components & Workshop Parts Warehouse',
    },
    description: {
      fr: 'Double hiérarchie 4 niveaux : Organes complets rotatifs (Groupes ➔ Familles ➔ Modèles ➔ Entrepôt) et Pièces d’atelier (Groupes Parts ➔ Types Parts ➔ Désignations Parts ➔ Entrepôt).',
      ar: 'هرمية مزدوجة من 4 مستويات للأعضاء الدوّارة (محركات، مخفضات) وقطع التصنيع مع تتبع حالة التركيب (MONTE) والبوبيناج الخارجي.',
      en: 'Dual 4-level hierarchy for complete rotating organs (motors, gearboxes) and machined workshop parts with MONTE lifecycle tracking.',
    },
    icon: Cpu,
    tabs: [
      { tabId: 'entrepot', label: 'Entrepôt Organes & Pièces' },
      { tabId: 'comp_groups', label: 'Groupes d’Organes' },
      { tabId: 'comp_families', label: 'Familles d’Organes' },
      { tabId: 'comp_templates', label: 'Modèles d’Organes' },
      { tabId: 'part_groups', label: 'Groupes de Pièces (Parts)' },
      { tabId: 'part_types', label: 'Types de Pièces' },
      { tabId: 'part_designations', label: 'Désignations de Pièces' },
    ],
  },
  {
    groupId: '06-pilotage-gouvernance',
    number: '06',
    title: {
      fr: 'Pilotage, Finance & Validation Maker-Checker',
      ar: 'القيادة والمالية والتقارير ومركز الاعتماد (Maker-Checker)',
      en: 'Governance, Finance, Reports & Maker-Checker Validation',
    },
    description: {
      fr: 'Tableau de bord exécutif, budgets & TCO, rapports vacation et direction, centre de validation Maker-Checker, utilisateurs RBAC, zones et équipements du Système Général.',
      ar: 'لوحة القيادة التنفيذية، الميزانيات وTCO، تقارير الورديات والإدارة، مركز المصادقة، المستخدمون RBAC، المناطق والتجهيزات العامة.',
      en: 'Executive dashboard, budgets & TCO, shift & executive reports, Maker-Checker validation center, RBAC users, zones, and General System assets.',
    },
    icon: BarChart3,
    tabs: [
      { tabId: 'dashboard', label: 'Tableau de Bord' },
      { tabId: 'validation_center', label: 'Centre de Validation' },
      { tabId: 'finance', label: 'Coûts & Budgets' },
      { tabId: 'shift_weekly_report', label: 'Rapport Vacation / Hebdo' },
      { tabId: 'executive_report', label: 'Rapport Mensuel Exécutif' },
      { tabId: 'utilisateurs', label: 'Utilisateurs & Rôles' },
      { tabId: 'zones', label: 'Zones & Ateliers' },
      { tabId: 'equipment', label: 'Équipements & Système Général' },
      { tabId: 'nexus', label: 'Nexus (Nomenclature As-Built & Jumeaux)' },
    ],
  },
  {
    groupId: '07-settings-systeme',
    number: '07',
    title: {
      fr: 'Paramètres Système, Sauvegardes & Registre d’Audit',
      ar: 'إعدادات النظام والنسخ الاحتياطي وسجل التدقيق',
      en: 'System Settings, Backups & Append-Only Audit Ledger',
    },
    description: {
      fr: 'Supervision, logique des mouvements, injection structurée Type A, synchronisation réseau local LAN, inspecteur JSON, registre d’audit append-only, apparence, performance et devises.',
      ar: 'إشراف التخزين، منطق الحركات، الاستيراد المهيكل Type A، مزامنة الشبكة المحلية LAN، فاحص JSON، النسخ الاحتياطي وسجل التدقيق، المظهر والعملات.',
      en: 'Storage supervision, movement rules, Type A structured ingestion, LAN sync, read-only JSON inspector, audit ledger, appearance, performance, and currencies.',
    },
    icon: Settings,
    tabs: [
      { tabId: 'settings', label: 'Supervision & Stockage' },
      { tabId: 'settings_mvt_logic', label: 'Logique & Flux Mouvements' },
      { tabId: 'settings_injection', label: 'Injection Structurée (Type A)' },
      { tabId: 'settings_directory', label: 'Dossier Partagé & Sync LAN' },
      { tabId: 'settings_matching', label: 'Appairage & Audit' },
      { tabId: 'settings_json_editor', label: 'Inspecteur JSON SSOT' },
      { tabId: 'settings_backup_audit', label: 'Sauvegardes & Audit Ledger' },
      { tabId: 'settings_admin', label: 'Compte Admin & Coffre-Fort' },
      { tabId: 'settings_performance', label: 'Performance & Cache' },
      { tabId: 'settings_currency', label: 'Devises & Fiscalité ISO' },
      { tabId: 'appearance', label: 'Apparence & Ergonomie' },
    ],
  },
];

const TAB_TO_GROUP_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of MODULE_ROADMAP) {
    for (const tab of group.tabs) {
      if (!map[tab.tabId]) {
        map[tab.tabId] = group.groupId;
      }
    }
  }
  map.corrective_pieces = '04-corrective-di-bt';
  map.corrective_analyse = '04-corrective-di-bt';
  return map;
})();

const TAB_LABELS: Record<string, string> = {
  stock: 'Stock Articles & PO',
  sortie: 'Sortie & Entrée Rapide',
  pdr_groups: 'Groupes PDR',
  types: 'Types PDR',
  designations: 'Désignations PDR',
  machines: 'Machines Enregistrées',
  families: 'Familles Machines',
  templates: 'Modèles Machines',
  blueprints: 'Blueprints Machines',
  nexus: 'Arborescence Nexus',
  preventive: 'Planning Préventif',
  preventive_referentiel: 'Référentiel Préventif',
  corrective: 'Maintenance Corrective',
  corrective_di: 'Demandes (DI)',
  corrective_bt: 'Bons de Travail (BT)',
  corrective_live: 'Intervention Live (Chrono)',
  corrective_atelier: 'Atelier Mécanique (BR / RECT)',
  corrective_cloture: 'Clôture BT',
  corrective_analyse: 'Analyse Corrective & Pareto',
  corrective_history: 'Historique Correctif',
  corrective_pieces: 'Pièces Consommées en Correctif',
  corrective_referentiel: 'Catalogue Données Correctives',
  entrepot: 'Entrepôt Organes & Pièces',
  comp_groups: 'Groupes d’Organes',
  comp_families: 'Familles d’Organes',
  comp_templates: 'Modèles d’Organes',
  part_groups: 'Groupes de Pièces (Parts)',
  part_types: 'Types de Pièces',
  part_designations: 'Désignations de Pièces',
  validation_center: 'Centre de Validation (Maker-Checker)',
  finance: 'Coûts & Budgets',
  shift_weekly_report: 'Rapport Vacation / Hebdo',
  executive_report: 'Rapport Mensuel Exécutif',
  dashboard: 'Tableau de Bord',
  zones: 'Zones & Ateliers',
  utilisateurs: 'Utilisateurs & Rôles',
  equipment: 'Équipements & Système Général',
  settings: 'Supervision & Stockage',
  settings_mvt_logic: 'Logique des Mouvements',
  settings_injection: 'Injection Structurée (Type A)',
  settings_directory: 'Dossier Partagé & Sync LAN',
  settings_matching: 'Appairage & Réconciliation',
  settings_json_editor: 'Inspecteur JSON SSOT',
  settings_backup_audit: 'Sauvegardes & Audit Ledger',
  settings_admin: 'Compte Admin & Coffre-Fort',
  settings_performance: 'Performance & Cache',
  settings_currency: 'Devises & Fiscalité ISO',
  appearance: 'Apparence & Ergonomie',
};

// Lazy markdown loader (splits all 62 docs out of the initial GuideView JS bundle)
const lazyMarkdownLoaders = import.meta.glob('/docs/modules/**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

interface DocPathIndexEntry {
  filePath: string;
  groupId: string;
  docType: 'architecture' | 'page';
  audience: 'developer' | 'user';
}

const DOC_PATH_INDEX: DocPathIndexEntry[] = Object.keys(lazyMarkdownLoaders)
  .sort()
  .map((filePath) => {
    const match = filePath.match(/\/docs\/modules\/([^/]+)\/([^/]+)$/);
    const groupId = match?.[1] || '01-stock-pdr';
    const fileName = match?.[2] || '';
    const isArch = fileName === 'GROUP_ARCHITECTURE.md' || fileName.startsWith('page-dev-');
    return {
      filePath,
      groupId,
      docType: isArch ? 'architecture' : 'page',
      audience: isArch ? 'developer' : 'user',
    };
  });

const parsedDocCache = new Map<string, ParsedMarkdownDoc>();

function sortParsedDocs(docs: ParsedMarkdownDoc[]): ParsedMarkdownDoc[] {
  return [...docs].sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    if (a.docType !== b.docType) return a.docType === 'page' ? -1 : 1;
    return a.filePath.localeCompare(b.filePath);
  });
}

function parseFrontmatter(raw: string, filePath: string): ParsedMarkdownDoc {
  const normalized = raw.replace(/\r\n/g, '\n');
  let body = normalized;
  const meta: Record<string, string | string[]> = {};

  if (normalized.startsWith('---\n')) {
    const endIdx = normalized.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      const fmBlock = normalized.slice(4, endIdx);
      body = normalized.slice(endIdx + 5).trim();
      let currentArrayKey: string | null = null;

      for (const line of fmBlock.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('- ') && currentArrayKey) {
          const arr = (meta[currentArrayKey] as string[]) || [];
          arr.push(trimmed.slice(2).trim());
          meta[currentArrayKey] = arr;
          continue;
        }
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim();
          if (!val) {
            currentArrayKey = key;
            meta[key] = [];
          } else {
            currentArrayKey = null;
            meta[key] = val;
          }
        }
      }
    }
  }

  // Strip top H1 from body if it duplicates title
  const bodyWithoutDuplicateH1 = body.replace(/^#\s+[^\n]+\n+/, '');

  return {
    id: (meta.id as string) || filePath,
    groupId: (meta.groupId as string) || '01-stock-pdr',
    groupTitle: (meta.groupTitle as string) || 'Documentation GMAO',
    docType: ((meta.docType as string) === 'architecture' ? 'architecture' : 'page'),
    audience: ((meta.audience as string) === 'developer' ? 'developer' : 'user'),
    tabId: meta.tabId as string | undefined,
    title: (meta.title as string) || filePath,
    subtitle: meta.subtitle as string | undefined,
    summary: (meta.summary as string) || '',
    relatedTabs: Array.isArray(meta.relatedTabs) ? meta.relatedTabs : [],
    body: bodyWithoutDuplicateH1,
    filePath,
  };
}

function renderInlineFormatting(
  text: string,
  onOpenHref?: (href: string) => void
): React.ReactNode[] {
  // Handle inline code `...`, math $...$, bold **...**, markdown links [label](href), and italics *...*
  const tokens = text.split(/(`[^`]+`|\$[^$]+\$|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g);
  return tokens.map((tok, idx) => {
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-[11.5px] text-amber-800 font-semibold select-text"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith('$') && tok.endsWith('$') && tok.length >= 2) {
      const cleanFormula = tok
        .slice(1, -1)
        .replace(/\\text\{([^}]+)\}/g, '$1')
        .replace(/\\times/g, '×')
        .replace(/\\le/g, '≤')
        .replace(/\\ge/g, '≥')
        .replace(/\\rightarrow/g, '➔')
        .replace(/\\sum/g, '∑')
        .replace(/\\max/g, 'max')
        .replace(/\\min/g, 'min')
        .replace(/\\left\(/g, '(')
        .replace(/\\right\)/g, ')')
        .replace(/\\_/g, '_')
        .replace(/\\/g, ' ');
      return (
        <span
          key={idx}
          className="px-2 py-0.5 mx-0.5 rounded bg-amber-50 border border-amber-200 font-mono text-xs font-bold text-amber-900 select-text"
        >
          {cleanFormula}
        </span>
      );
    }
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('[') && tok.includes('](') && tok.endsWith(')')) {
      const match = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        const [, label, rawHref] = match;
        const href = rawHref.trim();
        if (/^https?:\/\//i.test(href)) {
          return (
            <a
              key={idx}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-700 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-900"
            >
              {label}
            </a>
          );
        }
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) && onOpenHref) {
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onOpenHref(href)}
              className="font-semibold text-amber-700 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-900 cursor-pointer"
            >
              {label}
            </button>
          );
        }
        return <React.Fragment key={idx}>{label}</React.Fragment>;
      }
    }
    if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
      return (
        <em key={idx} className="italic text-slate-800">
          {tok.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{tok}</React.Fragment>;
  });
}

export function MarkdownBodyRenderer({
  markdown,
  onOpenHref,
}: {
  markdown: string;
  onOpenHref?: (href: string) => void;
}) {
  const blocks = useMemo(() => {
    const lines = markdown.split('\n');
    const result: Array<
      | { type: 'h2'; text: string }
      | { type: 'h3'; text: string }
      | { type: 'hr' }
      | { type: 'blockquote'; lines: string[] }
      | { type: 'code'; code: string }
      | { type: 'formula'; formula: string }
      | { type: 'table'; headers: string[]; rows: string[][] }
      | { type: 'ul'; items: string[] }
      | { type: 'ol'; items: string[] }
      | { type: 'p'; text: string }
    > = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      if (trimmed === '---') {
        result.push({ type: 'hr' });
        i++;
        continue;
      }

      if (trimmed.startsWith('## ')) {
        result.push({ type: 'h2', text: trimmed.slice(3).trim() });
        i++;
        continue;
      }

      if (trimmed.startsWith('### ')) {
        result.push({ type: 'h3', text: trimmed.slice(4).trim() });
        i++;
        continue;
      }

      // Block math $$...$$
      if (trimmed.startsWith('$$')) {
        const formulaLines: string[] = [];
        if (trimmed.endsWith('$$') && trimmed.length > 4) {
          formulaLines.push(trimmed.slice(2, -2));
          i++;
        } else {
          i++;
          while (i < lines.length && !lines[i].trim().endsWith('$$')) {
            formulaLines.push(lines[i]);
            i++;
          }
          if (i < lines.length) i++;
        }
        const cleanFormula = formulaLines
          .join(' ')
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/\\times/g, '×')
          .replace(/\\le/g, '≤')
          .replace(/\\ge/g, '≥')
          .replace(/\\sum/g, '∑')
          .replace(/\\max/g, 'max')
          .replace(/\\min/g, 'min')
          .replace(/\\left\(/g, '(')
          .replace(/\\right\)/g, ')')
          .replace(/\\_/g, '_')
          .replace(/\\/g, ' ');
        result.push({ type: 'formula', formula: cleanFormula.trim() });
        continue;
      }

      // Code block ```
      if (trimmed.startsWith('```')) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        result.push({ type: 'code', code: codeLines.join('\n') });
        continue;
      }

      // Table | ... |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        if (tableLines.length >= 2) {
          const parseRow = (r: string) =>
            r
              .slice(1, -1)
              .split('|')
              .map((c) => c.trim());
          const headers = parseRow(tableLines[0]);
          const rows = tableLines
            .slice(2)
            .filter((r) => !/^\|[\s:-]+\|$/.test(r))
            .map(parseRow);
          result.push({ type: 'table', headers, rows });
        }
        continue;
      }

      // Unordered list
      if (trimmed.startsWith('- ')) {
        const items: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('- ')) {
          items.push(lines[i].trim().slice(2).trim());
          i++;
        }
        result.push({ type: 'ul', items });
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && (/^\d+\.\s+/.test(lines[i].trim()) || lines[i].startsWith('   - '))) {
          const currentTrimmed = lines[i].trim();
          if (/^\d+\.\s+/.test(currentTrimmed)) {
            items.push(currentTrimmed.replace(/^\d+\.\s+/, ''));
          } else if (items.length > 0) {
            items[items.length - 1] += ` — ${currentTrimmed.replace(/^-\s+/, '')}`;
          }
          i++;
        }
        result.push({ type: 'ol', items });
        continue;
      }

      // Blockquote > ...
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          const stripped = lines[i].trim().replace(/^>\s?/, '');
          if (stripped) quoteLines.push(stripped);
          i++;
        }
        if (quoteLines.length > 0) {
          result.push({ type: 'blockquote', lines: quoteLines });
        }
        continue;
      }

      // Paragraph
      const pLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].trim().startsWith('#') &&
        !lines[i].trim().startsWith('>') &&
        !lines[i].trim().startsWith('- ') &&
        !/^\d+\.\s+/.test(lines[i].trim()) &&
        !lines[i].trim().startsWith('|') &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].trim().startsWith('$$') &&
        lines[i].trim() !== '---'
      ) {
        pLines.push(lines[i].trim());
        i++;
      }
      result.push({ type: 'p', text: pLines.join(' ') });
    }

    return result;
  }, [markdown]);

  return (
    <div className="space-y-4 select-text">
      {blocks.map((block, index) => {
        if (block.type === 'hr') {
          return <hr key={index} className="border-slate-200 my-5" />;
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={index}
              className="border-l-4 border-amber-500 bg-amber-50/60 px-4 py-3 rounded-r-2xl text-xs sm:text-[13px] text-slate-700 space-y-1.5 leading-relaxed"
            >
              {block.lines.map((qLine, qi) => (
                <p key={qi}>{renderInlineFormatting(qLine, onOpenHref)}</p>
              ))}
            </blockquote>
          );
        }
        if (block.type === 'h2') {
          return (
            <div key={index} className="pt-3 pb-1 border-b border-slate-200/80 flex items-center gap-2.5">
              <span className="w-1.5 h-5 rounded-full bg-amber-500 shrink-0" />
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {renderInlineFormatting(block.text, onOpenHref)}
              </h2>
            </div>
          );
        }
        if (block.type === 'h3') {
          return (
            <h3 key={index} className="text-sm font-extrabold text-slate-900 pt-2 flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{renderInlineFormatting(block.text, onOpenHref)}</span>
            </h3>
          );
        }
        if (block.type === 'formula') {
          return (
            <div
              key={index}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50/90 to-orange-50/50 border border-amber-200/80 font-mono text-xs sm:text-sm font-bold text-slate-900 text-center shadow-2xs select-text"
            >
              {block.formula}
            </div>
          );
        }
        if (block.type === 'code') {
          return (
            <pre
              key={index}
              className="p-4 rounded-2xl bg-slate-900 text-amber-300 font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed select-text"
            >
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-black uppercase tracking-wider text-[10.5px]">
                    {block.headers.map((h, hi) => (
                      <th key={hi} className="py-2.5 px-3.5">
                        {renderInlineFormatting(h, onOpenHref)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 bg-white">
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-amber-50/40 transition-colors">
                      {row.map((cell, ci) => (
                        <td key={ci} className="py-2.5 px-3.5 text-slate-700 leading-relaxed">
                          {renderInlineFormatting(cell, onOpenHref)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={index} className="space-y-2 pl-1">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                  <div className="flex-1">{renderInlineFormatting(item, onOpenHref)}</div>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={index} className="space-y-2.5 pl-1">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
                  <span className="w-5 h-5 rounded-lg bg-amber-100 border border-amber-200 text-amber-900 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    {ii + 1}
                  </span>
                  <div className="flex-1">{renderInlineFormatting(item, onOpenHref)}</div>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index} className="text-xs sm:text-[13px] text-slate-700 leading-relaxed">
            {renderInlineFormatting(block.text, onOpenHref)}
          </p>
        );
      })}
    </div>
  );
}

export default function GuideView({ onNavigateToTab }: GuideViewProps) {
  const { currentUser } = useAuth();
  const { t, language } = useTranslation();
  const langKey: GuideLang = language === 'ar' || language === 'en' ? language : 'fr';

  const [allDocs, setAllDocs] = useState<ParsedMarkdownDoc[]>(() =>
    sortParsedDocs(Array.from(parsedDocCache.values()))
  );
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'user' | 'developer'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const stripContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const totalDocsCount = DOC_PATH_INDEX.length;
  const isReaderOpen = selectedGroupId !== null;
  const quickTrack = useMemo(() => getQuickTrackForUser(currentUser), [currentUser]);

  const docsCountByGroup = useMemo(() => {
    const counts: Record<string, { total: number; pages: number; arch: number }> = {};
    for (const entry of DOC_PATH_INDEX) {
      if (!counts[entry.groupId]) counts[entry.groupId] = { total: 0, pages: 0, arch: 0 };
      counts[entry.groupId].total += 1;
      if (entry.docType === 'page') counts[entry.groupId].pages += 1;
      else counts[entry.groupId].arch += 1;
    }
    return counts;
  }, []);

  const ensureGroupLoaded = useCallback(async (groupId: string): Promise<ParsedMarkdownDoc[]> => {
    const targetPaths =
      groupId === 'all'
        ? DOC_PATH_INDEX.map((e) => e.filePath)
        : DOC_PATH_INDEX.filter((e) => e.groupId === groupId).map((e) => e.filePath);

    const missing = targetPaths.filter((p) => !parsedDocCache.has(p));
    if (missing.length > 0) {
      if (isMountedRef.current) setIsLoadingDocs(true);
      try {
        const loaded = await Promise.all(
          missing.map(async (filePath) => {
            const loader = lazyMarkdownLoaders[filePath];
            if (!loader) return null;
            const raw = await loader();
            return parseFrontmatter(raw, filePath);
          })
        );
        for (const doc of loaded) {
          if (doc) parsedDocCache.set(doc.filePath, doc);
        }
      } finally {
        if (isMountedRef.current) {
          setAllDocs(sortParsedDocs(Array.from(parsedDocCache.values())));
          setIsLoadingDocs(false);
        }
      }
    }

    return sortParsedDocs(Array.from(parsedDocCache.values()));
  }, []);

  // Hydrate all docs lazily when user searches from the landing view or selects 'all'
  useEffect(() => {
    if ((!isReaderOpen && searchQuery.trim().length > 0) || selectedGroupId === 'all') {
      void ensureGroupLoaded('all');
    }
  }, [isReaderOpen, searchQuery, selectedGroupId, ensureGroupLoaded]);

  const landingSearchResults = useMemo(() => {
    if (isReaderOpen) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allDocs.filter((doc) => {
      if (audienceFilter === 'user' && doc.audience !== 'user') return false;
      if (audienceFilter === 'developer' && doc.audience !== 'developer') return false;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.summary.toLowerCase().includes(q) ||
        doc.body.toLowerCase().includes(q) ||
        (doc.tabId && doc.tabId.toLowerCase().includes(q))
      );
    });
  }, [allDocs, isReaderOpen, audienceFilter, searchQuery]);

  const filteredDocs = useMemo(() => {
    if (!selectedGroupId) return [];
    const q = searchQuery.trim().toLowerCase();
    return allDocs.filter((doc) => {
      if (selectedGroupId !== 'all' && doc.groupId !== selectedGroupId) return false;
      if (audienceFilter === 'user' && doc.audience !== 'user') return false;
      if (audienceFilter === 'developer' && doc.audience !== 'developer') return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.summary.toLowerCase().includes(q) ||
        doc.body.toLowerCase().includes(q) ||
        (doc.tabId && doc.tabId.toLowerCase().includes(q))
      );
    });
  }, [allDocs, selectedGroupId, audienceFilter, searchQuery]);

  const activeDoc = useMemo(() => {
    if (!selectedGroupId) return null;
    return (
      filteredDocs.find((d) => d.id === selectedDocId) ||
      filteredDocs[0] ||
      allDocs.find((d) => d.id === selectedDocId) ||
      null
    );
  }, [filteredDocs, allDocs, selectedDocId, selectedGroupId]);

  const scrollCardIntoStripCenter = (groupId: string) => {
    window.setTimeout(() => {
      cardRefs.current[groupId]?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }, 360);
  };

  const handleSelectGroup = async (groupId: string) => {
    setSelectedGroupId(groupId);
    scrollCardIntoStripCenter(groupId);
    const docsNow = await ensureGroupLoaded(groupId);
    if (!isMountedRef.current) return;
    const firstMatchingDoc =
      docsNow.find(
        (d) =>
          (groupId === 'all' || d.groupId === groupId) &&
          (audienceFilter === 'all' || d.audience === audienceFilter)
      ) || docsNow.find((d) => groupId === 'all' || d.groupId === groupId);
    if (firstMatchingDoc) setSelectedDocId(firstMatchingDoc.id);
  };

  const handleOpenScreen = (rawTabId: string) => {
    executeGuideTabNavigation(currentUser, rawTabId, onNavigateToTab);
  };

  const handleSelectDocByTab = async (tabId: string, preferredGroupId?: string | null) => {
    const targetGroup = preferredGroupId || TAB_TO_GROUP_MAP[tabId] || 'all';
    const docsNow = await ensureGroupLoaded(targetGroup);
    if (!isMountedRef.current) return;

    let targetDoc = findGuideDocForTab(
      docsNow,
      tabId,
      preferredGroupId ?? selectedGroupId,
      audienceFilter
    );

    if (!targetDoc && targetGroup !== 'all') {
      const allLoaded = await ensureGroupLoaded('all');
      if (!isMountedRef.current) return;
      targetDoc = findGuideDocForTab(
        allLoaded,
        tabId,
        preferredGroupId ?? selectedGroupId,
        audienceFilter
      );
    }

    if (targetDoc) {
      setSelectedGroupId(targetDoc.groupId);
      setSelectedDocId(targetDoc.id);
      scrollCardIntoStripCenter(targetDoc.groupId);
    } else {
      handleOpenScreen(tabId);
    }
  };

  const handleOpenMarkdownHref = async (href: string) => {
    let resolved = resolveGuideInternalHref(allDocs, href, activeDoc);
    if (!resolved) {
      const allLoaded = await ensureGroupLoaded('all');
      if (!isMountedRef.current) return;
      resolved = resolveGuideInternalHref(allLoaded, href, activeDoc);
    }
    if (!resolved) return;
    if (resolved.doc) {
      setSelectedGroupId(resolved.doc.groupId);
      setSelectedDocId(resolved.doc.id);
      scrollCardIntoStripCenter(resolved.doc.groupId);
    } else if (resolved.tabId) {
      handleOpenScreen(resolved.tabId);
    }
  };

  const handleScrollStrip = (direction: 'left' | 'right') => {
    const el = stripContainerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === 'left' ? -300 : 300,
      behavior: 'smooth',
    });
  };

  const handleCloseReader = () => {
    setSelectedGroupId(null);
    setSelectedDocId('');
    setSearchQuery('');
  };

  const floatingCircleDepth =
    'shadow-[0_10px_24px_-4px_rgba(245,158,11,0.24),0_4px_10px_-2px_rgba(15,23,42,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)]';
  const floatingNeutralDepth =
    'shadow-[0_8px_20px_-4px_rgba(15,23,42,0.14),0_3px_8px_-2px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,0.95)]';

  const roleLabel = t(
    `guide.quickTrack.roles.${quickTrack.role}`,
    quickTrack.role
  );

  return (
    <AnimatedPage className="space-y-5 pb-10 font-sans">
      {/* 1. En-tête Exécutif Partagé (BDR Light GMAO Header Card + Orange/Amber Sidebar Theme) */}
      <div className="bg-white px-5 py-4 md:px-6 md:py-5 rounded-2xl border border-slate-200/90 shadow-[0_12px_32px_-6px_rgba(0,0,0,0.12),0_4px_12px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.16),0_6px_16px_-3px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 ease-out flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 relative overflow-hidden group/header">
        {/* Subtle Ambient Glow matching Sidebar Amber/Orange Color */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl pointer-events-none group-hover/header:bg-amber-500/10 transition-colors duration-500" />

        <div className="min-w-0 flex-1 flex items-start sm:items-center gap-3.5 relative">
          <PageHeaderIcon icon={BookOpen} colorClass="text-amber-600" />

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                {t('guide.header.title', 'Guide d’Utilisation & Architecture GMAO')}
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded-full">
                {t('guide.header.documentsCount', `${totalDocsCount} documents`, {
                  count: totalDocsCount,
                })}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-snug">
              {isReaderOpen
                ? t(
                    'guide.header.subtitleReader',
                    'Navigation rapide entre modules dans le ruban horizontal ou retour à la vue complète.'
                  )
                : t(
                    'guide.header.subtitleLanding',
                    'Sélectionnez un module, utilisez votre parcours rapide ou recherchez directement dans toute la documentation.'
                  )}
            </p>
          </div>
        </div>

        {/* Sélecteur de profil de lecture + Retour Grille 3D Flottant */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 shrink-0 relative">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/90 shadow-2xs">
            <button
              type="button"
              onClick={() => setAudienceFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                audienceFilter === 'all'
                  ? 'bg-white text-amber-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-amber-200/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 border border-transparent'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t('guide.header.filterAll', `Tout (${totalDocsCount})`, {
                  count: totalDocsCount,
                })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAudienceFilter('user');
                if (selectedGroupId) {
                  const firstUserDoc = allDocs.find(
                    (d) => (selectedGroupId === 'all' || d.groupId === selectedGroupId) && d.audience === 'user'
                  );
                  if (firstUserDoc) setSelectedDocId(firstUserDoc.id);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                audienceFilter === 'user'
                  ? 'bg-white text-amber-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-amber-200/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 border border-transparent'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{t('guide.header.filterUser', 'Guides Utilisateur')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAudienceFilter('developer');
                if (selectedGroupId) {
                  const firstDevDoc = allDocs.find(
                    (d) => (selectedGroupId === 'all' || d.groupId === selectedGroupId) && d.audience === 'developer'
                  );
                  if (firstDevDoc) setSelectedDocId(firstDevDoc.id);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                audienceFilter === 'developer'
                  ? 'bg-white text-amber-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-amber-200/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 border border-transparent'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t('guide.header.filterDev', 'Architecture & Dev')}</span>
            </button>
          </div>

          <AnimatePresence>
            {isReaderOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.75 }}
                transition={{ duration: 0.2 }}
              >
                <Action3DButton
                  variant="circle"
                  color="amber"
                  icon={LayoutGrid}
                  onClick={handleCloseReader}
                  title={t('guide.header.backToGrid', 'Afficher la grille complète des modules')}
                  ariaLabel={t('guide.header.backToGrid', 'Afficher la grille complète des modules')}
                  className={floatingCircleDepth}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 1.5. Recherche Globale + Parcours Rapide selon le Rôle (Page d'accueil du Guide) */}
      {!isReaderOpen && (
        <div className="space-y-4">
          {/* Barre de recherche globale */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                data-testid="guide-global-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(
                  'guide.search.globalPlaceholder',
                  `Recherche globale dans les ${totalDocsCount} guides (PO, Nexus, TVA, Type A, RUL, BT...)`,
                  { count: totalDocsCount }
                )}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('guide.search.clear', 'Effacer la recherche')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {searchQuery.trim().length > 0 && (
              <div data-testid="guide-global-search-results" className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                    {isLoadingDocs
                      ? t('guide.search.loading', 'Chargement des guides...')
                      : t(
                          'guide.search.resultsTitle',
                          `Résultats de recherche globale (${landingSearchResults.length})`,
                          { count: landingSearchResults.length }
                        )}
                  </span>
                </div>

                {isLoadingDocs ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    <span>{t('guide.search.loading', 'Chargement des guides...')}</span>
                  </div>
                ) : landingSearchResults.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {landingSearchResults.slice(0, 12).map((doc) => {
                      const isArch = doc.docType === 'architecture';
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => {
                            setSelectedGroupId(doc.groupId);
                            setSelectedDocId(doc.id);
                            scrollCardIntoStripCenter(doc.groupId);
                          }}
                          className="text-left p-3 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-white hover:border-amber-400 transition flex items-start gap-2.5 cursor-pointer"
                        >
                          {isArch ? (
                            <Code2 className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                          ) : (
                            <FileText className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[9.5px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  isArch ? 'bg-slate-200 text-slate-800' : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {isArch
                                  ? t('guide.reader.badgeArch', 'Architecture & Dev')
                                  : t('guide.reader.badgeUser', 'Guide Écran')}
                              </span>
                              {doc.tabId && (
                                <span className="text-[9.5px] font-mono text-slate-500">
                                  #{doc.tabId}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-extrabold text-slate-900 mt-1 truncate">
                              {doc.title}
                            </p>
                            {doc.summary && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {doc.summary}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                    {t('guide.search.noResults', `Aucun document ne correspond à « ${searchQuery} ».`, {
                      query: searchQuery,
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parcours Rapide selon le rôle utilisateur */}
          <div
            data-testid="guide-role-quick-track"
            className="bg-gradient-to-r from-amber-50/80 via-white to-orange-50/40 rounded-2xl border border-amber-200/80 p-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-600 shrink-0" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900">
                  {t('guide.quickTrack.title', `Parcours Rapide — ${roleLabel}`, {
                    role: roleLabel,
                  })}
                </h3>
              </div>
              <span className="text-[11px] text-slate-600">
                {t(
                  'guide.quickTrack.subtitle',
                  'Accès direct aux guides essentiels pour votre profil opérationnel.'
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {quickTrack.steps.map((step, idx) => {
                const canOpen = Boolean(onNavigateToTab) && canNavigateToGuideTab(currentUser, step.tabId);
                return (
                  <div
                    key={`${quickTrack.role}-${step.tabId}`}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-xl bg-white border border-amber-200/90 shadow-2xs hover:border-amber-400 transition"
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelectDocByTab(step.tabId, step.groupId)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-amber-700 cursor-pointer"
                    >
                      <span className="w-4 h-4 rounded-md bg-amber-100 text-amber-900 font-black text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>{step.label[langKey]}</span>
                    </button>
                    {canOpen && (
                      <button
                        type="button"
                        onClick={() => handleOpenScreen(step.tabId)}
                        title={t(
                          'guide.reader.goDirect',
                          `Aller directement à l'écran ${step.label[langKey]}`,
                          { label: step.label[langKey] }
                        )}
                        aria-label={t(
                          'guide.reader.goDirect',
                          `Aller directement à l'écran ${step.label[langKey]}`,
                          { label: step.label[langKey] }
                        )}
                        className="p-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. Barre de contrôle du ruban horizontal (Visible uniquement lorsqu'une carte est sélectionnée) */}
      <AnimatePresence>
        {isReaderOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-between gap-3 px-1"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                {t('guide.ribbon.label', `Ruban Modules (${MODULE_ROADMAP.length})`, {
                  count: MODULE_ROADMAP.length,
                })}
              </span>
              {selectedGroupId === 'all' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  {t('guide.ribbon.allModules', 'Tous les modules')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Action3DButton
                variant="circle"
                color="slate"
                icon={ChevronLeft}
                onClick={() => handleScrollStrip('left')}
                title={t('guide.ribbon.scrollLeft', 'Faire défiler vers la gauche')}
                ariaLabel={t('guide.ribbon.scrollLeft', 'Faire défiler vers la gauche')}
                className={`!w-9 !h-9 ${floatingNeutralDepth}`}
              />
              <Action3DButton
                variant="circle"
                color="slate"
                icon={ChevronRight}
                onClick={() => handleScrollStrip('right')}
                title={t('guide.ribbon.scrollRight', 'Faire défiler vers la droite')}
                ariaLabel={t('guide.ribbon.scrollRight', 'Faire défiler vers la droite')}
                className={`!w-9 !h-9 ${floatingNeutralDepth}`}
              />
              <Action3DButton
                variant="circle"
                color="amber"
                icon={X}
                onClick={handleCloseReader}
                title={t('guide.ribbon.closeReader', 'Fermer le lecteur et revenir à la grille')}
                ariaLabel={t('guide.ribbon.closeReader', 'Fermer le lecteur et revenir à la grille')}
                className={`!w-9 !h-9 ${floatingCircleDepth}`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Cartes des Modules : Grille complète par défaut ➔ Ruban horizontal fluide au clic */}
      <motion.div
        ref={stripContainerRef}
        layout
        transition={{ layout: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
        className={
          isReaderOpen
            ? 'flex items-stretch gap-3 overflow-x-auto pb-3 pt-1 px-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin]'
            : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
        }
      >
        {MODULE_ROADMAP.map((group) => {
          const stats = docsCountByGroup[group.groupId] || { total: 0, pages: 0, arch: 0 };
          const isDocumented = stats.total > 0;
          const isSelected = selectedGroupId === group.groupId;
          const IconComponent = group.icon;

          return (
            <motion.div
              key={group.groupId}
              ref={(el) => {
                cardRefs.current[group.groupId] = el;
              }}
              layout
              transition={{ layout: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } }}
              onClick={() => {
                if (isDocumented) {
                  void handleSelectGroup(group.groupId);
                }
              }}
              className={`group rounded-2xl border transition-shadow duration-300 flex flex-col justify-between ${
                isReaderOpen
                  ? 'min-w-[235px] sm:min-w-[260px] max-w-[280px] shrink-0 snap-center p-3.5 gap-2'
                  : 'p-4.5 gap-3'
              } ${
                isDocumented ? 'cursor-pointer hover:-translate-y-0.5' : 'opacity-80'
              } ${
                isSelected
                  ? 'bg-gradient-to-br from-amber-50/95 via-white to-orange-50/70 border-amber-500 ring-2 ring-amber-500/20 shadow-[0_10px_25px_-5px_rgba(245,158,11,0.22),0_4px_10px_-3px_rgba(15,23,42,0.08)]'
                  : isDocumented
                  ? 'bg-white border-slate-200/90 hover:border-amber-400 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.07)] hover:shadow-[0_12px_26px_-6px_rgba(245,158,11,0.16)]'
                  : 'bg-slate-50/80 border-slate-200/80'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <IconComponent
                      className={`shrink-0 mt-0.5 transition-transform duration-300 group-hover:scale-110 ${
                        isReaderOpen ? 'w-5 h-5' : 'w-6 h-6'
                      } ${isDocumented ? 'text-amber-600' : 'text-slate-400'}`}
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">
                        {t('guide.cards.groupPrefix', `Groupe ${group.number}`, {
                          number: group.number,
                        })}
                      </span>
                      <h3
                        className={`font-black text-slate-900 leading-snug ${
                          isReaderOpen ? 'text-xs line-clamp-2' : 'text-xs sm:text-sm'
                        }`}
                      >
                        {group.title[langKey]}
                      </h3>
                    </div>
                  </div>

                  {isDocumented ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-amber-600" />
                      <span>{stats.total}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-bold shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{t('guide.cards.soon', 'Bientôt')}</span>
                    </span>
                  )}
                </div>

                {!isReaderOpen && (
                  <p className="text-[11.5px] text-slate-600 leading-relaxed">
                    {group.description[langKey]}
                  </p>
                )}
              </div>

              {/* Liens rapides vers les écrans du groupe (affichés en vue grille complète) */}
              {!isReaderOpen && (
                <div className="pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center gap-1.5">
                  {group.tabs.map((tab) => {
                    const canOpenScreen = canNavigateToGuideTab(currentUser, tab.tabId);
                    const isClickable = isDocumented || (Boolean(onNavigateToTab) && canOpenScreen);
                    return (
                      <button
                        key={`${group.groupId}-${tab.tabId}`}
                        type="button"
                        disabled={!isClickable}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSelectDocByTab(tab.tabId, group.groupId);
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-bold transition ${
                          !isClickable
                            ? 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
                            : isDocumented
                            ? 'bg-white border border-amber-200/90 text-amber-900 hover:bg-amber-600 hover:text-white hover:border-amber-600 cursor-pointer'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900 cursor-pointer'
                        }`}
                        title={
                          isDocumented
                            ? t('guide.cards.readGuide', `Lire le guide de l'écran ${tab.label}`, {
                                label: tab.label,
                              })
                            : canOpenScreen
                            ? t('guide.cards.openScreen', `Ouvrir directement l'écran ${tab.label}`, {
                                label: tab.label,
                              })
                            : t('guide.cards.restrictedScreen', `Accès restreint à l'écran ${tab.label}`, {
                                label: tab.label,
                              })
                        }
                      >
                        <span>{tab.label}</span>
                        <ArrowUpRight className="w-3 h-3 opacity-70" />
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* 4. Corps Principal : Sommaire Latéral + Lecteur de Document (N'apparaît qu'après sélection d'une carte) */}
      <AnimatePresence mode="wait">
        {isReaderOpen && (
          <motion.div
            key={`guide-reader-${selectedGroupId}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.52, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
          >
            {/* Colonne Gauche : Recherche & Arborescence des Fichiers du Groupe */}
            <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-xs p-4 space-y-4 lg:sticky lg:top-4">
              {/* Barre de recherche */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('guide.search.sidebarPlaceholder', 'Filtrer dans le sommaire...')}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white transition"
                />
              </div>

              {/* Liste structurée des documents */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                    {t('guide.reader.toc', `Sommaire (${filteredDocs.length})`, {
                      count: filteredDocs.length,
                    })}
                  </span>
                  {selectedGroupId !== 'all' && (
                    <button
                      type="button"
                      onClick={() => void handleSelectGroup('all')}
                      className="text-[10.5px] font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      {t('guide.reader.viewAll', 'Voir tout')}
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {filteredDocs.map((doc) => {
                    const isSelected = activeDoc?.id === doc.id;
                    const isArch = doc.docType === 'architecture';

                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`w-full text-left p-3 rounded-2xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                          isSelected
                            ? isArch
                              ? 'bg-slate-900 border-slate-800 text-white shadow-sm'
                              : 'bg-amber-600 border-amber-600 text-white shadow-sm'
                            : 'bg-slate-50/70 border-slate-200/80 hover:bg-white hover:border-amber-300 text-slate-800'
                        }`}
                      >
                        {isArch ? (
                          <Code2
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              isSelected ? 'text-amber-300' : 'text-slate-600'
                            }`}
                          />
                        ) : (
                          <FileText
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              isSelected ? 'text-white' : 'text-amber-600'
                            }`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : isArch
                                  ? 'bg-slate-200/80 text-slate-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {isArch
                                ? t('guide.reader.badgeArch', 'Architecture & Dev')
                                : t('guide.reader.badgeUser', 'Guide Écran')}
                            </span>
                            {doc.tabId && (
                              <span
                                className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded ${
                                  isSelected ? 'bg-black/25 text-amber-200' : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                #{doc.tabId}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-extrabold mt-1 leading-snug truncate">{doc.title}</p>
                          {doc.subtitle && (
                            <p
                              className={`text-[10.5px] mt-0.5 line-clamp-1 ${
                                isSelected ? 'text-amber-100' : 'text-slate-500'
                              }`}
                            >
                              {doc.subtitle}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {isLoadingDocs && filteredDocs.length === 0 && (
                    <div className="p-6 flex items-center justify-center gap-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      <span>{t('guide.reader.loadingDoc', 'Chargement du document...')}</span>
                    </div>
                  )}

                  {!isLoadingDocs && filteredDocs.length === 0 && (
                    <div className="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                      {t('guide.search.noResults', `Aucun document ne correspond à « ${searchQuery} ».`, {
                        query: searchQuery,
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Colonne Droite : Contenu Détaillé du Document Sélectionné */}
            <div className="lg:col-span-8 xl:col-span-9">
              {activeDoc ? (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                  {/* Bannière du Document */}
                  <div
                    className={`p-5 sm:p-6 border-b ${
                      activeDoc.docType === 'architecture'
                        ? 'bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950/90 text-white border-slate-800'
                        : 'bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-white text-slate-900 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black uppercase tracking-wider ${
                              activeDoc.docType === 'architecture'
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-amber-600 text-white'
                            }`}
                          >
                            {activeDoc.docType === 'architecture'
                              ? t('guide.reader.bannerArch', 'Spécification Architecture & Logique Métier')
                              : t('guide.reader.bannerUser', 'Guide Opérationnel Utilisateur')}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              activeDoc.docType === 'architecture' ? 'text-amber-300' : 'text-amber-800'
                            }`}
                          >
                            • {activeDoc.groupTitle}
                          </span>
                          <span
                            className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                              activeDoc.docType === 'architecture'
                                ? 'bg-white/10 text-slate-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {activeDoc.filePath}
                          </span>
                        </div>

                        <h2 className="text-lg sm:text-xl font-black tracking-tight">{activeDoc.title}</h2>
                        {activeDoc.subtitle && (
                          <p
                            className={`text-xs sm:text-sm font-medium ${
                              activeDoc.docType === 'architecture' ? 'text-slate-300' : 'text-slate-600'
                            }`}
                          >
                            {activeDoc.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Bouton d'action circulaire 3D flottant pour ouvrir la page correspondante (gardé RBAC) */}
                      {activeDoc.tabId && onNavigateToTab && canNavigateToGuideTab(currentUser, activeDoc.tabId) && (
                        <Action3DButton
                          variant="circle"
                          color="amber"
                          icon={ExternalLink}
                          onClick={() => handleOpenScreen(activeDoc.tabId!)}
                          title={t(
                            'guide.reader.openScreenTitle',
                            `Ouvrir l’écran : ${TAB_LABELS[activeDoc.tabId!] || activeDoc.tabId}`,
                            { label: TAB_LABELS[activeDoc.tabId!] || activeDoc.tabId }
                          )}
                          ariaLabel={t(
                            'guide.reader.openScreenTitle',
                            `Ouvrir l’écran : ${TAB_LABELS[activeDoc.tabId!] || activeDoc.tabId}`,
                            { label: TAB_LABELS[activeDoc.tabId!] || activeDoc.tabId }
                          )}
                          className={floatingCircleDepth}
                        />
                      )}
                    </div>

                    {/* Résumé exécutif */}
                    {activeDoc.summary && (
                      <div
                        className={`mt-4 p-3.5 rounded-2xl text-xs leading-relaxed border select-text ${
                          activeDoc.docType === 'architecture'
                            ? 'bg-white/5 border-white/10 text-amber-100'
                            : 'bg-white border-amber-200/80 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <strong className="font-black uppercase tracking-wider text-[10.5px] mr-1.5">
                          {t('guide.reader.summaryLabel', 'Résumé :')}
                        </strong>
                        {activeDoc.summary}
                      </div>
                    )}
                  </div>

                  {/* Corps du Document Markdown */}
                  <div className="p-5 sm:p-7 select-text">
                    <MarkdownBodyRenderer
                      markdown={activeDoc.body}
                      onOpenHref={(href) => void handleOpenMarkdownHref(href)}
                    />
                  </div>

                  {/* Pied de document : Navigation croisée avec bouton 3D flottant intégré dans chaque carte */}
                  {activeDoc.relatedTabs.length > 0 && (
                    <div className="px-5 sm:px-7 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <span className="text-xs font-extrabold text-slate-700">
                        {t('guide.reader.relatedTitle', 'Écrans & Guides Associés dans ce Groupe :')}
                      </span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {activeDoc.relatedTabs.map((relTab) => {
                          const linkedDoc = findGuideDocForTab(
                            allDocs,
                            relTab,
                            activeDoc.groupId,
                            audienceFilter
                          );
                          const hasKnownGroup = Boolean(TAB_TO_GROUP_MAP[relTab]);
                          const canOpenRelTab = canNavigateToGuideTab(currentUser, relTab);
                          const label = TAB_LABELS[relTab] || relTab;
                          const canClickLabel =
                            Boolean(linkedDoc) || hasKnownGroup || (Boolean(onNavigateToTab) && canOpenRelTab);
                          return (
                            <div
                              key={relTab}
                              className="inline-flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_12px_-3px_rgba(15,23,42,0.07)] hover:border-amber-300 hover:shadow-[0_8px_20px_-4px_rgba(245,158,11,0.16)] transition-all"
                            >
                              <button
                                type="button"
                                disabled={!canClickLabel}
                                onClick={() => {
                                  if (linkedDoc) {
                                    setSelectedGroupId(linkedDoc.groupId);
                                    setSelectedDocId(linkedDoc.id);
                                  } else if (hasKnownGroup) {
                                    void handleSelectDocByTab(relTab);
                                  } else if (canOpenRelTab) {
                                    handleOpenScreen(relTab);
                                  }
                                }}
                                className={`inline-flex items-center gap-1.5 text-xs font-bold transition ${
                                  canClickLabel
                                    ? 'text-slate-800 hover:text-amber-700 cursor-pointer'
                                    : 'text-slate-400 cursor-not-allowed'
                                }`}
                                title={
                                  linkedDoc
                                    ? t('guide.reader.readRelated', `Lire le guide : ${linkedDoc.title}`, {
                                        title: linkedDoc.title,
                                      })
                                    : canOpenRelTab
                                    ? t('guide.reader.openScreenTitle', `Ouvrir l'écran : ${label}`, {
                                        label,
                                      })
                                    : t('guide.reader.restricted', `Accès restreint : ${label}`, {
                                        label,
                                      })
                                }
                              >
                                <BookOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>{label}</span>
                              </button>
                              {onNavigateToTab && canOpenRelTab && (
                                <Action3DButton
                                  variant="circle"
                                  color="amber"
                                  icon={ExternalLink}
                                  onClick={() => handleOpenScreen(relTab)}
                                  title={t('guide.reader.goDirect', `Aller directement à l'écran ${label}`, {
                                    label,
                                  })}
                                  ariaLabel={t('guide.reader.goDirect', `Aller directement à l'écran ${label}`, {
                                    label,
                                  })}
                                  className={`!w-8 !h-8 ${floatingCircleDepth}`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : isLoadingDocs ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-8 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <span>{t('guide.reader.loadingDoc', 'Chargement du document...')}</span>
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                  {t('guide.reader.emptyState', 'Aucun document disponible pour le filtre actif.')}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  );
}
