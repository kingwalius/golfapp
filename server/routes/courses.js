import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get all courses
router.get('/', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM courses');
        const courses = result.rows.map(c => ({
            ...c,
            holes: JSON.parse(c.holes)
        }));
        res.json(courses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new course
router.post('/', async (req, res) => {
    const { name, holes, rating, slope, par } = req.body;
    try {
        // Check for existing course by name (Case Insensitive)
        const existing = await db.execute({
            sql: 'SELECT id FROM courses WHERE name = ? COLLATE NOCASE',
            args: [name]
        });

        if (existing.rows.length > 0) {
            console.log(`Course exists: ${name} (${existing.rows[0].id}). Returning existing ID.`);
            return res.json({ id: existing.rows[0].id.toString(), success: true, message: 'Course already exists' });
        }

        const result = await db.execute({
            sql: 'INSERT INTO courses (name, holes, rating, slope, par) VALUES (?, ?, ?, ?, ?)',
            args: [name, JSON.stringify(holes), rating, slope, par]
        });
        res.json({ id: result.lastInsertRowid.toString(), success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update course
router.put('/:id', async (req, res) => {
    const { name, holes, rating, slope, par } = req.body;
    const id = req.params.id;
    try {
        const result = await db.execute({
            sql: 'UPDATE courses SET name = ?, holes = ?, rating = ?, slope = ?, par = ? WHERE id = ?',
            args: [name, JSON.stringify(holes), rating, slope, par, id]
        });

        if (result.rowsAffected === 0) {
            // Course didn't exist (e.g. wiped DB), so insert it with the specific ID
            await db.execute({
                sql: 'INSERT INTO courses (id, name, holes, rating, slope, par) VALUES (?, ?, ?, ?, ?, ?)',
                args: [id, name, JSON.stringify(holes), rating, slope, par]
            });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete all courses
router.delete('/', async (req, res) => {
    try {
        await db.execute('DELETE FROM courses');
        res.json({ success: true, message: 'All courses deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete single course
router.delete('/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.execute({
            sql: 'DELETE FROM courses WHERE id = ?',
            args: [id]
        });

        if (result.rowsAffected > 0) {
            res.json({ success: true, message: 'Course deleted' });
        } else {
            res.status(404).json({ error: 'Course not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
