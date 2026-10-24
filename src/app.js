import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  DEFAULT_FREQ, todayStr, diffDays, addDays, fmt, fmtLong,
  entregasDe as _entregasDe, estado as _estado, resultados as _resultados, planRecordatorios,
  TIPOS, piezas, totalTipos, validarCantidades, RANGOS, estadisticas, porMes, DIAS_ANTICIPACION
} from "./core.js";

const NATIVO = Capacitor.isNativePlatform();
const CANAL = "recordatorios";
const ID_PRUEBA = 999;
const IDS_PLAN = { desde: 1000, hasta: 1099 };

const S = {
  negocios: [],
  entregas: [],
  ajustes: { recordatorio: true, hora: "08:00", tema: null },
  view: "ruta",
  range: "30",
  listo: false
};

const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const entregasDe = id => _entregasDe(S.entregas, id);
const estado = n => _estado(n, S.entregas);
const resultados = id => _resultados(S.entregas, id);
const negocio = id => S.negocios.find(n => n.id === id);
const totalEntrega = e => totalTipos(piezas(e));
/** "12 N · 6 SA" — solo los tipos con piezas. */
const desglose = (o, sep = " · ") => TIPOS.filter(t => o[t.id]).map(t => o[t.id] + " " + t.nombre).join(sep) || "0";

/* ---------- tema claro / oscuro ---------- */
const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const temaEfectivo = () => S.ajustes.tema || (mq && mq.matches ? "oscuro" : "claro");
function aplicarTema() {
  const t = temaEfectivo();
  document.documentElement.setAttribute("data-theme", t === "oscuro" ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "oscuro" ? "#17100C" : "#F6F2EE");
  try { localStorage.setItem("rb-tema", t); } catch (e) { /* sin almacenamiento */ }
  const b = document.getElementById("themeBtn");
  if (b) {
    b.setAttribute("aria-label", t === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    b.dataset.mode = t;
  }
}
if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (!S.ajustes.tema) aplicarTema(); });

/* ---------- guardado en el celular ---------- */
const CLAVE = "ruta-brownies-v1";
async function cargar() {
  try {
    const { value } = await Preferences.get({ key: CLAVE });
    if (value) {
      const j = JSON.parse(value);
      S.negocios = j.negocios || [];
      S.entregas = j.entregas || [];
      S.ajustes = Object.assign(S.ajustes, j.ajustes || {});
    }
  } catch (e) { console.error(e); }
}
async function persistir() {
  await Preferences.set({ key: CLAVE, value: JSON.stringify({ negocios: S.negocios, entregas: S.entregas, ajustes: S.ajustes }) });
  render();
  reprogramar();
}
async function guardar(col, obj) {
  const arr = S[col], i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  await persistir();
}
async function borrar(col, ids) {
  const set = new Set([].concat(ids));
  S[col] = S[col].filter(x => !set.has(x.id));
  await persistir();
}

/* ---------- recordatorios ---------- */
let reprogramando = Promise.resolve();
function reprogramar() {
  reprogramando = reprogramando.then(_reprogramar).catch(e => console.error("recordatorios", e));
  return reprogramando;
}
async function _reprogramar() {
  if (!NATIVO) return;
  const pend = await LocalNotifications.getPending();
  const viejas = pend.notifications.filter(n => n.id >= IDS_PLAN.desde && n.id <= IDS_PLAN.hasta).map(n => ({ id: n.id }));
  if (viejas.length) await LocalNotifications.cancel({ notifications: viejas });
  if (!S.ajustes.recordatorio) return;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") return;
  const plan = planRecordatorios(S.negocios, S.entregas, { hora: S.ajustes.hora, dias: 30, idBase: IDS_PLAN.desde });
  if (!plan.length) return;
  await LocalNotifications.schedule({
    notifications: plan.map(p => ({
      id: p.id, title: p.title, body: p.body, largeBody: p.largeBody,
      schedule: { at: p.at, allowWhileIdle: true },
      channelId: CANAL, extra: { fecha: p.fecha }
    }))
  });
}
async function prepararNotificaciones() {
  if (!NATIVO) return;
  try {
    if (Capacitor.getPlatform() === "android") {
      await LocalNotifications.createChannel({
        id: CANAL, name: "Recordatorio de entregas",
        description: "Aviso cada mañana con los negocios que toca visitar", importance: 4, visibility: 1
      });
    }
    LocalNotifications.addListener("localNotificationActionPerformed", () => { S.view = "ruta"; cerrarHoja(); render(); });
    if (S.ajustes.recordatorio) {
      const p = await LocalNotifications.checkPermissions();
      if (p.display === "prompt" || p.display === "prompt-with-rationale") await LocalNotifications.requestPermissions();
    }
  } catch (e) { console.error(e); }
  await reprogramar();
}

