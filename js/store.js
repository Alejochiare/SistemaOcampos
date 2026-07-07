/* ============================================================
   STORE — Estado central + selectores de negocio
   ============================================================ */
import { api } from './data.js';
import { diasEntre } from './lib.js';
import { ALERTA_DIAS, ALERTA_VENCIMIENTO_DIAS } from './config.js';

/* Configuración del sitio web público: se guarda en localStorage,
   en la MISMA clave que lee public/js/site.js, para que el sitio
   estático la muestre sin necesidad de ningún backend. */
const SITE_SETTINGS_KEY = 'inmocrm_site_settings';

function leerSiteSettings() {
  try { return JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY)) || {}; }
  catch { return {}; }
}
function guardarSiteSettings(s) {
  localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(s));
}

const state = {
  clientes: [], propietarios: [], propiedades: [], alquileres: [], ventas: [], agenda: [], caja: [], temporales: [], liquidaciones: [],
  siteSettings: leerSiteSettings(),
  loaded: false,
};

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { subs.forEach(fn => fn(state)); }

export function getState() { return state; }

export async function initStore() {
  const snap = await api.snapshot();
  Object.assign(state, snap, { loaded: true });
  emit();
}

async function refresh() {
  const snap = await api.snapshot();
  Object.assign(state, snap);
  emit();
}

/* ============================================================
   ACCIONES
   ============================================================ */
export const actions = {
  /* Clientes */
  async createCliente(d)         { await api.createCliente(d); await refresh(); },
  async updateCliente(id, p)     { await api.updateCliente(id, p); await refresh(); },
  async deleteCliente(id)        { await api.deleteCliente(id); await refresh(); },
  async addSeguimiento(id, nota) { await api.addSeguimiento(id, nota); await refresh(); },

  /* Propietarios */
  async createPropietario(d)           { await api.createPropietario(d); await refresh(); },
  async updatePropietario(id, p)       { await api.updatePropietario(id, p); await refresh(); },
  async deletePropietario(id)          { await api.deletePropietario(id); await refresh(); },
  async addSeguimientoPropietario(id, nota) { await api.addSeguimientoPropietario(id, nota); await refresh(); },

  /* Propiedades */
  async createPropiedad(d)       { await api.createPropiedad(d); await refresh(); },
  async updatePropiedad(id, p)   { await api.updatePropiedad(id, p); await refresh(); },
  async deletePropiedad(id)      { await api.deletePropiedad(id); await refresh(); },

  /* Alquileres */
  async createAlquiler(d)           { await api.createAlquiler(d); await refresh(); },
  async updateAlquiler(id, p)       { await api.updateAlquiler(id, p); await refresh(); },
  async deleteAlquiler(id)          { await api.deleteAlquiler(id); await refresh(); },
  async addCobro(alqId, cobro)      { await api.addCobro(alqId, cobro); await refresh(); },
  async updateCobro(alqId, cobId, p){ await api.updateCobro(alqId, cobId, p); await refresh(); },
  async registrarAumento(alqId, nuevoMonto, nota) { await api.registrarAumento(alqId, nuevoMonto, nota); await refresh(); },

  /* Ventas */
  async createVenta(d)           { await api.createVenta(d); await refresh(); },
  async updateVenta(id, p)       { await api.updateVenta(id, p); await refresh(); },
  async deleteVenta(id)          { await api.deleteVenta(id); await refresh(); },

  /* Agenda */
  async createEvento(d)          { await api.createEvento(d); await refresh(); },
  async updateEvento(id, p)      { await api.updateEvento(id, p); await refresh(); },
  async deleteEvento(id)         { await api.deleteEvento(id); await refresh(); },

  /* Temporales */
  async createTemporal(d)      { await api.createTemporal(d); await refresh(); },
  async updateTemporal(id, p)  { await api.updateTemporal(id, p); await refresh(); },
  async deleteTemporal(id)     { await api.deleteTemporal(id); await refresh(); },

  /* Liquidaciones */
  async createLiquidacion(d)      { await api.createLiquidacion(d); await refresh(); },
  async updateLiquidacion(id, p)  { await api.updateLiquidacion(id, p); await refresh(); },
  async deleteLiquidacion(id)     { await api.deleteLiquidacion(id); await refresh(); },

  /* Caja */
  async cajaHoy()                        { return api.cajaHoy(); },
  async addMovimiento(cajaId, data)      { await api.addMovimiento(cajaId, data); await refresh(); },
  async deleteMovimiento(cajaId, movId)  { await api.deleteMovimiento(cajaId, movId); await refresh(); },
  async cerrarCaja(cajaId)               { await api.cerrarCaja(cajaId); await refresh(); },

  /* Reset */
  resetDemo() { api.resetDemo(); return refresh(); },

  /* Configuración del sitio web (banner, logo, contacto) */
  updateSiteSettings(patch) {
    const nuevo = { ...(state.siteSettings || {}), ...patch };
    guardarSiteSettings(nuevo);
    state.siteSettings = nuevo;
    emit();
  },
};

