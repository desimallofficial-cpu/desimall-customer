/** Voice search enhancement (supported Chromium browsers). */
const DesiMallVoiceSearch = (() => {
  function init() {
    const input = document.getElementById('searchInput');
    const form = document.getElementById('searchForm');
    if (!input || !form) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'voice-search-button';
    button.setAttribute('aria-label', 'Search by voice');
    button.title = 'Voice search';
    button.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    form.insertBefore(button, form.querySelector('button[type="submit"]'));
    const recognition = new Recognition();
    recognition.lang = 'hi-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    button.onclick = () => { button.classList.add('listening'); recognition.start(); };
    recognition.onresult = event => {
      input.value = event.results[0][0].transcript;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      DesiMallAnalytics?.track('voice_search', { query: input.value });
    };
    recognition.onerror = () => button.classList.remove('listening');
    recognition.onend = () => button.classList.remove('listening');
  }
  return { init };
})();
document.addEventListener('DOMContentLoaded', DesiMallVoiceSearch.init);
