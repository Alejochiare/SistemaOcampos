/* ============================================================
   VIEW · ADMINISTRACIÓN DEL SITIO WEB
   Banner, logo y datos de contacto que se muestran en el sitio
   público (public/). Todo se guarda en localStorage: el sitio
   público lo lee directo, sin backend ni servidor extra.
   ============================================================ */
import { actions, getState, subscribe } from '../store.js';
import { $, esc } from '../lib.js';
import { icon } from '../config.js';
import { toast } from '../components/toast.js';

function leerComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function administracion(root) {
  const unsub = subscribe(render);

  function render() {
    const s = getState().siteSettings || {};

    root.innerHTML = `
      <div class="view">
        <div class="page-head">
          <div class="page-title-wrap">
            <h1>Administración del sitio web</h1>
            <div class="subtitle">Configurá el banner, el logo y los datos de contacto del sitio público. Se ve reflejado apenas guardás.</div>
          </div>
        </div>

        <div class="card" style="margin-bottom:1.5rem">
          <div class="card-head"><h3>Banner e imagen de inicio</h3></div>
          <div class="card-body">
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-start">
              <div>
                <img src="${esc(s.banner || 'img/banner/banner.png')}" style="width:260px;height:140px;object-fit:cover;border-radius:var(--r-md);border:1px solid var(--border)">
              </div>
              <label class="btn btn-ghost" style="cursor:pointer">
                ${icon('link')} Subir banner desde la compu
                <input id="inpBanner" type="file" accept="image/*" style="display:none">
              </label>
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom:1.5rem">
          <div class="card-head"><h3>Logo de la empresa</h3></div>
          <div class="card-body">
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-start">
              <div>
                <img src="${esc(s.logo || 'logooo.png')}" style="max-width:200px;max-height:100px;width:auto;height:auto;object-fit:contain;display:block">
              </div>
              <label class="btn btn-ghost" style="cursor:pointer">
                ${icon('link')} Subir logo desde la compu
                <input id="inpLogo" type="file" accept="image/*" style="display:none">
              </label>
            </div>
          </div>
        </div>

        <form class="card" id="formDatos">
          <div class="card-head"><h3>Datos de contacto y empresa</h3></div>
          <div class="card-body">
            <div class="form-grid">
              <div class="form-group"><label>Nombre de la empresa</label>
                <input name="nombreEmpresa" value="${esc(s.nombreEmpresa||'')}" placeholder="Ej. Sunset Bienes Raíces"></div>
              <div class="form-group"><label>Teléfono</label>
                <input name="telefono" value="${esc(s.telefono||'351-6179678')}" placeholder="351-6179678"></div>
              <div class="form-group"><label>WhatsApp</label>
                <input name="whatsapp" value="${esc(s.whatsapp||'351-6179678')}" placeholder="351-6179678"></div>
              <div class="form-group full"><label>Dirección</label>
                <input name="direccion" value="${esc(s.direccion||'')}" placeholder="Ej. Almirante Brown esq. Belgrano, Miramar"></div>
              <div class="form-group full"><label>Descripción / bajada</label>
                <textarea name="descripcion" rows="3" placeholder="Somos la mejor opción para tu inversión...">${esc(s.descripcion||'')}</textarea></div>
            </div>
          </div>
          <div class="card-body" style="border-top:1px solid var(--border);display:flex;justify-content:flex-end">
            <button type="submit" class="btn btn-primary">Guardar datos</button>
          </div>
        </form>

        <p class="text-xs text-soft">El sitio web público está en la carpeta <code>public/</code>. Abrilo con el mismo servidor local que usás para el CRM (ej. <code>http://localhost:8080/public/</code>) para que vea estos mismos datos.</p>
      </div>`;

    $('#inpBanner', root).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      actions.updateSiteSettings({ banner: await leerComoDataURL(file) });
      toast('Banner actualizado');
    });

    $('#inpLogo', root).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      actions.updateSiteSettings({ logo: await leerComoDataURL(file) });
      toast('Logo actualizado');
    });

    $('#formDatos', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      actions.updateSiteSettings(Object.fromEntries(fd.entries()));
      toast('Datos guardados');
    });
  }

  render();
  return () => unsub();
}
