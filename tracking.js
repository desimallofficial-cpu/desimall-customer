// DesiMall Tracking v0.31.3
document.addEventListener('DOMContentLoaded', () => TrackingApp.init());

const TrackingApp = {
  liveTimer: null,
  lastDisplayedEta: null,
  tezMap: null,
  riderMarker: null,
  customerMarker: null,
  riderMarkerLatLng: null,
  markerAnimFrame: null,
  routeLine: null,
  routeCoords: [],
  routeFetchedAt: 0,
  lastRouteOrigin: null,
  lastRouteDestination: null,
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
    const input = document.getElementById('trackingOrderId');
    const id = String(input?.value || '').trim();
    const result = document.getElementById('trackingResult');

    if (!id || !result) return;

    // Keep the shareable URL in sync without reloading the page.
    try {
      const url = new URL(location.href);
      url.searchParams.set('order', id);
      history.replaceState({}, '', url);
    } catch (_) {}

    result.innerHTML = `
      <div class="tracking-empty">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <h2>Loading latest status...</h2>
        <p>Please wait a moment.</p>
      </div>`;
    result.classList.remove('hidden');

    try {
      const orders = await DesiMallAPI.getMyOrders();
      const list = Array.isArray(orders)
        ? orders
        : Array.isArray(orders?.orders)
          ? orders.orders
          : [];

      const order = this.findOrder(list, id);

      if (!order) {
        result.innerHTML = `
          <div class="tracking-empty">
            <i class="fa-solid fa-box-open"></i>
            <h2>Order not found</h2>
            <p>Check the order ID or open it from My Orders.</p>
          </div>`;
        return;
      }

      this.render(order);
    } catch (error) {
      const authEnded =
        error?.status === 401 ||
        error?.code === 'SESSION_ENDED' ||
        error?.code === 'INVALID_SESSION';

      result.innerHTML = `
        <div class="tracking-empty">
          <i class="fa-solid ${authEnded ? 'fa-user-lock' : 'fa-triangle-exclamation'}"></i>
          <h2>${authEnded ? 'Login required' : 'Could not load order'}</h2>
          <p>${this.esc(
            authEnded
              ? 'Please login again, then open Track Order from My Orders.'
              : (error?.message || 'Please try again in a moment.')
          )}</p>
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

            <div id="tezLiveMap" class="tez-live-map hidden" aria-label="Rider live location map"></div>
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

  ensureTezMap() {
    const el = document.getElementById('tezLiveMap');
    if (!el || typeof L === 'undefined') return null;

    if (!this.tezMap) {
      this.tezMap = L.map(el, {
        zoomControl: true,
        attributionControl: true
      });

      L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }
      ).addTo(this.tezMap);

      setTimeout(() => {
        try { this.tezMap.invalidateSize(); } catch (_) {}
      }, 80);
    }

    return this.tezMap;
  },

  bikeIcon(heading = 0) {
    const safeHeading = Number.isFinite(Number(heading)) ? Number(heading) : 0;

    return L.divIcon({
      className: 'dm-bike-marker-wrap',
      html: `
        <div class="dm-bike-marker" style="transform:rotate(${safeHeading}deg)">
          <div class="dm-bike-pulse"></div>
          <div class="dm-bike-circle">
            <i class="fa-solid fa-motorcycle"></i>
          </div>
        </div>
      `,
      iconSize: [52, 52],
      iconAnchor: [26, 26]
    });
  },

  customerIcon() {
    return L.divIcon({
      className: 'dm-customer-marker-wrap',
      html: `
        <div class="dm-customer-marker">
          <i class="fa-solid fa-house"></i>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 34]
    });
  },

  animateRiderMarker(nextLat, nextLon, heading = 0) {
    const map = this.ensureTezMap();
    if (!map) return;

    const target = L.latLng(Number(nextLat), Number(nextLon));

    if (!this.riderMarker) {
      this.riderMarker = L.marker(target, {
        icon: this.bikeIcon(heading),
        zIndexOffset: 1000
      }).addTo(map);

      this.riderMarkerLatLng = target;
      map.setView(target, 16);
      return;
    }

    if (this.markerAnimFrame) {
      cancelAnimationFrame(this.markerAnimFrame);
      this.markerAnimFrame = null;
    }

    const start = this.riderMarker.getLatLng();
    const startTime = performance.now();
    const duration = 3500;

    this.riderMarker.setIcon(this.bikeIcon(heading));

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const lat = start.lat + (target.lat - start.lat) * eased;
      const lng = start.lng + (target.lng - start.lng) * eased;

      this.riderMarker.setLatLng([lat, lng]);
      this.riderMarkerLatLng = L.latLng(lat, lng);

      if (progress < 1) {
        this.markerAnimFrame = requestAnimationFrame(step);
      } else {
        this.markerAnimFrame = null;
        this.riderMarkerLatLng = target;
      }
    };

    this.markerAnimFrame = requestAnimationFrame(step);
  },

  updateCustomerMarker(destination) {
    const map = this.ensureTezMap();
    if (!map || !destination) return;

    const lat = Number(destination.latitude);
    const lon = Number(destination.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    if (!this.customerMarker) {
      this.customerMarker = L.marker([lat, lon], {
        icon: this.customerIcon(),
        zIndexOffset: 500
      }).addTo(map);
    } else {
      this.customerMarker.setLatLng([lat, lon]);
    }
  },

  fitTezMap(riderLat, riderLon, destination) {
    const map = this.ensureTezMap();
    if (!map) return;

    const points = [];

    if (Number.isFinite(Number(riderLat)) && Number.isFinite(Number(riderLon))) {
      points.push([Number(riderLat), Number(riderLon)]);
    }

    if (
      destination &&
      Number.isFinite(Number(destination.latitude)) &&
      Number.isFinite(Number(destination.longitude))
    ) {
      points.push([
        Number(destination.latitude),
        Number(destination.longitude)
      ]);
    }

    if (points.length >= 2) {
      map.fitBounds(points, {
        padding: [50, 50],
        maxZoom: 16
      });
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    }

    setTimeout(() => {
      try { map.invalidateSize(); } catch (_) {}
    }, 50);
  },

  nearestRoutePoint(lat, lon) {
    if (!Array.isArray(this.routeCoords) || !this.routeCoords.length) {
      return { lat:Number(lat), lon:Number(lon) };
    }

    let best = null;
    let bestScore = Infinity;

    for (const point of this.routeCoords) {
      const dLat = Number(point[0]) - Number(lat);
      const dLon = Number(point[1]) - Number(lon);
      const score = dLat*dLat + dLon*dLon;

      if (score < bestScore) {
        bestScore = score;
        best = point;
      }
    }

    return best
      ? { lat:Number(best[0]), lon:Number(best[1]) }
      : { lat:Number(lat), lon:Number(lon) };
  },

  routeNeedsRefresh(riderLat, riderLon, destination) {
    if (!destination) return false;

    const now = Date.now();
    if (!this.routeFetchedAt || now - this.routeFetchedAt > 30000) {
      return true;
    }

    if (!this.lastRouteOrigin || !this.lastRouteDestination) {
      return true;
    }

    const moved =
      Math.abs(Number(riderLat) - Number(this.lastRouteOrigin.lat)) +
      Math.abs(Number(riderLon) - Number(this.lastRouteOrigin.lon));

    const destMoved =
      Math.abs(Number(destination.latitude) - Number(this.lastRouteDestination.lat)) +
      Math.abs(Number(destination.longitude) - Number(this.lastRouteDestination.lon));

    return moved > 0.001 || destMoved > 0.0002;
  },

  async updateRoadRoute(riderLat, riderLon, destination) {
    const map = this.ensureTezMap();
    if (!map || !destination) return null;

    const dLat = Number(destination.latitude);
    const dLon = Number(destination.longitude);

    if (![riderLat, riderLon, dLat, dLon].every(v => Number.isFinite(Number(v)))) {
      return null;
    }

    if (!this.routeNeedsRefresh(riderLat, riderLon, destination)) {
      return null;
    }

    this.routeFetchedAt = Date.now();
    this.lastRouteOrigin = { lat:Number(riderLat), lon:Number(riderLon) };
    this.lastRouteDestination = { lat:dLat, lon:dLon };

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${Number(riderLon)},${Number(riderLat)};${dLon},${dLat}` +
        `?overview=full&geometries=geojson&steps=false`;

      const response = await fetch(url, {
        method:'GET',
        cache:'no-store'
      });

      if (!response.ok) throw new Error('Route service unavailable');

      const data = await response.json();
      const route = data?.routes?.[0];

      if (!route?.geometry?.coordinates?.length) {
        throw new Error('Road route not found');
      }

      this.routeCoords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

      if (this.routeLine) {
        try { map.removeLayer(this.routeLine); } catch (_) {}
      }

      this.routeLine = L.polyline(
        this.routeCoords,
        {
          weight:6,
          opacity:.85,
          lineCap:'round',
          lineJoin:'round'
        }
      ).addTo(map);

      map.fitBounds(
        this.routeLine.getBounds(),
        { padding:[45,45], maxZoom:16 }
      );

      return {
        durationMinutes: Math.max(1, Math.ceil(Number(route.duration || 0) / 60)),
        distanceKm: Number(route.distance || 0) / 1000
      };
    } catch (error) {
      console.warn('Road route:', error);
      return null;
    }
  },

  async loadLiveTracking(orderId) {
    try {
      const data = await DesiMallAPI.getOrderLiveTracking(orderId);

      const etaEl = document.getElementById('tezLiveEta');
      const statusEl = document.getElementById('tezLiveStatus');
      const mapEl = document.getElementById('tezLiveMap');
      const updated = document.getElementById('tezLocationUpdated');
      const dot = document.getElementById('tezLiveDot');
      const otpBox = document.getElementById('tezDeliveryOtpBox');
      const otpEl = document.getElementById('tezDeliveryOtp');

      if (data?.delivered) {
        if (this.liveTimer) {
          clearInterval(this.liveTimer);
          this.liveTimer = null;
        }
        if (this.markerAnimFrame) {
          cancelAnimationFrame(this.markerAnimFrame);
          this.markerAnimFrame = null;
        }
        this.lastDisplayedEta = null;
        return;
      }

      if (!data?.liveTrackingAvailable) {
        this.lastDisplayedEta = null;
        if (etaEl) etaEl.textContent = 'Live tracking starts after rider pickup';
        if (statusEl) statusEl.textContent = 'Seller is preparing your order / rider is heading to pickup.';
        if (mapEl) mapEl.classList.add('hidden');
        if (otpBox) otpBox.classList.add('hidden');
        if (dot) dot.classList.remove('live');
        if (updated) updated.textContent = '';
        return;
      }

      if (otpBox && otpEl && data?.deliveryOtp) {
        otpEl.textContent = String(data.deliveryOtp);
        otpBox.classList.remove('hidden');
      }

      const loc = data?.location;
      const stale = Boolean(data?.locationStale);
      const valid = data?.locationValid !== false;

      if (!valid) {
        if (etaEl) etaEl.textContent = 'Waiting for correct rider GPS';
        if (statusEl) statusEl.textContent = 'Rider GPS looks incorrect. Waiting for a fresh valid location.';
        if (mapEl) mapEl.classList.add('hidden');
        if (dot) dot.classList.remove('live');
        if (updated) updated.textContent = '';
        return;
      }

      if (
        !loc ||
        !Number.isFinite(Number(loc.latitude)) ||
        !Number.isFinite(Number(loc.longitude))
      ) {
        if (etaEl) etaEl.textContent = 'Waiting for rider location';
        if (statusEl) statusEl.textContent = 'Rider picked up your order. Waiting for GPS signal…';
        if (mapEl) mapEl.classList.add('hidden');
        if (dot) dot.classList.remove('live');
        return;
      }

      if (stale || Number(loc.ageSeconds || 0) > 90) {
        if (etaEl) etaEl.textContent = 'Location update delayed';
        if (statusEl) statusEl.textContent = 'Waiting for a fresh rider location…';
        if (dot) dot.classList.remove('live');
        if (updated) updated.textContent = `Last update ${Number(loc.ageSeconds || 0)}s ago`;
        return;
      }

      const lat = Number(loc.latitude);
      const lon = Number(loc.longitude);
      const destination = data?.destination || null;

      if (mapEl) mapEl.classList.remove('hidden');
      this.ensureTezMap();
      this.updateCustomerMarker(destination);

      const routeInfo = await this.updateRoadRoute(lat, lon, destination);

      // Keep the bike visually on the road route.
      const snapped = this.nearestRoutePoint(lat, lon);
      this.animateRiderMarker(
        snapped.lat,
        snapped.lon,
        Number(loc.headingDeg || 0)
      );

      if (!this.routeLine) {
        this.fitTezMap(lat, lon, destination);
      }

      let eta = Number(data?.etaMinutes ?? 25);

      if (routeInfo?.durationMinutes) {
        eta = Math.min(25, routeInfo.durationMinutes);
      }

      eta = Math.max(1, Math.min(25, Number(eta)));

      // ETA should not jump upward during one live session.
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

      if (statusEl) {
        const distance =
          routeInfo?.distanceKm != null
            ? Number(routeInfo.distanceKm)
            : Number(data?.distanceKm);

        if (Number.isFinite(distance)) {
          statusEl.textContent =
            distance < 0.15
              ? 'Rider is very close to your delivery location'
              : distance < 1
                ? `Rider is about ${Math.round(distance * 1000)} m away`
                : `Rider is about ${distance.toFixed(1)} km away`;
        } else {
          statusEl.textContent = 'Rider location is live';
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

      if (dot) dot.classList.toggle('live', Boolean(data.live));
    } catch (error) {
      const statusEl = document.getElementById('tezLiveStatus');
      if (statusEl) {
        statusEl.textContent =
          error?.message || 'Live tracking temporarily unavailable.';
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
