import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ScrollyStage from '../src/ScrollyStage.astro';

const backgrounds = [
  { id: 'hero', image: '/bg-hero.webp' },
  { id: 'forest', image: '/bg-forest.webp', imageMobile: '/bg-forest-mobile.webp' },
];

async function render(props: Record<string, unknown>) {
  const container = await AstroContainer.create();
  return container.renderToString(ScrollyStage, {
    props,
    slots: { default: '<p>secciones</p>' },
  });
}

describe('ScrollyStage.astro', () => {
  it('pinta una capa .scrolly-bg por cada fondo, con la primera activa', async () => {
    const html = await render({ backgrounds });
    expect(html).toContain('data-bg="hero"');
    expect(html).toContain('data-bg="forest"');
    expect(html).toMatch(/class="scrolly-bg is-active"[^>]*data-bg="hero"/);
    expect(html).not.toMatch(/class="scrolly-bg is-active"[^>]*data-bg="forest"/);
  });

  it('el primer fondo (index 0) expone image e imageMobile como custom properties inline', async () => {
    const html = await render({ backgrounds });
    expect(html).toContain("--bg-image:url('/bg-hero.webp');");
  });

  it('scrollSync por defecto es false y se serializa como string en data-scroll-sync', async () => {
    const html = await render({ backgrounds });
    expect(html).toContain('data-scroll-sync="false"');
  });

  it('scrollSync=true se serializa como "true"', async () => {
    const html = await render({ backgrounds, scrollSync: true });
    expect(html).toContain('data-scroll-sync="true"');
  });

  it('incluye el contenido del slot y carga el script del motor', async () => {
    const html = await render({ backgrounds });
    expect(html).toContain('secciones');
    expect(html).toMatch(/<script type="module" src="[^"]+"><\/script>/);
  });
});

describe('ScrollyStage.astro — overlay', () => {
  it('sin overlay, usa el gradient oscuro por defecto', async () => {
    const html = await render({ backgrounds });
    expect(html).toMatch(/<div class="scrolly-overlay" id="scrollyOverlay" style="background:linear-gradient\(180deg, rgba\(10, 8, 6, 0\.35\) 0%, rgba\(10, 8, 6, 0\.55\) 100%\);"/);
  });

  it('overlay con un valor CSS custom lo aplica como background', async () => {
    const html = await render({ backgrounds, overlay: 'rgba(0, 0, 0, 0.6)' });
    expect(html).toContain('<div class="scrolly-overlay" id="scrollyOverlay" style="background:rgba(0, 0, 0, 0.6);"');
  });

  it('overlay={false} deja la capa en el DOM (el motor la necesita para secciones que sí quieran overlay) pero con background transparent', async () => {
    const html = await render({ backgrounds, overlay: false });
    expect(html).toContain('<div class="scrolly-overlay" id="scrollyOverlay" style="background:transparent;"');
  });
});

describe('ScrollyStage.astro — backgrounds de imagen: lazy-load', () => {
  it('el primer fondo (index 0) no lleva data-image-src (ya viene con --bg-image inline)', async () => {
    const html = await render({ backgrounds });
    const heroTag = html.match(/<div[^>]*data-bg="hero"[^>]*>/)?.[0] ?? '';
    expect(heroTag).not.toContain('data-image-src');
    expect(heroTag).not.toContain('data-image-mobile-src');
  });

  it('los fondos posteriores al primero no llevan --bg-image inline, solo data-image-src/data-image-mobile-src', async () => {
    const html = await render({ backgrounds });
    const forestTag = html.match(/<div[^>]*data-bg="forest"[^>]*>/)?.[0] ?? '';
    expect(forestTag).not.toContain('--bg-image:');
    expect(forestTag).toContain('data-image-src="/bg-forest.webp"');
    expect(forestTag).toContain('data-image-mobile-src="/bg-forest-mobile.webp"');
  });

  it('sin imageMobile, no incluye data-image-mobile-src', async () => {
    const html = await render({
      backgrounds: [
        { id: 'hero', image: '/bg-hero.webp' },
        { id: 'forest', image: '/bg-forest.webp' },
      ],
    });
    const forestTag = html.match(/<div[^>]*data-bg="forest"[^>]*>/)?.[0] ?? '';
    expect(forestTag).not.toContain('data-image-mobile-src');
  });
});

