import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { BookmarkItem } from './BookmarkItem';
import { PRESET_TAGS, getFolderIcon, type SavedLink } from '@/lib/savedLinksManager';
import { getIconByName } from './FolderIconPicker';
import { EditFolderDialog } from './EditFolderDialog';

interface BookmarkFolderSectionProps {
  title: string;
  folderId: string;
  links: SavedLink[];
  defaultOpen?: boolean;
  onBookmarkTap: (link: SavedLink) => void;
  onToggleShortlist: (id: string) => void;
  onCreateShortcut?: (url: string) => void;
  onDeleteBookmark?: (id: string) => void;
  onDeleteFolder?: (name: string) => void;
  onFolderUpdated?: () => void;
  isDragDisabled?: boolean;
  isOver?: boolean;
  isSelectionMode?: boolean;
}

export function BookmarkFolderSection({
  title,
  folderId,
  links,
  defaultOpen = true,
  onBookmarkTap,
  onToggleShortlist,
  onCreateShortcut,
  onDeleteBookmark,
  onDeleteFolder,
  onFolderUpdated,
  isDragDisabled,
  isSelectionMode = false,
}: BookmarkFolderSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folderId}`,
    data: {
      type: 'folder',
      folderId,
      folderName: title === 'Uncategorized' ? null : title,
    },
  });
  
  const selectedCount = links.filter(l => l.isShortlisted).length;
  const isPreset = PRESET_TAGS.includes(title);
  const isCustomFolder = !isPreset && title !== 'Uncategorized';
  const canDelete = isCustomFolder && onDeleteFolder;
  const canEdit = isCustomFolder;
  
  // Get custom icon for this folder
  const customIconName = getFolderIcon(title);
  const CustomIcon = customIconName ? getIconByName(customIconName) : null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <div
        ref={setNodeRef}
        className={cn(
          "rounded-lg transition-all duration-200",
          isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg",
              "bg-muted/50 hover:bg-muted transition-colors",
              "text-left group",
              isOver && "bg-primary/10"
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
            <span className={cn(
              "text-muted-foreground",
              isOver && "text-primary"
            )}>
              {CustomIcon ? (
                <CustomIcon className="h-4 w-4" />
              ) : isOpen ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4" />
              )}
            </span>
            
            {/* Title and count */}
            <span className={cn(
              "flex-1 font-medium text-sm text-foreground",
              isOver && "text-primary"
            )}>
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
            
            {/* Edit button for custom folders */}
            {canEdit && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditDialogOpen(true);
                }}
                className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil className="h-3.5 w-3.5" />
              </span>
            )}
            
            {/* Delete button for custom folders */}
            {canDelete && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder?.(title);
                }}
                className="p-1 rounded hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="animate-accordion-down">
          <SortableContext
            items={links.map(l => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className={cn(
              "space-y-2 mt-2 pl-2 min-h-[40px] rounded-lg transition-colors",
              isOver && links.length === 0 && "bg-primary/5 border-2 border-dashed border-primary/30"
            )}>
              {links.length === 0 && isOver && (
                <div className="flex items-center justify-center py-4 text-sm text-primary">
                  Drop here to move
                </div>
              )}
              {links.map((link) => (
                <BookmarkItem
                  key={link.id}
                  link={link}
                  onTap={() => onBookmarkTap(link)}
                  onToggleShortlist={onToggleShortlist}
                  onCreateShortcut={onCreateShortcut}
                  onDelete={onDeleteBookmark}
                  isDragDisabled={isDragDisabled}
                  isSelectionMode={isSelectionMode}
                />
              ))}
            </div>
          </SortableContext>
        </CollapsibleContent>
      </div>
      
      {/* Edit Folder Dialog */}
      <EditFolderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        folderName={title}
        onFolderUpdated={() => onFolderUpdated?.()}
      />
    </Collapsible>
  );
}