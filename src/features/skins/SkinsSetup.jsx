import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { User, Search, ChevronLeft, Plus, X } from 'lucide-react';
import { CourseSelectionModal } from '../../components/CourseSelectionModal';
import { PlayerSelectionModal } from '../../components/PlayerSelectionModal';

export const SkinsSetup = () => {
    const db = useDB();
    const { user } = useUser();
    const navigate = useNavigate();

    const [courses, setCourses] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
    const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

    // Setup State
    const [setup, setSetup] = useState({
        courseId: '',
        players: [], // Array of player objects
        skinValue: '1',
        matchType: 'NET', // NET or GROSS
        holesToPlay: 18,
        startingHole: 1
    });

    // Initialize Player 1 (Me)
    useEffect(() => {
        if (user && setup.players.length === 0) {
            const hcp = user.handicapMode === 'MANUAL' && user.manualHandicap
                ? parseFloat(user.manualHandicap)
                : (user.handicap || 54.0);

            setSetup(prev => ({
                ...prev,
                players: [{
                    id: user.id,
                    name: user.username || 'Me',
                    hcp: hcp,
                    teeId: '', // Will be set when course is selected
                    isMe: true
                }]
            }));
        }
    }, [user]);

    // Fetch Courses and Users
    useEffect(() => {
        db.getAll('courses').then(setCourses);
        fetch('/users')
            .then(res => res.json())
            .then(users => setOnlineUsers(Array.isArray(users) ? users : []))
            .catch(err => console.error("Failed to fetch users", err));
    }, [db]);

    // Auto-select tees when course changes
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
                    players: prev.players.map(p => ({
                        ...p,
                        teeId: p.teeId || defaultTeeId
                    }))
                }));
            }
        }
    }, [setup.courseId, courses]);

    const addPlayer = (player) => {
        if (setup.players.length >= 4) return;
        if (setup.players.find(p => p.id === player.id)) return;

        setSetup(prev => ({
            ...prev,
            players: [...prev.players, {
                id: player.id,
                name: player.username,
                hcp: player.handicap,
                teeId: '', // Will be updated by tee effect if course selected
                isMe: false
            }]
        }));
        setIsPlayerModalOpen(false);
    };

    const removePlayer = (playerId) => {
        setSetup(prev => ({
            ...prev,
            players: prev.players.filter(p => p.id !== playerId)
        }));
    };

    const updatePlayer = (playerId, field, value) => {
        setSetup(prev => ({
            ...prev,
            players: prev.players.map(p => p.id === playerId ? { ...p, [field]: value } : p)
        }));
    };

    const renderTeeSelect = (playerId, currentTeeId) => {
        if (!setup.courseId) return null;
        const course = courses.find(c => c.id.toString() === setup.courseId || c.serverId?.toString() === setup.courseId);
        if (!course) return null;

        const tees = course.tees && course.tees.length > 0 ? course.tees : [{
            id: 'default', name: 'Standard', color: 'white', slope: course.slope || 113, rating: course.rating || 72.0
        }];

        return (
            <select
                className="w-full mt-1 p-2 text-xs border rounded bg-white"
                value={currentTeeId || ''}
                onChange={(e) => updatePlayer(playerId, 'teeId', e.target.value)}
            >
                {tees.map(tee => (
                    <option key={tee.id} value={tee.id}>{tee.name}</option>
                ))}
            </select>
        );
    };

    const startGame = async () => {
        if (!setup.courseId || setup.players.length < 2) return;
        const course = courses.find(c => c.id.toString() === setup.courseId || c.serverId?.toString() === setup.courseId);

        const game = {
            date: new Date().toISOString(),
            courseId: course.id,
            skinValue: setup.skinValue,
            players: setup.players, // Logic will calculate playing HCP later
            scores: {},
            status: 'ACTIVE',
            holesPlayed: setup.holesToPlay,
            startingHole: setup.startingHole
        };

        const id = await db.add('skins_games', game);
        navigate(`/skins/${id}`);
    };

    return (
        <div className="p-4 pb-24">
            {/* Header */}
            <div className="bg-white p-6 sticky top-0 z-10 shadow-sm border-b border-stone-100 flex justify-between items-center mb-6 -mx-4">
                <button onClick={() => navigate(-1)} className="p-2 text-stone-400 hover:text-dark">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-xl font-bold text-dark">New Skins Game</h1>
                <div className="w-10"></div>
            </div>

            <div className="space-y-6">
                {/* Course Selection */}
                <div>
                    <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wide">Course</label>
                    {!setup.courseId ? (
                        <button
                            onClick={() => setIsCourseModalOpen(true)}
                            className="w-full py-5 border-2 border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center text-muted hover:border-dark hover:text-dark transition"
                        >
                            <Search size={24} className="mb-2" />
                            <span className="font-bold">Select Course</span>
                        </button>
                    ) : (
                        <div className="p-4 rounded-xl border-2 border-dark bg-stone-50 flex justify-between items-center shadow-sm">
                            <div>
                                <h3 className="font-bold text-dark">{courses.find(c => c.id.toString() === setup.courseId || c.serverId?.toString() === setup.courseId)?.name}</h3>
                            </div>
                            <button onClick={() => setIsCourseModalOpen(true)} className="text-xs font-bold px-3 py-1 bg-white border rounded shadow-sm">Change</button>
                        </div>
                    )}
                </div>

                {/* Players */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-muted uppercase tracking-wide">Players ({setup.players.length}/4)</label>
                        {setup.players.length < 4 && (
                            <button
                                onClick={() => setIsPlayerModalOpen(true)}
                                className="flex items-center gap-1 text-sm font-bold text-dark hover:bg-stone-100 px-2 py-1 rounded transition"
                            >
                                <Plus size={16} /> Add Player
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {setup.players.map((player, index) => (
                            <div key={player.id} className="p-3 bg-white border border-stone-200 rounded-xl shadow-sm relative">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-dark/10 flex items-center justify-center text-dark font-bold text-xs">
                                            {player.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className="font-bold text-dark">{player.name}</span>
                                    </div>
                                    {!player.isMe && (
                                        <button onClick={() => removePlayer(player.id)} className="text-stone-300 hover:text-red-500">
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted">Tee</label>
                                        {renderTeeSelect(player.id, player.teeId)}
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted">HCP</label>
                                        <input
                                            type="number"
                                            value={player.hcp}
                                            onChange={(e) => updatePlayer(player.id, 'hcp', e.target.value)}
                                            className="w-full mt-1 p-2 text-xs border rounded bg-stone-50"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Settings */}
                <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
                    <label className="block text-sm font-bold text-muted mb-3 uppercase tracking-wide">Course Settings</label>
                    <div className="flex gap-4 mb-4">
                        <button
                            onClick={() => setSetup({ ...setup, holesToPlay: 18, startingHole: 1 })}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.holesToPlay === 18
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
                        const course = courses.find(c => c.id.toString() === setup.courseId || c.serverId?.toString() === setup.courseId);
                        const is18HoleCourse = course?.holes?.length === 18;

                        if (is18HoleCourse) {
                            return (
                                <div className="flex gap-4 mb-4 animate-fade-in">
                                    <button
                                        onClick={() => setSetup({ ...setup, startingHole: 1 })}
                                        className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.startingHole === 1
                                            ? 'bg-stone-600 text-white shadow-md'
                                            : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        Front 9
                                    </button>
                                    <button
                                        onClick={() => setSetup({ ...setup, startingHole: 10 })}
                                        className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${setup.startingHole === 10
                                            ? 'bg-stone-600 text-white shadow-md'
                                            : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        Back 9
                                    </button>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    <label className="block text-sm font-bold text-muted mb-3 uppercase tracking-wide">Game Rules</label>
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Skin Value</span>
                        <input
                            type="text"
                            value={setup.skinValue}
                            onChange={(e) => setSetup({ ...setup, skinValue: e.target.value })}
                            className="w-24 p-2 text-center border rounded-lg font-bold"
                            placeholder="e.g. 10"
                        />
                    </div>
                </div>

                <button
                    onClick={startGame}
                    disabled={!setup.courseId || setup.players.length < 2}
                    className="w-full py-4 bg-dark text-white rounded-xl font-bold text-lg shadow-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    Start Game
                </button>
            </div>

            <CourseSelectionModal
                isOpen={isCourseModalOpen}
                onClose={() => setIsCourseModalOpen(false)}
                onSelect={(c) => setSetup({ ...setup, courseId: c.id.toString() })}
                courses={courses}
            />

            <PlayerSelectionModal
                isOpen={isPlayerModalOpen}
                onClose={() => setIsPlayerModalOpen(false)}
                onSelect={addPlayer}
                players={onlineUsers}
            />
        </div>
    );
};
