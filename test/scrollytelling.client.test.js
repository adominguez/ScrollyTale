// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class FakeIntersectionObserver {
  constructor(cb) {
    this.cb = cb;
    this.elements = [];
    this.disconnected = false;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el) {
    this.elements.push(el);
  }
  unobserve(el) {
    this.elements = this.elements.filter((e) => e !== el);
  }
  disconnect() {
    this.disconnected = true;
  }
}
FakeIntersectionObserver.instances = [];

function mockRect(el, top, height = 100) {
  el.getBoundingClientRect = () => ({
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
  });
}

function setScrollY(y) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

function setDocScroll({ scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = {}) {
  Object.defineProperty(document.documentElement, 'scrollTop', { value: scrollTop, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(document.documentElement, 'clientHeight', { value: clientHeight, configurable: true });
}

// jsdom no implementa HTMLMediaElement.play()/pause() (loguean "not
// implemented" y no tocan el estado real), así que para las capas de vídeo
// las sustituimos por spies propios que además mantienen `paused` en un
// data property propia (por defecto es un getter de solo lectura en el
// prototipo), para poder ejercitar el guard `if (layer.paused) return;` de
// pauseLayer() tal cual lo ve el motor en un navegador real.
function mockVideoElement(el) {
  Object.defineProperty(el, 'paused', { value: true, writable: true, configurable: true });
  el.play = vi.fn(() => { el.paused = false; });
  el.pause = vi.fn(() => { el.paused = true; });
  el.load = vi.fn();
  return el;
}

async function initEngine() {
  await import('../src/scrollytelling.client.js');
  document.dispatchEvent(new Event('astro:page-load'));
}

let addedListeners;

beforeEach(() => {
  vi.resetModules();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    cb();
    return 0;
  });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  setScrollY(0);
  document.body.innerHTML = '';

  addedListeners = [];
  const origDocAdd = document.addEventListener.bind(document);
  const origWinAdd = window.addEventListener.bind(window);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
    addedListeners.push(['document', type, fn]);
    return origDocAdd(type, fn, opts);
  });
  vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
    addedListeners.push(['window', type, fn]);
    return origWinAdd(type, fn, opts);
  });
});

