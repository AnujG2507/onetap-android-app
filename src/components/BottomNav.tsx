import { Zap, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabType = 'access' | 'bookmarks';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  hasShortlist?: boolean;
}

export function BottomNav({ activeTab, onTabChange, hasShortlist }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-14">
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
            "h-5 w-5 transition-all",
            activeTab === 'access' && "fill-current"
          )} />
          <span className="text-[10px] font-medium">Access</span>
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
              "h-5 w-5 transition-all",
              activeTab === 'bookmarks' && "fill-current"
            )} />
            {/* Subtle shortlist indicator dot */}
            {hasShortlist && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
          <span className="text-[10px] font-medium">Bookmarks</span>
        </button>
      </div>
    </nav>
  );
}
