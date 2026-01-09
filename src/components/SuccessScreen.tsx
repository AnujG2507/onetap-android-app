import { Check, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SuccessScreenProps {
  shortcutName: string;
  onDone: () => void;
}

export function SuccessScreen({ shortcutName, onDone }: SuccessScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Check className="h-10 w-10 text-primary" />
      </div>
      
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        Shortcut Created
      </h1>
      
      <p className="text-muted-foreground mb-8">
        "{shortcutName}" has been added to your home screen
      </p>
      
      <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3 mb-8">
        <Home className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Tap the icon on your home screen to open your content instantly
        </p>
      </div>
      
      <Button onClick={onDone} variant="outline" className="w-full max-w-xs h-12">
        Create Another
      </Button>
    </div>
  );
}
