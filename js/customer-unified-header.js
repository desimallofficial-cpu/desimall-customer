/* DesiMall Unified Customer Header v1.4.0
   One stable seven-action header across the entire customer app. */
(() => {
  'use strict';
  const PREFIX = location.pathname.includes('/pages/') ? '../' : '';
  const path = location.pathname.split('/').pop() || 'index.html';
  const ACTIVE = path === 'wishlist.html' ? 'wishlist' : path === 'notifications.html' ? 'alerts' : path === 'profile.html' ? 'account' : ['my-orders.html','order-details.html','order-success.html'].includes(path) ? 'orders' : path === 'track-order.html' ? 'track' : path === 'cart.html' ? 'cart' : '';
  const href = file => PREFIX + (PREFIX ? file : 'pages/' + file);
  const safeJSON = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || ''); return v ?? fallback; } catch { return fallback; } };
  const count = key => { const v = safeJSON(key, []); return Array.isArray(v) ? v.length : 0; };
  const cartCount = () => { const v = safeJSON('desimall_cart', []); return Array.isArray(v) ? v.reduce((n,x)=>n+Number(x.Qty||x.Quantity||1),0) : 0; };
  const user = () => safeJSON('desimall_user', null);
  const alertCount = () => { const v = safeJSON('desimall_notifications', []); return Array.isArray(v) ? v.filter(x => !(x.read || x.Read)).length : 0; };

  function action(key, file, icon, label, badge='') {
    return `<a class="dm-unified-action ${ACTIVE===key?'active':''}" href="${href(file)}" data-dm-action="${key}" title="${label}" aria-label="${label}"><i class="${icon}"></i><span>${label}</span>${badge!=='' ? `<b class="dm-badge ${badge==='0'?'hidden':''}" data-dm-badge="${key}">${badge}</b>` : ''}</a>`;
  }

  function markup() {
    return `<header class="dm-unified-header" role="banner">
      <div class="dm-unified-inner">
        <a class="dm-unified-brand" href="${PREFIX}index.html" aria-label="DesiMall home"><span class="dm-unified-brand-icon"><i class="fa-solid fa-store"></i></span><span class="dm-unified-brand-name"><b>Desi</b>Mall</span></a>
        <a class="dm-unified-location" href="${href('address-book.html')}" title="Change delivery location"><i class="fa-solid fa-location-dot"></i><span><small>Delivering to</small><strong data-dm-location>Set location</strong></span><i class="fa-solid fa-chevron-down chev"></i></a>
        <form class="dm-unified-search" id="searchForm" action="${PREFIX}index.html" role="search">
          <i class="fa-solid fa-magnifying-glass"></i><input id="searchInput" name="q" type="search" placeholder="Search products, food or services" autocomplete="off" aria-label="Search DesiMall"><button type="submit" aria-label="Search"><i class="fa-solid fa-arrow-right"></i></button><div class="search-results-dropdown hidden" id="searchResults"></div>
        </form>
        <nav class="dm-unified-actions" aria-label="Customer navigation">
          <button class="dm-unified-action" type="button" data-theme-toggle title="Theme" aria-label="Toggle theme"><i class="fa-solid fa-moon"></i><span>Dark</span></button>
          ${action('wishlist','wishlist.html','fa-regular fa-heart','Wishlist',String(count('desimall_wishlist')))}
          ${action('alerts','notifications.html','fa-regular fa-bell','Alerts',String(alertCount()))}
          ${action('account','profile.html','fa-regular fa-user','Account','')}
          ${action('orders','my-orders.html','fa-solid fa-box','Orders','')}
          ${action('track','track-order.html','fa-solid fa-location-dot','Track','')}
          ${action('cart','cart.html','fa-solid fa-cart-shopping','Cart',String(cartCount()))}
        </nav>
      </div>
    </header>`;
  }

  function update() {
    const u = user();
    const loc = document.querySelector('[data-dm-location]');
    if (loc) { const a=u?.DefaultAddress||u?.default_address; loc.textContent=a?.Pincode||a?.pincode||a?.City||a?.city||'Set location'; }
    const wb=document.querySelector('[data-dm-badge="wishlist"]'); if(wb){const n=count('desimall_wishlist');wb.textContent=n;wb.classList.toggle('hidden',n===0);}
    const ab=document.querySelector('[data-dm-badge="alerts"]'); if(ab){const n=alertCount();ab.textContent=n;ab.classList.toggle('hidden',n===0);}
    const cb=document.querySelector('[data-dm-badge="cart"]'); if(cb){const n=cartCount();cb.textContent=n;cb.classList.toggle('hidden',n===0);}
    const acc=document.querySelector('[data-dm-action="account"] span'); if(acc) acc.textContent=u?(u.Name||u.FullName||u.name||'Account').split(' ')[0]:'Account';
  }

  function bindTheme() {
    const btn=document.querySelector('[data-theme-toggle]');
    if(!btn || btn.dataset.dmBound) return;
    btn.dataset.dmBound='1';
    btn.addEventListener('click', () => {
      if(window.DesiMallUI?.toggleTheme) window.DesiMallUI.toggleTheme();
      else {
        const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
        document.documentElement.dataset.theme=next;
        try{localStorage.setItem('desimall_theme',next);}catch{}
        btn.innerHTML=`<i class="fa-solid ${next==='dark'?'fa-sun':'fa-moon'}"></i><span>${next==='dark'?'Light':'Dark'}</span>`;
      }
    });
  }

  function init() {
    if (!document.querySelector('.dm-unified-header')) {
      document.querySelectorAll('body > header:not(.dm-unified-header)').forEach(h => h.classList.add('dm-legacy-header-hidden'));
      document.body.insertAdjacentHTML('afterbegin', markup());
    }
    bindTheme(); update();
    if (window.DesiMallUI?.applyTheme) window.DesiMallUI.applyTheme(document.documentElement.dataset.theme || undefined);
    window.addEventListener('storage', update);
    window.addEventListener('desimall:wishlist-updated', update);
    window.addEventListener('desimall:cart-updated', update);
    window.addEventListener('desimall:notifications-updated', update);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
