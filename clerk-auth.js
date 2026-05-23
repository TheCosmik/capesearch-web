// clerk-auth.js — Clerk authentication, shared across all pages.
//
// DOM hooks expected on each page:
//   #clerkSignIn  — "Log in" button (shown when signed out)
//   #clerkUser    — container for custom user avatar + dropdown (shown when signed in)

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _mcFace(uuid) {
  return 'https://mc-heads.net/avatar/' + uuid + '/34';
}
function _activeKey(userId) {
  return 'cs-active-mc:' + userId;
}

// ── Build dropdown HTML ───────────────────────────────────────────────────────
function _buildDropdown(displayName, accounts, activeUuid) {
  var accountRows = '';
  if (accounts && accounts.length) {
    accountRows += '<div style="padding:.5rem .75rem .3rem;font-size:.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.07em">Minecraft Accounts</div>';
    for (var i = 0; i < accounts.length; i++) {
      var acc  = accounts[i];
      var isActive = acc.minecraftUuid === activeUuid;
      accountRows +=
        '<a href="profile.html?name=' + _esc(acc.minecraftName) + '" '
        + 'onclick="_setActive(event,\'' + _esc(acc.minecraftUuid) + '\',\'' + _esc(acc.minecraftName) + '\')" '
        + 'style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem;text-decoration:none;'
        + 'background:' + (isActive ? '#182030' : 'none') + ';transition:background .12s" '
        + 'onmouseover="this.style.background=\'#182030\'" '
        + 'onmouseout="this.style.background=\'' + (isActive ? '#182030' : 'none') + '\'">'
        +   '<img src="' + _mcFace(acc.minecraftUuid) + '" '
        +     'style="width:26px;height:26px;image-rendering:pixelated;border-radius:3px;flex-shrink:0"/>'
        +   '<span style="font-size:.875rem;font-weight:600;color:#f1f5f9;flex:1">' + _esc(acc.minecraftName) + '</span>'
        +   (isActive ? '<span style="font-size:.7rem;color:var(--green)">●</span>' : '')
        + '</a>';
    }
    accountRows += '<div style="height:1px;background:#1e293b;margin:.3rem 0"></div>';
  }

  return '<div id="_uDrop" style="display:none;position:absolute;top:calc(100% + 8px);right:0;'
    + 'background:#131f2e;border:1px solid #1e293b;border-radius:10px;'
    + 'box-shadow:0 16px 48px rgba(0,0,0,.7);min-width:210px;z-index:500;overflow:hidden">'
    +   '<div style="padding:.75rem .85rem .6rem;border-bottom:1px solid #1e293b">'
    +     '<div style="font-size:.875rem;font-weight:700;color:#f1f5f9">' + _esc(displayName) + '</div>'
    +   '</div>'
    +   accountRows
    +   '<button onclick="_goManage()" style="width:100%;background:none;border:none;text-align:left;'
    +     'padding:.55rem .85rem;font-size:.85rem;color:#94a3b8;cursor:pointer;display:flex;align-items:center;gap:.5rem" '
    +     'onmouseover="this.style.background=\'#182030\';this.style.color=\'#f1f5f9\'" '
    +     'onmouseout="this.style.background=\'none\';this.style.color=\'#94a3b8\'">⚙ Manage account</button>'
    +   '<button onclick="_doSignOut()" style="width:100%;background:none;border:none;text-align:left;'
    +     'padding:.55rem .85rem;font-size:.85rem;color:#94a3b8;cursor:pointer;display:flex;align-items:center;gap:.5rem;'
    +     'border-top:1px solid #1e293b" '
    +     'onmouseover="this.style.background=\'#182030\';this.style.color=\'#f1f5f9\'" '
    +     'onmouseout="this.style.background=\'none\';this.style.color=\'#94a3b8\'">↪ Sign out</button>'
    + '</div>';
}

// ── Dropdown controls ─────────────────────────────────────────────────────────
var _menuOpen = false;

function _toggleMenu() {
  var drop = document.getElementById('_uDrop');
  if (!drop) return;
  _menuOpen = !_menuOpen;
  drop.style.display = _menuOpen ? 'block' : 'none';
}

function _setActive(e, uuid, name) {
  // Navigating to the profile — also save this account as active
  var userId = window.Clerk && window.Clerk.user ? window.Clerk.user.id : null;
  if (userId) localStorage.setItem(_activeKey(userId), uuid);
  // Update avatar immediately
  var avatarEl = document.getElementById('_uAvatar');
  if (avatarEl) avatarEl.src = _mcFace(uuid);
  // Close menu (navigation will follow the <a> href)
  _menuOpen = false;
  var drop = document.getElementById('_uDrop');
  if (drop) drop.style.display = 'none';
}

