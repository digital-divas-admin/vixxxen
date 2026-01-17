/**
 * Dashboard Page
 * Main dashboard with overview and quick actions
 */

import { Link } from 'react-router-dom';
import {
  Image,
  Video,
  Wand2,
  MessageSquare,
  ArrowRight,
  Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAgency } from '../context/AgencyContext';
import { Layout, PageHeader, Card } from '../components/layout/Layout';

const quickActions = [
  {
    to: '/generate/image',
    icon: Image,
    label: 'Generate Image',
    description: 'Create AI-generated images',
    feature: 'image_gen',
  },
  {
    to: '/generate/video',
    icon: Video,
    label: 'Generate Video',
    description: 'Create AI-generated videos',
    feature: 'video_gen',
  },
  {
    to: '/edit',
    icon: Wand2,
    label: 'Edit Tools',
    description: 'Background removal, inpainting',
    feature: 'editing',
  },
  {
    to: '/chat',
    icon: MessageSquare,
    label: 'AI Chat',
    description: 'Chat with AI about images',
    feature: 'chat',
  },
];

export function DashboardPage() {
  const { agencyUser, credits } = useAuth();
  const { branding, features } = useAgency();

  const filteredActions = quickActions.filter(
    (action) => features[action.feature]
  );

  return (
    <Layout>
      <PageHeader
        title={`Welcome back, ${agencyUser?.name || 'User'}`}
        description="What would you like to create today?"
      />

      {/* Credits Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-text-muted">Credits Available</p>
            <p className="text-2xl font-bold text-text">
              {credits?.agencyPool?.toLocaleString() || 0}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-secondary/10">
            <Zap className="h-6 w-6 text-secondary" />
          </div>
          <div>
            <p className="text-sm text-text-muted">Used This Month</p>
            <p className="text-2xl font-bold text-text">
              {credits?.agencyUsedThisCycle?.toLocaleString() || 0}
            </p>
          </div>
        </Card>

        {credits?.userLimit !== null && (
          <Card className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-orange-500/10">
              <Zap className="h-6 w-6 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-text-muted">Your Limit Remaining</p>
              <p className="text-2xl font-bold text-text">
                {(credits.userLimit - credits.userUsedThisCycle).toLocaleString()}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-semibold text-text mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredActions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="group bg-surface rounded-xl border border-border p-6 hover:border-primary transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-lg bg-surface-elevated group-hover:bg-primary/10 transition-colors">
                <action.icon className="h-6 w-6 text-text-muted group-hover:text-primary transition-colors" />
              </div>
              <ArrowRight className="h-5 w-5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h3 className="mt-4 font-semibold text-text">{action.label}</h3>
            <p className="mt-1 text-sm text-text-muted">{action.description}</p>
          </Link>
        ))}
      </div>

      {/* Recent Activity Placeholder */}
      <h2 className="text-lg font-semibold text-text mt-8 mb-4">Recent Activity</h2>
      <Card>
        <div className="text-center py-8">
          <p className="text-text-muted">No recent activity yet.</p>
          <p className="text-sm text-text-muted mt-1">
            Start creating to see your history here.
          </p>
        </div>
      </Card>
    </Layout>
  );
}
