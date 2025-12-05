import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Pause,
  Activity,
  Wifi,
  WifiOff,
  Smartphone,
  Tablet,
  Monitor,
  RefreshCw,
  DollarSign,
  Clock,
  Layers,
  Users,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface SessionState {
  session: any;
  stats: {
    totalHandsPlayed: number;
    totalProfit: number;
    activeTables: number;
    averageWinRate: number;
  };
  tables: any[];
  autoPlayEnabled: boolean;
  platformStatus: string;
  connectedDevices: Array<{
    deviceId: string;
    deviceType: string;
    deviceName: string;
    connectedAt: string;
  }>;
}

interface LogEntry {
  id: number;
  sessionId: number;
  logType: string;
  message: string;
  metadata: any;
  createdAt: string;
}

function getDeviceIcon(deviceType: string) {
  switch (deviceType) {
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    case "tablet":
      return <Tablet className="h-4 w-4" />;
    case "desktop":
      return <Monitor className="h-4 w-4" />;
    default:
      return <Monitor className="h-4 w-4" />;
  }
}

function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  const userAgent = navigator.userAgent.toLowerCase();
  const screenWidth = window.innerWidth;

  if (/android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
    return "mobile";
  } else if (/ipad|tablet|playbook|silk/i.test(userAgent) || (screenWidth >= 768 && screenWidth < 1024)) {
    return "tablet";
  }
  return "desktop";
}

function formatCurrency(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  return `${isNegative ? "-" : "+"}$${absAmount.toFixed(2)}`;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function RemotePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isTogglingAutoPlay, setIsTogglingAutoPlay] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket connected");

      const deviceType = detectDeviceType();
      const deviceName = `${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Remote`;
      
      ws.send(JSON.stringify({
        type: "device_register",
        payload: { deviceType, deviceName }
      }));

      ws.send(JSON.stringify({ type: "request_session_state" }));
      ws.send(JSON.stringify({ type: "request_logs", payload: { limit: 30 } }));

      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, []);

  const handleMessage = (data: any) => {
    switch (data.type) {
      case "connected":
        if (data.payload?.tempDeviceId) {
          setDeviceId(data.payload.tempDeviceId);
        }
        break;

      case "device_registered":
        setDeviceId(data.payload.deviceId);
        break;

      case "initial_state":
      case "state":
      case "session_state":
        setSessionState({
          session: data.payload.session,
          stats: data.payload.stats || {
            totalHandsPlayed: 0,
            totalProfit: 0,
            activeTables: 0,
            averageWinRate: 0,
          },
          tables: data.payload.tables || [],
          autoPlayEnabled: data.payload.autoPlayEnabled ?? true,
          platformStatus: data.payload.platformStatus || "disconnected",
          connectedDevices: data.payload.connectedDevices || [],
        });
        break;

      case "logs_response":
        setLogs(data.payload.logs || []);
        break;

      case "auto_play_changed":
        setSessionState(prev => prev ? {
          ...prev,
          autoPlayEnabled: data.payload.enabled
        } : null);
        setIsTogglingAutoPlay(false);
        break;

      case "session_started":
      case "session_stopped":
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "request_session_state" }));
        }
        break;

      case "table_event":
      case "platform_action_executed":
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "request_logs", payload: { limit: 30 } }));
        }
        break;

      case "device_connected":
      case "device_disconnected":
        setSessionState(prev => prev ? {
          ...prev,
          connectedDevices: data.payload.connectedDevices || []
        } : null);
        break;

      case "platform_status_change":
        setSessionState(prev => prev ? {
          ...prev,
          platformStatus: data.payload.status
        } : null);
        break;

      default:
        break;
    }
  };

  const toggleAutoPlay = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    setIsTogglingAutoPlay(true);
    wsRef.current.send(JSON.stringify({
      type: "toggle_auto_play",
      payload: { enabled: !sessionState?.autoPlayEnabled }
    }));
  }, [sessionState?.autoPlayEnabled]);

  const refreshState = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({ type: "request_session_state" }));
    wsRef.current.send(JSON.stringify({ type: "request_logs", payload: { limit: 30 } }));
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const autoPlayEnabled = sessionState?.autoPlayEnabled ?? true;
  const stats = sessionState?.stats;
  const connectedDevices = sessionState?.connectedDevices || [];

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">GTO Bot Remote</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={refreshState}
            disabled={!isConnected}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Badge 
            variant={isConnected ? "default" : "destructive"}
            className="flex items-center gap-1"
            data-testid="badge-connection-status"
          >
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span>Connecté</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Déconnecté</span>
              </>
            )}
          </Badge>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Contrôle Auto-Play</span>
            <Badge
              variant={autoPlayEnabled ? "default" : "secondary"}
              className={autoPlayEnabled ? "bg-green-500/20 text-green-400 border-green-500/30" : ""}
              data-testid="badge-autoplay-status"
            >
              {autoPlayEnabled ? "Actif" : "Pause"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {autoPlayEnabled ? (
                <Play className="h-8 w-8 text-green-500" />
              ) : (
                <Pause className="h-8 w-8 text-yellow-500" />
              )}
              <div>
                <p className="font-medium" data-testid="text-autoplay-label">
                  {autoPlayEnabled ? "Bot en cours d'exécution" : "Bot en pause"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Appuyez pour {autoPlayEnabled ? "mettre en pause" : "reprendre"}
                </p>
              </div>
            </div>
            <Switch
              checked={autoPlayEnabled}
              onCheckedChange={toggleAutoPlay}
              disabled={!isConnected || isTogglingAutoPlay}
              data-testid="switch-autoplay"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Profit</span>
            </div>
            <p 
              className={`text-2xl font-bold ${(stats?.totalProfit ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}
              data-testid="text-profit"
            >
              {formatCurrency(stats?.totalProfit ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Mains</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-hands-count">
              {stats?.totalHandsPlayed ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tables</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-tables-count">
              {stats?.activeTables ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Appareils</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-devices-count">
              {connectedDevices.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Logs Récents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-4" data-testid="text-no-logs">
                Aucun log disponible
              </p>
            ) : (
              <div className="space-y-2">
                {logs.slice(0, 20).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-sm"
                    data-testid={`log-entry-${log.id}`}
                  >
                    {log.logType === "error" ? (
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    ) : log.logType === "success" ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Activity className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{log.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Appareils Connectés
          </CardTitle>
        </CardHeader>
        <CardContent>
          {connectedDevices.length === 0 ? (
            <p className="text-center text-muted-foreground py-4" data-testid="text-no-devices">
              Aucun appareil connecté
            </p>
          ) : (
            <div className="space-y-2">
              {connectedDevices.map((device) => (
                <div
                  key={device.deviceId}
                  className={`flex items-center justify-between p-2 rounded-md bg-muted/50 ${device.deviceId === deviceId ? 'ring-1 ring-primary' : ''}`}
                  data-testid={`device-${device.deviceId}`}
                >
                  <div className="flex items-center gap-2">
                    {getDeviceIcon(device.deviceType)}
                    <div>
                      <p className="font-medium text-sm">{device.deviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {device.deviceId === deviceId ? "Cet appareil" : `Connecté ${formatTime(device.connectedAt)}`}
                      </p>
                    </div>
                  </div>
                  {device.deviceId === deviceId && (
                    <Badge variant="outline" className="text-xs">Vous</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-4" />

      <p className="text-center text-xs text-muted-foreground">
        Status plateforme:{" "}
        <span className={sessionState?.platformStatus === "running" ? "text-green-500" : "text-yellow-500"}>
          {sessionState?.platformStatus || "déconnecté"}
        </span>
      </p>
    </div>
  );
}
