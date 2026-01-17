/**
 * Placeholder Pages
 * Temporary placeholders for features to be implemented in Phase 2+
 */

import { Layout, PageHeader, Card } from '../components/layout/Layout';
import { Construction } from 'lucide-react';

function PlaceholderContent({ title, description }) {
  return (
    <Card>
      <div className="text-center py-12">
        <Construction className="h-12 w-12 text-text-muted mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-text mb-2">Coming Soon</h3>
        <p className="text-text-muted max-w-md mx-auto">
          {description || 'This feature is under development and will be available soon.'}
        </p>
      </div>
    </Card>
  );
}

export function ImageGenPage() {
  return (
    <Layout>
      <PageHeader
        title="Image Generation"
        description="Create AI-generated images with multiple models"
      />
      <PlaceholderContent description="Image generation with Seedream, Nano Banana, and Qwen models will be available in Phase 2." />
    </Layout>
  );
}

export function VideoGenPage() {
  return (
    <Layout>
      <PageHeader
        title="Video Generation"
        description="Create AI-generated videos"
      />
      <PlaceholderContent description="Video generation with Kling, WAN, and Veo models will be available in Phase 2." />
    </Layout>
  );
}

export function EditToolsPage() {
  return (
    <Layout>
      <PageHeader
        title="Edit Tools"
        description="Background removal, inpainting, and more"
      />
      <PlaceholderContent description="Editing tools including background removal, inpainting, and object eraser will be available in Phase 3." />
    </Layout>
  );
}

export function ChatPage() {
  return (
    <Layout>
      <PageHeader
        title="AI Chat"
        description="Chat with AI about images and get captions"
      />
      <PlaceholderContent description="AI chat and captioning features will be available in Phase 3." />
    </Layout>
  );
}

export function GalleryPage() {
  return (
    <Layout>
      <PageHeader
        title="Gallery"
        description="View and manage your generated content"
      />
      <PlaceholderContent description="Your gallery of generated images and videos will be available in Phase 3." />
    </Layout>
  );
}

// Admin Pages
export function TeamPage() {
  return (
    <Layout>
      <PageHeader
        title="Team Management"
        description="Manage your team members and permissions"
      />
      <PlaceholderContent description="Team management features will be available in Phase 4." />
    </Layout>
  );
}

export function UsagePage() {
  return (
    <Layout>
      <PageHeader
        title="Usage Statistics"
        description="View credit usage and analytics"
      />
      <PlaceholderContent description="Usage statistics and analytics will be available in Phase 4." />
    </Layout>
  );
}

export function BrandingPage() {
  return (
    <Layout>
      <PageHeader
        title="Branding"
        description="Customize your studio's appearance"
      />
      <PlaceholderContent description="Branding customization will be available in Phase 4." />
    </Layout>
  );
}

export function SettingsPage() {
  return (
    <Layout>
      <PageHeader
        title="Settings"
        description="Configure your agency settings"
      />
      <PlaceholderContent description="Settings configuration will be available in Phase 4." />
    </Layout>
  );
}
