import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';

// Esquema de un "panel" individual del scrollytelling.
// Cada entrada del array en paws.json se valida contra esto.
// Si falta un campo obligatorio o el tipo no coincide, Astro avisa en build/dev.
const pawsCollection = defineCollection({
  loader: file('src/content/paws.json'),
  schema: z.object({
    // Identificador único (requerido por el loader `file` para colecciones tipo array)
    id: z.string(),

    // Posición en el recorrido del scrollytelling. El loader de Astro para
    // colecciones tipo array NO conserva el orden del JSON (las reordena
    // por id), así que el orden real lo decide siempre este campo.
    order: z.number(),

    // Tipo de panel: determina qué componente se usa para renderizarlo
    type: z.enum(['hero', 'character', 'unbox', 'closing']),

    // A qué fondo del Stage debe cambiar la pantalla cuando este panel está visible
    bgTarget: z.string(),

    // Cómo entra el fondo al activarse este panel: "fade" (default),
    // "slide-horizontal", "slide-vertical", "fade-visibility". El
    // sentido del slide (izq/der o arriba/abajo) lo decide el JS según la
    // dirección de scroll; los zooms son simétricos y no dependen de ella.
    bgTransition: z
      .enum(['fade', 'slide-horizontal', 'slide-vertical', 'fade-visibility'])
      .optional(),

    // Cómo aparece el bloque de texto de este panel al entrar en el
    // viewport: "fade-up" (default), "fade-down", "slide-left",
    // "slide-right" o "zoom-in".
    textTransition: z
      .enum(['fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom-in'])
      .optional(),

    // --- Campos para type: "character" ---
    name: z.string().optional(),
    trait: z.string().optional(),
    line: z.string().optional(),
    quote: z.string().optional(),
    color: z.string().optional(),       // color del nombre (hex), por personaje
    image: z.string().optional(),       // ruta de la imagen del personaje
    imageAlt: z.string().optional(),
    align: z.enum(['left', 'right']).optional().default('left'),

    // --- Campos para type: "hero" ---
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),

    // --- Campos para type: "unbox" ---
    unboxTitle: z.string().optional(),
    items: z
      .array(
        z.object({
          label: z.string(),
          text: z.string(),
        })
      )
      .optional(),

    // --- Campos para type: "closing" ---
    manifesto: z.string().optional(), // admite <br> y <em> en el texto
    ctaLabel: z.string().optional(),
    ctaHref: z.string().optional(),
  }),
});

// Los fondos del Stage también viven en datos, para poder añadir/quitar
// escenas sin tocar el componente Stage.astro.
const backgroundsCollection = defineCollection({
  loader: file('src/content/backgrounds.json'),
  schema: z.object({
    id: z.string(),       // debe coincidir con el bgTarget usado en paws.json
    image: z.string(),    // ruta de la imagen de fondo (desktop/default)
    imageMobile: z.string().optional(), // ruta alternativa para mobile (<=560px); si falta, se usa `image`
  }),
});

export const collections = {
  paws: pawsCollection,
  backgrounds: backgroundsCollection,
};
