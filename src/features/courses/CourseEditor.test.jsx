
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

    // We need to implement Tees section first before we can test it
    // But this file is ready to be populated
});
