/**
 * Sidebar Component
 * Main navigation sidebar
 */

import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Image,
  Video,
  Wand2,
  MessageSquare,
  FolderOpen,
  Users,
  BarChart3,
  Palette,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAgency } from '../../context/AgencyContext';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/generate/image', icon: Image, label: 'Image Generation' },
  { to: '/generate/video', icon: Video, label: 'Video Generation' },
  { to: '/edit', icon: Wand2, label: 'Edit Tools' },
  { to: '/chat', icon: MessageSquare, label: 'AI Chat' },
  { to: '/gallery', icon: FolderOpen, label: 'Gallery' },
];

const adminNavItems = [
  { to: '/admin/team', icon: Users, label: 'Team' },
  { to: '/admin/usage', icon: BarChart3, label: 'Usage' },
  { to: '/admin/branding', icon: Palette, label: 'Branding' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-white'
            : 'text-text-muted hover:text-text hover:bg-surface-elevated'
        )
      }
    >
      <Icon className="h-5 w-5" />
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  const { agencyUser, signOut, credits } = useAuth();
  const { branding, features } = useAgency();

  // Filter nav items based on enabled features
  const filteredMainNav = mainNavItems.filter((item) => {
    if (item.to === '/generate/image' && !features.image_gen) return false;
    if (item.to === '/generate/video' && !features.video_gen) return false;
    if (item.to === '/edit' && !features.editing) return false;
    if (item.to === '/chat' && !features.chat) return false;
    return true;
  });

  const isAdmin = agencyUser?.role === 'admin' || agencyUser?.role === 'owner';

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.app_name}
              className="h-8 w-8 object-contain"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold">
              {branding.app_name?.charAt(0) || 'A'}
            </div>
          )}
          <span className="font-semibold text-text">{branding.app_name}</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {filteredMainNav.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        {/* Admin Section */}
        {isAdmin && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                Admin
              </p>
            </div>
            {adminNavItems.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* Credits Display */}
      {credits && (
        <div className="p-4 border-t border-border">
          <div className="bg-surface-elevated rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Credits Remaining</p>
            <p className="text-lg font-semibold text-text">
              {credits.agencyPool?.toLocaleString() || 0}
            </p>
            {credits.userLimit !== null && (
              <p className="text-xs text-text-muted mt-1">
                Your limit: {(credits.userLimit - credits.userUsedThisCycle).toLocaleString()} left
              </p>
            )}
          </div>
        </div>
      )}

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
              {agencyUser?.name?.charAt(0) || agencyUser?.email?.charAt(0) || '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text truncate">
                {agencyUser?.name || 'User'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {agencyUser?.role}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
