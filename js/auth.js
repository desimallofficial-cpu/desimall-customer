/** DesiMall shared authentication/session utilities */
const DesiMallAuth = (() => {
  const USER_KEY = 'desimall_user';
  const SESSION_KEY = 'desimall_session';

  function safeParse(value, fallback = null) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  }

  function normalizeUser(raw = {}, identifier = '') {
    const email = raw.Email || raw.email || (String(identifier).includes('@') ? identifier : '');
    const mobile = String(raw.Mobile || raw.mobile || (!String(identifier).includes('@') ? identifier : ''))
      .replace(/\D/g, '')
      .slice(-10);
    const stableSeed = raw.UserID || raw.userId || raw.id || email.toLowerCase() || mobile;

    return {
      UserID: String(raw.UserID || raw.userId || raw.id || `USR_${btoa(unescape(encodeURIComponent(stableSeed || Date.now()))).replace(/[^a-z0-9]/gi, '').slice(0, 18)}`),
      Name: raw.Name || raw.name || raw.full_name || (email ? email.split('@')[0] : mobile ? `User ${mobile.slice(-4)}` : 'DesiMall User'),
      Email: email,
      Mobile: mobile,
      Address: raw.Address || raw.address || '',
      DefaultAddress: raw.DefaultAddress || raw.default_address || null,
      Avatar: raw.Avatar || raw.avatar || raw.profile_image_url || '',
      Role: raw.Role || raw.role || 'customer',
      Status: raw.Status || raw.status || 'active',
      UpdatedAt: new Date().toISOString()
    };
  }

  function normalizeSession(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const accessToken = raw.access_token || raw.accessToken || '';
    const refreshToken = raw.refresh_token || raw.refreshToken || '';
    if (!accessToken && !refreshToken) return null;
    return {
      accessToken,
      refreshToken,
      expiresAt: raw.expires_at || raw.expiresAt || null,
      expiresIn: raw.expires_in || raw.expiresIn || null
    };
  }

  function getUser() { return safeParse(localStorage.getItem(USER_KEY)); }
  function getSession() { return safeParse(localStorage.getItem(SESSION_KEY), {}); }
  function getAccessToken() { return getSession()?.accessToken || ''; }
  function getRefreshToken() { return getSession()?.refreshToken || ''; }

  function sessionExpiresAtMs() {
    const session = getSession() || {};
    const raw = Number(session.expiresAt || 0);

    // Supabase expires_at is UNIX seconds.
    return raw > 0
      ? raw * 1000
      : 0;
  }

  function isSessionExpiring(withinMs = 5 * 60 * 1000) {
    const expiresAt = sessionExpiresAtMs();
    if (!expiresAt) return false;
    return expiresAt - Date.now() <= withinMs;
  }

  function updateSession(rawSession = {}) {
    const next = normalizeSession(rawSession);
    if (!next) return getSession();

    const current = getSession() || {};

    const merged = {
      ...current,
      ...next,
      refreshedAt: new Date().toISOString()
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(merged));

    window.dispatchEvent(
      new CustomEvent('desimall:session-refreshed', {
        detail: {
          expiresAt: merged.expiresAt || null
        }
      })
    );

    return merged;
  }

  function isLoggedIn() { return Boolean(getUser()?.UserID); }

  function setUser(raw, identifier = '', session = null) {
    const previous = getUser() || {};
    const user = normalizeUser({ ...previous, ...raw }, identifier);
    const previousSession = getSession() || {};
    const nextAuthSession = normalizeSession(session) || {};

    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...previousSession,
      ...nextAuthSession,
      userId: user.UserID,
      loginAt: new Date().toISOString()
    }));

    window.dispatchEvent(new CustomEvent('desimall:auth-changed', { detail: user }));
    return user;
  }

  function setAuthResult(result = {}, identifier = '') {
    const rawUser = result.user || result.data || {};
    return setUser(rawUser, identifier, result.session || null);
  }

  function logout(redirect = '../index.html') {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent('desimall:auth-changed', { detail: null }));
    if (redirect) window.location.href = redirect;
  }

  function requireAuth(loginPath = 'login.html') {
    const user = getUser();
    if (!user) {
      const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
      location.href = `${loginPath}?next=${next}`;
      return null;
    }
    return user;
  }

  function redirectAfterLogin(defaultPath = '../index.html') {
    const next = new URLSearchParams(location.search).get('next');
    location.href = next && !next.includes('://') ? next : defaultPath;
  }

  function updateHeader(scope = document) {
    const user = getUser();
    const link = scope.getElementById?.('userAuthLink') || document.getElementById('userAuthLink');
    if (!link) return;
    const pagesFolder = location.pathname.includes('/pages/');
    link.href = user ? (pagesFolder ? 'profile.html' : 'pages/profile.html') : (pagesFolder ? 'login.html' : 'pages/login.html');
    link.title = user ? 'My Profile' : 'Login';
    link.innerHTML = user
      ? `<i class="fa-solid fa-circle-user" aria-hidden="true"></i><span>${escapeHtml((user.Name || 'User').split(' ')[0])}</span>`
      : `<i class="fa-regular fa-user" aria-hidden="true"></i><span>Login</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  let keepAliveTimer = null;

  async function refreshIfNeeded(force = false) {
    if (!isLoggedIn() || !getRefreshToken()) return getAccessToken();

    if (
      typeof DesiMallAPI === 'undefined' ||
      typeof DesiMallAPI.ensureCustomerSession !== 'function'
    ) {
      return getAccessToken();
    }

    try {
      return await DesiMallAPI.ensureCustomerSession(force);
    } catch (error) {
      // Do not auto-logout here. A temporary network failure must not destroy
      // the customer's local signed-in state. The next API call retries.
      console.warn('Customer session refresh deferred:', error?.message || error);
      return getAccessToken();
    }
  }

  function startKeepAlive() {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    if (!isLoggedIn() || !getRefreshToken()) return;

    // Refresh shortly before expiry while the app remains open.
    refreshIfNeeded(false);

    keepAliveTimer = setInterval(
      () => refreshIfNeeded(false),
      10 * 60 * 1000
    );
  }

  return {
    getUser,
    getSession,
    getAccessToken,
    getRefreshToken,
    sessionExpiresAtMs,
    isSessionExpiring,
    updateSession,
    refreshIfNeeded,
    startKeepAlive,
    setUser,
    setAuthResult,
    isLoggedIn,
    logout,
    requireAuth,
    redirectAfterLogin,
    updateHeader,
    normalizeUser,
    escapeHtml
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  DesiMallAuth.updateHeader();
  DesiMallAuth.startKeepAlive();
});
