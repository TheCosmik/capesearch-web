// clerk-auth.js — Clerk authentication, shared across all pages.
// Included after the Clerk CDN script on every page.
//
// DOM hooks expected on each page:
//   #clerkSignIn  — "Log in" button (hidden until Clerk confirms signed-out)
//   #clerkUser    — container where Clerk mounts its UserButton widget

window.addEventListener('load', async function initClerkAuth() {
  if (!window.Clerk) return;

  await window.Clerk.load();

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
              baseTheme: undefined,
              variables: { colorPrimary: '#4ade80' },
              elements:  { userButtonAvatarBox: { width: '32px', height: '32px' } },
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
      window.Clerk.openSignIn({
        appearance: {
          variables: { colorPrimary: '#4ade80', colorBackground: '#131f2e', colorText: '#f1f5f9' },
        },
      });
    });
  }
});
