// clerk-auth.js — Clerk authentication, shared across all pages.
// Included after the Clerk CDN script on every page.
//
// DOM hooks expected on each page:
//   #clerkSignIn  — "Log in" button (hidden until Clerk confirms signed-out)
//   #clerkUser    — container where Clerk mounts its UserButton widget

// ── Appearance — matches the site's dark theme ────────────────────────────────
var CLERK_APPEARANCE = {
  variables: {
    colorPrimary:        '#4ade80',   // green accent
    colorBackground:     '#131f2e',   // --bg2
    colorText:           '#f1f5f9',   // --txt
    colorTextSecondary:  '#94a3b8',   // --txt2
    colorInputBackground:'#0f1923',   // --bg
    colorInputText:      '#f1f5f9',
    colorNeutral:        '#94a3b8',
    borderRadius:        '8px',
  },
  elements: {
    // Modal card
    card: {
      background:  '#131f2e',
      border:      '1px solid #1e293b',
      boxShadow:   '0 24px 64px rgba(0,0,0,.7)',
    },
    // Social buttons (Discord, Google)
    socialButtonsBlockButton: {
      background:  '#182030',
      border:      '1px solid #1e293b',
      color:       '#f1f5f9',
    },
    socialButtonsBlockButtonText: {
      color: '#f1f5f9',
      fontWeight: '600',
    },
    socialButtonsBlockButtonArrow: {
      color: '#94a3b8',
    },
    // "or" divider
    dividerLine: { background: '#1e293b' },
    dividerText: { color: '#64748b' },
    // Input fields
    formFieldInput: {
      background:  '#0f1923',
      border:      '1px solid #1e293b',
      color:       '#f1f5f9',
    },
    formFieldLabel: { color: '#94a3b8' },
    // Primary action button (Continue, Sign in, etc.)
    formButtonPrimary: {
      background: '#4ade80',
      color:      '#0f1923',
      fontWeight: '700',
    },
    // Footer links ("Sign in", "Sign up")
    footerActionLink:  { color: '#4ade80' },
    footerActionText:  { color: '#64748b' },
    // Header
    headerTitle:    { color: '#f1f5f9' },
    headerSubtitle: { color: '#94a3b8' },
    // Internal links / text buttons
    identityPreviewEditButtonIcon: { color: '#4ade80' },
    formResendCodeLink:            { color: '#4ade80' },
  },
};

window.addEventListener('load', async function initClerkAuth() {
  if (!window.Clerk) return;

  // Pass appearance globally so it applies to every Clerk component
  await window.Clerk.load({ appearance: CLERK_APPEARANCE });

  var btn  = document.getElementById('clerkSignIn');
  var wrap = document.getElementById('clerkUser');

  function syncUI() {
    if (window.Clerk.user) {
      // Signed in — show user button, hide login button
      if (btn)  btn.style.display  = 'none';
      if (wrap) {
        wrap.style.display = 'flex';
        if (!wrap._clerkMounted) {
          window.Clerk.mountUserButton(wrap, {
            appearance: {
              variables: CLERK_APPEARANCE.variables,
              elements:  {
                userButtonAvatarBox:   { width: '32px', height: '32px' },
                userButtonPopoverCard: {
                  background: '#131f2e',
                  border:     '1px solid #1e293b',
                  boxShadow:  '0 16px 48px rgba(0,0,0,.7)',
                },
                userButtonPopoverActionButton:     { color: '#f1f5f9' },
                userButtonPopoverActionButtonText: { color: '#f1f5f9' },
              },
            },
          });
          wrap._clerkMounted = true;
        }
      }
    } else {
      // Signed out — show login button
      if (btn)  btn.style.display  = '';
      if (wrap) wrap.style.display = 'none';
    }
  }

  syncUI();
  window.Clerk.addListener(syncUI);

  if (btn) {
    btn.addEventListener('click', function () {
      window.Clerk.openSignIn({ appearance: CLERK_APPEARANCE });
    });
  }
});
