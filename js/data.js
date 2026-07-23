/* ============================================================
   DATA — Modelo de datos + API sobre localStorage
   ============================================================ */
import { uid } from './lib.js';

const KEY = 'inmocrm_v1';
const LATENCIA = 80;
const delay = (v) => new Promise(r => setTimeout(() => r(v), LATENCIA));

/* ---- persistencia ---- */
function trySet(key, value) {
  try { localStorage.setItem(key, value); }
  catch { localStorage.clear(); try { localStorage.setItem(key, value); } catch {} }
}

function estadoInicial() {
  return { clientes: [], propietarios: [], propiedades: [], alquileres: [], ventas: [], agenda: [], caja: [], temporales: [], liquidaciones: [] };
}

function load() {
  const raw = localStorage.getItem(KEY);
  if (raw) { try { return JSON.parse(raw); } catch {} }
  const seed = estadoInicial();
  trySet(KEY, JSON.stringify(seed));
  return seed;
}

function persist(db) { trySet(KEY, JSON.stringify(db)); }

function hoyISO() { return new Date().toISOString().slice(0, 10); }
function horaActual() { return new Date().toTimeString().slice(0, 5); }
function normalizarMetodoPago(m) {
  if (!m) return 'otro';
  const v = String(m).trim().toLowerCase();
  const map = {
    efectivo: 'efectivo',
    transferencia: 'transferencia',
    transfer: 'transferencia',
    cheque: 'cheque',
    debito: 'debito',
    credito: 'credito',
    otro: 'otro',
  };
  return map[v] || (['efectivo','transferencia','cheque','debito','credito','otro'].includes(v) ? v : 'otro');
}
function crearMovimientoCaja(db, data) {
  db.caja = db.caja || [];
  const fecha = data.fecha || hoyISO();
  let dia = db.caja.find(d => d.fecha === fecha && !d.cerrado);
  if (!dia) {
    dia = { id: uid('caj'), fecha, cerrado: false, movimientos: [] };
    db.caja.unshift(dia);
  }
  const mov = {
    id: uid('mov'),
    fecha,
    hora: data.hora || horaActual(),
    tipo: data.tipo || 'ingreso',
    concepto: data.concepto || 'Movimiento de caja',
    monto: Number(data.monto || 0),
    metodoPago: normalizarMetodoPago(data.metodoPago),
    nota: data.nota || '',
    origen: data.origen || 'manual',
    refTipo: data.refTipo || null,
    refId: data.refId || null,
    ...data,
  };
  mov.metodoPago = normalizarMetodoPago(mov.metodoPago);
  mov.monto = Number(mov.monto || 0);
  mov.fecha = mov.fecha || fecha;
  mov.hora = mov.hora || horaActual();
  dia.movimientos.push(mov);
  return mov;
}

/** Crea uno o varios movimientos de caja a partir de un pago que puede estar
 *  dividido en varias líneas (ej: parte efectivo, parte transferencia). */
function crearMovimientosPago(db, { pagos, monto, metodoPago, referencia, nota, ...base }) {
  const lineas = (pagos && pagos.length ? pagos : [{ metodoPago, monto, referencia }])
    .filter(p => Number(p.monto || 0) > 0);
  return lineas.map(p => crearMovimientoCaja(db, {
    ...base,
    monto: Number(p.monto || 0),
    metodoPago: p.metodoPago,
    nota: [p.referencia, nota].filter(Boolean).join(' · '),
  }));
}

/** Fecha a usar para el movimiento de caja de un cobro: si el usuario marcó
 *  "no sumar a la caja de hoy", se imputa al mes del alquiler (evita que
 *  cargar meses atrasados de un contrato viejo infle la caja del día actual). */
function fechaCajaDeCobro(c) {
  if (c.imputarAlMes && c.mes) return `${c.mes}-01`;
  return c.fechaPago || hoyISO();
}

/** Si el cobro trae comisión inicial pendiente de cobrar y ya está pagado,
 *  genera el ingreso de caja correspondiente y marca el contrato como cobrada. */
