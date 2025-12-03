import React, { useState, useEffect } from 'react';
import { Search, X, Check, User } from 'lucide-react';

export const FriendSearchModal = ({ isOpen, onClose, onAddFriend, friends = [] }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [allUsers, setAllUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch users when modal opens
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setIsLoading(true);
            fetch('/users')
                .then(res => res.json())
                .then(users => {
                    if (Array.isArray(users)) {
                        setAllUsers(users);
                    }
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error("Failed to fetch users", err);
                    setIsLoading(false);
                });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Filter users:
    // 1. Match search query
    // 2. Exclude users already in friends list
    // 3. Exclude self (handled by parent passing friends list usually, but good to check id if available)
    const filteredUsers = allUsers.filter(u =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !friends.includes(u.id.toString())
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="p-3 border-b border-stone-100 flex justify-between items-center bg-white z-10">
                    <h2 className="text-xl font-bold text-dark">Find Friends</h2>
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
                            placeholder="Search by username..."
                            className="input-field pl-12 bg-white"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* User List */}
                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                    {isLoading ? (
                        <div className="text-center py-8 text-muted">Loading users...</div>
                    ) : (
                        <div className="space-y-2">
                            {filteredUsers.map(u => (
                                <div
                                    key={u.id}
                                    className="flex justify-between items-center p-3 rounded-xl border border-stone-100 bg-white hover:border-primary/30 hover:shadow-soft transition group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 border border-stone-100">
                                            {u.avatar ? (
                                                <img src={u.avatar} alt={u.username} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <User size={20} />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-dark leading-tight">{u.username}</h3>
                                            <div className="text-sm text-muted">HCP: {u.handicap}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            onAddFriend(u);
                                            onClose();
                                        }}
                                        className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition"
                                    >
                                        <Check size={20} />
                                    </button>
                                </div>
                            ))}

                            {filteredUsers.length === 0 && !isLoading && (
                                <div className="text-center py-12 text-muted">
                                    <p>No new users found matching "{searchQuery}"</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
