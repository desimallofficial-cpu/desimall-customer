/** DesiMall wishlist service */
const WishlistManager = {
  key:'desimall_wishlist',
  getWishlist(){ try{return JSON.parse(localStorage.getItem(this.key))||[];}catch{return[];} },
  saveWishlist(items){ localStorage.setItem(this.key,JSON.stringify(items));this.updateWishlistBadge();window.dispatchEvent(new CustomEvent('desimall:wishlist-updated')); },
  has(productId){ return this.getWishlist().some(i=>String(i.ProductID||i.ID)===String(productId)); },
  toggleWishlist(product){ const list=this.getWishlist();const id=String(product.ProductID||product.ID);const index=list.findIndex(i=>String(i.ProductID||i.ID)===id);let added=false;if(index>=0)list.splice(index,1);else{list.push(product);added=true;}this.saveWishlist(list);return added; },
  remove(productId){this.saveWishlist(this.getWishlist().filter(i=>String(i.ProductID||i.ID)!==String(productId)));},
  updateWishlistBadge(){const b=document.getElementById('wishlistBadge');if(b){const n=this.getWishlist().length;b.textContent=n;b.setAttribute('aria-label',`${n} wishlist items`);}}
};
