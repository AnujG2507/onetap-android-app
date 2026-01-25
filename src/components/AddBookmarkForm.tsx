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
    <div className="p-4 rounded-xl bg-muted/50 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{t('addBookmark.title')}</span>
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
            "pr-10",
            existingLink && "border-amber-500 focus-visible:ring-amber-500"
          )}
          autoFocus
        />
        {url && (
          <button
            type="button"
            onClick={() => setUrl('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Duplicate Warning */}
      {existingLink && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {t('addBookmark.duplicateTitle')}
              </p>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {t('addBookmark.savedAs', { title: existingLink.title })}
              </p>
              {existingLink.tag && (
                <p className="text-xs text-muted-foreground">
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
                className="flex-1 gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t('addBookmark.editExisting')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              className="flex-1 gap-1.5"
            >
              <SkipForward className="h-3.5 w-3.5" />
              {t('addBookmark.clearAndSkip')}
            </Button>
          </div>
        </div>
      )}

      {/* Only show rest of form if no duplicate */}
      {!existingLink && (
        <>
          {/* Title */}
          <div className="relative mb-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('addBookmark.titlePlaceholder')}
              className="pr-10"
            />
            {title && (
              <button
                type="button"
                onClick={() => setTitle('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          
          {/* Description */}
          <div className="relative mb-3">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('addBookmark.descriptionPlaceholder')}
              className="resize-none pr-10"
              rows={2}
              maxLength={200}
            />
            {description && (
              <button
                type="button"
                onClick={() => setDescription('')}
                className="absolute right-3 top-3 p-1 rounded-full hover:bg-muted/50"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          
          {/* Tag Selector */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t('addBookmark.tagLabel')}</span>
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
          
          <Button onClick={handleSubmit} disabled={!url.trim()} className="w-full">
            {t('addBookmark.saveBookmark')}
          </Button>
        </>
      )}
    </div>
  );
}
