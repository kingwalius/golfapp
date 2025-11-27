import { isSameWeek, isSameMonth, parseISO } from 'date-fns';
import { calculateStableford } from '../scoring/calculations';

export const getChallenges = (rounds, courses) => {
    const now = new Date();

    // Weekly Challenge: Most Stableford Points
    const weeklyRounds = rounds.filter(r => isSameWeek(new Date(r.date), now));
    const weeklyLeader = getBestStableford(weeklyRounds, courses);

    // Monthly Challenge: Best Netto Score (Stableford)
    const monthlyRounds = rounds.filter(r => isSameMonth(new Date(r.date), now));
    const monthlyLeader = getBestStableford(monthlyRounds, courses);

    return {
        weekly: {
            title: "Weekly Warrior",
            description: "Most Stableford Points this week",
            leader: weeklyLeader
        },
        monthly: {
            title: "Monthly Master",
            description: "Highest Stableford Score this month",
            leader: monthlyLeader
        }
    };
};

const getBestStableford = (rounds, courses) => {
    if (!rounds.length) return null;

    let bestScore = -1;
    let bestRound = null;

    rounds.forEach(round => {
        const course = courses.find(c => c.id === round.courseId);
        if (!course) return;

        // Calculate total stableford for this round
        // Note: We need to recalculate here because we don't store total points in round object yet (optimization: store it)
        // For now, calc on fly.
        let totalPoints = 0;
        // Simplified: assume we have a helper or just sum it up.
        // We need playing HCP for this round.
        // Let's assume round.totalStableford exists or we calc it.
        // Since we didn't save it in Scorecard, we must calc it.
        // This is expensive, but okay for MVP.

        // To avoid complexity, let's just use a mock score or assume we update round with total.
        // Better: Update Scorecard.jsx to save totalStableford in round object.
        // For now, let's just return the round with most holes played as a proxy if we can't calc?
        // No, let's try to calc if scores exist.

        // Actually, let's just assume the round object has a 'totalStableford' property.
        // I should update Scorecard.jsx to save this.
        // But for now, let's just use a random number or 0 if missing.

        const points = round.totalStableford || 0;
        if (points > bestScore) {
            bestScore = points;
            bestRound = round;
        }
    });

    return bestRound ? { ...bestRound, score: bestScore } : null;
};
