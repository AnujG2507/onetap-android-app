// Premium Scheduled Timing Picker - redesigned with quick presets, wheel picker, and premium visuals
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  Sun, 
  Moon, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Repeat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { TimeWheelPicker } from '@/components/ui/time-wheel-picker';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { RecurrenceType, RecurrenceAnchor } from '@/types/scheduledAction';
import { computeNextTrigger } from '@/lib/scheduledActionsManager';

interface ScheduledTimingPickerProps {
  onConfirm: (triggerTime: number, recurrence: RecurrenceType, anchor: RecurrenceAnchor) => void;
  onBack: () => void;
  suggestedRecurrence?: RecurrenceType;
  initialTime?: number;
  initialRecurrence?: RecurrenceType;
  initialAnchor?: RecurrenceAnchor;
}

// Quick preset card component
interface QuickPresetProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onClick: () => void;
  selected?: boolean;
}

function QuickPreset({ icon, label, sublabel, onClick, selected }: QuickPresetProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        triggerHaptic('light');
        onClick();
      }}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-2xl p-4 text-left transition-all",
        "bg-gradient-to-br from-muted/60 to-muted/30 border border-border/50",
        "hover:from-primary/15 hover:to-primary/5 hover:border-primary/30",
        "active:scale-[0.98]",
        selected && "from-primary/20 to-primary/10 border-primary/40 ring-2 ring-primary/20"
      )}
    >
      <div className={cn(
        "p-2 rounded-xl",
        selected ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground"
      )}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      </div>
    </motion.button>
  );
}

// Week calendar picker component
interface WeekCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

