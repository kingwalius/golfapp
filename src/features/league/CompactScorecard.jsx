import React from 'react';

export const CompactScorecard = ({ holes, scores, par }) => {
    // Helper to determine score style
    const getScoreStyle = (score, par) => {
        if (!score) return '';
        const diff = score - par;
        if (diff === 0) return ''; // Par
        if (diff === -1) return 'rounded-full border border-yellow-400'; // Birdie
        if (diff <= -2) return 'rounded-full border-2 border-yellow-400 double-ring'; // Eagle (simplified as double border or just distinct)
        if (diff === 1) return 'border border-yellow-400'; // Bogey (Square)
        if (diff >= 2) return 'border-2 border-yellow-400'; // Double Bogey+
        return '';
    };

    // Split holes into Front 9 and Back 9
    const front9 = holes.slice(0, 9);
    const back9 = holes.slice(9, 18);

    const renderRow = (nineHoles, startIndex) => (
        <div className="grid grid-cols-10 gap-0 text-center text-xs border-b border-white/10 last:border-0">
            <div className="p-1 font-bold text-gray-400 border-r border-white/10 flex items-center justify-center">HOLE</div>
            {nineHoles.map((h, i) => (
                <div key={i} className="p-1 text-gray-400 flex items-center justify-center">{startIndex + i + 1}</div>
            ))}

            <div className="p-1 font-bold text-gray-400 border-r border-white/10 flex items-center justify-center">PAR</div>
            {nineHoles.map((h, i) => (
                <div key={i} className="p-1 text-gray-300 flex items-center justify-center">{h.par}</div>
            ))}

            <div className="p-1 font-bold text-white border-r border-white/10 flex items-center justify-center">SCORE</div>
            {nineHoles.map((h, i) => {
                const holeNum = startIndex + i + 1;
                const score = scores[holeNum] || scores[i] || '-'; // Handle different score formats if needed
                // Note: 'scores' prop might be object {1: 4, 2: 5} or array.
                // Assuming object with 1-based keys based on previous files.
                const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];

                return (
                    <div key={i} className="p-1 flex items-center justify-center relative">
                        <div className={`w-6 h-6 flex items-center justify-center text-white font-bold ${getScoreStyle(val, h.par)}`}>
                            {val || '-'}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    // Simplified Table Layout matching the image
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
                    <div className="bg-emerald-900/50 text-emerald-100 py-1 font-bold border-b border-white/10">HOLE</div>
                    {nineHoles.map((_, i) => (
                        <div key={i} className="bg-emerald-900/50 text-emerald-100 py-1 border-b border-white/10">{startIndex + i + 1}</div>
                    ))}
                    <div className="bg-emerald-900/50 text-emerald-100 py-1 font-bold border-b border-white/10">{label}</div>

                    {/* Par Row */}
                    <div className="bg-stone-900/80 text-stone-400 py-2 font-medium border-b border-white/5">PAR</div>
                    {nineHoles.map((h, i) => (
                        <div key={i} className="bg-stone-900/80 text-stone-400 py-2 border-b border-white/5">{h.par}</div>
                    ))}
                    <div className="bg-stone-900/80 text-stone-400 py-2 font-bold border-b border-white/5">{totalPar}</div>

                    {/* Score Row */}
                    <div className="bg-stone-900/80 text-white py-2 font-bold">SCORE</div>
                    {nineHoles.map((h, i) => {
                        const holeNum = startIndex + i + 1;
                        const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];
                        return (
                            <div key={i} className="bg-stone-900/80 flex items-center justify-center py-1">
                                <div className={`w-6 h-6 flex items-center justify-center text-white font-bold text-sm ${getScoreStyle(val, h.par)}`}>
                                    {val || '-'}
                                </div>
                            </div>
                        );
                    })}
                    <div className="bg-stone-900/80 text-white py-2 font-bold">{totalScore > 0 ? totalScore : '-'}</div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-stone-950 rounded-lg overflow-hidden border border-stone-800 shadow-lg">
            {renderTable(front9, 0, 'FRONT')}
            {back9.length > 0 && renderTable(back9, 9, 'BACK')}
        </div>
    );
};
