// Cross-surface link destinations that MOVE between apps during the content /
// app separation, so they must never be hardcoded as same-origin paths.
//
// INTEREST_FORM_URL — the public partner interest form. The affiliate program is
// INVITE-ONLY, so the portal's login page must not send people to the
// invite-gated /affiliate-register flow; it sends them here instead.
//
// WHY THIS IS CONFIG AND NOT A LITERAL: the interest form (public/affiliate.html,
// route /affiliate) MOVES out of this app and into the content app
// (crhs-corporate, atxwashdryfold.com) in Plan 3 of the separation work. A naive
// same-origin "/affiliate" link works today and silently 404s the moment that
// cutover happens. At cutover, set INTEREST_FORM_URL on both boxes to the
// absolute content origin (https://atxwashdryfold.com/affiliate, canonical per
// decision D8) and this link follows without a code change.

const INTEREST_FORM_URL = process.env.INTEREST_FORM_URL || '/affiliate';

module.exports = { INTEREST_FORM_URL };
