/* ============================================================
   VISTA · Liquidaciones — pagos a propietarios
   ============================================================ */
import { getState, actions, subscribe, sel } from '../store.js';
import { icon } from '../config.js';
import { esc, fmtMontoInput, valorMonto } from '../lib.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { imprimirLiquidacion } from '../imprimir.js';

function fmtFecha(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function mesLabel(s) {
  if (!s) return '—';
  const [y, m] = s.split('-');
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${MESES[+m - 1]} ${y}`;
}
function fmt$(n) { return Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }); }

/* ── Forma de pago (una o varias líneas: efectivo + transferencia, etc.) ── */
const METODOS_PAGO = [
  { id: 'Efectivo', icon: '💵' },
  { id: 'Transferencia', icon: '🏦' },
  { id: 'Cheque', icon: '📄' },
  { id: 'Otro', icon: '📝' },
];

function pagosBlockHTML() {
  return `
    <div class="form-group full">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <label style="margin:0">Forma de pago</label>
        <button type="button" data-btn-add-pago class="btn btn-xs btn-ghost">${icon('plus')} Dividir pago</button>
      </div>
      <div data-pagos-blk></div>
    </div>`;
}

/** Gestiona las líneas de pago dentro de un contenedor. `getTotal` debe devolver el total a pagar
 *  vigente. `root` debe contener el `pagosBlockHTML()` correspondiente — al estar scopeado se puede
 *  montar más de una instancia en el mismo modal (una por propietario, para co-propiedades). */
function montarPagos(root, { getTotal }) {
  const ov = root;
  const mostrarRef = (m) => ['Transferencia', 'Cheque'].includes(m);
  let pagos = [{ metodoPago: 'Efectivo', monto: getTotal(), referencia: '' }];

  const resumen = () => {
    const total = Number(getTotal()) || 0;
    // Con una sola línea de pago no hay nada que "repartir": el monto siempre
    // tiene que ser el total vigente (si no, queda desactualizado al cambiar
    // % de comisión, descuentos, etc. después de haber montado el control).
    if (pagos.length === 1 && Number(pagos[0].monto) !== total) {
      pagos[0].monto = total;
      const inp = ov.querySelector('[data-pago-idx="0"] [data-f="monto"]');
      if (inp && document.activeElement !== inp) inp.value = fmtMontoInput(total);
    }
    const el = ov.querySelector('[data-pagos-resumen]');
    if (!el) return;
    const asignado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    if (pagos.length > 1) {
      const dif = Math.round((total - asignado) * 100) / 100;
      el.textContent = `Asignado: ${fmt$(asignado)} de ${fmt$(total)}` + (dif !== 0 ? ` · Faltan ${fmt$(dif)}` : ' · ✓ Coincide');
      el.style.color = dif === 0 ? 'var(--success)' : 'var(--warning)';
    } else {
      el.textContent = '';
    }
  };

  const render = () => {
    const blk = ov.querySelector('[data-pagos-blk]');
    blk.innerHTML = pagos.map((p, i) => `
      <div style="display:flex;gap:.5rem;align-items:flex-end;margin-bottom:.5rem;flex-wrap:wrap" data-pago-idx="${i}">
        <div class="form-group" style="margin:0;min-width:150px">
          <label style="font-size:.72rem">Método</label>
          <select data-f="metodoPago">
            ${METODOS_PAGO.map(m => `<option value="${m.id}" ${p.metodoPago === m.id ? 'selected' : ''}>${m.icon} ${m.id}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;width:130px">
          <label style="font-size:.72rem">Monto $</label>
          <input type="text" inputmode="numeric" class="input-monto" data-f="monto" value="${fmtMontoInput(p.monto)}">
        </div>
        ${mostrarRef(p.metodoPago) ? `
        <div class="form-group" style="margin:0;flex:1;min-width:160px">
          <label style="font-size:.72rem">Referencia</label>
          <input type="text" data-f="referencia" value="${esc(p.referencia || '')}" placeholder="CBU / N° / banco">
        </div>` : ''}
        ${pagos.length > 1 ? `<button type="button" class="btn btn-xs btn-ghost" data-del-pago="${i}" style="color:var(--danger)">✕</button>` : ''}
      </div>`).join('') + `<div data-pagos-resumen style="font-size:.78rem;margin-top:.2rem"></div>`;

    blk.querySelectorAll('[data-pago-idx]').forEach(row => {
      const i = Number(row.dataset.pagoIdx);
      row.querySelector('[data-f="metodoPago"]').addEventListener('change', e => { pagos[i].metodoPago = e.target.value; render(); });
      row.querySelector('[data-f="monto"]').addEventListener('input', e => { pagos[i].monto = valorMonto(e.target.value); resumen(); });
      row.querySelector('[data-f="referencia"]')?.addEventListener('input', e => { pagos[i].referencia = e.target.value; });
    });
    blk.querySelectorAll('[data-del-pago]').forEach(btn => {
      btn.addEventListener('click', () => { pagos.splice(Number(btn.dataset.delPago), 1); render(); });
    });
    resumen();
  };

  ov.querySelector('[data-btn-add-pago]').addEventListener('click', () => {
    const total = Number(getTotal()) || 0;
    const asignado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const restante = Math.max(0, total - asignado);
    const usados = pagos.map(p => p.metodoPago);
    const siguiente = METODOS_PAGO.find(m => !usados.includes(m.id))?.id || 'Transferencia';
    pagos.push({ metodoPago: siguiente, monto: restante || '', referencia: '' });
    render();
  });

  render();

  return {
    getPagos: () => pagos.filter(p => Number(p.monto) > 0)
      .map(p => ({ metodoPago: p.metodoPago, monto: Number(p.monto), referencia: p.referencia || null })),
    refrescarTotal: resumen,
  };
}

/* Claves `${cobroId}::${propietarioId}` ya liquidadas — permite que un cobro de una
   propiedad con 2+ dueños se liquide a uno primero y al otro después sin desaparecer
   de la lista de pendientes antes de tiempo. */
function clavesLiquidadas(liquidaciones) {
  const set = new Set();
  (liquidaciones || []).forEach(l => {
    const ids = (l.liquidadosCobros && l.liquidadosCobros.length) ? l.liquidadosCobros : (l.cobroId ? [l.cobroId] : []);
    const ownerIds = (l.propietarios && l.propietarios.length) ? l.propietarios.map(p => p.propietarioId) : (l.propietarioId ? [l.propietarioId] : []);
    ids.forEach(cid => ownerIds.forEach(oid => set.add(`${cid}::${oid}`)));
  });
  return set;
}

/* Agrupa candidatos por propietario ÚNICO de la propiedad, prorrateando el monto de cada
   cobro (siempre será su 100%, ya que no hay más dueños) — permite bundlear varias
   propiedades del mismo dueño en una sola liquidación. Las propiedades con 2+ dueños se
   agrupan aparte, ver `agruparPorPropiedadCoPropiedad`, para salir en UNA sola liquidación
   con el reparto entre todos los dueños en vez de una liquidación por dueño. */
function agruparPorPropietarioUnico(candidatos, liquidadas, state) {
  const { propietarios } = state;
  const grupos = {};
  candidatos.forEach(({ alq, cobro, inq, prop }) => {
    const owners = sel.propietariosDePropiedad(prop);
    if (owners.length !== 1) return; // co-propiedad: ver agruparPorPropiedadCoPropiedad
    const o = owners[0];
    if (cobro.id && liquidadas.has(`${cobro.id}::${o.propietarioId}`)) return; // ya liquidado a este dueño
    if (!grupos[o.propietarioId]) {
      grupos[o.propietarioId] = {
        propietarioId: o.propietarioId,
        own: propietarios.find(x => x.id === o.propietarioId),
        totalPropiedades: sel.propiedadesDe(o.propietarioId).filter(p => sel.propietariosDePropiedad(p).length === 1).length,
        cobros: [],
      };
    }
    const monto = Math.round((Number(cobro.monto) || 0) * (Number(o.porcentaje) || 0) / 100);
    grupos[o.propietarioId].cobros.push({ alq, cobro, inq, prop, owner: o, monto });
  });
  const arr = Object.values(grupos).map(g => {
    const meses = [...new Set(g.cobros.map(c => c.cobro.mes))].sort();
    return { ...g, meses };
  });
  arr.sort((a, b) => (a.meses[0] || '').localeCompare(b.meses[0] || ''));
  return arr;
}

/* Agrupa candidatos de propiedades con 2+ dueños — una tarjeta por PROPIEDAD (no por
   dueño), para que al liquidar salga una sola liquidación con el reparto entre todos los
   dueños adentro, en vez de una liquidación separada por cada uno. */
function agruparPorPropiedadCoPropiedad(candidatos, liquidadas) {
  const grupos = {};
  candidatos.forEach(({ alq, cobro, inq, prop }) => {
    const owners = sel.propietariosDePropiedad(prop);
    if (owners.length <= 1) return; // dueño único: ver agruparPorPropietarioUnico
    const yaLiquidadoATodos = cobro.id && owners.every(o => liquidadas.has(`${cobro.id}::${o.propietarioId}`));
    if (yaLiquidadoATodos) return;
    if (!grupos[prop.id]) {
      grupos[prop.id] = { esCoPropiedad: true, propiedadId: prop.id, prop, owners, cobros: [] };
    }
    grupos[prop.id].cobros.push({ alq, cobro, inq, prop, monto: Number(cobro.monto) || 0 });
  });
  const arr = Object.values(grupos).map(g => {
    const meses = [...new Set(g.cobros.map(c => c.cobro.mes))].sort();
    return { ...g, meses };
  });
  arr.sort((a, b) => (a.meses[0] || '').localeCompare(b.meses[0] || ''));
  return arr;
}

/* Detecta cobros pendientes de liquidar — separados en dos listas:
   "cobrados" (el inquilino ya pagó, listos para liquidar normalmente) e
   "impagos" (el inquilino todavía no pagó ese mes, pero igual se le puede
   adelantar el pago al propietario). Ambas vienen ya prorrateadas por propietario. */
function cobrosALiquidar(state) {
  const { alquileres, liquidaciones, clientes, propiedades } = state;
  const liquidadas = clavesLiquidadas(liquidaciones);

  const candidatosCobrados = [];
  const candidatosImpagos = [];

  alquileres.forEach(a => {
    const prop = propiedades.find(x => x.id === a.propiedadId);
    if (!prop) return;
    const inq = clientes.find(x => x.id === a.inquilinoId);

    (a.cobros || []).forEach(c => {
      if (!c.pagado || !c.monto) return;
      if (c.imputarAlMes) return; // imputado a un mes atrasado: no debe figurar para liquidar hoy
      candidatosCobrados.push({ alq: a, cobro: c, inq, prop });
    });

    sel.cobrosImpagosMes(a).forEach(c => {
      candidatosImpagos.push({ alq: a, cobro: c, inq, prop });
    });
  });

  return {
    cobrados: [
      ...agruparPorPropietarioUnico(candidatosCobrados, liquidadas, state),
      ...agruparPorPropiedadCoPropiedad(candidatosCobrados, liquidadas),
    ],
    impagos: [
      ...agruparPorPropietarioUnico(candidatosImpagos, liquidadas, state),
      ...agruparPorPropiedadCoPropiedad(candidatosImpagos, liquidadas),
    ],
  };
}

export default function liquidaciones(root) {
  root.innerHTML = `<div class="view" id="vLiq"></div>`;
  let filtro = 'pendientes'; // pendientes | historial
  let histFiltro = 'todas';  // todas | cobradas | adelantos
  let pendientes = { cobrados: [], impagos: [] };

  const render = () => {
    const state = getState();
    pendientes = cobrosALiquidar(state);
    pintar(root.querySelector('#vLiq'), filtro, pendientes, histFiltro);
  };

  render();
  const unsub = subscribe(render);

  root.querySelector('#vLiq').addEventListener('click', async e => {
    const pill = e.target.closest('[data-filtro]');
    if (pill) { filtro = pill.dataset.filtro; render(); return; }

    const histPill = e.target.closest('[data-hist-filtro]');
    if (histPill) { histFiltro = histPill.dataset.histFiltro; render(); return; }

    // Liquidar un grupo (todas las propiedades pendientes de un propietario, o una
    // co-propiedad completa, cobradas o adelanto)
    const btnLiq = e.target.closest('[data-liq-grupo]');
    if (btnLiq) {
      const tipoRaw = btnLiq.dataset.liqTipo; // 'cobrado' | 'impago' | 'cobrado-co' | 'impago-co'
      const esCo = tipoRaw.endsWith('-co');
      const tipo = esCo ? tipoRaw.replace('-co', '') : tipoRaw;
      const key = btnLiq.dataset.liqProp;
      const lista = tipo === 'impago' ? pendientes.impagos : pendientes.cobrados;
      if (esCo) {
        const grupo = lista.find(g => g.esCoPropiedad && g.propiedadId === key);
        if (grupo) abrirFormLiquidacionCoPropiedad({ ...grupo, adelanto: tipo === 'impago' }, render);
      } else {
        const grupo = lista.find(g => !g.esCoPropiedad && g.propietarioId === key);
        if (grupo) abrirFormLiquidacionGrupal({ ...grupo, adelanto: tipo === 'impago' }, render);
      }
      return;
    }

    // Acciones sobre liquidaciones ya registradas
    const card = e.target.closest('[data-liq-id]');
    if (!card) return;
    const id = card.dataset.liqId;

    if (e.target.closest('[data-pdf]'))      { generarPDF(id); return; }
    if (e.target.closest('[data-eliminar]')) {
      if (confirm('¿Eliminar esta liquidación?')) {
        await actions.deleteLiquidacion(id);
        toast('Liquidación eliminada');
      }
      return;
    }
  });

  return unsub;
}

function pintar(el, filtro, pendientes, histFiltro) {
  const state = getState();
  const { liquidaciones: list, alquileres } = state;
  const historial  = (list || []).map(l => {
    const alq  = alquileres.find(a => a.id === l.alquilerId) || {};
    const prop = state.propiedades.find(p => p.id === (l.propiedadId || alq.propiedadId)) || {};
    const esMulti = Array.isArray(l.propietarios) && l.propietarios.length > 0;
    const own  = esMulti ? null : (state.propietarios.find(p => p.id === (l.propietarioId || alq.propietarioId)) || {});
    const owns = esMulti ? l.propietarios.map(po => ({ ...po, own: state.propietarios.find(p => p.id === po.propietarioId) })) : null;
    const inq  = state.clientes.find(c => c.id === alq.inquilinoId) || {};

    // Para liquidaciones grupales de UN dueño con varias propiedades (bundle), contar
    // propiedades distintas. Las liquidaciones de co-propiedad ya traen `propiedadId`
    // seteado (una sola propiedad), así que no cuentan como "grupales" acá.
    let nPropsGrupal = 0;
    if (!l.propiedadId && l.liquidadosCobros && l.liquidadosCobros.length > 1) {
      const propIds = new Set();
      l.liquidadosCobros.forEach(cobroId => {
        const a = alquileres.find(a => (a.cobros || []).some(c => c.id === cobroId));
        if (a) propIds.add(a.propiedadId);
      });
      nPropsGrupal = propIds.size;
    }

    return { ...l, _alq: alq, _prop: prop, _own: own, _owns: owns, _inq: inq, _nPropsGrupal: nPropsGrupal };
  }).sort((a, b) => (b.fechaPago || '').localeCompare(a.fechaPago || ''));

  const historialFiltrado = histFiltro === 'cobradas'   ? historial.filter(l => l.cobradoInquilino !== false)
                           : histFiltro === 'adelantos'  ? historial.filter(l => l.cobradoInquilino === false)
                           : historial;

  const totalCobrar   = pendientes.cobrados.reduce((s, g) => s + (g.cobros || []).reduce((s2, c) => s2 + (c.monto || 0), 0), 0);
  const totalAdelanto = pendientes.impagos.reduce((s, g) => s + (g.cobros || []).reduce((s2, c) => s2 + (c.monto || 0), 0), 0);
  const nPend = pendientes.cobrados.length + pendientes.impagos.length;

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Liquidaciones</h1>
        <p class="view-sub">${pendientes.cobrados.length} por liquidar · ${fmt$(totalCobrar)}${pendientes.impagos.length ? ` · ${pendientes.impagos.length} adelanto${pendientes.impagos.length!==1?'s':''} posible${pendientes.impagos.length!==1?'s':''} · ${fmt$(totalAdelanto)}` : ''}</p>
      </div>
    </div>

    <!-- Pills -->
    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem">
      ${[
        { id:'pendientes', label:'Por liquidar', count: nPend, danger: nPend > 0 },
        { id:'historial',  label:'Historial',    count: historial.length },
      ].map(p => {
        const activo = filtro === p.id;
        const color  = p.danger ? 'var(--danger)' : 'var(--primary)';
        return `<button data-filtro="${p.id}" style="
          padding:.35rem .9rem;border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;
          background:${activo ? color : 'var(--surface-2)'};
          color:${activo ? '#fff' : (p.danger ? 'var(--danger)' : 'var(--text-soft)')};
          transition:all .15s">
          ${p.label}${p.count ? ` (${p.count})` : ''}
        </button>`;
      }).join('')}
    </div>

    ${filtro === 'pendientes' ? renderPendientes(pendientes) : renderHistorial(historialFiltrado, histFiltro)}
  `;
}

function renderPendientes(pendientes) {
  const { cobrados, impagos } = pendientes;
  if (!cobrados.length && !impagos.length) return `
    <div class="card" style="padding:2rem 1.5rem;text-align:center;color:var(--text-soft)">
      <div style="font-size:2rem;margin-bottom:.5rem">✅</div>
      <div style="font-weight:600;margin-bottom:.25rem">Todo liquidado</div>
      <div style="font-size:.82rem;color:var(--text-faint)">No hay cobros de inquilinos pendientes de liquidar al propietario</div>
    </div>`;

  return `
    ${cobrados.length ? `
    <div style="margin-bottom:${impagos.length ? '1.75rem' : '0'}">
      <div style="font-size:.78rem;font-weight:700;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.6rem">✅ Cobrado al inquilino — listo para liquidar</div>
      <div style="display:flex;flex-direction:column;gap:.6rem">
        ${cobrados.map(g => cardGrupo(g, 'cobrado')).join('')}
      </div>
    </div>` : ''}
    ${impagos.length ? `
    <div>
      <div style="font-size:.78rem;font-weight:700;color:var(--info);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.6rem">⏳ Adelanto — el inquilino aún no pagó ese mes</div>
      <div style="display:flex;flex-direction:column;gap:.6rem">
        ${impagos.map(g => cardGrupo(g, 'impago')).join('')}
      </div>
    </div>` : ''}`;
}

function cardGrupo(grupo, tipo) {
  if (grupo.esCoPropiedad) return cardGrupoCoPropiedad(grupo, tipo);

  const esImpago = tipo === 'impago';
  const totalCobros = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  const nProps = new Set(grupo.cobros.map(c => c.prop?.id)).size;
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;

  // Agrupar los cobros por propiedad para el detalle (una propiedad puede tener varios meses pendientes)
  const porProp = {};
  grupo.cobros.forEach(c => {
    const k = c.prop?.id || 'x';
    if (!porProp[k]) porProp[k] = { prop: c.prop, inq: c.inq, meses: [], total: 0 };
    porProp[k].meses.push(c.cobro.mes);
    porProp[k].total += c.monto || 0;
  });
  const detalle = Object.values(porProp);

  return `
    <div class="card" style="padding:1rem 1.25rem;border-left:3px solid ${esImpago ? 'var(--info)' : 'var(--warning)'}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
            <span style="font-weight:700;font-size:1.05rem">${esc(grupo.own?.nombre || '—')}</span>
            <span class="badge ${esImpago ? 'badge-info' : 'badge-warning'}" style="font-size:.72rem">${mesesLabelStr}</span>
            <span class="badge badge-neutral" style="font-size:.72rem">${nProps}/${grupo.totalPropiedades} ${grupo.totalPropiedades === 1 ? 'propiedad' : 'propiedades'}</span>
            ${esImpago ? `<span class="badge badge-info" style="font-size:.72rem">⏳ Adelanto</span>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            ${detalle.map(d => `
              <div style="font-size:.82rem;color:var(--text-soft)">
                ${esc(d.prop?.direccion || '—')}
                <span style="color:var(--text-faint)"> · ${d.meses.map(mesLabel).join(', ')} · ${esc(d.inq?.nombre || '—')} · ${fmt$(d.total)}</span>
              </div>`).join('')}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.5rem">
          <div style="font-size:1.3rem;font-weight:900;color:${esImpago ? 'var(--info)' : 'var(--warning)'}">${fmt$(totalCobros)}</div>
          <button class="btn btn-primary btn-sm" data-liq-grupo data-liq-tipo="${tipo}" data-liq-prop="${grupo.propietarioId}">
            ${esImpago ? 'Adelantar liquidación →' : 'Liquidar →'}
          </button>
        </div>
      </div>
    </div>`;
}

/* Tarjeta para una propiedad con 2+ dueños — liquidar acá genera UNA sola liquidación
   con el reparto entre todos los dueños adentro (ver abrirFormLiquidacionCoPropiedad). */
function cardGrupoCoPropiedad(grupo, tipo) {
  const { propietarios } = getState();
  const esImpago = tipo === 'impago';
  const totalCobros = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;
  const nombresOwners = grupo.owners
    .map(o => `${propietarios.find(p => p.id === o.propietarioId)?.nombre || '—'} (${o.porcentaje}%)`)
    .join(' + ');

  return `
    <div class="card" style="padding:1rem 1.25rem;border-left:3px solid ${esImpago ? 'var(--info)' : 'var(--warning)'}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
            <span style="font-weight:700;font-size:1.05rem">${esc(nombresOwners)}</span>
            <span class="badge badge-neutral" style="font-size:.72rem">👥 Co-propiedad</span>
            <span class="badge ${esImpago ? 'badge-info' : 'badge-warning'}" style="font-size:.72rem">${mesesLabelStr}</span>
            ${esImpago ? `<span class="badge badge-info" style="font-size:.72rem">⏳ Adelanto</span>` : ''}
          </div>
          <div style="font-size:.82rem;color:var(--text-soft)">
            ${esc(grupo.prop?.direccion || '—')}
            <span style="color:var(--text-faint)"> · ${grupo.cobros.map(c => `${mesLabel(c.cobro.mes)} · ${esc(c.inq?.nombre || '—')} · ${fmt$(c.monto)}`).join(' · ')}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.5rem">
          <div style="font-size:1.3rem;font-weight:900;color:${esImpago ? 'var(--info)' : 'var(--warning)'}">${fmt$(totalCobros)}</div>
          <button class="btn btn-primary btn-sm" data-liq-grupo data-liq-tipo="${tipo}-co" data-liq-prop="${grupo.propiedadId}">
            ${esImpago ? 'Adelantar liquidación →' : 'Liquidar →'}
          </button>
        </div>
      </div>
    </div>`;
}

function renderHistorial(historial, histFiltro) {
  const chips = [
    { id: 'todas',      label: 'Todas' },
    { id: 'cobradas',   label: 'Cobradas al inquilino' },
    { id: 'adelantos',  label: 'Adelantos' },
  ];
  const chipsHTML = `
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">
      ${chips.map(c => `
        <button data-hist-filtro="${c.id}" style="border:1.5px solid;border-radius:var(--r-full);padding:.25rem .75rem;font-size:.74rem;font-weight:600;cursor:pointer;transition:all .15s;${
          histFiltro === c.id
            ? 'background:var(--primary);color:var(--on-primary);border-color:var(--primary)'
            : 'background:var(--surface);color:var(--text);border-color:var(--border)'
        }">${c.label}</button>`).join('')}
    </div>`;

  if (!historial.length) return `
    ${chipsHTML}
    <div class="card" style="padding:2rem 1.5rem;text-align:center;color:var(--text-soft)">
      <div style="font-size:2rem;margin-bottom:.5rem">📄</div>
      <div style="font-weight:600">Sin historial aún</div>
    </div>`;

  return `
    ${chipsHTML}
    <div style="display:flex;flex-direction:column;gap:.6rem">
      ${historial.map(l => {
        const hon     = l.montoHonorarios ?? Math.round((l.montoAlquiler || 0) * (l.pctHonorarios || 0) / 100);
        const descTot = (l.descuentos || []).reduce((s, d) => s + (Number(d.monto) || 0), 0);
        const esGrupal = !l.propiedadId && l.liquidadosCobros && l.liquidadosCobros.length > 1;
        const esAdelanto = l.cobradoInquilino === false;
        const nombreCabecera = l._owns
          ? l._owns.map(o => `${esc(o.own?.nombre || '—')} (${o.porcentaje}%)`).join(' + ')
          : esc(l._own?.nombre || '—');
        return `
        <div class="card" data-liq-id="${l.id}" style="padding:1rem 1.25rem;${esAdelanto ? 'border-left:3px solid var(--info)' : ''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
                <span style="font-weight:700">${nombreCabecera}</span>
                <span class="badge badge-success">Liquidado</span>
                ${l._owns ? `<span class="badge badge-neutral" style="font-size:.72rem">👥 Co-propiedad</span>` : ''}
                ${esGrupal ? `<span class="badge badge-info" style="font-size:.72rem">📋 Grupal</span>` : ''}
                ${esAdelanto ? `<span class="badge badge-info" style="font-size:.72rem">⏳ Adelanto (no cobrado al inquilino)</span>` : ''}
                ${l.porcentajeReparto != null && l.porcentajeReparto < 100 ? `<span class="badge badge-neutral" style="font-size:.72rem">${l.porcentajeReparto}% de la propiedad</span>` : ''}
                ${l.meses && l.meses.length > 1
                  ? `<span class="badge badge-neutral">${mesLabel(l.meses[0])} – ${mesLabel(l.meses[l.meses.length - 1])}</span>`
                  : (l.mes ? `<span class="badge badge-neutral">${mesLabel(l.mes)}</span>` : '')}
              </div>
              <div style="font-size:.82rem;color:var(--text-soft);margin-bottom:.4rem">
                ${esGrupal ?
                  `<strong>${l._nPropsGrupal || 1} ${l._nPropsGrupal === 1 ? 'propiedad' : 'propiedades'}</strong> · ${l.liquidadosCobros.length} cobros` :
                  `${esc(l._prop?.direccion || '—')}${l._prop?.ciudad ? ' · ' + esc(l._prop.ciudad) : ''}`
                }
              </div>
              <div style="display:flex;gap:1.25rem;flex-wrap:wrap;font-size:.8rem">
                <span><span style="color:var(--text-soft)">Alquiler: </span><strong>${fmt$(l.montoAlquiler)}</strong></span>
                <span><span style="color:var(--text-soft)">Comisión${l._owns ? '' : ` (${l.pctHonorarios || 0}%)`}: </span><strong style="color:var(--danger)">−${fmt$(hon)}</strong></span>
                ${descTot ? `<span><span style="color:var(--text-soft)">Desc.: </span><strong style="color:var(--danger)">−${fmt$(descTot)}</strong></span>` : ''}
                <span><span style="color:var(--text-soft)">Pagado: </span><strong style="color:var(--success)">${fmt$(l.totalPagar)}</strong></span>
              </div>
              ${l._owns ? `
              <div style="font-size:.78rem;color:var(--text-soft);margin-top:.3rem;display:flex;flex-direction:column;gap:.15rem">
                ${l._owns.map(o => `<div>• ${esc(o.own?.nombre || '—')} — ${o.porcentaje}% · ${fmt$(o.totalPagar)}${o.formaPago ? ' · ' + esc(o.formaPago) : ''}</div>`).join('')}
              </div>` : ''}
              <div style="font-size:.78rem;color:var(--text-faint);margin-top:.35rem">
                ${fmtFecha(l.fechaPago)}${l._owns ? '' : ' · ' + esc(l.formaPago || 'Efectivo')}
                ${l.notas ? ' · ' + esc(l.notas) : ''}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:.3rem;flex-shrink:0">
              <button class="btn btn-sm btn-ghost" data-pdf="${l.id}">${icon('file')} PDF</button>
              <button class="btn btn-xs btn-ghost" style="color:var(--danger)" data-eliminar="${l.id}">${icon('trash')}</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

/* ── Generar PDF ── */
function generarPDF(id) {
  const { liquidaciones: list, alquileres, clientes, propietarios, propiedades } = getState();
  const l    = (list || []).find(x => x.id === id);
  if (!l) return;
  const alq  = alquileres.find(a => a.id === l.alquilerId) || {};
  const inq  = clientes.find(c => c.id === alq.inquilinoId) || {};
  const prop = propiedades.find(p => p.id === (l.propiedadId || alq.propiedadId)) || {};
  const cobroSint = { monto: l.montoAlquiler, mes: l.mes, fechaPago: l.fechaPago };
  const periodoLabel = !l.mes && l.meses && l.meses.length > 1
    ? `${mesLabel(l.meses[0])} – ${mesLabel(l.meses[l.meses.length - 1])}`
    : null;

  if (Array.isArray(l.propietarios) && l.propietarios.length) {
    const propietariosImpresion = l.propietarios.map(po => ({
      nombre: propietarios.find(p => p.id === po.propietarioId)?.nombre || '—',
      porcentaje: po.porcentaje,
      montoBruto: po.montoBruto,
      pctHonorarios: po.pagaComision ? po.comisionPct : 0,
      montoHonorarios: po.montoHonorarios,
      totalPagar: po.totalPagar,
      formaPago: po.formaPago,
      pagos: po.pagos || [],
    }));
    imprimirLiquidacion({ alq, cobro: cobroSint, inquilino: inq, propiedad: prop, propietario: null,
      propietarios: propietariosImpresion, descuentos: l.descuentos || [], periodoLabel });
    return;
  }

  const own = propietarios.find(p => p.id === (l.propietarioId || alq.propietarioId)) || {};
  imprimirLiquidacion({ alq, cobro: cobroSint, inquilino: inq, propiedad: prop, propietario: own,
    pctHonorarios: l.pctHonorarios || 0, descuentos: l.descuentos || [], formaPago: l.formaPago || 'Efectivo',
    pagos: l.pagos || [], porcentajeReparto: l.porcentajeReparto, periodoLabel });
}

/* ── Formulario liquidar GRUPAL (múltiples propiedades de un propietario) ── */
export function abrirFormLiquidacionGrupal(grupo, onDone) {
  const { propietarios } = getState();
  const own = grupo.own || {};
  const adelanto = !!grupo.adelanto;

  // Calcular totales
  const totalMonto = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  const pctDef = grupo.cobros[0]?.owner?.comisionPct ?? 10;

  const hoy = new Date().toISOString().slice(0, 10);
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;

  // Agrupar los cobros por propiedad (una propiedad puede tener varios meses pendientes)
  const porProp = {};
  grupo.cobros.forEach(c => {
    const k = c.prop?.id || 'x';
    if (!porProp[k]) porProp[k] = { prop: c.prop, inq: c.inq, periodos: [], total: 0, owner: c.owner, multiDueno: sel.propietariosDePropiedad(c.prop).length > 1 };
    porProp[k].periodos.push({ mes: c.cobro.mes, fechaPago: c.cobro.fechaPago });
    porProp[k].total += c.monto || 0;
  });
  const detalleProps = Object.values(porProp);

  openModal({
    title: `${adelanto ? 'Adelanto a propietario' : 'Liquidación grupal'} — ${esc(own.nombre || '—')} — ${mesesLabelStr}`,
    size: 'xl',
    bodyHTML: `
      <form id="liqGrupalForm">
        ${adelanto ? `
        <div style="padding:.85rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--info) 10%,transparent);border:1px solid var(--info);margin-bottom:1.1rem;font-size:.85rem">
          ⚠ El inquilino todavía no pagó ${grupo.meses.length > 1 ? 'estos meses' : 'este mes'}. Este pago es un <strong>adelanto</strong> de la inmobiliaria al propietario.
        </div>` : ''}

        <!-- Resumen de propiedades y cobros -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1.25rem;border:1px solid var(--border)">
          <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Propiedades y ${adelanto ? 'meses' : 'cobros'} del período (${detalleProps.length}/${grupo.totalPropiedades} ${grupo.totalPropiedades === 1 ? 'propiedad' : 'propiedades'})</div>
          <div style="display:flex;flex-direction:column;gap:.6rem">
            ${detalleProps.map((d, i) => `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:.6rem;background:var(--surface);border-radius:var(--r-sm);border-left:3px solid var(--primary)" data-detalle-idx="${i}">
              <div style="flex:1">
                <div style="font-weight:600;margin-bottom:.2rem">${esc(d.prop?.direccion || '—')}</div>
                <div style="font-size:.78rem;color:var(--text-soft)">${esc(d.inq?.nombre || '—')} · ${esc(d.prop?.barrio || '')}</div>
                <div style="font-size:.75rem;color:var(--text-faint);margin-top:.2rem">${d.periodos.map(p => `${mesLabel(p.mes)}${p.fechaPago ? ` · Cobrado: ${fmtFecha(p.fechaPago)}` : ''}`).join(' · ')}</div>
                ${d.multiDueno ? `
                <div style="display:flex;gap:.75rem;align-items:center;margin-top:.5rem;flex-wrap:wrap;padding-top:.5rem;border-top:1px dashed var(--border)">
                  <span style="font-size:.72rem;color:var(--text-soft)">Esta propiedad tiene varios dueños —</span>
                  <label style="font-size:.72rem;color:var(--text-soft)">tu %:
                    <input type="number" min="0" max="100" step="0.5" class="reparto-pct" data-idx="${i}" value="${d.owner?.porcentaje ?? 100}" style="width:65px;margin-left:.25rem">
                  </label>
                  <label style="font-size:.72rem;color:var(--text-soft);display:flex;align-items:center;gap:.25rem">
                    <input type="checkbox" class="reparto-paga" data-idx="${i}" ${(d.owner?.pagaComision ?? true) ? 'checked' : ''}> ¿Pagás comisión vos?
                  </label>
                  <label style="font-size:.72rem;color:var(--text-soft)">% comisión:
                    <input type="number" min="0" max="100" step="0.5" class="reparto-comision" data-idx="${i}" value="${d.owner?.comisionPct ?? ''}" placeholder="gral." style="width:60px;margin-left:.25rem">
                  </label>
                </div>` : ''}
              </div>
              <div style="font-weight:700;font-size:1.1rem;text-align:right;color:var(--primary)">${fmt$(d.total)}</div>
            </div>`).join('')}
          </div>
          <div style="border-top:2px solid var(--border);margin-top:.75rem;padding-top:.75rem;display:flex;justify-content:space-between;align-items:center;font-size:1.1rem;font-weight:800">
            <span>TOTAL ${adelanto ? 'A ADELANTAR' : 'COBRADO'}</span>
            <span style="color:var(--primary);font-size:1.3rem">${fmt$(totalMonto)}</span>
          </div>
        </div>

        <h3 class="form-section-title">Comisión de la inmobiliaria</h3>
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>% Comisión ${detalleProps.some(d => d.multiDueno) ? '(general, para propiedades sin % propio)' : ''}</label>
            <input name="pctHonorarios" id="liqPct" type="number" min="0" max="100" step="0.5" value="${pctDef}">
          </div>
          <div class="form-group">
            <label>Monto comisión $</label>
            <input id="liqMontoHon" type="text" readonly style="background:var(--surface-2);font-weight:700">
          </div>
          <div class="form-group">
            <label style="color:var(--success);font-weight:700">Total a pagar al propietario $</label>
            <input name="totalPagar" id="liqTotal" type="text" inputmode="numeric" class="input-monto" style="font-size:1.1rem;font-weight:800;color:var(--success)">
          </div>
        </div>

        <h3 class="form-section-title">Descuentos / deducciones</h3>
        <div id="descBlk" style="margin-bottom:.5rem"></div>
        <button type="button" id="btnAddDesc" class="btn btn-sm btn-ghost" style="margin-bottom:1.25rem">${icon('plus')} Agregar descuento</button>

        <h3 class="form-section-title">Datos del pago</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Fecha de pago <span class="req">*</span></label>
            <input name="fechaPago" type="date" value="${hoy}">
          </div>
          ${pagosBlockHTML()}
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar${adelanto ? ' adelanto' : ''} y generar PDF</button>`,
    onMount(ctx) {
      const q = (s) => ctx.overlay.querySelector(s);
      let pagosCtl = null;

      const honorariosAuto = () => {
        // Si hay filas con reparto propio (multi-dueño), calcular por propiedad; el resto usa el % general.
        const pctGeneral = Number(q('#liqPct').value) || 0;
        return detalleProps.reduce((sum, d, i) => {
          if (!d.multiDueno) return sum + Math.round(d.total * pctGeneral / 100);
          const paga = ctx.overlay.querySelector(`.reparto-paga[data-idx="${i}"]`)?.checked ?? true;
          if (!paga) return sum;
          const comisionInp = ctx.overlay.querySelector(`.reparto-comision[data-idx="${i}"]`);
          const pctPropio = comisionInp && comisionInp.value !== '' ? Number(comisionInp.value) : pctGeneral;
          return sum + Math.round(d.total * pctPropio / 100);
        }, 0);
      };

      const recalcular = () => {
        const hon  = honorariosAuto();
        const desc = Array.from(q('#descBlk').querySelectorAll('[data-desc-monto]'))
          .reduce((s, el) => s + valorMonto(el.value), 0);
        const total = totalMonto - hon - desc;
        q('#liqMontoHon').value = fmtMontoInput(hon);
        q('#liqTotal').value = fmtMontoInput(total);
        pagosCtl?.refrescarTotal();
      };

      ctx.overlay.querySelectorAll('.reparto-pct, .reparto-paga, .reparto-comision').forEach(inp => {
        inp.addEventListener('input', recalcular);
        inp.addEventListener('change', recalcular);
      });

      const renderDescs = () => {
        const block = q('#descBlk');
        block.innerHTML = (q('#liqGrupalForm')).descuentos?.map((d, i) => `
          <div style="display:flex;gap:.5rem;align-items:flex-end;margin-bottom:.5rem">
            <input type="text" placeholder="Concepto" value="${esc(d.concepto || '')}" data-desc-concepto="${i}" style="flex:1">
            <input type="text" inputmode="numeric" class="input-monto" placeholder="Monto" value="${fmtMontoInput(d.monto)}" data-desc-monto="${i}" style="width:100px">
            <button type="button" data-del-desc="${i}" class="btn btn-xs btn-ghost" style="color:var(--danger)">${icon('trash')}</button>
          </div>`).join('') || '';
        block.querySelectorAll('[data-desc-monto]').forEach(el => {
          el.addEventListener('input', () => {
            const idx = Number(el.dataset.descMonto);
            const form = q('#liqGrupalForm');
            if (form.descuentos?.[idx]) form.descuentos[idx].monto = valorMonto(el.value);
            recalcular();
          });
        });
      };

      q('#liqPct').addEventListener('input', recalcular);

      q('#btnAddDesc').addEventListener('click', () => {
        const form = q('#liqGrupalForm');
        form.descuentos = form.descuentos || [];
        form.descuentos.push({ concepto: '', monto: 0 });
        renderDescs();
        recalcular();
      });

      q('#descBlk').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del-desc]');
        if (btn) {
          const idx = Number(btn.dataset.delDesc);
          const form = q('#liqGrupalForm');
          if (form.descuentos) form.descuentos.splice(idx, 1);
          renderDescs();
          recalcular();
        }
      });

      const guardar = async (conPDF) => {
        const form = q('#liqGrupalForm');
        const totalPagar = valorMonto(q('#liqTotal').value);

        const pagos = pagosCtl.getPagos();
        if (!pagos.length) { toast('Indicá la forma de pago', { tipo: 'warning' }); return; }
        if (pagos.length > 1) {
          const suma = pagos.reduce((s, p) => s + p.monto, 0);
          if (Math.round(suma * 100) !== Math.round(totalPagar * 100)) {
            toast('La suma de las formas de pago no coincide con el total a pagar', { tipo: 'warning' });
            return;
          }
        }

        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        data.propietarioId = grupo.propietarioId;
        data.meses = grupo.meses;
        data.mes = grupo.meses.length === 1 ? grupo.meses[0] : null;
        data.montoAlquiler = totalMonto;
        data.pctHonorarios = Number(data.pctHonorarios) || 0;
        data.montoHonorarios = valorMonto(q('#liqMontoHon').value);
        data.totalPagar = totalPagar;
        data.descuentos = form.descuentos || [];
        data.pagos = pagos;
        data.formaPago = pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago;
        data.cobradoInquilino = !adelanto;

        // Si veníamos de "adelanto", materializar los cobros placeholder (sin id) antes de guardar
        const idsLiquidados = [];
        for (const item of grupo.cobros) {
          let cobroId = item.cobro.id;
          if (!cobroId) {
            const nuevo = await actions.addCobro(item.alq.id, {
              mes: item.cobro.mes, monto: item.cobro.monto, montoAlquiler: item.cobro.monto, pagado: false,
            });
            cobroId = nuevo?.id;
          }
          if (cobroId) idsLiquidados.push(cobroId);
        }
        data.liquidadosCobros = idsLiquidados;

        const liq = await actions.createLiquidacion(data);

        // Persistir el reparto tocado por propiedad (si había filas multi-dueño), para la próxima vez
        for (let i = 0; i < detalleProps.length; i++) {
          const d = detalleProps[i];
          if (!d.multiDueno || !d.prop) continue;
          const pctInp  = ctx.overlay.querySelector(`.reparto-pct[data-idx="${i}"]`);
          const pagaInp = ctx.overlay.querySelector(`.reparto-paga[data-idx="${i}"]`);
          const comInp  = ctx.overlay.querySelector(`.reparto-comision[data-idx="${i}"]`);
          if (!pctInp) continue;
          const actuales = sel.propietariosDePropiedad(d.prop);
          const actualizados = actuales.map(o => o.propietarioId === grupo.propietarioId
            ? { ...o, porcentaje: Number(pctInp.value) || o.porcentaje, pagaComision: !!pagaInp?.checked, comisionPct: comInp?.value !== '' ? Number(comInp.value) : null }
            : o);
          await actions.updatePropiedad(d.prop.id, { propietarios: actualizados });
        }

        if (conPDF && liq) {
          imprimirLiquidacion({
            alq: {},
            cobro: { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago },
            inquilino: {},
            propiedad: {},
            propietario: own,
            pctHonorarios: liq.pctHonorarios || 0,
            descuentos: liq.descuentos || [],
            formaPago: liq.formaPago || 'Efectivo',
            pagos: liq.pagos || [],
          });
        }

        toast(adelanto ? 'Adelanto registrado' : 'Liquidación registrada');
        ctx.close();
        onDone?.();
      };

      q('#btnSoloGuardar').addEventListener('click', () => guardar(false));
      q('#btnGuardarPDF').addEventListener('click', () => guardar(true));

      recalcular();
      renderDescs();

      pagosCtl = montarPagos(ctx.overlay, { getTotal: () => valorMonto(q('#liqTotal').value) });
      q('#liqTotal').addEventListener('input', () => pagosCtl?.refrescarTotal());
    }
  });
}

/* ── Formulario liquidar CO-PROPIEDAD: una propiedad con 2+ dueños → UNA sola
   liquidación con el reparto entre todos los dueños adentro (no una por dueño). ── */
export function abrirFormLiquidacionCoPropiedad(grupo, onDone) {
  const { propietarios } = getState();
  const adelanto = !!grupo.adelanto;
  const prop = grupo.prop;
  const dueños = grupo.owners;

  const totalMonto = grupo.cobros.reduce((s, c) => s + (c.monto || 0), 0);
  const hoy = new Date().toISOString().slice(0, 10);
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;

  openModal({
    title: `${adelanto ? 'Adelanto a propietarios' : 'Liquidación'} — ${esc(prop?.direccion || '—')} — ${mesesLabelStr}`,
    size: 'xl',
    bodyHTML: `
      <form id="liqCoForm">
        ${adelanto ? `
        <div style="padding:.85rem 1rem;border-radius:var(--r-md);background:color-mix(in srgb,var(--info) 10%,transparent);border:1px solid var(--info);margin-bottom:1.1rem;font-size:.85rem">
          ⚠ El inquilino todavía no pagó ${grupo.meses.length > 1 ? 'estos meses' : 'este mes'}. Este pago es un <strong>adelanto</strong> de la inmobiliaria a los propietarios.
        </div>` : ''}

        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1.25rem;border:1px solid var(--border)">
          <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">${esc(prop?.direccion || '—')} · ${adelanto ? 'Meses' : 'Cobros'} del período</div>
          <div style="display:flex;flex-direction:column;gap:.35rem">
            ${grupo.cobros.map(c => `
              <div style="display:flex;justify-content:space-between;font-size:.85rem">
                <span>${mesLabel(c.cobro.mes)} · ${esc(c.inq?.nombre || '—')}</span>
                <strong>${fmt$(c.monto)}</strong>
              </div>`).join('')}
          </div>
          <div style="border-top:2px solid var(--border);margin-top:.75rem;padding-top:.75rem;display:flex;justify-content:space-between;align-items:center;font-size:1.1rem;font-weight:800">
            <span>TOTAL ${adelanto ? 'A ADELANTAR' : 'COBRADO'}</span>
            <span style="color:var(--primary);font-size:1.3rem">${fmt$(totalMonto)}</span>
          </div>
        </div>

        <h3 class="form-section-title">Reparto entre propietarios</h3>
        <div id="repartoBlk" style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:.4rem">
          ${dueños.map((o, i) => `
            <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;padding:.6rem .75rem;background:var(--surface-2);border-radius:var(--r-sm)" data-reparto-idx="${i}">
              <div style="flex:1;min-width:140px;font-weight:600">${esc(propietarios.find(p => p.id === o.propietarioId)?.nombre || '—')}</div>
              <label style="font-size:.75rem;color:var(--text-soft)">%
                <input type="number" min="0" max="100" step="0.5" class="reparto-pct" value="${o.porcentaje}" style="width:65px;margin-left:.3rem">
              </label>
              <label style="font-size:.75rem;color:var(--text-soft);display:flex;align-items:center;gap:.3rem">
                <input type="checkbox" class="reparto-paga" ${o.pagaComision ? 'checked' : ''}> ¿Paga comisión?
              </label>
              <label style="font-size:.75rem;color:var(--text-soft)">% comisión
                <input type="number" min="0" max="100" step="0.5" class="reparto-comision" value="${o.comisionPct ?? 10}" style="width:60px;margin-left:.3rem">
              </label>
              <div class="reparto-monto" style="font-weight:700;min-width:90px;text-align:right"></div>
            </div>`).join('')}
        </div>
        <div id="repartoResumen" style="font-size:.78rem;margin-bottom:1.1rem"></div>

        <h3 class="form-section-title">Descuentos / deducciones</h3>
        <div id="descBlk" style="margin-bottom:.5rem"></div>
        <button type="button" id="btnAddDesc" class="btn btn-sm btn-ghost" style="margin-bottom:1.25rem">${icon('plus')} Agregar descuento</button>

        <div class="form-grid" style="margin-bottom:1.25rem">
          <div class="form-group">
            <label>Fecha de pago <span class="req">*</span></label>
            <input name="fechaPago" type="date" value="${hoy}">
          </div>
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>

        <h3 class="form-section-title">Forma de pago por propietario</h3>
        <div id="pagosPorDueno" style="display:flex;flex-direction:column;gap:1rem"></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar${adelanto ? ' adelanto' : ''} y generar PDF</button>`,
    onMount(ctx) {
      const q = (s) => ctx.overlay.querySelector(s);
      const pagosCtls = [];

      const descuentosTotal = () => [...q('#descBlk').querySelectorAll('[data-desc-monto]')]
        .reduce((s, el) => s + valorMonto(el.value), 0);

      const montoOwnerActual = (i) => {
        const row = ctx.overlay.querySelectorAll('[data-reparto-idx]')[i];
        if (!row) return 0;
        const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
        const paga   = row.querySelector('.reparto-paga').checked;
        const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
        const desc   = descuentosTotal();
        const montoOwner = Math.round(totalMonto * pct / 100);
        const descOwner  = Math.round(desc * pct / 100);
        const honOwner   = paga ? Math.round(montoOwner * pctCom / 100) : 0;
        return montoOwner - honOwner - descOwner;
      };

      const recalcular = () => {
        const desc = descuentosTotal();
        let totalHon = 0, totalPagarSum = 0;
        ctx.overlay.querySelectorAll('[data-reparto-idx]').forEach((row, i) => {
          const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
          const paga   = row.querySelector('.reparto-paga').checked;
          const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
          const montoOwner = Math.round(totalMonto * pct / 100);
          const descOwner  = Math.round(desc * pct / 100);
          const honOwner   = paga ? Math.round(montoOwner * pctCom / 100) : 0;
          const totalOwner = montoOwner - honOwner - descOwner;
          row.querySelector('.reparto-monto').textContent = fmt$(totalOwner);
          totalHon += honOwner;
          totalPagarSum += totalOwner;
          pagosCtls[i]?.refrescarTotal();
        });
        const sumaPct = [...ctx.overlay.querySelectorAll('.reparto-pct')].reduce((s, i) => s + (Number(i.value) || 0), 0);
        const resumen = q('#repartoResumen');
        if (resumen) {
          resumen.textContent = `% asignado: ${sumaPct}% de 100% · Comisión total: ${fmt$(totalHon)} · Total a repartir: ${fmt$(totalPagarSum)}`;
          resumen.style.color = Math.round(sumaPct) === 100 ? 'var(--success)' : 'var(--warning)';
        }
      };

      ctx.overlay.querySelectorAll('.reparto-pct, .reparto-paga, .reparto-comision').forEach(inp => {
        inp.addEventListener('input', recalcular);
        inp.addEventListener('change', recalcular);
      });

      const renderPagosPorDueno = () => {
        const blk = q('#pagosPorDueno');
        blk.innerHTML = dueños.map((o, i) => `
          <div data-pago-dueno="${i}">
            <div style="font-weight:600;font-size:.85rem;margin-bottom:.4rem">${esc(propietarios.find(p => p.id === o.propietarioId)?.nombre || '—')}</div>
            ${pagosBlockHTML()}
          </div>`).join('');
        dueños.forEach((o, i) => {
          const cont = blk.querySelector(`[data-pago-dueno="${i}"]`);
          pagosCtls[i] = montarPagos(cont, { getTotal: () => montoOwnerActual(i) });
        });
      };

      const renderDescs = () => {
        const block = q('#descBlk');
        const form = q('#liqCoForm');
        block.innerHTML = (form.descuentos || []).map((d, i) => `
          <div style="display:flex;gap:.5rem;align-items:flex-end;margin-bottom:.5rem">
            <input type="text" placeholder="Concepto" value="${esc(d.concepto || '')}" data-desc-concepto="${i}" style="flex:1">
            <input type="text" inputmode="numeric" class="input-monto" placeholder="Monto" value="${fmtMontoInput(d.monto)}" data-desc-monto="${i}" style="width:100px">
            <button type="button" data-del-desc="${i}" class="btn btn-xs btn-ghost" style="color:var(--danger)">${icon('trash')}</button>
          </div>`).join('');
        block.querySelectorAll('[data-desc-monto]').forEach(el => {
          el.addEventListener('input', () => {
            const idx = Number(el.dataset.descMonto);
            if (form.descuentos?.[idx]) form.descuentos[idx].monto = valorMonto(el.value);
            recalcular();
          });
        });
      };

      q('#btnAddDesc').addEventListener('click', () => {
        const form = q('#liqCoForm');
        form.descuentos = form.descuentos || [];
        form.descuentos.push({ concepto: '', monto: 0 });
        renderDescs();
        recalcular();
      });

      q('#descBlk').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del-desc]');
        if (btn) {
          const idx = Number(btn.dataset.delDesc);
          const form = q('#liqCoForm');
          if (form.descuentos) form.descuentos.splice(idx, 1);
          renderDescs();
          recalcular();
        }
      });

      renderPagosPorDueno();
      renderDescs();
      recalcular();

      const guardar = async (conPDF) => {
        const f = q('#liqCoForm');
        if (!f.fechaPago.value) { toast('Indicá la fecha de pago', { tipo: 'warning' }); return; }

        const filas = [...ctx.overlay.querySelectorAll('[data-reparto-idx]')].map((row, i) => ({
          propietarioId: dueños[i].propietarioId,
          porcentaje:    Number(row.querySelector('.reparto-pct').value) || 0,
          pagaComision:  row.querySelector('.reparto-paga').checked,
          comisionPct:   Number(row.querySelector('.reparto-comision').value) || 0,
        }));
        const sumaPct = filas.reduce((s, fl) => s + fl.porcentaje, 0);
        if (Math.round(sumaPct) !== 100) {
          toast('El % repartido entre los propietarios debe sumar 100%', { tipo: 'warning' });
          return;
        }

        const descuentos = (f.descuentos || []).filter(d => d.concepto && d.monto);
        const descTotal = descuentos.reduce((s, d) => s + (Number(d.monto) || 0), 0);

        const propietariosData = [];
        for (let i = 0; i < filas.length; i++) {
          const fila = filas[i];
          const nombreOwner = propietarios.find(p => p.id === fila.propietarioId)?.nombre || '';
          const pagos = pagosCtls[i]?.getPagos() || [];
          if (!pagos.length) { toast(`Indicá la forma de pago de ${esc(nombreOwner)}`, { tipo: 'warning' }); return; }
          const montoOwner = Math.round(totalMonto * fila.porcentaje / 100);
          const descOwner  = Math.round(descTotal * fila.porcentaje / 100);
          const honOwner   = fila.pagaComision ? Math.round(montoOwner * fila.comisionPct / 100) : 0;
          const totalOwner = montoOwner - honOwner - descOwner;
          const sumaPagos  = pagos.reduce((s, p) => s + p.monto, 0);
          if (Math.round(sumaPagos * 100) !== Math.round(totalOwner * 100)) {
            toast(`La forma de pago de ${esc(nombreOwner)} no coincide con su total`, { tipo: 'warning' });
            return;
          }
          propietariosData.push({
            propietarioId: fila.propietarioId,
            porcentaje: fila.porcentaje,
            pagaComision: fila.pagaComision,
            comisionPct: fila.pagaComision ? fila.comisionPct : 0,
            montoBruto: montoOwner,
            montoHonorarios: honOwner,
            descuentoMonto: descOwner,
            totalPagar: totalOwner,
            formaPago: pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago,
            pagos,
          });
        }

        // Si veníamos de "adelanto", materializar los cobros placeholder (sin id) antes de guardar
        const idsLiquidados = [];
        for (const item of grupo.cobros) {
          let cobroId = item.cobro.id;
          if (!cobroId) {
            const nuevo = await actions.addCobro(item.alq.id, {
              mes: item.cobro.mes, monto: item.cobro.monto, montoAlquiler: item.cobro.monto, pagado: false,
            });
            cobroId = nuevo?.id;
          }
          if (cobroId) idsLiquidados.push(cobroId);
        }

        const data = {
          propiedadId: prop.id,
          alquilerId: grupo.cobros[0]?.alq?.id || null,
          propietarioId: null,
          propietarios: propietariosData,
          liquidadosCobros: idsLiquidados,
          meses: grupo.meses,
          mes: grupo.meses.length === 1 ? grupo.meses[0] : null,
          montoAlquiler: totalMonto,
          montoHonorarios: propietariosData.reduce((s, p) => s + p.montoHonorarios, 0),
          totalPagar: propietariosData.reduce((s, p) => s + p.totalPagar, 0),
          descuentos,
          estado: 'pagada',
          cobradoInquilino: !adelanto,
          fechaPago: f.fechaPago.value,
          notas: f.notas.value || null,
        };

        const liq = await actions.createLiquidacion(data);

        // Persistir el reparto confirmado en la propiedad para la próxima vez
        await actions.updatePropiedad(prop.id, {
          propietarios: filas.map(fl => ({ propietarioId: fl.propietarioId, porcentaje: fl.porcentaje, pagaComision: fl.pagaComision, comisionPct: fl.comisionPct })),
        });

        if (conPDF && liq) {
          imprimirLiquidacion({
            alq: {}, cobro: { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago },
            inquilino: {}, propiedad: prop, propietario: null,
            propietarios: propietariosData.map(po => ({
              nombre: propietarios.find(p => p.id === po.propietarioId)?.nombre || '—',
              porcentaje: po.porcentaje, montoBruto: po.montoBruto,
              pctHonorarios: po.pagaComision ? po.comisionPct : 0,
              montoHonorarios: po.montoHonorarios, totalPagar: po.totalPagar,
              formaPago: po.formaPago, pagos: po.pagos,
            })),
            descuentos: liq.descuentos || [],
            periodoLabel: mesesLabelStr,
          });
        }

        toast(adelanto ? 'Adelanto registrado' : 'Liquidación registrada');
        ctx.close();
        onDone?.();
      };

      q('#btnSoloGuardar').addEventListener('click', () => guardar(false));
      q('#btnGuardarPDF').addEventListener('click', () => guardar(true));
    },
  });
}

/* ── Formulario liquidar (crear ya pagada), un cobro puntual de una propiedad ── */
export function abrirFormLiquidacion(pre, onDone) {
  const { propietarios, propiedades, clientes } = getState();
  const alq   = pre?.alq  || {};
  const cobro = pre?.cobro || {};
  const prop  = propiedades.find(p => p.id === alq.propiedadId) || {};
  const inq   = clientes.find(c => c.id === alq.inquilinoId)    || {};
  const monto = cobro.monto || alq.montoActual || alq.montoInicial || 0;
  const hoy   = new Date().toISOString().slice(0, 10);

  const dueños = sel.propietariosDePropiedad(prop);
  const multi  = dueños.length > 1;
  const own    = propietarios.find(p => p.id === (dueños[0]?.propietarioId || alq.propietarioId)) || {};
  const pctDef = dueños[0]?.comisionPct ?? alq.pctHonorarios ?? alq.comision ?? 10;

  let descIdx = 0;

  openModal({
    title: 'Liquidar al propietario',
    size: multi ? 'xl' : 'lg',
    bodyHTML: `
      <form id="liqForm">
        <!-- Info del cobro -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.85rem 1rem;margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
          <div>
            <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem">Cobro a liquidar</div>
            <div style="font-weight:700">${multi ? esc(dueños.map(o => propietarios.find(p=>p.id===o.propietarioId)?.nombre || '—').join(' + ')) : esc(own?.nombre || '—')}</div>
            <div style="font-size:.82rem;color:var(--text-soft)">${esc(prop?.direccion || '—')} · ${mesLabel(cobro.mes)}</div>
            <div style="font-size:.78rem;color:var(--text-faint)">Inquilino: ${esc(inq?.nombre || '—')} · Cobrado el ${fmtFecha(cobro.fechaPago)}</div>
          </div>
          <div style="font-size:1.4rem;font-weight:900">${fmt$(monto)}</div>
        </div>

        ${multi ? `
        <h3 class="form-section-title">Reparto entre propietarios</h3>
        <div id="repartoBlk" style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:.4rem">
          ${dueños.map((o, i) => `
            <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;padding:.6rem .75rem;background:var(--surface-2);border-radius:var(--r-sm)" data-reparto-idx="${i}">
              <div style="flex:1;min-width:140px;font-weight:600">${esc(propietarios.find(p=>p.id===o.propietarioId)?.nombre || '—')}</div>
              <label style="font-size:.75rem;color:var(--text-soft)">%
                <input type="number" min="0" max="100" step="0.5" class="reparto-pct" value="${o.porcentaje}" style="width:65px;margin-left:.3rem">
              </label>
              <label style="font-size:.75rem;color:var(--text-soft);display:flex;align-items:center;gap:.3rem">
                <input type="checkbox" class="reparto-paga" ${o.pagaComision ? 'checked' : ''}> ¿Paga comisión?
              </label>
              <label style="font-size:.75rem;color:var(--text-soft)">% comisión
                <input type="number" min="0" max="100" step="0.5" class="reparto-comision" value="${o.comisionPct ?? (alq.pctHonorarios ?? alq.comision ?? 10)}" style="width:60px;margin-left:.3rem">
              </label>
              <div class="reparto-monto" style="font-weight:700;min-width:90px;text-align:right"></div>
            </div>`).join('')}
        </div>
        <div id="repartoResumen" style="font-size:.78rem;margin-bottom:1.1rem"></div>
        ` : `
        <h3 class="form-section-title">Honorarios de la inmobiliaria</h3>
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>% Honorarios</label>
            <input name="pctHonorarios" id="liqPct" type="number" min="0" max="100" step="0.5" value="${pctDef}">
          </div>
          <div class="form-group">
            <label>Monto honorarios $</label>
            <input id="liqMontoHon" type="text" readonly style="background:var(--surface-2);font-weight:700">
          </div>
          <div class="form-group">
            <label style="color:var(--success);font-weight:700">Total a pagar al propietario $</label>
            <input name="totalPagar" id="liqTotal" type="text" inputmode="numeric" class="input-monto" style="font-size:1.1rem;font-weight:800;color:var(--success)">
          </div>
        </div>
        `}

        <h3 class="form-section-title">Descuentos / deducciones</h3>
        <div id="descBlk" style="margin-bottom:.5rem"></div>
        <button type="button" id="btnAddDesc" class="btn btn-sm btn-ghost" style="margin-bottom:1.25rem">${icon('plus')} Agregar descuento</button>

        <h3 class="form-section-title">Datos del pago</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Fecha de pago <span class="req">*</span></label>
            <input name="fechaPago" type="date" value="${hoy}">
          </div>
          ${!multi ? pagosBlockHTML() : ''}
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>

        ${multi ? `
        <h3 class="form-section-title">Forma de pago por propietario</h3>
        <div id="pagosPorDueno" style="display:flex;flex-direction:column;gap:1rem"></div>
        ` : ''}
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar y generar PDF</button>`,
    onMount(ctx) {
      const q = (s) => ctx.overlay.querySelector(s);
      let pagosCtl = null;
      const pagosCtls = [];

      const descuentosTotal = () => [...ctx.overlay.querySelectorAll('[name^="desc_monto"]')]
        .reduce((s, i) => s + valorMonto(i.value), 0);

      const montoOwnerActual = (i) => {
        const row = ctx.overlay.querySelectorAll('[data-reparto-idx]')[i];
        if (!row) return 0;
        const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
        const paga   = row.querySelector('.reparto-paga').checked;
        const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
        const desc   = descuentosTotal();
        const montoOwner = Math.round(monto * pct / 100);
        const descOwner  = Math.round(desc * pct / 100);
        const honOwner   = paga ? Math.round(montoOwner * pctCom / 100) : 0;
        return montoOwner - honOwner - descOwner;
      };

      let recalcular;

      if (multi) {
        recalcular = () => {
          const desc = descuentosTotal();
          let totalHon = 0, totalPagarSum = 0;
          ctx.overlay.querySelectorAll('[data-reparto-idx]').forEach((row, i) => {
            const pct    = Number(row.querySelector('.reparto-pct').value) || 0;
            const paga   = row.querySelector('.reparto-paga').checked;
            const pctCom = Number(row.querySelector('.reparto-comision').value) || 0;
            const montoOwner = Math.round(monto * pct / 100);
            const descOwner  = Math.round(desc * pct / 100);
            const honOwner   = paga ? Math.round(montoOwner * pctCom / 100) : 0;
            const totalOwner = montoOwner - honOwner - descOwner;
            row.querySelector('.reparto-monto').textContent = fmt$(totalOwner);
            totalHon += honOwner;
            totalPagarSum += totalOwner;
            pagosCtls[i]?.refrescarTotal();
          });
          const sumaPct = [...ctx.overlay.querySelectorAll('.reparto-pct')].reduce((s, i) => s + (Number(i.value) || 0), 0);
          const resumen = q('#repartoResumen');
          if (resumen) {
            resumen.textContent = `% asignado: ${sumaPct}% de 100% · Comisión total: ${fmt$(totalHon)} · Total a repartir: ${fmt$(totalPagarSum)}`;
            resumen.style.color = Math.round(sumaPct) === 100 ? 'var(--success)' : 'var(--warning)';
          }
        };
        ctx.overlay.querySelectorAll('.reparto-pct, .reparto-paga, .reparto-comision').forEach(inp => {
          inp.addEventListener('input', recalcular);
          inp.addEventListener('change', recalcular);
        });

        const blk = q('#pagosPorDueno');
        blk.innerHTML = dueños.map((o, i) => `
          <div data-pago-dueno="${i}">
            <div style="font-weight:600;font-size:.85rem;margin-bottom:.4rem">${esc(propietarios.find(p => p.id === o.propietarioId)?.nombre || '—')}</div>
            ${pagosBlockHTML()}
          </div>`).join('');
        dueños.forEach((o, i) => {
          const cont = blk.querySelector(`[data-pago-dueno="${i}"]`);
          pagosCtls[i] = montarPagos(cont, { getTotal: () => montoOwnerActual(i) });
        });
      } else {
        recalcular = () => {
          const pct  = Number(q('#liqPct').value) || 0;
          const hon  = Math.round(monto * pct / 100);
          const desc = descuentosTotal();
          q('#liqMontoHon').value = fmtMontoInput(hon);
          q('#liqTotal').value    = fmtMontoInput(Math.max(0, monto - hon - desc));
          pagosCtl?.refrescarTotal();
        };
        q('#liqPct').addEventListener('input', recalcular);
      }
      recalcular();

      const addDescRow = () => {
        const blk = q('#descBlk');
        const idx = descIdx++;
        const div = document.createElement('div');
        div.className = 'desc-row form-grid';
        div.style.cssText = 'align-items:end;gap:.5rem;margin-bottom:.5rem';
        div.innerHTML = `
          <div class="form-group" style="flex:2;margin:0">
            <label style="font-size:.75rem">Concepto</label>
            <input name="desc_concepto_${idx}" placeholder="Ej. Reparación caño">
          </div>
          <div class="form-group" style="flex:1;margin:0">
            <label style="font-size:.75rem">Monto $</label>
            <input name="desc_monto_${idx}" type="text" inputmode="numeric" class="input-monto">
          </div>
          <button type="button" class="btn btn-xs btn-ghost" style="color:var(--danger);margin-bottom:.1rem" data-rm>${icon('trash')}</button>`;
        blk.appendChild(div);
        div.querySelector('[data-rm]').addEventListener('click', () => { div.remove(); recalcular(); });
        div.querySelector(`[name="desc_monto_${idx}"]`).addEventListener('input', recalcular);
      };

      q('#btnAddDesc').addEventListener('click', addDescRow);

      if (!multi) {
        pagosCtl = montarPagos(ctx.overlay, { getTotal: () => valorMonto(q('#liqTotal').value) });
        q('#liqTotal').addEventListener('input', () => pagosCtl?.refrescarTotal());
      }

      const guardar = async (conPDF) => {
        const f = q('#liqForm');
        if (!f.fechaPago.value) { toast('Indicá la fecha de pago', { tipo: 'warning' }); return; }

        const descuentos = [...ctx.overlay.querySelectorAll('.desc-row')].map((row) => ({
          concepto: row.querySelector('[name^="desc_concepto"]')?.value || '',
          monto:    valorMonto(row.querySelector('[name^="desc_monto"]')?.value),
        })).filter(d => d.concepto && d.monto);

        if (!multi) {
          const totalPagar = valorMonto(f.totalPagar.value);
          const pagos = pagosCtl.getPagos();
          if (!pagos.length) { toast('Indicá la forma de pago', { tipo: 'warning' }); return; }
          if (pagos.length > 1) {
            const suma = pagos.reduce((s, p) => s + p.monto, 0);
            if (Math.round(suma * 100) !== Math.round(totalPagar * 100)) {
              toast('La suma de las formas de pago no coincide con el total a pagar', { tipo: 'warning' });
              return;
            }
          }

          const data = {
            alquilerId:     alq.id,
            propiedadId:    alq.propiedadId,
            propietarioId:  dueños[0]?.propietarioId || alq.propietarioId,
            cobroId:        cobro.id,
            liquidadosCobros: cobro.id ? [cobro.id] : [],
            mes:            cobro.mes,
            montoAlquiler:  monto,
            pctHonorarios:  Number(f.pctHonorarios.value) || 0,
            montoHonorarios:valorMonto(q('#liqMontoHon').value),
            totalPagar,
            descuentos,
            estado:    'pagada',
            cobradoInquilino: cobro.pagado !== false,
            fechaPago: f.fechaPago.value,
            formaPago: pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago,
            pagos,
            notas:     f.notas.value || null,
          };

          // Guardar % en el contrato para la próxima
          if (alq.id && data.pctHonorarios !== (alq.pctHonorarios ?? alq.comision)) {
            await actions.updateAlquiler(alq.id, { pctHonorarios: data.pctHonorarios });
          }

          const liq = await actions.createLiquidacion(data);

          if (conPDF && liq) {
            imprimirLiquidacion({
              alq, cobro: { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago },
              inquilino: inq, propiedad: prop, propietario: own,
              pctHonorarios: liq.pctHonorarios || 0, descuentos: liq.descuentos || [],
              formaPago: liq.formaPago || 'Efectivo', pagos: liq.pagos || [],
            });
          }

          toast('Liquidación registrada');
          ctx.close(); onDone?.();
          return;
        }

        // Multi-propietario: UNA sola liquidación con el reparto de todos los dueños adentro
        const filas = [...ctx.overlay.querySelectorAll('[data-reparto-idx]')].map((row, i) => ({
          propietarioId: dueños[i].propietarioId,
          porcentaje:    Number(row.querySelector('.reparto-pct').value) || 0,
          pagaComision:  row.querySelector('.reparto-paga').checked,
          comisionPct:   Number(row.querySelector('.reparto-comision').value) || 0,
        }));
        const sumaPct = filas.reduce((s, fl) => s + fl.porcentaje, 0);
        if (Math.round(sumaPct) !== 100) {
          toast('El % repartido entre los propietarios debe sumar 100%', { tipo: 'warning' });
          return;
        }

        const descTotal = descuentos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
        const propietariosData = [];
        for (let i = 0; i < filas.length; i++) {
          const fila = filas[i];
          const nombreOwner = propietarios.find(p => p.id === fila.propietarioId)?.nombre || '';
          const pagos = pagosCtls[i]?.getPagos() || [];
          if (!pagos.length) { toast(`Indicá la forma de pago de ${esc(nombreOwner)}`, { tipo: 'warning' }); return; }
          const montoOwner = Math.round(monto * fila.porcentaje / 100);
          const descOwner  = Math.round(descTotal * fila.porcentaje / 100);
          const honOwner   = fila.pagaComision ? Math.round(montoOwner * fila.comisionPct / 100) : 0;
          const totalOwner = montoOwner - honOwner - descOwner;
          const sumaPagos  = pagos.reduce((s, p) => s + p.monto, 0);
          if (Math.round(sumaPagos * 100) !== Math.round(totalOwner * 100)) {
            toast(`La forma de pago de ${esc(nombreOwner)} no coincide con su total`, { tipo: 'warning' });
            return;
          }
          propietariosData.push({
            propietarioId: fila.propietarioId,
            porcentaje: fila.porcentaje,
            pagaComision: fila.pagaComision,
            comisionPct: fila.pagaComision ? fila.comisionPct : 0,
            montoBruto: montoOwner,
            montoHonorarios: honOwner,
            descuentoMonto: descOwner,
            totalPagar: totalOwner,
            formaPago: pagos.length > 1 ? pagos.map(p => p.metodoPago).join(' + ') : pagos[0].metodoPago,
            pagos,
          });
        }

        const data = {
          alquilerId: alq.id,
          propiedadId: alq.propiedadId,
          propietarioId: null,
          propietarios: propietariosData,
          cobroId: cobro.id,
          liquidadosCobros: cobro.id ? [cobro.id] : [],
          mes: cobro.mes,
          montoAlquiler: monto,
          montoHonorarios: propietariosData.reduce((s, p) => s + p.montoHonorarios, 0),
          totalPagar: propietariosData.reduce((s, p) => s + p.totalPagar, 0),
          descuentos,
          estado: 'pagada',
          cobradoInquilino: cobro.pagado !== false,
          fechaPago: f.fechaPago.value,
          notas: f.notas.value || null,
        };
        const liq = await actions.createLiquidacion(data);

        // Persistir el reparto confirmado en la propiedad para la próxima vez
        await actions.updatePropiedad(prop.id, {
          propietarios: filas.map(fl => ({ propietarioId: fl.propietarioId, porcentaje: fl.porcentaje, pagaComision: fl.pagaComision, comisionPct: fl.comisionPct })),
        });

        if (conPDF && liq) {
          imprimirLiquidacion({
            alq, cobro: { monto: liq.montoAlquiler, mes: liq.mes, fechaPago: liq.fechaPago },
            inquilino: inq, propiedad: prop, propietario: null,
            propietarios: propietariosData.map(po => ({
              nombre: propietarios.find(p => p.id === po.propietarioId)?.nombre || '—',
              porcentaje: po.porcentaje, montoBruto: po.montoBruto,
              pctHonorarios: po.pagaComision ? po.comisionPct : 0,
              montoHonorarios: po.montoHonorarios, totalPagar: po.totalPagar,
              formaPago: po.formaPago, pagos: po.pagos,
            })),
            descuentos: liq.descuentos || [],
          });
        }

        toast('Liquidación registrada');
        ctx.close(); onDone?.();
      };

      q('#btnSoloGuardar').addEventListener('click', () => guardar(false));
      q('#btnGuardarPDF').addEventListener('click', () => guardar(true));
    },
  });
}
