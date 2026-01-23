// Scheduled Timing Picker - select date, time, and recurrence
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Clock, Calendar, CalendarDays, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecurrenceType, RecurrenceAnchor } from '@/types/scheduledAction';
import { computeNextTrigger } from '@/lib/scheduledActionsManager';

interface ScheduledTimingPickerProps {
  onConfirm: (triggerTime: number, recurrence: RecurrenceType, anchor: RecurrenceAnchor) => void;
  onBack: () => void;
  suggestedRecurrence?: RecurrenceType; // e.g., 'yearly' for birthday contacts
  // Initial values for editing
  initialTime?: number;
  initialRecurrence?: RecurrenceType;
  initialAnchor?: RecurrenceAnchor;
}

export function ScheduledTimingPicker({ 
  onConfirm, 
  onBack,
  suggestedRecurrence = 'once',
  initialTime,
  initialRecurrence,
  initialAnchor,
}: ScheduledTimingPickerProps) {
  const now = new Date();
  
  // Convert to 12-hour format for display
  const to12Hour = (h24: number) => {
    if (h24 === 0) return 12;
    if (h24 > 12) return h24 - 12;
    return h24;
  };
  
  // Initialize from initial values if provided, otherwise use defaults
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
    
    // Default: next hour, handle midnight rollover
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

  const recurrenceOptions: { type: RecurrenceType; label: string; icon: React.ReactNode }[] = [
    { type: 'once', label: 'Once', icon: <Clock className="h-4 w-4" /> },
    { type: 'daily', label: 'Daily', icon: <Calendar className="h-4 w-4" /> },
    { type: 'weekly', label: 'Weekly', icon: <CalendarDays className="h-4 w-4" /> },
    { type: 'yearly', label: 'Yearly', icon: <CalendarClock className="h-4 w-4" /> },
  ];

  // Simple date picker (next 14 days)
  const dateOptions = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, []);

  const formatDateLabel = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">When to trigger</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
        {/* Recurrence selector */}
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Repeat
          </Label>
          <div className="grid grid-cols-4 gap-2">
            {recurrenceOptions.map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => setRecurrence(type)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all",
                  recurrence === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                )}
              >
                {icon}
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date picker (for once/weekly/yearly) */}
        {recurrence !== 'daily' && (
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              {recurrence === 'once' ? 'Date' : recurrence === 'weekly' ? 'Starting' : 'This year on'}
            </Label>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
              {dateOptions.map((date) => (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-4 py-2.5 shrink-0 transition-all",
                    selectedDate.toDateString() === date.toDateString()
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span className="text-xs font-medium">
                    {date.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className="text-lg font-semibold">{date.getDate()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Time picker */}
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Time
          </Label>
          <div className="flex items-center justify-center gap-2">
            {/* Hour */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => setHour(h => h === 12 ? 1 : h + 1)}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-5 w-5 rotate-90" />
              </button>
              <div className="text-4xl font-semibold w-16 text-center tabular-nums">
                {hour.toString().padStart(2, '0')}
              </div>
              <button
                onClick={() => setHour(h => h === 1 ? 12 : h - 1)}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-5 w-5 rotate-90" />
              </button>
            </div>

            <span className="text-4xl font-semibold">:</span>

            {/* Minute */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => setMinute(m => (m + 5) % 60)}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-5 w-5 rotate-90" />
              </button>
              <div className="text-4xl font-semibold w-16 text-center tabular-nums">
                {minute.toString().padStart(2, '0')}
              </div>
              <button
                onClick={() => setMinute(m => m === 0 ? 55 : m - 5)}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-5 w-5 rotate-90" />
              </button>
            </div>

            {/* AM/PM */}
            <div className="flex flex-col gap-1 ml-3">
              <button
                onClick={() => setPeriod('AM')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  period === 'AM'
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground"
                )}
              >
                AM
              </button>
              <button
                onClick={() => setPeriod('PM')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  period === 'PM'
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground"
                )}
              >
                PM
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-2xl bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground mb-1">Will trigger</p>
          <p className="font-medium">
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
              Then repeats {recurrence}
            </p>
          )}
        </div>
      </div>

      {/* Confirm button */}
      <div className="p-5 border-t border-border">
        <Button 
          onClick={handleConfirm}
          className="w-full h-12 rounded-2xl text-base"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
