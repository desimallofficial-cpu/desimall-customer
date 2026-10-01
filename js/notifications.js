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
      list.innerHTML = '<div class="empty-panel"><i class="fa-solid fa-spinner fa-spin"></i> Loading notifications...</div>';
    }

    try {
      const result = await DesiMallAPI.getNotifications({ limit: 50 });
      this.items = Array.isArray(result?.notifications) ? result.notifications : [];
      this.render();
    } catch (error) {
      if (list) {
        list.innerHTML = `<div class="empty-panel">${this.esc(error?.message || 'Could not load notifications.')}</div>`;
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
      list.innerHTML = '<div class="empty-panel"><i class="fa-regular fa-bell"></i><br>No notifications yet.</div>';
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
      <button type="button" class="list-row notification-row" data-id="${this.esc(n.id)}"
        style="width:100%;text-align:left;opacity:${n.is_read ? .72 : 1};cursor:pointer">
        <div style="display:flex;gap:13px;align-items:center">
          <span class="stat-icon"><i class="fa-solid ${icons[n.type] || 'fa-bell'}"></i></span>
          <div>
            <strong>${this.esc(n.title || 'DesiMall update')}</strong>
            <div class="muted">${this.esc(n.body || '')}</div>
            <small class="muted">${n.created_at ? new Date(n.created_at).toLocaleString('en-IN') : ''}</small>
          </div>
        </div>
        ${n.is_read ? '' : '<span class="status warn">New</span>'}
      </button>
    `).join('');

    list.querySelectorAll('.notification-row').forEach(row => {
      row.addEventListener('click', () => this.openItem(row.dataset.id));
    });
  }
};

document.addEventListener('DOMContentLoaded', () => NotificationCenter.init());