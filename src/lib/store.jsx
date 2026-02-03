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
                        // SAFETY CHECK: If local course is NOT synced, do NOT overwrite it!
                        if (!existing.synced) {
                            console.log(`Skipping refresh for course "${existing.name}" (ID ${existing.id}) - pending local changes.`);
                            continue;
                        }

                        // Update existing local course with Server ID and latest data
                        // Preserve local ID to avoid breaking FKs
                        await store.put({
                            ...sCourse,
                            id: existing.id, // KEEP LOCAL ID
                            serverId: sCourse.id,
                            synced: true,
                            holes: JSON.parse(sCourse.holes || '[]'),
                            tees: typeof sCourse.tees === 'string' ? JSON.parse(sCourse.tees) : (sCourse.tees || [])
                        });
                    } else {
                        // Insert new course from server
                        await store.put({
                            ...sCourse,
                            id: undefined, // Let DB assign new local ID
                            serverId: sCourse.id,
                            synced: true,
                            holes: JSON.parse(sCourse.holes || '[]'),
                            tees: typeof sCourse.tees === 'string' ? JSON.parse(sCourse.tees) : (sCourse.tees || [])
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

    // Auto-sync when tab regains visibility (user switches back to app)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && user && db && navigator.onLine) {
                console.log("📱 App regained focus - triggering sync");
                sync();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user?.id, db]);

    // Periodic background sync (every 3 minutes while app is active)
    useEffect(() => {
        if (!user || !db) return;

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                console.log("⏰ Periodic sync triggered");
                sync();
            }
        }, 3 * 60 * 1000); // Every 3 minutes

        return () => clearInterval(interval);
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
        // Atomic check-and-set to prevent race condition
        if (isSyncing.current) {
            console.log("Sync skipped: Already in progress.");
            return;
        }
        isSyncing.current = true;

        console.log("🔄 Nuclear Sync Started");

        if (!user || !db || !navigator.onLine) {
            console.log("Sync aborting: Missing prerequisites.");
            isSyncing.current = false;
            return;
        }

        if (!user.token) {
            console.log("Sync skipped: User has no token.");
            isSyncing.current = false;
            return;
        }

        try {
            // STEP 1: Upload any local-only records (unsynced)
            console.log("📤 Step 1: Uploading local changes...");
            await uploadLocalChanges();

            // STEP 2: NUCLEAR RESET - Clear all local stores
            console.log("💣 Step 2: Clearing local cache...");
            await clearAllStores();

            // STEP 3: Download fresh data from server
            console.log("⬇️  Step 3: Downloading from server...");
            const freshData = await authFetch(`/api/user/${user.id}/full-sync`);

            if (!freshData.ok) {
                throw new Error(`Server returned ${freshData.status}`);
            }

            const serverData = await freshData.json();
            console.log("📦 Received data:", {
                rounds: serverData.rounds?.length,
                matches: serverData.matches?.length,
                courses: serverData.courses?.length,
                leagues: serverData.leagues?.length,
                skinsGames: serverData.skinsGames?.length
            });

            // STEP 4: Populate IndexedDB from server data
            console.log("💾 Step 4: Rebuilding local cache...");
            await populateFromServer(serverData);

            // STEP 5: Recalculate handicap from fresh data
            console.log("🧮 Step 5: Recalculating handicap...");
            await recalculateHandicap();

            // STEP 6: Refresh user profile from server
            console.log("👤 Step 6: Refreshing user profile...");
            try {
                const userRes = await authFetch(`/api/user/${user.id}`);
                if (userRes.ok) {
                    const latestUser = await userRes.json();
                    const updatedUser = { ...user, ...latestUser };
                    setUser(updatedUser);
                    saveToLocalStorage(updatedUser);
                }
            } catch (uErr) {
                console.warn("Failed to refresh user profile", uErr);
            }

            console.log("✅ Nuclear Sync Complete");

        } catch (e) {
            console.error("❌ Sync failed:", e);
            throw e; // Re-throw so UI can show error
        } finally {
            isSyncing.current = false;
        }
    };

    // Helper: Upload local-only records to server
    const uploadLocalChanges = async () => {
        const allRounds = await db.getAll('rounds');
        const allMatches = await db.getAll('matches');
        const allCourses = await db.getAll('courses');
        const allSkinsGames = await db.getAll('skins_games');

        const unsyncedRounds = allRounds.filter(r => !r.synced && !r.serverId);
        const unsyncedMatches = allMatches.filter(m => !m.synced && !m.serverId && m.player2?.id);
        const unsyncedCourses = allCourses.filter(c => !c.synced && !c.serverId);
        const unsyncedSkins = allSkinsGames.filter(g => !g.synced && !g.serverId && g.status === 'COMPLETED');

        // Build course ID map for FK resolution
        const courseIdMap = new Map();
        allCourses.forEach(c => {
            if (c.serverId) courseIdMap.set(c.id, c.serverId);
        });

        // Upload courses first (dependency)
        for (const course of unsyncedCourses) {
            try {
                const res = await authFetch('/courses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: course.name,
                        holes: course.holes,
                        rating: course.rating,
                        slope: course.slope,
                        par: course.par,
                        tees: course.tees || []
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    courseIdMap.set(course.id, parseInt(data.id));
                }
            } catch (e) {
                console.error("Failed to upload course:", course.name, e);
            }
        }

        // Upload rounds, matches, skins if any exist
        if (unsyncedRounds.length > 0 || unsyncedMatches.length > 0 || unsyncedSkins.length > 0) {
            const payload = {
                userId: user.id,
                rounds: unsyncedRounds.map(r => ({
                    courseId: courseIdMap.get(r.courseId) || r.courseId,
                    date: r.date,
                    score: r.totalStrokes || 0,
                    stableford: r.totalStableford || 0,
                    hcpIndex: r.hcpIndex,
                    scores: r.scores || {},
                    leagueId: r.leagueId || null,
                    completed: r.completed || false,
                    differential: r.differential || 0
                })),
                matches: unsyncedMatches.map(m => ({
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
                    completed: m.completed || false,
                    leagueMatchId: m.leagueMatchId || null
                })),
                skinsGames: unsyncedSkins.map(g => ({
                    courseId: courseIdMap.get(g.courseId) || g.courseId,
                    date: g.date,
                    skinValue: g.skinValue,
                    status: g.status,
                    players: g.players,
                    scores: g.scores,
                    skinsWon: g.skinsWon || {},
                    holesPlayed: g.holesPlayed,
                    startingHole: g.startingHole
                }))
            };

            try {
                const res = await authFetch('/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    console.log("✅ Uploaded local changes successfully");
                } else {
                    console.error("⚠️ Failed to upload some local changes");
                }
            } catch (e) {
                console.error("Upload error:", e);
            }
        }
    };

    // Helper: Clear all IndexedDB stores
    const clearAllStores = async () => {
        const stores = ['rounds', 'matches', 'courses', 'leagues', 'skins_games'];
        for (const store of stores) {
            try {
                await db.clear(store);
            } catch (e) {
                console.error(`Failed to clear ${store}:`, e);
            }
        }
    };

    // Helper: Populate IndexedDB from server data
    const populateFromServer = async (serverData) => {
        const tx = db.transaction(['rounds', 'matches', 'courses', 'leagues', 'skins_games'], 'readwrite');

        try {
            // Add courses (using put to handle duplicates gracefully)
            for (const course of (serverData.courses || [])) {
                try {
                    await tx.objectStore('courses').put({
                        id: course.serverId, // Use serverId as local ID to prevent mismatches
                        serverId: course.serverId,
                        name: course.name,
                        holes: course.holes,
                        rating: course.rating,
                        slope: course.slope,
                        par: course.par,
                        tees: course.tees,
                        synced: true
                    });
                } catch (e) {
                    console.error(`❌ Failed to add course "${course.name}" (ID: ${course.serverId}):`, e);
                }
            }

            // Add rounds (using put to handle duplicates gracefully)
            for (const round of (serverData.rounds || [])) {
                try {
                    await tx.objectStore('rounds').put({
                        ...round,
                        id: round.serverId,
                        serverId: round.serverId,
                        completed: round.completed !== undefined ? round.completed : false,
                        differential: round.differential || 0,
                        synced: true
                    });
                } catch (e) {
                    console.error(`❌ Failed to add round (ID: ${round.serverId}, date: ${round.date}):`, e);
                }
            }

            // Add matches (using put to handle duplicates gracefully)
            for (const match of (serverData.matches || [])) {
                await tx.objectStore('matches').put({
                    ...match,
                    id: match.serverId,
                    serverId: match.serverId,
                    player1: { id: match.player1Id, name: match.p1Name || 'Player 1' },
                    player2: { id: match.player2Id, name: match.p2Name || 'Player 2' },
                    completed: match.completed !== undefined ? match.completed : false,
                    synced: true
                });
            }

            // Add leagues (using put to handle duplicates gracefully)
            for (const league of (serverData.leagues || [])) {
                await tx.objectStore('leagues').put({
                    ...league,
                    id: league.serverId,
                    serverId: league.serverId,
                    synced: true
                });
            }

            // Add skins games (using put to handle duplicates gracefully)
            for (const game of (serverData.skinsGames || [])) {
                await tx.objectStore('skins_games').put({
                    ...game,
                    id: game.serverId,
                    serverId: game.serverId,
                    synced: true
                });
            }

            await tx.done;
            console.log("✅ Cache populated successfully");
        } catch (e) {
            console.error("❌ Failed to populate cache:", e);
            throw e;
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
                                // Preserve token from local storage since server doesn't return it
                                const updatedUser = { ...latest, token: parsed.token };
                                setUser(updatedUser);
                                saveToLocalStorage(updatedUser);
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
