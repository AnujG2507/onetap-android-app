import { useTranslation } from 'react-i18next';
import { MessageCircle, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface MessageChooserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: string[];
  contactName?: string;
  onSelectMessage: (message: string) => void;
  onOpenChatOnly: () => void;
}

/**
 * MessageChooserSheet - Runtime message selection for WhatsApp shortcuts.
 * 
 * Philosophy:
 * - Calm, predictable selection
 * - "Open chat only" is always an option
 * - No remembered defaults or smart guessing
 * - User explicitly chooses each time
 */
export function MessageChooserSheet({
  open,
  onOpenChange,
  messages,
  contactName,
  onSelectMessage,
  onOpenChatOnly,
}: MessageChooserSheetProps) {
  const { t } = useTranslation();

  const handleSelectMessage = (message: string) => {
    onOpenChange(false);
    onSelectMessage(message);
  };

  const handleOpenChatOnly = () => {
    onOpenChange(false);
    onOpenChatOnly();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] landscape:max-h-[95vh] rounded-t-2xl">
        <SheetHeader className="text-start pb-4 landscape:pb-2">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 landscape:h-4 landscape:w-4 text-primary" />
            {contactName 
              ? t('whatsapp.chooseMessageFor', { name: contactName })
              : t('whatsapp.chooseMessage')
            }
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-2 landscape:space-y-1.5 pb-6 landscape:pb-4 landscape:grid landscape:grid-cols-2 landscape:gap-2 landscape:space-y-0">
          {/* Open chat only option - always first */}
          <button
            type="button"
            onClick={handleOpenChatOnly}
            className="w-full flex items-center gap-3 landscape:gap-2 p-4 landscape:p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors text-start"
          >
            <div className="h-10 w-10 landscape:h-8 landscape:w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 landscape:h-4 landscape:w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground landscape:text-sm">
                {t('whatsapp.openChatOnly')}
              </p>
              <p className="text-sm landscape:text-xs text-muted-foreground truncate">
                {t('whatsapp.openChatOnlyDesc')}
              </p>
            </div>
          </button>

          {/* Divider - hidden in landscape grid */}
          {messages.length > 0 && (
            <div className="flex items-center gap-3 py-2 landscape:hidden">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">
                {t('whatsapp.orUseQuickMessage')}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Message options */}
          {messages.map((message, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectMessage(message)}
              className="w-full flex items-start gap-3 landscape:gap-2 p-4 landscape:p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors text-start"
            >
              <div className="h-10 w-10 landscape:h-8 landscape:w-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                <span className="text-lg landscape:text-base">💬</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm landscape:text-xs text-foreground whitespace-pre-wrap line-clamp-3">
                  {message}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Cancel button */}
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          className="w-full landscape:h-9"
        >
          {t('common.cancel')}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
