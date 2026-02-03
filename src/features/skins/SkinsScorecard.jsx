import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDB } from '../../lib/store';
import { ChevronLeft, ChevronRight, Menu, Trophy, X } from 'lucide-react';
import { calculateSkinsStrokes, calculateSkinsState } from './skinsLogic';

// Note: If Numpad doesn't exist as a reusable component, I'll inline a simple one for now.

const SimpleNumpad = ({ isOpen, onClose, onInput, title }) => {
    if (!isOpen) return null;
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fade-in">
            <div className="bg-white w-full sm:w-96 p-6 rounded-t-3xl sm:rounded-3xl shadow-2xl safe-area-pb">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl">{title}</h3>
                    <button onClick={onClose} className="p-2 bg-stone-100 rounded-full">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                    {nums.map(n => (
                        <button key={n} onClick={() => onInput(n)} className="h-16 text-2xl font-bold bg-stone-50 rounded-2xl hover:bg-stone-100 active:scale-95 transition">
                            {n}
                        </button>
                    ))}
                    <button onClick={() => onInput(0)} className="h-16 text-xl font-bold bg-stone-50 rounded-2xl hover:bg-stone-100 text-stone-400">PICK</button>
                    <button onClick={() => onInput(10)} className="h-16 text-2xl font-bold bg-stone-50 rounded-2xl hover:bg-stone-100">0</button>
                    <button onClick={() => onInput('del')} className="h-16 text-xl font-bold bg-stone-50 rounded-2xl hover:bg-stone-100 text-red-400">⌫</button>
                </div>
            </div>
        </div>
    );
};

