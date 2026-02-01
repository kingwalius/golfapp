import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useDB, useUser } from '../../lib/store';
import { ChevronLeft } from 'lucide-react';

const initialHoles = Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    hcp: i + 1,
    distance: 300
}));

export const CourseEditor = () => {
    const db = useDB();
    const { sync } = useUser();
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();

    const [course, setCourse] = useState({
        name: '',
        tees: [],
        holes: initialHoles
    });

    useEffect(() => {
        if (id && id !== 'new') {
            db.get('courses', parseInt(id)).then(c => {
                if (c) {
                    // Migration: If no tees, create default from slope/rating
                    if (!c.tees || !Array.isArray(c.tees) || c.tees.length === 0) {
                        c.tees = [{
                            id: 'default',
                            name: 'Standard',
                            color: 'white',
                            slope: c.slope || 113,
                            rating: c.rating || 72.0
                        }];
                    }
                    if (!Array.isArray(c.tees)) c.tees = []; // Fallback safety
                    setCourse(c);
                }
            });
        } // ... copy logic remains but needs similar migration if needed
    }, [db, id, location.state]);

    const addTee = () => {
        const newTee = {
            id: Date.now().toString(),
            name: 'New Tee',
            color: 'white',
            slope: 113,
            rating: 72.0
        };
        setCourse(prev => ({ ...prev, tees: [...(prev.tees || []), newTee] }));
    };

    const removeTee = (teeId) => {
        setCourse(prev => ({ ...prev, tees: prev.tees.filter(t => t.id !== teeId) }));
    };

    const updateTee = (teeId, field, value) => {
        setCourse(prev => ({
            ...prev,
            tees: prev.tees.map(t => t.id === teeId ? { ...t, [field]: value } : t)
        }));
    };

    const updateHole = (index, field, value) => {
        const newHoles = [...course.holes];
        newHoles[index] = { ...newHoles[index], [field]: parseInt(value) || 0 };
        setCourse({ ...course, holes: newHoles });
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);

        try {
            const courseData = {
                ...course,
                id: id && id !== 'new' ? parseInt(id) : Date.now(),
                updatedAt: new Date().toISOString(),
                synced: false,
                tees: course.tees.map(t => {
                    const safeRating = (val) => {
                        if (val === null || val === undefined) return 72.0;
                        if (typeof val === 'number') return val;
                        return parseFloat(val.toString().replace(',', '.')) || 72.0;
                    };
                    const safeSlope = (val) => {
                        if (val === null || val === undefined) return 113;
                        if (typeof val === 'number') return parseInt(val) || 113;
                        return parseInt(val) || 113;
                    };

                    return {
                        ...t,
                        slope: safeSlope(t.slope),
                        rating: safeRating(t.rating)
                    };
                })
            };

            await db.put('courses', courseData);

            // Force immediate sync to server to prevent data loss
            if (sync) {
                console.log("Forcing immediate sync after save...");
                await sync();
            }

            navigate('/courses');
        } catch (error) {
            console.error("Failed to save course:", error);
            alert(`Failed to save course: ${error.message}`);
            setIsSaving(false);
        }
    };

    return (
        <div className="p-4 max-w-lg mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => navigate('/courses')}
                    className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-2xl font-bold">
                    {id === 'new' ? 'New Course' : 'Edit Course'}
                </h1>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700">Course Name</label>
                    <input
                        type="text"
                        required
                        className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white transition"
                        placeholder="e.g. Pebble Beach"
                        value={course.name}
                        onChange={e => setCourse({ ...course, name: e.target.value })}
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="block text-sm font-bold text-gray-700">Tee Sets</label>
                        <button type="button" onClick={addTee} className="text-xs bg-dark text-white px-2 py-1 rounded">
                            + Add Tee
                        </button>
                    </div>

                    {(!course.tees || course.tees.length === 0) && (
                        <div className="text-sm text-gray-500 italic">No tees defined. Add one to start.</div>
                    )}

                    {course.tees && course.tees.map((tee, index) => (
                        <div key={tee.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-sm">Tee {index + 1}</span>
                                <button type="button" onClick={() => removeTee(tee.id)} className="text-red-500 text-xs">Remove</button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="text" placeholder="Name (e.g. White)"
                                    className="p-1 border rounded text-sm"
                                    value={tee.name} onChange={e => updateTee(tee.id, 'name', e.target.value)}
                                />
                                <select
                                    className="p-1 border rounded text-sm"
                                    value={tee.color} onChange={e => updateTee(tee.id, 'color', e.target.value)}
                                >
                                    <option value="white">White</option>
                                    <option value="yellow">Yellow</option>
                                    <option value="red">Red</option>
                                    <option value="blue">Blue</option>
                                    <option value="black">Black</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500">Slope</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        className="w-full p-1 border rounded text-sm"
                                        value={tee.slope} onChange={e => updateTee(tee.id, 'slope', e.target.value)}
                                        placeholder="113"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500">Rating</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full p-1 border rounded text-sm"
                                        value={tee.rating} onChange={e => updateTee(tee.id, 'rating', e.target.value)}
                                        placeholder="72.0"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-2">
                    <h3 className="font-medium">Holes</h3>
                    <div className="grid grid-cols-12 gap-2 text-xs font-bold text-center">
                        <div className="col-span-2">#</div>
                        <div className="col-span-3">Par</div>
                        <div className="col-span-3">HCP</div>
                        <div className="col-span-4">Dist (m)</div>
                    </div>
                    {course.holes.map((hole, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-2 text-center font-bold">{hole.number}</div>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    className="w-full p-1 border rounded text-center"
                                    value={hole.par}
                                    onChange={e => updateHole(i, 'par', e.target.value)}
                                />
                            </div>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    className="w-full p-1 border rounded text-center"
                                    value={hole.hcp}
                                    onChange={e => updateHole(i, 'hcp', e.target.value)}
                                />
                            </div>
                            <div className="col-span-4">
                                <input
                                    type="number"
                                    className="w-full p-1 border rounded text-center"
                                    value={hole.distance}
                                    onChange={e => updateHole(i, 'distance', e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    type="submit"
                    className="w-full bg-dark text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-black transition active:scale-95"
                >
                    Save Course
                </button>
            </form>
        </div>
    );
};
