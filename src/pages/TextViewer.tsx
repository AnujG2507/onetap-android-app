import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface TextViewerState {
  textContent: string;
  isChecklist: boolean;
  name: string;
}

interface ChecklistItem {
  text: string;
  checked: boolean;
}

function parseChecklist(raw: string): ChecklistItem[] {
  return raw.split('\n').map((line) => {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)/);
    if (match) {
      return { checked: match[1].toLowerCase() === 'x', text: match[2] };
    }
    // Non-checklist lines treated as unchecked items
    const stripped = line.replace(/^\s*-\s*/, '');
    return { checked: false, text: stripped };
  }).filter(item => item.text.trim().length > 0);
}

function renderMarkdown(text: string) {
  // Very lightweight markdown renderer (bold, italic, inline code, line breaks)
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const key = i;
    if (line.startsWith('# ')) {
      return <h1 key={key} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={key} className="text-xl font-semibold mt-3 mb-1">{line.slice(3)}</h2>;
    }
    if (line.startsWith('### ')) {
      return <h3 key={key} className="text-lg font-semibold mt-2 mb-1">{line.slice(4)}</h3>;
    }
    if (line.trim() === '') {
      return <div key={key} className="h-3" />;
    }
    // Inline bold/italic/code (simple pass)
    const rendered = line
      .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded text-sm font-mono">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return (
      <p
        key={key}
        className="text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    );
  });
}

export default function TextViewer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  const state = location.state as TextViewerState | null;
  const textContent = state?.textContent ?? '';
  const isChecklist = state?.isChecklist ?? false;
  const name = state?.name ?? '';

  const STORAGE_KEY = `checklist_state_${id}`;

  const [items, setItems] = useState<ChecklistItem[]>(() => {
    if (!isChecklist) return [];
    const parsed = parseChecklist(textContent);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const savedChecked: boolean[] = JSON.parse(saved);
        return parsed.map((item, i) => ({
          ...item,
          checked: savedChecked[i] ?? item.checked,
        }));
      }
    } catch { /* ignore */ }
    return parsed;
  });

  const toggleItem = (index: number) => {
    setItems(prev => {
      const next = prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item
      );
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(it => it.checked)));
      } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 -ml-1"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold truncate flex-1">{name}</h1>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-5 max-w-2xl mx-auto">
          {isChecklist ? (
            <div className="space-y-1">
              {items.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No items</p>
              ) : (
                items.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <Checkbox
                      id={`chk-${i}`}
                      checked={item.checked}
                      onCheckedChange={() => toggleItem(i)}
                      className="mt-0.5 shrink-0"
                    />
                    <label
                      htmlFor={`chk-${i}`}
                      className={cn(
                        'text-base leading-relaxed select-none cursor-pointer flex-1',
                        item.checked && 'line-through text-muted-foreground'
                      )}
                    >
                      {item.text}
                    </label>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-1 text-base">
              {renderMarkdown(textContent)}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
