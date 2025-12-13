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
        if (settings.tournamentStatus === 'PLAYING' || settings.tournamentStatus === 'COMPLETED' || settings.tournamentStatus === 'PLAYING_SD') {
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
                : status === 'SUDDEN_DEATH' ? 'Sudden Death: Captains Picking'
                    : status === 'PLAYING_SD' ? 'Sudden Death Match!'
                        : 'Tournament Completed';

    const submittedGreen = settings.lineupGreen;
    const submittedGold = settings.lineupGold;
    const sdGreen = settings.suddenDeathGreen;
    const sdGold = settings.suddenDeathGold;

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

    const handleSuddenDeathPick = async (playerId) => {
        try {
            await fetch(`/api/leagues/${league.id}/submit-sudden-death`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, team: myTeam, playerId })
            });
            window.location.reload();
        } catch (e) { console.error(e); }
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
            {/* Scoreboard - Modern Light Theme */}
            <div className="bg-white rounded-3xl p-8 shadow-floating border border-stone-100 relative overflow-hidden">
                <div className="flex justify-between items-center relative z-10">
                    <div className="text-center flex-1">
                        <h2 className="text-emerald-600 font-bold text-sm tracking-widest uppercase mb-2">{settings.team1Name || 'Green'}</h2>
                        <div className="text-6xl font-black text-emerald-600 leading-none">{greenScore}</div>
                    </div>

                    <div className="text-center w-24 pt-2">
                        <div className="text-xs font-bold text-muted uppercase tracking-widest mb-1">VS</div>
                        <div className="text-xs font-medium text-stone-400 bg-stone-100 px-2 py-1 rounded-lg inline-block">
                            Target {settings.formattedWinningScore || '?'}
                        </div>
                    </div>

                    <div className="text-center flex-1">
                        <h2 className="text-amber-500 font-bold text-sm tracking-widest uppercase mb-2">{settings.team2Name || 'Gold'}</h2>
                        <div className="text-6xl font-black text-amber-500 leading-none">{goldScore}</div>
                    </div>
                </div>

                {/* Status Bar */}
                <div className="mt-8 pt-6 border-t border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="flex items-center gap-2 text-stone-500 text-sm font-medium">
                        <div className={`w-2 h-2 rounded-full ${status === 'PLAYING' ? 'bg-green-500 animate-pulse' : 'bg-stone-300'}`}></div>
                        <span>{formattedStatus}</span>
                    </div>

                    <div className="flex gap-2">
                        {status === 'SETUP' && isAdmin ? (
                            <button
                                onClick={onStartTournament}
                                className="bg-dark text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-black transition transform active:scale-95"
                            >
                                Generate Matches
                            </button>
                        ) : status === 'PLAYING' && isAdmin && leagueMatches.length > 0 && completedMatches === leagueMatches.length && greenScore === goldScore ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={async () => {
                                        if (!window.confirm("Start Sudden Death Tie-Breaker? Captains will pick 1 player each.")) return;
                                        await fetch(`/api/leagues/${league.id}/start-sudden-death`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ userId: user.id })
                                        });
                                        window.location.reload();
                                    }}
                                    className="bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md"
                                >
                                    Start Sudden Death
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!window.confirm("End as Draw?")) return;
                                        await fetch(`/api/leagues/${league.id}/complete-tournament`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ userId: user.id, winner: 'DRAW' })
                                        });
                                        window.location.reload();
                                    }}
                                    className="bg-stone-100 text-stone-500 px-4 py-2 rounded-xl font-bold text-sm hover:bg-stone-200"
                                >
                                    Draw
                                </button>
                            </div>
                        ) : status.includes('PLAYING') && isAdmin && completedMatches === leagueMatches.length ? (
                            <button
                                onClick={async () => {
                                    const winner = greenScore > goldScore ? 'GREEN' : greenScore < goldScore ? 'GOLD' : 'DRAW';
                                    if (!window.confirm(`Finalize Tournament? Winner: ${winner}`)) return;
                                    await fetch(`/api/leagues/${league.id}/complete-tournament`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: user.id, winner })
                                    });
                                    window.location.reload();
                                }}
                                className="bg-dark text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-black transition"
                            >
                                Finalize & End
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Progress Bar Background */}
                {(status === 'PLAYING' || status === 'PLAYING_SD') && (
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-stone-100">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-1000"
                            style={{ width: `${(greenScore / (greenScore + goldScore || 1)) * 100}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Captains Area */}
            {status === 'PAIRING' && isCaptain && (
                <div className="bg-white rounded-3xl p-6 shadow-md border border-stone-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
                                <Shield size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-dark">Captain's Duty</h3>
                                <p className="text-muted text-sm">
                                    {(myTeam === 'GREEN' && submittedGreen) || (myTeam === 'GOLD' && submittedGold)
                                        ? "Lineup Submitted. Waiting for opponent..."
                                        : "Set your lineup for the matches."}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowCaptainBoard(true)}
                            className="w-full md:w-auto bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-blue-600 transition"
                        >
                            Manage Lineup
                        </button>
                    </div>
                </div>
            )}

            {/* Sudden Death Area */}
            {status === 'SUDDEN_DEATH' && isCaptain && (
                <div className="bg-white rounded-3xl p-6 shadow-md border border-stone-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
                    <h3 className="font-bold text-lg text-dark mb-4 flex items-center gap-2">
                        <Swords className="text-red-500" size={20} />
                        Sudden Death Selection
                    </h3>

                    {(myTeam === 'GREEN' && sdGreen) || (myTeam === 'GOLD' && sdGold) ? (
                        <div className="p-4 bg-stone-50 rounded-xl text-center font-bold text-muted">
                            Locked In. Waiting for opponent...
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {(myTeam === 'GREEN' ? greenTeam : goldTeam).map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => {
                                        if (confirm(`Pick ${m.username} for Sudden Death?`)) handleSuddenDeathPick(m.id);
                                    }}
                                    className="p-3 bg-stone-50 hover:bg-stone-100 rounded-xl text-left flex items-center gap-3 transition border border-stone-100"
                                >
                                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 font-bold overflow-hidden">
                                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.username[0]}
                                    </div>
                                    <span className="font-bold text-dark">{m.username}</span>
                                </button>
                            ))}
                        </div>
                    )}
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
            {(status === 'PLAYING' || status === 'PLAYING_SD') && (
                <div className="space-y-4">
                    <h3 className="font-bold text-dark px-2 text-lg">Current Matches</h3>
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
                                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                    {/* P1 */}
                                    <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                                        <span className={`font-bold text-sm truncate ${match.winnerId === match.player1Id ? 'text-dark' : 'text-stone-600'}`}>
                                            {match.p1Name || p1?.username || 'P1'}
                                        </span>
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex flex-shrink-0 items-center justify-center font-bold text-xs ring-2 ring-white">
                                            {p1?.username?.[0] || '1'}
                                        </div>
                                    </div>

                                    <div className="font-black text-stone-300 text-xs px-1">VS</div>

                                    {/* P2 */}
                                    <div className="flex items-center gap-2 flex-1 justify-start min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex flex-shrink-0 items-center justify-center font-bold text-xs ring-2 ring-white">
                                            {p2?.username?.[0] || '2'}
                                        </div>
                                        <span className={`font-bold text-sm truncate ${match.winnerId === match.player2Id ? 'text-dark' : 'text-stone-600'}`}>
                                            {match.p2Name || p2?.username || 'P2'}
                                        </span>
                                    </div>
                                </div>

                                <div className="ml-4 flex-shrink-0">
                                    {match.winnerId ? (
                                        <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${members.find(m => m.id === match.winnerId)?.team === 'GREEN'
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
                                            className="w-10 h-10 bg-dark text-white rounded-xl shadow-lg hover:bg-black flex items-center justify-center transition active:scale-95"
                                        >
                                            <Play size={18} fill="currentColor" />
                                        </button>
                                    ) : (
                                        <div className="w-10 h-10 border border-stone-200 rounded-xl flex items-center justify-center">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Teams Lists (Only show when NOT playing, or always show for reference?) */}
            {/* Let's show always but change layout depending on status. Actually user said separate looks "weird". */}
            {/* Stacking the lists vertically looks cleaner on mobile */}

            {status !== 'PLAYING' && (
                <div className="grid grid-cols-2 gap-4 mt-8 px-1">
                    {/* Green Team Column */}
                    <div>
                        <div className="flex items-center justify-center gap-2 mb-3 text-emerald-600">
                            <h3 className="font-bold text-xs uppercase tracking-widest">Green Team</h3>
                            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{greenTeam.length}</span>
                        </div>
                        <div className="space-y-2">
                            {greenTeam.map(m => (
                                <div key={m.id} className="bg-white p-2.5 rounded-xl border border-stone-100 shadow-sm flex items-center gap-2.5 relative overflow-hidden group">
                                    {m.id === settings.captainGreenId && (
                                        <div className="absolute top-0 right-0 w-8 h-8 -mr-4 -mt-4 bg-emerald-500 rotate-45 transform"></div>
                                    )}

                                    <div className="w-9 h-9 flex-shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs overflow-hidden border border-white shadow-inner">
                                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.username[0]}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-dark text-xs truncate leading-tight">{m.username}</div>
                                        <div className="text-[10px] text-muted font-medium">HCP {m.handicap}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Gold Team Column */}
                    <div>
                        <div className="flex items-center justify-center gap-2 mb-3 text-amber-600">
                            <h3 className="font-bold text-xs uppercase tracking-widest">Gold Team</h3>
                            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{goldTeam.length}</span>
                        </div>
                        <div className="space-y-2">
                            {goldTeam.map(m => (
                                <div key={m.id} className="bg-white p-2.5 rounded-xl border border-stone-100 shadow-sm flex items-center gap-2.5 relative overflow-hidden group">
                                    {m.id === settings.captainGoldId && (
                                        <div className="absolute top-0 right-0 w-8 h-8 -mr-4 -mt-4 bg-amber-500 rotate-45 transform"></div>
                                    )}

                                    <div className="w-9 h-9 flex-shrink-0 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs overflow-hidden border border-white shadow-inner">
                                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : m.username[0]}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-dark text-xs truncate leading-tight">{m.username}</div>
                                        <div className="text-[10px] text-muted font-medium">HCP {m.handicap}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
