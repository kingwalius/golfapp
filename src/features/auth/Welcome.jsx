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
        <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[#F5F5F0]">
            {/* Background Image */}
            <div
                className="absolute inset-0 z-0 opacity-15"
                style={{
                    backgroundImage: "url('/social-greens-bg.png')",
                    backgroundSize: '400px', // Smaller pattern size for the sketches
                    backgroundRepeat: 'repeat',
                    backgroundPosition: 'center',
                }}
            ></div>

            <div className="relative z-10 w-full max-w-md">
                <div className="mb-12 text-center">
                    <img
                        src="/social-greens-logo-transparent.png"
                        alt="Social Greens"
                        className="w-72 mx-auto"
                    />
                    <p className="text-dark/80 mt-2 text-lg font-medium tracking-wide">Track your game, challenge friends.</p>
                </div>

                <div className="p-4">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium text-center">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Username"
                                className="w-full p-4 rounded-2xl bg-white border-2 border-stone-200 text-lg font-medium text-dark placeholder-stone-400 focus:ring-0 focus:border-dark transition-all shadow-sm"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                className="w-full p-4 rounded-2xl bg-white border-2 border-stone-200 text-lg font-medium text-dark placeholder-stone-400 focus:ring-0 focus:border-dark transition-all shadow-sm"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!username.trim() || !password.trim() || loading}
                            className="w-full py-4 bg-dark text-white rounded-2xl font-bold text-xl shadow-lg hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Log In')}
                        </button>

                        <div className="text-center pt-2">
                            <button
                                type="button"
                                onClick={() => navigate('/reset-password')}
                                className="text-stone-500 text-sm font-medium hover:text-dark transition-colors"
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
                        className="text-dark font-bold text-base hover:underline decoration-2 underline-offset-4"
                    >
                        {isRegistering ? 'Already have an account? Log In' : 'New here? Create Account'}
                    </button>
                </div>
            </div>
        </div>
    );
};