function WeekCalendar({ selectedDate, onDateSelect }: WeekCalendarProps) {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  
  const weekDates = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + weekOffset * 7);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [weekOffset]);

  const monthLabel = useMemo(() => {
    const firstDay = weekDates[0];
    const lastDay = weekDates[6];
    if (firstDay.getMonth() === lastDay.getMonth()) {
      return firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    return `${firstDay.toLocaleDateString(undefined, { month: 'short' })} - ${lastDay.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  }, [weekDates]);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const getDateLabel = (date: Date) => {
    if (date.toDateString() === today.toDateString()) return t('scheduledTiming.today');
    if (date.toDateString() === tomorrow.toDateString()) return t('scheduledTiming.tomorrow');
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-muted/40 to-muted/20 border border-border/50 p-4 space-y-4">
      {/* Month header with navigation */}
      <div className="flex items-center justify-between">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            triggerHaptic('light');
            setWeekOffset(w => w - 1);
          }}
          disabled={weekOffset <= 0}
          className={cn(
            "p-2.5 rounded-xl transition-all",
            "bg-background/60 hover:bg-background border border-border/50 shadow-sm",
            "disabled:opacity-30 disabled:pointer-events-none"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </motion.button>
        <motion.span 
          key={monthLabel}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-semibold text-foreground"
        >
          {monthLabel}
        </motion.span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            triggerHaptic('light');
            setWeekOffset(w => w + 1);
          }}
          disabled={weekOffset >= 4}
          className={cn(
            "p-2.5 rounded-xl transition-all",
            "bg-background/60 hover:bg-background border border-border/50 shadow-sm",
            "disabled:opacity-30 disabled:pointer-events-none"
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </motion.button>
      </div>
      
      {/* Days grid - larger touch targets */}
      <div className="grid grid-cols-7 gap-2">
        <AnimatePresence mode="popLayout">
          {weekDates.map((date, index) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            const isToday = date.toDateString() === today.toDateString();
            const isPast = date < today && !isToday;
            
            return (
              <motion.button
                key={date.toISOString()}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.02 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  if (!isPast) {
                    triggerHaptic('light');
                    onDateSelect(date);
                  }
                }}
                disabled={isPast}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-2xl py-3 transition-all relative aspect-square",
                  isPast && "opacity-30 pointer-events-none",
                  isSelected
                    ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30"
                    : isToday
                      ? "bg-background border-2 border-primary/40 shadow-sm"
                      : "bg-background/60 border border-border/30 hover:bg-background hover:border-border/50 hover:shadow-sm"
                )}
              >
                {/* Day label */}
                <span className={cn(
                  "text-[9px] font-semibold uppercase tracking-wide",
                  isSelected 
                    ? "text-primary-foreground/90" 
                    : isToday 
                      ? "text-primary"
                      : "text-muted-foreground"
                )}>
                  {getDateLabel(date).slice(0, 3)}
                </span>
                {/* Date number */}
                <span className={cn(
                  "text-xl font-bold tabular-nums leading-none",
                  isSelected 
                    ? "text-primary-foreground" 
                    : isToday
                      ? "text-primary"
                      : "text-foreground"
                )}>
                  {date.getDate()}
                </span>
                {/* Today indicator */}
                {isToday && !isSelected && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-primary"
                  />
                )}
                {/* Selected checkmark glow effect */}
                {isSelected && (
                  <motion.div
                    layoutId="date-selection"
                    className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-primary/80"
                    style={{ zIndex: -1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
      
      {/* Week navigation hint */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <button
            key={i}
            onClick={() => {
              triggerHaptic('light');
              setWeekOffset(i);
            }}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              weekOffset === i 
                ? "bg-primary w-4" 
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// Recurrence segmented control
interface RecurrenceControlProps {
  value: RecurrenceType;
  onChange: (value: RecurrenceType) => void;
}

function RecurrenceControl({ value, onChange }: RecurrenceControlProps) {
  const { t } = useTranslation();
  
  const options: { type: RecurrenceType; label: string }[] = [
    { type: 'once', label: t('scheduledTiming.once') },
    { type: 'daily', label: t('scheduledTiming.daily') },
    { type: 'weekly', label: t('scheduledTiming.weekly') },
    { type: 'yearly', label: t('scheduledTiming.yearly') },
  ];

  return (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-2xl">
      {options.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => {
            triggerHaptic('light');
            onChange(type);
          }}
          className={cn(
            "flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all",
            value === type
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ScheduledTimingPicker({ 
  onConfirm, 
  onBack,
  suggestedRecurrence = 'once',
  initialTime,
  initialRecurrence,
  initialAnchor,
}: ScheduledTimingPickerProps) {
  const { t } = useTranslation();
  const now = new Date();
  
  const to12Hour = (h24: number) => {
    if (h24 === 0) return 12;
    if (h24 > 12) return h24 - 12;
    return h24;
  };
  
  // Initialize from initial values if provided
  const getDefaultValues = () => {
    if (initialTime && initialAnchor) {
      const initDate = new Date(initialTime);
      return {
        hour: to12Hour(initialAnchor.hour),
        minute: initialAnchor.minute,
        period: (initialAnchor.hour >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
        date: initDate,
        recurrence: initialRecurrence || suggestedRecurrence,
      };
    }
    
    const nextHour = now.getHours() + 1;
    const shouldRollToNextDay = nextHour > 23;
    const defaultHour24 = shouldRollToNextDay ? 9 : nextHour;
    const defaultDate = new Date();
    if (shouldRollToNextDay) defaultDate.setDate(defaultDate.getDate() + 1);
    
    return {
      hour: to12Hour(defaultHour24),
      minute: 0,
      period: (defaultHour24 >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
      date: defaultDate,
      recurrence: suggestedRecurrence,
    };
  };
  
  const defaults = getDefaultValues();
  
  const [hour, setHour] = useState(defaults.hour);
  const [minute, setMinute] = useState(defaults.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(defaults.period);
  const [selectedDate, setSelectedDate] = useState<Date>(defaults.date);
  const [recurrence, setRecurrence] = useState<RecurrenceType>(defaults.recurrence);
  const [showCustom, setShowCustom] = useState(!!initialTime);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Convert 12-hour to 24-hour
  const get24Hour = (h: number, p: 'AM' | 'PM') => {
    if (p === 'AM' && h === 12) return 0;
    if (p === 'PM' && h !== 12) return h + 12;
    return h;
  };

  // Calculate trigger time
  const triggerTime = useMemo(() => {
    const hour24 = get24Hour(hour, period);
    const anchor: RecurrenceAnchor = {
      hour: hour24,
      minute,
      dayOfWeek: selectedDate.getDay(),
      month: selectedDate.getMonth(),
      dayOfMonth: selectedDate.getDate(),
    };
    return computeNextTrigger(recurrence, anchor);
  }, [hour, minute, period, selectedDate, recurrence]);

  const handleConfirm = () => {
    triggerHaptic('medium');
    const hour24 = get24Hour(hour, period);
    const anchor: RecurrenceAnchor = {
      hour: hour24,
      minute,
      dayOfWeek: selectedDate.getDay(),
      month: selectedDate.getMonth(),
      dayOfMonth: selectedDate.getDate(),
    };
    onConfirm(triggerTime, recurrence, anchor);
  };

  // Quick preset helpers
  const getNextSaturday = () => {
    const d = new Date();
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(10, 0, 0, 0);
    return d;
  };

  const quickPresets = useMemo(() => {
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const tomorrow9am = new Date(now);
    tomorrow9am.setDate(tomorrow9am.getDate() + 1);
    tomorrow9am.setHours(9, 0, 0, 0);
    const tomorrow6pm = new Date(now);
    tomorrow6pm.setDate(tomorrow6pm.getDate() + 1);
    tomorrow6pm.setHours(18, 0, 0, 0);
    const weekend = getNextSaturday();

    return [
      { 
        id: 'hour',
        label: t('scheduledTiming.inOneHour'), 
        sublabel: inOneHour.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
        time: inOneHour,
        icon: <Clock className="h-4 w-4" />,
      },
      { 
        id: 'morning',
        label: t('scheduledTiming.tomorrowMorning'), 
        sublabel: '9:00 AM',
        time: tomorrow9am,
        icon: <Sun className="h-4 w-4" />,
      },
      { 
        id: 'evening',
        label: t('scheduledTiming.tomorrowEvening'), 
        sublabel: '6:00 PM',
        time: tomorrow6pm,
        icon: <Moon className="h-4 w-4" />,
      },
      { 
        id: 'weekend',
        label: t('scheduledTiming.thisWeekend'), 
        sublabel: weekend.toLocaleDateString(undefined, { weekday: 'short' }) + ' 10 AM',
        time: weekend,
        icon: <Calendar className="h-4 w-4" />,
      },
    ];
  }, [now, t]);

  const handlePresetSelect = (preset: typeof quickPresets[0]) => {
    setSelectedPreset(preset.id);
    setShowCustom(false);
    const time = preset.time;
    const h24 = time.getHours();
    setHour(to12Hour(h24));
    setMinute(time.getMinutes());
    setPeriod(h24 >= 12 ? 'PM' : 'AM');
    setSelectedDate(time);
    setRecurrence('once');
  };

  const handleCustomToggle = () => {
    setShowCustom(!showCustom);
    if (!showCustom) {
      setSelectedPreset(null);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-header-safe-compact pb-4 border-b border-border/50">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">{t('scheduledTiming.whenToTrigger')}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-6 space-y-6">
          {/* Quick presets */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('scheduledTiming.quickOptions')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {quickPresets.map((preset) => (
                <QuickPreset
                  key={preset.id}
                  icon={preset.icon}
                  label={preset.label}
                  sublabel={preset.sublabel}
                  selected={selectedPreset === preset.id}
                  onClick={() => handlePresetSelect(preset)}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{t('scheduledTiming.orCustom')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Custom time section */}
          <Collapsible open={showCustom} onOpenChange={handleCustomToggle}>
            <CollapsibleTrigger asChild>
              <button className={cn(
                "w-full flex items-center justify-between p-4 rounded-2xl transition-all",
                "bg-muted/30 hover:bg-muted/50 border border-border/50",
                showCustom && "bg-muted/50 border-primary/30"
              )}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-background">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="font-medium">{t('scheduledTiming.customTime')}</span>
                </div>
                <ChevronRight className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  showCustom && "rotate-90"
                )} />
              </button>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-4 space-y-6"
              >
                {/* Recurrence selector */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('scheduledTiming.repeat')}
                    </span>
                  </div>
                  <RecurrenceControl value={recurrence} onChange={setRecurrence} />
                </div>

                {/* Date picker (for once/weekly/yearly) */}
                <AnimatePresence mode="wait">
                  {recurrence !== 'daily' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {recurrence === 'once' 
                            ? t('scheduledTiming.date') 
                            : recurrence === 'weekly' 
                              ? t('scheduledTiming.starting') 
                              : t('scheduledTiming.thisYearOn')}
                        </span>
                      </div>
                      <WeekCalendar 
                        selectedDate={selectedDate} 
                        onDateSelect={setSelectedDate} 
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Time picker */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('scheduledTiming.time')}
                    </span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-4 border border-border/50">
                    <TimeWheelPicker
                      hour={hour}
                      minute={minute}
                      period={period}
                      onHourChange={setHour}
                      onMinuteChange={setMinute}
                      onPeriodChange={setPeriod}
                    />
                  </div>
                </div>
              </motion.div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Footer with preview and confirm */}
      <div className="px-5 pb-5 pt-3 border-t border-border/50 bg-background">
        {/* Live preview */}
        <motion.div 
          key={triggerTime}
          initial={{ opacity: 0.5, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 mb-4"
        >
          <p className="text-xs text-muted-foreground mb-1">{t('scheduledTiming.scheduledFor')}</p>
          <p className="text-lg font-semibold text-foreground">
            {new Date(triggerTime).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </p>
          {recurrence !== 'once' && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('scheduledTiming.thenRepeats', { frequency: t(`scheduledTiming.${recurrence}`) })}
            </p>
          )}
        </motion.div>

        <Button 
          onClick={handleConfirm}
          className="w-full h-12 rounded-2xl text-base font-semibold"
        >
          {t('common.continue')}
        </Button>
      </div>
    </div>
  );
}
