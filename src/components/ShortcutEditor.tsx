import { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconPicker } from '@/components/IconPicker';
import type { ShortcutData, ShortcutIcon } from '@/types/shortcut';

interface ShortcutEditorProps {
  shortcut: ShortcutData;
  onSave: (name: string, icon: ShortcutIcon) => void;
  onClose: () => void;
}

export function ShortcutEditor({ shortcut, onSave, onClose }: ShortcutEditorProps) {
  const [name, setName] = useState(shortcut.name);
  const [icon, setIcon] = useState<ShortcutIcon>(shortcut.icon);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), icon);
    }
  };

  const hasChanges = name !== shortcut.name || 
    icon.type !== shortcut.icon.type || 
    icon.value !== shortcut.icon.value;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-border">
        <button
          onClick={onClose}
          className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Edit Shortcut</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Name Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Name</label>
          <div className="relative">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shortcut name"
              className="pr-10"
            />
            {name && (
              <button
                onClick={() => setName('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Icon Picker */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Icon</label>
          <IconPicker
            thumbnail={shortcut.thumbnailData}
            selectedIcon={icon}
            onSelect={setIcon}
          />
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Preview</label>
          <div className="flex flex-col items-center gap-2 p-4 bg-muted/50 rounded-lg">
            <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
              {icon.type === 'thumbnail' && (icon.value || shortcut.thumbnailData) ? (
                <img
                  src={icon.value || shortcut.thumbnailData}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : icon.type === 'emoji' ? (
                <span className="text-2xl">{icon.value}</span>
              ) : (
                <span className="text-sm font-bold text-primary-foreground uppercase">
                  {icon.value.slice(0, 2)}
                </span>
              )}
            </div>
            <span className="text-sm text-foreground font-medium truncate max-w-[100px]">
              {name || 'Shortcut'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button
          onClick={handleSave}
          disabled={!name.trim() || !hasChanges}
          className="w-full"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
