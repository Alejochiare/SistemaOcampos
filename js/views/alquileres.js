/* ============================================================
   VISTA · Alquileres — contratos activos, cobros y vencimientos
   ============================================================ */
import { getState, sel, actions, subscribe } from '../store.js';
import { icon, CONTRATO_ESTADOS } from '../config.js';
import { esc, fmtMoneda, fmtFechaCorta } from '../lib.js';
import { navegar } from '../router.js';
import { openAlquilerForm, openCobroForm } from './_forms.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { imprimirRecibo, imprimirLiquidacion, getAgencia, setAgencia } from '../imprimir.js';
import { abrirFormLiquidacion } from './liquidaciones.js';

export default function alquileres(root, param) {
  if (param) return alqDetalle(root, param);
  root.innerHTML = `<div class="view" id="vAlq"></div>`;
  let filtro = '';

  const render = () => pintarLista(root.querySelector('#vAlq'), filtro);
  render();
  const unsub = subscribe(render);

  root.querySelector('#vAlq').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (btn) { filtro = btn.dataset.filtro; render(); }
  });

  return unsub;
}

function pintarLista(el, filtro) {
  const { alquileres, clientes, propiedades } = getState();

  const activos = alquileres.filter(a => a.estado !== 'rescindido' && sel.diasAlVencimiento(a) >= 0);

  // Contadores para los badges
  const cntVencer   = activos.filter(a => { const d = sel.diasAlVencimiento(a); return d >= 0 && d <= 90; }).length;
  const cntAumento  = activos.filter(a => (sel.infoAjuste(a)?.pendientes || 0) > 0).length;
  const cntDeuda    = activos.filter(a => sel.cobrosImpagosMes(a).length > 0).length;
  const cntVencidos = alquileres.filter(a => a.estado !== 'rescindido' && sel.diasAlVencimiento(a) < 0).length;

  const FILTROS = [
    { id: '',         label: 'Todos',            cnt: activos.length },
    { id: 'vencer',   label: 'Por vencer',       cnt: cntVencer,  color: 'var(--warning)' },
    { id: 'aumento',  label: 'Necesitan aumento',cnt: cntAumento, color: 'var(--warning)' },
    { id: 'deuda',    label: 'Con deuda',         cnt: cntDeuda,   color: 'var(--danger)'  },
    { id: 'vencidos', label: 'Vencidos',          cnt: cntVencidos,color: 'var(--danger)'  },
  ];

  const baseActivos = [...activos].sort((a, b) => sel.diasAlVencimiento(a) - sel.diasAlVencimiento(b));

  let lista;
  if      (filtro === 'vencer')   lista = baseActivos.filter(a => { const d = sel.diasAlVencimiento(a); return d >= 0 && d <= 90; });
  else if (filtro === 'aumento')  lista = baseActivos.filter(a => (sel.infoAjuste(a)?.pendientes || 0) > 0);
  else if (filtro === 'deuda')    lista = baseActivos.filter(a => sel.cobrosImpagosMes(a).length > 0);
  else if (filtro === 'vencidos') lista = alquileres.filter(a => a.estado !== 'rescindido' && sel.diasAlVencimiento(a) < 0).sort((a, b) => sel.diasAlVencimiento(a) - sel.diasAlVencimiento(b));
  else                            lista = baseActivos;

  const pillStyle = (activo) => activo
    ? 'background:var(--primary);color:var(--on-primary);border-color:var(--primary)'
    : 'background:var(--surface);color:var(--text);border-color:var(--border)';

  // Franja de color lateral según urgencia
  const urgenciaColor = (dias) => {
    if (dias < 0)   return '#dc2626'; // vencido
    if (dias <= 30) return '#dc2626'; // rojo — menos de 1 mes
    if (dias <= 90) return '#d97706'; // naranja — 1-3 meses
    return '#16a34a';                  // verde — más de 3 meses
  };
  const urgenciaLabel = (dias) => {
    if (dias < 0)   return `Venció hace ${Math.abs(dias)}d`;
    if (dias === 0) return 'Vence hoy';
    if (dias <= 30) return `Vence en ${dias}d`;
    if (dias <= 90) return `${dias}d restantes`;
    return fmtFechaCorta(activos.find(() => true)?.fechaFin || ''); // fallback
  };

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Alquileres</h1>
        <p class="view-sub">${activos.length} activo${activos.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" id="btnNuevoAlq">${icon('plus')} Nuevo contrato</button>
    </div>

    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1.5rem">
      ${FILTROS.map(f => `
        <button data-filtro="${f.id}" style="border:1.5px solid;border-radius:var(--r-full);padding:.3rem .85rem;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s;${pillStyle(filtro===f.id)}">
          ${f.label}${f.cnt ? ` <span style="opacity:.75">(${f.cnt})</span>` : ''}
        </button>`).join('')}
    </div>

    ${lista.length ? `
    <div class="card" style="padding:0;overflow:hidden">
      ${lista.map(a => {
        const inq = clientes.find(c => c.id === a.inquilinoId);
        const prop = propiedades.find(p => p.id === a.propiedadId);
        const estado = sel.estadoAlquiler(a);
        const estadoObj = CONTRATO_ESTADOS.find(e => e.id === estado);
        const dias = sel.diasAlVencimiento(a);
        const cobrosImpagos = sel.cobrosImpagosMes(a);
        const ajInfo = sel.infoAjuste(a);
        const necesitaAumento = ajInfo && ajInfo.pendientes > 0;
        const montoActual = a.montoActual ?? a.montoInicial;
        const color = urgenciaColor(dias);

        return `
          <div class="list-row list-row-hover" data-id="${a.id}"
            style="cursor:pointer;align-items:stretch;padding:0;border-bottom:1px solid var(--border)">
            <!-- Franja de color lateral -->
            <div style="width:4px;background:${color};flex-shrink:0;border-radius:0"></div>
            <div style="flex:1;min-width:0;padding:.9rem 1.1rem;display:flex;align-items:center;gap:.75rem">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
                  <span class="list-name">${esc(inq?.nombre || '—')}</span>
                  ${cobrosImpagos.length ? `<span class="badge badge-danger" style="font-size:.68rem">${cobrosImpagos.length} mes${cobrosImpagos.length!==1?'es':''} sin pagar</span>` : ''}
                  ${necesitaAumento ? `<span class="badge badge-warning" style="font-size:.68rem">⬆ Aumentar</span>` : ''}
                </div>
                <div class="text-xs text-soft">${esc(prop?.direccion || '—')}${prop?.ciudad ? ' · ' + esc(prop.ciudad) : ''}</div>
                <div class="text-xs" style="margin-top:.2rem;color:var(--text-soft)">
                  ${fmtMoneda(montoActual, a.moneda)}/mes
                </div>
              </div>
              <!-- Días restantes -->
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:.75rem;font-weight:700;color:${color}">${urgenciaLabel(dias)}</div>
                <div style="font-size:.7rem;color:var(--text-faint);margin-top:.1rem">Vence ${fmtFechaCorta(a.fechaFin)}</div>
              </div>
              <div style="display:flex;gap:.25rem;flex-shrink:0">
                <button class="btn btn-xs btn-ghost btn-cobro" data-id="${a.id}" title="Registrar cobro" onclick="event.stopPropagation()">${icon('dollar')}</button>
                <button class="btn btn-xs btn-ghost btn-edit-alq" data-id="${a.id}" title="Editar" onclick="event.stopPropagation()">${icon('edit')}</button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>` : `
    <div class="empty">
      ${icon('key')}
      <h3>No hay contratos de alquiler</h3>
      <p>Cargá tu primer contrato.</p>
      <button class="btn btn-primary" id="btnNuevoAlq2">${icon('plus')} Nuevo contrato</button>
    </div>`}`;

  el.querySelector('#btnNuevoAlq')?.addEventListener('click', () => openAlquilerForm(null, () => {}));
  el.querySelector('#btnNuevoAlq2')?.addEventListener('click', () => openAlquilerForm(null, () => {}));

  el.querySelectorAll('.list-row-hover[data-id]').forEach(row => {
    row.addEventListener('click', () => navegar(`alquileres/${row.dataset.id}`));
  });
  el.querySelectorAll('.btn-cobro[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = getState().alquileres.find(x => x.id === btn.dataset.id);
      if (a) openCobroForm(a, () => {});
    });
  });
  el.querySelectorAll('.btn-edit-alq[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = getState().alquileres.find(x => x.id === btn.dataset.id);
      if (a) openAlquilerForm(a, () => {});
    });
  });
}

