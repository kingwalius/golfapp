import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../lib/store';
import { Trophy, Swords, RefreshCw } from 'lucide-react';

export const BracketView = ({ leagueId, isAdmin, onStartTournament, onResetTournament }) => {
    const { user } = useUser();
    const navigate = useNavigate();
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMatches = async () => {
            try {
                // We need a new endpoint or just filter matches?
                // Actually, we can fetch league details again or a specific endpoint.
                // Let's assume we add a GET /api/leagues/:id/matches endpoint or similar.
                // For now, let's use the existing standings endpoint if it returns matches? No.
                // Let's create a specific fetch.
                const res = await fetch(`/api/leagues/${leagueId}/matches`);
                if (res.ok) {
                    setMatches(await res.json());
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchMatches();
    }, [leagueId]);

    if (loading) return <div className="p-8 text-center text-muted">Loading Bracket...</div>;

    if (matches.length === 0) {
        return (
            <div className="p-8 text-center bg-white rounded-3xl border border-stone-100">
                <Trophy size={48} className="mx-auto text-stone-200 mb-4" />
                <h3 className="text-lg font-bold text-dark mb-2">Tournament Not Started</h3>
                {isAdmin ? (
                    <button
                        onClick={onStartTournament}
                        className="bg-emerald-600 text-white py-3 px-6 rounded-xl font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition mx-auto mt-4"
                    >
                        <Swords size={20} />
                        Start Tournament
                    </button>
                ) : (
                    <p className="text-muted">Waiting for admin to start the tournament.</p>
                )}
            </div>
        );
    }

    // Group by Round
    const rounds = {};
    matches.forEach(m => {
        if (!rounds[m.roundNumber]) rounds[m.roundNumber] = [];
        rounds[m.roundNumber].push(m);
    });

    const roundNumbers = Object.keys(rounds).sort((a, b) => a - b);

    return (
        <>
            <div className="overflow-x-auto pb-8">
                <div className="flex gap-8 min-w-max px-4">
                    {roundNumbers.map(roundNum => (
                        <div key={roundNum} className="w-72 flex flex-col justify-around gap-4">
                            <h3 className="text-center font-bold text-muted uppercase tracking-wider mb-2">
                                Round {roundNum}
                            </h3>
                            {rounds[roundNum].sort((a, b) => a.matchNumber - b.matchNumber).map(match => (
                                <MatchCard key={match.id} match={match} currentUserId={user?.id} navigate={navigate} isAdmin={isAdmin} />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Reset Tournament Action (Admin Only, Panic Button) */}
            {isAdmin && (
                <div className="mt-8 flex justify-end px-4">
                    <button
                        onClick={onResetTournament}
                        className="text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-1 hover:bg-red-100 transition"
                    >
                        <RefreshCw size={12} />
                        Reset Bracket
                    </button>
                </div>
            )}
        </>
    );
};

const MatchCard = ({ match, currentUserId, navigate, isAdmin }) => {
    const isParticipant = match.player1Id === currentUserId || match.player2Id === currentUserId;
    const isWinner = match.winnerId === currentUserId;

    return (
        <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden relative ${isParticipant ? 'border-primary' : 'border-stone-100'}`}>
            {/* Player 1 */}
            <div className={`p-3 flex justify-between items-center ${match.winnerId === match.player1Id ? 'bg-emerald-50' : ''}`}>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-500">
                        {match.p1Name ? match.p1Name[0] : '?'}
                    </div>
                    <span className={`font-bold text-sm ${match.winnerId === match.player1Id ? 'text-emerald-600' : 'text-dark'}`}>
                        {match.p1Name || 'Bye'}
                    </span>
                </div>
                {match.winnerId === match.player1Id && <Trophy size={14} className="text-emerald-500" />}
            </div>

            <div className="h-px bg-stone-100 mx-2" />

            {/* Player 2 */}
            <div className={`p-3 flex justify-between items-center ${match.winnerId === match.player2Id ? 'bg-emerald-50' : ''}`}>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-500">
                        {match.p2Name ? match.p2Name[0] : '?'}
                    </div>
                    <span className={`font-bold text-sm ${match.winnerId === match.player2Id ? 'text-emerald-600' : 'text-dark'}`}>
                        {match.p2Name || 'Bye'}
                    </span>
                </div>
                {match.winnerId === match.player2Id && <Trophy size={14} className="text-emerald-500" />}
            </div>

            {/* Status / Action */}
            {!match.winnerId && match.player1Id && match.player2Id && (
                <div className="bg-stone-50 p-2 text-center border-t border-stone-100 flex gap-2">
                    {isParticipant ? (
                        <button
                            onClick={() => navigate('/matchplay', {
                                state: {
                                    opponentId: match.player1Id === currentUserId ? match.player2Id : match.player1Id,
                                    opponentName: match.player1Id === currentUserId ? match.p2Name : match.p1Name,
                                    leagueMatchId: match.id
                                }
                            })}
                            className="bg-primary text-white text-xs font-bold uppercase tracking-wide flex-1 py-2 rounded-lg"
                        >
                            Play Match
                        </button>
                    ) : (
                        <span className="text-xs font-bold text-muted uppercase tracking-wide flex-1 self-center">
                            Pending
                        </span>
                    )}

                    {/* Admin Override */}
                    {isAdmin && (
                        <div className="flex gap-1">
                            <button
                                onClick={async () => {
                                    if (!confirm(`Force advance ${match.p1Name} as winner?`)) return;
                                    try {
                                        const res = await fetch(`/api/leagues/${match.leagueId}/advance-match`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ userId: currentUserId, leagueMatchId: match.id, winnerId: match.player1Id })
                                        });
                                        if (res.ok) {
                                            alert("Winner advanced!");
                                            window.location.reload();
                                        } else {
                                            alert("Failed to advance winner");
                                        }
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wide px-2 py-2 rounded-lg hover:bg-emerald-200"
                            >
                                Win: {match.p1Name}
                            </button>
                            <button
                                onClick={async () => {
                                    if (!confirm(`Force advance ${match.p2Name} as winner?`)) return;
                                    try {
                                        const res = await fetch(`/api/leagues/${match.leagueId}/advance-match`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ userId: currentUserId, leagueMatchId: match.id, winnerId: match.player2Id })
                                        });
                                        if (res.ok) {
                                            alert("Winner advanced!");
                                            window.location.reload();
                                        } else {
                                            alert("Failed to advance winner");
                                        }
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wide px-2 py-2 rounded-lg hover:bg-emerald-200"
                            >
                                Win: {match.p2Name}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
