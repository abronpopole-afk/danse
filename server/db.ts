import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { logger } from "./logger";

const { Pool } = pg;

// Log pour debug (utile pour Electron packagé)
logger.info('[DB]', 'Initialisation connexion base de données...');
logger.info('[DB]', 'DATABASE_URL défini:', { isDefined: !!process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  logger.error('[DB]', '❌ DATABASE_URL non défini!', {
    availableEnvVars: Object.keys(process.env).filter(k => !k.includes('npm')).join(', ')
  });
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database? " +
    "Pour Windows: Vérifiez que le fichier .env est dans %APPDATA%\\GTO Poker Bot\\"
  );
}

// Masquer le mot de passe dans les logs
const dbUrlForLog = (process.env.DATABASE_URL || "").replace(/:([^@]+)@/, ':***@');
logger.info('[DB]', 'Connexion à:', { url: dbUrlForLog });

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  // Ajout de paramètres pour la robustesse en mode local
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
export const db = drizzle(pool, { schema });

// Test de connexion au démarrage
pool.query('SELECT 1')
  .then(() => {
    logger.session('[DB]', '✅ Connexion PostgreSQL réussie');
    // Test lecture tables
    return pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
  })
  .then((result) => {
    logger.session('[DB]', '✅ Tables disponibles:', { 
      count: result.rows.length,
      tables: result.rows.map(r => r.table_name)
    });
  })
  .catch((err) => {
    logger.error('[DB]', '❌ Erreur connexion PostgreSQL:', { 
      message: err.message,
      code: err.code,
      stack: err.stack
    });
  });
