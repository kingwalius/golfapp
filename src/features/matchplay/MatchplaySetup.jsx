
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { calculatePlayingHcp } from '../scoring/calculations';
import { User, Search, Check, ChevronLeft } from 'lucide-react';
import { CourseSelectionModal } from '../../components/CourseSelectionModal';
import { PlayerSelectionModal } from '../../components/PlayerSelectionModal';

export const MatchplaySetup = () => {
    const db = useDB();
    const { user } = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const [courses, setCourses] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
    const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
    const [opponentSearchQuery, setOpponentSearchQuery] = useState('');
    const [setup, setSetup] = useState({
        courseId: '',
        player1: { name: '', hcp: 0, teeId: '' }, // Added teeId
        player2: { name: 'Opponent', hcp: 18.0, id: null, teeId: '' }, // Added teeId
        hcpAllowance: 0.75,
        matchType: 'NET',
        manualStrokes: 0,
        manualStrokesPlayer: 'p1',
        leagueMatchId: null
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
                    ...prev.player1,
                    name: user.username || 'Me',
                    hcp: hcp,
                    id: user.id
                }
            }));
        }
    }, [user]);

    // Pre-fill from location state OR Query Params (League Tournament)
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const qOpponentId = params.get('opponentId');
        const qOpponentName = params.get('opponentName');
        const qLeagueMatchId = params.get('leagueMatchId');

        if (location.state || qLeagueMatchId) {
            const state = location.state || {};
            const opponentId = state.opponentId || qOpponentId;
            const opponentName = state.opponentName || qOpponentName;
            const leagueMatchId = state.leagueMatchId || qLeagueMatchId;

            console.log("MatchplaySetup initialized:", { opponentId, leagueMatchId });

            setSetup(prev => ({
                ...prev,
                player2: opponentId ? { ...prev.player2, id: opponentId, name: opponentName || 'Opponent', hcp: 0 } : prev.player2, // HCP will be fetched by onlineUsers effect if valid ID
                leagueMatchId: leagueMatchId || prev.leagueMatchId // Ensure we capture it
            }));
        }
    }, [location.state, location.search]);

    useEffect(() => {
        db.getAll('courses').then(setCourses);

        // Fetch online users
        fetch('/users')
            .then(res => res.json())
            .then(users => {
                if (Array.isArray(users)) {
                    // Sort users: Friends first, then alphabetical
                    const friendIds = user?.friends ? (typeof user.friends === 'string' ? JSON.parse(user.friends) : user.friends) : [];

                    const sortedUsers = users.sort((a, b) => {
                        const aIsFriend = friendIds.includes(a.id.toString());
                        const bIsFriend = friendIds.includes(b.id.toString());

                        if (aIsFriend && !bIsFriend) return -1;
                        if (!aIsFriend && bIsFriend) return 1;
                        return a.username.localeCompare(b.username);
                    });

                    setOnlineUsers(sortedUsers);
                } else {
                    console.error("Fetched users is not an array:", users);
                    setOnlineUsers([]);
                }
            })
            .catch(err => console.error("Failed to fetch users", err));
    }, [db, user]);

    // Set default tees when course changes
    useEffect(() => {
        if (setup.courseId && courses.length > 0) {
            const course = courses.find(c => c.id.toString() === setup.courseId || c.serverId?.toString() === setup.courseId);
            if (course) {
                const tees = course.tees && course.tees.length > 0 ? course.tees : [{
                    id: 'default', name: 'Standard', color: 'white', slope: course.slope || 113, rating: course.rating || 72.0
                }];
                const defaultTeeId = tees[0].id;

                setSetup(prev => ({
                    ...prev,
                    player1: { ...prev.player1, teeId: prev.player1.teeId || defaultTeeId },
                    player2: { ...prev.player2, teeId: prev.player2.teeId || defaultTeeId }
                }));
            }
        }
    }, [setup.courseId, courses]);


    const startMatch = async () => {
        const course = courses.find(c => c.id == setup.courseId || c.serverId == setup.courseId);
        if (!course) return;

        // Determine Tees
        const tees = course.tees && course.tees.length > 0 ? course.tees : [{
            id: 'default', name: 'Standard', color: 'white', slope: course.slope || 113, rating: course.rating || 72.0
        }];

        const p1Tee = tees.find(t => t.id === setup.player1.teeId) || tees[0];
        const p2Tee = tees.find(t => t.id === setup.player2.teeId) || tees[0];

        const p1Playing = calculatePlayingHcp(setup.player1.hcp, p1Tee.slope, p1Tee.rating, 72);
        const p2Playing = calculatePlayingHcp(setup.player2.hcp, p2Tee.slope, p2Tee.rating, 72);

        // Ensure Player 2 has an ID (use 9999 for Guest if null)
        const player2Id = setup.player2.id || 9999;

        const match = {
            date: new Date(),
            courseId: course.id,
            player1: {
                ...setup.player1,
                playingHcp: p1Playing,
                teeId: p1Tee.id,
                teeInfo: p1Tee
            },
            player2: {
                ...setup.player2,
                id: player2Id,
                playingHcp: p2Playing,
                teeId: p2Tee.id,
                teeInfo: p2Tee
            },
            scores: {},
            status: 'AS',
            completed: false,
            matchType: setup.matchType,
            manualStrokes: setup.manualStrokes || 0,
            manualStrokesPlayer: setup.manualStrokesPlayer || 'p1',
            synced: false,
            holesPlayed: setup.holesToPlay || 18,
            startingHole: setup.startingHole || 1,
            leagueMatchId: setup.leagueMatchId // Save link to league match
        };

        const id = await db.add('matches', match);
        navigate(`/matchplay/${id}`);
    };

    // Helper to render Tee Select
    const renderTeeSelect = (playerId, currentTeeId) => {
        if (!setup.courseId) return null;
        const course = courses.find(c => c.id.toString() === setup.courseId || c.serverId?.toString() === setup.courseId);
        if (!course) return null;

        const tees = course.tees && course.tees.length > 0 ? course.tees : [{
            id: 'default', name: 'Standard', color: 'white', slope: course.slope || 113, rating: course.rating || 72.0
        }];

        return (
            <div className="mt-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Tee</label>
                <select
                    className="w-full p-2 border rounded-lg text-sm bg-white"
                    value={currentTeeId}
                    onChange={(e) => {
                        const newTeeId = e.target.value;
                        setSetup(prev => ({
                            ...prev,
                            [playerId]: { ...prev[playerId], teeId: newTeeId }
                        }));
                    }}
                >
                    {tees.map(tee => (
                        <option key={tee.id} value={tee.id}>{tee.name} ({tee.rating}/{tee.slope})</option>
                    ))}
                </select>
            </div>
        );
    };


    return (
        <div className="p-4">
            {/* Header */}
            <div className="bg-white p-6 sticky top-0 z-10 shadow-sm border-b border-stone-100">
                <div className="flex justify-between items-center mb-8">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-stone-400 hover:text-dark">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="text-center">
                        <h1 className="text-xl font-bold text-dark">New Match</h1>
                        {setup.leagueMatchId && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
                                Tournament Match
                            </span>
                        )}
                    </div>
                    <div className="w-10"></div>
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <div>
                    <label className="block text-sm font-bold text-muted mb-4 uppercase tracking-wide">Select Course</label>

                    {!setup.courseId ? (
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
                            const c = courses.find(course => course.id.toString() === setup.courseId || course.serverId?.toString() === setup.courseId);
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
                        onSelect={(course) => setSetup({ ...setup, courseId: course.id.toString() })}
                        courses={courses}
                        selectedCourseId={setup.courseId}
                    />
                </div>

                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wide">Round Length</label>
                    <div className="flex gap-4 mb-4">
                        <button
                            onClick={() => setSetup({ ...setup, holesToPlay: 18 })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.holesToPlay !== 9
                                ? 'bg-dark text-white shadow-md'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            18 Holes
                        </button>
                        <button
                            onClick={() => setSetup({ ...setup, holesToPlay: 9 })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.holesToPlay === 9
                                ? 'bg-dark text-white shadow-md'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            9 Holes
                        </button>
                    </div>

                    {/* Front 9 / Back 9 Selection */}
                    {setup.holesToPlay === 9 && (() => {
                        const course = courses.find(c => c.id.toString() === setup.courseId);
                        const is18HoleCourse = course?.holes?.length === 18;

                        if (is18HoleCourse) {
                            return (
                                <div className="flex gap-4 mb-4 animate-fade-in">
                                    <button
                                        onClick={() => setSetup({ ...setup, startingHole: 1 })}
                                        className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${(!setup.startingHole || setup.startingHole === 1)
                                            ? 'bg-stone-600 text-white shadow-md'
                                            : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        Front 9 (1-9)
                                    </button>
                                    <button
                                        onClick={() => setSetup({ ...setup, startingHole: 10 })}
                                        className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.startingHole === 10
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

                    <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wide">Match Type</label>
                    <div className="flex gap-4 mb-4">
                        <button
                            onClick={() => setSetup({ ...setup, matchType: 'NET' })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.matchType === 'NET'
                                ? 'bg-dark text-white shadow-md'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            Handicap (Net)
                        </button>
                        <button
                            onClick={() => setSetup({ ...setup, matchType: 'GROSS' })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.matchType === 'GROSS'
                                ? 'bg-dark text-white shadow-md'
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
                                                    ? 'bg-stone-100 border-dark shadow-sm ring-1 ring-dark'
                                                    : 'bg-white border-gray-100 hover:bg-gray-50'
                                                }
                                            `}
                                        >
                                            <span className="font-medium truncate">{p.name}</span>
                                            {setup.manualStrokesPlayer === p.id && (
                                                <span className="text-dark font-bold">
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
                        {/* Tee Select Player 1 */}
                        {renderTeeSelect('player1', setup.player1.teeId)}

                        {setup.matchType === 'NET' && (
                            <input
                                type="number" placeholder="HCP"
                                className="w-full p-3 border rounded-xl font-medium mt-2"
                                value={setup.player1.hcp}
                                onChange={e => setSetup({ ...setup, player1: { ...setup.player1, hcp: parseFloat(e.target.value) } })}
                            />
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold mb-2">Player 2</h3>

                        {/* Online User Selection */}
                        <div className="mb-4">
                            {!setup.player2.id ? (
                                <button
                                    onClick={() => setIsPlayerModalOpen(true)}
                                    className="w-full py-4 border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center text-muted hover:border-dark hover:text-dark hover:bg-stone-50 transition group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center mb-1 group-hover:bg-white transition">
                                        <Search size={18} />
                                    </div>
                                    <span className="font-bold text-sm">Select Opponent</span>
                                </button>
                            ) : (
                                <div className="relative p-3 rounded-xl border-2 border-dark bg-stone-100 shadow-sm">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-10 h-10 rounded-full bg-dark/10 flex items-center justify-center text-dark border border-dark/20 flex-shrink-0">
                                                <User size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-base text-dark truncate">{setup.player2.name}</h3>
                                                <div className="text-xs text-dark/70">
                                                    HCP: {setup.player2.hcp}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setIsPlayerModalOpen(true)}
                                            className="ml-2 px-2 py-1 bg-white text-dark text-xs font-bold rounded-lg shadow-sm hover:bg-dark hover:text-white transition flex-shrink-0"
                                        >
                                            Change
                                        </button>
                                    </div>
                                </div>
                            )}

                            <PlayerSelectionModal
                                isOpen={isPlayerModalOpen}
                                onClose={() => setIsPlayerModalOpen(false)}
                                onSelect={(player) => setSetup({
                                    ...setup,
                                    player2: { name: player.username, hcp: player.handicap, id: player.id }
                                })}
                                players={onlineUsers}
                                selectedPlayerId={setup.player2.id}
                            />
                        </div>

                        <input
                            type="text" placeholder="Name"
                            className="w-full p-3 border rounded-xl mb-2 bg-gray-100 text-gray-600 cursor-not-allowed font-medium hidden"
                            value={setup.player2.name}
                            readOnly
                        />

                        {/* Tee Select Player 2 */}
                        {renderTeeSelect('player2', setup.player2.teeId)}

                        {setup.matchType === 'NET' && (
                            <input
                                type="number" placeholder="HCP"
                                className="w-full p-3 border rounded-xl font-medium mt-2"
                                value={setup.player2.hcp}
                                onChange={e => setSetup({ ...setup, player2: { ...setup.player2, hcp: parseFloat(e.target.value) } })}
                            />
                        )}
                    </div>
                </div>

                <button
                    onClick={startMatch}
                    disabled={!setup.courseId}
                    className="w-full bg-dark text-white py-3 rounded-lg font-bold mt-4 hover:bg-black transition"
                >
                    Start Match
                </button>
            </div>
        </div>
    );
};
