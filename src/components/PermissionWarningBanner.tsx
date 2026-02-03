// Permission Warning Banner
// Shows a non-intrusive but noticeable warning when required permissions are denied
// Helps users understand why their scheduled reminders might not work

import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Bell, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { triggerHaptic } from '@/lib/haptics';

interface PermissionWarningBannerProps {
  notificationsGranted: boolean;
  alarmsGranted: boolean;
  onRequestPermissions: () => void;
  onOpenAlarmSettings: () => void;
  className?: string;
}

export function PermissionWarningBanner({
  notificationsGranted,
  alarmsGranted,
  onRequestPermissions,
  onOpenAlarmSettings,
  className,
}: PermissionWarningBannerProps) {
  const { t } = useTranslation();

  // Don't show if all permissions are granted
  if (notificationsGranted && alarmsGranted) return null;

  const handleAction = () => {
    triggerHaptic('light');
    
    // If notifications are denied, request them first
    if (!notificationsGranted) {
      onRequestPermissions();
    } 
    // If only alarms are denied, open alarm settings
    else if (!alarmsGranted) {
      onOpenAlarmSettings();
    }
  };

  // Determine which permissions are missing
  const missingNotifications = !notificationsGranted;
  const missingAlarms = !alarmsGranted;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`bg-destructive/10 border border-destructive/30 rounded-xl overflow-hidden ${className}`}
      >
        <button
          onClick={handleAction}
          className="w-full flex items-center gap-3 p-3 text-start"
        >
          <div className="h-8 w-8 rounded-lg bg-destructive/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t('permissionWarning.title')}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {missingNotifications && (
                <span className="flex items-center gap-1 text-destructive">
                  <Bell className="h-3 w-3" />
                  {t('permissionWarning.notifications')}
                </span>
              )}
              {missingNotifications && missingAlarms && (
                <span className="text-muted-foreground">•</span>
              )}
              {missingAlarms && (
                <span className="flex items-center gap-1 text-destructive">
                  <Clock className="h-3 w-3" />
                  {t('permissionWarning.alarms')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {t('permissionWarning.fix')}
              <ChevronRight className="h-3 w-3 ms-1" />
            </Button>
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
