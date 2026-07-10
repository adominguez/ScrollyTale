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
  { id: 'intro', type: 'video', video: '/assets/bg-intro.mp4', poster: '/assets/bg-intro.webp' },
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
| `backgrounds` | `Background[]` | — | `{ id, type?, image?, imageMobile?, video?, videoMobile?, poster? }`. `type` es `'image'` (default) o `'video'`. Con `type: 'image'`: `imageMobile` se usa por debajo de 560px si está definida. Con `type: 'video'`: `video` es la URL del vídeo (se reproduce en loop, muted, sin controles); `videoMobile` es el equivalente a `imageMobile` pero para vídeo, vía `<source media="(max-width: 560px)">` (el navegador solo lo reevalúa al cargar el recurso, no en cada resize en vivo); `poster` es opcional y se muestra mientras el vídeo carga. El motor cliente hace play()/pause() automáticamente según qué fondo esté visible, para no gastar recursos con vídeos fuera de pantalla. Además, solo el primer fondo (el que se ve al cargar la página) se descarga de inmediato; el resto de vídeos se cargan de forma lazy, justo cuando el usuario está a punto de llegar a la sección que los activa. |
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
| `contentThreshold`  | `number` | `0` | Umbral de entrada (0–1): controla cuán adentro del viewport debe estar el centro de la sección antes de que active su contenido. `0` = activa en cuanto el centro entra por el borde inferior; `0.5` = activa solo cuando el centro alcanza el centro exacto del viewport; `0.9` = activa muy tarde. Solo tiene efecto con `contentTransition`. Es un **valor de grupo**: basta con declararlo en una sola sección del bloque. |
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
| `maxWidth`   | `string` | — | Ancho máximo del elemento (cualquier valor CSS, ej. `'800px'`, `'60ch'`). Si no se indica, usa el valor por defecto del alineador (`680px` para `center`, `560px` para `left`/`right`). |
| `threshold`  | `number` | `0` | Fracción del viewport (0–1) que se recorta por arriba y por abajo para calcular la zona de visibilidad. Con `0` el elemento aparece en cuanto el centro de la sección roza el borde del viewport; con `0.25` solo aparece cuando ese centro está entre el 25 % y el 75 % de la altura de pantalla. |
| `id`         | `string` | — | id HTML opcional. |

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
