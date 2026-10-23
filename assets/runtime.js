// DealShield shared runtime. Loaded FIRST in <head> on every page, before any CDN script.
// - Fail-closed forms: native form submission is always cancelled (capture phase), so if page
//   scripts or CDN libraries fail, credentials are never sent via a native GET/POST navigation.
// - Single API base config point (DS.API_BASE), HTTPS only.
// - Shared fetch wrapper with 401 handling, server-side logout, guarded icon rendering.
(function () {
  'use strict';

  // ---- Fail-closed form handling (installed before anything decorative) ----
  document.addEventListener('submit', function (event) { event.preventDefault(); }, true);

  // ---- API base: ONE config point ----
  // Default '' = same origin (the web server proxies /auth, /escrow, /listings, /wallet, /admin
  // to the API over HTTPS). To call a separate API host, set
  //   <meta name="ds-api-base" content="https://api.dealshield.ng">
  // Only https:// hostnames are accepted; plain http and raw IP addresses are rejected and we
  // fall back to same-origin. See docs/SECURITY-HEADERS.md ("API base").
  function resolveApiBase() {
    var meta = document.querySelector('meta[name="ds-api-base"]');
    var value = meta ? String(meta.getAttribute('content') || '').trim() : '';
    if (!value) return '';
    var match = /^https:\/\/([a-z0-9.-]+)(:\d+)?\/?$/i.exec(value);
    if (!match) return '';
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(match[1])) return ''; // raw IPv4 not allowed
    return value.replace(/\/$/, '');
  }

  function clearSession() {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch (e) { /* storage unavailable */ }
  }

  function toLogin() { location.href = '/login.html'; }

  // N16: the refresh token now lives only in the HttpOnly ds_refresh cookie (path /auth).
  // Remove any refresh token an older build left in localStorage.
  try { localStorage.removeItem('refresh_token'); } catch (e) { /* storage unavailable */ }

  var DS = {
    API_BASE: resolveApiBase(),
    loggingOut: false,

    url: function (path) { return DS.API_BASE + path; },

    token: function () { try { return localStorage.getItem('access_token'); } catch (e) { return null; } },

    clearSession: clearSession,

    // Guarded decorative calls: never let icon/animation failure break the page.
    icons: function () {
      try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch (e) { /* decorative only */ }
    },

    // fetch wrapper. Returns { ok, status, data }. On 401 for authenticated calls, clears tokens
    // and redirects to login.
    api: async function (path, options) {
      options = options || {};
      var headers = { 'Content-Type': 'application/json' };
      var token = DS.token();
      if (options.auth !== false && token) headers.Authorization = 'Bearer ' + token;
      var init = { method: options.method || (options.body !== undefined ? 'POST' : 'GET'), headers: headers };
      if (options.body !== undefined) init.body = JSON.stringify(options.body);
      var response = await fetch(DS.url(path), init);
      if (response.status === 401 && options.auth !== false && !options._retried && await DS.refresh()) {
        options._retried = true;
        return DS.api(path, options);
      }
      var data = {};
      try { data = await response.json(); } catch (e) { data = {}; }
      if (response.status === 401 && options.auth !== false) {
        clearSession();
        toLogin();
      }
      return { ok: response.ok, status: response.status, data: data || {} };
    },

    // N16: rotate the session using the HttpOnly refresh cookie. Returns true when a new
    // access token was stored. The refresh token is never read or stored by page script.
    refresh: async function () {
      try {
        var response = await fetch(DS.url('/auth/refresh'), {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        if (!response.ok) return false;
        var data = await response.json().catch(function () { return {}; });
        if (!data || !data.access_token) return false;
        localStorage.setItem('access_token', data.access_token);
        return true;
      } catch (e) { return false; }
    },

    // Money as a string with exactly two decimals. Returns null if invalid (must be > 0, max 2 dp).
    money: function (raw) {
      var s = String(raw == null ? '' : raw).trim().replace(/,/g, '');
      if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
      var parts = s.split('.');
      var whole = parts[0].replace(/^0+(?=\d)/, '');
      var frac = ((parts[1] || '') + '00').slice(0, 2);
      if (/^0+$/.test(whole) && frac === '00') return null;
      return whole + '.' + frac;
    },

    async logout() {
      if (DS.loggingOut) return;
      DS.loggingOut = true;
      var access = DS.token();
      var revoked = false;
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
      try {
        // N16: always call logout so the server revokes the session named by the
        // HttpOnly refresh cookie and clears it, even when no access token is left.
        var headers = { 'Content-Type': 'application/json' };
        if (access) headers.Authorization = 'Bearer ' + access;
        var response = await fetch(DS.url('/auth/logout'), {
          method: 'POST', headers: headers, credentials: 'include', body: '{}',
          signal: controller ? controller.signal : undefined
        });
        revoked = response.ok;
      } catch (e) { revoked = false; } finally {
        if (timer) clearTimeout(timer);
        clearSession();
        try {
          if (!revoked) sessionStorage.setItem('logout_notice', 'Signed out on this device. We could not confirm the server session was revoked. When connected, sign in and use "Log out all sessions" in Settings.');
          else sessionStorage.removeItem('logout_notice');
        } catch (e) { /* ignore */ }
        toLogin();
      }
    },

    errorMessage: function (data, fallback) {
      fallback = fallback || 'The request failed. Please try again.';
      var detail = data && (data.detail != null ? data.detail : (data.message != null ? data.message : data.error));
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) return detail.map(function (item) { return (item && item.msg) || 'Invalid input'; }).join('; ');
      return fallback;
    }
  };
  window.DS = DS;

  document.addEventListener('DOMContentLoaded', function () {
    var loginForm = document.getElementById('login-form');
    var logoutNotice = null;
    try { logoutNotice = loginForm && sessionStorage.getItem('logout_notice'); } catch (e) { logoutNotice = null; }
    if (logoutNotice) {
      var notice = document.createElement('p');
      notice.className = 'field-hint'; notice.setAttribute('role', 'status'); notice.textContent = logoutNotice;
      loginForm.before(notice);
      try { sessionStorage.removeItem('logout_notice'); } catch (e) { /* ignore */ }
    }
    try {
      var navigation = document.querySelector('#navbar nav');
      var desktopLinks = navigation && navigation.querySelector('div.hidden');
      if (navigation && desktopLinks && desktopLinks.querySelector('a[href]')) {
        var button = document.createElement('button');
        button.type = 'button'; button.textContent = 'Menu'; button.className = 'btn-secondary lg:hidden';
        button.setAttribute('aria-controls', 'mobile-navigation'); button.setAttribute('aria-expanded', 'false');
        var menu = document.createElement('nav'); menu.id = 'mobile-navigation'; menu.hidden = true; menu.setAttribute('aria-label', 'Mobile navigation');
        var destinations = Array.prototype.map.call(desktopLinks.querySelectorAll('a[href]'), function (link) { return [link.textContent.trim(), link.getAttribute('href')]; });
        destinations.push(['Log in', '/login.html'], ['Register', '/register.html'], ['Dashboard', '/dashboard.html'], ['Create deal', '/create-deal.html'], ['Facilitator', '/facilitator.html'], ['Transactions', '/transactions.html'], ['Settings', '/settings.html'], ['Verification', '/kyc.html']);
        destinations.forEach(function (d) { var link = document.createElement('a'); link.textContent = d[0]; link.href = d[1]; link.className = 'btn-ghost'; menu.append(link); });
        var close = function () { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
        button.addEventListener('click', function () { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); });
        menu.addEventListener('click', close);
        document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
        navigation.insertBefore(button, navigation.lastElementChild); navigation.parentElement.append(menu);
      }
      Array.prototype.forEach.call(document.querySelectorAll('button'), function (b) {
        if (!b.textContent.trim() && !b.hasAttribute('aria-label')) {
          var action = b.getAttribute('onclick') || '';
          b.setAttribute('aria-label', b.title || (/Password|PwVisibility/.test(action) ? 'Show or hide password' : /Sidebar/.test(action) ? 'Toggle navigation' : /Logout/.test(action) ? 'Log out' : /close|Close/.test(action) ? 'Close dialog' : 'Open control'));
        }
      });
      Array.prototype.forEach.call(document.querySelectorAll('[role="alert"], .field-error'), function (el) { el.setAttribute('aria-live', 'polite'); });
      Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (input) {
        var label = input.id && document.querySelector('label[for="' + input.id + '"]');
        if (!label && !input.hasAttribute('aria-label') && input.type !== 'hidden') input.setAttribute('aria-label', input.placeholder || input.id || input.name || 'Input');
      });
    } catch (e) { /* accessibility enhancements are optional */ }
  });
})();
