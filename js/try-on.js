
const DesiMallTryOn={
  products:[],sellers:[],bag:[],filter:'',search:'',addresses:[],availability:null,
  esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  money(v){return `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;},
  pincode(){return String(localStorage.getItem('desimall_delivery_pincode')||'').replace(/\D/g,'').slice(0,6);},
  toast(m){tryOnToast.textContent=m;tryOnToast.classList.add('show');clearTimeout(this.tt);this.tt=setTimeout(()=>tryOnToast.classList.remove('show'),2600)},
  sellerProfile(id){return this.sellers.find(x=>String(x.SellerID)===String(id))||null;},
  async init(){
    const pin=this.pincode();tryOnLocation.textContent=pin?`Try-On at ${pin}`:'Select Try-On location';
    tryOnSearch.oninput=e=>{this.search=e.target.value.trim().toLowerCase();this.renderProducts()};
    document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));
      this.filter=b.dataset.filter||'';this.renderProducts();
    });
    bookTryOn.onclick=()=>this.openBooking();
    closeTryOn.onclick=()=>tryOnModal.classList.remove('open');
    tryOnForm.onsubmit=e=>{e.preventDefault();this.submit()};
    tryOnDate.onchange=()=>this.renderTimes();
    await this.load();
  },
  async load(){
    try{
      const r=await DesiMallAPI.getTryOnProducts(this.pincode());
      this.products=r.products||[];this.sellers=r.sellers||[];
      const wanted=new URLSearchParams(location.search).get('product');
      if(wanted){
        const p=this.products.find(x=>String(x.ProductID)===String(wanted));
        if(p)this.add(p.ProductID,true);
      }
      this.renderProducts();this.renderBag();
    }catch(e){
      tryOnProducts.innerHTML=`<div class="to-empty"><div><i class="fa-solid fa-triangle-exclamation"></i><h3>Try-On could not load</h3><p>${this.esc(e.message||'Please try again.')}</p></div></div>`;
    }
  },
  filtered(){
    return this.products.filter(p=>{
      const hay=`${p.ProductName} ${p.Description||''} ${p.Gender||''} ${p.Category||''}`.toLowerCase();
      if(this.search&&!hay.includes(this.search))return false;
      if(!this.filter)return true;
      if(this.filter==='footwear')return /foot|shoe|sandal|slipper/.test(hay);
      return hay.includes(this.filter);
    });
  },
  renderProducts(){
    const rows=this.filtered();
    tryOnProducts.innerHTML=rows.length?rows.map(p=>{
      const added=this.bag.some(x=>String(x.ProductID)===String(p.ProductID));
      return `<article class="to-product"><div class="to-product-img"><img src="${this.esc(p.ImageURL||'../assets/products/noimage.jpg')}" onerror="this.src='../assets/products/noimage.jpg'"><span class="to-live-tag">TRY-ON</span></div><div class="to-product-body"><h3>${this.esc(p.ProductName)}</h3><p>${this.esc(p.SellerName||'Seller')}</p><div class="to-meta">${p.Gender?`<span>${this.esc(p.Gender)}</span>`:''}${p.Size?`<span>Size ${this.esc(p.Size)}</span>`:''}${p.Color?`<span>${this.esc(p.Color)}</span>`:''}<span>Stock ${Number(p.StockAvailable||0)}</span></div><div class="to-price"><strong>${this.money(p.FinalPrice)}</strong><button class="${added?'added':''}" onclick="DesiMallTryOn.${added?'remove':'add'}('${this.esc(p.ProductID)}')">${added?'✓ Added':'ADD TO TRY'}</button></div></div></article>`;
    }).join(''):`<div class="to-empty"><div><i class="fa-solid fa-shirt"></i><h3>No Try-On products here yet</h3><p>Try another search or delivery pincode.</p></div></div>`;
  },
  add(id,silent=false){
    const p=this.products.find(x=>String(x.ProductID)===String(id));if(!p)return;
    if(this.bag.some(x=>String(x.ProductID)===String(id)))return;
    if(this.bag.length&&String(this.bag[0].SellerID)!==String(p.SellerID)){
      return this.toast('One Try-On visit can contain products from only one seller.');
    }
    const profile=this.sellerProfile(p.SellerID);
    const max=Number(profile?.MaxItems||p.MaxItems||4);
    if(this.bag.length>=max)return this.toast(`This seller allows maximum ${max} items per Try-On visit.`);
    this.bag.push(p);this.renderBag();this.renderProducts();
    if(!silent)this.toast('Added to Try Bag');
  },
  remove(id){
    this.bag=this.bag.filter(x=>String(x.ProductID)!==String(id));this.renderBag();this.renderProducts();
  },
  renderBag(){
    tryBagCount.textContent=this.bag.length;
    tryBagItems.innerHTML=this.bag.length?this.bag.map(p=>`<div class="to-bag-item"><img src="${this.esc(p.ImageURL||'../assets/products/noimage.jpg')}" onerror="this.src='../assets/products/noimage.jpg'"><div><b>${this.esc(p.ProductName)}</b><small>${this.money(p.FinalPrice)} · ${this.esc(p.SellerName)}</small></div><button onclick="DesiMallTryOn.remove('${this.esc(p.ProductID)}')"><i class="fa-solid fa-xmark"></i></button></div>`).join(''):'<div class="to-bag-empty"><i class="fa-solid fa-shirt" style="font-size:25px"></i><p>Add products you want to try at home.</p></div>';
    const value=this.bag.reduce((n,p)=>n+Number(p.FinalPrice||0),0);
    const profile=this.bag.length?this.sellerProfile(this.bag[0].SellerID):null;
    const fee=Number(profile?.VisitFee||0);
    tryBagValue.textContent=this.money(value);tryVisitFee.textContent=this.money(fee);tryEstimated.textContent=this.money(value+fee);
    bookTryOn.disabled=!this.bag.length;
  },
  async openBooking(){
    if(!this.bag.length)return;
    try{
      if(!this.addresses.length)this.addresses=await DesiMallAPI.getAddresses();
      if(!this.addresses.length){this.toast('Add a delivery address first.');return setTimeout(()=>location.href='address-book.html',700)}
    }catch(e){this.toast('Please login and add an address first.');return setTimeout(()=>location.href='login.html',700)}
    const profile=this.sellerProfile(this.bag[0].SellerID);
    const allowedPins=new Set((profile?.ServicePincodes||[]).map(String));
    const matching=this.addresses.filter(a=>{
      const pin=String(a.pincode||a.Pincode||'').replace(/\D/g,'').slice(0,6);
      return !allowedPins.size||allowedPins.has(pin);
    });
    if(!matching.length){
      this.toast('None of your saved addresses is inside this seller’s Try-On service area.');
      return setTimeout(()=>location.href='address-book.html',900);
    }
    tryOnAddress.innerHTML=matching.map(a=>{
      const id=a.id||a.AddressID, line=a.line1||a.address_line1||a.AddressLine1||'',pin=a.pincode||a.Pincode||'';
      return `<option value="${this.esc(id)}">${this.esc(a.label||a.Label||a.recipient_name||a.Name||'Address')} · ${this.esc(line)} · ${this.esc(pin)}</option>`;
    }).join('');
    tryOnDate.innerHTML='<option>Loading dates…</option>';tryOnTime.innerHTML='<option>Loading slots…</option>';
    tryOnModal.classList.add('open');
    try{
      const sellerId=this.bag[0].SellerID;
      const r=await DesiMallAPI.getTryOnAvailability(sellerId);this.availability=r;
      const dates=r.dates||[];
      tryOnDate.innerHTML=dates.length?dates.map(x=>`<option value="${this.esc(x.date)}">${new Date(`${x.date}T12:00:00`).toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short'})}</option>`).join(''):'<option value="">No available date</option>';
      tryOnRange.textContent=dates.length?`Booking range: ${r.minDate} to ${r.maxDate} · ${dates.length} day(s) currently have free slots.`:'No free Try-On slots are available in this seller’s booking window.';
      this.renderTimes();
    }catch(e){tryOnRange.textContent=e.message||'Could not load available slots.';tryOnDate.innerHTML='<option value="">No dates</option>';tryOnTime.innerHTML='<option value="">No slots</option>'}
  },
  renderTimes(){
    const d=this.availability?.dates?.find(x=>x.date===tryOnDate.value);
    const slots=d?.slots||[];
    tryOnTime.innerHTML=slots.length?slots.map(x=>`<option value="${this.esc(x)}">${new Date(`2000-01-01T${x}:00`).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</option>`).join(''):'<option value="">No slots</option>';
  },
  async submit(){
    if(!tryOnAddress.value||!tryOnDate.value||!tryOnTime.value)return this.toast('Choose address, available date and time.');
    tryOnSubmit.disabled=true;tryOnSubmit.textContent='Booking Try-On…';
    try{
      const r=await DesiMallAPI.createTryOnOrder({
        AddressID:tryOnAddress.value,
        ProductIDs:this.bag.map(x=>x.ProductID),
        ScheduledDate:tryOnDate.value,
        ScheduledTime:tryOnTime.value,
        CustomerNote:tryOnNote.value.trim()
      });
      if(!r.success)throw new Error(r.message||'Could not book Try-On');
      this.bag=[];this.renderBag();tryOnModal.classList.remove('open');this.toast(`Try-On ${r.order?.OrderID||''} booked`);
      setTimeout(()=>location.href='try-on-orders.html',700);
    }catch(e){this.toast(e.message||'Could not book Try-On')}
    finally{tryOnSubmit.disabled=false;tryOnSubmit.textContent='Confirm Try-On Visit'}
  }
};
document.addEventListener('DOMContentLoaded',()=>DesiMallTryOn.init());
