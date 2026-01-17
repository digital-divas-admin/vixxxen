/**
 * Agency Context
 * Manages agency configuration and theming
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

const AgencyContext = createContext(null);

const defaultBranding = {
  logo_url: null,
  favicon_url: null,
  app_name: 'Agency Studio',
  primary_color: '#6366f1',
  secondary_color: '#10b981',
};

const defaultFeatures = {
  image_gen: true,
  video_gen: true,
  editing: true,
  chat: true,
  nsfw_enabled: true,
  models_allowed: ['seedream', 'nanoBanana', 'qwen', 'kling', 'wan', 'veo'],
};

export function AgencyProvider({ children }) {
  const [agency, setAgency] = useState(null);
  const [branding, setBranding] = useState(defaultBranding);
  const [features, setFeatures] = useState(defaultFeatures);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load agency configuration on mount
  useEffect(() => {
    async function loadAgencyConfig() {
      try {
        const config = await api.getAgencyConfig();
        setAgency({
          id: config.id,
          name: config.name,
          slug: config.slug,
        });
        setBranding({ ...defaultBranding, ...config.branding });
        setFeatures({ ...defaultFeatures, ...config.features });
        setError(null);
      } catch (err) {
        console.error('Failed to load agency config:', err);
        setError(err.message);
        // Use defaults on error
      } finally {
        setLoading(false);
      }
    }

    loadAgencyConfig();
  }, []);

  // Apply branding to CSS variables
  useEffect(() => {
    if (!branding) return;

    const root = document.documentElement;

    if (branding.primary_color) {
      root.style.setProperty('--color-primary', branding.primary_color);
      // Generate hover variant (slightly darker)
      root.style.setProperty('--color-primary-hover', adjustColor(branding.primary_color, -15));
      root.style.setProperty('--color-primary-light', adjustColor(branding.primary_color, 20));
    }

    if (branding.secondary_color) {
      root.style.setProperty('--color-secondary', branding.secondary_color);
      root.style.setProperty('--color-secondary-hover', adjustColor(branding.secondary_color, -15));
    }

    // Update document title
    if (branding.app_name) {
      document.title = branding.app_name;
    }

    // Update favicon
    if (branding.favicon_url) {
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) {
        favicon.href = branding.favicon_url;
      }
    }
  }, [branding]);

  const updateBranding = async (newBranding) => {
    try {
      await api.updateAgencySettings({ branding: newBranding });
      setBranding((prev) => ({ ...prev, ...newBranding }));
    } catch (err) {
      console.error('Failed to update branding:', err);
      throw err;
    }
  };

  const value = {
    agency,
    branding,
    features,
    loading,
    error,
    updateBranding,
    isFeatureEnabled: (feature) => features[feature] ?? false,
  };

  return (
    <AgencyContext.Provider value={value}>
      {children}
    </AgencyContext.Provider>
  );
}

export function useAgency() {
  const context = useContext(AgencyContext);
  if (!context) {
    throw new Error('useAgency must be used within an AgencyProvider');
  }
  return context;
}

/**
 * Adjust a hex color by a percentage
 * Positive = lighter, Negative = darker
 */
function adjustColor(hex, percent) {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Adjust
  const adjust = (value) => {
    const adjusted = value + (value * percent) / 100;
    return Math.min(255, Math.max(0, Math.round(adjusted)));
  };

  const newR = adjust(r).toString(16).padStart(2, '0');
  const newG = adjust(g).toString(16).padStart(2, '0');
  const newB = adjust(b).toString(16).padStart(2, '0');

  return `#${newR}${newG}${newB}`;
}
