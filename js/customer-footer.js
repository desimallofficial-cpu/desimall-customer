(function(){
  function mount(){
    var path=(location.pathname||'').replace(/\\/g,'/');
    var inPages=path.indexOf('/pages/')!==-1;
    var root=inPages?'../':'';
    var footer=document.querySelector('footer');
    var html='<footer class="dm-customer-footer" role="contentinfo">'+
      '<div class="dm-footer-wrap">'+
      '<section><a class="dm-footer-brand" href="'+root+'index.html"><i class="fa-solid fa-store"></i><span>DesiMall</span></a><p>India-focused shopping with simple discovery, trusted service and value-driven products.</p></section>'+
      '<section><h3>Quick links</h3><div class="dm-footer-links"><a href="'+root+'index.html">Home</a><a href="'+root+'pages/my-orders.html">My orders</a><a href="'+root+'pages/track-order.html">Track order</a><a href="'+root+'pages/support.html">Help &amp; Support</a><a href="'+root+'seller/login.html">Become a seller</a></div></section>'+
      '<section><h3>Policies</h3><div class="dm-footer-links"><a href="'+root+'pages/return-policy.html">Return Policy</a><a href="'+root+'pages/privacy-policy.html">Privacy Policy</a><a href="'+root+'pages/terms.html">Terms &amp; Conditions</a></div></section>'+
      '<section class="dm-footer-contact"><h3>Contact</h3><a href="mailto:desimall.official@gmail.com"><i class="fa-solid fa-envelope"></i><span>desimall.official@gmail.com</span></a><a href="tel:+917050941669"><i class="fa-solid fa-phone"></i><span>+91 70509 41669</span></a><p><i class="fa-solid fa-location-dot"></i> Paliganj, Patna, Bihar, India</p></section>'+
      '</div><div class="dm-footer-bottom"><div><span>© 2026 DesiMall. All rights reserved.</span><strong>Founder &amp; Developed by Suraj Kumar</strong></div></div></footer>';
    if(footer){footer.outerHTML=html}else{document.body.insertAdjacentHTML('beforeend',html)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
