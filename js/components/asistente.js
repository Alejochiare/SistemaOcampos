/* ============================================================
   COMPONENT · Asistente — bot de reglas que responde preguntas
   sobre cómo usar el sistema (no es IA: busca palabras clave en
   una base de respuestas ya escritas y contesta la que más
   coincide, con un botón directo a la sección si corresponde).
   ============================================================ */
import { icon } from '../config.js';
import { el, esc } from '../lib.js';
import { navegar } from '../router.js';

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n');
}

/* Cada tema tiene palabras clave (ya sin acentos) y una respuesta con pasos.
 * `ruta` es opcional: si está, el bot muestra un botón para ir directo ahí. */
const TEMAS = [
  {
    id: 'nuevo-cliente',
    keywords: ['cliente', 'clientes', 'cargar cliente', 'nuevo cliente', 'agregar cliente'],
    respuesta: `Para cargar un cliente:<br>
      1. Andá a la sección <strong>Clientes</strong>.<br>
      2. Arriba a la derecha, tocá el botón <strong>"Nuevo cliente"</strong>.<br>
      3. Completá sus datos de contacto (nombre, DNI, teléfono, email, domicilio).<br>
      4. Elegí qué está buscando (Alquilar / Comprar / Otro) y, si lo sabés, los detalles de la búsqueda — eso mejora las sugerencias automáticas de propiedades.<br>
      5. Guardá.`,
    ruta: 'clientes',
  },
  {
    id: 'nueva-propiedad',
    keywords: ['propiedad', 'propiedades', 'cargar propiedad', 'nueva propiedad', 'agregar propiedad', 'inmueble'],
    respuesta: `Para cargar una propiedad:<br>
      1. Andá a la sección <strong>Propiedades</strong>.<br>
      2. Tocá el botón <strong>"Nueva propiedad"</strong> arriba a la derecha.<br>
      3. Completá dirección, tipo, características y precio.<br>
      4. Guardá — va a quedar disponible para asociarla a un alquiler o una venta.`,
    ruta: 'propiedades',
  },
  {
    id: 'nuevo-propietario',
    keywords: ['propietario', 'propietarios', 'dueno', 'dueños', 'nuevo propietario'],
    respuesta: `Para cargar un propietario:<br>
      1. Andá a la sección <strong>Propietarios</strong>.<br>
      2. Tocá <strong>"Nuevo propietario"</strong> arriba a la derecha.<br>
      3. Completá sus datos y guardá.`,
    ruta: 'propietarios',
  },
  {
    id: 'nuevo-contrato',
    keywords: ['contrato', 'alquiler', 'alquileres', 'nuevo contrato', 'nuevo alquiler', 'inquilino'],
    respuesta: `Para cargar un contrato de alquiler:<br>
      1. Andá a la sección <strong>Alquileres</strong>.<br>
      2. Tocá <strong>"Nuevo contrato"</strong>.<br>
      3. Elegí el inquilino y la propiedad, cargá fechas, monto y moneda.<br>
      4. Definí el tipo de ajuste (fijo, ICL o IPC) y cada cuántos meses se aplica.<br>
      5. Guardá — el contrato va a aparecer en el listado con su estado (activo, por vencer, etc.).`,
    ruta: 'alquileres',
  },
  {
    id: 'registrar-cobro',
    keywords: ['cobro', 'cobros', 'registrar cobro', 'cobrar', 'pago', 'pagos', 'mes pagado'],
    respuesta: `Para registrar un cobro:<br>
      1. Entrá al contrato desde <strong>Alquileres</strong> (tocá el inquilino en la lista).<br>
      2. Buscá el mes correspondiente en "Cobros mes a mes" y tocá <strong>"Cobrar"</strong>, o usá el botón <strong>"Registrar cobro"</strong> / <strong>"Agregar"</strong>.<br>
      3. Confirmá el monto y el medio de pago.<br>
      Si un contrato tiene meses vencidos sin cobrar, van a aparecer marcados como pendientes.`,
    ruta: 'alquileres',
  },
  {
    id: 'registrar-aumento',
    keywords: ['aumento', 'aumentos', 'ajuste', 'ajustes', 'icl', 'ipc', 'indice', 'subir el alquiler', 'actualizar el alquiler'],
    respuesta: `Para registrar un aumento (ICL, IPC o fijo):<br>
      1. Entrá al contrato desde <strong>Alquileres</strong>.<br>
      2. Si tiene un ajuste pendiente, vas a ver un cartel amarillo <strong>"Contrato por aumentar"</strong> con el botón <strong>"Registrar aumento"</strong>.<br>
      3. Si es por ICL o IPC, el sistema calcula solo el % real correspondiente al período pactado (no te suma de más si te atrasaste en aplicarlo).<br>
      4. Podés sumar un % extra acordado con el inquilino, revisar el monto nuevo y confirmar.<br>
      También podés ver todos los contratos con aumento pendiente filtrando por <strong>"Necesitan aumento"</strong> en Alquileres, o desde la tarjeta "Contratos por aumentar" en Inicio.`,
    ruta: 'alquileres',
  },
  {
    id: 'nueva-venta',
    keywords: ['venta', 'ventas', 'vender', 'comprador', 'nueva venta'],
    respuesta: `Para cargar una venta:<br>
      1. Andá a la sección <strong>Ventas</strong>.<br>
      2. Tocá <strong>"Nueva venta"</strong>.<br>
      3. Elegí comprador y propiedad, cargá precio y estado de la operación.<br>
      4. Guardá — vas a poder ir actualizando el estado (seña, escrituración, etc.) desde ahí.`,
    ruta: 'ventas',
  },
  {
    id: 'agenda',
    keywords: ['agenda', 'evento', 'eventos', 'recordatorio', 'turno', 'cita'],
    respuesta: `Para agendar un evento o recordatorio:<br>
      1. Andá a <strong>Agenda</strong>.<br>
      2. Tocá <strong>"Nuevo evento"</strong>, cargá título, fecha y hora.<br>
      3. Si le ponés hora, el sistema te avisa con sonido y notificación cuando llegue el momento.`,
    ruta: 'agenda',
  },
  {
    id: 'caja',
    keywords: ['caja', 'ingreso', 'egreso', 'cerrar el dia', 'cerrar caja', 'saldo'],
    respuesta: `Para manejar la caja diaria:<br>
      1. Andá a <strong>Caja</strong>.<br>
      2. Usá <strong>"Registrar ingreso"</strong> o <strong>"Registrar egreso"</strong> para cada movimiento.<br>
      3. Cuando termina el día, tocá <strong>"Cerrar el día"</strong> para dejarlo asentado.`,
    ruta: 'caja',
  },
  {
    id: 'temporales',
    keywords: ['temporal', 'temporales', 'reserva', 'reservas', 'alquiler temporario'],
    respuesta: `Para cargar una reserva temporaria:<br>
      1. Andá a <strong>Temporales</strong>.<br>
      2. Tocá <strong>"Nueva reserva"</strong> y completá huésped, propiedad y fechas.`,
    ruta: 'temporales',
  },
  {
    id: 'liquidaciones',
    keywords: ['liquidacion', 'liquidaciones', 'liquidar'],
    respuesta: `Las liquidaciones (a propietarios, por los alquileres cobrados) se generan desde la sección <strong>Liquidaciones</strong>, o también podés imprimir la liquidación de un cobro puntual desde el detalle del contrato en Alquileres.`,
    ruta: 'liquidaciones',
  },
  {
    id: 'buscar',
    keywords: ['buscar', 'busqueda', 'encontrar'],
    respuesta: `Podés usar el buscador general de arriba (o el atajo <strong>Ctrl/Cmd + K</strong>) para encontrar clientes, propiedades, alquileres o ventas por nombre, dirección o teléfono.`,
  },
  {
    id: 'notificaciones',
    keywords: ['notificacion', 'notificaciones', 'campanita', 'alertas', 'badge'],
    respuesta: `La campanita de arriba muestra alertas de clientes sin seguimiento, contratos por vencer y eventos de hoy. El número al lado de "Alquileres" en el menú son los meses de cobro vencidos sin registrar.`,
  },
  {
    id: 'tema',
    keywords: ['tema oscuro', 'modo oscuro', 'modo claro', 'cambiar tema', 'dark mode'],
    respuesta: `Para cambiar entre tema claro y oscuro, tocá el ícono de sol/luna arriba a la derecha.`,
  },
];

