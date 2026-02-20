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
  FolderOpen,
  MessageCircle,
  AlignLeft
} from 'lucide-react';
import { TextEditorStep } from '@/components/TextEditorStep';
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
type TextSubStep = 'editor' | null;

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

  // Text sub-flow state
  const [textSubStep, setTextSubStep] = useState<TextSubStep>(null);
  const [textContent, setTextContent] = useState(
    action.destination.type === 'text' ? action.destination.text : ''
  );
  const [textIsChecklist, setTextIsChecklist] = useState(
    action.destination.type === 'text' ? (action.destination.isChecklist ?? false) : false
  );

  // Back button handler for internal step navigation
  // Determine if we should intercept the back button (when not on main step)
  const shouldInterceptBack = 
    urlSubStep !== null || // In URL sub-step
    textSubStep !== null || // In Text sub-step
    step !== 'main'; // On destination or timing step

  const internalHandleBack = useCallback(() => {
    // Handle URL sub-step back
    if (urlSubStep) {
      setUrlSubStep(null);
      setUrlInput('');
      setUrlError('');
      return;
    }
    // Handle Text sub-step back
    if (textSubStep) {
      setTextSubStep(null);
      return;
    }
    // Return to main view from any sub-step
    if (step !== 'main') {
      setStep('main');
    }
  }, [urlSubStep, textSubStep, step]);

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
    setTextSubStep(null);
    setTextContent(action.destination.type === 'text' ? action.destination.text : '');
    setTextIsChecklist(action.destination.type === 'text' ? (action.destination.isChecklist ?? false) : false);
  }, [action]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const getDestinationIcon = (type: 'file' | 'url' | 'contact' | 'text', dest?: ScheduledActionDestination) => {
    switch (type) {
      case 'file': return <FileText className="h-5 w-5" />;
      case 'url': return <Link className="h-5 w-5" />;
      case 'text': return <span className="text-lg">📝</span>;
      case 'contact': 
        // Contact avatar handles its own background
        const cName = dest?.type === 'contact' ? dest.contactName : undefined;
        const cPhoto = dest?.type === 'contact' ? dest.photoUri : undefined;
        const isWA = dest?.type === 'contact' && dest.isWhatsApp;
        return (
          <ContactAvatar
            photoUri={cPhoto}
            name={cName}
            className="h-full w-full rounded-xl text-sm"
            fallbackIcon={isWA ? <MessageCircle className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
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
      case 'text': return dest.name;
    }
  };

  const getDestinationTypeLabel = (type: 'file' | 'url' | 'contact' | 'text', dest?: ScheduledActionDestination): string => {
    switch (type) {
      case 'file': return t('scheduledEditor.file');
      case 'url': return t('scheduledEditor.link');
      case 'text': return t('scheduledActions.textTitle');
      case 'contact': 
        return dest?.type === 'contact' && dest.isWhatsApp 
          ? t('scheduledEditor.whatsappMessage') 
          : t('scheduledEditor.contact');
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
    setTextSubStep(null);
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
  const handleContactSelect = async (isWhatsApp = false) => {
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
          ...(isWhatsApp && { isWhatsApp: true }),
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
    // Text editor sub-step
    if (textSubStep === 'editor') {
      return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <SheetContent side="bottom" className="h-[85vh] landscape:h-[95vh] rounded-t-3xl px-0 pb-0">
            <TextEditorStep
              showIconPicker={false}
              isReminder={true}
              initialText={textContent}
              initialIsChecklist={textIsChecklist}
              initialName={name}
              onBack={() => setTextSubStep(null)}
              onConfirm={(data) => {
                const dest: ScheduledActionDestination = {
                  type: 'text',
                  text: data.textContent,
                  name: data.name || data.textContent.split('\n')[0].replace(/^[☐☑]\s*/, '').trim().slice(0, 40) || 'Text',
                  isChecklist: data.isChecklist,
                };
                handleDestinationSelect(dest);
              }}
            />
          </SheetContent>
        </Sheet>
      );
    }

    // URL input sub-step
    if (urlSubStep === 'input') {
      return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <SheetContent side="bottom" className="h-[85vh] landscape:h-[95vh] rounded-t-3xl px-0 pb-0">
            <div className="flex flex-col h-full animate-fade-in">
              <div className="flex items-center gap-3 px-5 py-4 landscape:px-4 landscape:py-2 border-b border-border">
                <button
                  onClick={() => setUrlSubStep(null)}
                  className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                <h2 className="text-lg font-semibold">{t('scheduledEditor.enterUrl')}</h2>
              </div>

              <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4 space-y-4 landscape:space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setUrlError('');
                      }}
                      placeholder={t('scheduledActions.urlPlaceholder')}
                      className="h-12 landscape:h-10 ps-10 rounded-xl text-base"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePasteUrl}
                    className="h-12 w-12 landscape:h-10 landscape:w-10 rounded-xl shrink-0"
                  >
                    <Clipboard className="h-5 w-5" />
                  </Button>
                </div>
                
                {urlError && (
                  <p className="text-sm text-destructive">{urlError}</p>
                )}
              </div>

              <div className="p-5 landscape:p-3 border-t border-border">
                <Button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  className="w-full h-12 landscape:h-10 rounded-2xl text-base"
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
          <SheetContent side="bottom" className="h-[85vh] landscape:h-[95vh] rounded-t-3xl px-0 pb-0">
            <div className="flex flex-col h-full animate-fade-in">
              <div className="flex items-center gap-3 px-5 py-4 landscape:px-4 landscape:py-2 border-b border-border">
                <button
                  onClick={() => setUrlSubStep(null)}
                  className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                <h2 className="text-lg font-semibold">{t('scheduledEditor.changeLink')}</h2>
              </div>

              <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4">
                <div className="space-y-3 landscape:grid landscape:grid-cols-2 landscape:gap-3 landscape:space-y-0">
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
        <SheetContent side="bottom" className="h-[85vh] landscape:h-[95vh] rounded-t-3xl px-0 pb-0">
            <div className="flex flex-col h-full animate-fade-in">
              <div className="flex items-center gap-3 px-5 py-4 landscape:px-4 landscape:py-2 border-b border-border">
                <button
                  onClick={() => setStep('main')}
                  className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
                >
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                </button>
                  <h2 className="text-lg font-semibold">{t('scheduledEditor.changeDestination')}</h2>
                </div>

              <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4">
                <p className="text-sm text-muted-foreground mb-6 landscape:mb-4">
                  {t('scheduledEditor.selectDestDesc')}
              </p>

                <div className="space-y-3 landscape:grid landscape:grid-cols-3 landscape:gap-3 landscape:space-y-0">
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
                    onClick={() => handleContactSelect(false)}
                  />
                  <DestinationOption
                    icon={<MessageCircle className="h-5 w-5" />}
                    label={t('scheduledEditor.whatsappMessage')}
                    description={t('scheduledEditor.whatsappMessageDesc')}
                    onClick={() => handleContactSelect(true)}
                  />
                  <DestinationOption
                    icon={<AlignLeft className="h-5 w-5" />}
                    label={t('scheduledActions.textTitle')}
                    description={t('scheduledEditor.textDesc')}
                    onClick={() => {
                      if (destination.type === 'text') {
                        setTextContent(destination.text);
                        setTextIsChecklist(destination.isChecklist ?? false);
                      } else {
                        setTextContent('');
                        setTextIsChecklist(false);
                      }
                      setTextSubStep('editor');
                    }}
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
        <SheetContent side="bottom" className="h-[85vh] landscape:h-[95vh] rounded-t-3xl px-0 pb-0">
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
      <SheetContent side="bottom" className="h-[85vh] landscape:h-[95vh] rounded-t-3xl px-0 pb-0">
        {/* Grab handle */}
        <div className="flex justify-center pt-2 pb-4 landscape:pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-5 pb-4 landscape:px-4 landscape:pb-2 border-b border-border">
            <h2 className="text-lg font-semibold">{t('scheduledEditor.editAction')}</h2>
          </div>

          <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4 overflow-y-auto">
            <div className="space-y-6 landscape:space-y-0 landscape:grid landscape:grid-cols-2 landscape:gap-6">
              {/* Left column: Name and description */}
              <div className="space-y-6 landscape:space-y-4">
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
                    className="h-12 landscape:h-10 rounded-xl text-base"
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
              </div>

              {/* Right column: Destination and timing */}
              <div className="space-y-6 landscape:space-y-4">
                {/* Destination */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    {t('scheduledEditor.destination')}
                  </Label>
                  <button
                    onClick={() => setStep('destination')}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-xl bg-card border border-border p-4 landscape:p-3",
                      "active:scale-[0.98] transition-all",
                      "focus:outline-none focus:ring-2 focus:ring-ring"
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 landscape:h-9 landscape:w-9 items-center justify-center rounded-xl shrink-0 overflow-hidden",
                      !hasContactAvatar(destination) && "bg-primary/10 text-primary"
                    )}>
                      {getDestinationIcon(destination.type, destination)}
                    </div>
                    <div className="flex-1 min-w-0 text-start">
                      <p className="text-sm font-medium truncate">
                        {getDestinationTypeLabel(destination.type, destination)}
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
                      "w-full flex items-center gap-3 rounded-xl bg-card border border-border p-4 landscape:p-3",
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
            </div>
          </div>

          {/* Save button */}
          <div className="p-5 landscape:p-3 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="w-full h-12 landscape:h-10 rounded-2xl text-base gap-2"
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
