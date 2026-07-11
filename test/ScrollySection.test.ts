import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ScrollySection from '../src/ScrollySection.astro';

async function render(props: Record<string, unknown>, slot = 'contenido') {
  const container = await AstroContainer.create();
  return container.renderToString(ScrollySection, {
    props,
    slots: { default: slot },
  });
}

describe('ScrollySection.astro', () => {
  it('aplica los valores por defecto', async () => {
    const html = await render({ bg: 'hero' });
    expect(html).toContain('data-bg-target="hero"');
    expect(html).toContain('data-bg-transition="fade"');
    expect(html).toContain('data-bg-zoom-scale="0.15"');
    expect(html).toContain('style="min-height:100vh"');
    expect(html).toContain('scrolly-inner--center');
    expect(html).toContain('data-text-transition="fade-up"');
    expect(html).toContain('contenido');
  });

  it('no añade id ni data-content-transition cuando no se pasan', async () => {
    const html = await render({ bg: 'hero' });
    expect(html).not.toContain('data-content-transition');
    expect(html).not.toMatch(/<section[^>]*\sid=/);
  });

  it('propaga align, minH e id a la sección', async () => {
    const html = await render({ bg: 'forest', align: 'left', minH: '120vh', id: 'cierre' });
    expect(html).toContain('scrolly-inner--left');
    expect(html).toContain('style="min-height:120vh"');
    expect(html).toContain('id="cierre"');
  });

  it('propaga bgTransition y bgZoomScale', async () => {
    const html = await render({ bg: 'forest', bgTransition: 'zoom-in', bgZoomScale: 0.3 });
    expect(html).toContain('data-bg-transition="zoom-in"');
    expect(html).toContain('data-bg-zoom-scale="0.3"');
  });

  it('cuando hay contentTransition, ignora textTransition y marca data-content-transition en section e inner', async () => {
    const html = await render({ bg: 'hero', contentTransition: 'slide-horizontal', textTransition: 'zoom-in' });
    expect(html).toContain('data-content-transition="slide-horizontal"');
    expect(html).not.toContain('data-text-transition');
  });

  it('con contentTransition, emite data-content-threshold con el valor por defecto (0)', async () => {
    const html = await render({ bg: 'hero', contentTransition: 'slide-horizontal' });
    expect(html).toContain('data-content-threshold="0"');
  });

  it('con contentTransition, propaga contentThreshold personalizado a data-content-threshold', async () => {
    const html = await render({ bg: 'hero', contentTransition: 'slide-horizontal', contentThreshold: 0.25 });
    expect(html).toContain('data-content-threshold="0.25"');
  });

  it('sin contentTransition, no emite data-content-threshold', async () => {
    const html = await render({ bg: 'hero' });
    expect(html).not.toContain('data-content-threshold');
  });

  it('sin overlay, no emite data-overlay (el motor hereda el del Stage)', async () => {
    const html = await render({ bg: 'hero' });
    expect(html).not.toContain('data-overlay');
  });

  it('con overlay como valor CSS, lo propaga tal cual en data-overlay', async () => {
    const html = await render({ bg: 'hero', overlay: 'rgba(0, 0, 0, 0.6)' });
    expect(html).toContain('data-overlay="rgba(0, 0, 0, 0.6)"');
  });

  it('con overlay={false}, emite data-overlay="transparent"', async () => {
    const html = await render({ bg: 'hero', overlay: false });
    expect(html).toContain('data-overlay="transparent"');
  });
});
