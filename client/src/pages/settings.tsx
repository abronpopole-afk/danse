import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Cpu, Shield, Wifi, Key, Save, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { GtoConfig, PlatformConfig } from "@shared/schema";
import { AccountManager } from "@/components/platform/account-manager";

export default function SettingsPage() {
  const [gtoConfig, setGtoConfig] = useState<GtoConfig | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [gtoForm, setGtoForm] = useState({
    apiEndpoint: "",
    apiKey: "",
    enabled: false,
    fallbackToSimulation: true,
    cacheEnabled: true,
  });
  
  const [platformForm, setPlatformForm] = useState({
    platformName: "",
    username: "",
    enabled: false,
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setIsLoading(true);
      const [gtoData, platformData] = await Promise.all([
        api.gtoConfig.get(),
        api.platform.get(),
      ]);
      
      setGtoConfig(gtoData.config);
      setPlatformConfig(platformData.config);
      
      if (gtoData.config) {
        setGtoForm({
          apiEndpoint: gtoData.config.apiEndpoint || "",
          apiKey: gtoData.config.apiKey || "",
          enabled: gtoData.config.enabled,
          fallbackToSimulation: gtoData.config.fallbackToSimulation ?? true,
          cacheEnabled: gtoData.config.cacheEnabled ?? true,
        });
      }
      
      if (platformData.config) {
        setPlatformForm({
          platformName: platformData.config.platformName || "",
          username: platformData.config.username || "",
          enabled: platformData.config.enabled,
        });
      }
    } catch (error: any) {
      toast.error("Erreur lors du chargement: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveGtoConfig = async () => {
    try {
      setIsSaving(true);
      await api.gtoConfig.update(gtoForm);
      toast.success("Configuration GTO Wizard sauvegardée");
      await loadConfigs();
    } catch (error: any) {
      toast.error("Erreur: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const savePlatformConfig = async () => {
    try {
      setIsSaving(true);
      await api.platform.update(platformForm);
      toast.success("Configuration plateforme sauvegardée");
      await loadConfigs();
    } catch (error: any) {
      toast.error("Erreur: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-sans" data-testid="text-settings-title">
            Configuration
          </h1>
          <p className="text-muted-foreground">
            Paramètres du bot, intégration GTO Wizard et connexion plateforme.
          </p>
        </div>

        <Tabs defaultValue="gto" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="gto" className="flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              GTO Wizard
            </TabsTrigger>
            <TabsTrigger value="platform" className="flex items-center gap-2">
              <Wifi className="w-4 h-4" />
              Plateforme
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Sécurité
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gto" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-primary" />
                  Configuration GTO Wizard
                </CardTitle>
                <CardDescription>
                  Configurez la connexion à l'API GTO Wizard pour obtenir des recommandations en temps réel.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    {gtoForm.enabled && gtoForm.apiKey ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-medium">
                        Statut: {gtoForm.enabled && gtoForm.apiKey ? "Connecté à l'API" : "Mode Simulation"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {gtoForm.fallbackToSimulation 
                          ? "Fallback sur simulation si API indisponible"
                          : "Pas de fallback automatique"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={gtoForm.enabled}
                    onCheckedChange={(checked) => setGtoForm(prev => ({ ...prev, enabled: checked }))}
                    data-testid="switch-gto-enabled"
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="apiEndpoint">Endpoint API</Label>
                    <Input
                      id="apiEndpoint"
                      placeholder="https://api.gtowizard.com/v1"
                      value={gtoForm.apiEndpoint}
                      onChange={(e) => setGtoForm(prev => ({ ...prev, apiEndpoint: e.target.value }))}
                      data-testid="input-api-endpoint"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL de l'API GTO Wizard (laissez vide pour utiliser l'endpoint par défaut)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apiKey">Clé API</Label>
                    <div className="flex gap-2">
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="gto_xxxxxxxxxxxxxxxx"
                        value={gtoForm.apiKey}
                        onChange={(e) => setGtoForm(prev => ({ ...prev, apiKey: e.target.value }))}
                        data-testid="input-api-key"
                      />
                      <Button variant="outline" size="icon">
                        <Key className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Obtenez votre clé API depuis votre compte GTO Wizard Premium
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium">Options avancées</h4>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Fallback sur Simulation</Label>
                      <p className="text-sm text-muted-foreground">
                        Utiliser le moteur de simulation si l'API est indisponible
                      </p>
                    </div>
                    <Switch
                      checked={gtoForm.fallbackToSimulation}
                      onCheckedChange={(checked) => setGtoForm(prev => ({ ...prev, fallbackToSimulation: checked }))}
                      data-testid="switch-fallback"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Cache des requêtes</Label>
                      <p className="text-sm text-muted-foreground">
                        Mettre en cache les recommandations pour améliorer les performances
                      </p>
                    </div>
                    <Switch
                      checked={gtoForm.cacheEnabled}
                      onCheckedChange={(checked) => setGtoForm(prev => ({ ...prev, cacheEnabled: checked }))}
                      data-testid="switch-cache"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button 
                    onClick={saveGtoConfig}
                    disabled={isSaving}
                    data-testid="button-save-gto"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Sauvegarder
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      try {
                        const response = await api.gtoConfig.test();
                        if (response.success) {
                          toast.success("Connexion GTO réussie !");
                        } else {
                          toast.error("Échec de connexion: " + response.error);
                        }
                      } catch (error: any) {
                        toast.error("Erreur: " + error.message);
                      }
                    }}
                    disabled={!gtoForm.apiKey}
                  >
                    <Wifi className="w-4 h-4 mr-2" />
                    Tester connexion
                  </Button>
                  <Button variant="outline" onClick={loadConfigs} disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Recharger
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardHeader>
                <CardTitle className="text-sm font-mono text-cyan-500">
                  MODE SIMULATION ACTIF
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Le bot utilise actuellement un moteur GTO simulé basé sur des heuristiques avancées.
                  Pour une précision optimale, connectez-vous à l'API GTO Wizard avec une clé API valide.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded bg-background/50">
                    <p className="text-muted-foreground">Précision estimée</p>
                    <p className="text-xl font-bold text-cyan-500">~85%</p>
                  </div>
                  <div className="p-3 rounded bg-background/50">
                    <p className="text-muted-foreground">Latence moyenne</p>
                    <p className="text-xl font-bold text-cyan-500">&lt;5ms</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="platform" className="space-y-6">
            <AccountManager />
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Sécurité et Anti-Détection
                </CardTitle>
                <CardDescription>
                  Paramètres de sécurité pour éviter la détection du bot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle className="w-5 h-5" />
                      <p className="font-medium">Protection Active</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Le mode furtif est activé. Le bot simule un comportement humain naturel.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                      <div>
                        <p className="font-medium">Délais aléatoires</p>
                        <p className="text-sm text-muted-foreground">1.5s - 4.2s entre chaque action</p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                      <div>
                        <p className="font-medium">Mouvements de souris Bézier</p>
                        <p className="text-sm text-muted-foreground">Courbes naturelles du curseur</p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                      <div>
                        <p className="font-medium">Variance du timing</p>
                        <p className="text-sm text-muted-foreground">30% de variation sur les délais</p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                      <div>
                        <p className="font-medium">Mode furtif</p>
                        <p className="text-sm text-muted-foreground">Évite les actions instantanées</p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
