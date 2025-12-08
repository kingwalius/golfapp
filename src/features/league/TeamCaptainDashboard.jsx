import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Save, Shield } from 'lucide-react';
import { useUser } from '../../lib/store';

export const TeamCaptainDashboard = ({ leagueId, team, members, onSave, onClose }) => {
    // team is 'GREEN' or 'GOLD'
    // members is list of team members

    // Sort initially by ID or keeping existing order if passed?
    // For now, let's just initialize with the list passed
    const [lineup, setLineup] = useState(members);

    const moveUp = (index) => {
        if (index === 0) return;
        const newLineup = [...lineup];
        [newLineup[index - 1], newLineup[index]] = [newLineup[index], newLineup[index - 1]];
        setLineup(newLineup);
    };

    const moveDown = (index) => {
        if (index === lineup.length - 1) return;
        const newLineup = [...lineup];
        [newLineup[index + 1], newLineup[index]] = [newLineup[index], newLineup[index + 1]];
        setLineup(newLineup);
    };

    const handleSave = () => {
        onSave(lineup.map(m => m.id));
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-fade-in-up">
                <div className={`p-6 ${team === 'GREEN' ? 'bg-emerald-600' : 'bg-amber-500'} text-white`}>
                    <div className="flex items-center gap-3 mb-2">
                        <Shield size={24} />
                        <h2 className="text-xl font-bold">Set Lineup</h2>
                    </div>
                    <p className="opacity-80 text-sm">
                        Order your players for the matches. The ranking determines the pairings (Rank 1 vs Rank 1).
                    </p>
                </div>

                <div className="p-4 max-h-[60vh] overflow-y-auto bg-stone-50">
                    <div className="space-y-2">
                        {lineup.map((member, index) => (
                            <div key={member.id} className="bg-white p-3 rounded-xl shadow-sm border border-stone-200 flex items-center gap-3">
                                <div className="font-bold text-lg text-stone-300 w-6 text-center">
                                    {index + 1}
                                </div>
                                <div className="flex-1 font-bold text-dark">
                                    {member.username}
                                    <span className="text-muted font-normal text-xs ml-2">(HCP {member.handicap})</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => moveUp(index)}
                                        disabled={index === 0}
                                        className="p-1 hover:bg-stone-100 rounded disabled:opacity-20 text-stone-500"
                                    >
                                        <ChevronUp size={20} />
                                    </button>
                                    <button
                                        onClick={() => moveDown(index)}
                                        disabled={index === lineup.length - 1}
                                        className="p-1 hover:bg-stone-100 rounded disabled:opacity-20 text-stone-500"
                                    >
                                        <ChevronDown size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 bg-white border-t border-stone-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 font-bold text-muted hover:bg-stone-100 rounded-xl transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className={`flex-1 py-3 font-bold text-white rounded-xl shadow-lg transition transform active:scale-95 ${team === 'GREEN' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-500 hover:bg-amber-400'}`}
                    >
                        Save Strategy
                    </button>
                </div>
            </div>
        </div>
    );
};
