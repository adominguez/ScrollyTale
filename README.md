# ScrollyTale

Motor de scrollytelling reutilizable para Astro: un fondo fijo a pantalla
completa con crossfade/slide entre escenas, sincronizado con secciones que
revelan su texto al entrar en el viewport.

## Instalación

```sh
npm install github:adominguez/ScrollyTale
```

`astro` es una `peerDependency`: el proyecto que consume el paquete debe
tener Astro instalado.

## Uso

```astro
---
import ScrollyStage from 'scrollytale/ScrollyStage.astro';
import ScrollySection from 'scrollytale/ScrollySection.astro';

const backgrounds = [
  { id: 'hero', image: '/assets/bg-hero.webp' },
  { id: 'forest', image: '/assets/bg-forest.webp', imageMobile: '/assets/bg-forest-mobile.webp' },
];
---

<ScrollyStage backgrounds={backgrounds}>
  <ScrollySection bg="hero" align="center">
    <h1>Hola</h1>
  </ScrollySection>
  <ScrollySection bg="forest" align="left" bgTransition="slide-horizontal" textTransition="fade-up">
    <p>Contenido de la sección</p>
  </ScrollySection>
</ScrollyStage>
```

### `ScrollyStage`

| Prop          | Tipo         | Default | Descripción |
| ------------- | ------------ | ------- | ----------- |
| `backgrounds` | `Background[]` | — | `{ id, image, imageMobile? }`. `imageMobile` se usa por debajo de 560px si está definida. |
| `scrollSync`  | `boolean`    | `false` | `false`: el fondo cambia con una transición de duración fija al activarse una sección. `true`: el progreso del fondo se calcula en cada frame a partir de la posición real de scroll (scrub). |

### `ScrollySection`

| Prop             | Tipo | Default | Descripción |
| ---------------- | ---- | ------- | ----------- |
| `bg`             | `string` | — | id del fondo a activar (debe existir en `backgrounds`). |
| `align`          | `'left' \| 'right' \| 'center'` | `'center'` | Alineación del bloque de texto. |
| `minH`           | `string` | `'100vh'` | Alto mínimo de la sección (cualquier valor CSS). |
| `id`             | `string` | — | id HTML opcional, para anclas. |
| `bgTransition`   | `'fade' \| 'slide-horizontal' \| 'slide-vertical' \| 'fade-visibility' \| 'zoom-in' \| 'zoom-out'` | `'fade'` | Cómo entra el fondo al activarse esta sección. |
| `bgZoomScale`    | `number` | `0.15` | Intensidad del efecto en `zoom-in`/`zoom-out` (fracción de escala respecto a 1). Sin efecto en el resto de `bgTransition`. |
| `contentTransition` | `'slide-horizontal'` | — | Slide horizontal del bloque de contenido al pasar entre secciones (incluso si comparten el mismo fondo). Compatible con `scrollSync`. Cuando se activa, `textTransition` se ignora (el motor JS gestiona el estado del inner directamente). |
| `textTransition` | `'fade-up' \| 'fade-down' \| 'slide-left' \| 'slide-right' \| 'zoom-in'` | `'fade-up'` | Cómo aparece el texto al entrar en el viewport. Sin efecto si `contentTransition` está activo. |

### `ScrollyPinned`

Contenido fijo anclado al viewport que aparece cuando alguna sección con el `bg` indicado está centrada en pantalla. Ideal para encabezados compartidos (`h2`, eyebrow…) que deben mantenerse visibles mientras el usuario scrollea por varias secciones con el mismo fondo.

```astro
import ScrollyPinned from 'scrollytale/ScrollyPinned.astro';
```

| Prop    | Tipo | Default | Descripción |
| ------- | ---- | ------- | ----------- |
| `bg`    | `string` | — | id del fondo cuyas secciones activan este elemento. Debe coincidir con el `bg` de las `ScrollySection` asociadas. |
| `align` | `'left' \| 'right' \| 'center'` | `'center'` | Alineación horizontal. |
| `top`      | `string` | `'20%'` | Posición vertical en el viewport (cualquier valor CSS, ej. `'15vh'`). |
| `maxWidth` | `string` | — | Ancho máximo del elemento (cualquier valor CSS, ej. `'800px'`, `'60ch'`). Si no se indica, usa el valor por defecto del alineador (`680px` para `center`, `560px` para `left`/`right`). |
| `id`       | `string` | — | id HTML opcional. |

**Ejemplo:**

```astro
<ScrollyStage backgrounds={backgrounds}>
  <ScrollyPinned bg="taller" align="center" top="20%">
    <h2>Título compartido para todas las secciones de "taller"</h2>
  </ScrollyPinned>

  <ScrollySection bg="taller" contentTransition="slide-horizontal">
    <h3>Slide 1</h3>
    <p>Contenido que desliza horizontalmente.</p>
  </ScrollySection>

  <ScrollySection bg="taller" contentTransition="slide-horizontal">
    <h3>Slide 2</h3>
    <p>El h2 de arriba se mantiene fijo.</p>
  </ScrollySection>
</ScrollyStage>
```

## CSS personalizable

El motor usa la custom property `--ease` para las transiciones (fallback:
`cubic-bezier(0.22, 0.61, 0.36, 1)` si el proyecto consumidor no la define).
Para alinear las transiciones con el resto de tu sitio, defínela en tu
propio CSS global:

```css
:root {
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
}
```
