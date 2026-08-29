
const DesiMallFood = {
  restaurants:[],
  current:null,
  menu:[],
  type:'',
  category:'all',
  search:'',

  esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  money(v){return `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;},
  image(v){return String(v||'').trim() || '../assets/products/noimage.jpg';},
  pincode(){return String(localStorage.getItem('desimall_delivery_pincode')||'').replace(/\D/g,'').slice(0,6);},

  async init(){
    CartManager.updateCartBadge();
    const p=this.pincode();
    document.getElementById('foodLocation').textContent=p?`Deliver to ${p}`:'Select delivery location';

    document.querySelectorAll('[data-food-type]').forEach(btn=>{
      btn.onclick=()=>{
        document.querySelectorAll('[data-food-type]').forEach(x=>x.classList.toggle('active',x===btn));
        this.type=btn.dataset.foodType||'';
        this.loadRestaurants();
      };
    });

    document.getElementById('foodSearch').addEventListener('input',e=>{
      this.search=String(e.target.value||'').trim().toLowerCase();
      this.renderRestaurants();
      this.renderMenu();
    });
    document.getElementById('onlyAvailable').addEventListener('change',()=>this.renderMenu());

    await this.loadRestaurants();
  },

  async loadRestaurants(){
    const list=document.getElementById('restaurantList');
    list.innerHTML='<div class="food-empty" style="min-height:220px"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading restaurants…</p></div>';
    try{
      this.restaurants=await DesiMallAPI.getFoodRestaurants(this.pincode(),this.type);
      if(this.current && !this.restaurants.some(r=>String(r.RestaurantID)===String(this.current.RestaurantID))){
        this.current=null;this.menu=[];
      }
      this.renderRestaurants();
      if(!this.current && this.restaurants[0]) await this.openRestaurant(this.restaurants[0].RestaurantID);
    }catch(error){
      console.error(error);
      list.innerHTML=`<div class="food-empty" style="min-height:220px"><i class="fa-solid fa-triangle-exclamation"></i><p>${this.esc(error.message||'Could not load restaurants')}</p></div>`;
    }
  },

  renderRestaurants(){
    const q=this.search;
    const rows=this.restaurants.filter(r=>!q || `${r.Name} ${(r.CuisineTags||[]).join(' ')}`.toLowerCase().includes(q));
    document.getElementById('restaurantCount').textContent=`${rows.length} open`;
    document.getElementById('restaurantList').innerHTML=rows.length?rows.map(r=>`
      <button class="restaurant-card ${this.current?.RestaurantID===r.RestaurantID?'active':''}" onclick="DesiMallFood.openRestaurant('${this.esc(r.RestaurantID)}')">
        <img src="${this.esc(this.image(r.ImageURL))}" onerror="this.src='../assets/products/noimage.jpg'">
        <div>
          <h3>${this.esc(r.Name)}</h3>
          <p>${this.esc((r.CuisineTags||[]).join(' • ')||'Restaurant')}</p>
          <div class="restaurant-meta">
            <span><i class="fa-regular fa-clock"></i> ${r.PrepMinMinutes}-${r.PrepMaxMinutes} min</span>
            <span>Min ${this.money(r.MinOrder)}</span>
            <span>${r.DeliveryFee?this.money(r.DeliveryFee)+' delivery':'Free delivery'}</span>
          </div>
        </div>
      </button>
    `).join(''):`<div class="food-empty" style="min-height:250px"><i class="fa-solid fa-store-slash"></i><h3>No restaurants found</h3><p>Try another food filter or delivery pincode.</p></div>`;
  },

  async openRestaurant(id){
    try{
      const result=await DesiMallAPI.getFoodMenu(id);
      this.current=result.restaurant;
      this.menu=Array.isArray(result.items)?result.items:[];
      this.category='all';
      this.renderRestaurants();
      this.renderRestaurantHero();
      this.renderCategories();
      this.renderMenu();
      document.getElementById('menuEmpty').classList.add('hidden');
      document.getElementById('menuView').classList.remove('hidden');
    }catch(error){this.toast(error.message||'Could not load menu');}
  },

  renderRestaurantHero(){
    const r=this.current;if(!r)return;
    const hero=document.getElementById('restaurantHero');
    hero.style.setProperty('--restaurant-image',`url("${this.image(r.ImageURL)}")`);
    hero.innerHTML=`<div><h2>${this.esc(r.Name)}</h2><p>${this.esc((r.CuisineTags||[]).join(' • '))}</p><div class="hero-pills"><span>${r.PrepMinMinutes}-${r.PrepMaxMinutes} min</span><span>Min order ${this.money(r.MinOrder)}</span><span>${r.DeliveryFee?this.money(r.DeliveryFee)+' delivery':'Free delivery'}</span></div></div>`;
  },

  renderCategories(){
    const cats=['all',...new Set(this.menu.map(x=>x.MenuCategory||'Other'))];
    document.getElementById('menuCategories').innerHTML=cats.map(c=>`<button class="${this.category===c?'active':''}" onclick="DesiMallFood.setCategory('${this.esc(c)}')">${this.esc(c==='all'?'All':c)}</button>`).join('');
  },

  setCategory(c){this.category=c;this.renderCategories();this.renderMenu();},

  renderMenu(){
    if(!this.current)return;
    const only=document.getElementById('onlyAvailable').checked;
    const q=this.search;
    const rows=this.menu.filter(i=>{
      if(this.type && i.FoodType!==this.type)return false;
      if(this.category!=='all' && i.MenuCategory!==this.category)return false;
      if(only && !i.IsAvailable)return false;
      if(q && !`${i.ProductName} ${i.Description} ${i.MenuCategory}`.toLowerCase().includes(q))return false;
      return true;
    });
    document.getElementById('menuItems').innerHTML=rows.length?rows.map(i=>`
      <article class="menu-item">
        <div>
          <div class="menu-badges">
            <span class="${i.FoodType==='veg'||i.FoodType==='vegan'?'veg':i.FoodType==='nonveg'?'nonveg':'egg'}">${this.typeLabel(i.FoodType)}</span>
            ${i.IsBestseller?'<span class="best"><i class="fa-solid fa-fire"></i> Bestseller</span>':''}
            <span>${this.esc(i.MenuCategory)}</span>
            ${i.SpiceLevel && i.SpiceLevel!=='none'?`<span>${this.esc(i.SpiceLevel)} spice</span>`:''}
          </div>
          <h3>${this.esc(i.ProductName)}</h3>
          <p>${this.esc(i.Description||'Freshly prepared after you order.')}</p>
          <div class="menu-price">${this.money(i.FinalPrice)}</div>
        </div>
        <div class="menu-photo">
          <img src="${this.esc(this.image(i.ImageURL))}" onerror="this.src='../assets/products/noimage.jpg'">
          <button ${!i.IsAvailable?'disabled':''} onclick="DesiMallFood.add('${this.esc(i.ProductID)}')">${i.IsAvailable?'ADD':'SOLD OUT'}</button>
        </div>
      </article>
    `).join(''):`<div class="food-empty" style="min-height:260px;grid-column:1/-1"><i class="fa-solid fa-bowl-rice"></i><h3>No dishes here</h3><p>Try another category or food type.</p></div>`;
  },

  typeLabel(t){return ({veg:'🟢 Veg',nonveg:'🔴 Non-Veg',egg:'🟡 Egg',vegan:'🌿 Vegan'})[t]||t;},

  add(productId){
    const item=this.menu.find(x=>String(x.ProductID)===String(productId));
    if(!item||!item.IsAvailable)return;

    const existing=CartManager.getCart().map(x=>CartManager.normalize(x));
    const incompatible=existing.some(x=>{
      const mode=String(x.FulfillmentMode||x.FulfilmentMode||'marketplace').toLowerCase();
      if(mode!=='food')return true;
      return x.RestaurantID && String(x.RestaurantID)!==String(this.current.RestaurantID);
    });
    if(incompatible){
      if(!confirm('Your cart has another delivery service or restaurant. Clear it and start this Food order?'))return;
      CartManager.saveCart([]);
    }

    CartManager.addToCart({
      ProductID:item.ProductID,
      ProductName:item.ProductName,
      Price:item.MRP || item.FinalPrice,
      FinalPrice:item.FinalPrice,
      ImageURL:item.ImageURL,
      SellerID:this.current.SellerID,
      SellerName:this.current.Name,
      ShopName:this.current.Name,
      Stock:item.AvailableQty,
      Category:'Food',
      FulfillmentMode:'food',
      FulfilmentMode:'food',
      IsFood:true,
      RestaurantID:this.current.RestaurantID,
      FoodType:item.FoodType,
      MenuCategory:item.MenuCategory,
      FoodDeliveryFee:Number(this.current.DeliveryFee||0)
    },1);
    this.toast(`${item.ProductName} added to Food cart`);
  },

  toast(msg){const el=document.getElementById('foodToast');el.textContent=msg;el.classList.add('show');clearTimeout(this.tt);this.tt=setTimeout(()=>el.classList.remove('show'),2200);}
};
document.addEventListener('DOMContentLoaded',()=>DesiMallFood.init());
