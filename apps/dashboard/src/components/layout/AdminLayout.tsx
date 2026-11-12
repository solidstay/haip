import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

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
    <main className="mx-auto max-w-5xl p-4 sm:p-8">{children}</main>
  </div>;
}
