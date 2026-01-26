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
    <div className="mt-4 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/20 p-4 animate-fade-in border border-border/50 backdrop-blur-sm elevation-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground/80">{t('access.chooseAction')}</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-muted/50 hover:bg-muted transition-all duration-150 hover:scale-105 active:scale-95"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ActionModeButton
          icon={<Home className="h-5 w-5" strokeWidth={1.5} />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
          variant="primary"
        />
        <ActionModeButton
          icon={<Bell className="h-5 w-5" strokeWidth={1.5} />}
          label={t('access.reminder')}
          description={t('access.reminderDesc')}
          onClick={() => onSelectAction('reminder')}
          variant="secondary"
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
    <div className="mt-4 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/20 p-4 animate-fade-in border border-border/50 backdrop-blur-sm elevation-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground/80">{t('access.contactType')}</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-muted/50 hover:bg-muted transition-all duration-150 hover:scale-105 active:scale-95"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      
      {/* Contact Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => onSelectContactMode('dial')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200",
            contactMode === 'dial' 
              ? "bg-primary text-primary-foreground shadow-md scale-[1.02]" 
              : "bg-card text-muted-foreground hover:bg-muted hover:scale-[1.01] border border-border/50"
          )}
        >
          <Phone className="h-4.5 w-4.5" strokeWidth={contactMode === 'dial' ? 2 : 1.5} />
          {t('access.contactCall')}
        </button>
        <button
          onClick={() => onSelectContactMode('message')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200",
            contactMode === 'message' 
              ? "bg-primary text-primary-foreground shadow-md scale-[1.02]" 
              : "bg-card text-muted-foreground hover:bg-muted hover:scale-[1.01] border border-border/50"
          )}
        >
          <MessageCircle className="h-4.5 w-4.5" strokeWidth={contactMode === 'message' ? 2 : 1.5} />
          {t('access.contactMessage')}
        </button>
      </div>
      
      {/* Action Mode Selection */}
      <div className="grid grid-cols-2 gap-3">
        <ActionModeButton
          icon={<Home className="h-5 w-5" strokeWidth={1.5} />}
          label={t('access.shortcut')}
          description={t('access.shortcutDesc')}
          onClick={() => onSelectAction('shortcut')}
          variant="primary"
        />
        <ActionModeButton
          icon={<Bell className="h-5 w-5" strokeWidth={1.5} />}
          label={t('access.reminder')}
          description={t('access.reminderDesc')}
          onClick={() => onSelectAction('reminder')}
          variant="secondary"
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
  variant?: 'primary' | 'secondary';
}

function ActionModeButton({ icon, label, description, onClick, variant = 'primary' }: ActionModeButtonProps) {
  const isPrimary = variant === 'primary';
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center rounded-xl p-4 group",
        "bg-card hover:shadow-lg",
        "active:scale-[0.97]",
        "transition-all duration-200 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "border border-border/60 hover:border-primary/30"
      )}
    >
      <div className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl mb-2.5 transition-all duration-200",
        "group-hover:scale-110 group-hover:shadow-md",
        isPrimary 
          ? "bg-gradient-to-br from-primary/20 to-primary/10 text-primary group-hover:from-primary/30 group-hover:to-primary/15" 
          : "bg-gradient-to-br from-accent to-accent/50 text-accent-foreground group-hover:from-accent group-hover:to-accent/70"
      )}>
        {icon}
      </div>
      <span className="text-sm font-semibold text-foreground mb-0.5">{label}</span>
      <span className="text-[11px] text-muted-foreground text-center leading-tight">{description}</span>
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
}

function SecondaryButton({ id, icon, label, onClick }: SecondaryButtonProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl bg-muted/20 px-3 py-2.5",
        "hover:bg-muted/40 hover:text-foreground",
        "active:scale-[0.97] transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </button>
  );
}
