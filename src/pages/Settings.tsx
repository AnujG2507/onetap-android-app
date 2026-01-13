import { ArrowLeft, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/useSettings';
import { useNavigate } from 'react-router-dom';

const Settings = () => {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-4 pt-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-10 w-10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </header>

      <div className="flex-1 p-4 space-y-6">
        {/* Video Playback Section */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Video Playback
          </h2>
          
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <MonitorPlay className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="external-player"
                    className="text-base font-medium cursor-pointer"
                  >
                    Always use external player
                  </Label>
                  <Switch
                    id="external-player"
                    checked={settings.alwaysUseExternalPlayer}
                    onCheckedChange={(checked) =>
                      updateSettings({ alwaysUseExternalPlayer: checked })
                    }
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  When enabled, all video shortcuts will open in your preferred video player app instead of the built-in player. This bypasses size and codec checks.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