/* ---- Detalle de contrato ---- */
async function alqDetalle(root, id) {
  root.innerHTML = `<div class="view" id="vAlqDet"></div>`;
  const render = () => pintarDetalle(root.querySelector('#vAlqDet'), id);
  render();
  return subscribe(render);
}

function pintarDetalle(el, id) {
  const { alquileres, clientes, propiedades } = getState();
  const a = alquileres.find(x => x.id === id);
  if (!a) { el.innerHTML = `<div class="view"><div class="empty"><h3>Contrato no encontrado</h3></div></div>`; return; }

  const inq      = clientes.find(c => c.id === a.inquilinoId);
  const prop     = propiedades.find(p => p.id === a.propiedadId);
  const estado   = sel.estadoAlquiler(a);
  const estadoObj = CONTRATO_ESTADOS.find(e => e.id === estado);
  const dias     = sel.diasAlVencimiento(a);
  const ajInfo   = sel.infoAjuste(a);
  const montoActual = a.montoActual ?? a.montoInicial ?? 0;

  // ── Calendario de meses ──────────────────────────────────
  const meses = generarMeses(a);
  const cobrosPorMes = {};
  (a.cobros || []).forEach(c => { cobrosPorMes[c.mes] = c; });

  const totalCobrado = (a.cobros || []).filter(c => c.pagado).reduce((s, c) => s + (Number(c.monto)||0), 0);
  const nPagados     = (a.cobros || []).filter(c => c.pagado).length;
  const nDebe        = meses.filter(m => m.tipo === 'debe' || m.tipo === 'sin_cobro').length;

  // ── Render ────────────────────────────────────────────────
  el.innerHTML = `
    <div class="view-head">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" onclick="history.back()">${icon('x')}</button>
        <div>
          <h1 class="view-title">${esc(inq?.nombre || 'Contrato')}</h1>
          <p class="view-sub">${esc(prop?.direccion || '—')}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" id="btnVerContrato">${icon('file')} Ver contrato</button>
        <button class="btn btn-ghost" id="btnConfigAgencia" title="Datos de la inmobiliaria para documentos">${icon('edit')} Datos imprenta</button>
        <button class="btn btn-ghost" id="btnEditarAlq">${icon('edit')} Editar</button>
        <button class="btn btn-primary" id="btnRegistrarCobro">${icon('dollar')} Registrar cobro</button>
      </div>
    </div>

    <!-- Datos del contrato (resumen) -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-head">
        <h3>Contrato</h3>
        <span class="badge ${estadoObj?.badge || 'badge-neutral'}">${estadoObj?.label || estado}</span>
      </div>
      <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.4rem .75rem">
        ${filaInline('Propiedad', prop?.direccion)}
        ${filaInline('Inicio', fmtFechaCorta(a.fechaInicio))}
        ${filaInline('Vencimiento', fmtFechaCorta(a.fechaFin))}
        ${filaInline('Fecha firma', a.fechaFirma ? fmtFechaCorta(a.fechaFirma) : null)}
        ${filaInline('Monto inicial', fmtMoneda(a.montoInicial, a.moneda))}
        ${filaInline('Monto actual', a.montoActual ? fmtMoneda(a.montoActual, a.moneda) : null)}
        ${filaInline('Ajuste', a.tipoAjuste ? `${a.tipoAjuste}${a.porcentajeAjuste ? ' · ' + a.porcentajeAjuste + '%' : ''} · c/${a.frecuenciaAjuste} meses` : null)}
        ${filaInline('Depósito', fmtMoneda(a.deposito, a.moneda))}
        ${filaInline('Comisión', a.comision ? `${a.comision}%` : null)}
      </div>

      <!-- Inquilino con WhatsApp -->
      <div style="border-top:1px solid var(--border);margin:0 1.25rem;padding:.75rem 0 .25rem">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft);font-weight:600;margin-bottom:.6rem">Inquilino</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.4rem .75rem;flex:1">
            ${filaInline('Nombre', inq?.nombre)}
            ${filaInline('Teléfono', a.inquilinoTelefono || inq?.telefono)}
            ${filaInline('DNI', a.inquilinoDni)}
            ${filaInline('Domicilio', a.inquilinoDomicilio)}
          </div>
          ${(() => { const tel = (a.inquilinoTelefono || inq?.telefono || '').replace(/\D/g,''); const num = tel ? (tel.startsWith('54')?tel:'54'+tel) : null; return num ? `<a href="https://wa.me/${num}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.4rem;text-decoration:none;flex-shrink:0">${icon('whatsapp')} WhatsApp</a>` : ''; })()}
        </div>
      </div>

      <!-- Garante con WhatsApp -->
      ${(a.garante || a.garanteDni || a.garanteTelefono) ? `
      <div style="border-top:1px solid var(--border);margin:0 1.25rem;padding:.75rem 0 .25rem">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft);font-weight:600;margin-bottom:.6rem">Garante</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.4rem .75rem;flex:1">
            ${filaInline('Nombre', a.garante)}
            ${filaInline('DNI / CUIT', a.garanteDni)}
            ${filaInline('Teléfono', a.garanteTelefono)}
            ${filaInline('Email', a.garanteEmail)}
            ${filaInline('Domicilio', a.garanteDomicilio)}
            ${filaInline('Relación', a.garanteRelacion)}
            ${filaInline('Propiedad en garantía', a.garantePropiedad)}
          </div>
          ${(() => { const tel = (a.garanteTelefono || '').replace(/\D/g,''); const num = tel ? (tel.startsWith('54')?tel:'54'+tel) : null; return num ? `<a href="https://wa.me/${num}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.4rem;text-decoration:none;flex-shrink:0">${icon('whatsapp')} WhatsApp</a>` : ''; })()}
        </div>
      </div>` : ''}

      <div style="height:.5rem"></div>
      <div style="padding:.25rem 1.25rem .9rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        ${dias >= 0
          ? `<span class="badge ${dias <= 30 ? 'badge-danger' : dias <= 60 ? 'badge-warning' : 'badge-success'}">Faltan ${dias} días para vencer</span>`
          : `<span class="badge badge-danger">Venció hace ${Math.abs(dias)} días</span>`}
        ${a.notas ? `<span class="text-soft" style="font-size:.82rem">📝 ${esc(a.notas)}</span>` : ''}
      </div>
    </div>

    <!-- Banner AUMENTO -->
    ${ajInfo && ajInfo.pendientes > 0 ? `
    <div style="
      margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:var(--r-md);
      background:color-mix(in srgb,var(--warning) 12%,transparent);
      border:2px solid var(--warning);display:flex;align-items:center;gap:1rem;flex-wrap:wrap
    ">
      <div style="font-size:1.5rem">⬆️</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:.95rem">Contrato por aumentar</div>
        <div style="font-size:.82rem;color:var(--text-soft);margin-top:.2rem">
          ${ajInfo.pendientes} aumento${ajInfo.pendientes>1?'s':''} pendiente${ajInfo.pendientes>1?'s':''} ·
          Monto actual: <strong>${fmtMoneda(montoActual, a.moneda)}</strong> ·
          ${a.tipoAjuste === 'fijo' && a.porcentajeAjuste
            ? `Calculado automáticamente (+${a.porcentajeAjuste}%) → <strong style="color:var(--success)">${fmtMoneda(Math.round(montoActual*(1+a.porcentajeAjuste/100)), a.moneda)}</strong>`
            : a.tipoAjuste
              ? `Ajuste por <strong>${a.tipoAjuste}</strong> — el modal calcula automático`
              : 'Sin tipo de ajuste configurado'}
        </div>
      </div>
      <button class="btn btn-primary" id="btnRegistrarAumento" style="background:var(--warning);border-color:var(--warning);flex-shrink:0">
        Registrar aumento
      </button>
    </div>` : ''}

    <!-- Cobros mes a mes -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-head">
        <h3>${icon('dollar')} Cobros mes a mes</h3>
        <button class="btn btn-sm btn-primary" id="btnRegistrarCobro2">${icon('plus')} Agregar</button>
      </div>

      <!-- Resumen rápido -->
      <div style="display:flex;gap:2rem;padding:.75rem 1.25rem;border-bottom:1px solid var(--border);background:var(--surface-2);flex-wrap:wrap">
        <div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--success);line-height:1">${nPagados}</div>
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft)">Cobrados</div>
        </div>
        <div>
          <div style="font-size:1.3rem;font-weight:800;color:${nDebe?'var(--danger)':'var(--text-faint)'};line-height:1">${nDebe}</div>
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft)">Deben</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:1rem;font-weight:700">${fmtMoneda(totalCobrado, a.moneda)}</div>
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-soft)">Total cobrado</div>
        </div>
      </div>

      <!-- Lista de meses -->
      <div style="padding:.6rem .75rem;display:flex;flex-direction:column;gap:.4rem;max-height:480px;overflow-y:auto">
        ${meses.map(m => renderMesCobro(m, a)).join('')}
      </div>
    </div>

    <!-- Historial de ajustes -->
    ${(a.historialAjustes||[]).length ? `
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-head"><h3>${icon('trending')} Historial de aumentos</h3></div>
      <div style="padding:0">
        ${[...(a.historialAjustes||[])].reverse().map(aj => `
          <div class="list-row">
            <div class="list-info">
              <div class="list-name">${fmtFechaCorta(aj.fecha)}</div>
              <div class="text-xs text-soft">${aj.nota || 'Sin nota'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:.75rem;color:var(--text-soft);text-decoration:line-through">${fmtMoneda(aj.montoAnterior, a.moneda)}</div>
              <div style="font-weight:700;color:var(--success)">${fmtMoneda(aj.montoNuevo, a.moneda)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div style="padding-top:.75rem;border-top:1px solid var(--border);display:flex;gap:1rem">
      <button class="btn btn-ghost" id="btnRescindirAlq">${icon('x')} Rescindir contrato</button>
      <button class="btn" id="btnEliminarAlq" style="background:var(--danger);color:#fff">${icon('trash')} Eliminar</button>
    </div>`;

  /* ── Eventos ─────────────────────────────────────────── */
  el.querySelector('#btnVerContrato')?.addEventListener('click', () => abrirVistaContrato(a, inq, prop));
  el.querySelector('#btnEditarAlq')?.addEventListener('click', () => openAlquilerForm(a, () => {}));
  el.querySelector('#btnRegistrarCobro')?.addEventListener('click',  () => openCobroForm(a, () => {}));
  el.querySelector('#btnRegistrarCobro2')?.addEventListener('click', () => openCobroForm(a, () => {}));

  el.querySelector('#btnRegistrarAumento')?.addEventListener('click', () => openAumentoModal(a));
  el.querySelector('#btnConfigAgencia')?.addEventListener('click', () => openAgenciaModal());

  /* imprimir recibo / liquidación */
  const datosImpresion = () => ({
    alq: a,
    inquilino: inq,
    propiedad: prop,
    propietario: getState().propietarios?.find(p => p.id === a.propietarioId),
  });
  el.querySelectorAll('[data-print-rec]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cobro = (a.cobros || []).find(c => c.mes === btn.dataset.printRec);
      if (cobro) imprimirRecibo({ ...datosImpresion(), cobro });
    });
  });
  el.querySelectorAll('[data-print-liq]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cobro = (a.cobros || []).find(c => c.mes === btn.dataset.printLiq);
      if (!cobro) return;
      abrirFormLiquidacion({ alq: a, cobro }, () => location.hash = '#/liquidaciones');
    });
  });

  /* marcar cobro existente como pagado */
  el.querySelectorAll('[data-cob-pagar]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await actions.updateCobro(id, btn.dataset.cobPagar, {
        pagado: true, fechaPago: new Date().toISOString().slice(0,10)
      });
    });
  });

  /* registrar cobro de un mes sin cobro */
  el.querySelectorAll('[data-mes-nuevo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCobroForm(a, () => {}, { mes: btn.dataset.mesNuevo, monto: montoActual });
    });
  });

  el.querySelector('#btnRescindirAlq')?.addEventListener('click', async () => {
    if (!confirm('¿Rescindir este contrato?')) return;
    await actions.updateAlquiler(id, { estado: 'rescindido' });
  });
  el.querySelector('#btnEliminarAlq')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este contrato?')) return;
    await actions.deleteAlquiler(id);
    navegar('alquileres');
  });
}

