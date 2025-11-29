import React, { createContext, useContext, useEffect, useState } from 'react';
import { dbPromise } from './db';
import { calculateHandicapIndex } from '../features/scoring/calculations';

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
        if (user && db && navigator.onLine) {
            sync();
        }

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
                            // Check if exists locally (by date/course/score match? or just trust server ID if we had one?)
                            // Server rounds don't have the same ID as local rounds necessarily if created elsewhere.
                            // But if we just insert, we might duplicate if we don't have a unique ID strategy.
                            // For now, let's check if we have a round with same date and courseId.
                            // Ideally, we should use a UUID or server ID.
                            // Current schema has auto-inc ID.
                            // Let's just check if we have it by "synced" status? No.
                            // Simple dedup: Check if we have a round with same date and courseId.
                            // Better: The server round has an ID. We can store it? 
                            // Local DB uses auto-inc ID.
                            // We can't easily map server ID to local ID without a new column.
                            // For MVP: Check if a round exists with same date (string match) and courseId.

                            // Normalize dates for comparison
                            const serverDate = new Date(serverRound.date).toISOString();

                            const existing = allRounds.find(r => {
                                const localDate = new Date(r.date).toISOString();
                                return localDate === serverDate && r.courseId === serverRound.courseId;
                            });

                            if (!existing) {
                                console.log("Down-syncing round:", serverRound);
                                // Remove ID to avoid collision
                                const { id, ...roundData } = serverRound;
                                await tx.objectStore('rounds').add({
                                    ...roundData,
                                    synced: true
                                });
                            }
                        }
                    }

                    // Process Matches
                    if (activityData.matches && Array.isArray(activityData.matches)) {
                        for (const serverMatch of activityData.matches) {
                            // Try to find by serverId first, then fallback to date/course
                            let existing = allMatches.find(m => m.serverId === serverMatch.id);
                            if (!existing) {
                                const serverDate = new Date(serverMatch.date).toISOString();
                                existing = allMatches.find(m => {
                                    const localDate = new Date(m.date).toISOString();
                                    return localDate === serverDate && m.courseId === serverMatch.courseId;
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
                                console.log("Updating existing match from server:", serverMatch);
                                // Preserve local ID
                                matchToSave.id = existing.id;
                                await tx.objectStore('matches').put(matchToSave);
                            } else {
                                // Conflict: Local changes exist.
                                // For now, we keep local changes.
                                // Ideally, we should update serverId if it's missing on the local copy
                                if (!existing.serverId) {
                                    existing.serverId = id;
                                    await tx.objectStore('matches').put(existing);
                                }
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
                    scores: r.scores || {}
                })),
                matches: validMatches.map(m => ({
                    player1Id: m.player1?.id || user.id,
                    player2Id: m.player2?.id || null,
                    courseId: m.courseId,
                    date: m.date,
                    winnerId: m.winnerId || null,
                    status: m.status || 'AS',
                    scores: m.scores || {}
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

                if (responseData.results) {
                    if (responseData.results.matches.failed > 0) {
                        console.error("Some matches failed to sync:", responseData.results.matches.errors);
                    }
                    if (responseData.results.rounds.failed > 0) {
                        console.error("Some rounds failed to sync:", responseData.results.rounds.errors);
                    }
                }

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
                let errorDetails;
                try {
                    errorDetails = await res.json();
                } catch (e) {
                    errorDetails = await res.text();
                }
                console.error("Up-sync failed with status:", res.status, errorDetails);
            }

            // --- Recalculate Handicap (WHI) ---
            // Now that we have the latest rounds (local + server), calculate the new index.
            const finalRounds = await db.getAll('rounds');
            const finalMatches = await db.getAll('matches');
            const finalCourses = await db.getAll('courses');

            // Convert eligible matches to "Round-like" objects for calculation
            const matchRounds = finalMatches
                .filter(m => m.player1Differential !== undefined && m.player1Differential !== null && m.player1?.id == user.id)
                .map(m => {
                    // Create a synthetic round object that calculateHandicapIndex can use
                    // It needs: date, score (for differential calc, but we have diff already)
                    // Actually calculateHandicapIndex calculates differential from score.
                    // We should update calculateHandicapIndex to accept pre-calculated differentials OR
                    // we reverse engineer a score? No, that's messy.
                    // Better: Update calculateHandicapIndex to accept objects with a 'differential' property.
                    return {
                        date: m.date,
                        differential: m.player1Differential,
                        courseId: m.courseId
                    };
                });

            // Combine real rounds and match rounds
            // We need to adapt calculateHandicapIndex to handle pre-calculated differentials.
            // We need to adapt calculateHandicapIndex to handle this mixed list.
            // Or we can just map rounds to differentials here and pass a list of differentials?
            // calculateHandicapIndex takes (rounds, courses).
            // Let's modify the input to calculateHandicapIndex or wrap it.

            // Let's prepare a list of objects that have { date, differential }
            const allDifferentials = [
                ...finalRounds
                    .filter(r => r.holesPlayed !== 9) // Exclude 9-hole rounds
                    .map(r => {
                        const c = finalCourses.find(c => c.id === r.courseId);
                        if (!c || !r.score) return null;
                        // Import calculateDifferential if needed or assume it's available
                        // We can't easily import it here if not already.
                        // But wait, calculateHandicapIndex does this internally.
                        // We should probably modify calculateHandicapIndex to be more flexible.
                        // For now, let's just pass the mixed array and update calculateHandicapIndex.
                        return { ...r, type: 'round' };
                    }),
                ...matchRounds
                    .filter(m => m.holesPlayed !== 9) // Exclude 9-hole matches
                    .map(m => ({ ...m, type: 'match' }))
            ].filter(Boolean);

            // We need to update calculateHandicapIndex in calculations.js to handle this mixed list.
            // But first let's pass it.

            if (user.handicapMode === 'AUTO' || user.handicapMode === 'auto') {
                const newHandicap = calculateHandicapIndex(allDifferentials, finalCourses);

                if (newHandicap !== user.handicap) {
                    console.log(`Updating Handicap: ${user.handicap} -> ${newHandicap}`);

                    // Update local user
                    const updatedUser = { ...user, handicap: newHandicap };
                    setUser(updatedUser);
                    saveToLocalStorage(updatedUser);

                    // Update server
                    try {
                        await fetch('/api/user/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: user.id, handicap: newHandicap })
                        });
                        console.log("Handicap synced to server.");
                    } catch (hcpError) {
                        console.error("Failed to sync handicap to server", hcpError);
                    }
                }
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
