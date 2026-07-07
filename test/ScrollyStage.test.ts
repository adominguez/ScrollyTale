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

  it('expone image e imageMobile como custom properties', async () => {
    const html = await render({ backgrounds });
    expect(html).toContain("--bg-image:url('/bg-hero.webp');");
    expect(html).toContain("--bg-image:url('/bg-forest.webp');--bg-image-mobile:url('/bg-forest-mobile.webp');");
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
