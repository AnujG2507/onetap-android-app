import { useState, useEffect } from 'react';
import { X, Bookmark, Smartphone, Share2, ChevronLeft, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useUrlMetadata } from '@/hooks/useUrlMetadata';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import { getAllFolders } from '@/lib/savedLinksManager';
interface SharedUrlActionSheetProps {
  url: string;
  onSaveToLibrary: (data?: { title?: string; description?: string; tag?: string | null }) => void;
  onCreateShortcut: () => void;
  onDismiss: () => void;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function SharedUrlActionSheet({
  url,
  onSaveToLibrary,
  onCreateShortcut,
  onDismiss,
}: SharedUrlActionSheetProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [viewMode, setViewMode] = useState<'choose' | 'edit'>('choose');
  
  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTag, setEditTag] = useState<string | null>(null);
  
  const domain = extractDomain(url);
  const { metadata, isLoading } = useUrlMetadata(url);
  const { thumbnailUrl, platform, isLoading: thumbnailLoading } = useVideoThumbnail(url);
  const folders = getAllFolders();
  // Pre-fill title when metadata loads
  useEffect(() => {
    if (metadata?.title && !editTitle) {
      setEditTitle(metadata.title);
    }
  }, [metadata?.title]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const handleSaveToLibrary = () => {
    // Transition to edit mode
    setViewMode('edit');
  };

  const handleConfirmSave = () => {
    setIsExiting(true);
    setTimeout(() => {
      onSaveToLibrary({
        title: editTitle.trim() || undefined,
        description: editDescription.trim() || undefined,
        tag: editTag,
      });
    }, 200);
  };

  const handleCancelEdit = () => {
    setViewMode('choose');
  };

  const handleCreateShortcut = () => {
    setIsExiting(true);
    setTimeout(onCreateShortcut, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8 bg-black/50 animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border overflow-hidden",
          "animate-in slide-in-from-bottom-4 duration-300",
          isExiting && "animate-out fade-out slide-out-to-bottom-4 duration-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            {viewMode === 'edit' ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 -ml-1 rounded-full hover:bg-muted transition-colors"
                  aria-label="Back"
                >
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium text-foreground">Save to Library</span>
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Link Received</span>
              </>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 -mr-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* URL Preview Card */}
        <div className="px-4 py-4 border-b border-border">
          {/* Video Thumbnail Preview */}
          {platform && (thumbnailUrl || thumbnailLoading) && (
            <div className="mb-3">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                {thumbnailLoading ? (
                  <Skeleton className="absolute inset-0" />
                ) : thumbnailUrl ? (
                  <>
                    <img
                      src={thumbnailUrl}
                      alt="Video thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    {/* Play button overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center",
                        "bg-black/60 backdrop-blur-sm"
                      )}>
                        <Play className="h-6 w-6 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                    {/* Platform badge */}
                    <div className={cn(
                      "absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium",
                      platform === 'youtube' 
                        ? "bg-red-600 text-white" 
                        : "bg-[#1ab7ea] text-white"
                    )}>
                      {platform === 'youtube' ? 'YouTube' : 'Vimeo'}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Favicon */}
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {isLoading ? (
                <Skeleton className="w-6 h-6 rounded" />
              ) : metadata?.favicon ? (
                <img 
                  src={metadata.favicon} 
                  alt="" 
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <Share2 className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            
            {/* Title and Domain */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-3/4 mb-1.5" />
                  <Skeleton className="h-3 w-1/2" />
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground truncate">
                    {metadata?.title || domain}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {domain}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {viewMode === 'choose' ? (
          /* Action Buttons */
          <div className="px-4 py-4 flex gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleSaveToLibrary}
            >
              <Bookmark className="h-4 w-4" />
              Save to Library
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleCreateShortcut}
            >
              <Smartphone className="h-4 w-4" />
              Create Shortcut
            </Button>
          </div>
        ) : (
          /* Edit Form */
          <div className="px-4 py-4 space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <div className="relative">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={metadata?.title || domain}
                  className="pr-8"
                />
                {editTitle && (
                  <button
                    onClick={() => setEditTitle('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <div className="relative">
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add a note..."
                  className="min-h-[60px] resize-none pr-8"
                />
                {editDescription && (
                  <button
                    onClick={() => setEditDescription('')}
                    className="absolute right-2 top-2 p-1 rounded-full hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Folder/Tag Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Folder (optional)</label>
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-2">
                  <button
                    type="button"
                    onClick={() => setEditTag(null)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                      editTag === null
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    None
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => setEditTag(folder)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                        editTag === folder
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {folder}
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>

            {/* Save Button */}
            <Button className="w-full gap-2" onClick={handleConfirmSave}>
              <Bookmark className="h-4 w-4" />
              Save to Library
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
