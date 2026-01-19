import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, X, Bookmark, ListChecks, Trash2, Home, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { 
  getSavedLinks, 
  removeSavedLink, 
  addSavedLink,
  updateSavedLink,
  toggleShortlist,
  getShortlistedLinks,
  clearAllShortlist,
  getAllTags,
  PRESET_TAGS,
  type SavedLink 
} from '@/lib/savedLinksManager';
import { BookmarkItem } from './BookmarkItem';
import { BookmarkActionSheet } from './BookmarkActionSheet';
import { ShortlistViewer } from './ShortlistViewer';
import { AddBookmarkForm } from './AddBookmarkForm';
import { useToast } from '@/hooks/use-toast';
import { triggerHaptic } from '@/lib/haptics';

interface BookmarkLibraryProps {
  onCreateShortcut: (url: string) => void;
}

export function BookmarkLibrary({ onCreateShortcut }: BookmarkLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Action sheet state
  const [selectedLink, setSelectedLink] = useState<SavedLink | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  
  // Shortlist viewer state
  const [showViewer, setShowViewer] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  
  const { toast } = useToast();

  // Load links
  const refreshLinks = useCallback(() => {
    setLinks(getSavedLinks());
  }, []);

  useEffect(() => {
    refreshLinks();
  }, [refreshLinks]);

  // Derived data
  const allUsedTags = useMemo(() => getAllTags(), [links]);
  const availableTags = useMemo(() => {
    const combined = new Set([...PRESET_TAGS, ...allUsedTags]);
    return Array.from(combined);
  }, [allUsedTags]);
  
  const shortlistedLinks = useMemo(() => getShortlistedLinks(), [links]);
  const hasShortlist = shortlistedLinks.length > 0;

  // Filtered links
  const filteredLinks = useMemo(() => {
    let result = links;
    
    if (activeTagFilter) {
      result = result.filter(link => link.tag === activeTagFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(link =>
        link.title.toLowerCase().includes(query) ||
        link.url.toLowerCase().includes(query) ||
        link.description?.toLowerCase().includes(query) ||
        (link.tag && link.tag.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [links, searchQuery, activeTagFilter]);

  // Handlers
  const handleBookmarkTap = (link: SavedLink) => {
    triggerHaptic('light');
    setSelectedLink(link);
    setShowActionSheet(true);
  };

  const handleOpenExternal = (url: string) => {
    window.open(url, '_blank');
  };

  const handleToggleShortlist = (id: string) => {
    toggleShortlist(id);
    refreshLinks();
    triggerHaptic('success');
  };

  // Check if all filtered links are shortlisted
  const allFilteredShortlisted = useMemo(() => {
    return filteredLinks.length > 0 && filteredLinks.every(link => link.isShortlisted);
  }, [filteredLinks]);

  const someFilteredShortlisted = useMemo(() => {
    return filteredLinks.some(link => link.isShortlisted) && !allFilteredShortlisted;
  }, [filteredLinks, allFilteredShortlisted]);

  const handleToggleAllShortlist = () => {
    if (allFilteredShortlisted) {
      // Uncheck all filtered
      filteredLinks.forEach(link => {
        if (link.isShortlisted) {
          toggleShortlist(link.id);
        }
      });
    } else {
      // Check all filtered
      filteredLinks.forEach(link => {
        if (!link.isShortlisted) {
          toggleShortlist(link.id);
        }
      });
    }
    refreshLinks();
    triggerHaptic('success');
  };

  const handleViewInApp = (link: SavedLink) => {
    const shortlisted = getShortlistedLinks();
    const index = shortlisted.findIndex(l => l.id === link.id);
    setViewerStartIndex(Math.max(0, index));
    setShowViewer(true);
  };

  const handleEdit = (id: string, updates: { title?: string; description?: string; tag?: string | null }) => {
    updateSavedLink(id, updates);
    refreshLinks();
    toast({
      title: 'Bookmark updated',
      duration: 2000,
    });
  };

  const handleDelete = (id: string) => {
    removeSavedLink(id);
    refreshLinks();
    toast({
      title: 'Bookmark removed',
      duration: 2000,
    });
  };

  const handleAddBookmark = (url: string, title?: string, description?: string, tag?: string | null) => {
    const result = addSavedLink(url, title, description, tag);
    if (result.status === 'added') {
      refreshLinks();
      setShowAddForm(false);
      toast({
        title: 'Bookmark saved',
        duration: 2000,
      });
      triggerHaptic('success');
    } else if (result.status === 'duplicate') {
      toast({
        title: 'Already saved',
        description: 'This link is already in your bookmarks',
        duration: 3000,
      });
    }
  };

  const handleClearShortlist = () => {
    clearAllShortlist();
    refreshLinks();
    toast({
      title: 'Shortlist cleared',
      duration: 2000,
    });
    triggerHaptic('warning');
  };

  const handleViewShortlist = () => {
    if (shortlistedLinks.length === 0) return;
    setViewerStartIndex(0);
    setShowViewer(true);
    triggerHaptic('medium');
  };

  // Bulk actions for selected items
  const handleBulkDelete = () => {
    const selectedCount = shortlistedLinks.length;
    shortlistedLinks.forEach(link => {
      removeSavedLink(link.id);
    });
    refreshLinks();
    toast({
      title: `${selectedCount} bookmark${selectedCount > 1 ? 's' : ''} deleted`,
      duration: 2000,
    });
    triggerHaptic('warning');
  };

  const handleBulkCreateShortcuts = () => {
    shortlistedLinks.forEach(link => {
      onCreateShortcut(link.url);
    });
    toast({
      title: `Creating ${shortlistedLinks.length} shortcut${shortlistedLinks.length > 1 ? 's' : ''}...`,
      duration: 2000,
    });
    triggerHaptic('success');
  };

  return (
    <div className="flex flex-col h-full pb-14">
      {/* Header */}
      <header className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Bookmark className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-muted-foreground tracking-wide">Bookmarks</span>
          </div>
          
        </div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight tracking-tight">
          Your saved links
        </h1>
      </header>

      {/* Search */}
      <div className="px-5 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bookmarks..."
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Tag Filter Bar */}
      {availableTags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 px-5 scrollbar-hide">
          <button
            onClick={() => setActiveTagFilter(null)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              activeTagFilter === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            All
          </button>
          {availableTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                activeTagFilter === tag
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Add Bookmark Form or Button */}
      <div className="px-5 mb-4">
        {showAddForm ? (
          <AddBookmarkForm
            onSave={handleAddBookmark}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            onClick={() => {
              setShowAddForm(true);
              triggerHaptic('light');
            }}
            className={cn(
              "w-full flex items-center justify-center gap-2 p-3",
              "rounded-xl border-2 border-dashed border-muted-foreground/30",
              "text-muted-foreground hover:border-primary hover:text-primary",
              "transition-colors"
            )}
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm font-medium">Add Bookmark</span>
          </button>
        )}
      </div>

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto px-5">
        {filteredLinks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery || activeTagFilter ? (
              <p>No bookmarks match your filter</p>
            ) : (
              <div>
                <Bookmark className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No bookmarks yet</p>
                <p className="text-sm mt-1">Save important links for quick access</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Select All Row */}
            <div className="flex items-center gap-3 py-2 mb-2 border-b border-border/50">
              <Checkbox
                checked={allFilteredShortlisted}
                className="h-5 w-5"
                onClick={handleToggleAllShortlist}
                data-state={someFilteredShortlisted ? "indeterminate" : allFilteredShortlisted ? "checked" : "unchecked"}
              />
              <span className="text-sm text-muted-foreground">
                {allFilteredShortlisted 
                  ? `Deselect all (${filteredLinks.length})` 
                  : `Select all (${filteredLinks.length})`}
              </span>
            </div>
          <div className="space-y-2 pb-6">
            {filteredLinks.map((link) => (
              <BookmarkItem
                key={link.id}
                link={link}
                onTap={() => handleBookmarkTap(link)}
                onToggleShortlist={handleToggleShortlist}
              />
            ))}
          </div>
          </>
        )}
      </div>

      {/* Action Sheet */}
      <BookmarkActionSheet
        link={selectedLink}
        open={showActionSheet}
        onOpenChange={setShowActionSheet}
        onOpenExternal={handleOpenExternal}
        onViewInApp={handleViewInApp}
        onCreateShortcut={onCreateShortcut}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Shortlist Viewer */}
      <ShortlistViewer
        isOpen={showViewer}
        onClose={() => setShowViewer(false)}
        links={shortlistedLinks}
        startIndex={viewerStartIndex}
        onOpenExternal={handleOpenExternal}
      />

      {/* Floating Action Bar */}
      <div
        className={cn(
          "fixed bottom-20 left-1/2 -translate-x-1/2 z-50",
          "flex items-center gap-2 px-4 py-3 rounded-2xl",
          "bg-card border border-border shadow-lg",
          "transition-all duration-300 ease-out",
          hasShortlist
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <span className="text-sm font-medium text-foreground mr-2">
          {shortlistedLinks.length} selected
        </span>
        
        <div className="h-5 w-px bg-border" />
        
        <button
          onClick={handleViewShortlist}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors text-sm font-medium"
          aria-label="View selected"
        >
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">View</span>
        </button>
        
        <button
          onClick={handleBulkCreateShortcuts}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors text-sm font-medium"
          aria-label="Create shortcuts"
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Shortcuts</span>
        </button>
        
        <button
          onClick={handleBulkDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-sm font-medium"
          aria-label="Delete selected"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
        
        <div className="h-5 w-px bg-border" />
        
        <button
          onClick={handleClearShortlist}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
