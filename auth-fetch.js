// auth-fetch.js - proves who the visitor is to the CapeSearch API.
//
// Account-level API calls (follow, notifications, admin actions, comments, settings, claim, saved lists...)
// are authenticated by the visitor's Clerk session token, which the SERVER verifies. This wraps fetch()
// so those calls carry `Authorization: Bearer <fresh token>` automatically; public lookups, avatars and
// third-party URLs are left completely untouched. The pages' own code never has to remember to do it.
//
// Must load in <head> before any page script that calls the API.
(function () {
  if (window.__csAuthFetch) return;
  window.__csAuthFetch = true;
  var realFetch = window.fetch.bind(window);

  var AUTH_ACTIONS = /^(unclaim|set-role|set-vip|set-beta|set-beta-enrollment|list-claimed|set-settings|post-comment|delete-comment|toggle-comments|submit-report|get-reports|dismiss-report|get-dismissed-reports|get-audit-log|grant-item|revoke-item|equip-inventory)$/;

  function needsToken(rawUrl) {
    var u;
    try { u = new URL(rawUrl, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;               // never send the token to another site
    var p = u.pathname.replace(/\.js$/, '');
    var a = u.searchParams.get('action') || '';
    if (p === '/api/follow' || p === '/api/get-user-minecraft' || p === '/api/check-claim' || p === '/api/saved-accounts') return true;
    if (p === '/api/player-textures' && AUTH_ACTIONS.test(a)) return true;
    if (p === '/api/claim' && /^(skin|ms)-/.test(a)) return true;
    return false;
  }

  // Resolves to a fresh session token, or null when signed out / Clerk unavailable (never rejects).
  function clerkToken() {
    return new Promise(function (resolve) {
      var waited = 0;
      (function tick() {
        var c = window.Clerk;
        if (c) {
          var go = function () {
            try {
              if (!c.session) return resolve(null);
              c.session.getToken().then(resolve, function () { resolve(null); });
            } catch (e) { resolve(null); }
          };
          if (c.loaded) return go();
          try { c.load().then(go, function () { resolve(null); }); } catch (e) { resolve(null); }
          return;
        }
        waited += 50;
        if (waited > 5000) return resolve(null);                   // Clerk never showed up: carry on signed-out
        setTimeout(tick, 50);
      })();
    });
  }

  window.fetch = function (input, init) {
    if (typeof input !== 'string' || !needsToken(input)) return realFetch(input, init);
    var headers = new Headers((init && init.headers) || {});
    if (headers.has('Authorization')) return realFetch(input, init); // caller already supplied one
    return clerkToken().then(function (token) {
      if (token) headers.set('Authorization', 'Bearer ' + token);
      var next = {};
      for (var k in (init || {})) next[k] = init[k];
      next.headers = headers;
      return realFetch(input, next);
    });
  };
})();
