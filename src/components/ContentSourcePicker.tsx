import { FileText, Link, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContentSourcePickerProps {
  onSelectFile: () => void;
  onSelectUrl: () => void;
}

export function ContentSourcePicker({ onSelectFile, onSelectUrl }: ContentSourcePickerProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <SourceOption
        icon={<FileText className="h-6 w-6" />}
        label="Local File"
        description="Image, video, PDF, document"
        onClick={onSelectFile}
      />
      <SourceOption
        icon={<Link className="h-6 w-6" />}
        label="Link"
        description="Any URL, Instagram, YouTube..."
        onClick={onSelectUrl}
      />
      <div className="mt-2 flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
        <Share2 className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          You can also share content here from any app
        </p>
      </div>
    </div>
  );
}

interface SourceOptionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}

function SourceOption({ icon, label, description, onClick }: SourceOptionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 rounded-xl bg-card p-4 text-left",
        "elevation-1 active:scale-[0.98] transition-transform",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
