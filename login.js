/** DesiMall customer login: Supabase password auth + preserved demo mobile OTP */
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  const showMessage = (text, type = 'info') => {
    const box = $('loginMessage');
    if (box) {
      box.textContent = text;
      box.className = `login-message ${type}`;
      box.hidden = false;
    } else {
      alert(text);
    }
  };

  const setBusy = (button, busy, label) => {
    if (!button) return;
    button.disabled = busy;
    if (!button.dataset.label) button.dataset.label = button.innerHTML;
    button.innerHTML = busy
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Please wait...'
      : (label || button.dataset.label);
  };

  const passwordTab = $('passwordTab');
  const otpTab = $('otpTab');
  const passwordForm = $('passwordLoginForm');
  const otpForm = $('otpLoginForm');

  const passwordInput = $('password');
  const passwordToggle = $('toggleLoginPassword');
  passwordToggle?.addEventListener('click', () => {
    const show = passwordInput?.type === 'password';
    if (passwordInput) passwordInput.type = show ? 'text' : 'password';
    passwordToggle.textContent = show ? 'Hide' : 'Show';
  });

  const rememberCustomer = $('rememberCustomer');
  try {
    const remembered = localStorage.getItem('desimall_customer_email') || '';
    if (remembered && $('email')) {
      $('email').value = remembered;
      if (rememberCustomer) rememberCustomer.checked = true;
    }
  } catch (_) {}

  $('forgotCustomerPassword')?.addEventListener('click', () => {
    const note = $('customerForgotNote');
    if (note) note.hidden = !note.hidden;
  });

  passwordTab?.addEventListener('click', () => {
    passwordTab.classList.add('active');
    otpTab?.classList.remove('active');
    if (passwordForm) passwordForm.style.display = 'block';
    if (otpForm) otpForm.style.display = 'none';
  });

  otpTab?.addEventListener('click', () => {
    otpTab.classList.add('active');
    passwordTab?.classList.remove('active');
    if (passwordForm) passwordForm.style.display = 'none';
    if (otpForm) otpForm.style.display = 'block';
  });

  passwordForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = $('email')?.value.trim().toLowerCase();
    const password = $('password')?.value || '';
    const button = passwordForm.querySelector('button[type="submit"]');

    if (!/^\S+@\S+\.\S+$/.test(email || '')) {
      return showMessage('Please enter a valid email address.', 'error');
    }
    if (password.length < 6) {
      return showMessage('Password must be at least 6 characters.', 'error');
    }

    setBusy(button, true);
    try {
      const result = await DesiMallAPI.loginUser({ Email: email, Password: password });
      if (!result?.success) throw new Error(result?.message || 'Login failed');
      const user = DesiMallAuth.setAuthResult(result, email);
      try {
        if (rememberCustomer?.checked) localStorage.setItem('desimall_customer_email', email);
        else localStorage.removeItem('desimall_customer_email');
      } catch (_) {}
      showMessage(`Welcome, ${user.Name}!`, 'success');
      setTimeout(() => DesiMallAuth.redirectAfterLogin('../index.html'), 400);
    } catch (error) {
      const raw = String(error?.message || '').toLowerCase();
      const invalid = error?.status === 401 ||
        raw.includes('invalid email or password') ||
        raw.includes('invalid login credentials') ||
        raw.includes('invalid credentials');
      showMessage(
        invalid ? 'Wrong / invalid password. Please enter a valid password.' : (error.message || 'Login failed.'),
        'error'
      );
    } finally {
      setBusy(button, false);
    }
  });

  const mobileInput = $('mobileNumber');
  const otpSection = $('otpInputSection');
  const sendBtn = $('sendOtpBtn');
  const verifyBtn = $('verifyOtpBtn');
  let otpSentFor = '';

  sendBtn?.addEventListener('click', event => {
    event.preventDefault();
    const mobile = (mobileInput?.value || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return showMessage('Please enter a valid 10-digit Indian mobile number.', 'error');
    }

    otpSentFor = mobile;
    sessionStorage.setItem('desimall_demo_otp_mobile', mobile);
    if (otpSection) otpSection.style.display = 'block';
    sendBtn.style.display = 'none';
    if (verifyBtn) verifyBtn.style.display = 'block';
    showMessage('Demo OTP is 1234. SMS gateway is not connected yet.', 'success');
  });

  verifyBtn?.addEventListener('click', async event => {
    event.preventDefault();
    const mobile = (mobileInput?.value || '').replace(/\D/g, '').slice(-10);
    const otp = $('otpCode')?.value.trim();

    if (mobile !== otpSentFor || otpSentFor !== sessionStorage.getItem('desimall_demo_otp_mobile')) {
      return showMessage('Please send OTP first.', 'error');
    }
    if (otp !== '1234') {
      return showMessage('Invalid OTP. Demo OTP is 1234.', 'error');
    }

    setBusy(verifyBtn, true);
    try {
      const result = await DesiMallAPI.getUserByMobile(mobile);
      if (!result?.success || !result?.user) {
        throw new Error('No customer account found for this mobile number. Please create an account first.');
      }
      const user = DesiMallAuth.setUser(result.user, mobile);
      showMessage(`Welcome, ${user.Name}! Demo OTP login is active.`, 'success');
      sessionStorage.removeItem('desimall_demo_otp_mobile');
      setTimeout(() => DesiMallAuth.redirectAfterLogin('../index.html'), 400);
    } catch (error) {
      showMessage(error.message || 'OTP login failed.', 'error');
    } finally {
      setBusy(verifyBtn, false);
    }
  });
});
