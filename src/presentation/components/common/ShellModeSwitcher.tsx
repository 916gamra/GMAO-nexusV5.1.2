import { useState, useRef, useEffect } from 'react';
import { Monitor, Smartphone, Sparkles, RotateCcw, ChevronDown, Check } from 'lucide-react';
import { useAppShell, ShellMode } from '../../../core/shell/shellPolicy';
import { useTranslation } from '../../../i18n/I18nContext';

interface ShellModeSwitcherProps {
  compact?: boolean;
  onModeChanged?: (mode: ShellMode) => void;
  className?: string;
}

export default function ShellModeSwitcher({
  compact = false,
  onModeChanged,
  className = '',
}: ShellModeSwitcherProps) {
  const { t } = useTranslation();
  const { mode, resolved, source, setMode, clearOverride } = useAppShell();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (nextMode: ShellMode) => {
    setMode(nextMode);
    onModeChanged?.(nextMode);
    setIsOpen(false);
  };

  const handleResetAuto = () => {
    clearOverride();
    onModeChanged?.('auto');
    setIsOpen(false);
  };

  const modeAutoLabel = t('shell.mode_auto', 'Auto');
  const modeDesktopLabel = t('shell.mode_desktop', 'Desktop');
  const modeMobileLabel = t('shell.mode_mobile', 'Mobile');
  const resolvedLabel = resolved === 'mobile' ? modeMobileLabel : modeDesktopLabel;

  if (compact) {
    const activeLabel =
      mode === 'auto' ? modeAutoLabel : mode === 'desktop' ? modeDesktopLabel : modeMobileLabel;
    return (
      <div
        ref={containerRef}
        data-testid="shell-mode-switcher-compact"
        className={`relative shrink-0 ${className}`}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={t(
            'shell.trigger_aria',
            `Mode d'affichage (actuellement ${activeLabel}, résolu : ${resolvedLabel})`,
            { mode: activeLabel, resolved: resolvedLabel }
          )}
          title={t(
            'shell.trigger_title',
            `Affichage : ${activeLabel} (résolu : ${resolvedLabel})`,
            { mode: activeLabel, resolved: resolvedLabel }
          )}
          className="h-8 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 rounded-full bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/90 text-xs font-bold text-slate-700 transition shadow-2xs hover:shadow-xs cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-hidden group"
        >
          {mode === 'auto' && (
            <Sparkles size={14} className="text-emerald-600 group-hover:scale-110 transition-transform shrink-0" aria-hidden="true" />
          )}
          {mode === 'desktop' && (
            <Monitor size={14} className="text-blue-600 group-hover:scale-110 transition-transform shrink-0" aria-hidden="true" />
          )}
          {mode === 'mobile' && (
            <Smartphone size={14} className="text-amber-600 group-hover:scale-110 transition-transform shrink-0" aria-hidden="true" />
          )}

          <span className="hidden lg:inline text-[11px] font-bold text-slate-800">
            {activeLabel}
          </span>

          <span
            data-testid="shell-resolved-badge"
            className="hidden xl:inline px-1.5 py-0.2 rounded-md bg-white border border-slate-200 text-emerald-800 font-mono text-[10px] font-bold shadow-2xs"
            title={`${t('shell.resolved_prefix', 'résolu')}: ${resolved} (${source})`}
          >
            ={resolved}
          </span>

          <ChevronDown
            size={12}
            className={`text-slate-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div
            role="menu"
            aria-label={t('shell.select_aria', "Sélection du mode d'affichage")}
            className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-2 select-none z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="px-3.5 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">
                  {t('shell.policy_badge', 'SHELL POLICY')}
                </div>
                <div className="text-xs font-bold text-slate-800">
                  {t('shell.title', "Mode d'affichage & ergonomie")}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[10px] font-bold">
                {resolved}
              </span>
            </div>

            <div className="py-1 px-1.5 space-y-0.5">
              {/* Option Auto */}
              <button
                type="button"
                onClick={() => handleSelect('auto')}
                data-testid="shell-mode-btn-auto"
                className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition cursor-pointer ${
                  mode === 'auto'
                    ? 'bg-emerald-50/90 text-emerald-950 font-bold border border-emerald-200/60 shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Sparkles size={15} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <span>{modeAutoLabel}</span>
                      <span className="text-[9px] font-mono px-1 rounded bg-emerald-200/60 text-emerald-800">
                        {t('shell.recommended', 'Recommandé')}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {t('shell.auto_desc', "Détection intelligente selon l'écran")}
                    </div>
                  </div>
                </div>
                {mode === 'auto' && <Check size={14} className="text-emerald-600 shrink-0" />}
              </button>

              {/* Option Desktop */}
              <button
                type="button"
                onClick={() => handleSelect('desktop')}
                data-testid="shell-mode-btn-desktop"
                className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition cursor-pointer ${
                  mode === 'desktop'
                    ? 'bg-blue-50/90 text-blue-950 font-bold border border-blue-200/60 shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Monitor size={15} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <span>{modeDesktopLabel}</span>
                      {mode === 'desktop' && (
                        <span className="text-[9px] font-mono px-1 rounded bg-blue-200/60 text-blue-800">
                          {t('shell.forced', 'Forcé')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {t('shell.desktop_desc', 'Suite complète de gestion GMAO')}
                    </div>
                  </div>
                </div>
                {mode === 'desktop' && <Check size={14} className="text-blue-600 shrink-0" />}
              </button>

              {/* Option Mobile */}
              <button
                type="button"
                onClick={() => handleSelect('mobile')}
                data-testid="shell-mode-btn-mobile"
                className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition cursor-pointer ${
                  mode === 'mobile'
                    ? 'bg-amber-50/90 text-amber-950 font-bold border border-amber-200/60 shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Smartphone size={15} />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <span>{modeMobileLabel}</span>
                      {mode === 'mobile' && (
                        <span className="text-[9px] font-mono px-1 rounded bg-amber-200/60 text-amber-800">
                          {t('shell.forced', 'Forcé')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {t('shell.mobile_desc', 'Cockpit terrain optimisé tactile')}
                    </div>
                  </div>
                </div>
                {mode === 'mobile' && <Check size={14} className="text-amber-600 shrink-0" />}
              </button>
            </div>

            {/* Clear override button if not auto */}
            {mode !== 'auto' && (
              <div className="pt-1.5 mt-1 border-t border-slate-100 px-1.5">
                <button
                  type="button"
                  onClick={handleResetAuto}
                  data-testid="shell-clear-override-btn"
                  className="w-full px-2.5 py-1.5 rounded-xl text-left flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                >
                  <RotateCcw size={13} className="text-slate-400 shrink-0" />
                  <span>{t('shell.reset_auto', 'Rétablir la détection automatique')}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="shell-mode-switcher"
      className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>{t('shell.panel_title', "Politique d'Affichage (ShellPolicy)")}</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {t(
              'shell.panel_subtitle',
              'Basculez instantanément entre la détection automatique, le Bureau complet ou le Shell Mobile terrain.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            data-testid="shell-resolved-indicator"
            className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-[11px] font-bold"
          >
            {t('shell.resolved_prefix', 'résolu')}: {resolved}
          </span>
          {mode !== 'auto' && (
            <button
              type="button"
              onClick={() => clearOverride()}
              data-testid="shell-clear-override-btn"
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              title={t('shell.reset_tooltip', 'Réinitialiser sur Auto')}
              aria-label={t('shell.reset_tooltip', 'Réinitialiser sur Auto')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleSelect('auto')}
          data-testid="shell-mode-btn-auto"
          className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
            mode === 'auto'
              ? 'bg-emerald-50/90 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <Sparkles className={`w-4 h-4 ${mode === 'auto' ? 'text-emerald-600' : 'text-slate-400'}`} />
            {mode === 'auto' && (
              <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-900">
                {t('shell.active', 'Actif')}
              </span>
            )}
          </div>
          <div>
            <div className="text-xs font-black">{modeAutoLabel}</div>
            <div className="text-[10px] text-slate-500 leading-tight">
              {t('shell.auto_short_desc', 'Tactile & Écran')}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('desktop')}
          data-testid="shell-mode-btn-desktop"
          className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
            mode === 'desktop'
              ? 'bg-blue-50/90 border-blue-600 text-blue-950 ring-2 ring-blue-500/20'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <Monitor className={`w-4 h-4 ${mode === 'desktop' ? 'text-blue-600' : 'text-slate-400'}`} />
            {mode === 'desktop' && (
              <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-blue-200/80 text-blue-900">
                {t('shell.forced', 'Forcé')}
              </span>
            )}
          </div>
          <div>
            <div className="text-xs font-black">{modeDesktopLabel}</div>
            <div className="text-[10px] text-slate-500 leading-tight">
              {t('shell.desktop_short_desc', 'Suite Admin PC')}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('mobile')}
          data-testid="shell-mode-btn-mobile"
          className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
            mode === 'mobile'
              ? 'bg-amber-50/90 border-amber-500 text-amber-950 ring-2 ring-amber-500/20'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <Smartphone className={`w-4 h-4 ${mode === 'mobile' ? 'text-amber-600' : 'text-slate-400'}`} />
            {mode === 'mobile' && (
              <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900">
                {t('shell.forced', 'Forcé')}
              </span>
            )}
          </div>
          <div>
            <div className="text-xs font-black">{modeMobileLabel}</div>
            <div className="text-[10px] text-slate-500 leading-tight">
              {t('shell.mobile_short_desc', 'Shell Terrain')}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
