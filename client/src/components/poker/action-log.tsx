import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef, useState } from "react";
import { ActionLog as ActionLogType } from "@shared/schema";

interface ActionLogProps {
  logs: ActionLogType[];
  isLoading?: boolean;
}

type LogType = "info" | "action" | "warning" | "error" | "success";

function getLogType(logType: string): LogType {
  switch (logType.toLowerCase()) {
    case "action": return "action";
    case "warning": return "warning";
    case "error": return "error";
    case "success": return "success";
    default: return "info";
  }
}

function formatTime(date: Date | string | null): string {
  if (!date) return "--:--:--";
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function ActionLog({ logs, isLoading = false }: ActionLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const filteredLogs = logs.filter(log => {
    const matchesFilter = filter === "all" || getLogType(log.logType) === filter;
    const matchesSearch = searchTerm === "" || log.message.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const defaultLogs: { id: string; time: string; type: LogType; message: string }[] = filteredLogs.length === 0 
    ? [
        { id: "1", time: "--:--:--", type: "info", message: "En attente de connexion..." },
        { id: "2", time: "--:--:--", type: "info", message: "Démarrez une session pour voir les logs" },
      ]
    : filteredLogs.map(log => ({
        id: log.id,
        time: formatTime(log.createdAt),
        type: getLogType(log.logType),
        message: log.message,
      }));

  return (
    <div className="bg-black border border-border rounded-lg overflow-hidden font-mono text-xs h-full flex flex-col shadow-inner" data-testid="action-log">
      <div className="bg-secondary/50 p-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground">TERMINAL_LOGS</span>
          <div className="flex items-center gap-2">
            {isLoading && (
              <span className="text-primary text-[10px] animate-pulse">Chargement...</span>
            )}
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500/50" />
              <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
              <div className={`w-2 h-2 rounded-full ${logs.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-green-500/50'}`} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-background/50 border border-border/50 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-background/50 border border-border/50 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="all">Tous</option>
            <option value="info">Info</option>
            <option value="action">Actions</option>
            <option value="success">Succès</option>
            <option value="warning">Avertissements</option>
            <option value="error">Erreurs</option>
          </select>
        </div>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1">
          {defaultLogs.map((log) => (
            <div 
              key={log.id} 
              className="flex gap-3 opacity-90 hover:opacity-100 transition-opacity"
              data-testid={`log-entry-${log.id}`}
            >
              <span className="text-muted-foreground select-none">[{log.time}]</span>
              <span className={
                log.type === "action" ? "text-blue-400" :
                log.type === "warning" ? "text-yellow-400" :
                log.type === "success" ? "text-green-400" :
                log.type === "error" ? "text-red-400" :
                "text-gray-300"
              }>
                {log.type === "action" && "> "}
                {log.type === "error" && "✖ "}
                {log.type === "success" && "✓ "}
                {log.type === "warning" && "⚠ "}
                {log.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
