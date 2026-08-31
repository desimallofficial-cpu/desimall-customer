
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
    bookingDate.onchange=()=>this.loadSlots(bookingDate.value);
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
    bookingDate.innerHTML='<option value="">Loading available dates…</option>';bookingDate.disabled=true;bookingTime.innerHTML='<option value="">Choose date first</option>';bookingTime.disabled=true;bookingDateRange.textContent='';bookingSlotHelp.textContent='';
    await this.loadAvailableDates();
    document.querySelector('input[name=servicePay][value=cod]').disabled=!this.selectedProvider.AcceptsCOD;document.querySelector('input[name=servicePay][value=razorpay]').disabled=!this.selectedProvider.AcceptsOnline;
    const available=[...document.querySelectorAll('input[name=servicePay]')].find(x=>!x.disabled);if(available)available.checked=true;
    this.updateSummary();providerModal.classList.remove('open');bookingModal.classList.add('open');
  },
  dateLabel(dateStr){
    const d=new Date(`${dateStr}T12:00:00Z`);return d.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  },
  async loadAvailableDates(){
    try{
      const r=await DesiMallAPI.getServiceAvailability(this.selectedProvider.ProviderID,this.selectedPackage.PackageID);
      const dates=r.dates||[];bookingDate.disabled=false;
      bookingDateRange.textContent=r.range?`Booking range: ${this.dateLabel(r.range.MinDate)} to ${this.dateLabel(r.range.MaxDate)} (${r.range.AdvanceDays} days advance)`:'';
      bookingDate.innerHTML=dates.length?'<option value="">Choose available date</option>'+dates.map(x=>`<option value="${this.esc(x.Date)}">${this.esc(this.dateLabel(x.Date))} · ${x.SlotCount} slot${x.SlotCount===1?'':'s'}</option>`).join(''):'<option value="">No bookable dates in current range</option>';
      if(dates.length){bookingDate.value=dates[0].Date;await this.loadSlots(dates[0].Date)}else{bookingTime.innerHTML='<option value="">No slots available</option>';bookingTime.disabled=true;bookingSlotHelp.textContent='Provider may be closed, on leave, or fully booked in this date range.'}
    }catch(e){bookingDate.innerHTML='<option value="">Could not load dates</option>';bookingDate.disabled=true;this.toast(e.message||'Could not load available dates')}
  },
  async loadSlots(date){
    if(!date){bookingTime.innerHTML='<option value="">Choose date first</option>';bookingTime.disabled=true;return;}
    bookingTime.innerHTML='<option value="">Loading slots…</option>';bookingTime.disabled=true;
    try{
      const r=await DesiMallAPI.getServiceAvailability(this.selectedProvider.ProviderID,this.selectedPackage.PackageID,date);const slots=r.slots||[];
      bookingTime.disabled=false;bookingTime.innerHTML=slots.length?'<option value="">Choose available time</option>'+slots.map(x=>`<option value="${this.esc(x)}">${this.esc(this.timeLabel(x))}</option>`).join(''):'<option value="">No slots available</option>';bookingSlotHelp.textContent=slots.length?`${slots.length} available slot${slots.length===1?'':'s'} on ${this.dateLabel(date)}.`:'This date is closed, blocked or fully booked. Choose another available date.';
    }catch(e){bookingTime.innerHTML='<option value="">Could not load slots</option>';bookingTime.disabled=true;this.toast(e.message||'Could not load slots')}
  },
  timeLabel(hm){const [h,m]=String(hm).split(':').map(Number);const d=new Date(Date.UTC(2000,0,1,h,m));return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'UTC'});},
  updateSummary(){
    const base=Number(this.selectedPackage?.BasePrice||0),visit=Math.max(Number(this.selectedPackage?.VisitCharge||0),Number(this.selectedProvider?.BaseVisitCharge||0));sumBase.textContent=this.money(base);sumVisit.textContent=this.money(visit);sumEmergencyRow.classList.toggle('hidden',!bookingEmergency.checked);sumTotal.textContent=this.money(base+visit+(bookingEmergency.checked?Math.max(50,base*.15):0));
  },
  async submitBooking(){
    if(!this.selectedPackage)return;
    if(this.selectedPackage.ServiceMode==='home'&&!bookingAddress.value)return this.toast('Choose a service address.');
    if(!bookingDate.value||!bookingTime.value)return this.toast('Choose an available date and time.');
    const pay=document.querySelector('input[name=servicePay]:checked')?.value||'cod';bookingSubmit.disabled=true;bookingSubmit.textContent='Creating booking…';
    try{
      const r=await DesiMallAPI.createServiceBooking({PackageID:this.selectedPackage.PackageID,AddressID:this.selectedPackage.ServiceMode==='home'?bookingAddress.value:null,ScheduledDate:bookingDate.value,ScheduledTime:bookingTime.value,CustomerNote:bookingNote.value.trim(),PaymentMethod:pay,Emergency:bookingEmergency.checked});
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
