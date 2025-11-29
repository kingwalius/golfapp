import React from 'react';

export const CompactScorecard = ({ holes, scores, par, p1Name, p2Name }) => {
    // Helper to determine score style
    const getScoreStyle = (score, par, isWinner) => {
        if (!score) return '';
        const diff = score - par;
        let baseStyle = '';

        if (diff === 0) baseStyle = 'text-stone-800'; // Par
        else if (diff === -1) baseStyle = 'rounded-full border border-primary text-primary'; // Birdie
        else if (diff <= -2) baseStyle = 'rounded-full border-2 border-primary text-primary double-ring'; // Eagle
        else if (diff === 1) baseStyle = 'border border-stone-400 text-stone-600'; // Bogey (Square)
        else if (diff >= 2) baseStyle = 'border-2 border-stone-400 text-stone-600'; // Double Bogey+
        else baseStyle = 'text-stone-800';

        if (isWinner) return `${baseStyle} font-black bg-stone-100`;
        return `${baseStyle} font-medium`;
    };

    // Split holes into Front 9 and Back 9
    const front9 = holes.slice(0, 9);
    const back9 = holes.slice(9, 18);

    // Simplified Table Layout matching the image but Light Mode
    const renderTable = (nineHoles, startIndex, label) => {
        const totalPar = nineHoles.reduce((acc, h) => acc + h.par, 0);

        // Check if we have match data (objects with p1/p2)
        const isMatch = Object.values(scores).some(s => typeof s === 'object');

        // Calculate Totals
        const totalScoreP1 = nineHoles.reduce((acc, h, i) => {
            const holeNum = startIndex + i + 1;
            const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];
            const scoreVal = typeof val === 'object' ? val.p1 : val;
            return acc + (parseInt(scoreVal) || 0);
        }, 0);

        const totalScoreP2 = isMatch ? nineHoles.reduce((acc, h, i) => {
            const holeNum = startIndex + i + 1;
            const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];
            const scoreVal = typeof val === 'object' ? val.p2 : 0;
            return acc + (parseInt(scoreVal) || 0);
        }, 0) : 0;

        return (
            <div className="mb-2 last:mb-0">
                <div className="grid grid-cols-[4rem_repeat(9,1fr)_3rem] gap-0 text-center text-xs">
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

                    {/* P1 Score Row */}
                    <div className="bg-white text-stone-800 py-2 font-bold border-b border-stone-100 truncate px-1" title={p1Name || 'P1'}>
                        {p1Name ? (p1Name.length > 6 ? p1Name.substring(0, 6) + '..' : p1Name) : 'SCORE'}
                    </div>
                    {nineHoles.map((h, i) => {
                        const holeNum = startIndex + i + 1;
                        const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];
                        const score = typeof val === 'object' ? val.p1 : val;
                        const isWinner = typeof val === 'object' && val.winner === 1;

                        return (
                            <div key={i} className="bg-white flex items-center justify-center py-1 border-b border-stone-100">
                                <div className={`w-6 h-6 flex items-center justify-center text-sm ${getScoreStyle(score, h.par, isWinner)}`}>
                                    {score || '-'}
                                </div>
                            </div>
                        );
                    })}
                    <div className="bg-white text-stone-800 py-2 font-bold border-b border-stone-100">{totalScoreP1 > 0 ? totalScoreP1 : '-'}</div>

                    {/* P2 Score Row (Only if Match) */}
                    {isMatch && (
                        <>
                            <div className="bg-white text-stone-800 py-2 font-bold truncate px-1" title={p2Name || 'P2'}>
                                {p2Name ? (p2Name.length > 6 ? p2Name.substring(0, 6) + '..' : p2Name) : 'P2'}
                            </div>
                            {nineHoles.map((h, i) => {
                                const holeNum = startIndex + i + 1;
                                const val = typeof scores === 'object' && !Array.isArray(scores) ? scores[holeNum] : scores[i];
                                const score = val ? val.p2 : 0;
                                const isWinner = val && val.winner === 2;

                                return (
                                    <div key={i} className="bg-white flex items-center justify-center py-1">
                                        <div className={`w-6 h-6 flex items-center justify-center text-sm ${getScoreStyle(score, h.par, isWinner)}`}>
                                            {score || '-'}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="bg-white text-stone-800 py-2 font-bold">{totalScoreP2 > 0 ? totalScoreP2 : '-'}</div>
                        </>
                    )}
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
