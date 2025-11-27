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
 * Calculates the Handicap Differential for a round.
 * Formula: (113 / Slope Rating) * (Adjusted Gross Score - Course Rating)
 * Note: For MVP, we use Total Strokes as Adjusted Gross Score.
 */
export const calculateDifferential = (score, slope, rating) => {
    if (!score || !slope || !rating) return 0;
    return (113 / slope) * (score - rating);
};

/**
 * Calculates the new Handicap Index based on the last 20 rounds.
 * Logic:
 * 1. Sort rounds by date descending.
 * 2. Take the most recent 20 rounds.
 * 3. Calculate differential for each.
 * 4. Select the best 8 differentials.
 * 5. Average them.
 */
export const calculateHandicapIndex = (rounds, courses) => {
    if (!rounds || rounds.length === 0) return 54.0; // Default starter HCP

    // Sort by date desc
    const sortedRounds = [...rounds].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Take last 20
    const recentRounds = sortedRounds.slice(0, 20);

    // Calculate differentials
    const differentials = recentRounds.map(round => {
        const course = courses.find(c => c.id === round.courseId);
        if (!course || !round.score) return null;
        return calculateDifferential(round.score, course.slope, course.rating);
    }).filter(d => d !== null);

    if (differentials.length === 0) return 54.0;

    // If less than 20 rounds, WHS has a table for how many to use.
    // Simplified for MVP:
    // < 3 rounds: Use lowest - 2
    // 3-6 rounds: Use lowest
    // 7-8 rounds: Avg of lowest 2
    // ...
    // Let's just use "Best 40%" logic for simplicity if < 20

    const countToUse = Math.max(1, Math.ceil(differentials.length * 0.4));

    differentials.sort((a, b) => a - b); // Ascending (lower is better)
    const bestDifferentials = differentials.slice(0, countToUse);

    const sum = bestDifferentials.reduce((a, b) => a + b, 0);
    const avg = sum / bestDifferentials.length;

    return Math.round(avg * 10) / 10; // Round to 1 decimal
};
