import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { calculateHandicapIndex, calculatePlayingHcp, calculateStableford, calculateStrokesReceived } from './calculations';
import { Flag, Swords, Calendar, ChevronRight, Search, Check, Trophy } from 'lucide-react';

import { SwipeableItem } from '../../components/SwipeableItem';
import { CourseSelectionModal } from '../../components/CourseSelectionModal';

export const Play = () => {
    const db = useDB();
    const { user, recalculateHandicap } = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const [activities, setActivities] = useState([]);
    const [courses, setCourses] = useState([]);
    const [showNewRound, setShowNewRound] = useState(false);
    const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [hcpIndex, setHcpIndex] = useState(54.0);
    const [holesToPlay, setHolesToPlay] = useState(18);
    const [startingHole, setStartingHole] = useState(1);

    // Check for League Mode
    const leagueId = location.state?.leagueId;

    useEffect(() => {
        if (leagueId) {
            setShowNewRound(true);
        }
    }, [leagueId]);

    const loadData = async () => {
        const r = await db.getAll('rounds');
        const m = await db.getAll('matches');
        let c = await db.getAll('courses');

        // If no courses found locally, try to fetch from server
        if (c.length === 0) {
            try {
                const res = await fetch('/courses');
                if (res.ok) {
                    const serverCourses = await res.json();
                    const tx = db.transaction('courses', 'readwrite');
                    for (const course of serverCourses) {
                        await tx.store.put(course);
                    }
                    await tx.done;
                    c = serverCourses; // Use fetched courses
                }
            } catch (e) {
                console.warn("Failed to fetch courses in Play.jsx", e);
            }
        }

        // Combine and sort by date (newest first)
        const combined = [
            ...r.filter(item => item.userId == user?.id).map(item => ({ ...item, type: 'round' })),
            ...m.filter(item => item.player1?.id == user?.id || item.player2?.id == user?.id).map(item => ({ ...item, type: 'match' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        setActivities(combined);
        setCourses(c);

        // Calculate dynamic HCP
        if (user) {
            if (user.handicapMode === 'MANUAL' && user.manualHandicap) {
                setHcpIndex(parseFloat(user.manualHandicap));
            } else if (user.handicap) {
                setHcpIndex(user.handicap);
            } else {
                const calculatedHcp = calculateHandicapIndex(r, c);
                setHcpIndex(calculatedHcp);
            }
        }
    };

    useEffect(() => {
        loadData();
    }, [db, user]);

    const startRound = async () => {
        if (!selectedCourseId) return;

        const newRound = {
            date: new Date(),
            courseId: parseInt(selectedCourseId),
            hcpIndex: parseFloat(hcpIndex),
            scores: {},
            completed: false,
            synced: false,
            userId: user.id,
            holesPlayed: holesToPlay,
            startingHole: startingHole,
            leagueId: leagueId || null // Link to league if present
        };

        const id = await db.add('rounds', newRound);
        navigate(`/play/${id}`);
    };

    const handleDelete = async (item) => {
        if (confirm('Are you sure you want to delete this?')) {
            const storeName = item.type === 'round' ? 'rounds' : 'matches';
            await db.delete(storeName, item.id);

            // Also delete from server to prevent re-sync
            try {
                const endpoint = item.type === 'round' ? '/api/rounds/delete' : '/api/matches/delete';
                await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: user.id,
                        courseId: item.courseId,
                        date: item.date
                    })
                });
            } catch (e) {
                console.error("Failed to delete from server", e);
            }

            loadData(); // Reload list

            // Recalculate handicap
            await recalculateHandicap();
        }
    };

    return (
        <div className="p-6 pb-24">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-dark">Play Golf</h1>
                <p className="text-muted">Start a new round or continue playing.</p>
            </header>

            {!showNewRound ? (
                <div className="space-y-6">
                    <button
                        onClick={() => setShowNewRound(true)}
                        className="w-full bg-dark text-white py-6 rounded-2xl font-bold shadow-lg shadow-stone-400/20 flex items-center justify-center space-x-3 hover:bg-black transition active:scale-95"
                    >
                        <Flag size={28} />
                        <span className="text-lg">Start New Round</span>
                    </button>

                    <Link
                        to="/matchplay"
                        className="w-full bg-stone-800 text-white py-6 rounded-2xl font-bold shadow-lg shadow-stone-800/20 flex items-center justify-center space-x-3 hover:bg-stone-900 transition active:scale-95 block"
                    >
                        <Swords size={28} />
                        <span className="text-lg">Start Matchplay</span>
                    </Link>

                    <div>
                        <h2 className="font-bold text-xl mb-4 text-dark">Recent Activity</h2>
                        <div className="space-y-1">
                            {activities.map(item => {
                                const course = courses.find(c => c.id == item.courseId || c.serverId == item.courseId);
                                const isMatch = item.type === 'match';

                                // Determine opponent name
                                let opponentName = 'Opponent';
                                if (isMatch) {
                                    const userId = user?.id?.toString();
                                    const p1Id = item.player1?.id?.toString();
                                    const p2Id = item.player2?.id?.toString();

                                    if (userId === p1Id) {
                                        opponentName = item.player2?.name || 'Opponent';
                                    } else if (userId === p2Id) {
                                        opponentName = item.player1?.name || 'Opponent';
                                    } else {
                                        opponentName = item.player2?.name || 'Opponent';
                                    }
                                }

                                return (
                                    <SwipeableItem
                                        key={`${item.type}-${item.id}`}
                                        onDelete={() => handleDelete(item)}
                                        onClick={() => navigate(isMatch ? `/matchplay/${item.id}` : `/play/${item.id}`)}
                                    >
                                        <div className="p-5 flex justify-between items-center">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xl text-dark">
                                                        {isMatch ? <Swords size={20} /> : <Flag size={20} />}
                                                    </span>
                                                    <span className="font-bold text-lg text-dark group-hover:text-dark transition">
                                                        {course?.name || 'Unknown Course'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-muted text-sm">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar size={14} />
                                                        {new Date(item.date).toLocaleDateString()}
                                                    </span>
                                                    <span>•</span>
                                                    {isMatch ? (
                                                        <span className="font-medium text-secondary">
                                                            vs {opponentName} ({item.status})
                                                        </span>
                                                    ) : (
                                                        <span>
                                                            {(() => {
                                                                // Recalculate totals on the fly to ensure accuracy
                                                                let tStrokes = 0;
                                                                let tStableford = 0;
                                                                if (course && item.scores) {
                                                                    // We need to calculate playing HCP to get accurate stableford
                                                                    // If we don't have the original HCP index stored, we might be slightly off, 
                                                                    // but usually item.hcpIndex is stored.
                                                                    const playingHcp = calculatePlayingHcp(item.hcpIndex || 54, course.slope, course.rating, 72);

                                                                    course.holes.forEach(h => {
                                                                        const s = item.scores[h.number] || 0;
                                                                        if (s > 0) {
                                                                            tStrokes += s;
                                                                            tStableford += calculateStableford(h.par, s, calculateStrokesReceived(playingHcp, h.hcp));
                                                                        }
                                                                    });
                                                                }
                                                                // Fallback to stored if calc fails (e.g. missing course data)
                                                                const displayStrokes = tStrokes > 0 ? tStrokes : (item.score || 0);
                                                                const displayStableford = tStrokes > 0 ? tStableford : (item.stableford || item.totalStableford || 0);

                                                                return `${displayStableford} pts (${displayStrokes})`;
                                                            })()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400">
                                                <ChevronRight size={20} />
                                            </div>
                                        </div>
                                    </SwipeableItem>
                                );
                            })}
                            {activities.length === 0 && (
                                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-stone-200">
                                    <p className="text-muted">No recent activity.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white p-6 rounded-3xl shadow-card border border-stone-100 animate-fade-in">
                    <h2 className="font-bold text-2xl mb-6 text-dark">New Round Setup</h2>

                    <div className="space-y-6">
                        {leagueId && (
                            <div className="bg-secondary/10 border border-secondary text-secondary p-4 rounded-xl flex items-center gap-3">
                                <Trophy size={24} />
                                <div>
                                    <h3 className="font-bold">League Round</h3>
                                    <p className="text-xs text-dark/70">This round will count towards your league standings.</p>
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-bold text-muted mb-4 uppercase tracking-wide">Select Course</label>

                            {!selectedCourseId ? (
                                <button
                                    onClick={() => setIsCourseModalOpen(true)}
                                    className="w-full py-5 border-2 border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center text-muted hover:border-dark hover:text-dark hover:bg-stone-50 transition group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center mb-2 group-hover:bg-white transition">
                                        <Search size={24} />
                                    </div>
                                    <span className="font-bold">Tap to select a course</span>
                                </button>
                            ) : (
                                (() => {
                                    const c = courses.find(course => course.id.toString() === selectedCourseId || course.serverId?.toString() === selectedCourseId);
                                    if (!c) return null;
                                    return (
                                        <div className="relative p-4 rounded-2xl border-2 border-dark bg-stone-100 shadow-md">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-lg text-dark mb-1">{c.name}</h3>
                                                    <div className="flex items-center gap-2 text-sm text-dark/70">
                                                        <span>{c.holes?.length || 18} Holes</span>
                                                        <span>•</span>
                                                        <span>Par {c.holes ? c.holes.reduce((sum, h) => sum + (h.par || 0), 0) : 72}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setIsCourseModalOpen(true)}
                                                    className="px-3 py-1.5 bg-white text-dark text-xs font-bold rounded-lg shadow-sm hover:bg-dark hover:text-white transition"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}

                            <CourseSelectionModal
                                isOpen={isCourseModalOpen}
                                onClose={() => setIsCourseModalOpen(false)}
                                onSelect={(course) => setSelectedCourseId(course.id.toString())}
                                courses={courses}
                                selectedCourseId={selectedCourseId}
                            />
                        </div>

                        <div className="pt-4 border-t border-stone-100">
                            <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wide">Your Handicap</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="number"
                                    step="0.1"
                                    className="input-field text-lg font-bold"
                                    value={hcpIndex}
                                    onChange={e => setHcpIndex(e.target.value)}
                                />
                                <div className="text-sm text-muted">
                                    Current Index
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-stone-100">
                            <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wide">Round Type</label>
                            <div className="flex gap-4 mb-4">
                                <button
                                    onClick={() => setHolesToPlay(18)}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${holesToPlay === 18
                                        ? 'bg-dark text-white shadow-md'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    18 Holes
                                </button>
                                <button
                                    onClick={() => setHolesToPlay(9)}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${holesToPlay === 9
                                        ? 'bg-dark text-white shadow-md'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    9 Holes
                                </button>
                            </div>

                            {/* Front 9 / Back 9 Selection */}
                            {holesToPlay === 9 && (() => {
                                const course = courses.find(c => c.id.toString() === selectedCourseId);
                                const is18HoleCourse = course?.holes?.length === 18;

                                if (is18HoleCourse) {
                                    return (
                                        <div className="flex gap-4 animate-fade-in">
                                            <button
                                                onClick={() => setStartingHole(1)}
                                                className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${startingHole === 1
                                                    ? 'bg-stone-600 text-white shadow-md'
                                                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                                    }`}
                                            >
                                                Front 9 (1-9)
                                            </button>
                                            <button
                                                onClick={() => setStartingHole(10)}
                                                className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${startingHole === 10
                                                    ? 'bg-stone-600 text-white shadow-md'
                                                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                                    }`}
                                            >
                                                Back 9 (10-18)
                                            </button>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={() => setShowNewRound(false)}
                                className="flex-1 py-4 text-muted font-bold hover:bg-stone-50 rounded-xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={startRound}
                                disabled={!selectedCourseId}
                                className="flex-1 bg-dark text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:shadow-none hover:bg-black transition"
                            >
                                Start Game
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
