import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get all users (for challenging) - Updated to include lastGrossScore
router.get('/', async (req, res) => {
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

// Update User Profile
router.post('/update', async (req, res) => {
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

// Get User Activity
router.get('/:id/activity', async (req, res) => {
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

// Leaderboard Route
router.get('/leaderboard/solo', async (req, res) => {
    try {
        const result = await db.execute('SELECT id, username, handicap, avatar FROM users ORDER BY handicap ASC LIMIT 10');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single user (Last to avoid masking other specific routes)
router.get('/:id', async (req, res) => {
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

export default router;
