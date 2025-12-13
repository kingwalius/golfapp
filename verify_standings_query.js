import db from './server/db.js';

async function verify() {
    try {
        console.log("Verifying Standings Query...");
        const leagueId = 1; // Assuming league ID 1 exists as per screenshot

        // 1. Check if League exists
        const leagueRes = await db.execute({
            sql: 'SELECT * FROM leagues WHERE id = ?',
            args: [leagueId]
        });
        console.log("League:", leagueRes.rows[0]);

        // 2. Run the problematic query
        console.log("Running Standings Query...");
        const sql = `
            SELECT r.*, lr.points as leaguePoints, u.username, u.avatar 
            FROM league_rounds lr
            JOIN rounds r ON lr.roundId = r.id
            JOIN users u ON r.userId = u.id 
            WHERE lr.leagueId = ?
            ORDER BY r.date DESC
        `;

        const roundsRes = await db.execute({
            sql: sql,
            args: [leagueId]
        });

        console.log("Query Success!");
        console.log("Rows found:", roundsRes.rows.length);
        if (roundsRes.rows.length > 0) {
            console.log("First row:", roundsRes.rows[0]);
        }

    } catch (e) {
        console.error("Query Failed!");
        console.error("Error Message:", e.message);
        console.error("Stack:", e.stack);
    }
}

verify();
