import { createClient } from '@libsql/client';

const url = 'libsql://golf-app-kingwalius.aws-eu-west-1.turso.io';
const authToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjQzMDg1MTQsImlkIjoiODY1YTMxMmYtZmIyOC00MTYzLTg0OTQtMTkzYTBhMDlhMWQ1IiwicmlkIjoiZjM2MzFhYTgtODEwNi00N2FlLWJjNzUtNmM3MDcwMDBiMzIxIn0.wm0BHUbQrtk4RXO-0ZpCLg3WSBRB8BKrxWehKs4uJBprB22kx3P7Xz5CEWX3DFZgK5HChVL7d9XIvDuel5DaAQ';

const db = createClient({
    url,
    authToken,
});

async function test() {
    try {
        console.log("Connecting...");
        const result = await db.execute('SELECT 1');
        console.log("Success!", result);
    } catch (e) {
        console.error("Connection failed:", e);
    }
}

test();
