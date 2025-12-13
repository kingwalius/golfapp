/**
 * Calculates the Playing Handicap for a course.
 * Formula: Playing HCP = Course HCP + (HCP Index * (Slope Rating / 113)) - (Course Rating - Par)
 * Note: The formula varies by region (e.g., WHS uses different variations).
 * We will use the standard WHS formula: Course Handicap = Handicap Index * (Slope Rating / 113) + (Course Rating - Par)
 */
export const calculatePlayingHcp = (hcpIndex, slope, rating, par) => {
    const courseHcp = hcpIndex * (slope / 113) + (rating - par);
    return Math.round(courseHcp);
};

/**
 * Calculates the number of strokes received for a specific hole based on Playing HCP and Hole HCP (Index).
 */
export const calculateStrokesReceived = (playingHcp, holeHcp) => {
    let strokes = 0;
    if (playingHcp > 0) {
        strokes = Math.floor(playingHcp / 18);
        const remainder = playingHcp % 18;
        if (holeHcp <= remainder) {
            strokes += 1;
        }
    } else if (playingHcp < 0) {
        // Plus handicap logic (simplified)
        // Usually +1 means you give back a stroke on the hardest hole (HCP 18? No, easiest usually, but let's stick to standard)
        // For simplicity in this MVP, we handle positive handicaps primarily.
        // If negative, we might need to adjust.
        // Let's assume standard positive handicap logic for now.
    }
    return strokes;
};

/**
 * Calculates Stableford points for a hole.
 * Net Par = 2 points
 * Net Birdie = 3 points
 * Net Eagle = 4 points
 * Net Bogey = 1 point
 * Net Double Bogey or worse = 0 points
 */
export const calculateStableford = (par, strokes, strokesReceived) => {
    if (strokes === 0) return 0; // No score entered
    const netScore = strokes - strokesReceived;
    const points = par - netScore + 2;
    return points < 0 ? 0 : points;
};

/**
 * Calculates Brutto points (Scratch Stableford).
 */
export const calculateBruttoStableford = (par, strokes) => {
    if (strokes === 0) return 0;
    const points = par - strokes + 2;
    return points < 0 ? 0 : points;
};

/**
 * Calculates Adjusted Gross Score (Net Double Bogey maximum).
 * Max Score = Par + 2 + Strokes Received.
 */
export const calculateAdjustedScore = (par, strokes, strokesReceived) => {
    if (strokes === 0) return 0;
    const maxScore = par + 2 + strokesReceived;
    return Math.min(strokes, maxScore);
};

/**
 * Calculates the Handicap Differential for a round.
 * Formula: (113 / Slope Rating) * (Adjusted Gross Score - Course Rating)
 * Note: For MVP, we use Total Strokes as Adjusted Gross Score.
 */
export const calculateDifferential = (score, slope, rating) => {
    if (!score || !slope || !rating) return 0;
    return (113 / slope) * (score - rating);
};

/**
 * Prepares a unified list of rounds for handicap calculation.
 * Filters by user, excludes 9-hole rounds, and normalizes data structure.
 */
export const prepareHandicapData = (rounds, matches, courses, userId) => {
    const userRounds = rounds
        .filter(r => r.userId == userId && r.holesPlayed !== 9) // Basic filter first
        .map(r => {
            // Calculate score dynamically
            let totalStrokes = 0;
            let holesPlayedCount = 0;
            if (r.scores) {
                Object.values(r.scores).forEach(s => {
                    if (s > 0) {
                        totalStrokes += s;
                        holesPlayedCount++;
                    }
                });
            }

            // Determine target holes (default 18)
            const targetHoles = r.holesPlayed || 18;

            // Only include if fully completed
            if (holesPlayedCount < targetHoles) return null;

            return {
                ...r,
                type: 'round',
                date: new Date(r.date),
                score: totalStrokes // Ensure score is set
            };
        })
        .filter(r => r !== null); // Remove nulls (incomplete rounds)

    const userMatches = matches
        .filter(m => (m.player1?.id == userId || m.player2?.id == userId) && m.holesPlayed !== 9)
        .filter(m => {
            // Include if user is P1 with diff OR user is P2 with diff
            if (m.player1?.id == userId && m.player1Differential !== undefined && m.player1Differential !== null) return true;
            if (m.player2?.id == userId && m.player2Differential !== undefined && m.player2Differential !== null) return true;
            return false;
        })
        .map(m => ({
            ...m,
            type: 'match',
            date: new Date(m.date),
            differential: m.player1?.id == userId ? m.player1Differential : m.player2Differential
        }));

    return [...userRounds, ...userMatches].sort((a, b) => b.date - a.date);
};

