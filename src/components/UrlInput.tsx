import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Globe, Instagram, Youtube, Clipboard, Star, Tag, X } from 'lucide-react';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  const [url, setUrl] = useState(initialUrl || '');
  const [error, setError] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);
  
  const linkInfo = url ? parseDeepLink(url) : null;

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const tag = customTag.trim();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags(prev => [...prev, tag]);
      setCustomTag('');
    }
  };
  
  const handleSubmit = () => {
    // Add protocol if missing
    let finalUrl = url.trim();
    if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    if (!isValidUrl(finalUrl)) {
      setError('Please enter a valid URL');
      return;
    }
    
    // Save to library if toggle is on
    if (saveToLibrary) {
      addSavedLink(
        finalUrl, 
        linkTitle.trim() || undefined, 
        linkDescription.trim() || undefined, 
        selectedTags
      );
      toast.success('Link saved to library!');
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
        toast.error('No URL detected on clipboard');
      }
    } catch {
      try {
        const text = await navigator.clipboard.readText();
        const url = text ? extractUrlFromClipboard(text) : null;
        
        if (url) {
          setUrl(url);
          setError('');
        } else {
          toast.error('No URL detected on clipboard');
        }
      } catch {
        toast.error('Unable to access clipboard');
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
        <h2 className="text-lg font-medium">Enter link</h2>
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
              placeholder="Paste or type a URL"
              className={cn(
                "pl-11 pr-4 h-12 text-base",
                error && "border-destructive focus-visible:ring-destructive"
              )}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <button
            onClick={handlePaste}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted hover:bg-muted/80 active:scale-95 transition-all"
            title="Paste from clipboard"
          >
            <Clipboard className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
        
        {linkInfo?.isDeepLink && (
          <p className="mt-3 text-xs text-muted-foreground animate-fade-in">
            Opens in {linkInfo.platform}
          </p>
        )}

        {/* Save to Library Section */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-primary" />
              <Label htmlFor="save-toggle" className="font-medium cursor-pointer">
                Save to Library
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
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Title (optional)"
                className="h-10"
              />
              
              <Textarea
                value={linkDescription}
                onChange={(e) => setLinkDescription(e.target.value)}
                placeholder="Description (optional)"
                className="resize-none"
                rows={2}
                maxLength={200}
              />
              
              {/* Tag selector with preset tags */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tags</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PRESET_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                        selectedTags.includes(tag)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                
                {/* Custom tag input */}
                <div className="flex gap-2">
                  <Input
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="Add custom tag..."
                    className="flex-1 h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomTag();
                      }
                    }}
                  />
                  <Button 
                    type="button"
                    variant="outline" 
                    size="sm" 
                    onClick={addCustomTag}
                    disabled={!customTag.trim()}
                    className="h-8"
                  >
                    Add
                  </Button>
                </div>
                
                {/* Display selected custom tags */}
                {selectedTags.filter(t => !PRESET_TAGS.includes(t)).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedTags.filter(t => !PRESET_TAGS.includes(t)).map(tag => (
                      <Badge 
                        key={tag} 
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive/20"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag} <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}
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
          Continue
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
