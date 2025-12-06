import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import db, { initDB } from './db.js';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Initialize DB (Lazy or Manual)
// initDB().catch(err => console.error("Failed to initialize DB:", err));

app.get('/api/debug', (req, res) => {
    res.json({
        env: {
            TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? 'Set' : 'Missing',
            TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'Set' : 'Missing',
            NODE_ENV: process.env.NODE_ENV
        },
        dbUrlPrefix: process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.substring(0, 10) : 'N/A'
    });
});

app.get('/api/init', async (req, res) => {
    try {
        await initDB();
        res.json({ status: 'Database initialized successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/fix-db', async (req, res) => {
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

app.get('/api/nuke-db', async (req, res) => {
    try {
        console.log('Nuking database...');
        await db.execute('DELETE FROM rounds');
        await db.execute('DELETE FROM matches');
        await db.execute('DELETE FROM users');
        await db.execute('DELETE FROM courses');

        console.log('Database cleared. Re-initializing...');
        await initDB();

        res.json({ success: true, message: 'Database completely erased and re-initialized.' });
    } catch (error) {
        console.error('Nuke failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Auth Routes ---

// Helper to hash passwords

// Helper to hash passwords
const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

// --- Auth Routes ---

// Register
app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const existing = await db.execute({
            sql: 'SELECT id FROM users WHERE username = ?',
            args: [username]
        });

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const hashedPassword = hashPassword(password);
        const info = await db.execute({
            sql: 'INSERT INTO users (username, password, handicap, avatar, handicapMode, manualHandicap) VALUES (?, ?, ?, ?, ?, ?)',
            args: [username, hashedPassword, 28.0, null, 'auto', null]
        });

        // LibSQL returns lastInsertRowid as a string or bigint, convert to number/string safely
        const userId = info.lastInsertRowid.toString();

        const user = {
            id: userId,
            username,
            handicap: 28.0,
            avatar: null,
            handicapMode: 'auto',
            manualHandicap: null
        };

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE username = ?',
            args: [username]
        });

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const hashedPassword = hashPassword(password);
        // LibSQL returns rows as objects if configured, or arrays. 
        // @libsql/client default is objects with column names.
        if (user.password && user.password !== hashedPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // If user has no password (legacy), update it? 
        // For now, we assume if they are logging in via this route, they provided a password.
        // If the DB has NULL password, we might want to allow it or force reset.
        // Decision: If DB password is NULL, allow login and set password? 
        // Better: If DB password is NULL, fail and tell them to register/reset?
        // Let's stick to strict check: if user.password exists, it must match.
        // If user.password is NULL (legacy user), we could allow login if they provide ANY password and then set it?
        // Let's keep it simple: strict check. Legacy users might need manual migration or re-register.

        if (!user.password) {
            // Legacy user adoption: Set the password to what they provided
            await db.execute({
                sql: 'UPDATE users SET password = ? WHERE id = ?',
                args: [hashedPassword, user.id]
            });
        }

        res.json({
            id: user.id,
            username: user.username,
            handicap: user.handicap,
            avatar: user.avatar,
            handicapMode: user.handicapMode,
            manualHandicap: user.manualHandicap,
            friends: user.friends,
            avgScore: user.avgScore,
            avgScoreChange: user.avgScoreChange,
            handicapChange: user.handicapChange,
            favoriteCourses: user.favoriteCourses
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset Password (Unsecured for MVP)
app.post('/auth/reset-password', async (req, res) => {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) return res.status(400).json({ error: 'Username and new password required' });

    try {
        const hashedPassword = hashPassword(newPassword);
        const result = await db.execute({
            sql: 'UPDATE users SET password = ? WHERE username = ?',
            args: [hashedPassword, username]
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users (for challenging) - Updated to include lastGrossScore
app.get('/users', async (req, res) => {
    try {
        const result = await db.execute('SELECT id, username, handicap, avatar FROM users');
        const users = result.rows;

        // Fetch last gross score for each user
        // This is N+1 but acceptable for small user base. 
        // Optimized query would be a JOIN with a subquery on rounds.
        const usersWithScore = await Promise.all(users.map(async (u) => {
            try {
                // Get latest round with a valid score
                const roundResult = await db.execute({
                    sql: 'SELECT scores FROM rounds WHERE userId = ? AND scores IS NOT NULL ORDER BY date DESC LIMIT 1',
                    args: [u.id]
                });

                let lastGross = null;
                if (roundResult.rows.length > 0) {
                    const scoresStr = roundResult.rows[0].scores;
                    if (scoresStr) {
                        try {
                            const scores = JSON.parse(scoresStr);
                            // Sum up the scores
                            const total = Object.values(scores).reduce((a, b) => a + b, 0);
                            if (total > 0) lastGross = total;
                        } catch (e) {
                            // Ignore parse error
                        }
                    }
                }
                return { ...u, lastGrossScore: lastGross };
            } catch (e) {
                return u;
            }
        }));

        res.json(usersWithScore);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single user
app.get('/api/user/:id', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE id = ?',
            args: [req.params.id]
        });
        const user = result.rows[0];
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Update User Profile ---
app.post('/api/user/update', async (req, res) => {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'User ID required' });

    try {
        const fields = [];
        const args = [];

        // Whitelist allowed fields
        const allowed = ['username', 'avatar', 'handicap', 'handicapMode', 'manualHandicap', 'password', 'friends', 'favoriteCourses', 'avgScore', 'avgScoreChange', 'handicapChange'];

        for (const key of Object.keys(updates)) {
            if (allowed.includes(key)) {
                fields.push(`${key} = ?`);
                args.push(updates[key]);
            }
        }

        if (fields.length === 0) {
            return res.json({ success: true, message: 'No updates provided' });
        }

        args.push(id);

        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

        await db.execute({ sql, args });
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- User Activity Route ---
app.get('/api/user/:id/activity', async (req, res) => {
    const userId = req.params.id;
    try {
        // Fetch Rounds
        const roundsResult = await db.execute({
            sql: 'SELECT * FROM rounds WHERE userId = ?',
            args: [userId]
        });

        // Fetch Matches (as player1 or player2) with player names
        const matchesResult = await db.execute({
            sql: `
                    SELECT m.*, u1.username as p1Name, u2.username as p2Name 
                    FROM matches m
                    LEFT JOIN users u1 ON m.player1Id = u1.id
                    LEFT JOIN users u2 ON m.player2Id = u2.id
                    WHERE m.player1Id = ? OR m.player2Id = ?
                `,
            args: [userId, userId]
        });

        // Parse scores from JSON string
        const matches = matchesResult.rows.map(m => ({
            ...m,
            scores: m.scores ? JSON.parse(m.scores) : {}
        }));

        const rounds = roundsResult.rows.map(r => ({
            ...r,
            scores: r.scores ? JSON.parse(r.scores) : {}
        }));

        res.json({
            rounds: rounds,
            matches: matches
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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

// Helper to ensure scores column exists (Self-healing schema)
const ensureScoresColumn = async (table) => {
    try {
        await db.execute(`SELECT scores FROM ${table} LIMIT 1`);
    } catch (e) {
        // Check for various "no such column" error messages (driver dependent)
        if (e.message && (e.message.includes('no such column') || e.message.includes('column not found'))) {
            console.log(`Adding missing 'scores' column to ${table}...`);
            try {
                await db.execute(`ALTER TABLE ${table} ADD COLUMN scores TEXT`);
            } catch (alterError) {
                console.error(`Failed to add scores column to ${table}:`, alterError);
            }
        }
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
                            sql: 'UPDATE matches SET winnerId = ?, status = ?, scores = ?, player1Differential = ?, player2Differential = ?, countForHandicap = ? WHERE id = ?',
                            args: [match.winnerId, match.status, scoresJson, match.player1Differential || null, match.player2Differential || null, match.countForHandicap, existing.rows[0].id]
                        });
                    } else {
                        // Insert new match
                        await db.execute({
                            sql: `INSERT INTO matches (player1Id, player2Id, courseId, date, winnerId, status, scores, player1Differential, player2Differential, countForHandicap)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [match.player1Id, p2Id, courseId, matchDate, match.winnerId, match.status, scoresJson, match.player1Differential || null, match.player2Differential || null, match.countForHandicap]
                        });
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

app.get('/courses', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM courses');
        const courses = result.rows.map(c => ({
            ...c,
            holes: JSON.parse(c.holes)
        }));
        res.json(courses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/courses', async (req, res) => {
    const { name, holes, rating, slope, par } = req.body;
    try {
        const result = await db.execute({
            sql: 'INSERT INTO courses (name, holes, rating, slope, par) VALUES (?, ?, ?, ?, ?)',
            args: [name, JSON.stringify(holes), rating, slope, par]
        });
        res.json({ id: result.lastInsertRowid.toString(), success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/courses/:id', async (req, res) => {
    const { name, holes, rating, slope, par } = req.body;
    const id = req.params.id;
    try {
        const result = await db.execute({
            sql: 'UPDATE courses SET name = ?, holes = ?, rating = ?, slope = ?, par = ? WHERE id = ?',
            args: [name, JSON.stringify(holes), rating, slope, par, id]
        });

        if (result.rowsAffected === 0) {
            // Course didn't exist (e.g. wiped DB), so insert it with the specific ID
            await db.execute({
                sql: 'INSERT INTO courses (id, name, holes, rating, slope, par) VALUES (?, ?, ?, ?, ?, ?)',
                args: [id, name, JSON.stringify(holes), rating, slope, par]
            });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/courses', async (req, res) => {
    try {
        await db.execute('DELETE FROM courses');
        res.json({ success: true, message: 'All courses deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/courses/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.execute({
            sql: 'DELETE FROM courses WHERE id = ?',
            args: [id]
        });

        if (result.rowsAffected > 0) {
            res.json({ success: true, message: 'Course deleted' });
        } else {
            res.status(404).json({ error: 'Course not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Leaderboard Routes ---

app.get('/leaderboard/solo', async (req, res) => {
    try {
        const result = await db.execute('SELECT id, username, handicap FROM users ORDER BY handicap ASC LIMIT 10');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- League Routes ---

// Create League
app.post('/api/leagues', async (req, res) => {
    const { name, type, adminId, startDate, endDate, settings } = req.body;
    if (!name || !type || !adminId) return res.status(400).json({ error: 'Missing required fields' });

    try {
        const result = await db.execute({
            sql: 'INSERT INTO leagues (name, type, adminId, startDate, endDate, settings) VALUES (?, ?, ?, ?, ?, ?)',
            args: [name, type, adminId, startDate, endDate, JSON.stringify(settings || {})]
        });

        const leagueId = result.lastInsertRowid.toString();

        // Admin automatically joins
        await db.execute({
            sql: 'INSERT INTO league_members (leagueId, userId) VALUES (?, ?)',
            args: [leagueId, adminId]
        });

        res.json({ id: leagueId, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List User's Leagues
app.get('/api/leagues', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const result = await db.execute({
            sql: `
                SELECT l.*, lm.joinedAt
                FROM leagues l
                JOIN league_members lm ON l.id = lm.leagueId
                WHERE lm.userId = ?
                ORDER BY l.createdAt DESC
            `,
            args: [userId]
        });

        const leagues = result.rows.map(l => ({
            ...l,
            settings: l.settings ? JSON.parse(l.settings) : {}
        }));

        res.json(leagues);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Join League
app.post('/api/leagues/:id/join', async (req, res) => {
    const leagueId = req.params.id;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        // Check if already member
        const existing = await db.execute({
            sql: 'SELECT id FROM league_members WHERE leagueId = ? AND userId = ?',
            args: [leagueId, userId]
        });

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Already a member' });
        }

        await db.execute({
            sql: 'INSERT INTO league_members (leagueId, userId) VALUES (?, ?)',
            args: [leagueId, userId]
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get League Details & Standings (Strokeplay Logic)
app.get('/api/leagues/:id/standings', async (req, res) => {
    const leagueId = req.params.id;
    try {
        // Get League Info
        const leagueRes = await db.execute({
            sql: 'SELECT * FROM leagues WHERE id = ?',
            args: [leagueId]
        });
        const league = leagueRes.rows[0];
        if (!league) return res.status(404).json({ error: 'League not found' });

        // Get Members
        const membersRes = await db.execute({
            sql: `
                SELECT u.id, u.username, u.avatar, u.handicap, lm.points
                FROM league_members lm
                JOIN users u ON lm.userId = u.id
                WHERE lm.leagueId = ?
            `,
            args: [leagueId]
        });
        const members = membersRes.rows;

        // If Strokeplay, calculate points dynamically based on rounds
        // If Strokeplay, calculate points dynamically based on rounds
        if (league.type === 'STROKE') {
            // 1. Fetch all rounds for this league via league_rounds table
            // We join rounds to get the score details, and users to get player info
            const roundsRes = await db.execute({
                sql: `SELECT r.*, lr.points as leaguePoints, u.username, u.avatar 
                      FROM league_rounds lr
                      JOIN rounds r ON lr.roundId = r.id
                      JOIN users u ON r.userId = u.id 
                      WHERE lr.leagueId = ?
                      ORDER BY r.date DESC`,
                args: [leagueId]
            });
            const rounds = roundsRes.rows;

            // 2. Group rounds by "Event" (e.g. Week) or just treat each round as an event?
            // User requirement: "The user will play a single round and the score will be linked to the Strokeplay league."
            // Assumption: A league consists of multiple rounds. We need to rank players based on their performance.
            // Simple approach: Rank by Total Stableford Points accumulated? Or Average?
            // User mentioned points: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1.
            // This implies we need to group rounds into "Events" (e.g. Weekly) and assign points based on rank in that event.
            // OR, does every round submitted count as a competition against everyone else who played that week?

            // Let's assume "Weekly" buckets for now, based on ISO Week or similar.
            // Or simpler: Just list the rounds and calculate a total score?
            // "The user will play a single round... score linked to league."

            // Let's implement a simple "Total Stableford Points" leaderboard for now, 
            // but if the user wants the specific 25-18-15... system, we need to know WHEN the competition happens.
            // Let's assume for now that we just sum up the stableford points of all rounds played in the league.
            // Wait, the user explicitly mentioned the point distribution in a previous turn (I recall from context).
            // "Points: 1st: 25, 2nd: 18..." implies a ranking per event.

            // Let's try to group by Week (Monday-Sunday).
            const roundsByWeek = {};
            rounds.forEach(r => {
                const date = new Date(r.date);
                // Simple week key: Year-WeekNumber
                const oneJan = new Date(date.getFullYear(), 0, 1);
                const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
                const weekNum = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
                const key = `${date.getFullYear()}-W${weekNum}`;

                if (!roundsByWeek[key]) roundsByWeek[key] = [];
                roundsByWeek[key].push(r);
            });

            // Calculate points for each week
            const playerPoints = {};
            members.forEach(m => playerPoints[m.id] = 0);

            Object.values(roundsByWeek).forEach(weekRounds => {
                // Sort by Stableford (High is better)
                // If Strokeplay usually means Gross, but for handicap leagues usually Stableford.
                // Let's assume Stableford for now as it's safer for mixed handicaps.
                weekRounds.sort((a, b) => (b.stableford || 0) - (a.stableford || 0));

                // Assign points
                const distribution = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
                weekRounds.forEach((r, index) => {
                    if (index < distribution.length) {
                        if (!playerPoints[r.userId]) playerPoints[r.userId] = 0;
                        playerPoints[r.userId] += distribution[index];
                    }
                });
            });

            // Update members array with calculated points
            members.forEach(m => {
                m.points = playerPoints[m.id] || 0;
                // Also attach their rounds count or something?
                m.roundsPlayed = rounds.filter(r => r.userId === m.id).length;
            });
        }

        res.json({
            league: { ...league, settings: JSON.parse(league.settings || '{}') },
            standings: members.sort((a, b) => b.points - a.points),
            rounds: (league.type === 'STROKE' ? rounds : []) // Return rounds for display
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export default app;
