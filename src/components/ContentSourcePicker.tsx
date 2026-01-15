import { useState } from 'react';
import { Image, Video, FileText, Link, Music, FolderOpen, Clipboard, Star } from 'lucide-react';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { cn } from '@/lib/utils';
import { isValidUrl } from '@/lib/contentResolver';
import type { FileTypeFilter } from '@/lib/contentResolver';
import { SavedLinksSheet } from './SavedLinksSheet';
import { toast } from 'sonner';

interface ContentSourcePickerProps {
  onSelectFile: (filter: FileTypeFilter) => void;
  onSelectUrl: (prefillUrl?: string) => void;
}

export function ContentSourcePicker({ onSelectFile, onSelectUrl }: ContentSourcePickerProps) {
  const [savedLinksOpen, setSavedLinksOpen] = useState(false);

  const handlePasteFromClipboard = async () => {
    try {
      const { value } = await CapClipboard.read();
      if (value && isValidUrl(value)) {
        onSelectUrl(value);
      } else if (value) {
        // Try adding https prefix
        const withProtocol = value.startsWith('http') ? value : `https://${value}`;
        if (isValidUrl(withProtocol)) {
          onSelectUrl(withProtocol);
        } else {
          toast.error('No valid URL found in clipboard');
        }
      } else {
        toast.error('Clipboard is empty');
      }
    } catch (error) {
      // Fallback for web
      try {
        const text = await navigator.clipboard.readText();
        if (text && isValidUrl(text)) {
          onSelectUrl(text);
        } else if (text) {
          const withProtocol = text.startsWith('http') ? text : `https://${text}`;
          if (isValidUrl(withProtocol)) {
            onSelectUrl(withProtocol);
          } else {
            toast.error('No valid URL found in clipboard');
          }
        } else {
          toast.error('Clipboard is empty');
        }
      } catch {
        toast.error('Unable to access clipboard');
      }
    }
  };

  const handleSelectSavedLink = (url: string) => {
    onSelectUrl(url);
  };

  return (
    <>
    <div className="flex flex-col gap-5 p-5 animate-fade-in">
      {/* Section 1: Local Files (Primary) */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Local file
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <FileTypeButton
            icon={<Image className="h-6 w-6" />}
            label="Image"
            onClick={() => onSelectFile('image')}
          />
          <FileTypeButton
            icon={<Video className="h-6 w-6" />}
            label="Video"
            onClick={() => onSelectFile('video')}
          />
          <FileTypeButton
            icon={<Music className="h-6 w-6" />}
            label="Audio"
            onClick={() => onSelectFile('audio')}
          />
          <FileTypeButton
            icon={<FileText className="h-6 w-6" />}
            label="Document"
            onClick={() => onSelectFile('document')}
          />
        </div>
        
        {/* All files option */}
        <button
          onClick={() => onSelectFile('all')}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl bg-muted/30 p-3 mt-3",
            "active:scale-[0.98] transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">All Files</span>
        </button>
      </div>

      {/* Section 2: URL (Secondary) */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Link
        </h2>
        
        {/* Enter URL button */}
        <button
          onClick={() => onSelectUrl()}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl bg-muted/50 p-4 text-left",
            "active:scale-[0.98] transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Link className="h-5 w-5" />
          </div>
          <span className="font-medium text-foreground">Enter URL</span>
        </button>

        {/* Quick actions row */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <button
            onClick={handlePasteFromClipboard}
            className={cn(
              "flex items-center gap-2 rounded-xl bg-muted/30 p-3",
              "active:scale-[0.98] transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <Clipboard className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Paste URL</span>
          </button>
          <button
            onClick={() => setSavedLinksOpen(true)}
            className={cn(
              "flex items-center gap-2 rounded-xl bg-muted/30 p-3",
              "active:scale-[0.98] transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <Star className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Saved Links</span>
          </button>
        </div>
      </div>
    </div>

    <SavedLinksSheet
      open={savedLinksOpen}
      onOpenChange={setSavedLinksOpen}
      onSelectLink={handleSelectSavedLink}
    />
    </>
  );
}

interface FileTypeButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function FileTypeButton({ icon, label, onClick }: FileTypeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl bg-muted/50 p-4",
        "active:scale-[0.96] transition-transform",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}
