import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Star, Trash2, Plus, X, Edit2, Tag, Bookmark, ArrowRight, Globe } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { detectPlatform } from '@/lib/platformIcons';
import { PlatformIcon } from '@/components/PlatformIcon';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
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
  onSelectLink: (url: string, title?: string) => void;
  onGoToBookmarks?: () => void;
}

export function SavedLinksSheet({ open, onOpenChange, onSelectLink, onGoToBookmarks }: SavedLinksSheetProps) {
  const { t } = useTranslation();
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

  // Back button handler - close form first, then close sheet
  const handleBackButton = useCallback(() => {
    if (showAddForm) {
      resetForm();
    } else {
      onOpenChange(false);
    }
  }, [showAddForm, onOpenChange]);

  // Register with back handler - only when sheet is open
  useSheetBackHandler(
    'saved-links-sheet',
    open,
    handleBackButton,
    showAddForm ? 20 : 0 // Higher priority when form is open
  );

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

  const handleSelect = (link: SavedLink) => {
    onSelectLink(link.url, link.title || undefined);
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
    
    // Refresh the links list
    setLinks(getSavedLinks());
    
    // Clear filters so the user can see the newly added/edited link
    setSearchQuery('');
    setActiveTagFilter(null);
    
    resetForm();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] landscape:h-[90vh] rounded-t-3xl flex flex-col">
        <SheetHeader className="pb-2 landscape:pb-1">
          <SheetTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 landscape:h-4 landscape:w-4 text-primary" />
            <span className="landscape:text-sm">{t('savedLinks.title')}</span>
          </SheetTitle>
        </SheetHeader>

        {/* Search - hidden in empty state */}
        {links.length > 0 && (
          <div className="relative mb-3 landscape:mb-2">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('savedLinks.searchPlaceholder')}
              className="ps-10 pe-10 landscape:h-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                aria-label={t('library.clearSearch')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Tag Filter Bar - hidden in empty state */}
        {links.length > 0 && availableTags.length > 0 && (
          <div className="flex gap-2 landscape:gap-1.5 overflow-x-auto pb-3 landscape:pb-2 -mx-6 px-6 scrollbar-hide">
            <button
              onClick={() => setActiveTagFilter(null)}
              className={cn(
                "shrink-0 px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-full text-xs landscape:text-[10px] font-medium transition-colors",
                activeTagFilter === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {t('library.all')}
            </button>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                className={cn(
                  "shrink-0 px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-full text-xs landscape:text-[10px] font-medium transition-colors",
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
          <div className="mb-4 landscape:mb-3 p-4 landscape:p-3 rounded-xl bg-muted/50 animate-fade-in">
            <div className="flex items-center justify-between mb-3 landscape:mb-2">
              <span className="text-sm landscape:text-xs font-medium">
                {editingLink ? t('savedLinks.editLink') : t('savedLinks.addNew')}
              </span>
              <button 
                onClick={resetForm}
                className="p-1 rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Portrait: stacked, Landscape: 2-column grid */}
            <div className="landscape:grid landscape:grid-cols-2 landscape:gap-3">
              <div className="space-y-2">
                {!editingLink && (
                  <div className="relative">
                    <Input
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder={t('savedLinks.urlPlaceholder')}
                      className="pe-10 landscape:h-9"
                      autoFocus
                    />
                    {newUrl && (
                      <button
                        type="button"
                        onClick={() => setNewUrl('')}
                        className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                        aria-label={t('common.clearText')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
                
                <div className="relative">
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={t('savedLinks.titlePlaceholder')}
                    className="pe-10 landscape:h-9"
                    autoFocus={!!editingLink}
                  />
                  {newTitle && (
                    <button
                      type="button"
                      onClick={() => setNewTitle('')}
                      className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                      aria-label={t('common.clearTitle')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="space-y-2 mt-2 landscape:mt-0">
                <div className="relative">
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder={t('savedLinks.descriptionPlaceholder')}
                    className="resize-none pe-10 landscape:min-h-[60px]"
                    rows={2}
                    maxLength={200}
                  />
                  {newDescription && (
                    <button
                      type="button"
                      onClick={() => setNewDescription('')}
                      className="absolute end-3 top-3 landscape:top-2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                      aria-label={t('common.clearText')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Single Tag Selector */}
            <div className="mb-3 landscape:mb-2 mt-3 landscape:mt-2">
              <div className="flex items-center gap-2 mb-2 landscape:mb-1.5">
                <Tag className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-muted-foreground" />
                <span className="text-xs landscape:text-[10px] text-muted-foreground">{t('savedLinks.tagOptional')}</span>
              </div>
              <div className="flex flex-wrap gap-2 landscape:gap-1.5">
                {PRESET_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={cn(
                      "px-2.5 py-1 landscape:px-2 landscape:py-0.5 rounded-full text-xs landscape:text-[10px] font-medium transition-colors",
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
              className="w-full landscape:h-9"
            >
              {editingLink ? t('savedLinks.updateLink') : t('savedLinks.saveLink')}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className={cn(
              "w-full flex items-center justify-center gap-2 p-3 landscape:p-2 mb-4 landscape:mb-3",
              "rounded-xl border-2 border-dashed border-muted-foreground/30",
              "text-muted-foreground hover:border-primary hover:text-primary",
              "transition-colors"
            )}
          >
            <Plus className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
            <span className="text-sm landscape:text-xs font-medium">{t('savedLinks.addNew')}</span>
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
              
              <h3 className="text-foreground font-medium mb-1">{t('savedLinks.noBookmarks')}</h3>
              <p className="text-muted-foreground/70 text-sm text-center max-w-[220px] mb-5">
                {t('savedLinks.noBookmarksDesc')}
              </p>
              
              {onGoToBookmarks && (
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      onGoToBookmarks();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all"
                  >
                    {t('savedLinks.goToBookmarks')}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </button>
              )}
            </div>
          ) : filteredLinks.length === 0 ? (
            // No results for current filter/search
            <div className="text-center py-12 text-muted-foreground">
              <p>{t('savedLinks.noMatch')}</p>
            </div>
          ) : (
            <div className="space-y-2 pb-6">
              {filteredLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleSelect(link)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-xl",
                    "bg-muted/30 hover:bg-muted/50",
                    "active:scale-[0.98] transition-all",
                    "text-start group"
                  )}
                >
                  {(() => {
                    const platform = detectPlatform(link.url);
                    if (platform) {
                      return (
                        <div className="shrink-0 mt-0.5">
                          <PlatformIcon platform={platform} size="md" />
                        </div>
                      );
                    }
                    return (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                      </div>
                    );
                  })()}
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