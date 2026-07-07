# InmoTrack · CRM Inmobiliario

CRM web enfocado en el **seguimiento inteligente de leads** para inmobiliarias.
Construido con **HTML, CSS y JavaScript (módulos ES6)**, sin frameworks ni build step.
Arquitectura modular y desacoplada, lista para conectar un backend real.

---

## ▶️ Cómo ejecutarlo

La app usa **módulos ES6** (`import`/`export`), por lo que **debe servirse por HTTP**
(no funciona abriendo `index.html` con doble clic / `file://`).

Elegí cualquiera de estas opciones, parado en la carpeta del proyecto:

```bash
# Opción 1 — Python (suele venir instalado)
python3 -m http.server 8080

# Opción 2 — Node
npx serve .

# Opción 3 — VS Code
# Instalá la extensión "Live Server" y hacé clic en "Go Live"
```

Luego abrí: **http://localhost:8080**

La primera vez se cargan datos de demostración (leads, propiedades, tareas y usuarios)
y se guardan en el `localStorage` del navegador. Para reiniciar la demo, podés limpiar
el `localStorage` del sitio o llamar a `store.actions.resetDemo()` desde la consola.

---

## 🧱 Arquitectura

El principio rector es **separar la lógica de la presentación** y **aislar el acceso a datos**
para poder cambiar de `localStorage` a una API REST sin tocar las vistas.

```
crm-inmobiliario/
├── index.html              # Shell de la SPA (sidebar + topbar + contenedor de vistas)
├── css/
│   ├── variables.css       # Tokens de diseño + temas claro/oscuro
│   ├── base.css            # Reset, tipografía, utilidades, animaciones
│   ├── layout.css          # Sidebar, topbar, grilla principal, responsive
│   ├── components.css      # Botones, cards, KPIs, badges, tablas, modales, forms
│   └── views.css           # Kanban, timeline, calendario, propiedades, rescate…
└── js/
    ├── app.js              # Punto de entrada: arranca store → UI → router
    ├── config.js           # Constantes del dominio (estados, roles, permisos, iconos)
    ├── router.js           # Router por hash; cada vista es un módulo independiente
    ├── store.js            # Estado central (pub/sub) + selectores de negocio
    ├── data/
    │   ├── api.js          # Capa de acceso a datos (hoy localStorage; mañana REST)
    │   └── mockData.js     # Semilla determinística de datos de demo
    ├── utils/
    │   ├── dom.js          # Helpers de DOM, formato de moneda/números, export CSV
    │   ├── date.js         # Manejo de fechas en español (AR)
    │   └── charts.js       # Wrappers de Chart.js que respetan el tema activo
    ├── components/
    │   ├── sidebar.js      # Navegación + badges en vivo
    │   ├── topbar.js       # Tema, colapso, búsqueda global, notificaciones
    │   ├── modal.js        # Modales y confirmaciones reutilizables
    │   └── toast.js        # Notificaciones efímeras
    └── views/
        ├── dashboard.js    # KPIs + 4 gráficos + agenda del día
        ├── leads.js        # Kanban con drag & drop (8 estados)
        ├── leadDetail.js   # Ficha 360° del lead (modal)
        ├── rescate.js      # ⭐ Recuperación de leads dormidos
        ├── tareas.js       # Tareas con alertas de vencimiento
        ├── calendario.js   # Vistas mes / semana / día
        ├── propiedades.js  # Catálogo + matching inteligente con leads
        ├── reportes.js     # Análisis + export CSV / PDF
        ├── usuarios.js     # Usuarios + matriz de permisos por rol
        └── _forms.js       # Formularios de alta/edición reutilizables
```

### Flujo de datos

```
Vista ──(acción)──► store.actions ──► api (localStorage) ──► store.refresh() ──► emit()
  ▲                                                                                │
  └───────────────────────── re-render por suscripción ◄──────────────────────────┘
```

- Las **vistas** sólo leen del `store` (via *selectores*) y disparan *acciones*. No conocen cómo se persisten los datos.
- El **store** centraliza el estado y la lógica derivada (KPIs, alertas, heat score, matching).
- La **api** es el único punto que toca el almacenamiento.

---

## 🔌 Conectar un backend real

Toda la persistencia está aislada en `js/data/api.js`. Su interfaz pública
(`snapshot`, `createLead`, `updateLead`, `addActividad`, etc.) ya simula latencia con `async/await`,
así que **migrar a una API REST sólo requiere reescribir ese archivo**, sin tocar vistas ni store.

