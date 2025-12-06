import React, { createContext, useContext, useEffect, useState } from 'react';
import { dbPromise } from './db';
import { calculateHandicapIndex, prepareHandicapData } from '../features/scoring/calculations';

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
        // Sort alphabetically by name
        all.sort((a, b) => a.name.localeCompare(b.name));
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
    const isSyncing = React.useRef(false);

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

    // Load user from local storage on mount
    useEffect(() => {
        const storedUser = localStorage.getItem('golf_user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse stored user", e);
            }
        }
    }, []);

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

    const logout = async () => {
        setUser(null);
        localStorage.removeItem('golf_user');
        if (db) {
            try {
                await db.clear('rounds');
                await db.clear('matches');
                console.log("Local database cleared on logout.");
            } catch (e) {
                console.error("Failed to clear local database on logout", e);
            }
        }
    };

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            sync();
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Trigger sync immediately if user and db are ready
        if (user && db) {
            recalculateHandicap(); // Ensure local calculation runs to populate new fields
            if (navigator.onLine) {
                sync();
            }
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [user?.id, db]);

    // Deduplicate Rounds on mount
    useEffect(() => {
        const cleanup = async () => {
            if (!db) return;
            try {
                const tx = db.transaction('rounds', 'readwrite');
                const store = tx.store;
                const allRounds = await store.getAll();

                const unique = new Map();
                const toDelete = [];

                for (const r of allRounds) {
                    // Create a key based on course and fuzzy date (minute precision)
                    const dateStr = new Date(r.date).toISOString().substring(0, 16);
                    const key = `${r.courseId}-${dateStr}-${r.score || 0}`;

                    if (unique.has(key)) {
                        // If we have a duplicate, prefer the one with serverId or synced=true
                        const existing = unique.get(key);
                        if ((r.serverId || r.synced) && !existing.serverId && !existing.synced) {
                            // Replace existing with this one (better quality)
                            toDelete.push(existing.id);
                            unique.set(key, r);
                        } else {
                            toDelete.push(r.id);
                        }
                    } else {
                        unique.set(key, r);
                    }
                }

                if (toDelete.length > 0) {
                    console.log(`Removing ${toDelete.length} duplicate rounds.`);
                    for (const id of toDelete) {
                        await store.delete(id);
                    }
                }
                await tx.done;
            } catch (e) {
                console.error("Deduplication failed", e);
            }
        };

        if (db) cleanup();
    }, [db]);

    const sync = async () => {
        if (isSyncing.current) {
            console.log("Sync skipped: Already in progress.");
            return;
        }

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

        isSyncing.current = true;

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
                unsyncedMatches.forEach(m => {
                    if (!m.player2 || !m.player2.id) {
                        console.warn("Skipping match due to missing player2 ID:", m);
                    }
                });
            }

            if (skippedMatches > 0) {
                console.warn(`Skipping ${skippedMatches} matches due to missing opponent ID (cannot sync to server).`);
            }

            // if (unsyncedRounds.length === 0 && validMatches.length === 0) {
            //     console.log("Nothing to sync.");
            //     return;
            // }

            // --- DOWN-SYNC: Fetch latest activity from server ---
            try {
                const activityRes = await fetch(`/api/user/${user.id}/activity`);
                if (activityRes.ok) {
                    const activityData = await activityRes.json();
                    const tx = db.transaction(['rounds', 'matches'], 'readwrite');

                    // Process Rounds
                    if (activityData.rounds && Array.isArray(activityData.rounds)) {
                        for (const serverRound of activityData.rounds) {
                            // Try to find by serverId first
                            let existing = allRounds.find(r => r.serverId === serverRound.id);

                            if (!existing) {
                                // Fallback: Fuzzy date match (within 1 minute)
                                const serverTime = new Date(serverRound.date).getTime();
                                existing = allRounds.find(r => {
                                    const localTime = new Date(r.date).getTime();
                                    return Math.abs(localTime - serverTime) < 60000 && r.courseId === serverRound.courseId;
                                });
                            }

                            if (!existing) {
                                console.log("Down-syncing round:", serverRound);
                                const { id, ...roundData } = serverRound;
                                await tx.objectStore('rounds').add({
                                    ...roundData,
                                    serverId: id, // Store server ID
                                    synced: true
                                });
                            } else if (!existing.serverId) {
                                // Link local round to server ID if matched by date
                                const updated = { ...existing, serverId: serverRound.id, synced: true };
                                await tx.objectStore('rounds').put(updated);
                            }
                        }
                    }

                    // Process Matches
                    if (activityData.matches && Array.isArray(activityData.matches)) {
                        for (const serverMatch of activityData.matches) {
                            // Try to find by serverId first, then fallback to date/course
                            let existing = allMatches.find(m => m.serverId === serverMatch.id);
                            if (!existing) {
                                const serverTime = new Date(serverMatch.date).getTime();
                                existing = allMatches.find(m => {
                                    const localTime = new Date(m.date).getTime();
                                    return Math.abs(localTime - serverTime) < 60000 && m.courseId === serverMatch.courseId;
                                });
                            }

                            // Destructure to remove ID (let local DB assign it) and get names
                            const { id, p1Name, p2Name, ...matchData } = serverMatch;
                            const matchToSave = {
                                ...matchData,
                                serverId: id, // Store the server ID
                                player1: { id: serverMatch.player1Id, name: p1Name || 'Player 1' },
                                player2: { id: serverMatch.player2Id, name: p2Name || 'Player 2' },
                                synced: true
                            };

                            if (!existing) {
                                console.log("Down-syncing new match:", serverMatch);
                                await tx.objectStore('matches').add(matchToSave);
                            } else if (existing.synced) {
                                // Update existing match ONLY if we don't have local unsynced changes
                                // Preserve local ID
                                await tx.objectStore('matches').put({ ...matchToSave, id: existing.id });
                            } else if (!existing.serverId) {
                                // Link local match to server ID
                                await tx.objectStore('matches').put({ ...existing, serverId: id, synced: true });
                            }
                        }
                    }

                    await tx.done;
                }
            } catch (e) {
                console.error("Down-sync failed", e);
            }

            // --- UP-SYNC (Existing Logic) ---
            if (unsyncedRounds.length === 0 && validMatches.length === 0) {
                console.log("Nothing to up-sync.");
                return;
            }

            console.log(`Up-syncing ${unsyncedRounds.length} rounds and ${validMatches.length} matches...`);

            const payload = {
                userId: user.id,
                rounds: unsyncedRounds.map(r => ({
                    courseId: r.courseId,
                    date: r.date,
                    score: r.totalStrokes || 0,
                    stableford: r.totalStableford || 0,
                    hcpIndex: r.hcpIndex,
                    scores: r.scores || {},
                    leagueId: r.leagueId || null
                })),
                matches: validMatches.map(m => ({
                    player1Id: m.player1?.id || user.id,
                    player2Id: m.player2?.id || null,
                    courseId: m.courseId,
                    date: m.date,
                    winnerId: m.winnerId || null,
                    status: m.status || 'AS',
                    scores: m.scores || {},
                    player1Differential: m.player1Differential,
                    player2Differential: m.player2Differential,
                    countForHandicap: m.countForHandicap
                }))
            };

            console.log("Up-sync Payload:", JSON.stringify(payload, null, 2));

            const res = await fetch('/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const responseData = await res.json();
                console.log("Up-sync completed successfully", responseData);

                // Check for failures
                const matchFailures = responseData.results?.matches?.failed > 0;
                const roundFailures = responseData.results?.rounds?.failed > 0;

                if (matchFailures) console.error("Matches sync errors:", responseData.results.matches.errors);
                if (roundFailures) console.error("Rounds sync errors:", responseData.results.rounds.errors);

                // Mark items as synced in local DB (only if no failures for that type)
                const tx = db.transaction(['rounds', 'matches'], 'readwrite');

                if (!roundFailures) {
                    for (const r of unsyncedRounds) {
                        await tx.objectStore('rounds').put({ ...r, synced: true });
                    }
                }

                if (!matchFailures) {
                    for (const m of validMatches) {
                        await tx.objectStore('matches').put({ ...m, synced: true });
                    }
                }

                await tx.done;
            } else {
                let errorDetails;
                try {
                    errorDetails = await res.json();
                } catch (e) {
                    errorDetails = await res.text();
                }
                console.error("Up-sync failed with status:", res.status, errorDetails);
            }

            // --- Recalculate Handicap (WHI) ---
            await recalculateHandicap();

            // --- Refresh User Profile (Favorites, Friends, etc.) ---
            try {
                const userRes = await fetch(`/api/user/${user.id}`);
                if (userRes.ok) {
                    const latestUser = await userRes.json();
                    // Merge with current user to preserve session state if any
                    const updatedUser = { ...user, ...latestUser };
                    setUser(updatedUser);
                    saveToLocalStorage(updatedUser);
                    console.log("User profile refreshed during sync.");
                }
            } catch (uErr) {
                console.warn("Failed to refresh user profile during sync", uErr);
            }

        } catch (e) {
            console.error("Sync failed", e);
        } finally {
            isSyncing.current = false;
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

    const recalculateHandicap = async () => {
        if (!user || !db) return;

        try {
            const finalRounds = await db.getAll('rounds');
            const finalMatches = await db.getAll('matches');
            const finalCourses = await db.getAll('courses');

            // Use shared logic to prepare data
            const allDifferentials = prepareHandicapData(finalRounds, finalMatches, finalCourses, user.id);

            if (user.handicapMode === 'AUTO' || user.handicapMode === 'auto') {
                const newHandicap = calculateHandicapIndex(allDifferentials, finalCourses);

                // Calculate change
                let handicapChange = 0;
                if (allDifferentials.length > 1) {
                    // Calculate what handicap would be without the latest round
                    // allDifferentials is sorted by date desc, so index 0 is latest
                    const previousDifferentials = allDifferentials.slice(1);
                    const previousHandicap = calculateHandicapIndex(previousDifferentials, finalCourses);
                    handicapChange = newHandicap - previousHandicap;
                }

                // Calculate Average Score (Last 5)
                const scores = allDifferentials.filter(d => d.score > 0).map(d => d.score);
                let avgScore = 0;
                let avgScoreChange = 0;

                if (scores.length > 0) {
                    const currentWindow = scores.slice(0, 5);
                    avgScore = currentWindow.reduce((a, b) => a + b, 0) / currentWindow.length;

                    if (scores.length > 1) {
                        const previousWindow = scores.slice(1, 6);
                        const prevAvg = previousWindow.reduce((a, b) => a + b, 0) / previousWindow.length;
                        avgScoreChange = avgScore - prevAvg;
                    }
                }

                if (newHandicap !== user.handicap || handicapChange !== user.handicapChange || avgScore !== user.avgScore || avgScoreChange !== user.avgScoreChange) {
                    console.log(`Updating Handicap: ${user.handicap} -> ${newHandicap} (Change: ${handicapChange})`);

                    // Update local user
                    const updatedUser = { ...user, handicap: newHandicap, handicapChange, avgScore, avgScoreChange };
                    setUser(updatedUser);
                    saveToLocalStorage(updatedUser);

                    // Update server
                    try {
                        await fetch('/api/user/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: user.id, handicap: newHandicap, handicapChange, avgScore, avgScoreChange })
                        });
                        console.log("Handicap synced to server.");
                    } catch (hcpError) {
                        console.error("Failed to sync handicap to server", hcpError);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to recalculate handicap", e);
        }
    };

    const addFriend = async (friendId) => {
        if (!user) return;

        const currentFriends = user.friends ? (typeof user.friends === 'string' ? JSON.parse(user.friends) : user.friends) : [];
        if (currentFriends.includes(friendId)) return;

        const updatedFriends = [...currentFriends, friendId];
        const updatedUser = { ...user, friends: updatedFriends };

        setUser(updatedUser);
        saveToLocalStorage(updatedUser);

        try {
            await fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, friends: JSON.stringify(updatedFriends) })
            });
        } catch (e) {
            console.error("Failed to sync friends", e);
        }
    };

    const removeFriend = async (friendId) => {
        if (!user) return;

        const currentFriends = user.friends ? (typeof user.friends === 'string' ? JSON.parse(user.friends) : user.friends) : [];
        const updatedFriends = currentFriends.filter(id => id !== friendId);

        const updatedUser = { ...user, friends: updatedFriends };
        setUser(updatedUser);
        saveToLocalStorage(updatedUser);

        try {
            await fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, friends: JSON.stringify(updatedFriends) })
            });
        } catch (e) {
            console.error("Failed to sync friends removal", e);
        }
    };

    const toggleFavoriteCourse = async (courseId) => {
        if (!user) return;

        const currentFavorites = user.favoriteCourses ? (typeof user.favoriteCourses === 'string' ? JSON.parse(user.favoriteCourses) : user.favoriteCourses) : [];
        let updatedFavorites;

        if (currentFavorites.includes(courseId)) {
            updatedFavorites = currentFavorites.filter(id => id !== courseId);
        } else {
            updatedFavorites = [...currentFavorites, courseId];
        }

        const updatedUser = { ...user, favoriteCourses: updatedFavorites };
        setUser(updatedUser);
        saveToLocalStorage(updatedUser);

        try {
            await fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, favoriteCourses: JSON.stringify(updatedFavorites) })
            });
        } catch (e) {
            console.error("Failed to sync favorite courses", e);
        }
    };

    const forceResync = async () => {
        if (!db) return;
        console.log("Force Resync initiated...");
        const tx = db.transaction(['rounds', 'matches'], 'readwrite');

        let cursor = await tx.objectStore('rounds').openCursor();
        while (cursor) {
            const update = { ...cursor.value, synced: false };
            cursor.update(update);
            cursor = await cursor.continue();
        }

        let mCursor = await tx.objectStore('matches').openCursor();
        while (mCursor) {
            const update = { ...mCursor.value, synced: false };
            mCursor.update(update);
            mCursor = await mCursor.continue();
        }

        await tx.done;
        console.log("All items marked unsynced. Triggering sync.");
        await sync();
    };

    return (
        <UserContext.Provider value={{ user, setUser, login, logout, sync, forceResync, updateProfile, isOnline, recalculateHandicap, addFriend, removeFriend, toggleFavoriteCourse }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => useContext(UserContext);
