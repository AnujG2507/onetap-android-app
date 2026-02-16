import * as React from "react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon, Check } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";
// Drawer/ScrollArea imports removed — month & year pickers now use inline panels

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  enableSwipe?: boolean;
  showYearPicker?: boolean;
};

function Calendar({ 
  className, 
  classNames, 
  showOutsideDays = true, 
  enableSwipe = true,
  showYearPicker = true,
  month: controlledMonth,
  defaultMonth,
  onMonthChange,
  selected,
  ...props 
}: CalendarProps) {
  // Determine initial month: controlled > defaultMonth > selected date > today
  const getInitialMonth = useCallback(() => {
    if (controlledMonth) return controlledMonth;
    if (defaultMonth) return defaultMonth;
    if (selected && selected instanceof Date) return selected;
    return new Date();
  }, [controlledMonth, defaultMonth, selected]);

  const [internalMonth, setInternalMonth] = useState(getInitialMonth);
  const [direction, setDirection] = useState(0);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPanel, setShowYearPanel] = useState(false);
  
  // Sync internal month when defaultMonth or selected changes (for dialog reopening)
  // This ensures the calendar opens to the correct month AND year
  useEffect(() => {
    if (!controlledMonth) {
      const targetMonth = defaultMonth || (selected instanceof Date ? selected : null);
      if (targetMonth) {
        // Create a new date to compare month and year
        const targetMonthNum = targetMonth.getMonth();
        const targetYear = targetMonth.getFullYear();
        
        setInternalMonth(current => {
          // Only update if the month or year actually differs
          if (current.getMonth() !== targetMonthNum || current.getFullYear() !== targetYear) {
            return new Date(targetYear, targetMonthNum, 1);
          }
          return current;
        });
      }
    }
  }, [defaultMonth, selected, controlledMonth]);
  
  // Swipe gesture handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const currentMonth = controlledMonth || internalMonth;
  const currentYear = currentMonth.getFullYear();
  const thisYear = new Date().getFullYear();

  // Generate year options (5 years back to 10 years forward)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = thisYear; y <= thisYear + 10; y++) {
      years.push(y);
    }
    return years;
  }, [thisYear]);

  // Generate month options
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i,
      label: new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }),
    }));
  }, []);

  const handleMonthChange = useCallback((newMonth: Date) => {
    if (onMonthChange) {
      onMonthChange(newMonth);
    } else {
      setInternalMonth(newMonth);
    }
  }, [onMonthChange]);

  const navigateMonth = useCallback((delta: number) => {
    triggerHaptic('light');
    setDirection(delta);
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + delta);
    handleMonthChange(newMonth);
  }, [currentMonth, handleMonthChange]);

  const jumpToYear = useCallback((year: number) => {
    triggerHaptic('light');
    setDirection(year > currentYear ? 1 : -1);
    const newMonth = new Date(currentMonth);
    newMonth.setFullYear(year);
    handleMonthChange(newMonth);
  }, [currentMonth, currentYear, handleMonthChange]);

  const jumpToMonth = useCallback((monthIndex: number) => {
    triggerHaptic('light');
    setDirection(monthIndex > currentMonth.getMonth() ? 1 : -1);
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(monthIndex);
    handleMonthChange(newMonth);
    setShowMonthPicker(false);
  }, [currentMonth, handleMonthChange]);

  const jumpToToday = useCallback(() => {
    triggerHaptic('light');
    const today = new Date();
    setDirection(today > currentMonth ? 1 : -1);
    handleMonthChange(today);
  }, [currentMonth, handleMonthChange]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableSwipe) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enableSwipe) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!enableSwipe || !touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      navigateMonth(1);
    } else if (isRightSwipe) {
      navigateMonth(-1);
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 40 : -40,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -40 : 40,
      opacity: 0,
    }),
  };

  // Custom caption component with year/month picker
  const CustomCaption = () => {
    const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long' });
    
    return (
      <div className="flex items-center justify-between w-full px-1 mb-3">
        {/* Prev month button */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => navigateMonth(-1)}
          className={cn(
            "h-9 w-9 flex items-center justify-center rounded-xl transition-all",
            "bg-background/80 hover:bg-background border border-border/40",
            "shadow-sm hover:shadow-md hover:border-primary/30",
          )}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </motion.button>
        
        {/* Month & Year pickers */}
        <div className="flex items-center gap-1">
          {/* Month picker button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMonthPicker(true)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all pointer-events-auto",
                "hover:bg-muted/60 font-bold text-sm active:scale-95",
              )}
            >
              {monthLabel}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>

          {/* Year picker button */}
          {showYearPicker && (
            <button
              type="button"
              onClick={() => setShowYearPanel(prev => !prev)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all pointer-events-auto",
                "hover:bg-muted/60 font-bold text-sm active:scale-95",
              )}
            >
              {currentYear}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          {/* Today button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={jumpToToday}
            className={cn(
              "ml-1 h-7 w-7 flex items-center justify-center rounded-lg transition-all",
              "bg-primary/10 hover:bg-primary/20 text-primary",
            )}
            title="Go to today"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </motion.button>
        </div>
        
        {/* Next month button */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => navigateMonth(1)}
          className={cn(
            "h-9 w-9 flex items-center justify-center rounded-xl transition-all",
            "bg-background/80 hover:bg-background border border-border/40",
            "shadow-sm hover:shadow-md hover:border-primary/30",
          )}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </motion.button>
      </div>
    );
  };

  return (
    <div 
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Custom header with month/year pickers */}
      <div className="px-3 pt-3 pointer-events-auto relative z-10">
        <CustomCaption />
      </div>
      
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentMonth.toISOString().slice(0, 7)}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", stiffness: 300, damping: 30, duration: 0.2 }}
        >
          <DayPicker
            showOutsideDays={showOutsideDays}
            month={currentMonth}
            onMonthChange={handleMonthChange}
            className={cn("px-4 pb-4 pointer-events-auto", className)}
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-2",
              caption: "hidden", // Hide default caption, using custom
              caption_label: "hidden",
              nav: "hidden", // Hide default nav, using custom
              nav_button: "hidden",
              nav_button_previous: "hidden",
              nav_button_next: "hidden",
              table: "w-full border-collapse",
              head_row: "flex mb-2",
              head_cell: "text-muted-foreground rounded-lg w-10 font-semibold text-[0.75rem] uppercase tracking-wider",
              row: "flex w-full mt-1",
              cell: cn(
                "h-10 w-10 text-center text-sm p-0.5 relative",
                "[&:has([aria-selected].day-range-end)]:rounded-r-xl",
                "[&:has([aria-selected].day-outside)]:bg-primary/10",
                "[&:has([aria-selected])]:bg-primary/10",
                "first:[&:has([aria-selected])]:rounded-l-xl",
                "last:[&:has([aria-selected])]:rounded-r-xl",
                "focus-within:relative focus-within:z-20",
              ),
              day: cn(
                "h-9 w-9 p-0 font-medium rounded-xl transition-all",
                "hover:bg-muted hover:scale-105",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1",
                "aria-selected:opacity-100",
              ),
              day_range_end: "day-range-end",
              day_selected: cn(
                "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
                "shadow-lg shadow-primary/30 scale-105",
                "hover:from-primary hover:to-primary/80 hover:text-primary-foreground",
                "focus:from-primary focus:to-primary/80 focus:text-primary-foreground",
              ),
              day_today: cn(
                "bg-primary/10 text-primary font-bold",
                "ring-2 ring-primary/30",
              ),
              day_outside: "day-outside text-muted-foreground/40 opacity-50 aria-selected:bg-primary/5 aria-selected:text-muted-foreground aria-selected:opacity-30",
              day_disabled: "text-muted-foreground/30 opacity-30 cursor-not-allowed hover:bg-transparent hover:scale-100",
              day_range_middle: "aria-selected:bg-primary/10 aria-selected:text-primary",
              day_hidden: "invisible",
              ...classNames,
            }}
            components={{
              IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4 rtl:rotate-180" />,
              IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4 rtl:rotate-180" />,
            }}
            {...props}
          />
        </motion.div>
      </AnimatePresence>
      
      {/* Swipe hint - subtle gradient at edges */}
      {enableSwipe && (
        <>
          <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
        </>
      )}

      {/* Inline month picker panel */}
      <AnimatePresence>
        {showMonthPicker && (
          <>
            <div
              className="fixed inset-0 z-40 pointer-events-auto"
              onClick={(e) => { e.stopPropagation(); setShowMonthPicker(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute top-14 left-4 z-50 w-auto min-w-[10rem] max-h-52 overflow-y-auto rounded-xl border bg-background shadow-lg pointer-events-auto"
            >
              <div className="p-2 space-y-0.5">
                {monthOptions.map((month) => (
                  <button
                    key={month.value}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); jumpToMonth(month.value); }}
                    className={cn(
                      "flex items-center justify-between w-full py-2.5 px-3 rounded-lg transition-colors text-sm whitespace-nowrap",
                      month.value === currentMonth.getMonth()
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {month.label}
                    {month.value === currentMonth.getMonth() && (
                      <Check className="h-4 w-4 text-primary ml-3" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Inline year picker panel */}
      <AnimatePresence>
        {showYearPanel && (
          <>
            <div
              className="fixed inset-0 z-40 pointer-events-auto"
              onClick={(e) => { e.stopPropagation(); setShowYearPanel(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute top-14 left-1/2 -translate-x-1/2 z-50 w-auto min-w-[5rem] max-h-52 overflow-y-auto rounded-xl border bg-background shadow-lg pointer-events-auto"
            >
              <div className="p-2 space-y-0.5">
                {yearOptions.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); jumpToYear(year); setShowYearPanel(false); }}
                    className={cn(
                      "flex items-center justify-between w-full py-2.5 px-3 rounded-lg transition-colors text-sm whitespace-nowrap",
                      year === currentYear
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {year}
                    {year === currentYear && (
                      <Check className="h-4 w-4 text-primary ml-3" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
