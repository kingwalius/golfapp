import React, { useState, useEffect } from 'react';
import { Search, X, Check, User } from 'lucide-react';

export const PlayerSelectionModal = ({ isOpen, onClose, onSelect, players, selectedPlayerId }) => {
    const [searchQuery, setSearchQuery] = useState('');

    // Reset search when modal opens
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredPlayers = players.filter(p =>
        p.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="p-3 border-b border-stone-100 flex justify-between items-center bg-white z-10">
                    <h2 className="text-xl font-bold text-dark">Select Opponent</h2>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-dark transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-stone-100 bg-stone-50/50">
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
                            <Search size={20} />
                        </span>
                        <input
                            type="text"
                            placeholder="Search players..."
                            className="input-field pl-12 bg-white"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Player List */}
                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                    <div className="space-y-2">
                        {filteredPlayers.map(p => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    onSelect(p);
                                    onClose();
                                }}
                                className={`
                                    w-full text-left relative p-3 rounded-xl border-2 transition-all duration-200 group
                                    ${selectedPlayerId === p.id
                                        ? 'border-secondary bg-secondary/5 shadow-md'
                                        : 'border-stone-100 bg-white hover:border-secondary/30 hover:shadow-soft'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${selectedPlayerId === p.id ? 'bg-secondary/10 border-secondary/20 text-secondary' : 'bg-stone-50 border-stone-100 text-stone-400'}`}>
                                            {p.avatar ? (
                                                <img src={p.avatar} alt={p.username} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <User size={20} />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className={`font-bold text-lg leading-tight ${selectedPlayerId === p.id ? 'text-secondary' : 'text-dark'}`}>
                                                {p.username}
                                            </h3>
                                            <div className="text-sm text-muted">
                                                HCP: {p.handicap}
                                            </div>
                                        </div>
                                    </div>
                                    {selectedPlayerId === p.id && (
                                        <div className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center text-sm">
                                            <Check size={16} />
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}

                        {filteredPlayers.length === 0 && (
                            <div className="text-center py-12 text-muted">
                                <p>No players found matching "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
