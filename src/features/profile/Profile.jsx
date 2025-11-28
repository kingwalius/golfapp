import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../lib/store';

export default function Profile() {
    const { user, updateProfile, logout } = useUser();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [avatar, setAvatar] = useState(user?.avatar || null);
    const [username, setUsername] = useState(user?.username || '');
    const [handicapMode, setHandicapMode] = useState(user?.handicapMode || 'AUTO');
    const [manualHandicap, setManualHandicap] = useState(user?.manualHandicap || '');
    const [isSaving, setIsSaving] = useState(false);

    // Sync local state when user context loads/updates
    useEffect(() => {
        if (user) {
            setAvatar(user.avatar || null);
            setUsername(user.username || '');
            setHandicapMode((user.handicapMode || 'AUTO').toUpperCase());
            setManualHandicap(user.manualHandicap || '');
        }
    }, [user]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 500;
                    const MAX_HEIGHT = 500;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress to JPEG with 0.7 quality
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    setAvatar(dataUrl);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        await updateProfile({
            username,
            avatar,
            handicapMode,
            manualHandicap: handicapMode === 'MANUAL' ? parseFloat(manualHandicap) : null
        });
        setIsSaving(false);
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-stone-50 pb-safe">
            <div className="bg-primary pt-12 pb-24 px-6 rounded-b-[2.5rem] shadow-floating relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                    <div className="absolute top-[-50%] left-[-20%] w-[140%] h-[140%] border-[40px] border-white rounded-full opacity-20"></div>
                </div>

                <div className="relative z-10 flex flex-col items-center">
                    <h1 className="text-3xl font-bold text-white mb-8">My Profile</h1>

                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current.click()}>
                        <div className="w-32 h-32 rounded-full border-4 border-white/20 shadow-floating overflow-hidden bg-white/10 backdrop-blur-sm flex items-center justify-center">
                            {avatar ? (
                                <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-4xl">👤</span>
                            )}
                        </div>
                        <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-white text-sm font-medium">Change</span>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </div>
                    <div className="mt-4 w-full max-w-xs">
                        <label className="block text-white/80 text-sm font-medium mb-1 text-center">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2 text-white text-center font-bold placeholder-white/50 focus:outline-none focus:bg-white/20 transition"
                        />
                    </div>
                </div>
            </div>

            <div className="px-6 -mt-12 relative z-20 space-y-6">
                {/* Handicap Settings Card */}
                <div className="card bg-white/90 backdrop-blur-md">
                    <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
                        <span>⛳</span> Handicap Settings
                    </h2>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                            <span className="font-medium text-dark">Calculation Mode</span>
                            <div className="flex bg-stone-200 rounded-lg p-1">
                                <button
                                    onClick={() => setHandicapMode('AUTO')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${handicapMode === 'AUTO'
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-muted hover:text-dark'
                                        }`}
                                >
                                    Auto (WHS)
                                </button>
                                <button
                                    onClick={() => setHandicapMode('MANUAL')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${handicapMode === 'MANUAL'
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-muted hover:text-dark'
                                        }`}
                                >
                                    Manual
                                </button>
                            </div>
                        </div>

                        {handicapMode === 'MANUAL' && (
                            <div className="animate-fade-in">
                                <label className="block text-sm font-medium text-muted mb-1.5">Manual Handicap Index</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={manualHandicap}
                                    onChange={(e) => setManualHandicap(e.target.value)}
                                    className="input-field text-lg font-semibold text-primary"
                                    placeholder="e.g. 18.5"
                                />
                                <p className="text-xs text-muted mt-2">
                                    This value will override your calculated WHS index for all games.
                                </p>
                            </div>
                        )}

                        {handicapMode === 'AUTO' && (
                            <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 animate-fade-in">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-medium text-primary">Current WHS Index</span>
                                    <span className="text-2xl font-bold text-primary">{user?.handicap?.toFixed(1)}</span>
                                </div>
                                <p className="text-xs text-primary/70">
                                    Calculated based on your best 8 of last 20 rounds.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 pt-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                        {isSaving ? 'Saving...' : 'Save Profile'}
                    </button>

                    <button
                        onClick={() => navigate('/')}
                        className="btn-secondary bg-stone-200 text-dark hover:bg-stone-300 w-full"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={() => {
                            if (confirm('This will clear all local data and log you out. Are you sure?')) {
                                logout();
                                navigate('/');
                            }
                        }}
                        className="w-full py-3 rounded-xl font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-colors mt-2"
                    >
                        Clear Data & Log Out
                    </button>
                </div>
            </div>
        </div>
    );
}
