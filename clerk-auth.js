// clerk-auth.js — Clerk authentication + notification bell, shared across all pages.
//
// DOM hooks expected on each page:
//   #clerkSignIn  — "Log in" button (shown when signed out)
//   #clerkUser    — container for bell + avatar (shown when signed in)

// ── Hardcoded owner UUID (C0smik) — used to gate Admin Panel link in dropdown ─
var _OWNER_UUID = '97a449ca635d44da9e021fe62eef5bda';

// ── Appearance ────────────────────────────────────────────────────────────────
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
function _timeAgo(ts) {
  var diff = Date.now() - ts;
  var m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  var d = Math.floor(h / 24);
  if (d < 30) return d + 'd ago';
  return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// ── Notification state ────────────────────────────────────────────────────────
var _bellOpen    = false;
var _unseenCount = 0;

function _updateBellBadge(count) {
  var badge = document.getElementById('_bellBadge');
  if (!badge) return;
  _unseenCount = count;
  if (count <= 0) {
    badge.style.display = 'none';
  } else {
    badge.style.cssText += ';display:flex';
    badge.textContent = count > 99 ? '99+' : String(count);
  }
}

function _renderBellDrop(drop, notifications) {
  var header = '<div style="padding:.7rem .9rem;border-bottom:1px solid #1e293b;'
    + 'font-size:.82rem;font-weight:700;color:#f1f5f9">Notifications</div>';

  if (!notifications || !notifications.length) {
    drop.innerHTML = header
      + '<div style="padding:1.5rem 1rem;text-align:center;color:#64748b;font-size:.85rem">'
      + 'No notifications yet</div>';
    return;
  }

  var FB = 'https://mc-heads.net/avatar/Steve/32';
  var rows = notifications.map(function(n) {
    var avatar = n.fromMcUuid ? 'https://mc-heads.net/avatar/' + _esc(n.fromMcUuid) + '/32' : FB;
    var href   = n.fromMcUuid ? 'profile.html?name=' + encodeURIComponent(n.fromName) : '#';
    var unseen = !n.seen;
    return '<a href="' + href + '" style="display:flex;align-items:center;gap:.65rem;padding:.6rem .9rem;'
      + 'text-decoration:none;border-bottom:1px solid #0f1923;'
      + 'background:' + (unseen ? 'rgba(74,222,128,.06)' : 'none') + ';transition:background .12s" '
      + 'onmouseover="this.style.background=\'#182030\'" '
      + 'onmouseout="this.style.background=\'' + (unseen ? 'rgba(74,222,128,.06)' : 'none') + '\'">'
      +   '<img src="' + _esc(avatar) + '" onerror="this.src=\'' + FB + '\'" '
      +     'style="width:32px;height:32px;border-radius:5px;image-rendering:pixelated;flex-shrink:0"/>'
      +   '<div style="flex:1;min-width:0">'
      +     '<div style="font-size:.82rem;color:#f1f5f9;font-weight:' + (unseen ? '700' : '500') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      +       _esc(n.fromName) + '<span style="color:#94a3b8;font-weight:400"> followed your profile</span>'
      +     '</div>'
      +     '<div style="font-size:.72rem;color:#64748b;margin-top:1px">' + _timeAgo(n.ts) + '</div>'
      +   '</div>'
      +   (unseen ? '<div style="width:7px;height:7px;border-radius:50%;background:#4ade80;flex-shrink:0"></div>' : '')
      + '</a>';
  }).join('');

  drop.innerHTML = header + rows;
}

async function _toggleBell() {
  _bellOpen = !_bellOpen;
  var drop = document.getElementById('_bellDrop');
  if (!drop) return;

  if (!_bellOpen) {
    drop.style.display = 'none';
    return;
  }

  // Close account menu if open
  if (_menuOpen) {
    _menuOpen = false;
    var uDrop = document.getElementById('_uDrop');
    if (uDrop) uDrop.style.display = 'none';
  }

  drop.style.display = 'block';

  var userId = window.Clerk && window.Clerk.user ? window.Clerk.user.id : null;
  if (!userId) return;

  // Loading state
  drop.innerHTML = '<div style="padding:.7rem .9rem;border-bottom:1px solid #1e293b;'
    + 'font-size:.82rem;font-weight:700;color:#f1f5f9">Notifications</div>'
    + '<div style="padding:1.5rem 1rem;text-align:center;color:#64748b;font-size:.85rem">Loading…</div>';

  try {
    var r = await fetch('/api/follow?action=notifications&clerkUserId=' + encodeURIComponent(userId));
    if (r.ok) {
      var d = await r.json();
      _renderBellDrop(drop, d.notifications || []);
      // Mark all as seen
      fetch('/api/follow?action=mark-seen&clerkUserId=' + encodeURIComponent(userId)).catch(function(){});
      _updateBellBadge(0);
    }
  } catch {
    drop.innerHTML = '<div style="padding:.7rem .9rem;border-bottom:1px solid #1e293b;'
      + 'font-size:.82rem;font-weight:700;color:#f1f5f9">Notifications</div>'
      + '<div style="padding:1.5rem 1rem;text-align:center;color:#64748b;font-size:.85rem">Could not load notifications.</div>';
  }
}

async function _loadNotifCount(userId) {
  try {
    var r = await fetch('/api/follow?action=notifications&clerkUserId=' + encodeURIComponent(userId));
    if (!r.ok) return;
    var d = await r.json();
    _updateBellBadge(d.unseenCount || 0);
  } catch {}
}

// ── Bell button HTML ──────────────────────────────────────────────────────────
function _buildBell() {
  return '<div style="position:relative">'
    + '<button id="_bellBtn" onclick="_toggleBell()" title="Notifications" '
    +   'style="background:#182030;border:2px solid #1e293b;border-radius:6px;'
    +   'width:38px;height:38px;cursor:pointer;flex-shrink:0;position:relative;'
    +   'display:flex;align-items:center;justify-content:center;font-size:17px;'
    +   'transition:border-color .15s" '
    +   'onmouseover="this.style.borderColor=\'var(--green)\'" '
    +   'onmouseout="this.style.borderColor=\'#1e293b\'">🔔'
    +   '<span id="_bellBadge" style="display:none;position:absolute;top:-5px;right:-5px;'
    +     'background:#ef4444;color:#fff;border-radius:999px;font-size:10px;font-weight:700;'
    +     'min-width:17px;height:17px;align-items:center;justify-content:center;'
    +     'padding:0 3px;line-height:1;pointer-events:none">0</span>'
    + '</button>'
    + '<div id="_bellDrop" style="display:none;position:absolute;top:calc(100% + 8px);right:0;'
    +   'background:#131f2e;border:1px solid #1e293b;border-radius:10px;'
    +   'box-shadow:0 16px 48px rgba(0,0,0,.7);width:280px;max-height:360px;'
    +   'overflow-y:auto;z-index:500"></div>'
    + '</div>';
}

// ── Account dropdown HTML ─────────────────────────────────────────────────────
function _buildDropdown(displayName, accounts, activeUuid) {
  var isOwner = accounts && accounts.some(function(a) { return a.minecraftUuid === _OWNER_UUID; });
  var accountRows = '';
  if (accounts && accounts.length) {
    accountRows += '<div style="padding:.5rem .75rem .3rem;font-size:.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.07em">Minecraft Accounts</div>';
    for (var i = 0; i < accounts.length; i++) {
      var acc      = accounts[i];
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
    +   (isOwner
          ? '<a href="admin.html" style="display:flex;align-items:center;gap:.5rem;padding:.55rem .85rem;'
          +   'font-size:.85rem;color:#fbbf24;text-decoration:none;font-weight:600;border-bottom:1px solid #1e293b" '
          +   'onmouseover="this.style.background=\'#182030\'" '
          +   'onmouseout="this.style.background=\'none\'">⚡ Admin Panel</a>'
          : '')
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
  // Close bell if open
  if (_bellOpen) {
    _bellOpen = false;
    var bDrop = document.getElementById('_bellDrop');
    if (bDrop) bDrop.style.display = 'none';
  }
  _menuOpen = !_menuOpen;
  drop.style.display = _menuOpen ? 'block' : 'none';
}

function _setActive(e, uuid, name) {
  var userId = window.Clerk && window.Clerk.user ? window.Clerk.user.id : null;
  if (userId) localStorage.setItem(_activeKey(userId), uuid);
  var avatarEl = document.getElementById('_uAvatar');
  if (avatarEl) avatarEl.src = _mcFace(uuid);
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

// ── Exposed nav refresh (called after unclaim) ───────────────────────────────
// Re-fetches the user's linked Minecraft accounts and updates the avatar + dropdown.
window._refreshUserMcNav = async function() {
  if (!window.Clerk || !window.Clerk.user) return;
  var user   = window.Clerk.user;
  var userId = user.id;
  var displayName = user.username
    || user.firstName
    || (user.emailAddresses && user.emailAddresses[0] && user.emailAddresses[0].emailAddress)
    || 'Player';

  try {
    var r = await fetch('/api/get-user-minecraft?clerkUserId=' + encodeURIComponent(userId));
    if (!r.ok) return;
    var d = await r.json();

    var savedActive = localStorage.getItem(_activeKey(userId));
    var avatarEl    = document.getElementById('_uAvatar');
    var dropEl      = document.getElementById('_uDrop');

    if (!d.linked || !d.accounts || !d.accounts.length) {
      // No accounts left — reset to Clerk profile image
      localStorage.removeItem(_activeKey(userId));
      if (avatarEl) { avatarEl.src = user.imageUrl || ''; avatarEl.style.imageRendering = 'auto'; }
      if (dropEl) {
        var nd = document.createElement('div');
        nd.innerHTML = _buildDropdown(displayName, [], null);
        var built = nd.firstChild; built.id = '_uDrop'; built.style.display = _menuOpen ? 'block' : 'none';
        dropEl.replaceWith(built);
      }
    } else {
      // Pick an active UUID that still exists in the list
      var validActive = d.accounts.some(function(a){ return a.minecraftUuid === savedActive; })
        ? savedActive : d.accounts[0].minecraftUuid;
      localStorage.setItem(_activeKey(userId), validActive);
      if (avatarEl) { avatarEl.src = _mcFace(validActive); avatarEl.style.imageRendering = 'pixelated'; }
      if (dropEl) {
        var nd = document.createElement('div');
        nd.innerHTML = _buildDropdown(displayName, d.accounts, validActive);
        var built = nd.firstChild; built.id = '_uDrop'; built.style.display = _menuOpen ? 'block' : 'none';
        dropEl.replaceWith(built);
      }
    }
  } catch {}
};

// Close both dropdowns when clicking outside
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('clerkUser');
  if (wrap && wrap.contains(e.target)) return; // click is inside the nav widget

  if (_menuOpen) {
    _menuOpen = false;
    var uDrop = document.getElementById('_uDrop');
    if (uDrop) uDrop.style.display = 'none';
  }
  if (_bellOpen) {
    _bellOpen = false;
    var bDrop = document.getElementById('_bellDrop');
    if (bDrop) bDrop.style.display = 'none';
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
    wrap.style.alignItems = 'center';
    wrap.style.gap = '.45rem';

    var displayName = user.username
      || user.firstName
      || (user.emailAddresses && user.emailAddresses[0] && user.emailAddresses[0].emailAddress)
      || 'Player';

    var savedActive = localStorage.getItem(_activeKey(user.id));
    var startAvatar = savedActive ? _mcFace(savedActive) : (user.imageUrl || '');

    // Render bell + avatar immediately
    wrap.innerHTML =
      _buildBell()
      + '<div style="position:relative">'
      +   '<button id="_uBtn" onclick="_toggleMenu()" title="Account menu" '
      +     'style="background:#182030;border:2px solid #1e293b;border-radius:6px;padding:0;'
      +     'cursor:pointer;width:38px;height:38px;overflow:hidden;flex-shrink:0;transition:border-color .15s" '
      +     'onmouseover="this.style.borderColor=\'var(--green)\'" '
      +     'onmouseout="this.style.borderColor=\'#1e293b\'">'
      +     '<img id="_uAvatar" src="' + _esc(startAvatar) + '" '
      +       'style="width:34px;height:34px;display:block;image-rendering:pixelated;border-radius:3px" '
      +       'onerror="this.style.imageRendering=\'auto\'" />'
      +   '</button>'
      +   _buildDropdown(displayName, [], savedActive)
      + '</div>';

    // Fetch unseen notification count in background
    _loadNotifCount(user.id);

    // Async: fetch linked Minecraft accounts and rebuild dropdown
    try {
      var r = await fetch('/api/get-user-minecraft?clerkUserId=' + encodeURIComponent(user.id));
      if (r.ok) {
        var d = await r.json();
        if (d.linked && d.accounts && d.accounts.length) {
          var activeUuid = savedActive || d.accounts[0].minecraftUuid;
          if (!savedActive) localStorage.setItem(_activeKey(user.id), activeUuid);

          var avatarEl = document.getElementById('_uAvatar');
          if (avatarEl) {
            avatarEl.src = _mcFace(activeUuid);
            avatarEl.style.imageRendering = 'pixelated';
          }

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
