import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Home, Flag, PlayCircle, Trophy, Loader, CheckCircle, WifiOff } from 'lucide-react';
import { useUser } from '../lib/store';
import { Welcome } from '../features/auth/Welcome';

const NavItem = ({ to, label, icon: Icon, activeIcon: ActiveIcon }) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    const CurrentIcon = isActive ? (ActiveIcon || Icon) : Icon;

    return (
        <Link to={to} className="group relative flex flex-col items-center justify-center w-full h-full">
            <span className={clsx(
                "transition-transform duration-300",
                isActive ? "scale-110 -translate-y-1 text-dark" : "text-muted group-hover:scale-105"
            )}>
                <CurrentIcon size={24} strokeWidth={isActive ? 2.5 : 2} />
            </span>

            <span className={clsx(
                "text-[10px] font-medium tracking-wide transition-all duration-300",
                isActive ? "text-dark opacity-100 translate-y-0" : "text-muted opacity-70 translate-y-1"
            )}>
                {label}
            </span>
        </Link>
    );
};

export const Layout = () => {
    const { user, sync } = useUser();
    const location = useLocation();
    const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | success
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Auto-sync when app regains visibility (if > 5 minutes since last sync)
    useEffect(() => {
        if (!user?.token) return;

        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                const lastSync = localStorage.getItem('golf_lastSync');
                const now = Date.now();
                const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

                if (!lastSync || now - parseInt(lastSync) > SYNC_INTERVAL) {
                    console.log('👁️ App regained focus, auto-syncing...');
                    setSyncStatus('syncing');
                    try {
                        await sync();
                        localStorage.setItem('golf_lastSync', now.toString());
                        // Dispatch event to notify UI components
                        window.dispatchEvent(new CustomEvent('golf-sync-complete'));
                        setSyncStatus('success');
                        setTimeout(() => setSyncStatus('idle'), 2000);
                        console.log('✅ Visibility sync complete');
                    } catch (e) {
                        console.warn("Visibility sync failed:", e);
                        setSyncStatus('idle');
                    }
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user, sync]);

    // Online/offline detection
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // If no user is logged in, show the Welcome/Registration screen
    if (!user) {
        return <Welcome />;
    }

    return (
        <div className="flex flex-col min-h-[100dvh] bg-stone-50">
            {/* Offline Indicator */}
            {!isOnline && (
                <div className="bg-orange-500 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
                    <WifiOff size={16} />
                    You're offline. Changes will sync when reconnected.
                </div>
            )}

            {/* Sync Status Indicator */}
            {syncStatus === 'syncing' && (
                <div className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg animate-slide-in-right">
                    <Loader className="animate-spin" size={16} />
                    Syncing...
                </div>
            )}

            {syncStatus === 'success' && (
                <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg animate-fade-out">
                    <CheckCircle size={16} />
                    Synced
                </div>
            )}

            <div className="flex-1">
                <Outlet />
            </div>
            <nav className="sticky bottom-0 left-0 right-0 w-full bg-surface/90 backdrop-blur-lg border-t border-stone-100 flex justify-around items-center z-50 shadow-floating pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
                <NavItem to="/" label="Home" icon={Home} />
                <NavItem to="/courses" label="Courses" icon={Flag} />
                <NavItem to="/play" label="Play" icon={PlayCircle} />
                <NavItem to="/league" label="League" icon={Trophy} />
            </nav>
        </div>
    );
};
