import { describe, it, expect } from 'vitest';
import { calculatePlayingHcp, calculateStrokesReceived, calculateDifferential } from './calculations';

describe('Handicap Calculations', () => {
    describe('calculatePlayingHcp', () => {
        it('calculates correctly for standard course (Slope 113)', () => {
            // Formula: Index * (Slope / 113) + (Rating - Par)
            // 10.0 * (113 / 113) + (72.0 - 72) = 10.0
            expect(calculatePlayingHcp(10.0, 113, 72.0, 72)).toBe(10);
        });

        it('calculates correctly for difficult course (Slope 140)', () => {
            // 10.0 * (140 / 113) + (74.0 - 72)
            // 10 * 1.2389 + 2 = 12.389 + 2 = 14.389 -> 14
            expect(calculatePlayingHcp(10.0, 140, 74.0, 72)).toBe(14);
        });

        it('calculates correctly for easy course (Slope 100)', () => {
            // 20.0 * (100 / 113) + (68.0 - 72)
            // 20 * 0.8849 - 4 = 17.69 - 4 = 13.69 -> 14
            expect(calculatePlayingHcp(20.0, 100, 68.0, 72)).toBe(14);
        });
    });

    describe('calculateStrokesReceived', () => {
        it('gives stroke on difficult holes (HCP <= Playing HCP)', () => {
            // Playing HCP 10
            expect(calculateStrokesReceived(10, 10)).toBe(1); // HCP 10 gets a stroke
            expect(calculateStrokesReceived(10, 5)).toBe(1);  // HCP 5 gets a stroke
            expect(calculateStrokesReceived(10, 11)).toBe(0); // HCP 11 gets nothing
        });

        it('handles high handicaps (> 18)', () => {
            // Playing HCP 22 (18 + 4)
            expect(calculateStrokesReceived(22, 18)).toBe(1); // Everyone gets at least 1
            expect(calculateStrokesReceived(22, 4)).toBe(2);  // HCP 4 gets 2 strokes
            expect(calculateStrokesReceived(22, 5)).toBe(1);  // HCP 5 gets 1 stroke
        });
    });
});

describe('calculateDifferential', () => {
    it('calculates correct differential', () => {
        // Diff = (113 / Slope) * (Score - Rating)
        // (113 / 113) * (80 - 72) = 8.0
        expect(calculateDifferential(80, 113, 72.0)).toBe(8.0);
    });

    it('handles rounding to one decimal place', () => {
        // (113 / 125) * (85 - 71.5)
        // 0.904 * 13.5 = 12.204 -> 12.2
        expect(calculateDifferential(85, 125, 71.5)).toBe(12.2);
    });

    it('returns 0 for valid 0 input or missing input', () => {
        expect(calculateDifferential(0, 113, 72)).toBe(0);
    });
});
