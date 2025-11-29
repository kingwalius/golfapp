import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../lib/store';

export const Welcome = () => {
    const navigate = useNavigate();
    const { login } = useUser();
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) return;

        setLoading(true);
        setError('');
        try {
            await login(username, password, isRegistering);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Image */}
            <div
                className="absolute inset-0 z-0"
                style={{
                    backgroundImage: "url('/social-greens-bg.png')",
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            >
                {/* Overlay for readability */}
                <div className="absolute inset-0 bg-primary/80 backdrop-blur-[2px]"></div>
            </div>

            <div className="relative z-10 w-full max-w-md">
                <div className="mb-12 text-center">
                    <img
                        src="/social-greens-logo.png"
                        alt="Social Greens"
                        className="w-64 mx-auto drop-shadow-lg"
                    />
                    <p className="text-bone-white/90 mt-4 text-lg font-medium tracking-wide">Track your game, challenge friends.</p>
                </div>

                <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-[2rem] shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-2xl text-white text-sm font-medium text-center backdrop-blur-sm">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Username"
                                className="w-full p-4 rounded-2xl bg-white/90 border-0 text-lg font-medium text-primary placeholder-primary/40 focus:ring-4 focus:ring-secondary/50 transition-all shadow-inner"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                className="w-full p-4 rounded-2xl bg-white/90 border-0 text-lg font-medium text-primary placeholder-primary/40 focus:ring-4 focus:ring-secondary/50 transition-all shadow-inner"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!username.trim() || !password.trim() || loading}
                            className="w-full py-4 bg-secondary text-white rounded-2xl font-bold text-xl shadow-lg hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                            {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Log In')}
                        </button>

                        <div className="text-center pt-2">
                            <button
                                type="button"
                                onClick={() => navigate('/reset-password')}
                                className="text-white/80 text-sm font-medium hover:text-white transition-colors hover:underline decoration-white/50 underline-offset-4"
                            >
                                Forgot Password?
                            </button>
                        </div>
                    </form>
                </div>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => {
                            setIsRegistering(!isRegistering);
                            setError('');
                        }}
                        className="text-white/90 text-base font-medium hover:text-white transition-colors bg-white/10 px-6 py-3 rounded-full backdrop-blur-md border border-white/10 hover:bg-white/20"
                    >
                        {isRegistering ? 'Already have an account? Log In' : 'New here? Create Account'}
                    </button>
                </div>
            </div>
        </div>
    );
};
