/* ============================================================
   FORMS — Modales de alta/edición
   ============================================================ */
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { actions, getState } from '../store.js';
import { $, esc } from '../lib.js';
import {
  TIPOS_CLIENTE, TIPOS_PROPIEDAD, TIPOS_OPERACION, MONEDAS,
  ORIGENES, TIPOS_AJUSTE, FRECUENCIAS_AJUSTE, PROP_ESTADOS,
  VENTA_ESTADOS, TIPOS_EVENTO, icon
} from '../config.js';

const opts = (arr, sel) => arr.map(o => {
  const v = typeof o === 'object' ? o.id : o;
  const l = typeof o === 'object' ? o.label : o;
  return `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${l}</option>`;
}).join('');

const clientesOpts = (sel) => getState().clientes
  .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

const propietariosOpts = (sel) => (getState().propietarios || [])
  .map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');

const propsOpts = (sel) => getState().propiedades
  .map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.direccion || p.id)}</option>`).join('');

// IDs de propiedades con alquiler activo (no rescindido, no vencido)
function propiedadesAlquiladasActivas(excluirAlqId = null) {
  const { alquileres } = getState();
  const hoy = new Date().toISOString().slice(0, 10);
  const ids = new Set();
  alquileres.forEach(a => {
    if (excluirAlqId && a.id === excluirAlqId) return; // edición del mismo contrato
    if (a.estado === 'rescindido') return;
    if (a.fechaFin && a.fechaFin < hoy) return; // ya venció
    if (a.propiedadId) ids.add(a.propiedadId);
  });
  return ids;
}

// Propiedades filtradas por propietario y tipo de operación
function propsDeOpts(propietarioId, operacion, selId, excluirAlqId = null) {
  const { propiedades } = getState();
  const yaAlquiladas = propiedadesAlquiladasActivas(excluirAlqId);

  const lista = propietarioId
    ? propiedades.filter(p => {
        if (p.propietarioId !== propietarioId) return false;
        if (operacion === 'alquiler') return ['disponible', 'alquilada'].includes(p.estado);
        if (operacion === 'venta')    return ['disponible', 'reservada'].includes(p.estado);
        return true;
      })
    : [];
  if (!lista.length) return '<option value="" disabled>— Primero seleccioná un propietario —</option>';
  return `<option value="">— Seleccionar propiedad —</option>` +
    lista.map(p => {
      const ocupada = operacion === 'alquiler' && yaAlquiladas.has(p.id) && p.id !== selId;
      return `<option value="${p.id}" ${p.id === selId ? 'selected' : ''} ${ocupada ? 'disabled' : ''}>
        ${esc(p.direccion || p.tipo || p.id)}${ocupada ? ' — YA ALQUILADA' : p.estado !== 'disponible' ? ` (${p.estado})` : ''}
      </option>`;
    }).join('');
}

function btnInteresStyle(activo) {
  return activo
    ? 'padding:.5rem 1rem;border-radius:var(--radius-sm);border:2px solid var(--primary);background:var(--primary-soft);color:var(--primary);font-weight:600;cursor:pointer;font-size:.875rem'
    : 'padding:.5rem 1rem;border-radius:var(--radius-sm);border:2px solid var(--border);background:var(--bg-card);color:var(--text-soft);cursor:pointer;font-size:.875rem';
}

/* ============================================================
   CLIENTE
   ============================================================ */
export function openClienteForm(cli = null, onDone) {
  const ed = !!cli; cli = cli || {};
  const interes = cli.interes || 'alquiler';
  const b = cli.busca || {};

  openModal({
    title: ed ? 'Editar cliente' : 'Nuevo cliente', size: 'lg',
    bodyHTML: `
      <form id="cliForm">
        <h3 class="form-section-title">Datos de contacto</h3>
        <div class="form-grid">
          <div class="form-group full"><label>Nombre y apellido <span class="req">*</span></label>
            <input name="nombre" required value="${esc(cli.nombre||'')}" placeholder="Ej. María González" autofocus></div>
          <div class="form-group"><label>DNI</label>
            <input name="dni" value="${esc(cli.dni||'')}" placeholder="Ej. 30123456"></div>
          <div class="form-group"><label>Teléfono / WhatsApp</label>
            <input name="telefono" value="${esc(cli.telefono||'')}" placeholder="351 ..."></div>
          <div class="form-group"><label>Email</label>
            <input name="email" type="email" value="${esc(cli.email||'')}"></div>
          <div class="form-group"><label>Domicilio</label>
            <input name="domicilio" value="${esc(cli.domicilio||'')}" placeholder="Ej. San Martín 123, Metán"></div>
          <div class="form-group"><label>Origen de consulta</label>
            <select name="origen"><option value="">— Seleccionar —</option>${opts(ORIGENES, cli.origen)}</select></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">¿Qué está buscando?</h3>
        <div style="display:flex;gap:.75rem;margin-bottom:1.5rem;flex-wrap:wrap">
          <button type="button" class="interes-btn" data-interes="alquiler" style="${btnInteresStyle(interes==='alquiler')}">🔑 Alquilar</button>
          <button type="button" class="interes-btn" data-interes="compra"   style="${btnInteresStyle(interes==='compra')}">🏠 Comprar</button>
          <button type="button" class="interes-btn" data-interes="otro"     style="${btnInteresStyle(interes==='otro')}">💬 Otro / No sé</button>
        </div>
        <input type="hidden" name="interes" value="${interes}">

        <!-- ALQUILER -->
        <div id="secAlquiler" style="display:${interes==='alquiler'?'block':'none'}">
          <p class="text-xs text-soft" style="margin:-1rem 0 1rem">Completá lo que te dijo. Mejora las sugerencias automáticas.</p>
          <div class="form-grid">
            <div class="form-group"><label>Tipo de propiedad</label>
              <select name="b_tipo"><option value="">— No especificó —</option>${opts(TIPOS_PROPIEDAD, b.tipo)}</select></div>
            <div class="form-group"><label>Pueblo o ciudad</label>
              <input name="b_zona" value="${esc(b.zona||'')}" placeholder="Ej. Güemes, Metán..."></div>
            <div class="form-group"><label>Ambientes mínimo</label>
              <input name="b_ambientes" type="number" min="1" max="10" value="${b.ambientes||''}" placeholder="Ej. 2"></div>
            <div class="form-group"><label>Presupuesto por mes</label>
              <input name="b_presupuesto" type="number" min="0" value="${b.presupuesto||''}" placeholder="0"></div>
            <div class="form-group"><label>Moneda</label>
              <select name="b_moneda">${opts(MONEDAS, b.moneda||'ARS')}</select></div>
            <div class="form-group"><label>¿Tiene mascotas?</label>
              <select name="b_mascota">
                <option value="">No lo sé</option>
                <option value="si" ${b.mascota==='si'?'selected':''}>Sí tiene</option>
                <option value="no" ${b.mascota==='no'?'selected':''}>No tiene</option>
              </select></div>
            <div class="form-group"><label>¿Necesita cochera?</label>
              <select name="b_cochera">
                <option value="">No lo sé</option>
                <option value="si" ${b.cochera==='si'?'selected':''}>Sí</option>
                <option value="no" ${b.cochera==='no'?'selected':''}>No</option>
              </select></div>
            <div class="form-group"><label>¿Planta baja?</label>
              <select name="b_plantabaja">
                <option value="">No importa</option>
                <option value="si" ${b.plantabaja==='si'?'selected':''}>Sí, prefiere PB</option>
              </select></div>
            <div class="form-group full"><label>Otras preferencias</label>
              <input name="b_extras" value="${esc(b.extras||'')}" placeholder="Ej. balcón, luminoso, amueblado..."></div>
          </div>
        </div>

        <!-- COMPRA -->
        <div id="secCompra" style="display:${interes==='compra'?'block':'none'}">
          <p class="text-xs text-soft" style="margin:-1rem 0 1rem">Completá lo que te dijo. Mejora las sugerencias automáticas.</p>
          <div class="form-grid">
            <div class="form-group"><label>Tipo de propiedad</label>
              <select name="c_tipo"><option value="">— No especificó —</option>${opts(TIPOS_PROPIEDAD, b.tipo)}</select></div>
            <div class="form-group"><label>Pueblo o ciudad</label>
              <input name="c_zona" value="${esc(b.zona||'')}" placeholder="Ej. Güemes, Metán..."></div>
            <div class="form-group"><label>Ambientes mínimo</label>
              <input name="c_ambientes" type="number" min="1" max="10" value="${b.ambientes||''}" placeholder="Ej. 3"></div>
            <div class="form-group"><label>Presupuesto</label>
              <input name="c_presupuesto" type="number" min="0" value="${b.presupuesto||''}" placeholder="0"></div>
            <div class="form-group"><label>Moneda</label>
              <select name="c_moneda">${opts(MONEDAS, b.moneda||'USD')}</select></div>
            <div class="form-group"><label>Superficie mínima (m²)</label>
              <input name="c_m2" type="number" min="0" value="${b.m2||''}" placeholder="Ej. 60"></div>
            <div class="form-group"><label>¿Necesita cochera?</label>
              <select name="c_cochera">
                <option value="">No lo sé</option>
                <option value="si" ${b.cochera==='si'?'selected':''}>Sí</option>
                <option value="no" ${b.cochera==='no'?'selected':''}>No</option>
              </select></div>
            <div class="form-group"><label>¿Uso propio o inversión?</label>
              <select name="c_uso">
                <option value="">No lo sé</option>
                <option value="propio"   ${b.uso==='propio'?'selected':''}>Uso propio</option>
                <option value="inversion"${b.uso==='inversion'?'selected':''}>Inversión</option>
              </select></div>
            <div class="form-group full"><label>Otras preferencias</label>
              <input name="c_extras" value="${esc(b.extras||'')}" placeholder="Ej. jardín, barrio privado, luminoso..."></div>
          </div>
        </div>

        <!-- OTRO -->
        <div id="secOtro" style="display:${interes==='otro'?'block':'none'}">
          <div class="form-group full" style="margin-top:.5rem"><label>Descripción / motivo de consulta</label>
            <textarea name="o_extras" rows="3" placeholder="Contá brevemente qué necesita o por qué consultó...">${esc(b.extras||'')}</textarea></div>
        </div>

      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveCli">${ed ? 'Guardar cambios' : 'Crear cliente'}</button>`,
    onMount(ctx) {
      const secMap = { alquiler: '#secAlquiler', compra: '#secCompra', otro: '#secOtro' };
      ctx.overlay.querySelectorAll('.interes-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.interes;
          ctx.overlay.querySelector('[name="interes"]').value = val;
          ctx.overlay.querySelectorAll('.interes-btn').forEach(b => { b.style.cssText = btnInteresStyle(b.dataset.interes === val); });
          Object.values(secMap).forEach(sel => { const el = ctx.overlay.querySelector(sel); if (el) el.style.display = 'none'; });
          const sec = ctx.overlay.querySelector(secMap[val]);
          if (sec) sec.style.display = 'block';
        });
      });

      $('#saveCli', ctx.overlay).addEventListener('click', async () => {
        const f = $('#cliForm', ctx.overlay);
        if (!f.nombre.value.trim()) { f.nombre.focus(); toast('El nombre es obligatorio', { tipo: 'warning' }); return; }
        const fd = new FormData(f);
        const interesVal = fd.get('interes');

        let buscaData = {};
        if (interesVal === 'alquiler') {
          buscaData = {
            tipo: fd.get('b_tipo') || null, zona: fd.get('b_zona') || null,
            ambientes: fd.get('b_ambientes') ? Number(fd.get('b_ambientes')) : null,
            presupuesto: fd.get('b_presupuesto') ? Number(fd.get('b_presupuesto')) : null,
            moneda: fd.get('b_moneda'),
            mascota: fd.get('b_mascota') || null, cochera: fd.get('b_cochera') || null,
            plantabaja: fd.get('b_plantabaja') || null, extras: fd.get('b_extras') || null,
          };
        } else if (interesVal === 'compra') {
          buscaData = {
            tipo: fd.get('c_tipo') || null, zona: fd.get('c_zona') || null,
            ambientes: fd.get('c_ambientes') ? Number(fd.get('c_ambientes')) : null,
            presupuesto: fd.get('c_presupuesto') ? Number(fd.get('c_presupuesto')) : null,
            moneda: fd.get('c_moneda'),
            m2: fd.get('c_m2') ? Number(fd.get('c_m2')) : null,
            cochera: fd.get('c_cochera') || null, uso: fd.get('c_uso') || null,
            extras: fd.get('c_extras') || null,
          };
        } else {
          buscaData = { extras: fd.get('o_extras') || null };
        }

        const data = {
          nombre: fd.get('nombre').trim(),
          dni: fd.get('dni') || null,
          telefono: fd.get('telefono'),
          email: fd.get('email'),
          domicilio: fd.get('domicilio') || null,
          origen: fd.get('origen'),
          interes: interesVal,
          busca: buscaData,
          tipos: interesVal === 'alquiler' ? ['inquilino'] : interesVal === 'compra' ? ['comprador'] : [],
        };
        if (ed) { await actions.updateCliente(cli.id, data); toast('Cliente actualizado'); }
        else { await actions.createCliente(data); toast('Cliente creado correctamente'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   PROPIETARIO (cliente con propiedad)
   ============================================================ */
export function openPropietarioForm(prop = null, onDone) {
  const ed = !!prop; prop = prop || {};
  openModal({
    title: ed ? 'Editar propietario' : 'Nuevo propietario', size: 'lg',
    bodyHTML: `
      <form id="propOwnerForm" class="form-grid">
        <div class="form-group full"><label>Nombre y apellido <span class="req">*</span></label>
          <input name="nombre" required value="${esc(prop.nombre||'')}" placeholder="Ej. Carlos Rodríguez" autofocus></div>
        <div class="form-group"><label>Teléfono / WhatsApp</label>
          <input name="telefono" value="${esc(prop.telefono||'')}" placeholder="351 ..."></div>
        <div class="form-group"><label>Email</label>
          <input name="email" type="email" value="${esc(prop.email||'')}"></div>
        <div class="form-group"><label>DNI</label>
          <input name="dni" value="${esc(prop.dni||'')}"></div>
        <div class="form-group"><label>Origen de contacto</label>
          <select name="origen"><option value="">— Seleccionar —</option>${opts(ORIGENES, prop.origen)}</select></div>
        <div class="form-group full">
          <label>¿Qué quiere hacer con su propiedad? <span class="req">*</span></label>
          <select name="objetivo" required>
            <option value="">— Seleccionar —</option>
            <option value="alquilar" ${prop.objetivo==='alquilar'?'selected':''}>Quiere alquilar</option>
            <option value="vender"   ${prop.objetivo==='vender'?'selected':''}>Quiere vender</option>
            <option value="ambas"    ${prop.objetivo==='ambas'?'selected':''}>Alquilar y/o vender</option>
          </select>
        </div>
        <div class="form-group full"><label>Notas</label>
          <textarea name="notas" rows="2" placeholder="Observaciones importantes sobre el propietario...">${esc(prop.notas||'')}</textarea></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="savePropOwner">${ed?'Guardar cambios':'Crear propietario'}</button>`,
    onMount(ctx) {
      ctx.overlay.querySelector('#savePropOwner').addEventListener('click', async () => {
        const f = ctx.overlay.querySelector('#propOwnerForm');
        if (!f.nombre.value.trim()) { f.nombre.focus(); toast('El nombre es obligatorio', { tipo: 'warning' }); return; }
        if (!f.objetivo.value) { toast('Indicá qué quiere hacer con su propiedad', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        if (ed) { await actions.updatePropietario(prop.id, data); toast('Propietario actualizado'); }
        else { await actions.createPropietario(data); toast('Propietario creado correctamente'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

export function openSeguimientoPropietarioForm(propietarioId, onDone) {
  const p = (getState().propietarios || []).find(x => x.id === propietarioId);
  openModal({
    title: `Registrar contacto — ${p?.nombre || ''}`,
    bodyHTML: `
      <form id="segPropForm" class="form-grid">
        <div class="form-group full">
          <label>¿Qué se habló / acordó? <span class="req">*</span></label>
          <textarea id="segPropNota" name="nota" rows="4" placeholder="Ej. Llamó para consultar novedades sobre su propiedad..."></textarea>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveSegProp">Guardar</button>`,
    onMount(ctx) {
      ctx.overlay.querySelector('#segPropNota')?.focus();
      ctx.overlay.querySelector('#saveSegProp').addEventListener('click', async () => {
        const nota = ctx.overlay.querySelector('#segPropNota').value.trim();
        if (!nota) { toast('Escribí una nota', { tipo: 'warning' }); return; }
        await actions.addSeguimientoPropietario(propietarioId, nota);
        toast('Contacto registrado'); ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   SEGUIMIENTO
   ============================================================ */
export function openSeguimientoForm(clienteId, onDone) {
  const cli = getState().clientes.find(c => c.id === clienteId);
  openModal({
    title: `Registrar contacto — ${cli?.nombre || ''}`,
    bodyHTML: `
      <form id="segForm" class="form-grid">
        <div class="form-group full">
          <label>¿Qué se habló / acordó? <span class="req">*</span></label>
          <textarea id="segNota" name="nota" rows="4" placeholder="Ej. Llamada de seguimiento. Está interesado en la propiedad de X, pide visita para el jueves."></textarea>
        </div>
        <div class="form-group full">
          <label>Próximo contacto</label>
          <input name="proximoContacto" type="date">
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveSeg">Guardar</button>`,
    onMount(ctx) {
      ctx.overlay.querySelector('#segNota')?.focus();
      ctx.overlay.querySelector('#saveSeg').addEventListener('click', async () => {
        const f = ctx.overlay.querySelector('#segForm');
        const nota = f.nota.value.trim();
        if (!nota) { toast('Escribí una nota', { tipo: 'warning' }); return; }
        const prox = f.proximoContacto.value || null;
        await actions.addSeguimiento(clienteId, nota);
        if (prox) await actions.updateCliente(clienteId, { proximoContacto: prox });
        toast('Contacto registrado'); ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   PROPIEDAD
   ============================================================ */
export function openPropForm(prop = null, onDone) {
  const ed = !!prop; prop = prop || {};
  const propietarios = getState().propietarios || [];

  // Checkboxes de amenities
  const AMENITIES = [
    'Cochera', 'Jardín', 'Piscina', 'Balcón', 'Terraza', 'Quincho',
    'Amueblado', 'Calefacción central', 'Aire acondicionado', 'Gas natural',
    'Agua corriente', 'Cloacas', 'Seguridad / alarma', 'Apto mascotas',
  ];
  const amenSet = new Set((prop.amenities || []));
  const amenHTML = AMENITIES.map(a => `
    <label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer">
      <input type="checkbox" name="amenity" value="${a}" ${amenSet.has(a)?'checked':''}> ${a}
    </label>`).join('');

  // Fotos guardadas
  const fotosGuardadas = prop.fotos || [];

  openModal({
    title: ed ? 'Editar propiedad' : 'Nueva propiedad', size: 'lg',
    bodyHTML: `
      <form id="propForm">

        <h3 class="form-section-title">Propietario</h3>
        <div class="form-group" style="position:relative">
          <label>Propietario <span class="req">*</span></label>
          <input id="propOwnerSearch" autocomplete="off" placeholder="Escribí el nombre..." value="${esc(propietarios.find(p=>p.id===prop.propietarioId)?.nombre||'')}"
            style="width:100%">
          <input type="hidden" name="propietarioId" value="${esc(prop.propietarioId||'')}">
          <div id="propOwnerDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-md);z-index:50;max-height:200px;overflow-y:auto"></div>
          <small class="text-xs text-soft" style="margin-top:.3rem;display:block">Si no está, primero crealo en "Clientes con propiedades"</small>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Ubicación</h3>
        <div class="form-grid">
          <div class="form-group full"><label>Dirección <span class="req">*</span></label>
            <input name="direccion" required value="${esc(prop.direccion||'')}" placeholder="Ej. Belgrano 450"></div>
          <div class="form-group"><label>Pueblo / Ciudad</label>
            <input name="ciudad" value="${esc(prop.ciudad||'')}" placeholder="Ej. Güemes"></div>
          <div class="form-group"><label>Provincia</label>
            <input name="provincia" value="${esc(prop.provincia||'')}" placeholder="Ej. Salta"></div>
          <div class="form-group full"><label>Link de Google Maps</label>
            <input name="mapsUrl" value="${esc(prop.mapsUrl||'')}" placeholder="Pegá acá la URL de Google Maps de la ubicación">
            <small class="text-xs text-soft" style="margin-top:.3rem;display:block">Se usa para mostrar el mapa en la ficha de la propiedad en el sitio web.</small></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Datos de la propiedad</h3>
        <div class="form-grid">
          <div class="form-group"><label>Tipo</label>
            <select name="tipo">${opts(TIPOS_PROPIEDAD, prop.tipo)}</select></div>
          <div class="form-group"><label>Estado</label>
            <select name="estado">${opts(PROP_ESTADOS, prop.estado||'disponible')}</select></div>
          <div class="form-group"><label>Ambientes</label>
            <input name="ambientes" type="number" min="0" value="${prop.ambientes||''}" placeholder="Ej. 3"></div>
          <div class="form-group"><label>Baños</label>
            <input name="banos" type="number" min="0" value="${prop.banos||''}" placeholder="Ej. 1"></div>
          <div class="form-group"><label>Superficie total (m²)</label>
            <input name="m2" type="number" min="0" value="${prop.m2||''}" placeholder="Ej. 80"></div>
          <div class="form-group"><label>Superficie cubierta (m²)</label>
            <input name="m2Cubiertos" type="number" min="0" value="${prop.m2Cubiertos||''}" placeholder="Ej. 65"></div>
          <div class="form-group"><label>Antigüedad (años)</label>
            <input name="antiguedad" type="number" min="0" value="${prop.antiguedad||''}" placeholder="Ej. 10"></div>
          <div class="form-group"><label>Orientación</label>
            <select name="orientacion">
              <option value="">— No especificada —</option>
              ${['Norte','Sur','Este','Oeste','Noreste','Noroeste','Sureste','Suroeste'].map(o=>`<option value="${o}" ${prop.orientacion===o?'selected':''}>${o}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Pisos del edificio</label>
            <input name="pisosEdificio" type="number" min="0" value="${prop.pisosEdificio||''}" placeholder="(si aplica)"></div>
          <div class="form-group"><label>Piso de la unidad</label>
            <input name="pisoUnidad" value="${esc(prop.pisoUnidad||'')}" placeholder="Ej. 2° B"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">¿Qué operaciones quieres hacer con esta propiedad?</h3>
        <div style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:1rem;background:var(--surface-2);padding:1rem;border-radius:var(--r-md);border:1px solid var(--border)">
          <label style="display:flex;align-items:center;gap:.8rem;cursor:pointer;font-size:.92rem;font-weight:500">
            <input type="checkbox" name="habilitadaAlquiler" value="1" ${prop.habilitadaAlquiler!==false?'checked':''} style="width:18px;height:18px;cursor:pointer">
            <span>
              <div style="font-weight:600;color:var(--text)">🔑 Alquilar por mes</div>
              <small style="color:var(--text-soft);display:block;margin-top:.15rem">Alquileres a largo plazo</small>
            </span>
          </label>
          <label style="display:flex;align-items:center;gap:.8rem;cursor:pointer;font-size:.92rem;font-weight:500">
            <input type="checkbox" name="habilitadaTemporal" value="1" ${prop.habilitadaTemporal?'checked':''} style="width:18px;height:18px;cursor:pointer">
            <span>
              <div style="font-weight:600;color:var(--text)">🏖️ Alquiler temporal</div>
              <small style="color:var(--text-soft);display:block;margin-top:.15rem">Alquileres por noche/semana</small>
            </span>
          </label>
          <label style="display:flex;align-items:center;gap:.8rem;cursor:pointer;font-size:.92rem;font-weight:500">
            <input type="checkbox" name="habilitadaVenta" value="1" ${prop.habilitadaVenta?'checked':''} style="width:18px;height:18px;cursor:pointer">
            <span>
              <div style="font-weight:600;color:var(--text)">🏠 Vender</div>
              <small style="color:var(--text-soft);display:block;margin-top:.15rem">Venta de la propiedad</small>
            </span>
          </label>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Precios</h3>
        <div class="form-grid">
          <div class="form-group"><label>Precio de alquiler</label>
            <input name="precioAlquiler" type="number" min="0" value="${prop.precioAlquiler||''}"></div>
          <div class="form-group"><label>Moneda alquiler</label>
            <select name="monedaAlquiler">${opts(MONEDAS, prop.monedaAlquiler||'ARS')}</select></div>
          <div class="form-group"><label>Precio de venta</label>
            <input name="precioVenta" type="number" min="0" value="${prop.precioVenta||''}"></div>
          <div class="form-group"><label>Moneda venta</label>
            <select name="monedaVenta">${opts(MONEDAS, prop.monedaVenta||'USD')}</select></div>
          <div class="form-group"><label>Expensas / mes</label>
            <input name="expensas" type="number" min="0" value="${prop.expensas||''}" placeholder="0"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Descripción para el sitio web</h3>
        <div class="form-group">
          <textarea name="descripcion" rows="4"
            placeholder="Descripción completa de la propiedad para publicar en el sitio web. Mencioná los puntos fuertes, el entorno, el estado de la propiedad...">${esc(prop.descripcion||'')}</textarea>
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Comodidades</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.5rem .75rem;margin-bottom:.5rem">
          ${amenHTML}
        </div>

        <h3 class="form-section-title" style="margin-top:1.5rem">Fotos</h3>
        <div id="fotosPreview" style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem"></div>
        <label style="display:inline-flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.82rem;color:var(--primary);border:1.5px dashed var(--primary);padding:.5rem .9rem;border-radius:var(--r-md)">
          + Agregar fotos
          <input id="inputFotos" type="file" accept="image/*" multiple style="display:none">
        </label>
        <input type="hidden" name="fotosJSON" value="${esc(JSON.stringify(fotosGuardadas))}">
        <p class="text-xs text-soft" style="margin-top:.4rem">Las fotos se suben automáticamente al sitio web. La primera (marcada como "Portada") es la que se muestra como foto principal.</p>

        <h3 class="form-section-title" style="margin-top:1.5rem">Sitio web</h3>
        <label style="display:flex;align-items:center;gap:.6rem;cursor:pointer;font-size:.9rem">
          <input type="checkbox" name="publicadoWeb" value="1" ${prop.publicadoWeb!==false?'checked':''} style="width:16px;height:16px">
          Publicar esta propiedad en el sitio web
        </label>
        <p class="text-xs text-soft" style="margin-top:.3rem">Se oculta sola del sitio cuando el estado pasa a "Vendida" o "Alquilada".</p>

      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveProp">${ed?'Guardar cambios':'Crear propiedad'}</button>`,
    onMount(ctx) {
      // Buscador de propietario
      const searchInput  = ctx.overlay.querySelector('#propOwnerSearch');
      const hiddenId     = ctx.overlay.querySelector('[name="propietarioId"]');
      const dropdown     = ctx.overlay.querySelector('#propOwnerDropdown');

      const renderDrop = (query) => {
        const q = query.toLowerCase().trim();
        const matches = propietarios.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 8);
        if (!matches.length || !q) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = matches.map(p => `
          <div data-id="${p.id}" style="padding:.55rem .9rem;cursor:pointer;font-size:.875rem;border-bottom:1px solid var(--border)" class="prop-owner-opt">
            ${esc(p.nombre)}${p.telefono ? `<span style="color:var(--text-soft);font-size:.75rem"> · ${esc(p.telefono)}</span>` : ''}
          </div>`).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.prop-owner-opt').forEach(el => {
          el.addEventListener('mousedown', () => {
            hiddenId.value = el.dataset.id;
            searchInput.value = propietarios.find(p => p.id === el.dataset.id)?.nombre || '';
            dropdown.style.display = 'none';
          });
        });
      };

      searchInput.addEventListener('input', () => { hiddenId.value = ''; renderDrop(searchInput.value); });
      searchInput.addEventListener('blur',  () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
      searchInput.addEventListener('focus', () => { if (searchInput.value) renderDrop(searchInput.value); });

      // Fotos
      let fotos = [...fotosGuardadas];
      const preview = ctx.overlay.querySelector('#fotosPreview');
      const fotosJSON = ctx.overlay.querySelector('[name="fotosJSON"]');

      const renderFotos = () => {
        preview.innerHTML = fotos.map((f, i) => `
          <div style="position:relative;width:90px;height:70px;border-radius:var(--r-sm);overflow:hidden;background:var(--surface-2);${i===0?'outline:2px solid var(--primary);outline-offset:2px':''}">
            <img src="${esc(f)}" style="width:100%;height:100%;object-fit:cover">
            ${i===0
              ? `<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);color:#fff;font-size:.6rem;text-align:center;padding:.15rem 0">Portada</span>`
              : `<button type="button" data-portada-foto="${i}" title="Usar como portada"
                  style="position:absolute;bottom:2px;left:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;line-height:1">★</button>`}
            <button type="button" data-del-foto="${i}"
              style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
          </div>`).join('');
        fotosJSON.value = JSON.stringify(fotos);
        preview.querySelectorAll('[data-del-foto]').forEach(btn => {
          btn.addEventListener('click', () => { fotos.splice(Number(btn.dataset.delFoto), 1); renderFotos(); });
        });
        preview.querySelectorAll('[data-portada-foto]').forEach(btn => {
          btn.addEventListener('click', () => {
            const i = Number(btn.dataset.portadaFoto);
            const [chosen] = fotos.splice(i, 1);
            fotos.unshift(chosen);
            renderFotos();
          });
        });
      };

      ctx.overlay.querySelector('#inputFotos').addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        let loaded = 0;
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            fotos.push(ev.target.result);
            loaded++;
            if (loaded === files.length) renderFotos();
          };
          reader.readAsDataURL(file);
        });
        e.target.value = '';
      });

      renderFotos();

      $('#saveProp', ctx.overlay).addEventListener('click', async () => {
        const f = $('#propForm', ctx.overlay);
        if (!hiddenId.value) { searchInput.focus(); toast('Seleccioná un propietario', { tipo: 'warning' }); return; }
        if (!f.direccion.value.trim()) { f.direccion.focus(); toast('La dirección es obligatoria', { tipo: 'warning' }); return; }
        const fd = new FormData(f);
        const data = Object.fromEntries(fd.entries());
        // Numéricos
        ['ambientes','banos','m2','m2Cubiertos','antiguedad','precioAlquiler','precioVenta','expensas','pisosEdificio'].forEach(k => {
          data[k] = data[k] ? Number(data[k]) : null;
        });
        // Amenities (checkboxes múltiples)
        data.amenities = Array.from(ctx.overlay.querySelectorAll('[name="amenity"]:checked')).map(c => c.value);
        // Tipo de uso
        data.habilitadaAlquiler = !!ctx.overlay.querySelector('[name="habilitadaAlquiler"]')?.checked;
        data.habilitadaTemporal = !!ctx.overlay.querySelector('[name="habilitadaTemporal"]')?.checked;
        data.habilitadaVenta = !!ctx.overlay.querySelector('[name="habilitadaVenta"]')?.checked;
        data.publicadoWeb = !!ctx.overlay.querySelector('[name="publicadoWeb"]')?.checked;
        // Fotos
        data.fotos = fotos;
        delete data.fotosJSON;
        delete data.amenity;

        if (ed) { await actions.updatePropiedad(prop.id, data); toast('Propiedad actualizada'); }
        else { await actions.createPropiedad(data); toast('Propiedad creada'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   ALQUILER
   ============================================================ */
export function openAlquilerForm(alq = null, onDone) {
  const ed = !!alq; alq = alq || {};
  const { clientes, propietarios, propiedades } = getState();

  const alqInq  = clientes.find(c => c.id === alq.inquilinoId);
  const alqProp = (propietarios || []).find(p => p.id === alq.propietarioId);
  const alqFinca = propiedades.find(p => p.id === alq.propiedadId);

  // Helper para construir el dropdown de búsqueda
  const searchField = ({ id, label, req, value, hidden }) => `
    <div class="form-group" style="position:relative">
      <label>${label}${req ? ' <span class="req">*</span>' : ''}</label>
      <input id="${id}Search" autocomplete="off" placeholder="Escribí para buscar..." value="${esc(value||'')}" style="width:100%">
      <input type="hidden" name="${hidden}" id="${hidden}" value="${esc(alq[hidden]||'')}">
      <div id="${id}Drop" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-md);z-index:60;max-height:180px;overflow-y:auto"></div>
    </div>`;

  openModal({
    title: ed ? 'Editar contrato' : 'Nuevo contrato de alquiler', size: 'lg',
    bodyHTML: `
      <form id="alqForm">
        <h3 class="form-section-title">Partes</h3>
        <div class="form-grid">
          ${searchField({ id:'alqInq',  label:'Inquilino',       req:true,  value:alqInq?.nombre,  hidden:'inquilinoId' })}
          ${searchField({ id:'alqOwn',  label:'Propietario',     req:false, value:alqProp?.nombre, hidden:'propietarioId' })}
          <div class="form-group">
            <label>Propiedad <span class="req">*</span></label>
            <select id="propiedadId" name="propiedadId">
              <option value="">— Seleccionar propiedad —</option>
            </select>
          </div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Condiciones del contrato</h3>
        <div class="form-grid">
          <div class="form-group"><label>Fecha inicio <span class="req">*</span></label>
            <input name="fechaInicio" type="date" value="${(alq.fechaInicio||'').slice(0,10)}" required></div>
          <div class="form-group"><label>Fecha fin <span class="req">*</span></label>
            <input name="fechaFin" type="date" value="${(alq.fechaFin||'').slice(0,10)}" required></div>
          <div class="form-group"><label>Monto inicial</label>
            <input name="montoInicial" type="number" min="0" value="${alq.montoInicial||''}"></div>
          <div class="form-group"><label>Moneda</label>
            <select name="moneda">${opts(MONEDAS, alq.moneda||'ARS')}</select></div>
          <div class="form-group"><label>Tipo de ajuste</label>
            <select name="tipoAjuste">${opts(TIPOS_AJUSTE, alq.tipoAjuste||'ICL')}</select></div>
          <div class="form-group"><label>Frecuencia de ajuste</label>
            <select name="frecuenciaAjuste">${opts(FRECUENCIAS_AJUSTE, alq.frecuenciaAjuste||6)}</select></div>
          <div class="form-group"><label>% de aumento (si es fijo)</label>
            <input name="porcentajeAjuste" type="number" min="0" step="0.1" value="${alq.porcentajeAjuste||''}" placeholder="Ej: 30"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Datos del inquilino (contrato)</h3>
        <div class="form-grid">
          <div class="form-group"><label>DNI / CUIT</label>
            <input name="inquilinoDni" value="${esc(alq.inquilinoDni||'')}" placeholder="Ej: 30.123.456"></div>
          <div class="form-group"><label>Teléfono / WhatsApp</label>
            <input name="inquilinoTelefono" value="${esc(alq.inquilinoTelefono||'')}" placeholder="Ej: 351 123 4567"></div>
          <div class="form-group full"><label>Domicilio</label>
            <input name="inquilinoDomicilio" value="${esc(alq.inquilinoDomicilio||'')}" placeholder="Calle, número, localidad"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Datos adicionales</h3>
        <div class="form-grid">
          <div class="form-group"><label>Fecha de firma</label>
            <input name="fechaFirma" type="date" value="${(alq.fechaFirma||'').slice(0,10)}"></div>
          <div class="form-group"><label>Depósito</label>
            <input name="deposito" type="number" min="0" value="${alq.deposito||''}"></div>
          <div class="form-group"><label>Comisión (%)</label>
            <input name="comision" type="number" min="0" step="0.5" value="${alq.comision||''}"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Datos del garante</h3>
        <div class="form-grid">
          <div class="form-group"><label>Nombre y apellido</label>
            <input name="garante" value="${esc(alq.garante||'')}" placeholder="Nombre completo del garante"></div>
          <div class="form-group"><label>DNI / CUIT</label>
            <input name="garanteDni" value="${esc(alq.garanteDni||'')}" placeholder="Ej: 30.123.456"></div>
          <div class="form-group"><label>Teléfono / WhatsApp</label>
            <input name="garanteTelefono" value="${esc(alq.garanteTelefono||'')}" placeholder="351 ..."></div>
          <div class="form-group"><label>Email</label>
            <input name="garanteEmail" type="email" value="${esc(alq.garanteEmail||'')}"></div>
          <div class="form-group full"><label>Domicilio</label>
            <input name="garanteDomicilio" value="${esc(alq.garanteDomicilio||'')}" placeholder="Calle, número, localidad"></div>
          <div class="form-group"><label>Relación con el inquilino</label>
            <input name="garanteRelacion" value="${esc(alq.garanteRelacion||'')}" placeholder="Ej: Padre, hermano, empleador..."></div>
          <div class="form-group"><label>Propiedad en garantía</label>
            <input name="garantePropiedad" value="${esc(alq.garantePropiedad||'')}" placeholder="Ej: Bv. San Juan 540, Córdoba"></div>
        <div class="form-group" style="display:none"></div>
          <div class="form-group full"><label>Notas</label>
            <textarea name="notas">${esc(alq.notas||'')}</textarea></div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveAlq">${ed?'Guardar':'Crear contrato'}</button>`,
    onMount(ctx) {
      // Función genérica de buscador autocomplete
      function makeSearch({ searchId, dropId, hiddenId, lista, labelFn, subFn }) {
        const inp  = ctx.overlay.querySelector(`#${searchId}`);
        const drop = ctx.overlay.querySelector(`#${dropId}`);
        const hid  = ctx.overlay.querySelector(`#${hiddenId}`);

        const show = (q) => {
          const matches = lista.filter(x => labelFn(x).toLowerCase().includes(q.toLowerCase())).slice(0, 8);
          if (!matches.length || !q.trim()) { drop.style.display = 'none'; return; }
          drop.innerHTML = matches.map(x => `
            <div data-id="${x.id}" style="padding:.5rem .9rem;cursor:pointer;font-size:.875rem;border-bottom:1px solid var(--border)">
              ${esc(labelFn(x))}${subFn ? `<span style="color:var(--text-soft);font-size:.75rem"> · ${esc(subFn(x))}</span>` : ''}
            </div>`).join('');
          drop.style.display = 'block';
          drop.querySelectorAll('[data-id]').forEach(el => {
            el.addEventListener('mousedown', () => {
              hid.value   = el.dataset.id;
              inp.value   = labelFn(lista.find(x => x.id === el.dataset.id));
              drop.style.display = 'none';
              // Al elegir propietario, filtrar propiedades
              if (hiddenId === 'propietarioId') refreshProps();
            });
          });
        };
        inp.addEventListener('input', () => { hid.value = ''; show(inp.value); });
        inp.addEventListener('blur',  () => setTimeout(() => { drop.style.display = 'none'; }, 150));
        inp.addEventListener('focus', () => { if (inp.value) show(inp.value); });
      }

      const refreshProps = () => {
        const ownId = ctx.overlay.querySelector('#propietarioId')?.value || '';
        const yaAlquiladas = propiedadesAlquiladasActivas(ed ? alq.id : null);
        const lista = propiedades.filter(p => {
          if (ownId && p.propietarioId !== ownId) return false;
          if (!['disponible', 'alquilada'].includes(p.estado)) return false;
          if (yaAlquiladas.has(p.id) && p.id !== alq.propiedadId) return false;
          return true;
        });
        const sel = ctx.overlay.querySelector('#propiedadId');
        const valActual = sel.value || alq.propiedadId || '';
        sel.innerHTML = `<option value="">— Seleccionar propiedad —</option>` +
          lista.map(p => `<option value="${p.id}" ${p.id === valActual ? 'selected' : ''}>
            ${esc(p.direccion || p.tipo || p.id)}${p.ciudad ? ' · ' + esc(p.ciudad) : ''}
          </option>`).join('');
      };

      makeSearch({
        searchId: 'alqInqSearch', dropId: 'alqInqDrop', hiddenId: 'inquilinoId',
        lista: clientes,
        labelFn: c => c.nombre,
        subFn:   c => c.telefono || '',
      });
      makeSearch({
        searchId: 'alqOwnSearch', dropId: 'alqOwnDrop', hiddenId: 'propietarioId',
        lista: propietarios,
        labelFn: p => p.nombre,
        subFn:   p => p.telefono || '',
      });
      refreshProps();

      $('#saveAlq', ctx.overlay).addEventListener('click', async () => {
        const f = $('#alqForm', ctx.overlay);
        if (!ctx.overlay.querySelector('#inquilinoId').value) { toast('Seleccioná un inquilino', { tipo: 'warning' }); return; }
        if (!ctx.overlay.querySelector('#propiedadId').value) { toast('Seleccioná una propiedad', { tipo: 'warning' }); return; }
        if (!f.fechaInicio.value || !f.fechaFin.value) { toast('Las fechas son obligatorias', { tipo: 'warning' }); return; }
        if (!ed) {
          const ocupada = propiedadesAlquiladasActivas();
          if (ocupada.has(ctx.overlay.querySelector('#propiedadId').value)) {
            toast('Esa propiedad ya tiene un contrato de alquiler activo', { tipo: 'error' }); return;
          }
        }
        const data = Object.fromEntries(new FormData(f).entries());
        ['montoInicial','deposito','comision','porcentajeAjuste'].forEach(k => data[k] = data[k] ? Number(data[k]) : null);
        // Usar comision también como pctHonorarios para liquidaciones
        if (data.comision != null) data.pctHonorarios = data.comision;
        data.frecuenciaAjuste = Number(data.frecuenciaAjuste);
        // Campos de garante: limpiar vacíos
        ['garante','garanteDni','garanteTelefono','garanteEmail','garanteDomicilio','garanteRelacion','garantePropiedad',
         'inquilinoDni','inquilinoTelefono','inquilinoDomicilio','fechaFirma']
          .forEach(k => { if (!data[k]) data[k] = null; });
        if (ed) { await actions.updateAlquiler(alq.id, data); toast('Contrato actualizado'); }
        else { await actions.createAlquiler(data); toast('Contrato creado correctamente'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   COBRO
   ============================================================ */
export function openCobroForm(alq, onDone, prefill = {}) {
  const hoy = new Date();
  const mesActual = prefill.mes || `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const montoSugerido = prefill.monto ?? alq.montoActual ?? alq.montoInicial ?? '';

  const METODOS = [
    { id: 'Efectivo',      icon: '💵' },
    { id: 'Transferencia', icon: '🏦' },
    { id: 'Cheque',        icon: '📄' },
    { id: 'Débito',        icon: '💳' },
    { id: 'Otro',          icon: '📝' },
  ];

  openModal({
    title: 'Registrar cobro',
    bodyHTML: `
      <form id="cobroForm">
        <!-- Mes y monto -->
        <div class="form-grid" style="margin-bottom:1.1rem">
          <div class="form-group">
            <label>Mes <span class="req">*</span></label>
            <input name="mes" type="month" value="${mesActual}" required>
          </div>
          <div class="form-group">
            <label>Monto $</label>
            <input name="monto" type="number" min="0" value="${montoSugerido}" style="font-size:1.1rem;font-weight:700">
          </div>
          <div class="form-group">
            <label>Fecha de pago</label>
            <input name="fechaPago" type="date" value="${hoy.toISOString().slice(0,10)}">
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:.6rem;padding-top:1.6rem">
            <input type="checkbox" name="pagado" id="chkPagado" checked style="width:16px;height:16px;cursor:pointer">
            <label for="chkPagado" style="margin:0;cursor:pointer;font-weight:600">Marcar como pagado</label>
          </div>
        </div>

        <!-- Método de pago -->
        <div style="margin-bottom:1.1rem">
          <label style="font-size:.8rem;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:.5rem">Método de pago</label>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap" id="metodosBtns">
            ${METODOS.map(m => `
              <button type="button" data-metodo="${m.id}" style="
                padding:.4rem .85rem;border-radius:var(--r-full);font-size:.82rem;font-weight:600;cursor:pointer;
                border:1.5px solid var(--border);background:var(--surface-2);color:var(--text);transition:all .15s">
                ${m.icon} ${m.id}
              </button>`).join('')}
          </div>
          <input type="hidden" name="metodoPago" id="metodoPago" value="Efectivo">
        </div>

        <!-- Referencia (transferencia/cheque) -->
        <div id="refBlk" style="margin-bottom:1rem;display:none">
          <div class="form-group" style="margin:0">
            <label>N° de referencia / CBU / banco</label>
            <input name="referencia" placeholder="Ej: 0000234 · Banco Nación">
          </div>
        </div>

        <!-- Notas -->
        <div class="form-group">
          <label>Notas adicionales</label>
          <input name="nota" placeholder="Observaciones opcionales">
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveCobro">Registrar cobro</button>`,
    onMount(ctx) {
      // Selección de método de pago
      let metodoActivo = 'Efectivo';
      const actualizarMetodo = (id) => {
        metodoActivo = id;
        ctx.overlay.querySelector('#metodoPago').value = id;
        ctx.overlay.querySelectorAll('[data-metodo]').forEach(b => {
          const activo = b.dataset.metodo === id;
          b.style.background = activo ? 'var(--primary)' : 'var(--surface-2)';
          b.style.color      = activo ? '#fff' : 'var(--text)';
          b.style.borderColor= activo ? 'var(--primary)' : 'var(--border)';
        });
        // Mostrar campo referencia si aplica
        const mostrarRef = ['Transferencia','Cheque'].includes(id);
        ctx.overlay.querySelector('#refBlk').style.display = mostrarRef ? 'block' : 'none';
      };
      actualizarMetodo('Efectivo');
      ctx.overlay.querySelectorAll('[data-metodo]').forEach(b => {
        b.addEventListener('click', () => actualizarMetodo(b.dataset.metodo));
      });

      $('#saveCobro', ctx.overlay).addEventListener('click', async () => {
        const f = $('#cobroForm', ctx.overlay);
        if (!f.mes.value) { toast('Indicá el mes', { tipo: 'warning' }); return; }
        const cobro = {
          mes:        f.mes.value,
          monto:      f.monto.value ? Number(f.monto.value) : null,
          fechaPago:  f.fechaPago.value || null,
          pagado:     f.pagado.checked,
          metodoPago: metodoActivo,
          referencia: f.referencia?.value || null,
          nota:       f.nota.value || null,
        };
        await actions.addCobro(alq.id, cobro);
        toast('Cobro registrado'); ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   VENTA
   ============================================================ */
export function openVentaForm(venta = null, onDone) {
  const ed = !!venta; venta = venta || {};
  openModal({
    title: ed ? 'Editar venta' : 'Nueva venta', size: 'lg',
    bodyHTML: `
      <form id="ventaForm">
        <h3 class="form-section-title">Partes</h3>
        <div class="form-grid">
          <div class="form-group"><label>Comprador <span class="req">*</span></label>
            <select name="compradorId"><option value="">— Seleccionar —</option>${clientesOpts(venta.compradorId)}</select></div>
          <div class="form-group"><label>Vendedor (propietario)</label>
            <select name="vendedorId" id="vtaVendedorId"><option value="">— Ninguno —</option>${propietariosOpts(venta.vendedorId)}</select></div>
          <div class="form-group full"><label>Propiedad <span class="req">*</span></label>
            <select name="propiedadId" id="vtaPropiedadId">${propsDeOpts(venta.vendedorId, 'venta', venta.propiedadId)}</select></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Datos económicos</h3>
        <div class="form-grid">
          <div class="form-group"><label>Precio de venta <span class="req">*</span></label>
            <input name="precio" type="number" min="0" value="${venta.precio||''}" required></div>
          <div class="form-group"><label>Moneda</label>
            <select name="moneda">${opts(MONEDAS, venta.moneda||'USD')}</select></div>
          <div class="form-group"><label>Seña</label>
            <input name="sena" type="number" min="0" value="${venta.sena||''}"></div>
          <div class="form-group"><label>Comisión (%)</label>
            <input name="comision" type="number" min="0" step="0.5" value="${venta.comision||''}"></div>
        </div>

        <h3 class="form-section-title" style="margin-top:1.25rem">Escritura</h3>
        <div class="form-grid">
          <div class="form-group full"><label>Escribano / Escribana</label>
            <input name="escribano" value="${esc(venta.escribano||'')}" placeholder="Nombre del escribano"></div>
          <div class="form-group"><label>Fecha de reserva</label>
            <input name="fechaReserva" type="date" value="${(venta.fechaReserva||'').slice(0,10)}"></div>
          <div class="form-group"><label>Fecha de escritura</label>
            <input name="fechaEscritura" type="date" value="${(venta.fechaEscritura||'').slice(0,10)}"></div>
          <div class="form-group"><label>Estado</label>
            <select name="estado">${opts(VENTA_ESTADOS, venta.estado||'en_curso')}</select></div>
          <div class="form-group full"><label>Notas</label>
            <textarea name="notas">${esc(venta.notas||'')}</textarea></div>
        </div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveVenta">${ed?'Guardar':'Registrar venta'}</button>`,
    onMount(ctx) {
      // Actualizar propiedades al cambiar el vendedor
      ctx.overlay.querySelector('#vtaVendedorId')?.addEventListener('change', (e) => {
        const sel = ctx.overlay.querySelector('#vtaPropiedadId');
        sel.innerHTML = propsDeOpts(e.target.value, 'venta', '');
      });

      $('#saveVenta', ctx.overlay).addEventListener('click', async () => {
        const f = $('#ventaForm', ctx.overlay);
        if (!f.compradorId.value) { toast('Seleccioná un comprador', { tipo: 'warning' }); return; }
        if (!f.propiedadId.value) { toast('Seleccioná una propiedad', { tipo: 'warning' }); return; }
        if (!f.precio.value) { toast('El precio es obligatorio', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        ['precio','sena','comision'].forEach(k => data[k] = data[k] ? Number(data[k]) : null);
        if (ed) { await actions.updateVenta(venta.id, data); toast('Venta actualizada'); }
        else { await actions.createVenta(data); toast('Venta registrada correctamente'); }
        ctx.close(); onDone?.();
      });
    }
  });
}

/* ============================================================
   EVENTO DE AGENDA
   ============================================================ */
export function openEventoForm(evento = null, onDone, fechaPre = null) {
  const ed = !!evento; evento = evento || {};
  const hoy = new Date().toISOString().slice(0,10);
  openModal({
    title: ed ? 'Editar evento' : 'Nuevo evento',
    bodyHTML: `
      <form id="eventoForm" class="form-grid">
        <div class="form-group full"><label>Título <span class="req">*</span></label>
          <input name="titulo" required value="${esc(evento.titulo||'')}" placeholder="Ej. Visita departamento centro"></div>
        <div class="form-group"><label>Tipo</label>
          <select name="tipo">${opts(TIPOS_EVENTO, evento.tipo||'visita')}</select></div>
        <div class="form-group"><label>Fecha <span class="req">*</span></label>
          <input name="fecha" type="date" required value="${evento.fecha||fechaPre||hoy}"></div>
        <div class="form-group"><label>Hora</label>
          <input name="hora" type="time" value="${evento.hora||'10:00'}"></div>
        <div class="form-group full"><label>Cliente relacionado</label>
          <select name="clienteId"><option value="">— Ninguno —</option>${clientesOpts(evento.clienteId)}</select></div>
        <div class="form-group full"><label>Propiedad relacionada</label>
          <select name="propiedadId"><option value="">— Ninguna —</option>${propsOpts(evento.propiedadId)}</select></div>
        <div class="form-group full"><label>Notas</label>
          <textarea name="notas" placeholder="Detalles del evento...">${esc(evento.notas||'')}</textarea></div>
      </form>`,
    footerHTML: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="saveEvento">${ed?'Guardar':'Crear evento'}</button>`,
    onMount(ctx) {
      $('#saveEvento', ctx.overlay).addEventListener('click', async () => {
        const f = $('#eventoForm', ctx.overlay);
        if (!f.titulo.value.trim()) { f.titulo.focus(); toast('El título es obligatorio', { tipo: 'warning' }); return; }
        if (!f.fecha.value) { toast('La fecha es obligatoria', { tipo: 'warning' }); return; }
        const data = Object.fromEntries(new FormData(f).entries());
        if (!data.clienteId) delete data.clienteId;
        if (!data.propiedadId) delete data.propiedadId;
        if (ed) { await actions.updateEvento(evento.id, data); toast('Evento actualizado'); }
        else { await actions.createEvento(data); toast('Evento creado'); }
        ctx.close(); onDone?.();
      });
    }
  });
}
