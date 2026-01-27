import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Video, FileText, Bookmark, Music, Phone, Link, FolderOpen, MessageCircle, X, Home, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTypeFilter } from '@/lib/contentResolver';

export type ContactMode = 'dial' | 'message';
export type ActionMode = 'shortcut' | 'reminder';

interface ContentSourcePickerProps {
  onSelectFile: (filter: FileTypeFilter, actionMode: ActionMode) => void;
  onSelectContact?: (mode: ContactMode, actionMode: ActionMode) => void;
  onSelectFromLibrary?: (actionMode: ActionMode) => void;
  onEnterUrl?: (actionMode: ActionMode) => void;
  /** Called when the inline picker is opened or closed */
  onPickerOpenChange?: (isOpen: boolean) => void;
}

type ActivePicker = 'photo' | 'video' | 'audio' | 'document' | 'contact' | 'link' | null;
type ActiveSecondaryPicker = 'browse' | 'library' | null;

export function ContentSourcePicker({ 
  onSelectFile, 
  onSelectContact, 
  onSelectFromLibrary, 
  onEnterUrl,
  onPickerOpenChange,
}: ContentSourcePickerProps) {
  const { t } = useTranslation();
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [activeSecondaryPicker, setActiveSecondaryPicker] = useState<ActiveSecondaryPicker>(null);
  const [contactMode, setContactMode] = useState<ContactMode>('dial');

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

  const handleSecondaryButtonClick = (picker: ActiveSecondaryPicker) => {
    if (activeSecondaryPicker === picker) {
      updateSecondaryPicker(null);
    } else {
      updateSecondaryPicker(picker);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 pb-24 animate-fade-in">
      {/* Main Card: Create a Shortcut */}
      <div className="rounded-2xl bg-card elevation-1 p-4">
        <h2 className="text-base font-medium text-foreground mb-4">
          {t('access.createShortcut')}
        </h2>
        
        {/* Primary Grid: 3x2 layout - hide non-selected when picker is active */}
        <div id="tutorial-content-grid" className={cn(
          "grid gap-3 transition-all duration-200",
          activePicker ? "grid-cols-1" : "grid-cols-3"
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
        </div>

        {/* Inline Action Picker - for non-contact items */}
        {activePicker && activePicker !== 'contact' && (
          <ActionModePicker
            onSelectAction={(action) => handleActionSelect(activePicker, action)}
            onClose={closePicker}
          />
        )}

        {/* Contact Mode + Action Picker */}
        {activePicker === 'contact' && (
          <ContactActionPicker
            contactMode={contactMode}
            onSelectContactMode={handleContactModeSelect}
            onSelectAction={(action) => handleActionSelect('contact', action)}
            onClose={closePicker}
          />
        )}
        
        {/* Divider */}
        <div className="h-px bg-border my-4" />
        
        {/* Secondary Actions */}
        <div className={cn(
          "grid gap-3 transition-all duration-200",
          activeSecondaryPicker ? "grid-cols-1" : "grid-cols-2"
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
        {activeSecondaryPicker && (
          <ActionModePicker
            onSelectAction={(action) => handleSecondaryAction(activeSecondaryPicker, action)}
            onClose={closePicker}
          />
        )}
      </div>
    </div>
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
    <div className="mt-3 rounded-xl bg-muted/30 p-3 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{t('access.chooseAction')}</span>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <ActionModeButton
          icon={<Home className="h-5 w-5" />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
        />
        <ActionModeButton
          icon={<Bell className="h-5 w-5" />}
          label={t('access.reminder')}
          description={t('access.reminderDesc')}
          onClick={() => onSelectAction('reminder')}
        />
      </div>
    </div>
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
    <div className="mt-3 rounded-xl bg-muted/30 p-3 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{t('access.contactType')}</span>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      
      {/* Contact Mode Toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => onSelectContactMode('dial')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-150",
            contactMode === 'dial' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:scale-[1.01]"
          )}
        >
          <Phone className="h-4 w-4" />
          {t('access.contactCall')}
        </button>
        <button
          onClick={() => onSelectContactMode('message')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-150",
            contactMode === 'message' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:scale-[1.01]"
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {t('access.contactMessage')}
        </button>
      </div>
      
      {/* Action Mode Selection */}
      <div className="flex flex-col gap-2">
        <ActionModeButton
          icon={<Home className="h-5 w-5" />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
        />
        <ActionModeButton
          icon={<Bell className="h-5 w-5" />}
          label={t('access.reminder')}
          description={t('access.reminderDesc')}
          onClick={() => onSelectAction('reminder')}
        />
      </div>
    </div>
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
        "flex items-center gap-3 rounded-xl p-3",
        "bg-gradient-to-br from-card to-card/90",
        "border border-border/60 shadow-sm",
        "hover:shadow-md hover:border-primary/30 hover:scale-[1.01]",
        "active:scale-[0.98] active:shadow-sm",
        "transition-all duration-200 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary shrink-0 shadow-sm">
        {icon}
      </div>
      <div className="flex flex-col items-start flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
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
        "flex flex-col items-center gap-2 rounded-xl p-4",
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
        isActive ? "h-12 w-12 bg-primary/20 text-primary" : "h-10 w-10 bg-primary/10 text-primary"
      )}>
        {icon}
      </div>
      <span className={cn(
        "font-medium text-foreground transition-all duration-200",
        isActive ? "text-sm" : "text-xs"
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
        "flex items-center gap-3 rounded-xl px-4 py-3",
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
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        isActive ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-sm font-medium",
        isActive ? "text-foreground" : "text-foreground/80"
      )}>{label}</span>
    </button>
  );
}
