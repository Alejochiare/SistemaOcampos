/* ============================================================
   VISTA · Caja — control diario de ingresos y egresos
   ============================================================ */
import { getState, actions, subscribe } from '../store.js';
import { icon } from '../config.js';
import { fmtFechaCorta, valorMonto } from '../lib.js';
import { openModal } from '../components/modal.js';

const METODOS = [
  { id: 'efectivo',      label: 'Efectivo',     emoji: '💵', color: 'var(--success)' },
  { id: 'transferencia', label: 'Transferencia', emoji: '🏦', color: 'var(--primary)' },
  { id: 'cheque',        label: 'Cheque',        emoji: '📄', color: 'var(--warning)' },
  { id: 'debito',        label: 'Débito',        emoji: '💳', color: 'var(--info)'    },
  { id: 'credito',       label: 'Crédito',       emoji: '💳', color: 'var(--info)'    },
  { id: 'otro',          label: 'Otro',          emoji: '📝', color: 'var(--text-soft)' },
];

function metodo(id) { return METODOS.find(m => m.id === id) || METODOS.at(-1); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sumarTipo(movs, tipo) { return movs.filter(m=>m.tipo===tipo).reduce((s,m)=>s+Number(m.monto||0),0); }
function sumarMetodo(movs, tipo, id) { return movs.filter(m=>m.tipo===tipo&&m.metodoPago===id).reduce((s,m)=>s+Number(m.monto||0),0); }
function moneda(n) { return '$' + Math.abs(n).toLocaleString('es-AR'); }
function formatearFechaHora(fecha, hora) {
  if (!fecha && !hora) return '—';
  const f = fecha ? fecha.slice(0, 10) : '';
  const [y, m, d] = f.split('-');
  const fechaTxt = f ? `${d}/${m}/${y}` : '';
  return `${fechaTxt}${fechaTxt && hora ? ' · ' : ''}${hora || ''}`.trim();
}
function etiquetaOrigen(origen) {
  switch (origen) {
    case 'cobro-alquiler': return 'Cobro de alquiler';
    case 'comision-inicial': return 'Comisión inicial';
    case 'cancelacion-contrato': return 'Cargo por cancelación';
    case 'liquidacion': return 'Pago a propietario';
    case 'venta': return 'Venta';
    case 'manual': return 'Registro manual';
    default: return 'Movimiento';
  }
}

export default async function caja(root) {
  root.innerHTML = `<div class="view" id="vCaja"></div>`;
  await actions.cajaHoy(); // garantiza que exista la caja de hoy
  const render = () => pintarCaja(root.querySelector('#vCaja'));
  render();
  return subscribe(render);
}

/* ── Vista principal ─────────────────────────────────────── */
function pintarCaja(el) {
  const { caja } = getState();
  const hoy = new Date().toISOString().slice(0,10);
  const diaAbierto = caja.find(d => d.fecha === hoy && !d.cerrado);
  const historial  = caja.filter(d => d.cerrado).sort((a,b) => b.fecha.localeCompare(a.fecha));

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">${icon('wallet')} Control de caja</h1>
        <p class="view-sub">${diaAbierto ? 'Caja abierta · ' + fmtFechaCorta(hoy) : 'Caja cerrada'}</p>
      </div>
    </div>

    ${diaAbierto ? renderDiaAbierto(diaAbierto) : ''}

    ${historial.length ? `
    <div class="card" style="margin-top:1.5rem">
      <div class="card-head">
        <h3>${icon('clock')} Historial de días</h3>
        <span class="badge badge-neutral">${historial.length} día${historial.length!==1?'s':''}</span>
      </div>
      <div style="padding:0">
        ${historial.map(d => renderFilaDia(d)).join('')}
      </div>
    </div>` : ''}`;

  /* eventos caja abierta */
  el.querySelector('#btnIngreso')?.addEventListener('click', () => openMovForm(diaAbierto.id, 'ingreso'));
  el.querySelector('#btnEgreso')?.addEventListener('click',  () => openMovForm(diaAbierto.id, 'egreso'));
  el.querySelector('#btnCerrar')?.addEventListener('click',  () => confirmarCierre(diaAbierto));

  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('¿Eliminar este movimiento?')) return;
      await actions.deleteMovimiento(btn.dataset.caja, btn.dataset.del);
    });
  });

  /* toggle detalle en historial */
  el.querySelectorAll('[data-toggler]').forEach(row => {
    row.addEventListener('click', () => {
      const body = el.querySelector(`[data-dia-det="${row.dataset.toggler}"]`);
      if (body) body.hidden = !body.hidden;
    });
  });
}

/* ── Día abierto ─────────────────────────────────────────── */
function renderDiaAbierto(dia) {
  const movs = [...dia.movimientos].reverse();
  const ing  = sumarTipo(dia.movimientos, 'ingreso');
  const egr  = sumarTipo(dia.movimientos, 'egreso');
  const sal  = ing - egr;

  // totales por método (solo los que tienen movimientos)
  const porMetodo = METODOS.map(m => {
    const n = sumarMetodo(dia.movimientos,'ingreso',m.id) - sumarMetodo(dia.movimientos,'egreso',m.id);
    return n !== 0 ? { ...m, n } : null;
  }).filter(Boolean);

  return `
  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.9rem;margin-bottom:1.25rem">
    ${kpi('Saldo del día', sal, sal>=0?'var(--success)':'var(--danger)')}
    ${kpi('Ingresos', ing, 'var(--success)')}
    ${kpi('Egresos', egr, 'var(--danger)')}
    ${porMetodo.map(m => kpi(`${m.emoji} ${m.label}`, m.n, m.n>=0?m.color:'var(--danger)')).join('')}
  </div>

  <!-- Acciones -->
  <div style="display:flex;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;align-items:center">
    <button class="btn btn-primary" id="btnIngreso" style="background:var(--success);border-color:var(--success)">
      ${icon('plus')} Registrar ingreso
    </button>
    <button class="btn btn-primary" id="btnEgreso" style="background:var(--danger);border-color:var(--danger)">
      ${icon('x')} Registrar egreso
    </button>
    <button class="btn btn-ghost" id="btnCerrar" style="margin-left:auto">
      ${icon('check')} Cerrar el día
    </button>
  </div>

  <!-- Movimientos -->
  <div class="card">
    <div class="card-head">
      <h3>Movimientos de hoy</h3>
      <span class="badge badge-neutral">${dia.movimientos.length}</span>
    </div>
    ${movs.length ? `
    <div style="padding:.6rem .75rem;display:flex;flex-direction:column;gap:.45rem">
      ${movs.map(m => renderMov(m, dia.id)).join('')}
    </div>` : `
    <div class="empty" style="padding:2.5rem 1rem">
      ${icon('dollar')}<p>Sin movimientos todavía</p>
    </div>`}
  </div>`;
}

function renderMov(m, cajaId) {
  const es = m.tipo === 'ingreso';
  const mt = metodo(m.metodoPago);
  return `
  <div style="
    display:flex;align-items:center;gap:.85rem;padding:.7rem .9rem;
    border-radius:var(--r-md);
    background:color-mix(in srgb,${es?'var(--success)':'var(--danger)'} 7%,transparent);
    border:1.5px solid color-mix(in srgb,${es?'var(--success)':'var(--danger)'} 28%,transparent)
  ">
    <div style="font-size:1.35rem;flex-shrink:0;width:32px;text-align:center">${mt.emoji}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:.9rem">${esc(m.concepto)}</div>
      <div style="font-size:.76rem;color:var(--text-soft)">${formatearFechaHora(m.fecha, m.hora)} · ${mt.label}${m.origen ? ` · ${esc(etiquetaOrigen(m.origen))}` : ''}${m.nota ? ` · ${esc(m.nota)}` : ''}</div>
    </div>
    <div style="font-size:1.05rem;font-weight:800;color:${es?'var(--success)':'var(--danger)'};white-space:nowrap">
      ${es?'+':'-'}${moneda(m.monto)}
    </div>
    <span class="badge ${es?'badge-success':'badge-danger'}" style="flex-shrink:0;font-size:.7rem">
      ${es?'Ingreso':'Egreso'}
    </span>
    <button class="btn btn-xs btn-ghost" data-del="${m.id}" data-caja="${cajaId}"
      style="flex-shrink:0;color:var(--text-faint)" title="Eliminar">${icon('trash')}</button>
  </div>`;
}

/* ── Historial ─────────────────────────────────────────────── */
function renderFilaDia(d) {
  const ing = sumarTipo(d.movimientos,'ingreso');
  const egr = sumarTipo(d.movimientos,'egreso');
  const sal = ing - egr;
  return `
  <div class="list-row list-row-hover" data-toggler="${d.id}" style="cursor:pointer">
    <div class="list-info">
      <div class="list-name">${fmtFechaCorta(d.fecha)}</div>
      <div class="text-xs text-soft">${d.movimientos.length} movimientos</div>
    </div>
    <div style="display:flex;gap:.75rem;align-items:center;font-size:.85rem">
      <span style="color:var(--success)">+${moneda(ing)}</span>
      <span style="color:var(--danger)">-${moneda(egr)}</span>
      <span style="font-weight:700;color:${sal>=0?'var(--success)':'var(--danger)'}">${sal<0?'-':''}${moneda(sal)}</span>
    </div>
  </div>
  <div data-dia-det="${d.id}" hidden style="background:var(--surface-2);border-bottom:1px solid var(--border);padding:.5rem .85rem">
    ${d.movimientos.length ? d.movimientos.slice().reverse().map(m => {
      const mt = metodo(m.metodoPago);
      const es = m.tipo === 'ingreso';
      return `<div style="display:flex;gap:.75rem;align-items:center;padding:.35rem .25rem;font-size:.83rem;border-bottom:1px solid var(--border)">
        <span style="min-width:86px;color:var(--text-faint)">${formatearFechaHora(m.fecha, m.hora)}</span>
        <span style="font-size:1rem">${mt.emoji}</span>
        <span style="flex:1">${esc(m.concepto)}${m.nota?` <span style="color:var(--text-faint)">· ${esc(m.nota)}</span>`:''}</span>
        <span style="color:var(--text-soft);font-size:.75rem">${mt.label}</span>
        <span style="font-weight:700;color:${es?'var(--success)':'var(--danger)'}">${es?'+':'-'}${moneda(m.monto)}</span>
      </div>`;
    }).join('') : '<div style="padding:.5rem;color:var(--text-faint);font-size:.82rem">Sin movimientos</div>'}
  </div>`;
}

/* ── KPI card ─────────────────────────────────────────────── */
function kpi(label, monto, color) {
  return `
  <div class="card" style="padding:.9rem 1rem">
    <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft);margin-bottom:.3rem">${label}</div>
    <div style="font-size:1.3rem;font-weight:800;color:${color}">${moneda(monto)}</div>
  </div>`;
}

/* ── Formulario nuevo movimiento ──────────────────────────── */
function openMovForm(cajaId, tipoInicial = 'ingreso') {
  const colores = { ingreso: 'var(--success)', egreso: 'var(--danger)' };
  const btnStyle = (tipo, activo) => activo
    ? `border:2px solid ${colores[tipo]};background:color-mix(in srgb,${colores[tipo]} 12%,transparent);color:${colores[tipo]};font-weight:700`
    : `border:2px solid var(--border);background:var(--surface);color:var(--text-soft);font-weight:600`;

  openModal({
    title: tipoInicial === 'ingreso' ? '+ Registrar ingreso' : '− Registrar egreso',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:1rem">

        <!-- Tipo ingreso / egreso -->
        <div style="display:flex;gap:.5rem">
          <button type="button" id="tipIngreso" style="flex:1;padding:.65rem;border-radius:var(--r-md);cursor:pointer;transition:.15s;${btnStyle('ingreso',tipoInicial==='ingreso')}">
            + Ingreso
          </button>
          <button type="button" id="tipEgreso" style="flex:1;padding:.65rem;border-radius:var(--r-md);cursor:pointer;transition:.15s;${btnStyle('egreso',tipoInicial==='egreso')}">
            − Egreso
          </button>
        </div>
        <input type="hidden" id="movTipo" value="${tipoInicial}">

        <!-- Concepto -->
        <div>
          <label class="form-label">Concepto <span style="color:var(--danger)">*</span></label>
          <input id="movConcepto" class="input" placeholder="Ej: Cobro alquiler García, Papelería..." autocomplete="off" autofocus>
        </div>

        <!-- Monto -->
        <div>
          <label class="form-label">Monto <span style="color:var(--danger)">*</span></label>
          <input id="movMonto" class="input input-monto" type="text" inputmode="numeric" placeholder="0">
        </div>

        <!-- Método de pago -->
        <div>
          <label class="form-label">Método de pago</label>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem" id="metodosGrid">
            ${METODOS.map(m => `
              <button type="button" class="btn-met" data-met="${m.id}" style="
                padding:.5rem .3rem;border-radius:var(--r-sm);cursor:pointer;font-size:.78rem;
                border:1.5px solid ${m.id==='efectivo'?m.color:'var(--border)'};
                background:${m.id==='efectivo'?`color-mix(in srgb,${m.color} 12%,transparent)`:'var(--surface)'};
                color:${m.id==='efectivo'?m.color:'var(--text-soft)'};font-weight:600;transition:.15s
              ">${m.emoji} ${m.label}</button>`).join('')}
          </div>
          <input type="hidden" id="movMetodo" value="efectivo">
        </div>

        <!-- Nota -->
        <div>
          <label class="form-label" style="color:var(--text-soft)">Nota (opcional)</label>
          <input id="movNota" class="input" placeholder="Detalle adicional...">
        </div>
      </div>`,

    footerHTML: `
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <button class="btn btn-primary" id="btnGuardarMov">Guardar</button>`,

    onMount({ overlay, close }) {
      /* toggle ingreso/egreso */
      const tipInput = overlay.querySelector('#movTipo');
      const btnIng   = overlay.querySelector('#tipIngreso');
      const btnEgr   = overlay.querySelector('#tipEgreso');
      const setTipo  = (t) => {
        tipInput.value = t;
        btnIng.style.cssText = `flex:1;padding:.65rem;border-radius:var(--r-md);cursor:pointer;transition:.15s;${btnStyle('ingreso',t==='ingreso')}`;
        btnEgr.style.cssText = `flex:1;padding:.65rem;border-radius:var(--r-md);cursor:pointer;transition:.15s;${btnStyle('egreso',t==='egreso')}`;
      };
      btnIng.addEventListener('click', () => setTipo('ingreso'));
      btnEgr.addEventListener('click', () => setTipo('egreso'));

      /* seleccionar método */
      overlay.querySelectorAll('.btn-met').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelector('#movMetodo').value = btn.dataset.met;
          const mt = metodo(btn.dataset.met);
          overlay.querySelectorAll('.btn-met').forEach(b => {
            const sel = b.dataset.met === btn.dataset.met;
            const mc  = metodo(b.dataset.met);
            b.style.borderColor = sel ? mc.color : 'var(--border)';
            b.style.background  = sel ? `color-mix(in srgb,${mc.color} 12%,transparent)` : 'var(--surface)';
            b.style.color       = sel ? mc.color : 'var(--text-soft)';
          });
        });
      });

      /* cancelar */
      overlay.querySelector('[data-cancel]').addEventListener('click', close);

      /* guardar */
      overlay.querySelector('#btnGuardarMov').addEventListener('click', async () => {
        const tipo     = tipInput.value;
        const concepto = overlay.querySelector('#movConcepto').value.trim();
        const monto    = valorMonto(overlay.querySelector('#movMonto').value);
        const metodoPago = overlay.querySelector('#movMetodo').value;
        const nota     = overlay.querySelector('#movNota').value.trim();

        if (!concepto) { overlay.querySelector('#movConcepto').focus(); return; }
        if (!monto || monto <= 0) { overlay.querySelector('#movMonto').focus(); return; }

        await actions.addMovimiento(cajaId, { tipo, concepto, monto, metodoPago, nota });
        close();
      });
    },
  });
}

/* ── Confirmar cierre del día ─────────────────────────────── */
function confirmarCierre(dia) {
  const ing = sumarTipo(dia.movimientos,'ingreso');
  const egr = sumarTipo(dia.movimientos,'egreso');
  const sal = ing - egr;

  const filasMet = METODOS.map(m => {
    const n = sumarMetodo(dia.movimientos,'ingreso',m.id) - sumarMetodo(dia.movimientos,'egreso',m.id);
    if (!n) return '';
    return `<div style="display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid var(--border);font-size:.875rem">
      <span>${m.emoji} ${m.label}</span>
      <span style="font-weight:700;color:${n>=0?m.color:'var(--danger)'}">${n<0?'-':''}${moneda(n)}</span>
    </div>`;
  }).join('');

  openModal({
    title: '📋 Cerrar el día',
    bodyHTML: `
      <p style="color:var(--text-soft);font-size:.875rem;margin-bottom:1rem">
        Al cerrar la caja de hoy no se podrán agregar más movimientos para este día.
        Mañana se abrirá una nueva caja automáticamente.
      </p>
      <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1rem;margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:.4rem;font-size:.85rem">
          <span style="color:var(--text-soft)">Ingresos totales</span>
          <span style="color:var(--success);font-weight:700">+${moneda(ing)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.75rem;font-size:.85rem">
          <span style="color:var(--text-soft)">Egresos totales</span>
          <span style="color:var(--danger);font-weight:700">-${moneda(egr)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:1.05rem;font-weight:800;padding-top:.6rem;border-top:2px solid var(--border)">
          <span>Saldo del día</span>
          <span style="color:${sal>=0?'var(--success)':'var(--danger)'}">${sal<0?'-':''}${moneda(sal)}</span>
        </div>
      </div>
      ${filasMet ? `<div style="font-size:.75rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem;font-weight:600">Por método</div>${filasMet}` : ''}`,

    footerHTML: `
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <button class="btn btn-primary" id="btnConfirmarCierre">Cerrar el día</button>`,

    onMount({ overlay, close }) {
      overlay.querySelector('[data-cancel]').addEventListener('click', close);
      overlay.querySelector('#btnConfirmarCierre').addEventListener('click', async () => {
        await actions.cerrarCaja(dia.id);
        await actions.cajaHoy();
        close();
      });
    },
  });
}
