// A passive page-scroll signal only; no canvas work or animation loop.
const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let idle;
function stop() { clearTimeout(idle); root.classList.remove('page-scrolling'); }
window.addEventListener('scroll', () => {
  if (reducedMotion.matches || root.classList.contains('drawing-focused') || document.hidden) return;
  root.classList.add('page-scrolling');
  // Treat nearby gestures and direction changes as one scrolling session.
  // A native scrollend can fire between wheel ticks, so use a quiet period.
  clearTimeout(idle); idle = setTimeout(stop,900);
}, {passive:true});
window.addEventListener('pagehide',stop);
document.addEventListener('visibilitychange',stop);
reducedMotion.addEventListener('change',stop);
