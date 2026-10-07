// Small classic script runs before first paint, independently of page modules.
(() => {
  const root = document.documentElement;
  root.classList.add('page-loading');
  let timer = setTimeout(() => {
    root.classList.add('loading-stalled');
    const message = document.querySelector('#loading-message');
    if (message) message.textContent = 'taking longer than expected. you can retry.';
    const retry = document.querySelector('#loading-retry');
    if (retry) retry.hidden = false;
  }, 15000);
  window.sketchletLoading = {
    finish() {
      clearTimeout(timer);
      root.classList.remove('page-loading', 'loading-stalled');
      const loader = document.querySelector('#page-loader');
      if (loader) loader.hidden = true;
    },
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#loading-retry')?.addEventListener('click', () => location.reload());
  });
})();
