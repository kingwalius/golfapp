import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import db, { initDB, ensureScoresColumn, ensureLeagueRoundsTable, ensureLeagueMatchIdColumn } from './db.js';
import crypto from 'crypto';

const app = express();


app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Initialize DB (Lazy or Manual)


// Health Check
app.get('/api/health', (req, res) => res.send('OK'));

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
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes); // Fallback

import userRoutes from './routes/users.js';
app.use('/api/users', userRoutes); // Standard
app.use('/api/user', userRoutes); // Legacy?
app.use('/users', userRoutes); // Short

import courseRoutes from './routes/courses.js';
app.use('/api/courses', courseRoutes);
app.use('/courses', courseRoutes);

import leagueRoutes from './routes/leagues.js';
app.use('/api/leagues', leagueRoutes);
// Note: /api/leagues/feed is mounted via leagueRoutes.

import debugRoutes from './routes/debug.js';
app.use('/api/debug', debugRoutes);

app.use('/api', debugRoutes); // Aliases for /init, /fix-db

// Redirect legacy route
app.get('/api/league/feed', (req, res) => res.redirect(`/api/leagues/feed?userId=${req.query.userId || ''}`));

import syncRoutes from './routes/sync.js';
app.use('/api', syncRoutes); // Mounts /sync, /rounds/delete, /matches/delete at /api root

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













// Reset Tournament (Admin Only) - Panic Button


const PORT = process.env.PORT || 3000;
(async () => { // Wrap in an async IIFE to allow await calls before app.listen
    try {
        await initDB(); /* Ensures tables and columns (including Guest user) */
    } catch (e) {
        console.error("Critical DB Init Failure:", e);
    }

    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
})(); // Immediately invoke the async function
if (process.env.NODE_ENV !== 'production') {
    // The original console.log was here, but the new app.listen handles it.
    // Keeping the if block structure as per user's snippet, though it's now empty.
}

export default app;

