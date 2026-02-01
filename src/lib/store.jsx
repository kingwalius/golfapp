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

// Helper for authenticated requests
const authFetch = async (url, options = {}) => {
    let token = null;
    try {
        const storedUser = localStorage.getItem('golf_user');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            if (user && user.token) token = user.token;
        }
    } catch (e) { console.error("Error reading token for request", e); }

    const headers = { ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(url, { ...options, headers });
};

export const useCourses = () => {
    const db = useDB();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        setLoading(true);
        if (!db) return;

        try {
            const res = await authFetch('/courses');
            if (res.ok) {
                const serverCourses = await res.json();
                const tx = db.transaction('courses', 'readwrite');
                const store = tx.store;
                const localCourses = await store.getAll();

                for (const sCourse of serverCourses) {
                    // Try to find matching local course by Server ID or Name
                    let existing = localCourses.find(c => c.serverId === sCourse.id);

                    if (!existing) {
                        existing = localCourses.find(c => c.name.trim().toLowerCase() === sCourse.name.trim().toLowerCase());
                    }

                    if (existing) {
                        // Update existing local course with Server ID and latest data
                        // Preserve local ID to avoid breaking FKs
                        await store.put({
                            ...sCourse,
                            id: existing.id, // KEEP LOCAL ID
                            serverId: sCourse.id,
                            synced: true,
                            holes: JSON.parse(sCourse.holes || '[]') // Ensure parsing
                        });
                    } else {
                        // Insert new course from server
                        await store.put({
                            ...sCourse,
                            id: undefined, // Let DB assign new local ID
                            serverId: sCourse.id,
                            synced: true,
                            holes: JSON.parse(sCourse.holes || '[]')
                        });
                    }
                }
                await tx.done;
            }
        } catch (e) {
            console.warn("Failed to fetch courses from server", e);
        }

        const all = await db.getAll('courses');

        // Deduplicate Display (Cleanup duplicates if they slipped in)
        // This is a safety net: unique by Name
        const uniqueMap = new Map();
        const duplicates = [];

        for (const c of all) {
            const key = c.name.trim().toLowerCase();
            if (uniqueMap.has(key)) {
                // Keep the one with serverId, or the first one
                const existing = uniqueMap.get(key);
                if (c.serverId && !existing.serverId) {
                    duplicates.push(existing.id); // Remove the unsynced one
                    uniqueMap.set(key, c);
                } else {
                    duplicates.push(c.id);
                }
            } else {
                uniqueMap.set(key, c);
            }
        }

        // We can't safely delete duplicates here without rebinding rounds/matches
        // So for now, we just SHOW unique ones.
        // Actually, let's just filter list state. Safest.

        const uniqueList = Array.from(uniqueMap.values());
        uniqueList.sort((a, b) => a.name.localeCompare(b.name));
        setCourses(uniqueList);
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

        // Skip sync if user has no token (Guest or unauthenticated)
        if (!user.token) {
            console.log("Sync skipped: User has no token.");
            return;
        }

        isSyncing.current = true;

        try {
            // --- PHASE 0: Sync Courses (Fix FK Errors) ---
            const allCourses = await db.getAll('courses');
            const unsyncedCourses = allCourses.filter(c => !c.synced && !c.serverId);
            const courseIdMap = new Map(); // Map localId -> serverId

            // Build map from existing synced courses
            allCourses.forEach(c => {
                if (c.serverId) courseIdMap.set(c.id, c.serverId);
            });

            if (unsyncedCourses.length > 0) {
                console.log(`Syncing ${unsyncedCourses.length} custom courses...`);

                for (const course of unsyncedCourses) {
                    try {
                        // Check if we already have a serverId mapped
                        if (course.serverId) {
                            courseIdMap.set(course.id, course.serverId);
                            continue;
                        }

                        // Check if we found a duplicate locally that HAS a serverId (merge strategy)
                        // This handles cases where user has "Course A" (synced) and "Course A" (unsynced)
                        const duplicateSynced = allCourses.find(c =>
                            c.id !== course.id &&
                            c.serverId &&
                            c.name.trim().toLowerCase() === course.name.trim().toLowerCase()
                        );

                        if (duplicateSynced) {
                            console.log(`Merging duplicate course "${course.name}" (${course.id}) into ${duplicateSynced.id}`);
                            const tx = db.transaction('courses', 'readwrite');
                            // Mark local as synced but technically it should be deleted/aliased?
                            // For safety, we upgrade it to point to the serverID of the duplicate.
                            await tx.store.put({ ...course, serverId: duplicateSynced.serverId, synced: true });
                            await tx.done;
                            courseIdMap.set(course.id, duplicateSynced.serverId);
                            continue;
                        }

                        console.log("Uploading course:", course.name);
                        const res = await authFetch('/courses', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: course.name,
                                holes: typeof course.holes === 'string' ? JSON.parse(course.holes) : course.holes,
                                rating: course.rating,
                                slope: course.slope,
                                par: course.par
                            })
                        });

                        if (res.ok) {
                            const data = await res.json();
                            const serverId = parseInt(data.id);

                            // Open a NEW transaction for the write operation
                            const tx = db.transaction('courses', 'readwrite');
                            const updated = { ...course, serverId: serverId, synced: true };
                            await tx.store.put(updated);
                            await tx.done;

                            // Add to map
                            courseIdMap.set(course.id, serverId);
                            console.log(`Course ${course.id} synced. Mapped to Server ID ${serverId}`);
                        } else {
                            console.error("Failed to upload course:", course.name);
                        }
                    } catch (e) {
                        console.error("Error syncing course:", course, e);
                    }
                }
            }

            const allRounds = await db.getAll('rounds');
            const allMatches = await db.getAll('matches');

            // Filter for unsynced items
            const unsyncedRounds = allRounds.filter(r => !r.synced);
            const unsyncedMatches = allMatches.filter(m => !m.synced);

            // Filter matches that are valid for server
            const validMatches = unsyncedMatches.filter(m => m.player2 && m.player2.id);
            const skippedMatches = unsyncedMatches.length - validMatches.length;

            if (skippedMatches > 0) {
                console.warn(`Skipping ${skippedMatches} matches due to missing opponent ID.`);
            }

            // Filter Unsynced Skins Games
            const allSkinsGames = await db.getAll('skins_games');
            const unsyncedSkins = allSkinsGames.filter(g => !g.synced && g.status === 'COMPLETED');

            // --- DOWN-SYNC: Fetch latest activity from server ---
            try {
                const activityRes = await authFetch(`/api/user/${user.id}/activity`);
                if (activityRes.ok) {
                    const activityData = await activityRes.json();
                    const tx = db.transaction(['rounds', 'matches', 'skins_games'], 'readwrite');

                    // Process Rounds
                    if (activityData.rounds && Array.isArray(activityData.rounds)) {
                        for (const serverRound of activityData.rounds) {
                            let existing = allRounds.find(r => r.serverId === serverRound.id);

                            if (!existing) {
                                const serverTime = new Date(serverRound.date).getTime();
                                existing = allRounds.find(r => {
                                    const localTime = new Date(r.date).getTime();
                                    return Math.abs(localTime - serverTime) < 60000 && r.courseId === serverRound.courseId;
                                });
                            }

                            if (!existing) {
                                const { id, ...roundData } = serverRound;
                                await tx.objectStore('rounds').add({
                                    ...roundData,
                                    serverId: id,
                                    synced: true
                                });
                            } else if (!existing.serverId) {
                                const updated = { ...existing, serverId: serverRound.id, synced: true };
                                await tx.objectStore('rounds').put(updated);
                            }
                        }
                    }

                    // Process Matches
                    if (activityData.matches && Array.isArray(activityData.matches)) {
                        for (const serverMatch of activityData.matches) {
                            let existing = allMatches.find(m => m.serverId === serverMatch.id);
                            if (!existing) {
                                const serverTime = new Date(serverMatch.date).getTime();
                                existing = allMatches.find(m => {
                                    const localTime = new Date(m.date).getTime();
                                    return Math.abs(localTime - serverTime) < 60000 && m.courseId === serverMatch.courseId;
                                });
                            }

                            const { id, p1Name, p2Name, ...matchData } = serverMatch;
                            const matchToSave = {
                                ...matchData,
                                serverId: id,
                                player1: { id: serverMatch.player1Id, name: p1Name || 'Player 1' },
                                player2: { id: serverMatch.player2Id, name: p2Name || 'Player 2' },
                                synced: true
                            };

                            if (!existing) {
                                await tx.objectStore('matches').add(matchToSave);
                            } else if (existing.synced) {
                                await tx.objectStore('matches').put({ ...matchToSave, id: existing.id });
                            } else if (!existing.serverId) {
                                await tx.objectStore('matches').put({ ...existing, serverId: id, synced: true });
                            }
                        }
                    }

                    // Process Skins Games
                    if (activityData.skinsGames && Array.isArray(activityData.skinsGames)) {
                        for (const serverGame of activityData.skinsGames) {
                            // Check for existing by Server ID, or fuzzy date/course match
                            // Ideally skins_games has serverId
                            let existing = allSkinsGames.find(g => g.serverId === serverGame.id);

                            if (!existing) {
                                const serverTime = new Date(serverGame.date).getTime();
                                existing = allSkinsGames.find(g => {
                                    const localTime = new Date(g.date).getTime();
                                    return Math.abs(localTime - serverTime) < 60000 && g.courseId === serverGame.courseId;
                                });
                            }

                            const { id, ...gameData } = serverGame;
                            // Ensure date is consistent

                            if (!existing) {
                                await tx.objectStore('skins_games').add({
                                    ...gameData,
                                    serverId: id,
                                    synced: true
                                });
                            } else if (!existing.serverId) {
                                await tx.objectStore('skins_games').put({ ...existing, serverId: id, synced: true });
                            }
                        }
                    }

                    await tx.done;
                }
            } catch (e) {
                console.error("Down-sync failed", e);
            }

            // --- UP-SYNC (Existing Logic with ID Mapping) ---
            if (unsyncedRounds.length === 0 && validMatches.length === 0 && unsyncedSkins.length === 0) {
                console.log("Nothing to up-sync.");
                return;
            }

            console.log(`Up-syncing ${unsyncedRounds.length} rounds, ${validMatches.length} matches, and ${unsyncedSkins.length} skins games...`);

            const payload = {
                userId: user.id,
                rounds: unsyncedRounds.map(r => ({
                    courseId: courseIdMap.get(r.courseId) || r.courseId,
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
                    courseId: courseIdMap.get(m.courseId) || m.courseId,
                    date: m.date,
                    winnerId: m.winnerId || null,
                    status: m.status || 'AS',
                    scores: m.scores || {},
                    player1Differential: m.player1Differential,
                    player2Differential: m.player2Differential,
                    countForHandicap: m.countForHandicap,
                    leagueMatchId: m.leagueMatchId || null
                })),
                skinsGames: unsyncedSkins.map(g => ({
                    courseId: courseIdMap.get(g.courseId) || g.courseId,
                    date: g.date,
                    skinValue: g.skinValue,
                    status: g.status,
                    players: g.players,
                    scores: g.scores,
                    holesPlayed: g.holesPlayed,
                    startingHole: g.startingHole
                }))
            };

            const res = await authFetch('/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const responseData = await res.json();
                console.log("Up-sync completed successfully", responseData);

                const matchFailures = responseData.results?.matches?.failed > 0;
                const roundFailures = responseData.results?.rounds?.failed > 0;
                const skinsFailures = responseData.results?.skinsGames?.failed > 0;

                if (matchFailures) console.error("Matches sync errors:", responseData.results.matches.errors);
                if (roundFailures) console.error("Rounds sync errors:", responseData.results.rounds.errors);
                if (skinsFailures) console.error("Skins sync errors:", responseData.results.skinsGames.errors);

                const tx = db.transaction(['rounds', 'matches', 'skins_games'], 'readwrite');

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

                if (!skinsFailures) {
                    for (const g of unsyncedSkins) {
                        await tx.objectStore('skins_games').put({ ...g, synced: true });
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

            await recalculateHandicap();

            try {
                const userRes = await authFetch(`/api/user/${user.id}`);
                if (userRes.ok) {
                    const latestUser = await userRes.json();
                    const updatedUser = { ...user, ...latestUser };
                    setUser(updatedUser);
                    saveToLocalStorage(updatedUser);
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

                    // Verify with server to get latest data (require token)
                    if (parsed.token) {
                        try {
                            const res = await authFetch(`/api/user/${parsed.id}`);
                            if (res.ok) {
                                const latest = await res.json();
                                setUser(latest);
                                saveToLocalStorage(latest);
                            }
                        } catch (e) {
                            console.warn("Could not verify user with server (offline?)", e);
                        }
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
            await authFetch('/api/user/update', {
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
                        await authFetch('/api/user/update', {
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
            await authFetch('/api/user/update', {
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
            await authFetch('/api/user/update', {
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
            await authFetch('/api/user/update', {
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

        let sCursor = await tx.objectStore('skins_games').openCursor();
        while (sCursor) {
            const update = { ...sCursor.value, synced: false };
            sCursor.update(update);
            sCursor = await sCursor.continue();
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
