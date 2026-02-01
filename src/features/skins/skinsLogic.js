import { calculatePlayingHcp, calculateStrokesReceived } from '../scoring/calculations';

/**
 * Calculates strokes received for each player relative to the lowest handicap in the group.
 * @param {Array} players - List of player objects { id, hcp, teeId, etc. }
 * @param {Object} course - Course object with tees
 * @returns {Array} players with updated 'strokes' property relative to lowest
 */
export const calculateSkinsStrokes = (players, course) => {
    if (!players || players.length === 0 || !course) return players;

    // 1. Calculate Playing Handicap for each player based on their selected tee
    const playersWithPlayingHcp = players.map(p => {
        if (!course.tees || !Array.isArray(course.tees) || course.tees.length === 0) return { ...p, strokesReceived: 0 };
        const tee = course.tees.find(t => t.id === p.teeId) || course.tees[0];
        const playingHcp = calculatePlayingHcp(p.hcp, tee.slope, tee.rating, 72); // Assuming Par 72 for base calculation if not specific
        return { ...p, playingHcp, tee };
    });

    // 2. Find the lowest playing handicap
    const minHcp = Math.min(...playersWithPlayingHcp.map(p => p.playingHcp));

    // 3. Assign strokes relative to the lowest (Lowest plays off 0)
    return playersWithPlayingHcp.map(p => ({
        ...p,
        strokesReceived: p.playingHcp - minHcp
    }));
};

/**
 * Calculates the state of the skins game (winners, carryovers, pot).
 * @param {Object} scores - { [holeNumber]: { [playerId]: score } }
 * @param {Array} players - List of players with 'strokesReceived' calculated
 * @param {Array} holes - List of hole objects { number, par, hcp }
 * @returns {Object} { skinLog, playerTotals, currentPot, carryover }
 */
export const calculateSkinsState = (scores, players, holes) => {
    const skinLog = {}; // { [hole]: { winnerId, carryover: boolean, value: number } }
    const playerTotals = {}; // { [playerId]: count }

    // Initialize totals
    players.forEach(p => playerTotals[p.id] = 0);

    let carryover = 0;

    // Iterate through holes 1-18 (or max holes in course)
    holes.forEach((hole, index) => {
        const holeNum = hole.number;
        const holeScores = scores[holeNum];

        if (!holeScores || Object.keys(holeScores).length < players.length) {
            // Hole not fully played yet
            return;
        }

        // Calculate Net Scores for this hole
        const netScores = players.map(p => {
            const gross = holeScores[p.id];
            if (!gross) return { id: p.id, net: 999 }; // Treat missing score as high

            // Calculate strokes given for this specific hole index
            // Use calculateStrokesReceived from calculations.js logic
            // Note: strokesReceived calculated earlier is the total "Shots".
            // We need to distribute them per hole based on Stroke Index (hole.hcp).

            let strokesForHole = 0;
            const shots = p.strokesReceived;
            const holeHcp = hole.hcp;

            if (shots > 0) {
                strokesForHole = Math.floor(shots / 18);
                const remainder = shots % 18;
                if (holeHcp <= remainder) {
                    strokesForHole += 1;
                }
            }
            // Logic for +HCP (shots < 0) could be added here similar to calculations.js

            return {
                id: p.id,
                net: gross - strokesForHole,
                gross
            };
        });

        // Find winner
        const minScore = Math.min(...netScores.map(n => n.net));
        const winners = netScores.filter(n => n.net === minScore);

        if (winners.length === 1) {
            // Single winner
            const winnerId = winners[0].id;
            const value = 1 + carryover;

            skinLog[holeNum] = {
                winnerId,
                value,
                carryover: false
            };

            playerTotals[winnerId] = (playerTotals[winnerId] || 0) + value;
            carryover = 0; // Reset carryover
        } else {
            // Tie
            carryover += 1;
            skinLog[holeNum] = {
                winnerId: null,
                value: 0,
                carryover: true
            };
        }
    });

    const currentPot = 1 + carryover;

    return {
        skinLog,
        playerTotals,
        currentPot,
        carryover
    };
};
