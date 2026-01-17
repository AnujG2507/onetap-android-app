import { useState, useEffect } from 'react';
import { Image, Type, Smile } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { ShortcutIcon, IconType } from '@/types/shortcut';

interface IconPickerProps {
  thumbnail?: string;
  selectedIcon: ShortcutIcon;
  onSelect: (icon: ShortcutIcon) => void;
}

const COMMON_EMOJIS = ['🎬', '📺', '▶️', '🎵', '📷', '🐦', '✨', '🏏', '🎥', '🔗', '⭐', '❤️'];

export function IconPicker({ thumbnail, selectedIcon, onSelect }: IconPickerProps) {
  const [textValue, setTextValue] = useState(
    selectedIcon.type === 'text' ? selectedIcon.value : ''
  );
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  
  const selectedEmojiIndex = COMMON_EMOJIS.indexOf(selectedIcon.value);

  // Sync carousel selection with emoji selection
  useEffect(() => {
    if (!carouselApi || selectedIcon.type !== 'emoji') return;
    
    const handleSelect = () => {
      const index = carouselApi.selectedScrollSnap();
      if (COMMON_EMOJIS[index] && COMMON_EMOJIS[index] !== selectedIcon.value) {
        onSelect({ type: 'emoji', value: COMMON_EMOJIS[index] });
      }
    };
    
    carouselApi.on('select', handleSelect);
    return () => { carouselApi.off('select', handleSelect); };
  }, [carouselApi, selectedIcon.type, selectedIcon.value, onSelect]);

  // Scroll to selected emoji when switching to emoji type
  useEffect(() => {
    if (carouselApi && selectedIcon.type === 'emoji' && selectedEmojiIndex >= 0) {
      carouselApi.scrollTo(selectedEmojiIndex, true);
    }
  }, [carouselApi, selectedIcon.type]);

  // Re-initialize carousel after animation completes to fix scroll positions
  useEffect(() => {
    if (!carouselApi) return;
    
    const timer = setTimeout(() => {
      carouselApi.reInit();
    }, 350);
    
    return () => clearTimeout(timer);
  }, [carouselApi]);

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
      
      {/* Emoji picker - centered carousel */}
      {selectedIcon.type === 'emoji' && (
        <div 
          key="emoji-carousel"
          className="py-4 animate-fade-in"
        >
          <Carousel
            opts={{
              align: 'center',
              loop: true,
              dragFree: true,
              startIndex: selectedEmojiIndex >= 0 ? selectedEmojiIndex : 0,
            }}
            setApi={setCarouselApi}
            className="w-full"
          >
            <CarouselContent className="-ml-2">
              {COMMON_EMOJIS.map((emoji, index) => (
                <CarouselItem 
                  key={emoji}
                  className="basis-1/5 pl-2 flex items-center justify-center"
                >
                  <button
                    onClick={() => {
                      onSelect({ type: 'emoji', value: emoji });
                      carouselApi?.scrollTo(index);
                    }}
                    className={cn(
                      "h-14 w-14 rounded-xl text-2xl flex items-center justify-center transition-all duration-200",
                      selectedIcon.value === emoji
                        ? "scale-125 bg-primary/15 ring-2 ring-primary"
                        : "scale-90 opacity-50 bg-secondary hover:opacity-75"
                    )}
                  >
                    {emoji}
                  </button>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
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
