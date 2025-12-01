import { motion } from "framer-motion";
import tableBg from "@assets/generated_images/futuristic_digital_poker_table_top-down_view.png";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { TableState } from "@/lib/api";
import { GtoRecommendation } from "@shared/schema";

interface TableVisualizerProps {
  table?: TableState | null;
}

const CARD_DISPLAY: Record<string, { suit: string; color: string }> = {
  'h': { suit: '♥', color: 'text-red-500' },
  'd': { suit: '♦', color: 'text-red-500' },
  'c': { suit: '♣', color: 'text-black' },
  's': { suit: '♠', color: 'text-black' },
};

function CardDisplay({ card }: { card: string }) {
  if (!card || card === '??') {
    return (
      <div className="w-8 h-10 bg-gradient-to-br from-blue-900 to-blue-700 rounded border border-blue-500/30 flex items-center justify-center">
        <span className="text-white/30 text-xs">?</span>
      </div>
    );
  }
  
  const rank = card.charAt(0);
  const suit = card.charAt(1).toLowerCase();
  const display = CARD_DISPLAY[suit] || { suit: '?', color: 'text-gray-400' };
  
  return (
    <div className="w-8 h-10 bg-white rounded shadow-lg flex flex-col items-center justify-center border border-gray-300">
      <span className="text-xs font-bold text-black">{rank}</span>
      <span className={`text-xs ${display.color}`}>{display.suit}</span>
    </div>
  );
}

function CommunityCardDisplay({ card }: { card: string }) {
  if (!card) return null;
  
  const rank = card.charAt(0);
  const suit = card.charAt(1).toLowerCase();
  const display = CARD_DISPLAY[suit] || { suit: '?', color: 'text-gray-400' };
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-10 h-14 bg-white rounded shadow-lg flex flex-col items-center justify-center text-black font-bold border border-gray-300"
    >
      <span className="text-sm">{rank}</span>
      <span className={`text-sm ${display.color}`}>{display.suit}</span>
    </motion.div>
  );
}

export function TableVisualizer({ table }: TableVisualizerProps) {
  const defaultSeats = [
    { id: 1, x: "50%", y: "85%", name: "HERO", chips: "$0", cards: ["??", "??"], active: true },
    { id: 2, x: "20%", y: "70%", name: "Villain 1", chips: "$0", cards: ["??", "??"], active: false },
    { id: 3, x: "15%", y: "40%", name: "Villain 2", chips: "$0", cards: ["??", "??"], active: false },
    { id: 4, x: "50%", y: "15%", name: "Villain 3", chips: "$0", cards: ["??", "??"], active: false },
    { id: 5, x: "85%", y: "40%", name: "Villain 4", chips: "$0", cards: ["??", "??"], active: false },
    { id: 6, x: "80%", y: "70%", name: "Villain 5", chips: "$0", cards: ["??", "??"], active: false },
  ];
  
  const seats = table?.players?.length ? table.players.map((player, index) => ({
    id: index + 1,
    x: defaultSeats[index % 6].x,
    y: defaultSeats[index % 6].y,
    name: player.name || `Player ${index + 1}`,
    chips: `$${player.stack?.toFixed(2) || 0}`,
    cards: player.cards || ["??", "??"],
    active: player.isActive && !player.isFolded,
  })) : defaultSeats;
  
  if (table?.heroCards?.length) {
    seats[0] = {
      ...seats[0],
      name: "HERO",
      chips: `$${table.heroStack?.toFixed(2) || 0}`,
      cards: table.heroCards,
      active: table.isHeroTurn,
    };
  }
  
  const communityCards = table?.communityCards || [];
  const pot = table?.currentPot || 0;
  const tableName = table?.tableName || "Aucune table";
  const stakes = table?.stakes || "---";
  
  const recommendation = table?.lastGtoRecommendation as GtoRecommendation | undefined;

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border shadow-2xl bg-black" data-testid="table-visualizer">
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-60"
        style={{ backgroundImage: `url(${tableBg})` }}
      />
      
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur border border-primary/30 p-2 rounded font-mono text-xs text-primary">
          <span data-testid="text-table-name">TABLE: {tableName}</span>
          <br/>
          <span data-testid="text-stakes">STAKES: {stakes}</span>
          <br/>
          <span data-testid="text-pot">POT: ${pot.toFixed(2)}</span>
        </div>
        
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2">
          {communityCards.map((card, i) => (
            <CommunityCardDisplay key={i} card={card} />
          ))}
          {[...Array(5 - communityCards.length)].map((_, i) => (
            <div key={`empty-${i}`} className="w-10 h-14 border-2 border-dashed border-white/20 rounded flex items-center justify-center text-white/20 text-xs">
              {i + communityCards.length === 3 ? 'Flop' : 
               i + communityCards.length === 4 ? 'Turn' : 'Riv'}
            </div>
          ))}
        </div>
      </div>

      {seats.map((seat) => (
        <div
          key={seat.id}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
          style={{ left: seat.x, top: seat.y }}
          data-testid={`seat-${seat.id}`}
        >
          <div className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center bg-black/80 backdrop-blur ${seat.active ? 'border-primary shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-white/10'}`}>
            <span className="text-xs font-bold text-white/80 truncate px-1">{seat.name}</span>
            {seat.active && (
                <span className="absolute -bottom-1 w-2 h-2 bg-primary rounded-full animate-ping" />
            )}
          </div>
          <div className="bg-black/80 backdrop-blur border border-white/10 px-2 py-0.5 rounded text-[10px] font-mono text-white">
            {seat.chips}
          </div>
          {seat.id === 1 && table?.heroCards?.length ? (
            <div className="flex gap-1">
              {seat.cards.map((card: string, i: number) => (
                <CardDisplay key={i} card={card} />
              ))}
            </div>
          ) : null}
        </div>
      ))}

      {recommendation && (
        <motion.div 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="absolute right-4 top-20 w-48 bg-black/80 backdrop-blur border border-cyan-500/30 p-3 rounded-lg"
          data-testid="gto-recommendation"
        >
          <h4 className="text-xs font-bold text-cyan-500 font-mono mb-2 flex items-center gap-2">
            <Zap className="w-3 h-3" /> GTO RECOMMENDATION
          </h4>
          <div className="space-y-2">
            {recommendation.actions?.slice(0, 4).map((action: { action: string; probability: number; ev?: number }, i: number) => (
              <div key={i}>
                <div className="flex justify-between text-xs text-white">
                  <span>{action.action}</span>
                  <span className={action.action === recommendation.bestAction ? "text-primary font-bold" : "text-gray-400"}>
                    {Math.round(action.probability * 100)}%
                  </span>
                </div>
                <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${action.action === recommendation.bestAction ? 'bg-primary shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-gray-500'}`}
                    style={{ width: `${action.probability * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 text-xs text-gray-400">
            Confiance: {Math.round((recommendation.confidence || 0) * 100)}%
          </div>
        </motion.div>
      )}
      
      {!table && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <p className="text-white/60 text-lg font-mono">Aucune table sélectionnée</p>
            <p className="text-white/40 text-sm mt-2">Ajoutez une table pour commencer</p>
          </div>
        </div>
      )}
    </div>
  );
}
