import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { ArrowLeft, Trash2, Bug, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useDebugLog, setGlobalDebugLogger, DebugEntry } from '@/hooks/useDebugLog';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatEntryAsText(entry: DebugEntry): string {
  return [
    `[${formatTime(entry.timestamp)}] ${entry.shortcutName}`,
    `  Playback: ${entry.playbackPath}`,
    `  Scheme: ${entry.uriScheme}`,
    `  Size: ${formatBytes(entry.detectedSize)}`,
    `  MIME: ${entry.mimeType || '—'}`,
    `  URI: ${entry.uri}`,
    entry.notes ? `  Notes: ${entry.notes}` : '',
  ].filter(Boolean).join('\n');
}

function formatAllEntriesAsText(entries: DebugEntry[]): string {
  if (entries.length === 0) return 'No debug entries.';
  const header = `OneTap Debug Log (${entries.length} entries)\nExported: ${new Date().toLocaleString()}\n${'—'.repeat(40)}\n`;
  return header + entries.map(formatEntryAsText).join('\n\n');
}

export default function DebugLog() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { entries, addEntry, clearLog } = useDebugLog();

  // Register global logger
  useEffect(() => {
    setGlobalDebugLogger(addEntry);
    return () => setGlobalDebugLogger(null);
  }, [addEntry]);

  const handleExport = async () => {
    const text = formatAllEntriesAsText(entries);

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: 'OneTap Debug Log',
          text,
          dialogTitle: 'Share Debug Log',
        });
      } catch (e) {
        console.warn('[DebugLog] Share failed:', e);
        toast({ title: 'Share cancelled', variant: 'default' });
      }
    } else {
      // Web fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: 'Copied to clipboard', description: 'Debug log copied.' });
      } catch (e) {
        console.error('[DebugLog] Clipboard write failed:', e);
        toast({ title: 'Copy failed', variant: 'destructive' });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Bug className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold flex-1">Shortcut Debug Log</h1>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={entries.length === 0}>
          <Share2 className="h-4 w-4 mr-1" />
          Share
        </Button>
        <Button variant="destructive" size="sm" onClick={clearLog} disabled={entries.length === 0}>
          <Trash2 className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bug className="h-12 w-12 mb-4 opacity-40" />
            <p>No debug entries yet.</p>
            <p className="text-sm">Create or tap a shortcut to see logs.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <Card key={entry.id} className="overflow-hidden">
                <CardHeader className="py-3 px-4 bg-muted/40">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <span className="truncate flex-1">{entry.shortcutName}</span>
                    <Badge
                      variant={entry.playbackPath === 'external' ? 'secondary' : 'default'}
                      className="shrink-0"
                    >
                      {entry.playbackPath}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3 px-4 text-xs space-y-1.5">
                  <Row label="Time" value={formatTime(entry.timestamp)} />
                  <Row label="URI Scheme" value={entry.uriScheme} mono />
                  <Row label="Size" value={formatBytes(entry.detectedSize)} />
                  <Row label="MIME" value={entry.mimeType || '—'} mono />
                  <Row label="URI" value={entry.uri} mono truncate />
                  {entry.notes && <Row label="Notes" value={entry.notes} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span
        className={`break-all ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
