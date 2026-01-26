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
  onSelectFromLibrary?: () => void;
  onEnterUrl?: (actionMode: ActionMode) => void;
}

type ActivePicker = 'photo' | 'video' | 'audio' | 'document' | 'contact' | 'link' | null;

export function ContentSourcePicker({ 
  onSelectFile, 
  onSelectContact, 
  onSelectFromLibrary, 
  onEnterUrl,
}: ContentSourcePickerProps) {
  const { t } = useTranslation();
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [contactMode, setContactMode] = useState<ContactMode>('dial');

  const handleActionSelect = (picker: ActivePicker, action: ActionMode) => {
    setActivePicker(null);
    
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
      setActivePicker(null);
    } else {
      setActivePicker(picker);
    }
  };

  const closePicker = () => {
    setActivePicker(null);
  };

  return (
    <div className="flex flex-col gap-4 p-5 pb-24 animate-fade-in">
      {/* Main Card: Create a Shortcut */}
      <div className="rounded-2xl bg-card elevation-1 p-4">
        <h2 className="text-base font-medium text-foreground mb-4">
          {t('access.createShortcut')}
        </h2>
        
        {/* Primary Grid: 3x2 layout */}
        <div id="tutorial-content-grid" className="grid grid-cols-3 gap-3">
          <GridButton
            icon={<Image className="h-5 w-5" />}
            label={t('access.photo')}
            onClick={() => handleGridButtonClick('photo')}
            isActive={activePicker === 'photo'}
          />
          <GridButton
            icon={<Video className="h-5 w-5" />}
            label={t('access.video')}
            onClick={() => handleGridButtonClick('video')}
            isActive={activePicker === 'video'}
          />
          <GridButton
            icon={<Music className="h-5 w-5" />}
            label={t('access.audio')}
            onClick={() => handleGridButtonClick('audio')}
            isActive={activePicker === 'audio'}
          />
          <GridButton
            icon={<FileText className="h-5 w-5" />}
            label={t('access.document')}
            onClick={() => handleGridButtonClick('document')}
            isActive={activePicker === 'document'}
          />
          {onSelectContact && (
            <GridButton
              icon={<Phone className="h-5 w-5" />}
              label={t('access.contact')}
              onClick={() => handleGridButtonClick('contact')}
              isActive={activePicker === 'contact'}
            />
          )}
          {onEnterUrl && (
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
        <div className="grid grid-cols-2 gap-3">
          <SecondaryButton
            icon={<FolderOpen className="h-4 w-4" />}
            label={t('access.browseFiles')}
            onClick={() => onSelectFile('all', 'shortcut')}
          />
          {onSelectFromLibrary && (
            <SecondaryButton
              id="tutorial-saved-bookmarks"
              icon={<Bookmark className="h-4 w-4" />}
              label={t('access.savedBookmarks')}
              onClick={onSelectFromLibrary}
            />
          )}
        </div>
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
      <div className="grid grid-cols-2 gap-2">
        <ActionModeButton
          icon={<Home className="h-4 w-4" />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
        />
        <ActionModeButton
          icon={<Bell className="h-4 w-4" />}
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
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
            contactMode === 'dial' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          <Phone className="h-4 w-4" />
          {t('access.contactCall')}
        </button>
        <button
          onClick={() => onSelectContactMode('message')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
            contactMode === 'message' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {t('access.contactMessage')}
        </button>
      </div>
      
      {/* Action Mode Selection */}
      <div className="grid grid-cols-2 gap-2">
        <ActionModeButton
          icon={<Home className="h-4 w-4" />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
        />
        <ActionModeButton
          icon={<Bell className="h-4 w-4" />}
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
        "flex items-center gap-3 rounded-lg bg-card p-3",
        "active:scale-[0.98] transition-transform",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        "border border-border/50"
      )}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div className="text-left">
        <span className="text-sm font-medium text-foreground block">{label}</span>
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
        "shadow-sm active:scale-[0.96] transition-all",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        isActive 
          ? "bg-primary/10 ring-2 ring-primary/30" 
          : "bg-muted/40"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full",
        isActive ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"
      )}>
        {icon}
      </div>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </button>
  );
}

interface SecondaryButtonProps {
  id?: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function SecondaryButton({ id, icon, label, onClick }: SecondaryButtonProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl bg-muted/20 px-3 py-2.5",
        "active:scale-[0.98] transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </button>
  );
}
