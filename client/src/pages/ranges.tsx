
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RefreshCw, Calendar, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

interface RangeStatus {
  currentVersion: string;
  lastUpdate: Date | null;
  nextUpdate: Date | null;
  sources: RangeSource[];
}

interface RangeSource {
  name: string;
  apiEndpoint?: string;
  updateFrequency: "daily" | "weekly" | "monthly";
  enabled: boolean;
}

export default function RangesPage() {
  const [status, setStatus] = useState<RangeStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newSource, setNewSource] = useState<Partial<RangeSource>>({
    name: "",
    apiEndpoint: "",
    updateFrequency: "weekly",
    enabled: true,
  });

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch("/api/ranges/status");
      const data = await response.json();
      setStatus(data);
    } catch (error: any) {
      console.error("Failed to load range status:", error);
    }
  };

  const handleForceUpdate = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch("/api/ranges/update", { method: "POST" });
      const data = await response.json();
      toast({
        title: "Mise à jour terminée",
        description: data.message,
      });
      await loadStatus();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSource = async (sourceName: string, enabled: boolean) => {
    try {
      const source = status?.sources.find(s => s.name === sourceName);
      if (!source) return;

      await fetch("/api/ranges/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...source, enabled }),
      });

      await loadStatus();
      toast({
        title: enabled ? "Source activée" : "Source désactivée",
        description: sourceName,
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addSource = async () => {
    if (!newSource.name) {
      toast({
        title: "Erreur",
        description: "Le nom de la source est requis",
        variant: "destructive",
      });
      return;
    }

    try {
      await fetch("/api/ranges/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSource),
      });

      setNewSource({
        name: "",
        apiEndpoint: "",
        updateFrequency: "weekly",
        enabled: true,
      });

      await loadStatus();
      toast({
        title: "Source ajoutée",
        description: newSource.name,
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeSource = async (name: string) => {
    try {
      await fetch(`/api/ranges/sources/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });

      await loadStatus();
      toast({
        title: "Source supprimée",
        description: name,
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Jamais";
    return new Date(date).toLocaleString("fr-FR");
  };

  const getDaysUntil = (date: Date | null) => {
    if (!date) return null;
    const now = new Date();
    const target = new Date(date);
    const days = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Ranges</h1>
          <p className="text-muted-foreground mt-2">
            Mise à jour automatique des ranges GTO toutes les semaines
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Statut des mises à jour
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Version actuelle</span>
                <Badge variant="outline">{status?.currentVersion || "—"}</Badge>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Dernière mise à jour</span>
                <span className="text-sm">{formatDate(status?.lastUpdate || null)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Prochaine mise à jour</span>
                <div className="text-right">
                  <span className="text-sm">{formatDate(status?.nextUpdate || null)}</span>
                  {status?.nextUpdate && (
                    <div className="text-xs text-muted-foreground">
                      Dans {getDaysUntil(status.nextUpdate)} jours
                    </div>
                  )}
                </div>
              </div>

              <Button 
                onClick={handleForceUpdate} 
                disabled={isUpdating}
                className="w-full"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isUpdating ? "animate-spin" : ""}`} />
                Forcer la mise à jour
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ajouter une source</CardTitle>
              <CardDescription>
                Ajouter une nouvelle source de ranges
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={newSource.name}
                  onChange={(e) => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="GTO Wizard, PioSolver, etc."
                />
              </div>

              <div className="space-y-2">
                <Label>API Endpoint (optionnel)</Label>
                <Input
                  value={newSource.apiEndpoint}
                  onChange={(e) => setNewSource(prev => ({ ...prev, apiEndpoint: e.target.value }))}
                  placeholder="https://api.gtowizard.com/..."
                />
              </div>

              <Button onClick={addSource} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sources configurées</CardTitle>
            <CardDescription>
              Gérez les sources de ranges actives
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {status?.sources.map((source) => (
                <div key={source.name} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {source.enabled ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <p className="font-medium">{source.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Mise à jour: {source.updateFrequency}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={source.enabled}
                      onCheckedChange={(checked) => toggleSource(source.name, checked)}
                    />
                    {source.name !== "Solver Simulation" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSource(source.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
