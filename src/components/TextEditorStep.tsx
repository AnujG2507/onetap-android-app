import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Bold, Italic, Heading1, Heading2, Minus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPicker } from '@/components/IconPicker';
import { cn } from '@/lib/utils';
import type { ShortcutIcon } from '@/types/shortcut';

const MAX_CHARS = 2000;

interface TextEditorStepProps {
  /** Whether to show icon picker (false for reminders) */
  showIconPicker?: boolean;
  /** Whether to show "Add to Home Screen" (false for reminders) */
  isReminder?: boolean;
  /** Initial text content (for editing) */
  initialText?: string;
  /** Initial checklist mode */
  initialIsChecklist?: boolean;
  /** Initial name */
  initialName?: string;
  /** Initial icon */
  initialIcon?: ShortcutIcon;
  /** Called when user confirms */
  onConfirm: (data: {
    textContent: string;
    isChecklist: boolean;
    name: string;
    icon: ShortcutIcon;
  }) => void;
  /** Called when user taps back */
  onBack: () => void;
  /** Whether in creating state */
  isCreating?: boolean;
}

type EditorMode = 'note' | 'checklist';

interface ChecklistItem {
  id: string;
  text: string;
}

function generateChecklistText(items: ChecklistItem[]): string {
  return items.map(item => `☐ ${item.text}`).join('\n');
}

function parseChecklistItems(text: string): ChecklistItem[] {
  if (!text.trim()) return [];
  return text.split('\n')
    .filter(line => line.trim())
    .map((line, i) => ({
      id: `item-${i}`,
      text: line.replace(/^[☐☑]\s?/, '').trim(),
    }));
}

