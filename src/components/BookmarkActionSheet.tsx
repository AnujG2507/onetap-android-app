import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ExternalLink, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Tag,
  Bell
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { PRESET_TAGS, type SavedLink } from '@/lib/savedLinksManager';
import { triggerHaptic } from '@/lib/haptics';
import { getSettings } from '@/lib/settingsManager';

interface BookmarkActionSheetProps {
  link: SavedLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenExternal: (url: string) => void;
  onCreateShortcut: (url: string) => void;
  onCreateReminder: (url: string) => void;
  onEdit: (id: string, updates: { title?: string; description?: string; tag?: string | null; url?: string }) => void;
  onDelete: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  startInEditMode?: boolean;
}

export function BookmarkActionSheet({
  link,
  open,
  onOpenChange,
  onOpenExternal,
  onCreateShortcut,
  onCreateReminder,
  onEdit,
  onDelete,
  onPermanentDelete,
  startInEditMode = false,
}: BookmarkActionSheetProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTag, setEditTag] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  // Swipe-to-close gesture tracking
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const SWIPE_CLOSE_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartY.current !== null && touchCurrentY.current !== null) {
      const deltaY = touchCurrentY.current - touchStartY.current;
      // Swipe down to close
      if (deltaY > SWIPE_CLOSE_THRESHOLD) {
        triggerHaptic('light');
        handleOpenChange(false);
      }
    }
    touchStartY.current = null;
    touchCurrentY.current = null;
  }, []);

  // URL validation
  const validateUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return t('bookmarkAction.urlRequired');
    
    // Add protocol if missing for validation
    let testUrl = trimmed;
    if (!/^https?:\/\//i.test(testUrl)) {
      testUrl = 'https://' + testUrl;
    }
    
    try {
      const parsed = new URL(testUrl);
      if (!parsed.hostname.includes('.')) {
        return t('bookmarkAction.invalidUrl');
      }
      return '';
    } catch {
      return t('bookmarkAction.invalidUrl');
    }
  };

  const handleUrlChange = (value: string) => {
    setEditUrl(value);
    if (urlError) {
      setUrlError(validateUrl(value));
    }
  };

  const handleUrlBlur = () => {
    setUrlError(validateUrl(editUrl));
  };

  // Start in edit mode when requested
  useEffect(() => {
    if (open && startInEditMode && link) {
      setEditTitle(link.title);
      setEditDescription(link.description || '');
      setEditTag(link.tag);
      setEditUrl(link.url);
      setUrlError('');
      setIsEditing(true);
    }
  }, [open, startInEditMode, link]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setIsEditing(false);
    }
    onOpenChange(isOpen);
  };

  const handleStartEdit = () => {
    if (!link) return;
    setEditTitle(link.title);
    setEditDescription(link.description || '');
    setEditTag(link.tag);
    setEditUrl(link.url);
    setUrlError('');
    setIsEditing(true);
    triggerHaptic('light');
  };

  const handleSaveEdit = () => {
    if (!link) return;
    
    const error = validateUrl(editUrl);
    if (error) {
      setUrlError(error);
      return;
    }
    
    onEdit(link.id, {
      title: editTitle.trim() || link.title,
      description: editDescription.trim(),
      tag: editTag,
      url: editUrl.trim(),
    });
    setIsEditing(false);
    onOpenChange(false);
    triggerHaptic('success');
  };

  const handleMoveToTrash = () => {
    if (!link) return;
    onDelete(link.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
    triggerHaptic('warning');
  };

  const handlePermanentDelete = () => {
    if (!link) return;
    onPermanentDelete(link.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
    triggerHaptic('warning');
  };

  const handleAction = (action: () => void) => {
    triggerHaptic('light');
    action();
  };

  if (!link) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent 
          side="bottom" 
          className="rounded-t-3xl landscape:max-h-[95vh]"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Swipe indicator */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <SheetHeader className="pb-4 landscape:pb-2">
            <SheetTitle className="text-start break-words pe-8">
              {link.title}
            </SheetTitle>
            <p className="text-xs text-muted-foreground break-all text-start">
              {link.url}
            </p>
          </SheetHeader>

          {isEditing ? (
            /* Edit Form */
            <div className="space-y-4 landscape:space-y-2 pb-6 landscape:pb-4">
              {/* Portrait: stacked, Landscape: 2-column grid */}
              <div className="landscape:grid landscape:grid-cols-2 landscape:gap-3">
                {/* Left column: URL + Title */}
                <div className="space-y-4 landscape:space-y-2">
                  {/* URL Field */}
                  <div>
                    <div className="relative">
                      <Input
                        value={editUrl}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        onBlur={handleUrlBlur}
                        placeholder={t('bookmarkAction.urlPlaceholder')}
                        className={cn("pe-10 landscape:h-9", urlError && "border-destructive focus-visible:ring-destructive")}
                        type="url"
                      />
                      {editUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditUrl('');
                            setUrlError(t('bookmarkAction.urlRequired'));
                          }}
                          className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {urlError && (
                      <p className="text-xs text-destructive mt-1.5">{urlError}</p>
                    )}
                  </div>
                  
                  {/* Title Field */}
                  <div className="relative">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder={t('bookmarkAction.titlePlaceholder')}
                      className="pe-10 landscape:h-9"
                      autoFocus
                    />
                    {editTitle && (
                      <button
                        type="button"
                        onClick={() => setEditTitle('')}
                        className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Right column: Description + Tags */}
                <div className="space-y-4 landscape:space-y-2 mt-4 landscape:mt-0">
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('bookmarkAction.descriptionPlaceholder')}
                    className="resize-none landscape:min-h-[60px]"
                    rows={2}
                    maxLength={200}
                  />
                  
                  {/* Tag Selector */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 landscape:mb-1.5">
                      <Tag className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-muted-foreground" />
                      <span className="text-xs landscape:text-[10px] text-muted-foreground">{t('bookmarkAction.tagLabel')}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 landscape:gap-1.5">
                      {PRESET_TAGS.map(tag => (
                        <button
                          key={tag}
                          onClick={() => setEditTag(editTag === tag ? null : tag)}
                          className={cn(
                            "px-2.5 py-1 landscape:px-2 landscape:py-0.5 rounded-full text-xs landscape:text-[10px] font-medium transition-colors",
                            editTag === tag
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 pt-2 landscape:pt-1">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  className="flex-1 landscape:h-10"
                >
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSaveEdit} className="flex-1 landscape:h-10">
                  {t('common.save')}
                </Button>
              </div>
            </div>
          ) : (
            /* Action List */
            <div className="space-y-1 pb-6 landscape:pb-4">
              {/* Open in In-App Browser */}
              <button
                onClick={() => handleAction(() => {
                  onOpenExternal(link.url);
                  onOpenChange(false);
                })}
                className="w-full flex items-center gap-3 p-3 landscape:p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <ExternalLink className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
                <span className="font-medium landscape:text-sm">{t('bookmarkAction.openInBrowser')}</span>
              </button>

              {/* Create Shortcut */}
              <button
                onClick={() => handleAction(() => {
                  onCreateShortcut(link.url);
                  onOpenChange(false);
                })}
                className="w-full flex items-center gap-3 p-3 landscape:p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <Plus className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
                <span className="font-medium landscape:text-sm">{t('bookmarkAction.createShortcut')}</span>
              </button>

              {/* Create Reminder */}
              <button
                onClick={() => handleAction(() => {
                  onCreateReminder(link.url);
                  onOpenChange(false);
                })}
                className="w-full flex items-center gap-3 p-3 landscape:p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <Bell className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
                <span className="font-medium landscape:text-sm">{t('bookmarkAction.remindLater')}</span>
              </button>

              {/* Edit */}
              <button
                onClick={() => handleAction(handleStartEdit)}
                className="w-full flex items-center gap-3 p-3 landscape:p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <Edit2 className="h-5 w-5 landscape:h-4 landscape:w-4 text-muted-foreground" />
                <span className="font-medium landscape:text-sm">{t('bookmarkAction.edit')}</span>
              </button>

              {/* Move to Trash - immediate action, no confirmation needed */}
              <button
                onClick={() => handleAction(handleMoveToTrash)}
                className="w-full flex items-center gap-3 p-3 landscape:p-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-destructive"
              >
                <Trash2 className="h-5 w-5 landscape:h-4 landscape:w-4" />
                <span className="font-medium landscape:text-sm">{t('bookmarkAction.moveToTrash')}</span>
              </button>

              {/* Delete Permanently - requires confirmation */}
              <button
                onClick={() => handleAction(() => setShowDeleteConfirm(true))}
                className="w-full flex items-center gap-3 p-3 landscape:p-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-destructive"
              >
                <Trash2 className="h-5 w-5 landscape:h-4 landscape:w-4" />
                <span className="font-medium landscape:text-sm">{t('bookmarkAction.deletePermanently')}</span>
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trash.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('trash.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
