import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Plus, 
  Zap, 
  EyeOff, 
  Smartphone,
  Clock,
  Calendar,
  Bell,
  Link,
  Phone,
  Bookmark,
  Star,
  FolderOpen,
  Globe,
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
  { icon: Smartphone, labelKey: 'emptyState.valueProp3' },
];

const FLOATING_ICONS = {
  reminders: [
    { Icon: Clock, className: 'top-8 left-8 h-6 w-6', delay: '' },
    { Icon: Calendar, className: 'top-12 right-12 h-5 w-5', delay: 'delayed' },
    { Icon: Bell, className: 'bottom-32 left-12 h-5 w-5', delay: '' },
    { Icon: Link, className: 'top-24 left-1/4 h-4 w-4', delay: 'delayed' },
    { Icon: Phone, className: 'bottom-40 right-16 h-4 w-4', delay: '' },
  ],
  library: [
    { Icon: Bookmark, className: 'top-8 right-10 h-5 w-5', delay: '' },
    { Icon: Link, className: 'top-16 left-10 h-4 w-4', delay: 'delayed' },
    { Icon: Star, className: 'bottom-32 left-16 h-5 w-5', delay: '' },
    { Icon: FolderOpen, className: 'top-20 right-1/4 h-4 w-4', delay: 'delayed' },
    { Icon: Globe, className: 'bottom-40 right-12 h-4 w-4', delay: '' },
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
      {/* Animated floating icons */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingIcons.map(({ Icon, className, delay }, index) => (
          <Icon
            key={index}
            className={cn(
              'absolute text-primary/15',
              className,
              delay === 'delayed' ? 'animate-float-delayed' : 'animate-float'
            )}
          />
        ))}
      </div>

      {/* Main icon with glow */}
      <div className="relative mb-4 animate-float">
        <div className="absolute inset-0 bg-primary/15 rounded-2xl blur-xl scale-150" />
        <div className="relative w-16 h-16 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center">
          {icon}
        </div>
      </div>

      {/* Text content */}
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground/70 mb-6 max-w-[240px]">
        {description}
      </p>

      {/* Value Proposition Section */}
      <div className="w-full max-w-xs mb-6">
        <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
          {t('emptyState.whyDifferent')}
        </p>
        <div className="space-y-2">
          {VALUE_PROPS.map(({ icon: PropIcon, labelKey }, index) => (
            <div
              key={labelKey}
              className="flex items-center gap-3 bg-muted/30 border border-border/30 rounded-lg px-3 py-2.5 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'backwards' }}
            >
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <PropIcon className="h-4 w-4 text-primary animate-pulse-soft" />
              </div>
              <span className="text-sm text-foreground/80 text-start">
                {t(labelKey)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Button - dashed style for consistency */}
      <button
        onClick={onCtaClick}
        className="flex items-center justify-center gap-2 w-full max-w-xs py-4 border-2 border-dashed border-muted-foreground/30 rounded-xl text-muted-foreground hover:border-primary/50 hover:text-primary hover:scale-[1.02] transition-all duration-200"
      >
        <Plus className="h-5 w-5" />
        <span className="text-sm font-medium">{ctaLabel}</span>
      </button>
    </div>
  );
}
