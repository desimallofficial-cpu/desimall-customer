/** DesiMall customer registration via Render + Supabase Auth */
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const form = $('customerSignupForm');
  const message = $('signupMessage');

  const showMessage = (text, type = 'info') => {
    if (!message) return alert(text);
    message.textContent = text;
    message.className = `login-message ${type}`;
    message.hidden = false;
  };

  const setBusy = (button, busy) => {
    if (!button) return;
    button.disabled = busy;
    if (!button.dataset.label) button.dataset.label = button.innerHTML;
    button.innerHTML = busy
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...'
      : button.dataset.label;
  };

  form?.addEventListener('submit', async event => {
    event.preventDefault();

    const fullName = $('signupName')?.value.trim() || '';
    const email = $('signupEmail')?.value.trim().toLowerCase() || '';
    const mobile = ($('signupMobile')?.value || '').replace(/\D/g, '').slice(-10);
    const password = $('signupPassword')?.value || '';
    const confirmPassword = $('signupConfirmPassword')?.value || '';
    const button = form.querySelector('button[type="submit"]');

    if (fullName.length < 2) return showMessage('Please enter your full name.', 'error');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showMessage('Please enter a valid email address.', 'error');
    if (!/^[6-9]\d{9}$/.test(mobile)) return showMessage('Please enter a valid 10-digit Indian mobile number.', 'error');
    if (password.length < 6) return showMessage('Password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return showMessage('Passwords do not match.', 'error');

    setBusy(button, true);
    try {
      const result = await DesiMallAPI.registerUser({
        Name: fullName,
        Email: email,
        Mobile: mobile,
        Password: password
      });

      if (!result?.success) throw new Error(result?.message || 'Registration failed');
      const user = DesiMallAuth.setAuthResult(result, email);
      showMessage(`Welcome, ${user.Name}! Your DesiMall account is ready.`, 'success');
      setTimeout(() => DesiMallAuth.redirectAfterLogin('../index.html'), 700);
    } catch (error) {
      showMessage(error.message || 'Account could not be created.', 'error');
    } finally {
      setBusy(button, false);
    }
  });
});