/* ── Modal de cálculo de liquidación ────────────────────── */
function openLiquidacionModal(datos) {
  const { alq, cobro, propietario } = datos;
  const totalAlquiler = cobro.monto || alq.montoActual || alq.montoInicial || 0;
  const pctDefault    = alq.comision || 0;

  // Estado reactivo de descuentos (lista mutable)
  let descuentos = [{ id: 1, monto: '', nota: '' }];
  let nextId = 2;

  const calcHonorarios = (pct) => Math.round(totalAlquiler * (Number(pct) || 0) / 100);
  const calcTotal      = (pct, descs) =>
    totalAlquiler - calcHonorarios(pct) - descs.reduce((s, d) => s + (Number(d.monto) || 0), 0);

  const fmt = (n) => '$' + Math.abs(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

  const renderDescuentos = (overlay) =>
    overlay.querySelector('#descuentosContainer').innerHTML =
      descuentos.map(d => `
        <div style="display:flex;gap:.5rem;align-items:center" data-desc-row="${d.id}">
          <input class="input desc-monto" data-id="${d.id}" type="number" min="0"
            placeholder="Monto" value="${d.monto}" style="width:130px;flex-shrink:0">
          <input class="input desc-nota" data-id="${d.id}"
            placeholder="Descripción (ej: plomería, pintura...)" value="${d.nota}" style="flex:1">
          <button type="button" class="btn btn-xs btn-ghost btn-del-desc" data-id="${d.id}"
            style="color:var(--danger);flex-shrink:0">${icon('x')}</button>
        </div>`).join('');

  const recalcular = (overlay) => {
    const pct      = parseFloat(overlay.querySelector('#pctHonorarios').value) || 0;
    const honor    = calcHonorarios(pct);
    const totalDesc = descuentos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
    const total    = calcTotal(pct, descuentos);
    overlay.querySelector('#resHonorarios').textContent     = fmt(honor);
    overlay.querySelector('#resHonorariosFin').textContent  = fmt(honor);
    const descFin = overlay.querySelector('#resDescMonto');
    if (descFin) descFin.textContent = totalDesc > 0 ? fmt(totalDesc) : '—';
    overlay.querySelector('#resTotal').textContent = fmt(total);
    overlay.querySelector('#resTotal').style.color = total >= 0 ? 'var(--success)' : 'var(--danger)';
  };

  const bindDescuentos = (overlay) => {
    overlay.querySelectorAll('.desc-monto').forEach(inp => {
      inp.addEventListener('input', () => {
        const d = descuentos.find(x => String(x.id) === inp.dataset.id);
        if (d) { d.monto = inp.value; recalcular(overlay); }
      });
    });
    overlay.querySelectorAll('.desc-nota').forEach(inp => {
      inp.addEventListener('input', () => {
        const d = descuentos.find(x => String(x.id) === inp.dataset.id);
        if (d) d.nota = inp.value;
      });
    });
    overlay.querySelectorAll('.btn-del-desc').forEach(btn => {
      btn.addEventListener('click', () => {
        descuentos = descuentos.filter(x => String(x.id) !== btn.dataset.id);
        renderDescuentos(overlay);
        bindDescuentos(overlay);
        recalcular(overlay);
      });
    });
  };

  openModal({
    title: '📋 Calcular liquidación',
    size: 'lg',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:1.1rem">

        <!-- Info del cobro -->
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.85rem 1rem;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.75rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em">Alquiler cobrado</div>
            <div style="font-weight:600;font-size:.9rem">${esc(propietario?.nombre || '—')} · ${cobro.mes ? mesLabel(cobro.mes) : '—'}</div>
          </div>
          <div style="font-size:1.3rem;font-weight:800">${fmt(totalAlquiler)}</div>
        </div>

        <!-- Honorarios -->
        <div>
          <label class="form-label">% Honorarios de la inmobiliaria</label>
          <div style="display:flex;align-items:center;gap:.6rem">
            <input id="pctHonorarios" class="input" type="number" min="0" max="100" step="0.5"
              value="${pctDefault}" style="width:110px;font-size:1.1rem;font-weight:700;text-align:center">
            <span style="color:var(--text-soft)">%</span>
            <span style="color:var(--text-soft);font-size:.82rem">→ se queda la inmobiliaria:</span>
            <span id="resHonorarios" style="font-weight:800;font-size:1rem;color:var(--primary)">${fmt(calcHonorarios(pctDefault))}</span>
          </div>
        </div>

        <!-- Descuentos adicionales -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <label class="form-label" style="margin:0">Descuentos adicionales</label>
            <button type="button" class="btn btn-xs btn-ghost" id="btnAgregarDesc" style="color:var(--primary)">
              ${icon('plus')} Agregar descuento
            </button>
          </div>
          <div id="descuentosContainer" style="display:flex;flex-direction:column;gap:.4rem">
          </div>
          <div style="font-size:.76rem;color:var(--text-soft);margin-top:.35rem">
            Podés agregar gastos, reparaciones, deudas u otros conceptos que se descuenten del pago al propietario. Cada uno aparece detallado en el documento.
          </div>
        </div>

        <!-- Forma de pago -->
        <div>
          <label class="form-label">Forma de pago</label>
          <select id="formaPago" class="input">
            <option>Efectivo</option>
            <option>Transferencia</option>
            <option>Cheque</option>
            <option>Otro</option>
          </select>
        </div>

        <!-- Resumen final -->
        <div style="background:color-mix(in srgb,var(--success) 8%,transparent);border:2px solid var(--success);border-radius:var(--r-md);padding:1rem 1.25rem">
          <div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-soft);margin-bottom:.3rem">
            <span>Total alquiler</span><span>${fmt(totalAlquiler)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-soft);margin-bottom:.3rem">
            <span>− Honorarios</span><span id="resHonorariosFin">${fmt(calcHonorarios(pctDefault))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-soft);padding-bottom:.4rem;border-bottom:1px solid var(--border);margin-bottom:.4rem" id="resDescuentosFin" ${!descuentos.length ? 'style="display:none"' : ''}>
            <span>− Otros descuentos</span><span id="resDescMonto">—</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:800">
            <span>Total al propietario</span>
            <span id="resTotal" style="color:var(--success)">${fmt(calcTotal(pctDefault, descuentos))}</span>
          </div>
        </div>
      </div>`,

    footerHTML: `
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <button class="btn btn-primary" id="btnGenLiq">${icon('file')} Generar liquidación</button>`,

    onMount({ overlay, close }) {
      // Render inicial de descuentos
      renderDescuentos(overlay);
      bindDescuentos(overlay);

      // Honorarios cambia
      const inpPct = overlay.querySelector('#pctHonorarios');
      inpPct.addEventListener('input', () => {
        const honor = calcHonorarios(inpPct.value);
        overlay.querySelector('#resHonorarios').textContent = fmt(honor);
        overlay.querySelector('#resHonorariosFin').textContent = fmt(honor);
        recalcular(overlay);
      });

      // Agregar descuento
      overlay.querySelector('#btnAgregarDesc').addEventListener('click', () => {
        descuentos.push({ id: nextId++, monto: '', nota: '' });
        renderDescuentos(overlay);
        bindDescuentos(overlay);
        recalcular(overlay);
      });

      overlay.querySelector('[data-cancel]').addEventListener('click', close);

      overlay.querySelector('#btnGenLiq').addEventListener('click', () => {
        const pct      = parseFloat(inpPct.value) || 0;
        const formaPago = overlay.querySelector('#formaPago').value;
        const descs     = descuentos.filter(d => d.monto && Number(d.monto) > 0);
        imprimirLiquidacion({ ...datos, pctHonorarios: pct, descuentos: descs, formaPago });
        close();
      });
    },
  });
}

/* ── Modal datos de la inmobiliaria ─────────────────────── */
function openAgenciaModal() {
  const ag = getAgencia();
  openModal({
    title: '🏢 Datos de la inmobiliaria (para documentos)',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:.85rem">
        <p style="font-size:.82rem;color:var(--text-soft)">
          Estos datos aparecen en el encabezado de recibos y liquidaciones.
        </p>
        <div class="form-grid">
          <div class="form-group full"><label class="form-label">Nombre de la inmobiliaria</label>
            <input id="agNombre" class="input" value="${esc(ag.nombre||'')}" placeholder="Ej: Sunset Bienes Raíces"></div>
          <div class="form-group"><label class="form-label">CUIT</label>
            <input id="agCuit" class="input" value="${esc(ag.cuit||'')}" placeholder="20-12345678-9"></div>
          <div class="form-group"><label class="form-label">Condición IVA</label>
            <input id="agIva" class="input" value="${esc(ag.iva||'Responsable Monotributo')}" placeholder="Responsable Monotributo"></div>
          <div class="form-group full"><label class="form-label">Dirección</label>
            <input id="agDireccion" class="input" value="${esc(ag.direccion||'')}" placeholder="Av. Colón 1234"></div>
          <div class="form-group"><label class="form-label">Localidad</label>
            <input id="agLocalidad" class="input" value="${esc(ag.localidad||'')}" placeholder="Córdoba"></div>
          <div class="form-group"><label class="form-label">Teléfono</label>
            <input id="agTelefono" class="input" value="${esc(ag.telefono||'')}" placeholder="0351-1234567"></div>
          <div class="form-group"><label class="form-label">Inicio de actividades</label>
            <input id="agInicio" class="input" type="date" value="${ag.inicioActividades||''}"></div>
        </div>
      </div>`,
    footerHTML: `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" id="btnGuardarAgencia">Guardar</button>`,
    onMount({ overlay, close }) {
      overlay.querySelector('[data-cancel]').addEventListener('click', close);
      overlay.querySelector('#btnGuardarAgencia').addEventListener('click', () => {
        setAgencia({
          nombre:            overlay.querySelector('#agNombre').value.trim(),
          cuit:              overlay.querySelector('#agCuit').value.trim(),
          iva:               overlay.querySelector('#agIva').value.trim(),
          direccion:         overlay.querySelector('#agDireccion').value.trim(),
          localidad:         overlay.querySelector('#agLocalidad').value.trim(),
          telefono:          overlay.querySelector('#agTelefono').value.trim(),
          inicioActividades: overlay.querySelector('#agInicio').value,
        });
        close();
      });
    },
  });
}