/* ============================================================
   SELECTORES
   ============================================================ */
export const sel = {
  /* Lookups básicos */
  cliente:      (id) => state.clientes.find(x => x.id === id),
  propietario:  (id) => state.propietarios.find(x => x.id === id),
  propiedad:    (id) => state.propiedades.find(x => x.id === id),
  alquiler:     (id) => state.alquileres.find(x => x.id === id),
  venta:        (id) => state.ventas.find(x => x.id === id),

  nombreCliente:     (id) => state.clientes.find(x => x.id === id)?.nombre || '—',
  nombrePropietario: (id) => state.propietarios.find(x => x.id === id)?.nombre || '—',
  propiedadesDe:     (propietarioId) => state.propiedades.filter(p => p.propietarioId === propietarioId),
  dirPropiedad:  (id) => {
    const p = state.propiedades.find(x => x.id === id);
    return p ? `${p.direccion}${p.barrio ? ', ' + p.barrio : ''}` : '—';
  },

  /* ---- Clientes ---- */
  diasSinContacto(cli) {
    return diasEntre(cli.ultimoContacto || cli.fechaAlta, new Date());
  },
  sinSeguimiento() {
    return state.clientes.filter(c => sel.diasSinContacto(c) >= ALERTA_DIAS);
  },

  /* ---- Alquileres ---- */
  /** Días hasta el vencimiento (negativo = ya venció) */
  diasAlVencimiento(alq) {
    return diasEntre(new Date(), alq.fechaFin);
  },
  estadoAlquiler(alq) {
    if (alq.estado === 'rescindido') return 'rescindido';
    const d = sel.diasAlVencimiento(alq);
    if (d < 0) return 'vencido';
    if (d <= ALERTA_VENCIMIENTO_DIAS) return 'por_vencer';
    return 'activo';
  },
  cobrosImpagosMes(alq) {
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    return (alq.cobros || []).filter(c => c.mes <= mesActual && !c.pagado);
  },
  alquileresActivos() {
    return state.alquileres.filter(a => a.estado !== 'rescindido' && sel.diasAlVencimiento(a) >= 0);
  },
  proxVencimientos() {
    return state.alquileres
      .filter(a => a.estado !== 'rescindido')
      .map(a => ({ alq: a, dias: sel.diasAlVencimiento(a) }))
      .filter(x => x.dias >= 0 && x.dias <= ALERTA_VENCIMIENTO_DIAS)
      .sort((a, b) => a.dias - b.dias);
  },

  /**
   * Contratos activos cuyo próximo ajuste de precio ya llegó o está a ≤30 días.
   * Retorna [{ alq, diasRestantes, proximoAjuste }] ordenado de más urgente a menos.
   */
  contratosParaAjuste() {
    const hoy = new Date();
    const resultado = [];
    state.alquileres.forEach(alq => {
      if (sel.estadoAlquiler(alq) !== 'activo') return;
      if (!alq.fechaInicio || !alq.frecuenciaAjuste) return;
      const inicio = new Date(alq.fechaInicio);
      const mesesFrecuencia = Number(alq.frecuenciaAjuste) || 6;
      const mesesTranscurridos =
        (hoy.getFullYear() - inicio.getFullYear()) * 12 +
        (hoy.getMonth() - inicio.getMonth());
      const expectedAjustes = Math.floor(mesesTranscurridos / mesesFrecuencia);
      if (expectedAjustes === 0) return;
      const appliedAjustes = (alq.historialAjustes || []).length;
      if (appliedAjustes >= expectedAjustes) return; // ya está al día
      // Fecha del próximo ajuste pendiente
      const proxN = appliedAjustes + 1;
      const proxAjuste = new Date(inicio);
      proxAjuste.setMonth(proxAjuste.getMonth() + proxN * mesesFrecuencia);
      const dias = Math.ceil((proxAjuste - hoy) / 86400000);
      resultado.push({ alq, dias, proximoAjuste: proxAjuste.toISOString().slice(0,10), pendientes: expectedAjustes - appliedAjustes });
    });
    return resultado.sort((a, b) => a.dias - b.dias);
  },

  /** Cuántos ajustes esperados tiene un contrato (para calcular el monto actual teórico) */
  infoAjuste(alq) {
    if (!alq.fechaInicio || !alq.frecuenciaAjuste) return null;
    const hoy = new Date();
    const inicio = new Date(alq.fechaInicio);
    const mesesFrecuencia = Number(alq.frecuenciaAjuste) || 6;
    const mesesTranscurridos =
      (hoy.getFullYear() - inicio.getFullYear()) * 12 +
      (hoy.getMonth() - inicio.getMonth());
    const expectedAjustes = Math.floor(mesesTranscurridos / mesesFrecuencia);
    const appliedAjustes  = (alq.historialAjustes || []).length;
    const proxN = appliedAjustes + 1;
    const proxFecha = new Date(inicio);
    proxFecha.setMonth(proxFecha.getMonth() + proxN * mesesFrecuencia);
    return {
      expected: expectedAjustes,
      applied:  appliedAjustes,
      pendientes: Math.max(0, expectedAjustes - appliedAjustes),
      proxFecha: proxFecha.toISOString().slice(0,10),
      diasHastaProx: Math.ceil((proxFecha - hoy) / 86400000),
    };
  },

  /* ---- Ventas ---- */
  ventasActivas() {
    return state.ventas.filter(v => !['escriturada','caida'].includes(v.estado));
  },

  /* ---- Agenda ---- */
  eventosHoy() {
    const hoy = new Date().toISOString().slice(0,10);
    return state.agenda.filter(e => !e.completado && e.fecha === hoy);
  },
  eventosPendientes() {
    const hoy = new Date().toISOString().slice(0,10);
    return state.agenda.filter(e => !e.completado && e.fecha >= hoy).sort((a,b) => a.fecha.localeCompare(b.fecha));
  },

  /* ---- Matching propiedad ↔ clientes ---- */
  /**
   * Dado una propiedad, devuelve los clientes interesados con su % de coincidencia.
   * Solo considera clientes cuyo interes coincide con la operacion de la propiedad.
   */
  matchClientesPara(prop) {
    const ofAlquiler = !!(prop.precioAlquiler);
    const ofVenta    = !!(prop.precioVenta);

    return state.clientes
      .filter(c => {
        if (c.interes !== 'alquiler' && c.interes !== 'compra') return false;
        // Excluir si la operación es incompatible (tiene precio solo del otro tipo)
        if (c.interes === 'alquiler' && ofVenta && !ofAlquiler) return false;
        if (c.interes === 'compra'   && ofAlquiler && !ofVenta) return false;
        return true;
      })
      .map(c => ({ cliente: c, pct: calcMatch(prop, c) }))
      .filter(x => x.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  },

  /* ---- KPIs para Inicio ---- */
  kpis() {
    const cobrosVencidos = state.alquileres
      .flatMap(a => sel.cobrosImpagosMes(a)).length;

    return {
      totalClientes:     state.clientes.length,
      sinSeguimiento:    sel.sinSeguimiento().length,
      alquileresActivos: sel.alquileresActivos().length,
      ventasActivas:     sel.ventasActivas().length,
      cobrosVencidos,
      proxVencimientos:  sel.proxVencimientos().length,
      eventosHoy:        sel.eventosHoy().length,
      paraAjuste:        sel.contratosParaAjuste().length,
    };
  },

  /* ---- Badges del sidebar ---- */
  badges() {
    const k = sel.kpis();
    return {
      cobrosVencidos: k.cobrosVencidos || 0,
      eventosHoy:     k.eventosHoy || 0,
    };
  },
};

/* ============================================================
   LÓGICA DE MATCHING
   Calcula % de coincidencia entre una propiedad y un cliente.
   ============================================================ */
function calcMatch(prop, cli) {
  const b = cli.busca || {};

  // La compatibilidad de operación (alquiler/compra) ya fue filtrada en matchClientesPara.

  let puntos = 0;
  let posibles = 0;

  // Tipo de propiedad — 30 puntos
  if (b.tipo) {
    posibles += 30;
    if (prop.tipo === b.tipo) puntos += 30;
  }

  // Zona / barrio — 25 puntos
  if (b.zona) {
    posibles += 25;
    const zona = b.zona.toLowerCase();
    if (
      (prop.barrio   || '').toLowerCase().includes(zona) ||
      (prop.ciudad   || '').toLowerCase().includes(zona) ||
      (prop.direccion|| '').toLowerCase().includes(zona)
    ) puntos += 25;
  }

  // Presupuesto — 25 puntos
  if (b.presupuesto) {
    posibles += 25;
    const precio = cli.interes === 'alquiler'
      ? (prop.precioAlquiler || prop.precio)
      : (prop.precioVenta    || prop.precio);
    const monedaOk = !b.moneda ||
      b.moneda === (cli.interes === 'alquiler' ? prop.monedaAlquiler : prop.monedaVenta) ||
      b.moneda === prop.moneda;
    if (precio && monedaOk) {
      if (precio <= b.presupuesto)        puntos += 25;
      else if (precio <= b.presupuesto * 1.15) puntos += 12; // hasta 15% sobre presupuesto
    }
  }

  // Ambientes — 15 puntos
  if (b.ambientes) {
    posibles += 15;
    const ambProp = Number(prop.ambientes) || 0;
    if (ambProp >= b.ambientes)          puntos += 15;
    else if (ambProp === b.ambientes - 1) puntos += 7;
  }

  // Superficie mínima (solo compra) — 5 puntos
  if (cli.interes === 'compra' && b.m2) {
    posibles += 5;
    if ((prop.m2 || 0) >= b.m2) puntos += 5;
  }

  // Sin datos de búsqueda = interesado pero sin criterios → 25% base
  if (!posibles) return 25;
  return Math.round((puntos / posibles) * 100);
}
