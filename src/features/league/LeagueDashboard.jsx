import React, { useState, useEffect } from 'react';
import { useDB } from '../../lib/store';
import { getChallenges } from './challenges';

export const LeagueDashboard = () => {
    const db = useDB();
    const [challenges, setChallenges] = useState({ weekly: null, monthly: null });
    const [soloLeaderboard, setSoloLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const rounds = await db.getAll('rounds');
            const courses = await db.getAll('courses');
            const data = getChallenges(rounds, courses);
            setChallenges(data);

            // Fetch Online Leaderboard
            try {
                const res = await fetch('http://localhost:3000/leaderboard/solo');
                const leaderboard = await res.json();
                setSoloLeaderboard(leaderboard);
            } catch (e) {
                console.error("Failed to fetch leaderboard", e);
            }

            setLoading(false);
        };
        load();
    }, [db]);

    if (loading) return <div className="p-4">Loading League...</div>;

    return (
        <div className="p-4 pb-20">
            <h1 className="text-2xl font-bold mb-6 text-primary">League & Challenges</h1>

            <div className="space-y-6">
                {/* Weekly Challenge */}
                <div className="bg-gradient-to-br from-teal-500 to-teal-700 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="font-bold text-xl">{challenges.weekly.title}</h2>
                            <p className="text-teal-100 text-sm">{challenges.weekly.description}</p>
                        </div>
                        <span className="text-3xl">📅</span>
                    </div>

                    {challenges.weekly.leader ? (
                        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                            <div className="text-xs uppercase tracking-wider opacity-75 mb-1">Current Leader</div>
                            <div className="flex justify-between items-end">
                                <span className="font-bold text-lg">You</span>
                                <span className="text-2xl font-black">{challenges.weekly.leader.score} pts</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4 bg-white/10 rounded-lg">
                            No rounds this week yet. Go play!
                        </div>
                    )}
                </div>

                {/* Online Leaderboard */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-bold text-lg mb-3">Global Handicap Leaderboard</h3>
                    <table className="w-full text-sm">
                        <thead className="text-gray-500 border-b">
                            <tr>
                                <th className="text-left py-2">Rank</th>
                                <th className="text-left py-2">Player</th>
                                <th className="text-right py-2">HCP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {soloLeaderboard.map((user, i) => (
                                <tr key={user.id} className={i === 0 ? "text-primary font-bold" : ""}>
                                    <td className="py-3 font-bold">{i + 1}</td>
                                    <td className="py-3">{user.username}</td>
                                    <td className="py-3 text-right">{user.handicap}</td>
                                </tr>
                            ))}
                            {soloLeaderboard.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="py-4 text-center text-gray-400">Offline or No Data</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
