
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Zap, Flame, ThermometerSun } from "lucide-react";
import { PlayerProfileState } from "@shared/schema";

interface TiltMonitorProps {
  profile: PlayerProfileState | null;
}

export function TiltMonitor({ profile }: TiltMonitorProps) {
  if (!profile) {
    return null;
  }

  const tiltLevel = profile?.tiltLevel || 0;
  const fatigueLevel = profile?.fatigueLevel || 0;
  const recentBadBeats = profile?.recentBadBeats || 0;
  const consecutiveLosses = profile?.consecutiveLosses || 0;

  const getTiltColor = (level: number) => {
    if (level < 0.3) return "text-green-500";
    if (level < 0.6) return "text-yellow-500";
    return "text-red-500";
  };

  const getTiltStatus = (level: number) => {
    if (level < 0.3) return "Optimal";
    if (level < 0.6) return "Attention";
    return "DANGER";
  };

  const getTiltIcon = (level: number) => {
    if (level < 0.3) return <Zap className="w-5 h-5 text-green-500" />;
    if (level < 0.6) return <ThermometerSun className="w-5 h-5 text-yellow-500" />;
    return <Flame className="w-5 h-5 text-red-500 animate-pulse" />;
  };

  return (
    <Card className={tiltLevel > 0.6 ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]" : ""}>
      <CardHeader>
        <CardTitle className="text-sm font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getTiltIcon(tiltLevel)}
            Moniteur de Tilt
          </div>
          <Badge className={`${tiltLevel > 0.6 ? 'bg-red-500/20 text-red-500' : tiltLevel > 0.3 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
            {getTiltStatus(tiltLevel)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">Niveau de Tilt</span>
            <span className={`text-xs font-bold ${getTiltColor(tiltLevel)}`}>
              {(tiltLevel * 100).toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={tiltLevel * 100} 
            className={`h-2 ${tiltLevel > 0.6 ? '[&>div]:bg-red-500' : tiltLevel > 0.3 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500'}`}
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">Fatigue</span>
            <span className="text-xs font-bold">{(fatigueLevel * 100).toFixed(0)}%</span>
          </div>
          <Progress value={fatigueLevel * 100} className="h-2" />
        </div>

        {tiltLevel > 0.6 && (
          <div className="p-3 rounded bg-red-500/10 border border-red-500/30 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-red-500">
              <p className="font-bold mb-1">Niveau de tilt élevé détecté !</p>
              <p>Considérez une pause ou réduisez les stakes.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <div className="text-center p-2 rounded bg-secondary/30">
            <div className="text-xs text-muted-foreground">Bad Beats</div>
            <div className="text-lg font-bold text-orange-500">{recentBadBeats}</div>
          </div>
          <div className="text-center p-2 rounded bg-secondary/30">
            <div className="text-xs text-muted-foreground">Pertes d'affilée</div>
            <div className="text-lg font-bold text-red-500">{consecutiveLosses}</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Personnalité: <span className="text-primary font-bold">{profile?.personality || 'N/A'}</span>
        </div>
      </CardContent>
    </Card>
  );
}
