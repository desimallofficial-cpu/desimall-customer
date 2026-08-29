
const CustomerServiceBookings={
  bookings:[],filter:'',
  esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  money(v){return `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;},
  fmt(v){return v?new Date(v).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';},
  toast(m){serviceToast.textContent=m;serviceToast.classList.add('show');clearTimeout(this.tt);this.tt=setTimeout(()=>serviceToast.classList.remove('show'),2500)},
  async init(){
    document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('active',x===b));this.filter=b.dataset.status||'';this.render()});
    await this.load();
  },
  async load(){
    try{const r=await DesiMallAPI.getServiceBookings();this.bookings=r.bookings||[];this.render()}catch(e){customerBookingList.innerHTML=`<div class="sv-empty"><div><i class="fa-solid fa-lock"></i><h3>Login required</h3><p>${this.esc(e.message||'Please login')}</p></div></div>`}
  },
  rows(){return this.bookings.filter(b=>{if(!this.filter)return true;if(this.filter==='active')return !['completed','cancelled','rejected','no_show'].includes(b.Status);if(this.filter==='completed')return b.Status==='completed';if(this.filter==='cancelled')return ['cancelled','rejected','no_show'].includes(b.Status);return true})},
  render(){
    const rows=this.rows();customerBookingList.innerHTML=rows.length?rows.map(b=>{
      const canCancel=['requested','accepted','provider_on_way','arrived'].includes(b.Status);
      const canReview=b.Status==='completed';
      const addr=b.Address?`${b.Address.line1||''}, ${b.Address.city||''} ${b.Address.pincode||''}`:b.ServiceMode;
      return `<article class="booking-card"><div class="booking-card-top"><div><span class="status-pill ${this.esc(b.Status)}">${this.esc(b.Status.replaceAll('_',' '))}</span><h3>${this.esc(b.Package?.Name||'Service')}</h3><small>${this.esc(b.Provider?.BusinessName||'Provider')} · ${this.esc(b.BookingCode)}</small></div><div><small>Scheduled</small><h3>${this.fmt(b.ScheduledStart)}</h3><small>${this.esc(addr)}</small></div><div><small>Payment</small><h3>${this.money(b.TotalAmount)}</h3><small>${this.esc(b.PaymentMethod)} · ${this.esc(b.PaymentStatus)}</small></div><div class="booking-actions-customer">${canCancel?`<button onclick="CustomerServiceBookings.cancel('${this.esc(b.BookingID)}')">Cancel</button>`:''}${canReview?`<button onclick="CustomerServiceBookings.review('${this.esc(b.BookingID)}')">Rate Service</button>`:''}<button onclick="location.href='support.html'">Get Help</button></div></div><div class="booking-note">${this.statusNote(b)}</div></article>`;
    }).join(''):'<div class="sv-empty"><div><i class="fa-solid fa-calendar-check"></i><h3>No service bookings here</h3><p>Book a service to see it here.</p></div></div>';
  },
  statusNote(b){
    const m={requested:'Booking requested. Provider will accept or reject it.',accepted:'Provider accepted your booking.',provider_on_way:'Provider is on the way to your service location.',arrived:'Provider has arrived.',in_progress:'Service is currently in progress.',completed:'Service completed. You can rate your experience.',cancelled:'Booking cancelled.',rejected:'Provider could not accept this booking.',no_show:'Booking marked as no-show.'};return this.esc(m[b.Status]||b.Status);
  },
  async cancel(id){const reason=prompt('Why are you cancelling this service booking?')||'Cancelled by customer';if(!confirm('Cancel this service booking?'))return;try{await DesiMallAPI.cancelServiceBooking(id,reason);this.toast('Booking cancelled');await this.load()}catch(e){this.toast(e.message||'Could not cancel')}},
  async review(id){const rating=Number(prompt('Rate this service from 1 to 5:')||0);if(!Number.isInteger(rating)||rating<1||rating>5)return this.toast('Enter a rating from 1 to 5.');const text=prompt('Write a short review (optional):')||'';try{await DesiMallAPI.reviewServiceBooking(id,rating,text);this.toast('Thanks for your review');await this.load()}catch(e){this.toast(e.message||'Could not save review')}}
};
document.addEventListener('DOMContentLoaded',()=>CustomerServiceBookings.init());
