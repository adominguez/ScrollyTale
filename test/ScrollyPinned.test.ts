import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ScrollyPinned from '../src/ScrollyPinned.astro';

async function render(props: Record<string, unknown>, slot = 'contenido') {
  const container = await AstroContainer.create();
  return container.renderToString(ScrollyPinned, {
    props,
    slots: { default: slot },
  });
}

describe('ScrollyPinned.astro', () => {
  it('aplica los valores por defecto', async () => {
    const html = await render({ bg: 'hero' });
    expect(html).toContain('data-pinned-for="hero"');
    expect(html).toContain('scrolly-pinned--center');
    expect(html).toContain('style="top: 20%"');
    expect(html).toContain('contenido');
  });

  it('no añade id cuando no se pasa', async () => {
    const html = await render({ bg: 'hero' });
    expect(html).not.toMatch(/<div[^>]*\sid=/);
  });

  it('propaga align left a la clase CSS correcta', async () => {
    const html = await render({ bg: 'hero', align: 'left' });
    expect(html).toContain('scrolly-pinned--left');
    expect(html).not.toContain('scrolly-pinned--center');
    expect(html).not.toContain('scrolly-pinned--right');
  });

  it('propaga align right a la clase CSS correcta', async () => {
    const html = await render({ bg: 'forest', align: 'right' });
    expect(html).toContain('scrolly-pinned--right');
    expect(html).not.toContain('scrolly-pinned--center');
    expect(html).not.toContain('scrolly-pinned--left');
  });

  it('propaga un top personalizado al style inline', async () => {
    const html = await render({ bg: 'hero', top: '15vh' });
    expect(html).toContain('style="top: 15vh"');
  });

  it('propaga el id cuando se pasa', async () => {
    const html = await render({ bg: 'hero', id: 'titulo-pinned' });
    expect(html).toContain('id="titulo-pinned"');
  });

  it('renderiza el contenido del slot', async () => {
    const html = await render({ bg: 'taller' }, '<h2>Título compartido</h2>');
    expect(html).toContain('<h2>Título compartido</h2>');
  });

  it('el bg se propaga tanto a data-pinned-for como al nombre del fondo objetivo', async () => {
    const html = await render({ bg: 'taller' });
    expect(html).toContain('data-pinned-for="taller"');
  });

  it('propaga maxWidth como max-width en el style inline', async () => {
    const html = await render({ bg: 'hero', maxWidth: '800px' });
    expect(html).toContain('max-width: 800px');
  });

  it('no añade max-width al style cuando maxWidth no se pasa', async () => {
    const html = await render({ bg: 'hero' });
    expect(html).not.toContain('max-width');
  });
});
