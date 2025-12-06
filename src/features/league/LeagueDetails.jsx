import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Calendar, Trophy, Share2 } from 'lucide-react';
import { useUser } from '../../lib/store';

export const LeagueDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useUser();
    const [league, setLeague] = useState(null);
    const [standings, setStandings] = useState([]);
    const [recentRounds, setRecentRounds] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await fetch(`/api/leagues/${id}/standings`);
                if (res.ok) {
                    const data = await res.json();
                    const data = await res.json();
                    setLeague(data.league);
                    setStandings(data.standings);
                    setRecentRounds(data.rounds || []); // Expecting rounds in response now
                }
            } catch (error) {
                console.error("Failed to fetch league details", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [id]);

    const handleShare = () => {
        // In a real app, this would copy a link or open a share sheet
        alert(`Invite Code: ${id} (Share this ID with friends to join)`);
    };

    if (loading) return <div className="p-6 text-center text-muted">Loading League...</div>;
    if (!league) return <div className="p-6 text-center text-muted">League not found</div>;

    return (
        <div className="p-6 pb-24 min-h-screen bg-stone-50">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate('/league')} className="p-2 bg-white rounded-full shadow-sm">
                    <ArrowLeft size={20} />
                </button>
                <button onClick={handleShare} className="p-2 bg-white rounded-full shadow-sm text-primary">
                    <Share2 size={20} />
                </button>
            </div>

            {/* League Card */}
            <div className="bg-primary text-white rounded-3xl p-6 mb-8 shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 text-emerald-100 mb-2 text-sm font-medium uppercase tracking-wider">
                        <Trophy size={16} />
                        <span>{league.type === 'STROKE' ? 'Strokeplay League' : league.type}</span>
                    </div>
                    <h1 className="text-3xl font-bold mb-4">{league.name}</h1>

                    <div className="flex gap-6 text-sm text-emerald-100/80">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} />
                            <span>{new Date(league.startDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Users size={16} />
                            <span>{standings.length} Members</span>
                        </div>
                    </div>
                </div>
                <div className="absolute -right-8 -bottom-8 opacity-10 text-9xl">⛳</div>
            </div>

            {/* Actions */}
            <div className="mb-8">
                <button
                    onClick={() => navigate('/play', { state: { leagueId: league.id } })}
                    className="w-full bg-secondary text-white py-4 rounded-2xl font-bold shadow-lg shadow-secondary/20 flex items-center justify-center gap-2 hover:bg-amber-500 transition active:scale-95"
                >
                    <Trophy size={20} />
                    Play League Round
                </button>
            </div>

            {/* Standings */}
            <h2 className="text-lg font-bold text-dark mb-4 px-2">Standings</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
                {standings.map((member, index) => (
                    <div key={member.id} className="flex items-center p-4 border-b border-stone-100 last:border-none">
                        <div className="w-8 text-center font-bold text-muted text-lg mr-4">
                            {index + 1}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-stone-200 overflow-hidden mr-4">
                            {member.avatar ? (
                                <img src={member.avatar} alt={member.username} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-stone-400 font-bold">
                                    {member.username[0]}
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-dark">{member.username}</div>
                            <div className="text-xs text-muted">HCP {member.handicap}</div>
                        </div>
                        <div className="font-black text-xl text-primary">
                            {member.points} <span className="text-xs font-normal text-muted">pts</span>
                        </div>
                    </div>
                ))}
                {standings.length === 0 && (
                    <div className="p-8 text-center text-muted">
                        No members yet. Invite friends!
                    </div>
                )}
            </div>

            {/* Recent Rounds */}
            <h2 className="text-lg font-bold text-dark mb-4 px-2 mt-8">Recent Rounds</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
                {recentRounds.map((round) => (
                    <div key={round.id} className="flex items-center p-4 border-b border-stone-100 last:border-none">
                        <div className="w-10 h-10 rounded-full bg-stone-200 overflow-hidden mr-4">
                            {round.avatar ? (
                                <img src={round.avatar} alt={round.username} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-stone-400 font-bold">
                                    {round.username[0]}
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-dark">{round.username}</div>
                            <div className="text-xs text-muted">{new Date(round.date).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-primary">{round.stableford} <span className="text-xs font-normal text-muted">pts</span></div>
                            <div className="text-xs text-muted">{round.score} strokes</div>
                        </div>
                    </div>
                ))}
                {recentRounds.length === 0 && (
                    <div className="p-8 text-center text-muted">
                        No rounds played yet.
                    </div>
                )}
            </div>
        </div>
    );
};
