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
    fecha: c.fechaPago || hoyISO(),
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
      publicadoWeb: data.publicadoWeb !== false,
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
        fecha: c.fechaPago || hoyISO(),
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
          fecha: c.fechaPago || hoyISO(),
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
    if (Number(l.totalPagar || l.montoAlquiler || 0) > 0) {
      const prop = _db.propiedades.find(x => x.id === l.propiedadId) || {};
      const own = _db.propietarios.find(x => x.id === l.propietarioId) || {};
      const periodoLbl = l.mes || (l.meses && l.meses.length ? (l.meses.length > 1 ? `${l.meses[0]} a ${l.meses[l.meses.length - 1]}` : l.meses[0]) : '');
      const movs = crearMovimientosPago(_db, {
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

/* ============================================================
   CARGA DE DATOS DE DEMOSTRACIÓN
   ============================================================ */
export async function cargarDatosDemo() {
  // Solo cargar si la base está vacía
  if (_db.clientes.length > 0 || _db.propiedades.length > 0) {
    console.log('Datos de demostración ya existen');
    return;
  }

  console.log('Cargando datos de demostración...');

  // Crear 5 clientes (inquilinos)
  const clientes = [
    { nombre: 'Juan García López', email: 'juan.garcia@email.com', celular: '1123456789', tipo: 'inquilino', direccion: 'Calle Falsa 123' },
    { nombre: 'María Rodríguez Martínez', email: 'maria.rodriguez@email.com', celular: '1187654321', tipo: 'inquilino', direccion: 'Avenida Siempre Viva 742' },
    { nombre: 'Carlos Pérez Silva', email: 'carlos.perez@email.com', celular: '1145678901', tipo: 'inquilino', direccion: 'Boulevard Principal 456' },
    { nombre: 'Ana Martínez González', email: 'ana.martinez@email.com', celular: '1165432109', tipo: 'inquilino', direccion: 'Paseo de la República 789' },
    { nombre: 'Roberto Fernández Torres', email: 'roberto.fernandez@email.com', celular: '1198765432', tipo: 'inquilino', direccion: 'Avenida Central 234' },
  ];

  const clienteIds = [];
  for (const c of clientes) {
    const cliente = await api.createCliente(c);
    clienteIds.push(cliente.id);
  }

  // Crear 5 propietarios
  const propietarios = [
    { nombre: 'Miguel Sánchez Ruiz', email: 'miguel.sanchez@email.com', celular: '1154321098', cbu: '0123456789012345678901', banco: 'Banco Nación' },
    { nombre: 'Sofia Díaz López', email: 'sofia.diaz@email.com', celular: '1187654309', cbu: '9876543210987654321098', banco: 'Banco Provincia' },
    { nombre: 'Diego Romero Gómez', email: 'diego.romero@email.com', celular: '1176543210', cbu: '1122334455667788990011', banco: 'Santander' },
    { nombre: 'Patricia Flores Mendez', email: 'patricia.flores@email.com', celular: '1165432187', cbu: '1111222233334444555566', banco: 'BBVA' },
    { nombre: 'Andrés López Castro', email: 'andres.lopez@email.com', celular: '1198765409', cbu: '2233445566778899001122', banco: 'Banco Crédito' },
  ];

  const propietarioIds = [];
  for (const p of propietarios) {
    const propietario = await api.createPropietario(p);
    propietarioIds.push(propietario.id);
  }

  // Crear 6 propiedades (con diferentes estados)
  const propiedades = [
    // ALQUILADAS (3) - Solo para alquiler
    {
      direccion: 'Calle Independencia 1234',
      barrio: 'San Telmo',
      tipo: 'departamento',
      dormitorios: 2,
      baños: 1,
      superficieTil: 65,
      superficie: 75,
      servicios: ['agua', 'gas', 'electricidad'],
      amenities: ['balcón', 'cocina moderna'],
      precioAlquiler: 1800,
      habilitadaAlquiler: true,
      habilitadaTemporal: false,
      habilitadaVenta: false,
      propietarioId: propietarioIds[0],
      estado: 'disponible',
    },
    {
      direccion: 'Avenida Belgrano 567',
      barrio: 'Monserrat',
      tipo: 'departamento',
      dormitorios: 3,
      baños: 2,
      superficieTil: 100,
      superficie: 115,
      servicios: ['agua', 'gas', 'electricidad', 'cloacas'],
      amenities: ['terraza', 'pileta'],
      precioAlquiler: 2500,
      habilitadaAlquiler: true,
      habilitadaTemporal: false,
      habilitadaVenta: false,
      propietarioId: propietarioIds[1],
      estado: 'disponible',
    },
    {
      direccion: 'Calle Defensa 890',
      barrio: 'La Boca',
      tipo: 'casa',
      dormitorios: 2,
      baños: 1,
      superficieTil: 80,
      superficie: 100,
      servicios: ['agua', 'gas', 'electricidad'],
      amenities: ['patio', 'garage'],
      precioAlquiler: 1500,
      habilitadaAlquiler: true,
      habilitadaTemporal: false,
      habilitadaVenta: false,
      propietarioId: propietarioIds[2],
      estado: 'disponible',
    },
    // PATRICIA - 3 PROPIEDADES PARA AGRUPAR
    {
      direccion: 'Avenida 9 de Julio 2000',
      barrio: 'Centro',
      tipo: 'departamento',
      dormitorios: 1,
      baños: 1,
      superficieTil: 45,
      superficie: 55,
      servicios: ['agua', 'gas', 'electricidad'],
      amenities: ['ubicación céntrica'],
      precioAlquiler: 1200,
      habilitadaAlquiler: true,
      habilitadaTemporal: false,
      habilitadaVenta: false,
      propietarioId: propietarioIds[3],
      estado: 'disponible',
    },
    {
      direccion: 'Calle Tucumán 1111',
      barrio: 'Recoleta',
      tipo: 'departamento',
      dormitorios: 3,
      baños: 2,
      superficieTil: 120,
      superficie: 140,
      servicios: ['agua', 'gas', 'electricidad', 'aire acondicionado'],
      amenities: ['living comedor', 'estudio', 'balcón'],
      precioAlquiler: 1800,
      habilitadaAlquiler: true,
      habilitadaTemporal: false,
      habilitadaVenta: false,
      propietarioId: propietarioIds[3],
      estado: 'disponible',
    },
    {
      direccion: 'Jose Ingenieros 1/4',
      barrio: 'Caballito',
      tipo: 'casa',
      dormitorios: 2,
      baños: 1,
      superficieTil: 70,
      superficie: 90,
      servicios: ['agua', 'gas', 'electricidad'],
      amenities: ['patio', 'cocina'],
      precioAlquiler: 1400,
      habilitadaAlquiler: true,
      habilitadaTemporal: false,
      habilitadaVenta: false,
      propietarioId: propietarioIds[3],
      estado: 'disponible',
    },
    // DISPONIBLE SOLO PARA ALQUILER TEMPORAL
    {
      direccion: 'Paseo Colón 2500',
      barrio: 'San Telmo',
      tipo: 'departamento',
      dormitorios: 2,
      baños: 2,
      superficieTil: 85,
      superficie: 105,
      servicios: ['agua', 'gas', 'electricidad'],
      amenities: ['amenidades', 'portero 24hs'],
      precioAlquiler: 150,
      habilitadaAlquiler: false,
      habilitadaTemporal: true,
      habilitadaVenta: false,
      propietarioId: propietarioIds[4],
      estado: 'disponible',
    },
  ];

  const propiedadIds = [];
  for (const prop of propiedades) {
    const propiedad = await api.createPropiedad(prop);
    propiedadIds.push(propiedad.id);
  }

  // Crear 6 alquileres activos (3 para propiedades normales + 3 para Patricia)
  const hoy = new Date();
  const hace3meses = new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate());
  const hace6meses = new Date(hoy.getFullYear(), hoy.getMonth() - 6, hoy.getDate());
  const hace2meses = new Date(hoy.getFullYear(), hoy.getMonth() - 2, hoy.getDate());
  
  // Mes para agrupar - hace un mes
  const haceMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const mesAgrupacion = haceMes.toISOString().slice(0, 7); // formato YYYY-MM

  const alquileres = [
    {
      propiedadId: propiedadIds[0],
      inquilinoId: clienteIds[0],
      propietarioId: propietarioIds[0],
      montoInicial: 1800,
      montoActual: 1800,
      fechaInicio: hace6meses.toISOString().slice(0, 10),
      estado: 'activo',
      duracionMeses: 24,
      servicioIncluye: 'agua, electricidad',
    },
    {
      propiedadId: propiedadIds[1],
      inquilinoId: clienteIds[1],
      propietarioId: propietarioIds[1],
      montoInicial: 2500,
      montoActual: 2500,
      fechaInicio: hace3meses.toISOString().slice(0, 10),
      estado: 'activo',
      duracionMeses: 24,
      servicioIncluye: 'agua',
    },
    {
      propiedadId: propiedadIds[2],
      inquilinoId: clienteIds[2],
      propietarioId: propietarioIds[2],
      montoInicial: 1500,
      montoActual: 1500,
      fechaInicio: hace2meses.toISOString().slice(0, 10),
      estado: 'activo',
      duracionMeses: 12,
      servicioIncluye: 'sin incluir',
    },
    // 3 ALQUILERES PARA PATRICIA (propiedadIds[3], [4], [5])
    {
      propiedadId: propiedadIds[3],
      inquilinoId: clienteIds[3],
      propietarioId: propietarioIds[3],
      montoInicial: 1200,
      montoActual: 1200,
      fechaInicio: hace6meses.toISOString().slice(0, 10),
      estado: 'activo',
      duracionMeses: 24,
      servicioIncluye: 'agua',
    },
    {
      propiedadId: propiedadIds[4],
      inquilinoId: clienteIds[1],
      propietarioId: propietarioIds[3],
      montoInicial: 1800,
      montoActual: 1800,
      fechaInicio: hace3meses.toISOString().slice(0, 10),
      estado: 'activo',
      duracionMeses: 24,
      servicioIncluye: 'agua, gas',
    },
    {
      propiedadId: propiedadIds[5],
      inquilinoId: clienteIds[4],
      propietarioId: propietarioIds[3],
      montoInicial: 1400,
      montoActual: 1400,
      fechaInicio: hace2meses.toISOString().slice(0, 10),
      estado: 'activo',
      duracionMeses: 12,
      servicioIncluye: 'sin incluir',
    },
  ];

  for (const alq of alquileres) {
    const alqCreado = await api.createAlquiler(alq);
    
    // Agregar cobros pagados para generar liquidaciones
    // Para las 3 propiedades de Patricia (últimas 3), agregar cobros del mes de agrupación
    if (alq.propietarioId === propietarioIds[3]) {
      await api.addCobro(alqCreado.id, {
        mes: mesAgrupacion,
        monto: alq.montoActual,
        fechaPago: new Date(haceMes.getFullYear(), haceMes.getMonth(), 15).toISOString().slice(0, 10),
        pagado: true,
        notas: 'Cobro demo',
      });
    }
  }

  console.log('✅ Datos de demostración cargados correctamente');
  console.log(`📊 Resumen: ${clienteIds.length} clientes, ${propietarioIds.length} propietarios, ${propiedadIds.length} propiedades`);
  console.log(`📊 Estados: 3 ALQUILADAS, 2 DISPONIBLES, 1 VENDIDA`);
}
