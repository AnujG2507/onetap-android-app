import { useState, useEffect } from 'react';
import { ArrowLeft, Phone, MessageCircle, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPicker } from '@/components/IconPicker';
import type { ShortcutIcon, MessageApp } from '@/types/shortcut';

interface ContactData {
  name?: string;
  phoneNumber?: string;
  photoUri?: string;
}

interface ContactShortcutCustomizerProps {
  mode: 'dial' | 'message';
  contact?: ContactData;
  onConfirm: (data: {
    name: string;
    icon: ShortcutIcon;
    phoneNumber: string;
    messageApp?: MessageApp;
    slackTeamId?: string;
    slackUserId?: string;
  }) => void;
  onBack: () => void;
}

const MESSAGE_APPS: { id: MessageApp; label: string; icon: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'telegram', label: 'Telegram', icon: '✈️' },
  { id: 'signal', label: 'Signal', icon: '🔒' },
  { id: 'slack', label: 'Slack', icon: '💼' },
];

export function ContactShortcutCustomizer({
  mode,
  contact,
  onConfirm,
  onBack,
}: ContactShortcutCustomizerProps) {
  const [name, setName] = useState(contact?.name || '');
  const [phoneNumber, setPhoneNumber] = useState(contact?.phoneNumber || '');
  const [selectedApp, setSelectedApp] = useState<MessageApp>('whatsapp');
  const [slackTeamId, setSlackTeamId] = useState('');
  const [slackUserId, setSlackUserId] = useState('');
  const [icon, setIcon] = useState<ShortcutIcon>(() => {
    // Default icon based on mode
    if (mode === 'dial') {
      return { type: 'emoji', value: '📞' };
    }
    return { type: 'emoji', value: '💬' };
  });

  // Update icon when app changes
  useEffect(() => {
    if (mode === 'message') {
      const app = MESSAGE_APPS.find(a => a.id === selectedApp);
      if (app) {
        setIcon({ type: 'emoji', value: app.icon });
      }
    }
  }, [selectedApp, mode]);

  // Generate default name
  useEffect(() => {
    if (!name && contact?.name) {
      if (mode === 'dial') {
        setName(`Call ${contact.name}`);
      } else {
        const app = MESSAGE_APPS.find(a => a.id === selectedApp);
        setName(`${app?.label || 'Message'} ${contact.name}`);
      }
    }
  }, [contact?.name, mode, selectedApp, name]);

  const handleConfirm = () => {
    const shortcutName = name || (mode === 'dial' ? 'Call' : 'Message');
    
    onConfirm({
      name: shortcutName,
      icon,
      phoneNumber,
      messageApp: mode === 'message' ? selectedApp : undefined,
      slackTeamId: selectedApp === 'slack' ? slackTeamId : undefined,
      slackUserId: selectedApp === 'slack' ? slackUserId : undefined,
    });
  };

  const isValid = phoneNumber.length > 0 || (selectedApp === 'slack' && slackUserId && slackTeamId);

  return (
    <div className="min-h-screen bg-background flex flex-col animate-fade-in">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">
          {mode === 'dial' ? 'Call Shortcut' : 'Message Shortcut'}
        </h1>
      </header>

      <div className="flex-1 px-5 pb-6 flex flex-col gap-6 overflow-y-auto">
        {/* Contact Info Display */}
        {contact?.name && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl">
              {mode === 'dial' ? <Phone className="h-6 w-6 text-primary" /> : <MessageCircle className="h-6 w-6 text-primary" />}
            </div>
            <div>
              <p className="font-medium text-foreground">{contact.name}</p>
              <p className="text-sm text-muted-foreground">{contact.phoneNumber}</p>
            </div>
          </div>
        )}

        {/* Phone Number Input (if no contact) */}
        {!contact?.phoneNumber && selectedApp !== 'slack' && (
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 234 567 8900"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="text-lg"
            />
          </div>
        )}

        {/* Message App Selector */}
        {mode === 'message' && (
          <div className="space-y-3">
            <Label>Messaging App</Label>
            <div className="grid grid-cols-2 gap-3">
              {MESSAGE_APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(app.id)}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border-2 transition-all",
                    selectedApp === app.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/40 hover:bg-muted/60"
                  )}
                >
                  <span className="text-2xl">{app.icon}</span>
                  <span className="font-medium text-foreground">{app.label}</span>
                  {selectedApp === app.id && (
                    <Check className="h-4 w-4 text-primary ml-auto" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Slack-specific fields */}
        {mode === 'message' && selectedApp === 'slack' && (
          <div className="space-y-4 p-4 rounded-xl bg-muted/20">
            <p className="text-sm text-muted-foreground">
              Slack requires Team ID and User ID for direct messages.
            </p>
            <div className="space-y-2">
              <Label htmlFor="slackTeam">Team ID</Label>
              <Input
                id="slackTeam"
                placeholder="T0123456789"
                value={slackTeamId}
                onChange={(e) => setSlackTeamId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slackUser">User ID</Label>
              <Input
                id="slackUser"
                placeholder="U0123456789"
                value={slackUserId}
                onChange={(e) => setSlackUserId(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Shortcut Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Shortcut Name</Label>
          <div className="relative">
            <Input
              id="name"
              placeholder={mode === 'dial' ? 'Call Mom' : 'Message Team'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pr-10"
            />
            {name && (
              <button
                type="button"
                onClick={() => setName('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Clear shortcut name"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Icon Picker */}
        <IconPicker
          selectedIcon={icon}
          onSelect={setIcon}
        />

        {/* Spacer */}
        <div className="flex-1 min-h-4" />

        {/* Confirm Button */}
        <Button
          onClick={handleConfirm}
          disabled={!isValid}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          Add to Home Screen
        </Button>
      </div>
    </div>
  );
}
