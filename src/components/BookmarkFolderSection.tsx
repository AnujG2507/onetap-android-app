import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { BookmarkItem } from './BookmarkItem';
import type { SavedLink } from '@/lib/savedLinksManager';

interface BookmarkFolderSectionProps {
  title: string;
  links: SavedLink[];
  defaultOpen?: boolean;
  onBookmarkTap: (link: SavedLink) => void;
  onToggleShortlist: (id: string) => void;
  isDragDisabled?: boolean;
}

export function BookmarkFolderSection({
  title,
  links,
  defaultOpen = true,
  onBookmarkTap,
  onToggleShortlist,
  isDragDisabled,
}: BookmarkFolderSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const selectedCount = links.filter(l => l.isShortlisted).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg",
            "bg-muted/50 hover:bg-muted transition-colors",
            "text-left group"
          )}
        >
          {/* Chevron */}
          <span className="text-muted-foreground">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          
          {/* Folder icon */}
          <span className="text-muted-foreground">
            {isOpen ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
          </span>
          
          {/* Title and count */}
          <span className="flex-1 font-medium text-sm text-foreground">
            {title}
          </span>
          
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-background">
            {links.length}
          </span>
          
          {selectedCount > 0 && (
            <span className="text-xs text-primary-foreground px-2 py-0.5 rounded-full bg-primary">
              {selectedCount} selected
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="animate-accordion-down">
        <SortableContext
          items={links.map(l => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 mt-2 pl-2">
            {links.map((link) => (
              <BookmarkItem
                key={link.id}
                link={link}
                onTap={() => onBookmarkTap(link)}
                onToggleShortlist={onToggleShortlist}
                isDragDisabled={isDragDisabled}
              />
            ))}
          </div>
        </SortableContext>
      </CollapsibleContent>
    </Collapsible>
  );
}