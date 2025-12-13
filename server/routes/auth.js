import express from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = express.Router();

// Helper to hash passwords
const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

// Register
router.post('/register', async (req, res) => {
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
router.post('/login', async (req, res) => {
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

        if (user.password && user.password !== hashedPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

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
router.post('/reset-password', async (req, res) => {
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

export default router;
