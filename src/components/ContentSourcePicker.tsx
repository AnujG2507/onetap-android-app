import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Video, FileText, Bookmark, Music, Phone, Link, FolderOpen, MessageCircle, X, Home, Bell, AlignLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { FileTypeFilter } from '@/lib/contentResolver';
export type ContactMode = 'dial' | 'message';
export type ActionMode = 'shortcut' | 'reminder';

interface ContentSourcePickerProps {
  onSelectFile: (filter: FileTypeFilter, actionMode: ActionMode) => void;
  onSelectContact?: (mode: ContactMode, actionMode: ActionMode) => void;
  onSelectFromLibrary?: (actionMode: ActionMode) => void;
  onEnterUrl?: (actionMode: ActionMode) => void;
  onSelectText?: (actionMode: ActionMode) => void;
  /** Called when the inline picker is opened or closed */
  onPickerOpenChange?: (isOpen: boolean) => void;
}

type ActivePicker = 'photo' | 'video' | 'audio' | 'document' | 'contact' | 'link' | 'text' | null;
type ActiveSecondaryPicker = 'browse' | 'library' | null;

export function ContentSourcePicker({ 
  onSelectFile, 
  onSelectContact, 
  onSelectFromLibrary, 
  onEnterUrl,
  onSelectText,
  onPickerOpenChange,
}: ContentSourcePickerProps) {
  const { t } = useTranslation();
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [activeSecondaryPicker, setActiveSecondaryPicker] = useState<ActiveSecondaryPicker>(null);
  const [contactMode, setContactMode] = useState<ContactMode>('dial');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bring expanded picker into view
  useEffect(() => {
    const pickerEl = pickerRef.current;
    if (!(activePicker || activeSecondaryPicker) || !pickerEl) return;

    // Let framer-motion finish expanding before scrolling
    const timer = window.setTimeout(() => {
      pickerEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 260);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activePicker, activeSecondaryPicker]);
  // Notify parent when picker opens/closes
  const updateActivePicker = (picker: ActivePicker) => {
    setActivePicker(picker);
    setActiveSecondaryPicker(null);
    onPickerOpenChange?.(picker !== null);
  };

  const updateSecondaryPicker = (picker: ActiveSecondaryPicker) => {
    setActiveSecondaryPicker(picker);
    setActivePicker(null);
    onPickerOpenChange?.(picker !== null);
  };

  const handleActionSelect = (picker: ActivePicker, action: ActionMode) => {
    updateActivePicker(null);
    
    if (picker === 'contact') {
      onSelectContact?.(contactMode, action);
    } else if (picker === 'link') {
      onEnterUrl?.(action);
    } else if (picker === 'text') {
      onSelectText?.(action);
    } else if (picker === 'photo') {
      onSelectFile('image', action);
    } else if (picker === 'video') {
      onSelectFile('video', action);
    } else if (picker === 'audio') {
      onSelectFile('audio', action);
    } else if (picker === 'document') {
      onSelectFile('document', action);
    }
  };

  const handleContactModeSelect = (mode: ContactMode) => {
    setContactMode(mode);
  };

  const handleGridButtonClick = (picker: ActivePicker) => {
    if (activePicker === picker) {
      updateActivePicker(null);
    } else {
      updateActivePicker(picker);
    }
  };

  const closePicker = () => {
    updateActivePicker(null);
    updateSecondaryPicker(null);
  };

  const handleSecondaryAction = (picker: ActiveSecondaryPicker, action: ActionMode) => {
    updateSecondaryPicker(null);
    if (picker === 'browse') {
      onSelectFile('all', action);
    } else if (picker === 'library') {
      onSelectFromLibrary?.(action);
    }
  };

  const scrollToBottom = () => {
    // Wait for framer-motion animation to complete (200ms) + buffer
    setTimeout(() => {
      requestAnimationFrame(() => {
        const scroller = scrollContainerRef.current;
        if (scroller) {
          scroller.scrollTo({
            top: scroller.scrollHeight,
            behavior: 'smooth'
          });
        }
      });
    }, 300);
  };

  const handleSecondaryButtonClick = (picker: ActiveSecondaryPicker) => {
    if (activeSecondaryPicker === picker) {
      updateSecondaryPicker(null);
    } else {
      updateSecondaryPicker(picker);
      scrollToBottom();
    }
  };

  return (
    <>
      {/* Scrollable Content Area - ends above fixed My Shortcuts button */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 h-full overflow-y-auto pb-6"
      >
        <div className="flex flex-col gap-4 p-5 pb-6 animate-fade-in">
          {/* Main Card: Create a Shortcut */}
          <div className="rounded-2xl bg-card elevation-1 p-4">
            <h2 className="text-base font-medium text-foreground mb-4">
              {t('access.createShortcut')}
            </h2>
            
            {/* Primary Grid: 4+3 layout (portrait), 7 cols in landscape */}
            <div id="tutorial-content-grid" className={cn(
              "transition-all duration-200",
              activePicker
                ? "grid grid-cols-1 gap-3"
                : "flex flex-col gap-3 landscape:grid landscape:grid-cols-7 landscape:gap-3"
            )}>
              {/* Row 1 (portrait): Photo, Video, Audio, Document — 4 equal columns */}
              <div className={cn(
                "grid grid-cols-4 gap-3",
                activePicker ? "grid-cols-1" : "",
                "landscape:contents"
              )}>
                {(!activePicker || activePicker === 'photo') && (
                  <GridButton
                    icon={<Image className="h-5 w-5" />}
                    label={t('access.photo')}
                    onClick={() => handleGridButtonClick('photo')}
                    isActive={activePicker === 'photo'}
                  />
                )}
                {(!activePicker || activePicker === 'video') && (
                  <GridButton
                    icon={<Video className="h-5 w-5" />}
                    label={t('access.video')}
                    onClick={() => handleGridButtonClick('video')}
                    isActive={activePicker === 'video'}
                  />
                )}
                {(!activePicker || activePicker === 'audio') && (
                  <GridButton
                    icon={<Music className="h-5 w-5" />}
                    label={t('access.audio')}
                    onClick={() => handleGridButtonClick('audio')}
                    isActive={activePicker === 'audio'}
                  />
                )}
                {(!activePicker || activePicker === 'document') && (
                  <GridButton
                    icon={<FileText className="h-5 w-5" />}
                    label={t('access.document')}
                    onClick={() => handleGridButtonClick('document')}
                    isActive={activePicker === 'document'}
                  />
                )}
              </div>

              {/* Row 2 (portrait): Contact, Link, Text — 3 equal columns filling full width */}
              <div className={cn(
                "grid grid-cols-3 gap-3",
                activePicker ? "grid-cols-1" : "",
                "landscape:contents"
              )}>
                {onSelectContact && (!activePicker || activePicker === 'contact') && (
                  <GridButton
                    icon={<Phone className="h-5 w-5" />}
                    label={t('access.contact')}
                    onClick={() => handleGridButtonClick('contact')}
                    isActive={activePicker === 'contact'}
                  />
                )}
                {onEnterUrl && (!activePicker || activePicker === 'link') && (
                  <GridButton
                    id="tutorial-link-button"
                    icon={<Link className="h-5 w-5" />}
                    label={t('access.link')}
                    onClick={() => handleGridButtonClick('link')}
                    isActive={activePicker === 'link'}
                  />
                )}
                {(!activePicker || activePicker === 'text') && (
                  <GridButton
                    icon={<AlignLeft className="h-5 w-5" />}
                    label={t('access.text')}
                    onClick={() => handleGridButtonClick('text')}
                    isActive={activePicker === 'text'}
                  />
                )}
              </div>
            </div>

            {/* Inline Action Picker - for non-contact items */}
            <AnimatePresence>
              {activePicker && activePicker !== 'contact' && (
                <div ref={pickerRef}>
                  <ActionModePicker
                    key="action-picker"
                    onSelectAction={(action) => handleActionSelect(activePicker, action)}
                    onClose={closePicker}
                  />
                </div>
              )}
            </AnimatePresence>
            {/* Contact Mode + Action Picker */}
            <AnimatePresence>
              {activePicker === 'contact' && (
                <div ref={pickerRef}>
                  <ContactActionPicker
                    key="contact-picker"
                    contactMode={contactMode}
                    onSelectContactMode={handleContactModeSelect}
                    onSelectAction={(action) => handleActionSelect('contact', action)}
                    onClose={closePicker}
                  />
                </div>
              )}
            </AnimatePresence>
            
            {/* Secondary Actions Section */}
            <div className="mt-4 -mx-4 -mb-4 px-4 pb-4 pt-3 bg-muted/20 rounded-b-2xl border-t border-border/50">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">
                {t('access.moreOptions')}
              </h2>
              <div className={cn(
                "grid gap-3 transition-all duration-200",
                activeSecondaryPicker ? "grid-cols-1" : "grid-cols-2 landscape:grid-cols-4"
              )}>
                {(!activeSecondaryPicker || activeSecondaryPicker === 'browse') && (
                  <SecondaryButton
                    icon={<FolderOpen className="h-4 w-4" />}
                    label={t('access.browseFiles')}
                    onClick={() => handleSecondaryButtonClick('browse')}
                    isActive={activeSecondaryPicker === 'browse'}
                  />
                )}
                {onSelectFromLibrary && (!activeSecondaryPicker || activeSecondaryPicker === 'library') && (
                  <SecondaryButton
                    id="tutorial-saved-bookmarks"
                    icon={<Bookmark className="h-4 w-4" />}
                    label={t('access.savedBookmarks')}
                    onClick={() => handleSecondaryButtonClick('library')}
                    isActive={activeSecondaryPicker === 'library'}
                  />
                )}
              </div>

              {/* Secondary Action Picker */}
              <AnimatePresence>
                {activeSecondaryPicker && (
                  <div ref={pickerRef}>
                    <ActionModePicker
                      key="secondary-picker"
                      onSelectAction={(action) => handleSecondaryAction(activeSecondaryPicker, action)}
                      onClose={closePicker}
                    />
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Action Mode Picker - Choose between Shortcut and Reminder
interface ActionModePickerProps {
  onSelectAction: (action: ActionMode) => void;
  onClose: () => void;
}

function ActionModePicker({ onSelectAction, onClose }: ActionModePickerProps) {
  const { t } = useTranslation();
  
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="rounded-xl bg-muted/30 p-3 landscape:p-2 overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2 landscape:mb-1.5">
        <span className="text-xs landscape:text-[10px] font-medium text-muted-foreground">{t('access.chooseAction')}</span>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="flex flex-col gap-2 landscape:gap-1.5">
        <ActionModeButton
          icon={<Home className="h-5 w-5 landscape:h-4 landscape:w-4" />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
        />
        <ActionModeButton
          icon={<Bell className="h-5 w-5 landscape:h-4 landscape:w-4" />}
          label={t('access.reminder')}
          description={t('access.reminderDesc')}
          onClick={() => onSelectAction('reminder')}
        />
      </div>
    </motion.div>
  );
}

// Contact Action Picker - Choose contact mode (Call/Message) then action (Shortcut/Reminder)
interface ContactActionPickerProps {
  contactMode: ContactMode;
  onSelectContactMode: (mode: ContactMode) => void;
  onSelectAction: (action: ActionMode) => void;
  onClose: () => void;
}

function ContactActionPicker({ 
  contactMode, 
  onSelectContactMode, 
  onSelectAction, 
  onClose 
}: ContactActionPickerProps) {
  const { t } = useTranslation();
  
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="rounded-xl bg-muted/30 p-3 landscape:p-2 overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2 landscape:mb-1.5">
        <span className="text-xs landscape:text-[10px] font-medium text-muted-foreground">{t('access.contactType')}</span>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 text-muted-foreground" />
        </button>
      </div>
      
      {/* Contact Mode Toggle */}
      <div className="flex gap-2 landscape:gap-1.5 mb-3 landscape:mb-2">
        <button
          onClick={() => onSelectContactMode('dial')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 landscape:gap-1.5 rounded-xl py-2.5 landscape:py-2 text-sm landscape:text-xs font-medium transition-all duration-150",
            contactMode === 'dial' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:scale-[1.01]"
          )}
        >
          <div className={cn(
            "flex h-7 w-7 landscape:h-6 landscape:w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
            contactMode === 'dial' ? "bg-primary-foreground/20" : "bg-primary/10"
          )}>
            <Phone className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 shrink-0" />
          </div>
          {t('access.contactCall')}
        </button>
        <button
          onClick={() => onSelectContactMode('message')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 landscape:gap-1.5 rounded-xl py-2.5 landscape:py-2 text-sm landscape:text-xs font-medium transition-all duration-150",
            contactMode === 'message' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:scale-[1.01]"
          )}
        >
          <div className={cn(
            "flex h-7 w-7 landscape:h-6 landscape:w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
            contactMode === 'message' ? "bg-primary-foreground/20" : "bg-primary/10"
          )}>
            <svg className="h-4 w-4 landscape:h-3.5 landscape:w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          {t('access.contactMessage')}
        </button>
      </div>
      
      {/* Action Mode Selection */}
      <div className="flex flex-col gap-2 landscape:gap-1.5">
        <ActionModeButton
          icon={<Home className="h-5 w-5 landscape:h-4 landscape:w-4" />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
        />
        <ActionModeButton
          icon={<Bell className="h-5 w-5 landscape:h-4 landscape:w-4" />}
          label={t('access.reminder')}
          description={t('access.reminderDesc')}
          onClick={() => onSelectAction('reminder')}
        />
      </div>
    </motion.div>
  );
}

// Shared action mode button component
interface ActionModeButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}

function ActionModeButton({ icon, label, description, onClick }: ActionModeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 landscape:gap-2 rounded-xl p-3 landscape:p-2",
        "bg-gradient-to-br from-card to-card/90",
        "border border-border/60 shadow-sm",
        "hover:shadow-md hover:border-primary/30 hover:scale-[1.01]",
        "active:scale-[0.98] active:shadow-sm",
        "transition-all duration-200 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
      )}
    >
      <div className="flex h-10 w-10 landscape:h-8 landscape:w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary shrink-0 shadow-sm">
        {icon}
      </div>
      <div className="flex flex-col items-start flex-1 min-w-0">
        <span className="text-sm landscape:text-xs font-semibold text-foreground">{label}</span>
        <span className="text-xs landscape:text-[10px] text-muted-foreground">{description}</span>
      </div>
    </button>
  );
}

