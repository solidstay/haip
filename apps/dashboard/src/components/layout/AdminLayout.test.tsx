import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
const auth = vi.hoisted(() => ({ admin: false, editor: false }));
vi.mock('../../lib/website', () => ({ websiteApiUrl: () => auth.editor ? 'https://content.example.test' : undefined }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => auth.admin }) }));
function setup(child: React.ReactNode) {
  render(<MemoryRouter initialEntries={['/admin/features']}><Routes>
    <Route path="/admin/features" element={<AdminLayout>{child}</AdminLayout>} />
    <Route path="/properties" element={<h1>Staff workspace</h1>} />
  </Routes></MemoryRouter>);
}
describe('Separate administration view', () => {
  it('shows the optional website page workspace only when configured', () => {
    auth.admin = true; auth.editor = true; setup(<h1>Admin features</h1>);
    expect(screen.getByRole('link', { name: 'Website pages' })).toHaveAttribute('href', '/admin/website/pages');
    auth.editor = false;
  });
  it('redirects staff without mounting configuration controls', () => {
    auth.admin = false;
    const mount = vi.fn();
    function Controls() { mount(); return <button>Save menu</button>; }
    setup(<Controls />);
    expect(screen.getByRole('heading', { name: 'Staff workspace' })).toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    expect(mount).not.toHaveBeenCalled();
  });
  it('gives administrators a separate workspace with a return to staff', () => {
    auth.admin = true; setup(<h1>Admin features</h1>);
    expect(screen.getByRole('heading', { name: 'Admin features' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to staff dashboard' })).toHaveAttribute('href', '/properties');
    expect(screen.getByRole('link', { name: 'Staff access' })).toHaveAttribute('href', '/admin/staff');
  });
});
