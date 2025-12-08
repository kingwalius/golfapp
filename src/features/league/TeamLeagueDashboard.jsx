import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Trophy, Shield, Swords, Play } from 'lucide-react';
import { useUser } from '../../lib/store';
import { TeamCaptainDashboard } from './TeamCaptainDashboard';

export const TeamLeagueDashboard = ({ league, members, onStartTournament }) => {
    const { user } = useUser();
    const navigate = useNavigate();
    const settings = league.settings || {};
    const isAdmin = league.adminId === user?.id;

    // Derived Teams
    const greenTeam = members.filter(m => m.team === 'GREEN');
    const goldTeam = members.filter(m => m.team === 'GOLD');

    const amICaptainGreen = user?.id === settings.captainGreenId;
    const amICaptainGold = user?.id === settings.captainGoldId;
    const isCaptain = amICaptainGreen || amICaptainGold;
    const myTeam = amICaptainGreen ? 'GREEN' : amICaptainGold ? 'GOLD' : null;

    const [leagueMatches, setLeagueMatches] = useState([]);
    const [showCaptainBoard, setShowCaptainBoard] = useState(false);

    // Calculate Score
    let greenScore = 0;
    let goldScore = 0;
    let completedMatches = 0;

    // Fetch matches if Playing
    useEffect(() => {
        if (settings.tournamentStatus === 'PLAYING' || settings.tournamentStatus === 'COMPLETED') {
            fetch(`/api/leagues/${league.id}/matches`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) setLeagueMatches(data);
                })
                .catch(console.error);
        }
    }, [league.id, settings.tournamentStatus]);

    // Calculate live score from matches
    leagueMatches.forEach(m => {
        if (m.winnerId) {
            completedMatches++;
            const winner = members.find(mem => mem.id === m.winnerId);
            if (winner?.team === 'GREEN') greenScore += 1;
            if (winner?.team === 'GOLD') goldScore += 1;
        } else if (m.status === 'TIED') {
            completedMatches++;
            greenScore += 0.5;
            goldScore += 0.5;
        }
    });

    const status = settings.tournamentStatus || 'SETUP';

    const formattedStatus = status === 'SETUP' ? 'Setup Phase'
        : status === 'PAIRING' ? 'Captains Selecting Pairings'
            : status === 'PLAYING' ? 'Matches in Progress'
                : 'Tournament Completed';

    const submittedGreen = settings.lineupGreen;
    const submittedGold = settings.lineupGold;

    const handleSaveLineup = async (lineup) => {
        try {
            const res = await fetch(`/api/leagues/${league.id}/submit-lineup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, team: myTeam, lineup })
            });
            const data = await res.json();
            if (data.success) {
                alert("Lineup Submitted!");
                setShowCaptainBoard(false);
                window.location.reload();
            } else {
                alert(data.error);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to save lineup");
        }
    };

    const handlePlayMatch = (match) => {
        // Find opponent
        const isP1 = match.player1Id === user.id;
        const opponentId = isP1 ? match.player2Id : match.player1Id;
        const opponentName = isP1 ? match.p2Name : match.p1Name; // Ensure API returns names

        navigate('/match-setup', {
            state: {
                opponentId,
                opponentName,
                leagueMatchId: match.id
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* Scoreboard */}
            <div className="bg-dark text-white rounded-3xl p-6 shadow-xl overflow-hidden relative">
                <div className="flex justify-between items-center relative z-10">
                    <div className="text-center w-5/12">
                        <h2 className="text-emerald-400 font-bold text-lg mb-1">{settings.team1Name || 'Green Team'}</h2>
                        <div className="text-5xl font-black">{greenScore}</div>
                    </div>
                    <div className="text-center w-2/12">
                        <div className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">VS</div>
                        <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-xs font-bold whitespace-nowrap">
                            target {settings.formattedWinningScore || '?'}
                        </div>
                    </div>
                    <div className="text-center w-5/12">
                        <h2 className="text-amber-400 font-bold text-lg mb-1">{settings.team2Name || 'Gold Team'}</h2>
                        <div className="text-5xl font-black">{goldScore}</div>
                    </div>
                </div>

                {/* Status Bar */}
                <div className="mt-8 pt-4 border-t border-white/10 flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 text-white/70">
                        <Swords size={16} />
                        <span className="font-bold">{formattedStatus}</span>
                    </div>
                    {status === 'SETUP' && isAdmin ? (
                        <button
                            onClick={onStartTournament}
                            className="bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition transform hover:scale-105"
                        >
                            Start Draft
                        </button>
                    ) : (
                        <div className="text-xs text-white/40">
                            {leagueMatches.length > 0 ? `${leagueMatches.length} Matches` : 'Waiting for Pairings'}
                        </div>
                    )}
                </div>

                {/* Progress Bar */}
                {status === 'PLAYING' && (
                    <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-1000" style={{ width: `${(greenScore / (greenScore + goldScore || 1)) * 100}%` }}></div>
                )}
            </div>

            {/* Captains Area */}
            {status === 'PAIRING' && isCaptain && (
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 shadow-lg text-white">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Shield className="text-indigo-200" size={24} />
                            <div>
                                <h3 className="font-bold text-lg">Captain's Duty</h3>
                                <p className="text-indigo-100 text-sm">
                                    {(myTeam === 'GREEN' && submittedGreen) || (myTeam === 'GOLD' && submittedGold)
                                        ? "Lineup Submitted. Waiting for opponent..."
                                        : "Set your lineup for the matches."}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowCaptainBoard(true)}
                            className="bg-white text-indigo-600 px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-indigo-50 transition"
                        >
                            Manage Lineup
                        </button>
                    </div>
                </div>
            )}

            {showCaptainBoard && (
                <TeamCaptainDashboard
                    leagueId={league.id}
                    team={myTeam}
                    members={myTeam === 'GREEN' ? greenTeam : goldTeam}
                    onSave={handleSaveLineup}
                    onClose={() => setShowCaptainBoard(false)}
                />
            )}

            {/* Matches List (If Playing) */}
            {status === 'PLAYING' && (
                <div className="space-y-3">
                    <h3 className="font-bold text-dark px-2">Matches</h3>
                    {leagueMatches.length === 0 && (
                        <div className="p-8 text-center text-muted bg-white rounded-2xl border border-stone-100">
                            Loading matches...
                        </div>
                    )}
                    {leagueMatches.map(match => {
                        const isMyMatch = match.player1Id === user.id || match.player2Id === user.id;
                        const p1 = members.find(m => m.id === match.player1Id);
                        const p2 = members.find(m => m.id === match.player2Id);

                        return (
                            <div key={match.id} className="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="text-right flex-1 font-bold text-sm truncate text-emerald-700">
                                        {match.p1Name || p1?.username || 'Player 1'}
                                    </div>
                                    <div className="font-black text-muted text-xs">VS</div>
                                    <div className="text-left flex-1 font-bold text-sm truncate text-amber-700">
                                        {match.p2Name || p2?.username || 'Player 2'}
                                    </div>
                                </div>

                                <div className="ml-4 w-24 flex justify-end">
                                    {match.winnerId ? (
                                        <div className={`text-xs font-bold px-2 py-1 rounded-lg ${members.find(m => m.id === match.winnerId)?.team === 'GREEN'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : members.find(m => m.id === match.winnerId)?.team === 'GOLD'
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-gray-100 text-gray-500'
                                            }`}>
                                            {match.winnerId === match.player1Id ? 'Green Won' : 'Gold Won'}
                                        </div>
                                    ) : isMyMatch ? (
                                        <button
                                            onClick={() => handlePlayMatch({ ...match, p1Name: p1?.username, p2Name: p2?.username })}
                                            className="p-2 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition active:scale-95"
                                        >
                                            <Play size={16} fill="currentColor" />
                                        </button>
                                    ) : (
                                        <div className="text-xs font-bold text-muted bg-stone-100 px-2 py-1 rounded-lg">
                                            In Play
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Teams Lists (Only show when NOT playing, or push to bottom) */}
            {status !== 'PLAYING' && (
                <div className="grid grid-cols-2 gap-4 mt-8">
                    {/* Green Team */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-emerald-500">
                        <div className="flex items-center gap-2 mb-4 text-emerald-700 font-bold uppercase text-xs tracking-wider">
                            <Users size={14} />
                            <span>Green Team</span>
                        </div>
                        <div className="space-y-2">
                            {greenTeam.map(m => (
                                <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50">
                                    <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-xs overflow-hidden">
                                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.username[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-dark text-sm truncate">{m.username}</div>
                                        <div className="text-xs text-muted">HCP {m.handicap}</div>
                                    </div>
                                    {m.id === settings.captainGreenId && (
                                        <Shield size={14} className="text-emerald-500" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Gold Team */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-amber-500">
                        <div className="flex items-center gap-2 mb-4 text-amber-700 font-bold uppercase text-xs tracking-wider">
                            <Users size={14} />
                            <span>Gold Team</span>
                        </div>
                        <div className="space-y-2">
                            {goldTeam.map(m => (
                                <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50">
                                    <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-bold text-xs overflow-hidden">
                                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.username[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-dark text-sm truncate">{m.username}</div>
                                        <div className="text-xs text-muted">HCP {m.handicap}</div>
                                    </div>
                                    {m.id === settings.captainGoldId && (
                                        <Shield size={14} className="text-amber-500" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
