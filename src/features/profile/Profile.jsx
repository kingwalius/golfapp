import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useUser } from '../../lib/store';

export default function Profile() {
    const { user, updateProfile, logout, forceResync } = useUser();
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
            manualHandicap: handicapMode === 'MANUAL' ? parseFloat(manualHandicap.toString().replace(',', '.')) : null
        });
        setIsSaving(false);
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-stone-50 pb-safe p-6">
            {/* Minimal Header with Back Action */}
            <div className="flex justify-between items-center mb-8">
                <button onClick={() => navigate(-1)} className="text-stone-400 hover:text-dark transition">
                    Back
                </button>
                <div className="flex gap-4">
                    <button
                        onClick={forceResync}
                        className="flex items-center gap-2 text-stone-400 font-bold text-xs uppercase tracking-widest hover:text-primary transition"
                    >
                        <RefreshCw size={14} />
                        Sync
                    </button>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-widest hover:text-red-600 transition"
                    >
                        Log out
                    </button>
                </div>
            </div>

            <div className="flex flex-col items-center mb-10">
                <h1 className="text-4xl font-black text-dark mb-8 tracking-tight">Edit Profile</h1>

                <div className="relative group cursor-pointer mb-6" onClick={() => fileInputRef.current.click()}>
                    <div className="w-32 h-32 rounded-3xl border-2 border-stone-200 shadow-xl overflow-hidden bg-white flex items-center justify-center transform transition group-hover:scale-105">
                        {avatar ? (
                            <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-4xl text-stone-300">USER</span>
                        )}
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-dark text-white p-2 rounded-xl shadow-md border-2 border-white">
                        <span className="text-xs font-bold px-2">Edit</span>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                </div>

                <div className="w-full max-w-xs">
                    <label className="block text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-2 text-center">Display Name</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-dark text-center font-bold text-lg shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                        placeholder="Enter your name"
                    />
                </div>
            </div>

            <div className="space-y-6">
                {/* Handicap Settings Card */}
                <div className="card bg-white/90 backdrop-blur-md">
                    <h2 className="text-xl font-bold text-dark mb-4 flex items-center gap-2">
                        Handicap Settings
                    </h2>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                            <span className="font-medium text-dark">Calculation Mode</span>
                            <div className="flex bg-stone-200 rounded-lg p-1">
                                <button
                                    onClick={() => setHandicapMode('AUTO')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${handicapMode === 'AUTO'
                                        ? 'bg-white text-dark shadow-sm'
                                        : 'text-muted hover:text-dark'
                                        }`}
                                >
                                    Auto (WHS)
                                </button>
                                <button
                                    onClick={() => setHandicapMode('MANUAL')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${handicapMode === 'MANUAL'
                                        ? 'bg-white text-dark shadow-sm'
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
                                    className="input-field text-lg font-semibold text-dark"
                                    placeholder="e.g. 18.5"
                                />
                                <p className="text-xs text-muted mt-2">
                                    This value will override your calculated WHS index for all games.
                                </p>
                            </div>
                        )}

                        {handicapMode === 'AUTO' && (
                            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 animate-fade-in">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-medium text-dark">Current WHS Index</span>
                                    <span className="text-2xl font-bold text-dark">{user?.handicap?.toFixed(1)}</span>
                                </div>
                                <p className="text-xs text-muted">
                                    Calculated based on your best 8 of last 20 rounds.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                {/* Save Action */}
                {/* Action Buttons */}
                {/* Save Action - Static at bottom of form to avoid nav overlap issues */}
                <div className="p-6 mt-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full bg-dark text-white font-bold text-lg py-4 rounded-2xl shadow-lg hover:bg-black hover:shadow-xl active:scale-95 transition-all disabled:opacity-70 disabled:scale-100"
                    >
                        {isSaving ? 'Saving Changes...' : 'Save Changes'}
                    </button>
                </div>

                {/* Troubleshooting Area - Minimal */}
                <div className="pt-8 pb-32 text-center">
                    <button
                        onClick={async () => {
                            if (confirm('Force Resync?')) {
                                await forceResync();
                                alert('Done');
                            }
                        }}
                        className="text-amber-500 text-xs font-bold uppercase tracking-widest hover:underline mb-4 block mx-auto"
                    >
                        Troubleshoot: Force Sync
                    </button>

                    <p className="text-[10px] text-stone-300 font-mono">
                        User ID: {user?.id} • v1.2.0
                    </p>
                </div>
            </div>
        </div>
    );
}
