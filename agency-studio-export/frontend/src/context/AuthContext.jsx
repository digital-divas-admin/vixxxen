/**
 * Auth Context
 * Manages user authentication state
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [agencyUser, setAgencyUser] = useState(null);
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadUserProfile();
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        await loadUserProfile();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setAgencyUser(null);
        setCredits(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user profile from our API
  const loadUserProfile = async () => {
    try {
      const data = await api.getMe();
      setAgencyUser(data.user);
      setCredits(data.credits);
      setError(null);
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setError(err.message);
      // If user doesn't have access to this agency, sign them out
      if (err.status === 403) {
        await signOut();
      }
    } finally {
      setLoading(false);
    }
  };

  // Sign in with email/password
  const signIn = async (email, password) => {
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      throw error;
    }

    return data;
  };

  // Sign up (for invited users)
  const signUp = async (email, password, name) => {
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      setError(error.message);
      throw error;
    }

    return data;
  };

  // Sign out
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
    }
    setUser(null);
    setAgencyUser(null);
    setCredits(null);
  };

  // Reset password
  const resetPassword = async (email) => {
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      throw error;
    }
  };

  // Refresh credits
  const refreshCredits = async () => {
    if (!user) return;
    try {
      const data = await api.getMe();
      setCredits(data.credits);
    } catch (err) {
      console.error('Failed to refresh credits:', err);
    }
  };

  const value = {
    user,
    agencyUser,
    credits,
    loading,
    error,
    isAuthenticated: !!user && !!agencyUser,
    isAdmin: agencyUser?.role === 'admin' || agencyUser?.role === 'owner',
    isOwner: agencyUser?.role === 'owner',
    signIn,
    signUp,
    signOut,
    resetPassword,
    refreshCredits,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
