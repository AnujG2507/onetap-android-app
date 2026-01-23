// Scheduled Action Editor - edit an existing scheduled action
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { 
  ChevronLeft, 
  FileText, 
  Link, 
  Phone, 
  Check, 
  Clipboard, 
  Globe, 
  Bookmark,
  FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScheduledTimingPicker } from './ScheduledTimingPicker';
import { SavedLinksSheet } from './SavedLinksSheet';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { triggerHaptic } from '@/lib/haptics';
import { pickFile, isValidUrl } from '@/lib/contentResolver';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { useToast } from '@/hooks/use-toast';
import type { 
  ScheduledAction,
  ScheduledActionDestination, 
  RecurrenceType, 
  RecurrenceAnchor 
} from '@/types/scheduledAction';

type EditorStep = 'main' | 'destination' | 'timing';
type UrlSubStep = 'choose' | 'input' | null;

interface ScheduledActionEditorProps {
  action: ScheduledAction;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduledActionEditor({ 
  action,
  isOpen, 
  onClose, 
  onSaved 
}: ScheduledActionEditorProps) {
  const { updateAction, createScheduledAction, deleteScheduledAction } = useScheduledActions();
  const { toast } = useToast();
  
  const [step, setStep] = useState<EditorStep>('main');
  const [name, setName] = useState(action.name);
  const [destination, setDestination] = useState<ScheduledActionDestination>(action.destination);
  const [triggerTime, setTriggerTime] = useState(action.triggerTime);
  const [recurrence, setRecurrence] = useState<RecurrenceType>(action.recurrence);
  const [recurrenceAnchor, setRecurrenceAnchor] = useState<RecurrenceAnchor | undefined>(action.recurrenceAnchor);
  const [isSaving, setIsSaving] = useState(false);

  // URL sub-flow state
  const [urlSubStep, setUrlSubStep] = useState<UrlSubStep>(null);
  const [showBookmarkPicker, setShowBookmarkPicker] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

  // Reset state when action changes
  const resetState = useCallback(() => {
    setStep('main');
    setName(action.name);
    setDestination(action.destination);
    setTriggerTime(action.triggerTime);
    setRecurrence(action.recurrence);
    setRecurrenceAnchor(action.recurrenceAnchor);
    setUrlSubStep(null);
    setUrlInput('');
    setUrlError('');
  }, [action]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const getDestinationIcon = (type: 'file' | 'url' | 'contact') => {
    switch (type) {
      case 'file': return <FileText className="h-5 w-5" />;
      case 'url': return <Link className="h-5 w-5" />;
      case 'contact': return <Phone className="h-5 w-5" />;
    }
  };

  const getDestinationLabel = (dest: ScheduledActionDestination): string => {
    switch (dest.type) {
      case 'file': return dest.name;
      case 'url': return dest.uri;
      case 'contact': return dest.contactName;
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatRecurrenceLabel = (rec: RecurrenceType): string => {
    switch (rec) {
      case 'once': return 'One time';
      case 'daily': return 'Every day';
      case 'weekly': return 'Every week';
      case 'yearly': return 'Every year';
    }
  };

  // Handle destination change
  const handleDestinationSelect = (dest: ScheduledActionDestination) => {
    setDestination(dest);
    setUrlSubStep(null);
    setUrlInput('');
    setUrlError('');
    setStep('main');
    triggerHaptic('success');
  };

  // File picker handler
  const handleFileSelect = async () => {
    triggerHaptic('light');
    const file = await pickFile('all');
    if (file) {
      handleDestinationSelect({
        type: 'file',
        uri: file.uri,
        name: file.name || 'File',
        mimeType: file.mimeType,
      });
    }
  };

  // Contact picker handler
  const handleContactSelect = async () => {
    triggerHaptic('light');
    try {
      const result = await ShortcutPlugin.pickContact();
      if (result.success && result.phoneNumber) {
        handleDestinationSelect({
          type: 'contact',
          phoneNumber: result.phoneNumber,
          contactName: result.name || 'Contact',
        });
      }
    } catch (error) {
      console.warn('Contact picker failed:', error);
    }
  };

  // URL handlers
  const handleUrlSubmit = () => {
    let finalUrl = urlInput.trim();
    if (!finalUrl) {
      setUrlError('Please enter a URL');
      return;
    }
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    if (!isValidUrl(finalUrl)) {
      setUrlError('Please enter a valid URL');
      return;
    }
    try {
      const hostname = new URL(finalUrl).hostname.replace('www.', '');
      handleDestinationSelect({
        type: 'url',
        uri: finalUrl,
        name: hostname,
      });
    } catch {
      setUrlError('Please enter a valid URL');
    }
  };

  const handleBookmarkSelect = (url: string) => {
    setShowBookmarkPicker(false);
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      handleDestinationSelect({
        type: 'url',
        uri: url,
        name: hostname,
      });
    } catch {
      handleDestinationSelect({
        type: 'url',
        uri: url,
        name: 'Link',
      });
    }
  };

  const handlePasteUrl = async () => {
    triggerHaptic('light');
    try {
      const { value } = await CapClipboard.read();
      if (value) {
        setUrlInput(value);
        setUrlError('');
      }
    } catch {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrlInput(text);
          setUrlError('');
        }
      } catch {
        console.warn('Clipboard not available');
      }
    }
  };

  // Handle timing change
  const handleTimingConfirm = (
    newTriggerTime: number,
    newRecurrence: RecurrenceType,
    newAnchor: RecurrenceAnchor
  ) => {
    setTriggerTime(newTriggerTime);
    setRecurrence(newRecurrence);
    setRecurrenceAnchor(newAnchor);
    setStep('main');
    triggerHaptic('success');
  };

  // Save changes
  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for this action.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    triggerHaptic('medium');

    try {
      // Delete old action and create new one with updated values
      // This ensures native scheduling is properly updated
      await deleteScheduledAction(action.id);
      
      const newAction = await createScheduledAction({
        name: name.trim(),
        destination,
        triggerTime,
        recurrence,
        recurrenceAnchor,
      });

      if (newAction) {
        triggerHaptic('success');
        toast({
          title: '✓ Action updated',
          description: `${name.trim()} — ${formatTime(triggerTime)}`,
        });
        onSaved();
        handleClose();
      } else {
        throw new Error('Failed to save action');
      }
    } catch (error) {
      console.error('Error saving scheduled action:', error);
      triggerHaptic('warning');
      toast({
        title: 'Could not save',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Check if anything changed
  const hasChanges = 
    name !== action.name ||
    JSON.stringify(destination) !== JSON.stringify(action.destination) ||
    triggerTime !== action.triggerTime ||
    recurrence !== action.recurrence;

  // Render destination step
  if (step === 'destination') {
    // URL input sub-step
    if (urlSubStep === 'input') {
      return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-0 pb-0">
            <div className="flex flex-col h-full animate-fade-in">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                <button
                  onClick={() => setUrlSubStep(null)}
                  className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-semibold">Enter URL</h2>
              </div>

              <div className="flex-1 px-5 py-6 space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setUrlError('');
                      }}
                      placeholder="example.com"
                      className="h-12 pl-10 rounded-xl text-base"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePasteUrl}
                    className="h-12 w-12 rounded-xl shrink-0"
                  >
                    <Clipboard className="h-5 w-5" />
                  </Button>
                </div>
                
                {urlError && (
                  <p className="text-sm text-destructive">{urlError}</p>
                )}
              </div>

              <div className="p-5 border-t border-border">
                <Button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  className="w-full h-12 rounded-2xl text-base"
                >
                  Use this URL
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    // URL source chooser
    if (urlSubStep === 'choose') {
      return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-0 pb-0">
            <div className="flex flex-col h-full animate-fade-in">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                <button
                  onClick={() => setUrlSubStep(null)}
                  className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-semibold">Change link</h2>
              </div>

              <div className="flex-1 px-5 py-6">
                <div className="space-y-3">
                  <DestinationOption
                    icon={<Globe className="h-5 w-5" />}
                    label="Enter URL"
                    description="Type or paste a link"
                    onClick={() => setUrlSubStep('input')}
                  />
                  <DestinationOption
                    icon={<Bookmark className="h-5 w-5" />}
                    label="Saved Bookmark"
                    description="Choose from your library"
                    onClick={() => setShowBookmarkPicker(true)}
                  />
                </div>
              </div>

              <SavedLinksSheet
                open={showBookmarkPicker}
                onOpenChange={setShowBookmarkPicker}
                onSelectLink={handleBookmarkSelect}
              />
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    // Main destination selection
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-0 pb-0">
          <div className="flex flex-col h-full animate-fade-in">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <button
                onClick={() => setStep('main')}
                className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h2 className="text-lg font-semibold">Change destination</h2>
            </div>

            <div className="flex-1 px-5 py-6">
              <p className="text-sm text-muted-foreground mb-6">
                Select what should open when this action triggers.
              </p>

              <div className="space-y-3">
                <DestinationOption
                  icon={<FileText className="h-5 w-5" />}
                  label="Local File"
                  description="Photo, video, PDF, or document"
                  onClick={handleFileSelect}
                />
                <DestinationOption
                  icon={<Link className="h-5 w-5" />}
                  label="Link"
                  description="Website or saved bookmark"
                  onClick={() => setUrlSubStep('choose')}
                />
                <DestinationOption
                  icon={<Phone className="h-5 w-5" />}
                  label="Contact"
                  description="Call someone at a scheduled time"
                  onClick={handleContactSelect}
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Render timing step
  if (step === 'timing') {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-0 pb-0">
          <ScheduledTimingPicker
            onConfirm={handleTimingConfirm}
            onBack={() => setStep('main')}
            initialTime={triggerTime}
            initialRecurrence={recurrence}
            initialAnchor={recurrenceAnchor}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // Main editor view
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-0 pb-0">
        {/* Grab handle */}
        <div className="flex justify-center pt-2 pb-4">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-5 pb-4 border-b border-border">
            <h2 className="text-lg font-semibold">Edit Action</h2>
          </div>

          <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">
            {/* Name input */}
            <div>
              <Label htmlFor="edit-action-name" className="text-sm font-medium mb-2 block">
                Name
              </Label>
              <Input
                id="edit-action-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Action name"
                className="h-12 rounded-xl text-base"
              />
            </div>

            {/* Destination */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Destination
              </Label>
              <button
                onClick={() => setStep('destination')}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl bg-card border border-border p-4",
                  "active:scale-[0.98] transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  {getDestinationIcon(destination.type)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">
                    {destination.type === 'file' ? 'File' : destination.type === 'url' ? 'Link' : 'Contact'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getDestinationLabel(destination)}
                  </p>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground rotate-180" />
              </button>
            </div>

            {/* Timing */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Schedule
              </Label>
              <button
                onClick={() => setStep('timing')}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl bg-card border border-border p-4",
                  "active:scale-[0.98] transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium">
                    {formatTime(triggerTime)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRecurrenceLabel(recurrence)}
                  </p>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground rotate-180" />
              </button>
            </div>
          </div>

          {/* Save button */}
          <div className="p-5 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="w-full h-12 rounded-2xl text-base gap-2"
            >
              {isSaving ? (
                'Saving...'
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Destination option button
function DestinationOption({ 
  icon, 
  label, 
  description, 
  onClick 
}: { 
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 rounded-2xl bg-card border border-border p-4",
        "active:scale-[0.98] transition-all",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div className="text-left">
        <h3 className="font-medium text-sm">{label}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}
