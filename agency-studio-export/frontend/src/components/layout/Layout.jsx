/**
 * Layout Component
 * Main application layout with sidebar
 */

import { Sidebar } from './Sidebar';

export function Layout({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

/**
 * Page Header Component
 * Consistent header for pages
 */
export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-text">{title}</h1>
        {description && (
          <p className="mt-1 text-text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

/**
 * Card Component
 * Container for content sections
 */
export function Card({ children, className, ...props }) {
  return (
    <div
      className={`bg-surface rounded-xl border border-border p-6 ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  );
}
