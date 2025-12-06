import db from '../server/db.js';

export default async function handler(req, res) {
    const step = req.query.step || 'all';
    const report = [];
    const log = (msg) => report.push(msg);

    try {
        log(`Starting League DB fix (Step: ${step})...`);

        // STEP 1: Create Tables
        if (step === 'all' || step === 'tables') {
            const leagueTables = [
                `CREATE TABLE IF NOT EXISTS leagues (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    adminId INTEGER NOT NULL,
                    startDate TEXT,
                    endDate TEXT,
                    settings TEXT,
                    status TEXT DEFAULT 'ACTIVE',
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS league_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    leagueId INTEGER NOT NULL,
                    userId INTEGER NOT NULL,
                    team TEXT,
                    points REAL DEFAULT 0,
                    joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(leagueId) REFERENCES leagues(id) ON DELETE CASCADE,
                    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS league_matches (
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
                )`,
                `CREATE TABLE IF NOT EXISTS league_rounds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    leagueId INTEGER NOT NULL,
                    roundId INTEGER NOT NULL,
                    points REAL DEFAULT 0,
                    date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(leagueId) REFERENCES leagues(id) ON DELETE CASCADE,
                    FOREIGN KEY(roundId) REFERENCES rounds(id) ON DELETE CASCADE
                )`
            ];

            for (const sql of leagueTables) {
                try {
                    await db.execute(sql);
                    log('✅ Executed CREATE TABLE.');
                } catch (e) {
                    log(`❌ Failed to create table: ${e.message}`);
                }
            }
        }

        // STEP 2: Add Columns (Migrations)
        if (step === 'all' || step === 'columns') {
            // Ensure rounds.leagueId exists
            try {
                // Check if column exists by selecting it
                await db.execute("SELECT leagueId FROM rounds LIMIT 1");
                log('✅ rounds.leagueId exists.');
            } catch (e) {
                log('⚠️ rounds.leagueId missing or table missing. Attempting to add...');
                try {
                    await db.execute("ALTER TABLE rounds ADD COLUMN leagueId INTEGER");
                    log('✅ Added leagueId to rounds.');
                } catch (e2) {
                    log(`❌ Failed to add leagueId: ${e2.message}`);
                }
            }
        }

        res.status(200).json({ status: 'Complete', step, report });
    } catch (error) {
        res.status(500).json({ error: error.message, report });
    }
}
