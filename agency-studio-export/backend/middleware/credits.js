/**
 * Credits Middleware
 * Handles credit checking and deduction for generation operations
 */

const { supabaseAdmin } = require('../services/supabase');
const { logger } = require('../services/logger');
const { config } = require('../config');

/**
 * Check if agency has sufficient credits for an operation
 * Returns middleware function for specific operation type
 */
function requireCredits(operationType) {
  const creditCost = config.creditCosts[operationType];

  if (creditCost === undefined) {
    throw new Error(`Unknown operation type: ${operationType}`);
  }

  return async (req, res, next) => {
    try {
      if (!req.agency || !req.agencyUser) {
        return res.status(400).json({ error: 'Agency and user context required' });
      }

      const { agency, agencyUser } = req;

      // Check agency pool
      if (agency.credit_pool < creditCost) {
        logger.warn(`Agency ${agency.id} has insufficient credits: ${agency.credit_pool} < ${creditCost}`);
        return res.status(402).json({
          error: 'Insufficient credits',
          required: creditCost,
          available: agency.credit_pool,
          message: 'Your agency has run out of credits. Please contact your administrator.',
        });
      }

      // Check user limit if set
      if (agencyUser.credit_limit !== null) {
        const userRemaining = agencyUser.credit_limit - agencyUser.credits_used_this_cycle;
        if (userRemaining < creditCost) {
          logger.warn(`User ${agencyUser.id} has insufficient credits: ${userRemaining} < ${creditCost}`);
          return res.status(402).json({
            error: 'User credit limit reached',
            required: creditCost,
            available: userRemaining,
            message: 'You have reached your monthly credit limit. Please contact your administrator.',
          });
        }
      }

      // Attach credit info to request for later deduction
      req.creditCost = creditCost;
      req.operationType = operationType;

      next();
    } catch (error) {
      logger.error('Credit check error:', error);
      res.status(500).json({ error: 'Error checking credits' });
    }
  };
}

/**
 * Deduct credits after successful operation
 * Call this after the generation succeeds
 */
async function deductCredits(req) {
  const { agency, agencyUser, creditCost, operationType } = req;

  if (!creditCost || !agency || !agencyUser) {
    logger.warn('Cannot deduct credits - missing context');
    return false;
  }

  try {
    // Deduct from agency pool
    const { error: agencyError } = await supabaseAdmin
      .from('agencies')
      .update({
        credit_pool: agency.credit_pool - creditCost,
        credits_used_this_cycle: agency.credits_used_this_cycle + creditCost,
      })
      .eq('id', agency.id);

    if (agencyError) {
      logger.error('Failed to deduct agency credits:', agencyError);
      return false;
    }

    // Update user's usage
    const { error: userError } = await supabaseAdmin
      .from('agency_users')
      .update({
        credits_used_this_cycle: agencyUser.credits_used_this_cycle + creditCost,
      })
      .eq('id', agencyUser.id);

    if (userError) {
      logger.error('Failed to update user credit usage:', userError);
      // Don't fail - agency was already charged
    }

    logger.info(`Deducted ${creditCost} credits for ${operationType} from agency ${agency.id}, user ${agencyUser.id}`);
    return true;
  } catch (error) {
    logger.error('Credit deduction error:', error);
    return false;
  }
}

/**
 * Get credit balance for the current user
 */
async function getCreditBalance(agency, agencyUser) {
  return {
    agencyPool: agency.credit_pool,
    agencyUsedThisCycle: agency.credits_used_this_cycle,
    agencyMonthlyAllocation: agency.monthly_credit_allocation,
    userUsedThisCycle: agencyUser.credits_used_this_cycle,
    userLimit: agencyUser.credit_limit,
    userRemaining: agencyUser.credit_limit !== null
      ? agencyUser.credit_limit - agencyUser.credits_used_this_cycle
      : null, // null means unlimited from pool
  };
}

module.exports = { requireCredits, deductCredits, getCreditBalance };
