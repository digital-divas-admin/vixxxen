/**
 * Team Management Routes
 * Handles user invitations, role management, and team administration
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../services/supabase');
const { requireAuth, requireAdmin, requireOwner } = require('../middleware/auth');
const { logger } = require('../services/logger');

/**
 * GET /api/team
 * List all team members
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { agency, agencyUser } = req;

    // All users can see team list, but only admins see email addresses
    const isAdmin = ['owner', 'admin'].includes(agencyUser.role);

    const { data: users, error } = await supabaseAdmin
      .from('agency_users')
      .select('id, name, email, role, status, credits_used_this_cycle, credit_limit, last_active_at, joined_at')
      .eq('agency_id', agency.id)
      .order('role', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      logger.error('Error fetching team:', error);
      return res.status(500).json({ error: 'Failed to fetch team' });
    }

    // Mask emails for non-admins
    const sanitizedUsers = users.map((u) => ({
      ...u,
      email: isAdmin ? u.email : maskEmail(u.email),
    }));

    res.json({ users: sanitizedUsers });
  } catch (error) {
    logger.error('Error fetching team:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

/**
 * POST /api/team/invite
 * Invite a new user to the agency (admin only)
 */
router.post('/invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { agency } = req;
    const { email, name, role = 'member', credit_limit = null } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate role - admins can only invite members, owners can invite anyone
    const allowedRoles = req.agencyUser.role === 'owner'
      ? ['member', 'admin']
      : ['member'];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: `You cannot invite users with role: ${role}` });
    }

    // Check if user already exists in this agency
    const { data: existing } = await supabaseAdmin
      .from('agency_users')
      .select('id, status')
      .eq('agency_id', agency.id)
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      if (existing.status === 'active') {
        return res.status(409).json({ error: 'User is already a member of this agency' });
      } else {
        // Reactivate suspended/invited user
        const { error } = await supabaseAdmin
          .from('agency_users')
          .update({ status: 'invited', role, credit_limit, invited_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (error) {
          return res.status(500).json({ error: 'Failed to reinvite user' });
        }

        // TODO: Send invite email
        return res.json({ message: 'User reinvited successfully' });
      }
    }

    // Check user limit
    const { count } = await supabaseAdmin
      .from('agency_users')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .in('status', ['active', 'invited']);

    // Get plan limits
    const { data: plan } = await supabaseAdmin
      .from('agency_plans')
      .select('max_users')
      .eq('id', agency.plan_id)
      .single();

    if (plan && count >= plan.max_users) {
      return res.status(403).json({
        error: 'User limit reached',
        message: `Your plan allows ${plan.max_users} users. Please upgrade to add more.`,
      });
    }

    // Create invited user record
    const { data: newUser, error } = await supabaseAdmin
      .from('agency_users')
      .insert({
        agency_id: agency.id,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        role,
        credit_limit,
        status: 'invited',
        invited_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating invited user:', error);
      return res.status(500).json({ error: 'Failed to invite user' });
    }

    // TODO: Send invite email via Resend
    // For now, return the invite info

    logger.info(`User ${email} invited to agency ${agency.id} by ${req.agencyUser.email}`);

    res.status(201).json({
      message: 'User invited successfully',
      user: newUser,
      // In a real implementation, this would be a secure invite link
      inviteNote: 'User will receive an email invitation to join.',
    });
  } catch (error) {
    logger.error('Error inviting user:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

/**
 * PUT /api/team/:userId
 * Update a team member (admin only)
 */
router.put('/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { agency, agencyUser } = req;
    const { userId } = req.params;
    const { name, role, credit_limit, status } = req.body;

    // Fetch target user
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('agency_users')
      .select('*')
      .eq('id', userId)
      .eq('agency_id', agency.id)
      .single();

    if (fetchError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-demotion for owner
    if (targetUser.id === agencyUser.id && role && role !== agencyUser.role) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    // Only owner can change roles to/from admin
    if (role && (role === 'admin' || targetUser.role === 'admin') && agencyUser.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can modify admin roles' });
    }

    // Cannot change owner's role
    if (targetUser.role === 'owner' && role && role !== 'owner') {
      return res.status(403).json({ error: 'Cannot change the owner\'s role' });
    }

    // Build update object
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined && role !== 'owner') updates.role = role;
    if (credit_limit !== undefined) updates.credit_limit = credit_limit;
    if (status !== undefined && ['active', 'suspended'].includes(status)) {
      // Cannot suspend owner
      if (targetUser.role === 'owner' && status === 'suspended') {
        return res.status(403).json({ error: 'Cannot suspend the owner' });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('agency_users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      logger.error('Error updating user:', updateError);
      return res.status(500).json({ error: 'Failed to update user' });
    }

    logger.info(`User ${userId} updated by ${agencyUser.email}: ${JSON.stringify(updates)}`);

    res.json({ user: updatedUser });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/team/:userId
 * Remove a team member (admin only)
 */
router.delete('/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { agency, agencyUser } = req;
    const { userId } = req.params;

    // Fetch target user
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('agency_users')
      .select('*')
      .eq('id', userId)
      .eq('agency_id', agency.id)
      .single();

    if (fetchError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot delete yourself
    if (targetUser.id === agencyUser.id) {
      return res.status(403).json({ error: 'You cannot remove yourself' });
    }

    // Cannot delete owner
    if (targetUser.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove the owner' });
    }

    // Only owner can delete admins
    if (targetUser.role === 'admin' && agencyUser.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can remove admins' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('agency_users')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      logger.error('Error deleting user:', deleteError);
      return res.status(500).json({ error: 'Failed to remove user' });
    }

    logger.info(`User ${userId} removed from agency ${agency.id} by ${agencyUser.email}`);

    res.json({ message: 'User removed successfully' });
  } catch (error) {
    logger.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

/**
 * Helper: Mask email for privacy
 */
function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${local[1]}***@${domain}`;
}

module.exports = router;
