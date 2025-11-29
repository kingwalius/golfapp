import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { calculatePlayingHcp, calculateStrokesReceived, calculateStableford, calculateBruttoStableford, calculateDifferential, calculateAdjustedScore } from './calculations';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';

export const Scorecard = () => {
    const { id } = useParams();
    const db = useDB();
    const { sync } = useUser();
    const navigate = useNavigate();
    const [round, setRound] = useState(null);
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const r = await db.get('rounds', parseInt(id));
            if (r) {
                setRound(r);
                const c = await db.get('courses', r.courseId);
                if (c) {
                    // Filter holes if 9-hole round
                    if (r.holesPlayed === 9) {
                        if (r.startingHole === 10) {
                            c.holes = c.holes.slice(9, 18);
                        } else {
                            c.holes = c.holes.slice(0, 9);
                        }
                    }
                    setCourse(c);
                }
            }
            setLoading(false); // Keep setLoading(false) to ensure loading state is handled
        };
        load();
    }, [id, db]);

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

    // Calculate totals for display
    const playingHcp = round && course ? calculatePlayingHcp(round.hcpIndex, course.slope, course.rating, 72) : 0;
    let totalStrokes = 0;
    let totalStableford = 0;
    let adjustedGrossScore = 0;
    const stablefordScores = {}; // To store stableford points per hole for later use if needed

    if (round && course) {
        course.holes.forEach(hole => {
            const strokes = round.scores[hole.number] || 0;
            if (strokes > 0) {
                const strokesReceived = calculateStrokesReceived(playingHcp, hole.hcp);
                const points = calculateStableford(hole.par, strokes, strokesReceived);
                const adjustedScore = calculateAdjustedScore(hole.par, strokes, strokesReceived);

                totalStrokes += strokes;
                totalStableford += points;
                adjustedGrossScore += adjustedScore;
                stablefordScores[hole.number] = points;
            }
        });
    }

    // Calculate Differential (Live)
    let differential = 0;
    if (course && round && totalStrokes > 0) {
        // Adjust Rating for 9-hole rounds
        const rating = round.holesPlayed === 9 ? (course.rating / 2) : course.rating;
        const slope = round.holesPlayed === 9 ? (course.slope / 2) : course.slope; // Also adjust slope for 9-hole calculation
        differential = calculateDifferential(adjustedGrossScore, slope, rating);
    }

    const handleFinish = async () => {
        // Calculate final stats
        let finalStrokes = 0;
        let finalStableford = 0;
        let finalAdjustedScore = 0;

        if (round && course) {
            course.holes.forEach(hole => {
                const strokes = round.scores[hole.number] || 0;
                if (strokes > 0) {
                    const strokesReceived = calculateStrokesReceived(playingHcp, hole.hcp);
                    const points = calculateStableford(hole.par, strokes, strokesReceived);
                    const adjustedScore = calculateAdjustedScore(hole.par, strokes, strokesReceived);

                    finalStrokes += strokes;
                    finalStableford += points;
                    finalAdjustedScore += adjustedScore;
                }
            });
        }

        // Calculate Differential
        let finalDifferential = 0;
        if (course && round && finalStrokes > 0) {
            const rating = round.holesPlayed === 9 ? (course.rating / 2) : course.rating;
            const slope = round.holesPlayed === 9 ? (course.slope / 2) : course.slope;
            finalDifferential = calculateDifferential(finalAdjustedScore, slope, rating);
        }

        // Update round with final stats
        const finishedRound = {
            ...round,
            completed: true,
            totalStrokes: finalStrokes,
            totalStableford: finalStableford,
            differential: finalDifferential,
            synced: false
        };

        await db.put('rounds', finishedRound);

        // Trigger sync to upload round immediately
        sync();
        navigate('/');
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (!round || !course) return <div className="p-4">Round not found.</div>;

    return (
        <div className="pb-24">
            {/* Header */}
            <div className="bg-white sticky top-0 z-10 shadow-sm border-b border-stone-100">
                <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                        <button onClick={() => navigate('/')} className="p-2 -ml-2 text-stone-400 hover:text-dark">
                            <ChevronLeft size={24} />
                        </button>
                        <div className="text-center flex-1 px-4">
                            <h1 className="font-bold text-lg text-dark leading-tight">{course?.name}</h1>
                            <div className="text-xs text-muted font-medium uppercase tracking-wider mt-1">
                                {round.holesPlayed === 9 ? '9 Holes' : '18 Holes'} • HCP {round.hcpIndex}
                            </div>
                        </div>
                        <div className="w-10" />
                    </div>

                </div>
            </div>

            {/* Disclaimer for 9-hole rounds */}
            {round.holesPlayed === 9 && (
                <div className="bg-amber-50 text-amber-800 text-xs p-2 text-center border-b border-amber-100 font-medium">
                    ℹ️ 9-Hole round: Not included in Handicap Calculation.
                </div>
            )}

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
                    onClick={handleFinish}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg hover:bg-primaryLight transition active:scale-95 flex items-center justify-center gap-2"
                >
                    Finish Round
                </button>
            </div>
        </div>
    );
};
