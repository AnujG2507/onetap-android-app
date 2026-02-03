import { useUsageStats } from '@/hooks/useUsageStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { Zap, MousePointerClick, TrendingUp, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function UsageInsights() {
  const { t } = useTranslation();
  const stats = useUsageStats();

  const getEncouragementMessage = () => {
    if (stats.thisMonthTaps === 0) {
      return t('usage.startUsing', 'Start using your shortcuts to see your stats!');
    }
    if (stats.thisMonthTaps < 10) {
      return t('usage.gettingStarted', "You're getting started! Keep it up!");
    }
    if (stats.thisMonthTaps < 50) {
      return t('usage.doingGreat', "You're doing great! {{taps}} taps saved this month.", { taps: stats.thisMonthTaps });
    }
    if (stats.thisMonthTaps < 100) {
      return t('usage.powerUser', "Power user! You've saved {{taps}} taps this month! 🔥", { taps: stats.thisMonthTaps });
    }
    return t('usage.superUser', "🏆 Super user! {{taps}} taps saved this month!", { taps: stats.thisMonthTaps });
  };

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
              {t('usage.shortcuts', 'Shortcuts')}
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

        {/* Encouragement Message */}
        <div className="bg-primary/10 rounded-lg p-3 flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground min-w-0 break-words">
            {getEncouragementMessage()}
          </p>
        </div>

        {/* Weekly Activity Chart */}
        {stats.weeklyActivity.length > 0 && stats.totalTaps > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('usage.weeklyActivity', 'This Week')}
            </h4>
            <div className="h-20 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.weeklyActivity} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis 
                    dataKey="day" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    dy={5}
                  />
                  <YAxis hide />
                  <Bar 
                    dataKey="taps" 
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  >
                    {stats.weeklyActivity.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={index === 6 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
