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
