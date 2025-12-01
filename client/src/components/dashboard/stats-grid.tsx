import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, DollarSign, Zap, Target, Clock } from "lucide-react";
import { TableStats, HumanizerSettings } from "@/lib/api";

interface StatsGridProps {
  stats: TableStats;
  humanizerSettings: HumanizerSettings | null;
  sessionDuration?: string;
  bbPer100?: number;
  gtoPrecision?: number;
}

export function StatsGrid({ 
  stats, 
  humanizerSettings,
  sessionDuration = "0h 0m",
  bbPer100 = 0,
  gtoPrecision = 0
}: StatsGridProps) {
  const profitFormatted = stats.totalProfit >= 0 
    ? `+$${stats.totalProfit.toFixed(2)}` 
    : `-$${Math.abs(stats.totalProfit).toFixed(2)}`;
  
  const profitTrend = stats.totalProfit >= 0;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card className="bg-card border-border/50 shadow-lg" data-testid="card-profit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground font-mono">PROFIT NET</CardTitle>
          <DollarSign className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold flex items-center gap-2 ${profitTrend ? 'text-primary' : 'text-destructive'}`}>
            {profitFormatted}
            <span className={`text-xs px-1.5 py-0.5 rounded flex items-center ${profitTrend ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
              {profitTrend ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
              {Math.abs(stats.totalProfit > 0 ? 12 : -5)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono" data-testid="text-session-duration">
            Session en cours ({sessionDuration})
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/50 shadow-lg" data-testid="card-bbper100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground font-mono">BB/100</CardTitle>
          <Zap className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2">
            {bbPer100.toFixed(1)} BB
            <span className="text-xs bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">
              {bbPer100 > 5 ? 'Excellent' : bbPer100 > 0 ? 'Stable' : 'Attention'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono" data-testid="text-hands-played">
            Moyenne sur {stats.totalHandsPlayed} mains
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/50 shadow-lg" data-testid="card-gto-precision">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground font-mono">PRÉCISION GTO</CardTitle>
          <Target className="h-4 w-4 text-cyan-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-cyan-500 flex items-center gap-2">
            {gtoPrecision.toFixed(1)}%
            <span className="text-xs bg-cyan-500/20 text-cyan-500 px-1.5 py-0.5 rounded flex items-center">
              <ArrowUpRight className="w-3 h-3 mr-1" /> 0.5%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono">Déviations mineures</p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/50 shadow-lg" data-testid="card-hands-per-hour">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground font-mono">MAINS/HEURE</CardTitle>
          <Clock className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2">
            {stats.activeTables > 0 ? stats.activeTables * 70 : 0}
            <span className="text-xs bg-purple-500/20 text-purple-500 px-1.5 py-0.5 rounded flex items-center" data-testid="text-active-tables">
              {stats.activeTables} Table{stats.activeTables > 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {stats.activeTables > 0 ? 'Vitesse optimale' : 'Aucune table active'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
