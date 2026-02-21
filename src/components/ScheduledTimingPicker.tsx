// Premium Scheduled Timing Picker - redesigned with quick presets, wheel picker, and premium visuals
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Clock, 
  Sun, 
  Moon, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Repeat,
  CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { TimeWheelPicker } from '@/components/ui/time-wheel-picker';
import { useOrientation } from '@/hooks/useOrientation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { RecurrenceType, RecurrenceAnchor } from '@/types/scheduledAction';
// computeNextTrigger is used for advancing recurring actions, not for initial creation

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
        "flex flex-col items-start gap-1.5 landscape:gap-1 rounded-2xl p-4 landscape:p-3 text-left transition-all",
        "bg-gradient-to-br from-muted/60 to-muted/30 border border-border/50",
        "hover:from-primary/15 hover:to-primary/5 hover:border-primary/30",
        "active:scale-[0.98]",
        selected && "from-primary/20 to-primary/10 border-primary/40 ring-2 ring-primary/20"
      )}
    >
      <div className={cn(
        "p-2 landscape:p-1.5 rounded-xl",
        selected ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground"
      )}>
        {icon}
      </div>
      <div>
        <p className="text-sm landscape:text-xs font-semibold text-foreground">{label}</p>
        <p className="text-xs landscape:text-[10px] text-muted-foreground">{sublabel}</p>
      </div>
    </motion.button>
  );
}

// Week calendar picker component with swipe support
interface WeekCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onOpenFullCalendar: () => void;
}

