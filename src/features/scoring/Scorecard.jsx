import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDB } from '../../lib/store';
import { calculatePlayingHcp, calculateStrokesReceived, calculateStableford, calculateBruttoStableford, calculateDifferential, calculateAdjustedScore } from './calculations';
import clsx from 'clsx';

export const Scorecard = () => {
    const { id } = useParams();
    const db = useDB();
    const navigate = useNavigate();
    const [round, setRound] = useState(null);
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!id) return;
            const r = await db.get('rounds', parseInt(id));
            if (r) {
                setRound(r);
                const c = await db.get('courses', r.courseId);
                setCourse(c);
            }
            setLoading(false);
        };
        loadData();
    }, [db, id]);

    const updateScore = async (holeNumber, strokes) => {
        const newScores = { ...round.scores, [holeNumber]: parseInt(strokes) || 0 };

        // Recalculate totals
        let tStrokes = 0;
        let tStableford = 0;
        const playingHcp = calculatePlayingHcp(round.hcpIndex, course.slope, course.rating, 72); // Re-calc here or store

        course.holes.forEach(h => {
            const s = newScores[h.number] || 0;
            if (s > 0) {
                tStrokes += s;
                tStableford += calculateStableford(h.par, s, calculateStrokesReceived(playingHcp, h.hcp));
            }
        });

        const newRound = {
            ...round,
            scores: newScores,
            totalStrokes: tStrokes,
            totalStableford: tStableford,
            synced: false
        };
        setRound(newRound);
        await db.put('rounds', newRound);
    };

    if (loading) return <div className="p-4">Loading scorecard...</div>;
    if (!round || !course) return <div className="p-4">Round not found.</div>;

    const playingHcp = calculatePlayingHcp(round.hcpIndex, course.slope, course.rating, 72); // Assuming Par 72 for total if not calc'd

    let totalStrokes = 0;
    let totalStableford = 0;
    let adjustedGrossScore = 0;

    return (
        <div className="pb-20">
            <div className="bg-primary text-white p-4 sticky top-0 z-10 shadow-md">
                <h1 className="text-xl font-bold">{course.name}</h1>
                <div className="flex justify-between text-sm mt-1 opacity-90">
                    <span>HCP: {round.hcpIndex}</span>
                    <span>Playing HCP: {playingHcp}</span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-center">
                    <thead className="bg-gray-100 text-gray-600 font-medium">
                        <tr>
                            <th className="p-2">Hole</th>
                            <th className="p-2">Par</th>
                            <th className="p-2">HCP</th>
                            <th className="p-2 w-20">Score</th>
                            <th className="p-2">Pts</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {course.holes.map((hole) => {
                            const strokes = round.scores[hole.number] || 0;
                            const strokesReceived = calculateStrokesReceived(playingHcp, hole.hcp);
                            const points = calculateStableford(hole.par, strokes, strokesReceived);
                            const adjustedScore = calculateAdjustedScore(hole.par, strokes, strokesReceived);

                            if (strokes > 0) {
                                totalStrokes += strokes;
                                totalStableford += points;
                                adjustedGrossScore += adjustedScore;
                            }

                            return (
                                <tr key={hole.number} className={clsx(strokes > 0 ? "bg-white" : "bg-gray-50")}>
                                    <td className="p-3 font-bold">{hole.number}</td>
                                    <td className="p-3">{hole.par}</td>
                                    <td className="p-3 text-gray-400">{hole.hcp}</td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            className={clsx(
                                                "w-full h-12 text-center border rounded-xl font-bold text-xl focus:ring-2 focus:ring-primary outline-none touch-manipulation",
                                                strokes === 0 ? "text-gray-300 border-gray-200" : "text-dark border-primary bg-teal-50"
                                            )}
                                            value={strokes || ''}
                                            placeholder="-"
                                            onChange={(e) => updateScore(hole.number, e.target.value)}
                                        />
                                    </td>
                                    <td className="p-3 font-bold text-primary">{strokes > 0 ? points : '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-gray-800 text-white font-bold">
                        <tr>
                            <td colSpan="2" className="p-3 text-right">Total</td>
                            <td className="p-3 text-xs font-normal text-gray-300">
                                Diff: {totalStrokes > 0 ? calculateDifferential(adjustedGrossScore, course.slope, course.rating).toFixed(1) : '-'}
                            </td>
                            <td className="p-3">{totalStrokes}</td>
                            <td className="p-3 text-secondary">{totalStableford}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {/* Finish Round Button */}
            <div className="mt-8 pb-8">
                <button
                    onClick={() => navigate('/')}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg hover:bg-primaryLight transition active:scale-95 flex items-center justify-center gap-2"
                >
                    <span>🏁</span> Finish Round
                </button>
            </div>
        </div>
    );
};
