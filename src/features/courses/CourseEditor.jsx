import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDB } from '../../lib/store';

const initialHoles = Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    hcp: i + 1,
    distance: 300
}));

export const CourseEditor = () => {
    const db = useDB();
    const navigate = useNavigate();
    const { id } = useParams();

    const [course, setCourse] = useState({
        name: '',
        slope: 113,
        rating: 72.0,
        holes: initialHoles
    });

    useEffect(() => {
        if (id && id !== 'new') {
            db.get('courses', parseInt(id)).then(c => {
                if (c) setCourse(c);
            });
        }
    }, [db, id]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Save to server
        try {
            const isNew = id === 'new';
            const endpoint = isNew ? '/courses' : `/courses/${id}`;
            const method = isNew ? 'POST' : 'PUT';

            const totalPar = course.holes.reduce((sum, hole) => sum + (parseInt(hole.par) || 0), 0);
            const payload = { ...course, par: totalPar };

            const res = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                // If server returns ID, use it (though we might want to keep local ID logic separate or synced)
                // For now, let's just save locally too to be safe/offline-first
                // Ideally, we should use the server ID if we want global sync.
                // But local DB uses auto-increment. 
                // Let's just save locally as before, but maybe we should re-fetch from server?
            }
        } catch (err) {
            console.error("Failed to save course to server", err);
        }

        await db.put('courses', course);
        navigate('/courses');
    };

    const updateHole = (index, field, value) => {
        const newHoles = [...course.holes];
        newHoles[index] = { ...newHoles[index], [field]: parseInt(value) || 0 };
        setCourse({ ...course, holes: newHoles });
    };

    return (
        <div className="p-4 max-w-lg mx-auto">
            <h2 className="text-2xl font-bold mb-4">{id === 'new' ? 'New Course' : 'Edit Course'}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Course Name</label>
                    <input
                        type="text"
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary p-2 border"
                        value={course.name}
                        onChange={e => setCourse({ ...course, name: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Slope</label>
                        <input
                            type="number"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary p-2 border"
                            value={course.slope}
                            onChange={e => setCourse({ ...course, slope: parseInt(e.target.value) })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Course Rating</label>
                        <input
                            type="number"
                            step="0.1"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary p-2 border"
                            value={course.rating}
                            onChange={e => setCourse({ ...course, rating: parseFloat(e.target.value) })}
                        />
                    </div>
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
                    className="w-full bg-primary text-white py-3 rounded-lg font-bold shadow-lg hover:bg-teal-800 transition"
                >
                    Save Course
                </button>
            </form>
        </div>
    );
};
