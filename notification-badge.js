(() => {
  'use strict';

  async function update() {
    const badges = document.querySelectorAll('.notification-badge');
    if (!badges.length) return;

    const loggedIn = typeof DesiMallAuth !== 'undefined' && DesiMallAuth.isLoggedIn?.();
    if (!loggedIn || typeof DesiMallAPI === 'undefined' || !DesiMallAPI.getNotificationUnreadCount) {
      badges.forEach(b => { b.textContent = '0'; b.classList.add('hidden'); });
      return;
    }

    try {
      const result = await DesiMallAPI.getNotificationUnreadCount();
      const count = Number(result?.unreadCount || 0);
      badges.forEach(b => {
        b.textContent = count > 99 ? '99+' : String(count);
        b.classList.toggle('hidden', count <= 0);
      });
    } catch (_) {
      badges.forEach(b => b.classList.add('hidden'));
    }
  }

  window.DesiMallNotificationBadge = { update };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }

  window.addEventListener('desimall:auth-changed', update);
  window.addEventListener('desimall:session-refreshed', update);
})();