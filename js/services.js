
const DesiMallServices={
  verticals:[],providers:[],selectedVertical:'',search:'',selectedProvider:null,selectedPackage:null,addresses:[],
  esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  money(v){return `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;},
  pincode(){return String(localStorage.getItem('desimall_delivery_pincode')||'').replace(/\D/g,'').slice(0,6);},
  toast(msg){serviceToast.textContent=msg;serviceToast.classList.add('show');clearTimeout(this.tt);this.tt=setTimeout(()=>serviceToast.classList.remove('show'),2600)},
  async init(){
    const pin=this.pincode();serviceLocation.textContent=pin?`Service at ${pin}`:'Select service location';
    serviceSearch.oninput=e=>{this.search=e.target.value.trim();clearTimeout(this.st);this.st=setTimeout(()=>this.loadProviders(),250)};
    closeProvider.onclick=()=>providerModal.classList.remove('open');closeBooking.onclick=()=>bookingModal.classList.remove('open');
    bookingForm.onsubmit=e=>{e.preventDefault();this.submitBooking()};
    bookingEmergency.onchange=()=>this.updateSummary();
    await this.loadVerticals();await this.loadProviders();
    try{this.addresses=await DesiMallAPI.getAddresses()}catch(_){this.addresses=[]}
  },
  async loadVerticals(){
    try{
      const r=await DesiMallAPI.getServiceVerticals();this.verticals=r.verticals||[];
      const quickCodes=['electrician','plumber','ac-hvac','cleaning','beauty-salon'];
      serviceQuick.innerHTML=quickCodes.map(code=>{
        const v=this.verticals.find(x=>x.Code===code);if(!v)return'';
        return `<button data-quick="${this.esc(v.Code)}"><i class="fa-solid ${this.esc(v.Icon)}"></i><span><b>${this.esc(v.Name)}</b><small>${this.esc(v.Description).slice(0,45)}</small></span></button>`;
      }).join('');
      serviceCategories.innerHTML=`<button class="sv-cat active" data-vertical=""><i class="fa-solid fa-border-all"></i><span>All Services</span></button>`+this.verticals.filter(x=>x.Code!=='custom').map(v=>`<button class="sv-cat" data-vertical="${this.esc(v.Code)}"><i class="fa-solid ${this.esc(v.Icon)}"></i><span>${this.esc(v.Name)}</span></button>`).join('');
      document.querySelectorAll('[data-vertical],[data-quick]').forEach(btn=>btn.onclick=()=>{
        this.selectedVertical=btn.dataset.vertical??btn.dataset.quick??'';
        document.querySelectorAll('[data-vertical]').forEach(x=>x.classList.toggle('active',(x.dataset.vertical||'')===this.selectedVertical));
        document.querySelectorAll('[data-quick]').forEach(x=>x.classList.toggle('active',(x.dataset.quick||'')===this.selectedVertical));
        const v=this.verticals.find(x=>x.Code===this.selectedVertical);providerHeading.textContent=v?`${v.Name} near you`:'Providers near you';this.loadProviders();
      });
    }catch(e){this.toast(e.message||'Could not load service categories')}
  },
  async loadProviders(){
    providerGrid.innerHTML='<div class="sv-empty" style="grid-column:1/-1"><div><i class="fa-solid fa-spinner fa-spin"></i><p>Finding service providers…</p></div></div>';
    try{
      const r=await DesiMallAPI.getServiceProviders(this.pincode(),this.selectedVertical,this.search);this.providers=r.providers||[];
      providerCount.textContent=`${this.providers.length} provider${this.providers.length===1?'':'s'}`;
      this.renderProviders();
    }catch(e){providerGrid.innerHTML=`<div class="sv-empty" style="grid-column:1/-1"><div><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load providers</h3><p>${this.esc(e.message||'Try again')}</p></div></div>`}
  },
  renderProviders(){
    providerGrid.innerHTML=this.providers.length?this.providers.map(p=>{
      const packages=p.Packages||[],from=packages.length?Math.min(...packages.map(x=>Number(x.BasePrice||0))):0;
      return `<article class="provider-card" onclick="DesiMallServices.openProvider('${this.esc(p.ProviderID)}')"><div class="provider-cover">${p.BannerURL?`<img src="${this.esc(p.BannerURL)}" onerror="this.remove()">`:''}<span class="provider-rating"><i class="fa-solid fa-star" style="color:#fbbf24"></i> ${Number(p.Rating||0).toFixed(1)} (${p.RatingCount||0})</span></div><div class="provider-body"><h3>${this.esc(p.BusinessName)}</h3><p>${this.esc(p.Tagline||'Local service professional')}</p><div class="provider-tags">${(p.Verticals||[]).slice(0,4).map(v=>`<span>${this.esc(v.Name)}</span>`).join('')}${p.EmergencyAvailable?'<span style="color:#fbbf24">Emergency</span>':''}${p.SameDayAvailable?'<span style="color:#4ade80">Same day</span>':''}</div><div class="provider-foot"><strong>${from?`Services from ${this.money(from)}`:'View services'}</strong><button>View & Book</button></div></div></article>`;
    }).join(''):`<div class="sv-empty" style="grid-column:1/-1"><div><i class="fa-solid fa-screwdriver-wrench"></i><h3>No provider found here yet</h3><p>Try another service category or delivery pincode.</p></div></div>`;
  },
  async openProvider(id){
    try{
      const r=await DesiMallAPI.getServiceProvider(id);this.selectedProvider=r.provider;this.providerPackages=r.packages||[];
      providerName.textContent=this.selectedProvider.BusinessName;providerMeta.textContent=`${this.selectedProvider.Tagline||''} · ⭐ ${Number(this.selectedProvider.Rating||0).toFixed(1)} · ${(r.verticals||[]).map(x=>x.Name).join(' • ')}`;
      const img=this.selectedProvider.BannerURL||'';providerHead.style.setProperty('--provider-image',img?`url("${img}")`:'none');providerHead.classList.toggle('no-photo',!img);
      packageGrid.innerHTML=this.providerPackages.length?this.providerPackages.map(x=>`<article class="service-package"><div><h3>${this.esc(x.Name)}</h3><p>${this.esc(x.Description||'Professional service from this provider.')}</p><div class="package-price">${x.PricingType==='starting_from'?'From ':x.PricingType==='inspection'?'Inspection ':''}${this.money(x.BasePrice)}</div><div class="package-meta"><span>${x.DurationMinutes} min</span><span>${this.esc(x.ServiceMode)}</span>${x.WarrantyDays?`<span>${x.WarrantyDays} day warranty</span>`:''}${x.VisitCharge?`<span>Visit ${this.money(x.VisitCharge)}</span>`:''}${x.EmergencyEligible?'<span style="color:#fbbf24">Emergency eligible</span>':''}</div></div><div class="package-side">${x.ImageURL?`<img src="${this.esc(x.ImageURL)}" onerror="this.style.visibility='hidden'">`:''}<button onclick="event.stopPropagation();DesiMallServices.openBooking('${this.esc(x.PackageID)}')">BOOK</button></div></article>`).join(''):'<div class="sv-empty" style="grid-column:1/-1"><div><h3>No public services yet</h3></div></div>';
      providerModal.classList.add('open');
    }catch(e){this.toast(e.message||'Could not load provider')}
  },
  async openBooking(id){
    this.selectedPackage=this.providerPackages.find(x=>String(x.PackageID)===String(id));if(!this.selectedPackage)return;
    try{if(!this.addresses.length)this.addresses=await DesiMallAPI.getAddresses()}catch(e){this.toast('Please login and add a service address first.');setTimeout(()=>location.href='address-book.html',900);return}
    bookingServiceName.textContent=this.selectedPackage.Name;bookingProviderName.textContent=this.selectedProvider.BusinessName;
    addressWrap.classList.toggle('hidden',this.selectedPackage.ServiceMode!=='home');
    bookingAddress.innerHTML=this.addresses.map(a=>`<option value="${this.esc(a.id||a.AddressID)}">${this.esc(a.name||a.Name||'Address')} · ${this.esc(a.address_line1||a.AddressLine1||'')} · ${this.esc(a.pincode||a.Pincode||'')}</option>`).join('');
    emergencyWrap.classList.toggle('hidden',!this.selectedPackage.EmergencyEligible);bookingEmergency.checked=false;
    const now=new Date(Date.now()+Math.max(60,Number(this.selectedProvider.MinLeadMinutes||60))*60000);bookingDate.min=new Date().toISOString().slice(0,10);bookingDate.max=new Date(Date.now()+Number(this.selectedProvider.MaxAdvanceDays||30)*86400000).toISOString().slice(0,10);bookingDate.value=now.toISOString().slice(0,10);bookingTime.value=`${String(now.getHours()).padStart(2,'0')}:${String(Math.ceil(now.getMinutes()/30)*30%60).padStart(2,'0')}`;
    document.querySelector('input[name=servicePay][value=cod]').disabled=!this.selectedProvider.AcceptsCOD;document.querySelector('input[name=servicePay][value=razorpay]').disabled=!this.selectedProvider.AcceptsOnline;
    const available=[...document.querySelectorAll('input[name=servicePay]')].find(x=>!x.disabled);if(available)available.checked=true;
    this.updateSummary();providerModal.classList.remove('open');bookingModal.classList.add('open');
  },
  updateSummary(){
    const base=Number(this.selectedPackage?.BasePrice||0),visit=Math.max(Number(this.selectedPackage?.VisitCharge||0),Number(this.selectedProvider?.BaseVisitCharge||0));sumBase.textContent=this.money(base);sumVisit.textContent=this.money(visit);sumEmergencyRow.classList.toggle('hidden',!bookingEmergency.checked);sumTotal.textContent=this.money(base+visit+(bookingEmergency.checked?Math.max(50,base*.15):0));
  },
  async submitBooking(){
    if(!this.selectedPackage)return;
    if(this.selectedPackage.ServiceMode==='home'&&!bookingAddress.value)return this.toast('Choose a service address.');
    const dt=new Date(`${bookingDate.value}T${bookingTime.value}:00`);if(!Number.isFinite(dt.getTime()))return this.toast('Choose a valid date and time.');
    const pay=document.querySelector('input[name=servicePay]:checked')?.value||'cod';bookingSubmit.disabled=true;bookingSubmit.textContent='Creating booking…';
    try{
      const r=await DesiMallAPI.createServiceBooking({PackageID:this.selectedPackage.PackageID,AddressID:this.selectedPackage.ServiceMode==='home'?bookingAddress.value:null,ScheduledStart:dt.toISOString(),CustomerNote:bookingNote.value.trim(),PaymentMethod:pay,Emergency:bookingEmergency.checked});
      if(!r.success)throw new Error(r.message||'Booking failed');
      const booking=r.booking;
      if(pay==='razorpay'){
        await this.payOnline(booking);
      }else{
        bookingModal.classList.remove('open');this.toast(`Booking ${booking.BookingCode} created`);setTimeout(()=>location.href='service-bookings.html',700);
      }
    }catch(e){this.toast(e.message||'Could not create booking')}
    finally{bookingSubmit.disabled=false;bookingSubmit.textContent='Confirm Booking'}
  },
  payOnline(booking){
    return new Promise(async(resolve,reject)=>{
      try{
        const o=await DesiMallAPI.createServiceRazorpayOrder(booking.BookingID);if(o.alreadyPaid){resolve();return location.href='service-bookings.html'}
        if(typeof Razorpay==='undefined')throw new Error('Payment checkout could not load.');
        const rz=new Razorpay({key:o.keyId,amount:o.amount,currency:o.currency||'INR',name:'DesiMall Services',description:booking.BookingCode,order_id:o.razorpayOrderId,handler:async(response)=>{
          try{
            await DesiMallAPI.verifyServiceRazorpayPayment(booking.BookingID,response);bookingModal.classList.remove('open');this.toast('Payment successful. Service booked.');setTimeout(()=>location.href='service-bookings.html',700);resolve();
          }catch(e){reject(e)}
        },modal:{ondismiss:()=>{this.toast('Payment not completed. Booking remains pending payment.');setTimeout(()=>location.href='service-bookings.html',900);resolve();}},theme:{color:'#ff6500'}});
        rz.open();
      }catch(e){reject(e)}
    });
  }
};
document.addEventListener('DOMContentLoaded',()=>DesiMallServices.init());
