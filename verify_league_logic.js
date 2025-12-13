import db from './server/db.js';

async function verify() {
    try {
        console.log("Initializing DB...");
        // Manually run the table creation queries from db.js if needed, 
        // but db.js initDB is not exported directly for use here easily without modifying it.
        // Instead, we'll rely on the fact that db.execute works if the DB is reachable.

        // 1. Create Tables (Simulate fix-db)
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
            CREATE TABLE IF NOT EXISTS league_rounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                leagueId INTEGER NOT NULL,
                roundId INTEGER NOT NULL,
                points REAL DEFAULT 0,
                date DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(leagueId) REFERENCES leagues(id) ON DELETE CASCADE,
                FOREIGN KEY(roundId) REFERENCES rounds(id) ON DELETE CASCADE
            )
        `);

        // Ensure rounds has leagueId
        try {
            await db.execute("ALTER TABLE rounds ADD COLUMN leagueId INTEGER");
        } catch (e) { }

        // 2. Create a Test League
        const leagueRes = await db.execute({
            sql: "INSERT INTO leagues (name, type, adminId) VALUES (?, ?, ?)",
            args: ['Test League', 'STROKE', 9999]
        });
        const leagueId = leagueRes.lastInsertRowid.toString();
        console.log(`Created League ID: ${leagueId}`);

        // 3. Insert a Round with leagueId (Simulate /sync logic)
        const roundRes = await db.execute({
            sql: `INSERT INTO rounds (userId, courseId, date, score, stableford, hcpIndex, scores, leagueId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [9999, 1, new Date().toISOString(), 80, 36, 18.0, '{}', leagueId]
        });
        const roundId = roundRes.lastInsertRowid.toString();
        console.log(`Created Round ID: ${roundId} linked to League ${leagueId}`);

        // 4. Simulate the Sync Logic for league_rounds
        // This is the logic from server/index.js
        if (leagueId) {
            const lrCheck = await db.execute({
                sql: 'SELECT id FROM league_rounds WHERE leagueId = ? AND roundId = ?',
                args: [leagueId, roundId]
            });

            if (lrCheck.rows.length === 0) {
                await db.execute({
                    sql: 'INSERT INTO league_rounds (leagueId, roundId, points, date) VALUES (?, ?, ?, ?)',
                    args: [leagueId, roundId, 36, new Date().toISOString()]
                });
                console.log("✅ Inserted into league_rounds");
            } else {
                console.log("⚠️ Already in league_rounds");
            }
        }

        // 5. Verify Data
        const check = await db.execute({
            sql: "SELECT * FROM league_rounds WHERE leagueId = ? AND roundId = ?",
            args: [leagueId, roundId]
        });

        if (check.rows.length > 0) {
            console.log("SUCCESS: Round found in league_rounds table!");
            console.log(check.rows[0]);
        } else {
            console.error("FAILURE: Round NOT found in league_rounds table.");
        }

        // Cleanup
        // await db.execute("DELETE FROM leagues WHERE id = ?", [leagueId]);
        // await db.execute("DELETE FROM rounds WHERE id = ?", [roundId]);
        // await db.execute("DELETE FROM league_rounds WHERE leagueId = ?", [leagueId]);

    } catch (e) {
        console.error("Verification Failed:", e);
    }
}

verify();
