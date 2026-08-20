document.addEventListener('DOMContentLoaded',()=>ProductDetailsApp.init());

const ProductDetailsApp={
  state:{product:null,products:[],qty:1,size:'',color:''},

  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  money:n=>`₹${Number(n||0).toLocaleString('en-IN')}`,
  bool(v){return v===true||['true','1','yes','active'].includes(String(v||'').toLowerCase())},
  image(p){
    const src=String(p.ImageURL||p.Image||p.ProductImage||'').trim();
    if(!src)return'../assets/products/noimage.jpg';
    return /^https?:/i.test(src)?src:`../${src.replace(/^\.\.\//,'')}`;
  },
  seller(p){return p.Seller||p.SellerName||p.ShopName||p.seller_name||'DesiMall Seller';},
  isTez(p){return this.bool(p.IsTez??p.TezEligible??p.FastDeliveryEligible??p.MinutesEligible)},
  isTryOn(p){return this.bool(p.IsTryOn??p.TryOnEligible??p.TryAtHomeEligible)},

  parseList(v){
    if(Array.isArray(v))return v.map(x=>String(x).trim()).filter(Boolean);
    if(v&&typeof v==='object')return Object.keys(v);
    return String(v||'').split(/[,|]/).map(x=>x.trim()).filter(Boolean);
  },

  async init(){
    CartManager?.updateCartBadge();
    WishlistManager?.updateWishlistBadge();

    const id=new URLSearchParams(location.search).get('id');
    if(!id)return this.error('Product ID missing.');

    try{this.state.products=await DesiMallAPI.getProducts();}catch{}
    this.state.product=this.state.products.find(p=>String(p.ProductID||p.ID)===String(id));
    if(!this.state.product)return this.error('Product not found.');

    this.render();
    this.bind();
    this.related();
    this.updateUser();
    this.updateLocation();
    if(window.ReviewManager)ReviewManager.init(this.state.product);
  },

  updateUser(){
    let u;try{u=JSON.parse(localStorage.getItem('desimall_user'));}catch{}
    const a=document.getElementById('userAuthLink');
    if(u&&a){a.href='profile.html';a.innerHTML='<i class="fa-solid fa-circle-user"></i><span>Account</span>';}
  },

  updateLocation(){
    let u;try{u=JSON.parse(localStorage.getItem('desimall_user'));}catch{}
    const a=u?.DefaultAddress||u?.default_address||null;
    const label=a?(a.Label||a.label||a.City||a.city||a.Pincode||a.pincode||'Saved address'):'Set delivery location';
    const pin=a?(a.Pincode||a.pincode||''):'';
    const el=document.getElementById('pdpDeliveryLocation');
    if(el)el.textContent=pin&&label!==pin?`${label} • ${pin}`:label;
  },

  render(){
    const p=this.state.product;
    const price=Number(p.FinalPrice||p.SalePrice||p.Price||0);
    const old=Number(p.MRP||p.Price||price);
    const discount=old>price&&old>0?Math.round((old-price)*100/old):Number(p.Discount||0);
    const stock=Number(p.Stock??0);
    const rating=Number(p.Rating||0);
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};

    set('breadcrumbCategory',p.Category||p.CategoryName||'General');
    set('breadcrumbTitle',p.ProductName||p.Name||'Product');
    set('productName',p.ProductName||p.Name||'Product');
    set('productBrand',p.Brand||p.Category||'DesiMall');
    set('sellerName',this.seller(p));
    set('ratingVal',rating?rating.toFixed(1):'New');
    set('reviewCount',rating?'Customer rating':'');
    set('finalPrice',this.money(price));
    set('originalPrice',old>price?this.money(old):'');
    set('discountTag',discount>0?`${discount}% OFF`:'');
    set('badgeDiscount',discount>0?`${discount}% OFF`:'');

    const img=document.getElementById('mainProductImage');
    if(img){img.src=this.image(p);img.alt=p.ProductName||p.Name||'Product';}
    const thumbs=document.getElementById('thumbnailList');
    if(thumbs)thumbs.innerHTML=`<button class="thumbnail-item active"><img src="${this.esc(this.image(p))}" alt="${this.esc(p.ProductName||p.Name||'Product')}"></button>`;

    const status=document.getElementById('stockStatus');
    if(status){
      status.className=`stock-status ${stock>0?'in-stock':'out-stock'}`;
      status.innerHTML=stock>0?`<i class="fa-solid fa-circle"></i> ${stock<5?`Only ${stock} left`:'In stock'}`:`<i class="fa-solid fa-circle"></i> Out of stock`;
    }

    const desc=document.getElementById('tabDescriptionContent');
    if(desc)desc.textContent=p.Description||'Product description is not available yet.';

    set('specBrand',p.Brand||'—');
    set('specCategory',p.Category||p.CategoryName||'General');

    this.renderVariants();
    this.renderSpecialOptions();

    const add=document.getElementById('btnAddToCart'), buy=document.getElementById('btnBuyNow');
    if(stock<=0){if(add)add.disabled=true;if(buy)buy.disabled=true;}

    document.title=`${p.ProductName||p.Name||'Product'} | DesiMall`;
    this.syncWishlist();
  },

  renderVariants(){
    const p=this.state.product;
    const sizes=this.parseList(p.Sizes||p.SizeOptions||p.AvailableSizes||p.Size);
    const colors=this.parseList(p.Colors||p.ColorOptions||p.AvailableColors||p.Color);

    const sg=document.getElementById('sizeGroup'), ss=document.getElementById('sizeSelector');
    if(sizes.length&&ss&&sg){
      this.state.size=sizes[0];sg.classList.remove('hidden');
      ss.innerHTML=sizes.map((x,i)=>`<button type="button" class="size-btn ${i===0?'active':''}" data-value="${this.esc(x)}">${this.esc(x)}</button>`).join('');
    }else sg?.classList.add('hidden');

    const cg=document.getElementById('colorGroup'), cs=document.getElementById('colorSelector');
    if(colors.length&&cs&&cg){
      this.state.color=colors[0];cg.classList.remove('hidden');
      cs.innerHTML=colors.map((x,i)=>`<button type="button" class="text-color-btn ${i===0?'active':''}" data-value="${this.esc(x)}">${this.esc(x)}</button>`).join('');
    }else cg?.classList.add('hidden');
  },

  renderSpecialOptions(){
    const p=this.state.product;
    const badges=document.getElementById('pdpFulfilmentBadges');
    const list=[];
    if(this.isTez(p)){
      list.push('<span class="fulfilment-badge tez"><i class="fa-solid fa-bolt"></i> Tez eligible</span>');
      document.getElementById('btnTezOption')?.classList.remove('hidden');
    }
    if(this.isTryOn(p)){
      list.push('<span class="fulfilment-badge tryon"><i class="fa-solid fa-house"></i> Try at Home</span>');
      document.getElementById('btnTryOnOption')?.classList.remove('hidden');
    }
    if(badges)badges.innerHTML=list.join('');
  },

  bind(){
    document.getElementById('sizeSelector')?.addEventListener('click',e=>{
      const b=e.target.closest('.size-btn');if(!b)return;
      document.querySelectorAll('.size-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');this.state.size=b.dataset.value||b.textContent.trim();
    });
    document.getElementById('colorSelector')?.addEventListener('click',e=>{
      const b=e.target.closest('.text-color-btn');if(!b)return;
      document.querySelectorAll('.text-color-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');this.state.color=b.dataset.value||b.textContent.trim();
    });

    document.getElementById('qtyMinusBtn')?.addEventListener('click',()=>this.setQty(this.state.qty-1));
    document.getElementById('qtyPlusBtn')?.addEventListener('click',()=>this.setQty(this.state.qty+1));
    document.getElementById('btnAddToCart')?.addEventListener('click',()=>this.add(false));
    document.getElementById('btnBuyNow')?.addEventListener('click',()=>this.add(true));
    document.getElementById('btnWishlistToggle')?.addEventListener('click',()=>{
      const added=WishlistManager.toggleWishlist(this.state.product);this.syncWishlist();this.toast(added?'Added to wishlist':'Removed from wishlist');
    });

    document.querySelectorAll('.tab-link').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab-link').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');document.getElementById(btn.dataset.tab)?.classList.add('active');
    }));

    document.getElementById('btnTezOption')?.addEventListener('click',()=>this.toast('Tez checkout workflow will be enabled when the Tez backend is ready.'));
    document.getElementById('btnTryOnOption')?.addEventListener('click',()=>this.toast('Try-On rules and checkout will be enabled after final business approval.'));
  },

  setQty(q){
    const max=Math.max(1,Math.min(10,Number(this.state.product?.Stock||10)));
    this.state.qty=Math.max(1,Math.min(max,q));
    const el=document.getElementById('productQtyInput');if(el)el.value=this.state.qty;
  },

  add(buy){
    const options={};
    if(this.state.size)options.SelectedSize=this.state.size;
    if(this.state.color)options.SelectedColor=this.state.color;
    CartManager.addToCart(this.state.product,this.state.qty,options);
    this.toast('Added to cart');
    if(buy)setTimeout(()=>location.href='checkout.html',250);
  },

  syncWishlist(){
    const btn=document.getElementById('btnWishlistToggle');
    const on=WishlistManager.has(this.state.product.ProductID||this.state.product.ID);
    btn?.classList.toggle('active',on);
    if(btn)btn.innerHTML=`<i class="fa-${on?'solid':'regular'} fa-heart"></i>`;
    WishlistManager.updateWishlistBadge();
  },

  related(){
    const p=this.state.product,c=document.getElementById('relatedProductsContainer');if(!c)return;
    const cat=String(p.Category||p.CategoryName||'').toLowerCase();
    let list=this.state.products.filter(x=>String(x.ProductID||x.ID)!==String(p.ProductID||p.ID)&&String(x.Category||x.CategoryName||'').toLowerCase()===cat);
    if(list.length<4)list=[...list,...this.state.products.filter(x=>String(x.ProductID||x.ID)!==String(p.ProductID||p.ID)&&!list.includes(x))];
    list=list.slice(0,4);
    c.innerHTML=list.map(x=>`<article class="related-product-card"><a href="product.html?id=${encodeURIComponent(x.ProductID||x.ID)}"><img src="${this.esc(this.image(x))}" alt="${this.esc(x.ProductName||x.Name||'Product')}"><h3>${this.esc(x.ProductName||x.Name||'Product')}</h3><strong>${this.money(x.FinalPrice||x.SalePrice||x.Price)}</strong><small>${this.esc(this.seller(x))}</small></a></article>`).join('');
  },

  error(msg){
    const c=document.getElementById('productContainer');
    if(c)c.innerHTML=`<div class="product-error"><i class="fa-solid fa-circle-exclamation"></i><h2>${this.esc(msg)}</h2><a href="../index.html">Back to home</a></div>`;
  },

  toast(m){
    let e=document.getElementById('phase2Toast');
    if(!e){e=document.createElement('div');e.id='phase2Toast';e.className='toast';document.body.appendChild(e);}
    e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1900);
  }
};
