/* ============================================================
   VISTA · Liquidaciones — pagos a propietarios
   ============================================================ */
import { getState, actions, subscribe } from '../store.js';
import { icon } from '../config.js';
import { esc } from '../lib.js';
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

/* Detecta cobros pagados que aún no tienen liquidación registrada - AGRUPADOS POR PROPIETARIO (todas sus propiedades y meses pendientes juntos) */
function cobrosALiquidar(state) {
  const { alquileres, liquidaciones, clientes, propietarios, propiedades } = state;

  // Recolectar cobros ya liquidados por cobroId
  const cobrosLiquidados = new Set();
  (liquidaciones || []).forEach(l => {
    // Si la liquidación tiene liquidadosCobros (array de IDs), marcalos como liquidados
    if (l.liquidadosCobros) {
      l.liquidadosCobros.forEach(id => cobrosLiquidados.add(id));
    }
  });

  // Agrupar únicamente por propietarioId: un propietario con varias propiedades
  // (o cobros de distintos meses) se liquida todo junto en una sola fila
  const grupos = {};

  alquileres.forEach(a => {
    (a.cobros || []).forEach(c => {
      if (!c.pagado || !c.monto) return;
      if (cobrosLiquidados.has(c.id)) return; // ya liquidado

      const key = a.propietarioId;
      if (!grupos[key]) {
        grupos[key] = {
          propietarioId: a.propietarioId,
          cobros: [],
          own: propietarios.find(x => x.id === a.propietarioId),
        };
      }

      const inq  = clientes.find(x => x.id === a.inquilinoId);
      const prop = propiedades.find(x => x.id === a.propiedadId);

      grupos[key].cobros.push({ alq: a, cobro: c, inq, prop });
    });
  });

  // Convertir a array, calcular meses involucrados y ordenar
  const pendientes = Object.values(grupos).map(g => {
    const meses = [...new Set(g.cobros.map(c => c.cobro.mes))].sort();
    return { ...g, meses };
  });
  pendientes.sort((a, b) => (a.meses[0] || '').localeCompare(b.meses[0] || ''));
  return pendientes;
}

