import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MyShortcutsContent } from '@/components/MyShortcutsContent';
import { useShortcuts } from '@/hooks/useShortcuts';
import type { ScheduledActionDestination } from '@/types/scheduledAction';

export default function MyShortcuts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { syncWithHomeScreen, refreshFromStorage } = useShortcuts();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleCreateReminder = (destination: ScheduledActionDestination) => {
    navigate('/', { 
      state: { 
        pendingReminder: destination,
        activeTab: 'reminders',
      } 
    });
  };

  const handleRefresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      refreshFromStorage();
      await syncWithHomeScreen();
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  }, [refreshFromStorage, syncWithHomeScreen]);

  return (
    <div className="min-h-app-viewport bg-background flex flex-col">
      {/* Header */}
      <header className="ps-5 pe-5 pt-header-safe pb-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="h-9 w-9 shrink-0"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground truncate">
              {t('shortcuts.title')}
            </h1>
          </div>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isSyncing}
                  className="h-9 w-9 shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{t('shortcuts.syncTooltip')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* Content */}
      <MyShortcutsContent 
        onCreateReminder={handleCreateReminder}
        onRefresh={handleRefresh}
        isSyncing={isSyncing}
      />
    </div>
  );
}
