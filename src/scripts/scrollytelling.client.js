// ============================================
// PAWTALES — Scrollytelling engine (genérico)
// Funciona con cualquier página que use <ScrollyStage> + <ScrollySection>.
// No depende del contenido interior de cada sección, solo de:
//   - .scrolly-bg[data-bg]                    (capas de fondo en ScrollyStage)
//   - .scrolly-section[data-bg-target]         (cada ScrollySection)
//   - .scrolly-section[data-bg-transition]     (cómo entra el fondo: fade /
//                                                slide-horizontal / slide-vertical /
//                                                fade-visibility)
//   - .scrolly-inner[data-text-transition]     (cómo entra el texto)
//   - #threadFill                              (opcional, barra de progreso)
// ============================================

(function () {
  /* ---------- progress thread (opcional) ---------- */
  const threadFill = document.getElementById('threadFill');
  function updateThread() {
    if (!threadFill) return;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    threadFill.style.width = pct + '%';
  }

  /* ---------- reveal scrolly-inner on scroll (respeta data-text-transition
     vía CSS; aquí solo decidimos CUÁNDO añadir/quitar in-view) ---------- */
  const inners = document.querySelectorAll('.scrolly-inner');
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('in-view', entry.isIntersecting);
      });
    },
    { threshold: 0.3 }
  );
  inners.forEach((el) => revealObserver.observe(el));

  /* ---------- background crossfade/slide: pick the section closest to
     viewport center, then animate the matching bg layer in using the
     transition type declared on that section ---------- */
  const sections = Array.from(document.querySelectorAll('.scrolly-section[data-bg-target]'));
  const bgLayers = {};
  document.querySelectorAll('.scrolly-bg').forEach((el) => {
    bgLayers[el.dataset.bg] = el;
  });

  let currentBg = Object.keys(bgLayers).find((id) => bgLayers[id].classList.contains('is-active'));

  // Dirección de scroll: 'down' | 'up'. Se usa solo para decidir el SENTIDO
  // del slide (desde dónde entra la capa nueva), no afecta al fade.
  let lastScrollY = window.scrollY;
  let scrollDir = 'down';

  function cleanupLayer(layer) {
    layer.classList.remove('is-leaving');
    layer.removeAttribute('data-transition');
    layer.removeAttribute('data-enter-from');
  }

  function activateBackground(targetId, transitionType) {
    const incoming = bgLayers[targetId];
    const outgoing = bgLayers[currentBg];
    if (!incoming || incoming === outgoing) return;

    // Limpia restos de transiciones anteriores en ambas capas.
    if (outgoing) cleanupLayer(outgoing);
    cleanupLayer(incoming);

    if (transitionType === 'fade') {
      // Fade puro: basta con alternar is-active, la transición de opacity
      // ya está definida en CSS.
      if (outgoing) outgoing.classList.remove('is-active');
      incoming.classList.add('is-active');
    } else {
      // slide-horizontal / slide-vertical / fade-visibility: necesitamos
      // marcar data-transition en ambas capas y, un frame más tarde, alternar
      // is-active/is-leaving para que el navegador anime el cambio.
      incoming.dataset.transition = transitionType;
      if (outgoing) outgoing.dataset.transition = transitionType;

      // Solo los slides dependen de la dirección del scroll (desde dónde
      // entra la capa nueva y hacia dónde se va la vieja). Los zooms son
      // simétricos siempre, así que no usan data-enter-from.
      if (transitionType === 'slide-horizontal' || transitionType === 'slide-vertical') {
        const axis = transitionType === 'slide-vertical' ? 'vertical' : 'horizontal';
        const enterFrom =
          axis === 'horizontal'
            ? scrollDir === 'down' ? 'right' : 'left'
            : scrollDir === 'down' ? 'bottom' : 'top';

        incoming.dataset.enterFrom = enterFrom;
        if (outgoing) outgoing.dataset.enterFrom = enterFrom;
      }

      // Forzamos el estado de "fuera de pantalla" del entrante en este
      // frame (sin transición), y en el siguiente frame lo activamos para
      // que el navegador anime el cambio de transform.
      incoming.classList.remove('is-active');
      // reflow para asegurar que el estado "entrando" se pinte antes de animar
      // eslint-disable-next-line no-unused-expressions
      incoming.offsetHeight;

      requestAnimationFrame(() => {
        incoming.classList.add('is-active');
        if (outgoing) {
          outgoing.classList.remove('is-active');
          outgoing.classList.add('is-leaving');

          // Cuando termine de transicionar la capa saliente, la limpiamos
          // del todo para que no quede pintada de fondo innecesariamente.
          // Los slides animan "transform"; los zooms de la capa saliente
          // solo animan "opacity" (no escalan), así que escuchamos ambas.
          const onDone = (e) => {
            if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
            outgoing.removeEventListener('transitionend', onDone);
            if (!outgoing.classList.contains('is-active')) {
              cleanupLayer(outgoing);
            }
          };
          outgoing.addEventListener('transitionend', onDone);
        }
      });
    }

    currentBg = targetId;
  }

  function updateBackground() {
    const viewportCenter = window.innerHeight / 2;
    let closest = null;
    let closestDist = Infinity;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const sectionCenter = rect.top + rect.height / 2;
      const dist = Math.abs(sectionCenter - viewportCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = section;
      }
    });

    if (closest) {
      const target = closest.dataset.bgTarget;
      const transitionType = closest.dataset.bgTransition || 'fade';
      if (target !== currentBg) {
        activateBackground(target, transitionType);
      }
    }
  }

  /* ---------- rAF scroll loop ---------- */
  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    scrollDir = y > lastScrollY ? 'down' : y < lastScrollY ? 'up' : scrollDir;
    lastScrollY = y;

    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        updateThread();
        updateBackground();
        ticking = false;
      });
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
