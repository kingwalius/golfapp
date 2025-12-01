import React, { useRef, useEffect } from 'react';

export const ScoreSelector = ({ par, value, onChange }) => {
    const scrollRef = useRef(null);

    // Generate score options based on Par
    // Range: 1 to Par + 5 (e.g., Par 4 -> 1 to 9)
    // Plus a "-" option for pickup
    const maxScore = par + 5;
    const scores = Array.from({ length: maxScore }, (_, i) => i + 1);

    // Colors for different scores relative to Par
    const getScoreColor = (score) => {
        const diff = score - par;
        if (diff <= -2) return 'bg-yellow-400 text-white border-yellow-500'; // Eagle or better
        if (diff === -1) return 'bg-red-500 text-white border-red-600'; // Birdie
        if (diff === 0) return 'bg-stone-100 text-dark border-stone-200'; // Par
        if (diff === 1) return 'bg-blue-500 text-white border-blue-600'; // Bogey
        if (diff >= 2) return 'bg-dark text-white border-black'; // Double Bogey or worse
        return 'bg-white text-dark border-stone-200';
    };

    // Center the scroll on the selected value or Par on mount
    useEffect(() => {
        if (scrollRef.current) {
            const targetValue = value || par;
            // Find the button with this value (approximate calculation)
            // Each button is w-12 (48px) + gap-2 (8px) = 56px
            // We want to center it. Container width is roughly 200px (4 items visible)
            // Index of target
            const index = scores.indexOf(targetValue);
            if (index !== -1) {
                const scrollPos = (index * 56) - 72; // Adjust 72 to center
                scrollRef.current.scrollTo({ left: scrollPos, behavior: 'smooth' });
            }
        }
    }, []); // Run once on mount

    return (
        <div
            ref={scrollRef}
            className="flex items-center gap-2 overflow-x-auto no-scrollbar px-1 py-1 snap-x snap-mandatory w-full max-w-[240px] mx-auto"
        >
            {/* Pickup Option */}
            <button
                onClick={() => onChange(0)}
                className={`
                    flex-shrink-0 w-12 h-12 rounded-xl border-2 font-bold text-lg flex items-center justify-center snap-center transition-all
                    ${value === 0 || !value
                        ? 'bg-stone-800 text-white border-stone-900 scale-100 shadow-md'
                        : 'bg-white text-stone-400 border-stone-200 scale-90 opacity-70'
                    }
                `}
            >
                -
            </button>

            {scores.map(score => (
                <button
                    key={score}
                    onClick={() => onChange(score)}
                    className={`
                        flex-shrink-0 w-12 h-12 rounded-xl border-2 font-bold text-lg flex items-center justify-center snap-center transition-all
                        ${value === score
                            ? `${getScoreColor(score)} scale-100 shadow-md ring-2 ring-offset-1 ring-primary/20`
                            : 'bg-white text-dark border-stone-200 scale-90 opacity-70 hover:opacity-100'
                        }
                    `}
                >
                    {score}
                </button>
            ))}
        </div>
    );
};
