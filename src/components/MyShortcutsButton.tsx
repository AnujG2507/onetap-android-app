import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const SHORTCUTS_STORAGE_KEY = 'quicklaunch_shortcuts';

export function MyShortcutsButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [shortcutsCount, setShortcutsCount] = useState(0);

  // Get shortcuts count from localStorage
  useEffect(() => {
    const updateCount = () => {
      try {
        const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
        const shortcuts = stored ? JSON.parse(stored) : [];
        setShortcutsCount(Array.isArray(shortcuts) ? shortcuts.length : 0);
      } catch {
        setShortcutsCount(0);
      }
    };

    updateCount();

    // Listen for shortcuts changes
    const handleShortcutsChange = () => updateCount();
    window.addEventListener('shortcuts-changed', handleShortcutsChange);
    
    return () => {
      window.removeEventListener('shortcuts-changed', handleShortcutsChange);
    };
  }, []);

  const handleClick = () => {
    navigate('/my-shortcuts');
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full flex items-center gap-3 p-4 rounded-xl",
        "bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5",
        "border border-primary/20",
        "shadow-sm hover:shadow-md",
        "active:scale-[0.98] transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
      )}
    >
      {/* Icon */}
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shrink-0">
        <Zap className="h-5 w-5" />
      </div>

      {/* Text */}
      <div className="flex-1 text-start min-w-0">
        <span className="text-sm font-semibold text-foreground">
          {t('menu.shortcuts')}
        </span>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('shortcuts.manageDesc', 'View and manage your shortcuts')}
        </p>
      </div>

      {/* Badge + Chevron */}
      <div className="flex items-center gap-2 shrink-0">
        {shortcutsCount > 0 && (
          <span className="h-6 min-w-6 px-2 rounded-full bg-primary text-xs font-bold text-primary-foreground flex items-center justify-center">
            {shortcutsCount > 99 ? '99+' : shortcutsCount}
          </span>
        )}
        <ChevronRight className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
      </div>
    </button>
  );
}
