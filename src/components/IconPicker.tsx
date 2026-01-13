import { useState } from 'react';
import { Image, Type, Smile } from 'lucide-react';
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
      <p className="text-sm font-medium text-foreground">Shortcut Icon</p>
      
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
              alt="Shortcut icon"
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
      
      {/* Emoji picker */}
      {selectedIcon.type === 'emoji' && (
        <div className="grid grid-cols-6 gap-2">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelect({ type: 'emoji', value: emoji })}
              className={cn(
                "h-12 w-12 rounded-lg text-2xl flex items-center justify-center transition-colors",
                selectedIcon.value === emoji
                  ? "bg-accent ring-2 ring-primary"
                  : "bg-secondary hover:bg-muted"
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
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
