import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, CheckCircle, AlertCircle } from 'lucide-react';

export const ResetPassword = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error
    const [message, setMessage] = useState('');

    const handleReset = async (e) => {
        e.preventDefault();
        if (!username || !newPassword) return;

        setStatus('loading');
        try {
            const res = await fetch('/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, newPassword })
            });

            const data = await res.json();

            if (res.ok) {
                setStatus('success');
                setMessage('Password reset successfully! Redirecting to login...');
                setTimeout(() => navigate('/'), 2000);
            } else {
                setStatus('error');
                setMessage(data.error || 'Failed to reset password');
            }
        } catch (err) {
            setStatus('error');
            setMessage('Network error. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
                <button
                    onClick={() => navigate('/')}
                    className="mb-6 text-muted hover:text-dark flex items-center gap-2 transition"
                >
                    <ArrowLeft size={20} />
                    <span>Back to Login</span>
                </button>

                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                        <KeyRound size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-dark">Reset Password</h1>
                    <p className="text-muted mt-2">Enter your username and a new password.</p>
                </div>

                {status === 'success' ? (
                    <div className="bg-green-50 text-green-700 p-4 rounded-xl flex items-center gap-3 mb-6 animate-fade-in">
                        <CheckCircle size={24} />
                        <p className="font-medium">{message}</p>
                    </div>
                ) : (
                    <form onSubmit={handleReset} className="space-y-4">
                        {status === 'error' && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm">
                                <AlertCircle size={16} />
                                {message}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-bold text-muted mb-1 uppercase tracking-wide">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition outline-none font-medium"
                                placeholder="e.g. GeilerPachler"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-muted mb-1 uppercase tracking-wide">New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition outline-none font-medium"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg shadow-primary/30 hover:bg-primaryLight active:scale-[0.98] transition disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                        >
                            {status === 'loading' ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};
