import React, { useState, useRef } from 'react';

export const SwipeableItem = ({ children, onDelete, onCopy, onClick }) => {
    const [offset, setOffset] = useState(0);
    const startX = useRef(0);
    const currentOffset = useRef(0);
    const isSwiping = useRef(false);
    const [isDragging, setIsDragging] = useState(false); // To track mouse drag state

    // Touch Handlers
    const handleTouchStart = (e) => {
        startX.current = e.touches[0].clientX;
        isSwiping.current = false;
    };

    const handleTouchMove = (e) => {
        const touchX = e.touches[0].clientX;
        const diff = touchX - startX.current;
        handleMove(diff);
    };

    // Mouse Handlers
    const handleMouseDown = (e) => {
        startX.current = e.clientX;
        setIsDragging(true);
        isSwiping.current = false;
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const diff = e.clientX - startX.current;
        handleMove(diff);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        handleEnd();
    };

    const handleMouseLeave = () => {
        if (isDragging) {
            setIsDragging(false);
            handleEnd();
        }
    };

    // Unified Logic
    const handleMove = (diff) => {
        if (Math.abs(diff) > 5) isSwiping.current = true; // Threshold for swipe detection

        if (diff < 0 && onDelete) {
            const newOffset = Math.max(diff, -100);
            setOffset(newOffset);
            currentOffset.current = newOffset;
        } else if (diff > 0 && onCopy) {
            const newOffset = Math.min(diff, 100);
            setOffset(newOffset);
            currentOffset.current = newOffset;
        }
    };

    const handleEnd = () => {
        if (currentOffset.current < -50 && onDelete) {
            setOffset(-80);
        } else if (currentOffset.current > 50 && onCopy) {
            setOffset(80);
        } else {
            setOffset(0);
        }
        currentOffset.current = 0; // Reset for next swipe, but offset state holds the position
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
        <div className="relative overflow-hidden mb-4 rounded-2xl select-none">
            {/* Background / Actions */}
            <div className="absolute inset-0 flex justify-between items-center rounded-2xl">
                {/* Copy Action (Left Side) */}
                <div className={`flex-1 flex justify-start items-center pl-4 bg-blue-500 h-full rounded-l-2xl transition-opacity ${offset > 0 ? 'opacity-100' : 'opacity-0'}`}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setOffset(0); // Close first
                            // Small timeout to allow UI to update before action (optional, but safer for heavy actions/confirms)
                            setTimeout(() => onCopy(), 10);
                        }}
                        className="text-white font-bold flex items-center gap-2 pointer-events-auto cursor-pointer"
                    >
                        Copy
                    </button>
                </div>

                {/* Delete Action (Right Side) */}
                <div className={`flex-1 flex justify-end items-center pr-4 bg-red-500 h-full rounded-r-2xl transition-opacity ${offset < 0 ? 'opacity-100' : 'opacity-0'}`}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setOffset(0); // Close first
                            setTimeout(() => onDelete(), 10);
                        }}
                        className="text-white font-bold flex items-center gap-2 pointer-events-auto cursor-pointer"
                    >
                        Delete
                    </button>
                </div>
            </div>

            {/* Content */}
            <div
                className="relative bg-white rounded-2xl shadow-soft transition-transform duration-200 ease-out border border-stone-100"
                style={{ transform: `translateX(${offset}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
            >
                {children}
            </div>
        </div >
    );
};
