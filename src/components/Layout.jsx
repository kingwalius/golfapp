import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Home, Flag, PlayCircle, Trophy } from 'lucide-react';
import { useUser } from '../lib/store';
import { Welcome } from '../features/auth/Welcome';

const NavItem = ({ to, label, icon: Icon, activeIcon: ActiveIcon }) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    const CurrentIcon = isActive ? (ActiveIcon || Icon) : Icon;

    return (
        <Link to={to} className="group relative flex flex-col items-center justify-center w-full h-full">
            <div className={clsx(
                "absolute top-2 w-12 h-1 rounded-full transition-all duration-300",
                isActive ? "bg-primary" : "bg-transparent"
            )} />

            <span className={clsx(
                "transition-transform duration-300",
                isActive ? "scale-110 -translate-y-1 text-primary" : "text-muted group-hover:scale-105"
            )}>
                <CurrentIcon size={24} strokeWidth={isActive ? 2.5 : 2} />
            </span>

            <span className={clsx(
                "text-[10px] font-medium tracking-wide transition-all duration-300",
                isActive ? "text-primary opacity-100 translate-y-0" : "text-muted opacity-70 translate-y-1"
            )}>
                {label}
            </span>
        </Link>
    );
};

export const Layout = () => {
    const { user } = useUser();
    const location = useLocation();

    // If no user is logged in, show the Welcome/Registration screen
    if (!user) {
        return <Welcome />;
    }

    return (
        <div className="flex flex-col min-h-[100dvh] bg-stone-50">
            <div className="flex-1">
                <Outlet />
            </div>
            <nav className="sticky bottom-0 left-0 right-0 w-full bg-surface/90 backdrop-blur-lg border-t border-stone-100 flex justify-around items-center z-50 shadow-floating pb-safe pt-2">
                <NavItem to="/" label="Home" icon={Home} />
                <NavItem to="/courses" label="Courses" icon={Flag} />
                <NavItem to="/play" label="Play" icon={PlayCircle} />
                <NavItem to="/league" label="League" icon={Trophy} />
            </nav>
        </div>
    );
};
