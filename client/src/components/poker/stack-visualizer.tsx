
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { PlayerData } from "@shared/schema";

interface StackVisualizerProps {
  players: PlayerData[];
  heroPosition?: number;
}

export function StackVisualizer({ players, heroPosition }: StackVisualizerProps) {
  const sortedPlayers = [...players].sort((a, b) => b.stack - a.stack);
  const maxStack = Math.max(...players.map(p => p.stack));
  const totalStack = players.reduce((sum, p) => sum + p.stack, 0);
  const avgStack = totalStack / players.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-mono flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          Répartition des Stacks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedPlayers.map((player, index) => {
          const isHero = player.position === heroPosition;
          const stackPercentage = (player.stack / maxStack) * 100;
          const vsAverage = ((player.stack - avgStack) / avgStack) * 100;

          return (
            <div key={player.position} className={`p-2 rounded ${isHero ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/20'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{index + 1}.</span>
                  <span className={`text-sm font-medium ${isHero ? 'text-primary' : 'text-foreground'}`}>
                    {player.name}
                    {isHero && <Badge className="ml-2 text-xs">VOUS</Badge>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">${player.stack.toFixed(2)}</span>
                  {vsAverage > 0 ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-xs ${vsAverage > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {vsAverage > 0 ? '+' : ''}{vsAverage.toFixed(1)}%
                  </span>
                </div>
              </div>
              <Progress value={stackPercentage} className="h-2" />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>{player.currentBet ? `Mise: $${player.currentBet.toFixed(2)}` : 'Pas de mise'}</span>
                <span>{(player.stack / totalStack * 100).toFixed(1)}% du total</span>
              </div>
            </div>
          );
        })}
        <div className="pt-2 border-t border-border text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stack total:</span>
            <span className="font-bold">${totalStack.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stack moyen:</span>
            <span className="font-bold">${avgStack.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
