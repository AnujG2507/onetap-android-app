import { useEffect, useState } from 'react';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ContentSource } from '@/types/shortcut';

// Hook to handle content shared via Android Share Sheet
export function useSharedContent() {
  const [sharedContent, setSharedContent] = useState<ContentSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkSharedContent() {
      try {
        const shared = await ShortcutPlugin.getSharedContent();
        
        if (shared?.text || shared?.data) {
          const uri = shared.text || shared.data || '';
          
          // Determine if it's a URL or file
          const isUrl = uri.startsWith('http://') || uri.startsWith('https://');
          
          setSharedContent({
            type: isUrl ? 'share' : 'file',
            uri,
            mimeType: shared.type,
          });
        }
      } catch (error) {
        console.error('Error checking shared content:', error);
      } finally {
        setIsLoading(false);
      }
    }

    checkSharedContent();
  }, []);

  const clearSharedContent = () => {
    setSharedContent(null);
  };

  return { sharedContent, isLoading, clearSharedContent };
}