interface GridButtonProps {
  id?: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

function GridButton({ id, icon, label, onClick, isActive }: GridButtonProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 landscape:gap-1.5 rounded-xl p-4 landscape:p-3",
        "shadow-sm active:scale-[0.96] active:shadow-none",
        "transition-all duration-200 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        isActive 
          ? "bg-primary/10 ring-2 ring-primary/30 scale-105 shadow-md" 
          : "bg-muted/40 hover:scale-[1.02] hover:shadow-md hover:bg-muted/60"
      )}
    >
      <div className={cn(
        "flex items-center justify-center rounded-full transition-all duration-200",
        isActive ? "h-12 w-12 landscape:h-10 landscape:w-10 bg-primary/20 text-primary" : "h-10 w-10 landscape:h-8 landscape:w-8 bg-primary/10 text-primary"
      )}>
        {icon}
      </div>
      <span className={cn(
        "font-medium text-foreground transition-all duration-200",
        isActive ? "text-sm landscape:text-xs" : "text-xs landscape:text-[10px]"
      )}>{label}</span>
    </button>
  );
}

interface SecondaryButtonProps {
  id?: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

function SecondaryButton({ id, icon, label, onClick, isActive }: SecondaryButtonProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 landscape:gap-2 rounded-xl px-3 landscape:px-2 py-2.5 landscape:py-2",
        "border border-border/60",
        "active:scale-[0.97] transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        "shadow-sm",
        isActive 
          ? "bg-primary/10 border-primary/40 ring-2 ring-primary/30 scale-[1.02] shadow-md" 
          : "bg-gradient-to-br from-muted/30 to-muted/10 hover:from-muted/50 hover:to-muted/20 hover:border-border hover:shadow-md"
      )}
    >
      <div className={cn(
        "flex h-8 w-8 landscape:h-6 landscape:w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
        isActive ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-sm landscape:text-xs font-medium",
        isActive ? "text-foreground" : "text-foreground/80"
      )}>{label}</span>
    </button>
  );
}
