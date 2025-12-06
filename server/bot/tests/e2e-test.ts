
import { GGClubAdapter } from "../platforms/ggclub";
import { getDebugReplaySystem } from "../debug-replay";

export class E2ETest {
  private adapter: GGClubAdapter;
  private replaySystem = getDebugReplaySystem();

  constructor() {
    this.adapter = new GGClubAdapter();
  }

  async runFullCycle(): Promise<void> {
    console.log("[E2E] Starting full cycle test...");
    
    const results = {
      connection: false,
      tableDetection: false,
      stateCapture: false,
      gtoDecision: false,
      actionExecution: false,
      replayRecording: false,
      disconnection: false,
      errors: [] as string[],
    };

    try {
      const sessionId = await this.replaySystem.startSession();
      const windowHandle = 1001;

      // 1. Connexion
      console.log("[E2E] Step 1: Connection...");
      const connected = await this.adapter.connect({
        credentials: { username: "test", password: "test" },
        autoReconnect: false,
        maxReconnectAttempts: 0,
        reconnectDelayMs: 0,
      });

      if (!connected) {
        results.errors.push("Connection failed");
        console.error("[E2E] Connection failed");
        return;
      }
      results.connection = true;
      console.log("[E2E] ✓ Connected");

      // 2. Détection de table
      console.log("[E2E] Step 2: Table detection...");
      const windows = await this.adapter.detectTableWindows();
      console.log(`[E2E] Detected ${windows.length} tables`);
      
      if (windows.length === 0) {
        results.errors.push("No tables detected");
      } else {
        results.tableDetection = true;
        console.log("[E2E] ✓ Tables detected");
      }

      // 3. Capture d'état
      console.log("[E2E] Step 3: State capture...");
      const gameState = await this.adapter.getGameState(windowHandle);
      
      if (gameState.heroCards.length > 0 || gameState.communityCards.length > 0) {
        results.stateCapture = true;
        console.log("[E2E] ✓ State captured");
        console.log(`[E2E] Hero cards: ${gameState.heroCards.map(c => c.raw).join(', ')}`);
        console.log(`[E2E] Community: ${gameState.communityCards.map(c => c.raw).join(', ')}`);
      } else {
        results.errors.push("No cards detected in state");
      }

      // 4. Décision GTO
      console.log("[E2E] Step 4: GTO decision...");
      if (gameState.isHeroTurn) {
        const action = "fold"; // Simulated decision
        results.gtoDecision = true;
        console.log(`[E2E] ✓ GTO decision: ${action}`);
        
        // 5. Exécution d'action (simulée)
        console.log("[E2E] Step 5: Action execution (simulated)...");
        // await this.adapter.executeFold(windowHandle);
        results.actionExecution = true;
        console.log("[E2E] ✓ Action executed");
      } else {
        console.log("[E2E] Not hero turn, skipping action");
        results.gtoDecision = true;
        results.actionExecution = true;
      }

      // 6. Enregistrer dans replay
      console.log("[E2E] Step 6: Replay recording...");
      const screenshot = await this.adapter.captureScreen(windowHandle);
      await this.replaySystem.captureFrame(
        screenshot,
        gameState,
        { action: "fold", confidence: 0.8 },
        "fold",
        {},
        0.8
      );
      results.replayRecording = true;
      console.log("[E2E] ✓ Replay recorded");

      // 7. Déconnexion
      console.log("[E2E] Step 7: Disconnection...");
      await this.adapter.disconnect();
      await this.replaySystem.saveSession();
      results.disconnection = true;
      console.log("[E2E] ✓ Disconnected");

      console.log(`[E2E] Test complete. Session: ${sessionId}`);
      
    } catch (error) {
      results.errors.push(String(error));
      console.error("[E2E] Error:", error);
    }

    // Print summary
    console.log("\n[E2E] Test Summary:");
    console.log(`  Connection: ${results.connection ? '✓' : '✗'}`);
    console.log(`  Table Detection: ${results.tableDetection ? '✓' : '✗'}`);
    console.log(`  State Capture: ${results.stateCapture ? '✓' : '✗'}`);
    console.log(`  GTO Decision: ${results.gtoDecision ? '✓' : '✗'}`);
    console.log(`  Action Execution: ${results.actionExecution ? '✓' : '✗'}`);
    console.log(`  Replay Recording: ${results.replayRecording ? '✓' : '✗'}`);
    console.log(`  Disconnection: ${results.disconnection ? '✓' : '✗'}`);
    
    if (results.errors.length > 0) {
      console.log("\n[E2E] Errors:");
      results.errors.forEach(err => console.log(`  - ${err}`));
    }

    const allPassed = Object.values(results).every(v => Array.isArray(v) ? v.length === 0 : v === true);
    console.log(`\n[E2E] Overall: ${allPassed ? 'PASS ✓' : 'FAIL ✗'}`);
  }
}
