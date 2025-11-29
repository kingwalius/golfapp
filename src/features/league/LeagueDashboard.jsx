import React, { useEffect, useState } from 'react';
import { CompactScorecard } from './CompactScorecard';

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
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bestOfWeek, setBestOfWeek] = useState(null);

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                const res = await fetch('/api/league/feed');
                if (res.ok) {
                    const data = await res.json();
                    setFeed(data);

                    // Calculate Best Score of the Week
                    const now = new Date();
                    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

                    const weekItems = data.filter(item => {
                        const itemDate = new Date(item.date);
                        return itemDate >= oneWeekAgo && itemDate <= now;
                    });

                    // Find best Stableford score (assuming higher is better)
                    // Or best Gross score (lower is better). Let's prioritize Stableford points.
                    let best = null;
                    weekItems.forEach(item => {
                        // Check if item has stableford points
                        if (item.stableford !== undefined && item.stableford !== null) {
                            if (!best || item.stableford > best.score) {
                                best = {
                                    player: item.username || item.p1Name || 'Player', // Fallback
                                    score: item.stableford,
                                    type: 'Points',
                                    avatar: item.avatar // If available
                                };
                            }
                        }
                    });

                    setBestOfWeek(best);
                }
            } catch (error) {
                console.error("Failed to fetch league feed", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFeed();
    }, []);

    return (
        <div className="p-4 pb-20">
            <h1 className="text-2xl font-bold mb-6 text-primary">League Feed</h1>

            {/* Best of the Week Banner */}
            {bestOfWeek && (
                <div className="bg-primary text-white rounded-2xl p-6 mb-8 shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="text-sm font-medium opacity-80 mb-1 uppercase tracking-wider">Best of the Week</div>
                        <div className="flex items-end gap-3">
                            <h2 className="text-3xl font-bold">{bestOfWeek.player}</h2>
                            <div className="text-4xl font-black text-secondary">{bestOfWeek.score} <span className="text-lg font-normal text-white/80">{bestOfWeek.type}</span></div>
                        </div>
                    </div>
                    {/* Decorative background element */}
                    <div className="absolute -right-4 -bottom-8 opacity-10 text-9xl">🏆</div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-10 text-stone-400">Loading feed...</div>
            ) : feed.length === 0 ? (
                <div className="text-center py-10 text-stone-400">No activity yet. Go play some golf!</div>
            ) : (
                feed.map((item, index) => (
                    <FeedItem key={`${item.type}-${item.id}-${index}`} item={item} />
                ))
            )}
        </div>
    );
};
