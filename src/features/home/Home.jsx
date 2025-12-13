import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useDB } from '../../lib/store';
import { SwipeableItem } from '../../components/SwipeableItem';
import { calculatePlayingHcp, calculateStableford, calculateStrokesReceived, prepareHandicapData, calculateHandicapDetails } from '../scoring/calculations';
import { User, Trophy, Calendar, Swords, Flag, Plus, Star, Search, RefreshCw } from 'lucide-react';
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

    const loadData = async () => {
        if (!db || !user) return;

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
                    c = serverCourses;
                }
            } catch (e) {
                console.warn("Failed to fetch courses in Home.jsx", e);
            }
        }

        // Prepare data for handicap calculation
        const preparedData = prepareHandicapData(r, m, c, user?.id);
        const { rounds } = calculateHandicapDetails(preparedData, c);

        // Filter to show only the rounds that are included in the calculation (top 8)
        // Or show last 20 and highlight included ones? 
        // User asked for "8 rounds that are used", so let's filter for included.
        const includedRounds = rounds.filter(r => r.included);

        setCountingRounds(includedRounds);
        setCourses(c);

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

    const handleManualSync = async () => {
        if (isManualSyncing) return;
        setIsManualSyncing(true);
        try {
            await recalculateHandicap();
            await sync();
            await loadData(); // Reload UI
        } catch (e) {
            console.error("Manual sync failed", e);
            alert("Sync failed. Please try again.");
        } finally {
            setIsManualSyncing(false);
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
            }

            await db.delete(storeName, id);
            await recalculateHandicap(); // Update handicap after deletion
            loadData(); // Reload list
        }
    };

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <header className="flex justify-between items-center pt-4">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="text-muted text-sm font-medium uppercase tracking-wider">Welcome back</p>
                        <button
                            onClick={handleManualSync}
                            disabled={isManualSyncing}
                            className="text-muted hover:text-primary transition disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={isManualSyncing ? "animate-spin" : ""} />
                        </button>
                    </div>
                    <h1 className="text-3xl font-bold text-dark mt-1">
                        {user ? user.username : 'Golfer'}
                    </h1>
                </div>
                <Link to="/profile" className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 overflow-hidden hover:opacity-80 transition">
                    {user?.avatar ? (
                        <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <User size={24} />
                    )}
                </Link>
            </header>

            {/* Handicap Card */}
            <div className="relative overflow-hidden bg-primary rounded-3xl p-6 text-white shadow-card">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/20 rounded-full -ml-10 -mb-10 blur-xl"></div>

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <p className="text-emerald-100 font-medium text-sm">Current Handicap</p>
                            <h2 className="text-5xl font-bold mt-1 tracking-tight text-white flex items-baseline gap-2">
                                {user?.handicapMode === 'MANUAL' && user?.manualHandicap
                                    ? parseFloat(user.manualHandicap).toFixed(1)
                                    : (user?.handicap ? user.handicap.toFixed(1) : '54.0')}
                                {user?.handicapChange != null && (
                                    <span className={`text-2xl font-semibold ${user.handicapChange < 0 ? 'text-secondary' : 'text-white/80'}`}>
                                        {user.handicapChange === 0 ? '-' : (user.handicapChange > 0 ? '+' : '') + user.handicapChange.toFixed(1)}
                                    </span>
                                )}
                            </h2>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-4">
                                WHS Index
                            </span>
                            <div className="text-right">
                                <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-1">Avg 5 Rounds</div>
                                <div className="flex items-baseline justify-end gap-2">
                                    <div className="text-2xl font-black text-secondary">
                                        {user?.avgScore ? user.avgScore.toFixed(1) : '-'}
                                    </div>
                                    {user?.avgScoreChange != null && (
                                        <div className={`text-lg font-bold ${user.avgScoreChange < 0 ? 'text-secondary' : 'text-secondary/80'}`}>
                                            {user.avgScoreChange === 0 ? '' : (user.avgScoreChange > 0 ? '+' : '') + user.avgScoreChange.toFixed(1)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Link to="/play" className="flex-1 bg-white text-primary py-3 rounded-xl font-bold text-center shadow-lg hover:bg-emerald-50 transition active:scale-95">
                            Play Round
                        </Link>
                        <Link to="/matchplay" className="flex-1 bg-secondary text-white py-3 rounded-xl font-bold text-center shadow-lg hover:bg-amber-600 transition active:scale-95">
                            Matchplay
                        </Link>
                    </div>
                </div>
            </div>

            {/* Friends Section */}
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-dark">Friends</h3>
                    <button
                        onClick={() => setIsFriendSearchOpen(true)}
                        className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-dark hover:bg-primary hover:text-white transition"
                    >
                        <Search size={16} />
                    </button>
                </div>

                <div className="space-y-3">
                    {friendsList.length > 0 ? (
                        friendsList.map(friend => (
                            <SwipeableItem
                                key={friend.id}
                                onDelete={() => {
                                    addFriend(null); // Hack to trigger re-render if needed, but actually we need removeFriend
                                    // Wait, I need to import removeFriend from useUser first.
                                    // Actually, I should just call removeFriend(friend.id.toString())
                                    // But I need to update the local friendsList state too or wait for re-render.
                                    // The loadData depends on user.friends, so updating user should trigger it.
                                    // Let's use the function from context.
                                    removeFriend(friend.id.toString());
                                }}
                            >
                                <div className="bg-white p-4 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 border border-stone-100">
                                            {friend.avatar ? (
                                                <img src={friend.avatar} alt={friend.username} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <User size={20} />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-dark leading-tight">{friend.username}</h4>
                                            <div className="text-xs text-muted font-medium">HCP: {friend.handicap}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-muted uppercase tracking-wider mb-0.5">Last Round</div>
                                        <div className="font-bold text-dark">{friend.lastGrossScore || '-'}</div>
                                    </div>
                                </div>
                            </SwipeableItem>
                        ))
                    ) : (
                        <div className="text-center py-6 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                            <p className="text-sm text-muted mb-2">No friends added yet</p>
                            <button
                                onClick={() => setIsFriendSearchOpen(true)}
                                className="text-primary font-bold text-sm hover:underline"
                            >
                                Find Friends
                            </button>
                        </div>
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
            <div>
                <div className="flex justify-between items-end mb-4">
                    <h3 className="font-bold text-lg text-dark">Counting Rounds</h3>
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
                                            <span className="text-lg font-black text-primary">
                                                {item.differential > 0 ? '+' : ''}{item.differential.toFixed(1)}
                                            </span>
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
            </div>

        </div>
    );
};
