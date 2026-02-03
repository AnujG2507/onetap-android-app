import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface QuickMessagesEditorProps {
  messages: string[];
  onChange: (messages: string[]) => void;
  maxMessages?: number;
}

/**
 * QuickMessagesEditor - A calm, optional editor for WhatsApp quick messages.
 * 
 * Philosophy:
 * - Messages are drafts, never auto-sent
 * - Empty messages array means "open chat only"
 * - Plain text only (emojis and line breaks allowed)
 * - User is always in control
 */
export function QuickMessagesEditor({
  messages,
  onChange,
  maxMessages = 5,
}: QuickMessagesEditorProps) {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const handleAddMessage = () => {
    const trimmed = newMessage.trim();
    if (trimmed && messages.length < maxMessages) {
      onChange([...messages, trimmed]);
      setNewMessage('');
      setIsAdding(false);
    }
  };

  const handleRemoveMessage = (index: number) => {
    const updated = messages.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleUpdateMessage = (index: number, value: string) => {
    const updated = [...messages];
    updated[index] = value;
    onChange(updated);
  };

  const canAddMore = messages.length < maxMessages;

  return (
    <div className="space-y-3 landscape:space-y-2">
      <Label className="text-sm landscape:text-xs font-medium text-foreground">
        {t('whatsapp.quickMessages', 'Quick messages')}
      </Label>
      
      <p className="text-xs landscape:text-[10px] text-muted-foreground">
        {t('whatsapp.quickMessagesHint', 'Messages open as drafts for you to review and send.')}
      </p>

      {/* Existing messages */}
      {messages.length > 0 && (
        <div className="space-y-2 landscape:space-y-1.5">
          {messages.map((message, index) => (
            <div 
              key={index}
              className="group relative flex items-start gap-2 landscape:gap-1.5 p-3 landscape:p-2 rounded-lg bg-muted/30 border border-border/50"
            >
              <GripVertical className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 mt-1 landscape:mt-0.5 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <Textarea
                  value={message}
                  onChange={(e) => handleUpdateMessage(index, e.target.value)}
                  className="min-h-[60px] landscape:min-h-[40px] text-sm landscape:text-xs resize-none bg-transparent border-0 p-0 focus-visible:ring-0"
                  placeholder={t('whatsapp.messagePlaceholder', 'Type a message...')}
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveMessage(index)}
                className="p-1 rounded-full hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive shrink-0"
                aria-label={t('common.remove', 'Remove')}
              >
                <X className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new message */}
      {isAdding ? (
        <div className="space-y-2 landscape:space-y-1.5 p-3 landscape:p-2 rounded-lg border border-dashed border-primary/30 bg-primary/5">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="min-h-[80px] landscape:min-h-[50px] text-sm landscape:text-xs resize-none"
            placeholder={t('whatsapp.messagePlaceholder', 'Type a message...')}
            autoFocus
          />
          <div className="flex gap-2 landscape:gap-1.5 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="landscape:h-7 landscape:text-xs landscape:px-2"
              onClick={() => {
                setIsAdding(false);
                setNewMessage('');
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="landscape:h-7 landscape:text-xs landscape:px-2"
              onClick={handleAddMessage}
              disabled={!newMessage.trim()}
            >
              {t('common.add', 'Add')}
            </Button>
          </div>
        </div>
      ) : canAddMore ? (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-2 landscape:gap-1.5 p-3 landscape:p-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-primary"
        >
          <Plus className="h-4 w-4 landscape:h-3.5 landscape:w-3.5" />
          <span className="text-sm landscape:text-xs">{t('whatsapp.addMessage', 'Add quick message')}</span>
        </button>
      ) : null}

    </div>
  );
}
