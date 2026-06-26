// playground.client.js
// Lógica exclusiva de la página /playground (herramienta de desarrollo,
// no forma parte del flujo de producción). Cuando cambias un select,
// escribe los nuevos data-attributes directamente en las <section> de
// demo, para que el motor de scrollytelling.client.js (que lee esos
// atributos en cada scroll) recoja el cambio sin recargar la página.
//
// El checkbox de scrollSync es la excepción: como es una prop de
// <ScrollyStage> que el motor solo lee una vez al cargar el script, no se
// puede mutar en caliente, así que ese control recarga la página con/sin
// ?scrollSync=1 (ver playground.astro).
//
// Exportado como función para poder testearlo de forma aislada con
// jsdom sin depender de que el navegador ejecute <script type="module">
// (jsdom no soporta eso de forma fiable).

export function initPlaygroundControls(doc = document) {
  const sectionA = doc.getElementById('demoSectionA');
  const sectionB = doc.getElementById('demoSectionB');
  const innerA = sectionA.querySelector('.scrolly-inner');
  const innerB = sectionB.querySelector('.scrolly-inner');

  const bgSelect = doc.getElementById('bgTransitionSelect');
  const textSelect = doc.getElementById('textTransitionSelect');
  const triggerBtn = doc.getElementById('triggerBtn');
  const scrollSyncToggle = doc.getElementById('scrollSyncToggle');

  function applySelection() {
    const bgT = bgSelect.value;
    const textT = textSelect.value;
    [sectionA, sectionB].forEach((s) => (s.dataset.bgTransition = bgT));
    [innerA, innerB].forEach((i) => (i.dataset.textTransition = textT));
  }

  bgSelect.addEventListener('change', applySelection);
  textSelect.addEventListener('change', applySelection);

  // El botón "Disparar transición" alterna el scroll entre las dos
  // secciones de demo, para ver el efecto sin tener que scrollear a mano.
  let showingA = true;
  triggerBtn.addEventListener('click', () => {
    applySelection();
    const target = showingA ? sectionB : sectionA;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showingA = !showingA;
  });

  // scrollSync es una prop de <ScrollyStage> (decide a la carga de la
  // página qué motor usa el cliente), no un data-attribute mutable en
  // caliente como bgTransition/textTransition. Por eso el checkbox no
  // actualiza nada en vivo: recarga la página con/sin ?scrollSync=1.
  scrollSyncToggle.addEventListener('change', () => {
    const win = doc.defaultView;
    const url = new URL(win.location.href);
    if (scrollSyncToggle.checked) {
      url.searchParams.set('scrollSync', '1');
    } else {
      url.searchParams.delete('scrollSync');
    }
    win.location.href = url.toString();
  });

  applySelection();

  // Se exponen para poder inspeccionar el estado en tests.
  return {
    sectionA,
    sectionB,
    innerA,
    innerB,
    bgSelect,
    textSelect,
    triggerBtn,
    scrollSyncToggle,
    applySelection,
  };
}
