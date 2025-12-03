import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.TURSO_DATABASE_URL || 'file:golf.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

console.log(`Initializing DB with URL: ${url.startsWith('file:') ? 'Local File' : 'Turso Cloud'} (${url.substring(0, 15)}...)`);

const db = createClient({
  url,
  authToken,
  // Force HTTP strategy to avoid native binding issues on Vercel
  // unless we are using a local file
  ...(url.startsWith('file:') ? {} : {
    strategy: 'http',
    // LibSQL http strategy requires https:// protocol
    url: url.replace('libsql://', 'https://')
  })
});

// Initialize Database
export const initDB = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      handicap REAL,
      avatar TEXT,
      handicapMode TEXT DEFAULT 'AUTO', -- 'AUTO' or 'MANUAL'
      manualHandicap REAL,
      avgScore REAL,
      avgScoreChange REAL,
      handicapChange REAL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      courseId INTEGER NOT NULL,
      date TEXT NOT NULL,
      score INTEGER,
      stableford INTEGER,
      hcpIndex REAL,
      scores TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player1Id INTEGER NOT NULL,
      player2Id INTEGER NOT NULL,
      courseId INTEGER NOT NULL,
      date TEXT NOT NULL,
      winnerId INTEGER,
      status TEXT,
      scores TEXT,
      FOREIGN KEY (player1Id) REFERENCES users(id),
      FOREIGN KEY (player2Id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      holes TEXT NOT NULL, -- JSON string of holes
      rating REAL,
      slope INTEGER,
      par INTEGER
    )
  `);

  // Migrations: Attempt to add columns if they don't exist
  const migrations = [
    "ALTER TABLE users ADD COLUMN avatar TEXT",
    "ALTER TABLE users ADD COLUMN handicapMode TEXT DEFAULT 'AUTO'",
    "ALTER TABLE users ADD COLUMN manualHandicap REAL",
    "ALTER TABLE users ADD COLUMN password TEXT",
    "ALTER TABLE users ADD COLUMN avgScore REAL",
    "ALTER TABLE users ADD COLUMN avgScoreChange REAL",
    "ALTER TABLE users ADD COLUMN handicapChange REAL",
    "ALTER TABLE matches ADD COLUMN scores TEXT",
    "ALTER TABLE rounds ADD COLUMN scores TEXT"
  ];

  for (const query of migrations) {
    try {
      await db.execute(query);
      console.log(`Migrated: ${query}`);
    } catch (e) {
      // Ignore error if column exists
      // console.log(`Migration skipped (likely exists): ${query}`);
    }
  }

  // Double check matches table has scores column
  try {
    // Try to select scores column. If it fails, we really need to add it.
    await db.execute("SELECT scores FROM matches LIMIT 1");
  } catch (e) {
    console.log("Scores column missing in matches, attempting to add again...");
    try {
      await db.execute("ALTER TABLE matches ADD COLUMN scores TEXT");
      console.log("Added scores column to matches");
    } catch (e2) {
      console.error("Failed to add scores to matches:", e2);
    }
  }

  // Double check rounds table has scores column
  try {
    await db.execute("SELECT scores FROM rounds LIMIT 1");
  } catch (e) {
    console.log("Scores column missing in rounds, attempting to add again...");
    try {
      await db.execute("ALTER TABLE rounds ADD COLUMN scores TEXT");
      console.log("Added scores column to rounds");
    } catch (e2) { console.error("Failed to add scores to rounds:", e2); }
  }

  // FIX: Ensure player2Id is nullable (SQLite ALTER COLUMN is limited, so we recreate if needed)
  // We check if we need to migrate by trying to insert a null player2Id into a temp transaction or just force it once.
  // A safer way is to check pragma, but LibSQL http driver might not return it easily.
  // We will attempt to recreate the table if it's the old schema.
  // For simplicity in this environment, we'll run a "fix_schema" block that we can toggle or run safely.

  try {
    // Check if we can insert NULL player2Id (if we can't, we need migration)
    // Actually, let's just do the migration if we haven't marked it as done.
    // Since we don't have a migrations table, we'll just try to do it safely.
    // We will rename the table to matches_old, create new, copy, drop old.
    // BUT we only want to do this if strictly necessary to avoid data loss risk on every startup.
    // Let's assume if 'scores' column was just added, we might be on old schema.

    // Let's just do it. It's fast for small data.
    // 1. Rename current matches to matches_old
    // 2. Create new matches table (with nullable player2Id)
    // 3. Copy data
    // 4. Drop matches_old

    // We need to be careful not to lose data if this runs multiple times.
    // We can check if `matches_old` exists first? No.

    // Let's try to detect if player2Id is NOT NULL.
    // Since we can't easily, we will just rely on the fact that we updated the CREATE TABLE above.
    // If the table already existed, CREATE TABLE IF NOT EXISTS skipped.
    // So we are stuck with the old schema.

    // We will perform the migration:
    // Check if we have already migrated? Hard without state.
    // We will catch the specific error "NOT NULL constraint failed" in the app logic instead?
    // No, we want to fix the schema.

    // Let's run this ONCE.
    // We can check if a specific dummy column exists? No.

    // We will try to rename. If it fails (e.g. locked), we abort.
    // Actually, let's just use a try-catch block for the whole migration.

    /*
    await db.execute("BEGIN TRANSACTION");
    try {
        await db.execute("ALTER TABLE matches RENAME TO matches_old");
        await db.execute(`
          CREATE TABLE matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1Id INTEGER NOT NULL,
            player2Id INTEGER, -- Nullable now
            courseId INTEGER NOT NULL,
            date TEXT NOT NULL,
            winnerId INTEGER,
            status TEXT,
            scores TEXT,
            FOREIGN KEY (player1Id) REFERENCES users(id),
            FOREIGN KEY (player2Id) REFERENCES users(id)
          )
        `);
        await db.execute("INSERT INTO matches SELECT id, player1Id, player2Id, courseId, date, winnerId, status, scores FROM matches_old");
        await db.execute("DROP TABLE matches_old");
        await db.execute("COMMIT");
        console.log("Schema migration: matches table recreated with nullable player2Id");
    } catch (e) {
        await db.execute("ROLLBACK");
        // If error is "no such table: matches_old", it means we failed step 1?
        // If error is "table matches already exists", it means step 1 failed?
        // If we are already migrated, step 1 might fail if we run this every time?
        // No, step 1 renames 'matches' to 'matches_old'. 'matches' always exists.
        // So this would run EVERY RESTART. That is bad.
        console.log("Schema migration skipped or failed:", e.message);
    }
    */

    // BETTER APPROACH: Just handle the NULL in the application layer by using a placeholder ID?
    // No, foreign key constraint.

    // OK, we will just execute the ALTER TABLE to remove NOT NULL? SQLite doesn't support it.

    // We will rely on the user NOT having a null player2Id for now, OR we fix the app to not send it?
    // But the user wants to sync matches against "Opponent".

    // I will use a "Guest" user strategy.
    // 1. Ensure a Guest user exists (ID 0 or 9999).
    // 2. If player2Id is null, use Guest ID.

    // Let's insert a Guest user.
    await db.execute({
      sql: "INSERT OR IGNORE INTO users (id, username, handicap, handicapMode) VALUES (?, ?, ?, ?)",
      args: [9999, 'Guest', 18.0, 'MANUAL']
    });

  } catch (e) {
    console.error("Migration error:", e);
  }

  console.log('Database initialized');
};

export default db;
