import { Image, Video, FileText, Bookmark, Music, FolderOpen, Phone, Link, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTypeFilter } from '@/lib/contentResolver';

export type ContactMode = 'dial' | 'message';

interface ContentSourcePickerProps {
  onSelectFile: (filter: FileTypeFilter) => void;
  onSelectContact?: (mode: ContactMode) => void;
  onSelectFromLibrary?: () => void;
  onEnterUrl?: () => void;
  onOpenScheduled?: () => void;
  scheduledCount?: number;
}

export function ContentSourcePicker({ 
  onSelectFile, 
  onSelectContact, 
  onSelectFromLibrary, 
  onEnterUrl,
  onOpenScheduled,
  scheduledCount = 0,
}: ContentSourcePickerProps) {
  return (
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
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              }
              label="WhatsApp"
              onClick={() => onSelectContact('message')}
            />
          </div>
        </div>
      )}

      {/* Section 3: Links */}
      {(onSelectFromLibrary || onEnterUrl) && (
        <div className="rounded-2xl bg-card elevation-1 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Links
          </h2>
          
          <div className="grid grid-cols-2 gap-3">
            {onSelectFromLibrary && (
              <FileTypeButton
                icon={<Bookmark className="h-5 w-5" />}
                label="Saved Bookmark"
                onClick={onSelectFromLibrary}
              />
            )}
            {onEnterUrl && (
              <FileTypeButton
                icon={<Link className="h-5 w-5" />}
                label="Enter URL"
                onClick={onEnterUrl}
              />
            )}
          </div>
        </div>
      )}

      {/* Section 4: Scheduled Actions - single entry point */}
      {onOpenScheduled && (
        <div className="rounded-2xl bg-card elevation-1 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Scheduled
          </h2>
          
          <button
            onClick={onOpenScheduled}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl bg-muted/20 p-3.5",
              "active:scale-[0.98] transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div className="flex-1 text-left">
              <span className="text-sm font-medium text-foreground block">
                Scheduled actions
              </span>
              {scheduledCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {scheduledCount} active
                </span>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
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
