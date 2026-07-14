/* ============================================================
   VISTA · Ventas — operaciones de compraventa
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon, VENTA_ESTADOS } from '../config.js';
import { esc, fmtMoneda, fmtFechaCorta } from '../lib.js';
import { navegar } from '../router.js';
import { openVentaForm } from './forms.js';

export default function ventas(root, param) {
  if (param) return ventaDetalle(root, param);
  root.innerHTML = `<div class="view" id="vVentas"></div>`;
  let tab = 'activas';

  const render = () => pintarLista(root.querySelector('#vVentas'), tab);
  render();
  const unsub = subscribe(render);

  root.querySelector('#vVentas').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(); }
  });

  return unsub;
}

function pintarLista(el, tab) {
  const { ventas, clientes, propiedades } = getState();
  const activas = ventas.filter(v => !['escriturada','caida'].includes(v.estado));
  const escrituradas = ventas.filter(v => v.estado === 'escriturada');
  const lista = tab === 'activas' ? activas : tab === 'escrituradas' ? escrituradas : ventas;

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Ventas</h1>
        <p class="view-sub">${activas.length} en curso · ${escrituradas.length} escriturada${escrituradas.length!==1?'s':''}</p>
      </div>
      <button class="btn btn-primary" id="btnNuevaVenta">${icon('plus')} Nueva venta</button>
    </div>

    <div class="tabs" style="margin-bottom:1.5rem">
      <button class="tab ${tab==='activas'?'active':''}" data-tab="activas">En curso (${activas.length})</button>
      <button class="tab ${tab==='escrituradas'?'active':''}" data-tab="escrituradas">Escrituradas (${escrituradas.length})</button>
      <button class="tab ${tab==='todas'?'active':''}" data-tab="todas">Todas (${ventas.length})</button>
    </div>

    ${lista.length ? `
    <div class="card" style="padding:0">
      ${lista.map(v => {
        const comp = clientes.find(c => c.id === v.compradorId);
        const prop = propiedades.find(p => p.id === v.propiedadId);
        const estadoObj = VENTA_ESTADOS.find(e => e.id === v.estado);

        return `
          <div class="list-row list-row-hover" data-id="${v.id}" style="cursor:pointer;align-items:flex-start;padding:1rem 1.25rem">
            <div style="flex:1;min-width:0">
              <div class="flex items-center gap-2" style="margin-bottom:.25rem">
                <span class="list-name">${esc(comp?.nombre || 'Comprador sin asignar')}</span>
                <span class="badge ${estadoObj?.badge || 'badge-neutral'}">${estadoObj?.label || v.estado}</span>
              </div>
              <div class="text-xs text-soft">${esc(prop?.direccion || '—')}</div>
              <div class="text-xs text-soft" style="margin-top:.25rem">
                ${fmtMoneda(v.precio, v.moneda)}
                ${v.comision ? ` · Comisión: ${v.comision}%` : ''}
                ${v.fechaEscritura ? ` · Escritura: ${fmtFechaCorta(v.fechaEscritura)}` : ''}
              </div>
            </div>
            <button class="btn btn-xs btn-ghost btn-edit-vta" data-id="${v.id}" title="Editar" onclick="event.stopPropagation()">${icon('edit')}</button>
          </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('dollar')}
      <h3>No hay ventas${tab !== 'todas' ? ' en este estado' : ''}</h3>
      <p>Registrá una nueva operación de venta.</p>
      <button class="btn btn-primary" id="btnNuevaVenta2">${icon('plus')} Nueva venta</button>
    </div>`}`;

  el.querySelector('#btnNuevaVenta')?.addEventListener('click', () => openVentaForm(null, () => {}));
  el.querySelector('#btnNuevaVenta2')?.addEventListener('click', () => openVentaForm(null, () => {}));

  el.querySelectorAll('.list-row-hover[data-id]').forEach(row => {
    row.addEventListener('click', () => navegar(`ventas/${row.dataset.id}`));
  });
  el.querySelectorAll('.btn-edit-vta[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = getState().ventas.find(x => x.id === btn.dataset.id);
      if (v) openVentaForm(v, () => {});
    });
  });
}

/* ---- Detalle de venta ---- */
async function ventaDetalle(root, id) {
  root.innerHTML = `<div class="view" id="vVtaDet"></div>`;
  const render = () => pintarDetalle(root.querySelector('#vVtaDet'), id);
  render();
  return subscribe(render);
}

