import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import clsx from 'clsx';

export const MatchplayScorecard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const db = useDB();
    const { sync } = useUser();
    const [match, setMatch] = useState(null);
    const [course, setCourse] = useState(null);

    useEffect(() => {
        const load = async () => {
            const m = await db.get('matches', parseInt(id));
            if (m) {
                // Ensure scores object exists
                if (!m.scores) m.scores = {};
                setMatch(m);
                const c = await db.get('courses', m.courseId);
                setCourse(c);
            }
        };
        load();
    }, [db, id]);

    const updateHole = async (holeNumber, p1Score, p2Score) => {
        const currentScores = match.scores[holeNumber] || {};
        const newScores = {
            ...match.scores,
            [holeNumber]: {
                p1: p1Score !== undefined ? parseInt(p1Score) : currentScores.p1,
                p2: p2Score !== undefined ? parseInt(p2Score) : currentScores.p2
            }
        };

        // Calculate hole winner
        const h = course.holes.find(h => h.number === holeNumber);
        const p1Net = (newScores[holeNumber].p1 || 0) - getStrokesReceived(match.player1.playingHcp, match.player2.playingHcp, h.hcp, true);
        const p2Net = (newScores[holeNumber].p2 || 0) - getStrokesReceived(match.player1.playingHcp, match.player2.playingHcp, h.hcp, false);

        let winner = 0; // Halved
        if (newScores[holeNumber].p1 && newScores[holeNumber].p2) {
            if (p1Net < p2Net) winner = 1;
            else if (p2Net < p1Net) winner = 2;
            newScores[holeNumber].winner = winner;
        }

        // Recalculate Match Status
        let p1Wins = 0;
        let p2Wins = 0;
        Object.values(newScores).forEach(s => {
            if (s.winner === 1) p1Wins++;
            if (s.winner === 2) p2Wins++;
        });

        let status = 'AS';
        if (p1Wins > p2Wins) status = `${p1Wins - p2Wins} UP`;
        if (p2Wins > p1Wins) status = `${p2Wins - p1Wins} UP`; // Should be P2 name or similar, but simple for now

        const newMatch = { ...match, scores: newScores, status, synced: false };
        setMatch(newMatch);
        await db.put('matches', newMatch);
    };

    // Helper to calculate strokes given based on difference
    const getStrokesReceived = (p1Hcp, p2Hcp, holeHcp, isP1) => {
        if (match.matchType === 'GROSS') {
            const strokes = match.manualStrokes || 0;
            const receiver = match.manualStrokesPlayer || 'p1';
            const isReceiver = receiver === 'p1' ? isP1 : !isP1;

            if (!isReceiver) return 0;
            return holeHcp <= strokes ? 1 : 0;
        }

        const diff = Math.abs(p1Hcp - p2Hcp);
        const givesStrokes = p1Hcp < p2Hcp ? !isP1 : isP1; // If P1 is lower, P2 gets strokes
        if (!givesStrokes) return 0;

        // Simple logic: strokes on hardest holes up to diff
        // Assuming diff < 18 for MVP
        return holeHcp <= diff ? 1 : 0;
    };

    if (!match || !course) return <div>Loading...</div>;

    return (
        <div className="pb-20">
            <div className="bg-secondary text-white p-4 sticky top-0 z-10 shadow-md flex justify-between items-center">
                <div>
                    <div className="font-bold">{match.player1.name} vs {match.player2.name}</div>
                    <div className="text-xs opacity-90">HCP: {match.player1.playingHcp} vs {match.player2.playingHcp}</div>
                </div>
                <div className="text-2xl font-black bg-white text-secondary px-3 py-1 rounded">
                    {match.status}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-center text-sm">
                    <thead className="bg-gray-100 font-medium text-gray-600">
                        <tr>
                            <th className="p-2">#</th>
                            <th className="p-2">HCP</th>
                            <th className="p-2">{match.player1.name}</th>
                            <th className="p-2">{match.player2.name}</th>
                            <th className="p-2">Win</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {course.holes.map(hole => {
                            const s = match.scores[hole.number] || {};
                            const p1Strokes = getStrokesReceived(match.player1.playingHcp, match.player2.playingHcp, hole.hcp, true);
                            const p2Strokes = getStrokesReceived(match.player1.playingHcp, match.player2.playingHcp, hole.hcp, false);

                            return (
                                <tr key={hole.number} className="bg-white">
                                    <td className="p-3 font-bold">{hole.number}</td>
                                    <td className="p-3 text-gray-400">{hole.hcp}</td>
                                    <td className="p-2 relative">
                                        <input
                                            type="number"
                                            className="w-12 h-12 border rounded-xl text-center text-lg font-bold touch-manipulation"
                                            value={s.p1 || ''}
                                            onChange={e => updateHole(hole.number, e.target.value, undefined)}
                                        />
                                        {p1Strokes > 0 && <span className="absolute top-1 right-0 text-xs text-red-500 font-bold">●</span>}
                                    </td>
                                    <td className="p-2 relative">
                                        <input
                                            type="number"
                                            className="w-12 h-12 border rounded-xl text-center text-lg font-bold touch-manipulation"
                                            value={s.p2 || ''}
                                            onChange={e => updateHole(hole.number, undefined, e.target.value)}
                                        />
                                        {p2Strokes > 0 && <span className="absolute top-1 right-0 text-xs text-red-500 font-bold">●</span>}
                                    </td>
                                    <td className="p-3 font-bold">
                                        {s.winner === 1 ? 'P1' : s.winner === 2 ? 'P2' : s.winner === 0 && s.p1 ? 'AS' : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {/* Finish Match Button */}
            <div className="mt-8 pb-8">
                <button
                    onClick={async () => {
                        // Calculate final winner
                        let p1Wins = 0;
                        let p2Wins = 0;
                        Object.values(match.scores).forEach(s => {
                            if (s.winner === 1) p1Wins++;
                            if (s.winner === 2) p2Wins++;
                        });

                        let winnerId = null;
                        if (p1Wins > p2Wins) winnerId = match.player1.id;
                        else if (p2Wins > p1Wins) winnerId = match.player2.id;

                        // Update match with winner and mark as completed
                        const completedMatch = {
                            ...match,
                            winnerId,
                            completed: true,
                            synced: false
                        };

                        await db.put('matches', completedMatch);
                        await sync();
                        navigate('/');
                    }}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg hover:bg-primaryLight transition active:scale-95 flex items-center justify-center gap-2"
                >
                    <span>🏁</span> Finish Match
                </button>
            </div>
        </div>
    );
};