/* ---------- render ---------- */
const $ = id => document.getElementById(id);
const view = $("view");

function render() {
  aplicarTema();
  $("todayLabel").textContent = "Hoy: " + fmt(todayStr(), { weekday: "long", day: "numeric", month: "long" });
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.view === S.view)));
  const fab = $("fab");
  fab.textContent = S.view === "negocios" ? "+ Agregar negocio" : "+ Registrar entrega";
  fab.hidden = S.view === "stats";
  $("bell").setAttribute("aria-label", S.ajustes.recordatorio ? "Recordatorio activo a las " + S.ajustes.hora : "Recordatorio apagado");
  $("bell").classList.toggle("off", !S.ajustes.recordatorio);
  $("bellHora").textContent = S.ajustes.recordatorio ? S.ajustes.hora : "Apagado";
  if (!S.listo) { view.innerHTML = '<div class="empty">Cargando tu ruta…</div>'; return; }
  view.innerHTML = S.view === "ruta" ? renderRuta() : S.view === "negocios" ? renderNegocios() : renderStats();
}

function cardHTML(n, st) {
  const u = st.ultima;
  const meta = u
    ? "Última: " + fmt(u.fecha) + " (hace " + diffDays(u.fecha, todayStr()) + " d) · <span class=\"num\">" + totalEntrega(u) + "</span> pzas"
    : "Aún no hay entregas registradas";
  const mix = u ? '<span class="meta mix">' + esc(desglose(piezas(u))) + '</span>' : '';
  return '<div class="card ' + st.tipo + '" tabindex="0" data-open="' + esc(n.id) + '">' +
    '<span class="stripe"></span><div class="body"><span class="name">' + esc(n.nombre) + '</span>' +
    (n.direccion ? '<span class="meta">' + esc(n.direccion) + '</span>' : '') +
    '<span class="meta">' + meta + '</span>' + mix +
    '<span><span class="pill ' + st.tipo + '">' + esc(st.texto) + '</span></span></div>' +
    '<button class="btn small primary" data-deliver="' + esc(n.id) + '">Entregar</button></div>';
}

function renderRuta() {
  const activos = S.negocios.filter(n => n.activo !== false);
  if (!activos.length) return '<div class="empty">Todavía no hay negocios en tu ruta.<br><br><button class="btn primary" id="addFirst">Agregar el primer negocio</button></div>';
  const items = activos.map(n => ({ n, st: estado(n) })).sort((a, b) => a.st.orden - b.st.orden);
  const c = t => items.filter(i => i.st.tipo === t).length;
  let html = '<div class="summary">';
  if (c("late")) html += '<span class="pill late">' + c("late") + ' atrasada' + (c("late") > 1 ? 's' : '') + '</span>';
  if (c("today")) html += '<span class="pill today">' + c("today") + ' para hoy</span>';
  if (c("new")) html += '<span class="pill new">' + c("new") + ' sin primera entrega</span>';
  if (c("soon")) html += '<span class="pill soon">' + c("soon") + ' en los próximos 3 días</span>';
  if (c("ok")) html += '<span class="pill ok">' + c("ok") + ' al día</span>';
  html += '</div>';
  const grupos = [
    ["Toca visitar ahora", items.filter(i => ["late", "today", "new"].includes(i.st.tipo))],
    ["Próximos 3 días", items.filter(i => i.st.tipo === "soon")],
    ["Al día", items.filter(i => i.st.tipo === "ok")]
  ];
  grupos.forEach(([t, list]) => { if (list.length) html += '<section class="group"><h2>' + t + '</h2>' + list.map(i => cardHTML(i.n, i.st)).join("") + '</section>'; });
  return html;
}

