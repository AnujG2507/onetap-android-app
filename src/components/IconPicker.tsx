import { useState } from 'react';
import { Image, Type, Smile } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
      
      {/* Icon preview */}
      <div className="flex justify-center py-4">
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
          {selectedIcon.type === 'emoji' && (
            <span className="text-3xl">{selectedIcon.value}</span>
          )}
          {selectedIcon.type === 'text' && (
            <span className="text-2xl font-bold text-primary-foreground">
              {selectedIcon.value.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      
      {/* Emoji picker - horizontal scroll */}
      {selectedIcon.type === 'emoji' && (
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-3">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSelect({ type: 'emoji', value: emoji })}
                className={cn(
                  "h-14 w-14 shrink-0 rounded-xl text-2xl flex items-center justify-center transition-all",
                  selectedIcon.value === emoji
                    ? "bg-primary/10 ring-2 ring-primary scale-110"
                    : "bg-secondary hover:bg-muted active:scale-95"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>
      )}
      
      {/* Text input */}
      {selectedIcon.type === 'text' && (
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
      )}
    </div>
  );
}
