import express from 'express';
import db, { initDB } from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        env: {
            TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? 'Set' : 'Missing',
            TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'Set' : 'Missing',
            NODE_ENV: process.env.NODE_ENV
        },
        dbUrlPrefix: process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.substring(0, 10) : 'N/A'
    });
});

router.get('/init', async (req, res) => {
    try {
        await initDB();
        res.json({ status: 'Database initialized successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/fix-db', async (req, res) => {
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

        res.json({ status: 'Complete', step, report });
    } catch (error) {
        res.status(500).json({ error: error.message, report });
    }
});

router.get('/nuke-db', async (req, res) => {
    try {
        console.log('Nuking database...');
        await db.execute('DELETE FROM rounds');
        await db.execute('DELETE FROM matches');
        await db.execute('DELETE FROM users');
        await db.execute('DELETE FROM courses');
        await db.execute('DELETE FROM leagues');
        await db.execute('DELETE FROM league_members');
        await db.execute('DELETE FROM league_matches');
        await db.execute('DELETE FROM league_rounds');

        console.log('Database cleared. Re-initializing...');
        await initDB();

        res.json({ success: true, message: 'Database completely erased and re-initialized.' });
    } catch (error) {
        console.error('Nuke failed:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/debug-sql', async (req, res) => {
    try {
        const leagueId = 1;

        // 1. Check DB Connection Info (Masked)
        const dbUrl = process.env.TURSO_DATABASE_URL || 'MISSING';
        const maskedUrl = dbUrl.length > 10 ? dbUrl.substring(0, 15) + '...' : dbUrl;

        // 2. Check League
        const leagueRes = await db.execute({
            sql: 'SELECT * FROM leagues WHERE id = ?',
            args: [leagueId]
        });

        // 3. Check League Rounds
        const sql = `
            SELECT r.*, lr.points as leaguePoints, u.username, u.avatar 
            FROM league_rounds lr
            JOIN rounds r ON lr.roundId = r.id
            JOIN users u ON r.userId = u.id 
            WHERE lr.leagueId = ?
            ORDER BY r.date DESC
        `;
        const result = await db.execute({ sql, args: [leagueId] });

        res.json({
            success: true,
            dbUrl: maskedUrl,
            leagueFound: leagueRes.rows.length > 0,
            league: leagueRes.rows[0] || null,
            standingsRows: result.rows.length,
            rows: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

router.get('/users', async (req, res) => {
    const users = await db.execute('SELECT id, username FROM users ORDER BY id');
    res.json(users.rows);
});

router.get('/matches', async (req, res) => {
    try {
        const matches = await db.execute('SELECT * FROM matches ORDER BY id DESC LIMIT 10');
        const leagueMatches = await db.execute('SELECT * FROM league_matches WHERE matchId IS NOT NULL OR winnerId IS NOT NULL');
        res.json({ matches: matches.rows, leagueMatches: leagueMatches.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/resolve-bracket', async (req, res) => {
    const { matchId } = req.body;
    try {
        const matchRes = await db.execute({
            sql: 'SELECT * FROM matches WHERE id = ?',
            args: [matchId]
        });

        if (matchRes.rows.length === 0) return res.status(404).json({ error: 'Match not found' });

        const match = matchRes.rows[0];
        console.log(`Manual Resolve for Match ${match.id}, LeagueMatchId: ${match.leagueMatchId}`);

        if (match.leagueMatchId && match.winnerId) {
            // 1. Update the bracket match with the result
            await db.execute({
                sql: 'UPDATE league_matches SET matchId = ?, winnerId = ? WHERE id = ?',
                args: [match.id, match.winnerId, match.leagueMatchId]
            });

            // 2. Advance Winner
            const bracketMatchRes = await db.execute({
                sql: 'SELECT * FROM league_matches WHERE id = ?',
                args: [match.leagueMatchId]
            });

            if (bracketMatchRes.rows.length > 0) {
                const currentMatch = bracketMatchRes.rows[0];
                const nextRound = currentMatch.roundNumber + 1;
                const nextMatchNum = Math.ceil(currentMatch.matchNumber / 2);
                const isPlayer1 = (currentMatch.matchNumber % 2) !== 0;
                const field = isPlayer1 ? 'player1Id' : 'player2Id';

                const nextMatchRes = await db.execute({
                    sql: 'SELECT id FROM league_matches WHERE leagueId = ? AND roundNumber = ? AND matchNumber = ?',
                    args: [currentMatch.leagueId, nextRound, nextMatchNum]
                });

                if (nextMatchRes.rows.length > 0) {
                    await db.execute({
                        sql: `UPDATE league_matches SET ${field} = ? WHERE id = ?`,
                        args: [match.winnerId, nextMatchRes.rows[0].id]
                    });
                    return res.json({ success: true, message: `Advanced winner ${match.winnerId} to Round ${nextRound}, Match ${nextMatchNum}` });
                }
                return res.json({ success: true, message: 'Bracket updated, but next match not found (Final?)' });
            }
        }
        res.json({ success: false, message: 'Match missing leagueMatchId or winnerId' });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/force-link', async (req, res) => {
    const { matchId, leagueMatchId } = req.body;
    try {
        console.log(`Force Link: Linking Match ${matchId} to LeagueMatch ${leagueMatchId}`);

        // 1. Update Match with Link
        await db.execute({
            sql: 'UPDATE matches SET leagueMatchId = ? WHERE id = ?',
            args: [leagueMatchId, matchId]
        });

        // 2. Trigger Logic
        const matchRes = await db.execute({
            sql: 'SELECT * FROM matches WHERE id = ?',
            args: [matchId]
        });
        const match = matchRes.rows[0];

        if (match.winnerId) {
            // 3. Update bracket
            await db.execute({
                sql: 'UPDATE league_matches SET matchId = ?, winnerId = ? WHERE id = ?',
                args: [match.id, match.winnerId, leagueMatchId]
            });

            // 4. Advance
            const bracketMatchRes = await db.execute({
                sql: 'SELECT * FROM league_matches WHERE id = ?',
                args: [leagueMatchId]
            });

            if (bracketMatchRes.rows.length > 0) {
                const currentMatch = bracketMatchRes.rows[0];
                const nextRound = currentMatch.roundNumber + 1;
                const nextMatchNum = Math.ceil(currentMatch.matchNumber / 2);
                const isPlayer1 = (currentMatch.matchNumber % 2) !== 0;
                const field = isPlayer1 ? 'player1Id' : 'player2Id';

                const nextMatchRes = await db.execute({
                    sql: 'SELECT id FROM league_matches WHERE leagueId = ? AND roundNumber = ? AND matchNumber = ?',
                    args: [currentMatch.leagueId, nextRound, nextMatchNum]
                });

                if (nextMatchRes.rows.length > 0) {
                    await db.execute({
                        sql: `UPDATE league_matches SET ${field} = ? WHERE id = ?`,
                        args: [match.winnerId, nextMatchRes.rows[0].id]
                    });
                    return res.json({ success: true, message: `Linked & Advanced winner ${match.winnerId} to Round ${nextRound}` });
                }
                return res.json({ success: true, message: 'Linked & Updated, but next match not found' });
            }
        }
        res.json({ success: true, message: 'Linked, but no winner yet.' });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