/* ── Generar lista de meses del contrato ────────────────── */
function generarMeses(a) {
  if (!a.fechaInicio) return [];
  const hoy   = new Date();
  const inicio = new Date(a.fechaInicio);
  const fin    = new Date(a.fechaFin || hoy);
  const hasta  = hoy < fin ? hoy : fin; // no mostrar meses futuros más allá de hoy+3
  const hastaConFuturos = new Date(Math.min(fin.getTime(), new Date(hoy.getFullYear(), hoy.getMonth()+2, 1).getTime()));

  const meses = [];
  const cobrosPorMes = {};
  (a.cobros || []).forEach(c => { cobrosPorMes[c.mes] = c; });

  let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(hastaConFuturos.getFullYear(), hastaConFuturos.getMonth(), 1);

  while (cur <= limite) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
    const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    const esFuturo = key > hoyKey;
    const cobro = cobrosPorMes[key];

    let tipo;
    if (cobro) {
      tipo = cobro.pagado ? 'pagado' : 'debe';
    } else {
      tipo = esFuturo ? 'futuro' : 'sin_cobro';
    }

    meses.unshift({ key, cobro, tipo }); // más reciente primero
    cur.setMonth(cur.getMonth() + 1);
  }
  return meses;
}

/* ── Render de una fila de mes ──────────────────────────── */
function renderMesCobro(m, a) {
  const { key, cobro, tipo } = m;
  const label = mesLabel(key);

  const configs = {
    pagado:    { bg: 'color-mix(in srgb,var(--success) 8%,transparent)',  border: 'color-mix(in srgb,var(--success) 25%,transparent)', dot: 'var(--success)',      icon: '✓' },
    debe:      { bg: 'color-mix(in srgb,var(--danger) 10%,transparent)',   border: 'var(--danger)',                                      dot: 'var(--danger)',       icon: '!' },
    sin_cobro: { bg: 'color-mix(in srgb,var(--warning) 10%,transparent)',  border: 'color-mix(in srgb,var(--warning) 50%,transparent)', dot: 'var(--warning)',      icon: '?' },
    futuro:    { bg: 'var(--surface-2)',                                    border: 'var(--border)',                                      dot: 'var(--text-faint)',   icon: '·' },
  };
  const cfg = configs[tipo];

  return `
  <div style="
    display:flex;align-items:center;gap:.85rem;padding:.65rem .9rem;
    border-radius:var(--r-md);background:${cfg.bg};border:1.5px solid ${cfg.border}
  ">
    <!-- Dot estado -->
    <div style="
      width:34px;height:34px;border-radius:50%;flex-shrink:0;
      background:${cfg.dot};display:grid;place-items:center;
      color:#fff;font-weight:800;font-size:.95rem
    ">${cfg.icon}</div>

    <!-- Mes + detalle -->
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:.9rem">${label}</div>
      <div style="font-size:.76rem;color:var(--text-soft)">
        ${tipo === 'pagado'    ? `Cobrado el ${fmtFechaCorta(cobro.fechaPago)}` : ''}
        ${tipo === 'debe'      ? 'Registrado · pendiente de cobro' : ''}
        ${tipo === 'sin_cobro' ? 'Sin registrar' : ''}
        ${tipo === 'futuro'    ? 'Mes futuro' : ''}
      </div>
    </div>

    <!-- Monto -->
    <div style="font-size:1rem;font-weight:700;white-space:nowrap;color:${tipo==='pagado'?'var(--success)':tipo==='futuro'?'var(--text-faint)':'inherit'}">
      ${cobro?.monto ? fmtMoneda(cobro.monto, a.moneda) : tipo !== 'futuro' ? fmtMoneda(a.montoActual ?? a.montoInicial, a.moneda) : '—'}
    </div>

    <!-- Acción -->
    ${tipo === 'pagado'
      ? `<div style="display:flex;gap:.4rem;flex-shrink:0;align-items:center">
           <button class="btn btn-xs btn-ghost" data-print-rec="${key}" title="Imprimir recibo">${icon('file')} Recibo</button>
           <button class="btn btn-xs btn-ghost" data-print-liq="${key}" title="Imprimir liquidación">${icon('download')} Liquid.</button>
         </div>`
      : tipo === 'debe'
        ? `<button class="btn btn-sm btn-primary" data-cob-pagar="${cobro.id}" style="flex-shrink:0">${icon('check')} Cobrar</button>`
        : tipo === 'sin_cobro'
          ? `<button class="btn btn-sm" data-mes-nuevo="${key}" style="flex-shrink:0;background:var(--warning);color:#fff;border:none">Registrar</button>`
          : `<span class="badge badge-neutral" style="flex-shrink:0">Pendiente</span>`}
  </div>`;
}