afterEach(() => {
  addedListeners.forEach(([target, type, fn]) => {
    (target === 'document' ? document : window).removeEventListener(type, fn);
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('scrollytelling.client.js — fondo (fire-and-forget)', () => {
  function buildBackgroundDom() {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade">
        <div class="scrolly-inner"></div>
      </section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="slide-horizontal">
        <div class="scrolly-inner"></div>
      </section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    return { heroSection: sections[0], forestSection: sections[1] };
  }

  it('activa (fade) el fondo de la sección más cercana al centro del viewport', async () => {
    const { heroSection, forestSection } = buildBackgroundDom();
    mockRect(heroSection, -1000, 100);
    mockRect(forestSection, 0, 100);

    await initEngine();

    expect(document.querySelector('[data-bg="forest"]').classList.contains('is-active')).toBe(true);
    expect(document.querySelector('[data-bg="hero"]').classList.contains('is-active')).toBe(false);
  });

  it('con bgTransition distinto de fade, marca is-active/is-leaving y data-enter-from', async () => {
    const { heroSection, forestSection } = buildBackgroundDom();
    mockRect(heroSection, -1000, 100);
    mockRect(forestSection, 0, 100);

    await initEngine();

    const heroLayer = document.querySelector('[data-bg="hero"]');
    const forestLayer = document.querySelector('[data-bg="forest"]');
    expect(forestLayer.classList.contains('is-active')).toBe(true);
    expect(forestLayer.dataset.transition).toBe('slide-horizontal');
    expect(forestLayer.dataset.enterFrom).toBe('right');
    expect(heroLayer.classList.contains('is-leaving')).toBe(true);
    expect(heroLayer.dataset.enterFrom).toBe('right');
  });
});

describe('scrollytelling.client.js — overlay por sección', () => {
  it('en modo fire-and-forget, aplica el data-overlay de la sección activa y hereda el default en las que no lo declaran', async () => {
    document.body.innerHTML = `
      <div class="scrolly-overlay" id="scrollyOverlay" style="background:linear-gradient(black, white);"></div>
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade" data-overlay="rgba(0,0,0,0.6)"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 100);
    mockRect(sections[1], 5000, 100);

    await initEngine();

    const overlayEl = document.getElementById('scrollyOverlay');
    // jsdom normaliza el shorthand `background` añadiendo espacios tras las comas.
    expect(overlayEl.style.background).toBe('rgba(0, 0, 0, 0.6)');

    mockRect(sections[0], -5000, 100);
    mockRect(sections[1], 0, 100);
    setScrollY(100);
    window.dispatchEvent(new Event('scroll'));

    expect(overlayEl.style.background).toBe('linear-gradient(black, white)');
  });

  it('con overlay={false} en la sección, aplica "transparent"', async () => {
    document.body.innerHTML = `
      <div class="scrolly-overlay" id="scrollyOverlay" style="background:linear-gradient(black, white);"></div>
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade" data-overlay="transparent"></section>
    `;
    mockRect(document.querySelector('.scrolly-section'), 0, 100);

    await initEngine();

    expect(document.getElementById('scrollyOverlay').style.background).toBe('transparent');
  });

  it('sin #scrollyOverlay en el DOM, no falla', async () => {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade" data-overlay="rgba(0,0,0,0.6)"></section>
    `;
    mockRect(document.querySelector('.scrolly-section'), 0, 100);

    await expect(initEngine()).resolves.not.toThrow();
  });

  it('en modo scrollSync, aplica el overlay de la sección dominante del par (progress < 0.5 → A, si no B)', async () => {
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <div class="scrolly-overlay" id="scrollyOverlay" style="background:linear-gradient(black, white);"></div>
      <div class="scrolly-bg" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade" data-overlay="rgba(10,10,10,0.5)"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade" data-overlay="rgba(20,20,20,0.5)"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    // Centro (documento) de A en y=0, de B en y=800, scrollY=0 → viewport
    // center=400 → progress=0.5 → domina B (progress < 0.5 sería A).
    mockRect(sections[0], 0, 0);
    mockRect(sections[1], 800, 0);
    setScrollY(0);

    await initEngine();

    const overlayEl = document.getElementById('scrollyOverlay');
    expect(overlayEl.style.background).toBe('rgba(20, 20, 20, 0.5)');

    // Usuario scrollea hacia arriba: mismos centros de documento (0 y 800),
    // pero con scrollY=-300 el centro del viewport cae en 100 → progress
    // = 100/800 = 0.125 < 0.5 → domina A. rect.top se ajusta para que
    // rect.top + scrollY siga dando el mismo centro de documento.
    mockRect(sections[0], 300, 0);
    mockRect(sections[1], 1100, 0);
    setScrollY(-300);
    window.dispatchEvent(new Event('scroll'));
    expect(overlayEl.style.background).toBe('rgba(10, 10, 10, 0.5)');
  });
});

describe('scrollytelling.client.js — reveal de texto (IntersectionObserver)', () => {
  it('alterna in-view según isIntersecting, e ignora inners con data-content-transition', async () => {
    document.body.innerHTML = `
      <div class="scrolly-inner" id="plain"></div>
      <div class="scrolly-inner" data-content-transition="slide-horizontal" id="slide"></div>
    `;

    await initEngine();

    const observer = FakeIntersectionObserver.instances[0];
    const plain = document.getElementById('plain');
    expect(observer.elements).toContain(plain);
    expect(observer.elements).not.toContain(document.getElementById('slide'));

    observer.cb([{ target: plain, isIntersecting: true }]);
    expect(plain.classList.contains('in-view')).toBe(true);

    observer.cb([{ target: plain, isIntersecting: false }]);
    expect(plain.classList.contains('in-view')).toBe(false);
  });
});

describe('scrollytelling.client.js — barra de progreso (#threadFill)', () => {
  it('fija el ancho según scrollTop/scrollHeight', async () => {
    document.body.innerHTML = `<div id="threadFill"></div>`;
    setDocScroll({ scrollTop: 300, scrollHeight: 1800, clientHeight: 800 });

    await initEngine();

    expect(document.getElementById('threadFill').style.width).toBe('30%');
  });
});

describe('scrollytelling.client.js — contentTransition slide-horizontal', () => {
  function buildContentSlideDom() {
    document.body.innerHTML = `
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerA"></div>
      </section>
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerB"></div>
      </section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    return { sectionA: sections[0], sectionB: sections[1] };
  }

  it('activa la primera sección centrada en el viewport sin animación (instant)', async () => {
    const { sectionA, sectionB } = buildContentSlideDom();
    mockRect(sectionA, 0, 100);
    mockRect(sectionB, 2000, 100);

    await initEngine();

    const innerA = document.getElementById('innerA');
    expect(innerA.classList.contains('is-active')).toBe(true);
    expect(innerA.classList.contains('is-leaving')).toBe(false);
    // Activación instant: NO debe tener data-content-enter-from (solo la ruta animada lo pone)
    expect(innerA.hasAttribute('data-content-enter-from')).toBe(false);
  });

  it('cuando ninguna sección está en el viewport al cargar, la primera activación por scroll usa animación', async () => {
    const { sectionA, sectionB } = buildContentSlideDom();
    // Ambas secciones fuera del viewport al cargar (debajo)
    mockRect(sectionA, 2000, 100);
    mockRect(sectionB, 5000, 100);

    await initEngine();

    const innerA = document.getElementById('innerA');
    // Al cargar: ninguna sección en viewport → inner inactivo
    expect(innerA.classList.contains('is-active')).toBe(false);

    // El usuario scrollea hasta sectionA
    mockRect(sectionA, 0, 100);
    setScrollY(1950);
    window.dispatchEvent(new Event('scroll'));

    // Primera activación por scroll: debe ser animada (data-content-enter-from presente)
    expect(innerA.classList.contains('is-active')).toBe(true);
    expect(innerA.dataset.contentEnterFrom).toBe('right');
  });

  it('al desplazar el centro a la siguiente sección, la entrante se activa y la saliente pasa a is-leaving', async () => {
    const { sectionA, sectionB } = buildContentSlideDom();
    mockRect(sectionA, 0, 100);
    mockRect(sectionB, 2000, 100);

    await initEngine();

    mockRect(sectionA, -2000, 100);
    mockRect(sectionB, 0, 100);
    setScrollY(100);
    window.dispatchEvent(new Event('scroll'));

    const innerA = document.getElementById('innerA');
    const innerB = document.getElementById('innerB');
    expect(innerB.classList.contains('is-active')).toBe(true);
    expect(innerA.classList.contains('is-active')).toBe(false);
    expect(innerA.classList.contains('is-leaving')).toBe(true);
    expect(innerA.dataset.contentEnterFrom).toBe('right');
  });
});

describe('scrollytelling.client.js — scrollSync', () => {
  it('interpola opacity/transform entre las dos secciones que rodean el centro del viewport', async () => {
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <div class="scrolly-bg" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    // Centro de A en y=0, centro de B en y=800 (documento), scrollY=0: el
    // centro del viewport (innerHeight/2=400) cae justo a mitad de camino.
    mockRect(sections[0], 0, 0);
    mockRect(sections[1], 800, 0);
    setScrollY(0);

    await initEngine();

    const heroLayer = document.querySelector('[data-bg="hero"]');
    const forestLayer = document.querySelector('[data-bg="forest"]');
    expect(heroLayer.style.opacity).toBe('0.5');
    expect(forestLayer.style.opacity).toBe('0.5');
    expect(heroLayer.style.visibility).toBe('visible');
    expect(forestLayer.style.visibility).toBe('visible');
  });
});

describe('scrollytelling.client.js — vídeo de fondo', () => {
  it('reproduce automáticamente la capa de vídeo activa al iniciar', async () => {
    document.body.innerHTML = `
      <video class="scrolly-bg is-active" data-bg="hero"></video>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    const heroLayer = document.querySelector('[data-bg="hero"]');
    mockVideoElement(heroLayer);
    mockRect(document.querySelector('.scrolly-section'), 0, 100);

    await initEngine();

    expect(heroLayer.play).toHaveBeenCalled();
  });

  it('en modo fire-and-forget, reproduce la capa entrante y pausa la saliente al terminar la transición', async () => {
    document.body.innerHTML = `
      <video class="scrolly-bg is-active" data-bg="hero"></video>
      <video class="scrolly-bg" data-bg="forest"></video>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade"></section>
    `;
    const heroLayer = document.querySelector('[data-bg="hero"]');
    const forestLayer = document.querySelector('[data-bg="forest"]');
    mockVideoElement(heroLayer);
    mockVideoElement(forestLayer);
    heroLayer.paused = false; // simula que ya estaba reproduciéndose al ser la activa inicial
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], -1000, 100);
    mockRect(sections[1], 0, 100);

    await initEngine();

    expect(forestLayer.classList.contains('is-active')).toBe(true);
    expect(forestLayer.play).toHaveBeenCalled();
    // Todavía no ha terminado la transición CSS de la saliente: no se pausa aún.
    expect(heroLayer.pause).not.toHaveBeenCalled();

    const done = new Event('transitionend');
    done.propertyName = 'opacity';
    heroLayer.dispatchEvent(done);

    expect(heroLayer.pause).toHaveBeenCalled();
  });

  it('un transitionend con propiedad irrelevante no pausa la capa saliente de vídeo', async () => {
    document.body.innerHTML = `
      <video class="scrolly-bg is-active" data-bg="hero"></video>
      <video class="scrolly-bg" data-bg="forest"></video>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade"></section>
    `;
    const heroLayer = document.querySelector('[data-bg="hero"]');
    const forestLayer = document.querySelector('[data-bg="forest"]');
    mockVideoElement(heroLayer);
    mockVideoElement(forestLayer);
    heroLayer.paused = false;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], -1000, 100);
    mockRect(sections[1], 0, 100);

    await initEngine();

    const irrelevant = new Event('transitionend');
    irrelevant.propertyName = 'color';
    heroLayer.dispatchEvent(irrelevant);

    expect(heroLayer.pause).not.toHaveBeenCalled();
  });

  it('en modo scrollSync, reproduce el par de capas de vídeo visibles y pausa el resto', async () => {
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <video class="scrolly-bg" data-bg="hero"></video>
      <video class="scrolly-bg" data-bg="forest"></video>
      <video class="scrolly-bg" data-bg="closing"></video>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="closing" data-bg-transition="fade"></section>
    `;
    const heroLayer = document.querySelector('[data-bg="hero"]');
    const forestLayer = document.querySelector('[data-bg="forest"]');
    const closingLayer = document.querySelector('[data-bg="closing"]');
    [heroLayer, forestLayer, closingLayer].forEach(mockVideoElement);
    closingLayer.paused = false; // simula que venía reproduciéndose de un estado anterior

    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 0);
    mockRect(sections[1], 800, 0);
    mockRect(sections[2], 5000, 0);
    setScrollY(0);

    await initEngine();

    expect(heroLayer.play).toHaveBeenCalled();
    expect(forestLayer.play).toHaveBeenCalled();
    expect(closingLayer.pause).toHaveBeenCalled();
  });
});

describe('scrollytelling.client.js — lazy-load de vídeo de fondo', () => {
  function buildLazyVideoDom() {
    document.body.innerHTML = `
      <video class="scrolly-bg scrolly-bg--video is-active" data-bg="hero"></video>
      <video class="scrolly-bg scrolly-bg--video" data-bg="intro" data-video-src="/intro.mp4" data-video-mobile-src="/intro-mobile.mp4"></video>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="intro" data-bg-transition="fade"></section>
    `;
    const heroLayer = document.querySelector('[data-bg="hero"]');
    const introLayer = document.querySelector('[data-bg="intro"]');
    mockVideoElement(heroLayer);
    mockVideoElement(introLayer);
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 100);
    mockRect(sections[1], 5000, 100);
    return { heroLayer, introLayer, heroSection: sections[0], introSection: sections[1] };
  }

  function findLazyObserverFor(section) {
    return FakeIntersectionObserver.instances.find((inst) => inst.elements.includes(section));
  }

  it('no inyecta <source> ni llama a load() en una capa de vídeo que no es la activa inicial', async () => {
    const { introLayer } = buildLazyVideoDom();

    await initEngine();

    expect(introLayer.querySelector('source')).toBeNull();
    expect(introLayer.load).not.toHaveBeenCalled();
  });

  it('al acercarse la sección (IntersectionObserver con rootMargin), inyecta los <source> y llama a load()', async () => {
    const { introLayer, introSection } = buildLazyVideoDom();

    await initEngine();

    const lazyObserver = findLazyObserverFor(introSection);
    expect(lazyObserver).toBeDefined();
    lazyObserver.cb([{ isIntersecting: true, target: introSection }]);

    const sources = introLayer.querySelectorAll('source');
    expect(sources).toHaveLength(2);
    expect(introLayer.querySelector('source[media="(max-width: 560px)"]').src).toContain('/intro-mobile.mp4');
    expect(introLayer.load).toHaveBeenCalled();
  });

  it('deja de observar la sección tras cargar el vídeo (disparo único)', async () => {
    const { introSection } = buildLazyVideoDom();

    await initEngine();

    const lazyObserver = findLazyObserverFor(introSection);
    lazyObserver.cb([{ isIntersecting: true, target: introSection }]);

    expect(lazyObserver.elements).not.toContain(introSection);
  });

  it('un entry no intersecting no dispara la carga', async () => {
    const { introLayer, introSection } = buildLazyVideoDom();

    await initEngine();

    const lazyObserver = findLazyObserverFor(introSection);
    lazyObserver.cb([{ isIntersecting: false, target: introSection }]);

    expect(introLayer.querySelector('source')).toBeNull();
    expect(introLayer.load).not.toHaveBeenCalled();
  });

  it('la capa activa inicial no se observa (ya viene cargada del servidor)', async () => {
    const { heroSection } = buildLazyVideoDom();

    await initEngine();

    expect(findLazyObserverFor(heroSection)).toBeUndefined();
  });
});

describe('scrollytelling.client.js — lazy-load de imagen de fondo', () => {
  function buildLazyImageDom() {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero" style="--bg-image:url('/hero.webp');"></div>
      <div class="scrolly-bg" data-bg="forest" data-image-src="/forest.webp" data-image-mobile-src="/forest-mobile.webp"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade"></section>
    `;
    const heroLayer = document.querySelector('[data-bg="hero"]');
    const forestLayer = document.querySelector('[data-bg="forest"]');
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 100);
    mockRect(sections[1], 5000, 100);
    return { heroLayer, forestLayer, heroSection: sections[0], forestSection: sections[1] };
  }

  function findLazyObserverFor(section) {
    return FakeIntersectionObserver.instances.find((inst) => inst.elements.includes(section));
  }

  it('no fija --bg-image en una capa de imagen que no es la activa inicial', async () => {
    const { forestLayer } = buildLazyImageDom();

    await initEngine();

    expect(forestLayer.style.getPropertyValue('--bg-image')).toBe('');
  });

  it('al acercarse la sección (IntersectionObserver con rootMargin), fija --bg-image y --bg-image-mobile', async () => {
    const { forestLayer, forestSection } = buildLazyImageDom();

    await initEngine();

    const lazyObserver = findLazyObserverFor(forestSection);
    expect(lazyObserver).toBeDefined();
    lazyObserver.cb([{ isIntersecting: true, target: forestSection }]);

    expect(forestLayer.style.getPropertyValue('--bg-image')).toBe("url('/forest.webp')");
    expect(forestLayer.style.getPropertyValue('--bg-image-mobile')).toBe("url('/forest-mobile.webp')");
  });

  it('deja de observar la sección tras cargar la imagen (disparo único)', async () => {
    const { forestSection } = buildLazyImageDom();

    await initEngine();

    const lazyObserver = findLazyObserverFor(forestSection);
    lazyObserver.cb([{ isIntersecting: true, target: forestSection }]);

    expect(lazyObserver.elements).not.toContain(forestSection);
  });

  it('un entry no intersecting no dispara la carga', async () => {
    const { forestLayer, forestSection } = buildLazyImageDom();

    await initEngine();

    const lazyObserver = findLazyObserverFor(forestSection);
    lazyObserver.cb([{ isIntersecting: false, target: forestSection }]);

    expect(forestLayer.style.getPropertyValue('--bg-image')).toBe('');
  });

  it('la capa activa inicial no se observa (ya viene cargada del servidor)', async () => {
    const { heroSection } = buildLazyImageDom();

    await initEngine();

    expect(findLazyObserverFor(heroSection)).toBeUndefined();
  });
});

