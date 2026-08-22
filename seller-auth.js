const SellerAuth = {
  key: 'desimall_seller_session',

  init() {
    this.bindTabs();

    document
      .getElementById('sellerLoginForm')
      ?.addEventListener('submit', event => {
        event.preventDefault();
        this.login();
      });

    document
      .getElementById('sellerRegisterForm')
      ?.addEventListener('submit', event => {
        event.preventDefault();
        this.register();
      });

    this.checkExistingSession();
  },

  bindTabs() {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('sellerLoginForm');
    const registerForm = document.getElementById('sellerRegisterForm');

    if (loginTab) {
      loginTab.onclick = () => {
        loginTab.classList.add('active');
        registerTab?.classList.remove('active');
        loginForm?.classList.remove('hidden');
        registerForm?.classList.add('hidden');
        this.message('');
      };
    }

    if (registerTab) {
      registerTab.onclick = () => {
        registerTab.classList.add('active');
        loginTab?.classList.remove('active');
        registerForm?.classList.remove('hidden');
        loginForm?.classList.add('hidden');
        this.message('');
      };
    }
  },

  read() {
    try {
      return JSON.parse(localStorage.getItem(this.key)) || {};
    } catch (_) {
      return {};
    }
  },

  destination(seller) {
    const active =
      String(seller?.Status || '').toLowerCase() === 'active';

    const approved =
      String(seller?.KYCStatus || '').toLowerCase() === 'approved';

    return active && approved
      ? 'orders.html'
      : 'profile.html';
  },

  async checkExistingSession() {
    const session = this.read();

    if (!session.token) return;

    try {
      const result = await DesiMallAPI.sellerSession(session.token);

      if (!result?.success) return;

      const latest = (() => {
        try {
          return JSON.parse(
            localStorage.getItem(this.key) || '{}'
          ) || {};
        } catch (_) {
          return {};
        }
      })();

      const updated = {
        ...session,
        ...latest,
        seller: result.seller || latest.seller || session.seller,
        expiresAt: result.expiresAt || latest.expiresAt || session.expiresAt,
        verifiedAt: Date.now()
      };

      localStorage.setItem(this.key, JSON.stringify(updated));
      window.location.replace(this.destination(updated.seller));
    } catch (error) {
      if (
        error?.status === 401 ||
        error?.code === 'INVALID_SESSION' ||
        error?.code === 'AUTH_REQUIRED'
      ) {
        localStorage.removeItem(this.key);
      }
    }
  },

  async login() {
    const form = document.getElementById('sellerLoginForm');
    const button = form?.querySelector('button[type="submit"]');
    const identifier =
      document.getElementById('sellerIdentifier')?.value.trim() || '';
    const password =
      document.getElementById('sellerPassword')?.value || '';

    if (!identifier) {
      return this.message('Mobile number ya email enter karein.');
    }

    if (password.length < 6) {
      return this.message('Password kam se kam 6 characters ka hona chahiye.');
    }

    this.busy(button, true, 'Logging in...');

    try {
      const result = await DesiMallAPI.sellerLogin({
        Identifier: identifier,
        Password: password
      });

      if (!result?.success || !result?.token || !result?.seller) {
        throw new Error(result?.message || 'Seller login failed.');
      }

      localStorage.setItem(
        this.key,
        JSON.stringify({
          token: result.token,
          refreshToken: result.refreshToken || '',
          expiresAt: result.expiresAt || null,
          verifiedAt: Date.now(),
          seller: result.seller
        })
      );

      this.message(
        'Login successful. Seller orders khul rahe hain...',
        true
      );

      setTimeout(() => {
        window.location.replace(this.destination(result.seller));
      }, 350);
    } catch (error) {
      this.message(
        error?.message || 'Seller login nahi ho saka.'
      );
    } finally {
      this.busy(button, false);
    }
  },

  async register() {
    const mobile =
      document.getElementById('regMobile')?.value.trim() || '';
    const email =
      document.getElementById('regEmail')?.value.trim().toLowerCase() || '';
    const password =
      document.getElementById('regPassword')?.value || '';

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return this.message('Valid 10-digit Indian mobile number enter karein.');
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return this.message('Valid email address enter karein.');
    }

    if (password.length < 6) {
      return this.message('Password kam se kam 6 characters ka hona chahiye.');
    }

    const button =
      document.querySelector('#sellerRegisterForm button[type="submit"]');

    this.busy(button, true, 'Submitting...');

    try {
      const result = await DesiMallAPI.sellerRegister({
        ShopName:
          document.getElementById('regShopName')?.value.trim() || '',
        SellerName:
          document.getElementById('regSellerName')?.value.trim() || '',
        Mobile: mobile,
        Email: email,
        Address:
          document.getElementById('regAddress')?.value.trim() || '',
        Password: password
      });

      this.message(
        result?.message ||
          (result?.success
            ? 'Registration submitted. Admin approval ke baad login karein.'
            : 'Registration failed.'),
        Boolean(result?.success)
      );

      if (result?.success) {
        document.getElementById('sellerRegisterForm')?.reset();
      }
    } catch (error) {
      this.message(
        error?.message || 'Seller registration failed.'
      );
    } finally {
      this.busy(button, false);
    }
  },

  message(text, good = false) {
    const el = document.getElementById('sellerAuthMessage');
    if (!el) return;

    el.textContent = text;
    el.classList.toggle('good', good);
  },

  busy(button, state, text = '') {
    if (!button) return;

    if (!button.dataset.label) {
      button.dataset.label = button.innerHTML;
    }

    button.disabled = state;
    button.innerHTML = state
      ? `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`
      : button.dataset.label;
  }
};

document.addEventListener(
  'DOMContentLoaded',
  () => SellerAuth.init()
);
