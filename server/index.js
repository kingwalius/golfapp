import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import db, { initDB, ensureScoresColumn, ensureLeagueRoundsTable, ensureLeagueMatchIdColumn } from './db.js';
import crypto from 'crypto';

const app = express();


app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Initialize DB (Lazy or Manual)


app.get('/api/debug-sql', async (req, res) => {
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

// --- Auth Routes ---

import authRoutes from './routes/auth.js';

app.use('/auth', authRoutes);


import userRoutes from './routes/users.js';

app.use('/api/user', userRoutes);
// Backward compatibility for GET /users
app.use('/users', userRoutes);

import courseRoutes from './routes/courses.js';
app.use('/courses', courseRoutes);

import leagueRoutes from './routes/leagues.js';
app.use('/api/leagues', leagueRoutes);
// Note: /api/leagues/feed is mounted via leagueRoutes.

import debugRoutes from './routes/debug.js';
app.use('/api/debug', debugRoutes);

// Fix-DB and Init routes are now in debugRoutes (e.g. /api/debug/fix-db)
// We might want to alias /api/fix-db -> /api/debug/fix-db or just rely on new path.
// Given implementation plan says "Cleanup debug routes", we assume /api/debug prefix.
// However, /api/init was root. Let's redirect or alias if critical.
// Actually, let's just mount them.
app.use('/api', debugRoutes); // This mounts /init -> /api/init, /fix-db -> /api/fix-db if router has them at /init
// Wait, debug.js has router.get('/init'). So app.use('/api', debugRoutes) makes it /api/init.
// But it also has router.get('/') which would be /api/. This might conflict if /api is base.
// Let's mount specifically.
// debug.js: router.get('/') -> Env info.
// debug.js: router.get('/init') -> Init DB.
// debug.js: router.get('/fix-db') -> Fix DB.
// So if we mount at '/api', we get /api/init, /api/fix-db.
// But we also want /api/debug/users. debug.js has router.get('/users').
// So we need TWO mounts or reorganize debug.js.
// Debug.js has generalized /users, /matches etc.
// Let's mount debugRoutes at '/api/debug' AND alias specific ones if needed.
// Actually, clean slate: All debug stuff under /api/debug.
// /api/debug/init, /api/debug/fix-db.
// But for continuity, let's add specific mounts for the old root-ish ones if needed.
// Step 2 below removes /api/fix-db.
// Providing aliases:
app.get('/api/fix-db', (req, res) => res.redirect('/api/debug/fix-db?step=' + (req.query.step || 'all')));
app.get('/api/init', (req, res) => res.redirect('/api/debug/init'));
// Original was /api/league/feed. I should perhaps change the mount or the route.
// Let's check original: app.get('/api/league/feed'
// In leagues.js: router.get('/feed') -> /api/leagues/feed.
// This is a subtle breaking change (/league/ vs /leagues/).
// I will add a redirect or alias if needed, or just specific mount.
// Actually, for cleaner API, /api/leagues/feed is better. I will assume client flexibility or update client?
// Wait, "Backward compatibility".
// I'll mount the feed route specifically if I want to preserve /api/league/feed, OR I'll add a redirect in index.js.
// Let's add the legacy route alias here.

app.get('/api/league/feed', (req, res) => res.redirect(`/api/leagues/feed?userId=${req.query.userId || ''}`));









// --- Delete Routes ---
app.post('/api/rounds/delete', async (req, res) => {
    const { userId, courseId, date } = req.body;
    if (!userId || !courseId || !date) return res.status(400).json({ error: 'Missing required fields' });

    try {
        // Find and delete the round
        // Note: Using date string comparison might be tricky if formats differ.
        // Ideally we pass the ID if we have it, but local ID != server ID.
        // Let's rely on the composite key (userId, courseId, date) which we use for sync.

        const result = await db.execute({
            sql: 'DELETE FROM rounds WHERE userId = ? AND courseId = ? AND date = ?',
            args: [userId, courseId, date]
        });

        if (result.rowsAffected > 0) {
            res.json({ success: true, message: 'Round deleted' });
        } else {
            res.status(404).json({ error: 'Round not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/matches/delete', async (req, res) => {
    const { userId, courseId, date } = req.body;
    if (!userId || !courseId || !date) return res.status(400).json({ error: 'Missing required fields' });

    try {
        // Delete match where user is either player 1 or player 2
        const result = await db.execute({
            sql: 'DELETE FROM matches WHERE (player1Id = ? OR player2Id = ?) AND courseId = ? AND date = ?',
            args: [userId, userId, courseId, date]
        });

        if (result.rowsAffected > 0) {
            res.json({ success: true, message: 'Match deleted' });
        } else {
            res.status(404).json({ error: 'Match not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- League Feed Route ---
app.get('/api/league/feed', async (req, res) => {
    try {
        // Fetch all rounds with user info
        const roundsResult = await db.execute(`
            SELECT r.*, u.username, c.name as courseName, c.holes as courseHoles
            FROM rounds r
            JOIN users u ON r.userId = u.id
            JOIN courses c ON r.courseId = c.id
            ORDER BY r.date DESC LIMIT 50
        `);

        // Fetch all matches with user info
        const matchesResult = await db.execute(`
            SELECT m.*, u1.username as p1Name, u2.username as p2Name, c.name as courseName, c.holes as courseHoles
            FROM matches m
            LEFT JOIN users u1 ON m.player1Id = u1.id
            LEFT JOIN users u2 ON m.player2Id = u2.id
            JOIN courses c ON m.courseId = c.id
            ORDER BY m.date DESC LIMIT 50
        `);

        const rounds = roundsResult.rows.map(r => ({
            ...r,
            type: 'round',
            scores: r.scores ? JSON.parse(r.scores) : {},
            courseHoles: JSON.parse(r.courseHoles || '[]')
        }));

        const matches = matchesResult.rows.map(m => ({
            ...m,
            type: 'match',
            scores: m.scores ? JSON.parse(m.scores) : {},
            courseHoles: JSON.parse(m.courseHoles || '[]')
        }));

        // Combine and sort by date
        const feed = [...rounds, ...matches].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(feed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const ensureGuestUser = async () => {
    try {
        const res = await db.execute("SELECT id FROM users WHERE id = 9999");
        if (res.rows.length === 0) {
            console.log("Creating Guest User (9999)...");
            await db.execute({
                sql: "INSERT INTO users (id, username, password, handicap, isAdmin) VALUES (9999, 'Guest', 'guest', 18, 0)",
                args: []
            });
        }
    } catch (e) {
        console.error("Failed to ensure guest user:", e);
    }
};

// --- Sync Routes ---
app.post('/sync', async (req, res) => {
    const { userId, rounds, matches } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        console.log('Sync Request:', { userId, roundsCount: rounds?.length, matchesCount: matches?.length });

        // 1. Ensure Schema (Self-healing)
        await ensureScoresColumn('rounds');
        await ensureScoresColumn('matches');
        await ensureLeagueMatchIdColumn();
        await ensureLeagueRoundsTable();

        // Ensure differential columns for matches
        try {
            await db.execute("SELECT player1Differential FROM matches LIMIT 1");
        } catch (e) {
            if (e.message && (e.message.includes('no such column') || e.message.includes('column not found'))) {
                console.log('Adding missing differential columns to matches...');
                try {
                    await db.execute("ALTER TABLE matches ADD COLUMN player1Differential REAL");
                    await db.execute("ALTER TABLE matches ADD COLUMN player2Differential REAL");
                } catch (alterError) {
                    console.error("Failed to add differential columns:", alterError);
                }
            }
        }

        // Ensure countForHandicap column for matches
        try {
            await db.execute("SELECT countForHandicap FROM matches LIMIT 1");
        } catch (e) {
            if (e.message && (e.message.includes('no such column') || e.message.includes('column not found'))) {
                console.log('Adding missing countForHandicap column to matches...');
                try {
                    await db.execute("ALTER TABLE matches ADD COLUMN countForHandicap BOOLEAN");
                } catch (alterError) {
                    console.error("Failed to add countForHandicap column:", alterError);
                }
            }
        }

        // Ensure matchNumber column for league_matches (Tournament Bracket)
        try {
            await db.execute("SELECT matchNumber FROM league_matches LIMIT 1");
        } catch (e) {
            if (e.message && (e.message.includes('no such column') || e.message.includes('column not found'))) {
                console.log('Adding missing matchNumber column to league_matches...');
                try {
                    await db.execute("ALTER TABLE league_matches ADD COLUMN matchNumber INTEGER");
                } catch (alterError) {
                    console.error("Failed to add matchNumber column:", alterError);
                }
            }
        }

        // 2. Ensure User Exists (Self-healing for FK constraints)
        // If the DB was wiped, the client might still have a user ID that doesn't exist on server.
        const userCheck = await db.execute({
            sql: 'SELECT id FROM users WHERE id = ?',
            args: [userId]
        });

        if (userCheck.rows.length === 0) {
            console.log(`User ${userId} missing on server. Auto-restoring...`);
            // Restore user with a placeholder to allow sync to proceed
            await db.execute({
                sql: "INSERT INTO users (id, username, handicap, handicapMode) VALUES (?, ?, ?, ?)",
                args: [userId, `Restored_User_${userId}`, 28.0, 'AUTO']
            });
        }

        // 3. Helper to get or create Guest ID
        const getGuestId = async () => {
            try {
                const result = await db.execute("SELECT id FROM users WHERE username = 'Guest'");
                if (result.rows.length > 0) {
                    return result.rows[0].id;
                }
                const create = await db.execute({
                    sql: "INSERT INTO users (username, handicap, handicapMode) VALUES (?, ?, ?)",
                    args: ['Guest', 18.0, 'MANUAL']
                });
                return create.lastInsertRowid.toString();
            } catch (e) {
                console.error("Error getting guest ID:", e);
                return 9999; // Fallback
            }
        };

        const guestId = await getGuestId();

        const results = {
            rounds: { success: 0, failed: 0, errors: [] },
            matches: { success: 0, failed: 0, errors: [] }
        };

        // 4. Process Rounds
        if (rounds && rounds.length) {
            for (const round of rounds) {
                try {
                    const scoresJson = JSON.stringify(round.scores || {});

                    // Check if round exists (Upsert Logic)
                    const existing = await db.execute({
                        sql: 'SELECT id FROM rounds WHERE userId = ? AND courseId = ? AND date = ?',
                        args: [userId, round.courseId, round.date]
                    });

                    if (existing.rows.length > 0) {
                        // Update existing round
                        await db.execute({
                            sql: 'UPDATE rounds SET score = ?, stableford = ?, hcpIndex = ?, scores = ?, leagueId = ? WHERE id = ?',
                            args: [round.score, round.stableford, round.hcpIndex, scoresJson, round.leagueId || null, existing.rows[0].id]
                        });

                        // If it's a league round, ensure it's in league_rounds table (Upsert logic)
                        if (round.leagueId) {
                            const roundId = existing.rows[0].id;
                            // Check if already exists in league_rounds
                            const lrCheck = await db.execute({
                                sql: 'SELECT id FROM league_rounds WHERE leagueId = ? AND roundId = ?',
                                args: [round.leagueId, roundId]
                            });

                            if (lrCheck.rows.length > 0) {
                                // Update points
                                await db.execute({
                                    sql: 'UPDATE league_rounds SET points = ? WHERE id = ?',
                                    args: [round.stableford || 0, lrCheck.rows[0].id]
                                });
                            } else {
                                // Insert
                                await db.execute({
                                    sql: 'INSERT INTO league_rounds (leagueId, roundId, points, date) VALUES (?, ?, ?, ?)',
                                    args: [round.leagueId, roundId, round.stableford || 0, round.date]
                                });
                            }
                        }

                    } else {
                        // Insert new round
                        const roundRes = await db.execute({
                            sql: `INSERT INTO rounds (userId, courseId, date, score, stableford, hcpIndex, scores, leagueId)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [userId, round.courseId, round.date, round.score, round.stableford, round.hcpIndex, scoresJson, round.leagueId || null]
                        });

                        // If it's a league round, ensure it's in league_rounds table
                        if (round.leagueId) {
                            const roundId = roundRes.lastInsertRowid.toString();
                            // Check if already exists in league_rounds (idempotency)
                            const lrCheck = await db.execute({
                                sql: 'SELECT id FROM league_rounds WHERE leagueId = ? AND roundId = ?',
                                args: [round.leagueId, roundId]
                            });

                            if (lrCheck.rows.length === 0) {
                                await db.execute({
                                    sql: 'INSERT INTO league_rounds (leagueId, roundId, points, date) VALUES (?, ?, ?, ?)',
                                    args: [round.leagueId, roundId, round.stableford || 0, round.date] // Default points to stableford score for now
                                });
                            }
                        }
                    }
                    results.rounds.success++;
                } catch (roundError) {
                    console.error("Failed to sync round:", round, roundError);
                    results.rounds.failed++;
                    results.rounds.errors.push({ round, error: roundError.message });
                }
            }
        }

        // 5. Process Matches
        if (matches && matches.length) {
            for (const match of matches) {
                try {
                    // Validation & Defaults
                    const p2Id = match.player2Id || guestId;
                    const scoresJson = JSON.stringify(match.scores || {});
                    const matchDate = match.date || new Date().toISOString();
                    const courseId = match.courseId || 1; // Default to course 1 if missing

                    if (!match.date) console.warn(`Match missing date, using ${matchDate}`);
                    if (!match.courseId) console.warn(`Match missing courseId, using ${courseId}`);

                    // Ensure Player 2 exists (Self-healing for FK constraints)
                    // Explicitly check if p2Id exists, even if it is guestId (just to be safe)
                    const p2Check = await db.execute({
                        sql: 'SELECT id FROM users WHERE id = ?',
                        args: [p2Id]
                    });

                    if (p2Check.rows.length === 0) {
                        console.log(`Player 2 (${p2Id}) missing on server. Auto-restoring...`);
                        await db.execute({
                            sql: "INSERT INTO users (id, username, handicap, handicapMode) VALUES (?, ?, ?, ?)",
                            args: [p2Id, p2Id == 9999 ? 'Guest' : `Restored_User_${p2Id}`, 18.0, 'MANUAL']
                        });
                    }

                    // Check if match exists (Upsert Logic)
                    let existing = await db.execute({
                        sql: 'SELECT id FROM matches WHERE player1Id = ? AND player2Id = ? AND courseId = ? AND date = ?',
                        args: [match.player1Id, p2Id, courseId, matchDate]
                    });

                    // If not found, check if it's a Guest match we should claim
                    if (existing.rows.length === 0 && p2Id !== guestId) {
                        const guestMatch = await db.execute({
                            sql: 'SELECT id FROM matches WHERE player1Id = ? AND player2Id = ? AND courseId = ? AND date = ?',
                            args: [match.player1Id, guestId, courseId, matchDate]
                        });

                        if (guestMatch.rows.length > 0) {
                            console.log(`Linking Guest match ${guestMatch.rows[0].id} to Real User ${p2Id}`);
                            existing = guestMatch;
                            await db.execute({
                                sql: 'UPDATE matches SET player2Id = ? WHERE id = ?',
                                args: [p2Id, existing.rows[0].id]
                            });
                        }
                    }


                    if (existing.rows.length > 0) {
                        // Update existing match
                        await db.execute({
                            sql: 'UPDATE matches SET winnerId = ?, status = ?, scores = ?, player1Differential = ?, player2Differential = ?, countForHandicap = ?, leagueMatchId = ? WHERE id = ?',
                            args: [match.winnerId, match.status, scoresJson, match.player1Differential || null, match.player2Differential || null, match.countForHandicap || 0, match.leagueMatchId || null, existing.rows[0].id]
                        });

                        // Tournament Bracket Update Logic
                        if (match.leagueMatchId && match.winnerId && match.status !== 'AS') {
                            console.log(`Advancing Tournament Bracket for League Match ${match.leagueMatchId}`);
                            // 1. Update the bracket match with the result
                            await db.execute({
                                sql: 'UPDATE league_matches SET matchId = ?, winnerId = ? WHERE id = ?',
                                args: [existing.rows[0].id, match.winnerId, match.leagueMatchId]
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
                                    console.log(`Advanced winner ${match.winnerId} to Round ${nextRound}, Match ${nextMatchNum}`);
                                }
                            }
                        }

                    } else {
                        // Insert new match
                        const newMatch = await db.execute({
                            sql: `INSERT INTO matches (player1Id, player2Id, courseId, date, winnerId, status, scores, player1Differential, player2Differential, countForHandicap, leagueMatchId)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [match.player1Id, p2Id, courseId, matchDate, match.winnerId, match.status, scoresJson, match.player1Differential || null, match.player2Differential || null, match.countForHandicap || 0, match.leagueMatchId || null]
                        });

                        // Tournament Bracket Update Logic (Same for Insert)
                        if (match.leagueMatchId && match.winnerId && match.status !== 'AS') {
                            console.log(`Advancing Tournament Bracket for League Match ${match.leagueMatchId}`);
                            const matchId = newMatch.lastInsertRowid.toString();

                            await db.execute({
                                sql: 'UPDATE league_matches SET matchId = ?, winnerId = ? WHERE id = ?',
                                args: [matchId, match.winnerId, match.leagueMatchId]
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
                                    console.log(`Advanced winner ${match.winnerId} to Round ${nextRound}, Match ${nextMatchNum}`);
                                }
                            }
                        }
                    }
                    results.matches.success++;
                } catch (matchError) {
                    console.error("Failed to sync match:", match, matchError);
                    results.matches.failed++;
                    results.matches.errors.push({ match, error: matchError.message });
                }
            }
        }

        res.json({ success: true, message: 'Synced successfully', results });
    } catch (error) {
        console.error("Sync Error:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// --- Course Routes ---



// --- Leaderboard Routes ---

app.get('/leaderboard/solo', async (req, res) => {
    try {
        const result = await db.execute('SELECT id, username, handicap FROM users ORDER BY handicap ASC LIMIT 10');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset Tournament (Admin Only) - Panic Button


const PORT = process.env.PORT || 3000;
(async () => { // Wrap in an async IIFE to allow await calls before app.listen
    try {
        await initDB(); /* Ensures tables and columns (including Guest user) */
    } catch (e) {
        console.error("Critical DB Init Failure:", e);
    }

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})(); // Immediately invoke the async function
if (process.env.NODE_ENV !== 'production') {
    // The original console.log was here, but the new app.listen handles it.
    // Keeping the if block structure as per user's snippet, though it's now empty.
}

export default app;

