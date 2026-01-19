import { useState } from 'react';
import { X, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRESET_TAGS } from '@/lib/savedLinksManager';

interface AddBookmarkFormProps {
  onSave: (url: string, title?: string, description?: string, tag?: string | null) => void;
  onCancel: () => void;
}

export function AddBookmarkForm({ onSave, onCancel }: AddBookmarkFormProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!url.trim()) return;
    
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    onSave(finalUrl, title.trim() || undefined, description.trim() || undefined, selectedTag);
  };

  return (
    <div className="p-4 rounded-xl bg-muted/50 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Add New Bookmark</span>
        <button onClick={onCancel} className="p-1 rounded-full hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      
      {/* URL */}
      <div className="relative mb-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (e.g., youtube.com)"
          className="pr-10"
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
      
      {/* Title */}
      <div className="relative mb-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
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
          placeholder="Description (optional)"
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
      
      <Button onClick={handleSubmit} disabled={!url.trim()} className="w-full">
        Save Bookmark
      </Button>
    </div>
  );
}
