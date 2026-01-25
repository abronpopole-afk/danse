
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getLogsDirectory(): string {
  const isWindows = os.platform() === "win32";
  
  if (isWindows) {
    return "C:\\Users\\adria\\AppData\\Roaming\\GTO Poker Bot\\logs";
  }
  
  return path.join(process.cwd(), "logs");
}

const LOGS_DIR = getLogsDirectory();

try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  console.log(`[Logger] Logs directory: ${LOGS_DIR}`);
} catch (error) {
  console.error(`[Logger] Failed to create logs directory: ${LOGS_DIR}`, error);
}

type LogLevel = "info" | "warning" | "error" | "debug" | "session";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
}

class Logger {
  private logFile: string;
  private sessionFile: string;
  private logsDir: string;

  constructor() {
    this.logsDir = LOGS_DIR;
    const date = new Date().toISOString().split("T")[0];
    this.logFile = path.join(this.logsDir, `bot-${date}.log`);
    this.sessionFile = path.join(this.logsDir, `session-${date}.log`);
  }

  getLogsDirectory(): string {
    return this.logsDir;
  }

  private writeLog(entry: LogEntry, toSessionFile = false): void {
    const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.component}] ${entry.message}${entry.data ? ` | DATA: ${JSON.stringify(entry.data)}` : ""}\n`;
    
    console.log(logLine.trim());
    
    try {
      fs.appendFileSync(this.logFile, logLine);
      
      if (toSessionFile) {
        fs.appendFileSync(this.sessionFile, logLine);
      }
    } catch (error) {
      console.error(`[Logger] Failed to write log: ${error}`);
    }
  }

  info(component: string, message: string, data?: any): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "info",
      component,
      message,
      data,
    });
  }

  warning(component: string, message: string, data?: any): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "warning",
      component,
      message,
      data,
    });
  }

  error(component: string, message: string, data?: any): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "error",
      component,
      message,
      data,
    });
  }

  debug(component: string, message: string, data?: any): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "debug",
      component,
      message,
      data,
    });
  }

  session(component: string, message: string, data?: any): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "session",
      component,
      message,
      data,
    }, true);
  }

  getRecentLogs(lines: number = 100): string[] {
    try {
      const content = fs.readFileSync(this.logFile, "utf-8");
      const allLines = content.split("\n").filter(l => l.trim());
      return allLines.slice(-lines);
    } catch {
      return [];
    }
  }

  getSessionLogs(): string[] {
    try {
      const content = fs.readFileSync(this.sessionFile, "utf-8");
      return content.split("\n").filter(l => l.trim());
    } catch {
      return [];
    }
  }
}

export const logger = new Logger();
