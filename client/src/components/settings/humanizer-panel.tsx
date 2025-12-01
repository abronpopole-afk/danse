import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, MousePointer2, Clock, EyeOff, RefreshCw } from "lucide-react";
import { HumanizerSettings } from "@/lib/api";
import { useState, useEffect } from "react";

interface HumanizerPanelProps {
  settings: HumanizerSettings | null;
  onUpdate?: (updates: Partial<HumanizerSettings>) => Promise<void>;
  isUpdating?: boolean;
}

export function HumanizerPanel({ settings, onUpdate, isUpdating = false }: HumanizerPanelProps) {
  const [localSettings, setLocalSettings] = useState<HumanizerSettings | null>(settings);
  
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);
  
  const handleDelayChange = async (value: number[]) => {
    const percentage = value[0] / 100;
    const minDelay = Math.round(500 + percentage * 2000);
    const maxDelay = Math.round(minDelay + 1000 + percentage * 3000);
    
    setLocalSettings(prev => prev ? { ...prev, minDelayMs: minDelay, maxDelayMs: maxDelay } : null);
    
    if (onUpdate) {
      await onUpdate({ minDelayMs: minDelay, maxDelayMs: maxDelay });
    }
  };
  
  const handleToggle = async (key: keyof HumanizerSettings, value: boolean) => {
    setLocalSettings(prev => prev ? { ...prev, [key]: value } : null);
    
    if (onUpdate) {
      await onUpdate({ [key]: value } as Partial<HumanizerSettings>);
    }
  };
  
  const delaySliderValue = localSettings 
    ? [Math.round(((localSettings.minDelayMs - 500) / 2000) * 100)]
    : [33];
  
  const minDelayDisplay = localSettings?.minDelayMs 
    ? `${(localSettings.minDelayMs / 1000).toFixed(1)}s`
    : '1.5s';
  const maxDelayDisplay = localSettings?.maxDelayMs 
    ? `${(localSettings.maxDelayMs / 1000).toFixed(1)}s`
    : '4.2s';

  return (
    <Card className="bg-card/50 backdrop-blur border-border" data-testid="humanizer-panel">
      <CardHeader>
        <CardTitle className="text-lg font-mono flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          CONFIGURATION HUMANIZER
          {isUpdating && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Délai de Réflexion (Random)</Label>
              <p className="text-xs text-muted-foreground">Simule un temps de réflexion humain</p>
            </div>
            <span className="font-mono text-primary" data-testid="text-delay-range">
              {minDelayDisplay} - {maxDelayDisplay}
            </span>
          </div>
          <Slider 
            value={delaySliderValue} 
            max={100} 
            step={1} 
            className="w-full"
            onValueChange={handleDelayChange}
            data-testid="slider-delay"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base flex items-center gap-2">
                <MousePointer2 className="w-4 h-4" /> Mouvements de Souris (Bézier)
              </Label>
              <p className="text-xs text-muted-foreground">Courbes non-linéaires pour le curseur</p>
            </div>
            <Switch 
              checked={localSettings?.enableBezierMouse ?? true}
              onCheckedChange={(checked) => handleToggle('enableBezierMouse', checked)}
              data-testid="switch-bezier-mouse"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base flex items-center gap-2">
                <EyeOff className="w-4 h-4" /> Miss-click Occasionnel
              </Label>
              <p className="text-xs text-muted-foreground">
                {(localSettings?.misclickProbability ?? 0.0001) * 100}% de chance d'erreur
              </p>
            </div>
            <Switch 
              checked={localSettings?.enableMisclicks ?? false}
              onCheckedChange={(checked) => handleToggle('enableMisclicks', checked)}
              data-testid="switch-misclicks"
            />
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> Mode Furtif
              </Label>
              <p className="text-xs text-muted-foreground">Évite les actions instantanées suspectes</p>
            </div>
            <Switch 
              checked={localSettings?.stealthModeEnabled ?? true}
              onCheckedChange={(checked) => handleToggle('stealthModeEnabled', checked)}
              data-testid="switch-stealth"
            />
          </div>
        </div>
        
        {localSettings?.stealthModeEnabled && (
          <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-yellow-500 text-xs font-mono">
            <Clock className="w-3 h-3 inline mr-2" />
            MODE FURTIF ACTIVÉ: Le bot évitera les actions instantanées aux timings suspects (ex: 0ms sur check/fold).
          </div>
        )}
        
        {!localSettings?.stealthModeEnabled && (
          <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 text-red-500 text-xs font-mono">
            ⚠ MODE FURTIF DÉSACTIVÉ: Risque de détection accru
          </div>
        )}
      </CardContent>
    </Card>
  );
}
