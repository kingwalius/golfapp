import React, { createContext, useContext, useEffect, useState } from 'react';
import { dbPromise } from './db';

const DBContext = createContext(null);

export const DBProvider = ({ children }) => {
    const [db, setDb] = useState(null);

    useEffect(() => {
        dbPromise.then(setDb);
    }, []);

    if (!db) {
        return <div className="flex items-center justify-center h-screen text-primary">Loading Database...</div>;
    }

    return (
        <DBContext.Provider value={db}>
            {children}
        </DBContext.Provider>
    );
};

export const useDB = () => {
    const context = useContext(DBContext);
    if (!context) {
        throw new Error('useDB must be used within a DBProvider');
    }
    return context;
};

// Example hook to fetch courses
export const useCourses = () => {
    const db = useDB();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        setLoading(true);
        // Try to fetch from server first to get latest
        try {
            const res = await fetch('/courses');
            if (res.ok) {
                const serverCourses = await res.json();
                const tx = db.transaction('courses', 'readwrite');
                for (const course of serverCourses) {
                    await tx.store.put(course);
                }
                await tx.done;
            }
        } catch (e) {
            console.warn("Failed to fetch courses from server", e);
        }

        const all = await db.getAll('courses');
        setCourses(all);
        setLoading(false);
    };

    useEffect(() => {
        if (db) refresh();
    }, [db]);

    return { courses, loading, refresh };
};

// --- User & Sync Context ---
const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const db = useContext(DBContext);

    const saveToLocalStorage = (userData) => {
        try {
            localStorage.setItem('golf_user', JSON.stringify(userData));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.warn("Local storage quota exceeded. Saving user without avatar.");
                const userNoAvatar = { ...userData, avatar: null };
                try {
                    localStorage.setItem('golf_user', JSON.stringify(userNoAvatar));
                } catch (e2) {
                    console.error("Failed to save user to local storage even without avatar", e2);
                }
            } else {
                console.error("Error saving to local storage", e);
            }
        }
    };

    const login = async (username, password, isRegistering = false) => {
        try {
            const endpoint = isRegistering ? '/auth/register' : '/auth/login';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            let data;
            const text = await res.text();
            try {
                data = JSON.parse(text);
            } catch (jsonError) {
                console.error("Failed to parse JSON response:", text);
                throw new Error(`Server error: ${res.status} ${res.statusText} - ${text.substring(0, 100)}`);
            }

            if (!res.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            if (data.id) {
                setUser(data);
                saveToLocalStorage(data);
                return data;
            }
        } catch (e) {
            console.error("Auth failed", e);
            throw e; // Re-throw to handle in UI
        }
        return null;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('golf_user');
    };

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            sync();
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [user, db]);

    const sync = async () => {
        console.log("Sync Called. State:", {
            hasUser: !!user,
            hasDb: !!db,
            isOnline: navigator.onLine,
            userId: user?.id
        });

        if (!user || !db || !navigator.onLine) {
            console.log("Sync aborting: Missing prerequisites.");
            return;
        }

        try {
            const allRounds = await db.getAll('rounds');
            const allMatches = await db.getAll('matches');

            // Filter for unsynced items
            const unsyncedRounds = allRounds.filter(r => !r.synced);
            const unsyncedMatches = allMatches.filter(m => !m.synced);

            // Filter matches that are valid for server (must have player2 ID)
            const validMatches = unsyncedMatches.filter(m => m.player2 && m.player2.id);
            const skippedMatches = unsyncedMatches.length - validMatches.length;

            console.log("Sync Processing:", {
                unsyncedRounds: unsyncedRounds.length,
                unsyncedMatches: unsyncedMatches.length,
                validMatches: validMatches.length
            });

            if (unsyncedMatches.length > 0) {
                console.log("Unsynced Matches Details:", unsyncedMatches);
            }

            if (skippedMatches > 0) {
                console.warn(`Skipping ${skippedMatches} matches due to missing opponent ID (cannot sync to server).`);
            }

            if (unsyncedRounds.length === 0 && validMatches.length === 0) {
                console.log("Nothing to sync.");
                return;
            }

            console.log(`Syncing ${unsyncedRounds.length} rounds and ${validMatches.length} matches...`);

            const res = await fetch('/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    rounds: unsyncedRounds.map(r => ({
                        courseId: r.courseId,
                        date: r.date,
                        score: r.totalStrokes || 0,
                        stableford: r.totalStableford || 0,
                        hcpIndex: r.hcpIndex
                    })),
                    matches: validMatches.map(m => ({
                        player1Id: user.id,
                        player2Id: m.player2.id,
                        courseId: m.courseId,
                        date: m.date,
                        winnerId: null,
                        status: m.status
                    }))
                })
            });

            if (res.ok) {
                console.log("Sync completed successfully");

                // Mark items as synced in local DB
                const tx = db.transaction(['rounds', 'matches'], 'readwrite');

                for (const r of unsyncedRounds) {
                    await tx.objectStore('rounds').put({ ...r, synced: true });
                }

                for (const m of validMatches) {
                    await tx.objectStore('matches').put({ ...m, synced: true });
                }

                await tx.done;
            } else {
                console.error("Sync failed with status:", res.status);
            }
        } catch (e) {
            console.error("Sync failed", e);
        }
    };

    useEffect(() => {
        const initUser = async () => {
            try {
                const saved = localStorage.getItem('golf_user');
                if (saved && saved !== "undefined" && saved !== "null") {
                    const parsed = JSON.parse(saved);
                    setUser(parsed);

                    // Verify with server to get latest data
                    try {
                        const res = await fetch(`/api/user/${parsed.id}`);
                        if (res.ok) {
                            const latest = await res.json();
                            setUser(latest);
                            saveToLocalStorage(latest);
                        }
                    } catch (e) {
                        console.warn("Could not verify user with server (offline?)", e);
                    }
                }
            } catch (err) {
                console.error("Error parsing user from local storage", err);
                localStorage.removeItem('golf_user');
            }
        };
        initUser();
        console.log("Golf App Frontend v1.1 (HTTP Strategy Fix)");
    }, []);

    const updateProfile = async (updates) => {
        let currentUser = user;

        // If no user exists, try to register/login with the provided username or default
        if (!currentUser) {
            const username = updates.username || 'Golfer';
            currentUser = await login(username);
            if (!currentUser) return; // Login failed
        }

        // Prevent overwriting username with empty string
        const safeUpdates = { ...updates };
        if (safeUpdates.username === '') {
            delete safeUpdates.username;
        }

        const updatedUser = { ...currentUser, ...safeUpdates };
        setUser(updatedUser);
        saveToLocalStorage(updatedUser);

        // Sync to backend
        try {
            await fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: updatedUser.id, ...updates })
            });
        } catch (err) {
            console.error("Failed to update profile on server", err);
        }
    };

    return (
        <UserContext.Provider value={{ user, login, logout, sync, updateProfile, isOnline }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => useContext(UserContext);
