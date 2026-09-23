// Cross-surface link destinations that MOVE between apps during the content /
// app separation, so they must never be hardcoded as same-origin paths.
//
// INTEREST_FORM_URL — the public partner interest form. The affiliate program is
// INVITE-ONLY, so the portal's login page must not send people to the
// invite-gated /affiliate-register flow; it sends them here instead.
//
// WHY THIS IS CONFIG AND NOT A LITERAL: the interest form used to live in this app
// (public/affiliate.html, route /affiliate). That cutover HAS NOW HAPPENED — Plan 3
// Task 16 deleted both, and crhs-corporate serves the form at
// https://atxwashdryfold.com/affiliate (canonical per decision D8).
//
// ⚠ The '/affiliate' fallback below is therefore DEAD on this origin: nothing here
// routes it any more, so if INTEREST_FORM_URL is unset the invite-only programme's
// only public application link 404s. It is set on both production boxes (verified at
// the Task 16 gate) and is the single source of truth; treat an unset value as a
// misconfiguration, not a default.

const INTEREST_FORM_URL = process.env.INTEREST_FORM_URL || '/affiliate';

module.exports = { INTEREST_FORM_URL };
