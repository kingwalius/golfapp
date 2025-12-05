import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CompactScorecard } from './CompactScorecard';
import { useUser } from '../../lib/store';
import { Plus, Trophy, Activity } from 'lucide-react';

const FeedItem = ({ item }) => {
    const isMatch = item.type === 'match';
    const date = new Date(item.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Construct the "Blog Post" text
    let title = '';

    if (isMatch) {
        title = `${item.p1Name || 'Unknown'} vs ${item.p2Name || 'Unknown'}`;
    } else {
        title = item.username || 'Unknown';
    }

    const scores = item.scores || {};

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-stone-100">
            <div className="mb-4">
                <div>
                    <h3 className="font-bold text-primary text-lg">{title}</h3>
                    <p className="text-stone-400 text-xs">{date} • {item.courseName}</p>
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

        fetchData();
    }, [user]);

    return (
        <div className="p-4 pb-24 min-h-screen bg-stone-50">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-primary">League</h1>
                <Link to="/league/create" className="bg-primary text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition">
                    <Plus size={24} />
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-white rounded-xl shadow-sm mb-6">
                <button
                    onClick={() => setActiveTab('leagues')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${activeTab === 'leagues' ? 'bg-primary text-white shadow-md' : 'text-muted hover:bg-stone-50'}`}
                >
                    <Trophy size={16} />
                    My Leagues
                </button>
                <button
                    onClick={() => setActiveTab('feed')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${activeTab === 'feed' ? 'bg-primary text-white shadow-md' : 'text-muted hover:bg-stone-50'}`}
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
                            className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 flex justify-between items-center cursor-pointer hover:border-primary/30 transition"
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
                            <Link to="/league/create" className="text-primary font-bold hover:underline">Create your first league</Link>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {feed.length === 0 && !loading ? (
                        <div className="text-center py-10 text-stone-400">No activity yet. Go play some golf!</div>
                    ) : (
                        feed.map((item, index) => (
                            <FeedItem key={`${item.type}-${item.id}-${index}`} item={item} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
