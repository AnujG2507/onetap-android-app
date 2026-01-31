import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Phone, X, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPicker } from '@/components/IconPicker';
import { ContactAvatar, getInitials } from '@/components/ContactAvatar';
import { QuickMessagesEditor } from '@/components/QuickMessagesEditor';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import type { ShortcutIcon } from '@/types/shortcut';

interface ContactData {
  name?: string;
  phoneNumber?: string;
  photoUri?: string;
  photoBase64?: string;
}

interface ContactShortcutCustomizerProps {
  mode: 'dial' | 'message';
  contact?: ContactData;
  onConfirm: (data: {
    name: string;
    icon: ShortcutIcon;
    phoneNumber: string;
    messageApp?: 'whatsapp';
    quickMessages?: string[];
  }) => void;
  onBack: () => void;
}

// WhatsApp icon SVG component
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export function ContactShortcutCustomizer({
  mode,
  contact,
  onConfirm,
  onBack,
}: ContactShortcutCustomizerProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(contact?.name || '');
  const [phoneNumber, setPhoneNumber] = useState(contact?.phoneNumber || '');
  const [isPickingContact, setIsPickingContact] = useState(false);
  const [pickedContact, setPickedContact] = useState<ContactData | null>(contact || null);
  const [contactPhoto, setContactPhoto] = useState<string | null>(contact?.photoBase64 || null);
  const [quickMessages, setQuickMessages] = useState<string[]>([]);
  const [icon, setIcon] = useState<ShortcutIcon>(() => {
    // If contact has a photo, use it as thumbnail icon
    if (contact?.photoBase64) {
      return { type: 'thumbnail', value: contact.photoBase64 };
    }
    // If contact has a name but no photo, use initials as text icon
    if (contact?.name) {
      const initials = getInitials(contact.name);
      if (initials) {
        return { type: 'text', value: initials };
      }
    }
    // Default icon based on mode
    if (mode === 'dial') {
      return { type: 'emoji', value: '📞' };
    }
    return { type: 'emoji', value: '💬' };
  });

  const handlePickContact = async () => {
    setIsPickingContact(true);
    try {
      const result = await ShortcutPlugin.pickContact();
      if (result.success && result.phoneNumber) {
        const newContact = {
          name: result.name,
          phoneNumber: result.phoneNumber,
          photoUri: result.photoUri,
          photoBase64: result.photoBase64,
        };
        setPickedContact(newContact);
        setPhoneNumber(result.phoneNumber);
        
        // Use contact photo as icon if available
        if (result.photoBase64) {
          setContactPhoto(result.photoBase64);
          setIcon({ type: 'thumbnail', value: result.photoBase64 });
        } else if (result.name) {
          // Use initials as text icon when no photo available
          const initials = getInitials(result.name);
          if (initials) {
            setIcon({ type: 'text', value: initials });
          }
        }
        
        if (result.name && !name) {
          if (mode === 'dial') {
            setName(t('contact.callName', { name: result.name }));
          } else {
            setName(t('contact.whatsappName', { name: result.name }));
          }
        }
      }
    } catch (error) {
      console.log('[ContactShortcutCustomizer] Contact picker not available');
    } finally {
      setIsPickingContact(false);
    }
  };

  // Generate default name
  useEffect(() => {
    if (!name && pickedContact?.name) {
      if (mode === 'dial') {
        setName(t('contact.callName', { name: pickedContact.name }));
      } else {
        setName(t('contact.whatsappName', { name: pickedContact.name }));
      }
    }
  }, [pickedContact?.name, mode, name, t]);

  const handleConfirm = () => {
    const shortcutName = name || (mode === 'dial' ? t('contact.call') : t('contact.whatsapp'));
    
    onConfirm({
      name: shortcutName,
      icon,
      phoneNumber,
      messageApp: mode === 'message' ? 'whatsapp' : undefined,
      quickMessages: mode === 'message' ? quickMessages : undefined,
    });
  };

  const isValid = phoneNumber.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col animate-fade-in">
      {/* Header */}
      <header className="px-5 pt-header-safe-compact pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 -ms-2 rounded-full hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">
          {mode === 'dial' ? t('contact.callShortcut') : t('contact.whatsappShortcut')}
        </h1>
      </header>

      <div className="flex-1 px-5 pb-6 landscape:px-4 landscape:pb-4 flex flex-col gap-6 landscape:gap-3 overflow-y-auto">
        <div className="landscape:grid landscape:grid-cols-2 landscape:gap-6 contents landscape:block">
          {/* Left column in landscape: Contact info, phone, name */}
          <div className="space-y-6 landscape:space-y-3 contents landscape:block">
        {/* Contact Info Display */}
        {pickedContact?.name && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30">
            <div className="h-12 w-12 rounded-full flex items-center justify-center text-2xl overflow-hidden">
              <ContactAvatar
                photoUri={contactPhoto}
                name={pickedContact.name}
                className="h-full w-full rounded-full text-base"
                fallbackIcon={mode === 'dial' 
                  ? <Phone className="h-6 w-6 text-primary" /> 
                  : <WhatsAppIcon className="h-6 w-6 text-primary" />
                }
              />
            </div>
            <div>
              <p className="font-medium text-foreground">{pickedContact.name}</p>
              <p className="text-sm text-muted-foreground">{pickedContact.phoneNumber}</p>
            </div>
          </div>
        )}

        {/* Phone Number Input with Contact Picker */}
        <div className="space-y-2">
          <Label htmlFor="phone">{t('contact.phoneNumber')}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="phone"
                type="tel"
                placeholder={t('contact.phonePlaceholder')}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="text-lg pe-10"
              />
              {phoneNumber && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneNumber('');
                    setPickedContact(null);
                    setContactPhoto(null);
                    setName('');
                    setQuickMessages([]);
                    // Reset icon to default
                    setIcon({ type: 'emoji', value: mode === 'dial' ? '📞' : '💬' });
                  }}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  aria-label={t('common.clearText')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handlePickContact}
              disabled={isPickingContact}
              className="h-12 w-12 shrink-0"
              aria-label={t('contact.pickFromContacts')}
            >
              <UserCircle2 className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Shortcut Name */}
        <div className="space-y-2">
          <Label htmlFor="name">{t('contact.accessName')}</Label>
          <div className="relative">
            <Input
              id="name"
              placeholder={mode === 'dial' ? t('contact.callPlaceholder') : t('contact.whatsappPlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pe-10"
            />
            {name && (
              <button
                type="button"
                onClick={() => setName('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                aria-label={t('common.clearText')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          </div>
          </div>

          {/* Right column in landscape: Icon Picker */}
          <div className="landscape:pt-0">
            <IconPicker
              selectedIcon={icon}
              onSelect={setIcon}
              thumbnail={contactPhoto || undefined}
            />
          </div>
        </div>

        {/* Quick Messages Editor - WhatsApp mode only (full width below grid) */}
        {mode === 'message' && (
          <QuickMessagesEditor
            messages={quickMessages}
            onChange={setQuickMessages}
          />
        )}

        {/* Spacer */}
        <div className="flex-1 min-h-4 landscape:min-h-2" />

        {/* Confirm Button */}
        <Button
          onClick={handleConfirm}
          disabled={!isValid}
          className="w-full h-14 landscape:h-10 text-lg landscape:text-base font-semibold"
          size="lg"
        >
          {t('common.continue')}
        </Button>
      </div>
    </div>
  );
}
