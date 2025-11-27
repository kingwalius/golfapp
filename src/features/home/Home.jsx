import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useDB } from '../../lib/store';
import { SwipeableItem } from '../../components/SwipeableItem';
import { User, Trophy, Calendar, Swords, Flag, Plus } from 'lucide-react';

export const Home = () => {
    const { user } = useUser();
    const db = useDB();
    const navigate = useNavigate();
    const [recentActivity, setRecentActivity] = useState([]);
    const [courses, setCourses] = useState([]);

    const loadData = async () => {
        const r = await db.getAll('rounds');
        const m = await db.getAll('matches');
        const c = await db.getAll('courses');

        // Combine and sort by date (newest first)
        const combined = [
            ...r.map(item => ({ ...item, type: 'round' })),
            ...m.map(item => ({ ...item, type: 'match' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3); // Top 3 only

        setRecentActivity(combined);
        setCourses(c);
    };

    useEffect(() => {
        loadData();
    }, [db]);

    const handleDelete = async (id, type) => {
        if (confirm('Are you sure you want to delete this?')) {
            const storeName = type === 'round' ? 'rounds' : 'matches';
            await db.delete(storeName, id);
            loadData(); // Reload list
        }
    };

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <header className="flex justify-between items-center pt-4">
                <div>
                    <p className="text-muted text-sm font-medium uppercase tracking-wider">Welcome back</p>
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
                            <h2 className="text-5xl font-bold mt-1 tracking-tight text-white">
                                {user?.handicapMode === 'MANUAL' && user?.manualHandicap
                                    ? parseFloat(user.manualHandicap).toFixed(1)
                                    : (user?.handicap ? user.handicap.toFixed(1) : '54.0')}
                            </h2>
                        </div>
                        <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                            WHS Index
                        </span>
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

            {/* Quick Actions */}
            <div>
                <h3 className="font-bold text-lg mb-4 text-dark">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Link to="/courses/new" className="card flex flex-col items-center justify-center py-6 gap-3 hover:border-primary/30 transition group">
                        <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center group-hover:scale-110 transition">
                            <Plus size={24} />
                        </div>
                        <span className="font-semibold text-sm">Add Course</span>
                    </Link>
                    <Link to="/league" className="card flex flex-col items-center justify-center py-6 gap-3 hover:border-primary/30 transition group">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition">
                            <Trophy size={24} />
                        </div>
                        <span className="font-semibold text-sm">League</span>
                    </Link>
                </div>
            </div>

            {/* Recent Activity */}
            <div>
                <div className="flex justify-between items-end mb-4">
                    <h3 className="font-bold text-lg text-dark">Recent Activity</h3>
                    <Link to="/play" className="text-primary text-sm font-medium hover:underline">View All</Link>
                </div>
                <div className="space-y-1">
                    {recentActivity.length > 0 ? (
                        recentActivity.map(item => {
                            const course = courses.find(c => c.id === item.courseId);
                            const isMatch = item.type === 'match';

                            return (
                                <SwipeableItem
                                    key={`${item.type}-${item.id}`}
                                    onDelete={() => handleDelete(item.id, item.type)}
                                    onClick={() => navigate(isMatch ? `/matchplay/${item.id}` : `/play/${item.id}`)}
                                >
                                    <div className="p-4 flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isMatch ? 'bg-orange-50 text-orange-500' : 'bg-stone-100 text-stone-500'}`}>
                                                {isMatch ? <Swords size={20} /> : <Flag size={20} />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-dark">{course?.name || 'Unknown Course'}</p>
                                                <div className="text-xs text-muted flex items-center gap-1">
                                                    <span>{new Date(item.date).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    {isMatch ? (
                                                        <span className="font-medium text-secondary">
                                                            vs {item.player2?.name || 'Opponent'}
                                                        </span>
                                                    ) : (
                                                        <span>{item.totalStableford || 0} pts</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {isMatch ? (
                                                <span className="text-sm font-bold bg-stone-100 px-2 py-1 rounded text-stone-600">{item.status}</span>
                                            ) : (
                                                <span className="text-primary font-bold text-lg">{item.totalStrokes || '-'}</span>
                                            )}
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
                                    <p className="font-bold text-dark">Last Round</p>
                                    <p className="text-xs text-muted">No recent activity</p>
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
