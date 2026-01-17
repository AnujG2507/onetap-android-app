import { useState } from 'react';
import { Image, Video, FileText, Link, Music, FolderOpen, Star, Phone, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTypeFilter } from '@/lib/contentResolver';
import { SavedLinksSheet } from './SavedLinksSheet';

export type ContactMode = 'dial' | 'message';

interface ContentSourcePickerProps {
  onSelectFile: (filter: FileTypeFilter) => void;
  onSelectUrl: (prefillUrl?: string) => void;
  onSelectContact?: (mode: ContactMode) => void;
}

export function ContentSourcePicker({ onSelectFile, onSelectUrl, onSelectContact }: ContentSourcePickerProps) {
  const [savedLinksOpen, setSavedLinksOpen] = useState(false);

  const handleSelectSavedLink = (url: string) => {
    onSelectUrl(url);
  };

  return (
    <>
    <div className="flex flex-col gap-4 p-5 animate-fade-in">
      {/* Section 1: What Matters (Primary) */}
      <div className="rounded-2xl bg-card elevation-1 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          What matters on your phone
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <FileTypeButton
            icon={<Image className="h-5 w-5" />}
            label="Photo"
            onClick={() => onSelectFile('image')}
          />
          <FileTypeButton
            icon={<Video className="h-5 w-5" />}
            label="Video"
            onClick={() => onSelectFile('video')}
          />
          <FileTypeButton
            icon={<Music className="h-5 w-5" />}
            label="Audio"
            onClick={() => onSelectFile('audio')}
          />
          <FileTypeButton
            icon={<FileText className="h-5 w-5" />}
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

      {/* Section 2: Quick Actions (Contacts) */}
      {onSelectContact && (
        <div className="rounded-2xl bg-card elevation-1 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <FileTypeButton
              icon={<Phone className="h-5 w-5" />}
              label="Call Contact"
              onClick={() => onSelectContact('dial')}
            />
            <FileTypeButton
              icon={<MessageCircle className="h-5 w-5" />}
              label="Message"
              onClick={() => onSelectContact('message')}
            />
          </div>
        </div>
      )}

      {/* Section 3: Links (Secondary) */}
      <div className="rounded-2xl bg-card elevation-1 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
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
          <span className="font-medium text-foreground">Link</span>
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
        "flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3",
        "shadow-sm active:scale-[0.98] transition-transform",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}
