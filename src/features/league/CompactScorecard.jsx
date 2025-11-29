import React from 'react';

export const CompactScorecard = ({ holes, scores, par }) => {
    // Helper to determine score style
    const getScoreStyle = (score, par) => {
        if (!score) return '';
        const diff = score - par;
        if (diff === 0) return 'text-stone-800'; // Par
        if (diff === -1) return 'rounded-full border border-primary text-primary font-bold'; // Birdie
        if (diff <= -2) return 'rounded-full border-2 border-primary text-primary font-bold double-ring'; // Eagle
        if (diff === 1) return 'border border-stone-400 text-stone-600'; // Bogey (Square)
        if (diff >= 2) return 'border-2 border-stone-400 text-stone-600'; // Double Bogey+
        return 'text-stone-800';
    };

    // Split holes into Front 9 and Back 9
    const front9 = holes.slice(0, 9);
    const back9 = holes.slice(9, 18);

    // Simplified Table Layout matching the image but Light Mode
    const renderTable = (nineHoles, startIndex, label) => {
        const totalPar = nineHoles.reduce((acc, h) => acc + h.par, 0);
        const totalScore = nineHoles.reduce((acc, h, i) => {
            const holeNum = startIndex + i + 1;
            const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];
            return acc + (parseInt(val) || 0);
        }, 0);

        return (
            <div className="mb-2 last:mb-0">
                <div className="grid grid-cols-[3rem_repeat(9,1fr)_3rem] gap-0 text-center text-xs">
                    {/* Header Row */}
                    <div className="bg-primary text-white py-1 font-bold border-b border-white/10 rounded-tl-lg">HOLE</div>
                    {nineHoles.map((_, i) => (
                        <div key={i} className="bg-primary text-white py-1 border-b border-white/10">{startIndex + i + 1}</div>
                    ))}
                    <div className="bg-primary text-white py-1 font-bold border-b border-white/10 rounded-tr-lg">{label}</div>

                    {/* Par Row */}
                    <div className="bg-stone-100 text-stone-500 py-2 font-medium border-b border-stone-200">PAR</div>
                    {nineHoles.map((h, i) => (
                        <div key={i} className="bg-stone-100 text-stone-500 py-2 border-b border-stone-200">{h.par}</div>
                    ))}
                    <div className="bg-stone-100 text-stone-500 py-2 font-bold border-b border-stone-200">{totalPar}</div>

                    {/* Score Row */}
                    <div className="bg-white text-stone-800 py-2 font-bold">SCORE</div>
                    {nineHoles.map((h, i) => {
                        const holeNum = startIndex + i + 1;
                        const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];
                        return (
                            <div key={i} className="bg-white flex items-center justify-center py-1">
                                <div className={`w-6 h-6 flex items-center justify-center text-sm ${getScoreStyle(val, h.par)}`}>
                                    {val || '-'}
                                </div>
                            </div>
                        );
                    })}
                    <div className="bg-white text-stone-800 py-2 font-bold">{totalScore > 0 ? totalScore : '-'}</div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-lg overflow-hidden border border-stone-200 shadow-sm">
            {renderTable(front9, 0, 'FRONT')}
            {back9.length > 0 && renderTable(back9, 9, 'BACK')}
        </div>
    );
};
