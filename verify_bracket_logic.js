const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

const execute = (sql, args = []) => {
    return new Promise((resolve, reject) => {
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
            db.all(sql, args, (err, rows) => {
                if (err) reject(err);
                else resolve({ rows });
            });
        } else {
            db.run(sql, args, function (err) {
                if (err) reject(err);
                else resolve({ lastInsertRowid: this.lastInsertRowid });
            });
        }
    });
};

(async () => {
    try {
        console.log("Setting up DB...");
        // 1. Setup Schema
        await execute("CREATE TABLE matches (id INTEGER PRIMARY KEY, winnerId INTEGER, status TEXT, leagueMatchId INTEGER)");
        await execute("CREATE TABLE league_matches (id INTEGER PRIMARY KEY, leagueId INTEGER, roundNumber INTEGER, matchNumber INTEGER, matchId INTEGER, winnerId INTEGER, player1Id INTEGER, player2Id INTEGER)");

        // 2. Insert Dummy League Match
        await execute("INSERT INTO league_matches (id, leagueId, roundNumber, matchNumber, player1Id, player2Id) VALUES (5, 3, 1, 1, 10004, 9999)");

        // 3. Insert Dummy Next Match (Round 2)
        await execute("INSERT INTO league_matches (id, leagueId, roundNumber, matchNumber, player1Id, player2Id) VALUES (6, 3, 2, 1, NULL, NULL)");

        console.log("Simulating Sync...");
        const match = {
            winnerId: 10004,
            status: '1 UP',
            leagueMatchId: 5
        };

        // 4. Run Sync Logic
        // Simulate Match Upsert
        const existing = await execute("SELECT * FROM matches WHERE id = 99"); // Assume not found
        let matchId;

        if (existing.rows && existing.rows.length > 0) {
            // Update
        } else {
            // Insert
            const res = await execute("INSERT INTO matches (winnerId, status, leagueMatchId) VALUES (?, ?, ?)", [match.winnerId, match.status, match.leagueMatchId]);
            matchId = res.lastInsertRowid;
        }

        console.log(`Inserted Match ID: ${matchId}`);

        // Tournament Bracket Update Logic
        if (match.leagueMatchId && match.winnerId && match.status !== 'AS') {
            console.log(`Advancing Tournament Bracket for League Match ${match.leagueMatchId}`);
            // 1. Update the bracket match with the result
            await execute('UPDATE league_matches SET matchId = ?, winnerId = ? WHERE id = ?', [matchId, match.winnerId, match.leagueMatchId]);

            // 2. Advance Winner
            const bracketMatchRes = await execute('SELECT * FROM league_matches WHERE id = ?', [match.leagueMatchId]);

            if (bracketMatchRes.rows.length > 0) {
                const currentMatch = bracketMatchRes.rows[0];
                const nextRound = currentMatch.roundNumber + 1;
                const nextMatchNum = Math.ceil(currentMatch.matchNumber / 2);
                const isPlayer1 = (currentMatch.matchNumber % 2) !== 0;
                const field = isPlayer1 ? 'player1Id' : 'player2Id';
                console.log(`Looking for Next Match: League ${currentMatch.leagueId}, Round ${nextRound}, Match ${nextMatchNum}, Field ${field}`);

                const nextMatchRes = await execute('SELECT id FROM league_matches WHERE leagueId = ? AND roundNumber = ? AND matchNumber = ?', [currentMatch.leagueId, nextRound, nextMatchNum]);

                if (nextMatchRes.rows.length > 0) {
                    await execute(`UPDATE league_matches SET ${field} = ? WHERE id = ?`, [match.winnerId, nextMatchRes.rows[0].id]);
                    console.log(`Advanced winner ${match.winnerId} to Round ${nextRound}, Match ${nextMatchNum}`);
                } else {
                    console.log("Next match not found!");
                }
            }
        }

        // 5. Verify
        const lm5 = await execute("SELECT * FROM league_matches WHERE id = 5");
        console.log("League Match 5:", lm5.rows[0]);

        const lm6 = await execute("SELECT * FROM league_matches WHERE id = 6");
        console.log("League Match 6 (Next Round):", lm6.rows[0]);

    } catch (e) {
        console.error("Error:", e);
    }
})();
