import { ping } from '../server/ping.js';

export default function handler(req, res) {
    res.status(200).json({ message: 'Import Test Works', ping });
}
