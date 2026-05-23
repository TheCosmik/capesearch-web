// clerk-auth.js — Clerk authentication, shared across all pages.
//
// DOM hooks expected on each page:
//   #clerkSignIn  — "Log in" button (shown when signed out)
//   #clerkUser    — container for custom user avatar button (shown when signed in)

// ── Appearance — matches the site's dark theme ────────────────────────────────
var CLERK_APPEARANCE = {
  variables: {
    colorPrimary:        '#4ade80',
    colorBackground:     '#131f2e',
    colorText:           '#f1f5f9',
    colorTextSecondary:  '#94a3b8',
    colorInputBackground:'#0f1923',
    colorInputText:      '#f1f5f9',
    colorNeutral:        '#94a3b8',
    borderRadius:        '8px',
  },
  elements: {
    card:                          { background:'#131f2e', border:'1px solid #1e293b', boxShadow:'0 24px 64px rgba(0,0,0,.7)' },
    socialButtonsBlockButton:      { background:'#182030', border:'1px solid #1e293b', color:'#f1f5f9' },
    socialButtonsBlockButtonText:  { color:'#f1f5f9', fontWeight:'600' },
    dividerLine:                   { background:'#1e293b' },
    dividerText:                   { color:'#64748b' },
    formFieldInput:                { background:'#0f1923', border:'1px solid #1e293b', color:'#f1f5f9' },
    formFieldLabel:                { color:'#94a3b8' },
    formButtonPrimary:             { background:'#4ade80', color:'#0f1923', fontWeight:'700' },
    footerActionLink:              { color:'#4ade80' },
    footerActionText:              { color:'#64748b' },
    headerTitle:                   { color:'#f1f5f9' },
    headerSubtitle:                { color:'#94a3b8' },
    identityPreviewEditButtonIcon: { color:'#4ade80' },
    formResendCodeLink:            { color:'#4ade80' },
  },
};

// ── Custom user menu (replaces Clerk's default UserButton) ────────────────────
// Rendered inside #clerkUser once signed in.
var _menuOpen = false;

function _buildUserMenu(avatarSrc, displayName) {
  return ''
    + '<div style="position:relative">'
    +   '<button id="_uBtn" onclick="_toggleMenu()" style="background:none;border:2px solid transparent;'
    +     'border-radius:50%;padding:0;cursor:pointer;width:36px;height:36px;overflow:hidden;'
    +     'transition:border-color .15s;flex-shrink:0" '
    +     'onmouseover="this.style.borderColor=\'var(--green)\'" '
    +     'onmouseout="this.style.borderColor=\'transparent\'">'
    +     '<img id="_uAvatar" src="' + avatarSrc + '" '
    +       'style="width:32px;height:32px;border-radius:50%;image-rendering:pixelated;display:block" '
    +       'onerror="this.style.imageRendering=\'auto\'" />'
    +   '</button>'
    +   '<div id="_uDrop" style="display:none;position:absolute;top:calc(100% + 8px);right:0;'
    +     'background:#131f2e;border:1px solid #1e293b;border-radius:10px;'
    +     'box-shadow:0 16px 48px rgba(0,0,0,.7);min-width:200px;z-index:500;overflow:hidden">'
    +     '<div style="padding:.85rem 1rem;border-bottom:1px solid #1e293b">'
    +       '<div style="font-size:.875rem;font-weight:700;color:#f1f5f9;margin-bottom:.15rem" id="_uName">' + _escHtml(displayName) + '</div>'
    +       '<div style="font-size:.75rem;color:#64748b" id="_uSub">Signed in</div>'
    +     '</div>'
    +     '<button onclick="_goManageAccount()" style="width:100%;background:none;border:none;text-align:left;'
    +       'padding:.6rem 1rem;font-size:.875rem;color:#94a3b8;cursor:pointer;display:flex;align-items:center;gap:.5rem" '
    +       'onmouseover="this.style.background=\'#182030\';this.style.color=\'#f1f5f9\'" '
    +       'onmouseout="this.style.background=\'none\';this.style.color=\'#94a3b8\'">⚙ Manage account</button>'
    +     '<button onclick="_signOut()" style="width:100%;background:none;border:none;text-align:left;'
    +       'padding:.6rem 1rem;font-size:.875rem;color:#94a3b8;cursor:pointer;display:flex;align-items:center;gap:.5rem;'
    +       'border-top:1px solid #1e293b" '
    +       'onmouseover="this.style.background=\'#182030\';this.style.color=\'#f1f5f9\'" '
    +       'onmouseout="this.style.background=\'none\';this.style.color=\'#94a3b8\'">↪ Sign out</button>'
    +   '</div>'
    + '</div>';
}

