// Scheduled Action Creator - multi-step flow for creating a scheduled action
import { useState, useCallback, useEffect } from 'react';
import { TextEditorStep } from '@/components/TextEditorStep';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ChevronLeft, FileText, Link, Phone, Check, Clipboard, Globe, Bookmark, UserCircle2, Edit3, MessageCircle, AlignLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScheduledTimingPicker } from './ScheduledTimingPicker';
import { ContactAvatar } from '@/components/ContactAvatar';
import { PhoneNumberInput } from '@/components/PhoneNumberInput';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { useSheetBackHandler } from '@/hooks/useSheetBackHandler';
import { triggerHaptic } from '@/lib/haptics';
import { pickFile, isValidUrl, smartTruncate } from '@/lib/contentResolver';
import { useUrlMetadata } from '@/hooks/useUrlMetadata';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { SavedLinksSheet } from './SavedLinksSheet';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { useToast } from '@/hooks/use-toast';
import { parsePhone } from '@/lib/phoneUtils';
import type { 
  ScheduledActionDestination, 
  RecurrenceType, 
  RecurrenceAnchor,
  CreateScheduledActionInput 
} from '@/types/scheduledAction';

type CreatorStep = 'destination' | 'timing' | 'confirm';
type UrlSubStep = 'choose' | 'input' | null;
type ContactSubStep = 'choose' | 'manual' | 'message' | null;
type TextSubStep = 'editor' | null;

interface ScheduledActionCreatorProps {
  onComplete: () => void;
  onBack: () => void;
  // Optional: pre-selected destination (when creating from existing shortcut flow)
  initialDestination?: ScheduledActionDestination;
}

