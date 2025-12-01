import React, { useState, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';

export const CourseSelectionModal = ({ isOpen, onClose, onSelect, courses, selectedCourseId }) => {
    const [searchQuery, setSearchQuery] = useState('');

    // Reset search when modal opens
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredCourses = courses.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-white z-10">
                    <h2 className="text-xl font-bold text-dark">Select Course</h2>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-dark transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
                            <Search size={20} />
                        </span>
                        <input
                            type="text"
                            placeholder="Search courses..."
                            className="input-field pl-12 bg-white"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Course List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="space-y-3">
                        {filteredCourses.map(c => (
                            <button
                                key={c.id}
                                onClick={() => {
                                    onSelect(c);
                                    onClose();
                                }}
                                className={`
                                    w-full text-left relative p-4 rounded-xl border-2 transition-all duration-200 group
                                    ${selectedCourseId === c.id.toString()
                                        ? 'border-primary bg-primary/5 shadow-md'
                                        : 'border-stone-100 bg-white hover:border-primary/30 hover:shadow-soft'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className={`font-bold text-lg mb-1 ${selectedCourseId === c.id.toString() ? 'text-primary' : 'text-dark'}`}>
                                            {c.name}
                                        </h3>
                                        <div className="flex items-center gap-2 text-sm text-muted">
                                            <span>{c.holes?.length || 18} Holes</span>
                                            <span>•</span>
                                            <span>Par {c.holes ? c.holes.reduce((sum, h) => sum + (h.par || 0), 0) : 72}</span>
                                        </div>
                                    </div>
                                    {selectedCourseId === c.id.toString() && (
                                        <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm">
                                            <Check size={16} />
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}

                        {filteredCourses.length === 0 && (
                            <div className="text-center py-12 text-muted">
                                <p>No courses found matching "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
