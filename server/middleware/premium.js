/**
 * Premium plan middleware.
 * Must be used AFTER requireAuth (req.user must be populated).
 *
 * Checks agencies.plan === 'premium' for the authenticated user's agency.
 * Returns 403 with { error: 'PREMIUM_REQUIRED' } if not premium.
 */
import supabaseAdmin from '../lib/supabaseAdmin.js'

export async function requirePremium(req, res, next) {
  try {
    // In dev bypass mode req.user.agency_id may be null — allow through
    if (!req.user?.agency_id) {
      if (process.env.NODE_ENV !== 'production') return next()
      return res.status(403).json({ error: 'PREMIUM_REQUIRED', message: 'Premium plan required.' })
    }

    const { data: agency, error } = await supabaseAdmin
      .from('agencies')
      .select('plan')
      .eq('id', req.user.agency_id)
      .maybeSingle()

    if (error || !agency) {
      return res.status(403).json({ error: 'PREMIUM_REQUIRED', message: 'Agency not found.' })
    }

    if (agency.plan !== 'premium') {
      return res.status(403).json({
        error: 'PREMIUM_REQUIRED',
        message: 'This feature requires a Premium plan. Upgrade your agency to unlock the Basket of Cases.',
      })
    }

    next()
  } catch (err) {
    console.error('[premium] check error:', err.message)
    res.status(500).json({ error: 'Internal error checking plan' })
  }
}
