import { useTranslation } from 'react-i18next';
import { Zap, Sparkles, Clock, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OnboardingFlowProps {
  currentStep: number;
  onNext: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

const TOTAL_STEPS = 3;

export function OnboardingFlow({ currentStep, onNext, onSkip, onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();

  const steps = [
    {
      icon: <Zap className="h-16 w-16" />,
      title: t('onboarding.step1.title'),
      description: t('onboarding.step1.description'),
      gradient: 'from-primary/20 to-primary/5',
      iconColor: 'text-primary',
    },
    {
      icon: <Sparkles className="h-16 w-16" />,
      title: t('onboarding.step2.title'),
      description: t('onboarding.step2.description'),
      gradient: 'from-accent/20 to-accent/5',
      iconColor: 'text-accent-foreground',
    },
    {
      icon: <Clock className="h-16 w-16" />,
      title: t('onboarding.step3.title'),
      description: t('onboarding.step3.description'),
      gradient: 'from-secondary/40 to-secondary/10',
      iconColor: 'text-secondary-foreground',
    },
  ];

  const step = steps[currentStep] || steps[0];
  const isLastStep = currentStep === TOTAL_STEPS - 1;

  const handleAction = () => {
    if (isLastStep) {
      onComplete();
    } else {
      onNext();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Skip button */}
      <div className="flex justify-end p-4 pt-header-safe-compact">
        <button
          onClick={onSkip}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('onboarding.skip')}
        >
          {t('onboarding.skip')}
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content - horizontal in landscape, vertical in portrait */}
      <div className="flex-1 flex flex-col landscape:flex-row items-center justify-center px-8 landscape:px-12 landscape:gap-12">
        {/* Icon with gradient background */}
        <div
          className={cn(
            'mb-8 landscape:mb-0 flex h-32 w-32 landscape:h-24 landscape:w-24 items-center justify-center rounded-full shrink-0',
            'bg-gradient-to-br',
            step.gradient,
            'animate-fade-in'
          )}
          key={currentStep}
        >
          <div className={cn(step.iconColor, 'animate-scale-in', 'landscape:[&>svg]:h-12 landscape:[&>svg]:w-12')}>
            {step.icon}
          </div>
        </div>

        {/* Text content */}
        <div className="text-center landscape:text-start max-w-sm animate-fade-in" key={`text-${currentStep}`}>
          <h1 className="text-2xl landscape:text-xl font-bold text-foreground mb-4 landscape:mb-2">
            {step.title}
          </h1>
          <p className="text-muted-foreground leading-relaxed landscape:text-sm">
            {step.description}
          </p>
        </div>
      </div>

      {/* Bottom section - reduced padding in landscape */}
      <div className="p-8 pb-12 landscape:p-4 landscape:pb-6">
        {/* Progress indicators */}
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                index === currentStep
                  ? 'w-8 bg-primary'
                  : index < currentStep
                  ? 'w-2 bg-primary/50'
                  : 'w-2 bg-muted'
              )}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* Action button */}
        <Button
          onClick={handleAction}
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-2xl"
          aria-label={isLastStep ? t('onboarding.getStarted') : t('onboarding.next')}
        >
          {isLastStep ? t('onboarding.getStarted') : t('onboarding.next')}
          <ChevronRight className="h-5 w-5 ms-1 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
