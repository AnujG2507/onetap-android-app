import { useState, useMemo, useEffect } from 'react';
import { Search, Star, Trash2, Plus, X, Edit2, Tag, Bookmark, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  getSavedLinks, 
  removeSavedLink, 
  addSavedLink,
  updateSavedLink,
  getAllTags,
  PRESET_TAGS,
  type SavedLink 
} from '@/lib/savedLinksManager';

interface SavedLinksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectLink: (url: string) => void;
  onGoToBookmarks?: () => void;
}

export function SavedLinksSheet({ open, onOpenChange, onSelectLink, onGoToBookmarks }: SavedLinksSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLink, setEditingLink] = useState<SavedLink | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  
  // Form state - single tag instead of array
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // CRITICAL: Load links whenever the sheet opens (handles both controlled and uncontrolled open)
  useEffect(() => {
    if (open) {
      console.log('[SavedLinksSheet] Sheet opened, refreshing links...');
      setLinks(getSavedLinks());
      setSearchQuery('');
      setActiveTagFilter(null);
      resetForm();
    }
  }, [open]);

  const allUsedTags = useMemo(() => getAllTags(), [links]);
  const availableTags = useMemo(() => {
    const combined = new Set([...PRESET_TAGS, ...allUsedTags]);
    return Array.from(combined);
  }, [allUsedTags]);

  const resetForm = () => {
    setNewUrl('');
    setNewTitle('');
    setNewDescription('');
    setSelectedTag(null);
    setShowAddForm(false);
    setEditingLink(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    // Forward to parent - useEffect handles the refresh when open changes
    onOpenChange(isOpen);
  };

  const filteredLinks = useMemo(() => {
    let result = links;
    
    // Filter by tag
    if (activeTagFilter) {
      result = result.filter(link => link.tag === activeTagFilter);
    }
    
    // Filter by search
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

  const handleSelect = (url: string) => {
    onSelectLink(url);
    onOpenChange(false);
  };

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedLink(id);
    setLinks(getSavedLinks());
  };

  const handleEdit = (link: SavedLink, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLink(link);
    setNewUrl(link.url);
    setNewTitle(link.title);
    setNewDescription(link.description || '');
    setSelectedTag(link.tag);
    setShowAddForm(true);
  };

  const handleSaveLink = () => {
    if (editingLink) {
      // Update existing link
      updateSavedLink(editingLink.id, {
        title: newTitle.trim() || undefined,
        description: newDescription.trim() || undefined,
        tag: selectedTag,
      });
    } else {
      // Add new link
      if (!newUrl.trim()) return;
      
      let url = newUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      addSavedLink(url, newTitle.trim() || undefined, newDescription.trim() || undefined, selectedTag);
    }
    
    setLinks(getSavedLinks());
    resetForm();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl flex flex-col">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Saved Links
          </SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved links..."
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tag Filter Bar */}
        {availableTags.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-6 px-6 scrollbar-hide">
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

        {/* Add/Edit Link Form */}
        {showAddForm ? (
          <div className="mb-4 p-4 rounded-xl bg-muted/50 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">
                {editingLink ? 'Edit Link' : 'Add New Link'}
              </span>
              <button 
                onClick={resetForm}
                className="p-1 rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {!editingLink && (
              <div className="relative mb-2">
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="URL (e.g., youtube.com)"
                  className="pr-10"
                  autoFocus
                />
                {newUrl && (
                  <button
                    type="button"
                    onClick={() => setNewUrl('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Clear URL"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            
            <div className="relative mb-2">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title (optional)"
                className="pr-10"
                autoFocus={!!editingLink}
              />
              {newTitle && (
                <button
                  type="button"
                  onClick={() => setNewTitle('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Clear title"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            
            <div className="relative mb-3">
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)"
                className="resize-none pr-10"
                rows={2}
                maxLength={200}
              />
              {newDescription && (
                <button
                  type="button"
                  onClick={() => setNewDescription('')}
                  className="absolute right-3 top-3 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Clear description"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            
            {/* Single Tag Selector */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Tag (optional)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                      selectedTag === tag
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            
            <Button 
              onClick={handleSaveLink} 
              disabled={!editingLink && !newUrl.trim()} 
              className="w-full"
            >
              {editingLink ? 'Update Link' : 'Save Link'}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className={cn(
              "w-full flex items-center justify-center gap-2 p-3 mb-4",
              "rounded-xl border-2 border-dashed border-muted-foreground/30",
              "text-muted-foreground hover:border-primary hover:text-primary",
              "transition-colors"
            )}
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm font-medium">Add New Link</span>
          </button>
        )}

        {/* Links List */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {links.length === 0 && !showAddForm ? (
            // Empty library state - guide to Bookmarks tab
            <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
              {/* Animated illustration */}
              <div className="relative mb-6">
                <div className="absolute -top-2 -left-3 w-2 h-2 rounded-full bg-primary/30 animate-float-delayed" />
                <div className="absolute -top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary/20 animate-float" />
                <div className="absolute bottom-1 -right-2 w-2 h-2 rounded-full bg-primary/25 animate-float-delayed" />
                
                <div className="relative animate-float">
                  <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl scale-150" />
                  <div className="relative bg-muted/50 rounded-2xl p-4 border border-border/50">
                    <Bookmark className="h-8 w-8 text-primary/60" strokeWidth={1.5} />
                  </div>
                </div>
              </div>
              
              <h3 className="text-foreground font-medium mb-1">No bookmarks yet</h3>
              <p className="text-muted-foreground/70 text-sm text-center max-w-[220px] mb-5">
                Save links in your Bookmarks library first, then create shortcuts from them here.
              </p>
              
              {onGoToBookmarks && (
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onGoToBookmarks();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all"
                >
                  Go to Bookmarks
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : filteredLinks.length === 0 ? (
            // No results for current filter/search
            <div className="text-center py-12 text-muted-foreground">
              <p>No links match your filter</p>
            </div>
          ) : (
            <div className="space-y-2 pb-6">
              {filteredLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleSelect(link.url)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-xl",
                    "bg-muted/30 hover:bg-muted/50",
                    "active:scale-[0.98] transition-all",
                    "text-left group"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                    <Star className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{link.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                    {link.description && (
                      <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
                        {link.description}
                      </p>
                    )}
                    {link.tag && (
                      <div className="mt-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {link.tag}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => handleEdit(link, e)}
                      className="p-1.5 rounded-full hover:bg-muted"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleRemove(link.id, e)}
                      className="p-1.5 rounded-full hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}