export function ScheduledActionCreator({ 
  onComplete, 
  onBack,
  initialDestination 
}: ScheduledActionCreatorProps) {
  const { t } = useTranslation();
  const { createScheduledAction, requestPermissions } = useScheduledActions();
  const { toast } = useToast();
  const [step, setStep] = useState<CreatorStep>(initialDestination ? 'timing' : 'destination');
  const [destination, setDestination] = useState<ScheduledActionDestination | null>(
    initialDestination || null
  );
  const [timing, setTiming] = useState<{
    triggerTime: number;
    recurrence: RecurrenceType;
    anchor: RecurrenceAnchor;
  } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  // URL sub-flow state
  const [urlSubStep, setUrlSubStep] = useState<UrlSubStep>(null);
  const [showBookmarkPicker, setShowBookmarkPicker] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  // Contact sub-flow state
  const [contactSubStep, setContactSubStep] = useState<ContactSubStep>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isContactPhoneValid, setIsContactPhoneValid] = useState(false);
  const [hasManuallyEditedName, setHasManuallyEditedName] = useState(false);
  // WhatsApp mode state
  const [isWhatsAppMode, setIsWhatsAppMode] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  // Text sub-flow state
  const [textSubStep, setTextSubStep] = useState<TextSubStep>(null);
  const [textContent, setTextContent] = useState('');
  const [textIsChecklist, setTextIsChecklist] = useState(false);

  // Fetch URL metadata for auto-filling name
  const urlForMetadata = destination?.type === 'url' ? destination.uri : null;
  const { metadata: urlMetadata } = useUrlMetadata(urlForMetadata);

  // Auto-update name when page title loads (if user hasn't manually edited)
  useEffect(() => {
    if (urlMetadata?.title && !hasManuallyEditedName && destination?.type === 'url') {
      const truncatedTitle = smartTruncate(urlMetadata.title, 50);
      setName(truncatedTitle);
    }
  }, [urlMetadata?.title, hasManuallyEditedName, destination?.type]);
  // Back button handler for internal step navigation
  // Determine if we should intercept the back button (when not on exit step)
  const shouldInterceptBack = 
    urlSubStep !== null || // In URL sub-step
    contactSubStep !== null || // In contact sub-step
    textSubStep !== null || // In text sub-step
    step === 'confirm' || // On confirm step
    (step === 'timing' && !initialDestination); // On timing without pre-filled destination

  const internalHandleBack = useCallback(() => {
    // Handle URL sub-step back
    if (urlSubStep) {
      setUrlSubStep(null);
      setUrlInput('');
      setUrlError('');
      return;
    }
    // Handle text sub-step back
    if (textSubStep) {
      setTextSubStep(null);
      setTextContent('');
      setTextIsChecklist(false);
      return;
    }
    // Handle contact sub-step back
    if (contactSubStep === 'message') {
      // Go back to contact choose step (contact was already picked, discard it)
      setContactSubStep('choose');
      setDestination(null);
      setWhatsappMessage('');
      return;
    }
    if (contactSubStep) {
      setContactSubStep(null);
      setContactName('');
      setContactPhone('');
      setIsContactPhoneValid(false);
      setIsWhatsAppMode(false);
      setWhatsappMessage('');
      return;
    }
    
    if (step === 'confirm') {
      setStep('timing');
    } else if (step === 'timing' && !initialDestination) {
      setStep('destination');
    }
  }, [urlSubStep, contactSubStep, textSubStep, step, initialDestination]);

  // Register with higher priority (20) than parent sheet (0) to intercept back button
  useSheetBackHandler(
    'scheduled-action-creator-steps',
    shouldInterceptBack,
    internalHandleBack,
    20
  );

  // Get suggested name based on destination
  const getSuggestedName = useCallback((dest: ScheduledActionDestination): string => {
    switch (dest.type) {
      case 'file':
        return dest.name.replace(/\.[^/.]+$/, ''); // Remove extension
      case 'url':
        return dest.name || t('scheduledActions.link');
      case 'contact':
        return dest.isWhatsApp ? t('scheduledActions.messageName', { name: dest.contactName }) : t('scheduledActions.callName_reminder', { name: dest.contactName });
      case 'text': {
        const firstLine = dest.text.split('\n')[0].replace(/^[☐☑]\s*/, '').trim();
        return firstLine.slice(0, 40) || t('scheduledActions.textTitle');
      }
    }
  }, [t]);

  const handleDestinationSelect = (dest: ScheduledActionDestination) => {
    setDestination(dest);
    setName(getSuggestedName(dest));
    // Reset sub-step states
    setUrlSubStep(null);
    setUrlInput('');
    setUrlError('');
    setContactSubStep(null);
    setContactName('');
    setContactPhone('');
    setIsContactPhoneValid(false);
    setIsWhatsAppMode(false);
    setWhatsappMessage('');
    setStep('timing');
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

  // Contact picker handler - picks from device contacts
  const handlePickContact = async () => {
    triggerHaptic('light');
    try {
      const result = await ShortcutPlugin.pickContact();
      if (result.success && result.phoneNumber) {
        // Parse the phone number to get E.164 format
        const parsed = parsePhone(result.phoneNumber);
        const normalizedPhone = parsed?.e164 || result.phoneNumber;
        
        const dest: ScheduledActionDestination = {
          type: 'contact',
          phoneNumber: normalizedPhone,
          contactName: result.name || 'Contact',
          photoUri: result.photoBase64 || result.photoUri,
          ...(isWhatsAppMode && { isWhatsApp: true }),
        };
        
        if (isWhatsAppMode) {
          // Store contact temporarily and show message step
          setDestination(dest);
          setContactSubStep('message');
        } else {
          handleDestinationSelect(dest);
        }
      }
    } catch (error) {
      console.warn('Contact picker failed:', error);
    }
  };

  // Manual contact submit handler
  const handleManualContactSubmit = () => {
    if (!contactPhone || !isContactPhoneValid) return;
    
    const dest: ScheduledActionDestination = {
      type: 'contact',
      phoneNumber: contactPhone,
      contactName: contactName.trim() || 'Contact',
      ...(isWhatsAppMode && { isWhatsApp: true }),
    };
    
    if (isWhatsAppMode) {
      setDestination(dest);
      setContactSubStep('message');
    } else {
      handleDestinationSelect(dest);
    }
  };

  // WhatsApp message step - continue to timing with optional message
  const handleWhatsAppMessageContinue = () => {
    if (!destination || destination.type !== 'contact') return;
    const finalDest: ScheduledActionDestination = {
      ...destination,
      quickMessage: whatsappMessage.trim() || undefined,
    };
    handleDestinationSelect(finalDest);
  };

  // URL flow handlers
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

  const handleBookmarkSelect = (url: string, title?: string) => {
    setShowBookmarkPicker(false);
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      handleDestinationSelect({
        type: 'url',
        uri: url,
        name: title || hostname,
      });
    } catch {
      handleDestinationSelect({
        type: 'url',
        uri: url,
        name: title || 'Link',
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

  const handleTimingConfirm = (
    triggerTime: number, 
    recurrence: RecurrenceType, 
    anchor: RecurrenceAnchor
  ) => {
    setTiming({ triggerTime, recurrence, anchor });
    setStep('confirm');
  };

  const handleCreate = async () => {
    if (!destination || !timing) return;

    setIsCreating(true);
    triggerHaptic('medium');

    try {
      // Request permissions if needed
      const permissions = await requestPermissions();
      if (!permissions.notifications) {
        console.warn('Notification permission not granted');
        // Continue anyway - user can still use the feature
      }

      // Proactively request battery optimization exemption if not already granted
      try {
        const batteryStatus = await ShortcutPlugin.checkBatteryOptimization();
        if (!batteryStatus.exempted) {
          await ShortcutPlugin.requestBatteryOptimization();
        }
      } catch (e) {
        console.log('Battery optimization check skipped:', e);
      }

      const input: CreateScheduledActionInput = {
        name: name.trim() || getSuggestedName(destination),
        description: description.trim() || undefined,
        destination,
        triggerTime: timing.triggerTime,
        recurrence: timing.recurrence,
        recurrenceAnchor: timing.anchor,
      };

      const action = await createScheduledAction(input);
      
      if (action) {
        triggerHaptic('success');
        
        // Show success toast with scheduled time
        const scheduledDate = new Date(timing.triggerTime);
        const timeStr = scheduledDate.toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        
        toast({
          title: t('scheduledActions.actionScheduled'),
          description: `${name.trim() || getSuggestedName(destination)} — ${timeStr}`,
        });
        
        onComplete();
      } else {
        triggerHaptic('warning');
        toast({
          title: t('scheduledActions.couldNotSchedule'),
          description: t('scheduledActions.tryAgain'),
          variant: 'destructive',
        });
        setIsCreating(false);
      }
    } catch (error) {
      console.error('Error creating scheduled action:', error);
      triggerHaptic('warning');
      toast({
        title: t('errors.somethingWentWrong'),
        description: t('scheduledActions.couldNotScheduleDesc'),
        variant: 'destructive',
      });
      setIsCreating(false);
    }
  };

  const handleBack = () => {
    // Handle URL sub-step back
    if (urlSubStep) {
      setUrlSubStep(null);
      setUrlInput('');
      setUrlError('');
      return;
    }
    // Handle contact sub-step back
    if (contactSubStep === 'message') {
      setContactSubStep('choose');
      setDestination(null);
      setWhatsappMessage('');
      return;
    }
    if (contactSubStep) {
      setContactSubStep(null);
      setContactName('');
      setContactPhone('');
      setIsContactPhoneValid(false);
      setIsWhatsAppMode(false);
      setWhatsappMessage('');
      return;
    }
    
    switch (step) {
      case 'destination':
        onBack();
        break;
      case 'timing':
        if (initialDestination) {
          onBack();
        } else {
          setStep('destination');
        }
        break;
      case 'confirm':
        setStep('timing');
        break;
    }
  };

  const getDestinationIcon = (type: 'file' | 'url' | 'contact' | 'text', dest?: ScheduledActionDestination) => {
    switch (type) {
      case 'file': return <FileText className="h-5 w-5" />;
      case 'url': return <Link className="h-5 w-5" />;
      case 'text': return <span className="text-lg">📝</span>;
      case 'contact': 
        // Contact avatar handles its own background
        const cName = dest?.type === 'contact' ? dest.contactName : undefined;
        const photoUri = dest?.type === 'contact' ? dest.photoUri : undefined;
        const isWA = dest?.type === 'contact' && dest.isWhatsApp;
        return (
          <ContactAvatar
            photoUri={photoUri}
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

  // Step: Select destination type
  if (step === 'destination') {
    // Text sub-step: text editor
    if (textSubStep === 'editor') {
      return (
        <TextEditorStep
          showIconPicker={false}
          isReminder={true}
          initialText={textContent}
          initialIsChecklist={textIsChecklist}
          onBack={() => setTextSubStep(null)}
          onConfirm={(data) => {
            const dest: ScheduledActionDestination = {
              type: 'text',
              text: data.textContent,
              name: data.name || data.textContent.split('\n')[0].replace(/^[☐☑]\s*/, '').trim().slice(0, 40) || t('scheduledActions.textTitle'),
              isChecklist: data.isChecklist,
            };
            handleDestinationSelect(dest);
          }}
        />
      );
    }
    // URL sub-step: Input URL
    if (urlSubStep === 'input') {
      return (
        <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border">
            <button
              onClick={handleBack}
              className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
            <h2 className="text-lg font-semibold">{t('scheduledActions.enterUrl')}</h2>
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
              {t('common.continue')}
            </Button>
          </div>
        </div>
      );
    }

    // URL sub-step: Choose URL source
    if (urlSubStep === 'choose') {
      return (
        <div className="flex flex-col h-full animate-fade-in">
          <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border">
            <button
              onClick={handleBack}
              className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
            <h2 className="text-lg font-semibold">{t('scheduledActions.addLink')}</h2>
          </div>

          <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4">
            <div className="space-y-3 landscape:grid landscape:grid-cols-2 landscape:gap-3 landscape:space-y-0">
              <DestinationOption
                icon={<Globe className="h-5 w-5" />}
                label={t('scheduledActions.enterUrl')}
                description={t('scheduledActions.typeOrPaste')}
                onClick={() => setUrlSubStep('input')}
              />
              <DestinationOption
                icon={<Bookmark className="h-5 w-5" />}
                label={t('scheduledActions.savedBookmark')}
                description={t('scheduledActions.chooseFromLibrary')}
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
      );
    }

    // Contact sub-step: Manual phone entry
    if (contactSubStep === 'manual') {
      return (
        <div className="flex flex-col h-full animate-fade-in">
          <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border">
            <button
              onClick={handleBack}
              className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
            <h2 className="text-lg font-semibold">{t('contact.enterManually')}</h2>
          </div>

          <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4 space-y-4 landscape:space-y-3">
            {/* Contact Name (optional) */}
            <div className="space-y-2">
              <Label>{t('contact.contactName')}</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={t('contact.namePlaceholder')}
                className="h-12 landscape:h-10 rounded-xl text-base"
              />
            </div>

            {/* Phone Number with Country Picker */}
            <div className="space-y-2">
              <Label>{t('contact.phoneNumber')}</Label>
              <PhoneNumberInput
                value={contactPhone}
                onChange={(e164, valid) => {
                  setContactPhone(e164);
                  setIsContactPhoneValid(valid);
                }}
              />
            </div>
          </div>

          <div className="p-5 landscape:p-3 border-t border-border">
            <Button
              onClick={handleManualContactSubmit}
              disabled={!contactPhone || !isContactPhoneValid}
              className="w-full h-12 landscape:h-10 rounded-2xl text-base"
            >
              {t('common.continue')}
            </Button>
          </div>
        </div>
      );
    }

    // Contact sub-step: WhatsApp message prefill
    if (contactSubStep === 'message' && isWhatsAppMode && destination?.type === 'contact') {
      return (
        <div className="flex flex-col h-full animate-fade-in">
          <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border">
            <button
              onClick={handleBack}
              className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
            <h2 className="text-lg font-semibold">{t('scheduledActions.whatsappMessage')}</h2>
          </div>

          <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4 space-y-4 landscape:space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <ContactAvatar
                photoUri={destination.photoUri}
                name={destination.contactName}
                className="h-10 w-10 rounded-xl text-sm"
                fallbackIcon={<MessageCircle className="h-5 w-5" />}
              />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{destination.contactName}</p>
                <p className="text-xs text-muted-foreground truncate">{destination.phoneNumber}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('scheduledActions.optionalMessage')}</Label>
              <Textarea
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder={t('scheduledActions.optionalMessagePlaceholder')}
                className="rounded-xl text-base resize-none"
                rows={3}
                autoFocus
              />
            </div>
          </div>

          <div className="p-5 landscape:p-3 border-t border-border">
            <Button
              onClick={handleWhatsAppMessageContinue}
              className="w-full h-12 landscape:h-10 rounded-2xl text-base"
            >
              {t('common.continue')}
            </Button>
          </div>
        </div>
      );
    }

    // Contact sub-step: Choose contact source
    if (contactSubStep === 'choose') {
      return (
        <div className="flex flex-col h-full animate-fade-in">
          <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border">
            <button
              onClick={handleBack}
              className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
            <h2 className="text-lg font-semibold">{t('contact.addContact')}</h2>
          </div>

          <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4">
            <div className="space-y-3 landscape:grid landscape:grid-cols-2 landscape:gap-3 landscape:space-y-0">
              <DestinationOption
                icon={<UserCircle2 className="h-5 w-5" />}
                label={t('contact.pickFromContacts')}
                description={t('contact.pickFromContactsDesc')}
                onClick={handlePickContact}
              />
              <DestinationOption
                icon={<Edit3 className="h-5 w-5" />}
                label={t('contact.enterManually')}
                description={t('contact.enterManuallyDesc')}
                onClick={() => setContactSubStep('manual')}
              />
            </div>
          </div>
        </div>
      );
    }

    // Main destination selection
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border">
          <button
            onClick={handleBack}
            className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h2 className="text-lg font-semibold">{t('scheduledActions.whatToOpen')}</h2>
        </div>

        <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4">
          <p className="text-sm text-muted-foreground mb-6 landscape:mb-4">
            {t('scheduledActions.selectDescription')}
          </p>

          <div className="space-y-3 landscape:grid landscape:grid-cols-3 landscape:gap-3 landscape:space-y-0">
            <DestinationOption
              icon={<FileText className="h-5 w-5" />}
              label={t('scheduledActions.localFile')}
              description={t('scheduledActions.localFileDesc')}
              onClick={handleFileSelect}
            />
            <DestinationOption
              icon={<Link className="h-5 w-5" />}
              label={t('scheduledActions.link')}
              description={t('scheduledActions.linkDesc')}
              onClick={() => setUrlSubStep('choose')}
            />
            <DestinationOption
              icon={<Phone className="h-5 w-5" />}
              label={t('scheduledActions.contact')}
              description={t('scheduledActions.contactDesc')}
              onClick={() => setContactSubStep('choose')}
            />
            <DestinationOption
              icon={<MessageCircle className="h-5 w-5" />}
              label={t('scheduledActions.whatsappMessage')}
              description={t('scheduledActions.whatsappMessageDesc')}
              onClick={() => {
                setIsWhatsAppMode(true);
                setContactSubStep('choose');
              }}
            />
            <DestinationOption
              icon={<AlignLeft className="h-5 w-5" />}
              label={t('scheduledActions.textTitle')}
              description={t('scheduledActions.textDesc')}
              onClick={() => setTextSubStep('editor')}
            />
          </div>
        </div>
      </div>
    );
  }

  // Step: Select timing
  if (step === 'timing') {
    return (
      <ScheduledTimingPicker
        onConfirm={handleTimingConfirm}
        onBack={handleBack}
        suggestedRecurrence={
          destination?.type === 'contact' ? 'yearly' : 'once'
        }
      />
    );
  }

  // Step: Confirm and name
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border">
        <button
          onClick={handleBack}
          className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <h2 className="text-lg font-semibold">{t('scheduledActions.nameAction')}</h2>
      </div>

      <div className="flex-1 px-5 py-6 landscape:px-4 landscape:py-4 overflow-y-auto">
        <div className="space-y-6 landscape:space-y-0 landscape:grid landscape:grid-cols-2 landscape:gap-6">
          {/* Left column: Name and description inputs */}
          <div className="space-y-6 landscape:space-y-4">
            {/* Name input */}
            <div>
              <Label htmlFor="action-name" className="text-sm font-medium mb-2 block">
                {t('scheduledActions.actionName')}
              </Label>
              <Input
                id="action-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setHasManuallyEditedName(true); }}
                placeholder={destination ? getSuggestedName(destination) : t('scheduledActions.myAction')}
                className="h-12 landscape:h-10 rounded-xl text-base"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2">
                {t('scheduledActions.actionNameHint')}
              </p>
            </div>

            {/* Description input */}
            <div>
              <Label htmlFor="action-description" className="text-sm font-medium mb-2 block">
                {t('scheduledActions.descriptionLabel')}
              </Label>
              <Textarea
                id="action-description"
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

          {/* Right column: Preview card */}
          <div className="landscape:pt-0">
            {destination && timing && (
              <div className="rounded-2xl bg-card border border-border p-4 landscape:p-3">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "flex h-10 w-10 landscape:h-9 landscape:w-9 items-center justify-center rounded-xl shrink-0 overflow-hidden",
                    !hasContactAvatar(destination) && "bg-primary/10 text-primary"
                  )}>
                    {getDestinationIcon(destination.type, destination)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">
                      {name || getSuggestedName(destination)}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5 break-all line-clamp-2">
                      {destination.type === 'file' && destination.name}
                      {destination.type === 'url' && destination.uri}
                      {destination.type === 'contact' && destination.contactName}
                    </p>
                    <p className="text-xs text-primary mt-1.5 break-words">
                      {new Date(timing.triggerTime).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                      {timing.recurrence !== 'once' && ` · ${t('scheduledActions.repeats', { frequency: timing.recurrence })}`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create button */}
      <div className="p-5 landscape:p-3 border-t border-border">
        <Button 
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full h-12 landscape:h-10 rounded-2xl text-base gap-2"
        >
          {isCreating ? (
            t('scheduledActions.scheduling')
          ) : (
            <>
              <Check className="h-5 w-5" />
              {t('scheduledActions.scheduleAction')}
            </>
          )}
        </Button>
      </div>
    </div>
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
