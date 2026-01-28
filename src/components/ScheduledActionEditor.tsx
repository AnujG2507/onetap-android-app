// Scheduled Action Editor - edit an existing scheduled action
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { ContactAvatar } from '@/components/ContactAvatar';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
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
  const { t } = useTranslation();
  const { updateAction, createScheduledAction, deleteScheduledAction } = useScheduledActions();
  const { toast } = useToast();
  
  const [step, setStep] = useState<EditorStep>('main');
  const [name, setName] = useState(action.name);
  const [description, setDescription] = useState(action.description || '');
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

  // Back button handler for internal step navigation
  // Determine if we should intercept the back button (when not on main step)
  const shouldInterceptBack = 
    urlSubStep !== null || // In URL sub-step
    step !== 'main'; // On destination or timing step

  const internalHandleBack = useCallback(() => {
    // Handle URL sub-step back
    if (urlSubStep) {
      setUrlSubStep(null);
      setUrlInput('');
      setUrlError('');
      return;
    }
    
    // Return to main view from any sub-step
    if (step !== 'main') {
      setStep('main');
    }
  }, [urlSubStep, step]);

  // Register with higher priority (20) than parent sheet (0) to intercept back button
  useSheetBackHandler(
    'scheduled-action-editor-steps',
    shouldInterceptBack && isOpen,
    internalHandleBack,
    20
  );

  // Reset state when action changes
  const resetState = useCallback(() => {
    setStep('main');
    setName(action.name);
    setDescription(action.description || '');
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

  const getDestinationIcon = (type: 'file' | 'url' | 'contact', dest?: ScheduledActionDestination) => {
    switch (type) {
      case 'file': return <FileText className="h-5 w-5" />;
      case 'url': return <Link className="h-5 w-5" />;
      case 'contact': 
        // Contact avatar handles its own background
        const contactName = dest?.type === 'contact' ? dest.contactName : undefined;
        const photoUri = dest?.type === 'contact' ? dest.photoUri : undefined;
        return (
          <ContactAvatar
            photoUri={photoUri}
            name={contactName}
            className="h-full w-full rounded-xl text-sm"
            fallbackIcon={<Phone className="h-5 w-5" />}
          />
        );
    }
  };
  
  // Helper to check if destination has contact avatar
  const hasContactAvatar = (dest?: ScheduledActionDestination) => 
    dest?.type === 'contact' && (dest.photoUri || dest.contactName);

  const getDestinationLabel = (dest: ScheduledActionDestination): string => {
    switch (dest.type) {
      case 'file': return dest.name;
      case 'url': return dest.uri;
      case 'contact': return dest.contactName;
    }
  };

  const getDestinationTypeLabel = (type: 'file' | 'url' | 'contact'): string => {
    switch (type) {
      case 'file': return t('scheduledEditor.file');
      case 'url': return t('scheduledEditor.link');
      case 'contact': return t('scheduledEditor.contact');
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
      case 'once': return t('scheduledEditor.oneTime');
      case 'daily': return t('scheduledEditor.everyDay');
      case 'weekly': return t('scheduledEditor.everyWeek');
      case 'yearly': return t('scheduledEditor.everyYear');
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
          // Store photo for display - prefer base64 for immediate use
          photoUri: result.photoBase64 || result.photoUri,
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
      setUrlError(t('scheduledActions.pleaseEnterUrl'));
      return;
    }
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    if (!isValidUrl(finalUrl)) {
      setUrlError(t('scheduledActions.pleaseEnterValidUrl'));
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
      setUrlError(t('scheduledActions.pleaseEnterValidUrl'));
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

  // Save changes - safe update pattern: create new, then delete old
  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: t('scheduledEditor.nameRequired'),
        description: t('scheduledEditor.enterName'),
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    triggerHaptic('medium');

    try {
      // Create new action first (safe pattern - old action preserved if creation fails)
      const newAction = await createScheduledAction({
        name: name.trim(),
        description: description.trim() || undefined,
        destination,
        triggerTime,
        recurrence,
        recurrenceAnchor,
      });

      if (newAction) {
        // Only delete old action after new one is successfully created
        await deleteScheduledAction(action.id);
        
        triggerHaptic('success');
        toast({
          title: t('scheduledEditor.actionUpdated'),
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
        title: t('scheduledEditor.couldNotSave'),
        description: t('scheduledActions.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Check if anything changed
  const hasChanges = 
    name !== action.name ||
    description !== (action.description || '') ||
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
                  className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                <h2 className="text-lg font-semibold">{t('scheduledEditor.enterUrl')}</h2>
              </div>

              <div className="flex-1 px-5 py-6 space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setUrlError('');
                      }}
                      placeholder="example.com"
                      className="h-12 ps-10 rounded-xl text-base"
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
                  {t('scheduledEditor.useThisUrl')}
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
                  className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                <h2 className="text-lg font-semibold">{t('scheduledEditor.changeLink')}</h2>
              </div>

              <div className="flex-1 px-5 py-6">
                <div className="space-y-3">
                  <DestinationOption
                    icon={<Globe className="h-5 w-5" />}
                    label={t('scheduledEditor.enterUrl')}
                    description={t('scheduledEditor.typeOrPaste')}
                    onClick={() => setUrlSubStep('input')}
                  />
                  <DestinationOption
                    icon={<Bookmark className="h-5 w-5" />}
                    label={t('scheduledEditor.savedBookmark')}
                    description={t('scheduledEditor.chooseFromLibrary')}
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
                  className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                  <h2 className="text-lg font-semibold">{t('scheduledEditor.changeDestination')}</h2>
                </div>

              <div className="flex-1 px-5 py-6">
                <p className="text-sm text-muted-foreground mb-6">
                  {t('scheduledEditor.selectDestDesc')}
              </p>

                <div className="space-y-3">
                  <DestinationOption
                    icon={<FileText className="h-5 w-5" />}
                    label={t('scheduledEditor.localFile')}
                    description={t('scheduledEditor.localFileDesc')}
                    onClick={handleFileSelect}
                  />
                  <DestinationOption
                    icon={<Link className="h-5 w-5" />}
                    label={t('scheduledEditor.link')}
                    description={t('scheduledEditor.linkDesc')}
                    onClick={() => setUrlSubStep('choose')}
                  />
                  <DestinationOption
                    icon={<Phone className="h-5 w-5" />}
                    label={t('scheduledEditor.contact')}
                    description={t('scheduledEditor.contactDesc')}
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
            <h2 className="text-lg font-semibold">{t('scheduledEditor.editAction')}</h2>
          </div>

          <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">
            {/* Name input */}
            <div>
              <Label htmlFor="edit-action-name" className="text-sm font-medium mb-2 block">
                {t('scheduledEditor.name')}
              </Label>
              <Input
                id="edit-action-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('scheduledEditor.actionName')}
                className="h-12 rounded-xl text-base"
              />
            </div>

            {/* Description input */}
            <div>
              <Label htmlFor="edit-action-description" className="text-sm font-medium mb-2 block">
                {t('scheduledActions.descriptionLabel')}
              </Label>
              <Textarea
                id="edit-action-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('scheduledActions.descriptionPlaceholder')}
                className="rounded-xl text-base resize-none"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-2">
                {t('scheduledActions.descriptionHint')}
              </p>
            </div>

            {/* Destination */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {t('scheduledEditor.destination')}
              </Label>
              <button
                onClick={() => setStep('destination')}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl bg-card border border-border p-4",
                  "active:scale-[0.98] transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl shrink-0 overflow-hidden",
                  !hasContactAvatar(destination) && "bg-primary/10 text-primary"
                )}>
                  {getDestinationIcon(destination.type, destination)}
                </div>
                <div className="flex-1 min-w-0 text-start">
                  <p className="text-sm font-medium truncate">
                    {getDestinationTypeLabel(destination.type)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getDestinationLabel(destination)}
                  </p>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground rotate-180 rtl:rotate-0" />
              </button>
            </div>

            {/* Timing */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {t('scheduledEditor.schedule')}
              </Label>
              <button
                onClick={() => setStep('timing')}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl bg-card border border-border p-4",
                  "active:scale-[0.98] transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                <div className="flex-1 min-w-0 text-start">
                  <p className="text-sm font-medium">
                    {formatTime(triggerTime)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRecurrenceLabel(recurrence)}
                  </p>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground rotate-180 rtl:rotate-0" />
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
              t('scheduledEditor.saving')
            ) : (
              <>
                <Check className="h-5 w-5" />
                {t('scheduledEditor.saveChanges')}
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
      <div className="text-start">
        <h3 className="font-medium text-sm">{label}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}
