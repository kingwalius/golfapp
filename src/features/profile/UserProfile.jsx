import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser, useDB } from '../../lib/store';
import { User, Trophy, TrendingUp, TrendingDown, Star, X } from 'lucide-react';

export const UserProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, removeFriend } = useUser();
    const db = useDB();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!id) return;
            setLoading(true);
            try {
                // Fetch user data from server
                const res = await fetch(`/api/user/${id}`, {
                    headers: { 'Authorization': `Bearer ${user?.token}` }
                });
                if (!res.ok) {
                    throw new Error('User not found');
                }
                const data = await res.json();

                // Fetch recent activity
                if (user && user.token) {
                    const activityRes = await fetch(`/api/user/${id}/activity`, {
                        headers: { 'Authorization': `Bearer ${user.token}` }
                    });
                    if (activityRes.ok) {
                        const activity = await activityRes.json();
                        // Find last result (round or match)
                        const allItems = [
                            ...(activity.rounds || []),
                            ...(activity.matches || [])
                        ].sort((a, b) => new Date(b.date) - new Date(a.date));

                        data.lastResult = allItems[0] || null;
                    }
                }

                setProfile(data);
            } catch (err) {
                console.error("Failed to load profile", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [id, user]);

    const handleRemoveFriend = async () => {
        if (confirm(`Are you sure you want to remove ${profile.username} from your friends?`)) {
            await removeFriend(id);
            navigate('/');
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center">
            <div className="animate-spin text-primary">
                <RefreshCw size={32} />
            </div>
        </div>
    );

    if (error || !profile) return (
        <div className="min-h-screen bg-stone-50 p-6 flex flex-col items-center justify-center">
            <p className="text-muted mb-4">User not found</p>
            <button onClick={() => navigate(-1)} className="text-dark font-bold hover:underline">Go Back</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-stone-50 pb-safe p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <button onClick={() => navigate(-1)} className="text-stone-400 hover:text-dark transition font-bold text-sm">
                    Back
                </button>
                {user?.friends && (typeof user.friends === 'string' ? JSON.parse(user.friends) : user.friends).includes(id.toString()) && (
                    <button
                        onClick={handleRemoveFriend}
                        className="text-red-400 font-bold text-xs uppercase tracking-widest hover:text-red-600 transition flex items-center gap-1"
                    >
                        <X size={14} /> Remove Friend
                    </button>
                )}
            </div>

            {/* Profile Card */}
            <div className="flex flex-col items-center mb-10">
                <div className="w-32 h-32 rounded-3xl border-4 border-white shadow-xl overflow-hidden bg-white flex items-center justify-center mb-6">
                    {profile.avatar ? (
                        <img src={profile.avatar} alt={profile.username} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-4xl font-black text-stone-200">{profile.username[0]}</span>
                    )}
                </div>

                <h1 className="text-3xl font-black text-dark mb-1">{profile.username}</h1>
                <p className="text-muted text-sm font-medium">Golfer</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                {/* WHS Index */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">WHS Index</span>
                    <span className="text-4xl font-black text-dark tracking-tight">
                        {profile.handicap ? profile.handicap.toFixed(1) : '54'}
                    </span>
                    {profile.handicapChange !== 0 && profile.handicapChange && (
                        <div className={`flex items-center gap-1 text-xs font-bold mt-1 ${profile.handicapChange < 0 ? 'text-emerald-500' : 'text-stone-400'}`}>
                            {profile.handicapChange < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                            {Math.abs(profile.handicapChange).toFixed(1)}
                        </div>
                    )}
                </div>

                {/* Avg Score */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1">Avg Score</span>
                    <span className="text-4xl font-black text-dark tracking-tight">
                        {profile.avgScore ? Math.round(profile.avgScore) : '-'}
                    </span>
                </div>
            </div>

            {/* Last Round Info */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
                <h3 className="font-bold text-lg text-dark mb-4 border-b border-stone-100 pb-2">Last Activity</h3>

                {profile.lastResult ? (
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-dark">{profile.lastResult.scores ? 'Stroke Play' : 'Match'}</h4>
                                <p className="text-xs text-muted">{new Date(profile.lastResult.date).toLocaleDateString()}</p>
                            </div>
                            <span className="text-2xl font-black text-dark">
                                {profile.lastResult.score || '-'}
                            </span>
                        </div>

                        <div className="flex gap-4 mt-4">
                            <div className="flex-1 bg-stone-50 p-2 rounded-xl text-center">
                                <span className="block text-[10px] text-muted uppercase font-bold">Gross</span>
                                <span className="block font-bold text-dark">{profile.lastResult.score || '-'}</span>
                            </div>
                            <div className="flex-1 bg-stone-50 p-2 rounded-xl text-center">
                                <span className="block text-[10px] text-muted uppercase font-bold">Net</span>
                                <span className="block font-bold text-dark">
                                    {profile.lastResult.score && profile.handicap ? Math.round(profile.lastResult.score - profile.handicap) : '-'}
                                </span>
                            </div>
                            <div className="flex-1 bg-stone-50 p-2 rounded-xl text-center">
                                <span className="block text-[10px] text-muted uppercase font-bold">Place</span>
                                <span className="block font-bold text-dark">-</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-center text-muted text-sm py-4">No recent activity.</p>
                )}
            </div>
        </div>
    );
};

// Import helper icon
import { RefreshCw } from 'lucide-react';
