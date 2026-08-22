(() => {
  // ---------------------------------------------------------
  // Service Worker Registration
  // ---------------------------------------------------------

  if (
    'serviceWorker' in navigator &&
    location.protocol !== 'file:'
  ) {
    window.addEventListener('load', () => {
      const swUrl = new URL(
        './sw.js',
        window.location.href
      );

      navigator.serviceWorker
        .register(swUrl)
        .catch(error => {
          console.warn(
            'Service worker registration failed:',
            error
          );
        });
    });
  }

  // ---------------------------------------------------------
  // PWA Install Prompt
  // ---------------------------------------------------------

  let deferredPrompt = null;

  window.addEventListener(
    'beforeinstallprompt',
    event => {
      event.preventDefault();
      deferredPrompt = event;

      const btn =
        document.getElementById('installAppBtn');

      if (btn) {
        btn.hidden = false;
      }
    }
  );

  window.DesIMallPWA = {
    async install() {
      if (!deferredPrompt) {
        return false;
      }

      deferredPrompt.prompt();

      const result =
        await deferredPrompt.userChoice;

      deferredPrompt = null;

      const btn =
        document.getElementById('installAppBtn');

      if (btn) {
        btn.hidden = true;
      }

      return result.outcome === 'accepted';
    }
  };

  // ---------------------------------------------------------
  // Network Status Banner
  // ---------------------------------------------------------

  const networkBanner =
    document.createElement('div');

  networkBanner.id = 'networkStatus';
  networkBanner.className = 'network-status';

  function mountNetworkBanner() {
    if (
      document.body &&
      !document.getElementById('networkStatus')
    ) {
      document.body.appendChild(networkBanner);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      mountNetworkBanner
    );
  } else {
    mountNetworkBanner();
  }

  function updateNetworkStatus() {
    mountNetworkBanner();

    if (!document.body) {
      return;
    }

    networkBanner.textContent =
      navigator.onLine
        ? 'Back online'
        : 'You are offline — some features may be unavailable';

    networkBanner.className =
      'network-status ' +
      (navigator.onLine ? 'online' : 'offline');

    networkBanner.classList.add('show');

    setTimeout(() => {
      networkBanner.classList.remove('show');
    }, navigator.onLine ? 2200 : 5000);
  }

  window.addEventListener(
    'online',
    updateNetworkStatus
  );

  window.addEventListener(
    'offline',
    updateNetworkStatus
  );
})();