function renderNegocios() {
  if (!S.negocios.length) return '<div class="empty">Agrega los establecimientos donde dejas brownies.<br><br><button class="btn primary" id="addFirst">Agregar negocio</button></div>';
  const list = S.negocios.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return '<section class="group"><h2>' + list.length + ' negocio' + (list.length > 1 ? 's' : '') + '</h2>' + list.map(n => {
    const es = entregasDe(n.id), tot = es.reduce((s, e) => s + totalEntrega(e), 0);
    return '<div class="card ' + (n.activo === false ? '' : 'new') + '" tabindex="0" data-open="' + esc(n.id) + '"><span class="stripe"></span><div class="body">' +
      '<span class="name">' + esc(n.nombre) + (n.activo === false ? ' <span class="pill late">Pausado</span>' : '') + '</span>' +
      '<span class="meta">Cada ' + esc(n.frecuenciaDias || DEFAULT_FREQ) + ' días' + (n.contacto ? ' · ' + esc(n.contacto) : '') + (n.telefono ? ' · ' + esc(n.telefono) : '') + '</span>' +
      '<span class="meta"><span class="num">' + es.length + '</span> entregas · <span class="num">' + tot + '</span> pzas en total</span></div>' +
      '<button class="btn small" data-edit="' + esc(n.id) + '">Editar</button></div>';
  }).join("") + '</section>';
}

/* barra apilada por tipo; `escala` = valor que ocupa el 100 % */
function barraTipos(tipos, escala) {
  return '<div class="stack" role="img" aria-label="' + esc(desglose(tipos, ", ")) + '">' +
    TIPOS.map(t => { const v = tipos[t.id] || 0; return v ? '<span class="seg-' + t.id + '" style="width:' + (v / escala * 100) + '%"></span>' : ''; }).join("") + '</div>';
}
const leyendaTipos = () => '<div class="legend">' + TIPOS.map(t => '<span><i class="sw-' + t.id + '"></i>' + t.nombre + '</span>').join("") + '</div>';
const pctTxt = p => (p == null ? "—" : p + "%");

