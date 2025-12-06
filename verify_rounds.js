import db from './server/db.js';

const verifyRounds = async () => {
    try {
        const res = await db.execute("SELECT id, date, userId FROM rounds ORDER BY date DESC LIMIT 10");
        console.log("Latest 10 Rounds:");
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    }
};

verifyRounds();
