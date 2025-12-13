import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Calendar, Trophy, Share2, Trash2, LogOut, Swords, RefreshCw } from 'lucide-react';
import { useUser } from '../../lib/store';
import { BracketView } from './BracketView';
import { TeamLeagueDashboard } from './TeamLeagueDashboard';

export const LeagueDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useUser();
    const [league, setLeague] = useState(null);
    const [standings, setStandings] = useState([]);
    const [recentRounds, setRecentRounds] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await fetch(`/api/leagues/${id}/standings`);
                if (res.ok) {
                    const data = await res.json();
                    setLeague(data.league);
                    setStandings(data.standings);
                    setRecentRounds(data.rounds || []);
                    setEvents(data.events || []);
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
        navigator.clipboard.writeText(id).then(() => {
            alert(`Invite Code Copied: ${id}`);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert(`Invite Code: ${id}`);
        });
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to DELETE this league? This cannot be undone.")) return;

        try {
            const res = await fetch(`/api/leagues/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });
            if (res.ok) {
                navigate('/league');
            } else {
                alert("Failed to delete league");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleLeave = async () => {
        if (!confirm("Are you sure you want to LEAVE this league? Your scores will be removed.")) return;

        try {
            const res = await fetch(`/api/leagues/${id}/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });
            if (res.ok) {
                navigate('/league');
            } else {
                alert("Failed to leave league");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleStartTournament = async () => {
        if (!confirm("Start Tournament? This will generate the bracket.")) return;
        try {
            const res = await fetch(`/api/leagues/${id}/start-tournament`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });
            if (res.ok) {
                alert("Tournament Started!");
                window.location.reload();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to start tournament");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleResetTournament = async () => {
        if (!confirm("RESET TOURNAMENT? This will DELETE all matches and bracket progress! Only do this if it's broken.")) return;

        try {
            const res = await fetch(`/api/leagues/${id}/tournament`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });
            if (res.ok) {
                alert("Tournament Reset!");
                window.location.reload();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to reset tournament");
            }
        } catch (e) {
            console.error(e);
        }
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
                <div className="flex gap-2">
                    {league.adminId === user?.id ? (
                        <button onClick={handleDelete} className="p-2 bg-white rounded-full shadow-sm text-red-500">
                            <Trash2 size={20} />
                        </button>
                    ) : (
                        <button onClick={handleLeave} className="p-2 bg-white rounded-full shadow-sm text-stone-400 hover:text-red-500">
                            <LogOut size={20} />
                        </button>
                    )}
                    <button onClick={handleShare} className="p-2 bg-white rounded-full shadow-sm text-dark">
                        <Share2 size={20} />
                    </button>
                </div>
            </div>

            {/* League Header - Minimalist */}
            <div className="mb-8 px-2">
                <div className="flex items-center gap-3 mb-3">
                    <span className="px-2.5 py-1 bg-stone-200 text-dark text-[10px] font-bold uppercase tracking-widest rounded-md">
                        {league.type === 'STROKE' ? 'Strokeplay' : league.type}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-stone-300"></span>
                    <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                        {new Date(league.startDate).getFullYear()} Season
                    </span>
                </div>

                <h1 className="text-3xl md:text-4xl font-black text-dark tracking-tight mb-4 leading-tight">
                    {league.name}
                </h1>

                <div className="flex items-center gap-6 text-sm text-stone-500 font-medium border-l-2 border-stone-200 pl-4">
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-stone-400" />
                        <span>{new Date(league.startDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Users size={16} className="text-stone-400" />
                        <span>{standings.length} Members</span>
                    </div>
                </div>
            </div>

            {/* Actions */}


            {/* Matchplay View (No Standings, No Tabs) */}
            {league.type === 'MATCH' ? (
                <BracketView
                    leagueId={id}
                    isAdmin={league.adminId === user?.id}
                    onStartTournament={handleStartTournament}
                    onResetTournament={handleResetTournament}
                />
            ) : league.type === 'TEAM' ? (
                <TeamLeagueDashboard
                    league={league}
                    members={standings} // reusing standing state which contains members
                    matches={events} // reusing events state which contains matches/events
                    onStartTournament={() => fetch(`/api/leagues/${id}/start-team-tournament`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id })
                    }).then(res => res.json()).then(data => {
                        if (data.success) {
                            alert("Teams Assigned! Green vs Gold.");
                            window.location.reload();
                        } else {
                            alert(data.error);
                        }
                    })}
                />
            ) : (
                <>
                    {/* Actions */}
                    <div className="mb-8">
                        <button
                            onClick={() => navigate('/play', { state: { leagueId: league.id } })}
                            className="w-full bg-dark text-white py-4 rounded-2xl font-bold shadow-lg shadow-dark/20 flex items-center justify-center gap-2 hover:bg-black transition active:scale-95"
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
                                <div className="font-black text-xl text-dark">
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

                    {/* Season Breakdown */}
                    {events.length > 0 && (
                        <>
                            <h2 className="text-lg font-bold text-dark mb-4 px-2 mt-8">Season Breakdown</h2>
                            <div className="space-y-4">
                                {events.map((event) => (
                                    <div key={event.id} className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
                                        <div className="bg-stone-50 p-4 border-b border-stone-100 flex justify-between items-center">
                                            <h3 className="font-bold text-dark">{event.name}</h3>
                                            <span className="text-xs font-bold text-dark bg-stone-200 px-2 py-1 rounded-lg">
                                                {event.results.length} Players
                                            </span>
                                        </div>
                                        {event.results.map((result, idx) => (
                                            <div key={result.userId} className="flex items-center p-4 border-b border-stone-100 last:border-none">
                                                <div className="w-8 text-center font-bold text-muted text-sm mr-2">
                                                    #{result.rank}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-bold text-dark text-sm">{result.username}</div>
                                                    <div className="text-xs text-muted">{result.rawScore} pts (Best Round)</div>
                                                </div>
                                                <div className="font-bold text-dark">
                                                    +{result.points}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

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
                                    <div className="font-bold text-dark">{round.stableford} <span className="text-xs font-normal text-muted">pts</span></div>
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
                </>
            )}
        </div >
    );
};
