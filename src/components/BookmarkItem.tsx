import { useRef, useCallback, useState } from 'react';
import { Globe, GripVertical, Home } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { triggerHaptic } from '@/lib/haptics';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { SavedLink } from '@/lib/savedLinksManager';

interface BookmarkItemProps {
  link: SavedLink;
  onTap: () => void;
  onToggleShortlist: (id: string) => void;
  onCreateShortcut?: (url: string) => void;
  isDragDisabled?: boolean;
}

function extractFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return '';
  }
}

const LONG_PRESS_DURATION = 500;

export function BookmarkItem({ 
  link, 
  onTap, 
  onToggleShortlist, 
  onCreateShortcut,
  isDragDisabled 
}: BookmarkItemProps) {
  const faviconUrl = extractFaviconUrl(link.url);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: link.id,
    disabled: isDragDisabled,
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleShortlist(link.id);
  };

  const handleLongPressStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      triggerHaptic('medium');
      if (onCreateShortcut) {
        setShowConfirmDialog(true);
      }
    }, LONG_PRESS_DURATION);
  }, [onCreateShortcut]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleConfirmCreateShortcut = useCallback(() => {
    if (onCreateShortcut) {
      onCreateShortcut(link.url);
    }
    setShowConfirmDialog(false);
  }, [link.url, onCreateShortcut]);

  const handleClick = useCallback(() => {
    if (!isLongPress.current) {
      onTap();
    }
    isLongPress.current = false;
  }, [onTap]);
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full flex items-start gap-2 p-4 rounded-xl",
        "bg-card hover:bg-muted/50",
        "transition-all",
        "text-left group border border-border/50",
        isDragging && "opacity-50 shadow-lg scale-[1.02] z-50"
      )}
    >
      {/* Drag Handle */}
      {!isDragDisabled && (
        <button
          type="button"
          className="flex items-center justify-center pt-1 cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5 text-muted-foreground/50" />
        </button>
      )}
      
      {/* Checkbox for shortlisting */}
      <div 
        className="flex items-center justify-center pt-1"
        onClick={handleCheckboxClick}
      >
        <Checkbox 
          checked={link.isShortlisted || false}
          className="h-5 w-5"
        />
      </div>
      
      {/* Clickable content area */}
      <button
        type="button"
        onClick={handleClick}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        onTouchCancel={handleLongPressEnd}
        className="flex-1 flex items-start gap-3 text-left active:scale-[0.99] transition-transform select-none"
      >
        {/* Favicon or fallback icon */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden">
          {faviconUrl ? (
            <img 
              src={faviconUrl} 
              alt="" 
              className="h-6 w-6 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <Globe className={cn("h-5 w-5 text-muted-foreground", faviconUrl && "hidden")} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{link.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 break-all line-clamp-2">{link.url}</p>
          {link.description && (
            <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">
              {link.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {link.tag && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                {link.tag}
              </Badge>
            )}
            {onCreateShortcut && (
              <span className="text-[10px] text-muted-foreground/60 hidden group-hover:inline-flex items-center gap-1">
                <Home className="h-3 w-3" />
                Hold to create shortcut
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Shortcut?</AlertDialogTitle>
            <AlertDialogDescription>
              Create a home screen shortcut for "{link.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreateShortcut}>
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
