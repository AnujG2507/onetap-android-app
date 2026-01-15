import { useState, useMemo } from 'react';
import { Search, Star, Trash2, Plus, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  getSavedLinks, 
  removeSavedLink, 
  addSavedLink,
  type SavedLink 
} from '@/lib/savedLinksManager';

interface SavedLinksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectLink: (url: string) => void;
}

export function SavedLinksSheet({ open, onOpenChange, onSelectLink }: SavedLinksSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');

  // Refresh links when sheet opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setLinks(getSavedLinks());
      setSearchQuery('');
      setShowAddForm(false);
    }
    onOpenChange(isOpen);
  };

  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) return links;
    
    const query = searchQuery.toLowerCase();
    return links.filter(link =>
      link.title.toLowerCase().includes(query) ||
      link.url.toLowerCase().includes(query)
    );
  }, [links, searchQuery]);

  const handleSelect = (url: string) => {
    onSelectLink(url);
    onOpenChange(false);
  };

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedLink(id);
    setLinks(getSavedLinks());
  };

  const handleAddLink = () => {
    if (!newUrl.trim()) return;
    
    let url = newUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    addSavedLink(url, newTitle.trim() || undefined);
    setLinks(getSavedLinks());
    setNewUrl('');
    setNewTitle('');
    setShowAddForm(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Saved Links
          </SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved links..."
            className="pl-10"
          />
        </div>

        {/* Add New Link Form */}
        {showAddForm ? (
          <div className="mb-4 p-4 rounded-xl bg-muted/50 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Add New Link</span>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1 rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="URL (e.g., youtube.com)"
              className="mb-2"
              autoFocus
            />
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title (optional)"
              className="mb-3"
            />
            <Button onClick={handleAddLink} disabled={!newUrl.trim()} className="w-full">
              Save Link
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
          {filteredLinks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? (
                <p>No links match "{searchQuery}"</p>
              ) : (
                <div>
                  <Star className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No saved links yet</p>
                  <p className="text-sm mt-1">Add your favorite URLs for quick access</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 pb-6">
              {filteredLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleSelect(link.url)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl",
                    "bg-muted/30 hover:bg-muted/50",
                    "active:scale-[0.98] transition-all",
                    "text-left group"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Star className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{link.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                  </div>
                  <button
                    onClick={(e) => handleRemove(link.id, e)}
                    className={cn(
                      "p-2 rounded-full opacity-0 group-hover:opacity-100",
                      "hover:bg-destructive/10 hover:text-destructive",
                      "transition-all"
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
