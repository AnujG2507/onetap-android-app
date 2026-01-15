import { Image, Video, FileText, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTypeFilter } from '@/lib/contentResolver';

interface ContentSourcePickerProps {
  onSelectFile: (filter: FileTypeFilter) => void;
  onSelectUrl: () => void;
}

export function ContentSourcePicker({ onSelectFile, onSelectUrl }: ContentSourcePickerProps) {
  return (
    <div className="flex flex-col gap-5 p-5 animate-fade-in">
      {/* Section 1: Local Files (Primary) */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Local file
        </h2>
        <div className="grid grid-cols-3 gap-3">
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
            icon={<FileText className="h-6 w-6" />}
            label="Document"
            onClick={() => onSelectFile('document')}
          />
        </div>
      </div>

      {/* Section 2: URL (Secondary) */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Link
        </h2>
        <button
          onClick={onSelectUrl}
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
      </div>
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
