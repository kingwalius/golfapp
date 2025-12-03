import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCourses, useDB } from '../../lib/store';
import { SwipeableItem } from '../../components/SwipeableItem';

export const CourseList = () => {
    const { courses, loading, refresh } = useCourses();
    const db = useDB();
    const navigate = useNavigate();

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this course?')) {
            // Delete from server
            try {
                await fetch(`/courses/${id}`, { method: 'DELETE' });
            } catch (e) {
                console.error("Failed to delete from server", e);
            }

            // Delete from local DB
            if (db) {
                await db.delete('courses', id);
                refresh();
            }
        }
    };

    if (loading) return <div className="p-6 text-center text-muted">Loading courses...</div>;

    return (
        <div className="p-6 pb-24">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-primary">Courses</h1>
                    <p className="text-muted">Manage your golf courses.</p>
                </div>
                <Link to="/courses/new" className="bg-primary text-white w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-lg hover:scale-105 transition">
                    +
                </Link>
            </div>

            <div className="space-y-4">
                {courses.map(course => (
                    <SwipeableItem
                        key={course.id}
                        onDelete={() => handleDelete(course.id)}
                        onClick={() => navigate(`/courses/${course.id}`)}
                    >
                        <div className="p-5 flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-xl text-dark group-hover:text-primary transition">{course.name}</h3>
                                <div className="flex gap-4 mt-2 text-sm text-muted">
                                    <span className="bg-stone-100 px-2 py-1 rounded-md">Par {course.holes?.reduce((a, b) => a + (parseInt(b.par) || 0), 0)}</span>
                                    <span className="bg-stone-100 px-2 py-1 rounded-md">{course.holes?.length || 0} Holes</span>
                                </div>
                            </div>
                            <span className="text-stone-300 text-xl group-hover:text-primary transition">✎</span>
                        </div>
                    </SwipeableItem>
                ))}
                {courses.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-stone-200">
                        <p className="text-muted mb-4">No courses added yet.</p>
                        <Link to="/courses/new" className="text-primary font-bold hover:underline">Add your first course</Link>
                    </div>
                )}
            </div>
        </div>
    );
};