function _goManage() {
  _menuOpen = false;
  var drop = document.getElementById('_uDrop');
  if (drop) drop.style.display = 'none';
  if (window.Clerk) window.Clerk.openUserProfile({ appearance: CLERK_APPEARANCE });
}

function _doSignOut() {
  _menuOpen = false;
  if (window.Clerk) window.Clerk.signOut();
}

// Close when clicking outside
document.addEventListener('click', function(e) {
  if (!_menuOpen) return;
  var wrap = document.getElementById('clerkUser');
  if (wrap && !wrap.contains(e.target)) {
    _menuOpen = false;
    var drop = document.getElementById('_uDrop');
    if (drop) drop.style.display = 'none';
  }
});

// ── Main init ─────────────────────────────────────────────────────────────────
window.addEventListener('load', async function initClerkAuth() {
  if (!window.Clerk) return;

  await window.Clerk.load({ appearance: CLERK_APPEARANCE });

  var signInBtn = document.getElementById('clerkSignIn');
  var wrap      = document.getElementById('clerkUser');

  async function syncUI() {
    if (!window.Clerk.user) {
      if (signInBtn) signInBtn.style.display = '';
      if (wrap)      { wrap.style.display = 'none'; wrap.innerHTML = ''; }
      return;
    }

    var user = window.Clerk.user;
    if (signInBtn) signInBtn.style.display = 'none';
    if (!wrap) return;
    wrap.style.display = 'flex';

    var displayName = user.username
      || user.firstName
      || (user.emailAddresses && user.emailAddresses[0] && user.emailAddresses[0].emailAddress)
      || 'Player';

    // Determine starting avatar — use saved active account from localStorage if available
    var savedActive = localStorage.getItem(_activeKey(user.id));
    var startAvatar = savedActive ? _mcFace(savedActive) : (user.imageUrl || '');

    // Render button + empty dropdown immediately (fast)
    wrap.innerHTML =
      '<div style="position:relative">'
      + '<button id="_uBtn" onclick="_toggleMenu()" title="Account menu" '
      +   'style="background:#182030;border:2px solid #1e293b;border-radius:6px;padding:0;'
      +   'cursor:pointer;width:38px;height:38px;overflow:hidden;flex-shrink:0;transition:border-color .15s" '
      +   'onmouseover="this.style.borderColor=\'var(--green)\'" '
      +   'onmouseout="this.style.borderColor=\'#1e293b\'">'
      +   '<img id="_uAvatar" src="' + _esc(startAvatar) + '" '
      +     'style="width:34px;height:34px;display:block;image-rendering:pixelated;border-radius:3px" '
      +     'onerror="this.style.imageRendering=\'auto\'" />'
      + '</button>'
      + _buildDropdown(displayName, [], savedActive)
      + '</div>';

    // Async: fetch linked Minecraft accounts and rebuild dropdown
    try {
      var r = await fetch('/api/get-user-minecraft?clerkUserId=' + encodeURIComponent(user.id));
      if (r.ok) {
        var d = await r.json();
        if (d.linked && d.accounts && d.accounts.length) {
          // Determine active account: saved preference → first in list
          var activeUuid = savedActive || d.accounts[0].minecraftUuid;
          // If nothing saved yet, persist the first account as default
          if (!savedActive) localStorage.setItem(_activeKey(user.id), activeUuid);

          // Swap avatar to active Minecraft face
          var avatarEl = document.getElementById('_uAvatar');
          if (avatarEl) {
            avatarEl.src = _mcFace(activeUuid);
            avatarEl.style.imageRendering = 'pixelated';
          }

          // Rebuild dropdown with real account list
          var dropEl = document.getElementById('_uDrop');
          if (dropEl) {
            var newDrop = document.createElement('div');
            newDrop.innerHTML = _buildDropdown(displayName, d.accounts, activeUuid);
            var built = newDrop.firstChild;
            built.id    = '_uDrop';
            built.style.display = _menuOpen ? 'block' : 'none';
            dropEl.replaceWith(built);
          }
        }
      }
    } catch {}
  }

  await syncUI();
  window.Clerk.addListener(syncUI);

  if (signInBtn) {
    signInBtn.addEventListener('click', function() {
      window.Clerk.openSignIn({ appearance: CLERK_APPEARANCE });
    });
  }
});