function WeekCalendar({ selectedDate, onDateSelect, onOpenFullCalendar }: WeekCalendarProps) {
  const { t } = useTranslation();
  
  // Base date for week calculation - can be recentered for distant dates
  const [baseDate, setBaseDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [weekOffset, setWeekOffset] = useState(0); // Start at today's week
  const [direction, setDirection] = useState(0);
  
  // Check if we need to recenter the week range when selectedDate changes
  // Only navigate if the selected date is OUTSIDE the currently visible week
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    
    // Calculate the current visible week's start date
    const visibleWeekStart = new Date(baseDate);
    visibleWeekStart.setDate(baseDate.getDate() + weekOffset * 7);
    visibleWeekStart.setHours(0, 0, 0, 0);
    
    const visibleWeekEnd = new Date(visibleWeekStart);
    visibleWeekEnd.setDate(visibleWeekStart.getDate() + 6);
    visibleWeekEnd.setHours(23, 59, 59, 999);
    
    // If selected date is within currently visible week, do nothing
    if (selected >= visibleWeekStart && selected <= visibleWeekEnd) {
      return;
    }
    
    // Calculate days from base date
    const daysFromBase = Math.floor((selected.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Current 5-week range: weeks 0-4 from base
    const rangeStart = 0;
    const rangeEnd = 34; // ~5 weeks after base
    
    if (daysFromBase >= rangeStart && daysFromBase <= rangeEnd) {
      // Within 5-week range, navigate to correct week
      const targetWeekOffset = Math.max(0, Math.min(4, Math.floor(daysFromBase / 7)));
      setDirection(targetWeekOffset > weekOffset ? 1 : -1);
      setWeekOffset(targetWeekOffset);
    } else {
      // Outside range - recenter the base date around selected date
      const newBase = new Date(selected);
      newBase.setDate(newBase.getDate() - 14); // 2 weeks before selected
      newBase.setHours(0, 0, 0, 0);
      
      // Don't go before today
      if (newBase.getTime() < today.getTime()) {
        setBaseDate(today);
        const daysFromToday = Math.floor((selected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const newOffset = Math.max(0, Math.min(4, Math.floor(daysFromToday / 7)));
        setWeekOffset(newOffset);
      } else {
        setBaseDate(newBase);
        setWeekOffset(2); // Middle week shows selected date
      }
      setDirection(1);
    }
  }, [selectedDate, baseDate]); // eslint-disable-line react-hooks/exhaustive-deps -- weekOffset intentionally excluded to prevent snap-back when navigating
  
  // Swipe gesture handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && weekOffset < 4) {
      triggerHaptic('light');
      setDirection(1);
      setWeekOffset(w => w + 1);
    } else if (isRightSwipe && weekOffset > 0) {
      triggerHaptic('light');
      setDirection(-1);
      setWeekOffset(w => w - 1);
    }
  };
  
  // Calculate week dates based on base date and offset
  const weekDates = useMemo(() => {
    const dates: Date[] = [];
    const startOfWeek = new Date(baseDate);
    startOfWeek.setDate(baseDate.getDate() + weekOffset * 7);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [baseDate, weekOffset]);

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

  // Slide variants for week transitions
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 80 : -80,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -80 : 80,
      opacity: 0,
    }),
  };

  return (
    <div 
      className="rounded-3xl overflow-hidden relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 backdrop-blur-xl pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-muted/30 to-transparent pointer-events-none" />
      
      {/* Content */}
      <div className="relative p-5 landscape:p-3 space-y-5 landscape:space-y-3">
        {/* Month header with navigation */}
        <div className="flex items-center justify-between">
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => {
              triggerHaptic('light');
              setDirection(-1);
              setWeekOffset(w => w - 1);
            }}
            disabled={weekOffset <= 0}
            className={cn(
              "p-3 rounded-2xl transition-all",
              "bg-background/80 hover:bg-background border border-border/40",
              "shadow-sm hover:shadow-md hover:border-primary/30",
              "disabled:opacity-30 disabled:pointer-events-none disabled:hover:shadow-none"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.button>
          
          <motion.div 
            key={monthLabel}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="flex flex-col items-center"
          >
            <span className="text-sm font-bold text-foreground tracking-wide">
              {monthLabel}
            </span>
          </motion.div>
          
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => {
              triggerHaptic('light');
              setDirection(1);
              setWeekOffset(w => w + 1);
            }}
            disabled={weekOffset >= 4}
            className={cn(
              "p-3 rounded-2xl transition-all",
              "bg-background/80 hover:bg-background border border-border/40",
              "shadow-sm hover:shadow-md hover:border-primary/30",
              "disabled:opacity-30 disabled:pointer-events-none disabled:hover:shadow-none"
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </motion.button>
        </div>
        
        {/* Days grid with slide animation */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={weekOffset}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 300, damping: 30, duration: 0.25 }}
              className="grid grid-cols-7 gap-2"
            >
              {weekDates.map((date, index) => {
                const isSelected = date.toDateString() === selectedDate.toDateString();
                const isToday = date.toDateString() === today.toDateString();
                const isPast = date < today && !isToday;
                
                return (
                  <motion.button
                    type="button"
                    key={date.toISOString()}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, type: "spring", stiffness: 400 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      if (!isPast) {
                        triggerHaptic('light');
                        onDateSelect(date);
                      }
                    }}
                    disabled={isPast}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 landscape:gap-1 rounded-2xl py-3.5 landscape:py-2.5 transition-all relative aspect-square",
                      "backdrop-blur-sm",
                      isPast && "opacity-30 pointer-events-none",
                      isSelected
                        ? "bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-xl shadow-primary/40 scale-105 border-2 border-primary-foreground/20"
                        : isToday
                          ? "bg-background/90 border-2 border-primary/50 shadow-md shadow-primary/10"
                          : "bg-background/70 border border-border/40 hover:bg-background/90 hover:border-primary/30 hover:shadow-md hover:scale-[1.02]"
                    )}
                  >
                    {/* Day label */}
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-wider",
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
                      "text-xl landscape:text-lg font-bold tabular-nums leading-none",
                      isSelected 
                        ? "text-primary-foreground" 
                        : isToday
                          ? "text-primary"
                          : "text-foreground"
                    )}>
                      {date.getDate()}
                    </span>
                    {/* Today indicator dot */}
                    {isToday && !isSelected && (
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500 }}
                        className="absolute -bottom-0.5 w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50"
                      />
                    )}
                    {/* Selected glow effect */}
                    {isSelected && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 rounded-2xl bg-gradient-to-t from-white/10 to-transparent"
                        />
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 0.3 }}
                          className="absolute inset-0 rounded-2xl bg-primary blur-xl -z-10"
                        />
                      </>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Footer: dots + pick specific date */}
        <div className="flex items-center justify-between pt-2">
          {/* Week navigation dots with progress bar style */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-full p-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.button
                type="button"
                key={i}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  triggerHaptic('light');
                  setDirection(i > weekOffset ? 1 : -1);
                  setWeekOffset(i);
                }}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  weekOffset === i 
                    ? "bg-primary w-6 shadow-sm shadow-primary/50" 
                    : "bg-muted-foreground/25 w-2 hover:bg-muted-foreground/40"
                )}
              />
            ))}
          </div>
          
          {/* Pick specific date button - premium styling */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => {
              triggerHaptic('light');
              onOpenFullCalendar();
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full",
              "bg-gradient-to-r from-primary/10 to-primary/5",
              "border border-primary/30 hover:border-primary/50",
              "text-xs font-semibold text-primary hover:text-primary/90",
              "shadow-sm hover:shadow-md transition-all"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{t('scheduledTiming.pickDate')}</span>
          </motion.button>
        </div>
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
            "flex-1 py-2 landscape:py-1.5 px-3 landscape:px-2 rounded-xl text-sm landscape:text-xs font-medium transition-all",
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
  const { isLandscape } = useOrientation();
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
  const [showFullCalendar, setShowFullCalendar] = useState(false);

  // Convert 12-hour to 24-hour
  const get24Hour = (h: number, p: 'AM' | 'PM') => {
    if (p === 'AM' && h === 12) return 0;
    if (p === 'PM' && h !== 12) return h + 12;
    return h;
  };

  // Calculate trigger time directly from selectedDate (not using computeNextTrigger which ignores the date)
  const triggerTime = useMemo(() => {
    const hour24 = get24Hour(hour, period);
    const result = new Date(selectedDate);
    result.setHours(hour24, minute, 0, 0);
    
    // For daily recurrence, we don't have a specific date - use today/tomorrow
    if (recurrence === 'daily') {
      const todayWithTime = new Date();
      todayWithTime.setHours(hour24, minute, 0, 0);
      if (todayWithTime.getTime() <= Date.now()) {
        todayWithTime.setDate(todayWithTime.getDate() + 1);
      }
      return todayWithTime.getTime();
    }
    
    // For one-time/weekly/yearly, if the exact datetime is in the past, handle it
    if (result.getTime() <= Date.now()) {
      if (recurrence === 'once') {
        // If the selected date+time is in the past, add 1 day as fallback
        result.setDate(result.getDate() + 1);
      } else if (recurrence === 'weekly') {
        // Move to next week
        result.setDate(result.getDate() + 7);
      } else if (recurrence === 'yearly') {
        // Move to next year
        result.setFullYear(result.getFullYear() + 1);
      }
    }
    
    return result.getTime();
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
      <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border/50">
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
        <div className="px-5 py-6 landscape:px-4 landscape:py-4 space-y-6 landscape:space-y-4">
          {/* Quick presets - collapse when custom is open */}
          <AnimatePresence mode="wait">
            {!showCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-3 landscape:mb-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('scheduledTiming.quickOptions')}
                  </span>
                </div>
                <div className="grid grid-cols-2 landscape:grid-cols-4 gap-3 landscape:gap-2">
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

                {/* Divider */}
                <div className="flex items-center gap-3 mt-6 landscape:mt-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{t('scheduledTiming.orCustom')}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Custom time section */}
          <Collapsible open={showCustom} onOpenChange={handleCustomToggle}>
            <CollapsibleTrigger asChild>
              <button className={cn(
                "w-full flex items-center justify-between p-4 landscape:p-3 rounded-2xl transition-all",
                "bg-muted/30 hover:bg-muted/50 border border-border/50",
                showCustom && "bg-muted/50 border-primary/30"
              )}>
                <div className="flex items-center gap-3 landscape:gap-2">
                  <div className="p-2 landscape:p-1.5 rounded-xl bg-background">
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
                className="pt-4 landscape:pt-3"
              >
                {/* Landscape: two-column layout for recurrence/date and time picker */}
                <div className="space-y-6 landscape:space-y-0 landscape:grid landscape:grid-cols-2 landscape:gap-4">
                  {/* Left column: Recurrence and Date picker */}
                  <div className="space-y-6 landscape:space-y-4">
                    {/* Recurrence selector */}
                    <div>
                      <div className="flex items-center gap-2 mb-3 landscape:mb-2">
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
                          <div className="flex items-center gap-2 mb-3 landscape:mb-2">
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
                            onOpenFullCalendar={() => setShowFullCalendar(true)}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Right column: Time picker */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 landscape:mb-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('scheduledTiming.time')}
                      </span>
                    </div>
                    <motion.div 
                      className="bg-muted/30 rounded-2xl p-4 landscape:p-3 border border-border/50"
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <TimeWheelPicker
                        hour={hour}
                        minute={minute}
                        period={period}
                        onHourChange={setHour}
                        onMinuteChange={setMinute}
                        onPeriodChange={setPeriod}
                        compact={isLandscape}
                      />
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
      {/* Footer with preview and confirm */}
      <div className="px-5 landscape:px-4 pb-[calc(1.25rem+var(--android-safe-bottom,0px)+4rem)] landscape:pb-[calc(0.75rem+var(--android-safe-bottom,0px)+3rem)] pt-3 landscape:pt-2 border-t border-border/50 bg-background">
        {/* Live preview */}
        <motion.div 
          key={triggerTime}
          initial={{ opacity: 0.5, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 landscape:p-3 mb-4 landscape:mb-3"
        >
          <p className="text-xs text-muted-foreground mb-1">{t('scheduledTiming.scheduledFor')}</p>
          <p className="text-lg landscape:text-base font-semibold text-foreground">
            {new Date(triggerTime).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              ...(new Date(triggerTime).getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
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
          className="w-full h-12 landscape:h-10 rounded-2xl text-base font-semibold"
        >
          {t('common.continue')}
        </Button>
      </div>

      {/* Full Calendar Dialog - Premium styling */}
      <Dialog open={showFullCalendar} onOpenChange={setShowFullCalendar}>
        <DialogContent className="max-w-sm mx-auto p-0 overflow-hidden rounded-3xl border-0">
          {/* Glassmorphism header */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5" />
            <DialogHeader className="relative px-6 pt-6 pb-4">
              <DialogTitle className="text-center text-lg font-bold">
                {t('scheduledTiming.pickDate')}
              </DialogTitle>
            </DialogHeader>
          </div>
          
          {/* Calendar with premium container */}
          <div className="px-4 pb-6">
            <div className="rounded-2xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/50 p-2 shadow-inner">
              <CalendarComponent
                key={showFullCalendar ? selectedDate.toISOString() : 'closed'}
                mode="single"
                selected={selectedDate}
                defaultMonth={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    triggerHaptic('light');
                    setSelectedDate(date);
                    setSelectedPreset(null);
                    setShowFullCalendar(false);
                  }
                }}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                enableSwipe={true}
                initialFocus
              />
            </div>
            
            {/* Selected date preview */}
            <motion.div 
              key={selectedDate.toISOString()}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center"
            >
              <p className="text-sm text-muted-foreground">Selected</p>
              <p className="text-lg font-semibold text-foreground">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  ...(selectedDate.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
                })}
              </p>
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
