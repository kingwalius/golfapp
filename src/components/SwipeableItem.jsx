import React, { useState, useRef } from 'react';

export const SwipeableItem = ({ children, onDelete, onClick }) => {
    const [offset, setOffset] = useState(0);
    const startX = useRef(0);
    const currentOffset = useRef(0);
    const isSwiping = useRef(false);

    const handleTouchStart = (e) => {
        startX.current = e.touches[0].clientX;
        isSwiping.current = false;
    };

    const handleTouchMove = (e) => {
        const touchX = e.touches[0].clientX;
        const diff = touchX - startX.current;

        // Only allow swiping left
        if (diff < 0) {
            isSwiping.current = true;
            // Limit swipe to -100px
            const newOffset = Math.max(diff, -100);
            setOffset(newOffset);
            currentOffset.current = newOffset;
        }
    };

    const handleTouchEnd = () => {
        if (currentOffset.current < -50) {
            // Snap open
            setOffset(-80);
        } else {
            // Snap close
            setOffset(0);
        }
        currentOffset.current = 0;
    };

    const handleClick = (e) => {
        // Prevent navigation if we just swiped or if the item is open
        if (isSwiping.current || offset !== 0) {
            e.preventDefault();
            if (offset !== 0) setOffset(0); // Close on click if open
            return;
        }
        onClick && onClick();
    };

    return (
        <div className="relative overflow-hidden mb-4 rounded-2xl">
            {/* Background / Actions */}
            <div className="absolute inset-0 flex justify-end items-center bg-red-500 rounded-2xl pr-4">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="text-white font-bold flex items-center gap-2"
                    Delete
                </button>
        </div>

            {/* Content */ }
    <div
        className="relative bg-white rounded-2xl shadow-soft transition-transform duration-200 ease-out border border-stone-100"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
    >
        {children}
    </div>
        </div >
    );
};