function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _toggleMenu() {
  var drop = document.getElementById('_uDrop');
  if (!drop) return;
  _menuOpen = !_menuOpen;
  drop.style.display = _menuOpen ? 'block' : 'none';
}

function _goManageAccount() {
  _menuOpen = false;
  var drop = document.getElementById('_uDrop');
  if (drop) drop.style.display = 'none';
  if (window.Clerk) window.Clerk.openUserProfile({ appearance: CLERK_APPEARANCE });
}

function _signOut() {
  _menuOpen = false;
  if (window.Clerk) window.Clerk.signOut();
}

// Close menu when clicking outside
document.addEventListener('click', function(e) {
  if (!_menuOpen) return;
  var btn = document.getElementById('_uBtn');
  var drop = document.getElementById('_uDrop');
  if (btn && !btn.contains(e.target) && drop && !drop.contains(e.target)) {
    _menuOpen = false;
    drop.style.display = 'none';
  }
});

// ── Fetch linked Minecraft profile and return best avatar src ─────────────────
async function _getAvatarSrc(user) {
  try {
    var r = await fetch('/api/get-user-minecraft?clerkUserId=' + encodeURIComponent(user.id));
    if (r.ok) {
      var d = await r.json();
      if (d.linked && d.minecraftUuid) {
        // Update the subtitle in the dropdown to show their Minecraft name
        var sub = document.getElementById('_uSub');
        if (sub) sub.textContent = d.minecraftName;
        // Update avatar to Minecraft face
        var avatarEl = document.getElementById('_uAvatar');
        if (avatarEl) {
          avatarEl.src = 'https://mc-heads.net/avatar/' + d.minecraftUuid + '/32';
        }
        return 'https://mc-heads.net/avatar/' + d.minecraftUuid + '/32';
      }
    }
  } catch {}
  // Fall back to Clerk's OAuth avatar (Discord/Google profile picture)
  return user.imageUrl || '';
}

// ── Main init ─────────────────────────────────────────────────────────────────
window.addEventListener('load', async function initClerkAuth() {
  if (!window.Clerk) return;

  await window.Clerk.load({ appearance: CLERK_APPEARANCE });

  var btn  = document.getElementById('clerkSignIn');
  var wrap = document.getElementById('clerkUser');

  async function syncUI() {
    if (window.Clerk.user) {
      var user = window.Clerk.user;

      // Sign-in button hidden
      if (btn) btn.style.display = 'none';

      if (wrap) {
        wrap.style.display = 'flex';

        // Build menu with Clerk avatar first (fast), then swap to Minecraft face
        var displayName = user.username
          || user.firstName
          || (user.emailAddresses && user.emailAddresses[0] && user.emailAddresses[0].emailAddress)
          || 'Player';

        var initialAvatar = user.imageUrl || '';
        wrap.innerHTML = _buildUserMenu(initialAvatar, displayName);

        // Async: swap avatar to Minecraft face if they have a linked profile
        _getAvatarSrc(user);
      }
    } else {
      if (btn)  btn.style.display  = '';
      if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
    }
  }

  await syncUI();
  window.Clerk.addListener(syncUI);

  if (btn) {
    btn.addEventListener('click', function() {
      window.Clerk.openSignIn({ appearance: CLERK_APPEARANCE });
    });
  }
});
