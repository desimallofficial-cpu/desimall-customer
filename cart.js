/** DesiMall universal commerce storage service */
const CartManager = {
  key: 'desimall_cart',
  read(key, fallback = []) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } },
  getCart() { return this.read(this.key, []); },
  normalize(item) {
    return {
      ...item,
      ProductID: String(item.ProductID || item.ID || ''),
      ProductName: item.ProductName || item.Name || 'Product',
      Price: Number(item.Price || item.MRP || item.FinalPrice || 0),
      FinalPrice: Number(item.FinalPrice || item.SalePrice || item.Price || 0),
      Qty: Math.max(1, Number(item.Qty || item.Quantity || 1)),
      SelectedSize: item.SelectedSize || item.Size || '',
      SelectedColor: item.SelectedColor || item.Color || '',
      FulfilmentMode: String(
        item.FulfilmentMode ||
        item.FulfillmentMode ||
        (item.IsTez || item.TezEligible ? 'tez' : 'marketplace')
      ).toLowerCase(),
      IsTez: Boolean(
        item.IsTez ||
        item.TezEligible ||
        String(item.FulfilmentMode || item.FulfillmentMode || '').toLowerCase() === 'tez'
      )
    };
  },
  lineKey(item) {
    const mode = String(
      item.FulfilmentMode ||
      item.FulfillmentMode ||
      (item.IsTez ? 'tez' : 'marketplace')
    ).toLowerCase();
    return [
      item.ProductID,
      item.SelectedSize || '',
      item.SelectedColor || '',
      mode
    ].join('::');
  },
  saveCart(cart) {
    localStorage.setItem(this.key, JSON.stringify(cart.map(i => this.normalize(i))));
    this.updateCartBadge();
    window.dispatchEvent(new CustomEvent('desimall:cart-updated', { detail: cart }));
  },
  addToCart(product, qty = 1, options = {}) {
    const cart = this.getCart().map(i => this.normalize(i));
    const incoming = this.normalize({ ...product, ...options, Qty: qty });
    const existing = cart.find(item => this.lineKey(item) === this.lineKey(incoming));
    if (existing) existing.Qty = Math.min(10, existing.Qty + incoming.Qty);
    else cart.push(incoming);
    this.saveCart(cart);
    return cart;
  },
  updateQty(lineKey, qty) {
    const cart = this.getCart().map(i => this.normalize(i));
    const item = cart.find(i => this.lineKey(i) === lineKey);
    if (!item) return cart;
    item.Qty = Math.max(1, Math.min(10, Number(qty) || 1));
    this.saveCart(cart);
    return cart;
  },
  remove(lineKey) {
    const cart = this.getCart().map(i => this.normalize(i)).filter(i => this.lineKey(i) !== lineKey);
    this.saveCart(cart);
    return cart;
  },
  totals(cart = this.getCart()) {
    return cart.reduce((t, raw) => {
      const i = this.normalize(raw), mrp = i.Price || i.FinalPrice, sale = i.FinalPrice || i.Price;
      t.qty += i.Qty; t.mrp += mrp * i.Qty; t.subtotal += sale * i.Qty;
      return t;
    }, { qty: 0, mrp: 0, subtotal: 0, discount: 0, delivery: 0, total: 0 });
  },
  updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const total = this.getCart().reduce((sum, item) => sum + Number(item.Qty || 1), 0);
    badge.textContent = total; badge.setAttribute('aria-label', `${total} items in cart`);
  }
};
CartManager.totals = function(cart = this.getCart()) {
  const t = cart.reduce((a, raw) => {
    const i = this.normalize(raw);
    const q = i.Qty;
    const mrp = i.Price || i.FinalPrice;
    const sale = i.FinalPrice || i.Price;
    a.qty += q;
    a.mrp += mrp * q;
    a.subtotal += sale * q;
    return a;
  }, { qty: 0, mrp: 0, subtotal: 0 });

  t.discount = Math.max(0, t.mrp - t.subtotal);

  // v0.19.0: product price excludes delivery.
  // Exact delivery is loaded once at checkout from marketplace settings.
  t.delivery = 0;
  t.total = t.subtotal;

  return t;
};
