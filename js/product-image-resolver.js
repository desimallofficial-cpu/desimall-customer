(() => {
  'use strict';

  const PLACEHOLDERS = [
    '',
    'image_url',
    'null',
    'undefined'
  ];

  function clean(value) {
    return String(value ?? '').trim();
  }

  function isUsable(value) {
    const src = clean(value);
    if (!src) return false;
    return !PLACEHOLDERS.includes(src.toLowerCase());
  }

  function resolve(item, options = {}) {
    const fallback = options.fallback || '../assets/products/noimage.jpg';
    const candidates = [
      item?.ImageURL,
      item?.image_url,
      item?.ProductImage,
      item?.Image,
      Array.isArray(item?.ImageURLs) ? item.ImageURLs[0] : '',
      Array.isArray(item?.image_urls) ? item.image_urls[0] : ''
    ];

    const found = candidates.find(isUsable);
    if (!found) return fallback;

    const src = clean(found);
    if (/^(https?:|data:|blob:)/i.test(src)) return src;

    return src.startsWith('../') || src.startsWith('/')
      ? src
      : `../${src}`;
  }

  function apply(img, item, options = {}) {
    if (!img) return;
    const fallback = options.fallback || '../assets/products/noimage.jpg';
    img.src = resolve(item, { fallback });
    img.onerror = () => {
      img.onerror = null;
      img.src = fallback;
    };
  }

  window.ProductImageResolver = Object.freeze({
    resolve,
    apply,
    isUsable
  });
})();
