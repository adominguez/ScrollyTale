// ============================================
// PAWTALES — Scrollytelling engine (genérico)
// Funciona con cualquier página que use <ScrollyStage> + <ScrollySection>.
// No depende del contenido interior de cada sección, solo de:
//   - .scrolly-stage[data-scroll-sync='true']  (opcional: si vale 'true',
//                                                el fondo no se dispara una
//                                                vez con duración fija, sino
//                                                que su progreso se calcula
//                                                en cada frame a partir de
//                                                la posición real de scroll.
//                                                Astro serializa props
//                                                booleanas en data-* como
//                                                el string "true"/"false",
//                                                nunca omite el atributo,
//                                                así que hay que comparar
//                                                el valor, no solo mirar
//                                                si el atributo existe)
//   - .scrolly-bg[data-bg]                    (capas de fondo en ScrollyStage)
//   - .scrolly-section[data-bg-target]         (cada ScrollySection)
//   - .scrolly-section[data-bg-transition]     (cómo entra el fondo: fade /
//                                                slide-horizontal / slide-vertical /
//                                                fade-visibility)
//   - .scrolly-inner[data-text-transition]     (cómo entra el texto)
//   - #threadFill                              (opcional, barra de progreso)
// ============================================

(function () {
  const stage = document.getElementById('scrollyStage');
  const scrollSyncMode = !!(stage && stage.dataset.scrollSync === 'true');

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
  // del slide (desde dónde entra la capa nueva) en el modo "fire-and-forget"
  // (sin scrollSync); no afecta al fade ni se usa en modo scrollSync, donde
  // la dirección sale gratis de si el progreso sube o baja.
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

  /* ---------- scrollSync: progreso continuo atado al scroll, sin
     temporizador propio. En vez de "disparar y olvidar" una transición de
     duración fija, en cada frame calculamos qué dos secciones consecutivas
     rodean el centro del viewport y en qué punto exacto (0..1) estamos
     entre sus centros, y fijamos opacity/transform de sus capas de fondo
     directamente (el CSS desactiva `transition` para estas capas vía
     [data-scroll-sync], si no el cambio iría con retardo respecto al
     scroll real). ---------- */
  function sectionDocCenter(section) {
    const rect = section.getBoundingClientRect();
    return rect.top + window.scrollY + rect.height / 2;
  }

  function lerp(from, to, t) {
    return from + (to - from) * t;
  }

  // Coloca las capas A (la que va perdiendo protagonismo) y B (la que lo
  // va ganando) según el tipo de transición declarado en B y el progreso
  // 0..1 entre ambas. No hace falta saber la dirección del scroll: como el
  // progreso es una posición (no un disparo puntual), si scrolleas hacia
  // arriba simplemente se recorre al revés.
  function applySyncedTransition(layerA, layerB, transitionType, progress) {
    if (transitionType === 'slide-horizontal') {
      layerA.style.opacity = '1';
      layerA.style.transform = `translateX(${progress * -100}%)`;
      layerB.style.opacity = '1';
      layerB.style.transform = `translateX(${(1 - progress) * 100}%)`;
    } else if (transitionType === 'slide-vertical') {
      layerA.style.opacity = '1';
      layerA.style.transform = `translateY(${progress * -100}%)`;
      layerB.style.opacity = '1';
      layerB.style.transform = `translateY(${(1 - progress) * 100}%)`;
    } else if (transitionType === 'fade-visibility') {
      layerA.style.opacity = String(1 - progress);
      layerA.style.transform = 'scale(1)';
      layerB.style.opacity = String(progress);
      layerB.style.transform = `scale(${lerp(1.15, 1, progress)})`;
    } else {
      // fade
      layerA.style.opacity = String(1 - progress);
      layerA.style.transform = 'translate(0, 0)';
      layerB.style.opacity = String(progress);
      layerB.style.transform = 'translate(0, 0)';
    }
    layerA.style.visibility = 'visible';
    layerB.style.visibility = 'visible';
    layerA.style.zIndex = '1';
    layerB.style.zIndex = '2';
  }

  function updateBackgroundSynced() {
    if (sections.length === 0) return;
    const centerDocY = window.scrollY + window.innerHeight / 2;

    // Busca el par de secciones consecutivas que rodean centerDocY.
    let idx = 0;
    while (idx < sections.length - 1 && sectionDocCenter(sections[idx + 1]) <= centerDocY) {
      idx++;
    }
    const sectionA = sections[idx];
    const sectionB = sections[Math.min(idx + 1, sections.length - 1)];
    const bgIdA = sectionA.dataset.bgTarget;
    const bgIdB = sectionB.dataset.bgTarget;
    const layerA = bgLayers[bgIdA];
    const layerB = bgLayers[bgIdB];

    // Esconde cualquier capa que no forme parte del par actual.
    Object.keys(bgLayers).forEach((id) => {
      if (id !== bgIdA && id !== bgIdB) {
        bgLayers[id].style.opacity = '0';
        bgLayers[id].style.visibility = 'hidden';
      }
    });

    if (!layerA) return;

    if (sectionA === sectionB || bgIdA === bgIdB || !layerB) {
      // Última sección, o dos secciones consecutivas con el mismo fondo:
      // no hay nada que mezclar, el fondo se queda fijo.
      layerA.style.opacity = '1';
      layerA.style.visibility = 'visible';
      layerA.style.transform = 'translate(0, 0)';
      layerA.style.zIndex = '2';
      return;
    }

    const centerA = sectionDocCenter(sectionA);
    const centerB = sectionDocCenter(sectionB);
    let progress = centerB === centerA ? 1 : (centerDocY - centerA) / (centerB - centerA);
    progress = Math.min(1, Math.max(0, progress));

    const transitionType = sectionB.dataset.bgTransition || 'fade';
    applySyncedTransition(layerA, layerB, transitionType, progress);
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
        if (scrollSyncMode) {
          updateBackgroundSynced();
        } else {
          updateBackground();
        }
        ticking = false;
      });
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
