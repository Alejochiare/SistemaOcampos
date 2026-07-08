/* ============================================================
   APP — Punto de entrada de la aplicación.
   Orquesta el arranque: datos → UI persistente → router.
   ------------------------------------------------------------
   El orden importa:
   1) initStore()  carga la "base" (api/localStorage) al estado.
   2) initSidebar() + initTopbar() montan el chrome persistente
      y se suscriben al store para mantenerse vivos. s
   ============================================================ */
import { initStore } from './store.js';
import { initSidebar } from './components/sidebar.js';
import { initTopbar } from './components/topbar.js';
import { initRouter } from './router.js';
import { initNotifications } from './notifications.js';
import { $ } from './lib.js';
import { cargarDatosDemo } from './data.js';

async function boot() {
  // Pantalla de carga mínima mientras se hidrata el estado
  const root = $('#viewRoot');
  if (root) root.innerHTML = '<div class="view"><div class="spinner"></div></div>';

  // Cargar datos de demostración si la BD está vacía
  await cargarDatosDemo();

  await initStore();   // hidrata leads/propiedades/tareas/usuarios
  initSidebar();          // navegación + badges en vivo
  initTopbar();           // tema, colapso, búsqueda global, notificaciones
  initRouter();           // resuelve y renderiza la vista del hash
  initNotifications();    // alertas del SO para eventos de agenda

  // Atajo de teclado: Ctrl/Cmd + K enfoca la búsqueda global
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#globalSearch')?.focus();
    }
  });
}

boot().catch(err => {
  console.error('Error al iniciar InmoTrack:', err);
  const root = document.getElementById('viewRoot');
  if (root) root.innerHTML = `<div class="view"><div class="empty"><h3>No se pudo iniciar la aplicación</h3><p>${err.message}</p></div></div>`;
});
