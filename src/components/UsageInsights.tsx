import { useUsageStats } from '@/hooks/useUsageStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, MousePointerClick, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function UsageInsights() {
  const { t } = useTranslation();
  const stats = useUsageStats();

  return (
    <Card className="bg-card border-border overflow-hidden w-full min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t('usage.title', 'Usage Insights')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 overflow-hidden min-w-0">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-foreground">
              <Zap className="h-5 w-5 text-primary" />
              {stats.totalShortcuts}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('usage.shortcuts', 'Access Points')}
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-foreground">
              <MousePointerClick className="h-5 w-5 text-primary" />
              {stats.totalTaps}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('usage.totalTaps', 'Total Taps')}
            </div>
          </div>
        </div>

        {/* Top Access Points */}
        {stats.mostUsedShortcuts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('usage.topShortcuts', 'Top Access Points')}
            </h4>
            <div className="space-y-1.5">
              {stats.mostUsedShortcuts.slice(0, 3).map((shortcut, index) => (
                <div 
                  key={shortcut.id} 
                  className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground w-4">
                      {index + 1}.
                    </span>
                    <span className="text-lg">
                      {shortcut.icon.type === 'emoji' ? shortcut.icon.value : '📎'}
                    </span>
                    <span className="text-sm text-foreground truncate">
                      {shortcut.name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ms-2">
                    {shortcut.usageCount} {t('usage.taps', 'taps')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {stats.totalShortcuts === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            {t('usage.noShortcuts', 'Create your first shortcut to see insights!')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