describe('scrollytelling.client.js — fondo: casos adicionales', () => {
  it('sin capa saliente (currentBg vacío), activa la entrante sin tocar data-enter-from de ninguna otra', async () => {
    document.body.innerHTML = `
      <div class="scrolly-bg" data-bg="hero"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="slide-horizontal"></section>
    `;
    mockRect(document.querySelector('.scrolly-section'), 0, 100);

    await initEngine();

    const heroLayer = document.querySelector('[data-bg="hero"]');
    expect(heroLayer.classList.contains('is-active')).toBe(true);
    expect(heroLayer.dataset.enterFrom).toBe('right');
  });

  it('zoom-in sin data-bg-zoom-scale no fija la custom property --bg-zoom-scale', async () => {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="zoom-in"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], -1000, 100);
    mockRect(sections[1], 0, 100);

    await initEngine();

    const forestLayer = document.querySelector('[data-bg="forest"]');
    expect(forestLayer.classList.contains('is-active')).toBe(true);
    expect(forestLayer.style.getPropertyValue('--bg-zoom-scale')).toBe('');
  });

  it('zoom-out con data-bg-zoom-scale fija la custom property --bg-zoom-scale', async () => {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="zoom-out" data-bg-zoom-scale="0.3"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], -1000, 100);
    mockRect(sections[1], 0, 100);

    await initEngine();

    const forestLayer = document.querySelector('[data-bg="forest"]');
    expect(forestLayer.style.getPropertyValue('--bg-zoom-scale')).toBe('0.3');
  });

  it('slide-vertical usa bottom/top en data-enter-from según la dirección del scroll', async () => {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="slide-vertical"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], -1000, 100);
    mockRect(sections[1], 0, 100);

    await initEngine();

    expect(document.querySelector('[data-bg="forest"]').dataset.enterFrom).toBe('bottom');
  });

  it('al scrollear hacia arriba, data-enter-from pasa a left/top', async () => {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="slide-vertical"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    // Ambas secciones lejos del centro al iniciar, para que no se active nada
    // todavía y la dirección de scroll inicial ('down') quede sin usar.
    mockRect(sections[0], 5000, 100);
    mockRect(sections[1], 6000, 100);
    setScrollY(500);

    await initEngine();

    // Ahora sí acercamos "forest" al centro, scrolleando hacia arriba.
    mockRect(sections[0], 5000, 100);
    mockRect(sections[1], 0, 100);
    setScrollY(0);
    window.dispatchEvent(new Event('scroll'));

    expect(document.querySelector('[data-bg="forest"]').dataset.enterFrom).toBe('top');
  });

  it('el transitionend de la capa saliente la limpia solo si la propiedad es transform u opacity', async () => {
    document.body.innerHTML = `
      <div class="scrolly-bg is-active" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="slide-horizontal"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], -1000, 100);
    mockRect(sections[1], 0, 100);

    await initEngine();

    const heroLayer = document.querySelector('[data-bg="hero"]');
    expect(heroLayer.classList.contains('is-leaving')).toBe(true);

    const irrelevant = new Event('transitionend');
    irrelevant.propertyName = 'color';
    heroLayer.dispatchEvent(irrelevant);
    expect(heroLayer.classList.contains('is-leaving')).toBe(true);

    const done = new Event('transitionend');
    done.propertyName = 'transform';
    heroLayer.dispatchEvent(done);
    expect(heroLayer.classList.contains('is-leaving')).toBe(false);
    expect(heroLayer.dataset.transition).toBeUndefined();
  });
});

describe('scrollytelling.client.js — contentThreshold', () => {
  function buildDom(thresholdAttr = '') {
    document.body.innerHTML = `
      <section class="scrolly-section" data-content-transition="slide-horizontal" ${thresholdAttr}>
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerA"></div>
      </section>
      <section class="scrolly-section" data-content-transition="slide-horizontal" ${thresholdAttr}>
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerB"></div>
      </section>
    `;
    return document.querySelectorAll('.scrolly-section');
  }

  it('con contentThreshold=0.25 no activa cuando el centro aún está por debajo del umbral de entrada', async () => {
    const sections = buildDom('data-content-threshold="0.25"');
    // innerHeight=800, hi = 0.75*800 = 600. Centro en 700 → 700 > 600 → no activa
    mockRect(sections[0], 650, 100);
    mockRect(sections[1], 5000, 100);

    await initEngine();

    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(false);
  });

  it('con contentThreshold=0.25 activa cuando el centro supera el umbral de entrada', async () => {
    const sections = buildDom('data-content-threshold="0.25"');
    // hi=600. Centro en 400 ≤ 600 → activa
    mockRect(sections[0], 350, 100);
    mockRect(sections[1], 5000, 100);

    await initEngine();

    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(true);
  });

  it('con contentThreshold=0.5 activa cuando el centro llega al centro exacto del viewport', async () => {
    const sections = buildDom('data-content-threshold="0.5"');
    // hi = 0.5*800 = 400. Centro en 400 → 400 > 400 = false → activa
    mockRect(sections[0], 350, 100);
    mockRect(sections[1], 5000, 100);

    await initEngine();

    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(true);
  });

  it('con contentThreshold=0.5 no activa cuando el centro aún está por debajo del centro del viewport', async () => {
    const sections = buildDom('data-content-threshold="0.5"');
    // hi=400. Centro en 600 → 600 > 400 → no activa
    mockRect(sections[0], 550, 100);
    mockRect(sections[1], 5000, 100);

    await initEngine();

    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(false);
  });

  it('threshold en la primera sección retrasa la activación de la segunda aunque la segunda no tenga el atributo', async () => {
    // Caso real: usuario pone contentThreshold solo en la primera sección.
    // El motor debe leer el threshold del grupo (primera sección) y aplicarlo
    // a todas, incluida la segunda cuando pasa a ser la más cercana.
    document.body.innerHTML = `
      <section class="scrolly-section" data-content-transition="slide-horizontal" data-content-threshold="0.25">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerA"></div>
      </section>
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerB"></div>
      </section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    // Activar sección A (centro en zona)
    mockRect(sections[0], 350, 100);
    mockRect(sections[1], 5000, 100);
    await initEngine();
    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(true);

    // Sección B llega al viewport pero fuera de la zona [200, 600]: center=700
    mockRect(sections[0], -2000, 100);
    mockRect(sections[1], 650, 100);
    setScrollY(100);
    window.dispatchEvent(new Event('scroll'));

    // Con threshold de grupo=0.25, sección B (center=700 > hi=600) NO debe activarse
    expect(document.getElementById('innerB').classList.contains('is-active')).toBe(false);
    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(true);
  });

  it('con contentThreshold, el contenido activo no se oculta al scrollear entre secciones (sin parpadeo)', async () => {
    const sections = buildDom('data-content-threshold="0.25"');
    // Activar sección A (centro en 400 ≤ hi=600)
    mockRect(sections[0], 350, 100);
    mockRect(sections[1], 5000, 100);

    await initEngine();
    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(true);

    // Scroll: sección A sube (centro a 100), sección B entra pero centro a 700 > hi=600.
    // La sección A sigue siendo la más cercana al centro del viewport o igual que B.
    // El contenido debe permanecer visible — sin ocultar ni cambiar.
    mockRect(sections[0], 50, 100);
    mockRect(sections[1], 650, 100);
    setScrollY(100);
    window.dispatchEvent(new Event('scroll'));

    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(true);
    expect(document.getElementById('innerB').classList.contains('is-active')).toBe(false);
  });
});

