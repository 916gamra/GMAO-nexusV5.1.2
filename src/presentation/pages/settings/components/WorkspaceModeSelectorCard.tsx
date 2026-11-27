import React from 'react';
import {
  Users,
  Wrench,
  Sparkles,
  Lock,
  CheckCircle2,
  SlidersHorizontal,
  ShieldCheck,
  Info,
} from 'lucide-react';
import {
  WORKSPACE_PRESET_DEFINITIONS,
  applyWorkspacePreset,
  updateWorkspaceModuleVisibility,
  useWorkspaceProfile,
  type WorkspaceModuleVisibility,
  type WorkspacePreset,
} from '../../../../core/workspace/workspaceProfile';
import { useGmaoStore } from '../../../../store/useGmaoStore';
import { SettingsSectionCard, SETTINGS_BUTTON_STYLES } from './settingsUi';

interface WorkspaceModeSelectorCardProps {
  currentUser?: {
    username?: string;
    name?: string;
    role?: string;
  } | null;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const PRESET_ORDER: WorkspacePreset[] = ['TEAM_FULL', 'SOLO_EXPERT', 'SOLO_LIGHT'];

const PRESET_ICON: Record<WorkspacePreset, React.ComponentType<{ className?: string }>> = {
  TEAM_FULL: Users,
  SOLO_EXPERT: Wrench,
  SOLO_LIGHT: Sparkles,
};

interface PresetUiCopy {
  label: string;
  tagline: string;
  description: string;
  highlights: string[];
}

const PRESET_UI_COPY: Record<WorkspacePreset, PresetUiCopy> = {
  TEAM_FULL: {
    label: 'Équipe Complète',
    tagline: 'Usine multi-rôles & Maker-Checker',
    description:
      'Mode entreprise complet par défaut : tous les modules visibles (Finance, Stock Magasin, Blueprints, Équipe) et gouvernance croisée Maker-Checker.',
    highlights: [
      'Centre de Validation & séparation des pouvoirs (VAL-1..VAL-5)',
      'Finance & Budgets ISO 4217 + Inventaire Magasin complet',
      'Architecture 3-Tiers complète (Familles, Modèles, Blueprints)',
    ],
  },
  SOLO_EXPERT: {
    label: 'Solo Expert',
    tagline: 'Ingénieur terrain autonome',
    description:
      'Conçu pour un technicien ou ingénieur maintenance qui exécute et suit tout par lui-même : exécution directe ADMIN, hiérarchie complète Familles ➔ Templates ➔ Machines (sans Blueprint obligatoire), sans surcharge comptable.',
    highlights: [
      'Exécution & clôture directe (SOLO_DIRECT tracé dans AUDIT_EVENTS)',
      'Correctif complet (DI, BT, Live, Atelier BR/RECT, Besoins) & Préventif',
      'Familles ➔ Templates ➔ Machines, Entrepôt Organes/Parts & Sortie Rapide actifs',
    ],
  },
  SOLO_LIGHT: {
    label: 'Solo Light',
    tagline: 'Carnet terrain ultra-simplifié',
    description:
      'Futur mode allégé dédié aux petits ateliers et dépannages rapides sans hiérarchies avancées. Volontairement verrouillé en attente de sa phase de conception dédiée.',
    highlights: [
      'Parcours minimaliste machines + interventions rapides (prévu)',
      'Sans Blueprint ni inventaire complexe (prévu)',
      'Non activable dans cette version (Bientôt disponible)',
    ],
  },
};

const VISIBILITY_CONTROLS: ReadonlyArray<{
  key: keyof WorkspaceModuleVisibility;
  label: string;
  description: string;
}> = [
  {
    key: 'showFinance',
    label: 'Module Finance & Budgets',
    description: 'Afficher Coûts & Budgets (ISO 4217) dans la navigation principale.',
  },
  {
    key: 'showStockInventory',
    label: 'Inventaire Stock Magasin (Articles)',
    description:
      'Afficher l’écran d’inventaire Stock Articles. Le journal Sortie Rapide et les catalogues PDR restent disponibles.',
  },
  {
    key: 'showBlueprintsInPrimaryNav',
    label: 'Blueprints Machine (Schémas & Plans Tier 3)',
    description:
      'Afficher l’écran et les liaisons Blueprints (Tier 3) dans le Parc Machines. La hiérarchie Familles ➔ Templates ➔ Machines reste active dans tous les modes.',
  },
  {
    key: 'showTeamManagement',
    label: 'Gestion d’Équipe (Utilisateurs)',
    description:
      'Afficher Utilisateurs (Membres) dans la barre latérale (le Centre de Validation dépend du mode de gouvernance).',
  },
];

export default function WorkspaceModeSelectorCard({
  currentUser,
  showToast,
}: WorkspaceModeSelectorCardProps) {
  const profile = useWorkspaceProfile();
  const isAdmin = String(currentUser?.role || '').trim().toUpperCase() === 'ADMIN';
  const activeCopy = PRESET_UI_COPY[profile.preset] || PRESET_UI_COPY.TEAM_FULL;

  const handleSelectPreset = (targetPreset: WorkspacePreset) => {
    const def = WORKSPACE_PRESET_DEFINITIONS[targetPreset];
    if (!def || !def.enabled) {
      showToast?.(
        'Le mode Solo Light est en cours de conception et n’est pas encore activable.',
        'info'
      );
      return;
    }
    if (!isAdmin) {
      showToast?.(
        'Seul un Administrateur peut modifier le mode d’exploitation de l’espace de travail.',
        'error'
      );
      return;
    }
    if (profile.preset === targetPreset) return;

    const before = {
      preset: profile.preset,
      governanceMode: profile.governanceMode,
      moduleVisibility: profile.moduleVisibility,
    };
    const result = applyWorkspacePreset(targetPreset);
    if (!result.ok) {
      showToast?.(result.error || 'Changement de mode refusé.', 'error');
      return;
    }

    useGmaoStore.getState().appendAuditEvent?.({
      actionType: 'WORKSPACE_PROFILE_UPDATED',
      entityType: 'SYSTEM',
      entityId: 'workspace_profile',
      before,
      after: {
        preset: result.profile.preset,
        governanceMode: result.profile.governanceMode,
        moduleVisibility: result.profile.moduleVisibility,
      },
    });

    showToast?.(
      targetPreset === 'SOLO_EXPERT'
        ? 'Mode Solo Expert activé : exécution directe terrain active, aucune donnée supprimée.'
        : 'Mode Équipe Complète restauré : gouvernance Maker-Checker et tous les modules réactivés.',
      'success'
    );
  };

  const handleToggleVisibility = (key: keyof WorkspaceModuleVisibility) => {
    if (!isAdmin) {
      showToast?.(
        'Seul un Administrateur peut ajuster la visibilité des modules.',
        'error'
      );
      return;
    }
    const before = { ...profile.moduleVisibility };
    const nextValue = !profile.moduleVisibility[key];
    const updated = updateWorkspaceModuleVisibility({ [key]: nextValue });

    useGmaoStore.getState().appendAuditEvent?.({
      actionType: 'WORKSPACE_PROFILE_UPDATED',
      entityType: 'SYSTEM',
      entityId: 'workspace_profile',
      before: { preset: profile.preset, moduleVisibility: before },
      after: { preset: updated.preset, moduleVisibility: updated.moduleVisibility },
    });

    showToast?.(
      `Projection de navigation mise à jour (${PRESET_UI_COPY[updated.preset]?.label || updated.preset}).`,
      'info'
    );
  };

  return (
    <SettingsSectionCard
      testId="workspace-mode-selector-card"
      title={
        <span className="flex items-center gap-2 flex-wrap">
          <span>Modes d&apos;Exploitation &amp; Profil d&apos;Espace de Travail</span>
          <span
            data-testid="workspace-active-mode-badge"
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
              profile.preset === 'SOLO_EXPERT'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {activeCopy.label} •{' '}
            {profile.governanceMode === 'SOLO_DIRECT' ? 'SOLO_DIRECT' : 'MAKER-CHECKER'}
          </span>
        </span>
      }
      description="Adapte la projection des écrans et le mode de gouvernance selon votre organisation (Usine Multi-Rôles ou Ingénieur Terrain Autonome) sans jamais supprimer ni altérer vos données SSOT."
      icon={<SlidersHorizontal />}
      footer={
        <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
          <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <span>
            <strong>Garantie Zéro Perte :</strong> Basculer entre <strong>Équipe Complète</strong> et{' '}
            <strong>Solo Expert</strong> est instantané et 100 % réversible. Les données Finance, Stock,
            Blueprints et Comptes restent intactes dans le SSOT. Les garde-fous de sécurité{' '}
            <strong>LOTO</strong>, <strong>SYSTEM_GENERAL</strong> et le journal d&apos;audit immuable
            restent toujours actifs.
          </span>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 3 Mode Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {PRESET_ORDER.map((presetId) => {
            const def = WORKSPACE_PRESET_DEFINITIONS[presetId];
            const copy = PRESET_UI_COPY[presetId];
            const Icon = PRESET_ICON[presetId];
            const isSelected = profile.preset === presetId;
            const isLocked = !def.enabled;

            return (
              <div
                key={presetId}
                data-testid={`workspace-preset-card-${presetId}`}
                aria-disabled={isLocked ? 'true' : undefined}
                className={`min-w-0 rounded-2xl border p-4 flex flex-col justify-between gap-4 transition-all ${
                  isLocked
                    ? 'bg-slate-50/80 border-slate-200/90 opacity-80'
                    : isSelected
                      ? presetId === 'SOLO_EXPERT'
                        ? 'bg-amber-50/40 border-amber-400 ring-2 ring-amber-200/70 shadow-sm'
                        : 'bg-emerald-50/35 border-emerald-400 ring-2 ring-emerald-200/70 shadow-sm'
                      : 'bg-white border-slate-200/90 hover:border-slate-300'
                }`}
              >
                <div className="space-y-3 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isLocked
                            ? 'bg-slate-100 text-slate-500 border-slate-200'
                            : isSelected
                              ? presetId === 'SOLO_EXPERT'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 truncate">
                          {copy.label}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-500 truncate">
                          {copy.tagline}
                        </div>
                      </div>
                    </div>

                    {isLocked ? (
                      <span
                        data-testid={`workspace-preset-badge-${presetId}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-200/80 text-slate-700 border border-slate-300 shrink-0"
                      >
                        <Lock className="w-3 h-3" />
                        Bientôt
                      </span>
                    ) : isSelected ? (
                      <span
                        data-testid={`workspace-preset-badge-${presetId}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${
                          presetId === 'SOLO_EXPERT'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Actif
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                        Disponible
                      </span>
                    )}
                  </div>

                  <p className="text-[11.5px] text-slate-600 leading-relaxed">
                    {copy.description}
                  </p>

                  <ul className="space-y-1.5 text-[11px] text-slate-700">
                    {copy.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            isLocked
                              ? 'bg-slate-400'
                              : presetId === 'SOLO_EXPERT'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                          }`}
                        />
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                    {def.defaultProfile.governanceMode === 'SOLO_DIRECT'
                      ? 'SOLO_DIRECT (ADMIN)'
                      : 'TEAM_MAKER_CHECKER'}
                  </span>
                  <button
                    type="button"
                    data-testid={`workspace-select-btn-${presetId}`}
                    disabled={isLocked || isSelected || !isAdmin}
                    aria-disabled={isLocked || isSelected || !isAdmin ? 'true' : undefined}
                    onClick={() => handleSelectPreset(presetId)}
                    className={
                      isLocked
                        ? SETTINGS_BUTTON_STYLES.secondary
                        : isSelected
                          ? SETTINGS_BUTTON_STYLES.secondary
                          : presetId === 'SOLO_EXPERT'
                            ? SETTINGS_BUTTON_STYLES.warning
                            : SETTINGS_BUTTON_STYLES.primary
                    }
                  >
                    {isLocked
                      ? 'En conception (Verrouillé)'
                      : isSelected
                        ? 'Mode actif'
                        : `Activer ${copy.label}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Fine-Grained Modular Projection Controls */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0" />
                <span>Projection Modulaire de la Navigation (Affichage Sans Perte)</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Affinez librement les modules visibles dans la barre latérale pour le mode actif (
                <strong>{activeCopy.label}</strong>).
              </p>
            </div>
            {profile.updatedAt && (
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                Maj : {new Date(profile.updatedAt).toLocaleString('fr-FR')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {VISIBILITY_CONTROLS.map((ctrl) => {
              const checked = Boolean(profile.moduleVisibility[ctrl.key]);
              return (
                <label
                  key={ctrl.key}
                  className={`flex items-start justify-between gap-3 p-3 rounded-xl border bg-white transition min-w-0 ${
                    isAdmin ? 'cursor-pointer hover:border-slate-300' : 'opacity-70 cursor-not-allowed'
                  } ${checked ? 'border-sky-200/90' : 'border-slate-200/80'}`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">{ctrl.label}</div>
                    <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {ctrl.description}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    data-testid={`workspace-visibility-${ctrl.key}`}
                    checked={checked}
                    disabled={!isAdmin}
                    onChange={() => handleToggleVisibility(ctrl.key)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
