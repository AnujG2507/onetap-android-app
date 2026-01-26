import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Plus, 
  Zap, 
  EyeOff,
  Clock,
  Bell,
  Bookmark,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateWithValuePropProps {
  icon: ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  onCtaClick: () => void;
  variant: 'reminders' | 'library';
}

const VALUE_PROPS = [
  { icon: Zap, labelKey: 'emptyState.valueProp1' },
  { icon: EyeOff, labelKey: 'emptyState.valueProp2' },
];

// Reduced to 2 subtle floating icons per variant
const FLOATING_ICONS = {
  reminders: [
    { Icon: Clock, className: 'top-6 right-8 h-5 w-5' },
    { Icon: Bell, className: 'bottom-28 left-10 h-4 w-4' },
  ],
  library: [
    { Icon: Bookmark, className: 'top-6 left-8 h-5 w-5' },
    { Icon: Link, className: 'bottom-28 right-10 h-4 w-4' },
  ],
};

export function EmptyStateWithValueProp({
  icon,
  title,
  description,
  ctaLabel,
  onCtaClick,
  variant,
}: EmptyStateWithValuePropProps) {
  const { t } = useTranslation();
  const floatingIcons = FLOATING_ICONS[variant];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center relative animate-fade-in">
      {/* Subtle floating icons - static, no animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingIcons.map(({ Icon, className }, index) => (
          <Icon
            key={index}
            className={cn(
              'absolute text-primary/10',
              className
            )}
          />
        ))}
      </div>

      {/* Main icon - static, no float animation */}
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl scale-150" />
        <div className="relative w-16 h-16 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center">
          {icon}
        </div>
      </div>

      {/* Text content */}
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground/70 mb-6 max-w-[240px]">
        {description}
      </p>

      {/* Value Proposition Section - reduced to 2 items */}
      <div className="w-full max-w-xs mb-6">
        <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">
          {t('emptyState.whyDifferent')}
        </p>
        <div className="space-y-2">
          {VALUE_PROPS.map(({ icon: PropIcon, labelKey }, index) => (
            <div
              key={labelKey}
              className="flex items-center gap-3 bg-muted/20 border border-border/20 rounded-lg px-3 py-2.5"
            >
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <PropIcon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-foreground/70 text-start">
                {t(labelKey)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Button - solid style, confident */}
      <button
        onClick={onCtaClick}
        className="flex items-center justify-center gap-2 w-full max-w-xs py-3.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 shadow-sm"
      >
        <Plus className="h-5 w-5" />
        <span className="text-sm">{ctaLabel}</span>
      </button>
    </div>
  );
}
