import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Globe, Instagram, Youtube, Clipboard, Star, Tag, X } from 'lucide-react';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isValidUrl, parseDeepLink } from '@/lib/contentResolver';
import { addSavedLink, PRESET_TAGS } from '@/lib/savedLinksManager';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

function extractUrlFromClipboard(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  
  // Check if it's already a valid URL
  if (isValidUrl(trimmed)) return trimmed;
  
  // Try adding https:// if it looks like a domain
  if (trimmed.includes('.') && !trimmed.startsWith('http')) {
    const withProtocol = `https://${trimmed}`;
    if (isValidUrl(withProtocol)) return withProtocol;
  }
  
  // Try to extract URL from text
  const matches = trimmed.match(URL_PATTERN);
  if (matches) {
    for (const match of matches) {
      const cleanUrl = match.replace(/[.,;:!?)]+$/, '');
      if (isValidUrl(cleanUrl)) return cleanUrl;
    }
  }
  
  return null;
}

interface UrlInputProps {
  onSubmit: (url: string) => void;
  onBack: () => void;
  initialUrl?: string;
}

export function UrlInput({ onSubmit, onBack, initialUrl }: UrlInputProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialUrl || '');
  const [error, setError] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);
  
  const linkInfo = url ? parseDeepLink(url) : null;
  
  const handleSubmit = () => {
    // Add protocol if missing
    let finalUrl = url.trim();
    if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    if (!isValidUrl(finalUrl)) {
      setError(t('urlInput.invalidUrl'));
      return;
    }
    
    // Save to library if toggle is on
    if (saveToLibrary) {
      const result = addSavedLink(
        finalUrl, 
        linkTitle.trim() || undefined, 
        linkDescription.trim() || undefined, 
        selectedTag
      );
      
      switch (result.status) {
        case 'added':
          toast.success(t('toasts.linkSaved'));
          break;
        case 'duplicate':
          toast.info(t('toasts.linkDuplicate'));
          break;
        case 'failed':
          toast.error(t('toasts.linkFailed'));
          break;
      }
    }
    
    setError('');
    onSubmit(finalUrl);
  };

  const handlePaste = async () => {
    try {
      const { value } = await CapClipboard.read();
      const url = value ? extractUrlFromClipboard(value) : null;
      
      if (url) {
        setUrl(url);
        setError('');
      } else {
        toast.error(t('urlInput.noUrlDetected'));
      }
    } catch {
      try {
        const text = await navigator.clipboard.readText();
        const url = text ? extractUrlFromClipboard(text) : null;
        
        if (url) {
          setUrl(url);
          setError('');
        } else {
          toast.error(t('urlInput.noUrlDetected'));
        }
      } catch {
        toast.error(t('urlInput.clipboardAccessError'));
      }
    }
  };

  const getPlatformIcon = () => {
    if (!linkInfo) return <Globe className="h-5 w-5" />;
    
    switch (linkInfo.platform) {
      case 'Instagram':
        return <Instagram className="h-5 w-5" />;
      case 'YouTube':
        return <Youtube className="h-5 w-5" />;
      default:
        return <Globe className="h-5 w-5" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 p-4 border-b">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-muted active:bg-muted/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-medium">{t('urlInput.enterLink')}</h2>
      </header>
      
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {getPlatformIcon()}
            </div>
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
              }}
              placeholder={t('urlInput.placeholder')}
              className={cn(
                "pl-11 pr-10 h-12 text-base",
                error && "border-destructive focus-visible:ring-destructive"
              )}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            {url && (
              <button
                type="button"
                onClick={() => setUrl('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Clear URL"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={handlePaste}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted hover:bg-muted/80 active:scale-95 transition-all"
            title={t('urlInput.pasteFromClipboard')}
          >
            <Clipboard className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
        
        {linkInfo?.isDeepLink && (
          <p className="mt-3 text-xs text-muted-foreground animate-fade-in">
            {t('urlInput.opensIn', { platform: linkInfo.platform })}
          </p>
        )}

        {/* Save to Library Section */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-primary" />
              <Label htmlFor="save-toggle" className="font-medium cursor-pointer">
                {t('urlInput.saveToLibrary')}
              </Label>
            </div>
            <Switch
              id="save-toggle"
              checked={saveToLibrary}
              onCheckedChange={setSaveToLibrary}
            />
          </div>
          
          {/* Expandable options when toggle is ON */}
          {saveToLibrary && (
            <div className="p-4 rounded-xl bg-muted/20 space-y-3 animate-fade-in">
              <div className="relative">
                <Input
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder={t('addBookmark.titlePlaceholder')}
                  className="h-10 pr-10"
                />
                {linkTitle && (
                  <button
                    type="button"
                    onClick={() => setLinkTitle('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                    aria-label={t('common.clearTitle')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              <Textarea
                value={linkDescription}
                onChange={(e) => setLinkDescription(e.target.value)}
                placeholder={t('addBookmark.descriptionPlaceholder')}
                className="resize-none"
                rows={2}
                maxLength={200}
              />
              
              {/* Single Tag Selector */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t('addBookmark.tagLabel')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
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
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 safe-bottom">
        <Button
          onClick={handleSubmit}
          disabled={!url.trim()}
          className="w-full h-12 text-base font-medium"
        >
          {t('common.continue')}
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}