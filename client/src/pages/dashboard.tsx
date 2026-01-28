import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { TableVisualizer } from "@/components/poker/table-visualizer";
import { ActionLog } from "@/components/poker/action-log";
import { HumanizerPanel } from "@/components/settings/humanizer-panel";
import { ProfilePanel } from "@/components/settings/profile-panel";
import { StackVisualizer } from "@/components/poker/stack-visualizer";
import { TiltMonitor } from "@/components/poker/tilt-monitor";
import { InteractiveTutorial } from "@/components/tutorial/interactive-tutorial";
import { useBotState } from "@/hooks/use-bot-state";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Play, Square, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getPlayerProfile, updatePlayerPersonality, resetPlayerProfile, HumanizerSettings } from "@/lib/api";


export default function Dashboard() {
  const {
    session,
    tables,
    stats,
    logs,
    humanizerSettings,
    isLoading,
    isConnected,
    error,
    startSession,
    stopSession,
    forceStopSession,
    addTable,
    removeTable,
    updateHumanizer,
    refreshLogs,
  } = useBotState();

  const [isAddingTable, setIsAddingTable] = useState(false);
  const [newTableForm, setNewTableForm] = useState({
    tableIdentifier: "",
    tableName: "",
    stakes: "NL100",
  });
  const [isUpdatingHumanizer, setIsUpdatingHumanizer] = useState(false);
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [playerProfile, setPlayerProfile] = useState<any>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    const loadPlayerProfile = async () => {
      try {
        const profileData = await getPlayerProfile();
        setPlayerProfile(profileData);
      } catch (err) {
        console.error("Erreur chargement profil:", err);
      }
    };

    loadPlayerProfile();
  }, []);


  const handleStartSession = async () => {
    try {
      await startSession();
      toast.success("Session démarrée");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors du démarrage");
    }
  };

  const handleStopSession = async () => {
    try {
      await stopSession();
      toast.success("Session arrêtée");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'arrêt");
    }
  };

  const handleForceStop = async () => {
    try {
      await forceStopSession();
      toast.success("Session arrêtée de force");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'arrêt forcé");
    }
  };

  const handleAddTable = async () => {
    if (!newTableForm.tableIdentifier || !newTableForm.tableName) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    try {
      await addTable(newTableForm);
      setIsAddingTable(false);
      setNewTableForm({ tableIdentifier: "", tableName: "", stakes: "NL100" });
      toast.success("Table ajoutée");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'ajout");
    }
  };

  const handleUpdateHumanizer = async (updates: Partial<HumanizerSettings>) => {
    setIsUpdatingHumanizer(true);
    try {
      await updateHumanizer(updates);
    } catch (err) {
      console.error("Erreur mise à jour humanizer:", err);
    } finally {
      setIsUpdatingHumanizer(false);
    }
  };

  const handleUpdatePersonality = async (personality: string) => {
    setIsUpdatingProfile(true);
    try {
      const updated = await updatePlayerPersonality(personality);
      setPlayerProfile(updated);
    } catch (err) {
      console.error("Erreur mise à jour personnalité:", err);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleResetProfile = async () => {
    setIsUpdatingProfile(true);
    try {
      await resetPlayerProfile();
      const updated = await getPlayerProfile();
      setPlayerProfile(updated);
    } catch (err) {
      console.error("Erreur reset profil:", err);
    } finally {
      setIsUpdatingProfile(false);
    }
  };


  const selectedTable = tables[selectedTableIndex] || null;

  const sessionDuration = session?.startedAt 
    ? formatDuration(new Date().getTime() - new Date(session.startedAt).getTime())
    : "0h 0m";

  return (
    <DashboardLayout>
      <InteractiveTutorial />
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-sans" data-testid="text-title">
              Tableau de Bord
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              Surveillance en temps réel des opérations GTO.
              {isConnected ? (
                <span className="flex items-center gap-1 text-green-500 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Connecté
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-500 text-sm">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Connexion...
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {session ? (
              <>
                <Button 
                  variant="destructive"
                  onClick={handleStopSession}
                  className="font-mono text-sm"
                  data-testid="button-stop-session"
                >
                  <Square className="w-4 h-4 mr-2" />
                  STOP URGENCE
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleForceStop}
                  className="font-mono text-sm border-destructive text-destructive hover:bg-destructive/10"
                  data-testid="button-force-stop"
                  title="Forcer l'arrêt si la session est bloquée"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  FORCER
                </Button>
              </>
            ) : (
              <Button 
                onClick={handleStartSession}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-sm shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                disabled={isLoading}
                data-testid="button-start-session"
              >
                <Play className="w-4 h-4 mr-2" />
                DÉMARRER SESSION
              </Button>
            )}

            <Dialog open={isAddingTable} onOpenChange={setIsAddingTable}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline"
                  className="font-mono text-sm"
                  disabled={!session}
                  data-testid="button-add-table"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  NOUVELLE TABLE
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter une nouvelle table</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="tableIdentifier">Identifiant de la table</Label>
                    <Input
                      id="tableIdentifier"
                      placeholder="Ex: table_123456"
                      value={newTableForm.tableIdentifier}
                      onChange={(e) => setNewTableForm(prev => ({ ...prev, tableIdentifier: e.target.value }))}
                      data-testid="input-table-identifier"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tableName">Nom de la table</Label>
                    <Input
                      id="tableName"
                      placeholder="Ex: NL500 Table #492"
                      value={newTableForm.tableName}
                      onChange={(e) => setNewTableForm(prev => ({ ...prev, tableName: e.target.value }))}
                      data-testid="input-table-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stakes">Stakes</Label>
                    <Select
                      value={newTableForm.stakes}
                      onValueChange={(value) => setNewTableForm(prev => ({ ...prev, stakes: value }))}
                    >
                      <SelectTrigger data-testid="select-stakes">
                        <SelectValue placeholder="Sélectionner les stakes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NL2">NL2 ($0.01/$0.02)</SelectItem>
                        <SelectItem value="NL5">NL5 ($0.02/$0.05)</SelectItem>
                        <SelectItem value="NL10">NL10 ($0.05/$0.10)</SelectItem>
                        <SelectItem value="NL25">NL25 ($0.10/$0.25)</SelectItem>
                        <SelectItem value="NL50">NL50 ($0.25/$0.50)</SelectItem>
                        <SelectItem value="NL100">NL100 ($0.50/$1.00)</SelectItem>
                        <SelectItem value="NL200">NL200 ($1.00/$2.00)</SelectItem>
                        <SelectItem value="NL500">NL500 ($2.50/$5.00)</SelectItem>
                        <SelectItem value="NL1000">NL1000 ($5.00/$10.00)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleAddTable}
                    className="w-full"
                    data-testid="button-confirm-add-table"
                  >
                    Ajouter la table
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/50 text-destructive flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        <StatsGrid 
          stats={stats}
          humanizerSettings={humanizerSettings}
          sessionDuration={sessionDuration}
          bbPer100={8.4}
          gtoPrecision={98.2}
        />

        {tables.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {tables.map((table, index) => (
              <Button
                key={table.id}
                variant={selectedTableIndex === index ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTableIndex(index)}
                className="font-mono text-xs whitespace-nowrap"
                data-testid={`button-select-table-${index}`}
              >
                {table.tableName}
                <span className={`ml-2 w-2 h-2 rounded-full ${
                  table.status === 'playing' ? 'bg-green-500' :
                  table.status === 'paused' ? 'bg-yellow-500' : 'bg-gray-500'
                }`} />
              </Button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <TableVisualizer table={selectedTable} />
            <div className="flex-1 min-h-0">
              <ActionLog logs={logs} isLoading={isLoading} />
            </div>
          </div>
          <div className="lg:col-span-1 flex flex-col gap-6">
            <TiltMonitor profile={playerProfile} />
            {selectedTable?.players && (
              <StackVisualizer 
                players={selectedTable.players} 
                heroPosition={selectedTable.heroPosition}
              />
            )}
            <HumanizerPanel 
              settings={humanizerSettings}
              onUpdate={handleUpdateHumanizer}
              isUpdating={isUpdatingHumanizer}
            />
            <ProfilePanel 
              profile={playerProfile}
              onUpdatePersonality={handleUpdatePersonality}
              onReset={handleResetProfile}
              isUpdating={isUpdatingProfile}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}