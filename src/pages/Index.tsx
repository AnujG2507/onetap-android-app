import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ContentSourcePicker } from '@/components/ContentSourcePicker';
import { UrlInput } from '@/components/UrlInput';
import { ShortcutCustomizer } from '@/components/ShortcutCustomizer';
import { SuccessScreen } from '@/components/SuccessScreen';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useBackButton } from '@/hooks/useBackButton';
import { pickFile } from '@/lib/contentResolver';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import type { ContentSource, ShortcutIcon } from '@/types/shortcut';

type Step = 'source' | 'url' | 'customize' | 'success';

const Index = () => {
  const [step, setStep] = useState<Step>('source');
  const [contentSource, setContentSource] = useState<ContentSource | null>(null);
  const [lastCreatedName, setLastCreatedName] = useState('');
  
  const { createShortcut } = useShortcuts();

  // Handle Android back button
  useBackButton({
    isHomeScreen: step === 'source',
    onBack: () => {
      console.log('[Index] Back button triggered, current step:', step);
      if (step === 'url') {
        setStep('source');
      } else if (step === 'customize') {
        if (contentSource?.type === 'url') {
          setStep('url');
        } else {
          setStep('source');
        }
      } else if (step === 'success') {
        setStep('source');
        setContentSource(null);
        setLastCreatedName('');
      }
    }
  });

  const handleSelectFile = async () => {
    const file = await pickFile();
    if (file) {
      setContentSource(file);
      setStep('customize');
    }
  };

  const handleSelectUrl = () => {
    setStep('url');
  };

  const handleUrlSubmit = (url: string) => {
    setContentSource({
      type: 'url',
      uri: url,
    });
    setStep('customize');
  };

  const handleConfirm = async (name: string, icon: ShortcutIcon) => {
    if (!contentSource) return;
    
    const shortcut = createShortcut(contentSource, name, icon);
    await createHomeScreenShortcut(shortcut);
    
    setLastCreatedName(name);
    setStep('success');
  };

  const handleReset = () => {
    setStep('source');
    setContentSource(null);
    setLastCreatedName('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {step === 'source' && (
        <>
          <header className="p-4 pt-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                <Plus className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">OneTap</h1>
            </div>
            <p className="text-muted-foreground mt-2">
              Create shortcuts to your files and links
            </p>
          </header>
          <ContentSourcePicker
            onSelectFile={handleSelectFile}
            onSelectUrl={handleSelectUrl}
          />
        </>
      )}
      
      {step === 'url' && (
        <UrlInput
          onSubmit={handleUrlSubmit}
          onBack={() => setStep('source')}
        />
      )}
      
      {step === 'customize' && contentSource && (
        <ShortcutCustomizer
          source={contentSource}
          onConfirm={handleConfirm}
          onBack={() => {
            if (contentSource.type === 'url') {
              setStep('url');
            } else {
              setStep('source');
            }
          }}
        />
      )}
      
      {step === 'success' && (
        <SuccessScreen
          shortcutName={lastCreatedName}
          onDone={handleReset}
        />
      )}
    </div>
  );
};

export default Index;
