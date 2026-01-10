import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Trash2, Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IconPicker } from '@/components/IconPicker';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useBackButton } from '@/hooks/useBackButton';
import { createHomeScreenShortcut } from '@/lib/shortcutManager';
import { toast } from 'sonner';
import type { ShortcutData, ShortcutIcon } from '@/types/shortcut';

export default function ManageShortcuts() {
  const navigate = useNavigate();
  const { shortcuts, updateShortcut, deleteShortcut } = useShortcuts();
  const [editingShortcut, setEditingShortcut] = useState<ShortcutData | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState<ShortcutIcon>({ type: 'emoji', value: '📌' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useBackButton({
    isHomeScreen: false,
    onBack: () => {
      if (editingShortcut) {
        setEditingShortcut(null);
      } else {
        navigate('/');
      }
    }
  });

  const handleEdit = (shortcut: ShortcutData) => {
    setEditingShortcut(shortcut);
    setEditName(shortcut.name);
    setEditIcon(shortcut.icon);
  };

  const handleSaveAndReAdd = async () => {
    if (!editingShortcut || !editName.trim()) return;

    // Update the shortcut in storage
    const updated = updateShortcut(editingShortcut.id, {
      name: editName.trim(),
      icon: editIcon,
    });

    if (updated) {
      try {
        // Create a new home screen shortcut with updated details
        await createHomeScreenShortcut(updated);
        toast.success('Shortcut updated!', {
          description: 'A new shortcut has been added. Remove the old one from your home screen.',
        });
      } catch (error) {
        console.error('Failed to create home screen shortcut:', error);
        toast.error('Failed to add shortcut to home screen');
      }
    }

    setEditingShortcut(null);
  };

  const handleDelete = (id: string) => {
    deleteShortcut(id);
    setDeleteConfirmId(null);
    toast.success('Shortcut removed from app');
  };

  const getShortcutIcon = (icon: ShortcutIcon) => {
    if (icon.type === 'thumbnail') {
      return (
        <img src={icon.value} alt="" className="h-full w-full object-cover" />
      );
    }
    if (icon.type === 'emoji') {
      return <span className="text-xl">{icon.value}</span>;
    }
    return (
      <span className="text-lg font-bold text-primary-foreground">
        {icon.value.slice(0, 2).toUpperCase()}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 rounded-full hover:bg-muted active:bg-muted/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Manage Shortcuts</h1>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {shortcuts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium mb-2">No shortcuts yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first shortcut to see it here
            </p>
            <Button onClick={() => navigate('/')}>
              Create Shortcut
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-card border"
              >
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={
                    shortcut.icon.type === 'thumbnail'
                      ? {}
                      : { backgroundColor: 'hsl(var(--primary))' }
                  }
                >
                  {getShortcutIcon(shortcut.icon)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{shortcut.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {shortcut.type === 'link' ? (
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {shortcut.contentUri}
                      </span>
                    ) : (
                      shortcut.fileType || 'File'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(shortcut)}
                    className="p-2 rounded-full hover:bg-muted active:bg-muted/80"
                    title="Edit"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(shortcut.id)}
                    className="p-2 rounded-full hover:bg-destructive/10 active:bg-destructive/20 text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingShortcut} onOpenChange={(open) => !open && setEditingShortcut(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Shortcut</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter name"
                maxLength={30}
              />
            </div>
            <IconPicker
              thumbnail={
                editingShortcut?.icon.type === 'thumbnail'
                  ? editingShortcut.icon.value
                  : undefined
              }
              selectedIcon={editIcon}
              onSelect={setEditIcon}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={handleSaveAndReAdd}
              disabled={!editName.trim()}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Update & Add to Home Screen
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              This will create a new shortcut. Remove the old one manually.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shortcut?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the shortcut from the app. You'll need to manually remove it from your home screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
