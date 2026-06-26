// playground.client.js
// Lógica exclusiva de la página /playground (herramienta de desarrollo,
// no forma parte del flujo de producción). Cuando cambias un select,
// escribe los nuevos data-attributes directamente en las <section> de
// demo, para que el motor de scrollytelling.client.js (que lee esos
// atributos en cada scroll) recoja el cambio sin recargar la página.
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

  applySelection();

  // Se exponen para poder inspeccionar el estado en tests.
  return { sectionA, sectionB, innerA, innerB, bgSelect, textSelect, triggerBtn, applySelection };
}
