import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCourses, useDB, useUser } from '../../lib/store';
import { SwipeableItem } from '../../components/SwipeableItem';
import { Search, Star, X } from 'lucide-react';
import { useState } from 'react';

export const CourseList = () => {
    const { courses, loading, refresh } = useCourses();
    const { user, toggleFavoriteCourse } = useUser();
    const db = useDB();
    const navigate = useNavigate();
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this course?')) {
            const courseToDelete = courses.find(c => c.id === id);

            // Delete from server if it has a server ID
            if (courseToDelete?.serverId) {
                try {
                    await fetch(`/courses/${courseToDelete.serverId}`, { method: 'DELETE' });
                } catch (e) {
                    console.error("Failed to delete from server", e);
                }
            } else if (courseToDelete?.synced && !courseToDelete.serverId) {
                // Edge case: synced but missing serverId? Treat id as serverId if it was downloaded
                // But usually downloaded courses have id == serverId
                try {
                    // Try deleting by ID just in case it aligns
                    await fetch(`/courses/${id}`, { method: 'DELETE' });
                } catch (e) { console.warn("Failed speculative delete", e); }
            }

            // Delete from local DB
            if (db) {
                await db.delete('courses', id);
                refresh();
            }
        }
    };

    const handleCopy = (course) => {
        navigate('/courses/new', { state: { copyCourse: course } });
    };

    if (loading) return <div className="p-6 text-center text-muted">Loading courses...</div>;

    return (
        <div className="p-6 pb-24">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-dark">Courses</h1>
                    <p className="text-muted">Manage your golf courses.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowSearch(true)}
                        className="bg-white text-dark w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-sm border border-stone-100 hover:scale-105 transition"
                    >
                        <Search size={24} />
                    </button>
                    <Link to="/courses/new" className="bg-dark text-white w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-lg hover:scale-105 transition">
                        +
                    </Link>
                </div>
            </div>

            {/* Search Overlay */}
            {showSearch && (
                <div className="fixed inset-0 z-50 bg-stone-50/95 backdrop-blur-sm p-6 animate-fade-in">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Search courses..."
                                className="w-full bg-white pl-12 pr-4 py-4 rounded-2xl shadow-sm border-none text-lg focus:ring-2 focus:ring-dark/20 outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => {
                                setShowSearch(false);
                                setSearchQuery('');
                            }}
                            className="w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-sm text-dark"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-3 overflow-y-auto max-h-[80vh] pb-20">
                        {courses
                            .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(course => {
                                const isFav = user?.favoriteCourses && (typeof user.favoriteCourses === 'string' ? JSON.parse(user.favoriteCourses) : user.favoriteCourses).includes(course.id);
                                return (
                                    <div key={course.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
                                        <div onClick={() => {
                                            navigate(`/courses/${course.id}`);
                                            setShowSearch(false);
                                        }}>
                                            <h3 className="font-bold text-lg text-dark">{course.name}</h3>
                                            <p className="text-sm text-muted">{course.holes?.length || 0} Holes • Par {course.holes?.reduce((a, b) => a + (parseInt(b.par) || 0), 0)}</p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleFavoriteCourse(course.id);
                                            }}
                                            className="p-2"
                                        >
                                            <Star
                                                size={24}
                                                className={isFav ? "fill-yellow-400 text-yellow-400" : "text-stone-300"}
                                            />
                                        </button>
                                    </div>
                                );
                            })}
                        {searchQuery && courses.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                            <p className="text-center text-muted mt-8">No courses found.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Favorites Section */}
            {user?.favoriteCourses && (typeof user.favoriteCourses === 'string' ? JSON.parse(user.favoriteCourses) : user.favoriteCourses).length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 ml-1">Favorites</h2>
                    <div className="space-y-4">
                        {courses
                            .filter(c => {
                                const favs = typeof user.favoriteCourses === 'string' ? JSON.parse(user.favoriteCourses) : user.favoriteCourses;
                                return favs.includes(c.id);
                            })
                            .map(course => (
                                <SwipeableItem
                                    key={course.id}
                                    onDelete={() => handleDelete(course.id)}
                                    onCopy={() => handleCopy(course)}
                                    onClick={() => navigate(`/courses/${course.id}`)}
                                >
                                    <div className="p-5 flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Star size={16} className="fill-yellow-400 text-yellow-400" />
                                                <h3 className="font-bold text-xl text-dark group-hover:text-dark transition">{course.name}</h3>
                                            </div>
                                            <div className="flex gap-4 mt-2 text-sm text-muted">
                                                <span className="bg-stone-100 px-2 py-1 rounded-md">Par {course.holes?.reduce((a, b) => a + (parseInt(b.par) || 0), 0)}</span>
                                                <span className="bg-stone-100 px-2 py-1 rounded-md">{course.holes?.length || 0} Holes</span>
                                            </div>
                                        </div>
                                        <span className="text-stone-300 text-xl group-hover:text-dark transition">✎</span>
                                    </div>
                                </SwipeableItem>
                            ))}
                    </div>
                </div>
            )}

            <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 ml-1">All Courses</h2>
            <div className="space-y-4">
                {courses.map(course => (
                    <SwipeableItem
                        key={course.id}
                        onDelete={() => handleDelete(course.id)}
                        onCopy={() => handleCopy(course)}
                        onClick={() => navigate(`/courses/${course.id}`)}
                    >
                        <div className="p-5 flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-xl text-dark group-hover:text-dark transition">{course.name}</h3>
                                <div className="flex gap-4 mt-2 text-sm text-muted">
                                    <span className="bg-stone-100 px-2 py-1 rounded-md">Par {course.holes?.reduce((a, b) => a + (parseInt(b.par) || 0), 0)}</span>
                                    <span className="bg-stone-100 px-2 py-1 rounded-md">{course.holes?.length || 0} Holes</span>
                                </div>
                            </div>
                            <span className="text-stone-300 text-xl group-hover:text-dark transition">✎</span>
                        </div>
                    </SwipeableItem>
                ))}
                {courses.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-stone-200">
                        <p className="text-muted mb-4">No courses added yet.</p>
                        <Link to="/courses/new" className="text-dark font-bold hover:underline">Add your first course</Link>
                    </div>
                )}
            </div>
        </div>
    );
};
