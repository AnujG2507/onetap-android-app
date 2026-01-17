import { useState } from 'react';
import { Image, Video, FileText, Link, Music, FolderOpen, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTypeFilter } from '@/lib/contentResolver';
import { SavedLinksSheet } from './SavedLinksSheet';

interface ContentSourcePickerProps {
  onSelectFile: (filter: FileTypeFilter) => void;
  onSelectUrl: (prefillUrl?: string) => void;
}

export function ContentSourcePicker({ onSelectFile, onSelectUrl }: ContentSourcePickerProps) {
  const [savedLinksOpen, setSavedLinksOpen] = useState(false);

  const handleSelectSavedLink = (url: string) => {
    onSelectUrl(url);
  };

  return (
    <>
    <div className="flex flex-col gap-6 p-5 animate-fade-in">
      {/* Section 1: What Matters (Primary) */}
      <div className="rounded-2xl bg-card elevation-1 p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">
          What matters on your phone
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <FileTypeButton
            icon={<Image className="h-6 w-6" />}
            label="Photo"
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
        
        {/* Browse all files option */}
        <button
          onClick={() => onSelectFile('all')}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl bg-muted/20 p-3.5 mt-4",
            "active:scale-[0.98] transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Browse all files</span>
        </button>
      </div>

      {/* Section 2: Links (Secondary) */}
      <div className="rounded-2xl bg-card elevation-1 p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">
          Distraction-free links
        </h2>
        
        {/* Access a link button */}
        <button
          onClick={() => onSelectUrl()}
          className={cn(
            "w-full flex items-center gap-4 rounded-xl bg-muted/40 p-4 text-left",
            "shadow-sm active:scale-[0.98] transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Link className="h-5 w-5" />
          </div>
          <span className="font-medium text-foreground">Access a link directly</span>
        </button>

        {/* Saved links button */}
        <button
          onClick={() => setSavedLinksOpen(true)}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl bg-muted/20 p-3.5 mt-4",
            "active:scale-[0.98] transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <Star className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Saved links</span>
        </button>
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
        "flex flex-col items-center gap-3 rounded-xl bg-muted/40 p-4",
        "shadow-sm active:scale-[0.96] transition-transform",
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
