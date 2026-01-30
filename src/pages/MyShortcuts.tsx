import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MyShortcutsContent } from '@/components/MyShortcutsContent';
import type { ScheduledActionDestination } from '@/types/scheduledAction';

export default function MyShortcuts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // Check if we came from somewhere in the app
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleCreateReminder = (destination: ScheduledActionDestination) => {
    // Navigate back to Index with reminder state
    navigate('/', { 
      state: { 
        pendingReminder: destination,
        activeTab: 'reminders',
      } 
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="ps-4 pe-4 pt-header-safe pb-3 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="h-9 w-9 shrink-0"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Zap className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg font-semibold text-foreground truncate">
              {t('shortcuts.title')}
            </h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <MyShortcutsContent onCreateReminder={handleCreateReminder} />
    </div>
  );
}
