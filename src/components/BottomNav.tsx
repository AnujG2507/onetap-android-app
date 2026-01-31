import { useTranslation } from 'react-i18next';
import { Zap, Bell, Bookmark, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrientation } from '@/hooks/useOrientation';

export type TabType = 'access' | 'reminders' | 'bookmarks' | 'profile';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  hasShortlist?: boolean;
  isSignedIn?: boolean;
  hasActiveActions?: boolean;
}

export function BottomNav({ activeTab, onTabChange, hasShortlist, isSignedIn, hasActiveActions }: BottomNavProps) {
  const { t } = useTranslation();
  const { isLandscape } = useOrientation();
  
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-background border-t border-border safe-bottom z-50">
      <div className={cn(
        "flex items-center justify-around",
        isLandscape ? "h-10" : "h-14"
      )}>
        <button
          onClick={() => onTabChange('access')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors",
            activeTab === 'access'
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          <Zap className={cn(
            isLandscape ? "h-4 w-4" : "h-5 w-5",
            "transition-all",
            activeTab === 'access' && "fill-current"
          )} />
          {!isLandscape && <span className="text-[10px] font-medium">{t('tabs.access')}</span>}
        </button>
        
        <button
          onClick={() => onTabChange('reminders')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative",
            activeTab === 'reminders'
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          <div className="relative">
            <Bell className={cn(
              isLandscape ? "h-4 w-4" : "h-5 w-5",
              "transition-all",
              activeTab === 'reminders' && "fill-current"
            )} />
            {hasActiveActions && (
              <span className="absolute -top-0.5 -end-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
          {!isLandscape && <span className="text-[10px] font-medium">{t('tabs.reminders')}</span>}
        </button>
        
        <button
          onClick={() => onTabChange('bookmarks')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative",
            activeTab === 'bookmarks'
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          <div className="relative">
            <Bookmark className={cn(
              isLandscape ? "h-4 w-4" : "h-5 w-5",
              "transition-all",
              activeTab === 'bookmarks' && "fill-current"
            )} />
            {hasShortlist && (
              <span className="absolute -top-0.5 -end-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
          {!isLandscape && <span className="text-[10px] font-medium">{t('tabs.bookmarks')}</span>}
        </button>

        <button
          onClick={() => onTabChange('profile')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative",
            activeTab === 'profile'
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          <div className="relative">
            <User className={cn(
              isLandscape ? "h-4 w-4" : "h-5 w-5",
              "transition-all",
              activeTab === 'profile' && "fill-current"
            )} />
            {isSignedIn && (
              <span className="absolute -top-0.5 -end-0.5 h-2 w-2 rounded-full bg-green-500" />
            )}
          </div>
          {!isLandscape && <span className="text-[10px] font-medium">{t('tabs.profile')}</span>}
        </button>
      </div>
    </nav>
  );
}
