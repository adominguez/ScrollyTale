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
//                                                fade-visibility / zoom-in / zoom-out)
//   - .scrolly-section[data-content-transition] (cómo se mueve el contenido
//                                                entre secciones con mismo fondo:
//                                                slide-horizontal)
//   - .scrolly-pinned[data-pinned-for]         (contenido fijo anclado al
//                                                viewport; visible cuando al
//                                                menos una sección con ese
//                                                bg está centrada en el
//                                                viewport — ScrollyPinned)
//   - .scrolly-inner[data-text-transition]     (cómo entra el texto vía IO;
//                                                no se usa en secciones con
//                                                data-content-transition)
//   - #threadFill                              (opcional, barra de progreso)
// ============================================

// Con View Transitions (astro:transitions) el DOM se sustituye entre
// páginas pero los <script> ya cargados no se re-ejecutan solos: si nos
// limitáramos a correr esto una vez al cargar el módulo, al volver a esta
// página los listeners/observers quedarían enganchados a elementos del DOM
// anterior (desconectados) en vez de a los nuevos. Por eso todo el motor
// vive dentro de init() y se vuelve a lanzar en cada 'astro:page-load'
// (evento que Astro dispara tanto en la carga inicial como tras cada
// transición), limpiando antes lo que se registró la vez anterior.
let cleanupPrev = null;

