import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CompactScorecard } from './CompactScorecard';
import { useUser } from '../../lib/store';
import { Plus, Trophy, Activity, Ticket, Trash2 } from 'lucide-react';

const FeedItem = ({ item, onDelete, currentUserId }) => {
    const isMatch = item.type === 'match';
    const isSkins = item.type === 'skins';
    const date = new Date(item.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Construct the Title
    let title = '';

    if (isMatch) {
        title = `${item.p1Name || 'Unknown'} vs ${item.p2Name || 'Unknown'}`;
    } else if (isSkins) {
        const playerCount = item.players ? item.players.length : 0;
        title = `Skins Game (${playerCount} Players)`;
    } else {
        title = item.username || 'Unknown';
    }

    const scores = item.scores || {};

    // Specific rendering for Skins
    if (isSkins) {
        return (
            <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-stone-100">
                <div className="mb-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-dark text-lg flex items-center gap-2">
                                <Trophy size={18} className="text-yellow-500" />
                                {title}
                            </h3>
                            <p className="text-stone-400 text-xs">{date} • {item.courseName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                                Pot: {item.skinValue}
                            </div>
                            {/* Delete Button */}
                            {currentUserId && (
                                <button
                                    onClick={() => onDelete(item)}
                                    className="text-stone-300 hover:text-red-500 p-1"
                                    title="Delete Game"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Simple Player List */}
                <div className="grid grid-cols-2 gap-2">
                    {item.players && item.players.slice(0, 4).map(p => (
                        <div key={p.id} className="bg-stone-50 p-3 rounded-xl flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white border border-stone-200 flex items-center justify-center font-bold text-xs text-stone-600">
                                {p.name ? p.name.substring(0, 2).toUpperCase() : '??'}
                            </div>
                            <span className="font-bold text-sm text-dark">{p.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-stone-100">
            <div className="mb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-dark text-lg">{title}</h3>
                        <p className="text-stone-400 text-xs">{date} • {item.courseName}</p>
                    </div>
                    {/* Delete Button for standard items */}
                    {currentUserId && (item.userId === currentUserId || item.player1Id === currentUserId || item.player2Id === currentUserId) && (
                        <button
                            onClick={() => onDelete(item)}
                            className="text-stone-300 hover:text-red-500 p-1"
                            title="Delete Activity"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Scorecard */}
            {item.courseHoles && item.courseHoles.length > 0 ? (
                <CompactScorecard
                    holes={item.courseHoles}
                    scores={scores}
                    par={72}
                    p1Name={item.p1Name}
                    p2Name={item.p2Name}
                />
            ) : (
                <div className="bg-stone-100 p-4 rounded-xl text-center text-stone-500">
                    Scorecard data unavailable
                </div>
            )}
        </div>
    );
};

export const LeagueDashboard = () => {
    const { user } = useUser();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('leagues'); // 'leagues' or 'feed'
    const [feed, setFeed] = useState([]);
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Feed
                const feedRes = await fetch('/api/league/feed');
                if (feedRes.ok) {
                    setFeed(await feedRes.json());
                }

                // Fetch User's Leagues
                if (user) {
                    const leaguesRes = await fetch(`/api/leagues?userId=${user.id}`);
                    if (leaguesRes.ok) {
                        setLeagues(await leaguesRes.json());
                    }
                }
            } catch (error) {
                console.error("Failed to fetch league data", error);
            } finally {
                setLoading(false);
            }
        };

        if (user) fetchData();
    }, [user]);

    const handleDeleteItem = async (item) => {
        if (!confirm('Are you sure you want to delete this activity? This cannot be undone.')) return;

        let endpoint = '';
        const body = { userId: user.id, date: item.date };

        if (item.type === 'skins') {
            endpoint = '/api/skins/delete';
            body.gameId = item.id;
        } else if (item.type === 'match') {
            endpoint = '/api/matches/delete';
            body.courseId = item.courseId; // Match delete needs courseId & date
        } else {
            endpoint = '/api/rounds/delete';
            body.courseId = item.courseId;
        }

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                // Remove from local feed state immediately
                setFeed(prev => prev.filter(f => !(f.id === item.id && f.type === item.type)));
            } else {
                alert("Failed to delete item.");
            }
        } catch (e) {
            console.error("Delete failed", e);
        }
    };

    return (
        <div className="p-4 pb-24 min-h-screen bg-stone-50">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-dark">League</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            const id = prompt("Enter League Invite Code:");
                            if (id) {
                                fetch(`/api/leagues/${id}/join`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: user.id })
                                }).then(async res => {
                                    if (res.ok) {
                                        alert("Joined successfully!");
                                        window.location.reload();
                                    } else {
                                        const err = await res.json();
                                        alert(err.error || "Failed to join");
                                    }
                                });
                            }
                        }}
                        className="bg-white text-dark w-10 h-10 rounded-full flex items-center justify-center shadow-sm border border-stone-100 hover:scale-105 transition"
                    >
                        <Ticket size={24} />
                    </button>
                    <Link to="/league/create" className="bg-dark text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition">
                        <Plus size={24} />
                    </Link>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-white rounded-xl shadow-sm mb-6">
                <button
                    onClick={() => setActiveTab('leagues')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${activeTab === 'leagues' ? 'bg-dark text-white shadow-md' : 'text-muted hover:bg-stone-50'}`}
                >
                    <Trophy size={16} />
                    My Leagues
                </button>
                <button
                    onClick={() => setActiveTab('feed')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${activeTab === 'feed' ? 'bg-dark text-white shadow-md' : 'text-muted hover:bg-stone-50'}`}
                >
                    <Activity size={16} />
                    Activity Feed
                </button>
            </div>

            {/* Content */}
            {activeTab === 'leagues' ? (
                <div className="space-y-4">
                    {leagues.map(league => (
                        <div
                            key={league.id}
                            onClick={() => navigate(`/league/${league.id}`)}
                            className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 flex justify-between items-center cursor-pointer hover:border-dark transition"
                        >
                            <div>
                                <h3 className="font-bold text-lg text-dark">{league.name}</h3>
                                <p className="text-xs text-muted font-medium uppercase tracking-wide mt-1">{league.type} League</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                                <span className="text-lg">→</span>
                            </div>
                        </div>
                    ))}

                    {leagues.length === 0 && !loading && (
                        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-stone-200">
                            <Trophy size={48} className="mx-auto text-stone-300 mb-4" />
                            <p className="text-muted mb-4">You haven't joined any leagues yet.</p>
                            <Link to="/league/create" className="text-dark font-bold hover:underline">Create your first league</Link>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {feed.length === 0 && !loading ? (
                        <div className="text-center py-10 text-stone-400">No activity yet. Go play some golf!</div>
                    ) : (
                        feed.map((item, index) => (
                            <FeedItem
                                key={`${item.type}-${item.id}-${index}`}
                                item={item}
                                onDelete={handleDeleteItem}
                                currentUserId={user?.id}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
