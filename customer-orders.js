/**
 * DesiMall Customer Orders v0.10.1
 * Context-aware order actions + customer return request.
 */

const CustomerOrders = {
  user: null,
  orders: [],
  returns: [],
  filter: 'all',
  selectedItem: null,

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  },

  money(value) {
    return `₹${Number(value || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2
    })}`;
  },

  customerStatus(status) {
    const raw = String(status || '').toLowerCase();

    const map = {
      new:'Placed',
      accepted:'Accepted',
      preparing:'Preparing',
      ready:'Ready for Pickup',
      ready_for_pickup:'Ready for Pickup',
      pickup_assigned:'Pickup Assigned',
      picked_up:'Picked Up',
      out_for_delivery:'On the Way',
      reached_customer:'Reached Customer',
      delivered:'Delivered',
      cancelled:'Cancelled',
      rejected:'Cancelled'
    };

    return map[raw] || status || 'Placed';
  },

  async init() {
    this.user = DesiMallAuth.getUser();

    if (!this.user?.UserID || !DesiMallAuth.getAccessToken?.()) {
      location.href = 'login.html';
      return;
    }

    DesiMallAuth.updateHeader?.();

    document.querySelectorAll('[data-order-filter]').forEach(button => {
      button.onclick = () => {
        document.querySelectorAll('[data-order-filter]').forEach(x => {
          x.classList.toggle('active', x === button);
        });

        this.filter = button.dataset.orderFilter || 'all';
        this.render();
      };
    });

    closeReturnModal.onclick = () => this.closeReturn();
    returnModal.onclick = e => {
      if (e.target === returnModal) this.closeReturn();
    };
    submitReturnRequest.onclick = () => this.submitReturn();

    await this.load();
  },

  async load() {
    const container = document.getElementById('ordersContainer');

    container.innerHTML = `
      <div class="mo-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading your orders...
      </div>
    `;

    try {
      const [orders, returns] = await Promise.all([
        DesiMallAPI.getMyOrders(),
        DesiMallAPI.getMyReturns().catch(() => [])
      ]);

      this.orders = orders || [];
      this.returns = returns || [];
      this.writeTrackingCompatibility();
      this.render();
    } catch (error) {
      console.error('My Orders:', error);

      container.innerHTML = `
        <div class="mo-empty">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h3>Could not load orders</h3>
          <p>${this.esc(error.message || 'Please try again.')}</p>
          <button type="button" onclick="CustomerOrders.load()">Try Again</button>
        </div>
      `;
    }
  },

  normalizedStatus(order) {
    return this.customerStatus(order.Status || order.status);
  },

  filteredOrders() {
    return this.orders.filter(order => {
      const status = this.normalizedStatus(order).toLowerCase();

      if (this.filter === 'all') return true;
      if (this.filter === 'delivered') return status === 'delivered';
      if (this.filter === 'cancelled') return status === 'cancelled';
      if (this.filter === 'active') return !['delivered','cancelled'].includes(status);

      return true;
    });
  },

  activeReturnFor(item) {
    const itemId = String(item.OrderItemID || item.id || '');

    return this.returns.find(row =>
      String(row.OrderItemID || '') === itemId &&
      !['Rejected','Seller Rejected','Refund Completed','Closed'].includes(
        String(row.Status || '')
      )
    );
  },

  render() {
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };

    set('sumTotal', this.orders.length);
    set('sumDelivered', this.orders.filter(o => this.normalizedStatus(o) === 'Delivered').length);
    set('sumActive', this.orders.filter(o => !['Delivered','Cancelled'].includes(this.normalizedStatus(o))).length);

    const rows = this.filteredOrders();
    const container = document.getElementById('ordersContainer');

    if (!rows.length) {
      container.innerHTML = `
        <div class="mo-empty">
          <i class="fa-solid fa-box-open"></i>
          <h3>No orders here yet</h3>
          <p>Your live DesiMall orders will appear here after checkout.</p>
          <a href="../index.html">Continue Shopping</a>
        </div>
      `;
      return;
    }

    container.innerHTML = rows.map(order => this.card(order)).join('');
  },

  card(order) {
    const code = order.OrderCode || order.order_code || order.OrderID || order.id || '—';
    const status = this.normalizedStatus(order);
    const dateValue = order.CreatedAt || order.created_at || '';
    const date = dateValue ? new Date(dateValue).toLocaleString('en-IN', {
      day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'
    }) : '';

    const total = Number(order.TotalAmount ?? order.total_amount ?? 0);
    const items = Array.isArray(order.Items) ? order.Items : [];
    const showTrack = !['Delivered','Cancelled'].includes(status);
    const delivered = status === 'Delivered';

    return `
      <article class="mo-order">
        <header class="mo-order-head">
          <div>
            <small>ORDER</small>
            <h2>${this.esc(code)}</h2>
            <span>${this.esc(date)}</span>
          </div>
          <div class="mo-order-overview">
            ${order.IsTez || String(order.FulfillmentMode||order.fulfillment_mode||'').toLowerCase()==='tez'
              ? '<span class="mo-tez-badge"><i class="fa-solid fa-bolt"></i> Tez</span>'
              : ''}
            <span class="mo-order-count">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
            <span class="mo-status ${this.statusClass(status)}">${this.esc(status)}</span>
          </div>
        </header>

        <div class="mo-items">
          ${items.length
            ? items.slice(0,3).map(item => this.item(item, order, status)).join('')
            : '<div class="mo-no-items">Order item details are unavailable.</div>'
          }
          ${items.length > 3 ? `<div class="mo-no-items">+ ${items.length-3} more item${items.length-3===1?'':'s'}</div>` : ''}
        </div>

        ${items.length > 1 ? `
          <div class="mo-customer-note">
            <i class="fa-solid fa-circle-info"></i>
            Items may be fulfilled by different sellers and can arrive separately. This remains one DesiMall order for you.
          </div>
        ` : ''}

        <footer class="mo-order-foot">
          <div>
            <span>Payment</span>
            <strong>${this.esc(String(order.PaymentMethod || order.payment_method || 'COD').toUpperCase())}</strong>
          </div>

          <div>
            <span>Status</span>
            <strong>${this.esc(status)}</strong>
          </div>

          <div class="mo-total">
            <span>Total</span>
            <strong>${this.money(total)}</strong>
          </div>

          <div class="mo-order-actions">
            ${showTrack ? `
              <a class="mo-track" href="track-order.html?order=${encodeURIComponent(code)}">
                <i class="fa-solid fa-location-dot"></i> Track Order
              </a>
            ` : ''}
            ${delivered ? `
              <a class="mo-buy-again" href="../index.html">
                <i class="fa-solid fa-rotate-right"></i> Buy Again
              </a>
            ` : ''}
            <a class="mo-help" href="support.html">
              <i class="fa-solid fa-headset"></i> ${delivered ? 'Return / Help' : 'Get Help'}
            </a>
          </div>
        </footer>
      </article>
    `;
  },

  item(item, order, orderStatus) {
    const qty = Number(item.Qty || item.qty || 0);
    const unit = Number(item.UnitPrice || item.unit_price || item.Rate || 0);
    const total = Number(item.LineTotal || item.line_total || item.Amount || unit * qty);
    const itemId = item.OrderItemID || item.id || '';
    const existing = this.activeReturnFor(item);
    const image = window.ProductImageResolver
      ? ProductImageResolver.resolve(item, { fallback: '../assets/products/noimage.jpg' })
      : String(item.ImageURL || item.image_url || item.ProductImage || '../assets/products/noimage.jpg');

    let action = '';

    if (existing) {
      const pickupOtp = String(existing.PickupOTP || '').trim();
      action = `
        <span class="mo-return-status">
          ${String(existing.Status || '') === 'Refund Completed'
            ? `Refunded ${this.money(existing.RefundAmount || 0)}`
            : `Return: ${this.esc(existing.Status || 'Requested')}`}
        </span>
        ${pickupOtp ? `
          <span class="mo-return-otp" title="Give this OTP only to your assigned rider at pickup">
            <i class="fa-solid fa-key"></i>
            Pickup OTP <b>${this.esc(pickupOtp)}</b>
          </span>
        ` : ''}
      `;
    } else if (orderStatus === 'Delivered' && itemId) {
      action = `
        <button type="button" class="mo-return"
          onclick="CustomerOrders.openReturn('${this.esc(itemId)}')">
          <i class="fa-solid fa-rotate-left"></i> Return Item
        </button>
      `;
    }

    return `
      <div class="mo-item">
        <div class="mo-item-icon">
          ${image
            ? `<img src="${this.esc(image)}" alt="${this.esc(item.ProductName || item.product_name || 'Product')}" onerror="this.parentElement.innerHTML='<i class=&quot;fa-solid fa-box&quot;></i>'">`
            : '<i class="fa-solid fa-box"></i>'}
        </div>

        <div class="mo-item-copy">
          <strong>${this.esc(item.ProductName || item.product_name || 'Product')}</strong>
          <span>Qty ${qty}${item.SKU || item.sku ? ` · SKU ${this.esc(item.SKU || item.sku)}` : ''}</span>
          ${action ? `<div class="mo-item-actions">${action}</div>` : ''}
        </div>

        <b>${this.money(total)}</b>
      </div>
    `;
  },

  openReturn(itemId) {
    let found = null;

    for (const order of this.orders) {
      const item = (order.Items || []).find(x =>
        String(x.OrderItemID || x.id || '') === String(itemId)
      );

      if (item) {
        found = { item, order };
        break;
      }
    }

    if (!found) return alert('Order item not found.');

    this.selectedItem = found.item;
    returnItemName.textContent =
      `${found.item.ProductName || 'Item'} · Qty ${Number(found.item.Qty || 1)}`;

    returnReason.value = '';
    returnDescription.value = '';
    returnModal.classList.add('show');
  },

  closeReturn() {
    returnModal.classList.remove('show');
    this.selectedItem = null;
  },

  async submitReturn() {
    if (!this.selectedItem) return;

    const reason = returnReason.value.trim();
    if (!reason) return alert('Please select a return reason.');

    submitReturnRequest.disabled = true;
    submitReturnRequest.textContent = 'Submitting...';

    try {
      const result = await DesiMallAPI.createReturnRequest({
        OrderItemID: this.selectedItem.OrderItemID || this.selectedItem.id,
        Reason: reason,
        Description: returnDescription.value.trim()
      });

      alert(result.message || 'Return request submitted.');
      this.closeReturn();
      await this.load();
    } catch (error) {
      alert(error?.message || 'Could not submit return request.');
    } finally {
      submitReturnRequest.disabled = false;
      submitReturnRequest.textContent = 'Submit Return';
    }
  },

  statusClass(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'delivered') return 'delivered';
    if (value === 'cancelled') return 'cancelled';
    if (value === 'placed') return 'placed';
    return 'moving';
  },

  writeTrackingCompatibility() {
    const saved = this.orders.map(order => {
      const code = order.OrderCode || order.order_code || order.OrderID || order.id;

      return {
        OrderID: code,
        InternalOrderID: order.OrderID || order.id,
        UserID: this.user.UserID,
        Status: this.normalizedStatus(order),
        OrderDate: order.CreatedAt || order.created_at || '',
        TotalAmount: Number(order.TotalAmount || order.total_amount || 0),
        PaymentMode: order.PaymentMethod || order.payment_method || 'cod',
        DeliveryAddress: order.DeliveryAddress || '',
        Items: order.Items || []
      };
    });

    localStorage.setItem('desimall_orders', JSON.stringify(saved));
  }
};

document.addEventListener('DOMContentLoaded', () => CustomerOrders.init());
