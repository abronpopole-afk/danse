import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from '../shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Please check your database connection.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

import { eq } from "drizzle-orm";
// Helper to ensure we don't have stale "active" sessions on startup
async function cleanupStaleSessions() {
  console.log("[DB] Cleaning up stale active sessions...");
  try {
    const { botSessions } = schema;
    // We check if the table exists by a simple query before updating
    // This is a safety measure for the first run where tables might not be ready
    await db.update(botSessions)
      .set({ status: 'stopped', stoppedAt: new Date() })
      .where(eq(botSessions.status, 'active'));
    console.log("[DB] Stale sessions cleaned.");
  } catch (e) {
    console.warn("[DB WARNING] Failed to cleanup stale sessions (might be first run):", e instanceof Error ? e.message : e);
  }
}

// In mockup mode with Express, we usually rely on migrations being run first
// We delay the cleanup slightly to allow the server to initialize
setTimeout(cleanupStaleSessions, 1000);