function renderStats() {
  const seg = '<div class="seg" role="group" aria-label="Periodo">' +
    RANGOS.map(r => '<button data-range="' + r.id + '" aria-pressed="' + (S.range === r.id) + '">' + r.nombre + '</button>').join("") + '</div>';
  const st = estadisticas(S.negocios, S.entregas, { rango: S.range });
  const rango = RANGOS.find(r => r.id === S.range);
  const periodo = rango.dias == null ? "Todo el historial" : "Del " + fmt(st.desde) + " al " + fmt(st.hasta);
  let html = '<div class="stats-head"><h2 class="section-h">Estadísticas</h2>' + seg + '</div><p class="hint">' + periodo + '</p>';
  if (!st.total.visitas) return html + '<div class="empty">No hay entregas en este periodo. Registra entregas para ver qué negocios y qué tipos de brownie se mueven más.</div>';

  const tipoTop = TIPOS.slice().sort((a, b) => st.porTipo[b.id].entregadas - st.porTipo[a.id].entregadas)[0];
  html += '<div class="kpis">' +
    '<div class="kpi"><div class="v">' + st.total.entregadas + '</div><div class="l">pzas entregadas en ' + st.total.visitas + ' visita' + (st.total.visitas > 1 ? 's' : '') + '</div></div>' +
    '<div class="kpi"><div class="v">' + pctTxt(st.total.pct) + '</div><div class="l">de los brownies se vendieron</div></div>' +
    '<div class="kpi"><div class="v v-name">' + esc(st.top.n.nombre) + '</div><div class="l">el negocio que más mueve · más pedido: ' + tipoTop.nombre + '</div></div></div>';

  // por tipo
  html += '<section class="panel"><h2 class="section-h">Por tipo de brownie</h2>' +
    barraTipos(Object.fromEntries(TIPOS.map(t => [t.id, st.porTipo[t.id].entregadas])), st.total.entregadas) +
    '<div class="table-wrap"><table class="tipos"><thead><tr><th>Tipo</th><th>Entregados</th><th>Vendidos</th><th>% venta</th></tr></thead><tbody>' +
    TIPOS.map(t => { const x = st.porTipo[t.id]; return '<tr><td><i class="sw-' + t.id + '"></i>' + t.nombre + '</td><td class="num">' + x.entregadas + ' <small>(' + x.participacion + '%)</small></td><td class="num">' + (x.base ? x.vendidos : "—") + '</td><td class="num">' + pctTxt(x.pct) + '</td></tr>'; }).join("") +
    '</tbody></table></div></section>';

  // por negocio
  const max = Math.max(...st.porNegocio.map(r => r.entregadas), 1);
  html += '<section class="panel"><h2 class="section-h">Por negocio</h2>' + leyendaTipos() + '<div class="rank">' +
    st.porNegocio.map(r => '<div class="rank-item"><div class="top"><span>' + esc(r.n.nombre) + '</span><span class="num">' + r.entregadas + ' pzas</span></div>' +
      barraTipos(Object.fromEntries(TIPOS.map(t => [t.id, r.tipos[t.id].entregadas])), max) +
      '<div class="sub">' + esc(desglose(Object.fromEntries(TIPOS.map(t => [t.id, r.tipos[t.id].entregadas])))) + '</div>' +
      '<div class="sub">' + r.visitas + ' entrega' + (r.visitas > 1 ? 's' : '') + ' · promedio ' + r.promedio + ' pzas · ' +
      (r.pct != null ? 'vende el ' + r.pct + '%' + ventaPorTipo(r) : 'venta sin datos aún') + '</div></div>').join("") +
    '</div><p class="note">"Vendidos" se calcula con los sobrantes que anotas al hacer la siguiente entrega.</p></section>';

  // por mes
  const meses = porMes(S.entregas), mmax = Math.max(...meses.map(m => m.total), 1);
  html += '<section class="panel"><h2 class="section-h">Piezas por mes · últimos 6 meses</h2><div class="months">' +
    meses.map(m => '<div class="month"><span class="val">' + m.total + '</span><span class="colstack" style="height:' + (m.total / mmax * 78) + '%">' +
      TIPOS.slice().reverse().map(t => m.tipos[t.id] ? '<span class="seg-' + t.id + '" style="flex:' + m.tipos[t.id] + '"></span>' : '').join("") +
      '</span><span class="lab">' + fmt(m.mes + "-01", { month: "short" }) + '</span></div>').join("") +
    '</div>' + leyendaTipos() + '</section>';
  return html;
}
function ventaPorTipo(r) {
  const partes = TIPOS.filter(t => r.tipos[t.id].pct != null && r.tipos[t.id].base).map(t => t.nombre + ' ' + r.tipos[t.id].pct + '%');
  return partes.length > 1 ? ' (' + partes.join(', ') + ')' : '';
}

/* ---------- hojas ---------- */
const host = $("sheetHost");
function abrirHoja(inner) {
  host.innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true">' + inner + '</div></div>';
}
function cerrarHoja() { host.innerHTML = ""; }
function toast(msg) {
  const t = $("toastHost");
  t.innerHTML = '<div class="toast" role="status">' + esc(msg) + '</div>';
  clearTimeout(toast._t); toast._t = setTimeout(() => t.innerHTML = "", 2800);
}

function negocioForm(id) {
  const n = id ? negocio(id) : { nombre: "", direccion: "", contacto: "", telefono: "", frecuenciaDias: DEFAULT_FREQ, notas: "", activo: true };
  abrirHoja('<h3>' + (id ? 'Editar negocio' : 'Nuevo negocio') + '</h3><form id="fNeg" data-id="' + esc(id || "") + '">' +
    '<label>Nombre del negocio<input id="nNombre" required maxlength="80" value="' + esc(n.nombre) + '" placeholder="Ej. Cafetería Central"></label>' +
    '<label>Dirección o zona<input id="nDir" maxlength="140" value="' + esc(n.direccion) + '" placeholder="Calle, colonia"></label>' +
    '<div class="two"><label>Encargado<input id="nCont" maxlength="60" value="' + esc(n.contacto) + '"></label>' +
    '<label>Teléfono<input id="nTel" inputmode="tel" maxlength="20" value="' + esc(n.telefono) + '"></label></div>' +
    '<label>Cada cuántos días se entrega<input id="nFreq" type="number" min="1" max="90" required value="' + esc(n.frecuenciaDias || DEFAULT_FREQ) + '"></label>' +
    '<label>Notas<textarea id="nNotas" maxlength="400" placeholder="Horario de recepción, precio acordado…">' + esc(n.notas) + '</textarea></label>' +
    (id ? '<label class="check"><input id="nActivo" type="checkbox" ' + (n.activo !== false ? 'checked' : '') + '> En ruta (desmarca para pausar)</label>' : '') +
    '<div class="row between">' + (id ? '<button type="button" class="btn danger" id="delNeg" data-id="' + esc(id) + '">Eliminar</button>' : '<span></span>') +
    '<div class="row"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>');
}

