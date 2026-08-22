/** Privacy-friendly local analytics with optional Google Analytics hook. */
const DesiMallAnalytics = (() => {
  const KEY = 'desimall_analytics';
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
  function track(event, details = {}) {
    const entry = { event, details, path: location.pathname, at: new Date().toISOString() };
    const events = read();
    events.push(entry);
    localStorage.setItem(KEY, JSON.stringify(events.slice(-300)));
    if (typeof window.gtag === 'function') window.gtag('event', event, details);
    return entry;
  }
  function pageView() { track('page_view', { title: document.title }); }
  function summary() {
    return read().reduce((acc, item) => { acc[item.event] = (acc[item.event] || 0) + 1; return acc; }, {});
  }
  return { track, pageView, summary };
})();
document.addEventListener('DOMContentLoaded', DesiMallAnalytics.pageView);