export default function liquidaciones(root) {
  root.innerHTML = `<div class="view" id="vLiq"></div>`;
  let filtro = 'pendientes'; // pendientes | historial
  let pendientes = []; // Mantener referencia a pendientes

  const render = () => {
    const state = getState();
    pendientes = cobrosALiquidar(state);
    pintar(root.querySelector('#vLiq'), filtro, pendientes);
  };
  
  render();
  const unsub = subscribe(render);

  root.querySelector('#vLiq').addEventListener('click', async e => {
    const pill = e.target.closest('[data-filtro]');
    if (pill) { filtro = pill.dataset.filtro; render(); return; }

    // Liquidar un grupo (todas las propiedades pendientes de un propietario)
    const btnLiq = e.target.closest('[data-liq-grupo]');
    if (btnLiq) {
      const propietarioId = btnLiq.dataset.liqProp;
      const grupo = pendientes.find(g => g.propietarioId === propietarioId);
      if (grupo) {
        abrirFormLiquidacionGrupal(grupo, render);
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

function pintar(el, filtro, pendientes) {
  const state = getState();
  const { liquidaciones: list, alquileres } = state;
  const historial  = (list || []).map(l => {
    const alq  = alquileres.find(a => a.id === l.alquilerId) || {};
    const prop = state.propiedades.find(p => p.id === (l.propiedadId || alq.propiedadId)) || {};
    const own  = state.propietarios.find(p => p.id === (l.propietarioId || alq.propietarioId)) || {};
    const inq  = state.clientes.find(c => c.id === alq.inquilinoId) || {};
    return { ...l, _alq: alq, _prop: prop, _own: own, _inq: inq };
  }).sort((a, b) => (b.fechaPago || '').localeCompare(a.fechaPago || ''));

  const totalPend = pendientes.reduce((s, grupo) => {
    return s + (grupo.cobros || []).reduce((s2, c) => s2 + (c.cobro?.monto || 0), 0);
  }, 0);

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Liquidaciones</h1>
        <p class="view-sub">Pagos a propietarios · ${pendientes.length} por liquidar · ${fmt$(totalPend)} pendiente</p>
      </div>
    </div>

    <!-- Pills -->
    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem">
      ${[
        { id:'pendientes', label:'Por liquidar', count: pendientes.length, danger: pendientes.length > 0 },
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

    ${filtro === 'pendientes' ? renderPendientes(pendientes) : renderHistorial(historial)}
  `;
}

function renderPendientes(pendientes) {
  if (!pendientes.length) return `
    <div class="card" style="padding:2rem 1.5rem;text-align:center;color:var(--text-soft)">
      <div style="font-size:2rem;margin-bottom:.5rem">✅</div>
      <div style="font-weight:600;margin-bottom:.25rem">Todo liquidado</div>
      <div style="font-size:.82rem;color:var(--text-faint)">No hay cobros de inquilinos pendientes de liquidar al propietario</div>
    </div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:.6rem">
      ${pendientes.map(grupo => {
        const totalCobros = grupo.cobros.reduce((s, c) => s + (c.cobro.monto || 0), 0);
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
          porProp[k].total += c.cobro.monto || 0;
        });
        const detalle = Object.values(porProp);

        return `
        <div class="card" style="padding:1rem 1.25rem;border-left:3px solid var(--warning)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
                <span style="font-weight:700;font-size:1.05rem">${esc(grupo.own?.nombre || '—')}</span>
                <span class="badge badge-warning" style="font-size:.72rem">${mesesLabelStr}</span>
                <span class="badge badge-neutral" style="font-size:.72rem">${nProps} ${nProps === 1 ? 'propiedad' : 'propiedades'}</span>
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
              <div style="font-size:1.3rem;font-weight:900;color:var(--warning)">${fmt$(totalCobros)}</div>
              <button class="btn btn-primary btn-sm" data-liq-grupo data-liq-prop="${grupo.propietarioId}">
                Liquidar →
              </button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderHistorial(historial) {
  if (!historial.length) return `
    <div class="card" style="padding:2rem 1.5rem;text-align:center;color:var(--text-soft)">
      <div style="font-size:2rem;margin-bottom:.5rem">📄</div>
      <div style="font-weight:600">Sin historial aún</div>
    </div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:.6rem">
      ${historial.map(l => {
        const hon     = l.montoHonorarios || Math.round((l.montoAlquiler || 0) * (l.pctHonorarios || 0) / 100);
        const descTot = (l.descuentos || []).reduce((s, d) => s + (Number(d.monto) || 0), 0);
        const esGrupal = l.liquidadosCobros && l.liquidadosCobros.length > 1;
        return `
        <div class="card" data-liq-id="${l.id}" style="padding:1rem 1.25rem">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
                <span style="font-weight:700">${esc(l._own?.nombre || '—')}</span>
                <span class="badge badge-success">Liquidado</span>
                ${esGrupal ? `<span class="badge badge-info" style="font-size:.72rem">📋 Grupal</span>` : ''}
                ${l.meses && l.meses.length > 1
                  ? `<span class="badge badge-neutral">${mesLabel(l.meses[0])} – ${mesLabel(l.meses[l.meses.length - 1])}</span>`
                  : (l.mes ? `<span class="badge badge-neutral">${mesLabel(l.mes)}</span>` : '')}
              </div>
              <div style="font-size:.82rem;color:var(--text-soft);margin-bottom:.4rem">
                ${esGrupal ? 
                  `<strong>${l.liquidadosCobros?.length || 1} propiedad${l.liquidadosCobros?.length > 1 ? 'es' : ''}` : 
                  `${esc(l._prop?.direccion || '—')}${l._prop?.ciudad ? ' · ' + esc(l._prop.ciudad) : ''}`
                }
              </div>
              <div style="display:flex;gap:1.25rem;flex-wrap:wrap;font-size:.8rem">
                <span><span style="color:var(--text-soft)">Alquiler: </span><strong>${fmt$(l.montoAlquiler)}</strong></span>
                <span><span style="color:var(--text-soft)">Comisión (${l.pctHonorarios || 0}%): </span><strong style="color:var(--danger)">−${fmt$(hon)}</strong></span>
                ${descTot ? `<span><span style="color:var(--text-soft)">Desc.: </span><strong style="color:var(--danger)">−${fmt$(descTot)}</strong></span>` : ''}
                <span><span style="color:var(--text-soft)">Pagado: </span><strong style="color:var(--success)">${fmt$(l.totalPagar)}</strong></span>
              </div>
              <div style="font-size:.78rem;color:var(--text-faint);margin-top:.35rem">
                ${fmtFecha(l.fechaPago)} · ${esc(l.formaPago || 'Efectivo')}
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
  const own  = propietarios.find(p => p.id === (l.propietarioId || alq.propietarioId)) || {};
  const cobroSint = { monto: l.montoAlquiler, mes: l.mes, fechaPago: l.fechaPago };
  imprimirLiquidacion({ alq, cobro: cobroSint, inquilino: inq, propiedad: prop, propietario: own,
    pctHonorarios: l.pctHonorarios || 0, descuentos: l.descuentos || [], formaPago: l.formaPago || 'Efectivo' });
}

/* ── Formulario liquidar GRUPAL (múltiples propiedades de un propietario) ── */
export function abrirFormLiquidacionGrupal(grupo, onDone) {
  const { alquileres, clientes, propietarios, propiedades } = getState();
  const own = grupo.own || {};
  
  // Calcular totales
  const totalMonto = grupo.cobros.reduce((s, c) => s + (c.cobro.monto || 0), 0);
  const pctDef = 10; // porcentaje de comisión
  
  const hoy = new Date().toISOString().slice(0, 10);
  const METODOS = ['Efectivo','Transferencia','Cheque','Otro'];
  const mesesLabelStr = grupo.meses.length === 1
    ? mesLabel(grupo.meses[0])
    : `${mesLabel(grupo.meses[0])} – ${mesLabel(grupo.meses[grupo.meses.length - 1])}`;

  let descIdx = 0;

  openModal({
    title: `Liquidación grupal — ${esc(own.nombre || '—')} — ${mesesLabelStr}`,
    size: 'xl',
    bodyHTML: `
      <form id="liqGrupalForm">
        <!-- Resumen de propiedades y cobros -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1.25rem;border:1px solid var(--border)">
          <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Propiedades y cobros del período</div>
          <div style="display:flex;flex-direction:column;gap:.6rem">
            ${grupo.cobros.map((item, idx) => `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:.6rem;background:var(--surface);border-radius:var(--r-sm);border-left:3px solid var(--primary)">
              <div style="flex:1">
                <div style="font-weight:600;margin-bottom:.2rem">${esc(item.prop?.direccion || '—')}</div>
                <div style="font-size:.78rem;color:var(--text-soft)">${esc(item.inq?.nombre || '—')} · ${esc(item.prop?.barrio || '')}</div>
                <div style="font-size:.75rem;color:var(--text-faint);margin-top:.2rem">${mesLabel(item.cobro.mes)} · Cobrado: ${fmtFecha(item.cobro.fechaPago)}</div>
              </div>
              <div style="font-weight:700;font-size:1.1rem;text-align:right;color:var(--primary)">${fmt$(item.cobro.monto)}</div>
            </div>`).join('')}
          </div>
          <div style="border-top:2px solid var(--border);margin-top:.75rem;padding-top:.75rem;display:flex;justify-content:space-between;align-items:center;font-size:1.1rem;font-weight:800">
            <span>TOTAL COBRADO</span>
            <span style="color:var(--primary);font-size:1.3rem">${fmt$(totalMonto)}</span>
          </div>
        </div>

        <h3 class="form-section-title">Comisión de la inmobiliaria</h3>
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>% Comisión</label>
            <input name="pctHonorarios" id="liqPct" type="number" min="0" max="100" step="0.5" value="${pctDef}">
          </div>
          <div class="form-group">
            <label>Monto comisión $</label>
            <input id="liqMontoHon" type="number" readonly style="background:var(--surface-2);font-weight:700">
          </div>
          <div class="form-group">
            <label style="color:var(--success);font-weight:700">Total a pagar al propietario $</label>
            <input name="totalPagar" id="liqTotal" type="number" style="font-size:1.1rem;font-weight:800;color:var(--success)">
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
          <div class="form-group">
            <label>Forma de pago</label>
            <select name="formaPago">
              ${METODOS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar y generar PDF</button>`,
    onMount(ctx) {
      const q = (sel) => ctx.overlay.querySelector(sel);

      const recalcular = () => {
        const pct  = Number(q('#liqPct').value) || 0;
        const hon  = Math.round(totalMonto * pct / 100);
        const desc = Array.from(q('#descBlk').querySelectorAll('[data-desc-monto]'))
          .reduce((s, el) => s + (Number(el.value) || 0), 0);
        const total = totalMonto - hon - desc;
        q('#liqMontoHon').value = hon;
        q('#liqTotal').value = total;
      };

      const renderDescs = () => {
        const block = q('#descBlk');
        block.innerHTML = (q('#liqForm') || q('#liqGrupalForm')).descuentos?.map((d, i) => `
          <div style="display:flex;gap:.5rem;align-items:flex-end;margin-bottom:.5rem">
            <input type="text" placeholder="Concepto" value="${esc(d.concepto || '')}" data-desc-concepto="${i}" style="flex:1">
            <input type="number" placeholder="Monto" value="${d.monto || 0}" data-desc-monto="${i}" min="0" style="width:100px" data-input>
            <button type="button" data-del-desc="${i}" class="btn btn-xs btn-ghost" style="color:var(--danger)">${icon('trash')}</button>
          </div>`).join('') || '';
        block.querySelectorAll('[data-input]').forEach(el => {
          el.addEventListener('input', recalcular);
        });
      };

      q('#liqPct').addEventListener('input', recalcular);
      
      q('#btnAddDesc').addEventListener('click', () => {
        if (!q('#liqForm') && !q('#liqGrupalForm')) return;
        const form = q('#liqForm') || q('#liqGrupalForm');
        form.descuentos = form.descuentos || [];
        form.descuentos.push({ concepto: '', monto: 0 });
        renderDescs();
        recalcular();
      });

      q('#descBlk').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del-desc]');
        if (btn) {
          const idx = Number(btn.dataset.delDesc);
          const form = q('#liqForm') || q('#liqGrupalForm');
          if (form.descuentos) form.descuentos.splice(idx, 1);
          renderDescs();
          recalcular();
        }
      });

      q('#btnSoloGuardar').addEventListener('click', async () => {
        const form = q('#liqGrupalForm');
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        data.propietarioId = grupo.propietarioId;
        data.meses = grupo.meses;
        data.mes = grupo.meses.length === 1 ? grupo.meses[0] : null;
        data.montoAlquiler = totalMonto;
        data.pctHonorarios = Number(data.pctHonorarios) || 0;
        data.totalPagar = Number(q('#liqTotal').value) || 0;
        data.descuentos = form.descuentos || [];
        
        // Guardar los IDs de cobros liquidados
        data.liquidadosCobros = grupo.cobros.map(item => item.cobro.id);
        
        await actions.createLiquidacion(data);
        toast('Liquidación registrada');
        ctx.close();
        onDone?.();
      });

      q('#btnGuardarPDF').addEventListener('click', async () => {
        q('#btnSoloGuardar').click();
        // Luego genera PDF (implementar si es necesario)
      });

      recalcular();
      renderDescs();
    }
  });
}

/* ── Formulario liquidar (crear ya pagada) ── */
export function abrirFormLiquidacion(pre, onDone) {
  const { alquileres, clientes, propietarios, propiedades } = getState();
  const alq   = pre?.alq  || {};
  const cobro = pre?.cobro || {};
  const own   = propietarios.find(p => p.id === alq.propietarioId) || {};
  const prop  = propiedades.find(p => p.id === alq.propiedadId)    || {};
  const inq   = clientes.find(c => c.id === alq.inquilinoId)       || {};
  const monto = cobro.monto || alq.montoActual || alq.montoInicial || 0;
  const pctDef = alq.pctHonorarios ?? alq.comision ?? 10;
  const hoy   = new Date().toISOString().slice(0, 10);
  const METODOS = ['Efectivo','Transferencia','Cheque','Otro'];

  let descIdx = 0;

  openModal({
    title: 'Liquidar al propietario',
    size: 'lg',
    bodyHTML: `
      <form id="liqForm">
        <!-- Info del cobro -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.85rem 1rem;margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
          <div>
            <div style="font-size:.72rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem">Cobro a liquidar</div>
            <div style="font-weight:700">${esc(own?.nombre || '—')}</div>
            <div style="font-size:.82rem;color:var(--text-soft)">${esc(prop?.direccion || '—')} · ${mesLabel(cobro.mes)}</div>
            <div style="font-size:.78rem;color:var(--text-faint)">Inquilino: ${esc(inq?.nombre || '—')} · Cobrado el ${fmtFecha(cobro.fechaPago)}</div>
          </div>
          <div style="font-size:1.4rem;font-weight:900">${fmt$(monto)}</div>
        </div>

        <h3 class="form-section-title">Honorarios de la inmobiliaria</h3>
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>% Honorarios</label>
            <input name="pctHonorarios" id="liqPct" type="number" min="0" max="100" step="0.5" value="${pctDef}">
          </div>
          <div class="form-group">
            <label>Monto honorarios $</label>
            <input id="liqMontoHon" type="number" readonly style="background:var(--surface-2);font-weight:700">
          </div>
          <div class="form-group">
            <label style="color:var(--success);font-weight:700">Total a pagar al propietario $</label>
            <input name="totalPagar" id="liqTotal" type="number" style="font-size:1.1rem;font-weight:800;color:var(--success)">
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
          <div class="form-group">
            <label>Forma de pago</label>
            <select name="formaPago">
              ${METODOS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group full">
            <label>Notas</label>
            <input name="notas" placeholder="Observaciones opcionales">
          </div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button>
                 <button class="btn btn-ghost" id="btnSoloGuardar">Guardar sin PDF</button>
                 <button class="btn btn-primary" id="btnGuardarPDF">Guardar y generar PDF</button>`,
    onMount(ctx) {
      const q = (sel) => ctx.overlay.querySelector(sel);

      const recalcular = () => {
        const pct  = Number(q('#liqPct').value) || 0;
        const hon  = Math.round(monto * pct / 100);
        const desc = [...ctx.overlay.querySelectorAll('[name^="desc_monto"]')]
          .reduce((s, i) => s + (Number(i.value) || 0), 0);
        q('#liqMontoHon').value = hon;
        q('#liqTotal').value    = Math.max(0, monto - hon - desc);
      };
      recalcular();

      q('#liqPct').addEventListener('input', recalcular);

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
            <input name="desc_monto_${idx}" type="number" min="0">
          </div>
          <button type="button" class="btn btn-xs btn-ghost" style="color:var(--danger);margin-bottom:.1rem" data-rm>${icon('trash')}</button>`;
        blk.appendChild(div);
        div.querySelector('[data-rm]').addEventListener('click', () => { div.remove(); recalcular(); });
        div.querySelector(`[name="desc_monto_${idx}"]`).addEventListener('input', recalcular);
      };

      q('#btnAddDesc').addEventListener('click', addDescRow);

      const guardar = async (conPDF) => {
        const f = q('#liqForm');
        if (!f.fechaPago.value) { toast('Indicá la fecha de pago', { tipo: 'warning' }); return; }

        const descuentos = [...ctx.overlay.querySelectorAll('.desc-row')].map((row, i) => ({
          concepto: row.querySelector('[name^="desc_concepto"]')?.value || '',
          monto:    Number(row.querySelector('[name^="desc_monto"]')?.value) || 0,
        })).filter(d => d.concepto && d.monto);

        const data = {
          alquilerId:     alq.id,
          propiedadId:    alq.propiedadId,
          propietarioId:  alq.propietarioId,
          cobroId:        cobro.id,
          mes:            cobro.mes,
          montoAlquiler:  monto,
          pctHonorarios:  Number(f.pctHonorarios.value) || 0,
          montoHonorarios:Number(q('#liqMontoHon').value) || 0,
          totalPagar:     Number(f.totalPagar.value) || 0,
          descuentos,
          estado:    'pagada',
          fechaPago: f.fechaPago.value,
          formaPago: f.formaPago.value,
          notas:     f.notas.value || null,
        };

        // Guardar % en el contrato para la próxima
        if (alq.id && data.pctHonorarios !== (alq.pctHonorarios ?? alq.comision)) {
          await actions.updateAlquiler(alq.id, { pctHonorarios: data.pctHonorarios });
        }

        const liq = await actions.createLiquidacion(data);
        toast('Liquidación registrada');
        ctx.close();
        onDone?.();

        if (conPDF) {
          setTimeout(() => {
            const { liquidaciones: list, alquileres: alqs, clientes, propietarios, propiedades } = getState();
            // Buscar la recién creada
            const l    = (list || []).find(x => x.cobroId === cobro.id);
            if (!l) return;
            const a2   = alqs.find(x => x.id === l.alquilerId) || {};
            const cobroSint = { monto: l.montoAlquiler, mes: l.mes, fechaPago: l.fechaPago };
            imprimirLiquidacion({
              alq: a2,
              cobro: cobroSint,
              inquilino: clientes.find(c => c.id === a2.inquilinoId) || {},
              propiedad: propiedades.find(p => p.id === l.propiedadId) || {},
              propietario: propietarios.find(p => p.id === l.propietarioId) || {},
              pctHonorarios: l.pctHonorarios || 0,
              descuentos: l.descuentos || [],
              formaPago: l.formaPago || 'Efectivo',
            });
          }, 300);
        }
      };

      q('#btnSoloGuardar').addEventListener('click', () => guardar(false));
      q('#btnGuardarPDF').addEventListener('click', () => guardar(true));
    },
  });
}
