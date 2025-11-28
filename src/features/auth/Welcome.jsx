import React, { useState } from 'react';
import { useUser } from '../../lib/store';

export const Welcome = () => {
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
        <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] border-[60px] border-white rounded-full opacity-20"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] border-[40px] border-white rounded-full opacity-20"></div>
            </div>

            <div className="relative z-10 w-full max-w-md bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-3xl shadow-2xl text-center">
                <div className="mb-8">
                    <div className="w-20 h-20 bg-white rounded-2xl mx-auto flex items-center justify-center text-4xl shadow-lg mb-4">
                        ⛳
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Golf App</h1>
                    <p className="text-white/80">Track your game, challenge friends.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-white text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div>
                        <input
                            type="text"
                            placeholder="Username"
                            className="w-full p-4 rounded-xl bg-white/90 border-0 text-lg font-medium text-dark placeholder-gray-400 focus:ring-4 focus:ring-white/30 transition-all"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            className="w-full p-4 rounded-xl bg-white/90 border-0 text-lg font-medium text-dark placeholder-gray-400 focus:ring-4 focus:ring-white/30 transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!username.trim() || !password.trim() || loading}
                        className="w-full py-4 bg-secondary text-white rounded-xl font-bold text-lg shadow-lg hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Log In')}
                    </button>
                    <div className="text-center pt-2">
                        <button
                            onClick={() => { /* TODO: Implement forgot password logic or navigation */ }}
                            className="text-white/70 text-sm font-medium hover:text-white transition-colors"
                        >
                            Forgot Password?
                        </button>
                    </div>
                </form>

                <div className="mt-6">
                    <button
                        onClick={() => {
                            setIsRegistering(!isRegistering);
                            setError('');
                        }}
                        className="text-white/70 text-sm font-medium hover:text-white transition-colors"
                    >
                        {isRegistering ? 'Already have an account? Log In' : 'New here? Create Account'}
                    </button>
                </div>
            </div>
        </div>
    );
};
