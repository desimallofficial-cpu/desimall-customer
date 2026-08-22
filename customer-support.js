const CustomerSupport={
tickets:[],selected:'',
token(){return DesiMallAuth.getAccessToken?.()||''},
esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
date(v){const d=new Date(v);return isNaN(d)?'—':d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});},
async init(){
 if(!DesiMallAuth.requireAuth('login.html'))return;
 refreshCustomerSupport.onclick=()=>this.load();
 newCustomerTicket.onclick=()=>customerTicketModal.classList.add('show');
 closeCustomerTicket.onclick=()=>customerTicketModal.classList.remove('show');
 customerTicketForm.onsubmit=e=>{e.preventDefault();this.create()};
 await DesiMallAuth.refreshIfNeeded?.(false);await this.load();
},
async load(){const r=await DesiMallAPI.getCustomerSupport(this.token());if(!r.success){customerTicketList.innerHTML=`<div class="support-empty">${this.esc(r.message||'Could not load support.')}</div>`;return;}this.tickets=r.tickets||[];this.render();if(this.selected&&this.tickets.some(x=>x.TicketID===this.selected))this.open(this.selected,true);},
render(){customerTicketList.innerHTML=this.tickets.length?this.tickets.map(t=>`<article class="ticket-item ${this.selected===t.TicketID?'active':''}" onclick="CustomerSupport.open('${this.esc(t.TicketID)}')"><div class="ticket-row"><strong>${this.esc(t.TicketID)}</strong><span class="ticket-badge status-${String(t.Status).replaceAll(' ','-')}">${this.esc(t.Status)}</span></div><h3>${this.esc(t.Subject)}</h3><div class="ticket-meta"><span>${this.esc(t.Category)}</span><span>${this.date(t.UpdatedAt)}</span></div></article>`).join(''):'<div class="support-empty"><i class="fa-solid fa-ticket"></i><strong>No tickets yet</strong><span>Create a ticket when you need help.</span></div>';},
async open(id,skip=false){this.selected=id;this.render();const t=this.tickets.find(x=>x.TicketID===id);if(!t)return;customerTicketDetail.className='';customerTicketDetail.innerHTML=`<div class="ticket-detail-head"><div><h2>${this.esc(t.Subject)}</h2><div class="ticket-meta"><strong>${this.esc(t.TicketID)}</strong><span>${this.esc(t.Category)}</span></div></div><span class="ticket-badge status-${String(t.Status).replaceAll(' ','-')}">${this.esc(t.Status)}</span></div><div class="ticket-description">${this.esc(t.Description)}</div><div class="support-chat">${(t.Replies||[]).map(r=>`<div class="chat-message ${r.SenderType==='Customer'?'seller':'admin'}"><strong>${this.esc(r.SenderName||r.SenderType)}</strong><div>${this.esc(r.Message)}</div><small>${this.date(r.CreatedAt)}</small></div>`).join('')}</div>${t.Status==='Closed'?'':`<form onsubmit="event.preventDefault();CustomerSupport.reply()"><div class="chat-tools"><textarea id="customerReply" required placeholder="Write a reply..."></textarea><button class="cs-btn primary">Send</button></div></form>`}`;if(!skip&&t.LastReplyBy==='Admin'&&!t.RequesterSeenAt){await DesiMallAPI.markCustomerSupportSeen(id,this.token());t.RequesterSeenAt=new Date().toISOString();}},
async create(){const r=await DesiMallAPI.createCustomerSupportTicket({Category:customerCategory.value,Priority:customerPriority.value,RelatedOrderCode:customerOrderCode.value,RelatedReturnCode:customerReturnCode.value,Subject:customerSubject.value,Description:customerDescription.value},this.token());if(!r.success){alert(r.message||'Ticket failed.');return;}customerTicketForm.reset();customerTicketModal.classList.remove('show');this.selected=r.ticketId;await this.load();},
async reply(){const r=await DesiMallAPI.customerSupportReply({TicketID:this.selected,Message:customerReply.value},this.token());if(!r.success){alert(r.message||'Reply failed.');return;}await this.load();}
};
document.addEventListener('DOMContentLoaded',()=>CustomerSupport.init());