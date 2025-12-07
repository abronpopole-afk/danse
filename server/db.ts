import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Log pour debug (utile pour Electron packagé)
console.log('[DB] Initialisation connexion base de données...');
console.log('[DB] DATABASE_URL défini:', !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error('[DB] ❌ DATABASE_URL non défini!');
  console.error('[DB] Variables d\'environnement disponibles:', Object.keys(process.env).filter(k => !k.includes('npm')).join(', '));
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database? " +
    "Pour Windows: Vérifiez que le fichier .env est dans %APPDATA%\\GTO Poker Bot\\"
  );
}

// Masquer le mot de passe dans les logs
const dbUrlForLog = process.env.DATABASE_URL.replace(/:([^@]+)@/, ':***@');
console.log('[DB] Connexion à:', dbUrlForLog);

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Test de connexion au démarrage
pool.query('SELECT 1')
  .then(() => console.log('[DB] ✅ Connexion PostgreSQL réussie'))
  .catch((err) => console.error('[DB] ❌ Erreur connexion PostgreSQL:', err.message));
