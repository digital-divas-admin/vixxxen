-- Policies Schema for Terms of Service, Privacy Policy, Refund Policy
-- Run this in Supabase SQL Editor

-- 1. Create policies table
create table if not exists public.policies (
  id uuid default gen_random_uuid() primary key,
  type varchar(50) not null unique, -- 'terms', 'privacy', 'refund'
  title varchar(200) not null,
  content text not null,
  is_active boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create index for quick lookups
create index if not exists idx_policies_type on public.policies(type);

-- 3. RLS Policies
alter table public.policies enable row level security;

create policy "Anyone can view active policies"
  on public.policies for select
  using (is_active = true);

create policy "Admins can manage policies"
  on public.policies for all
  using (true);

-- 4. Insert default policies with placeholder content
insert into public.policies (type, title, content) values
  ('terms', 'Terms of Service', '<h2>Terms of Service</h2>
<p><strong>Last updated:</strong> [Date]</p>

<h3>1. Acceptance of Terms</h3>
<p>By accessing and using DivaForge ("the Service"), you agree to be bound by these Terms of Service.</p>

<h3>2. Description of Service</h3>
<p>DivaForge provides AI-powered image and video generation tools for creating digital content.</p>

<h3>3. User Accounts</h3>
<p>You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.</p>

<h3>4. Acceptable Use</h3>
<p>You agree not to use the Service to:</p>
<ul>
  <li>Generate illegal, harmful, or offensive content</li>
  <li>Violate any applicable laws or regulations</li>
  <li>Infringe on intellectual property rights</li>
  <li>Create deepfakes or non-consensual imagery of real people</li>
</ul>

<h3>5. Intellectual Property</h3>
<p>Content you generate using the Service is yours, subject to our usage policies and any applicable AI model licenses.</p>

<h3>6. Limitation of Liability</h3>
<p>The Service is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the Service.</p>

<h3>7. Changes to Terms</h3>
<p>We reserve the right to modify these terms at any time. Continued use of the Service constitutes acceptance of updated terms.</p>

<h3>8. Contact</h3>
<p>For questions about these Terms, contact us at admin@digitaldivas.ai</p>'),

  ('privacy', 'Privacy Policy', '<h2>Privacy Policy</h2>
<p><strong>Last updated:</strong> [Date]</p>

<h3>1. Information We Collect</h3>
<p>We collect information you provide directly:</p>
<ul>
  <li>Account information (email, name)</li>
  <li>Payment information (processed securely via Stripe)</li>
  <li>Content you generate and upload</li>
  <li>Usage data and analytics</li>
</ul>

<h3>2. How We Use Your Information</h3>
<p>We use your information to:</p>
<ul>
  <li>Provide and improve our services</li>
  <li>Process payments and manage subscriptions</li>
  <li>Send important service updates</li>
  <li>Respond to support requests</li>
</ul>

<h3>3. Data Storage and Security</h3>
<p>Your data is stored securely using industry-standard encryption. Generated images are stored in secure cloud storage.</p>

<h3>4. Data Sharing</h3>
<p>We do not sell your personal information. We may share data with:</p>
<ul>
  <li>Service providers (hosting, payment processing)</li>
  <li>Legal authorities when required by law</li>
</ul>

<h3>5. Your Rights</h3>
<p>You have the right to:</p>
<ul>
  <li>Access your personal data</li>
  <li>Request data deletion</li>
  <li>Export your data</li>
  <li>Opt out of marketing communications</li>
</ul>

<h3>6. Cookies</h3>
<p>We use cookies for authentication and analytics. You can control cookie settings in your browser.</p>

<h3>7. Contact</h3>
<p>For privacy inquiries, contact us at admin@digitaldivas.ai</p>'),

  ('refund', 'Refund Policy', '<h2>Refund Policy</h2>
<p><strong>Last updated:</strong> [Date]</p>

<h3>1. Subscription Refunds</h3>
<p>We offer refunds under the following conditions:</p>
<ul>
  <li><strong>Within 7 days:</strong> Full refund if you have not used more than 500 credits</li>
  <li><strong>After 7 days:</strong> Pro-rated refunds may be considered on a case-by-case basis</li>
</ul>

<h3>2. Credit Purchases</h3>
<p>One-time credit purchases are non-refundable once credits have been added to your account.</p>

<h3>3. Character Purchases</h3>
<p>AI Character purchases from the marketplace are non-refundable as they provide immediate access to digital content.</p>

<h3>4. How to Request a Refund</h3>
<p>To request a refund:</p>
<ol>
  <li>Email admin@digitaldivas.ai with your account email</li>
  <li>Include your reason for the refund request</li>
  <li>Allow 5-7 business days for processing</li>
</ol>

<h3>5. Chargebacks</h3>
<p>If you initiate a chargeback without first contacting us, your account may be suspended pending investigation.</p>

<h3>6. Exceptions</h3>
<p>Refunds may be denied if:</p>
<ul>
  <li>Terms of Service have been violated</li>
  <li>Fraudulent activity is detected</li>
  <li>Excessive refund requests are made</li>
</ul>

<h3>7. Contact</h3>
<p>For refund requests, contact admin@digitaldivas.ai</p>')
on conflict (type) do nothing;
