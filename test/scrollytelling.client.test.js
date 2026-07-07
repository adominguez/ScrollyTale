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
});

describe('scrollytelling.client.js — barra de progreso: casos adicionales', () => {
  it('cuando el documento no scrollea (scrollHeight === clientHeight), el ancho es 0%', async () => {
    document.body.innerHTML = `<div id="threadFill"></div>`;
    setDocScroll({ scrollTop: 0, scrollHeight: 800, clientHeight: 800 });

    await initEngine();

    expect(document.getElementById('threadFill').style.width).toBe('0%');
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
