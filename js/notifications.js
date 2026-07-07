/* ============================================================
   NOTIFICATIONS — Alertas para eventos de agenda
   ============================================================ */
import { getState } from './store.js';
import { toast } from './components/toast.js';

const NOTIF_KEY  = 'inmocrm_notificados';
const MARGEN_MIN = 5;

/* ---- AudioContext compartido, desbloqueado en primer click ---- */
let _audioCtx = null;
let _audioDesbloqueado = false;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function desbloquearAudio() {
  if (_audioDesbloqueado) return;
  try {
    const ctx = getAudioCtx();
    // Reproducir silencio para desbloquear el contexto
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => { _audioDesbloqueado = true; });
    } else {
      _audioDesbloqueado = true;
    }
  } catch {}
}

// Desbloquear en cualquier interacción del usuario
['click', 'keydown', 'touchstart'].forEach(evt =>
  document.addEventListener(evt, desbloquearAudio, { once: false, passive: true })
);

/* ---- Sonido ---- */
export function tocar() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => _tocarInterno(ctx));
    } else {
      _tocarInterno(ctx);
    }
  } catch (e) {
    console.warn('[Notif] No se pudo reproducir sonido:', e);
  }
}

function _nota(ctx, freq, inicio, duracion, volumen = 0.35) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, inicio);
  gain.gain.setValueAtTime(0, inicio);
  gain.gain.linearRampToValueAtTime(volumen, inicio + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, inicio + duracion);
  osc.start(inicio);
  osc.stop(inicio + duracion);
}

function _tocarInterno(ctx) {
  const t = ctx.currentTime;
  // Chime: Do - Mi - Sol (acorde mayor ascendente)
  _nota(ctx, 523.25, t,        0.65, 0.55);   // Do4
  _nota(ctx, 659.25, t + 0.18, 0.65, 0.55);   // Mi4
  _nota(ctx, 783.99, t + 0.36, 0.80, 0.70);   // Sol4 (más larga, el remate)
}

/* ---- Registro de notificados ---- */
function notificados() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]')); }
  catch { return new Set(); }
}
function marcarNotificado(id) {
  const set = notificados();
  set.add(id);
  localStorage.setItem(NOTIF_KEY, JSON.stringify([...set].slice(-200)));
}

/* ---- Verificar eventos que tocan ahora ---- */
function verificar() {
  const { agenda } = getState();
  if (!agenda?.length) return;

  const ahora   = new Date();
  const ya_noto = notificados();

  agenda.forEach(evento => {
    if (evento.completado) return;
    if (!evento.fecha || !evento.hora) return;

    const claveNotif = `${evento.id}__${evento.fecha}__${evento.hora}`;
    if (ya_noto.has(claveNotif)) return;

    const eventoFecha = new Date(`${evento.fecha}T${evento.hora}:00`);
    const diffMin    = (eventoFecha - ahora) / 60000;

    if (diffMin <= MARGEN_MIN && diffMin >= -MARGEN_MIN) {
      disparar(evento);
      marcarNotificado(claveNotif);
    }
  });
}

/* ---- Disparar ---- */
function disparar(evento) {
  // 1. Sonido
  tocar();

  // 2. Toast dentro de la app (siempre funciona)
  toast(`📅 ${evento.titulo}${evento.hora ? ' · ' + evento.hora : ''}`, {
    tipo: 'warning',
    duracion: 8000,
  });

  // 3. Notificación del sistema operativo (si el usuario dio permiso)
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(`📅 ${evento.titulo}`, {
        body:    evento.notas || (evento.hora ? `Hora: ${evento.hora}` : 'Tenés un evento ahora'),
        tag:     evento.id,
        silent:  true,
      });
      n.onclick = () => { window.focus(); location.hash = '#/agenda'; n.close(); };
    } catch {}
  }
}

/* ---- Pedir permiso (debe llamarse desde un click del usuario) ---- */
export async function pedirPermiso() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/* ---- Alertas automáticas de contratos (una por sesión/día) ---- */
const KEY_AUTOS = 'inmocrm_autos_vistas';
function autosVistas() { try { return new Set(JSON.parse(localStorage.getItem(KEY_AUTOS)||'[]')); } catch { return new Set(); } }
function marcarAutoVista(id) { const s = autosVistas(); s.add(id); localStorage.setItem(KEY_AUTOS, JSON.stringify([...s].slice(-300))); }

function verificarAlertas() {
  // Import lazy para evitar dependencia circular
  import('./notificaciones.js').then(({ alertasAuto }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const vistas = autosVistas();
    alertasAuto().forEach(a => {
      const id = `${a.id}_${hoy}`;
      if (vistas.has(id)) return;
      marcarAutoVista(id);
      tocar();
      toast(`${a.titulo} — ${a.cuerpo}`, { tipo: 'warning', duracion: 10000 });
      if (Notification.permission === 'granted') {
        try {
          const n = new Notification(a.titulo, { body: a.cuerpo, tag: id, silent: true });
          n.onclick = () => { window.focus(); location.hash = `#/alquileres/${a.alqId}`; n.close(); };
        } catch {}
      }
    });
  }).catch(() => {});
}

/* ---- Inicializar ---- */
export function initNotifications() {
  verificar();
  setInterval(verificar, 60_000);
  // Alertas de contratos al arrancar (con delay para que cargue el store)
  setTimeout(verificarAlertas, 4000);
}