const lastText = last => last
  ? 'Entrega anterior: ' + fmtLong(last.fecha) + ' · ' + esc(desglose(piezas(last)))
  : 'Será la primera entrega en este negocio.';

function camposTipos(prefijo, valores, soloTipos) {
  return '<div class="tipos-grid">' + TIPOS.filter(t => !soloTipos || soloTipos.includes(t.id)).map(t =>
    '<label class="tipo-field"><span><i class="sw-' + t.id + '"></i>' + t.nombre + '</span>' +
    '<input id="' + prefijo + '-' + t.id + '" data-tipo="' + t.id + '" class="qty" type="number" min="0" step="1" max="9999" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="' + (valores && valores[t.id] ? valores[t.id] : '') + '">' +
    '<small class="err" id="' + prefijo + '-' + t.id + '-err" hidden></small></label>').join("") + '</div>';
}
function bloqueSobrantes(last) {
  if (!last) return '';
  const tiposPrev = TIPOS.filter(t => piezas(last)[t.id] > 0).map(t => t.id);
  if (!tiposPrev.length) return '';
  return '<fieldset class="fs" id="eDevWrap"><legend>Sobrantes de la entrega anterior</legend>' +
    '<p class="hint">Opcional. Cuántos quedaban sin vender al llegar; sirve para calcular ventas. Si llenas alguno, los vacíos cuentan como 0.</p>' +
    camposTipos("dev", null, tiposPrev) + '</fieldset>';
}
function entregaForm(negId) {
  const activos = S.negocios.filter(n => n.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (!activos.length) { toast("Primero agrega un negocio."); negocioForm(); return; }
  const sel = negId || activos[0].id;
  const last = entregasDe(sel)[0];
  abrirHoja('<h3>Registrar entrega</h3><form id="fEnt" novalidate>' +
    '<label>Negocio<select id="eNeg">' + activos.map(n => '<option value="' + esc(n.id) + '"' + (n.id === sel ? ' selected' : '') + '>' + esc(n.nombre) + '</option>').join("") + '</select></label>' +
    '<div id="eLast" class="hint">' + lastText(last) + '</div>' +
    '<label>Fecha<input id="eFecha" type="date" required value="' + todayStr() + '"></label>' +
    '<fieldset class="fs"><legend>Tipo de brownie entregado</legend>' +
    '<div id="eTiposHost">' + camposTipos("ent", last ? piezas(last) : null) + '</div>' +
    '<div class="row between total-row"><span class="hint">Total entregado</span><span class="num total" id="eTotal">0 pzas</span></div>' +
    '<p class="form-err" id="eErr" role="alert" hidden></p></fieldset>' +
    '<div id="eDevHost">' + bloqueSobrantes(last) + '</div>' +
    '<label>Notas<textarea id="eNotas" maxlength="300" placeholder="Pagó, pidió más, cambió de encargado…"></textarea></label>' +
    '<div class="row end"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Guardar entrega</button></div></form>');
  actualizarTotal();
}
function leerTipos(prefijo) {
  const raw = {};
  TIPOS.forEach(t => { const el = $(prefijo + "-" + t.id); if (el) raw[t.id] = el.value; });
  return raw;
}
function actualizarTotal() {
  const el = $("eTotal"); if (!el) return;
  const v = validarCantidades(leerTipos("ent"));
  el.textContent = totalTipos(v.valores) + " pzas";
}
function mostrarErrores(prefijo, errores) {
  TIPOS.forEach(t => {
    const inp = $(prefijo + "-" + t.id), err = $(prefijo + "-" + t.id + "-err");
    if (!inp) return;
    const m = errores[t.id];
    inp.setAttribute("aria-invalid", m ? "true" : "false");
    if (err) { err.hidden = !m; err.textContent = m || ""; }
  });
}

function detalle(id) {
  const n = negocio(id); if (!n) return;
  const st = estado(n), rs = resultados(id).reverse();
  const tot = rs.reduce((s, e) => s + e.total, 0);
  abrirHoja('<div class="row between"><h3>' + esc(n.nombre) + '</h3><span class="pill ' + st.tipo + '">' + esc(st.texto) + '</span></div>' +
    '<div class="hint">' + [n.direccion, n.contacto, n.telefono].filter(Boolean).map(esc).join(" · ") + (n.notas ? '<br>' + esc(n.notas) : '') + '</div>' +
    '<div class="row"><button class="btn primary" data-deliver="' + esc(id) + '">Registrar entrega</button><button class="btn" data-edit="' + esc(id) + '">Editar</button><button class="btn" data-close>Cerrar</button></div>' +
    '<h2 class="section-h">Historial · ' + rs.length + ' entregas · ' + tot + ' pzas</h2>' +
    (rs.length ? '<div class="hist">' + rs.map(e => '<div class="hist-row"><div class="d">' + fmtLong(e.fecha) +
      '<small>' + esc(desglose(e.piezas)) + '</small>' +
      '<small>' + (e.vendidos != null ? 'Vendió ' + e.vendidos : 'Venta pendiente') + (e.notas ? ' · ' + esc(e.notas) : '') + '</small></div>' +
      '<span class="num">' + e.total + ' pzas</span><button class="btn small danger" data-delent="' + esc(e.id) + '" data-neg="' + esc(id) + '">Borrar</button></div>').join("") + '</div>'
      : '<div class="empty">Sin entregas todavía.</div>'));
}

async function ajustesForm() {
  let permiso = "granted", exacto = "granted";
  if (NATIVO) {
    try { permiso = (await LocalNotifications.checkPermissions()).display; } catch (e) { permiso = "denied"; }
    if (Capacitor.getPlatform() === "android") {
      try { exacto = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch (e) { exacto = "granted"; }
    }
  }
  const plan = planRecordatorios(S.negocios, S.entregas, { hora: S.ajustes.hora, dias: 30 }).slice(0, 5);
  const estadoPermiso = !NATIVO
    ? '<div class="notice">Estás usando la versión de navegador. Los avisos de cada mañana funcionan en la app instalada en el celular.</div>'
    : permiso === "denied"
      ? '<div class="notice warn">Las notificaciones están bloqueadas para esta app. Actívalas en Ajustes del celular → Apps → Ruta de Brownies → Notificaciones.</div>'
      : permiso !== "granted"
        ? '<div class="notice">Falta dar permiso de notificaciones.<button type="button" class="btn small primary" id="pedirPermiso">Permitir</button></div>'
        : exacto !== "granted"
          ? '<div class="notice">El aviso puede llegar con unos minutos de diferencia. Para que llegue a la hora exacta, permite alarmas exactas.<button type="button" class="btn small" id="permExacto">Permitir</button></div>'
          : '';
  abrirHoja('<h3>Recordatorio de cada mañana</h3>' +
    '<p class="hint">A la hora que elijas, el celular te avisa:</p>' +
    '<ul class="avisos-tipos"><li><span class="pill today">Entrega</span> el día que toca y mientras siga atrasada.</li>' +
    '<li><span class="pill soon">Preparar</span> ' + DIAS_ANTICIPACION + ' días antes, con lo que dejaste la última vez en ese negocio.</li></ul>' +
    '<p class="hint">Si un día no hay nada de esto, no llega aviso.</p>' +
    estadoPermiso +
    '<form id="fAjustes">' +
    '<label class="check"><input id="aActivo" type="checkbox" ' + (S.ajustes.recordatorio ? 'checked' : '') + '> Recibir el recordatorio</label>' +
    '<label>Hora del aviso<input id="aHora" type="time" required value="' + esc(S.ajustes.hora) + '"></label>' +
    '<div class="row between">' + (NATIVO ? '<button type="button" class="btn" id="probar">Probar notificación</button>' : '<span></span>') +
    '<div class="row"><button type="button" class="btn" data-close>Cerrar</button><button class="btn primary">Guardar</button></div></div></form>' +
    '<h2 class="section-h">Próximos avisos</h2>' +
    (plan.length
      ? '<div class="hist">' + plan.map(p => '<div class="hist-row two-col"><div class="d">' + fmtLong(p.fecha) + ' · ' + esc(S.ajustes.hora) +
        '<small>' + esc(p.title) + '</small><small>' + esc(p.body) + '</small></div><span class="row pills">' +
        (p.total ? '<span class="pill today" title="Entregas">' + p.total + '</span>' : '') +
        (p.preparar ? '<span class="pill soon" title="Por preparar">' + p.preparar + '</span>' : '') + '</span></div>').join("") + '</div>'
      : '<div class="empty">No hay entregas ni preparaciones en los próximos 30 días.</div>'));
}

async function probarNotificacion() {
  const p = await LocalNotifications.checkPermissions();
  if (p.display !== "granted") {
    const r = await LocalNotifications.requestPermissions();
    if (r.display !== "granted") { toast("Sin permiso de notificaciones."); return; }
  }
  const hoy = planRecordatorios(S.negocios, S.entregas, { hora: "23:59", dias: 1 })[0];
  await LocalNotifications.schedule({
    notifications: [{
      id: ID_PRUEBA,
      title: hoy ? hoy.title : "Ruta de Brownies",
      body: hoy ? hoy.body : "Así se verá tu recordatorio de cada mañana.",
      largeBody: hoy ? hoy.largeBody : undefined,
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      channelId: CANAL
    }]
  });
  toast("Llegará una notificación en 5 segundos.");
}

/* ---------- eventos ---------- */
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button,.card,#scrim");
  if (!t) return;
  if (t.id === "scrim") { if (ev.target.id === "scrim") cerrarHoja(); return; }
  if (t.matches(".tab")) { S.view = t.dataset.view; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.range) { S.range = t.dataset.range; render(); return; }
  if (t.id === "themeBtn") {
    S.ajustes.tema = temaEfectivo() === "oscuro" ? "claro" : "oscuro";
    aplicarTema();
    toast(S.ajustes.tema === "oscuro" ? "Modo oscuro" : "Modo claro");
    try { await persistir(); } catch (e) { console.error(e); }
    return;
  }
  if (t.id === "fab") { S.view === "negocios" ? negocioForm() : entregaForm(); return; }
  if (t.id === "bell") { ajustesForm(); return; }
  if (t.id === "addFirst") { negocioForm(); return; }
  if (t.id === "probar") { try { await probarNotificacion(); } catch (e) { toast("No se pudo enviar la prueba."); } return; }
  if (t.id === "pedirPermiso") { await LocalNotifications.requestPermissions(); await reprogramar(); ajustesForm(); return; }
  if (t.id === "permExacto") { await LocalNotifications.changeExactNotificationSetting(); await reprogramar(); ajustesForm(); return; }
  if (t.hasAttribute("data-close")) { cerrarHoja(); return; }
  if (t.dataset.deliver) { ev.stopPropagation(); entregaForm(t.dataset.deliver); return; }
  if (t.dataset.edit) { ev.stopPropagation(); negocioForm(t.dataset.edit); return; }
  if (t.dataset.delent) {
    if (!t.classList.contains("armed")) { t.classList.add("armed"); t.textContent = "¿Seguro?"; return; }
    await borrar("entregas", t.dataset.delent); toast("Entrega borrada"); detalle(t.dataset.neg);
    return;
  }
  if (t.id === "delNeg") {
    if (!t.classList.contains("armed")) { t.classList.add("armed"); t.textContent = "Toca otra vez para borrar todo su historial"; return; }
    const id = t.dataset.id;
    S.entregas = S.entregas.filter(e => e.negocioId !== id);
    await borrar("negocios", id); cerrarHoja(); toast("Negocio eliminado");
    return;
  }
  if (t.matches(".card") && t.dataset.open) detalle(t.dataset.open);
});
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && host.innerHTML) cerrarHoja();
  if (ev.key === "Enter" && ev.target.matches(".card")) detalle(ev.target.dataset.open);
  // en los campos de cantidad no se aceptan signos ni decimales
  if (ev.target.matches && ev.target.matches("input.qty") && ["-", "+", "e", "E", ".", ","].includes(ev.key)) ev.preventDefault();
});
document.addEventListener("input", ev => {
  if (ev.target.matches && ev.target.matches("input.qty")) {
    const limpio = ev.target.value.replace(/[^0-9]/g, "");
    if (limpio !== ev.target.value) ev.target.value = limpio;
    if (ev.target.id.startsWith("ent-")) { actualizarTotal(); const e = $("eErr"); if (e) e.hidden = true; }
    ev.target.setAttribute("aria-invalid", "false");
    const err = $(ev.target.id + "-err"); if (err) err.hidden = true;
  }
});
document.addEventListener("change", ev => {
  if (ev.target.id === "eNeg") {
    const last = entregasDe(ev.target.value)[0];
    $("eLast").innerHTML = lastText(last);
    $("eTiposHost").innerHTML = camposTipos("ent", last ? piezas(last) : null);
    $("eDevHost").innerHTML = bloqueSobrantes(last);
    actualizarTotal();
  }
});
document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const f = ev.target, btn = f.querySelector(".btn.primary");
  if (btn) btn.disabled = true;
  try {
    if (f.id === "fNeg") {
      const id = f.dataset.id || uid(), prev = negocio(id) || {};
      const nombre = $("nNombre").value.trim();
      if (!nombre) { btn.disabled = false; return; }
      await guardar("negocios", Object.assign({}, prev, {
        id, nombre,
        direccion: $("nDir").value.trim(),
        contacto: $("nCont").value.trim(),
        telefono: $("nTel").value.trim(),
        frecuenciaDias: Math.max(1, Number($("nFreq").value) || DEFAULT_FREQ),
        notas: $("nNotas").value.trim(),
        activo: $("nActivo") ? $("nActivo").checked : true,
        creado: prev.creado || Date.now()
      }));
      cerrarHoja(); toast(f.dataset.id ? "Negocio actualizado" : "Negocio agregado");
    } else if (f.id === "fEnt") {
      const ent = validarCantidades(leerTipos("ent"), { requiereAlguno: true });
      const rawDev = leerTipos("dev");
      const hayDev = Object.values(rawDev).some(v => String(v).trim() !== "");
      const dev = validarCantidades(rawDev);
      mostrarErrores("ent", ent.errores);
      mostrarErrores("dev", dev.errores);
      if (!ent.ok || !dev.ok) {
        const e = $("eErr"); e.textContent = ent.error || "Revisa los sobrantes marcados."; e.hidden = false;
        btn.disabled = false;
        return;
      }
      const negId = $("eNeg").value, fecha = $("eFecha").value || todayStr();
      await guardar("entregas", {
        id: uid(), negocioId: negId, fecha,
        tipos: ent.valores,
        cantidad: totalTipos(ent.valores),
        sobrantes: hayDev ? dev.valores : null,
        notas: $("eNotas").value.trim(),
        creado: Date.now()
      });
      cerrarHoja();
      const n = negocio(negId);
      toast("Entrega guardada (" + totalTipos(ent.valores) + " pzas). Próxima visita: " + fmtLong(addDays(fecha, Number(n && n.frecuenciaDias) || DEFAULT_FREQ)));
    } else if (f.id === "fAjustes") {
      const activo = $("aActivo").checked;
      S.ajustes = Object.assign({}, S.ajustes, { recordatorio: activo, hora: $("aHora").value || "08:00" });
      if (activo && NATIVO) {
        const p = await LocalNotifications.checkPermissions();
        if (p.display !== "granted") await LocalNotifications.requestPermissions();
      }
      await persistir();
      cerrarHoja();
      toast(activo ? "Te avisaremos cada día a las " + S.ajustes.hora : "Recordatorio apagado");
    }
  } catch (e) {
    console.error(e);
    if (btn) btn.disabled = false;
    toast("No se pudo guardar. Inténtalo de nuevo.");
  }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.listo) { render(); reprogramar(); } });

/* ---------- arranque ---------- */
(async function iniciar() {
  render();
  await cargar();
  S.listo = true;
  render();
  await prepararNotificaciones();
})();
