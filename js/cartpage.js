document.addEventListener('DOMContentLoaded',()=>CartPageApp.init());

const CartPageApp={
  money:n=>`₹${Number(n||0).toLocaleString('en-IN')}`,
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  image(item){
    if(window.DesiMallProductImage)return DesiMallProductImage.resolve(item,'../assets/products/noimage.jpg');
    const src=String(item.ImageURL||item.Image||'').trim();
    return src ? (/^https?:/i.test(src)?src:`../${src.replace(/^\.\.\//,'')}`) : '../assets/products/noimage.jpg';
  },
  seller(item){return String(item.SellerName||item.ShopName||item.Seller||'DesiMall Seller').trim()||'DesiMall Seller';},

  init(){
    this.renderCart();
    this.updateUser();
    CartManager.updateCartBadge();
  },

  updateUser(){
    let u=null;
    try{u=JSON.parse(localStorage.getItem('desimall_user'));}catch{}
    const a=document.getElementById('userAuthLink');
    if(u&&a){
      const n=u.Name||u.FullName||u.name||'Profile';
      a.href='profile.html';
      a.innerHTML=`<i class="fa-solid fa-circle-user"></i><span>${this.esc(n.split(' ')[0])}</span>`;
    }
  },

  groupBySeller(cart){
    const map=new Map();
    cart.forEach(item=>{
      const name=this.seller(item);
      if(!map.has(name))map.set(name,[]);
      map.get(name).push(item);
    });
    return [...map.entries()];
  },

  renderCart(){
    const cart=CartManager.getCart().map(i=>CartManager.normalize(i));
    const main=document.getElementById('cartMainContainer');
    const empty=document.getElementById('emptyCartState');
    main?.classList.toggle('hidden',!cart.length);
    empty?.classList.toggle('hidden',!!cart.length);

    const count=document.getElementById('cartItemCount');
    if(count)count.textContent=cart.reduce((s,i)=>s+i.Qty,0);

    const list=document.getElementById('cartItemsList');
    if(list){
      list.innerHTML=this.groupBySeller(cart).map(([seller,items])=>`
        <section class="cart-seller-group">
          <header class="cart-seller-head">
            <div><i class="fa-solid fa-store"></i><span>Sold by</span><strong>${this.esc(seller)}</strong></div>
            <small>${items.length} ${items.length===1?'item':'items'}</small>
          </header>
          <div class="cart-seller-items">
            ${items.map(i=>this.itemCard(i)).join('')}
          </div>
        </section>
      `).join('');
    }

    this.renderSummary(cart);
    CartManager.updateCartBadge();
  },

  itemCard(i){
    const key=CartManager.lineKey(i);
    const stock=Number(i.Stock??0);
    return `<article class="cart-item-card">
      <a class="item-image-box" href="product.html?id=${encodeURIComponent(i.ProductID)}">
        <img src="${this.esc(this.image(i))}" alt="${this.esc(i.ProductName)}" onerror="this.src='../assets/products/noimage.jpg'">
      </a>
      <div class="item-details">
        <div>
          <span class="item-category">${this.esc(i.Category||'Product')}</span>
          ${i.IsTez || String(i.FulfilmentMode||'').toLowerCase()==='tez'
            ? '<span class="cart-tez-badge"><i class="fa-solid fa-bolt"></i> Tez</span>'
            : ''}
          <a class="item-title-link" href="product.html?id=${encodeURIComponent(i.ProductID)}"><h3 class="item-title">${this.esc(i.ProductName)}</h3></a>
          <div class="variant-meta">
            ${i.SelectedSize?`Size: <b>${this.esc(i.SelectedSize)}</b>`:''}
            ${i.SelectedColor?`${i.SelectedSize?' · ':''}Color: <b>${this.esc(i.SelectedColor)}</b>`:''}
          </div>
          <div class="item-price-row">
            <span class="item-price">${this.money(i.FinalPrice)}</span>
            ${i.Price>i.FinalPrice?`<span class="item-old-price">${this.money(i.Price)}</span><span class="item-discount">${Math.round((i.Price-i.FinalPrice)*100/i.Price)}% OFF</span>`:''}
          </div>
          ${stock>0&&stock<=5?`<small class="cart-low-stock">Only ${stock} left</small>`:''}
        </div>
        <div class="item-controls-row">
          <div class="qty-selector">
            <button class="qty-btn" aria-label="Decrease" onclick="CartPageApp.changeQty('${encodeURIComponent(key)}',-1)">−</button>
            <span class="qty-val">${i.Qty}</span>
            <button class="qty-btn" aria-label="Increase" onclick="CartPageApp.changeQty('${encodeURIComponent(key)}',1)">+</button>
          </div>
          <span class="item-total-price">${this.money(i.FinalPrice*i.Qty)}</span>
          <button class="btn-remove-item" onclick="CartPageApp.remove('${encodeURIComponent(key)}')"><i class="fa-regular fa-trash-can"></i> Remove</button>
        </div>
      </div>
    </article>`;
  },

  changeQty(encoded,delta){
    const key=decodeURIComponent(encoded);
    const item=CartManager.getCart().map(i=>CartManager.normalize(i)).find(i=>CartManager.lineKey(i)===key);
    if(!item)return;
    const stock=Number(item.Stock||10);
    const next=item.Qty+delta;
    if(delta>0&&stock>0&&next>stock){
      this.toast(`Only ${stock} in stock`);
      return;
    }
    CartManager.updateQty(key,next);
    this.renderCart();
  },

  remove(encoded){
    CartManager.remove(decodeURIComponent(encoded));
    this.toast('Item removed from cart');
    this.renderCart();
  },

  renderSummary(cart){
    const t=CartManager.totals(cart);
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set('summaryTotalItems',t.qty);
    set('summaryMRP',this.money(t.mrp));
    set('summaryDiscount',`- ${this.money(t.discount)}`);
    set('summaryGrandTotal',this.money(t.subtotal));
    set('summaryTotalSavings',this.money(t.discount));
    const delivery=document.getElementById('summaryDelivery');
    if(delivery)delivery.textContent='Calculated at checkout';
    const modes=new Set(cart.map(i=>
      (i.IsTez||String(i.FulfilmentMode||'').toLowerCase()==='tez')?'tez':'marketplace'
    ));
    let note=document.getElementById('cartFulfilmentNote');
    if(!note){
      note=document.createElement('div');
      note.id='cartFulfilmentNote';
      note.className='cart-fulfilment-note';
      document.querySelector('.cart-summary-card')?.prepend(note);
    }
    if(note){
      if(modes.size>1){
        note.innerHTML='<i class="fa-solid fa-circle-info"></i> Tez and standard items are kept in one cart, but this phase places them as separate checkouts.';
        note.classList.add('warning');
      }else if(modes.has('tez')){
        note.innerHTML='<i class="fa-solid fa-bolt"></i> Tez cart — delivery eligibility will be verified again at checkout.';
        note.classList.remove('warning');
      }else{
        note.innerHTML='<i class="fa-solid fa-truck"></i> Standard DesiMall delivery.';
        note.classList.remove('warning');
      }
    }

    const btn=document.getElementById('btnCheckout');
    if(btn){
      btn.disabled=!cart.length;
      btn.innerHTML=`Proceed to Checkout <span>${this.money(t.subtotal)}</span>`;
      btn.onclick=()=>location.href='checkout.html';
    }
  },

  toast(message){
    let el=document.getElementById('phase2Toast');
    if(!el){el=document.createElement('div');el.id='phase2Toast';el.className='toast';document.body.appendChild(el);}
    el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800);
  }
};