/* ── Caché local de índices (por tipo + mes) ─────────────── */
const KEY_INDICES = 'inmocrm_indices';
function getIndicesCache() { try { return JSON.parse(localStorage.getItem(KEY_INDICES) || '{}'); } catch { return {}; } }
function setIndiceCache(tipo, mes, pct) {
  const c = getIndicesCache();
  c[`${tipo}_${mes}`] = { pct, mes };
  localStorage.setItem(KEY_INDICES, JSON.stringify(c));
}
function getUltimoIndice(tipo) {
  const c = getIndicesCache();
  const mesActual = new Date().toISOString().slice(0, 7);
  // Primero busca el mes actual, luego el más reciente guardado
  const key = `${tipo}_${mesActual}`;
  if (c[key]) return c[key];
  // Busca el más reciente de ese tipo
  const entradas = Object.entries(c)
    .filter(([k]) => k.startsWith(tipo + '_'))
    .sort(([, a], [, b]) => b.mes.localeCompare(a.mes));
  return entradas[0]?.[1] || null;
}

/* ── Modal registrar aumento ────────────────────────────── */
function openAumentoModal(a) {
  const montoActual = a.montoActual ?? a.montoInicial ?? 0;
  const tipo        = a.tipoAjuste || 'otro';
  const pctFijo     = Number(a.porcentajeAjuste) || 0;

  const esFijo   = tipo === 'fijo';
  const esIndice = tipo === 'ICL' || tipo === 'IPC';

  const calcNuevoMonto = (pct, ajuste) =>
    Math.round(montoActual * (1 + (pct + (ajuste || 0)) / 100));

  const montoInicial = esFijo ? calcNuevoMonto(pctFijo, 0) : '';

  const tipoLabels = { ICL: 'ICL (Índice Casa Propia)', IPC: 'IPC (Inflación)', fijo: 'Porcentaje fijo', otro: 'Otro' };

  const linkFuente = tipo === 'IPC'
    ? 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31'
    : 'https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp';

  // Cuántos ajustes de este contrato ya deberían haberse aplicado según la
  // frecuencia pactada (ej: contrato de 12 meses, ajuste c/4 meses → 3 pendientes).
  // El usuario los va aplicando de a uno; este modal se reabre solo hasta ponerlo al día.
  const ajInfo = sel.infoAjuste(a);
  const numeroPeriodo = ajInfo ? ajInfo.applied + 1 : 1;
  const totalPeriodos = ajInfo ? ajInfo.expected : 1;

  openModal({
    title: ajInfo && ajInfo.pendientes > 1 ? `Registrar aumento (período ${numeroPeriodo} de ${totalPeriodos})` : 'Registrar aumento',
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:1.25rem">

        ${ajInfo && ajInfo.pendientes > 1 ? `
        <div style="padding:.75rem 1rem;background:color-mix(in srgb,var(--warning) 12%,transparent);border:1.5px solid var(--warning);border-radius:var(--r-md);font-size:.85rem">
          Este contrato acumula <strong>${ajInfo.pendientes} ajustes sin aplicar</strong> (uno cada ${a.frecuenciaAjuste} meses).
          Corresponde al período que vencía el <strong>${fmtFechaCorta(ajInfo.proxFecha)}</strong>.
          Después de este quedarán <strong>${ajInfo.pendientes - 1}</strong> más por registrar.
        </div>` : ''}

        ${esIndice ? `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <label class="form-label" style="margin:0">% ${tipo} del período</label>
            <a href="${linkFuente}" target="_blank" rel="noopener"
              style="font-size:.75rem;color:var(--primary);text-decoration:none">Ver en ${tipo === 'IPC' ? 'INDEC' : 'BCRA'} →</a>
          </div>
          <div id="indiceStatus" style="font-size:.75rem;margin-bottom:.4rem;min-height:1rem"></div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <input id="pctIndice" class="input" type="number" min="0" step="0.01"
              style="flex:1;font-size:1.3rem;font-weight:700;text-align:center;height:3rem">
            <span style="color:var(--text-soft)">%</span>
          </div>
        </div>` : `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:var(--success-soft);border-radius:var(--r-md)">
          <span style="font-size:.875rem;color:var(--success)">Porcentaje pactado en el contrato</span>
          <span style="font-size:1.05rem;font-weight:800;color:var(--success)">+${pctFijo}%</span>
        </div>`}

        <div>
          <label class="form-label">% extra
            <span style="font-weight:400;color:var(--text-soft)"> — acordado con el inquilino (opcional)</span>
          </label>
          <div style="display:flex;align-items:center;gap:.5rem">
            <input id="pctAdicional" class="input" type="number" step="0.1" value="0"
              style="flex:1;text-align:center;font-size:1.3rem;font-weight:700;height:3rem">
            <span style="color:var(--text-soft)">%</span>
          </div>
        </div>

        <!-- Resultado -->
        <div style="padding:1.1rem 1.25rem;background:var(--surface-2);border-radius:var(--r-md);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.72rem;color:var(--text-soft);margin-bottom:.2rem">Monto actual</div>
            <div style="font-size:1rem;font-weight:600">${fmtMoneda(montoActual, a.moneda)}</div>
          </div>
          <div style="color:var(--text-faint)">→</div>
          <div style="text-align:right">
            <div style="font-size:.72rem;color:var(--text-soft);margin-bottom:.2rem">Nuevo monto</div>
            <div id="nuevoMonto" style="font-size:1.2rem;font-weight:800;color:var(--primary)">${montoInicial ? fmtMoneda(montoInicial, a.moneda) : '—'}</div>
          </div>
        </div>

        <div>
          <label class="form-label">Nota <span style="font-weight:400;color:var(--text-soft)">(opcional)</span></label>
          <input id="notaAumento" class="input" placeholder="Ej: Ajuste ${tipo} junio 2025">
        </div>

      </div>`,

    footerHTML: `
      <button class="btn btn-ghost" data-cancel>Cancelar</button>
      <button class="btn btn-primary" id="btnConfAumento">Confirmar aumento</button>`,

    onMount({ overlay, close }) {
      const $pctIndice    = overlay.querySelector('#pctIndice');
      const $pctAdicional = overlay.querySelector('#pctAdicional');
      const $nuevoMonto   = overlay.querySelector('#nuevoMonto'); // div, no input
      const $status       = overlay.querySelector('#indiceStatus');

      let _montoCalculado = montoInicial || 0;
      let _editoManual = false;

      const recalcular = () => {
        const pctBase  = esIndice ? (parseFloat($pctIndice?.value) || 0) : pctFijo;
        const pctExtra = parseFloat($pctAdicional?.value) || 0;
        const pctTotal = pctBase + pctExtra;
        _montoCalculado = calcNuevoMonto(pctBase, pctExtra);
        if ($nuevoMonto) {
          $nuevoMonto.textContent = pctTotal > 0 ? fmtMoneda(_montoCalculado, a.moneda) : '—';
        }
      };

      // Cargar desde caché local al abrir
      if (esIndice && $pctIndice && $status) {
        const cached = getUltimoIndice(tipo);
        const mesActual = new Date().toISOString().slice(0, 7);
        if (cached) {
          $pctIndice.value = cached.pct;
          const esMesActual = cached.mes === mesActual;
          $status.innerHTML = esMesActual
            ? `<span style="color:var(--success);font-weight:600">✓ Último ${tipo} guardado: ${cached.pct}% (${cached.mes})</span>`
            : `<span style="color:var(--warning)">⚠ Último guardado: ${cached.pct}% (${cached.mes}) — verificá si hay uno nuevo</span>`;
          _editoManual = false;
          recalcular();
        } else {
          $status.innerHTML = `<span style="color:var(--text-soft)">Ingresá el % del ${tipo} y se recordará para la próxima vez.</span>`;
          $pctIndice.focus();
        }
      }

      $pctIndice?.addEventListener('input', recalcular);
      $pctAdicional?.addEventListener('input', recalcular);

      if (esFijo) recalcular();


      overlay.querySelector('[data-cancel]').addEventListener('click', close);

      overlay.querySelector('#btnConfAumento').addEventListener('click', async () => {
        const nota     = overlay.querySelector('#notaAumento').value.trim();
        const pctBase  = esIndice ? (parseFloat($pctIndice?.value) || 0) : pctFijo;
        const pctExtra = parseFloat($pctAdicional?.value) || 0;

        if (_montoCalculado <= 0) {
          if ($pctIndice) { $pctIndice.style.borderColor = 'var(--danger)'; $pctIndice.focus(); }
          return;
        }
        if (_montoCalculado <= montoActual) {
          if (!confirm(`El nuevo monto es igual o menor al actual. ¿Confirmar igual?`)) return;
        }
        if (esIndice && pctBase > 0) {
          setIndiceCache(tipo, new Date().toISOString().slice(0, 7), pctBase);
        }
        const notaAuto = nota || `Ajuste ${tipo} ${pctBase}%${pctExtra ? ` + ${pctExtra}% adicional` : ''}`;
        await actions.registrarAumento(a.id, _montoCalculado, notaAuto);
        close();

        // Si todavía quedan ajustes de períodos anteriores sin aplicar, se
        // reabre el modal automáticamente para el siguiente en vez de darlo por hecho.
        const fresh = getState().alquileres.find(x => x.id === a.id);
        const ajInfoFresh = fresh ? sel.infoAjuste(fresh) : null;
        if (ajInfoFresh && ajInfoFresh.pendientes > 0) {
          toast(`Ajuste registrado · quedan ${ajInfoFresh.pendientes} pendiente${ajInfoFresh.pendientes > 1 ? 's' : ''}`, { tipo: 'warning' });
          setTimeout(() => openAumentoModal(fresh), 250);
        } else {
          toast('Contrato al día con los aumentos');
        }
      });
    },
  });
}

function fila(label, val) {
  if (val === undefined || val === null || val === '' || val === '—') return '';
  return `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.875rem"><span class="text-soft" style="min-width:90px">${label}</span><span>${esc(String(val))}</span></div>`;
}

/* ---- Vista contrato completo (solo lectura) ---- */
function abrirVistaContrato(a, inq, prop) {
  const waInq = (() => { const t = (a.inquilinoTelefono || inq?.telefono || '').replace(/\D/g,''); return t ? `https://wa.me/${t.startsWith('54')?t:'54'+t}` : null; })();
  const waGar = (() => { const t = (a.garanteTelefono || '').replace(/\D/g,''); return t ? `https://wa.me/${t.startsWith('54')?t:'54'+t}` : null; })();

  const seccion = (titulo, html) => `
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">${titulo}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.35rem .75rem">${html}</div>
    </div>`;

  const f = (label, val) => val ? `
    <div style="font-size:.84rem;padding:.3rem 0;border-bottom:1px solid var(--border)">
      <span style="font-size:.7rem;color:var(--text-soft);display:block;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.05rem">${label}</span>
      <span style="font-weight:500">${esc(String(val))}</span>
    </div>` : '';

  const wa = (label, url) => url ? `<a href="${url}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:inline-flex;align-items:center;gap:.35rem;text-decoration:none;margin-top:.5rem">${icon('whatsapp')} ${label}</a>` : '';

  openModal({
    title: `Contrato — ${esc(inq?.nombre || '—')}`,
    size: 'lg',
    bodyHTML: `
      <div style="font-size:.78rem;color:var(--text-soft);margin-bottom:1.25rem;padding:.5rem .75rem;background:var(--surface-2);border-radius:var(--r-sm)">
        Esta vista es de solo lectura. Para modificar el contrato, usá el botón <strong>Editar</strong>.
      </div>

      ${seccion('Propiedad', `
        ${f('Dirección', prop?.direccion)}
        ${f('Ciudad', prop?.ciudad)}
        ${f('Barrio', prop?.barrio)}
        ${f('Tipo', prop?.tipo)}
      `)}

      ${seccion('Condiciones del contrato', `
        ${f('Fecha de firma', a.fechaFirma ? fmtFechaCorta(a.fechaFirma) : null)}
        ${f('Inicio del contrato', fmtFechaCorta(a.fechaInicio))}
        ${f('Vencimiento', fmtFechaCorta(a.fechaFin))}
        ${f('Monto inicial', fmtMoneda(a.montoInicial, a.moneda))}
        ${f('Monto actual', a.montoActual ? fmtMoneda(a.montoActual, a.moneda) : null)}
        ${f('Tipo de ajuste', a.tipoAjuste)}
        ${f('Frecuencia de ajuste', a.frecuenciaAjuste ? `Cada ${a.frecuenciaAjuste} meses` : null)}
        ${f('% de ajuste fijo', a.porcentajeAjuste ? `${a.porcentajeAjuste}%` : null)}
        ${f('Depósito', a.deposito ? fmtMoneda(a.deposito, a.moneda) : null)}
        ${f('Comisión', a.comision ? `${a.comision}%` : null)}
      `)}

      <div style="margin-bottom:1.25rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">Inquilino</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.35rem .75rem">
          ${f('Nombre', inq?.nombre)}
          ${f('Teléfono / WhatsApp', a.inquilinoTelefono || inq?.telefono)}
          ${f('DNI / CUIT', a.inquilinoDni)}
          ${f('Domicilio', a.inquilinoDomicilio)}
          ${f('Email', inq?.email)}
        </div>
        ${wa('WhatsApp inquilino', waInq)}
      </div>

      ${(a.garante || a.garanteDni || a.garanteTelefono) ? `
      <div style="margin-bottom:1.25rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">Garante</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.35rem .75rem">
          ${f('Nombre', a.garante)}
          ${f('DNI / CUIT', a.garanteDni)}
          ${f('Teléfono / WhatsApp', a.garanteTelefono)}
          ${f('Email', a.garanteEmail)}
          ${f('Domicilio', a.garanteDomicilio)}
          ${f('Relación con inquilino', a.garanteRelacion)}
          ${f('Propiedad en garantía', a.garantePropiedad)}
        </div>
        ${wa('WhatsApp garante', waGar)}
      </div>` : ''}

      ${a.notas ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--primary);border-bottom:2px solid var(--primary);padding-bottom:.3rem;margin-bottom:.65rem">Notas</div>
        <div style="font-size:.85rem;white-space:pre-wrap">${esc(a.notas)}</div>
      </div>` : ''}`,
    footerHTML: `
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${waInq ? `<a href="${waInq}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.35rem;text-decoration:none">${icon('whatsapp')} Inquilino</a>` : ''}
        ${waGar ? `<a href="${waGar}" target="_blank" class="btn btn-sm" style="background:#25D366;color:#fff;display:flex;align-items:center;gap:.35rem;text-decoration:none">${icon('whatsapp')} Garante</a>` : ''}
      </div>
      <button class="btn btn-ghost" data-close>Cerrar</button>`,
    onMount({ overlay, close }) {
      overlay.querySelector('[data-close]')?.addEventListener('click', close);
    },
  });
}

function filaInline(label, val) {
  if (val === undefined || val === null || val === '' || val === '—') return '';
  return `<div style="padding:.3rem 0;font-size:.85rem;border-bottom:1px solid var(--border)">
    <span style="color:var(--text-soft);font-size:.73rem;display:block;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.1rem">${label}</span>
    <span style="font-weight:500">${esc(String(val))}</span>
  </div>`;
}

function mesLabel(mes) {
  const [y, m] = mes.split('-');
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${nombres[+m-1]} ${y}`;
}
