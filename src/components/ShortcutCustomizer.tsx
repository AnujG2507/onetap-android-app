import { useState, useEffect } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { IconPicker } from './IconPicker';
import { ContentPreview } from './ContentPreview';
import { getContentName, generateThumbnail, getPlatformEmoji, getFileTypeEmoji } from '@/lib/contentResolver';
import type { ContentSource, ShortcutIcon } from '@/types/shortcut';

interface ShortcutCustomizerProps {
  source: ContentSource;
  onConfirm: (name: string, icon: ShortcutIcon, resumeEnabled?: boolean) => void;
  onBack: () => void;
}

export function ShortcutCustomizer({ source, onConfirm, onBack }: ShortcutCustomizerProps) {
  const [name, setName] = useState(() => getContentName(source));
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [resumeEnabled, setResumeEnabled] = useState(false);
  
  // Check if this is a PDF file
  const isPdf = source.mimeType === 'application/pdf' || 
                source.name?.toLowerCase().endsWith('.pdf');
  
  // Get initial emoji based on source type - smart defaults
  const getInitialIcon = (): ShortcutIcon => {
    if (source.type === 'url' || source.type === 'share') {
      return { type: 'emoji', value: getPlatformEmoji(source.uri) };
    }
    // For files, use file-type specific emoji
    return { type: 'emoji', value: getFileTypeEmoji(source.mimeType, source.name) };
  };
  
  const [icon, setIcon] = useState<ShortcutIcon>(getInitialIcon);
  
  useEffect(() => {
    generateThumbnail(source).then((thumb) => {
      if (thumb) {
        setThumbnail(thumb);
        setIcon({ type: 'thumbnail', value: thumb });
      }
    });
  }, [source]);
  
  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim(), icon, isPdf ? resumeEnabled : undefined);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 p-4 border-b">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-muted active:bg-muted/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-medium">Customize Shortcut</h2>
      </header>
      
      <div className="flex-1 p-4 space-y-8 overflow-auto animate-fade-in">
        {/* Content Preview */}
        <ContentPreview source={source} />

        {/* Name input */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Name
          </label>
          <div className="relative">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name"
              className="h-12 text-base pr-10"
              maxLength={30}
            />
            {name && (
              <button
                type="button"
                onClick={() => setName('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* Icon picker */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Icon
          </label>
          <IconPicker
            thumbnail={thumbnail || undefined}
            selectedIcon={icon}
            onSelect={setIcon}
          />
        </div>
        
        {/* PDF Resume Toggle - only shown for PDFs */}
        {isPdf && (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
              <div className="flex-1 mr-4">
                <p className="font-medium text-foreground">Resume where I left off</p>
                <p className="text-sm text-muted-foreground">Open at last viewed page</p>
              </div>
              <Switch
                checked={resumeEnabled}
                onCheckedChange={setResumeEnabled}
              />
            </div>
          </div>
        )}
        
        {/* Preview */}
        <div className="pt-6 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-center mb-4">
            Preview
          </p>
          <div className="flex flex-col items-center gap-2">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center elevation-2 overflow-hidden"
              style={icon.type === 'thumbnail' ? {} : { backgroundColor: 'hsl(var(--primary))' }}
            >
              {icon.type === 'thumbnail' && (
                <img src={icon.value} alt="" className="h-full w-full object-cover" />
              )}
              {icon.type === 'emoji' && (
                <span className="text-2xl">{icon.value}</span>
              )}
              {icon.type === 'text' && (
                <span className="text-xl font-bold text-primary-foreground">
                  {icon.value.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-xs text-foreground max-w-[72px] text-center truncate">
              {name || 'Shortcut'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="p-4 safe-bottom">
        <Button
          onClick={handleConfirm}
          disabled={!name.trim()}
          className="w-full h-12 text-base font-medium"
        >
          <Check className="mr-2 h-5 w-5" />
          Add to Home Screen
        </Button>
      </div>
    </div>
  );
}
