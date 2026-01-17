import { useState, useEffect, useRef, useCallback } from 'react';
import { Image, Type, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerSelectionFeedback } from '@/lib/haptics';
import { Input } from '@/components/ui/input';
import type { ShortcutIcon, IconType } from '@/types/shortcut';

interface IconPickerProps {
  thumbnail?: string;
  selectedIcon: ShortcutIcon;
  onSelect: (icon: ShortcutIcon) => void;
}

const COMMON_EMOJIS = [
  // Platform & media
  '🎬', '📺', '▶️', '🎵', '📷', '🐦', '✨', '🏏', '🎥', '🔗',
  // Social & services  
  '🎞️', '🍎', '👤', '💼', '🔶', '📌', '🎮',
  // File types
  '🖼️', '📄', '📑', '📊', '📽️', '📝', '📃', '🌐',
  // Tech & misc
  '🎨', '💻', '📦', '📚', '⚙️', '🔊', '📻',
  // Common extras
  '⭐', '❤️', '🔥', '💡', '🎯', '🚀', '📱', '🏠'
];

export function IconPicker({ thumbnail, selectedIcon, onSelect }: IconPickerProps) {
  const [textValue, setTextValue] = useState(
    selectedIcon.type === 'text' ? selectedIcon.value : ''
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrolling = useRef(true);

  // Scroll to selected emoji when switching to emoji type or on selection
  useEffect(() => {
    if (!scrollContainerRef.current || selectedIcon.type !== 'emoji') return;
    
    const index = COMMON_EMOJIS.indexOf(selectedIcon.value);
    if (index < 0) return;
    
    isUserScrolling.current = false;
    
    const container = scrollContainerRef.current;
    const buttons = container.querySelectorAll('button');
    const targetButton = buttons[index] as HTMLElement;
    
    if (targetButton) {
      const buttonCenter = targetButton.offsetLeft + targetButton.offsetWidth / 2;
      const scrollPosition = buttonCenter - container.clientWidth / 2;
      container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    }
    
    // Reset flag after scroll animation completes
    const timer = setTimeout(() => {
      isUserScrolling.current = true;
    }, 400);
    
    return () => clearTimeout(timer);
  }, [selectedIcon.type, selectedIcon.value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle scroll to detect centered emoji and auto-select
  const handleScroll = useCallback(() => {
    if (!isUserScrolling.current || !scrollContainerRef.current) return;
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (!scrollContainerRef.current) return;
      
      const container = scrollContainerRef.current;
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      
      // Find which button is closest to center
      const buttons = container.querySelectorAll('button');
      let closestIndex = 0;
      let closestDistance = Infinity;
      
      buttons.forEach((button, index) => {
        const buttonCenter = (button as HTMLElement).offsetLeft + button.clientWidth / 2;
        const distance = Math.abs(containerCenter - buttonCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      
      const centeredEmoji = COMMON_EMOJIS[closestIndex];
      if (centeredEmoji && centeredEmoji !== selectedIcon.value) {
        triggerSelectionFeedback();
        onSelect({ type: 'emoji', value: centeredEmoji });
      }
    }, 100);
  }, [selectedIcon.value, onSelect]);

  const iconTypes: { type: IconType; icon: React.ReactNode; label: string }[] = [
    ...(thumbnail ? [{ type: 'thumbnail' as IconType, icon: <Image className="h-5 w-5" />, label: 'Image' }] : []),
    { type: 'emoji', icon: <Smile className="h-5 w-5" />, label: 'Emoji' },
    { type: 'text', icon: <Type className="h-5 w-5" />, label: 'Text' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-foreground">Icon</p>
      
      {/* Icon type selector */}
      <div className="flex gap-2">
        {iconTypes.map(({ type, icon, label }) => (
          <button
            key={type}
            onClick={() => {
              if (type === 'thumbnail' && thumbnail) {
                onSelect({ type: 'thumbnail', value: thumbnail });
              } else if (type === 'emoji') {
                onSelect({ type: 'emoji', value: COMMON_EMOJIS[0] });
              } else if (type === 'text') {
                onSelect({ type: 'text', value: textValue || 'A' });
              }
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
              selectedIcon.type === type
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      
      {/* Icon preview - only for thumbnail and text */}
      {selectedIcon.type !== 'emoji' && (
        <div 
          key={`preview-${selectedIcon.type}`}
          className="flex justify-center py-4 animate-fade-in"
        >
          <div
            className={cn(
              "h-16 w-16 rounded-2xl flex items-center justify-center elevation-2",
              selectedIcon.type === 'thumbnail' ? 'p-0 overflow-hidden' : 'bg-primary'
            )}
          >
            {selectedIcon.type === 'thumbnail' && (
              <img
                src={selectedIcon.value}
                alt="Icon preview"
                className="h-full w-full object-cover"
              />
            )}
            {selectedIcon.type === 'text' && (
              <span className="text-2xl font-bold text-primary-foreground">
                {selectedIcon.value.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Emoji picker - native horizontal scroll */}
      {selectedIcon.type === 'emoji' && (
        <div 
          key="emoji-scroll"
          className="py-4 animate-fade-in relative"
        >
          {/* Left fade gradient */}
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          
          {/* Right fade gradient */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          
          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-[calc(50%-28px)]"
          >
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSelect({ type: 'emoji', value: emoji })}
                className={cn(
                  "h-14 w-14 shrink-0 rounded-xl text-2xl flex items-center justify-center transition-all duration-200 snap-center",
                  selectedIcon.value === emoji
                    ? "scale-110 bg-primary/15 ring-2 ring-primary"
                    : "scale-90 opacity-50 bg-secondary hover:opacity-75"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Text input */}
      {selectedIcon.type === 'text' && (
        <div key="text-input" className="animate-fade-in">
          <Input
          value={textValue}
          onChange={(e) => {
            const value = e.target.value.slice(0, 2);
            setTextValue(value);
            onSelect({ type: 'text', value: value || 'A' });
          }}
          placeholder="1-2 characters"
          maxLength={2}
            className="text-center text-lg font-medium h-12"
          />
        </div>
      )}
    </div>
  );
}
