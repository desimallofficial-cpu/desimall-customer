
const TryOnOrders={
  rows:[],
  esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  money(v){return `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;},
  fmt(v){return v?new Date(v).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';},
  toast(m){tryOnToast.textContent=m;tryOnToast.classList.add('show');clearTimeout(this.tt);this.tt=setTimeout(()=>tryOnToast.classList.remove('show'),2500)},
  async init(){await this.load()},
  async load(){
    try{const r=await DesiMallAPI.getTryOnOrders();this.rows=r.orders||[];this.render()}
    catch(e){tryOnOrderList.innerHTML=`<div class="to-empty"><div><i class="fa-solid fa-lock"></i><h3>Login required</h3><p>${this.esc(e.message||'Please login')}</p></div></div>`}
  },
  render(){
    tryOnOrderList.innerHTML=this.rows.length?this.rows.map(o=>{
      const cancel=['requested','accepted','preparing','ready'].includes(o.Status);
      const final=o.Status==='completed'?this.money(o.FinalAmount):`Up to ${this.money((o.Items||[]).reduce((n,x)=>n+Number(x.OriginalAmount||0),0)+Number(o.VisitFee||0))}`;
      return `<article class="to-order"><div class="to-order-top"><div><span class="to-status ${this.esc(o.Status)}">${this.esc(o.Status.replaceAll('_',' '))}</span><h3>${this.esc(o.OrderID)}</h3><small>${this.esc(o.SellerName)} · ${o.Items?.length||0} item(s)</small></div><div><small>Visit time</small><h3>${this.fmt(o.ScheduledStart)}</h3><small>${this.esc(o.Address?.Pincode||'')}</small></div><div><small>${o.Status==='completed'?'Final paid':'Maximum payable'}</small><h3>${final}</h3><small>Visit fee ${this.money(o.VisitFee)}</small></div><div>${cancel?`<button onclick="TryOnOrders.cancel('${this.esc(o.OrderID)}')">Cancel Visit</button>`:''}</div></div>${o.DeliveryOTP?`<div style="margin:0 14px 10px;padding:11px;border:1px solid #7c3d12;border-radius:9px;background:#24170f"><small style="color:#fdba74">RIDER VERIFICATION OTP</small><strong style="display:block;font-size:22px;letter-spacing:5px;margin-top:4px">${this.esc(o.DeliveryOTP)}</strong><small>Share this OTP only after the rider arrives and you have finished choosing Keep / Return.</small></div>`:''}<div class="to-order-items">${(o.Items||[]).map(x=>`<span>${this.esc(x.ProductName)}${x.Decision?` · ${x.Decision==='keep'?'KEPT':'RETURNED'}`:''}</span>`).join('')}</div></article>`;
    }).join(''):`<div class="to-empty"><div><i class="fa-solid fa-shirt"></i><h3>No Try-On visits yet</h3><p>Choose eligible products and book your first home fitting.</p></div></div>`;
  },
  async cancel(ref){
    if(!confirm('Cancel this Try-On visit?'))return;
    const reason=prompt('Cancellation reason:','Plans changed')||'Cancelled by customer';
    try{const r=await DesiMallAPI.cancelTryOnOrder(ref,reason);if(!r.success)throw new Error(r.message||'Cancel failed');this.toast('Try-On visit cancelled');await this.load()}catch(e){this.toast(e.message||'Could not cancel')}
  }
};
document.addEventListener('DOMContentLoaded',()=>TryOnOrders.init());
