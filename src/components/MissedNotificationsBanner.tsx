// Missed Notifications Banner
// Shows a dismissible banner when there are past-due scheduled actions

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertCircle, 
  X, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  Phone,
  FileText,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMissedNotifications } from '@/hooks/useMissedNotifications';
import { formatTriggerTime } from '@/lib/scheduledActionsManager';
import { triggerHaptic } from '@/lib/haptics';
import { detectPlatform } from '@/lib/platformIcons';
import { PlatformIcon } from '@/components/PlatformIcon';
import type { ScheduledAction } from '@/types/scheduledAction';

interface MissedNotificationsBannerProps {
  className?: string;
}

export function MissedNotificationsBanner({ className }: MissedNotificationsBannerProps) {
  const { t } = useTranslation();
  const { 
    missedActions, 
    hasMissedActions, 
    dismissAction, 
    dismissAll, 
    executeAction,
    rescheduleAction,
  } = useMissedNotifications();
  
  const [isExpanded, setIsExpanded] = useState(false);

  if (!hasMissedActions) return null;

  const handleDismissAll = () => {
    triggerHaptic('light');
    dismissAll();
  };

  const handleExecute = (action: ScheduledAction) => {
    triggerHaptic('light');
    executeAction(action);
  };

  const handleDismissSingle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    dismissAction(id);
  };

  const handleReschedule = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    await rescheduleAction(id);
  };

  const getDestinationIcon = (action: ScheduledAction) => {
    switch (action.destination.type) {
      case 'url': {
        // Check for platform-specific icon
        const platform = detectPlatform(action.destination.uri);
        if (platform) {
          return (
            <PlatformIcon 
              platform={platform} 
              size="sm"
              className="h-full w-full"
            />
          );
        }
        return <ExternalLink className="h-4 w-4" />;
      }
      case 'contact':
        return <Phone className="h-4 w-4" />;
      case 'file':
        return <FileText className="h-4 w-4" />;
    }
  };

  // Check if URL destination has a platform icon
  const hasPlatformIcon = (action: ScheduledAction) => {
    return action.destination.type === 'url' && detectPlatform(action.destination.uri) !== null;
  };

  const getDestinationLabel = (action: ScheduledAction) => {
    switch (action.destination.type) {
      case 'url':
        return action.destination.name || action.destination.uri;
      case 'contact':
        return action.destination.contactName;
      case 'file':
        return action.destination.name;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`bg-warning/10 border border-warning/30 rounded-xl overflow-hidden ${className}`}
      >
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 p-3 text-start"
        >
          <div className="h-8 w-8 rounded-lg bg-warning/20 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4 text-warning-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t('missedNotifications.title', { count: missedActions.length })}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {t('missedNotifications.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleDismissAll();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ScrollArea className="max-h-48">
                <div className="px-3 pb-3 space-y-2">
                  {missedActions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors cursor-pointer"
                      onClick={() => handleExecute(action)}
                    >
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${hasPlatformIcon(action) ? '' : 'bg-muted'}`}>
                        {getDestinationIcon(action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{action.name}</p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-wrap">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span className="truncate">{formatTriggerTime(action.triggerTime)}</span>
                          <span className="text-warning-foreground shrink-0">
                            • {t('missedNotifications.missed')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {action.recurrence !== 'once' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => handleReschedule(action.id, e)}
                            title={t('missedNotifications.reschedule')}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => handleDismissSingle(action.id, e)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Footer actions */}
              <div className="px-3 pb-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={handleDismissAll}
                >
                  {t('missedNotifications.dismissAll')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
