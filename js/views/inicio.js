/* ============================================================
   VISTA · Inicio
   ============================================================ */
import { getState, sel, subscribe } from '../store.js';
import { icon } from '../config.js';
import { esc, fmtMoneda, fmtFechaCorta, relativo } from '../lib.js';
import { navegar } from '../router.js';

export default function inicio(root) {
  root.innerHTML = `<div class="view" id="vInicio"></div>`;
  const render = () => pintarInicio(root.querySelector('#vInicio'));
  render();
  const unsub = subscribe(render);
  return unsub;
}

function pintarInicio(el) {
  const { clientes, alquileres, ventas, agenda } = getState();
  const k = sel.kpis();
  const paraAjuste  = sel.contratosParaAjuste().slice(0, 6);
  const proxVenc    = sel.proxVencimientos().slice(0, 5);
  const eventosHoy  = sel.eventosHoy();
  const eventosPrx  = sel.eventosPendientes().slice(0, 6);

  // Cobros impagos del mes
  const cobrosImpagos = alquileres
    .flatMap(a => sel.cobrosImpagosMes(a).map(c => ({ ...c, alq: a })))
    .slice(0, 5);

  const { propiedades } = getState();
  const propsDisponibles = propiedades.filter(p => p.estado === 'disponible').length;

  el.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Panel</h1>
        <p class="view-sub">${fmtFechaCorta(new Date().toISOString())}</p>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid" style="margin-bottom:2rem">
      ${kpi('users',    'Clientes',           k.totalClientes,     'clientes')}
      ${kpi('key',      'Alquileres activos', k.alquileresActivos, 'alquileres', 'var(--info-soft)',    'var(--info)')}
      ${kpi('home',      'Propiedades libres', propsDisponibles,    'propiedades','var(--success-soft)', 'var(--success)')}
      ${kpi('calendar', 'Eventos hoy',        k.eventosHoy,        'agenda',     'var(--warning-soft)', 'var(--warning)')}
    </div>

    <div class="two-col-grid">

      <!-- Contratos por aumentar -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">📈</span>
            Contratos por aumentar
            ${k.paraAjuste ? `<span class="badge badge-danger" style="font-size:.68rem">${k.paraAjuste}</span>` : ''}
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerAjustes">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">
          ${paraAjuste.length ? paraAjuste.map(({ alq, dias }) => {
            const inq  = clientes.find(c => c.id === alq.inquilinoId);
            const prop = sel.dirPropiedad(alq.propiedadId);
            const vencido = dias < 0;
            const urgente = vencido || dias <= 7;
            const label = vencido
              ? `Hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
              : dias === 0 ? 'Hoy'
              : `En ${dias} día${dias !== 1 ? 's' : ''}`;
            return `
            <div class="list-row list-row-hover" data-alq="${alq.id}" style="padding:.7rem 1rem">
              <div class="list-info">
                <div class="list-name" style="font-size:.875rem">${esc(inq?.nombre || '—')}</div>
                <div class="text-xs text-soft truncate" style="margin-top:.1rem">${esc(prop)}</div>
              </div>
              <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);
                background:${urgente ? 'var(--danger-soft)' : 'var(--warning-soft)'};
                color:${urgente ? 'var(--danger)' : 'var(--warning)'};white-space:nowrap">${label}</span>
            </div>`;
          }).join('') : `<div class="empty-sm">Sin contratos pendientes de ajuste</div>`}
        </div>
      </div>

      <!-- Próximos vencimientos -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">⏳</span>
            Contratos por vencer
            ${k.proxVencimientos ? `<span class="badge badge-warning" style="font-size:.68rem">${k.proxVencimientos}</span>` : ''}
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerAlq">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">
          ${proxVenc.length ? proxVenc.map(({ alq, dias }) => {
            const inq  = clientes.find(c => c.id === alq.inquilinoId);
            const prop = sel.dirPropiedad(alq.propiedadId);
            const urgente = dias <= 30;
            return `
              <div class="list-row list-row-hover" data-alq="${alq.id}" style="padding:.7rem 1rem">
                <div class="list-info">
                  <div class="list-name" style="font-size:.875rem">${esc(inq?.nombre || '—')}</div>
                  <div class="text-xs text-soft truncate" style="margin-top:.1rem">${esc(prop)}</div>
                </div>
                <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);
                  background:${urgente ? 'var(--danger-soft)' : 'var(--warning-soft)'};
                  color:${urgente ? 'var(--danger)' : 'var(--warning)'}">${dias}d</span>
              </div>`;
          }).join('') : `<div class="empty-sm">Sin vencimientos próximos</div>`}
        </div>
      </div>

      <!-- Cobros pendientes -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">💰</span>
            Cobros pendientes
            ${k.cobrosVencidos ? `<span class="badge badge-danger" style="font-size:.68rem">${k.cobrosVencidos}</span>` : ''}
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerCobros">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">
          ${cobrosImpagos.length ? cobrosImpagos.map(c => {
            const inq = clientes.find(x => x.id === c.alq.inquilinoId);
            return `
              <div class="list-row list-row-hover" data-alq="${c.alq.id}" style="padding:.7rem 1rem">
                <div class="list-info">
                  <div class="list-name" style="font-size:.875rem">${esc(inq?.nombre || '—')}</div>
                  <div class="text-xs text-soft" style="margin-top:.1rem">${c.mes} · ${fmtMoneda(c.monto, c.alq.moneda)}</div>
                </div>
                <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);background:var(--danger-soft);color:var(--danger)">Pendiente</span>
              </div>`;
          }).join('') : `<div class="empty-sm">Sin cobros pendientes este mes</div>`}
        </div>
      </div>

      <!-- Agenda -->
      <div class="card">
        <div class="card-head">
          <h3 style="display:flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600">
            <span style="font-size:.8rem;line-height:1">🗓</span>
            Próximos eventos
          </h3>
          <button class="btn btn-xs btn-ghost" id="btnVerAgenda">Ver agenda</button>
        </div>
        <div class="card-body" style="padding:0">
          ${eventosPrx.length ? eventosPrx.map(e => {
            const cli = clientes.find(c => c.id === e.clienteId);
            return `
              <div class="list-row" style="padding:.7rem 1rem">
                <div class="list-info">
                  <div class="list-name" style="font-size:.875rem">${esc(e.titulo)}</div>
                  <div class="text-xs text-soft" style="margin-top:.1rem">${fmtFechaCorta(e.fecha)}${e.hora ? ' · ' + e.hora : ''}${cli ? ' · ' + esc(cli.nombre) : ''}</div>
                </div>
                <span style="font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:var(--r-full);background:var(--info-soft);color:var(--info);white-space:nowrap">${relativo(e.fecha)}</span>
              </div>`;
          }).join('') : `<div class="empty-sm">Sin eventos próximos</div>`}
        </div>
      </div>

    </div>`;

  el.querySelector('#btnVerAjustes')?.addEventListener('click', () => navegar('alquileres'));
  el.querySelector('#btnVerAlq')?.addEventListener('click',     () => navegar('alquileres'));
  el.querySelector('#btnVerCobros')?.addEventListener('click',  () => navegar('alquileres'));
  el.querySelector('#btnVerAgenda')?.addEventListener('click',  () => navegar('agenda'));
  el.querySelectorAll('[data-alq]').forEach(r => r.addEventListener('click', () => navegar('alquileres')));
}

function kpi(ico, label, val, ruta, accent = 'var(--brand-100)', accentColor = 'var(--brand-600)') {
  return `
    <div class="kpi" data-ruta="${ruta}" style="cursor:pointer;--kpi-accent:${accentColor};--kpi-accent-soft:${accent}">
      <div class="kpi-top">
        <span class="kpi-label">${label}</span>
        <span class="kpi-icon">${icon(ico)}</span>
      </div>
      <div class="kpi-value">${val}</div>
    </div>`;
}

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-ruta]');
  if (card?.dataset.ruta) navegar(card.dataset.ruta);
});
