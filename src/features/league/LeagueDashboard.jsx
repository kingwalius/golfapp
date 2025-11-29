import React, { useEffect, useState } from 'react';
import { CompactScorecard } from './CompactScorecard';

const FeedItem = ({ item }) => {
    const isMatch = item.type === 'match';
    const date = new Date(item.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Construct the "Blog Post" text
    let title = '';
    let description = '';

    if (isMatch) {
        title = `${item.p1Name || 'Unknown'} vs ${item.p2Name || 'Unknown'}`;
        description = `${item.p1Name || 'Player 1'} hat eine Runde Matchplay mit ${item.p2Name || 'Player 2'} gespielt.`;
    } else {
        title = `${item.username || 'Unknown'} - Round`;
        description = `${item.username || 'Player'} hat eine Runde auf dem ${item.courseName} gespielt.`;
    }

    const scores = item.scores || {};

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-stone-100">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-xl">
                    ⛳
                </div>
                <div>
                    <h3 className="font-bold text-primary text-lg">{title}</h3>
                    <p className="text-stone-400 text-xs">{date} • {item.courseName}</p>
                </div>
            </div>

            <p className="text-stone-600 mb-4 font-medium leading-relaxed">
                {description}
            </p>

            {/* Scorecard */}
            {item.courseHoles && item.courseHoles.length > 0 ? (
                <CompactScorecard
                    holes={item.courseHoles}
                    scores={scores}
                    par={72}
                />
            ) : (
                <div className="bg-stone-100 p-4 rounded-xl text-center text-stone-500">
                    Scorecard data unavailable
                </div>
            )}

            <div className="mt-4 flex gap-4 text-sm font-bold text-primary">
                {isMatch ? (
                    <span>Winner: {item.winnerId ? (item.winnerId == item.player1Id ? item.p1Name : item.p2Name) : 'Draw/Pending'}</span>
                ) : (
                    <>
                        <span>Score: {item.score}</span>
                        <span>Pts: {item.stableford}</span>
                    </>
                )}
            </div>
        </div>
    );
};

export const LeagueDashboard = () => {
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                const res = await fetch('/api/league/feed');
                if (res.ok) {
                    const data = await res.json();
                    setFeed(data);
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