Ejemplo de cómo quedaría un método al usar `fetch`:

```js
// Antes (localStorage)
async createLead(data) {
  const db = read();
  const lead = { id: uid('lead'), ...data };
  db.leads.push(lead); write(db);
  return lead;
}

// Después (REST)
async createLead(data) {
  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

---

## ⭐ Funciones destacadas (más allá del pedido base)

- **Heat Score (0–100):** cada lead recibe un puntaje según recencia de contacto, avance en el pipeline, cantidad de interacciones y calidad del dato. Permite priorizar de un vistazo.
- **Rescate de leads:** panel dedicado que detecta leads activos sin seguimiento, los ordena por urgencia y permite **reactivarlos en 1 clic** (genera tarea + registra actividad) o enviar una **plantilla de WhatsApp** contextual ya redactada.
- **Matching inteligente propiedad ↔ lead:** al ver o crear una propiedad, el sistema calcula el % de coincidencia con cada lead (operación, tipo, zona y presupuesto) y sugiere los interesados.
- **Alertas de seguimiento** por umbrales (+3 / +7 / +15 días) visibles en tarjetas, notificaciones y dashboard.
- **Tema claro/oscuro** y diseño responsive (PC / tablet / móvil).

---

## 🧪 Datos de demostración

Los datos se generan de forma **determinística** (`mockData.js`), por lo que la demo
siempre incluye leads fríos, tareas vencidas y oportunidades de rescate para mostrar
todas las funcionalidades sin cargar nada a mano.

Usuario activo por defecto: **Carolina Méndez** (Administrador).

---

## 🌐 Sitio web público + Administración

Además del CRM, el proyecto incluye un sitio público en **un solo archivo**, sin backend:

- `sitio-web.html` — página única (banner, catálogo de propiedades con filtros, ficha de cada propiedad en un modal). Todo el HTML/CSS/JS está en ese único archivo, sin dependencias externas.
- `img/` — carpeta con las imágenes del sitio: `img/logo/logo.png` (logo por defecto) y `img/banner/banner.png` (banner por defecto). Las fotos que cargás por propiedad se suben desde la compu (nunca por URL) y se guardan en el navegador.
- Sección **Administración** dentro del CRM (`js/views/administracion.js`) para cargar banner y logo — siempre eligiendo el archivo desde tu computadora, nunca pegando una URL. Si no subís nada, se usan los archivos de `img/logo/` e `img/banner/`.

`sitio-web.html` lee el mismo `localStorage` del navegador que usa el CRM (`js/data.js`), así que **no hace falta backend, PHP ni base de datos**. Al crear, editar o marcar una propiedad como "vendida"/"alquilada" en el CRM, el sitio la muestra o la oculta automáticamente — sólo aparecen las propiedades con **"Publicar en la web"** activado y que no estén vendidas ni alquiladas.

> ⚠️ Importante: como usa `localStorage`, `sitio-web.html` ve los mismos datos sólo si se abre **desde el mismo navegador y el mismo origen** (mismo `http://localhost:8080` o mismo dominio) donde cargaste las propiedades en el CRM.

### Cómo verlo

1. Abrí la carpeta del proyecto con cualquier servidor estático (igual que para el CRM):
   ```bash
   npx serve .
   # o: python3 -m http.server 8080
   ```
2. Abrí el CRM (`http://localhost:8080/index.html`) y cargá/editá propiedades (o dejá que corran los datos demo).
3. Entrá a **Administración** en el CRM y subí el banner, el logo y los datos de contacto.
4. Abrí `http://localhost:8080/sitio-web.html` en el mismo navegador — va a mostrar las propiedades publicadas y los datos que cargaste.

### Despliegue en Hostinger

1. Subí todo el proyecto (`css/`, `js/`, `img/`, `index.html`, `sitio-web.html`) por FTP o el Administrador de archivos de hPanel.
2. El CRM queda en `tudominio.com/index.html` y el sitio público en `tudominio.com/sitio-web.html`.
3. No hace falta crear base de datos ni configurar nada más — todo funciona con `localStorage` del navegador, igual que en local.
4. Como el CRM no tiene login propio, conviene protegerlo con usuario/clave a nivel de servidor (hPanel → Avanzado → Protección con contraseña de directorios) para que sólo el equipo pueda cargar propiedades.
