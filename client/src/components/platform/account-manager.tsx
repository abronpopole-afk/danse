import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Trash2, 
  Power, 
  PowerOff, 
  Pause, 
  Play, 
  Wifi, 
  WifiOff,
  AlertCircle,
  CheckCircle,
  Loader2
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PlatformConfig } from "@shared/schema";

interface AccountManagerProps {
  onAccountChange?: () => void;
}

export function AccountManager({ onAccountChange }: AccountManagerProps) {
  const [accounts, setAccounts] = useState<Array<PlatformConfig & { currentStatus?: string; managedTables?: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({
    platformName: "ggclub",
    username: "",
    password: "",
    rememberPassword: false,
    autoReconnect: true,
    enableAutoAction: true,
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      // Try to load from both DB and Tauri to ensure we see everything
      const [tauriResponse, dbResponse] = await Promise.all([
        api.platform.getActive(),
        api.platform.getAccounts() // This might hit the Express API
      ]);
      
      const combinedConfigs = [...(tauriResponse.configs || [])];
      
      // If we have DB accounts not in Tauri, add them as disconnected
      if (Array.isArray(dbResponse)) {
        dbResponse.forEach(dbAcc => {
          if (!combinedConfigs.find(c => c.username === dbAcc.username)) {
            combinedConfigs.push({
              ...dbAcc,
              accountId: dbAcc.id,
              currentStatus: "disconnected",
              managedTables: 0
            });
          }
        });
      }

      setAccounts(combinedConfigs);
    } catch (error: any) {
      toast.error("Erreur lors du chargement: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (accountId: string, username: string, password?: string, rememberPassword?: boolean) => {
    try {
      setIsConnecting(accountId);
      const config = accounts.find(a => a.accountId === accountId);
      if (!config) {
        throw new Error("Compte non trouvé");
      }
      
      // Si le compte a un mot de passe stocké, on peut se connecter sans le fournir
      // Sinon, demander le mot de passe
      let passwordToSend: string | undefined = password;
      const rememberPassword = (config.settings as any)?.rememberPassword ?? false;
      
      if (!passwordToSend && !rememberPassword) {
        const enteredPassword = prompt(`Entrez le mot de passe pour ${username}:`);
        if (!enteredPassword) {
          setIsConnecting(null);
          return;
        }
        passwordToSend = enteredPassword;
      }
      
      const result = await api.platform.connect({
        platformName: config.platformName,
        username,
        password: passwordToSend,
        rememberPassword: rememberPassword,
        autoReconnect: true,
        enableAutoAction: true,
      });
      
      if (result.success) {
        toast.success(`Connecté au compte ${username}`);
        await loadAccounts();
        onAccountChange?.();
      } else {
        toast.error("Échec de la connexion");
      }
    } catch (error: any) {
      toast.error("Erreur: " + error.message);
    } finally {
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      setIsConnecting(accountId);
      await api.platform.disconnect(accountId);
      toast.success("Compte déconnecté");
      await loadAccounts();
      onAccountChange?.();
    } catch (error: any) {
      toast.error("Erreur: " + error.message);
    } finally {
      setIsConnecting(null);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountForm.username || !newAccountForm.password) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    try {
      setIsConnecting("new");
      console.log("[ACCOUNT_MANAGER] Adding account to DB:", newAccountForm.username);
      
      // Enregistrer d'abord le compte dans la base de données via l'API Express
      const accountResponse = await api.platform.createAccount({
        platformName: newAccountForm.platformName,
        username: newAccountForm.username,
        password: newAccountForm.password,
        isActive: true
      });
      
      console.log("[ACCOUNT_MANAGER] DB Persistence Result:", accountResponse);

      // Tenter la connexion via Tauri invoke
      console.log("[ACCOUNT_MANAGER] Requesting platform connection via Tauri");
      const result = await api.platform.connect({
        platformName: newAccountForm.platformName,
        username: newAccountForm.username,
        password: newAccountForm.password,
        rememberPassword: newAccountForm.rememberPassword,
        autoReconnect: newAccountForm.autoReconnect,
        enableAutoAction: newAccountForm.enableAutoAction,
      });
      
      console.log("[ACCOUNT_MANAGER] Tauri Connect Result:", result);
      
      if (accountResponse || result.success) {
        toast.success(`Compte ${newAccountForm.username} enregistré avec succès`);
        setIsAddingAccount(false);
        setNewAccountForm({
          platformName: "ggclub",
          username: "",
          password: "",
          rememberPassword: false,
          autoReconnect: true,
          enableAutoAction: true,
        });
        await loadAccounts();
        onAccountChange?.();
      } else {
        toast.error("Échec de l'enregistrement du compte");
      }
    } catch (error: any) {
      console.error("[ACCOUNT_MANAGER] CRITICAL ERROR adding account:", error);
      toast.error("Erreur critique: " + error.message);
    } finally {
      setIsConnecting(null);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce compte ?")) {
      return;
    }

    try {
      await api.platform.disconnect(accountId);
      await api.platform.delete(accountId);
      toast.success("Compte supprimé");
      await loadAccounts();
      onAccountChange?.();
    } catch (error: any) {
      toast.error("Erreur: " + error.message);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/50">Connecté</Badge>;
      case "connecting":
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">Connexion...</Badge>;
      case "paused":
        return <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/50">En pause</Badge>;
      case "disconnected":
        return <Badge className="bg-gray-500/20 text-gray-500 border-gray-500/50">Déconnecté</Badge>;
      default:
        return <Badge variant="outline">Inconnu</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Comptes GGClub</h3>
          <p className="text-sm text-muted-foreground">
            Gérez plusieurs comptes simultanément
          </p>
        </div>
        <Dialog open={isAddingAccount} onOpenChange={setIsAddingAccount}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un compte
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter un nouveau compte</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Plateforme</Label>
                <Select
                  value={newAccountForm.platformName}
                  onValueChange={(value) => setNewAccountForm(prev => ({ ...prev, platformName: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ggclub">GGClub</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nom d'utilisateur</Label>
                <Input
                  placeholder="Votre pseudo"
                  value={newAccountForm.username}
                  onChange={(e) => setNewAccountForm(prev => ({ ...prev, username: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <Input
                  type="password"
                  placeholder="Votre mot de passe"
                  value={newAccountForm.password}
                  onChange={(e) => setNewAccountForm(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="rememberPassword"
                  checked={newAccountForm.rememberPassword}
                  onChange={(e) => setNewAccountForm(prev => ({ ...prev, rememberPassword: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="rememberPassword" className="text-sm font-normal cursor-pointer">
                  Se souvenir du mot de passe (chiffré)
                </Label>
              </div>
              <Button 
                onClick={handleAddAccount}
                disabled={isConnecting === "new"}
                className="w-full"
              >
                {isConnecting === "new" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter et connecter
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <WifiOff className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Aucun compte configuré</p>
            <p className="text-sm text-muted-foreground mt-2">
              Ajoutez votre premier compte pour commencer
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => {
            const isConnected = account.currentStatus === "running";
            const isLoading = isConnecting === account.accountId;
            
            return (
              <Card key={account.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isConnected ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-gray-500" />
                      )}
                      <div>
                        <CardTitle className="text-base">{account.username}</CardTitle>
                        <CardDescription>
                          {account.platformName} • {account.managedTables || 0} table(s)
                          {((account.settings as any)?.rememberPassword) && (
                            <span className="ml-2 text-xs text-green-500">🔒 Mot de passe sauvegardé</span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(account.currentStatus)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {isConnected ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(account.accountId!)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <PowerOff className="w-4 h-4 mr-2" />
                              Déconnecter
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await api.platform.pause(account.accountId);
                              await loadAccounts();
                            } catch (error: any) {
                              toast.error(error.message);
                            }
                          }}
                        >
                          <Pause className="w-4 h-4 mr-2" />
                          Pause
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          // Si le compte a un mot de passe stocké, essayer de se connecter directement
                          const rememberPassword = (account.settings as any)?.rememberPassword ?? false;
                          if (rememberPassword) {
                            handleConnect(account.accountId!, account.username || "", (account.settings as any)?.password);
                          } else {
                            // Sinon, demander le mot de passe
                            const password = prompt("Entrez le mot de passe pour ce compte:");
                            if (password) {
                              const remember = confirm("Se souvenir de ce mot de passe ? (chiffré)");
                              handleConnect(account.accountId!, account.username || "", password, remember);
                            }
                          }
                        }}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Power className="w-4 h-4 mr-2" />
                            {((account.settings as any)?.rememberPassword) ? "Reconnecter" : "Connecter"}
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(account.accountId!)}
                      disabled={isLoading}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
