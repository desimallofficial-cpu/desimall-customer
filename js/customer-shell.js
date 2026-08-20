(() => {
  'use strict';

  const SERVICES = {
    tez: {
      icon: 'fa-bolt',
      title: 'DesiMall Tez',
      text: 'Fast nearby delivery is part of the DesiMall roadmap. We will enable it only after Tez-eligible inventory, service radius and rapid-delivery workflow are ready.'
    },
    food: {
      icon: 'fa-utensils',
      title: 'Food & Restaurants',
      text: 'Restaurant discovery, menus, preparation and food delivery will launch here as one DesiMall experience after the restaurant workflow is ready.'
    },
    services: {
      icon: 'fa-screwdriver-wrench',
      title: 'Local Services',
      text: 'Plumber, electrician, mechanic and other service bookings will appear here after provider matching, booking and job-completion workflows are ready.'
    },
    tryon: {
      icon: 'fa-shirt',
      title: 'Try-On',
      text: 'Try-On will be a separate home-trial workflow for eligible products. Deposit, item limits, fees and trial windows will not be assumed before the business rules are finalized.'
    }
  };

  function safeJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  function defaultAddress() {
    const user = safeJSON('desimall_user') || {};
    return user.DefaultAddress || user.default_address || null;
  }

  function addressLabel() {
    const a = defaultAddress();
    if (!a) return 'Set location';
    const label = a.Label || a.label || '';
    const city = a.City || a.city || '';
    const pincode = a.Pincode || a.pincode || '';
    if (label && pincode) return `${label} • ${pincode}`;
    if (city && pincode) return `${city} • ${pincode}`;
    return pincode || city || 'Saved address';
  }

  function updateLocation() {
    const label = addressLabel();
    ['deliveryLocationText','mobileDeliveryLocationText'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = label;
    });
  }

  function updateMobileCart() {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem('desimall_cart') || '[]'); } catch {}
    const total = Array.isArray(cart) ? cart.reduce((n,x)=>n+Number(x.Qty || x.Quantity || 1),0) : 0;
    const badge = document.getElementById('mobileCartBadge');
    if (badge) badge.textContent = total;
  }

  function openModule(key) {
    if (key === 'marketplace') {
      document.getElementById('categoriesSection')?.scrollIntoView({behavior:'smooth'});
      return;
    }
    const data = SERVICES[key];
    if (!data) return;
    const back = document.getElementById('moduleSheetBackdrop');
    const title = document.getElementById('moduleSheetTitle');
    const text = document.getElementById('moduleSheetText');
    const icon = document.getElementById('moduleSheetIcon');
    if (title) title.textContent = data.title;
    if (text) text.textContent = data.text;
    if (icon) icon.innerHTML = `<i class="fa-solid ${data.icon}"></i>`;
    back?.classList.remove('hidden');
    back?.setAttribute('aria-hidden','false');
  }

  function closeModule() {
    const back = document.getElementById('moduleSheetBackdrop');
    back?.classList.add('hidden');
    back?.setAttribute('aria-hidden','true');
  }

  function futureIntent(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    if (/\b(plumber|electrician|mechanic|carpenter|ac repair|fridge repair|service)\b/.test(q)) return 'services';
    if (/\b(pizza|burger|restaurant|biryani|food|meal|hotel)\b/.test(q)) return 'food';
    if (/\b(try on|try-on|home trial)\b/.test(q)) return 'tryon';
    return null;
  }

  function bind() {
    updateLocation();
    updateMobileCart();

    document.querySelectorAll('.service-tab').forEach(btn => {
      btn.addEventListener('click', () => openModule(btn.dataset.service));
    });

    document.getElementById('moduleSheetClose')?.addEventListener('click', closeModule);
    document.getElementById('moduleSheetOkay')?.addEventListener('click', closeModule);
    document.getElementById('moduleSheetBackdrop')?.addEventListener('click', e => {
      if (e.target.id === 'moduleSheetBackdrop') closeModule();
    });

    document.getElementById('mobileSearchButton')?.addEventListener('click', () => {
      const form = document.getElementById('searchForm');
      form?.classList.toggle('mobile-open');
      if (form?.classList.contains('mobile-open')) {
        setTimeout(()=>document.getElementById('searchInput')?.focus(),50);
      }
    });

    // Intent-aware search without pretending unfinished verticals are live.
    document.getElementById('searchForm')?.addEventListener('submit', e => {
      const intent = futureIntent(document.getElementById('searchInput')?.value);
      if (!intent) return; // Existing Marketplace search continues normally.
      e.preventDefault();
      e.stopImmediatePropagation();
      openModule(intent);
    }, true);

    window.addEventListener('storage', e => {
      if (e.key === 'desimall_user') updateLocation();
      if (e.key === 'desimall_cart') updateMobileCart();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
