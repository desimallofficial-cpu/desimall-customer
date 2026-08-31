const NotificationCenter = {
  items: [],

  esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  },

  toast(message) {
    const e = document.getElementById('panelToast');
    if (!e) return;
    e.textContent = message;
    e.classList.add('show');
    setTimeout(() => e.classList.remove('show'), 1800);
  },

  async init() {
    if (!DesiMallAuth?.requireAuth?.('login.html')) return;

    document.getElementById('markAllRead')?.addEventListener('click', async () => {
      try {
        await DesiMallAPI.markAllNotificationsRead();
        this.items.forEach(x => x.is_read = true);
        this.render();
        this.toast('All notifications marked as read');
      } catch (error) {
        this.toast(error?.message || 'Could not update notifications.');
      }
    });

    await this.load();
  },

  async load() {
    const list = document.getElementById('notificationList');
    if (list) {
      list.innerHTML = '<div class="notification-empty"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading notifications...</div></div>';
    }

    try {
      const result = await DesiMallAPI.getNotifications({ limit: 50 });
      this.items = Array.isArray(result?.notifications) ? result.notifications : [];
      this.render();
    } catch (error) {
      if (list) {
        list.innerHTML = `<div class="notification-empty">${this.esc(error?.message || 'Could not load notifications.')}</div>`;
      }
    }
  },

  async openItem(id) {
    const item = this.items.find(x => String(x.id) === String(id));
    if (!item) return;

    if (!item.is_read) {
      try {
        await DesiMallAPI.markNotificationRead(id);
        item.is_read = true;
        this.render();
      } catch (_) {}
    }

    const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
    const orderId = payload.order_id || payload.orderId || payload.OrderID || '';
    const returnId = payload.return_id || payload.returnId || '';

    if (orderId) {
      location.href = `order-details.html?id=${encodeURIComponent(orderId)}`;
      return;
    }
    if (returnId) {
      location.href = 'returns.html';
    }
  },

  render() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (!this.items.length) {
      list.innerHTML = '<div class="notification-empty"><i class="fa-regular fa-bell"></i><div>No notifications yet.</div></div>';
      return;
    }

    const icons = {
      order:'fa-box',
      offer:'fa-tags',
      account:'fa-user-shield',
      return:'fa-rotate-left',
      delivery:'fa-truck'
    };

    list.innerHTML = this.items.map(n => `
      <button type="button" class="notification-item notification-row ${n.is_read ? '' : 'unread'}" data-id="${this.esc(n.id)}">
        <span class="notification-icon"><i class="fa-solid ${icons[n.type] || 'fa-bell'}"></i></span>
        <span class="notification-content">
          <strong>${this.esc(n.title || 'DesiMall update')}</strong>
          <p>${this.esc(n.body || '')}</p>
          <small>${n.created_at ? new Date(n.created_at).toLocaleString('en-IN') : ''}</small>
        </span>
        ${n.is_read ? '' : '<span class="status warn">New</span>'}
      </button>
    `).join('');

    list.querySelectorAll('.notification-row').forEach(row => {
      row.addEventListener('click', () => this.openItem(row.dataset.id));
    });
  }
};

document.addEventListener('DOMContentLoaded', () => NotificationCenter.init());