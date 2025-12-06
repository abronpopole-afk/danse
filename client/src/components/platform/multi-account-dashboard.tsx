
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, TrendingUp, Clock, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface AccountStats {
  accountId: string;
  username: string;
  status: string;
  profit: number;
  handsPlayed: number;
  activeTables: number;
  sessionDuration: number;
}

export function MultiAccountDashboard() {
  const [accounts, setAccounts] = useState<AccountStats[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  useEffect(() => {
    loadAccountStats();
    const interval = setInterval(loadAccountStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadAccountStats = async () => {
    try {
      const response = await api.platform.getStats();
      setAccounts(response.accounts || []);
      if (!selectedAccount && response.accounts?.length > 0) {
        setSelectedAccount(response.accounts[0].accountId);
      }
    } catch (error) {
      console.error("Erreur chargement stats comptes:", error);
    }
  };

  const totalProfit = accounts.reduce((sum, acc) => sum + acc.profit, 0);
  const totalHands = accounts.reduce((sum, acc) => sum + acc.handsPlayed, 0);
  const activeAccounts = accounts.filter(acc => acc.status === "running").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Comptes Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAccounts}/{accounts.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Profit Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}$
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Mains Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHands}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              BB/100 Global
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {totalHands > 0 ? ((totalProfit / totalHands) * 100).toFixed(2) : '0.00'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-mono">Détails par Compte</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedAccount || undefined} onValueChange={setSelectedAccount}>
            <TabsList className="w-full justify-start overflow-x-auto">
              {accounts.map((account) => (
                <TabsTrigger key={account.accountId} value={account.accountId} className="flex items-center gap-2">
                  {account.username}
                  <Badge 
                    variant={account.status === "running" ? "default" : "outline"}
                    className="ml-2"
                  >
                    {account.activeTables}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {accounts.map((account) => (
              <TabsContent key={account.accountId} value={account.accountId} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded bg-secondary/30">
                    <div className="text-xs text-muted-foreground mb-1">Profit</div>
                    <div className={`text-lg font-bold ${account.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {account.profit >= 0 ? '+' : ''}{account.profit.toFixed(2)}$
                    </div>
                  </div>
                  <div className="p-3 rounded bg-secondary/30">
                    <div className="text-xs text-muted-foreground mb-1">Mains</div>
                    <div className="text-lg font-bold">{account.handsPlayed}</div>
                  </div>
                  <div className="p-3 rounded bg-secondary/30">
                    <div className="text-xs text-muted-foreground mb-1">Tables</div>
                    <div className="text-lg font-bold text-primary">{account.activeTables}</div>
                  </div>
                  <div className="p-3 rounded bg-secondary/30">
                    <div className="text-xs text-muted-foreground mb-1">Durée</div>
                    <div className="text-lg font-bold">
                      {Math.floor(account.sessionDuration / 60)}m
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded bg-secondary/20">
                  <div className="text-xs text-muted-foreground mb-2">Performance</div>
                  <Progress 
                    value={Math.min(100, Math.max(0, 50 + (account.profit / 10)))} 
                    className="h-2"
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
