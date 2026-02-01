import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { calculatePlayingHcp, calculateStrokesReceived, calculateStableford, calculateBruttoStableford, calculateDifferential, calculateAdjustedScore } from './calculations';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { ScoreSelector } from '../../components/ScoreSelector';

export const Scorecard = () => {
    const { id } = useParams();
    const db = useDB();
    const { sync, recalculateHandicap } = useUser();
    const navigate = useNavigate();
    const [round, setRound] = useState(null);
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const r = await db.get('rounds', parseInt(id));
            if (r) {
                setRound(r);
                let c = await db.get('courses', r.courseId);

                // Fallback: If course not found by ID, try finding by serverId
                if (!c) {
                    const allCourses = await db.getAll('courses');
                    c = allCourses.find(course => course.serverId == r.courseId);
                }

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

    // Helper to get applicable slope/rating
    const getTeeData = () => {
        if (!round || !course) return { slope: 113, rating: 72 };
        // Priority 1: Snapshot in round
        if (round.teeInfo) return round.teeInfo;
        // Priority 2: Look up by ID in course
        if (round.teeId && course && course.tees && course.tees.length > 0) {
            const t = course.tees.find(t => t.id === round.teeId) || course.tees[0];
            // The original function returns tee data, not calculates differential.
            // The instruction's `const diff = calculateDifferential(...)` seems out of place here.
            // Assuming the intent was to safely find and return the tee, or the first tee.
            if (t) return t;
        }
        // Priority 3: Legacy root fields or defaults
        return { slope: course.slope || 113, rating: course.rating || 72.0 };
    };

    const { slope: courseSlope, rating: courseRating } = getTeeData();

    const updateScore = async (holeNumber, strokes) => {
        const newScores = { ...round.scores, [holeNumber]: parseInt(strokes) || 0 };

        // Recalculate totals
        let tStrokes = 0;
        let tStableford = 0;
        const playingHcp = calculatePlayingHcp(round.hcpIndex, courseSlope, courseRating, 72);

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
    const playingHcp = round && course ? calculatePlayingHcp(round.hcpIndex, courseSlope, courseRating, 72) : 0;
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
        const rating = round.holesPlayed === 9 ? (courseRating / 2) : courseRating;
        const slope = round.holesPlayed === 9 ? (courseSlope / 2) : courseSlope; // Also adjust slope for 9-hole calculation
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
            const rating = round.holesPlayed === 9 ? (courseRating / 2) : courseRating;
            const slope = round.holesPlayed === 9 ? (courseSlope / 2) : courseSlope;
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

        // Update handicap immediately (local)
        await recalculateHandicap();

        // Trigger sync to upload round immediately
        sync();
        navigate('/');
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (!round || !course) return <div className="p-4">Round not found.</div>;

    return (
        <div className="pb-32 bg-stone-50 min-h-screen">
            {/* Header */}
            <div className="bg-white sticky top-0 z-20 shadow-sm border-b border-stone-100">
                <div className="p-4 flex items-center justify-between">
                    <button onClick={() => navigate('/')} className="p-2 -ml-2 text-stone-400 hover:text-dark transition">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="text-center">
                        <h1 className="font-bold text-dark text-lg leading-none">{course?.name}</h1>
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                            {round.holesPlayed === 9 ? 'Front 9' : '18 Holes'} • HCP {round.hcpIndex}
                        </span>
                    </div>
                    <div className="w-10"></div>
                </div>

                {/* Live Summary Bar */}
                <div className="px-6 pb-4">
                    <div className="bg-dark text-white p-4 rounded-2xl shadow-lg flex justify-between items-center relative overflow-hidden">
                        <div className="relative z-10 flex gap-6">
                            <div>
                                <div className="text-[10px] h-3 font-bold text-stone-400 uppercase tracking-wider mb-0.5">Score</div>
                                <div className="text-3xl font-black leading-none">{totalStrokes}</div>
                            </div>
                            <div className="w-px bg-white/10"></div>
                            <div>
                                <div className="text-[10px] h-3 font-bold text-secondary uppercase tracking-wider mb-0.5">Points</div>
                                <div className="text-3xl font-black leading-none text-secondary">{totalStableford}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] h-3 font-bold text-emerald-400 uppercase tracking-wider mb-0.5">Differential</div>
                            <div className="text-xl font-bold">{differential.toFixed(1)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Disclaimer for 9-hole rounds */}
            {round.holesPlayed === 9 && (
                <div className="px-6 py-2">
                    <div className="bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wide py-2 px-3 rounded-lg text-center border border-amber-100">
                        Practice Round (9 Holes)
                    </div>
                </div>
            )}

            {/* List Layout */}
            <div className="px-4 space-y-3 mt-4">
                {course.holes.map((hole) => {
                    const strokes = round.scores[hole.number] || 0;
                    const strokesReceived = calculateStrokesReceived(playingHcp, hole.hcp);
                    const points = calculateStableford(hole.par, strokes, strokesReceived);

                    return (
                        <div key={hole.number} className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 flex items-center justify-between">
                            {/* Hole Info */}
                            <div className="flex items-center gap-4 w-28">
                                <div className="flex flex-col items-center justify-center w-10 h-10 bg-stone-50 rounded-xl border border-stone-100">
                                    <span className="text-xs font-bold text-stone-400">Hole</span>
                                    <span className="text-lg font-black text-dark leading-none">{hole.number}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-sm font-bold text-dark">Par {hole.par}</span>
                                    </div>
                                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                                        HCP {hole.hcp}
                                    </div>
                                </div>
                            </div>

                            {/* Input */}
                            <div className="flex-1 flex justify-center">
                                <ScoreSelector
                                    par={hole.par}
                                    value={strokes}
                                    onChange={(val) => updateScore(hole.number, val)}
                                />
                            </div>

                            {/* Points Badge */}
                            <div className="w-12 text-right">
                                {strokes > 0 && (
                                    <div className="inline-flex flex-col items-center justify-center bg-secondary/10 text-secondary px-2 py-1 rounded-lg min-w-[32px]">
                                        <span className="text-lg font-black leading-none">{points}</span>
                                        <span className="text-[8px] font-bold uppercase tracking-wider leading-none opacity-80">PTS</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Finish Action */}
            <div className="fixed bottom-24 left-0 right-0 px-6 py-4 z-40 pointer-events-none">
                <button
                    onClick={handleFinish}
                    className="w-full bg-dark text-white font-black text-lg py-4 rounded-3xl shadow-2xl hover:bg-black transition-all transform active:scale-95 pointer-events-auto flex items-center justify-center gap-2 border border-white/10"
                >
                    Finish Round
                </button>
            </div>
        </div>
    );
};
