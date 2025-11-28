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

        if (matches && matches.length) {
            for (const match of matches) {
                await db.execute({
                    sql: `INSERT OR IGNORE INTO matches (player1Id, player2Id, courseId, date, winnerId, status)
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [match.player1Id, match.player2Id, match.courseId, match.date, match.winnerId, match.status]
                });
            }
        }

        res.json({ success: true, message: 'Synced successfully' });
    } catch (error) {
        console.error(error);
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
