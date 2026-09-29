window.DS = {
  async logout() {
    if (this.loggingOut) return;
    this.loggingOut = true;
    const access = localStorage.getItem('access_token');
    const refresh = localStorage.getItem('refresh_token');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let revoked = !access && !refresh;
    try {
      if (refresh) {
        const response = await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) }, body: JSON.stringify({ refresh_token: refresh }), signal: controller.signal });
        revoked = response.ok;
      }
    } catch {} finally {
      clearTimeout(timeout);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      if (!revoked) sessionStorage.setItem('logout_notice', 'Signed out on this device. We could not confirm server-session revocation. When connected, sign in and revoke that session in Settings.');
      else sessionStorage.removeItem('logout_notice');
      location.href = '/login.html';
    }
  },
  errorMessage(data, fallback = 'The request failed. Please try again.') {
    const detail = data?.detail ?? data?.message ?? data?.error;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(item => item.msg || 'Invalid input').join('; ');
    return fallback;
  }
};
document.addEventListener('submit', event => event.preventDefault(), true);
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const logoutNotice = loginForm && sessionStorage.getItem('logout_notice');
  if (logoutNotice) {
    const notice = document.createElement('p');
    notice.className = 'field-hint'; notice.setAttribute('role', 'status'); notice.textContent = logoutNotice;
    loginForm.before(notice); sessionStorage.removeItem('logout_notice');
  }
  const navigation = document.querySelector('#navbar nav');
  const desktopLinks = navigation?.querySelector('div.hidden');
  if (navigation && desktopLinks?.querySelector('a[href]')) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Menu'; button.className = 'btn-secondary lg:hidden';
    button.setAttribute('aria-controls', 'mobile-navigation'); button.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('nav'); menu.id = 'mobile-navigation'; menu.hidden = true; menu.setAttribute('aria-label', 'Mobile navigation');
    const destinations = [...desktopLinks.querySelectorAll('a[href]')].map(link => [link.textContent.trim(), link.getAttribute('href')]);
    destinations.push(['Log in', '/login.html'], ['Register', '/register.html'], ['Dashboard', '/dashboard.html'], ['Create deal', '/create-deal.html'], ['Facilitator', '/facilitator.html'], ['Transactions', '/transactions.html'], ['Settings', '/settings.html'], ['Verification', '/kyc.html']);
    for (const [label, href] of destinations) { const link = document.createElement('a'); link.textContent = label; link.href = href; link.className = 'btn-ghost'; menu.append(link); }
    const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); });
    menu.addEventListener('click', close);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
    navigation.insertBefore(button, navigation.lastElementChild); navigation.parentElement.append(menu);
  }
  for (const button of document.querySelectorAll('button')) {
    if (!button.textContent.trim() && !button.hasAttribute('aria-label')) {
      const action = button.getAttribute('onclick') || '';
      button.setAttribute('aria-label', button.title || (/Password|PwVisibility/.test(action) ? 'Show or hide password' : /Sidebar/.test(action) ? 'Toggle navigation' : /Logout/.test(action) ? 'Log out' : /close|Close/.test(action) ? 'Close dialog' : 'Open control'));
    }
  }
  for (const element of document.querySelectorAll('[role="alert"], .field-error')) element.setAttribute('aria-live', 'polite');
  for (const input of document.querySelectorAll('input, select, textarea')) {
    const label = input.id && document.querySelector(`label[for="${input.id}"]`);
    if (!label && !input.hasAttribute('aria-label') && input.type !== 'hidden') input.setAttribute('aria-label', input.placeholder || input.id || input.name || 'Input');
  }
});
