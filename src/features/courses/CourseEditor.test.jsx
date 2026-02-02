
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseEditor } from './CourseEditor';
import { DBProvider } from '../../lib/store';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

// Mock DB
const mockDB = {
    get: vi.fn(),
    put: vi.fn(),
    getAll: vi.fn(),
    add: vi.fn()
};

// Mock useDB hook
vi.mock('../../lib/store', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useDB: () => mockDB
    };
});

describe('CourseEditor', () => {
    it('renders new course form', () => {
        render(
            <MemoryRouter initialEntries={['/courses/new']}>
                <Routes>
                    <Route path="/courses/:id" element={<CourseEditor />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText('New Course')).toBeInTheDocument();
        expect(screen.getByLabelText('Course Name')).toBeInTheDocument();
    });

    it('handles adding and saving a tee correctly', async () => {
        const user = { name: 'Test User', token: 'test-token' };
        localStorage.setItem('golf_user', JSON.stringify(user));

        render(
            <DBProvider>
                <MemoryRouter initialEntries={['/courses/new']}>
                    <Routes>
                        <Route path="/courses/:id" element={<CourseEditor />} />
                    </Routes>
                </MemoryRouter>
            </DBProvider>
        );

        // Add a tee
        const addBtn = screen.getByText('+ Add Tee');
        fireEvent.click(addBtn);

        // Check if Tee 1 appears
        expect(screen.getByText('Tee 1')).toBeInTheDocument();

        // Save
        const saveBtn = screen.getByText('Save Course');
        fireEvent.click(saveBtn);

        // Expect db.put to be called
        // We need to wait for async
        await vi.waitFor(() => {
            expect(mockDB.put).toHaveBeenCalledWith('courses', expect.objectContaining({
                name: '',
                tees: expect.arrayContaining([
                    expect.objectContaining({
                        name: 'New Tee',
                        slope: 113,
                        rating: 72.0
                    })
                ])
            }));
        });
    });
});
