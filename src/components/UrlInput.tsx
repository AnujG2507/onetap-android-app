import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Globe, Instagram, Youtube, Clipboard, Star } from 'lucide-react';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isValidUrl, parseDeepLink } from '@/lib/contentResolver';
import { addSavedLink } from '@/lib/savedLinksManager';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  onBack: () => void;
  initialUrl?: string;
}

export function UrlInput({ onSubmit, onBack, initialUrl }: UrlInputProps) {
  const [url, setUrl] = useState(initialUrl || '');
  const [error, setError] = useState('');

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
      setError('Please enter a valid URL');
      return;
    }
    
    setError('');
    onSubmit(finalUrl);
  };

  const handlePaste = async () => {
    try {
      const { value } = await CapClipboard.read();
      if (value) {
        setUrl(value);
        setError('');
      }
    } catch {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrl(text);
          setError('');
        }
      } catch {
        toast.error('Unable to access clipboard');
      }
    }
  };

  const handleSaveLink = () => {
    let finalUrl = url.trim();
    if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    if (isValidUrl(finalUrl)) {
      addSavedLink(finalUrl);
      toast.success('Link saved!');
    } else {
      toast.error('Enter a valid URL first');
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
        <h2 className="text-lg font-medium">Add Link</h2>
      </header>
      
      <div className="flex-1 p-4">
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
          <button
            onClick={handleSaveLink}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted hover:bg-muted/80 active:scale-95 transition-all",
              !url.trim() && "opacity-50"
            )}
            title="Save to favorites"
            disabled={!url.trim()}
          >
            <Star className="h-5 w-5 text-muted-foreground" />
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
