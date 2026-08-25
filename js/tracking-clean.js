
const TrackingClean = {
  map: null,
  riderMarker: null,
  customerMarker: null,
  routeLine: null,
  pollTimer: null,
  orderId: '',
  lastRouteKey: '',

  init() {
    const form = document.getElementById('trackForm');
    const input = document.getElementById('orderInput');

    const params = new URLSearchParams(location.search);
    const incoming = (params.get('order') || '').trim();
    if (incoming) {
      input.value = incoming;
      this.track(incoming);
    }

    form?.addEventListener('submit', e => {
      e.preventDefault();
      const id = input.value.trim();
      if (id) this.track(id);
    });

    document.getElementById('saveDeliveryGpsBtn')?.addEventListener(
      'click',
      () => this.saveCurrentDeliveryLocation()
    );
  },

  async api(path, options = {}) {
    try {
      if (
        typeof DesiMallAuth !== 'undefined' &&
        typeof DesiMallAuth.refreshIfNeeded === 'function'
      ) {
        await DesiMallAuth.refreshIfNeeded(false);
      }
    } catch (_) {}

    const token = this.getToken();
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
    const base =
      window.DESIMALL_API_BASE ||
      localStorage.getItem('desimall_api_base') ||
      'https://desimall-backend.onrender.com';

    const res = await fetch(base.replace(/\/$/,'') + path, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });

    let data = null;
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
    }

    return data;
  },

  getToken() {
    try {
      if (
        typeof DesiMallAuth !== 'undefined' &&
        typeof DesiMallAuth.getAccessToken === 'function'
      ) {
        const sharedToken = DesiMallAuth.getAccessToken();
        if (sharedToken) return sharedToken;
      }

      const session = JSON.parse(
        localStorage.getItem('desimall_session') || 'null'
      );

      return (
        session?.accessToken ||
        session?.access_token ||
        localStorage.getItem('desimall_access_token') ||
        localStorage.getItem('access_token') ||
        ''
      );
    } catch (_) {
      return '';
    }
  },

  async track(orderId) {
    this.orderId = orderId;
    clearTimeout(this.pollTimer);

    document.getElementById('emptyState')?.classList.add('hidden');

    try {
      const data = await this.api(`/api/v1/orders/${encodeURIComponent(orderId)}/tracking`);
      this.render(data);
    this.renderTimelineFromStatus(data?.status || data?.orderStatus || data?.order?.status);
      history.replaceState(null, '', `?order=${encodeURIComponent(orderId)}`);
      this.pollTimer = setTimeout(() => this.track(orderId), 7000);
    } catch (error) {
      document.getElementById('trackState')?.classList.add('hidden');
      const empty = document.getElementById('emptyState');
      empty?.classList.remove('hidden');
      document.getElementById('emptyTitle').textContent = 'Tracking unavailable';
      document.getElementById('emptyMessage').textContent = error.message;
    }
  },

  render(data) {
    const order = data?.order || data?.Order || data || {};
    const state = document.getElementById('trackState');
    state?.classList.remove('hidden');

    const id = order.OrderID || order.order_id || this.orderId;
    const status = String(order.Status || order.status || data?.status || 'Placed');
    const modeRaw = String(order.FulfillmentMode || order.fulfillment_mode || data?.fulfillmentMode || data?.mode || 'desimall').toLowerCase();
    const mode = this.modeLabel(modeRaw);

    document.getElementById('orderIdText').textContent = id;
    document.getElementById('statusBadge').textContent = this.pretty(status);
    document.getElementById('modeName').textContent = mode;

    const otp =
      data?.DeliveryOTP ??
      data?.deliveryOtp ??
      order?.DeliveryOTP ??
      order?.delivery_otp ??
      '';

    const otpBox = document.getElementById('otpBox');
    if (otp && !/delivered|completed|cancelled|returned/i.test(status)) {
      otpBox?.classList.remove('hidden');
      document.getElementById('otpText').textContent = String(otp);
    } else {
      otpBox?.classList.add('hidden');
    }

    this.renderTimeline(status, modeRaw);
    this.renderLive(data, order, status, modeRaw);
  },


  async saveCurrentDeliveryLocation() {
    const box = document.getElementById('deliveryGpsRepair');
    const btn = document.getElementById('saveDeliveryGpsBtn');
    const msg = document.getElementById('deliveryGpsRepairMsg');

    if (!navigator.geolocation) {
      if (msg) msg.textContent = 'GPS is not supported on this device.';
      box?.classList.add('error');
      return;
    }

    if (btn) btn.disabled = true;
    if (msg) msg.textContent = 'Getting precise location…';
    box?.classList.remove('ok', 'error');

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 25000
        });
      });

      const accuracy = Number(pos.coords.accuracy || 0);
      if (accuracy > 1000) {
        throw new Error(
          `GPS accuracy weak (±${Math.round(accuracy)}m). Turn on Precise Location and retry.`
        );
      }

      await this.api(
        `/api/v1/orders/${encodeURIComponent(this.orderId)}/delivery-location`,
        {
          method: 'PATCH',
          body: {
            Latitude: pos.coords.latitude,
            Longitude: pos.coords.longitude,
            Accuracy: pos.coords.accuracy
          }
        }
      );

      if (msg) msg.textContent = 'Exact delivery GPS saved. Loading live route…';
      box?.classList.add('ok');

      await this.track(this.orderId);
    } catch (error) {
      let message = error?.message || 'Could not save location.';
      if (Number(error?.code) === 1) message = 'Location permission denied.';
      if (Number(error?.code) === 2) message = 'GPS location unavailable.';
      if (Number(error?.code) === 3) message = 'GPS timed out. Try again outdoors.';
      if (msg) msg.textContent = message;
      box?.classList.add('error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },



  ensureTimelineClasses() {
    const wanted = [
      'Order placed',
      'Seller accepted',
      'Preparing',
      'Picked up',
      'On the way',
      'Delivered'
    ];

    wanted.forEach(label => {
      const all = [...document.querySelectorAll('div,li')];
      const host = all.find(el => {
        if (el.classList.contains('timeline-step')) return false;
        const txt = (el.textContent || '').trim();
        return txt.startsWith(label) && el.children.length <= 4;
      });
      if (host) host.classList.add('timeline-step');
    });
  },

  normalizeOrderStatus(status) {
    return String(status || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  },

  timelineStageIndex(status) {
    const s = this.normalizeOrderStatus(status);

    const map = {
      pending: 0,
      placed: 0,
      order_placed: 0,
      created: 0,

      accepted: 1,
      seller_accepted: 1,
      confirmed: 1,

      preparing: 2,
      processing: 2,
      ready: 2,
      ready_for_pickup: 2,

      picked_up: 3,
      pickedup: 3,
      rider_picked_up: 3,
      pickup_completed: 3,

      out_for_delivery: 4,
      on_the_way: 4,
      on_theway: 4,
      in_transit: 4,
      reached_customer: 4,

      delivered: 5,
      completed: 5
    };

    return Object.prototype.hasOwnProperty.call(map, s) ? map[s] : 0;
  },

  renderTimelineFromStatus(status) {
    this.ensureTimelineClasses();
    const stage = this.timelineStageIndex(status);
    const nodes = [...document.querySelectorAll('.timeline-step')];

    if (!nodes.length) return;

    nodes.forEach((node, index) => {
      node.classList.remove('done', 'active', 'pending');

      const label = node.querySelector('.timeline-state');

      if (index < stage) {
        node.classList.add('done');
        if (label) label.textContent = 'Completed';
      } else if (index === stage) {
        node.classList.add('active');
        if (label) label.textContent = stage === 5 ? 'Completed' : 'Current status';
      } else {
        node.classList.add('pending');
        if (label) label.textContent = 'Pending';
      }
    });
  },

  modeLabel(mode) {
    if (mode === 'tez') return '⚡ Tez Delivery';
    if (mode === 'food') return '🍴 Food Delivery';
    if (['service','services'].includes(mode)) return '🛠 Service Visit';
    if (['try-on','try_on','tryon'].includes(mode)) return '👕 Try-On';
    return '🛍 DesiMall Delivery';
  },

  async renderLive(data, order, status, mode) {
    const delivered = /delivered|completed|cancelled|returned/i.test(status);
    const mapWrap = document.getElementById('mapWrap');
    const dot = document.getElementById('liveDot');
    const title = document.getElementById('liveTitle');
    const subtitle = document.getElementById('liveSubtitle');
    const eta = document.getElementById('etaText');

    if (delivered) {
      mapWrap?.classList.add('hidden');
      dot?.classList.remove('on');
      title.textContent = /completed/i.test(status) ? 'Service completed' : 'Order delivered';
      subtitle.textContent = 'Live location sharing has ended.';
      eta.textContent = 'Completed';
      return;
    }

    const loc =
      data?.location ||
      data?.riderLocation ||
      data?.liveLocation ||
      order?.location ||
      null;

    const destination =
      data?.destination ||
      data?.customerLocation ||
      order?.destination ||
      null;

    const rLat = Number(loc?.latitude ?? loc?.Latitude);
    const rLon = Number(loc?.longitude ?? loc?.Longitude);
    const cLat = Number(destination?.latitude ?? destination?.Latitude);
    const cLon = Number(destination?.longitude ?? destination?.Longitude);

    const validRider = this.validCoord(rLat, rLon);
    const validCustomer = this.validCoord(cLat, cLon);
    const live = Boolean(data?.live ?? data?.isLive ?? data?.locationLive ?? false);

    const gpsRepair = document.getElementById('deliveryGpsRepair');

    if (!validRider || !validCustomer) {
      mapWrap?.classList.add('hidden');
      dot?.classList.remove('on');
      title.textContent = 'Waiting for valid live GPS';
      subtitle.textContent = !validCustomer
        ? 'Exact delivery location is missing for this address.'
        : 'Rider/partner has not shared a fresh precise GPS location yet.';
      eta.textContent = 'Waiting for GPS';

      if (gpsRepair) {
        gpsRepair.classList.toggle('hidden', validCustomer);
      }
      return;
    }

    gpsRepair?.classList.add('hidden');

    dot?.classList.toggle('on', live);
    mapWrap?.classList.remove('hidden');
    title.textContent = live ? 'Live location is active' : 'Showing latest available location';
    subtitle.textContent = this.liveSubtitleForMode(mode);

    await this.drawRoute(rLat, rLon, cLat, cLon, data);
  },

  liveSubtitleForMode(mode) {
    if (mode === 'food') return 'Delivery partner is heading to your address.';
    if (['service','services'].includes(mode)) return 'Service partner is heading to your address.';
    if (['try-on','try_on','tryon'].includes(mode)) return 'Try-On agent is heading to your address.';
    return 'Rider is heading to your address.';
  },

  async drawRoute(rLat, rLon, cLat, cLon, data) {
    const map = this.ensureMap([rLat, rLon]);
    if (!map) return;

    const riderIcon = L.divIcon({
      className: '',
      html: '<div style="width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#ff6b00;color:white;border:3px solid white;box-shadow:0 4px 14px rgba(0,0,0,.35)"><i class="fa-solid fa-motorcycle"></i></div>',
      iconSize: [40,40],
      iconAnchor: [20,20]
    });

    if (this.riderMarker) this.riderMarker.setLatLng([rLat,rLon]);
    else this.riderMarker = L.marker([rLat,rLon], { icon:riderIcon }).addTo(map);

    if (this.customerMarker) this.customerMarker.setLatLng([cLat,cLon]);
    else this.customerMarker = L.marker([cLat,cLon]).addTo(map).bindPopup('Delivery location');

    const routeKey = [rLat.toFixed(5),rLon.toFixed(5),cLat.toFixed(5),cLon.toFixed(5)].join('|');

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${rLon},${rLat};${cLon},${cLat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { cache:'no-store' });
      if (!res.ok) throw new Error('route');
      const routeData = await res.json();
      const route = routeData?.routes?.[0];
      if (!route) throw new Error('route');

      const coords = route.geometry.coordinates.map(([lon,lat]) => [lat,lon]);

      if (this.routeLine) this.routeLine.setLatLngs(coords);
      else this.routeLine = L.polyline(coords, { weight:6, opacity:.9 }).addTo(map);

      if (routeKey !== this.lastRouteKey) {
        map.fitBounds(this.routeLine.getBounds(), { padding:[35,35], maxZoom:17 });
        this.lastRouteKey = routeKey;
      }

      const km = Number(route.distance || 0) / 1000;
      const mins = Math.max(1, Math.ceil(Number(route.duration || 0) / 60));
      document.getElementById('distanceText').textContent =
        `${km < 1 ? Math.round(km*1000)+' m' : km.toFixed(1)+' km'} away`;
      document.getElementById('etaText').textContent = `ETA about ${Math.min(25, mins)} min`;
    } catch (_) {
      const coords = [[rLat,rLon],[cLat,cLon]];
      if (this.routeLine) this.routeLine.setLatLngs(coords);
      else this.routeLine = L.polyline(coords, { weight:5, opacity:.7, dashArray:'7 7' }).addTo(map);
      map.fitBounds(this.routeLine.getBounds(), { padding:[35,35], maxZoom:17 });
      document.getElementById('distanceText').textContent = 'Route temporarily unavailable';
      document.getElementById('etaText').textContent =
        data?.etaMinutes ? `ETA about ${Math.min(25, Number(data.etaMinutes))} min` : 'Live delivery';
    }

    const age = Number(data?.ageSeconds ?? data?.locationAgeSeconds);
    document.getElementById('updatedText').textContent =
      Number.isFinite(age) ? `Updated ${Math.max(0,Math.round(age))}s ago` : 'Live';
  },

  ensureMap(center) {
    if (typeof L === 'undefined') return null;
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 10);
      return this.map;
    }
    this.map = L.map('liveMap').setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'© OpenStreetMap contributors'
    }).addTo(this.map);
    return this.map;
  },

  renderTimeline(status, mode) {
    const service = ['service','services'].includes(mode);
    const labels = service
      ? ['Booked','Partner assigned','Accepted','On the way','Reached','Completed']
      : ['Order placed','Seller accepted','Preparing','Picked up','On the way','Delivered'];

    const normalized = status.toLowerCase();
    let current = 0;

    const deliveryRules = [
      /placed|pending|new/,
      /accepted|approved/,
      /preparing|ready/,
      /picked/,
      /on the way|reached/,
      /delivered|completed/
    ];

    const serviceRules = [
      /placed|booked|pending/,
      /assigned/,
      /accepted/,
      /on the way/,
      /reached|arrived/,
      /completed|delivered/
    ];

    const rules = service ? serviceRules : deliveryRules;
    rules.forEach((r,i) => { if (r.test(normalized)) current = Math.max(current,i); });

    const timeline = document.getElementById('timeline');
    timeline.innerHTML = labels.map((label,i) =>
      `<div class="step ${i<current?'done':i===current?'current':''}">
        <span>${this.escape(label)}</span>
      </div>`
    ).join('');
  },

  validCoord(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
      !(Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001);
  },

  pretty(value) {
    return String(value || '').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }
};

document.addEventListener('DOMContentLoaded', () => TrackingClean.init());