const SUGERENCIAS = [
  '¿Cómo cargo un cliente?',
  '¿Cómo registro un cobro?',
  '¿Cómo hago un aumento de ICL?',
  '¿Cómo cierro la caja?',
];

function buscarRespuesta(texto) {
  const q = normalizar(texto);
  let mejor = null;
  let mejorScore = 0;
  for (const tema of TEMAS) {
    let score = 0;
    for (const kw of tema.keywords) {
      if (q.includes(normalizar(kw))) score += kw.split(' ').length; // frases completas pesan más
    }
    if (score > mejorScore) { mejorScore = score; mejor = tema; }
  }
  return mejor;
}

function mensajeBienvenida() {
  return `¡Hola! Soy el asistente de InmoCRM 🙂 Preguntame cómo hacer algo en el sistema, por ejemplo:<br><br>
    ${SUGERENCIAS.map(s => `• ${esc(s)}`).join('<br>')}`;
}

export function initAsistente() {
  const btn = el(`
    <button class="asistente-fab" id="asistenteBtn" aria-label="Ayuda">
      ${icon('message')}
    </button>`);
  const panel = el(`
    <div class="asistente-panel" id="asistentePanel" style="display:none">
      <div class="asistente-head">
        <strong>Asistente</strong>
        <button class="icon-btn" id="asistenteCerrar" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="asistente-msgs" id="asistenteMsgs"></div>
      <form class="asistente-input" id="asistenteForm">
        <input id="asistenteInput" placeholder="Escribí tu pregunta…" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-sm">${icon('check')}</button>
      </form>
    </div>`);

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const msgs = panel.querySelector('#asistenteMsgs');
  let abierto = false;
  let saludoMostrado = false;

  const agregarMensaje = (html, propio = false) => {
    const burbuja = el(`<div class="asistente-msg ${propio ? 'propio' : ''}">${html}</div>`);
    msgs.appendChild(burbuja);
    msgs.scrollTop = msgs.scrollHeight;
  };

  const responder = (texto) => {
    agregarMensaje(esc(texto), true);
    const tema = buscarRespuesta(texto);
    setTimeout(() => {
      if (!tema) {
        agregarMensaje(`No estoy seguro de eso todavía. Probá preguntar por algo puntual, como:<br><br>${SUGERENCIAS.map(s => `• ${esc(s)}`).join('<br>')}`);
        return;
      }
      agregarMensaje(tema.respuesta);
      if (tema.ruta) {
        const rutaLabel = tema.ruta.charAt(0).toUpperCase() + tema.ruta.slice(1);
        const boton = el(`<button class="btn btn-xs btn-primary" style="margin-top:.5rem">Ir a ${rutaLabel} →</button>`);
        boton.addEventListener('click', () => { navegar(tema.ruta); panel.style.display = 'none'; abierto = false; });
        msgs.lastElementChild.appendChild(document.createElement('br'));
        msgs.lastElementChild.appendChild(boton);
        msgs.scrollTop = msgs.scrollHeight;
      }
    }, 300);
  };

  btn.addEventListener('click', () => {
    abierto = !abierto;
    panel.style.display = abierto ? 'flex' : 'none';
    if (abierto && !saludoMostrado) {
      agregarMensaje(mensajeBienvenida());
      saludoMostrado = true;
    }
    if (abierto) panel.querySelector('#asistenteInput')?.focus();
  });
  panel.querySelector('#asistenteCerrar').addEventListener('click', () => { abierto = false; panel.style.display = 'none'; });

  panel.querySelector('#asistenteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = panel.querySelector('#asistenteInput');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    responder(texto);
  });
}
