
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ReplayViewer } from "@/components/debug/replay-viewer";
import { TauriTest } from "@/components/TauriTest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Bug, Activity } from "lucide-react";

interface DebugSession {
  id: string;
  startedAt: Date;
  stoppedAt: Date | null;
  platform: string;
  status: string;
}

export default function DebugPage() {
  const [sessions, setSessions] = useState<DebugSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch("/api/replay/sessions");
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error("Erreur chargement sessions:", error);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Bug className="w-8 h-8" />
              Debug Mode & Replay Viewer
            </h1>
            <p className="text-muted-foreground mt-1">
              Analyse détaillée des sessions et migration Tauri
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sessions List */}
          <div className="lg:col-span-1 space-y-6">
            <TauriTest />
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Sessions Disponibles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <Button
                        key={session.id}
                        variant={selectedSession === session.id ? "default" : "outline"}
                        className="w-full justify-start"
                        onClick={() => setSelectedSession(session.id)}
                      >
                        <div className="flex flex-col items-start w-full">
                          <div className="flex items-center gap-2 w-full">
                            <Eye className="w-3 h-3" />
                            <span className="text-xs truncate">
                              {new Date(session.startedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {session.platform}
                            </Badge>
                            <Badge 
                              variant={session.status === "stopped" ? "outline" : "default"}
                              className="text-[10px]"
                            >
                              {session.status}
                            </Badge>
                          </div>
                        </div>
                      </Button>
                    ))}
                    
                    {sessions.length === 0 && (
                      <div className="text-center text-muted-foreground py-8 text-sm">
                        Aucune session disponible
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Replay Viewer */}
          <div className="lg:col-span-2">
            {selectedSession ? (
              <ReplayViewer sessionId={selectedSession} />
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center h-[700px]">
                  <div className="text-center text-muted-foreground">
                    <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Sélectionnez une session pour voir le replay</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
