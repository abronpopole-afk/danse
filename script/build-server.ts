import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

async function build() {
  const outputDir = path.join(process.cwd(), "src-tauri", "binaries");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "server-x86_64-pc-windows-msvc.exe");
  
  console.log("🚀 Démarrage de la compilation du binaire serveur pour Windows...");
  
  try {
    const command = `npx pkg server/index.ts --targets node16-win-x64 --output "${outputPath}" --public`;
    console.log(`Exécution: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout);
    if (stderr) console.warn(stderr);
    
    console.log(`✅ Binaire généré avec succès dans: ${outputPath}`);
  } catch (error) {
    console.error("❌ Erreur lors de la compilation du serveur:", error);
    process.exit(1);
  }
}

build();
