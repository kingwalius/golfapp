import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { calculatePlayingHcp } from '../scoring/calculations';
import { User, Search, Check } from 'lucide-react';

export const MatchplaySetup = () => {
    const db = useDB();
    const { user } = useUser();
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [opponentSearchQuery, setOpponentSearchQuery] = useState('');
    const [setup, setSetup] = useState({
        courseId: '',
        player1: { name: '', hcp: 0 },
        player2: { name: 'Opponent', hcp: 18.0, id: null },
        hcpAllowance: 0.75,
        matchType: 'NET',
        manualStrokes: 0,
        manualStrokesPlayer: 'p1'
    });

    // Initialize Player 1 with User Data
    useEffect(() => {
        if (user) {
            const hcp = user.handicapMode === 'MANUAL' && user.manualHandicap
                ? parseFloat(user.manualHandicap)
                : (user.handicap || 54.0);

            setSetup(prev => ({
                ...prev,
                player1: {
                    name: user.username || 'Me',
                    hcp: hcp,
                    id: user.id
                }
            }));
        }
    }, [user]);

    useEffect(() => {
        db.getAll('courses').then(setCourses);

        // Fetch online users
        fetch('/users')
            .then(res => res.json())
            .then(users => {
                if (Array.isArray(users)) {
                    setOnlineUsers(users);
                } else {
                    console.error("Fetched users is not an array:", users);
                    setOnlineUsers([]);
                }
            })
            .catch(err => console.error("Failed to fetch users", err));
    }, [db]);

    const startMatch = async () => {
        const course = courses.find(c => c.id === parseInt(setup.courseId));
        if (!course) return;

        const p1Playing = calculatePlayingHcp(setup.player1.hcp, course.slope, course.rating, 72);
        const p2Playing = calculatePlayingHcp(setup.player2.hcp, course.slope, course.rating, 72);

        // Ensure Player 2 has an ID (use 9999 for Guest if null)
        const player2Id = setup.player2.id || 9999;

        const match = {
            date: new Date(),
            courseId: course.id,
            player1: { ...setup.player1, playingHcp: p1Playing },
            player2: { ...setup.player2, id: player2Id, playingHcp: p2Playing },
            scores: {},
            status: 'AS',
            completed: false,
            matchType: setup.matchType,
            manualStrokes: setup.manualStrokes || 0,
            manualStrokesPlayer: setup.manualStrokesPlayer || 'p1',
            synced: false,
            holesPlayed: setup.holesToPlay || 18
        };

        const id = await db.add('matches', match);
        navigate(`/matchplay/${id}`);
    };



    return (
        <div className="p-4">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-primary">Matchplay</h1>
                    <p className="text-muted">Challenge a friend</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 overflow-hidden">
                    {user?.avatar ? (
                        <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <User size={24} />
                    )}
                </div>
            </header>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
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
                            className="w-full p-4 pl-12 border rounded-xl bg-gray-50 text-lg"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Course Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                        {Array.isArray(courses) && courses
                            .filter(c => c?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSetup({ ...setup, courseId: c.id.toString() })}
                                    className={`
                                    relative p-4 rounded-xl border-2 text-left transition-all duration-200 group
                                    ${setup.courseId === c.id.toString()
                                            ? 'border-primary bg-primary/5 shadow-md'
                                            : 'border-stone-100 bg-white hover:border-primary/30 hover:shadow-soft'
                                        }
                                `}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className={`font-bold text-lg mb-1 ${setup.courseId === c.id.toString() ? 'text-primary' : 'text-dark'}`}>
                                                {c.name}
                                            </h3>
                                            <div className="flex items-center gap-2 text-sm text-muted">
                                                <span>{c.holes?.length || 18} Holes</span>
                                                <span>•</span>
                                                <span>Par {c.holes ? c.holes.reduce((sum, h) => sum + (h.par || 0), 0) : 72}</span>
                                            </div>
                                        </div>
                                        {setup.courseId === c.id.toString() && (
                                            <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm">
                                                <Check size={16} />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        {(!Array.isArray(courses) || courses.length === 0) && (
                            <div className="col-span-full text-center py-8 text-muted">
                                No courses found.
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wide">Round Length</label>
                    <div className="flex gap-4 mb-4">
                        <button
                            onClick={() => setSetup({ ...setup, holesToPlay: 18 })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.holesToPlay !== 9
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            18 Holes
                        </button>
                        <button
                            onClick={() => setSetup({ ...setup, holesToPlay: 9 })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.holesToPlay === 9
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            9 Holes
                        </button>
                    </div>

                    <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wide">Match Type</label>
                    <div className="flex gap-4 mb-4">
                        <button
                            onClick={() => setSetup({ ...setup, matchType: 'NET' })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.matchType === 'NET'
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            Handicap (Net)
                        </button>
                        <button
                            onClick={() => setSetup({ ...setup, matchType: 'GROSS' })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.matchType === 'GROSS'
                                ? 'bg-primary text-white shadow-md'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            Scratch (Gross)
                        </button>
                    </div>

                    {setup.matchType === 'GROSS' && (
                        <div className="bg-white p-4 rounded border border-gray-200 animate-fade-in">
                            <label className="block text-sm font-bold text-muted mb-2">Strokes Advantage</label>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min="0"
                                        max="18"
                                        className="w-24 p-3 border rounded-xl text-center font-bold text-lg"
                                        value={setup.manualStrokes || 0}
                                        onChange={e => setSetup({ ...setup, manualStrokes: parseInt(e.target.value) || 0 })}
                                    />
                                    <span className="text-sm text-muted">strokes for:</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {[
                                        { id: 'p1', name: setup.player1.name || 'Player 1' },
                                        { id: 'p2', name: setup.player2.name || 'Player 2' }
                                    ].map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setSetup({ ...setup, manualStrokesPlayer: p.id })}
                                            className={`
                                                flex justify-between items-center p-4 rounded-xl border text-left transition-all text-base
                                                ${setup.manualStrokesPlayer === p.id
                                                    ? 'bg-teal-100 border-teal-300 shadow-sm ring-1 ring-teal-300'
                                                    : 'bg-white border-gray-100 hover:bg-gray-50'
                                                }
                                            `}
                                        >
                                            <span className="font-medium truncate">{p.name}</span>
                                            {setup.manualStrokesPlayer === p.id && (
                                                <span className="text-teal-600 font-bold">
                                                    <Check size={16} />
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p className="text-xs text-muted mt-3">
                                Strokes will be distributed on the toughest holes (Index 1-{setup.manualStrokes || 0}).
                            </p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <h3 className="font-bold mb-2">Player 1 (You)</h3>
                        <input
                            type="text" placeholder="Name"
                            className="w-full p-3 border rounded-xl mb-2 bg-gray-100 text-gray-600 cursor-not-allowed font-medium"
                            value={setup.player1.name}
                            readOnly
                        />
                        {setup.matchType === 'NET' && (
                            <input
                                type="number" placeholder="HCP"
                                className="w-full p-3 border rounded-xl font-medium"
                                value={setup.player1.hcp}
                                onChange={e => setSetup({ ...setup, player1: { ...setup.player1, hcp: parseFloat(e.target.value) } })}
                            />
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold mb-2">Player 2</h3>

                        {/* Online User Selection */}
                        <div className="mb-4">
                            <div className="relative mb-2">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">
                                    <Search size={16} />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search opponent..."
                                    className="w-full p-3 pl-10 border rounded-xl bg-teal-50 border-teal-200 text-base"
                                    value={opponentSearchQuery}
                                    onChange={e => setOpponentSearchQuery(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                {Array.isArray(onlineUsers) && onlineUsers
                                    .filter(u => u?.username?.toLowerCase().includes(opponentSearchQuery.toLowerCase()))
                                    .map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => setSetup({
                                                ...setup,
                                                player2: { name: u.username, hcp: u.handicap, id: u.id }
                                            })}
                                            className={`
                                                flex justify-between items-center p-3 rounded-xl border text-left transition-all text-base
                                                ${setup.player2.id === u.id
                                                    ? 'bg-teal-100 border-teal-300 shadow-sm'
                                                    : 'bg-white border-gray-100 hover:bg-gray-50'
                                                }
                                            `}
                                        >
                                            <span className="font-medium truncate">{u.username}</span>
                                            <span className="text-muted text-xs bg-gray-100 px-2 py-1 rounded-lg">{u.handicap}</span>
                                        </button>
                                    ))}
                                {(!Array.isArray(onlineUsers) || onlineUsers.length === 0) && (
                                    <div className="text-center py-4 text-muted text-sm">No opponents found</div>
                                )}
                            </div>
                        </div>

                        <input
                            type="text" placeholder="Name"
                            className="w-full p-3 border rounded-xl mb-2 bg-gray-100 text-gray-600 cursor-not-allowed font-medium"
                            value={setup.player2.name}
                            readOnly
                        />
                        {setup.matchType === 'NET' && (
                            <input
                                type="number" placeholder="HCP"
                                className="w-full p-3 border rounded-xl font-medium"
                                value={setup.player2.hcp}
                                onChange={e => setSetup({ ...setup, player2: { ...setup.player2, hcp: parseFloat(e.target.value) } })}
                            />
                        )}
                    </div>
                </div>

                <button
                    onClick={startMatch}
                    disabled={!setup.courseId}
                    className="w-full bg-secondary text-white py-3 rounded-lg font-bold mt-4 hover:bg-amber-600 transition"
                >
                    Start Match
                </button>
            </div>
        </div>
    );
};
