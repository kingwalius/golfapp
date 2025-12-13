import express from 'express';
import db, { ensureScoresColumn, ensureLeagueRoundsTable, ensureLeagueMatchIdColumn } from '../db.js';

const router = express.Router();

// --- Sync Route ---
router.post('/', async (req, res) => {
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

// --- Delete Routes ---
// Note: We mount this router at /api/sync so this becomes /api/sync/rounds/delete
// This matches the proposed refactor plan? 
// No, the client calls /api/rounds/delete. 
// If we mount at /api/sync, we break compatibility unless we also alias.
// OR we mount this router at /api. Then /sync -> /api/sync, /rounds/delete -> /api/rounds/delete.
// This file is 'sync.js'. If we mount it at /api, it owns /sync AND /rounds/delete.
// That seems like the best approach for backward compatibility.

router.post('/rounds/delete', async (req, res) => {
    const { userId, courseId, date } = req.body;
    if (!userId || !courseId || !date) return res.status(400).json({ error: 'Missing required fields' });

    try {
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

router.post('/matches/delete', async (req, res) => {
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

export default router;
