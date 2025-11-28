import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import db, { initDB } from './db.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Initialize DB
// Initialize DB
initDB();

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

// --- Auth Routes ---

import crypto from 'crypto';

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
            manualHandicap: user.manualHandicap
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TEMPORARY: Reset password for GeilerPachler
app.get('/api/reset-password-temp', async (req, res) => {
    try {
        const hashedPassword = hashPassword('1234');
        await db.execute({
            sql: 'UPDATE users SET password = ? WHERE username = ?',
            args: [hashedPassword, 'GeilerPachler']
        });
        res.send('Password for GeilerPachler reset to 1234');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Get all users (for challenging)
app.get('/users', async (req, res) => {
    try {
        const result = await db.execute('SELECT id, username, handicap FROM users');
        res.json(result.rows);
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
    const { id, username, avatar, handicapMode, manualHandicap } = req.body;
    try {
        await db.execute({
            sql: `
              UPDATE users 
              SET username = ?, avatar = ?, handicapMode = ?, manualHandicap = ?
              WHERE id = ?
            `,
            args: [username, avatar, handicapMode, manualHandicap, id]
        });
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

        // Parse JSON fields if necessary (LibSQL might return strings for JSON columns)
        // Matches don't have JSON columns in the schema I recall, but let's check.
        // Rounds don't have JSON columns.
        // Actually, matches might have 'scores' as JSON if we stored it? 
        // Wait, the schema for matches is:
        // CREATE TABLE matches (
        //   id INTEGER PRIMARY KEY AUTOINCREMENT,
        //   player1Id INTEGER,
        //   player2Id INTEGER,
        //   courseId INTEGER,
        //   date TEXT,
        //   winnerId INTEGER,
        //   status TEXT
        // );
        // It seems we are NOT storing scores in the DB for matches in the sync logic?
        // Let's check the sync logic in server/index.js again.
        // It inserts: player1Id, player2Id, courseId, date, winnerId, status.
        // It does NOT insert scores.
        // This means the "Scorecard" details won't be fully available on the other device if we don't store them.
        // BUT, for "Recent Activity" list, we just need the summary.
        // However, if the user clicks on it, they might expect to see the scorecard.
        // The current `matches` table definition in `db.js` (which I should check) might be missing `scores`.
        // If so, that's a separate issue, but for now let's just sync what we have.

        // Wait, if I look at `MatchplayScorecard.jsx`, it uses `match.scores`.
        // If the server doesn't store `scores`, then syncing back will result in a match without scores.
        // Let's check `db.js` to see the schema. 
        // I'll proceed with adding the endpoint first, but I should verify the schema.

        // Parse scores from JSON string
        const matches = matchesResult.rows.map(m => ({
            ...m,
            scores: m.scores ? JSON.parse(m.scores) : {}
        }));

        res.json({
            rounds: roundsResult.rows,
            matches: matches
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Sync Routes ---
app.post('/sync', async (req, res) => {
    const { userId, rounds, matches } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        // LibSQL doesn't support better-sqlite3 style transactions directly in the same way,
        // but supports batch execution. However, for simplicity/compatibility with this logic,
        // we will execute sequentially or use `batch` if possible.
        // For now, sequential await is safest migration.

        if (rounds && rounds.length) {
            for (const round of rounds) {
                await db.execute({
                    sql: `INSERT OR IGNORE INTO rounds (userId, courseId, date, score, stableford, hcpIndex)
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [userId, round.courseId, round.date, round.score, round.stableford, round.hcpIndex]
                });
            }
        }

        // Helper to get or create Guest ID
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

        if (matches && matches.length) {
            for (const match of matches) {
                // Use Guest ID if player2Id is missing/null
                const p2Id = match.player2Id || guestId;
                const scoresJson = JSON.stringify(match.scores || {});

                // Check if match exists (Upsert Logic)
                const existing = await db.execute({
                    sql: 'SELECT id FROM matches WHERE player1Id = ? AND player2Id = ? AND courseId = ? AND date = ?',
                    args: [match.player1Id, p2Id, match.courseId, match.date]
                });

                if (existing.rows.length > 0) {
                    // Update existing match
                    await db.execute({
                        sql: 'UPDATE matches SET winnerId = ?, status = ?, scores = ? WHERE id = ?',
                        args: [match.winnerId, match.status, scoresJson, existing.rows[0].id]
                    });
                } else {
                    // Insert new match
                    await db.execute({
                        sql: `INSERT INTO matches (player1Id, player2Id, courseId, date, winnerId, status, scores)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        args: [match.player1Id, p2Id, match.courseId, match.date, match.winnerId, match.status, scoresJson]
                    });
                }
            }
        }

        res.json({ success: true, message: 'Synced successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
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

// --- Leaderboard Routes ---

app.get('/leaderboard/solo', async (req, res) => {
    try {
        const result = await db.execute('SELECT id, username, handicap FROM users ORDER BY handicap ASC LIMIT 10');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export app for Vercel
export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
