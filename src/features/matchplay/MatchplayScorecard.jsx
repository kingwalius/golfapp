import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';

export const MatchplayScorecard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const db = useDB();
    const { sync, recalculateHandicap } = useUser();
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
                if (c) {
                    // Handle 9-hole rounds: filter to front9 or back9
                    if (m.holesPlayed === 9 && c.holes && c.holes.length >= 18) {
                        if (m.startingHole === 10) {
                            c.holes = c.holes.slice(9, 18);
                        } else {
                            c.holes = c.holes.slice(0, 9);
                        }
                    }
                    setCourse(c);
                }
            }
        };
        load();
    }, [id, db]);

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

    // Calculate current score for display
    let p1Score = 0;
    let p2Score = 0;
    if (match.scores) {
        Object.values(match.scores).forEach(s => {
            if (s.winner === 1) p1Score++;
            if (s.winner === 2) p2Score++;
        });
    }

    const diff = p1Score - p2Score;
    const absDiff = Math.abs(diff);
    let matchStatus = 'AS';
    if (diff !== 0) {
        const isUp = diff > 0; // Player 1 is up if diff > 0
        matchStatus = `${absDiff} ${isUp ? 'UP' : 'DOWN'}`;
        // If we want relative to user, we need user context, but for now let's stick to P1 perspective or generic "UP"
        // Actually, usually "2 UP" means the leader is 2 up.
        // Let's just show the leader.
        if (p1Score > p2Score) matchStatus = `${match.player1.name} +${absDiff}`;
        else if (p2Score > p1Score) matchStatus = `${match.player2.name} +${absDiff}`;
    }

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
                                {match.holesPlayed === 9 ? '9 Holes' : '18 Holes'} Match
                                {match.leagueMatchId && <span className="text-emerald-600 font-bold ml-1">• Tournament</span>}
                            </div>
                        </div>
                        <div className="w-10" />
                    </div>

                    {/* Match Status */}
                    <div className="flex justify-center items-center gap-8 pb-2">
                        <div className="text-center">
                            <div className="text-xs text-muted font-bold uppercase tracking-wider mb-1">{match.player1.name}</div>
                            <div className={`text-2xl font-black ${p1Score > p2Score ? 'text-primary' : 'text-dark'}`}>
                                {p1Score}
                            </div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Status</div>
                            <div className="px-3 py-1 bg-stone-100 rounded-lg font-bold text-dark text-sm">
                                {matchStatus}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-muted font-bold uppercase tracking-wider mb-1">{match.player2.name}</div>
                            <div className={`text-2xl font-black ${p2Score > p1Score ? 'text-primary' : 'text-dark'}`}>
                                {p2Score}
                            </div>
                        </div>
                    </div>
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
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            className="w-12 h-12 border rounded-xl text-center text-lg font-bold touch-manipulation"
                                            value={s.p1 || ''}
                                            onChange={e => updateHole(hole.number, e.target.value, undefined)}
                                        />
                                        {p1Strokes > 0 && <span className="absolute top-1 right-0 text-xs text-red-500 font-bold">●</span>}
                                    </td>
                                    <td className="p-2 relative">
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
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
            {/* Handicap Toggle */}
            <div className="px-4 mt-4">
                <label className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-stone-100">
                    <input
                        type="checkbox"
                        className="w-6 h-6 text-primary rounded focus:ring-primary"
                        checked={match.countForHandicap || false}
                        onChange={e => {
                            const newMatch = { ...match, countForHandicap: e.target.checked };
                            setMatch(newMatch);
                            db.put('matches', newMatch);
                        }}
                    />
                    <span className="font-bold text-dark">Count for Handicap (WHI)</span>
                </label>
            </div>

            {/* Finish Match Button */}
            <div className="mt-4 pb-8 px-4">
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

                        // Calculate Differential if enabled
                        let p1Diff = null;
                        let p2Diff = null;

                        if (match.countForHandicap) {
                            // Calculate Adjusted Gross Score (approximate for MVP)
                            let p1Strokes = 0;
                            let p2Strokes = 0;
                            let holesPlayedCount = 0;

                            if (course.holes) {
                                course.holes.forEach(h => {
                                    const s = match.scores[h.number];
                                    if (s) {
                                        if (s.p1) p1Strokes += s.p1;
                                        if (s.p2) p2Strokes += s.p2;
                                        if (s.p1 || s.p2) holesPlayedCount++;
                                    }
                                });
                            }

                            const targetHoles = match.holesPlayed || 18;
                            const rating = targetHoles === 9 ? (course.rating / 2) : course.rating;

                            // Only count if all holes played (MVP simplification)
                            if (holesPlayedCount === targetHoles) {
                                if (p1Strokes > 0) {
                                    const p1Slope = match.player1.teeInfo?.slope || course.slope || 113;
                                    const p1Rating = match.player1.teeInfo?.rating || course.rating || 72.0;
                                    const rating = targetHoles === 9 ? (p1Rating / 2) : p1Rating;
                                    const slope = targetHoles === 9 ? (p1Slope / 2) : p1Slope;

                                    p1Diff = (113 / slope) * (p1Strokes - rating);
                                    p1Diff = Math.round(p1Diff * 10) / 10;
                                }
                                if (p2Strokes > 0) {
                                    const p2Slope = match.player2.teeInfo?.slope || course.slope || 113;
                                    const p2Rating = match.player2.teeInfo?.rating || course.rating || 72.0;
                                    const rating = targetHoles === 9 ? (p2Rating / 2) : p2Rating;
                                    const slope = targetHoles === 9 ? (p2Slope / 2) : p2Slope;

                                    p2Diff = (113 / slope) * (p2Strokes - rating);
                                    p2Diff = Math.round(p2Diff * 10) / 10;
                                }
                            }
                        }

                        // Update match with winner and mark as completed
                        const completedMatch = {
                            ...match,
                            winnerId,
                            player1Differential: p1Diff,
                            player2Differential: p2Diff,
                            completed: true,
                            synced: false
                        };

                        await db.put('matches', completedMatch);

                        // Tournament Tie-Breaker Logic
                        if (match.leagueMatchId && !winnerId) {
                            // It's a tournament match and it's a tie. We must have a winner.
                            const p1WonPlayoff = confirm(`Match ended in a tie. Did ${match.player1.name} win the playoff?`);
                            if (p1WonPlayoff) {
                                completedMatch.winnerId = match.player1.id;
                                completedMatch.status = '1 UP (Playoff)';
                            } else {
                                const p2WonPlayoff = confirm(`Did ${match.player2.name} win the playoff?`);
                                if (p2WonPlayoff) {
                                    completedMatch.winnerId = match.player2.id;
                                    completedMatch.status = '1 UP (Playoff)';
                                } else {
                                    return; // Cancel finish if no winner selected
                                }
                            }
                            // Save updated match with playoff winner
                            await db.put('matches', completedMatch);
                        }

                        // Update handicap immediately (local)
                        await recalculateHandicap();

                        await sync();
                        navigate('/');
                    }}
                    className="w-full bg-dark text-white py-4 rounded-xl font-bold shadow-lg hover:bg-black transition active:scale-95 flex items-center justify-center gap-2"
                >
                    Finish Match
                </button>
            </div>

            {/* Disclaimer for 9-hole rounds */}
            {
                match.holesPlayed === 9 && (
                    <div className="px-4 pb-4 text-center">
                        <div className="bg-amber-50 text-amber-800 text-xs p-2 rounded-lg border border-amber-100 font-medium inline-block">
                            ℹ️ 9-Hole round: Not included in Handicap Calculation.
                        </div>
                    </div>
                )
            }
        </div>
    );
};
