import type { ReactNode } from 'react';
import { Link, NavLink, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { websiteApiUrl } from '../../lib/website';

/** Separate administration workspace. Staff never mount its page or controls. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { hasRole } = useAuth();
  const { t } = useTranslation();
  if (!hasRole('admin')) return <Navigate to="/properties" replace />;
  return <div className="min-h-screen bg-telivity-light-grey">
    <header className="border-b border-gray-200 bg-white px-4 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 py-3">
        <p className="font-semibold text-telivity-navy">{t('adminFeatures.administration')}</p>
        <Link to="/properties" className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-telivity-navy hover:bg-telivity-light-grey">{t('adminFeatures.backToStaff')}</Link>
      </div>
    </header>
    {<nav aria-label={t('adminFeatures.administration')} className="mx-auto flex max-w-5xl flex-wrap gap-4 border-b border-gray-200 px-4 sm:px-8">
      <NavLink to="/admin/features" className={({ isActive }) => `inline-flex min-h-[48px] items-center border-b-2 text-sm font-medium ${isActive ? 'border-telivity-teal text-telivity-navy' : 'border-transparent text-telivity-slate'}`}>{t('adminFeatures.title')}</NavLink>
      <NavLink to="/admin/staff" className={({ isActive }) => `inline-flex min-h-[48px] items-center border-b-2 text-sm font-medium ${isActive ? 'border-telivity-teal text-telivity-navy' : 'border-transparent text-telivity-slate'}`}>Staff access</NavLink>
      {websiteApiUrl() && <NavLink to="/admin/website/pages" className={({ isActive }) => `inline-flex min-h-[48px] items-center border-b-2 text-sm font-medium ${isActive ? 'border-telivity-teal text-telivity-navy' : 'border-transparent text-telivity-slate'}`}>{t('websitePages.title', { defaultValue: 'Website pages' })}</NavLink>}
    </nav>}
    <main className="mx-auto max-w-5xl p-4 sm:p-8">{children}</main>
  </div>;
}
