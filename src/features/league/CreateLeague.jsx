import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../lib/store';
import { ArrowLeft, Trophy, Calendar, Users } from 'lucide-react';

export const CreateLeague = () => {
    const navigate = useNavigate();
    const { user } = useUser();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        type: 'STROKE', // Default to Strokeplay
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        settings: {}
    });

    const handleSubmit = async () => {
        if (!formData.name) return;
        setLoading(true);

        try {
            const res = await fetch('/api/leagues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    adminId: user.id
                })
            });

            if (res.ok) {
                const data = await res.json();
                navigate(`/league/${data.id}`);
            } else {
                console.error("Failed to create league");
            }
        } catch (error) {
            console.error("Error creating league", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 pb-24 min-h-screen bg-stone-50">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-full shadow-sm">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-primary">Create League</h1>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
                {/* Step 1: Basic Info */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wider">League Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Sunday Drivers 2024"
                            className="w-full bg-stone-50 p-4 rounded-xl text-lg font-bold text-dark outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wider">Format</label>
                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={() => setFormData({ ...formData, type: 'STROKE' })}
                                className={`p-4 rounded-xl border-2 text-left transition ${formData.type === 'STROKE' ? 'border-primary bg-primary/5' : 'border-stone-100 bg-stone-50'}`}
                            >
                                <div className="flex items-center gap-3 mb-1">
                                    <Trophy size={20} className={formData.type === 'STROKE' ? 'text-primary' : 'text-muted'} />
                                    <span className={`font-bold ${formData.type === 'STROKE' ? 'text-primary' : 'text-dark'}`}>Strokeplay League</span>
                                </div>
                                <p className="text-xs text-muted">Weekly rounds, points based on best score. F1 style ranking.</p>
                            </button>

                            <button
                                onClick={() => setFormData({ ...formData, type: 'MATCH' })}
                                className={`p-4 rounded-xl border-2 text-left transition ${formData.type === 'MATCH' ? 'border-primary bg-primary/5' : 'border-stone-100 bg-stone-50'}`}
                            >
                                <div className="flex items-center gap-3 mb-1">
                                    <Users size={20} className={formData.type === 'MATCH' ? 'text-primary' : 'text-muted'} />
                                    <span className={`font-bold ${formData.type === 'MATCH' ? 'text-primary' : 'text-dark'}`}>Matchplay Tournament</span>
                                </div>
                                <p className="text-xs text-muted">Bracket style knockout tournament. Sudden death.</p>
                            </button>

                            <button
                                onClick={() => setFormData({
                                    ...formData,
                                    type: 'TEAM',
                                    settings: { ...formData.settings, tournamentStatus: 'SETUP' }
                                })}
                                className={`p-4 rounded-xl border-2 text-left transition ${formData.type === 'TEAM' ? 'border-primary bg-primary/5' : 'border-stone-100 bg-stone-50'}`}
                            >
                                <div className="flex items-center gap-3 mb-1">
                                    <Users size={20} className={formData.type === 'TEAM' ? 'text-primary' : 'text-muted'} />
                                    <span className={`font-bold ${formData.type === 'TEAM' ? 'text-primary' : 'text-dark'}`}>Team Cup (Ryder Style)</span>
                                </div>
                                <p className="text-xs text-muted">Two teams (Green vs Gold). Head-to-head matchups.</p>
                            </button>

                        </div>
                    </div>
                </div>

                {formData.type === 'STROKE' && (
                    <div>
                        <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wider">Round Frequency</label>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setFormData({ ...formData, roundFrequency: 'WEEKLY' })}
                                className={`flex-1 p-4 rounded-xl border-2 text-center transition ${formData.roundFrequency !== 'MONTHLY' ? 'border-primary bg-primary/5 text-primary font-bold' : 'border-stone-100 bg-stone-50 text-muted'}`}
                            >
                                Weekly
                            </button>
                            <button
                                onClick={() => setFormData({ ...formData, roundFrequency: 'MONTHLY' })}
                                className={`flex-1 p-4 rounded-xl border-2 text-center transition ${formData.roundFrequency === 'MONTHLY' ? 'border-primary bg-primary/5 text-primary font-bold' : 'border-stone-100 bg-stone-50 text-muted'}`}
                            >
                                Monthly
                            </button>
                        </div>
                        <p className="text-xs text-muted mt-2">
                            {formData.roundFrequency === 'MONTHLY'
                                ? "Points are awarded based on the best round played each month."
                                : "Points are awarded based on the best round played each week (Mon-Sun)."}
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wider">Start Date</label>
                        <input
                            type="date"
                            value={formData.startDate}
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                            className="w-full bg-stone-50 p-3 rounded-xl font-medium text-dark outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wider">End Date (Opt)</label>
                        <input
                            type="date"
                            value={formData.endDate}
                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                            className="w-full bg-stone-50 p-3 rounded-xl font-medium text-dark outline-none"
                        />
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={loading || !formData.name}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:scale-[1.02] transition disabled:opacity-50 disabled:hover:scale-100"
                >
                    {loading ? 'Creating...' : 'Create League'}
                </button>
            </div>
        </div>

    );
};