export function TextEditorStep({
  showIconPicker = true,
  isReminder = false,
  initialText = '',
  initialIsChecklist = false,
  initialName = '',
  initialIcon = { type: 'emoji', value: '📝' },
  onConfirm,
  onBack,
  isCreating = false,
}: TextEditorStepProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mode, setMode] = useState<EditorMode>(initialIsChecklist ? 'checklist' : 'note');
  const [noteText, setNoteText] = useState(initialIsChecklist ? '' : initialText);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(() => {
    if (!initialIsChecklist) return [{ id: 'item-0', text: '' }];
    return parseChecklistItems(initialText).length > 0
      ? parseChecklistItems(initialText)
      : [{ id: 'item-0', text: '' }];
  });
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState<ShortcutIcon>(initialIcon);

  // Derived values
  const currentText = mode === 'note' ? noteText : generateChecklistText(checklistItems);
  const charCount = currentText.length;
  const isOverLimit = charCount > MAX_CHARS;

  const isEmpty = mode === 'note'
    ? noteText.trim().length === 0
    : checklistItems.every(item => !item.text.trim());

  const canConfirm = !isEmpty && !isOverLimit && name.trim().length > 0;

  // ── Markdown toolbar ─────────────────────────────────────────────────────

  const applyMarkdown = useCallback((wrap: { before?: string; after?: string; linePrefix?: string }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selectedText = value.slice(start, end);

    let newValue: string;
    let newCursorStart: number;
    let newCursorEnd: number;

    if (wrap.linePrefix) {
      // Line prefix mode (e.g., # heading)
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const linePrefix = wrap.linePrefix;
      // Check if already prefixed — toggle off
      const currentLine = value.slice(lineStart, end || value.indexOf('\n', lineStart));
      if (currentLine.startsWith(linePrefix)) {
        newValue = value.slice(0, lineStart) + currentLine.slice(linePrefix.length) + value.slice(lineStart + currentLine.length);
        newCursorStart = start - linePrefix.length;
        newCursorEnd = end - linePrefix.length;
      } else {
        newValue = value.slice(0, lineStart) + linePrefix + value.slice(lineStart);
        newCursorStart = start + linePrefix.length;
        newCursorEnd = end + linePrefix.length;
      }
    } else {
      const before = wrap.before;
      const after = wrap.after ?? wrap.before;
      // Check if already wrapped — toggle off
      const isWrapped =
        value.slice(start - before.length, start) === before &&
        value.slice(end, end + after.length) === after;

      if (isWrapped) {
        newValue =
          value.slice(0, start - before.length) +
          selectedText +
          value.slice(end + after.length);
        newCursorStart = start - before.length;
        newCursorEnd = end - before.length;
      } else {
        newValue =
          value.slice(0, start) + before + selectedText + after + value.slice(end);
        newCursorStart = start + before.length;
        newCursorEnd = end + before.length;
      }
    }

    setNoteText(newValue);

    // Restore selection after state update
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
    });
  }, []);

  const insertHR = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const value = textarea.value;
    const hr = (pos > 0 && value[pos - 1] !== '\n' ? '\n' : '') + '\n---\n\n';
    const newValue = value.slice(0, pos) + hr + value.slice(pos);
    setNoteText(newValue);
    const newPos = pos + hr.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, []);

  // ── Checklist actions ────────────────────────────────────────────────────

  const addChecklistItem = useCallback(() => {
    setChecklistItems(prev => [...prev, { id: `item-${Date.now()}`, text: '' }]);
  }, []);

  const removeChecklistItem = useCallback((id: string) => {
    setChecklistItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);
  }, []);

  const updateChecklistItem = useCallback((id: string, text: string) => {
    setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, text } : i));
  }, []);

  // ── Mode switching ───────────────────────────────────────────────────────

  const handleModeSwitch = (newMode: EditorMode) => {
    if (newMode === mode) return;
    if (newMode === 'checklist' && noteText.trim()) {
      // Convert note lines to checklist items
      const items = noteText.split('\n')
        .filter(l => l.trim())
        .map((l, i) => ({ id: `item-${i}`, text: l.trim() }));
      setChecklistItems(items.length > 0 ? items : [{ id: 'item-0', text: '' }]);
    } else if (newMode === 'note' && checklistItems.some(i => i.text.trim())) {
      // Convert checklist to note lines
      setNoteText(checklistItems.map(i => i.text).filter(Boolean).join('\n'));
    }
    setMode(newMode);
  };

  // ── Confirm ──────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      textContent: currentText.slice(0, MAX_CHARS),
      isChecklist: mode === 'checklist',
      name: name.trim(),
      icon,
    });
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-header-safe pb-4 landscape:px-4 landscape:pt-2 landscape:pb-2 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="p-2 -ms-2 rounded-full hover:bg-muted active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <h2 className="text-lg font-semibold flex-1">{t('textEditor.title')}</h2>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 landscape:px-4 landscape:py-3 space-y-4">
        {/* Mode segmented control */}
        <div className="flex bg-muted/50 rounded-xl p-1 gap-1">
          {(['note', 'checklist'] as EditorMode[]).map(m => (
            <button
              key={m}
              onClick={() => handleModeSwitch(m)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                mode === m
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'note' ? t('textEditor.noteMode') : t('textEditor.checklistMode')}
            </button>
          ))}
        </div>

        {/* Note mode */}
        {mode === 'note' && (
          <div className="space-y-2">
            {/* Markdown toolbar */}
            <div className="flex items-center gap-1 px-1">
              <ToolbarButton onClick={() => applyMarkdown({ before: '**' })} title="Bold">
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton onClick={() => applyMarkdown({ before: '_' })} title="Italic">
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton onClick={() => applyMarkdown({ linePrefix: '# ' })} title="Heading 1">
                <Heading1 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton onClick={() => applyMarkdown({ linePrefix: '## ' })} title="Heading 2">
                <Heading2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton onClick={insertHR} title="Divider">
                <Minus className="h-4 w-4" />
              </ToolbarButton>
            </div>

            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder={t('textEditor.placeholder')}
              maxLength={MAX_CHARS + 100}
              className={cn(
                'w-full min-h-[160px] rounded-xl border border-input bg-background px-3 py-2.5 text-sm',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'resize-none transition-colors',
                isOverLimit && 'border-destructive focus-visible:ring-destructive'
              )}
              style={{ fontFamily: 'monospace' }}
            />
            <div className={cn(
              'text-xs text-right',
              isOverLimit ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {charCount} / {MAX_CHARS}
            </div>
          </div>
        )}

        {/* Checklist mode */}
        {mode === 'checklist' && (
          <div className="space-y-2">
            {checklistItems.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0 text-base">☐</span>
                <Input
                  value={item.text}
                  onChange={e => updateChecklistItem(item.id, e.target.value)}
                  placeholder={t('textEditor.checklistPlaceholder') + ` ${index + 1}`}
                  className="flex-1 h-10 rounded-xl"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                />
                <button
                  onClick={() => removeChecklistItem(item.id)}
                  disabled={checklistItems.length === 1}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {/* Add item */}
            <button
              onClick={addChecklistItem}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors py-1 px-1"
            >
              <Plus className="h-4 w-4" />
              {t('textEditor.addItem')}
            </button>

            {isOverLimit && (
              <p className="text-xs text-destructive">{charCount} / {MAX_CHARS}</p>
            )}
          </div>
        )}

        {/* Name field */}
        <div className="space-y-2">
          <Label htmlFor="text-shortcut-name">
            {isReminder ? t('scheduledActions.actionName', 'Name') : t('shortcutEdit.name', 'Name')}
          </Label>
          <Input
            id="text-shortcut-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('textEditor.namePlaceholder')}
            className="h-11 rounded-xl"
          />
        </div>

        {/* Icon picker (hidden for reminders) */}
        {showIconPicker && (
          <div className="space-y-2">
            <Label>{t('shortcutEdit.icon', 'Icon')}</Label>
            <IconPicker
              selectedIcon={icon}
              onSelect={setIcon}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-5 landscape:px-4 landscape:pb-3 pt-3 border-t border-border shrink-0">
        <Button
          onClick={handleConfirm}
          disabled={!canConfirm || isCreating}
          className="w-full h-12 landscape:h-10 rounded-2xl text-base"
        >
          {isCreating
            ? t('textEditor.creating')
            : isReminder
              ? t('common.continue', 'Continue')
              : t('textEditor.addToHomeScreen')
          }
        </Button>
      </div>
    </div>
  );
}

// Minimal toolbar button
function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted',
        'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring'
      )}
    >
      {children}
    </button>
  );
}