function pintarDetalle(el, id) {
  const { ventas, clientes, propiedades } = getState();
  const v = ventas.find(x => x.id === id);
  if (!v) { el.innerHTML = `<div class="view"><div class="empty"><h3>Venta no encontrada</h3></div></div>`; return; }

  const comp = clientes.find(c => c.id === v.compradorId);
  const vend = clientes.find(c => c.id === v.vendedorId);
  const prop = propiedades.find(p => p.id === v.propiedadId);
  const estadoObj = VENTA_ESTADOS.find(e => e.id === v.estado);

  el.innerHTML = `
    <div class="view-head">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" onclick="history.back()">${icon('x')}</button>
        <div>
          <h1 class="view-title">${esc(comp?.nombre || 'Venta')}</h1>
          <p class="view-sub">${esc(prop?.direccion || '—')}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" id="btnEditarVta">${icon('edit')} Editar</button>
      </div>
    </div>

    <div class="two-col-grid">
      <div class="card">
        <div class="card-head">
          <h3>Operación</h3>
          <span class="badge ${estadoObj?.badge || 'badge-neutral'}">${estadoObj?.label || v.estado}</span>
        </div>
        <div class="card-body">
          ${fila('Comprador', comp?.nombre)}
          ${vend ? fila('Vendedor', vend.nombre) : ''}
          ${fila('Propiedad', prop?.direccion)}
          ${fila('Precio', fmtMoneda(v.precio, v.moneda))}
          ${fila('Seña', fmtMoneda(v.sena, v.moneda))}
          ${fila('Comisión', v.comision ? `${v.comision}%` : null)}
          ${fila('Escribano', v.escribano)}
          ${fila('Fecha reserva', fmtFechaCorta(v.fechaReserva))}
          ${fila('Fecha escritura', fmtFechaCorta(v.fechaEscritura))}
          ${v.notas ? `<div style="margin-top:1rem;padding:1rem;background:var(--bg-soft);border-radius:var(--radius-sm);font-size:.875rem">${esc(v.notas)}</div>` : ''}
        </div>
      </div>

      <!-- Cambio de estado rápido -->
      <div class="card">
        <div class="card-head"><h3>Estado de la operación</h3></div>
        <div class="card-body">
          ${VENTA_ESTADOS.map(e => `
            <button class="btn btn-block estado-btn ${v.estado === e.id ? 'btn-primary' : 'btn-ghost'}" data-estado="${e.id}" style="margin-bottom:.5rem">
              ${v.estado === e.id ? icon('check') : ''} ${e.label}
            </button>`).join('')}
        </div>
      </div>
    </div>

    <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)">
      <button class="btn" id="btnEliminarVta" style="background:var(--danger);color:#fff">${icon('trash')} Eliminar venta</button>
    </div>`;

  el.querySelector('#btnEditarVta')?.addEventListener('click', () => openVentaForm(v, () => {}));
  el.querySelector('#btnEliminarVta')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta venta?')) return;
    await actions.deleteVenta(id);
    navegar('ventas');
  });
  el.querySelectorAll('.estado-btn[data-estado]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await actions.updateVenta(id, { estado: btn.dataset.estado });
    });
  });
}

function fila(label, val) {
  if (val === undefined || val === null || val === '' || val === '—') return '';
  return `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.875rem"><span class="text-soft" style="min-width:90px">${label}</span><span>${esc(String(val))}</span></div>`;
}
