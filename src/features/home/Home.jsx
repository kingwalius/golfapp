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

            {/* Handicap & Stats Row */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark text-white p-5 rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                        <Trophy size={48} />
                    </div>
                    <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Handicap</span>
                    <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-5xl font-black tracking-tighter">{user?.handicap || '54'}</span>
                        <span className={`text-xs font-bold ${user?.handicapChange < 0 ? 'text-emerald-400' : 'text-stone-500'}`}>
                            {user?.handicapChange < 0 ? '↓' : '↑'} {Math.abs(user?.handicapChange || 0).toFixed(1)}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <Link to="/play" className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-stone-100 flex flex-col justify-center items-center gap-2 hover:shadow-md transition active:scale-95">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                            <Plus size={20} />
                        </div>
                        <span className="font-bold text-dark text-sm">New Round</span>
                    </Link>
                    <Link to="/league" className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-stone-100 flex flex-col justify-center items-center gap-2 hover:shadow-md transition active:scale-95">
                        <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center">
                            <Trophy size={20} />
                        </div>
                        <span className="font-bold text-dark text-sm">Leagues</span>
                    </Link>
                </div>
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
            </div >

        </div >
    );
};
