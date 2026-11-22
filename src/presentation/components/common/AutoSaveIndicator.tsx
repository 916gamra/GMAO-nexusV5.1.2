import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18nContext';

export default function AutoSaveIndicator() {
  const { t, language } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timeLocale = language === 'en' ? 'en-GB' : language === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR';

  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | undefined;

    const handleSaving = () => {
      setStatus('saving');
    };

    const handleSaved = (e: Event) => {
      const custom = e as CustomEvent<{ timestamp?: number }>;
      setStatus('saved');
      setLastSaved(new Date(custom.detail?.timestamp || Date.now()));

      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        setStatus('idle');
      }, 3500);
    };

    window.addEventListener('gmao:state_saving', handleSaving);
    window.addEventListener('gmao:state_saved', handleSaved);

    return () => {
      window.removeEventListener('gmao:state_saving', handleSaving);
      window.removeEventListener('gmao:state_saved', handleSaved);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, []);

  if (status === 'idle' && !lastSaved) {
    return null;
  }

  return (
    <AnimatePresence>
      {status !== 'idle' && (
        <motion.div
          role="status"
          aria-live="polite"
          data-testid="autosave-indicator"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 right-4 z-40 select-none pointer-events-none"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 text-white shadow-lg backdrop-blur-md border border-slate-700/60 text-xs font-mono">
            {status === 'saving' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-amber-200">
                  {t('autosave.saving', 'Sauvegarde locale...')}
                </span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-accent-main" />
                <span className="text-white font-bold">
                  {t('autosave.saved', 'Enregistré')}{' '}
                  {lastSaved ? `(${lastSaved.toLocaleTimeString(timeLocale)})` : ''}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent-main animate-pulse shrink-0" />
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