describe('scrollytelling.client.js — contentTransition: casos adicionales', () => {
  function buildContentSlideDom() {
    document.body.innerHTML = `
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerA"></div>
      </section>
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerB"></div>
      </section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    return { sectionA: sections[0], sectionB: sections[1] };
  }

  it('oculta el inner activo sin animación cuando el bloque sale por completo del viewport', async () => {
    const { sectionA, sectionB } = buildContentSlideDom();
    mockRect(sectionA, 0, 100);
    mockRect(sectionB, 2000, 100);

    await initEngine();
    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(true);

    mockRect(sectionA, 5000, 100);
    mockRect(sectionB, 6000, 100);
    window.dispatchEvent(new Event('scroll'));

    expect(document.getElementById('innerA').classList.contains('is-active')).toBe(false);
  });

  it('el transitionend del inner saliente lo limpia solo cuando la propiedad es transform', async () => {
    const { sectionA, sectionB } = buildContentSlideDom();
    mockRect(sectionA, 0, 100);
    mockRect(sectionB, 2000, 100);

    await initEngine();

    mockRect(sectionA, -2000, 100);
    mockRect(sectionB, 0, 100);
    setScrollY(100);
    window.dispatchEvent(new Event('scroll'));

    const innerA = document.getElementById('innerA');
    expect(innerA.classList.contains('is-leaving')).toBe(true);

    const irrelevant = new Event('transitionend');
    irrelevant.propertyName = 'opacity';
    innerA.dispatchEvent(irrelevant);
    expect(innerA.classList.contains('is-leaving')).toBe(true);

    const done = new Event('transitionend');
    done.propertyName = 'transform';
    innerA.dispatchEvent(done);
    expect(innerA.classList.contains('is-leaving')).toBe(false);
    expect(innerA.dataset.contentEnterFrom).toBeUndefined();
  });
});

describe('scrollytelling.client.js — scrollSync: casos adicionales', () => {
  it('cuando las dos secciones del par comparten fondo, lo deja fijo y esconde el resto de capas', async () => {
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <div class="scrolly-bg" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 0);
    mockRect(sections[1], 800, 0);
    setScrollY(0);

    await initEngine();

    const heroLayer = document.querySelector('[data-bg="hero"]');
    const forestLayer = document.querySelector('[data-bg="forest"]');
    expect(heroLayer.style.opacity).toBe('1');
    expect(heroLayer.style.zIndex).toBe('2');
    expect(forestLayer.style.opacity).toBe('0');
    expect(forestLayer.style.visibility).toBe('hidden');
  });

  it('aplica slide-vertical, fade-visibility y zoom-out con el zoomScale por defecto (0.15) en applySyncedTransition', async () => {
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <div class="scrolly-bg" data-bg="hero"></div>
      <div class="scrolly-bg" data-bg="forest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="zoom-out"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 0);
    mockRect(sections[1], 800, 0);
    setScrollY(0);

    await initEngine();

    const forestLayer = document.querySelector('[data-bg="forest"]');
    // progreso 0.5, zoomScale fallback 0.15: scale(lerp(1.15, 1, 0.5)) = 1.075
    expect(forestLayer.style.transform).toBe('scale(1.075)');
  });

  it('el contenido slide-horizontal en modo scrollSync interpola entre los dos inners del par', async () => {
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerA"></div>
      </section>
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerB"></div>
      </section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 0);
    mockRect(sections[1], 800, 0);
    setScrollY(0);

    await initEngine();

    expect(document.getElementById('innerA').style.transform).toBe('translate(-50vw, -50%)');
    expect(document.getElementById('innerB').style.transform).toBe('translate(50vw, -50%)');
  });

  it('esconde todos los inners de contenido cuando el par queda fuera del viewport', async () => {
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerA"></div>
      </section>
      <section class="scrolly-section" data-content-transition="slide-horizontal">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerB"></div>
      </section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 5000, 0);
    mockRect(sections[1], 6000, 0);
    setScrollY(0);

    await initEngine();

    expect(document.getElementById('innerA').style.transform).toBe('translate(100vw, -50%)');
    expect(document.getElementById('innerB').style.transform).toBe('translate(100vw, -50%)');
  });

  it('en modo scrollSync, respeta el umbral de entrada y el umbral de salida', async () => {
    // threshold=0.25 → hi=600 (entrada), lo=200 (salida)
    document.body.innerHTML = `
      <div id="scrollyStage" data-scroll-sync="true"></div>
      <section class="scrolly-section" data-content-transition="slide-horizontal" data-content-threshold="0.25">
        <div class="scrolly-inner" data-content-transition="slide-horizontal" id="innerA"></div>
      </section>
    `;
    const section = document.querySelector('.scrolly-section');

    // Centro=650 (> hi=600): umbral de entrada no cruzado → oculto a la derecha
    mockRect(section, 600, 100);
    await initEngine();
    const inner = document.getElementById('innerA');
    expect(inner.style.transform).toBe('translate(100vw, -50%)');
    expect(inner.style.opacity).toBe('0');

    // Centro=400 ([200,600]): zona visible → visible con fade
    mockRect(section, 350, 100);
    setScrollY(200);
    window.dispatchEvent(new Event('scroll'));
    expect(inner.style.transform).toBe('translate(0, -50%)');
    expect(inner.style.opacity).toBe('');

    // Centro=100 (< lo=200): umbral de salida superado → fade out temprano
    mockRect(section, 50, 100);
    setScrollY(1400);
    window.dispatchEvent(new Event('scroll'));
    expect(inner.style.transform).toBe('translate(0, -50%)');
    expect(inner.style.opacity).toBe('0');
  });
});

describe('scrollytelling.client.js — evento scrollytale:content-change', () => {
  function buildSlideDom({ scrollSync = false, ids = ['secA', 'secB'] } = {}) {
    const stage = scrollSync ? '<div id="scrollyStage" data-scroll-sync="true"></div>' : '';
    const sections = ids.map((id) => `
      <section class="scrolly-section" data-content-transition="slide-horizontal" data-bg-target="taller" id="${id}">
        <div class="scrolly-inner" data-content-transition="slide-horizontal"></div>
      </section>`).join('');
    document.body.innerHTML = stage + sections;
    return Array.from(document.querySelectorAll('.scrolly-section'));
  }

  it('en modo fire-and-forget, lanza el evento al activar la primera sección', async () => {
    const [secA, secB] = buildSlideDom();
    mockRect(secA, 0, 100);    // center=50 → en viewport
    mockRect(secB, 2000, 100);

    const events = [];
    document.addEventListener('scrollytale:content-change', (e) => events.push(e.detail));

    await initEngine();

    expect(events).toHaveLength(1);
    expect(events[0].index).toBe(0);
    expect(events[0].total).toBe(2);
    expect(events[0].section).toBe(secA);
    expect(events[0].bgTarget).toBe('taller');
    expect(events[0].id).toBe('secA');
  });

  it('en modo fire-and-forget, lanza el evento al cambiar de sección', async () => {
    const [secA, secB] = buildSlideDom();
    mockRect(secA, 0, 100);
    mockRect(secB, 2000, 100);

    const events = [];
    document.addEventListener('scrollytale:content-change', (e) => events.push(e.detail));

    await initEngine();
    events.length = 0; // limpiar evento inicial

    mockRect(secA, -2000, 100);
    mockRect(secB, 0, 100);
    setScrollY(100);
    window.dispatchEvent(new Event('scroll'));

    expect(events).toHaveLength(1);
    expect(events[0].index).toBe(1);
    expect(events[0].section).toBe(secB);
    expect(events[0].id).toBe('secB');
  });

  it('en modo fire-and-forget, lanza index=-1 cuando el bloque sale del viewport', async () => {
    const [secA, secB] = buildSlideDom();
    mockRect(secA, 0, 100);
    mockRect(secB, 2000, 100);

    const events = [];
    document.addEventListener('scrollytale:content-change', (e) => events.push(e.detail));

    await initEngine();
    events.length = 0;

    mockRect(secA, -5000, 100);
    mockRect(secB, -3000, 100);
    setScrollY(5000);
    window.dispatchEvent(new Event('scroll'));

    expect(events).toHaveLength(1);
    expect(events[0].index).toBe(-1);
    expect(events[0].section).toBeNull();
  });

  it('en modo scrollSync, lanza el evento cuando el slide entra en la zona visible', async () => {
    const [secA, secB] = buildSlideDom({ scrollSync: true });
    mockRect(secA, 2000, 100); // fuera del viewport
    mockRect(secB, 3000, 100);

    const events = [];
    document.addEventListener('scrollytale:content-change', (e) => events.push(e.detail));

    await initEngine();
    expect(events.filter((e) => e.index >= 0)).toHaveLength(0);

    mockRect(secA, 0, 100); // center=50, dentro del viewport
    setScrollY(1950);
    window.dispatchEvent(new Event('scroll'));

    expect(events.at(-1).index).toBe(0);
    expect(events.at(-1).total).toBe(2);
  });

  it('no lanza el evento repetidamente si el índice no cambia', async () => {
    const [secA, secB] = buildSlideDom();
    mockRect(secA, 0, 100);
    mockRect(secB, 2000, 100);

    const events = [];
    document.addEventListener('scrollytale:content-change', (e) => events.push(e.detail));

    await initEngine();
    const countAfterInit = events.length;

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));

    expect(events.length).toBe(countAfterInit); // sin duplicados
  });
});

describe('scrollytelling.client.js — barra de progreso: casos adicionales', () => {
  it('cuando el documento no scrollea (scrollHeight === clientHeight), el ancho es 0%', async () => {
    document.body.innerHTML = `<div id="threadFill"></div>`;
    setDocScroll({ scrollTop: 0, scrollHeight: 800, clientHeight: 800 });

    await initEngine();

    expect(document.getElementById('threadFill').style.width).toBe('0%');
  });
});

describe('scrollytelling.client.js — updatePinned', () => {
  it('añade is-visible al elemento pinned cuando la sección coincidente está centrada en el viewport', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="hero" id="pinned"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    mockRect(document.querySelector('.scrolly-section'), 0, 100);

    await initEngine();

    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(true);
  });

  it('no añade is-visible cuando ninguna sección coincidente tiene su centro en el viewport', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="hero" id="pinned"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    mockRect(document.querySelector('.scrolly-section'), 5000, 100);

    await initEngine();

    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(false);
  });

  it('gestiona múltiples elementos pinned de forma independiente', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="hero" id="pinnedHero"></div>
      <div class="scrolly-pinned" data-pinned-for="forest" id="pinnedForest"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="forest" data-bg-transition="fade"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 0, 100);
    mockRect(sections[1], 5000, 100);

    await initEngine();

    expect(document.getElementById('pinnedHero').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('pinnedForest').classList.contains('is-visible')).toBe(false);
  });

  it('pierde is-visible cuando la sección sale del viewport al scrollear', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="hero" id="pinned"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    mockRect(document.querySelector('.scrolly-section'), 0, 100);

    await initEngine();
    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(true);

    mockRect(document.querySelector('.scrolly-section'), 5000, 100);
    setScrollY(1000);
    window.dispatchEvent(new Event('scroll'));

    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(false);
  });

  it('con threshold=0.25 no muestra is-visible cuando el centro está fuera de la zona [25%,75%] del viewport', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="hero" data-threshold="0.25" id="pinned"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    // innerHeight=800 → zona válida: [200, 600]
    // centro en top=650, height=100 → center=700, fuera de zona
    mockRect(document.querySelector('.scrolly-section'), 650, 100);

    await initEngine();

    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(false);
  });

  it('con threshold=0.25 muestra is-visible cuando el centro está dentro de la zona [25%,75%] del viewport', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="hero" data-threshold="0.25" id="pinned"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    // innerHeight=800 → zona válida: [200, 600]
    // centro en top=350, height=100 → center=400, dentro de zona
    mockRect(document.querySelector('.scrolly-section'), 350, 100);

    await initEngine();

    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(true);
  });

  it('con threshold, mantiene is-visible al scrollear entre dos secciones del mismo bg sin parpadear', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="hero" data-threshold="0.25" id="pinned"></div>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="hero" data-bg-transition="fade"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    // innerHeight=800, threshold=0.25 → lo=200, hi=600
    // Sección A centro=100: ya salió por arriba del umbral (< lo)
    // Sección B centro=700: aún no ha entrado por abajo (> hi)
    // Ninguna está en zona pero el usuario está entre ellas → debe seguir visible
    mockRect(sections[0], 50, 100);
    mockRect(sections[1], 650, 100);

    await initEngine();

    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(true);
  });

  it('con varias secciones del mismo bg, is-visible persiste mientras al menos una esté en el viewport', async () => {
    document.body.innerHTML = `
      <div class="scrolly-pinned" data-pinned-for="taller" id="pinned"></div>
      <section class="scrolly-section" data-bg-target="taller" data-bg-transition="fade"></section>
      <section class="scrolly-section" data-bg-target="taller" data-bg-transition="fade"></section>
    `;
    const sections = document.querySelectorAll('.scrolly-section');
    mockRect(sections[0], 5000, 100);
    mockRect(sections[1], 0, 100);

    await initEngine();

    expect(document.getElementById('pinned').classList.contains('is-visible')).toBe(true);
  });
});

describe('scrollytelling.client.js — reinicio en astro:page-load', () => {
  it('limpia el observer y los listeners anteriores al reinicializarse', async () => {
    document.body.innerHTML = `<div class="scrolly-inner"></div>`;

    await initEngine();
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(false);

    document.dispatchEvent(new Event('astro:page-load'));

    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
    expect(FakeIntersectionObserver.instances[1].disconnected).toBe(false);
  });
});
