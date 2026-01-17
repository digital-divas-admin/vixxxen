/**
 * App Component
 * Main application with routing
 */

import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import {
  ImageGenPage,
  VideoGenPage,
  EditToolsPage,
  ChatPage,
  GalleryPage,
  TeamPage,
  UsagePage,
  BrandingPage,
  SettingsPage,
} from './pages/Placeholder';

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Generation Routes */}
      <Route
        path="/generate/image"
        element={
          <ProtectedRoute>
            <ImageGenPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/generate/video"
        element={
          <ProtectedRoute>
            <VideoGenPage />
          </ProtectedRoute>
        }
      />

      {/* Tool Routes */}
      <Route
        path="/edit"
        element={
          <ProtectedRoute>
            <EditToolsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gallery"
        element={
          <ProtectedRoute>
            <GalleryPage />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/team"
        element={
          <ProtectedRoute requireAdmin>
            <TeamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/usage"
        element={
          <ProtectedRoute requireAdmin>
            <UsagePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/branding"
        element={
          <ProtectedRoute requireAdmin>
            <BrandingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute requireAdmin>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      {/* 404 */}
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-text mb-2">404</h1>
              <p className="text-text-muted">Page not found</p>
            </div>
          </div>
        }
      />
    </Routes>
  );
}

export default App;
