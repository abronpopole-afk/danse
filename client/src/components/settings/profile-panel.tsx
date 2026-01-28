
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Brain, Zap, Clock, TrendingUp, TrendingDown, AlertTriangle, RotateCcw } from "lucide-react";
import { PlayerProfileData } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

interface ProfilePanelProps {
  profile: PlayerProfileData | null;
  onUpdatePersonality?: (personality: string) => Promise<void>;
  onReset?: () => Promise<void>;
  isUpdating?: boolean;
}

const PERSONALITIES = [
  { value: "aggressive", label: "Agressif", color: "bg-red-500" },
  { value: "passive", label: "Passif", color: "bg-blue-500" },
  { value: "thinking", label: "Réfléchi", color: "bg-purple-500" },
  { value: "balanced", label: "Équilibré", color: "bg-green-500" },
  { value: "tired", label: "Fatigué", color: "bg-yellow-500" },
  { value: "tilted", label: "Tilt", color: "bg-orange-500" },
];

export function ProfilePanel({ profile, onUpdatePersonality, onReset, isUpdating = false }: ProfilePanelProps) {
  if (!profile) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border">
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">Chargement du profil...</p>
        </CardContent>
      </Card>
    );
  }

  const { state, modifiers } = profile;
  const currentPersonality = PERSONALITIES.find(p => p.value === state?.personality);

  return (
    <Card className="bg-card/50 backdrop-blur border-border">
      <CardHeader>
        <CardTitle className="text-lg font-mono flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          PROFIL JOUEUR DYNAMIQUE
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Personnalité actuelle */}
        <div className="space-y-2">
          <Label className="text-sm">Personnalité Active</Label>
          <div className="flex items-center gap-2">
            <Badge className={`${currentPersonality?.color} text-white`}>
              {currentPersonality?.label || state?.personality || "Inconnue"}
            </Badge>
            {(state?.personality === "tilted" || state?.personality === "tired") && (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            )}
          </div>
        </div>

        {/* Sélection personnalité */}
        <div className="space-y-2">
          <Label className="text-sm">Changer de Personnalité</Label>
          <div className="grid grid-cols-3 gap-2">
            {PERSONALITIES.filter(p => p.value !== "tilted" && p.value !== "tired").map((personality) => (
              <Button
                key={personality.value}
                variant={state?.personality === personality.value ? "default" : "outline"}
                size="sm"
                onClick={() => onUpdatePersonality?.(personality.value)}
                disabled={isUpdating}
                className="text-xs"
              >
                {personality.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Indicateurs d'état */}
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <Label className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Niveau de Tilt
              </Label>
              <span className="font-mono text-orange-500">{Math.round((state?.tiltLevel || 0) * 100)}%</span>
            </div>
            <Progress value={(state?.tiltLevel || 0) * 100} className="h-2" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                Fatigue
              </Label>
              <span className="font-mono text-yellow-500">{Math.round((state?.fatigueLevel || 0) * 100)}%</span>
            </div>
            <Progress value={(state?.fatigueLevel || 0) * 100} className="h-2" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <Label className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-blue-500" />
                Focus
              </Label>
              <span className="font-mono text-blue-500">{Math.round((state?.currentFocus || 0) * 100)}%</span>
            </div>
            <Progress value={(state?.currentFocus || 0) * 100} className="h-2" />
          </div>
        </div>

        {/* Statistiques de session */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <Label className="text-xs text-muted-foreground">Session</Label>
            <p className="font-mono text-sm">{Math.round(state?.sessionDuration || 0)} min</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Bad Beats</Label>
            <p className="font-mono text-sm">{state?.recentBadBeats || 0}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              Wins
            </Label>
            <p className="font-mono text-sm text-green-500">{state?.consecutiveWins || 0}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-red-500" />
              Losses
            </Label>
            <p className="font-mono text-sm text-red-500">{state?.consecutiveLosses || 0}</p>
          </div>
        </div>

        {/* Modifiers actifs */}
        <div className="pt-4 border-t space-y-2">
          <Label className="text-xs text-muted-foreground">Modifiers Actifs</Label>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>Délai: {(modifiers?.delayMultiplier || 1).toFixed(2)}x</div>
            <div>Variance: {(modifiers?.varianceMultiplier || 1).toFixed(2)}x</div>
            <div>Erreurs: {((modifiers?.errorProbability || 0) * 100).toFixed(1)}%</div>
            <div>Aggression: {(modifiers?.aggressionShift || 0) > 0 ? '+' : ''}{((modifiers?.aggressionShift || 0) * 100).toFixed(0)}%</div>
          </div>
        </div>

        {/* Reset */}
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={onReset}
          disabled={isUpdating}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Réinitialiser Profil
        </Button>
      </CardContent>
    </Card>
  );
}
