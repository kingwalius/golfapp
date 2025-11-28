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
  // LibSQL doesn't support easy "try/catch" for column existence in the same way, 
  // but we can try adding them and ignore errors if they exist.
  const migrations = [
    "ALTER TABLE users ADD COLUMN avatar TEXT",
    "ALTER TABLE users ADD COLUMN handicapMode TEXT DEFAULT 'AUTO'",
    "ALTER TABLE users ADD COLUMN manualHandicap REAL",
    "ALTER TABLE users ADD COLUMN password TEXT",
    "ALTER TABLE matches ADD COLUMN scores TEXT"
  ];

  for (const query of migrations) {
    try {
      await db.execute(query);
      console.log(`Migrated: ${query}`);
    } catch (e) {
      // Ignore error if column exists
    }
  }

  console.log('Database initialized');
};

export default db;