describe('ScrollyStage.astro — backgrounds de vídeo', () => {
  it('pinta un <video> con class scrolly-bg--video en vez de un <div> para type="video"', async () => {
    const html = await render({
      backgrounds: [
        { id: 'intro', type: 'video', video: '/bg-intro.mp4' },
        { id: 'forest', image: '/bg-forest.webp' },
      ],
    });
    expect(html).toMatch(/<video class="scrolly-bg scrolly-bg--video is-active"[^>]*data-bg="intro"/);
    expect(html).toMatch(/<div class="scrolly-bg"[^>]*data-bg="forest"/);
  });

  it('el <video> lleva muted, loop y playsinline, sin autoplay', async () => {
    const html = await render({
      backgrounds: [{ id: 'intro', type: 'video', video: '/bg-intro.mp4' }],
    });
    const videoTag = html.match(/<video[^>]*data-bg="intro"[^>]*>/)?.[0] ?? '';
    expect(videoTag).toContain('muted');
    expect(videoTag).toContain('loop');
    expect(videoTag).toContain('playsinline');
    expect(videoTag).not.toContain('autoplay');
  });

  describe('primer fondo (index 0): se carga de inmediato', () => {
    const videoBackgrounds = [
      {
        id: 'intro',
        type: 'video',
        video: '/bg-intro.mp4',
        videoMobile: '/bg-intro-mobile.mp4',
        poster: '/bg-intro.webp',
      },
      { id: 'forest', image: '/bg-forest.webp' },
    ];

    it('incluye <source> de video y videoMobile con el media query de 560px, y el poster', async () => {
      const html = await render({ backgrounds: videoBackgrounds });
      expect(html).toContain('<source src="/bg-intro-mobile.mp4" media="(max-width: 560px)"');
      expect(html).toContain('<source src="/bg-intro.mp4"');
      expect(html).toContain('poster="/bg-intro.webp"');
    });

    it('preload es "auto" y no lleva data-video-src (ya viene con <source>)', async () => {
      const html = await render({ backgrounds: videoBackgrounds });
      const videoTag = html.match(/<video[^>]*data-bg="intro"[^>]*>/)?.[0] ?? '';
      expect(videoTag).toContain('preload="auto"');
      expect(videoTag).not.toContain('data-video-src');
    });

    it('sin videoMobile, no incluye el <source> de mobile', async () => {
      const html = await render({
        backgrounds: [{ id: 'intro', type: 'video', video: '/bg-intro.mp4' }],
      });
      expect(html).not.toContain('media="(max-width: 560px)"');
      expect(html).toContain('<source src="/bg-intro.mp4"');
    });
  });

  describe('fondos de vídeo posteriores al primero: lazy-load', () => {
    const videoBackgrounds = [
      { id: 'hero', image: '/bg-hero.webp' },
      {
        id: 'intro',
        type: 'video',
        video: '/bg-intro.mp4',
        videoMobile: '/bg-intro-mobile.mp4',
        poster: '/bg-intro.webp',
      },
    ];

    it('no incluye ningún <source>, solo data-video-src/data-video-mobile-src con las URLs', async () => {
      const html = await render({ backgrounds: videoBackgrounds });
      const videoTag = html.match(/<video[^>]*data-bg="intro"[^>]*>/)?.[0] ?? '';
      expect(videoTag).not.toContain('<source');
      expect(videoTag).toContain('data-video-src="/bg-intro.mp4"');
      expect(videoTag).toContain('data-video-mobile-src="/bg-intro-mobile.mp4"');
      expect(videoTag).toContain('poster="/bg-intro.webp"');
    });

    it('preload es "none"', async () => {
      const html = await render({ backgrounds: videoBackgrounds });
      const videoTag = html.match(/<video[^>]*data-bg="intro"[^>]*>/)?.[0] ?? '';
      expect(videoTag).toContain('preload="none"');
    });
  });
});
