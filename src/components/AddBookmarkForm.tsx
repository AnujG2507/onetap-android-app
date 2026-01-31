import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Tag, AlertCircle, Pencil, SkipForward } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRESET_TAGS, findSavedLinkByUrl, type SavedLink } from '@/lib/savedLinksManager';

interface AddBookmarkFormProps {
  onSave: (url: string, title?: string, description?: string, tag?: string | null) => void;
  onCancel: () => void;
  onEditExisting?: (link: SavedLink) => void;
}

export function AddBookmarkForm({ onSave, onCancel, onEditExisting }: AddBookmarkFormProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [existingLink, setExistingLink] = useState<SavedLink | null>(null);

  // Check for duplicate URL when URL changes
  useEffect(() => {
    if (!url.trim()) {
      setExistingLink(null);
      return;
    }

    // Debounce the check
    const timer = setTimeout(() => {
      const found = findSavedLinkByUrl(url);
      setExistingLink(found);
    }, 300);

    return () => clearTimeout(timer);
  }, [url]);

  const handleSubmit = () => {
    if (!url.trim() || existingLink) return;
    
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    onSave(finalUrl, title.trim() || undefined, description.trim() || undefined, selectedTag);
  };

  const handleEditExisting = () => {
    if (existingLink && onEditExisting) {
      onEditExisting(existingLink);
    }
  };

  const handleSkip = () => {
    setUrl('');
    setExistingLink(null);
  };

  return (
    <div className="p-4 landscape:p-3 rounded-xl bg-muted/50 animate-fade-in">
      <div className="flex items-center justify-between mb-3 landscape:mb-2">
        <span className="text-sm landscape:text-xs font-medium">{t('addBookmark.title')}</span>
        <button onClick={onCancel} className="p-1 rounded-full hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      
      {/* URL */}
      <div className="relative mb-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('addBookmark.urlPlaceholder')}
          className={cn(
            "pe-10 landscape:h-9",
            existingLink && "border-amber-500 focus-visible:ring-amber-500"
          )}
          autoFocus
        />
        {url && (
          <button
            type="button"
            onClick={() => setUrl('')}
            className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Duplicate Warning */}
      {existingLink && (
        <div className="mb-4 landscape:mb-3 p-3 landscape:p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-2 mb-3 landscape:mb-2">
            <AlertCircle className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm landscape:text-xs font-medium text-amber-600 dark:text-amber-400">
                {t('addBookmark.duplicateTitle')}
              </p>
              <p className="text-xs landscape:text-[10px] text-muted-foreground mt-1 truncate">
                {t('addBookmark.savedAs', { title: existingLink.title })}
              </p>
              {existingLink.tag && (
                <p className="text-xs landscape:text-[10px] text-muted-foreground">
                  {t('addBookmark.folder', { folder: existingLink.tag })}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {onEditExisting && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditExisting}
                className="flex-1 gap-1.5 landscape:h-8"
              >
                <Pencil className="h-3.5 w-3.5 landscape:h-3 landscape:w-3" />
                {t('addBookmark.editExisting')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              className="flex-1 gap-1.5 landscape:h-8"
            >
              <SkipForward className="h-3.5 w-3.5 landscape:h-3 landscape:w-3" />
              {t('addBookmark.clearAndSkip')}
            </Button>
          </div>
        </div>
      )}

      {/* Only show rest of form if no duplicate */}
      {!existingLink && (
        <>
          {/* Portrait: stacked, Landscape: 2-column for title + description */}
          <div className="landscape:grid landscape:grid-cols-2 landscape:gap-2">
            {/* Title */}
            <div className="relative mb-2 landscape:mb-0">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('addBookmark.titlePlaceholder')}
                className="pe-10 landscape:h-9"
              />
              {title && (
                <button
                  type="button"
                  onClick={() => setTitle('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            
            {/* Description */}
            <div className="relative mb-3 landscape:mb-0">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('addBookmark.descriptionPlaceholder')}
                className="resize-none pe-10 landscape:min-h-[36px]"
                rows={2}
                maxLength={200}
              />
              {description && (
                <button
                  type="button"
                  onClick={() => setDescription('')}
                  className="absolute end-3 top-3 landscape:top-2 p-1 rounded-full hover:bg-muted/50"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
          
          {/* Tag Selector */}
          <div className="mb-3 landscape:mb-2 landscape:mt-2">
            <div className="flex items-center gap-2 mb-2 landscape:mb-1.5">
              <Tag className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-muted-foreground" />
              <span className="text-xs landscape:text-[10px] text-muted-foreground">{t('addBookmark.tagLabel')}</span>
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
          
          <Button onClick={handleSubmit} disabled={!url.trim()} className="w-full landscape:h-9">
            {t('addBookmark.saveBookmark')}
          </Button>
        </>
      )}
    </div>
  );
}
