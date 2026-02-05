import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useDB } from '../../lib/store';
import { SwipeableItem } from '../../components/SwipeableItem';
import { calculatePlayingHcp, calculateStableford, calculateStrokesReceived, prepareHandicapData, calculateHandicapDetails } from '../scoring/calculations';
import { User, Trophy, Calendar, Swords, Flag, Plus, Star, Search, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { FriendSearchModal } from '../../components/FriendSearchModal';

export const Home = () => {
    const { user, recalculateHandicap, sync, addFriend, removeFriend } = useUser();
    const db = useDB();
    const navigate = useNavigate();
    const [countingRounds, setCountingRounds] = useState([]);
    const [courses, setCourses] = useState([]);
    const [friendsList, setFriendsList] = useState([]);
    const [isFriendSearchOpen, setIsFriendSearchOpen] = useState(false);
    const [isManualSyncing, setIsManualSyncing] = useState(false);
    const [activeGame, setActiveGame] = useState(null);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [isPulling, setIsPulling] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);

    const loadData = async () => {
        if (!db || !user) return;

        const r = await db.getAll('rounds');
        const m = await db.getAll('matches');
        const s = await db.getAll('skins_games');
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
                    c = serverCourses;
                }
            } catch (e) {
                console.warn("Failed to fetch courses in Home.jsx", e);
            }
        }

        // Prepare data for handicap calculation
        const preparedData = prepareHandicapData(r, m, c, user?.id);
        const { rounds } = calculateHandicapDetails(preparedData, c);

        // Show recent rounds (last 5) regardless of whether they count for handicap
        const recentRounds = (rounds || []).slice(0, 5);

        setCountingRounds(recentRounds);
        setCourses(c);

        // Find Active Game (Priority: Active Skins -> Active Match -> Incomplete Round)
        let foundActive = null;

        // 1. Skins
        const activeSkin = s.find(g => g.status === 'ACTIVE');
        if (activeSkin) {
            const course = c.find(co => co.id == activeSkin.courseId || co.serverId == activeSkin.courseId);
            foundActive = {
                type: 'skins',
                id: activeSkin.id,
                title: 'Skins Game',
                subtext: `${course?.name || 'Unknown Course'} • Hole ${activeSkin.startingHole + (Object.keys(activeSkin.scores).length)}`,
                link: `/skins/${activeSkin.id}`,
                icon: 'trophy'
            };
        }

        // 2. Matchplay (if no skins)
        if (!foundActive) {
            const activeMatch = m.find(match => !match.completed);
            if (activeMatch) {
                const course = c.find(co => co.id == activeMatch.courseId || co.serverId == activeMatch.courseId);
                const p1 = activeMatch.player1?.name || 'Player 1';
                const p2 = activeMatch.player2?.name || 'Player 2';
                foundActive = {
                    type: 'match',
                    id: activeMatch.id,
                    title: `${p1} vs ${p2}`,
                    subtext: `${course?.name || 'Unknown Course'} • Matchplay`,
                    link: `/matchplay/${activeMatch.id}`,
                    icon: 'swords'
                };
            }
        }

        // 3. Round (if nothing else)
        if (!foundActive) {
            // Find most recent incomplete round
            const incompleteRound = r
                .filter(round => !round.completed)
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (incompleteRound) {
                const course = c.find(co => co.id == incompleteRound.courseId || co.serverId == incompleteRound.courseId);
                foundActive = {
                    type: 'round',
                    id: incompleteRound.id,
                    title: course?.name || 'Stroke Play',
                    subtext: `${incompleteRound.holesPlayed === 9 ? '9 Holes' : '18 Holes'} • Stroke Play`,
                    link: `/play/${incompleteRound.id}`,
                    icon: 'flag'
                };
            }
        }

        setActiveGame(foundActive);

        // Load Friends
        if (user.friends) {
            try {
                const friendIds = typeof user.friends === 'string' ? JSON.parse(user.friends) : user.friends;
                if (friendIds.length > 0) {
                    const res = await fetch('/users');
                    const allUsers = await res.json();
                    const myFriends = allUsers.filter(u => friendIds.includes(u.id.toString()));
                    setFriendsList(myFriends);
                } else {
                    setFriendsList([]);
                }
            } catch (e) {
                console.error("Failed to load friends", e);
            }
        } else {
            setFriendsList([]);
        }
    };

    useEffect(() => {
        if (user && db) {
            loadData();
        }
    }, [db, user]);

    // Listen for sync completion to refresh UI
    useEffect(() => {
        const handleSyncComplete = () => {
            console.log('🔄 Sync detected, refreshing Home data...');
            const syncTime = localStorage.getItem('golf_lastSync');
            if (syncTime) {
                setLastSyncTime(parseInt(syncTime));
            }
            if (user && db) {
                loadData();
            }
        };

        // Initial load of last sync time
        const syncTime = localStorage.getItem('golf_lastSync');
        if (syncTime) {
            setLastSyncTime(parseInt(syncTime));
        }

        window.addEventListener('storage', (e) => {
            // Refresh when lastSync changes (indicates sync completed)
            if (e.key === 'golf_lastSync' && e.newValue) {
                handleSyncComplete();
            }
        });

        // Also listen for custom sync event (for same-tab syncs)
        window.addEventListener('golf-sync-complete', handleSyncComplete);

        return () => {
            window.removeEventListener('golf-sync-complete', handleSyncComplete);
        };
    }, [user, db]);

    const handleManualSync = async () => {
        if (isManualSyncing || isPulling) return;
        setIsManualSyncing(true);
        try {
            await recalculateHandicap();
            await sync();
            const syncTime = Date.now();
            localStorage.setItem('golf_lastSync', syncTime.toString());
            setLastSyncTime(syncTime);
            await loadData(); // Reload UI
        } catch (e) {
            console.error("Manual sync failed", e);
            alert("Sync failed. Please try again.");
        } finally {
            setIsManualSyncing(false);
        }
    };

    // Pull-to-refresh handler
    const handlePullToRefresh = async () => {
        if (isPulling || isManualSyncing) return;
        setIsPulling(true);
        try {
            await recalculateHandicap();
            await sync();
            const syncTime = Date.now();
            localStorage.setItem('golf_lastSync', syncTime.toString());
            setLastSyncTime(syncTime);
            await loadData();
        } catch (e) {
            console.error("Pull refresh failed", e);
        } finally {
            setIsPulling(false);
            setPullDistance(0);
        }
    };

    const handleDelete = async (id, type) => {
        if (confirm('Are you sure you want to delete this?')) {
            const storeName = type === 'round' ? 'rounds' : 'matches';

            // Get item to find its details for server deletion
            const item = await db.get(storeName, id);

            if (item && user) {
                try {
                    const endpoint = type === 'round' ? '/api/rounds/delete' : '/api/matches/delete';
                    await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${user.token}`
                        },
                        body: JSON.stringify({
                            userId: user.id,
                            courseId: item.courseId,
                            date: item.date
                        })
                    });
                } catch (e) {
                    console.error("Failed to delete from server", e);
                }
            }

            await db.delete(storeName, id);
            await recalculateHandicap(); // Update handicap after deletion
            loadData(); // Reload list
        }
    };

    const handleDeleteActiveGame = async (e) => {
        e.stopPropagation(); // Prevent navigation
        if (!activeGame) return;

        if (!confirm(`Are you sure you want to delete this ${activeGame.title}?`)) return;

        try {
            // Send delete to server if possible
            if (activeGame.id && user) {
                // Try to find the full item to check for serverId, or guess based on logic
                // If the item came from 'activeGame' state derived in loadData, it has limited fields.
                // We should fetch the full object from DB to check for serverId.
                let storeName = 'rounds';
                let deleteEndpoint = '/api/rounds/delete';

                if (activeGame.type === 'skins') { storeName = 'skins_games'; deleteEndpoint = '/api/skins/delete'; }
                else if (activeGame.type === 'match') { storeName = 'matches'; deleteEndpoint = '/api/matches/delete'; }

                const item = await db.get(storeName, activeGame.id);
                if (item) {
                    // If item has serverId or we are deleting based on composite key (userId, courseId, date) for rounds/matches
                    // For skins: endpoint expects gameId. If serverId exists, use it. If not, maybe use local ID?
                    // Server side delete for Rounds/Matches uses composite keys mostly.
                    // IMPORTANT: 'item' might have serverId.

                    const payload = {
                        userId: user.id,
                        courseId: item.courseId,
                        date: item.date,
                        gameId: item.serverId || item.id // For Skins
                    };

                    await fetch(deleteEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${user.token}`
                        },
                        body: JSON.stringify(payload)
                    }).catch(err => console.warn("Background server delete failed", err));
                }

                await db.delete(storeName, activeGame.id);
            }

            // Reload to update UI
            loadData();
        } catch (err) {
            console.error("Failed to delete active game", err);
            alert("Failed to delete game");
        }
    };

    return (
        <div className="p-6 space-y-8">
            {/* Premium Header */}
            <header className="pt-2 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </span>
                        <button
                            onClick={handleManualSync}
                            disabled={isManualSyncing}
                            className="text-stone-300 hover:text-primary transition disabled:opacity-50"
                        >
                            <RefreshCw size={12} className={isManualSyncing ? "animate-spin" : ""} />
                        </button>
                    </div>
                    <h1 className="text-4xl font-black text-dark tracking-tight leading-none">
                        Hello, {user ? user.username.split(' ')[0] : 'Golfer'}
                    </h1>
                </div>
                <Link to="/profile" className="relative group">
                    <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center text-dark border-2 border-white shadow-lg overflow-hidden transition transform group-hover:scale-105 group-active:scale-95">
                        {user?.avatar ? (
                            <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <User size={28} className="text-stone-400" />
                        )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                        <Star size={10} className="text-white fill-current" />
                    </div>
                </Link>
            </header>

            {/* Resume Active Game Card */}
            {activeGame && (
                <div
                    onClick={() => navigate(activeGame.link)}
                    className="bg-gradient-to-r from-emerald-600 to-emerald-800 p-4 rounded-2xl shadow-lg border border-emerald-500/30 flex items-center justify-between cursor-pointer active:scale-95 transition relative overflow-hidden group"
                >
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest">In Progress</span>
                        </div>
                        <h3 className="text-xl font-bold text-white leading-tight">{activeGame.title}</h3>
                        <p className="text-emerald-100 text-xs mt-0.5">{activeGame.subtext}</p>
                    </div>

                    <div className="flex items-center gap-3 relative z-10">
                        <button
                            onClick={handleDeleteActiveGame}
                            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-red-500 hover:text-white transition"
                            title="Delete Game"
                        >
                            <User size={0} className="hidden" /> {/* Hack to keep import if needed, but we used Trash2 in LeagueDashboard, need to import it here */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        </button>

                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white group-hover:bg-white group-hover:text-emerald-700 transition">
                            <Swords size={20} className={activeGame.icon === 'swords' ? '' : 'hidden'} />
                            <Trophy size={20} className={activeGame.icon === 'trophy' ? '' : 'hidden'} />
                            <Flag size={20} className={activeGame.icon === 'flag' ? '' : 'hidden'} />
                        </div>
                    </div>
                </div>
            )}

            {/* Handicap & Stats Row */}
            <div className="bg-dark text-white p-6 rounded-3xl shadow-xl relative overflow-hidden group">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition duration-700 transform group-hover:scale-110 pointer-events-none">
                    <Trophy size={140} />
                </div>

                <div className="relative z-10 grid grid-cols-2 gap-8 relative">
                    {/* Divider */}
                    <div className="absolute left-1/2 top-4 bottom-4 w-px bg-white/10"></div>

                    {/* Handicap Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">WHS Index</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-5xl font-black tracking-tighter text-white">{user?.handicap || '54'}</span>
                        </div>
                        <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${user?.handicapChange < 0 ? 'text-emerald-400' : 'text-stone-500'}`}>
                            {user?.handicapChange < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                            <span>{Math.abs(user?.handicapChange || 0).toFixed(1)}</span>
                            <span className="text-stone-600 font-normal ml-1">last rnd</span>
                        </div>
                    </div>

                    {/* Avg Score Section */}
                    <div className="pl-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-secondary uppercase tracking-widest">Avg Score</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-5xl font-black tracking-tighter text-white">{user?.avgScore ? Math.round(user.avgScore) : '-'}</span>
                            <span className="text-xl font-bold text-stone-500">.{user?.avgScore ? (user.avgScore % 1).toFixed(1).substring(2) : '0'}</span>
                        </div>
                        <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${user?.avgScoreChange < 0 ? 'text-emerald-400' : 'text-stone-500'}`}>
                            {/* Lower score is better */}
                            {user?.avgScoreChange < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                            <span>{Math.abs(user?.avgScoreChange || 0).toFixed(1)}</span>
                            <span className="text-stone-600 font-normal ml-1">last 5</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
                <Link to="/play" className="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-center gap-3 hover:shadow-md transition active:scale-95 group">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
                        <Plus size={20} />
                    </div>
                    <span className="font-bold text-dark text-sm">New Round</span>
                </Link>
                <Link to="/league" className="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-center gap-3 hover:shadow-md transition active:scale-95 group">
                    <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
                        <Trophy size={20} />
                    </div>
                    <span className="font-bold text-dark text-sm">Leagues</span>
                </Link>
            </div>

            {/* Quick Actions (Friends) */}
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="font-bold text-lg text-dark">Friends</h3>
                    <button onClick={() => setIsFriendSearchOpen(true)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-dark hover:bg-stone-200 transition">
                        <Plus size={16} />
                    </button>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-1">
                    {friendsList.length === 0 ? (
                        <div className="text-sm text-stone-400 italic">No friends added yet.</div>
                    ) : (
                        friendsList.map(friend => (
                            <Link key={friend.id} to={`/user/${friend.id}`} className="flex flex-col items-center gap-2 min-w-[60px] group">
                                <div className="w-14 h-14 rounded-2xl bg-white border border-stone-100 shadow-sm flex items-center justify-center overflow-hidden group-hover:scale-105 transition">
                                    {friend.avatar ? (
                                        <img src={friend.avatar} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="font-bold text-stone-300 text-lg">{friend.username[0]}</span>
                                    )}
                                </div>
                                <span className="text-[10px] font-bold text-dark truncate w-full text-center">{friend.username.split(' ')[0]}</span>
                            </Link>
                        ))
                    )}
                </div>

                <FriendSearchModal
                    isOpen={isFriendSearchOpen}
                    onClose={() => setIsFriendSearchOpen(false)}
                    onAddFriend={(friend) => addFriend(friend.id.toString())}
                    friends={user?.friends ? (typeof user.friends === 'string' ? JSON.parse(user.friends) : user.friends) : []}
                />
            </div>

            {/* Counting Rounds */}
            < div >
                <div className="flex justify-between items-end mb-4">
                    <h3 className="font-bold text-lg text-dark">Recent Activity</h3>
                    <Link to="/play" className="text-primary text-sm font-medium hover:underline">View All</Link>
                </div>
                <div className="space-y-3">
                    {countingRounds.length > 0 ? (
                        countingRounds.map(item => {
                            const course = courses.find(c => c.id == item.courseId || c.serverId == item.courseId);
                            const isMatch = item.type === 'match';

                            return (
                                <SwipeableItem
                                    key={`${item.type}-${item.id}`}
                                    onDelete={() => handleDelete(item.id, item.type)}
                                    onClick={() => navigate(isMatch ? `/matchplay/${item.id}` : `/play/${item.id}`)}
                                >
                                    <div className="p-4 flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div>
                                                <p className="font-bold text-dark">{course?.name || 'Unknown Course'}</p>
                                                <div className="text-xs text-muted flex items-center gap-1">
                                                    <span>{new Date(item.date).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span className="font-medium text-dark">
                                                        {isMatch ? 'Matchplay' : 'Stroke Play'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-muted font-bold uppercase mb-1">Diff</div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-lg font-black text-primary">
                                                    {item.differential > 0 ? '+' : ''}{item.differential.toFixed(1)}
                                                </span>
                                                {item.included && (
                                                    <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full mt-1">
                                                        Counting
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </SwipeableItem>
                            );
                        })
                    ) : (
                        <div className="card flex items-center justify-between p-4">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-muted">
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <p className="font-bold text-dark">No Counting Rounds</p>
                                    <p className="text-xs text-muted">Play more rounds to establish a handicap</p>
                                </div>
                            </div>
                            <span className="text-muted text-sm font-medium">-</span>
                        </div>
                    )}
                </div>
            </div >

        </div >
    );
};
