/** DesiMall home application */
const DesiMallApp = {
  state: { products: [], visibleProducts: [], categories: [], banners: [], cart: [], wishlist: [], query: '', category: '', sort: 'featured', currentSlide: 0, sliderTimer: null, flashTimer: null },
  fallbacks: {
    banners: [1,2,3].map((n) => ({ BannerID:`B00${n}`, ImageURL:`assets/banners/banner${n}.jpg`, BannerTitle:`DesiMall offer ${n}` })),
    categories: [
      { CategoryName:'Men', ImageURL:'assets/categories/men.jpg' },{ CategoryName:'Women', ImageURL:'assets/categories/women.jpg' },{ CategoryName:'Kids', ImageURL:'assets/categories/kids.jpg' },{ CategoryName:'Footwear', ImageURL:'assets/categories/footwear.jpg' },{ CategoryName:'Electronics', ImageURL:'assets/categories/electronics.jpg' }
    ],
    products: []
  },
  safeJSON(key, fallback = []) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } },
  text(value, fallback = '') { return String(value ?? fallback).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); },
  number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; },
  bool(value){return value===true||['true','1','yes','active'].includes(String(value||'').toLowerCase());},
  isFlashActive(product){const start=new Date(product.FlashSaleStart||0),end=new Date(product.FlashSaleEnd||0),now=new Date();return this.bool(product.IsFlashSale)&&Number(product.FlashSalePrice)>0&&!isNaN(start)&&!isNaN(end)&&start<=now&&now<end;},
  price(product) { return this.isFlashActive(product)?this.number(product.FlashSalePrice):this.number(product.FinalPrice || product.SalePrice || product.Price); },
  originalPrice(product) { return this.number(product.Price || product.MRP || this.price(product)); },
  categoryOf(product) { return product.Category || product.CategoryName || 'General'; },
  sellerOf(product) { return product.Seller || product.SellerName || product.ShopName || product.seller_name || 'DesiMall Seller'; },
  isTez(product) { return this.bool(product.IsTez ?? product.TezEligible ?? product.FastDeliveryEligible ?? product.MinutesEligible); },
  isTryOn(product) { return this.bool(product.IsTryOn ?? product.TryOnEligible ?? product.TryAtHomeEligible); },
  getLocalCategoryImg(name) { const n=String(name||'').toLowerCase(); if(n.includes('women'))return'assets/categories/women.jpg';if(n.includes('kid'))return'assets/categories/kids.jpg';if(n.includes('foot'))return'assets/categories/footwear.jpg';if(n.includes('elect'))return'assets/categories/electronics.jpg';if(n.includes('men'))return'assets/categories/men.jpg';return''; },
  categoryIcon(name) { const n=String(name||'').toLowerCase(); if(n.includes('grocery'))return'fa-basket-shopping';if(n.includes('fruit')||n.includes('vegetable'))return'fa-carrot';if(n.includes('health')||n.includes('wellness'))return'fa-heart-pulse';if(n.includes('hardware'))return'fa-screwdriver-wrench';if(n.includes('station'))return'fa-pen-ruler';if(n.includes('elect'))return'fa-laptop';if(n.includes('foot'))return'fa-shoe-prints';if(n.includes('women'))return'fa-person-dress';if(n.includes('men'))return'fa-shirt';if(n.includes('kid'))return'fa-child-reaching';return'fa-box-open'; },
  getLocalProductImg(name) { return 'assets/products/noimage.jpg'; },
  productImage(product) {
    const image = String(
      product?.ImageURL ||
      product?.Image ||
      product?.ProductImage ||
      ''
    ).trim();
    return image && image !== 'image_url'
      ? image
      : this.getLocalProductImg(product?.ProductName || product?.Name);
  },

  async init() {
    this.state.cart = this.safeJSON('desimall_cart', []);
    this.state.wishlist = this.safeJSON('desimall_wishlist', []);

    this.updateUserUI();
    this.updateBadges();
    this.bindEvents();
    this.renderSkeletons();

    const [banners, categories, products] = await Promise.allSettled([
      DesiMallAPI.getBanners(),
      DesiMallAPI.getCategories(),
      DesiMallAPI.getProducts()
    ]);

    if (banners.status === 'rejected') {
      console.error('Banners load failed:', banners.reason);
    }
    if (categories.status === 'rejected') {
      console.error('Categories load failed:', categories.reason);
    }
    if (products.status === 'rejected') {
      console.error('Products load failed:', products.reason);
    }

    this.state.banners =
      banners.status === 'fulfilled' &&
      Array.isArray(banners.value) &&
      banners.value.length
        ? banners.value
        : this.fallbacks.banners;

    this.state.categories =
      categories.status === 'fulfilled' &&
      Array.isArray(categories.value) &&
      categories.value.length
        ? categories.value
        : this.fallbacks.categories;

    this.state.products =
      products.status === 'fulfilled' &&
      Array.isArray(products.value)
        ? products.value
        : [];

    this.renderBanners();
    this.renderCategories();
    this.renderPromotions();
    this.applyFilters();

    if (products.status === 'rejected') {
      this.showToast('Products load nahi ho paaye. API check karein.');
    }
  },

  openProduct(id) {
    if (!id) return;
    location.href = `pages/product.html?id=${encodeURIComponent(String(id))}`;
  },

  addToCart(id) {
    const product = this.state.products.find(
      p => String(p.ProductID || p.ID) === String(id)
    );
    if (!product) {
      this.showToast('Product nahi mila.');
      return;
    }

    const stock = this.number(product.Stock, 0);
    if (stock <= 0) {
      this.showToast('Product out of stock hai.');
      return;
    }

    const cart = this.safeJSON('desimall_cart', []);
    const productId = String(product.ProductID || product.ID || '');
    const existing = cart.find(
      item => String(item.ProductID || item.ID || '') === productId
    );

    if (existing) {
      existing.Qty = Math.min(
        10,
        this.number(existing.Qty || existing.Quantity, 1) + 1
      );
    } else {
      cart.push({
        ...product,
        ProductID: productId,
        Qty: 1,
        Quantity: 1
      });
    }

    localStorage.setItem('desimall_cart', JSON.stringify(cart));
    this.state.cart = cart;
    this.updateBadges();
    window.dispatchEvent(
      new CustomEvent('desimall:cart-updated', { detail: cart })
    );
    this.showToast('Cart me add ho gaya.');
  },

  bindEvents() {
    document.getElementById('prevSlide')?.addEventListener('click',()=>this.goToSlide(this.state.currentSlide-1));
    document.getElementById('nextSlide')?.addEventListener('click',()=>this.goToSlide(this.state.currentSlide+1));
    document.getElementById('sortProducts')?.addEventListener('change',(e)=>{this.state.sort=e.target.value;this.applyFilters();});
    const input=document.getElementById('searchInput');
    input?.addEventListener('input',(e)=>this.renderSearchSuggestions(e.target.value));
    document.getElementById('searchForm')?.addEventListener('submit',(e)=>{e.preventDefault();this.state.query=input.value.trim();this.hideSearch();this.applyFilters();document.getElementById('productsSection')?.scrollIntoView({behavior:'smooth'});});
    document.addEventListener('click',(e)=>{if(!e.target.closest('.search-wrapper'))this.hideSearch();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(this.state.sliderTimer);else this.startSlider();});
  },
  updateUserUI() { const link=document.getElementById('userAuthLink');const user=this.safeJSON('desimall_user',null);if(!link||!user)return;const name=user.Name||user.FullName||user.name||'Profile';link.href='pages/profile.html';link.innerHTML=`<i class="fa-solid fa-circle-user"></i><span>Account</span>`; },
  updateBadges() { const total=this.state.cart.reduce((s,i)=>s+this.number(i.Qty||i.Quantity,1),0);const c=document.getElementById('cartBadge'),w=document.getElementById('wishlistBadge');if(c)c.textContent=total;if(w)w.textContent=this.state.wishlist.length; },
  renderSkeletons() { const c=document.getElementById('productsContainer');const cat=document.getElementById('categoryContainer');if(c)c.innerHTML=Array.from({length:8},()=>'<div class="skeleton-card"></div>').join('');if(cat)cat.innerHTML=Array.from({length:6},()=>'<div class="skeleton-card" style="height:145px"></div>').join(''); },
  renderBanners() { const wrap=document.getElementById('sliderWrapper'),dots=document.getElementById('sliderDots');if(!wrap)return;wrap.innerHTML=this.state.banners.map((b,i)=>{let src=b.ImageURL||b.Image||`assets/banners/banner${i%3+1}.jpg`;return`<div class="banner-slide"><img src="${this.text(src)}" alt="${this.text(b.BannerTitle,'DesiMall offer')}" onerror="this.src='assets/banners/banner${i%3+1}.jpg'"></div>`}).join('');if(dots)dots.innerHTML=this.state.banners.map((_,i)=>`<button class="dot ${i===0?'active':''}" onclick="DesiMallApp.goToSlide(${i})" aria-label="Banner ${i+1}"></button>`).join('');this.goToSlide(0);this.startSlider(); },
  goToSlide(index) { const total=this.state.banners.length,wrap=document.getElementById('sliderWrapper');if(!total||!wrap)return;this.state.currentSlide=(index+total)%total;wrap.style.transform=`translateX(-${this.state.currentSlide*100}%)`;document.querySelectorAll('#sliderDots .dot').forEach((d,i)=>d.classList.toggle('active',i===this.state.currentSlide)); },
  startSlider() { clearInterval(this.state.sliderTimer);if(this.state.banners.length>1)this.state.sliderTimer=setInterval(()=>this.goToSlide(this.state.currentSlide+1),4500); },
  renderCategories() {
    const c=document.getElementById('categoryContainer'); if(!c)return;
    c.innerHTML=this.state.categories.map(cat=>{
      const name=cat.CategoryName||cat.Category||'Category';
      const apiSrc=cat.ImageURL||cat.Image||'';
      const localSrc=this.getLocalCategoryImg(name);
      const src=apiSrc||localSrc;
      const count=this.state.products.filter(p=>this.categoryOf(p).toLowerCase()===name.toLowerCase()).length;
      const visual=src
        ? `<img src="${this.text(src)}" alt="${this.text(name)}" onerror="this.parentElement.innerHTML='<i class=&quot;fa-solid ${this.categoryIcon(name)}&quot;></i>'">`
        : `<i class="fa-solid ${this.categoryIcon(name)}"></i>`;
      return `<article class="category-card" data-category="${this.text(name)}" onclick="DesiMallApp.filterByCategory('${this.text(name)}')"><div class="category-image">${visual}</div><h3>${this.text(name)}</h3><p>${count?`${count} ${count===1?'item':'items'}`:'Explore items'}</p></article>`;
    }).join('');
  },
  filterByCategory(name) { this.state.category=name;this.state.query='';const input=document.getElementById('searchInput');if(input)input.value='';this.applyFilters();document.getElementById('productsSection')?.scrollIntoView({behavior:'smooth'}); },
  clearFilters() { this.state.category='';this.state.query='';this.state.sort='featured';const input=document.getElementById('searchInput'),sort=document.getElementById('sortProducts');if(input)input.value='';if(sort)sort.value='featured';this.applyFilters(); },
  applyFilters() { let list=[...this.state.products];const q=this.state.query.toLowerCase();if(q)list=list.filter(p=>[p.ProductName,this.categoryOf(p),p.Brand].some(v=>String(v||'').toLowerCase().includes(q)));if(this.state.category)list=list.filter(p=>this.categoryOf(p).toLowerCase()===this.state.category.toLowerCase());if(this.state.sort==='price-low')list.sort((a,b)=>this.price(a)-this.price(b));if(this.state.sort==='price-high')list.sort((a,b)=>this.price(b)-this.price(a));if(this.state.sort==='rating')list.sort((a,b)=>this.number(b.Rating)-this.number(a.Rating));if(this.state.sort==='featured')list.sort((a,b)=>(this.bool(b.IsFeatured)-this.bool(a.IsFeatured))||(this.isFlashActive(b)-this.isFlashActive(a)));this.state.visibleProducts=list;this.renderProducts(list);document.querySelectorAll('.category-card').forEach(card=>card.classList.toggle('active',card.dataset.category===this.state.category));const title=document.getElementById('productSectionTitle');if(title)title.textContent=this.state.query?`Results for “${this.state.query}”`:this.state.category?`${this.state.category} products`:'Popular near you'; },
  renderPromotions(){
    const flash=this.state.products.filter(p=>this.isFlashActive(p));
    const featured=this.state.products.filter(p=>this.bool(p.IsFeatured)&&String(p.Status||'').toLowerCase()==='active').slice(0,8);
    this.renderProductSubset('flashSaleProducts',flash.slice(0,8));
    this.renderProductSubset('featuredProducts',featured);
    document.getElementById('flashSaleSection')?.classList.toggle('hidden',!flash.length);
    document.getElementById('featuredSection')?.classList.toggle('hidden',!featured.length);
    clearInterval(this.state.flashTimer);
    if(flash.length){this.updateFlashCountdown(flash);this.state.flashTimer=setInterval(()=>{this.updateFlashCountdown(flash);if(!flash.some(p=>this.isFlashActive(p))){clearInterval(this.state.flashTimer);this.renderPromotions();this.applyFilters();}},1000);}
  },
  updateFlashCountdown(products){
    const ends=products.filter(p=>this.isFlashActive(p)).map(p=>new Date(p.FlashSaleEnd).getTime());const el=document.getElementById('storeFlashCountdown');if(!el||!ends.length)return;
    let ms=Math.max(0,Math.min(...ends)-Date.now()),d=Math.floor(ms/86400000);ms%=86400000;const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000),sec=Math.floor(ms%60000/1000);
    el.innerHTML=`<span>Ends in</span><b>${String(d).padStart(2,'0')}d</b><b>${String(h).padStart(2,'0')}h</b><b>${String(m).padStart(2,'0')}m</b><b>${String(sec).padStart(2,'0')}s</b>`;
  },
  renderProductSubset(containerId,list){
    const el=document.getElementById(containerId);if(!el)return;
    if(!list.length){el.innerHTML='';return;}
    el.innerHTML=list.map(p=>{const id=String(p.ProductID||p.ID||''),name=p.ProductName||'Product',price=this.price(p),old=this.originalPrice(p);return`<article class="product-card compact-promo-card" onclick="DesiMallApp.openProduct('${this.text(id)}')"><div class="product-media">${this.isFlashActive(p)?'<span class="discount-badge flash-badge"><i class="fa-solid fa-bolt"></i> FLASH</span>':''}${this.bool(p.IsFeatured)?'<span class="featured-badge"><i class="fa-solid fa-star"></i></span>':''}<img src="${this.text(this.productImage(p))}" alt="${this.text(name)}"></div><div class="product-info"><small>${this.text(this.categoryOf(p))}</small><h3>${this.text(name)}</h3><div class="price-row"><strong>₹${price.toLocaleString('en-IN')}</strong>${old>price?`<del>₹${old.toLocaleString('en-IN')}</del>`:''}</div></div></article>`}).join('');
  },
  renderProducts(list) {
    const c=document.getElementById('productsContainer'),empty=document.getElementById('emptyState'),count=document.getElementById('productCount'); if(!c)return;
    if(count)count.textContent=`${list.length} product${list.length===1?'':'s'}`; c.classList.toggle('hidden',!list.length); empty?.classList.toggle('hidden',!!list.length);
    if(!list.length){c.innerHTML='';return;}
    c.innerHTML=list.map(p=>{const id=String(p.ProductID||p.ID||''),name=p.ProductName||p.Name||'Product',price=this.price(p),old=this.originalPrice(p),discount=this.number(p.Discount,old>price?Math.round((old-price)*100/old):0),rating=this.number(p.Rating,0),stock=this.number(p.Stock,0),wished=this.state.wishlist.some(x=>String(x.ProductID||x.ID)===id),seller=this.sellerOf(p);
      const badges=(this.isTez(p)?'<span class="fulfilment-badge tez"><i class="fa-solid fa-bolt"></i> Tez</span>':'')+(this.isTryOn(p)?'<span class="fulfilment-badge tryon"><i class="fa-solid fa-house"></i> Try at Home</span>':'');
      return `<article class="product-card customer-product-card"><div class="product-media" onclick="DesiMallApp.openProduct('${this.text(id)}')">${discount>0?`<span class="discount-badge">${discount}% OFF</span>`:''}<button class="wishlist-button ${wished?'active':''}" onclick="event.stopPropagation();DesiMallApp.toggleWishlist('${this.text(id)}')" aria-label="Wishlist"><i class="${wished?'fa-solid':'fa-regular'} fa-heart"></i></button><img loading="lazy" src="${this.text(this.productImage(p))}" alt="${this.text(name)}" onerror="this.src='${this.getLocalProductImg(name)}'"></div><div class="product-info"><div class="product-badges">${badges}</div><h3 class="product-title" onclick="DesiMallApp.openProduct('${this.text(id)}')">${this.text(name)}</h3>${rating>0?`<div class="rating-row"><span class="rating-pill"><i class="fa-solid fa-star"></i>${rating.toFixed(1)}</span></div>`:''}<div class="price-row"><span class="current-price">₹${price.toLocaleString('en-IN')}</span>${old>price?`<span class="old-price">₹${old.toLocaleString('en-IN')}</span>`:''}</div><div class="seller-line"><i class="fa-solid fa-store"></i><span>${this.text(seller)}</span></div><div class="card-bottom-row"><span class="stock-text ${stock>0&&stock<5?'low':''}">${stock>0?(stock<5?'Few left':'In stock'):'Out of stock'}</span><button class="quick-add-btn" ${stock<=0?'disabled':''} onclick="event.stopPropagation();DesiMallApp.addToCart('${this.text(id)}')">Add <i class="fa-solid fa-plus"></i></button></div></div></article>`;}).join('');
  },
  async toggleWishlist(id) { const product=this.state.products.find(p=>String(p.ProductID||p.ID)===String(id));if(!product)return;const index=this.state.wishlist.findIndex(p=>String(p.ProductID||p.ID)===String(id));const added=index<0;if(added)this.state.wishlist.push(product);else this.state.wishlist.splice(index,1);localStorage.setItem('desimall_wishlist',JSON.stringify(this.state.wishlist));this.updateBadges();this.renderProducts(this.state.visibleProducts);this.showToast(added?'Added to wishlist':'Removed from wishlist');const user=this.safeJSON('desimall_user',null);if(user?.UserID)await DesiMallAPI.toggleWishlist(user.UserID,id); },
  renderSearchSuggestions(value) { const results=document.getElementById('searchResults'),q=value.trim().toLowerCase();if(!results||q.length<2){this.hideSearch();return;}const matches=this.state.products.filter(p=>String(p.ProductName||'').toLowerCase().includes(q)||this.categoryOf(p).toLowerCase().includes(q)).slice(0,7);results.innerHTML=matches.length?matches.map(p=>`<div class="search-result-item" onclick="DesiMallApp.chooseSuggestion('${this.text(p.ProductID||p.ID)}')"><img src="${this.text(this.productImage(p))}" alt=""><div class="search-result-copy"><strong>${this.text(p.ProductName||p.Name)}</strong><span>₹${this.price(p).toLocaleString('en-IN')}</span></div><i class="fa-solid fa-chevron-right"></i></div>`).join(''):'<div class="search-no-result">No matching product found</div>';results.classList.remove('hidden'); },
  chooseSuggestion(id) { const p=this.state.products.find(x=>String(x.ProductID||x.ID)===String(id));if(!p)return;this.state.query=p.ProductName||p.Name||'';const input=document.getElementById('searchInput');if(input)input.value=this.state.query;this.hideSearch();this.applyFilters();document.getElementById('productsSection')?.scrollIntoView({behavior:'smooth'}); },
  hideSearch() { document.getElementById('searchResults')?.classList.add('hidden'); },
  showToast(message) { const toast=document.getElementById('toast'),text=document.getElementById('toastMessage');if(!toast||!text)return;text.textContent=message;toast.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>toast.classList.remove('show'),2300); }
};

document.addEventListener('DOMContentLoaded',()=>DesiMallApp.init());
