import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WindowInfo {
  hwnd: number;
  title: string;
}

export function TauriTest() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedHwnd, setSelectedHwnd] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

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

  const focusWin = async (hwnd: number) => {
    try {
      await invoke("focus_window", { hwnd });
      setSelectedHwnd(hwnd);
    } catch (error) {
      console.error("Focus error:", error);
    }
  };

  const resizeWin = async () => {
    if (!selectedHwnd) return;
    try {
      await invoke("resize_window", { 
        hwnd: selectedHwnd, 
        width: size.width, 
        height: size.height 
      });
    } catch (error) {
      console.error("Resize error:", error);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Tauri Native Bridge Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4">
          <Button 
            onClick={fetchWindows} 
            disabled={loading}
            data-testid="button-fetch-windows"
          >
            {loading ? "Chargement..." : "Lister les fenêtres"}
          </Button>
          
          {selectedHwnd && (
            <div className="flex items-end gap-2 border p-2 rounded-md bg-secondary/20">
              <div className="space-y-1">
                <Label className="text-[10px]">W</Label>
                <Input 
                  type="number" 
                  value={size.width} 
                  onChange={(e) => setSize(s => ({...s, width: parseInt(e.target.value)}))}
                  className="h-8 w-20"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">H</Label>
                <Input 
                  type="number" 
                  value={size.height} 
                  onChange={(e) => setSize(s => ({...s, height: parseInt(e.target.value)}))}
                  className="h-8 w-20"
                />
              </div>
              <Button size="sm" onClick={resizeWin} className="h-8">Redimensionner</Button>
            </div>
          )}
        </div>

        <div className="border rounded-md p-4 max-h-60 overflow-y-auto bg-slate-950 text-slate-50">
          {windows.length === 0 ? (
            <p className="text-slate-400">Aucune fenêtre détectée ou test non lancé.</p>
          ) : (
            <ul className="space-y-1">
              {windows.map((win) => (
                <li 
                  key={win.hwnd} 
                  className={`flex justify-between items-center p-1 rounded hover:bg-slate-800 cursor-pointer ${selectedHwnd === win.hwnd ? 'bg-slate-800' : ''}`}
                  onClick={() => focusWin(win.hwnd)}
                >
                  <span className="text-xs font-mono truncate max-w-[70%]">
                    <span className="text-blue-400">[{win.hwnd}]</span> {win.title}
                  </span>
                  {selectedHwnd === win.hwnd && <Badge className="text-[8px] h-4">Sélectionné</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return <span className={`bg-primary text-primary-foreground px-1.5 rounded-full font-bold ${className}`}>{children}</span>;
}
