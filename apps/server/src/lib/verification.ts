// Email-verification enforcement switch (UAT). REQUIRE_EMAIL_VERIFICATION=false relaxes the gates that
// require a verified address (publishing to others, payout onboarding). Anything else, including an
// absent or misspelled value, keeps verification required. Verification itself is untouched: tokens,
// emails, endpoints and User.emailVerifiedAt work as before, and nobody is marked verified.
// Not covered: matching EMAIL group invitations by address, which proves ownership of that address
// (an authorization rule), stays verified-only.
export function emailVerificationRequired(env: NodeJS.ProcessEnv = process.env) {
  return (env.REQUIRE_EMAIL_VERIFICATION ?? '').trim().toLowerCase() !== 'false'
}

/** True when this user may pass a verification gate under the current setting. */
export function passesEmailVerification(user: { emailVerifiedAt: Date | null }) {
  return !!user.emailVerifiedAt || !emailVerificationRequired()
}
