/* ============================================================
   IMPRIMIR — Generación de Recibos y Liquidaciones
   ============================================================ */

const KEY_AGENCIA  = 'inmocrm_agencia';
const KEY_NUM_REC  = 'inmocrm_num_recibo';
const KEY_NUM_LIQ  = 'inmocrm_num_liquidacion';
const KEY_NUM_DEUDA = 'inmocrm_num_deuda';

/* ── Agencia config ──────────────────────────────────────── */
export function getAgencia() {
  try { return JSON.parse(localStorage.getItem(KEY_AGENCIA) || '{}'); } catch { return {}; }
}
export function setAgencia(data) {
  localStorage.setItem(KEY_AGENCIA, JSON.stringify(data));
}

/* ── Numeración correlativa ──────────────────────────────── */
function nextNum(key) {
  const n = (parseInt(localStorage.getItem(key) || '0', 10)) + 1;
  localStorage.setItem(key, String(n));
  return String(n).padStart(8, '0');
}
function fmtDocNum(num) { return `0001-${num}`; }

/* ── Helpers ─────────────────────────────────────────────── */
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fmtMoneda(n, moneda = 'ARS') {
  if (n == null) return '—';
  const simbolo = moneda === 'USD' ? 'US$' : '$';
  return simbolo + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

function fmtFecha(d) {
  if (!d) return '—';
  const [y, m, dia] = String(d).slice(0, 10).split('-');
  return `${dia}/${m}/${y}`;
}

function mesLabel(mes) {
  if (!mes) return '—';
  const [y, m] = mes.split('-');
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${nombres[+m - 1]} de ${y}`;
}

/** Convierte número a texto en pesos o dólares (simplificado, cubre hasta millones) */
function enLetras(n, unidad = 'pesos') {
  if (!n) return `Cero ${unidad}`;
  const entero = Math.floor(n);
  const cents  = Math.round((n - entero) * 100);

  const unidades = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
    'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
  const decenas  = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const centenas = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];

  function grupo(num) {
    if (num === 0) return '';
    if (num === 100) return 'cien';
    let res = '';
    const c = Math.floor(num / 100);
    const r = num % 100;
    if (c) res += centenas[c] + (r ? ' ' : '');
    if (r < 20) { res += unidades[r]; }
    else {
      const d = Math.floor(r / 10), u = r % 10;
      res += decenas[d] + (u ? ' y ' + unidades[u] : '');
    }
    return res;
  }

  function convertir(num) {
    if (num === 0) return 'cero';
    let res = '';
    const mill = Math.floor(num / 1_000_000);
    const miles = Math.floor((num % 1_000_000) / 1000);
    const resto = num % 1000;
    if (mill) res += (mill === 1 ? 'un millón' : grupo(mill) + ' millones') + ' ';
    if (miles) res += (miles === 1 ? 'mil' : grupo(miles) + ' mil') + ' ';
    if (resto) res += grupo(resto);
    return res.trim();
  }

  const pesos = convertir(entero);
  const txt   = pesos.charAt(0).toUpperCase() + pesos.slice(1) + ' ' + unidad;
  return cents ? txt + ` con ${cents}/100` : txt;
}

/** Calcula pago Nº X de Y total del contrato */
function numPago(alq, mes) {
  if (!alq.fechaInicio || !alq.fechaFin) return null;
  const ini = new Date(alq.fechaInicio.slice(0, 10) + 'T00:00:00');
  const fin = new Date(alq.fechaFin.slice(0, 10) + 'T00:00:00');
  const [y, m] = mes.split('-').map(Number);
  const cur = new Date(y, m - 1, 1);
  const total = (fin.getFullYear() - ini.getFullYear()) * 12 + (fin.getMonth() - ini.getMonth()) + 1;
  const actual = (y - ini.getFullYear()) * 12 + (m - 1 - ini.getMonth()) + 1;
  return { actual: Math.max(1, actual), total };
}

/* ── CSS compartido para impresión ──────────────────────── */
const CSS_PRINT = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
  .pagina { width: 210mm; margin: 0 auto; padding: 8mm; }
  .copia { border: 1px solid #999; border-radius: 2px; padding: 12px 16px; margin-bottom: 8px; }
  .separador { text-align: center; font-size: 10px; color: #aaa; margin: 6px 0; letter-spacing: 3px; }

  /* Header */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #111; }
  .doc-logo { height: 46px; width: auto; max-width: 160px; object-fit: contain; display: block; margin-bottom: 3px; }
  .agencia-logo { font-size: 20px; font-weight: 900; color: #111; letter-spacing: -0.5px; }
  .agencia-sub  { font-size: 9px; color: #666; margin-top: 2px; }
  .agencia-info { font-size: 9px; color: #666; line-height: 1.5; margin-top: 4px; }

  .doc-tipo-bloque { text-align: right; }
  .doc-tipo  { font-size: 22px; font-weight: 900; letter-spacing: 2px; color: #111; }
  .doc-num   { font-size: 13px; font-weight: 700; margin-top: 3px; }
  .doc-fecha { font-size: 10px; color: #444; margin-top: 2px; }
  .doc-cuit  { font-size: 9px; color: #666; margin-top: 2px; }

  /* Sello discreto */
  .sello { border: 1px solid #bbb; border-radius: 2px; padding: 3px 7px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0 18px; flex-shrink: 0; }
  .sello-txt { font-size: 6.5px; color: #888; text-align: center; line-height: 1.5; letter-spacing: .2px; }

  /* Banda de concepto */
  .banda-concepto { background: #f4f4f4; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 4px 8px; font-size: 9px; font-weight: 700; color: #333; margin: 8px 0; letter-spacing: .5px; }

  /* Datos cliente */
  .cliente-blk { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; margin: 8px 0; font-size: 10px; }
  .dato-fld { display: flex; gap: 4px; align-items: baseline; }
  .lbl { color: #777; font-size: 9px; white-space: nowrap; }

  /* Bloque contrato */
  .contrato-blk { border: 1px solid #ccc; padding: 6px 10px; margin: 8px 0; font-size: 10px; }
  .contrato-titulo { font-weight: 700; font-size: 9.5px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; margin-bottom: 5px; color: #333; }
  .contrato-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; }
  .contrato-row  { display: flex; gap: 4px; align-items: baseline; }

  /* Tabla detalle */
  .tabla { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10px; }
  .tabla th { background: #ebebeb; border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-weight: 700; font-size: 9.5px; text-transform: uppercase; letter-spacing: .3px; }
  .tabla td { border: 1px solid #ddd; padding: 5px 8px; }
  .tabla .right { text-align: right; font-weight: 700; }

  /* Totales */
  .totales { margin: 6px 0 5px; }
  .total-row { display: flex; justify-content: flex-end; gap: 24px; font-size: 10px; padding: 2px 0; }
  .total-row.grand { font-size: 13px; font-weight: 900; border-top: 2px solid #111; padding-top: 5px; margin-top: 3px; }
  .total-label { min-width: 140px; text-align: right; }
  .total-val   { min-width: 100px; text-align: right; }

  /* Letras + forma pago */
  .letras-blk { display: flex; justify-content: space-between; align-items: flex-start; font-size: 9.5px; margin: 6px 0 4px; padding: 5px 8px; background: #f9f9f9; border: 1px solid #e8e8e8; border-radius: 2px; }

  /* Firma */
  .firma-blk { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 6px; border-top: 1px solid #ccc; }
  .firma-linea { border-top: 1px solid #555; width: 170px; text-align: center; padding-top: 3px; font-size: 9px; color: #444; }
  .copia-label { font-size: 9px; font-weight: 700; color: #555; }

  @media print {
    body { margin: 0; }
    .pagina { padding: 4mm; }
    .no-print { display: none; }
    @page { margin: 5mm; size: A4; }
  }
`;

/* ── Abrir ventana de impresión ──────────────────────────── */
function abrirVentana(titulo, cuerpo) {
  const win = window.open('', '_blank', 'width=850,height=700');
  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <base href="${location.href}">
  <title>${titulo}</title>
  <style>${CSS_PRINT}</style>
</head>
<body>
<div class="pagina">
  <div class="no-print" style="text-align:center;padding:8px;background:#1a5276;color:#fff;margin-bottom:10px;cursor:pointer;font-size:13px;border-radius:4px"
    onclick="window.print()">🖨 Imprimir / Guardar PDF</div>
  ${cuerpo}
</div>
</body>
</html>`);
  win.document.close();
}

/* ── Header común del documento ──────────────────────────── */
function headerDoc(ag, tipo, num, fecha) {
  const nombre = ag.nombre || 'Inmobiliaria';
  const cuit   = ag.cuit   || '';
  const dir    = [ag.direccion, ag.localidad].filter(Boolean).join(' | ');
  const tel    = ag.telefono || '';
  const iva    = ag.iva     || 'Responsable Monotributo';

  return `
  <div class="doc-header">
    <div>
      <img src="img/logo/logo-oscuro.png" class="doc-logo" alt="Logo">
      <div class="agencia-logo">${esc(nombre)}</div>
      <div class="agencia-sub">${esc(iva)}</div>
      <div class="agencia-info" style="margin-top:4px">
        ${dir ? esc(dir) + '<br>' : ''}
        ${tel ? 'Tel: ' + esc(tel) : ''}
      </div>
    </div>

    <div class="sello">
      <span class="sello-txt">DOCUMENTO<br>NO VÁLIDO<br>COMO FACTURA</span>
    </div>

    <div class="doc-tipo-bloque">
      <div class="doc-tipo">${tipo}</div>
      <div class="doc-num">${num}</div>
      <div class="doc-fecha">${fmtFecha(fecha)}</div>
      ${cuit ? `<div class="doc-cuit">C.U.I.T.: ${esc(cuit)}</div>` : ''}
      ${ag.inicioActividades ? `<div class="doc-cuit">Inicio act.: ${fmtFecha(ag.inicioActividades)}</div>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   RECIBO DE PAGO (inquilino → inmobiliaria)
   ============================================================ */
export function imprimirRecibo({ alq, cobro, inquilino, propiedad, propietario }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_REC));
  const fecha = cobro.fechaPago || new Date().toISOString().slice(0, 10);
  const monto = cobro.monto || alq.montoActual || alq.montoInicial || 0;
  const montoMora = cobro.montoMora || 0;
  const montoAlquiler = cobro.montoAlquiler ?? (monto - montoMora);
  const pago  = cobro.mes ? numPago(alq, cobro.mes) : null;
  const pagos = (cobro.pagos && cobro.pagos.length) ? cobro.pagos : null;

  const dniInq = alq.inquilinoDni || inquilino?.dni || '';
  const telInq = alq.inquilinoTelefono || inquilino?.telefono || '';
  const domInq = alq.inquilinoDomicilio || inquilino?.domicilio || inquilino?.direccion || '';

  const copia = (tipoCop) => `
  <div class="copia">
    ${headerDoc(ag, 'RECIBO', num, fecha)}

    <div class="banda-concepto">
      COBRO POR CUENTA Y ORDEN DE TERCEROS — IMPORTE A ENTREGAR AL PROPIETARIO O QUIEN CORRESPONDA
    </div>

    <!-- Datos del inquilino -->
    <div class="cliente-blk">
      <div class="dato-fld"><span class="lbl">Sr./Sra.:</span> <strong>${esc(inquilino?.nombre || '—')}</strong></div>
      ${dniInq ? `<div class="dato-fld"><span class="lbl">DNI:</span> <strong>${esc(dniInq)}</strong></div>` : '<div></div>'}
      ${domInq ? `<div class="dato-fld" style="grid-column:1/-1"><span class="lbl">Domicilio:</span> ${esc(domInq)}</div>` : ''}
      ${telInq ? `<div class="dato-fld"><span class="lbl">Teléfono:</span> ${esc(telInq)}</div>` : ''}
      <div class="dato-fld"><span class="lbl">Condición IVA:</span> Consumidor Final</div>
    </div>

    <!-- Datos del contrato -->
    <div class="contrato-blk">
      <div class="contrato-titulo">Detalle del contrato</div>
      <div class="contrato-grid">
        <div class="contrato-row"><span class="lbl">Concepto:</span> <strong>ALQUILER</strong></div>
        ${pago ? `<div class="contrato-row"><span class="lbl">Cuota N°:</span> <strong>${pago.actual} de ${pago.total}</strong></div>` : '<div></div>'}
        <div class="contrato-row" style="grid-column:1/-1"><span class="lbl">Inmueble:</span> <strong>${esc(propiedad?.direccion || '—')}${propiedad?.ciudad ? ' — ' + esc(propiedad.ciudad) : ''}</strong></div>
        <div class="contrato-row"><span class="lbl">Período:</span> <strong>${cobro.mes ? mesLabel(cobro.mes) : '—'}</strong></div>
        <div class="contrato-row"><span class="lbl">Propietario:</span> ${esc(propietario?.nombre || '—')}</div>
        <div class="contrato-row"><span class="lbl">Inicio contrato:</span> ${fmtFecha(alq.fechaInicio)}</div>
        <div class="contrato-row"><span class="lbl">Fin contrato:</span> ${fmtFecha(alq.fechaFin)}</div>
      </div>
    </div>

    <!-- Tabla importe -->
    <table class="tabla">
      <thead><tr>
        <th>Descripción</th>
        <th>Inmueble</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
      <tr>
        <td>Alquiler mensual</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right">${fmtMoneda(montoAlquiler)}</td>
      </tr>
      ${montoMora > 0 ? `
      <tr>
        <td>Recargo por mora (${cobro.pctMoraAplicado}% x ${cobro.diasMora} día${cobro.diasMora === 1 ? '' : 's'})</td>
        <td>${esc(propiedad?.direccion || '—')}</td>
        <td class="right">${fmtMoneda(montoMora)}</td>
      </tr>` : ''}
      </tbody>
    </table>

    <div class="totales">
      <div class="total-row grand">
        <div class="total-label">TOTAL RECIBIDO:</div>
        <div class="total-val">${fmtMoneda(monto)}</div>
      </div>
    </div>

    <!-- Letras y forma de pago -->
    <div class="letras-blk">
      <div>
        <div><span class="lbl">Son pesos:</span> <strong>${enLetras(monto)}</strong></div>
        ${cobro.nota ? `<div style="margin-top:2px"><span class="lbl">Observaciones:</span> ${esc(cobro.nota)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;padding-left:12px">
        ${pagos && pagos.length > 1 ? `
        <div><span class="lbl">Forma de pago:</span></div>
        ${pagos.map(p => `
        <div style="margin-top:2px">
          <strong>${esc(p.metodoPago)}:</strong> ${fmtMoneda(p.monto)}
          ${p.referencia ? ` <span class="lbl">(${esc(p.referencia)})</span>` : ''}
        </div>`).join('')}
        ` : `
        <div><span class="lbl">Forma de pago:</span> <strong>${esc((pagos && pagos[0]?.metodoPago) || cobro.metodoPago || 'Efectivo')}</strong></div>
        ${(pagos && pagos[0]?.referencia) || cobro.referencia ? `<div style="margin-top:2px"><span class="lbl">Ref.:</span> ${esc((pagos && pagos[0]?.referencia) || cobro.referencia)}</div>` : ''}
        `}
      </div>
    </div>

    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">— ${tipoCop} —</div>
    </div>
  </div>`;

  abrirVentana('Recibo de Pago', `
    ${copia('ORIGINAL')}
    <div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>
    ${copia('DUPLICADO')}
  `);
}

/* ============================================================
   LIQUIDACIÓN (inmobiliaria → propietario)
   Recibe datos ya calculados desde el modal previo.
   {
     alq, cobro, inquilino, propiedad, propietario,
     pctHonorarios,          // número
     descuentos: [{ monto, nota }],  // descuentos adicionales
     formaPago,
   }
   ============================================================ */
export function imprimirLiquidacion({ alq, cobro, inquilino, propiedad, propietario,
                                      pctHonorarios = 0, descuentos = [], formaPago = 'Efectivo', pagos = [] }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_LIQ));
  const fecha = cobro.fechaPago || new Date().toISOString().slice(0, 10);
  const totalAlquiler = cobro.monto || alq.montoActual || alq.montoInicial || 0;
  const honorarios    = Math.round(totalAlquiler * pctHonorarios / 100);
  const totalDesc     = descuentos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
  const totalPagar    = totalAlquiler - honorarios - totalDesc;
  const pago          = cobro.mes ? numPago(alq, cobro.mes) : null;

  const copia = (tipoCopia) => `
  <div class="copia">
    ${headerDoc(ag, 'LIQUIDACIÓN', num, fecha)}

    <div class="cliente-blk">
      <div class="cliente-col">
        <div><span class="label-fld">Cliente: </span><strong>${esc(propietario?.nombre || '—')}</strong></div>
        <div><span class="label-fld">Dirección: </span>${esc(propietario?.direccion || propietario?.domicilio || '')}</div>
        <div><span class="label-fld">I.V.A.: </span>Consumidor Final</div>
      </div>
      <div class="cliente-col" style="text-align:right">
        ${propietario?.dni ? `<div><span class="label-fld">CUIT: </span>${esc(propietario.dni)}</div>` : ''}
        <div><span class="label-fld">Localidad: </span>${esc(ag.localidad || '')}</div>
      </div>
    </div>

    <table class="tabla">
      <thead><tr>
        <th>Inmueble</th>
        <th>Detalles</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
        <tr>
          <td>${esc(propiedad?.tipo || '')} ${esc(propiedad?.direccion || '—')}</td>
          <td>${cobro.mes ? mesLabel(cobro.mes) : '—'}${pago ? ` [pago ${pago.actual} / ${pago.total}]` : ''}</td>
          <td class="right"><strong>${fmtMoneda(totalAlquiler)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="totales">
      <div class="total-row">
        <div class="total-label">Total Liquidación:</div>
        <div class="total-val">${fmtMoneda(totalAlquiler)}</div>
      </div>
      <div class="total-row">
        <div class="total-label">Honorarios (${pctHonorarios}%):</div>
        <div class="total-val">− ${fmtMoneda(honorarios)}</div>
      </div>
      ${descuentos.filter(d => d.monto).map(d => `
      <div class="total-row">
        <div class="total-label" style="font-size:9px">${esc(d.nota || 'Descuento')}:</div>
        <div class="total-val">− ${fmtMoneda(d.monto)}</div>
      </div>`).join('')}
      <div class="total-row grand">
        <div class="total-label">Total Pagado al propietario:</div>
        <div class="total-val">${fmtMoneda(totalPagar)}</div>
      </div>
    </div>

    <div class="letras-blk">
      <div><span class="label-fld">Total a liquidar: </span><strong>${enLetras(totalPagar)}</strong></div>
      <div style="text-align:right">
        ${pagos && pagos.length > 1 ? `
          <div><span class="label-fld">Forma de pago:</span></div>
          ${pagos.map(p => `
          <div style="margin-top:2px">
            <strong>${esc(p.metodoPago)}:</strong> ${fmtMoneda(p.monto)}
            ${p.referencia ? ` <span class="label-fld">(${esc(p.referencia)})</span>` : ''}
          </div>`).join('')}
        ` : `<span class="label-fld">Forma de pago: </span><strong>${esc(formaPago)}</strong>`}
      </div>
    </div>

    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">– ${tipoCopia} –</div>
    </div>
  </div>`;

  abrirVentana('Liquidación', `
    ${copia('ORIGINAL')}
    <div class="separador">– – – – – – – – – – – – – – – – – – – – – – – – – – – – – –</div>
    ${copia('DUPLICADO')}
  `);
}

/* ============================================================
   FACTURA DE DEUDA (al cancelar un contrato con cobros pendientes)
   { alq, inquilino, propiedad, propietario,
     cobrosPendientes: [{ mes, monto, moneda?, concepto? }] }
   Cada ítem puede tener su propia moneda (ej: alquiler adeudado en USD
   y una multa en ARS) — no se suman montos de monedas distintas.
   ============================================================ */
export function imprimirFacturaDeuda({ alq, inquilino, propiedad, propietario, cobrosPendientes = [] }) {
  const ag  = getAgencia();
  const num = fmtDocNum(nextNum(KEY_NUM_DEUDA));
  const fecha = new Date().toISOString().slice(0, 10);

  const monedaDefault = alq.moneda || 'ARS';
  const totalesPorMoneda = {};
  cobrosPendientes.forEach(c => {
    const m = c.moneda || monedaDefault;
    totalesPorMoneda[m] = (totalesPorMoneda[m] || 0) + (Number(c.monto) || 0);
  });
  const monedas = Object.keys(totalesPorMoneda);

  const dniInq = alq.inquilinoDni || inquilino?.dni || '';

  const copia = (tipoCopia) => `
  <div class="copia">
    ${headerDoc(ag, 'DEUDA', num, fecha)}

    <div class="banda-concepto">
      DETALLE DE DEUDA PENDIENTE AL CANCELAR CONTRATO DE ALQUILER
    </div>

    <div class="cliente-blk">
      <div class="dato-fld"><span class="lbl">Inquilino:</span> <strong>${esc(inquilino?.nombre || '—')}</strong></div>
      ${dniInq ? `<div class="dato-fld"><span class="lbl">DNI:</span> <strong>${esc(dniInq)}</strong></div>` : '<div></div>'}
      <div class="dato-fld" style="grid-column:1/-1"><span class="lbl">Inmueble:</span> ${esc(propiedad?.direccion || '—')}</div>
      <div class="dato-fld"><span class="lbl">Propietario:</span> ${esc(propietario?.nombre || '—')}</div>
      <div class="dato-fld"><span class="lbl">Contrato:</span> ${fmtFecha(alq.fechaInicio)} — ${fmtFecha(alq.fechaFin)}</div>
    </div>

    <table class="tabla">
      <thead><tr>
        <th>Inmueble</th>
        <th>Período</th>
        <th class="right">Importe</th>
      </tr></thead>
      <tbody>
        ${cobrosPendientes.map(c => `
        <tr>
          <td>${esc(propiedad?.direccion || '—')}</td>
          <td>${c.mes ? mesLabel(c.mes) : esc(c.concepto || 'Cargo adicional')}</td>
          <td class="right">${fmtMoneda(c.monto, c.moneda || monedaDefault)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="totales">
      ${monedas.map(m => `
      <div class="total-row grand">
        <div class="total-label">TOTAL ADEUDADO${monedas.length > 1 ? ` (${m})` : ''}:</div>
        <div class="total-val">${fmtMoneda(totalesPorMoneda[m], m)}</div>
      </div>`).join('')}
    </div>

    <div class="letras-blk">
      <div>
        ${monedas.map(m => `<div><span class="lbl">Son ${m === 'USD' ? 'dólares' : 'pesos'}${monedas.length > 1 ? ` (${m})` : ''}:</span> <strong>${enLetras(totalesPorMoneda[m], m === 'USD' ? 'dólares' : 'pesos')}</strong></div>`).join('')}
      </div>
    </div>

    <div class="firma-blk">
      <div class="firma-linea">Firma y aclaración</div>
      <div class="copia-label">— ${tipoCopia} · deuda al cancelar contrato —</div>
    </div>
  </div>`;

  abrirVentana('Deuda pendiente', `
    ${copia('ORIGINAL')}
    <div class="separador">· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</div>
    ${copia('DUPLICADO')}
  `);
}