export const SkinsScorecard = () => {
    const { id } = useParams();
    const db = useDB();
    const navigate = useNavigate();

    const [game, setGame] = useState(null);
    const [course, setCourse] = useState(null);
    const [currentHole, setCurrentHole] = useState(1);
    const [gameState, setGameState] = useState({ skinLog: {}, playerTotals: {}, currentPot: 1, carryover: 0 });

    // Numpad State
    const [numpadOpen, setNumpadOpen] = useState(false);
    const [activeInput, setActiveInput] = useState(null); // { playerId }

    // Card State
    const [scorecardOpen, setScorecardOpen] = useState(false);

    // Game Over State
    const [gameOver, setGameOver] = useState(false);

    // Initial Load
    useEffect(() => {
        if (!db || !id) return;

        const loadGame = async () => {
            const g = await db.get('skins_games', parseInt(id));
            if (g) {
                setGame(g);
                const c = await db.get('courses', g.courseId);
                // Also check serverId if local not found

                // Fetch course if not found by primary ID
                let finalCourse = c;
                if (!c) {
                    const allCourses = await db.getAll('courses');
                    finalCourse = allCourses.find(course => course.serverId === g.courseId);
                }
                setCourse(finalCourse);

                // Calculate strokes initially
                if (finalCourse) {
                    const playersWithStrokes = calculateSkinsStrokes(g.players, finalCourse);
                    setGame(prev => ({ ...prev, players: playersWithStrokes }));
                }

                // Set initial hole based on game setup
                if (g.startingHole) {
                    setCurrentHole(g.startingHole);
                }

                // Check if already finished
                if (g.status === 'COMPLETED') {
                    setGameOver(true);
                }
            }
        };
        loadGame();
    }, [db, id]);

    // Recalculate Game State whenever scores change
    useEffect(() => {
        if (game && course) {
            const holes = course.holes || [];
            const newState = calculateSkinsState(game.scores, game.players, holes);
            setGameState(newState);
        }
    }, [game?.scores, course]);

    const handleScoreInput = async (value) => {
        if (!activeInput || !game) return;

        if (value === 'del') return;

        const newScore = value === 0 ? 0 : parseInt(value); // 0 = Pickup
        const updatedScores = {
            ...game.scores,
            [currentHole]: {
                ...(game.scores[currentHole] || {}),
                [activeInput.playerId]: newScore
            }
        };

        // Optimistic Update
        setGame(prev => ({ ...prev, scores: updatedScores }));
        setNumpadOpen(false);

        // Save to DB
        await db.put('skins_games', { ...game, scores: updatedScores });
    };

    const nextHole = () => {
        // Calculate total holes based on holesPlayed + startingHole - 1?
        // Actually, logic for next/prev needs to be smarter for 9 holes.
        // If starting 10, playing 9, we go 10..18.

        const start = game.startingHole || 1;
        const count = game.holesPlayed || 18;
        const end = start + count - 1;

        if (currentHole < end) {
            setCurrentHole(h => h + 1);
        }
    };

    const prevHole = () => {
        const start = game.startingHole || 1;
        if (currentHole > start) setCurrentHole(h => h - 1);
    };

    const finishGame = async () => {
        // Confirm?
        if (!window.confirm("Finish game and save results?")) return;

        // Save skinsWon data for activity feed display
        const skinsWon = {};
        game.players.forEach(player => {
            skinsWon[player.id] = gameState.playerTotals[player.id] || 0;
        });

        const updatedGame = {
            ...game,
            status: 'COMPLETED',
            skinsWon // Add skinsWon data
        };
        await db.put('skins_games', updatedGame);
        setGame(updatedGame);
        setGameOver(true);
    };

    if (!game || !course) return <div className="p-10 text-center">Loading Game...</div>;

    // --- GAME OVER VIEW ---
    if (gameOver) {
        // Sort players by total skins won (value)
        const skinValue = parseInt(game.skinValue) || 1;
        const rankedPlayers = [...game.players].sort((a, b) => {
            const valA = (gameState.playerTotals[a.id] || 0);
            const valB = (gameState.playerTotals[b.id] || 0);
            return valB - valA; // Descending
        });

        const [first, second, third, ...rest] = rankedPlayers;

        return (
            <div className="bg-stone-900 min-h-screen text-white pb-safe">
                <div className="p-6">
                    <h1 className="text-3xl font-bold text-center mb-2">Game Over</h1>
                    <p className="text-center text-stone-400 mb-8 px-4 max-w-sm mx-auto leading-tight break-words">{course.name}</p>

                    {/* Podium */}
                    <div className="flex justify-center items-end gap-6 mb-10 h-48">
                        {/* 2nd Place */}
                        {second && (
                            <div className="flex flex-col items-center animate-fade-in-up delay-100">
                                <div className="w-16 h-16 rounded-full border-2 border-slate-300 bg-stone-800 flex items-center justify-center font-bold text-xl mb-2 relative">
                                    {second.name.substring(0, 2).toUpperCase()}
                                    <div className="absolute -top-2 -right-2 bg-slate-300 text-black text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">2</div>
                                </div>
                                <div className="h-24 w-20 bg-stone-800 rounded-t-lg flex flex-col items-center justify-start pt-2 border-t-4 border-slate-300">
                                    <span className="font-bold text-xl">{(gameState.playerTotals[second.id] || 0) * skinValue}</span>
                                    <span className="text-[10px] uppercase text-stone-500">Skins</span>
                                </div>
                                <span className="text-sm font-bold mt-2">{second.name}</span>
                            </div>
                        )}

                        {/* 1st Place */}
                        {first && (
                            <div className="flex flex-col items-center z-10 animate-fade-in-up">
                                <div className="w-20 h-20 rounded-full border-4 border-yellow-400 bg-stone-800 flex items-center justify-center font-bold text-2xl mb-2 relative shadow-[0_0_20px_rgba(250,204,21,0.3)]">
                                    <Trophy size={28} className="text-yellow-400" />
                                    <div className="absolute -top-3 -right-3 bg-yellow-400 text-black text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">1</div>
                                </div>
                                <div className="h-32 w-24 bg-stone-800 rounded-t-lg flex flex-col items-center justify-start pt-4 border-t-4 border-yellow-400 shadow-lg relative">
                                    <span className="font-black text-3xl text-yellow-400">{(gameState.playerTotals[first.id] || 0) * skinValue}</span>
                                    <span className="text-xs uppercase text-stone-500 font-bold">Skins Won</span>
                                </div>
                                <span className="text-lg font-bold mt-2 text-yellow-400">{first.name}</span>
                            </div>
                        )}

                        {/* 3rd Place */}
                        {third && (
                            <div className="flex flex-col items-center animate-fade-in-up delay-200">
                                <div className="w-16 h-16 rounded-full border-2 border-amber-700 bg-stone-800 flex items-center justify-center font-bold text-xl mb-2 relative">
                                    {third.name.substring(0, 2).toUpperCase()}
                                    <div className="absolute -top-2 -right-2 bg-amber-700 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">3</div>
                                </div>
                                <div className="h-20 w-20 bg-stone-800 rounded-t-lg flex flex-col items-center justify-start pt-2 border-t-4 border-amber-700">
                                    <span className="font-bold text-xl">{(gameState.playerTotals[third.id] || 0) * skinValue}</span>
                                    <span className="text-[10px] uppercase text-stone-500">Skins</span>
                                </div>
                                <span className="text-sm font-bold mt-2">{third.name}</span>
                            </div>
                        )}
                    </div>

                    {/* Rest of players */}
                    {rest.length > 0 && (
                        <div className="bg-stone-800 rounded-2xl p-4 mb-6">
                            {rest.map((p, i) => (
                                <div key={p.id} className="flex justify-between items-center py-2 border-b border-stone-700 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <span className="text-stone-500 font-bold w-4">{i + 4}</span>
                                        <span className="font-bold">{p.name}</span>
                                    </div>
                                    <span className="font-bold">{(gameState.playerTotals[p.id] || 0) * skinValue} Skins</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Stats Summary - Total Strokes */}
                    <div className="bg-stone-800 rounded-2xl p-4 mb-8">
                        <h3 className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-4">Total Strokes (Gross)</h3>
                        {game.players.map(p => {
                            const totalStrokes = Object.values(game.scores).reduce((sum, hScores) => sum + (hScores[p.id] || 0), 0);
                            return (
                                <div key={p.id} className="flex justify-between items-center py-2 border-b border-stone-700 last:border-0">
                                    <span className="font-medium">{p.name}</span>
                                    <span className="font-bold text-lg">{totalStrokes}</span>
                                </div>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => navigate('/')}
                        className="w-full bg-white text-dark py-4 rounded-xl font-bold text-lg hover:bg-stone-200 transition"
                    >
                        Return to Menu
                    </button>

                </div>
            </div>
        );
    }

    // --- ACTIVE GAME VIEW ---

    const currentHoleData = course.holes[currentHole - 1] || { par: 4, hcp: 18, distance: 0 };
    const holesCompleted = Object.keys(game.scores).filter(h => Object.keys(game.scores[h]).length === game.players.length).length;

    // Determine the actual last hole number (e.g., Start 10 + 9 holes = End 18)
    const countHoles = game.holesPlayed || 18;
    const startHole = game.startingHole || 1;
    const lastHole = startHole + countHoles - 1;

    const skinsLeft = countHoles - holesCompleted;

    // Determine current Pot for THIS hole
    let potForHole = 1 * (parseInt(game.skinValue) || 1);
    let carryoverCount = 0;

    // Scan previous holes for continuous carryovers leading up to this one
    // Note: We need to handle wrap-around or just linear scanning based on played holes?
    // For now purely linear based on hole number might be tricky if not contiguous? 
    // Assuming contiguous holes.
    for (let h = currentHole - 1; h >= startHole; h--) {
        const log = gameState.skinLog[h];
        if (log && log.carryover) {
            carryoverCount++;
        } else {
            break; // Stop at first non-carryover
        }
    }
    potForHole += carryoverCount * (parseInt(game.skinValue) || 1);

    // Is this hole completed?
    const isHoleComplete = game.scores[currentHole] && Object.keys(game.scores[currentHole]).length === game.players.length;
    const holeResult = gameState.skinLog[currentHole];

    return (
        <div className="bg-stone-50 min-h-screen pb-safe">
            {/* Top Bar - Status */}
            <div className="bg-dark text-white p-6 rounded-b-[32px] shadow-lg z-10 relative">
                <div className="flex justify-between items-start mb-6">
                    <button onClick={() => navigate('/play')} className="p-2 -ml-2 text-white/50 hover:text-white">
                        <ChevronLeft />
                    </button>
                    <div className="flex gap-4 items-center">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full border-4 border-emerald-400 flex items-center justify-center text-2xl font-bold bg-white/10 backdrop-blur-md mb-1">
                                {skinsLeft}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Left</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xl font-bold shadow-lg mb-1">
                                {potForHole}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Pot</span>
                        </div>
                    </div>
                    <button onClick={() => setScorecardOpen(true)} className="p-2 -mr-2 text-white/50 hover:text-white">
                        <Menu />
                    </button>
                </div>

                {/* Players Bank */}
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {game.players.map(p => (
                        <div key={p.id} className="flex flex-col items-center min-w-[60px]">
                            <div className="relative mb-1">
                                <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-bold">
                                    {p.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                                    {(gameState.playerTotals[p.id] || 0) * (parseInt(game.skinValue) || 1)}
                                </div>
                            </div>
                            <span className="text-xs font-medium truncate w-16 text-center opacity-80">{p.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Scorecard Area */}
            <div className="p-4 -mt-4 relative z-0">
                <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 min-h-[50vh]">

                    {/* Hole Navigation */}
                    <div className="flex justify-between items-center mb-8">
                        <button onClick={prevHole} disabled={currentHole === startHole} className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 disabled:opacity-30 hover:bg-stone-100">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex flex-col items-center">
                            <h2 className="text-3xl font-black text-dark">Hole {currentHole}</h2>
                            <div className="flex gap-3 text-sm font-bold text-muted mt-1">
                                <span>Par {currentHoleData.par}</span>
                                <span className="w-1 h-1 rounded-full bg-stone-300 self-center"></span>
                                <span>HCP {currentHoleData.hcp}</span>
                                <span className="w-1 h-1 rounded-full bg-stone-300 self-center"></span>
                                <span>{currentHoleData.distance}m</span>
                            </div>
                        </div>

                        {currentHole === lastHole ? (
                            <button
                                onClick={finishGame}
                                className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg hover:bg-emerald-700 animate-pulse"
                            >
                                <Trophy size={16} />
                            </button>
                        ) : (
                            <button onClick={nextHole} className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-600 hover:bg-stone-100">
                                <ChevronRight size={20} />
                            </button>
                        )}
                    </div>

                    {/* Scores Grid */}
                    <div className="space-y-3">
                        {game.players.map(p => {
                            const score = game.scores[currentHole]?.[p.id];

                            // Net Calc for display
                            let netScore = null;
                            let strokesGiven = 0;
                            if (score) {
                                // Re-calc strokes for this hole specifically (Code duplication - should refactor into helper)
                                const shots = p.strokesReceived;
                                let s = 0;
                                if (shots > 0) {
                                    s = Math.floor(shots / 18);
                                    if (currentHoleData.hcp <= (shots % 18)) s += 1;
                                }
                                strokesGiven = s;
                                netScore = score - s;
                            }

                            // Winner Highlight
                            const isWinner = holeResult && holeResult.winnerId === p.id;

                            return (
                                <div key={p.id} className={`
                                    flex items-center justify-between p-3 rounded-2xl border transition-all
                                    ${isWinner ? 'bg-emerald-100 border-emerald-200 ring-1 ring-emerald-400' : 'bg-white border-stone-100'}
                                    ${isHoleComplete && !isWinner ? 'opacity-60 grayscale' : ''}
                                `}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center font-bold text-sm text-stone-600">
                                            {p.name.substring(0, 1)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-dark">{p.name}</div>
                                            <div className="text-[10px] text-muted font-bold">
                                                Net: {netScore !== null ? netScore : '-'} {strokesGiven > 0 && <span className="text-stone-400">({strokesGiven} dots)</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setActiveInput({ playerId: p.id });
                                            setNumpadOpen(true);
                                        }}
                                        className={`
                                            w-14 h-14 rounded-2xl font-bold text-2xl flex items-center justify-center transition
                                            ${score ? 'bg-dark text-white' : 'bg-stone-50 text-stone-300 dashed-border'}
                                             ${isWinner ? 'bg-emerald-500 shadow-lg scale-105' : ''}
                                        `}
                                    >
                                        {score || '-'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Status Banners */}
                    <div className="mt-6">
                        {isHoleComplete && (
                            <div className={`p-4 rounded-xl text-center font-bold animate-fade-in ${holeResult?.carryover ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`}>
                                {holeResult?.carryover ? (
                                    <div className="flex flex-col items-center">
                                        <span className="text-lg">TIED HOLE!</span>
                                        <span className="text-xs uppercase tracking-widest opacity-70">{potForHole} Skins Carried Over</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2">
                                        <Trophy size={16} />
                                        <span>Hole Complete</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </div>

            <SimpleNumpad
                isOpen={numpadOpen}
                onClose={() => setNumpadOpen(false)}
                onInput={handleScoreInput}
                title={`Score for Hole ${currentHole}`}
            />

            {/* Full Scorecard Modal */}
            {scorecardOpen && (
                <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-fade-in">
                    <div className="bg-dark text-white p-6 pb-4 flex justify-between items-center safe-area-pt">
                        <h2 className="text-xl font-bold">Scorecard</h2>
                        <button onClick={() => setScorecardOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 safe-area-pb">
                        <div className="overflow-x-auto rounded-xl border border-stone-200">
                            <table className="w-full text-xs text-center border-collapse">
                                <thead>
                                    <tr className="bg-stone-100 text-stone-500 font-bold uppercase tracking-wider">
                                        <th className="p-2 border-b border-r border-stone-200 sticky left-0 bg-stone-100 z-10 w-20 text-left pl-3">Hole</th>
                                        {course.holes.map(h => (
                                            <th key={h.number} className="p-2 border-b border-stone-200 min-w-[30px]">{h.number}</th>
                                        ))}
                                        <th className="p-2 border-b border-l border-stone-200 font-black text-dark">Tot</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Par Row */}
                                    <tr className="bg-stone-50 text-stone-400 font-bold">
                                        <td className="p-2 border-b border-r border-stone-200 sticky left-0 bg-stone-50 z-10 text-left pl-3">Par</td>
                                        {course.holes.map(h => (
                                            <td key={h.number} className="p-2 border-b border-stone-200">{h.par}</td>
                                        ))}
                                        <td className="p-2 border-b border-l border-stone-200">{course.holes.reduce((a, b) => a + b.par, 0)}</td>
                                    </tr>
                                    {/* Player Rows */}
                                    {game.players.map(p => (
                                        <tr key={p.id} className="text-dark font-medium border-b border-stone-100 last:border-0">
                                            <td className="p-2 border-r border-stone-100 sticky left-0 bg-white z-10 text-left pl-3 font-bold truncate max-w-[80px]">
                                                {p.name}
                                            </td>
                                            {course.holes.map(h => {
                                                const s = game.scores[h.number]?.[p.id];
                                                // Check if they won this skin
                                                const won = gameState.skinLog[h.number]?.winnerId === p.id;
                                                return (
                                                    <td key={h.number} className={`p-2 ${won ? 'bg-emerald-100 text-emerald-800 font-bold' : ''}`}>
                                                        {s || '-'}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 border-l border-stone-100 font-bold">
                                                {Object.values(game.scores).reduce((sum, hScores) => sum + (hScores[p.id] || 0), 0)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
