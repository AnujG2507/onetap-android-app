import { useState } from 'react';
import { ArrowLeft, ArrowRight, Globe, Instagram, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isValidUrl, parseDeepLink } from '@/lib/contentResolver';
import { cn } from '@/lib/utils';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  onBack: () => void;
}

export function UrlInput({ onSubmit, onBack }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  
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
        <div className="relative">
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
        
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
        
        {linkInfo?.isDeepLink && (
          <p className="mt-3 text-sm text-accent-foreground bg-accent rounded-lg px-3 py-2">
            Will open in {linkInfo.platform} app
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
