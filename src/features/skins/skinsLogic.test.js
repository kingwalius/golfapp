import { describe, it, expect } from 'vitest';
import { calculateSkinsStrokes, calculateSkinsState } from './skinsLogic';

describe('Skins Logic', () => {

    const mockCourse = {
        tees: [
            { id: 'white', slope: 113, rating: 72 }
        ]
    };

    // Calculate Playing HCP: Index * (Slope/113) + (Rating - Par)
    // Here: Index * 1 + 0 = Index.
    // So Playing HCP == HCP Index for this mock course.

    it('calculates strokes correctly relative to lowest player', () => {
        const players = [
            { id: 1, hcp: 10, teeId: 'white' },
            { id: 2, hcp: 15, teeId: 'white' },
            { id: 3, hcp: 20, teeId: 'white' }
        ];

        const result = calculateSkinsStrokes(players, mockCourse);

        // Player 1 (10) is lowest.
        // P1: 10 - 10 = 0
        // P2: 15 - 10 = 5
        // P3: 20 - 10 = 10

        expect(result.find(p => p.id === 1).strokesReceived).toBe(0);
        expect(result.find(p => p.id === 2).strokesReceived).toBe(5);
        expect(result.find(p => p.id === 3).strokesReceived).toBe(10);
    });

    it('determines skin winner on a hole', () => {
        // Setup Players with strokes
        const players = [
            { id: 1, strokesReceived: 0 }, // Net = Gross
            { id: 2, strokesReceived: 18 } // Gets 1 stroke on every hole (simplified test case)
        ];

        // Hole 1: Par 4, HCP 18.
        // P2 gets a stroke here.
        const holes = [{ number: 1, par: 4, hcp: 18 }];

        const scores = {
            1: {
                1: 4, // P1 Gross 4 -> Net 4
                2: 5  // P2 Gross 5 -> Net 4
            }
        };

        // Expect Tie
        let state = calculateSkinsState(scores, players, holes);
        expect(state.skinLog[1].winnerId).toBeNull();
        expect(state.skinLog[1].carryover).toBe(true);

        // Change P2 score to 4
        scores[1][2] = 4; // P2 Gross 4 -> Net 3
        state = calculateSkinsState(scores, players, holes);
        expect(state.skinLog[1].winnerId).toBe(2);
        expect(state.skinLog[1].carryover).toBe(false);
        expect(state.playerTotals[2]).toBe(1);
    });

    it('handles carryovers correctly', () => {
        const players = [
            { id: 1, strokesReceived: 0 },
            { id: 2, strokesReceived: 0 }
        ];
        const holes = [
            { number: 1, par: 4, hcp: 18 },
            { number: 2, par: 4, hcp: 17 },
            { number: 3, par: 4, hcp: 16 }
        ];

        const scores = {
            1: { 1: 4, 2: 4 }, // Tie
            2: { 1: 4, 2: 4 }, // Tie
            3: { 1: 3, 2: 4 }  // P1 Wins
        };

        const state = calculateSkinsState(scores, players, holes);

        // Hole 1: Carryover
        expect(state.skinLog[1].carryover).toBe(true);
        expect(state.skinLog[1].value).toBe(0);

        // Hole 2: Carryover
        expect(state.skinLog[2].carryover).toBe(true);
        expect(state.skinLog[2].value).toBe(0);

        // Hole 3: Winner P1, Value should be 1 (current) + 2 (carryovers) = 3
        expect(state.skinLog[3].winnerId).toBe(1);
        expect(state.skinLog[3].value).toBe(3);
        expect(state.playerTotals[1]).toBe(3);

        // Final Carryover should be 0
        expect(state.carryover).toBe(0);
    });
});
