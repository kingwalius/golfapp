import express from 'express';
import db, { ensureLeagueRoundsTable, ensureScoresColumn } from '../db.js';

const router = express.Router();

// Helper to ensure table exists before usage (for Strokeplay)
// We import ensureLeagueRoundsTable from db.js

// Create League
router.post('/', async (req, res) => {
    const { name, type, adminId, startDate, endDate, settings } = req.body;
    // Default round frequency
    const roundFrequency = req.body.roundFrequency || 'WEEKLY';

    try {
        // Self-healing: Ensure roundFrequency column exists
        try {
            await db.execute("SELECT roundFrequency FROM leagues LIMIT 1");
        } catch (e) {
            if (e.message && (e.message.includes('no such column') || e.message.includes('column not found'))) {
                console.log('Adding missing roundFrequency column to leagues...');
                try {
                    await db.execute("ALTER TABLE leagues ADD COLUMN roundFrequency TEXT DEFAULT 'WEEKLY'");
                } catch (alterError) {
                    console.error("Failed to add roundFrequency column:", alterError);
                }
            }
        }

        const result = await db.execute({
            sql: 'INSERT INTO leagues (name, type, adminId, startDate, endDate, settings, roundFrequency) VALUES (?, ?, ?, ?, ?, ?, ?)',
            args: [name, type, adminId, startDate || null, endDate || null, JSON.stringify(settings || {}), roundFrequency]
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
router.get('/', async (req, res) => {
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
router.post('/:id/join', async (req, res) => {
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

// Delete League (Admin Only)
router.delete('/:id', async (req, res) => {
    const leagueId = req.params.id;
    const { userId } = req.body; // Pass userId in body to verify admin

    try {
        // Verify Admin
        const leagueRes = await db.execute({
            sql: 'SELECT adminId FROM leagues WHERE id = ?',
            args: [leagueId]
        });

        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        if (leagueRes.rows[0].adminId !== userId) return res.status(403).json({ error: 'Only admin can delete league' });

        // Delete League (Cascading deletes should handle members and rounds if configured, but let's be safe)
        // 1. Delete League Rounds
        await db.execute({ sql: 'DELETE FROM league_rounds WHERE leagueId = ?', args: [leagueId] });

        // 2. Delete Members
        await db.execute({ sql: 'DELETE FROM league_members WHERE leagueId = ?', args: [leagueId] });

        // 3. Delete League
        await db.execute({ sql: 'DELETE FROM leagues WHERE id = ?', args: [leagueId] });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Leave League
router.post('/:id/leave', async (req, res) => {
    const leagueId = req.params.id;
    const { userId } = req.body;

    try {
        // Remove from members
        await db.execute({
            sql: 'DELETE FROM league_members WHERE leagueId = ? AND userId = ?',
            args: [leagueId, userId]
        });

        // Remove their rounds from league_rounds
        await db.execute({
            sql: `DELETE FROM league_rounds 
                  WHERE leagueId = ? 
                  AND roundId IN (SELECT id FROM rounds WHERE userId = ?)`,
            args: [leagueId, userId]
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Tournament (Matchplay)
router.post('/:id/start-tournament', async (req, res) => {
    const leagueId = req.params.id;
    const { userId } = req.body;

    try {
        // Self-healing: Ensure matchNumber column exists
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

        // 1. Verify Admin & League Type
        const leagueRes = await db.execute({
            sql: 'SELECT * FROM leagues WHERE id = ?',
            args: [leagueId]
        });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        const league = leagueRes.rows[0];
        if (league.adminId !== userId) return res.status(403).json({ error: 'Only admin can start tournament' });
        if (league.type !== 'MATCH') return res.status(400).json({ error: 'League is not Matchplay' });

        // Check if already started
        const existingMatches = await db.execute({
            sql: 'SELECT id FROM league_matches WHERE leagueId = ?',
            args: [leagueId]
        });
        if (existingMatches.rows.length > 0) return res.status(400).json({ error: 'Tournament already started' });

        // 2. Fetch Members
        const membersRes = await db.execute({
            sql: 'SELECT userId FROM league_members WHERE leagueId = ?',
            args: [leagueId]
        });
        let players = membersRes.rows.map(r => r.userId);

        if (players.length < 2) return res.status(400).json({ error: 'Need at least 2 players' });

        // 3. Shuffle Players
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }

        // 4. Generate Bracket
        let powerOf2 = 2;
        while (powerOf2 < players.length) powerOf2 *= 2;

        const totalRounds = Math.log2(powerOf2);
        const byes = powerOf2 - players.length;

        // Round 1 Matches
        const numMatchesR1 = powerOf2 / 2;

        let roster = [...players];
        for (let b = 0; b < byes; b++) roster.push(null); // Add BYEs
        // Shuffle roster to randomize byes
        for (let k = roster.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [roster[k], roster[j]] = [roster[j], roster[k]];
        }

        // Create Round 1
        for (let i = 0; i < numMatchesR1; i++) {
            const p1 = roster[i * 2];
            const p2 = roster[i * 2 + 1];
            let winner = null;

            if (p1 && !p2) winner = p1;
            if (!p1 && p2) winner = p2;
            if (!p1 && !p2) winner = null;

            await db.execute({
                sql: `INSERT INTO league_matches (leagueId, roundNumber, matchNumber, player1Id, player2Id, winnerId) 
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [leagueId, 1, i + 1, p1, p2, winner]
            });
        }

        // Create Future Rounds (Placeholders)
        let currentRoundMatches = numMatchesR1;
        for (let r = 2; r <= totalRounds; r++) {
            currentRoundMatches /= 2;
            for (let m = 1; m <= currentRoundMatches; m++) {
                await db.execute({
                    sql: `INSERT INTO league_matches (leagueId, roundNumber, matchNumber, player1Id, player2Id, winnerId) 
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [leagueId, r, m, null, null, null]
                });
            }
        }

        // Auto-Advance Byes (Propagate winners of Round 1 to Round 2)
        const r1Matches = await db.execute({
            sql: 'SELECT * FROM league_matches WHERE leagueId = ? AND roundNumber = 1 AND winnerId IS NOT NULL',
            args: [leagueId]
        });

        for (const match of r1Matches.rows) {
            const nextRound = 2;
            const nextMatchNum = Math.ceil(match.matchNumber / 2);
            const isPlayer1 = (match.matchNumber % 2) !== 0;

            const field = isPlayer1 ? 'player1Id' : 'player2Id';

            await db.execute({
                sql: `UPDATE league_matches SET ${field} = ? WHERE leagueId = ? AND roundNumber = ? AND matchNumber = ?`,
                args: [match.winnerId, leagueId, nextRound, nextMatchNum]
            });
        }

        res.json({ success: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Start Team Tournament
router.post('/:id/start-team-tournament', async (req, res) => {
    const leagueId = req.params.id;
    const { userId } = req.body;

    try {
        // Self-healing: Ensure team column exists
        try {
            await db.execute("SELECT team FROM league_members LIMIT 1");
        } catch (e) {
            if (e.message && (e.message.includes('no such column') || e.message.includes('column not found'))) {
                console.log('Adding missing team column to league_members...');
                try {
                    await db.execute("ALTER TABLE league_members ADD COLUMN team TEXT");
                } catch (alterError) {
                    console.error("Failed to add team column:", alterError);
                }
            }
        }

        // 1. Verify Admin & League Type
        const leagueRes = await db.execute({
            sql: 'SELECT * FROM leagues WHERE id = ?',
            args: [leagueId]
        });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        const league = leagueRes.rows[0];

        let settings = {};
        try { settings = JSON.parse(league.settings || '{}'); } catch (e) { }

        if (league.adminId !== userId) return res.status(403).json({ error: 'Only admin can start tournament' });
        if (league.type !== 'TEAM') return res.status(400).json({ error: 'League is not Team Cup format' });

        if (settings.tournamentStatus && settings.tournamentStatus !== 'SETUP') {
            return res.status(400).json({ error: 'Tournament already started' });
        }

        // 2. Fetch Members with Handicaps
        const membersRes = await db.execute({
            sql: `
                SELECT lm.userId, u.handicap, u.username
                FROM league_members lm
                JOIN users u ON lm.userId = u.id
                WHERE lm.leagueId = ?
            `,
            args: [leagueId]
        });

        let members = membersRes.rows;
        if (members.length < 2) return res.status(400).json({ error: 'Need at least 2 players' });

        // 3. Balanced Distribution (Snake Draft)
        members.sort((a, b) => (a.handicap || 54) - (b.handicap || 54));

        const teamGreenIds = [];
        const teamGoldIds = [];

        members.forEach((member, index) => {
            const cycle = index % 4;
            if (cycle === 0 || cycle === 3) {
                teamGreenIds.push(member.userId);
            } else {
                teamGoldIds.push(member.userId);
            }
        });

        // Update DB
        for (const uid of teamGreenIds) {
            await db.execute("UPDATE league_members SET team = 'GREEN' WHERE leagueId = ? AND userId = ?", [leagueId, uid]);
        }
        for (const uid of teamGoldIds) {
            await db.execute("UPDATE league_members SET team = 'GOLD' WHERE leagueId = ? AND userId = ?", [leagueId, uid]);
        }

        // 4. Select Captains
        const greenCaptainId = teamGreenIds[Math.floor(Math.random() * teamGreenIds.length)];
        const goldCaptainId = teamGoldIds[Math.floor(Math.random() * teamGoldIds.length)];

        // 5. Update Settings
        const numMatches = Math.min(teamGreenIds.length, teamGoldIds.length);
        const winningScore = (numMatches / 2) + 0.5;

        settings.captainGreenId = greenCaptainId;
        settings.captainGoldId = goldCaptainId;
        settings.formattedWinningScore = winningScore;
        settings.tournamentStatus = 'PAIRING';
        settings.team1Name = 'Green Team';
        settings.team2Name = 'Gold Team';

        await db.execute({
            sql: 'UPDATE leagues SET settings = ? WHERE id = ?',
            args: [JSON.stringify(settings), leagueId]
        });

        res.json({
            success: true,
            teams: { green: teamGreenIds, gold: teamGoldIds },
            captains: { green: greenCaptainId, gold: goldCaptainId }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Submit Team Lineup
router.post('/:id/submit-lineup', async (req, res) => {
    const leagueId = req.params.id;
    const { userId, lineup, team } = req.body;

    try {
        const leagueRes = await db.execute({ sql: 'SELECT * FROM leagues WHERE id = ?', args: [leagueId] });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        const league = leagueRes.rows[0];
        let settings = {};
        try { settings = JSON.parse(league.settings || '{}'); } catch (e) { }

        // Verify Captain
        if (team === 'GREEN' && settings.captainGreenId !== userId) return res.status(403).json({ error: 'Not Green Captain' });
        if (team === 'GOLD' && settings.captainGoldId !== userId) return res.status(403).json({ error: 'Not Gold Captain' });

        // Save Lineup
        if (team === 'GREEN') settings.lineupGreen = lineup;
        if (team === 'GOLD') settings.lineupGold = lineup;

        // Check if we can Pair
        if (settings.lineupGreen && settings.lineupGold) {
            console.log("Both lineups submitted. Generating Matches...");
            const len = Math.min(settings.lineupGreen.length, settings.lineupGold.length);

            for (let i = 0; i < len; i++) {
                const p1 = settings.lineupGreen[i];
                const p2 = settings.lineupGold[i];

                await db.execute({
                    sql: `INSERT INTO league_matches (leagueId, roundNumber, matchNumber, player1Id, player2Id, winnerId) 
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [leagueId, 1, i + 1, p1, p2, null]
                });
            }
            settings.tournamentStatus = 'PLAYING';
        }

        await db.execute({
            sql: 'UPDATE leagues SET settings = ? WHERE id = ?',
            args: [JSON.stringify(settings), leagueId]
        });

        res.json({ success: true, status: settings.tournamentStatus });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Get League Standings / Details
router.get('/:id/standings', async (req, res) => {
    const leagueId = req.params.id;
    try {
        const leagueRes = await db.execute({
            sql: 'SELECT * FROM leagues WHERE id = ?',
            args: [leagueId]
        });
        const league = leagueRes.rows[0];
        if (!league) return res.status(404).json({ error: 'League not found' });

        const membersRes = await db.execute({
            sql: `
                SELECT u.id, u.username, u.avatar, u.handicap, lm.points, lm.team
                FROM league_members lm
                JOIN users u ON lm.userId = u.id
                WHERE lm.leagueId = ?
            `,
            args: [leagueId]
        });
        const members = membersRes.rows;

        let rounds = [];

        // If Strokeplay, calculate points dynamically
        if (league.type === 'STROKE') {
            await ensureLeagueRoundsTable();

            const roundsRes = await db.execute({
                sql: `SELECT r.*, lr.points as leaguePoints, u.username, u.avatar 
                      FROM league_rounds lr
                      JOIN rounds r ON lr.roundId = r.id
                      JOIN users u ON r.userId = u.id 
                      WHERE lr.leagueId = ?
                      ORDER BY r.date DESC`,
                args: [leagueId]
            });
            rounds = roundsRes.rows;

            // Group rounds by Frequency and calculate points (omitted for brevity, copied full logic in implementation)
            // ... (Full point calculation logic from original file) ...
            const frequency = league.roundFrequency || 'WEEKLY';
            const roundsByPeriod = {};

            rounds.forEach(r => {
                const date = new Date(r.date);
                let key;

                if (frequency === 'MONTHLY') {
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else {
                    const oneJan = new Date(date.getFullYear(), 0, 1);
                    const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
                    const weekNum = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
                    key = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
                }

                if (!roundsByPeriod[key]) roundsByPeriod[key] = [];
                roundsByPeriod[key].push(r);
            });

            const playerPoints = {};
            const periodResults = [];
            members.forEach(m => playerPoints[m.id] = 0);
            const sortedPeriods = Object.keys(roundsByPeriod).sort();

            sortedPeriods.forEach(periodKey => {
                const periodRounds = roundsByPeriod[periodKey];
                const periodStandings = {};
                const userRounds = {};
                periodRounds.forEach(r => {
                    if (!userRounds[r.userId]) userRounds[r.userId] = [];
                    userRounds[r.userId].push(r);
                });

                Object.keys(userRounds).forEach(userId => {
                    const rounds = userRounds[userId];
                    rounds.sort((a, b) => (b.leaguePoints || 0) - (a.leaguePoints || 0));
                    const bestRound = rounds[0];

                    periodStandings[userId] = {
                        rawPoints: bestRound.leaguePoints || 0,
                        bestRoundId: bestRound.id,
                        user: members.find(m => m.id == userId)
                    };
                });

                const rankedUsers = Object.keys(periodStandings).sort((a, b) =>
                    periodStandings[b].rawPoints - periodStandings[a].rawPoints
                );

                const distribution = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
                const periodBreakdown = {
                    id: periodKey,
                    name: frequency === 'MONTHLY' ? periodKey : `Week ${periodKey.split('-W')[1]}`,
                    results: []
                };

                rankedUsers.forEach((userId, index) => {
                    let pointsEarned = 0;
                    if (index < distribution.length) {
                        pointsEarned = distribution[index];
                    }
                    playerPoints[userId] = (playerPoints[userId] || 0) + pointsEarned;
                    periodBreakdown.results.push({
                        userId,
                        username: periodStandings[userId].user?.username || 'Unknown',
                        avatar: periodStandings[userId].user?.avatar,
                        rawScore: periodStandings[userId].rawPoints,
                        points: pointsEarned,
                        rank: index + 1
                    });
                });
                periodResults.push(periodBreakdown);
            });

            members.forEach(m => {
                m.points = playerPoints[m.id] || 0;
                m.roundsPlayed = rounds.filter(r => r.userId === m.id).length;
            });

            res.json({
                league: { ...league, settings: JSON.parse(league.settings || '{}') },
                standings: members.sort((a, b) => b.points - a.points),
                rounds: (league.type === 'STROKE' ? rounds : []),
                events: periodResults.reverse()
            });
            return;
        }

        res.json({
            league: { ...league, settings: JSON.parse(league.settings || '{}') },
            standings: members.sort((a, b) => b.points - a.points),
            rounds: (league.type === 'STROKE' ? rounds : [])
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Complete Tournament
router.post('/:id/complete-tournament', async (req, res) => {
    const { id } = req.params;
    const { userId, winner } = req.body;

    try {
        const leagueRes = await db.execute({ sql: 'SELECT * FROM leagues WHERE id = ?', args: [id] });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        const league = leagueRes.rows[0];

        if (league.adminId !== userId) return res.status(403).json({ error: 'Only admin can complete tournament' });

        const settings = JSON.parse(league.settings || '{}');
        settings.tournamentStatus = 'COMPLETED';
        settings.winner = winner;

        await db.execute({
            sql: 'UPDATE leagues SET settings = ? WHERE id = ?',
            args: [JSON.stringify(settings), id]
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error completing tournament:", error);
        res.status(500).json({ error: error.message });
    }
});

// Start Sudden Death
router.post('/:id/start-sudden-death', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    try {
        const leagueRes = await db.execute({ sql: 'SELECT * FROM leagues WHERE id = ?', args: [id] });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        const league = leagueRes.rows[0];

        if (league.adminId !== userId) return res.status(403).json({ error: 'Only admin can start sudden death' });

        const settings = JSON.parse(league.settings || '{}');
        settings.tournamentStatus = 'SUDDEN_DEATH';
        settings.suddenDeathGreen = null;
        settings.suddenDeathGold = null;

        await db.execute({
            sql: 'UPDATE leagues SET settings = ? WHERE id = ?',
            args: [JSON.stringify(settings), id]
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error starting sudden death:", error);
        res.status(500).json({ error: error.message });
    }
});

// Submit Sudden Death Pick
router.post('/:id/submit-sudden-death', async (req, res) => {
    const { id } = req.params;
    const { userId, playerId, team } = req.body;

    try {
        const leagueRes = await db.execute({ sql: 'SELECT * FROM leagues WHERE id = ?', args: [id] });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        const settings = JSON.parse(leagueRes.rows[0].settings || '{}');

        // Verify Captain
        if (team === 'GREEN' && settings.captainGreenId !== userId) return res.status(403).json({ error: 'Not Green Captain' });
        if (team === 'GOLD' && settings.captainGoldId !== userId) return res.status(403).json({ error: 'Not Gold Captain' });

        // Save Pick
        if (team === 'GREEN') settings.suddenDeathGreen = playerId;
        if (team === 'GOLD') settings.suddenDeathGold = playerId;

        // Check if both picked
        if (settings.suddenDeathGreen && settings.suddenDeathGold) {
            console.log("Both captains picked for Sudden Death. Generating Match...");
            const p1 = settings.suddenDeathGreen;
            const p2 = settings.suddenDeathGold;

            const matchesCheck = await db.execute({
                sql: 'SELECT MAX(matchNumber) as maxNum FROM league_matches WHERE leagueId = ?',
                args: [id]
            });
            const nextMatchNum = (matchesCheck.rows[0].maxNum || 0) + 1;

            await db.execute({
                sql: `INSERT INTO league_matches (leagueId, roundNumber, matchNumber, player1Id, player2Id, winnerId) 
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [id, 99, nextMatchNum, p1, p2, null]
            });

            settings.tournamentStatus = 'PLAYING_SD';
        }

        await db.execute({
            sql: 'UPDATE leagues SET settings = ? WHERE id = ?',
            args: [JSON.stringify(settings), id]
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error submit sudden death:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get League Matches
router.get('/:id/matches', async (req, res) => {
    const leagueId = req.params.id;
    try {
        const result = await db.execute({
            sql: `
                SELECT lm.*, 
                       u1.username as p1Name, 
                       u2.username as p2Name,
                       m.status as status
                FROM league_matches lm
                LEFT JOIN users u1 ON lm.player1Id = u1.id
                LEFT JOIN users u2 ON lm.player2Id = u2.id
                LEFT JOIN matches m ON lm.matchId = m.id
                WHERE lm.leagueId = ?
                ORDER BY lm.roundNumber, lm.matchNumber
            `,
            args: [leagueId]
        });
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Reset Tournament (Admin Only)
router.delete('/:id/tournament', async (req, res) => {
    const leagueId = req.params.id;
    const { userId } = req.body;

    try {
        const leagueRes = await db.execute({ sql: 'SELECT adminId FROM leagues WHERE id = ?', args: [leagueId] });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        if (leagueRes.rows[0].adminId !== userId) return res.status(403).json({ error: 'Only admin can reset tournament' });

        await db.execute({
            sql: 'DELETE FROM league_matches WHERE leagueId = ?',
            args: [leagueId]
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Advance Match (Admin Only)
router.post('/:id/advance-match', async (req, res) => {
    const leagueId = req.params.id;
    const { userId, matchId, winnerId } = req.body;

    try {
        const leagueRes = await db.execute({ sql: 'SELECT adminId FROM leagues WHERE id = ?', args: [leagueId] });
        if (leagueRes.rows.length === 0) return res.status(404).json({ error: 'League not found' });
        if (leagueRes.rows[0].adminId !== userId) return res.status(403).json({ error: 'Only admin can advance match' });

        await db.execute({
            sql: 'UPDATE league_matches SET winnerId = ? WHERE id = ?',
            args: [winnerId, matchId]
        });

        const matchRes = await db.execute({
            sql: 'SELECT * FROM league_matches WHERE id = ?',
            args: [matchId]
        });
        const match = matchRes.rows[0];

        // Propagate if standard tournament
        if (match.roundNumber < 99) {
            const nextRound = match.roundNumber + 1;
            const nextMatchNum = Math.ceil(match.matchNumber / 2);
            const isPlayer1 = (match.matchNumber % 2) !== 0;
            const field = isPlayer1 ? 'player1Id' : 'player2Id';

            await db.execute({
                sql: `UPDATE league_matches SET ${field} = ? WHERE leagueId = ? AND roundNumber = ? AND matchNumber = ?`,
                args: [winnerId, leagueId, nextRound, nextMatchNum]
            });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// League Feed
router.get('/feed', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        // Get leagues user is in
        const leaguesRes = await db.execute({
            sql: 'SELECT leagueId FROM league_members WHERE userId = ?',
            args: [userId]
        });
        const leagueIds = leaguesRes.rows.map(r => r.leagueId);

        if (leagueIds.length === 0) return res.json([]);

        const placeholders = leagueIds.map(() => '?').join(',');
        const result = await db.execute({
            sql: `
                SELECT 
                    'round' as type,
                    u.username,
                    u.avatar,
                    c.name as courseName,
                    r.date,
                    r.score,
                    r.stableford,
                    l.name as leagueName
                FROM league_rounds lr
                JOIN rounds r ON lr.roundId = r.id
                JOIN users u ON r.userId = u.id
                JOIN courses c ON r.courseId = c.id
                JOIN leagues l ON lr.leagueId = l.id
                WHERE lr.leagueId IN (${placeholders})
                ORDER BY r.date DESC
                LIMIT 20
            `,
            args: leagueIds
        });

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
