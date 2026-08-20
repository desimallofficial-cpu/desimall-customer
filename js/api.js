/** DesiMall API client — Render + Supabase backend */

const API_CONFIG = Object.freeze({
  BASE_URL: 'https://desimall-backend.onrender.com',
  TIMEOUT_MS: 20000,
  UPLOAD_TIMEOUT_MS: 90000
});

const DesiMallAPI = {
  version:'0.29.3',
  _inflight: new Map(),
  _memoryCache: new Map(),

  _cacheKey(action, data) {
    return `${action}:${JSON.stringify(data || {})}`;
  },

  _readLocal(key, maxAgeMs) {
    try {
      const x = JSON.parse(
        localStorage.getItem(`dm_api_${key}`) || 'null'
      );

      return x && Date.now() - x.time <= maxAgeMs
        ? x.value
        : null;
    } catch (_) {
      return null;
    }
  },

  _writeLocal(key, value) {
    try {
      localStorage.setItem(
        `dm_api_${key}`,
        JSON.stringify({
          time: Date.now(),
          value
        })
      );
    } catch (_) {}
  },

  async request(
    action,
    {
      method = 'GET',
      data = {},
      timeoutMs = API_CONFIG.TIMEOUT_MS,
      retries = 1,
      cacheMs = 0,
      staleMs = 0
    } = {}
  ) {
    const key = this._cacheKey(action, data);

    if (method === 'GET' && cacheMs > 0) {
      const mem = this._memoryCache.get(key);

      if (mem && Date.now() - mem.time <= cacheMs) {
        return {
          ...mem.value,
          fromCache: true
        };
      }

      const local = this._readLocal(key, cacheMs);

      if (local) {
        return {
          ...local,
          fromCache: true
        };
      }
    }

    if (method === 'GET' && this._inflight.has(key)) {
      return this._inflight.get(key);
    }

    const task = (async () => {
      let lastError = 'Request failed';

      for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();

        const timeout = setTimeout(
          () => controller.abort(),
          timeoutMs + attempt * 7000
        );

        try {
          let url = API_CONFIG.BASE_URL;

          const options = {
            method,
            redirect: 'follow',
            signal: controller.signal,
            cache: 'no-store'
          };

          if (method === 'GET') {
            url += `?${new URLSearchParams({
              action,
              ...data,
              _t: Date.now()
            }).toString()}`;
          } else {
            options.headers = {
              'Content-Type': 'text/plain;charset=utf-8'
            };

            options.body = JSON.stringify({
              action,
              ...data
            });
          }

          const response = await fetch(url, options);

          if (!response.ok) {
            throw new Error(
              `Request failed (${response.status})`
            );
          }

          const result = await response.json();

          const value =
            result && typeof result === 'object'
              ? result
              : {
                  success: false,
                  message: 'Invalid server response'
                };

          if (
            method === 'GET' &&
            value.success &&
            cacheMs > 0
          ) {
            this._memoryCache.set(key, {
              time: Date.now(),
              value
            });

            this._writeLocal(key, value);
          }

          return value;
        } catch (error) {
          lastError =
            error.name === 'AbortError'
              ? 'Request timed out'
              : error.message;

          if (attempt < retries) {
            await new Promise(resolve =>
              setTimeout(resolve, 700 * (attempt + 1))
            );
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      if (method === 'GET' && staleMs > 0) {
        const stale = this._readLocal(key, staleMs);

        if (stale) {
          return {
            ...stale,
            success: true,
            stale: true,
            message:
              'Saved data shown while server reconnects.'
          };
        }
      }

      console.error(
        `DesiMall API ${action}:`,
        lastError
      );

      return {
        success: false,
        message: lastError,
        offline: true
      };
    })();

    if (method === 'GET') {
      this._inflight.set(key, task);
    }

    try {
      return await task;
    } finally {
      if (method === 'GET') {
        this._inflight.delete(key);
      }
    }
  },

  get(action, params = {}) {
    return this.request(action, {
      method: 'GET',
      data: params
    });
  },

  post(action, payload = {}) {
    return this.request(action, {
      method: 'POST',
      data: payload
    });
  },

  // =========================================================
  // PRODUCTS — NEW SUPABASE / RENDER API
  // =========================================================

  async getProducts(params = {}) {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/products`,
      {
        method: 'GET',
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        `Products request failed (${response.status})`
      );
    }

    const result = await response.json();

    const products = Array.isArray(result?.products)
      ? result.products
      : [];

    return products.map(p => ({
      ...p,

      // Old frontend-compatible fields
      ProductID: p.id,
      ID: p.id,
      ProductName: p.name || p.ProductName || 'Product',
      Brand: p.brand || p.Brand || '',
      Category: p.category_name || p.Category || '',
      CategoryID: p.category_id || p.CategoryID || '',
      MRP: Number(p.mrp || p.MRP || p.selling_price || 0),
      SellingPrice: Number(p.selling_price || p.FinalPrice || p.Price || 0),
      FinalPrice: Number(p.selling_price || p.FinalPrice || p.Price || 0),
      Price: Number(p.selling_price || p.FinalPrice || p.Price || 0),

      ImageURL: Array.isArray(p.image_urls)
        ? p.image_urls[0] || ''
        : '',

      ImageURLs: Array.isArray(p.image_urls)
        ? p.image_urls
        : [],

      Status: p.status || '',

      Stock: Number(
        p.inventory?.stock_qty || 0
      ),

      ReservedStock: Number(
        p.inventory?.reserved_qty || 0
      ),

      SoldQty: Number(
        p.inventory?.sold_qty || 0
      )
    }));
  },

  // =========================================================
  // CATEGORIES — NEW SUPABASE / RENDER API
  // =========================================================

  async getCategories() {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/categories`,
      {
        method: 'GET',
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        `Categories request failed (${response.status})`
      );
    }

    const result = await response.json();

    const categories = Array.isArray(
      result?.categories
    )
      ? result.categories
      : [];

    return categories.map(c => ({
      ...c,

      // Old frontend-compatible fields
      CategoryID: c.id,
      ID: c.id,

      CategoryName: c.name || c.CategoryName || c.category_name || '',
      Name: c.name || c.CategoryName || c.category_name || '',
      ImageURL: c.image_url || c.ImageURL || c.image || '',

      Slug: c.slug || '',

      ParentID: c.parent_id || '',

      IsActive: Boolean(c.is_active),

      Status: c.is_active
        ? 'active'
        : 'inactive',

      CreatedAt: c.created_at || ''
    }));
  },

  // =========================================================
  // BANNERS — NEW SUPABASE / RENDER API
  // =========================================================

  async getBanners() {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/banners`,
      {
        method: 'GET',
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        `Banners request failed (${response.status})`
      );
    }

    const result = await response.json();

    const banners = Array.isArray(result?.banners)
      ? result.banners
      : [];

    return banners.map(b => ({
      ...b,

      // Old frontend-compatible fields
      BannerID: b.id,
      ID: b.id,

      BannerTitle: b.title || b.BannerTitle || b.Title || '',
      Title: b.title || b.BannerTitle || b.Title || '',

      BannerSubtitle: b.subtitle || b.BannerSubtitle || b.Subtitle || '',
      Subtitle: b.subtitle || b.BannerSubtitle || b.Subtitle || '',

      ImageURL: b.image_url || b.ImageURL || b.image || '',
      MobileImageURL: b.mobile_image_url || b.MobileImageURL || '',

      LinkURL: b.link_url || '',

      ButtonText: b.button_text || '',

      SortOrder: Number(b.sort_order || 0),

      IsActive: Boolean(b.is_active),

      Status: b.is_active
        ? 'active'
        : 'inactive',

      StartsAt: b.starts_at || '',
      EndsAt: b.ends_at || '',

      CreatedAt: b.created_at || '',
      UpdatedAt: b.updated_at || ''
    }));
  },

  // =========================================================
  // DESIMALL TEZ — REAL FAST DELIVERY API v0.24.0
  // =========================================================

  async getTezStatus(pincode) {
    const value = encodeURIComponent(String(pincode || '').trim());
    return this._rest(`/api/tez/status?pincode=${value}`, {
      method: 'GET'
    });
  },

  async getTezProducts(pincode) {
    const value = encodeURIComponent(String(pincode || '').trim());
    const result = await this._rest(`/api/tez/products?pincode=${value}`, {
      method: 'GET'
    });

    const products = Array.isArray(result?.products)
      ? result.products
      : [];

    return {
      ...result,
      products: products.map(p => ({
        ...p,
        ProductID: p.id,
        ID: p.id,
        ProductName: p.name || 'Product',
        SKU: p.sku || '',
        MRP: Number(p.mrp || p.selling_price || 0),
        Price: Number(p.mrp || p.selling_price || 0),
        FinalPrice: Number(p.selling_price || 0),
        SellingPrice: Number(p.selling_price || 0),
        ImageURL: Array.isArray(p.image_urls) ? (p.image_urls[0] || '') : '',
        ImageURLs: Array.isArray(p.image_urls) ? p.image_urls : [],
        SellerID: p.seller_id || '',
        SellerName: p.seller_name || 'DesiMall Seller',
        ShopName: p.seller_name || 'DesiMall Seller',
        Stock: Number(p.inventory?.available_qty || 0),
        IsTez: true,
        TezEligible: true,
        TezMinMinutes: Number(p.tez?.min_minutes || 0),
        TezMaxMinutes: Number(p.tez?.max_minutes || 0),
        TezDeliveryFee: Number(p.tez?.delivery_fee || 0),
        TezMaxQty: Number(p.tez?.max_qty_per_order || 5)
      }))
    };
  },

  // =========================================================
  // CUSTOMER / AUTH
  // =========================================================

  async refreshCustomerSession(refreshToken) {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/auth/refresh`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        }),
        cache: 'no-store'
      }
    );

    let result = null;
    try { result = await response.json(); } catch (_) {}

    if (!response.ok) {
      const error = new Error(
        result?.message ||
        `Session refresh failed (${response.status})`
      );
      error.status = response.status;
      error.code = result?.code || 'REFRESH_FAILED';
      throw error;
    }

    return result || { success: false };
  },

  _customerRefreshPromise: null,

  async ensureCustomerSession(force = false) {
    if (typeof DesiMallAuth === 'undefined') return '';

    const currentToken = DesiMallAuth.getAccessToken?.() || '';
    const refreshToken = DesiMallAuth.getRefreshToken?.() || '';

    if (!refreshToken) return currentToken;

    const expiring =
      typeof DesiMallAuth.isSessionExpiring === 'function'
        ? DesiMallAuth.isSessionExpiring(5 * 60 * 1000)
        : false;

    if (!force && currentToken && !expiring) {
      return currentToken;
    }

    if (this._customerRefreshPromise) {
      return this._customerRefreshPromise;
    }

    this._customerRefreshPromise = (async () => {
      const result = await this.refreshCustomerSession(refreshToken);

      if (!result?.success || !result?.session) {
        const error = new Error(
          result?.message || 'Customer session refresh failed.'
        );
        error.code = 'REFRESH_FAILED';
        throw error;
      }

      DesiMallAuth.updateSession?.(result.session);

      if (result.user) {
        // Preserve the refreshed auth session while updating profile fields.
        DesiMallAuth.setUser?.(
          result.user,
          result.user.Email || result.user.email || '',
          result.session
        );
      }

      return DesiMallAuth.getAccessToken?.() || '';
    })();

    try {
      return await this._customerRefreshPromise;
    } finally {
      this._customerRefreshPromise = null;
    }
  },

  async _rest(
    path,
    {
      method = 'GET',
      data = null,
      token = '',
      _retryAfterRefresh = true
    } = {}
  ) {
    let requestToken = token;

    const isCustomerToken =
      Boolean(requestToken) &&
      typeof DesiMallAuth !== 'undefined' &&
      requestToken === (DesiMallAuth.getAccessToken?.() || '');

    // Proactively rotate a customer token shortly before it expires.
    if (isCustomerToken) {
      try {
        requestToken =
          await this.ensureCustomerSession(false) ||
          requestToken;
      } catch (_) {
        // Network problems should not erase the login.
        // Continue with current token; a 401 below gets one forced refresh.
      }
    }

    const headers = { 'Accept': 'application/json' };

    if (data !== null) {
      headers['Content-Type'] = 'application/json';
    }

    if (requestToken) {
      headers.Authorization = `Bearer ${requestToken}`;
    }

    const response = await fetch(
      `${API_CONFIG.BASE_URL}${path}`,
      {
        method,
        headers,
        body:
          data !== null
            ? JSON.stringify(data)
            : undefined,
        cache: 'no-store'
      }
    );

    let result = null;
    try { result = await response.json(); } catch (_) {}

    // If the customer access token expired between requests, rotate it
    // silently and retry the ORIGINAL request exactly once.
    if (
      response.status === 401 &&
      _retryAfterRefresh &&
      isCustomerToken &&
      typeof DesiMallAuth !== 'undefined' &&
      DesiMallAuth.getRefreshToken?.()
    ) {
      try {
        const refreshedToken =
          await this.ensureCustomerSession(true);

        if (refreshedToken) {
          return this._rest(path, {
            method,
            data,
            token: refreshedToken,
            _retryAfterRefresh: false
          });
        }
      } catch (refreshError) {
        // Only a genuinely unusable refresh token should require login.
        // Keep the API error clear for the calling page.
        if (
          refreshError?.status === 401 ||
          refreshError?.code === 'REFRESH_FAILED'
        ) {
          const error = new Error(
            'Your DesiMall login has ended. Please login again.'
          );
          error.status = 401;
          error.code = 'SESSION_ENDED';
          throw error;
        }

        throw refreshError;
      }
    }

    if (!response.ok) {
      const error = new Error(
        result?.message ||
        `Request failed (${response.status})`
      );

      error.status = response.status;
      error.code = result?.code || 'REQUEST_FAILED';

      throw error;
    }

    return result || { success: true };
  },

  registerUser(data) {
    return this._rest('/api/auth/register', { method: 'POST', data });
  },

  loginUser(data) {
    return this._rest('/api/auth/login', { method: 'POST', data });
  },

  login(email, password) {
    return this.loginUser({ Email: email, Password: password });
  },

  getUserByMobile(mobile) {
    const value = encodeURIComponent(String(mobile || ''));
    return this._rest(`/api/auth/customer-by-mobile?mobile=${value}`);
  },

  updateProfile(data) {
    return this.post('updateProfile', data);
  },

  // =========================================================
  // CUSTOMER CHECKOUT / ORDERS — SUPABASE / RENDER API v0.6.0
  // =========================================================

  placeOrder(data) {
    const token = this._customerAccessToken();
    if (!token) {
      const error = new Error('Please login again before placing your order.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      return Promise.reject(error);
    }

    return this._rest('/api/v1/orders', {
      method: 'POST',
      data,
      token
    });
  },

  // Backward-compatible alias for older checkout code.
  saveOrder(data) {
    return this.placeOrder(data);
  },

  async getMyOrders() {
    const token = this._customerAccessToken();
    if (!token) {
      const error = new Error('Please login again to view your orders.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      throw error;
    }

    const result = await this._rest('/api/v1/orders?limit=50', {
      method: 'GET',
      token
    });

    return Array.isArray(result?.orders)
      ? result.orders
      : [];
  },

  async getMyReturns() {
    const token = this._customerAccessToken();

    if (!token) {
      const error = new Error('Please login again to view your returns.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      throw error;
    }

    const result = await this._rest('/api/v1/returns', {
      method: 'GET',
      token
    });

    return Array.isArray(result?.returns)
      ? result.returns
      : [];
  },

  async createReturnRequest(data = {}) {
    const token = this._customerAccessToken();

    if (!token) {
      const error = new Error('Please login again before requesting a return.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      throw error;
    }

    return this._rest('/api/v1/returns', {
      method: 'POST',
      data,
      token
    });
  },

  async getOrder(orderId) {
    const token = this._customerAccessToken();
    if (!token) {
      const error = new Error('Please login again to view this order.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      throw error;
    }

    return this._rest(
      `/api/v1/orders/${encodeURIComponent(String(orderId || ''))}`,
      {
        method: 'GET',
        token
      }
    );
  },

  // Customer cancellation is intentionally not enabled in this migration stage.
  cancelOrder() {
    return Promise.resolve({
      success: false,
      code: 'NOT_AVAILABLE',
      message: 'Customer cancellation is not enabled yet.'
    });
  },

  // =========================================================
  // CUSTOMER ADDRESS BOOK — SUPABASE / RENDER API v0.5.0
  // =========================================================

  _customerAccessToken() {
    return typeof DesiMallAuth !== 'undefined'
      ? DesiMallAuth.getAccessToken()
      : '';
  },

  async getAddresses() {
    const token = this._customerAccessToken();
    if (!token) {
      const error = new Error('Please login again to access your saved addresses.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      throw error;
    }

    const result = await this._rest('/api/addresses', {
      method: 'GET',
      token
    });

    return Array.isArray(result?.addresses)
      ? result.addresses
      : [];
  },

  saveAddress(data) {
    const token = this._customerAccessToken();
    if (!token) {
      const error = new Error('Please login again before saving an address.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      return Promise.reject(error);
    }

    const addressId = String(
      data?.AddressID || data?.id || ''
    ).trim();

    return this._rest(
      addressId
        ? `/api/addresses/${encodeURIComponent(addressId)}`
        : '/api/addresses',
      {
        method: addressId ? 'PATCH' : 'POST',
        data,
        token
      }
    );
  },

  setDefaultAddress(addressId) {
    const token = this._customerAccessToken();
    if (!token) {
      const error = new Error('Please login again before changing the default address.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      return Promise.reject(error);
    }

    return this._rest(
      `/api/addresses/${encodeURIComponent(String(addressId || ''))}/default`,
      {
        method: 'POST',
        data: {},
        token
      }
    );
  },

  deleteAddress(addressId) {
    const token = this._customerAccessToken();
    if (!token) {
      const error = new Error('Please login again before deleting an address.');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      return Promise.reject(error);
    }

    return this._rest(
      `/api/addresses/${encodeURIComponent(String(addressId || ''))}`,
      {
        method: 'DELETE',
        token
      }
    );
  },

  syncCart(userId, items) {
    return this.post('syncCart', {
      UserID: userId,
      CartItems: items
    });
  },

  async getCart(userId) {
    const r = await this.get(
      'getCart',
      { userId }
    );

    return Array.isArray(r.cart)
      ? r.cart
      : [];
  },

  toggleWishlist(userId, productId) {
    return this.post('toggleWishlist', {
      UserID: userId,
      ProductID: productId
    });
  },

  async getWishlist(userId) {
    const r = await this.get(
      'getWishlist',
      { userId }
    );

    return Array.isArray(r.wishlist)
      ? r.wishlist
      : [];
  },

  getUploadStatus(token = '') {
    if (!token) {
      try {
        token = JSON.parse(
          localStorage.getItem('desimall_seller_session') || 'null'
        )?.token || '';
      } catch (_) {}
    }

    return this._roleRest(
      'seller',
      '/api/v1/seller/upload-status',
      { method: 'GET', token }
    );
  },

  // =========================================================
  // SELLER SESSION AUTO-REFRESH v0.7.6
  // =========================================================

  _sellerSessionKey: 'desimall_seller_session',
  _sellerRefreshPromise: null,

  _readSellerSession() {
    try {
      return JSON.parse(
        localStorage.getItem(this._sellerSessionKey) || '{}'
      ) || {};
    } catch (_) {
      return {};
    }
  },

  _writeSellerSession(next) {
    const current = this._readSellerSession();

    const merged = {
      ...current,
      ...next,
      verifiedAt: Date.now()
    };

    localStorage.setItem(
      this._sellerSessionKey,
      JSON.stringify(merged)
    );

    return merged;
  },

  _sellerSessionExpiring(withinMs = 5 * 60 * 1000) {
    const session = this._readSellerSession();
    const raw = Number(session.expiresAt || 0);

    if (!raw) return false;

    return (raw * 1000) - Date.now() <= withinMs;
  },

  async refreshSellerSession() {
    const session = this._readSellerSession();
    const refreshToken = session.refreshToken || '';

    if (!refreshToken) {
      const error = new Error(
        'Seller session has ended. Please login again.'
      );
      error.status = 401;
      error.code = 'SELLER_SESSION_ENDED';
      throw error;
    }

    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/v1/seller/refresh`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        }),
        cache: 'no-store'
      }
    );

    let result = null;
    try { result = await response.json(); } catch (_) {}

    if (!response.ok) {
      const error = new Error(
        result?.message ||
        `Seller session refresh failed (${response.status})`
      );
      error.status = response.status;
      error.code =
        result?.code ||
        'SELLER_REFRESH_FAILED';
      throw error;
    }

    const updated = this._writeSellerSession({
      token:
        result?.token ||
        result?.session?.accessToken ||
        result?.session?.access_token ||
        '',
      refreshToken:
        result?.refreshToken ||
        result?.session?.refreshToken ||
        result?.session?.refresh_token ||
        refreshToken,
      expiresAt:
        result?.expiresAt ||
        result?.session?.expiresAt ||
        result?.session?.expires_at ||
        null,
      seller:
        result?.seller ||
        session.seller ||
        {}
    });

    return updated;
  },

  async ensureSellerSession(force = false) {
    const session = this._readSellerSession();

    if (
      !force &&
      session.token &&
      !this._sellerSessionExpiring()
    ) {
      return session;
    }

    if (this._sellerRefreshPromise) {
      return this._sellerRefreshPromise;
    }

    this._sellerRefreshPromise =
      this.refreshSellerSession();

    try {
      return await this._sellerRefreshPromise;
    } finally {
      this._sellerRefreshPromise = null;
    }
  },

  async _sellerRest(
    path,
    {
      method = 'GET',
      data = null,
      token = '',
      _retryAfterRefresh = true
    } = {}
  ) {
    let session = this._readSellerSession();

    // Fall back to caller token for first migration-compatible request.
    if (!session.token && token) {
      session = {
        ...session,
        token
      };
    }

    try {
      if (
        session.refreshToken &&
        (
          !session.token ||
          this._sellerSessionExpiring()
        )
      ) {
        session =
          await this.ensureSellerSession(false);
      }
    } catch (_) {
      // Use current token once. A 401 below will force a refresh.
    }

    try {
      return await this._rest(path, {
        method,
        data,
        token: session.token || token
      });
    } catch (error) {
      if (
        error?.status === 401 &&
        _retryAfterRefresh
      ) {
        try {
          const refreshed =
            await this.ensureSellerSession(true);

          return this._sellerRest(path, {
            method,
            data,
            token: refreshed.token || '',
            _retryAfterRefresh: false
          });
        } catch (refreshError) {
          if (
            refreshError?.status === 401 ||
            refreshError?.code === 'SELLER_REFRESH_FAILED'
          ) {
            const finalError = new Error(
              'Seller session has ended. Please login again.'
            );
            finalError.status = 401;
            finalError.code = 'SELLER_SESSION_ENDED';
            throw finalError;
          }

          throw refreshError;
        }
      }

      throw error;
    }
  },

  // =========================================================
  // SELLER — SUPABASE / RENDER API v0.7.0
  // =========================================================

  sellerRegister(data) {
    return this._rest('/api/v1/seller/register', {
      method: 'POST',
      data
    });
  },

  sellerLogin(data) {
    return this._rest('/api/v1/seller/login', {
      method: 'POST',
      data
    });
  },

  sellerSession(token) {
    return this._sellerRest('/api/v1/seller/session', {
      method: 'GET',
      token
    });
  },

  sellerLogout(token) {
    return this._sellerRest('/api/v1/seller/logout', {
      method: 'POST',
      data: {},
      token
    });
  },

  getSellerProducts(token) {
    return this._sellerRest('/api/v1/seller/products', {
      method: 'GET',
      token
    });
  },

  getSellerOrders(token) {
    return this._sellerRest('/api/v1/seller/orders?limit=100', {
      method: 'GET',
      token
    });
  },

  updateSellerOrderStatus(
    orderId,
    status,
    token,
    extra = {}
  ) {
    return this._sellerRest(
      `/api/v1/seller/orders/${encodeURIComponent(String(orderId || ''))}/status`,
      {
        method: 'PATCH',
        data: {
          Status: status,
          ...extra
        },
        token
      }
    );
  },

  // =========================================================
  // RIDER / ADMIN SESSION ENGINE v0.8.0
  // =========================================================

  _roleRefreshPromises: {},

  _roleKey(role) {
    return `desimall_${role}_session`;
  },

  _readRoleSession(role) {
    try {
      return JSON.parse(
        localStorage.getItem(this._roleKey(role)) || '{}'
      ) || {};
    } catch (_) {
      return {};
    }
  },

  _writeRoleSession(role, next) {
    const current = this._readRoleSession(role);
    const merged = { ...current, ...next, verifiedAt: Date.now() };
    localStorage.setItem(this._roleKey(role), JSON.stringify(merged));
    return merged;
  },

  _roleSessionExpiring(role, withinMs = 5 * 60 * 1000) {
    const raw = Number(this._readRoleSession(role).expiresAt || 0);
    return raw ? (raw * 1000) - Date.now() <= withinMs : false;
  },

  async refreshRoleSession(role) {
    const session = this._readRoleSession(role);
    const refreshToken = session.refreshToken || '';

    if (!refreshToken) {
      const error = new Error(`${role} session has ended. Please login again.`);
      error.status = 401;
      error.code = 'ROLE_SESSION_ENDED';
      throw error;
    }

    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/v1/${role}/refresh`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: 'no-store'
      }
    );

    let result = null;
    try { result = await response.json(); } catch (_) {}

    if (!response.ok) {
      const error = new Error(
        result?.message || `${role} session refresh failed (${response.status})`
      );
      error.status = response.status;
      error.code = result?.code || 'ROLE_REFRESH_FAILED';
      throw error;
    }

    return this._writeRoleSession(role, {
      token:
        result?.token ||
        result?.session?.access_token ||
        '',
      refreshToken:
        result?.refreshToken ||
        result?.session?.refresh_token ||
        refreshToken,
      expiresAt:
        result?.expiresAt ||
        result?.session?.expires_at ||
        null,
      [role]: result?.[role] || session?.[role] || {}
    });
  },

  async ensureRoleSession(role, force = false) {
    const session = this._readRoleSession(role);

    if (!force && session.token && !this._roleSessionExpiring(role)) {
      return session;
    }

    if (this._roleRefreshPromises[role]) {
      return this._roleRefreshPromises[role];
    }

    this._roleRefreshPromises[role] = this.refreshRoleSession(role);

    try {
      return await this._roleRefreshPromises[role];
    } finally {
      this._roleRefreshPromises[role] = null;
    }
  },

  async _roleRest(
    role,
    path,
    { method = 'GET', data = null, token = '', _retry = true } = {}
  ) {
    let session = this._readRoleSession(role);

    if (!session.token && token) session = { ...session, token };

    try {
      if (
        session.refreshToken &&
        (!session.token || this._roleSessionExpiring(role))
      ) {
        session = await this.ensureRoleSession(role, false);
      }
    } catch (_) {}

    try {
      return await this._rest(path, {
        method,
        data,
        token: session.token || token
      });
    } catch (error) {
      if (error?.status === 401 && _retry) {
        const refreshed = await this.ensureRoleSession(role, true);
        return this._roleRest(role, path, {
          method,
          data,
          token: refreshed.token || '',
          _retry: false
        });
      }
      throw error;
    }
  },

  // =========================================================
  // RIDER — SUPABASE / RENDER v0.8.0
  // =========================================================

  riderRegister(data) {
    return this._rest('/api/v1/rider/register', {
      method: 'POST',
      data
    });
  },

  riderLogin(data) {
    return this._rest('/api/v1/rider/login', {
      method: 'POST',
      data
    });
  },

  riderSession(token) {
    return this._roleRest('rider', '/api/v1/rider/session', {
      method: 'GET',
      token
    });
  },

  riderLogout(token) {
    return this._roleRest('rider', '/api/v1/rider/logout', {
      method: 'POST',
      data: {},
      token
    });
  },

  getRiderOrders(token) {
    return this._roleRest('rider', '/api/v1/rider/orders', {
      method: 'GET',
      token
    });
  },

  updateRiderOrderStatus(orderId, status, token, extra = {}) {
    return this._roleRest(
      'rider',
      `/api/v1/rider/orders/${encodeURIComponent(String(orderId || ''))}/status`,
      {
        method: 'PATCH',
        data: { Status: status, ...extra },
        token
      }
    );
  },

  getRiderAccount(token = '') {
    return this._roleRest('rider', '/api/v1/rider/account', {
      method: 'GET',
      token
    });
  },

  getRiderReturns(token = '') {
    return this._roleRest('rider', '/api/v1/rider/returns', {
      method: 'GET',
      token
    });
  },

  riderAcceptReturn(data = {}) {
    const returnId = data.ReturnID || data.returnId || '';
    const token = data.Token || data.token || '';
    return this._roleRest(
      'rider',
      `/api/v1/rider/returns/${encodeURIComponent(String(returnId))}/accept`,
      { method: 'POST', data: {}, token }
    );
  },

  uploadRiderReturnProof(data = {}) {
    const token = data.Token || data.token || '';
    return this._roleRest('rider','/api/v1/rider/return-proof',{
      method:'POST',
      data:{
        ReturnID:data.ReturnID,
        FileName:data.FileName,
        MimeType:data.MimeType,
        Base64Data:data.Base64Data
      },
      token
    });
  },

  riderVerifyReturnPickup(data = {}) {
    const returnId = data.ReturnID || data.returnId || '';
    const token = data.Token || data.token || '';
    return this._roleRest(
      'rider',
      `/api/v1/rider/returns/${encodeURIComponent(String(returnId))}/pickup`,
      {
        method:'POST',
        data:{OTP:data.OTP,ProofURL:data.ProofURL,ProofName:data.ProofName},
        token
      }
    );
  },

  riderDepositReturn(data = {}) {
    const returnId = data.ReturnID || data.returnId || '';
    const token = data.Token || data.token || '';
    return this._roleRest(
      'rider',
      `/api/v1/rider/returns/${encodeURIComponent(String(returnId))}/deposit`,
      {
        method:'POST',
        data:{
          ProofURL:data.ProofURL,
          ProofName:data.ProofName,
          ReceivedBy:data.ReceivedBy,
          ReceiverNote:data.ReceiverNote
        },
        token
      }
    );
  },

  // =========================================================
  // ADMIN — SUPABASE / RENDER DISPATCH v0.8.0
  // =========================================================

  adminLogin(data) {
    return this._rest('/api/v1/admin/login', {
      method: 'POST',
      data
    });
  },

  adminSession(token) {
    return this._roleRest('admin', '/api/v1/admin/session', {
      method: 'GET',
      token
    });
  },

  getDispatchOrders(token = '') {
    return this._roleRest('admin', '/api/v1/admin/dispatch', {
      method: 'GET',
      token
    });
  },

  assignRider(orderId, riderId, token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/dispatch/${encodeURIComponent(String(orderId || ''))}/assign`,
      {
        method: 'PATCH',
        data: { RiderID: riderId },
        token
      }
    );
  },

  getAdminCOD(token = '') {
    return this._roleRest('admin', '/api/v1/admin/cod', {
      method: 'GET',
      token
    });
  },

  getAdminCODReview(token = '') {
    return this._roleRest('admin', '/api/v1/admin/cod-review', {
      method: 'GET',
      token
    });
  },

  resolveAdminCODReview(orderId, data = {}, token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/cod-review/${encodeURIComponent(String(orderId || ''))}/resolve`,
      {
        method: 'POST',
        data: {
          Action: data.Action || data.action || '',
          Note: data.Note || data.note || '',
          ReceivedAmount:
            data.ReceivedAmount ?? data.receivedAmount ?? undefined
        },
        token
      }
    );
  },

  markCODReceived(orderId, token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/cod/${encodeURIComponent(String(orderId || ''))}/received`,
      {
        method: 'PATCH',
        data: {},
        token
      }
    );
  },

  getAdminRiderPayouts(token = '') {
    return this._roleRest('admin', '/api/v1/admin/rider-payouts', {
      method: 'GET',
      token
    });
  },

  payAdminRiderPayout(riderId, data = {}, token = '') {
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || ''; } catch (_) {}
    }
    return this._roleRest(
      'admin',
      `/api/v1/admin/rider-payouts/${encodeURIComponent(String(riderId || ''))}/pay`,
      {
        method: 'POST',
        data: {
          PaymentMethod: data.PaymentMethod || data.paymentMethod || 'cash',
          ReferenceNo: data.ReferenceNo || data.referenceNo || '',
          Notes: data.Notes || data.notes || ''
        },
        token
      }
    );
  },

  getAdminReturnPickups(token = '') {
    return this._roleRest('admin', '/api/v1/admin/return-pickups', {
      method:'GET',
      token
    });
  },

  approveAdminReturn(returnId, token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/return-pickups/${encodeURIComponent(String(returnId || ''))}/approve`,
      {
        method:'POST',
        data:{},
        token
      }
    );
  },

  getAdminReturnInspections(token = '') {
    return this._roleRest('admin', '/api/v1/admin/return-inspections', {
      method:'GET',
      token
    });
  },

  inspectAdminReturn(returnId, result, note = '', token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/return-inspections/${encodeURIComponent(String(returnId || ''))}/inspect`,
      {method:'POST',data:{Result:result,Note:note},token}
    );
  },

  refundAdminReturn(returnId, paymentMethod, referenceNo = '', note = '', token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/return-inspections/${encodeURIComponent(String(returnId || ''))}/refund`,
      {
        method:'POST',
        data:{PaymentMethod:paymentMethod,ReferenceNo:referenceNo,Note:note},
        token
      }
    );
  },

  assignAdminReturnPickup(returnId, riderId, token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/return-pickups/${encodeURIComponent(String(returnId || ''))}/assign`,
      {method:'POST',data:{RiderID:riderId},token}
    );
  },

  payRider(riderId, data = {}, token = '') {
    return this._roleRest(
      'admin',
      `/api/v1/admin/rider-payouts/${encodeURIComponent(String(riderId || ''))}/pay`,
      {
        method: 'POST',
        data,
        token
      }
    );
  },

  getAdminDashboard(token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest('admin', '/api/v1/admin/overview', {
      method: 'GET',
      token
    });
  },

  getAdminOrders(params = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }
    const qs = new URLSearchParams(params || {}).toString();
    return this._roleRest('admin', `/api/v1/admin/orders${qs ? '?' + qs : ''}`, {
      method: 'GET',
      token
    });
  },

  getAdminInventory(params = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }
    const qs = new URLSearchParams(params || {}).toString();
    return this._roleRest('admin', `/api/v1/admin/inventory${qs ? '?' + qs : ''}`, {
      method: 'GET',
      token
    });
  },

  getAdminSellers(token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest('admin', '/api/v1/admin/sellers', {
      method: 'GET',
      token
    });
  },

  getAdminRiders(token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }
    return this._roleRest('admin', '/api/v1/admin/riders', {
      method: 'GET',
      token
    });
  },

  getAdminProducts(params = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }
    const qs = new URLSearchParams(params || {}).toString();
    return this._roleRest('admin', `/api/v1/admin/products${qs ? '?' + qs : ''}`, {
      method: 'GET',
      token
    });
  },

  moderateAdminProduct(data = {}) {
    const productId = data.ProductID || data.productId || '';
    let token = data.Token || data.token || '';

    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest(
      'admin',
      `/api/v1/admin/products/${encodeURIComponent(String(productId))}/moderate`,
      {
        method: 'POST',
        data,
        token
      }
    );
  },

  getProductModerationHistory(productId, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest(
      'admin',
      `/api/v1/admin/products/${encodeURIComponent(String(productId || ''))}/moderation-history`,
      {
        method: 'GET',
        token
      }
    );
  },

  // =========================================================
  // ADMIN TEZ MANAGEMENT v0.25.0
  // =========================================================

  getAdminTez(token = '') {
    if (!token) {
      try {
        token = JSON.parse(
          localStorage.getItem('desimall_admin_session') || 'null'
        )?.token || '';
      } catch (_) {}
    }
    return this._roleRest('admin', '/api/v1/admin/tez', {
      method: 'GET',
      token
    });
  },

  updateAdminTezZone(zoneId, data = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(
          localStorage.getItem('desimall_admin_session') || 'null'
        )?.token || '';
      } catch (_) {}
    }
    return this._roleRest(
      'admin',
      `/api/v1/admin/tez/zones/${encodeURIComponent(String(zoneId || ''))}`,
      { method: 'PATCH', data, token }
    );
  },

  updateAdminTezCoverage(data = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(
          localStorage.getItem('desimall_admin_session') || 'null'
        )?.token || '';
      } catch (_) {}
    }
    return this._roleRest('admin', '/api/v1/admin/tez/coverage', {
      method: 'PUT',
      data,
      token
    });
  },

  updateAdminTezProduct(productId, data = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(
          localStorage.getItem('desimall_admin_session') || 'null'
        )?.token || '';
      } catch (_) {}
    }
    return this._roleRest(
      'admin',
      `/api/v1/admin/tez/products/${encodeURIComponent(String(productId || ''))}`,
      { method: 'PUT', data, token }
    );
  },

  // =========================================================
  // MARKETPLACE / FINANCE
  // =========================================================

  getMarketplaceSettings(token = '') {
    if (!token) {
      try {
        token =
          JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token ||
          JSON.parse(localStorage.getItem('desimall_seller_session') || 'null')?.token ||
          DesiMallAuth?.getAccessToken?.() ||
          '';
      } catch (_) {}
    }
    return this._rest('/api/v1/marketplace/settings', { method: 'GET', token });
  },

  calculateSettlementPricing(data) {
    return this.post(
      'calculateSettlementPricing',
      data
    );
  },

  saveMarketplaceSettings(data = {}) {
    let token = data.Token || data.token || '';
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || ''; } catch (_) {}
    }
    return this._roleRest('admin', '/api/v1/admin/marketplace/settings', {
      method: 'POST',
      data,
      token
    });
  },

  getFinanceDashboard(params = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    const qs = new URLSearchParams(params || {}).toString();

    return this._roleRest(
      'admin',
      `/api/v1/admin/finance${qs ? '?' + qs : ''}`,
      {
        method: 'GET',
        token
      }
    );
  },

  backfillFinanceData(token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest('admin', '/api/v1/admin/finance/backfill', {
      method: 'POST',
      data: {},
      token
    });
  },

  verifyOnlinePayment(data = {}) {
    let token = data.Token || data.token || '';

    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest('admin', '/api/v1/admin/finance/verify-payment', {
      method: 'POST',
      data,
      token
    });
  },

  addFinanceExpense(data = {}) {
    let token = data.Token || data.token || '';

    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest('admin', '/api/v1/admin/finance/expenses', {
      method: 'POST',
      data,
      token
    });
  },

  deleteFinanceExpense(expenseId, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest(
      'admin',
      `/api/v1/admin/finance/expenses/${encodeURIComponent(String(expenseId || ''))}`,
      {
        method: 'DELETE',
        token
      }
    );
  },

  getCODReconciliation(params = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest('admin', '/api/v1/admin/cod', {
      method: 'GET',
      token
    });
  },

  getSellerHisab(token) {
    return this._sellerRest('/api/v1/seller/account', {
      method: 'GET',
      token
    });
  },

  reconcileCOD(data) {
    return this.post(
      'reconcileCOD',
      data
    );
  },

  getPendingSellerSettlements(token = '') {
    return this._roleRest('admin', '/api/v1/admin/seller-payouts', {
      method: 'GET',
      token
    });
  },

  // =========================================================
  // SUPPORT
  // =========================================================

  getCustomerSupport(token = '') {
    return this._rest('/api/v1/customer/support', { method: 'GET', token });
  },
  createCustomerSupportTicket(data = {}, token = '') {
    return this._rest('/api/v1/customer/support', { method: 'POST', data, token: token || data.Token || data.token || '' });
  },
  customerSupportReply(data = {}, token = '') {
    return this._rest(
      `/api/v1/customer/support/${encodeURIComponent(String(data.TicketID || ''))}/reply`,
      { method: 'POST', data, token: token || data.Token || data.token || '' }
    );
  },
  markCustomerSupportSeen(ticketId, token = '') {
    return this._rest(
      `/api/v1/customer/support/${encodeURIComponent(String(ticketId || ''))}/seen`,
      { method: 'POST', data: {}, token }
    );
  },

  getRiderSupport(token = '') {
    return this._roleRest('rider', '/api/v1/rider/support', { method: 'GET', token });
  },
  createRiderSupportTicket(data = {}) {
    return this._roleRest('rider', '/api/v1/rider/support', {
      method: 'POST', data, token: data.Token || data.token || ''
    });
  },
  riderSupportReply(data = {}) {
    return this._roleRest(
      'rider',
      `/api/v1/rider/support/${encodeURIComponent(String(data.TicketID || ''))}/reply`,
      { method: 'POST', data, token: data.Token || data.token || '' }
    );
  },
  markRiderSupportSeen(data = {}) {
    return this._roleRest(
      'rider',
      `/api/v1/rider/support/${encodeURIComponent(String(data.TicketID || ''))}/seen`,
      { method: 'POST', data: {}, token: data.Token || data.token || '' }
    );
  },


  getSellerSupport(token = '') {
    return this._roleRest('seller', '/api/v1/seller/support', { method: 'GET', token });
  },

  createSellerSupportTicket(data = {}) {
    return this._roleRest('seller', '/api/v1/seller/support', {
      method: 'POST', data, token: data.Token || data.token || ''
    });
  },

  sellerSupportReply(data = {}) {
    return this._roleRest(
      'seller',
      `/api/v1/seller/support/${encodeURIComponent(String(data.TicketID || ''))}/reply`,
      { method: 'POST', data, token: data.Token || data.token || '' }
    );
  },

  getAdminSupport(params = {}, token = '') {
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || ''; } catch (_) {}
    }
    const qs = new URLSearchParams(params || {}).toString();
    return this._roleRest('admin', `/api/v1/admin/support${qs ? '?' + qs : ''}`, {
      method: 'GET', token
    });
  },

  adminSupportReply(data = {}) {
    let token = data.Token || data.token || '';
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || ''; } catch (_) {}
    }
    return this._roleRest(
      'admin',
      `/api/v1/admin/support/${encodeURIComponent(String(data.TicketID || ''))}/reply`,
      { method: 'POST', data, token }
    );
  },

  updateSupportTicket(data) {
    return this.post(
      'updateSupportTicket',
      data
    );
  },

  markSellerSupportSeen(data = {}) {
    return this._roleRest(
      'seller',
      `/api/v1/seller/support/${encodeURIComponent(String(data.TicketID || ''))}/seen`,
      { method: 'POST', data: {}, token: data.Token || data.token || '' }
    );
  },

  markAdminSupportSeen(data = {}) {
    let token = data.Token || data.token || '';
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || ''; } catch (_) {}
    }
    return this._roleRest(
      'admin',
      `/api/v1/admin/support/${encodeURIComponent(String(data.TicketID || ''))}/seen`,
      { method: 'POST', data: {}, token }
    );
  },

  // =========================================================
  // RETURNS
  // =========================================================

  getCustomerReturns(userId) {
    return this.request(
      'getCustomerReturns',
      {
        method: 'GET',
        data: { userId },
        timeoutMs: 22000,
        retries: 1,
        cacheMs: 30000,
        staleMs: 86400000
      }
    );
  },

  // Legacy Apps Script return method kept under a different name.
  // The active customer return flow uses the REST /api/v1/returns method above.
  createReturnRequestLegacy(data) {
    return this.post(
      'createReturnRequest',
      data
    );
  },

  getSellerReturns(token) {
    return this._sellerRest('/api/v1/seller/returns', {
      method: 'GET',
      token
    });
  },

  sellerReturnDecision(data = {}) {
    const returnId = data.ReturnID || data.returnId || '';
    const token = data.Token || data.token || '';

    return this._sellerRest(
      `/api/v1/seller/returns/${encodeURIComponent(String(returnId))}/decision`,
      {
        method: 'PATCH',
        data: {
          Decision: data.Decision || data.decision || '',
          Note: data.Note || data.note || ''
        },
        token
      }
    );
  },

  getAdminReturns(params = {}, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }
    const qs = new URLSearchParams(params || {}).toString();
    return this._roleRest('admin', `/api/v1/admin/returns${qs ? '?' + qs : ''}`, {
      method: 'GET',
      token
    });
  },

  adminReturnReview(data) {
    return this.post(
      'adminReturnReview',
      data
    );
  },

  assignReturnPickup(data) {
    return this.post(
      'assignReturnPickup',
      data
    );
  },

  updateReturnStage(data) {
    return this.post(
      'updateReturnStage',
      data
    );
  },

  processReturnRefund(data) {
    return this.post(
      'processReturnRefund',
      data
    );
  },

  resetReturnPickupOTP(data) {
    return this.post(
      'resetReturnPickupOTP',
      data
    );
  },

  // =========================================================
  // SELLER / ADMIN MANAGEMENT
  // =========================================================

  paySellerSettlement(data = {}) {
    const sellerId = data.SellerID || data.sellerId || '';
    const token = data.Token || data.token || '';

    return this._roleRest(
      'admin',
      `/api/v1/admin/seller-payouts/${encodeURIComponent(String(sellerId))}/pay`,
      {
        method: 'POST',
        data: {
          PaymentMode: data.PaymentMode || data.paymentMode || '',
          Reference: data.Reference || data.reference || '',
          AdminNote: data.AdminNote || data.adminNote || ''
        },
        token
      }
    );
  },

  updateAdminSeller(data = {}) {
    const sellerId = data.SellerID || data.sellerId || '';
    let token = data.Token || data.token || '';
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || ''; } catch (_) {}
    }
    return this._roleRest(
      'admin',
      `/api/v1/admin/sellers/${encodeURIComponent(String(sellerId))}/pricing`,
      { method: 'POST', data, token }
    );
  },

  reviewSellerKYC(data = {}) {
    const sellerId = data.SellerID || data.sellerId || '';
    let token = data.Token || data.token || '';

    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest(
      'admin',
      `/api/v1/admin/sellers/${encodeURIComponent(String(sellerId))}/review`,
      {
        method: 'POST',
        data: {
          ReviewAction: data.ReviewAction || data.reviewAction || '',
          KYCNotes: data.KYCNotes || data.kycNotes || ''
        },
        token
      }
    );
  },

  getSellerKYCReviewHistory(sellerId, token = '') {
    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest(
      'admin',
      `/api/v1/admin/sellers/${encodeURIComponent(String(sellerId || ''))}/kyc-history`,
      {
        method: 'GET',
        token
      }
    );
  },

  updateAdminRider(data = {}) {
    const riderId = data.RiderID || data.riderId || '';
    let token = data.Token || data.token || '';

    if (!token) {
      try {
        token = JSON.parse(localStorage.getItem('desimall_admin_session') || 'null')?.token || '';
      } catch (_) {}
    }

    return this._roleRest(
      'admin',
      `/api/v1/admin/riders/${encodeURIComponent(String(riderId))}`,
      {
        method: 'POST',
        data,
        token
      }
    );
  },

  updateSellerProfile(data) {
    return this.post(
      'updateSellerProfile',
      data
    );
  },

  // =========================================================
  // UPLOADS
  // =========================================================

  uploadSellerAvatar(data) {
    return this.request(
      'uploadSellerAvatar',
      {
        method: 'POST',
        data,
        timeoutMs:
          API_CONFIG.UPLOAD_TIMEOUT_MS
      }
    );
  },

  uploadSellerBrandAsset(data) {
    return this.request(
      'uploadSellerBrandAsset',
      {
        method: 'POST',
        data,
        timeoutMs:
          API_CONFIG.UPLOAD_TIMEOUT_MS
      }
    );
  },

  uploadSellerKYCDocument(data) {
    return this.request(
      'uploadSellerKYCDocument',
      {
        method: 'POST',
        data,
        timeoutMs:
          API_CONFIG.UPLOAD_TIMEOUT_MS
      }
    );
  },

  submitSellerKYC(data) {
    return this.post(
      'submitSellerKYC',
      data
    );
  },

  uploadProductImage(data = {}) {
    let token = data.Token || data.token || '';
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_seller_session') || 'null')?.token || ''; } catch (_) {}
    }
    return this._roleRest('seller', '/api/v1/seller/product-image', {
      method: 'POST',
      data,
      token,
      timeoutMs: API_CONFIG.UPLOAD_TIMEOUT_MS
    });
  },

  uploadReturnImage(data) {
    return this.request(
      'uploadReturnImage',
      {
        method: 'POST',
        data,
        timeoutMs:
          API_CONFIG.UPLOAD_TIMEOUT_MS
      }
    );
  },

  deleteUploadedImage(fileId) {
    return this.post(
      'deleteUploadedImage',
      {
        FileID: fileId
      }
    );
  },

  // =========================================================
  // PRODUCT MANAGEMENT
  // =========================================================

  addProduct(data) {
    return this.post(
      'addProduct',
      data
    );
  },

  editProduct(data = {}) {
    const productId = data.ProductID || data.productId || '';
    let token = data.Token || data.token || '';
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('desimall_seller_session') || 'null')?.token || ''; } catch (_) {}
    }
    return this._roleRest(
      'seller',
      `/api/v1/seller/products/${encodeURIComponent(String(productId))}`,
      { method: 'PATCH', data, token }
    );
  },

  updateStock(productId, stock, token) {
    return this.post(
      'updateStock',
      {
        ProductID: productId,
        Stock: stock,
        Token: token
      }
    );
  },

  deleteProduct(productId, token) {
    return this.post(
      'deleteProduct',
      {
        ProductID: productId,
        Token: token
      }
    );
  },

  duplicateProduct(productId, token) {
    return this.post(
      'duplicateProduct',
      {
        ProductID: productId,
        Token: token
      }
    );
  },

  setProductStatus(
    productId,
    status,
    token
  ) {
    return this.post(
      'setProductStatus',
      {
        ProductID: productId,
        Status: status,
        Token: token
      }
    );
  },

  bulkUpdateProducts(
    productIds,
    bulkAction,
    value,
    token
  ) {
    return this.post(
      'bulkUpdateProducts',
      {
        ProductIDs: productIds,
        BulkAction: bulkAction,
        Value: value,
        Token: token
      }
    );
  },

  async searchProducts(
    query,
    category = ''
  ) {
    const r = await this.get(
      'getProducts',
      {
        search: query,
        category
      }
    );

    return Array.isArray(r.products)
      ? r.products
      : [];
  }
};


// ===========================================================
// GLOBAL COMPATIBILITY FUNCTIONS
// ===========================================================

async function getProducts(params) {
  return DesiMallAPI.getProducts(params);
}

async function getCategories() {
  return DesiMallAPI.getCategories();
}

async function getBanners() {
  return DesiMallAPI.getBanners();
}