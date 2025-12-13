import express from 'express';
const app = express();

app.get('/api/debug', (req, res) => {
    res.json({ message: "Minimal Server Works" });
});

// Catch all for debugging
app.use('*', (req, res) => {
    res.json({ message: "Minimal Server Catch-All", url: req.url });
});

export default app;
