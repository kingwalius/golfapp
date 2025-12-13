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

app.get('/api/debug-request', (req, res) => {
    res.json({
        url: req.url,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl,
        headers: req.headers,
        env: {
            NODE_ENV: process.env.NODE_ENV,
            HAS_DB_URL: !!process.env.TURSO_DATABASE_URL
        }
    });
});

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

// Reset Tournament (Admin Only) - Panic Button


// Global Catch-All for Debugging (Must be last)
app.use('*', (req, res) => {
    res.json({
        message: 'Global Catch-All Hit',
        url: req.url,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl,
        method: req.method,
        headers: req.headers
    });
});

const PORT = process.env.PORT || 3000;

// Initialize DB in background (Non-blocking)
initDB().then(() => {
    console.log('DB Initialized');
}).catch(e => {
    console.error('DB Initialization Failed:', e);
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;

