import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebugLog, setGlobalDebugLogger } from '@/hooks/useDebugLog';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default function DebugLog() {
  const navigate = useNavigate();
  const { entries, addEntry, clearLog } = useDebugLog();

  // Register global logger
  useEffect(() => {
    setGlobalDebugLogger(addEntry);
    return () => setGlobalDebugLogger(null);
  }, [addEntry]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Bug className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold flex-1">Shortcut Debug Log</h1>
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