/**
 * Calculates detailed handicap information, including which rounds count.
 */
export const calculateHandicapDetails = (preparedRounds, courses) => {
    if (!preparedRounds || preparedRounds.length === 0) {
        return { handicapIndex: 54.0, rounds: [] };
    }

    // 1. Calculate differentials for all rounds
    const roundsWithDiff = preparedRounds.map(round => {
        let differential = round.differential;

        if (differential === undefined || differential === null) {
            const course = courses.find(c => c.id === round.courseId || c.serverId == round.courseId);
            if (course && round.score) {
                differential = calculateDifferential(round.score, course.slope, course.rating);
            }
        }

        return {
            ...round,
            differential: differential !== undefined ? differential : null
        };
    }).filter(r => r.differential !== null);

    if (roundsWithDiff.length === 0) {
        return { handicapIndex: 54.0, rounds: [] };
    }

    // 2. Take last 20
    const recentRounds = roundsWithDiff.slice(0, 20);

    // 3. Determine how many to use (WHS logic simplified)
    let countToUse = 8;
    if (recentRounds.length < 20) {
        // Simplified table
        if (recentRounds.length <= 3) countToUse = 1;
        else if (recentRounds.length <= 5) countToUse = 1;
        else if (recentRounds.length <= 8) countToUse = 2;
        else if (recentRounds.length <= 10) countToUse = 3;
        else if (recentRounds.length <= 12) countToUse = 4;
        else if (recentRounds.length <= 14) countToUse = 5;
        else if (recentRounds.length <= 16) countToUse = 6;
        else if (recentRounds.length <= 18) countToUse = 7;
    }

    // 4. Identify counting rounds
    // Sort by differential ascending to find the best ones
    const sortedByDiff = [...recentRounds].sort((a, b) => a.differential - b.differential);
    const bestRounds = sortedByDiff.slice(0, countToUse);
    const bestIds = new Set(bestRounds.map(r => r.id + '-' + r.type)); // Composite ID to be safe

    // 5. Mark rounds as included
    const finalRounds = recentRounds.map(r => ({
        ...r,
        included: bestIds.has(r.id + '-' + r.type)
    }));

    // 6. Calculate Average
    const sum = bestRounds.reduce((a, b) => a + b.differential, 0);
    const avg = sum / bestRounds.length;
    const handicapIndex = Math.round(avg * 10) / 10;

    return {
        handicapIndex,
        rounds: finalRounds
    };
};

/**
 * Calculates the new Handicap Index based on the last 20 rounds.
 * Wrapper for backward compatibility.
 */
export const calculateHandicapIndex = (rounds, courses) => {
    // This function expects "prepared" rounds or raw rounds?
    // The existing code passed a mix.
    // Let's assume the input is already a list of objects with differentials or scores.
    // We can reuse calculateHandicapDetails logic but we need to adapt the input if it's not fully prepared.

    // For safety, let's just use the logic inside calculateHandicapDetails
    // assuming 'rounds' here are already filtered/prepared as they were in store.jsx

    const details = calculateHandicapDetails(rounds, courses);
    return details.handicapIndex;
};
