/**
 * DesiMall Customer Checkout v0.6.0
 * Source of truth:
 * - Cart: local customer workspace
 * - Addresses: Supabase via /api/addresses
 * - Order price/stock/totals: PostgreSQL via POST /api/v1/orders
 */

document.addEventListener('DOMContentLoaded', () => CheckoutApp.init());

const CheckoutApp = {
  cart: [],
  addresses: [],
  selectedAddressId: '',
  coupon: null,
  deliveryFee: 0,
  fulfillmentMode: 'marketplace',
  tezPincode: '',
  tezStatus: null,
  mixedFulfillment: false,
  busy: false,
  paymentMethod: 'cod',

  money(value) {
    return `₹${Number(value || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2
    })}`;
  },

  esc(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c])
    );
  },

  image(item) {
    const src = item.ImageURL || item.Image || 'assets/products/noimage.jpg';
    return /^https?:/i.test(src)
      ? src
      : `../${String(src).replace(/^\.\.\//, '')}`;
  },

  getUser() {
    return typeof DesiMallAuth !== 'undefined'
      ? DesiMallAuth.getUser()
      : null;
  },

  async init() {
    const user = this.getUser();

    if (!user?.UserID || !DesiMallAuth?.getAccessToken?.()) {
      sessionStorage.setItem('desimall_after_login', 'checkout.html');
      location.replace('login.html');
      return;
    }

    // Never carry an old Razorpay/checkout error into a fresh checkout view.
    this.clearAlert();

    this.cart = CartManager
      .getCart()
      .map(item => CartManager.normalize(item))
      .filter(item => item.ProductID && item.Qty > 0);

    if (!this.cart.length) {
      location.replace('cart.html');
      return;
    }

    const modes = new Set(
      this.cart.map(item => {
        const mode = String(
          item.FulfilmentMode ||
          item.FulfillmentMode ||
          (item.IsFood ? 'food' : (item.IsTez ? 'tez' : 'marketplace'))
        ).toLowerCase();

        if (mode === 'food' || item.IsFood) return 'food';
        if (mode === 'tez' || item.IsTez) return 'tez';
        return 'marketplace';
      })
    );

    this.mixedFulfillment = modes.size > 1;
    this.fulfillmentMode =
      modes.size === 1 && modes.has('food') ? 'food' :
      modes.size === 1 && modes.has('tez') ? 'tez' :
      'marketplace';

    const firstTez = this.cart.find(item =>
      item.IsTez ||
      String(item.FulfilmentMode || item.FulfillmentMode || '').toLowerCase() === 'tez'
    );

    this.tezPincode = String(
      firstTez?.TezPincode ||
      localStorage.getItem('desimall_delivery_pincode') ||
      ''
    ).replace(/\D/g, '').slice(0, 6);

    if (this.mixedFulfillment) {
      this.showAlert(
        'Your cart contains items from different delivery services. Marketplace, Tez and Food orders must be placed separately.'
      );
    }

    CartManager.updateCartBadge();
    DesiMallAuth.updateHeader?.();

    this.bind();
    this.renderItems();
    this.renderCoupons();

    await this.loadPricingSettings();
    this.applyFulfillmentCopy();
    this.renderTotals();
    await this.loadAddresses();
  },

  async loadPricingSettings() {
    if (this.fulfillmentMode === 'tez') {
      const firstTez = this.cart.find(item =>
        item.IsTez ||
        String(item.FulfilmentMode || item.FulfillmentMode || '').toLowerCase() === 'tez'
      );
      this.deliveryFee = Math.max(
        0,
        Number(firstTez?.TezDeliveryFee || 0)
      );
      return;
    }

    if (this.fulfillmentMode === 'food') {
      const firstFood = this.cart.find(item =>
        item.IsFood ||
        String(item.FulfilmentMode || item.FulfillmentMode || '').toLowerCase() === 'food'
      );
      this.deliveryFee = Math.max(0, Number(firstFood?.FoodDeliveryFee || 0));
      return;
    }

    try {
      const token = DesiMallAuth?.getAccessToken?.() || '';
      const result = await DesiMallAPI.getMarketplaceSettings(token);
      const s = result?.settings || {};
      this.deliveryFee = Math.max(
        0,
        Number(s.DeliveryChargePerOrder ?? s.CustomerLogisticsFee ?? 0)
      );
    } catch (error) {
      console.warn('Delivery settings unavailable:', error);
      this.deliveryFee = 0;
    }
  },

  bind() {
    document.getElementById('btnPlaceOrder')?.addEventListener(
      'click',
      () => this.placeOrder()
    );

    document.getElementById('btnApplyCoupon')?.addEventListener(
      'click',
      () => this.applyCoupon()
    );

    document.getElementById('couponCode')?.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.applyCoupon();
        }
      }
    );
    document.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
      input.addEventListener('change', () => {
        this.clearAlert();
        this.paymentMethod = input.checked ? input.value : this.paymentMethod;
        document.querySelectorAll('.dm-pay-option').forEach(label => {
          label.classList.toggle('selected', Boolean(label.querySelector('input')?.checked));
        });
        this.renderTotals();
      });
    });
  },

  renderItems() {
    const list = document.getElementById('summaryItemsList');
    if (!list) return;

    const groups = new Map();
    this.cart.forEach(item => {
      const seller = String(
        item.SellerName || item.ShopName || item.Seller || 'DesiMall Seller'
      ).trim() || 'DesiMall Seller';
      if (!groups.has(seller)) groups.set(seller, []);
      groups.get(seller).push(item);
    });

    list.innerHTML = [...groups.entries()].map(([seller, items]) => `
      <section class="co-seller-group">
        <div class="co-seller-label">
          <i class="fa-solid fa-store"></i>
          <span>${this.esc(seller)}</span>
        </div>
        ${items.map(item => `
          <article class="co-summary-item">
            <img
              src="${this.esc(this.image(item))}"
              alt="${this.esc(item.ProductName)}"
              onerror="this.src='../assets/products/noimage.jpg'"
            >
            <div class="co-summary-copy">
              <strong>${this.esc(item.ProductName)}</strong>
              <span>
                Qty ${item.Qty}
                ${item.SelectedSize ? ` · Size ${this.esc(item.SelectedSize)}` : ''}
                ${item.SelectedColor ? ` · ${this.esc(item.SelectedColor)}` : ''}
              </span>
            </div>
            <b>${this.money(item.FinalPrice * item.Qty)}</b>
          </article>
        `).join('')}
      </section>
    `).join('');
  },

  renderCoupons() {
    const box = document.getElementById('availableCoupons');
    if (!box || typeof DesiMallCoupons === 'undefined') return;

    box.innerHTML = DesiMallCoupons.list().map(coupon => `
      <button
        type="button"
        class="coupon-chip"
        data-code="${this.esc(coupon.code)}"
      >
        <strong>${this.esc(coupon.code)}</strong>
        <span>${this.esc(coupon.label)}</span>
      </button>
    `).join('');

    box.querySelectorAll('.coupon-chip').forEach(button => {
      button.onclick = () => {
        const input = document.getElementById('couponCode');
        if (input) input.value = button.dataset.code || '';
        this.applyCoupon();
      };
    });
  },

  applyCoupon() {
    const input = document.getElementById('couponCode');
    const message = document.getElementById('couponMessage');
    const code = String(input?.value || '').trim().toUpperCase();

    if (!code) {
      this.coupon = null;
      if (message) {
        message.textContent = '';
        message.className = 'coupon-message';
      }
      this.renderTotals();
      return;
    }

    const base = CartManager.totals(this.cart);
    const result = DesiMallCoupons.apply(code, base);

    this.coupon = result.ok ? result : null;

    if (message) {
      message.textContent = result.ok
        ? `${result.code} applied: ${result.label}`
        : result.message;

      message.className = `coupon-message ${result.ok ? 'success' : 'error'}`;
    }

    this.renderTotals();
  },

  displayTotals() {
    const base = CartManager.totals(this.cart);

    const delivery = Number(this.deliveryFee || 0);

    if (!this.coupon?.ok) {
      return {
        ...base,
        delivery,
        couponDiscount: 0,
        total: base.subtotal + delivery
      };
    }

    return {
      ...base,
      delivery,
      couponDiscount: Number(this.coupon.couponDiscount || 0),
      total: Math.max(
        0,
        base.subtotal + delivery - Number(this.coupon.couponDiscount || 0)
      )
    };
  },

  renderTotals() {
    const totals = this.displayTotals();

    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };

    set('summaryTotalQty', totals.qty);
    set('summaryMRP', this.money(totals.mrp));
    set('summaryDiscount', `- ${this.money(totals.discount)}`);
    set('summaryDelivery', totals.delivery > 0 ? this.money(totals.delivery) : 'FREE');
    set(
      'summaryCouponDiscount',
      `- ${this.money(totals.couponDiscount)}`
    );
    set('summaryGrandTotal', this.money(totals.total));

    const placeButton = document.getElementById('btnPlaceOrder');
    if (placeButton && !this.busy) {
      placeButton.innerHTML = this.paymentMethod === 'razorpay'
        ? `<i class="fa-solid fa-shield-halved"></i> Pay ${this.money(totals.total)}`
        : `<i class="fa-solid fa-lock"></i> Place Order ${this.money(totals.total)}`;
    }

    document
      .getElementById('couponDiscountRow')
      ?.classList.toggle('hidden', !totals.couponDiscount);
  },

  async loadAddresses() {
    const box = document.getElementById('checkoutAddressList');

    if (box) {
      box.innerHTML = `
        <div class="co-loading">
          <i class="fa-solid fa-spinner fa-spin"></i>
          Loading your saved addresses...
        </div>
      `;
    }

    try {
      this.addresses = await DesiMallAPI.getAddresses();

      const defaultAddress =
        this.addresses.find(a => Boolean(a.IsDefault ?? a.is_default)) ||
        this.addresses[0] ||
        null;

      this.selectedAddressId = String(
        defaultAddress?.AddressID ||
        defaultAddress?.id ||
        ''
      );

      this.renderAddresses();
      if (this.fulfillmentMode === 'tez') {
        await this.refreshTezForSelectedAddress();
      }
    } catch (error) {
      console.error('Checkout address load:', error);

      if (box) {
        box.innerHTML = `
          <div class="co-empty">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>Could not load your addresses</strong>
            <span>${this.esc(error.message || 'Please try again.')}</span>
            <button type="button" onclick="CheckoutApp.loadAddresses()">
              Try Again
            </button>
          </div>
        `;
      }
    }
  },

  renderAddresses() {
    const box = document.getElementById('checkoutAddressList');
    if (!box) return;

    if (!this.addresses.length) {
      box.innerHTML = `
        <div class="co-empty">
          <i class="fa-solid fa-location-dot"></i>
          <strong>No saved delivery address</strong>
          <span>Add an address first, then come back to checkout.</span>
          <a href="address-book.html">Add Address</a>
        </div>
      `;

      this.selectedAddressId = '';
      return;
    }

    box.innerHTML = this.addresses.map(address => {
      const id = String(address.AddressID || address.id || '');
      const selected = id === this.selectedAddressId;
      const isDefault = Boolean(address.IsDefault ?? address.is_default);

      const city = address.City || address.city || '';
      const district = address.District || address.district || '';
      const state = address.State || address.state || '';
      const pincode = address.Pincode || address.pincode || '';
      const line1 =
        address.AddressLine1 ||
        address.Address ||
        address.line1 ||
        '';
      const line2 =
        address.AddressLine2 ||
        address.line2 ||
        '';

      return `
        <label class="co-address ${selected ? 'selected' : ''}">
          <input
            type="radio"
            name="deliveryAddress"
            value="${this.esc(id)}"
            ${selected ? 'checked' : ''}
          >
          <span class="co-address-radio"></span>
          <div class="co-address-copy">
            <div class="co-address-title">
              <strong>
                ${this.esc(address.FullName || address.recipient_name || 'Recipient')}
              </strong>
              ${isDefault ? '<span>DEFAULT</span>' : ''}
            </div>

            <p>
              ${this.esc(line1)}
              ${line2 ? `<br>${this.esc(line2)}` : ''}
              <br>
              ${this.esc(
                [city, district && district !== city ? district : '', state]
                  .filter(Boolean)
                  .join(', ')
              )}
              ${pincode ? ` - ${this.esc(pincode)}` : ''}
            </p>

            <small>
              <i class="fa-solid fa-phone"></i>
              +91 ${this.esc(address.Mobile || address.mobile || '')}
            </small>
            <div class="co-gps-state ${this.validAddressGps(address) ? 'ready' : 'missing'}">
              <i class="fa-solid ${this.validAddressGps(address) ? 'fa-location-dot' : 'fa-triangle-exclamation'}"></i>
              ${this.validAddressGps(address) ? 'Exact GPS saved' : 'Exact GPS required before order'}
            </div>
          </div>
        </label>
      `;
    }).join('');

    const selected = this.selectedAddress();
    const gpsReady = this.validAddressGps(selected);
    const gpsBox = document.getElementById('checkoutGpsRequirement');

    if (gpsBox) {
      gpsBox.innerHTML = gpsReady
        ? `<div class="co-gps-required good">
            <i class="fa-solid fa-circle-check"></i>
            <div><strong>Exact delivery GPS confirmed</strong><span>Order can be placed to this saved location.</span></div>
          </div>`
        : `<div class="co-gps-required">
            <i class="fa-solid fa-location-crosshairs"></i>
            <div><strong>Exact location required</strong><span>Order place karne se pahle selected address ka current GPS confirm karein.</span></div>
            <button id="btnConfirmCheckoutGps" type="button" onclick="CheckoutApp.confirmSelectedAddressLocation()">
              <i class="fa-solid fa-location-dot"></i> Confirm Current Location
            </button>
          </div>`;
    }

    box.querySelectorAll('input[name="deliveryAddress"]').forEach(input => {
      input.onchange = () => {
        this.selectedAddressId = input.value;

        box.querySelectorAll('.co-address').forEach(card => {
          const radio = card.querySelector(
            'input[name="deliveryAddress"]'
          );
          card.classList.toggle('selected', Boolean(radio?.checked));
        });

        this.renderAddresses();
        if (this.fulfillmentMode === 'tez') {
          this.refreshTezForSelectedAddress();
        }
      };
    });
  },

  selectedAddress() {
    return this.addresses.find(
      address =>
        String(address.AddressID || address.id || '') ===
        String(this.selectedAddressId || '')
    ) || null;
  },

  async refreshTezForSelectedAddress() {
    if (this.fulfillmentMode !== 'tez') return true;

    const address = this.selectedAddress();
    const pincode = String(
      address?.Pincode ||
      address?.pincode ||
      ''
    ).replace(/\D/g, '').slice(0, 6);

    if (!/^\d{6}$/.test(pincode)) {
      this.tezStatus = null;
      this.showAlert('Select an address with a valid pincode for Tez delivery.');
      return false;
    }

    try {
      const status = await DesiMallAPI.getTezStatus(pincode);
      this.tezStatus = status;

      if (!status?.available || !status?.zone) {
        this.showAlert(
          `Tez is not available for delivery pincode ${pincode}. Choose an eligible address or use standard shopping.`
        );
        return false;
      }

      this.tezPincode = pincode;
      this.deliveryFee = Math.max(
        0,
        Number(status.zone.delivery_fee || 0)
      );

      this.applyFulfillmentCopy(status.zone);
      this.renderTotals();
      this.showTezCheckoutBanner(status.zone);
      return true;
    } catch (error) {
      this.tezStatus = null;
      this.showAlert(error?.message || 'Could not verify Tez delivery for this address.');
      return false;
    }
  },

  applyFulfillmentCopy(zone = null) {
    const isTez = this.fulfillmentMode === 'tez';
    const isFood = this.fulfillmentMode === 'food';

    const cards = [...document.querySelectorAll('.ck-card')];
    const deliveryCard = cards.find(card =>
      card.querySelector('.delivery-option, .payment-box')
    );

    const addressCard = cards.find(card =>
      card.querySelector('input[name="deliveryAddress"], .co-address')
    );

    if (addressCard) {
      const addressHeading = addressCard.querySelector('.ck-card-head h2');
      const addressSubheading = addressCard.querySelector('.ck-card-head p');
      if (addressHeading) addressHeading.textContent = 'Select Delivery Address';
      if (addressSubheading) addressSubheading.textContent = 'Choose one of your saved addresses.';
    }

    if (!deliveryCard) return;

    const heading = deliveryCard.querySelector('.ck-card-head h2');
    const subheading = deliveryCard.querySelector('.ck-card-head p');
    const optionTitle = deliveryCard.querySelector(
      '.delivery-option strong, .payment-box strong'
    );
    const optionDesc = deliveryCard.querySelector(
      '.delivery-option small, .delivery-option p, .payment-box span'
    );
    const optionIcon = deliveryCard.querySelector(
      '.delivery-option i, .payment-box i'
    );

    if (isTez) {
      const minMinutes = Number(
        zone?.min_minutes ||
        this.tezStatus?.zone?.min_minutes ||
        20
      );
      const maxMinutes = Number(
        zone?.max_minutes ||
        this.tezStatus?.zone?.max_minutes ||
        45
      );
      const fee = Math.max(
        0,
        Number(
          zone?.delivery_fee ??
          this.tezStatus?.zone?.delivery_fee ??
          this.deliveryFee ??
          0
        )
      );

      if (heading) heading.textContent = 'Tez Delivery';

      if (subheading) {
        subheading.textContent =
          `Fast delivery for eligible nearby stock · Target ${minMinutes}–${maxMinutes} min.`;
      }

      if (optionTitle) {
        optionTitle.textContent = `Tez — ${minMinutes}–${maxMinutes} min`;
      }

      if (optionDesc) {
        optionDesc.textContent = fee > 0
          ? `${this.money(fee)} Tez delivery fee for this order.`
          : 'Free Tez delivery for this order.';
      }

      if (optionIcon) {
        optionIcon.classList.remove('fa-truck', 'fa-truck-fast');
        optionIcon.classList.add('fa-bolt');
      }
    } else if (isFood) {
      const firstFood = this.cart.find(item =>
        item.IsFood ||
        String(item.FulfilmentMode || item.FulfillmentMode || '').toLowerCase() === 'food'
      );
      const restaurant = firstFood?.SellerName || firstFood?.ShopName || 'Restaurant';
      const fee = Math.max(0, Number(firstFood?.FoodDeliveryFee || this.deliveryFee || 0));

      if (heading) heading.textContent = 'Food Delivery';
      if (subheading) {
        subheading.textContent = `Freshly prepared by ${restaurant} and delivered by DesiMall.`;
      }
      if (optionTitle) optionTitle.textContent = 'Restaurant Delivery';
      if (optionDesc) {
        optionDesc.textContent = fee > 0
          ? `${this.money(fee)} restaurant delivery fee for this order.`
          : 'Free restaurant delivery for this order.';
      }
      if (optionIcon) {
        optionIcon.classList.remove('fa-bolt','fa-truck','fa-truck-fast');
        optionIcon.classList.add('fa-utensils');
      }
    } else {
      if (heading) heading.textContent = 'Delivery Method';

      if (subheading) {
        subheading.textContent =
          'Standard marketplace delivery for this order.';
      }

      if (optionTitle) optionTitle.textContent = 'Standard Delivery';

      if (optionDesc) {
        optionDesc.textContent =
          'Delivery charge is calculated once for the whole order.';
      }

      if (optionIcon) {
        optionIcon.classList.remove('fa-bolt','fa-utensils');
        optionIcon.classList.add('fa-truck');
      }
    }
  },

  showTezCheckoutBanner(zone) {
    let box = document.getElementById('tezCheckoutBanner');

    if (!box) {
      box = document.createElement('div');
      box.id = 'tezCheckoutBanner';
      box.className = 'tez-checkout-banner';
      const alertBox = document.getElementById('checkoutAlert');
      alertBox?.parentElement?.insertBefore(box, alertBox?.nextSibling || null);
    }

    if (!box) return;

    box.innerHTML = `
      <i class="fa-solid fa-bolt"></i>
      <div>
        <strong>Tez order</strong>
        <span>
          Delivery target ${Number(zone.min_minutes || 20)}–${Number(zone.max_minutes || 45)} min ·
          ${Number(zone.delivery_fee || 0) > 0 ? this.money(zone.delivery_fee) : 'Free Tez delivery'}
        </span>
      </div>
    `;
  },

  createClientRequestId() {
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }

    return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  },

  setBusy(busy) {
    this.busy = busy;

    const button = document.getElementById('btnPlaceOrder');
    if (!button) return;

    button.disabled = busy;
    button.innerHTML = busy
      ? '<i class="fa-solid fa-spinner fa-spin"></i> PLACING ORDER...'
      : '<i class="fa-solid fa-lock"></i> PLACE ORDER';
  },

  showAlert(message, type = 'error') {
    const alertBox = document.getElementById('checkoutAlert');
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.className = `checkout-alert ${type}`;
    alertBox.classList.remove('hidden');
    alertBox.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  },

  clearAlert() {
    const alertBox = document.getElementById('checkoutAlert');
    if (!alertBox) return;
    alertBox.textContent = '';
    alertBox.className = 'checkout-alert hidden';
  },

  validAddressGps(address) {
    const lat = Number(address?.Latitude ?? address?.latitude);
    const lon = Number(address?.Longitude ?? address?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 &&
      !(Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001);
  },

  async confirmSelectedAddressLocation() {
    const address = this.selectedAddress();

    if (!address) {
      this.showAlert('Please select a delivery address first.');
      return false;
    }

    if (!navigator.geolocation) {
      this.showAlert('This browser cannot access GPS location.');
      return false;
    }

    const button = document.getElementById('btnConfirmCheckoutGps');
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirming location…';
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000
        });
      });

      const lat = Number(position.coords.latitude);
      const lon = Number(position.coords.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
          (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001)) {
        throw new Error('Invalid GPS received.');
      }

      const payload = {
        ...address,
        AddressID: address.AddressID || address.id,
        Label: address.Label || address.label || 'Home',
        FullName: address.FullName || address.recipient_name || '',
        Mobile: address.Mobile || address.mobile || '',
        Pincode: address.Pincode || address.pincode || '',
        City: address.City || address.city || '',
        District: address.District || address.district || address.City || address.city || '',
        State: address.State || address.state || '',
        AddressLine1: address.AddressLine1 || address.Address || address.line1 || '',
        AddressLine2: address.AddressLine2 || address.line2 || '',
        Latitude: lat,
        Longitude: lon,
        IsDefault: Boolean(address.IsDefault ?? address.is_default)
      };

      await DesiMallAPI.saveAddress(payload);

      address.Latitude = lat;
      address.Longitude = lon;
      address.latitude = lat;
      address.longitude = lon;

      try {
        localStorage.setItem('desimall_customer_live_location', JSON.stringify({
          latitude: lat,
          longitude: lon,
          accuracy: Number(position.coords.accuracy || 0),
          capturedAt: Date.now()
        }));
      } catch (_) {}

      this.renderAddresses();
      this.showAlert('Exact delivery location confirmed. You can place the order now.', 'success');
      return true;
    } catch (error) {
      this.showAlert(
        error?.code === 1
          ? 'Location permission denied. Allow Precise Location to place the order.'
          : (error?.message || 'Could not confirm delivery location.')
      );
      return false;
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Confirm Current Location';
      }
    }
  },

  async placeOrder() {
    if (this.busy) return;

    this.clearAlert();

    const user = this.getUser();

    if (!user?.UserID || !DesiMallAuth?.getAccessToken?.()) {
      this.showAlert('Please login again before placing your order.');
      return;
    }

    if (!this.selectedAddressId) {
      this.showAlert('Please select a saved delivery address.');
      return;
    }

    const selectedAddress = this.selectedAddress();
    if (!this.validAddressGps(selectedAddress)) {
      this.showAlert('Order place karne se pahle exact delivery location confirm karna compulsory hai.');
      await this.confirmSelectedAddressLocation();
      return;
    }

    if (!this.cart.length) {
      this.showAlert('Your cart is empty.');
      return;
    }

    if (this.mixedFulfillment) {
      this.showAlert(
        'Marketplace, Tez and Food items must be placed separately. Please keep only one delivery service in this checkout.'
      );
      return;
    }

    if (this.fulfillmentMode === 'tez') {
      const tezReady = await this.refreshTezForSelectedAddress();
      if (!tezReady) return;
    }

    const clientRequestId = this.createClientRequestId();

    // Keep the same key during this button action.
    // Backend unique index/RPC makes retries idempotent.
    this.setBusy(true);

    try {
      const result = await DesiMallAPI.placeOrder({
        delivery_address_id: this.selectedAddressId,
        payment_method: this.paymentMethod,
        coupon_code: this.coupon?.code || '',
        client_request_id: clientRequestId,
        fulfillment_mode: this.fulfillmentMode,
        items: this.cart.map(item => ({
          product_id: item.ProductID,
          qty: item.Qty
        }))
      });

      if (!result?.success || !result?.order) {
        throw new Error(result?.message || 'Order could not be placed.');
      }

      const order = result.order;

      if (this.paymentMethod === 'razorpay') {
        const paymentResult = await this.payWithRazorpay(order, user);

        if (paymentResult?.state === 'paid' || paymentResult?.success) {
          this.clearAlert();
          order.PaymentStatus = 'paid';
          order.payment_status = 'paid';
        } else if (paymentResult?.state === 'cancelled') {
          throw new Error(
            paymentResult?.message ||
            'Payment was not captured. The unpaid order has been cancelled.'
          );
        } else if (paymentResult?.state === 'pending') {
          this.showAlert(
            paymentResult?.message ||
            'Payment verification is pending. Please do not pay again for this order.',
            'warning'
          );
          return;
        } else {
          throw new Error(
            paymentResult?.message ||
            'Online payment was not completed.'
          );
        }
      }

      const selectedAddress = this.addresses.find(
        a => String(a.AddressID || a.id) === String(this.selectedAddressId)
      );

      const localOrder = {
        OrderID: order.OrderCode || order.order_code || order.OrderID,
        InternalOrderID: order.OrderID || order.id,
        UserID: user.UserID,
        OrderDate: order.CreatedAt || order.created_at || new Date().toISOString(),
        CreatedAt: order.CreatedAt || order.created_at || new Date().toISOString(),
        Items: Array.isArray(order.Items) ? order.Items : [],
        TotalAmount: Number(order.TotalAmount || order.total_amount || 0),
        PaymentMethod: order.PaymentMethod || order.payment_method || 'cod',
        PaymentStatus: order.PaymentStatus || order.payment_status || 'pending',
        Status: this.customerStatus(order.Status || order.status),
        DeliveryStatus: this.customerStatus(order.Status || order.status),
        DeliveryAddress: selectedAddress || null,
        CouponCode: this.coupon?.code || '',
        FulfillmentMode: order.FulfillmentMode || order.fulfillment_mode || this.fulfillmentMode,
        IsTez: Boolean(order.IsTez || this.fulfillmentMode === 'tez'),
        DeliveryTargetMinMinutes: Number(order.DeliveryTargetMinMinutes || 0),
        DeliveryTargetMaxMinutes: Number(order.DeliveryTargetMaxMinutes || 0),
        PromisedBy: order.PromisedBy || null
      };

      localStorage.setItem(
        'desimall_last_order',
        JSON.stringify(localOrder)
      );

      const existing = this.safeJson('desimall_orders', [])
        .filter(
          old =>
            String(old.InternalOrderID || old.OrderID) !==
            String(localOrder.InternalOrderID || localOrder.OrderID)
        );

      existing.unshift(localOrder);

      localStorage.setItem(
        'desimall_orders',
        JSON.stringify(existing)
      );

      CartManager.saveCart([]);

      if (window.DesiMallAnalytics) {
        DesiMallAnalytics.track('purchase', {
          orderId: localOrder.OrderID,
          value: localOrder.TotalAmount,
          payment: localOrder.PaymentMethod
        });
      }

      location.href = 'order-success.html';
    } catch (error) {
      console.error('Place order:', error);

      if (
        error?.status === 401 ||
        error?.code === 'AUTH_REQUIRED' ||
        error?.code === 'INVALID_SESSION'
      ) {
        this.showAlert(
          'Your login session expired. Please login again.'
        );
      } else {
        this.showAlert(
          error?.message ||
          'Order could not be placed. Your cart has not been cleared.'
        );
      }
    } finally {
      this.setBusy(false);
    }
  },


  async payWithRazorpay(order, user) {
    if (typeof Razorpay === 'undefined') {
      return {
        success:false,
        state:'pending',
        message:'Razorpay Checkout could not load. Payment has not been confirmed.'
      };
    }

    const internalId = order.OrderID || order.id;
    const rz = await DesiMallAPI.createRazorpayOrder(internalId);

    if (!rz?.success || !rz?.razorpayOrderId || !rz?.keyId) {
      return {
        success:false,
        state:'pending',
        message:rz?.message || 'Could not start online payment.'
      };
    }

    const reconcile = async (paymentId = '', immediateFinal = false) => {
      const delays = immediateFinal ? [0, 1800, 3500] : [700, 2200, 4500];

      for (let i = 0; i < delays.length; i += 1) {
        if (delays[i]) {
          await new Promise(resolve => setTimeout(resolve, delays[i]));
        }

        const finalCheck = i === delays.length - 1;

        try {
          const result = await DesiMallAPI.reconcileRazorpayPayment({
            order_id: internalId,
            razorpay_order_id: rz.razorpayOrderId,
            razorpay_payment_id: paymentId || '',
            finalize: finalCheck
          });

          if (result?.state === 'paid') {
            this.clearAlert();
            return {
              success:true,
              state:'paid',
              verified:true,
              reconciliation:result
            };
          }

          if (result?.state === 'cancelled') {
            return {
              success:false,
              state:'cancelled',
              message:
                result?.message ||
                'Payment was not captured. The unpaid order has been cancelled.',
              reconciliation:result
            };
          }

          if (!finalCheck) {
            this.showAlert(
              'Payment status pending. DesiMall is verifying with Razorpay…',
              'warning'
            );
          } else {
            return {
              success:false,
              state:'pending',
              message:
                result?.message ||
                'Payment verification is still pending. Please do not retry payment.',
              reconciliation:result
            };
          }
        } catch (error) {
          if (finalCheck) {
            return {
              success:false,
              state:'pending',
              message:
                error?.message ||
                'Payment verification could not be completed. Please do not retry yet.'
            };
          }
        }
      }

      return {
        success:false,
        state:'pending',
        message:'Payment verification is pending.'
      };
    };

    return await new Promise(resolve => {
      let completed = false;

      const finish = value => {
        if (completed) return;
        completed = true;
        resolve(value);
      };

      const options = {
        key: rz.keyId,
        amount: rz.amount,
        currency: rz.currency || 'INR',
        name: 'DesiMall',
        description: `Order ${rz.orderCode || ''}`,
        order_id: rz.razorpayOrderId,
        prefill: {
          name: user.FullName || user.Name || '',
          email: user.Email || '',
          contact: user.Mobile || user.Phone || ''
        },
        theme: { color: '#ff6500' },

        handler: async response => {
          try {
            const verified = await DesiMallAPI.verifyRazorpayPayment({
              order_id: internalId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            if (verified?.success && verified?.verified) {
              this.clearAlert();
              finish({
                success:true,
                state:'paid',
                verified
              });
              return;
            }

            finish(
              await reconcile(response.razorpay_payment_id || '', false)
            );
          } catch (_) {
            finish(
              await reconcile(response.razorpay_payment_id || '', false)
            );
          }
        },

        modal: {
          ondismiss: async () => {
            this.showAlert(
              'Payment status pending. DesiMall is checking whether any money was captured…',
              'warning'
            );
            finish(await reconcile('', true));
          }
        }
      };

      const instance = new Razorpay(options);

      instance.on('payment.failed', async response => {
        const paymentId =
          response?.error?.metadata?.payment_id ||
          response?.error?.metadata?.paymentId ||
          '';

        this.showAlert(
          'Payment failed in Checkout. Verifying with Razorpay before cancelling the order…',
          'warning'
        );

        finish(await reconcile(paymentId, true));
      });

      this.clearAlert();
      instance.open();
    });
  },

  customerStatus(status) {
    const raw = String(status || '').toLowerCase();

    const map = {
      new: 'Placed',
      accepted: 'Accepted',
      preparing: 'Preparing',
      ready_for_pickup: 'Ready for Pickup',
      pickup_assigned: 'Pickup Assigned',
      picked_up: 'Picked Up',
      out_for_delivery: 'On the Way',
      reached_customer: 'Reached Customer',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      rejected: 'Cancelled'
    };

    return map[raw] || status || 'Placed';
  },

  safeJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || '') || fallback;
    } catch (_) {
      return fallback;
    }
  }
};
