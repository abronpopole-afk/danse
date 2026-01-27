import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WindowInfo {
  hwnd: number;
  title: string;
}

export function TauriTest() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWindows = async () => {
    setLoading(true);
    try {
      const result = await invoke<WindowInfo[]>("list_windows");
      setWindows(result);
    } catch (error) {
      console.error("Failed to fetch windows:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Tauri Native Bridge Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={fetchWindows} 
          disabled={loading}
          data-testid="button-fetch-windows"
        >
          {loading ? "Chargement..." : "Lister les fenêtres (Win32 API)"}
        </Button>

        <div className="border rounded-md p-4 max-h-60 overflow-y-auto bg-slate-950 text-slate-50">
          {windows.length === 0 ? (
            <p className="text-slate-400">Aucune fenêtre détectée ou test non lancé.</p>
          ) : (
            <ul className="space-y-1">
              {windows.map((win) => (
                <li key={win.hwnd} className="text-xs font-mono">
                  <span className="text-blue-400">[{win.hwnd}]</span> {win.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
