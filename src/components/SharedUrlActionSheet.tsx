import { useState } from 'react';
import { X, Bookmark, Smartphone, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SharedUrlActionSheetProps {
  url: string;
  onSaveToLibrary: () => void;
  onCreateShortcut: () => void;
  onDismiss: () => void;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function SharedUrlActionSheet({
  url,
  onSaveToLibrary,
  onCreateShortcut,
  onDismiss,
}: SharedUrlActionSheetProps) {
  const [isExiting, setIsExiting] = useState(false);
  const domain = extractDomain(url);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const handleSaveToLibrary = () => {
    setIsExiting(true);
    setTimeout(onSaveToLibrary, 200);
  };

  const handleCreateShortcut = () => {
    setIsExiting(true);
    setTimeout(onCreateShortcut, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8 bg-black/50 animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border overflow-hidden",
          "animate-in slide-in-from-bottom-4 duration-300",
          isExiting && "animate-out fade-out slide-out-to-bottom-4 duration-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Link Received</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 -mr-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* URL Preview */}
        <div className="px-4 py-4">
          <p className="text-sm text-muted-foreground truncate mb-1">
            {domain}
          </p>
          <p className="text-xs text-muted-foreground/70 truncate">
            {url.length > 60 ? url.substring(0, 60) + '...' : url}
          </p>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleSaveToLibrary}
          >
            <Bookmark className="h-4 w-4" />
            Save to Library
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleCreateShortcut}
          >
            <Smartphone className="h-4 w-4" />
            Create Shortcut
          </Button>
        </div>
      </div>
    </div>
  );
}
