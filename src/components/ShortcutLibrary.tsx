import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Image, Video, FileText, Link2, Music } from 'lucide-react';
import { useShortcuts } from '@/hooks/useShortcuts';
import { ShortcutActionSheet } from './ShortcutActionSheet';
import { ShortcutEditor } from './ShortcutEditor';
import { FileReplacementDialog } from './FileReplacementDialog';
import type { ShortcutData, ShortcutIcon, FileType } from '@/types/shortcut';

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function getTypeIcon(shortcut: ShortcutData) {
  if (shortcut.type === 'link') {
    return <Link2 className="h-4 w-4 text-muted-foreground" />;
  }
  
  const fileType = shortcut.fileType;
  switch (fileType) {
    case 'image':
      return <Image className="h-4 w-4 text-muted-foreground" />;
    case 'video':
      return <Video className="h-4 w-4 text-muted-foreground" />;
    case 'audio':
      return <Music className="h-4 w-4 text-muted-foreground" />;
    case 'pdf':
    case 'document':
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

function getTypeLabel(shortcut: ShortcutData): string {
  if (shortcut.type === 'link') return 'URL';
  
  const fileType = shortcut.fileType;
  switch (fileType) {
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    case 'pdf': return 'PDF';
    case 'document': return 'Document';
    default: return 'File';
  }
}

function renderIcon(icon: ShortcutIcon, thumbnailData?: string) {
  if (icon.type === 'thumbnail' && (icon.value || thumbnailData)) {
    return (
      <img
        src={icon.value || thumbnailData}
        alt=""
        className="h-full w-full object-cover rounded-lg"
      />
    );
  }
  if (icon.type === 'emoji') {
    return <span className="text-2xl">{icon.value}</span>;
  }
  // text type
  return (
    <span className="text-sm font-bold text-primary-foreground uppercase">
      {icon.value.slice(0, 2)}
    </span>
  );
}

export function ShortcutLibrary() {
  const navigate = useNavigate();
  const { shortcuts, updateShortcut, deleteShortcut } = useShortcuts();
  const [selectedShortcut, setSelectedShortcut] = useState<ShortcutData | null>(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);

  // Sort by creation date (newest first)
  const sortedShortcuts = [...shortcuts].sort((a, b) => b.createdAt - a.createdAt);

  const handleShortcutClick = (shortcut: ShortcutData) => {
    setSelectedShortcut(shortcut);
    setIsActionSheetOpen(true);
  };

  const handleCloseActionSheet = () => {
    setIsActionSheetOpen(false);
    setSelectedShortcut(null);
  };

  const handleOpenEditor = () => {
    setIsActionSheetOpen(false);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedShortcut(null);
  };

  const handleSaveEdit = (name: string, icon: ShortcutIcon) => {
    if (selectedShortcut) {
      updateShortcut(selectedShortcut.id, { name, icon });
    }
    handleCloseEditor();
  };

  const handleDelete = () => {
    if (selectedShortcut) {
      deleteShortcut(selectedShortcut.id);
    }
    handleCloseActionSheet();
  };

  const handleFileMissing = () => {
    setIsActionSheetOpen(false);
    setIsFileDialogOpen(true);
  };

  const handleCloseFileDialog = () => {
    setIsFileDialogOpen(false);
    setSelectedShortcut(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-border">
        <button
          onClick={() => navigate('/')}
          className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Shortcut Library</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {sortedShortcuts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No shortcuts yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Created shortcuts will appear here
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sortedShortcuts.map((shortcut) => (
              <li key={shortcut.id}>
                <button
                  onClick={() => handleShortcutClick(shortcut)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  {/* Icon */}
                  <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {renderIcon(shortcut.icon, shortcut.thumbnailData)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {shortcut.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {getTypeIcon(shortcut)}
                      <span className="text-sm text-muted-foreground">
                        {getTypeLabel(shortcut)}
                      </span>
                      <span className="text-sm text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeTime(shortcut.updatedAt || shortcut.createdAt)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action Sheet */}
      {selectedShortcut && (
        <ShortcutActionSheet
          shortcut={selectedShortcut}
          isOpen={isActionSheetOpen}
          onClose={handleCloseActionSheet}
          onEdit={handleOpenEditor}
          onDelete={handleDelete}
          onFileMissing={handleFileMissing}
        />
      )}

      {/* Editor */}
      {selectedShortcut && isEditorOpen && (
        <ShortcutEditor
          shortcut={selectedShortcut}
          onSave={handleSaveEdit}
          onClose={handleCloseEditor}
        />
      )}

      {/* File Replacement Dialog */}
      {selectedShortcut && isFileDialogOpen && (
        <FileReplacementDialog
          shortcut={selectedShortcut}
          isOpen={isFileDialogOpen}
          onClose={handleCloseFileDialog}
        />
      )}
    </div>
  );
}