function procesarComisionInicial(db, a, c) {
  if (!c.pagado || !(Number(c.comisionInicialMonto) > 0) || c.comisionInicialCajaMovimientoId) return;
  const inq  = db.clientes.find(x => x.id === a.inquilinoId) || {};
  const prop = db.propiedades.find(x => x.id === a.propiedadId) || {};
  const mov = crearMovimientoCaja(db, {
    tipo: 'ingreso',
    concepto: `Comisión inicial • ${inq.nombre || 'Inquilino'} • ${prop.direccion || 'Propiedad'}`.trim(),
    monto: Number(c.comisionInicialMonto),
    metodoPago: c.metodoPago,
    fecha: fechaCajaDeCobro(c),
    origen: 'comision-inicial',
    refTipo: 'comision-inicial',
    refId: c.id,
  });
  c.comisionInicialCajaMovimientoId = mov.id;
  a.comisionInicialCobrada = true;
}

let _db = load();

/* ============================================================
   API
   ============================================================ */
export const api = {
  async snapshot() { return delay(structuredClone(_db)); },

  resetDemo() {
    localStorage.removeItem(KEY);
    _db = estadoInicial();
    persist(_db);
    return _db;
  },

  /* ---- CLIENTES ---- */
  async createCliente(data) {
    const c = {
      id: uid('cli'),
      fechaAlta: new Date().toISOString(),
      ultimoContacto: new Date().toISOString(),
      proximoContacto: null,
      notas: '',
      seguimientos: [],
      ...data,
    };
    _db.clientes.unshift(c);
    persist(_db);
    return delay(structuredClone(c));
  },
  async updateCliente(id, patch) {
    const c = _db.clientes.find(x => x.id === id);
    if (c) { Object.assign(c, patch); persist(_db); }
    return delay(c ? structuredClone(c) : null);
  },
  async deleteCliente(id) {
    _db.clientes = _db.clientes.filter(x => x.id !== id);
    persist(_db);
    return delay(true);
  },
  async addSeguimiento(clienteId, nota) {
    const c = _db.clientes.find(x => x.id === clienteId);
    if (!c) return delay(null);
    const s = { id: uid('seg'), fecha: new Date().toISOString(), nota };
    c.seguimientos = c.seguimientos || [];
    c.seguimientos.push(s);
    c.ultimoContacto = s.fecha;
    persist(_db);
    return delay(structuredClone(s));
  },

  /* ---- PROPIETARIOS ---- */
  async createPropietario(data) {
    const p = {
      id: uid('own'),
      fechaAlta: new Date().toISOString(),
      ultimoContacto: new Date().toISOString(),
      seguimientos: [],
      ...data,
    };
    _db.propietarios = _db.propietarios || [];
    _db.propietarios.unshift(p);
    persist(_db);
    return delay(structuredClone(p));
  },
  async updatePropietario(id, patch) {
    _db.propietarios = _db.propietarios || [];
    const p = _db.propietarios.find(x => x.id === id);
    if (p) { Object.assign(p, patch); persist(_db); }
    return delay(p ? structuredClone(p) : null);
  },
  async deletePropietario(id) {
    _db.propietarios = (_db.propietarios || []).filter(x => x.id !== id);
    persist(_db);
    return delay(true);
  },
  async addSeguimientoPropietario(propietarioId, nota) {
    _db.propietarios = _db.propietarios || [];
    const p = _db.propietarios.find(x => x.id === propietarioId);
    if (!p) return delay(null);
    const s = { id: uid('seg'), fecha: new Date().toISOString(), nota };
    p.seguimientos = p.seguimientos || [];
    p.seguimientos.push(s);
    p.ultimoContacto = s.fecha;
    persist(_db);
    return delay(structuredClone(s));
  },

  /* ---- PROPIEDADES ---- */
  async createPropiedad(data) {
    const p = {
      id: uid('prop'),
      fechaAlta: new Date().toISOString(),
      estado: 'disponible',
      fotos: [],
      ...data,
    };
    _db.propiedades.unshift(p);
    persist(_db);
    return delay(structuredClone(p));
  },
  async updatePropiedad(id, patch) {
    const p = _db.propiedades.find(x => x.id === id);
    if (p) { Object.assign(p, patch); persist(_db); }
    return delay(p ? structuredClone(p) : null);
  },
  async deletePropiedad(id) {
    _db.propiedades = _db.propiedades.filter(x => x.id !== id);
    persist(_db);
    return delay(true);
  },

  /* ---- ALQUILERES ---- */
  async createAlquiler(data) {
    // Verificar que la propiedad no tenga ya un contrato activo
    const hoy = new Date().toISOString().slice(0, 10);
    const yaOcupada = _db.alquileres.some(a =>
      a.propiedadId === data.propiedadId &&
      !['rescindido', 'renovado'].includes(a.estado) &&
      (!a.fechaFin || a.fechaFin >= hoy)
    );
    if (yaOcupada) throw new Error('La propiedad ya tiene un contrato de alquiler activo.');

    const a = {
      id: uid('alq'),
      fechaAlta: new Date().toISOString(),
      estado: 'activo',
      cobros: [],
      ...data,
    };
    const prop = _db.propiedades.find(x => x.id === a.propiedadId);
    if (prop) { prop.estado = 'alquilada'; }
    _db.alquileres.unshift(a);
    persist(_db);
    return delay(structuredClone(a));
  },
  async updateAlquiler(id, patch) {
    const a = _db.alquileres.find(x => x.id === id);
    if (a) { Object.assign(a, patch); persist(_db); }
    return delay(a ? structuredClone(a) : null);
  },
  /** Marca el contrato viejo como renovado y crea uno nuevo con los datos actualizados,
   *  conservando la misma propiedad ocupada de forma continua. */
  async renovarAlquiler(oldId, data) {
    const old = _db.alquileres.find(x => x.id === oldId);
    if (!old) throw new Error('Contrato a renovar no encontrado.');
    const nuevo = {
      id: uid('alq'),
      fechaAlta: new Date().toISOString(),
      estado: 'activo',
      cobros: [],
      renovadoDeId: oldId,
      ...data,
    };
    old.estado = 'renovado';
    old.renovadoEnId = nuevo.id;
    const prop = _db.propiedades.find(x => x.id === nuevo.propiedadId);
    if (prop) prop.estado = 'alquilada';
    _db.alquileres.unshift(nuevo);
    persist(_db);
    return delay(structuredClone(nuevo));
  },
  /** Cancela (rescinde) el contrato y libera la propiedad si no queda otro contrato activo en ella. */
  async cancelarAlquiler(id) {
    const a = _db.alquileres.find(x => x.id === id);
    if (!a) return delay(null);
    a.estado = 'rescindido';
    a.fechaCancelacion = hoyISO();
    const otrosActivos = _db.alquileres.some(x =>
      x.id !== id && x.propiedadId === a.propiedadId && !['rescindido', 'renovado'].includes(x.estado)
    );
    if (!otrosActivos) {
      const prop = _db.propiedades.find(x => x.id === a.propiedadId);
      if (prop) prop.estado = 'disponible';
    }
    persist(_db);
    return delay(structuredClone(a));
  },
  async deleteAlquiler(id) {
    const a = _db.alquileres.find(x => x.id === id);
    if (a) {
      // Liberar propiedad si no tiene otro contrato activo
      const otrosActivos = _db.alquileres.filter(x => x.id !== id && x.propiedadId === a.propiedadId && x.estado === 'activo');
      if (!otrosActivos.length) {
        const prop = _db.propiedades.find(x => x.id === a.propiedadId);
        if (prop) prop.estado = 'disponible';
      }
    }
    _db.alquileres = _db.alquileres.filter(x => x.id !== id);
    persist(_db);
    return delay(true);
  },
  async addCobro(alquilerId, cobro) {
    const a = _db.alquileres.find(x => x.id === alquilerId);
    if (!a) return delay(null);
    const c = { id: uid('cob'), fechaRegistro: new Date().toISOString(), pagado: false, ...cobro };
    a.cobros = a.cobros || [];
    a.cobros.push(c);
    if (c.pagado && Number(c.monto || 0) > 0) {
      const inq = _db.clientes.find(x => x.id === a.inquilinoId) || {};
      const prop = _db.propiedades.find(x => x.id === a.propiedadId) || {};
      const movs = crearMovimientosPago(_db, {
        pagos: c.pagos,
        tipo: 'ingreso',
        concepto: `Cobro alquiler • ${inq.nombre || 'Inquilino'} • ${prop.direccion || 'Propiedad'} • ${c.mes || ''}`.trim(),
        monto: Number(c.monto || 0),
        metodoPago: c.metodoPago,
        referencia: c.referencia,
        nota: c.nota,
        fecha: fechaCajaDeCobro(c),
        origen: 'cobro-alquiler',
        refTipo: 'cobro',
        refId: c.id,
      });
      c.cajaMovimientoIds = movs.map(m => m.id);
      c.cajaMovimientoId = movs[0]?.id;
    }
    procesarComisionInicial(_db, a, c);
    persist(_db);
    return delay(structuredClone(c));
  },
  async updateCobro(alquilerId, cobroId, patch) {
    const a = _db.alquileres.find(x => x.id === alquilerId);
    if (!a) return delay(null);
    const c = (a.cobros || []).find(x => x.id === cobroId);
    if (c) {
      const estabaPagado = !!c.pagado;
      Object.assign(c, patch);
      if (patch.pagado && !estabaPagado && Number(c.monto || 0) > 0 && !c.cajaMovimientoId) {
        const inq = _db.clientes.find(x => x.id === a.inquilinoId) || {};
        const prop = _db.propiedades.find(x => x.id === a.propiedadId) || {};
        const movs = crearMovimientosPago(_db, {
          pagos: c.pagos,
          tipo: 'ingreso',
          concepto: `Cobro alquiler • ${inq.nombre || 'Inquilino'} • ${prop.direccion || 'Propiedad'} • ${c.mes || ''}`.trim(),
          monto: Number(c.monto || 0),
          metodoPago: c.metodoPago,
          referencia: c.referencia,
          nota: c.nota,
          fecha: fechaCajaDeCobro(c),
          origen: 'cobro-alquiler',
          refTipo: 'cobro',
          refId: c.id,
        });
        c.cajaMovimientoIds = movs.map(m => m.id);
        c.cajaMovimientoId = movs[0]?.id;
      }
      procesarComisionInicial(_db, a, c);
      persist(_db);
    }
    return delay(c ? structuredClone(c) : null);
  },
  async registrarAumento(alqId, nuevoMonto, nota) {
    const a = _db.alquileres.find(x => x.id === alqId);
    if (!a) return delay(null);
    const montoAnterior = a.montoActual ?? a.montoInicial ?? 0;
    const aj = { id: uid('aj'), fecha: new Date().toISOString().slice(0,10), montoAnterior, montoNuevo: nuevoMonto, nota: nota||'' };
    a.historialAjustes = a.historialAjustes || [];
    a.historialAjustes.push(aj);
    a.montoActual = nuevoMonto;
    persist(_db);
    return delay(structuredClone(aj));
  },
  /** Corrige el último aumento registrado (monto, fecha o nota). Solo se permite editar
   *  el último para no romper la cadena montoAnterior→montoNuevo del historial. */
  async editarUltimoAjuste(alqId, patch) {
    const a = _db.alquileres.find(x => x.id === alqId);
    if (!a || !(a.historialAjustes || []).length) return delay(null);
    const ultimo = a.historialAjustes[a.historialAjustes.length - 1];
    if (patch.fecha != null) ultimo.fecha = patch.fecha;
    if (patch.nota  != null) ultimo.nota  = patch.nota;
    if (patch.montoNuevo != null) {
      ultimo.montoNuevo = patch.montoNuevo;
      a.montoActual = patch.montoNuevo;
    }
    persist(_db);
    return delay(structuredClone(a));
  },
  /** Deshace el último aumento registrado: lo saca del historial y devuelve
   *  el monto actual del contrato al que tenía antes de ese aumento. */
  async deshacerUltimoAjuste(alqId) {
    const a = _db.alquileres.find(x => x.id === alqId);
    if (!a || !(a.historialAjustes || []).length) return delay(null);
    const ultimo = a.historialAjustes.pop();
    a.montoActual = ultimo.montoAnterior;
    persist(_db);
    return delay(structuredClone(a));
  },

  /* ---- VENTAS ---- */
  async createVenta(data) {
    const v = {
      id: uid('vta'),
      fechaAlta: new Date().toISOString(),
      estado: 'en_curso',
      ...data,
    };
    // Marcar propiedad según estado
    const prop = _db.propiedades.find(x => x.id === v.propiedadId);
    if (prop) prop.estado = v.estado === 'escriturada' ? 'vendida' : 'reservada';
    _db.ventas.unshift(v);
    const importe = Number(v.sena && Number(v.sena) > 0 ? v.sena : v.precio || 0);
    if (importe > 0) {
      const comprador = _db.clientes.find(x => x.id === v.compradorId) || {};
      const mov = crearMovimientoCaja(_db, {
        tipo: 'ingreso',
        concepto: `Venta • ${comprador.nombre || 'Comprador'} • ${prop?.direccion || 'Propiedad'}`.trim(),
        monto: importe,
        metodoPago: 'otro',
        nota: Number(v.sena) > 0 ? 'Seña / anticipo de venta' : 'Venta registrada',
        fecha: v.fechaReserva || v.fechaEscritura || hoyISO(),
        origen: 'venta',
        refTipo: 'venta',
        refId: v.id,
      });
      v.cajaMovimientoId = mov.id;
    }
    persist(_db);
    return delay(structuredClone(v));
  },
  async updateVenta(id, patch) {
    const v = _db.ventas.find(x => x.id === id);
    if (v) {
      Object.assign(v, patch);
      // Sincronizar estado de propiedad
      if (patch.estado) {
        const prop = _db.propiedades.find(x => x.id === v.propiedadId);
        if (prop) {
          if (patch.estado === 'escriturada') prop.estado = 'vendida';
          else if (patch.estado === 'caida') prop.estado = 'disponible';
          else prop.estado = 'reservada';
        }
      }
      persist(_db);
    }
    return delay(v ? structuredClone(v) : null);
  },
  async deleteVenta(id) {
    const v = _db.ventas.find(x => x.id === id);
    if (v) {
      const prop = _db.propiedades.find(x => x.id === v.propiedadId);
      if (prop && prop.estado !== 'alquilada') prop.estado = 'disponible';
    }
    _db.ventas = _db.ventas.filter(x => x.id !== id);
    persist(_db);
    return delay(true);
  },

  /* ---- TEMPORALES ---- */
  async createTemporal(data) {
    if (!_db.temporales) _db.temporales = [];
    const t = { id: uid('tmp'), fechaAlta: new Date().toISOString(), estado: 'confirmado', ...data };
    _db.temporales.push(t);
    persist(_db);
    return delay(t);
  },
  async updateTemporal(id, patch) {
    const i = _db.temporales.findIndex(t => t.id === id);
    if (i !== -1) { _db.temporales[i] = { ..._db.temporales[i], ...patch }; persist(_db); }
    return delay(null);
  },
  async deleteTemporal(id) {
    _db.temporales = _db.temporales.filter(t => t.id !== id);
    persist(_db);
    return delay(null);
  },

  /* ---- LIQUIDACIONES ---- */
  async createLiquidacion(data) {
    if (!_db.liquidaciones) _db.liquidaciones = [];
    const l = {
      id: uid('liq'),
      fechaAlta: new Date().toISOString(),
      estado: 'pendiente',
      ...data,
    };
    _db.liquidaciones.unshift(l);
    const prop = _db.propiedades.find(x => x.id === l.propiedadId) || {};
    const periodoLbl = l.mes || (l.meses && l.meses.length ? (l.meses.length > 1 ? `${l.meses[0]} a ${l.meses[l.meses.length - 1]}` : l.meses[0]) : '');
    let movs = [];
    if (Array.isArray(l.propietarios) && l.propietarios.length) {
      // Liquidación con varios dueños (co-propiedad): un movimiento de caja por dueño,
      // cada uno con su propia forma de pago.
      l.propietarios.forEach(po => {
        if (!(Number(po.totalPagar || 0) > 0)) return;
        const own = _db.propietarios.find(x => x.id === po.propietarioId) || {};
        movs = movs.concat(crearMovimientosPago(_db, {
          pagos: po.pagos,
          tipo: 'egreso',
          concepto: `Pago a propietario • ${own.nombre || 'Propietario'} (${po.porcentaje}%) • ${prop.direccion || 'Propiedad'} • ${periodoLbl}`.trim(),
          monto: Number(po.totalPagar || 0),
          metodoPago: po.formaPago,
          nota: l.notas || '',
          fecha: l.fechaPago || hoyISO(),
          origen: 'liquidacion',
          refTipo: 'liquidacion',
          refId: l.id,
        }));
      });
    } else if (Number(l.totalPagar || l.montoAlquiler || 0) > 0) {
      const own = _db.propietarios.find(x => x.id === l.propietarioId) || {};
      movs = crearMovimientosPago(_db, {
        pagos: l.pagos,
        tipo: 'egreso',
        concepto: `Pago a propietario • ${own.nombre || 'Propietario'} • ${prop.direccion || 'Propiedad'} • ${periodoLbl}`.trim(),
        monto: Number(l.totalPagar || l.montoAlquiler || 0),
        metodoPago: l.formaPago,
        nota: l.notas || '',
        fecha: l.fechaPago || hoyISO(),
        origen: 'liquidacion',
        refTipo: 'liquidacion',
        refId: l.id,
      });
    }
    if (movs.length) {
      l.cajaMovimientoIds = movs.map(m => m.id);
      l.cajaMovimientoId = movs[0]?.id;
    }
    persist(_db);
    return delay(structuredClone(l));
  },
  async updateLiquidacion(id, patch) {
    if (!_db.liquidaciones) _db.liquidaciones = [];
    const l = _db.liquidaciones.find(x => x.id === id);
    if (l) { Object.assign(l, patch); persist(_db); }
    return delay(l ? structuredClone(l) : null);
  },
  async deleteLiquidacion(id) {
    _db.liquidaciones = (_db.liquidaciones || []).filter(x => x.id !== id);
    persist(_db);
    return delay(true);
  },

  /* ---- AGENDA ---- */
  async createEvento(data) {
    const e = {
      id: uid('eve'),
      fechaAlta: new Date().toISOString(),
      completado: false,
      ...data,
    };
    _db.agenda.unshift(e);
    persist(_db);
    return delay(structuredClone(e));
  },
  async updateEvento(id, patch) {
    const e = _db.agenda.find(x => x.id === id);
    if (e) { Object.assign(e, patch); persist(_db); }
    return delay(e ? structuredClone(e) : null);
  },
  async deleteEvento(id) {
    _db.agenda = _db.agenda.filter(x => x.id !== id);
    persist(_db);
    return delay(true);
  },

  /* ---- CAJA ---- */
  /** Devuelve o crea la caja del día actual (abierta). */
  async cajaHoy() {
    _db.caja = _db.caja || [];
    const hoy = new Date().toISOString().slice(0, 10);
    let dia = _db.caja.find(d => d.fecha === hoy && !d.cerrado);
    if (!dia) {
      dia = { id: uid('caj'), fecha: hoy, cerrado: false, movimientos: [] };
      _db.caja.unshift(dia);
      persist(_db);
    }
    return delay(structuredClone(dia));
  },
  async addMovimiento(cajaId, data) {
    _db.caja = _db.caja || [];
    const dia = _db.caja.find(x => x.id === cajaId);
    if (!dia) return delay(null);
    const mov = crearMovimientoCaja(_db, { ...data, fecha: data.fecha || hoyISO(), hora: data.hora || new Date().toTimeString().slice(0, 5) });
    const diaActual = _db.caja.find(x => x.id === cajaId);
    if (diaActual) {
      const idx = diaActual.movimientos.findIndex(x => x.id === mov.id);
      if (idx >= 0) return delay(structuredClone(diaActual.movimientos[idx]));
    }
    persist(_db);
    return delay(structuredClone(mov));
  },
  async deleteMovimiento(cajaId, movId) {
    _db.caja = _db.caja || [];
    const dia = _db.caja.find(x => x.id === cajaId);
    if (dia) { dia.movimientos = dia.movimientos.filter(m => m.id !== movId); persist(_db); }
    return delay(true);
  },
  async cerrarCaja(cajaId) {
    _db.caja = _db.caja || [];
    const dia = _db.caja.find(x => x.id === cajaId);
    if (dia) { dia.cerrado = true; dia.fechaCierre = new Date().toISOString(); persist(_db); }
    return delay(dia ? structuredClone(dia) : null);
  },
};
