document.addEventListener('DOMContentLoaded',()=>TezApp.init());

const TezApp={
  pincode:'',
  products:[],
  result:null,

  esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  money(v){return `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;},

  init(){
    CartManager?.updateCartBadge?.();
    DesiMallAuth?.updateHeader?.();

    const input=document.getElementById('tezPincode');
    const saved=this.detectSavedPincode();
    if(saved)input.value=saved;

    document.getElementById('btnCheckTez')?.addEventListener('click',()=>this.load());
    input?.addEventListener('keydown',e=>{if(e.key==='Enter')this.load();});

    if(saved)this.load();
  },

  detectSavedPincode(){
    const candidates=[];
    try{
      const user=JSON.parse(localStorage.getItem('desimall_user')||'null');
      if(user?.Pincode)candidates.push(user.Pincode);
      if(user?.pincode)candidates.push(user.pincode);
    }catch{}
    for(const key of ['desimall_delivery_pincode','delivery_pincode','pincode']){
      const value=localStorage.getItem(key);
      if(value)candidates.push(value);
    }
    return candidates.map(v=>String(v).replace(/\D/g,'')).find(v=>/^\d{6}$/.test(v))||'';
  },

  async load(){
    const input=document.getElementById('tezPincode');
    const pincode=String(input?.value||'').replace(/\D/g,'').slice(0,6);

    if(!/^\d{6}$/.test(pincode)){
      this.setMessage('Enter a valid 6-digit pincode.',true);
      return;
    }

    this.pincode=pincode;
    localStorage.setItem('desimall_delivery_pincode',pincode);
    this.showLoading(true);

    try{
      const result=await DesiMallAPI.getTezProducts(pincode);
      this.result=result;
      this.products=Array.isArray(result.products)?result.products:[];
      this.render();
    }catch(error){
      this.products=[];
      this.result=null;
      this.renderError(error);
    }finally{
      this.showLoading(false);
    }
  },

  showLoading(show){
    const loading=document.getElementById('tezLoading');
    const empty=document.getElementById('tezEmpty');

    loading?.classList.toggle('hidden',!show);

    if(show){
      empty?.classList.add('hidden');
      document.getElementById('tezProducts').innerHTML='';
    }
  },

  setMessage(message,warning=false){
    const el=document.getElementById('tezLocationMessage');
    if(el){
      el.textContent=message;
      el.style.color=warning?'#ffb27d':'';
    }
  },

  render(){
    const result=this.result||{};
    const zone=result.zone;
    const count=document.getElementById('tezProductCount');
    if(count)count.textContent=`${this.products.length} product${this.products.length===1?'':'s'}`;

    const status=document.getElementById('tezStatus');
    const empty=document.getElementById('tezEmpty');
    const grid=document.getElementById('tezProducts');

    status?.classList.remove('hidden','warning');

    if(result.available && zone){
      status.innerHTML=`<i class="fa-solid fa-bolt"></i> <strong>Tez available in ${this.esc(zone.name||zone.pincode)}</strong> · Typical target ${Number(zone.min_minutes||20)}–${Number(zone.max_minutes||45)} min`;
      this.setMessage(`Delivering to ${this.pincode}`);
    }else{
      status?.classList.add('warning');
      status.innerHTML=`<i class="fa-solid fa-location-dot"></i> Tez is not active for pincode <strong>${this.esc(this.pincode)}</strong> yet.`;
    }

    if(!this.products.length){
      empty?.classList.remove('hidden');
      if(empty){
        const messages={
          OUTSIDE_TEZ_ZONE:['Tez is not available here yet','Normal DesiMall shopping remains available for this pincode.'],
          NO_ACTIVE_TEZ_SELLERS:['Tez zone is ready, sellers are not active yet','We will only show Tez when a nearby seller is actually configured.'],
          NO_ELIGIBLE_PRODUCTS:['Tez seller coverage is ready','No products have been approved for Tez yet.'],
          NO_STOCK_AVAILABLE:['Tez products are temporarily unavailable','Eligible products will return when nearby stock is available.']
        };
        const msg=messages[result.reason]||['No Tez products available','Try again later or continue shopping on DesiMall.'];
        empty.innerHTML=`<i class="fa-solid fa-bolt"></i><h3>${msg[0]}</h3><p>${msg[1]}</p>`;
      }
      grid.innerHTML='';
      return;
    }

    empty?.classList.add('hidden');
    grid.innerHTML=this.products.map(p=>this.card(p)).join('');
  },

  card(p){
    const image=window.DesiMallProductImage
      ? DesiMallProductImage.resolve(p,'../assets/products/noimage.jpg')
      : (p.ImageURL||'../assets/products/noimage.jpg');
    const price=Number(p.FinalPrice||0);
    const mrp=Number(p.MRP||price);
    const etaMin=Number(p.TezMinMinutes||20);
    const etaMax=Number(p.TezMaxMinutes||45);
    const stock=Number(p.Stock||0);

    return `<article class="tez-product">
      <div class="tez-product-media">
        <span class="tez-badge"><i class="fa-solid fa-bolt"></i> Tez</span>
        <img src="${this.esc(image)}" alt="${this.esc(p.ProductName)}" onerror="this.src='../assets/products/noimage.jpg'">
      </div>
      <div class="tez-product-body">
        <h3>${this.esc(p.ProductName)}</h3>
        <div class="tez-seller"><i class="fa-solid fa-store"></i> ${this.esc(p.SellerName)}</div>
        <div class="tez-price"><strong>${this.money(price)}</strong>${mrp>price?`<del>${this.money(mrp)}</del>`:''}</div>
        <div class="tez-eta"><i class="fa-solid fa-bolt"></i> Target ${etaMin}–${etaMax} min</div>
        <div class="tez-product-actions">
          <a href="product.html?id=${encodeURIComponent(p.ProductID)}">View</a>
          <button type="button" ${stock<=0?'disabled':''} onclick="TezApp.add('${this.esc(p.ProductID)}')">Add +</button>
        </div>
      </div>
    </article>`;
  },

  add(productId){
    const p=this.products.find(x=>String(x.ProductID)===String(productId));
    if(!p)return;
    if(Number(p.Stock||0)<=0)return;

    const cart=CartManager.getCart();
    const normalized=CartManager.normalize({
      ...p,
      IsTez:true,
      FulfilmentMode:'tez',
      TezPincode:this.pincode
    });
    const key=CartManager.lineKey(normalized);
    const existing=cart.map(i=>CartManager.normalize(i)).find(i=>CartManager.lineKey(i)===key);

    if(existing){
      const max=Math.min(Number(p.TezMaxQty||5),Number(p.Stock||0));
      if(existing.Qty>=max){
        this.setMessage(`Maximum ${max} Tez quantity allowed for this item.`,true);
        return;
      }
      CartManager.updateQty(key,existing.Qty+1);
    }else{
      CartManager.add(normalized);
    }

    CartManager.updateCartBadge();
    this.setMessage(`${p.ProductName} added to cart.`);
  },

  renderError(error){
    const empty=document.getElementById('tezEmpty');
    const status=document.getElementById('tezStatus');
    status?.classList.remove('hidden');
    status?.classList.add('warning');

    const setup=error?.code==='TEZ_SETUP_REQUIRED';
    status.innerHTML=setup
      ? '<i class="fa-solid fa-database"></i> Tez database setup is required before launch.'
      : `<i class="fa-solid fa-triangle-exclamation"></i> ${this.esc(error?.message||'Could not load Tez right now.')}`;

    empty?.classList.remove('hidden');
    if(empty)empty.innerHTML='<i class="fa-solid fa-bolt"></i><h3>Tez is not available right now</h3><p>Normal DesiMall shopping is still available.</p>';
    document.getElementById('tezProducts').innerHTML='';
  }
};
