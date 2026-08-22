document.addEventListener('DOMContentLoaded', () => TrackingApp.init());

const TrackingApp = {
  liveTimer: null,
  lastDisplayedEta: null,
  stages: [
    { key:'placed', label:'Order placed', icon:'fa-receipt' },
    { key:'accepted', label:'Seller accepted', icon:'fa-store' },
    { key:'preparing', label:'Preparing', icon:'fa-box-open' },
    { key:'picked_up', label:'Rider picked up', icon:'fa-motorcycle' },
    { key:'on_the_way', label:'On the way', icon:'fa-route' },
    { key:'delivered', label:'Delivered', icon:'fa-circle-check' }
  ],

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  },

  stageKey(status) {
    const raw = String(status || '').trim().toLowerCase().replace(/\s+/g,'_');
    const map = {
      new:'placed', placed:'placed',
      accepted:'accepted',
      preparing:'preparing',
      ready:'preparing', ready_for_pickup:'preparing',
      pickup_assigned:'preparing',
      picked_up:'picked_up',
      out_for_delivery:'on_the_way', on_the_way:'on_the_way',
      reached_customer:'on_the_way',
      delivered:'delivered',
      cancelled:'cancelled', canceled:'cancelled', rejected:'cancelled'
    };
    return map[raw] || 'placed';
  },

  customerStatus(status) {
    const key=this.stageKey(status);
    if(key==='cancelled') return 'Cancelled';
    return this.stages.find(x=>x.key===key)?.label || 'Order placed';
  },

  async init() {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('order') || '';
    const input = document.getElementById('trackingOrderId');
    if (input) input.value = orderId;

    document.getElementById('trackingForm')?.addEventListener('submit', e => {
      e.preventDefault(); this.track();
    });

    DesiMallAuth?.updateHeader?.();
    CartManager?.updateCartBadge?.();

    if (orderId) await this.track();
  },

  findOrder(orders, id) {
    const wanted = String(id || '').trim().toLowerCase();
    return (orders || []).find(order => {
      const code = order.OrderCode || order.order_code || order.OrderID || '';
      const internal = order.OrderID || order.id || order.InternalOrderID || '';
      return String(code).toLowerCase() === wanted || String(internal).toLowerCase() === wanted;
    }) || null;
  },

  async track() {
    const id = document.getElementById('trackingOrderId')?.value.trim();
    const result = document.getElementById('trackingResult');
    if (!id || !result) return;

    result.innerHTML = '<div class="tracking-empty"><i class="fa-solid fa-spinner fa-spin"></i><h2>Loading latest status...</h2><p>Please wait a moment.</p></div>';
    result.classList.remove('hidden');

    try {
      const orders = await DesiMallAPI.getMyOrders();
      const order = this.findOrder(orders, id);
      if (!order) {
        result.innerHTML = '<div class="tracking-empty"><i class="fa-solid fa-box-open"></i><h2>Order not found</h2><p>Check the order ID and try again.</p></div>';
        return;
      }
      this.render(order);
    } catch (error) {
      const authEnded = error?.status === 401 || error?.code === 'SESSION_ENDED';
      result.innerHTML = `<div class="tracking-empty">
        <i class="fa-solid ${authEnded ? 'fa-user-lock' : 'fa-triangle-exclamation'}"></i>
        <h2>${authEnded ? 'Please login to track this order' : 'Could not load latest status'}</h2>
        <p>${this.esc(error?.message || 'Please try again.')}</p>
        ${authEnded ? '<a href="login.html">Login</a>' : '<button type="button" onclick="TrackingApp.track()">Try Again</button>'}
      </div>`;
    }
  },

  render(order) {
    const result = document.getElementById('trackingResult');
    const orderCode = order.OrderCode || order.order_code || order.OrderID || '—';
    const rawStatus = order.TrackingStatus || order.tracking_status || order.Status || order.status || order.DeliveryStatus || 'Placed';
    const currentKey = this.stageKey(rawStatus);
    const cancelled = currentKey === 'cancelled';
    const currentIndex = this.stages.findIndex(s => s.key === currentKey);
    const createdAt = order.CreatedAt || order.created_at || order.OrderDate || new Date().toISOString();
    const orderedDate = new Date(createdAt);
    const total = Number(order.TotalAmount ?? order.total_amount ?? 0);
    const address = order.DeliveryAddress || order.delivery_address || null;
    const internalOrderId = order.OrderID || order.id || order.InternalOrderID || '';
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null; }

    const riderName = order.RiderName || order.rider_name || order.AssignedRiderName || '';
    const riderMobile = order.RiderMobile || order.rider_mobile || order.AssignedRiderMobile || '';
    const etaText = order.EstimatedArrival || order.estimated_arrival || order.ETA || '';
    const isTez = Boolean(
      order.IsTez ||
      String(order.FulfillmentMode || order.fulfillment_mode || '').toLowerCase() === 'tez'
    );
    const tezMin = Number(order.DeliveryTargetMinMinutes || order.delivery_target_min_minutes || 0);
    const tezMax = Number(order.DeliveryTargetMaxMinutes || order.delivery_target_max_minutes || 0);

    result.innerHTML = `<article class="tracking-card">
      <div class="tracking-head">
        <div><span>ORDER</span><h2>${this.esc(orderCode)}</h2></div>
        <strong class="tracking-status ${cancelled ? 'cancelled' : ''}">${this.esc(cancelled ? 'Cancelled' : this.customerStatus(rawStatus))}</strong>
      </div>

      ${isTez ? `
        <div class="tracking-tez-banner">
          <i class="fa-solid fa-bolt"></i>
          <strong>Tez Delivery</strong>
          <span>${tezMin && tezMax ? `Target ${tezMin}–${tezMax} min` : 'Fast-delivery order'}</span>
        </div>
      ` : ''}

      <div class="tracking-meta">
        <span><i class="fa-solid fa-calendar"></i> Ordered ${orderedDate.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>
        <span><i class="fa-solid fa-indian-rupee-sign"></i> ${total.toLocaleString('en-IN')}</span>
      </div>

      ${cancelled ? `
        <div class="cancelled-message"><i class="fa-solid fa-circle-xmark"></i> This order was cancelled.</div>
      ` : `
        ${currentKey === 'on_the_way' ? `
          <section class="rider-live-card">
            <div class="rider-live-icon"><i class="fa-solid fa-motorcycle"></i></div>
            <div>
              <small>YOUR ORDER IS ON THE WAY</small>
              <h3>${riderName ? `Rider: ${this.esc(riderName)}` : 'Rider is heading to you'}</h3>
              ${etaText ? `<p>Estimated arrival: ${this.esc(etaText)}</p>` : '<p>Follow the live order status here.</p>'}
            </div>
            <div class="rider-actions">
              ${riderMobile ? `<a href="tel:${this.esc(riderMobile)}"><i class="fa-solid fa-phone"></i> Call Rider</a>` : ''}
              <a href="support.html"><i class="fa-solid fa-headset"></i> Get Help</a>
            </div>
          </section>
        ` : ''}

        ${isTez && !cancelled && currentKey !== 'delivered' ? `
          <section class="tez-live-panel" id="tezLivePanel">
            <div class="tez-live-top">
              <div>
                <small>TEZ DELIVERY</small>
                <h3 id="tezLiveEta">Checking delivery status…</h3>
                <p id="tezLiveStatus">Live tracking starts after rider pickup.</p>
              </div>
              <span class="tez-live-dot" id="tezLiveDot"></span>
            </div>

            <div class="tez-delivery-otp hidden" id="tezDeliveryOtpBox">
              <span>DELIVERY OTP</span>
              <strong id="tezDeliveryOtp">------</strong>
              <small>Order receive karne ke baad hi rider ko OTP batayein.</small>
            </div>

            <iframe id="tezLiveMap" class="tez-live-map hidden" title="Rider live location map" loading="lazy"></iframe>
            <div class="tez-live-actions">
              <span id="tezLocationUpdated"></span>
            </div>
          </section>
        ` : currentKey === 'delivered' && isTez ? `
          <section class="tez-delivered-card">
            <i class="fa-solid fa-circle-check"></i>
            <div>
              <strong>Tez order delivered</strong>
              <p>Delivery OTP verified. Rider live location has been stopped.</p>
            </div>
          </section>
        ` : ''}

        <ol class="tracking-timeline">
          ${this.stages.map((stage,index)=>{
            const complete=index<=Math.max(0,currentIndex);
            const current=index===Math.max(0,currentIndex);
            return `<li class="${complete?'complete':''} ${current?'current':''}">
              <span><i class="fa-solid ${complete && !current ? 'fa-check' : stage.icon}"></i></span>
              <div>
                <strong>${stage.label}</strong>
                <small>${current?'Current status':complete?'Completed':'Pending'}</small>
              </div>
            </li>`;
          }).join('')}
        </ol>
      `}

      <div class="tracking-help">
        <a href="my-orders.html"><i class="fa-solid fa-arrow-left"></i> My Orders</a>
        <a href="support.html"><i class="fa-solid fa-headset"></i> Get Help</a>
      </div>

      ${this.renderAddress(address)}
    </article>`;

    result.classList.remove('hidden');
    if (isTez && internalOrderId && !cancelled && currentKey !== 'delivered') {
      this.startLiveTracking(internalOrderId);
    }
    DesiMallAnalytics?.track?.('track_order', {orderId: orderCode, status: rawStatus});
  },

  startLiveTracking(orderId) {
    const load = () => this.loadLiveTracking(orderId);
    load();
    this.liveTimer = setInterval(load, 8000);
  },

  async loadLiveTracking(orderId) {
    try {
      const data = await DesiMallAPI.getOrderLiveTracking(orderId);

      const etaEl = document.getElementById('tezLiveEta');
      const statusEl = document.getElementById('tezLiveStatus');
      const map = document.getElementById('tezLiveMap');
      const updated = document.getElementById('tezLocationUpdated');
      const dot = document.getElementById('tezLiveDot');
      const otpBox = document.getElementById('tezDeliveryOtpBox');
      const otpEl = document.getElementById('tezDeliveryOtp');

      if (data?.delivered) {
        if (this.liveTimer) {
          clearInterval(this.liveTimer);
          this.liveTimer = null;
        }
        this.lastDisplayedEta = null;
        return;
      }

      if (!data?.liveTrackingAvailable) {
        this.lastDisplayedEta = null;

        if (etaEl) {
          etaEl.textContent = 'Live tracking starts after rider pickup';
        }

        if (statusEl) {
          statusEl.textContent =
            'Seller is preparing your order / rider is heading to pickup.';
        }

        if (map) map.classList.add('hidden');
        if (otpBox) otpBox.classList.add('hidden');
        if (dot) dot.classList.remove('live');
        if (updated) updated.textContent = '';

        return;
      }

      let eta = Math.max(
        1,
        Math.min(25, Number(data?.etaMinutes ?? 25))
      );

      // Customer should see ETA reducing as rider gets closer.
      // Small GPS jumps must not make the displayed ETA go backwards/up.
      if (
        Number.isFinite(this.lastDisplayedEta) &&
        eta > this.lastDisplayedEta
      ) {
        eta = this.lastDisplayedEta;
      }

      this.lastDisplayedEta = eta;

      if (etaEl) {
        etaEl.textContent =
          eta <= 1
            ? 'Rider is almost there'
            : `Estimated arrival: about ${eta} min`;
      }

      if (otpBox && otpEl && data?.deliveryOtp) {
        otpEl.textContent = String(data.deliveryOtp);
        otpBox.classList.remove('hidden');
      }

      const loc = data?.location;

      if (
        !loc ||
        !Number.isFinite(Number(loc.latitude)) ||
        !Number.isFinite(Number(loc.longitude))
      ) {
        if (statusEl) {
          statusEl.textContent =
            'Rider picked up your order. Waiting for live GPS signal…';
        }

        if (map) map.classList.add('hidden');
        if (dot) dot.classList.remove('live');

        return;
      }

      const lat = Number(loc.latitude);
      const lon = Number(loc.longitude);
      const delta = 0.006;
      const bbox = [
        lon - delta,
        lat - delta,
        lon + delta,
        lat + delta
      ].join(',');

      const osm =
        `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}` +
        `&layer=mapnik&marker=${encodeURIComponent(lat + ',' + lon)}`;

      if (map) {
        map.src = osm;
        map.classList.remove('hidden');
      }

      if (statusEl) {
        const distance = Number(data?.distanceKm);

        if (Number.isFinite(distance)) {
          statusEl.textContent =
            distance < 0.15
              ? 'Rider is very close to your delivery location'
              : distance < 1
                ? `Rider is about ${Math.round(distance * 1000)} m away`
                : `Rider is about ${distance.toFixed(1)} km away`;
        } else {
          statusEl.textContent =
            data.live
              ? 'Rider location is live'
              : 'Showing rider’s latest available location';
        }
      }

      if (updated) {
        updated.textContent =
          loc.ageSeconds == null
            ? ''
            : `Updated ${
                loc.ageSeconds <= 5
                  ? 'just now'
                  : `${loc.ageSeconds}s ago`
              }`;
      }

      if (dot) {
        dot.classList.toggle('live', Boolean(data.live));
      }
    } catch (error) {
      const statusEl = document.getElementById('tezLiveStatus');

      if (statusEl) {
        statusEl.textContent =
          error?.message ||
          'Live tracking temporarily unavailable.';
      }
    }
  },

  renderAddress(address) {
    if (!address) {
      return '<div class="tracking-address"><h3>Delivery address</h3><p>Saved delivery address unavailable.</p></div>';
    }
    const fullName = address.FullName || address.recipient_name || '';
    const mobile = address.Mobile || address.mobile || '';
    const line1 = address.Address || address.AddressLine1 || address.line1 || '';
    const line2 = address.Landmark || address.AddressLine2 || address.line2 || '';
    const city = address.City || address.city || '';
    const district = address.District || address.district || '';
    const state = address.State || address.state || '';
    const pincode = address.Pincode || address.pincode || '';
    const locality = [city, district && district !== city ? district : '', state].filter(Boolean).join(', ');
    const lines = [fullName, line1, line2, `${locality}${pincode ? ` - ${pincode}` : ''}`.trim(), mobile].filter(Boolean);
    return `<div class="tracking-address"><h3>Delivery address</h3><p>${lines.map(v => this.esc(v)).join('<br>')}</p></div>`;
  }
};
