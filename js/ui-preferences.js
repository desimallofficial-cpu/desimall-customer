/** DesiMall theme, accessibility and lightweight UI preferences */
const DesiMallUI = (() => {
  const THEME_KEY = 'desimall_theme';
  const root = document.documentElement;

  function preferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, persist = false) {
    const value = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = value;
    root.style.colorScheme = value;
    if (persist) localStorage.setItem(THEME_KEY, value);
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-label', value === 'dark' ? 'Use light theme' : 'Use dark theme');
      btn.title = value === 'dark' ? 'Light mode' : 'Dark mode';
      btn.innerHTML = `<i class="fa-solid ${value === 'dark' ? 'fa-sun' : 'fa-moon'}"></i><span>${value === 'dark' ? 'Light' : 'Dark'}</span>`;
    });
    window.dispatchEvent(new CustomEvent('desimall:theme-changed', { detail: value }));
  }

  function toggleTheme() { applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true); }

  function addThemeButton() {
    if (document.querySelector('[data-theme-toggle]')) return;
    const nav = document.querySelector('.nav-actions');
    if (!nav) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item theme-toggle';
    button.dataset.themeToggle = '';
    button.addEventListener('click', toggleTheme);
    nav.prepend(button);
    applyTheme(root.dataset.theme || preferredTheme());
  }

  function addBackToTop() {
    if (document.getElementById('backToTop')) return;
    const button = document.createElement('button');
    button.id = 'backToTop';
    button.className = 'back-to-top';
    button.type = 'button';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    button.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(button);
    addEventListener('scroll', () => button.classList.toggle('show', scrollY > 500), { passive: true });
  }

  function init() {
    applyTheme(preferredTheme());
    addThemeButton();
    addBackToTop();
  }

  return { init, applyTheme, toggleTheme };
})();

DesiMallUI.init();
