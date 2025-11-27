import React from 'react';
import { Link } from 'react-router-dom';
import { useCourses } from '../../lib/store';

export const CourseList = () => {
    const { courses, loading } = useCourses();

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
                    <Link
                        key={course.id}
                        to={`/courses/${course.id}`}
                        className="block bg-white p-5 rounded-2xl border border-stone-100 shadow-soft hover:shadow-card transition group"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-xl text-dark group-hover:text-primary transition">{course.name}</h3>
                                <div className="flex gap-4 mt-2 text-sm text-muted">
                                    <span className="bg-stone-100 px-2 py-1 rounded-md">Par {course.holes?.reduce((a, b) => a + (parseInt(b.par) || 0), 0)}</span>
                                    <span className="bg-stone-100 px-2 py-1 rounded-md">{course.holes?.length || 0} Holes</span>
                                </div>
                            </div>
                            <span className="text-stone-300 text-xl group-hover:text-primary transition">✎</span>
                        </div>
                    </Link>
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
