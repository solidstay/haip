import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
const auth = vi.hoisted(() => ({ admin: false }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => auth.admin }) }));
function setup(child: React.ReactNode) {
  render(<MemoryRouter initialEntries={['/admin/features']}><Routes>
    <Route path="/admin/features" element={<AdminLayout>{child}</AdminLayout>} />
    <Route path="/properties" element={<h1>Staff workspace</h1>} />
  </Routes></MemoryRouter>);
}
describe('Separate administration view', () => {
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
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
