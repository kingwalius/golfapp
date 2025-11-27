import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { calculateHandicapIndex } from './calculations';
import { Flag, Swords, Calendar, ChevronRight, Search, Check } from 'lucide-react';

import { SwipeableItem } from '../../components/SwipeableItem';

export const Play = () => {
    const db = useDB();
    const { user } = useUser();
    const navigate = useNavigate();
    const [activities, setActivities] = useState([]);
    const [courses, setCourses] = useState([]);
    const [showNewRound, setShowNewRound] = useState(false);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [hcpIndex, setHcpIndex] = useState(54.0);

    const loadData = async () => {
        const r = await db.getAll('rounds');
        const m = await db.getAll('matches');
        const c = await db.getAll('courses');

        // Combine and sort by date (newest first)
        const combined = [
            ...r.map(item => ({ ...item, type: 'round' })),
            ...m.map(item => ({ ...item, type: 'match' }))
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
            synced: false
        };

        const id = await db.add('rounds', newRound);
        navigate(`/play/${id}`);
    };

    const handleDelete = async (id, type) => {
        if (confirm('Are you sure you want to delete this?')) {
            const storeName = type === 'round' ? 'rounds' : 'matches';
            await db.delete(storeName, id);
            loadData(); // Reload list
        }
    };

    return (
        <div className="p-6 pb-24">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-primary">Play Golf</h1>
                <p className="text-muted">Start a new round or continue playing.</p>
            </header>

            {!showNewRound ? (
                <div className="space-y-6">
                    <button
                        onClick={() => setShowNewRound(true)}
                        className="w-full bg-primary text-white py-6 rounded-2xl font-bold shadow-lg shadow-primary/20 flex items-center justify-center space-x-3 hover:bg-primaryLight transition active:scale-95"
                    >
                        <Flag size={28} />
                        <span className="text-lg">Start New Round</span>
                    </button>

                    <Link
                        to="/matchplay"
                        className="w-full bg-secondary text-white py-6 rounded-2xl font-bold shadow-lg shadow-secondary/20 flex items-center justify-center space-x-3 hover:bg-amber-500 transition active:scale-95 block"
                    >
                        <Swords size={28} />
                        <span className="text-lg">Start Matchplay</span>
                    </Link>

                    <div>
                        <h2 className="font-bold text-xl mb-4 text-dark">Recent Activity</h2>
                        <div className="space-y-1">
                            {activities.map(item => {
                                const course = courses.find(c => c.id === item.courseId);
                                const isMatch = item.type === 'match';

                                return (
                                    <SwipeableItem
                                        key={`${item.type}-${item.id}`}
                                        onDelete={() => handleDelete(item.id, item.type)}
                                        onClick={() => navigate(isMatch ? `/matchplay/${item.id}` : `/play/${item.id}`)}
                                    >
                                        <div className="p-5 flex justify-between items-center">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xl text-primary">
                                                        {isMatch ? <Swords size={20} /> : <Flag size={20} />}
                                                    </span>
                                                    <span className="font-bold text-lg text-dark group-hover:text-primary transition">
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
                                                            vs {item.player2?.name || 'Opponent'} ({item.status})
                                                        </span>
                                                    ) : (
                                                        <span>{item.totalStableford || 0} pts</span>
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
                        <div>
                            <label className="block text-sm font-bold text-muted mb-4 uppercase tracking-wide">Select Course</label>

                            {/* Search Input */}
                            <div className="relative mb-4">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
                                    <Search size={20} />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search courses..."
                                    className="input-field pl-12"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* Course Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                {courses
                                    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => setSelectedCourseId(c.id.toString())}
                                            className={`
                                            relative p-4 rounded-xl border-2 text-left transition-all duration-200 group
                                            ${selectedCourseId === c.id.toString()
                                                    ? 'border-primary bg-primary/5 shadow-md'
                                                    : 'border-stone-100 bg-white hover:border-primary/30 hover:shadow-soft'
                                                }
                                        `}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className={`font-bold text-lg mb-1 ${selectedCourseId === c.id.toString() ? 'text-primary' : 'text-dark'}`}>
                                                        {c.name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 text-sm text-muted">
                                                        <span>{c.holes?.length || 18} Holes</span>
                                                        <span>•</span>
                                                        <span>Par {c.holes ? c.holes.reduce((sum, h) => sum + (h.par || 0), 0) : 72}</span>
                                                    </div>
                                                </div>
                                                {selectedCourseId === c.id.toString() && (
                                                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm">
                                                        <Check size={16} />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                {courses.length === 0 && (
                                    <div className="col-span-full text-center py-8 text-muted">
                                        No courses found.
                                    </div>
                                )}
                            </div>
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
                                className="flex-1 bg-primary text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:shadow-none hover:bg-primaryLight transition"
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