function initScrollytelling() {
  if (cleanupPrev) cleanupPrev();

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

  /* ---------- content slide horizontal: secciones que comparten fondo y
     quieren que su contenido entre/salga horizontalmente. El JS gestiona
     is-active / is-leaving / data-content-enter-from en sus .scrolly-inner;
     estos quedan fuera del IntersectionObserver. ---------- */
  const contentSlideSections = Array.from(
    document.querySelectorAll('.scrolly-section[data-content-transition="slide-horizontal"]')
  );
  const contentSlideInners = new Map();
  contentSlideSections.forEach((sec) => {
    const inner = sec.querySelector('.scrolly-inner');
    if (inner) contentSlideInners.set(sec, inner);
  });
  // El threshold es un valor de grupo: se toma el máximo entre todas las
  // secciones del bloque. Así basta con declararlo en una sola sección y
  // aplica a todo el grupo aunque las demás no lo tengan.
  const groupContentThreshold = contentSlideSections.reduce((max, sec) => {
    return Math.max(max, parseFloat(sec.dataset.contentThreshold || '0'));
  }, 0);

  // En scrollSync el JS fija transform en cada frame; desactivamos la
  // transición de transform para que el movimiento siga al scroll 1:1.
  // La transición de opacity se mantiene para que la entrada/salida del
  // contenido al cruzar el threshold sea un fade suave, no un snap abrupto.
  if (scrollSyncMode) {
    contentSlideInners.forEach((inner) => {
      inner.style.transition = 'opacity 0.7s var(--ease, cubic-bezier(0.22, 0.61, 0.36, 1))';
    });
  }

  let currentContentSection = null;
  // true solo hasta la primera activación (para no animar el estado inicial
  // si la página se carga con una sección slide ya centrada en el viewport).
  let contentFirstActivation = true;

  function cleanupContentInner(inner) {
    inner.classList.remove('is-leaving', 'is-active');
    inner.removeAttribute('data-content-enter-from');
  }

  // Oculta inmediatamente el inner activo (sin animación) cuando ninguna
  // sección slide está en el viewport.
  function hideCurrentContentInner() {
    if (currentContentSection === null) return;
    const inner = contentSlideInners.get(currentContentSection);
    if (inner) {
      inner.style.transition = 'none';
      cleanupContentInner(inner);
      // eslint-disable-next-line no-unused-expressions
      inner.offsetHeight;
      requestAnimationFrame(() => { inner.style.transition = ''; });
    }
    currentContentSection = null;
  }

  // Devuelve true si el CENTRO de la sección está dentro del viewport.
  // Se usa para decidir si el inner de esa sección debe ser visible.
  function sectionCenterInViewport(section) {
    const rect = section.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    return center >= 0 && center <= window.innerHeight;
  }

  function activateContentSection(incoming, outgoing, instant) {
    const incomingInner = contentSlideInners.get(incoming);
    const outgoingInner = outgoing ? contentSlideInners.get(outgoing) : null;
    if (!incomingInner) return;

    const enterFrom = scrollDir === 'down' ? 'right' : 'left';

    if (instant) {
      // Primera activación: sin animación para no mostrar un slide
      // innecesario al cargar la página o al llegar por primera vez.
      incomingInner.style.transition = 'none';
      incomingInner.classList.add('is-active');
      // eslint-disable-next-line no-unused-expressions
      incomingInner.offsetHeight;
      requestAnimationFrame(() => { incomingInner.style.transition = ''; });
      currentContentSection = incoming;
      contentFirstActivation = false;
      return;
    }

    if (outgoingInner) {
      outgoingInner.dataset.contentEnterFrom = enterFrom;
      outgoingInner.classList.remove('is-active');
      outgoingInner.classList.add('is-leaving');
      const onDone = (e) => {
        if (e.propertyName !== 'transform') return;
        outgoingInner.removeEventListener('transitionend', onDone);
        if (!outgoingInner.classList.contains('is-active')) cleanupContentInner(outgoingInner);
      };
      outgoingInner.addEventListener('transitionend', onDone);
    }

    incomingInner.dataset.contentEnterFrom = enterFrom;
    incomingInner.classList.remove('is-active', 'is-leaving');
    // eslint-disable-next-line no-unused-expressions
    incomingInner.offsetHeight;
    requestAnimationFrame(() => {
      incomingInner.classList.add('is-active');
    });

    currentContentSection = incoming;
    contentFirstActivation = false;
  }

  function updateContentSlide() {
    if (contentSlideSections.length === 0) return;
    const viewportCenter = window.innerHeight / 2;
    let closest = null;
    let closestDist = Infinity;
    contentSlideSections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (dist < closestDist) { closestDist = dist; closest = section; }
    });

    // Solo activar si el centro de la sección más cercana está dentro del
    // viewport. Si está fuera (usuario antes o después del bloque slide),
    // ocultar el inner actual sin animación.
    if (!closest || !sectionCenterInViewport(closest)) {
      hideCurrentContentInner();
      return;
    }

    // Threshold de entrada: solo activar cuando el centro de la sección ha
    // cruzado el umbral desde abajo (center <= hi). Si todavía no lo ha
    // cruzado, se preserva el estado actual sin ocultar — así no hay
    // parpadeo al transicionar entre secciones. No se aplica umbral de
    // salida por arriba: la desactivación la gestiona la transición a la
    // siguiente sección o hideCurrentContentInner al salir del viewport.
    const hi = window.innerHeight * (1 - groupContentThreshold);
    const closestRect = closest.getBoundingClientRect();
    const closestCenter = closestRect.top + closestRect.height / 2;
    if (closestCenter > hi) return;

    if (closest !== currentContentSection) {
      // instant=true solo en la primera activación global (no en re-entradas
      // desde fuera del bloque), para evitar el slide de aparición inicial.
      activateContentSection(closest, currentContentSection, contentFirstActivation);
    }
  }

  function updateContentSlideSynced() {
    if (contentSlideSections.length === 0) return;
    const centerDocY = window.scrollY + window.innerHeight / 2;

    let idx = 0;
    while (
      idx < contentSlideSections.length - 1 &&
      sectionDocCenter(contentSlideSections[idx + 1]) <= centerDocY
    ) {
      idx++;
    }
    const secA = contentSlideSections[idx];
    const secB = contentSlideSections[Math.min(idx + 1, contentSlideSections.length - 1)];
    const innerA = contentSlideInners.get(secA);
    const innerB = contentSlideInners.get(secB);

    // Solo mostrar inners cuando al menos el centro de una de las dos
    // secciones del par esté dentro del viewport. Si ambas están fuera
    // (el usuario está antes o después del bloque slide), ocultar todo.
    if (!sectionCenterInViewport(secA) && !sectionCenterInViewport(secB)) {
      contentSlideSections.forEach((sec) => {
        const inner = contentSlideInners.get(sec);
        if (inner) { inner.style.transform = 'translate(100vw, -50%)'; inner.style.opacity = '0'; }
      });
      return;
    }

    // Oculta los inners que no forman parte del par activo.
    contentSlideSections.forEach((sec) => {
      if (sec !== secA && sec !== secB) {
        const inner = contentSlideInners.get(sec);
        if (inner) { inner.style.transform = 'translate(100vw, -50%)'; inner.style.opacity = '0'; }
      }
    });

    if (!innerA) return;

    // Threshold simétrico: entrada desde abajo (hi) y salida por arriba (lo).
    // Usar el mismo valor de contentThreshold para ambos: si threshold=0.2,
    // el contenido aparece cuando el centro baja del 80% del viewport y
    // desaparece cuando el centro sube por encima del 20%.
    const hi = window.innerHeight * (1 - groupContentThreshold);
    const lo = window.innerHeight * groupContentThreshold;
    const secARect = secA.getBoundingClientRect();
    const secACenter = secARect.top + secARect.height / 2;

    // Umbral de entrada: aún no ha entrado desde abajo
    if (secACenter > hi) {
      innerA.style.transform = 'translate(100vw, -50%)'; innerA.style.opacity = '0';
      if (innerB) { innerB.style.transform = 'translate(100vw, -50%)'; innerB.style.opacity = '0'; }
      return;
    }

    // Umbral de salida para la última sección (sin transición a otra):
    // cuando el centro sube por encima de lo, fade out temprano.
    if ((secA === secB || !innerB) && secACenter < lo) {
      innerA.style.opacity = '0';
      innerA.style.transform = 'translate(0, -50%)';
      return;
    }

    // Zona visible: fade in (opacity '' deja actuar el valor CSS: 1).
    innerA.style.opacity = '';
    if (innerB) innerB.style.opacity = '';

    if (secA === secB || !innerB) {
      innerA.style.transform = 'translate(0, -50%)';
      return;
    }

    const centerA = sectionDocCenter(secA);
    const centerB = sectionDocCenter(secB);
    let progress = centerB === centerA ? 1 : (centerDocY - centerA) / (centerB - centerA);
    progress = Math.min(1, Math.max(0, progress));

    innerA.style.transform = `translate(${progress * -100}vw, -50%)`;
    innerB.style.transform = `translate(${(1 - progress) * 100}vw, -50%)`;
  }

  /* ---------- reveal scrolly-inner on scroll (respeta data-text-transition
     vía CSS; aquí solo decidimos CUÁNDO añadir/quitar in-view).
     Los inners con data-content-transition quedan excluidos: su estado
     lo gestiona activateContentSection / updateContentSlideSynced. ---------- */
  const inners = document.querySelectorAll('.scrolly-inner:not([data-content-transition])');
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

  /* ---------- pinned content (ScrollyPinned) ---------- */
  const pinnedElements = Array.from(
    document.querySelectorAll('.scrolly-pinned[data-pinned-for]')
  );

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
    layer.style.removeProperty('--bg-zoom-scale');
  }

  function activateBackground(targetId, transitionType, zoomScale) {
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
      // slide-horizontal / slide-vertical / fade-visibility / zoom-in /
      // zoom-out: necesitamos marcar data-transition en ambas capas y, un
      // frame más tarde, alternar is-active/is-leaving para que el
      // navegador anime el cambio.
      incoming.dataset.transition = transitionType;
      if (outgoing) outgoing.dataset.transition = transitionType;

      // zoom-in/zoom-out leen la intensidad del efecto desde la sección
      // (data-bg-zoom-scale) y la exponen como custom property en la capa
      // entrante; el CSS la usa con un fallback (0.15) por si no llega.
      if (transitionType === 'zoom-in' || transitionType === 'zoom-out') {
        if (zoomScale) incoming.style.setProperty('--bg-zoom-scale', zoomScale);
      }

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
      const zoomScale = closest.dataset.bgZoomScale;
      if (target !== currentBg) {
        activateBackground(target, transitionType, zoomScale);
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
  function applySyncedTransition(layerA, layerB, transitionType, progress, zoomScale) {
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
    } else if (transitionType === 'zoom-in') {
      layerA.style.opacity = String(1 - progress);
      layerA.style.transform = 'scale(1)';
      layerB.style.opacity = String(progress);
      layerB.style.transform = `scale(${lerp(1 - zoomScale, 1, progress)})`;
    } else if (transitionType === 'zoom-out') {
      layerA.style.opacity = String(1 - progress);
      layerA.style.transform = 'scale(1)';
      layerB.style.opacity = String(progress);
      layerB.style.transform = `scale(${lerp(1 + zoomScale, 1, progress)})`;
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
    const zoomScale = parseFloat(sectionB.dataset.bgZoomScale) || 0.15;
    applySyncedTransition(layerA, layerB, transitionType, progress, zoomScale);
  }

  function updatePinned() {
    if (pinnedElements.length === 0) return;
    pinnedElements.forEach((pinned) => {
      const targetBg = pinned.dataset.pinnedFor;
      const t = parseFloat(pinned.dataset.threshold || '0');
      const lo = window.innerHeight * t;
      const hi = window.innerHeight * (1 - t);

      const targetSections = sections.filter((s) => s.dataset.bgTarget === targetBg);

      const inZone = targetSections.some((s) => {
        const rect = s.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        return center >= lo && center <= hi;
      });

      // Cuando hay varias secciones del mismo bg, el threshold crea un hueco
      // entre ellas en el que ningún centro está en [lo, hi]. Si la sección
      // anterior ya salió por arriba y la siguiente aún no entró por abajo,
      // el usuario está justo entre ambas: el pinned debe seguir visible.
      const inBetween = !inZone && targetSections.some((s, i) => {
        const next = targetSections[i + 1];
        if (!next) return false;
        const rA = s.getBoundingClientRect();
        const rB = next.getBoundingClientRect();
        const centerA = rA.top + rA.height / 2;
        const centerB = rB.top + rB.height / 2;
        return centerA < lo && centerB > hi;
      });

      pinned.classList.toggle('is-visible', inZone || inBetween);
    });
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
          updateContentSlideSynced();
        } else {
          updateBackground();
          updateContentSlide();
        }
        updatePinned();
        ticking = false;
      });
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  // Tras el rAF inicial, desactivar el modo "instant" para que las secciones
  // a las que el usuario llegue haciendo scroll se animen con normalidad.
  // (Las secciones ya centradas en el viewport al cargar la página se
  // activaron con instant=true en el rAF de arriba, que se ejecuta antes.)
  requestAnimationFrame(() => {
    contentFirstActivation = false;
  });

  cleanupPrev = function cleanup() {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    revealObserver.disconnect();
  };
}

document.addEventListener('astro:page-load', initScrollytelling);
