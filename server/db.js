import dotenv from 'dotenv';

dotenv.config();

let client = null;
let initError = null;

const getClient = async () => {
  if (client) return client;
  if (initError) throw initError;

  try {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    console.log(`DB Init: URL=${url ? 'Set' : 'Missing'}, Token=${authToken ? 'Set' : 'Missing'}`);

    if (!url) {
      throw new Error("TURSO_DATABASE_URL is not defined");
    }

    // Dynamic import to prevent load-time crashes
    const { createClient } = await import('@libsql/client');

    client = createClient({
      url,
      authToken,
      strategy: 'http',
      url: url.replace('libsql://', 'https://')
    });

    return client;
  } catch (e) {
    console.error("Failed to initialize DB client:", e);
    initError = e;
    throw e;
  }
};

const db = {
  execute: async (...args) => {
    try {
      const c = await getClient();
      return await c.execute(...args);
    } catch (e) {
      console.error("DB Execute Error:", e.message);
      throw e;
    }
  },
  batch: async (...args) => {
    try {
      const c = await getClient();
      return await c.batch(...args);
    } catch (e) {
      console.error("DB Batch Error:", e.message);
      throw e;
    }
  }
};

// Initialize Database Schema
export const initDB = async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        handicap REAL,
        avatar TEXT,
        handicapMode TEXT DEFAULT 'AUTO',
        manualHandicap REAL,
        avgScore REAL,
        avgScoreChange REAL,
        handicapChange REAL,
        friends TEXT,
        favoriteCourses TEXT,
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
        leagueId INTEGER,
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
        player1Differential REAL,
        player2Differential REAL,
        countForHandicap BOOLEAN,
        FOREIGN KEY (player1Id) REFERENCES users(id),
        FOREIGN KEY (player2Id) REFERENCES users(id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        holes TEXT NOT NULL,
        rating REAL,
        slope INTEGER,
        par INTEGER
      )
    `);

    // Migrations
    const migrations = [
      "ALTER TABLE users ADD COLUMN avatar TEXT",
      "ALTER TABLE users ADD COLUMN handicapMode TEXT DEFAULT 'AUTO'",
      "ALTER TABLE users ADD COLUMN manualHandicap REAL",
      "ALTER TABLE users ADD COLUMN password TEXT",
      "ALTER TABLE users ADD COLUMN avgScore REAL",
      "ALTER TABLE users ADD COLUMN avgScoreChange REAL",
      "ALTER TABLE users ADD COLUMN handicapChange REAL",
      "ALTER TABLE users ADD COLUMN friends TEXT",
      "ALTER TABLE users ADD COLUMN favoriteCourses TEXT",
      "ALTER TABLE matches ADD COLUMN scores TEXT",
      "ALTER TABLE rounds ADD COLUMN scores TEXT",
      "ALTER TABLE matches ADD COLUMN player1Differential REAL",
      "ALTER TABLE matches ADD COLUMN player2Differential REAL",
      "ALTER TABLE matches ADD COLUMN countForHandicap BOOLEAN",
      "ALTER TABLE rounds ADD COLUMN leagueId INTEGER"
    ];

    for (const query of migrations) {
      try {
        await db.execute(query);
      } catch (e) {
        // Ignore column exists errors
      }
    }

    // League Tables
    await db.execute(`
        CREATE TABLE IF NOT EXISTS leagues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          adminId INTEGER NOT NULL,
          startDate TEXT,
          endDate TEXT,
          settings TEXT,
          status TEXT DEFAULT 'ACTIVE',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS league_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          leagueId INTEGER NOT NULL,
          userId INTEGER NOT NULL,
          team TEXT,
          points REAL DEFAULT 0,
          joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(leagueId) REFERENCES leagues(id) ON DELETE CASCADE,
          FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS league_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          leagueId INTEGER NOT NULL,
          roundNumber INTEGER,
          matchId INTEGER,
          player1Id INTEGER,
          player2Id INTEGER,
          winnerId INTEGER,
          concedeDeadline DATETIME,
          FOREIGN KEY(leagueId) REFERENCES leagues(id) ON DELETE CASCADE,
          FOREIGN KEY(matchId) REFERENCES matches(id) ON DELETE SET NULL
        )
      `);

    // Guest User
    try {
      await db.execute({
        sql: "INSERT OR IGNORE INTO users (id, username, handicap, handicapMode) VALUES (?, ?, ?, ?)",
        args: [9999, 'Guest', 18.0, 'MANUAL']
      });
    } catch (e) {
      console.error("Guest user init failed:", e.message);
    }

    console.log('Database initialized successfully.');
  } catch (error) {
    console.error("initDB failed:", error);
    throw error;
  }
};

export default db;
