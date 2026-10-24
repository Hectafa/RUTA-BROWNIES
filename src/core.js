// Lógica pura de la app: fechas, estado de cada negocio, ventas y plan de recordatorios.
// No depende del navegador ni de Capacitor, así que se puede probar con Node.

export const DEFAULT_FREQ = 15;

const pad = n => String(n).padStart(2, "0");

/** Fecha local de un Date como "AAAA-MM-DD". */
export const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const todayStr = () => ymd(new Date());

const toUTC = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
/** Días de a hasta b (b − a). */
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const addDays = (s, n) => {
  const t = new Date(toUTC(s) + n * 86400000);
  return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
};
export const fmt = (s, opts) =>
  new Date(toUTC(s)).toLocaleDateString("es-MX", Object.assign({ timeZone: "UTC" }, opts || { day: "numeric", month: "short" }));
export const fmtLong = s => fmt(s, { weekday: "short", day: "numeric", month: "short" });

export function entregasDe(entregas, negocioId) {
  return entregas
    .filter(e => e.negocioId === negocioId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
}

/** Estado de un negocio visto desde la fecha `hoy` (por defecto, hoy). */
export function estado(n, entregas, hoy = todayStr()) {
  const es = entregasDe(entregas, n.id);
  const freq = Number(n.frecuenciaDias) || DEFAULT_FREQ;
  if (!es.length) return { tipo: "new", texto: "Primera entrega pendiente", orden: -1, ultima: null, prox: null, dias: null };
  const ultima = es[0], prox = addDays(ultima.fecha, freq), d = diffDays(hoy, prox);
  let tipo, texto;
  if (d < 0) { tipo = "late"; texto = "Atrasada " + (-d) + (d === -1 ? " día" : " días"); }
  else if (d === 0) { tipo = "today"; texto = "Toca hoy"; }
  else if (d <= 3) { tipo = "soon"; texto = (d === 1 ? "Mañana" : "En " + d + " días") + " · " + fmtLong(prox); }
  else { tipo = "ok"; texto = "En " + d + " días · " + fmt(prox); }
  return { tipo, texto, orden: d, ultima, prox, dias: d };
}

/* ---------- tipos de brownie ---------- */
export const TIPOS = [
  { id: "normal", nombre: "Normal", corto: "N" },
  { id: "sinAzucar", nombre: "Sin azúcar", corto: "SA" },
  { id: "proteina", nombre: "Proteína", corto: "P" }
];
const ceros = () => ({ normal: 0, sinAzucar: 0, proteina: 0 });
export const totalTipos = o => (o ? TIPOS.reduce((s, t) => s + (Number(o[t.id]) || 0), 0) : 0);

/** Piezas dejadas por tipo. Las entregas anteriores a los tipos (solo `cantidad`) cuentan como Normal. */
export function piezas(e) {
  if (e.tipos) { const o = ceros(); TIPOS.forEach(t => { o[t.id] = Number(e.tipos[t.id]) || 0; }); return o; }
  return Object.assign(ceros(), { normal: Number(e.cantidad) || 0 });
}
/** Sobrantes por tipo recogidos en esta visita (de la entrega anterior), o null si no se contaron. */
export function sobrantes(e) {
  if (e.sobrantes) { const o = ceros(); TIPOS.forEach(t => { o[t.id] = Number(e.sobrantes[t.id]) || 0; }); return o; }
  if (e.devueltos != null && e.devueltos !== "") return Object.assign(ceros(), { normal: Number(e.devueltos) || 0 });
  return null;
}

/**
 * Valida lo capturado en el formulario: cada campo vacío cuenta como 0; si no, debe ser un entero ≥ 0.
 * `requiereAlguno`: al menos una pieza en total (para las piezas entregadas).
 * Devuelve { ok, valores, errores: {tipoId: mensaje}, error }.
 */
export function validarCantidades(raw, { requiereAlguno = false } = {}) {
  const valores = ceros(), errores = {};
  TIPOS.forEach(t => {
    const v = raw[t.id] == null ? "" : String(raw[t.id]).trim();
    if (v === "") return;
    if (!/^\d+$/.test(v)) { errores[t.id] = "Escribe un número entero de 0 o más."; return; }
    const n = Number(v);
    if (n > 9999) { errores[t.id] = "Máximo 9999."; return; }
    valores[t.id] = n;
  });
  let error = null;
  if (Object.keys(errores).length) error = "Revisa las cantidades marcadas.";
  else if (requiereAlguno && totalTipos(valores) === 0) error = "Registra al menos un brownie entregado.";
  return { ok: !error, valores, errores, error };
}

/**
 * Resultado de cada entrega de un negocio, por tipo.
 * Vendidos = piezas dejadas − sobrantes anotados en la visita siguiente (null mientras no haya visita siguiente con sobrantes).
 */
export function resultados(entregas, negocioId) {
  const es = entregasDe(entregas, negocioId).slice().reverse();
  return es.map((e, i) => {
    const p = piezas(e), sig = es[i + 1], s = sig ? sobrantes(sig) : null;
    let vendidosTipos = null;
    if (s) { vendidosTipos = ceros(); TIPOS.forEach(t => { vendidosTipos[t.id] = Math.max(0, p[t.id] - s[t.id]); }); }
    return Object.assign({}, e, {
      piezas: p,
      total: totalTipos(p),
      vendidosTipos,
      vendidos: vendidosTipos ? totalTipos(vendidosTipos) : null
    });
  });
}

/* ---------- estadísticas ---------- */
export const RANGOS = [
  { id: "7", nombre: "7 días", dias: 7 },
  { id: "15", nombre: "15 días", dias: 15 },
  { id: "30", nombre: "30 días", dias: 30 },
  { id: "all", nombre: "Todo", dias: null }
];
/** Primer día incluido en el rango (los últimos N días contando hoy). */
export function desdeRango(rango, hoy = todayStr()) {
  const r = RANGOS.find(x => x.id === rango);
  return !r || r.dias == null ? "0000-01-01" : addDays(hoy, -(r.dias - 1));
}

const acumulador = () => ({ entregadas: 0, vendidos: 0, base: 0 });
const pct = a => (a.base ? Math.round(a.vendidos / a.base * 100) : null);

/**
 * Estadísticas del rango, por tipo y por negocio.
 * "base" = piezas de las entregas cuya venta ya se conoce; el % vendido se calcula sobre esa base.
 */
export function estadisticas(negocios, entregas, { rango = "30", hoy = todayStr() } = {}) {
  const desde = desdeRango(rango, hoy);
  const en = e => e.fecha >= desde && e.fecha <= hoy;
  const total = Object.assign(acumulador(), { visitas: 0 });
  const porTipo = {}; TIPOS.forEach(t => { porTipo[t.id] = acumulador(); });
  const porNegocio = [];
  negocios.forEach(n => {
    const rs = resultados(entregas, n.id).filter(en);
    if (!rs.length) return;
    const fila = Object.assign(acumulador(), { n, visitas: rs.length, tipos: {} });
    TIPOS.forEach(t => { fila.tipos[t.id] = acumulador(); });
    rs.forEach(r => {
      TIPOS.forEach(t => {
        const q = r.piezas[t.id], ft = fila.tipos[t.id], gt = porTipo[t.id];
        ft.entregadas += q; gt.entregadas += q;
        if (r.vendidosTipos) {
          const v = r.vendidosTipos[t.id];
          ft.vendidos += v; ft.base += q; gt.vendidos += v; gt.base += q;
        }
      });
      fila.entregadas += r.total;
      if (r.vendidosTipos) { fila.vendidos += r.vendidos; fila.base += r.total; }
    });
    fila.pct = pct(fila);
    fila.promedio = Math.round(fila.entregadas / fila.visitas);
    TIPOS.forEach(t => { fila.tipos[t.id].pct = pct(fila.tipos[t.id]); });
    total.entregadas += fila.entregadas; total.vendidos += fila.vendidos; total.base += fila.base; total.visitas += fila.visitas;
    porNegocio.push(fila);
  });
  porNegocio.sort((a, b) => b.entregadas - a.entregadas || a.n.nombre.localeCompare(b.n.nombre, "es"));
  TIPOS.forEach(t => {
    porTipo[t.id].pct = pct(porTipo[t.id]);
    porTipo[t.id].participacion = total.entregadas ? Math.round(porTipo[t.id].entregadas / total.entregadas * 100) : 0;
  });
  total.pct = pct(total);
  return { desde, hasta: hoy, total, porTipo, porNegocio, top: porNegocio[0] || null };
}

/** Piezas por mes y por tipo, últimos `meses` meses. */
export function porMes(entregas, { meses = 6, hoy = todayStr() } = {}) {
  const [y, m] = hoy.split("-").map(Number), out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const clave = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1);
    const tipos = ceros();
    entregas.filter(e => e.fecha.startsWith(clave)).forEach(e => { const p = piezas(e); TIPOS.forEach(t => { tipos[t.id] += p[t.id]; }); });
    out.push({ mes: clave, tipos, total: totalTipos(tipos) });
  }
  return out;
}

/**
 * Plan de avisos para los próximos `dias` días a la hora indicada ("HH:MM").
 * Cada día avisa de los negocios que, si no se registra nada más, ya tocan o están atrasados.
 * Los días sin entregas pendientes no generan aviso.
 * Se recalcula cada vez que cambian los datos, así que registrar una entrega quita ese negocio de los avisos.
 */
export const DIAS_ANTICIPACION = 5;

const lista = nombres => nombres.length > 3 ? nombres.slice(0, 3).join(", ") + " y " + (nombres.length - 3) + " más" : nombres.join(", ");

/**
 * Un aviso por día (a lo más) que junta dos cosas:
 * - Entregas de hoy, atrasadas o primeras entregas pendientes.
 * - Aviso para preparar: negocios cuya próxima entrega cae dentro de `anticipacion` días exactos,
 *   con lo que se dejó la última vez como referencia.
 */
export function planRecordatorios(negocios, entregas, { hora = "08:00", dias = 30, ahora = new Date(), idBase = 1000, anticipacion = DIAS_ANTICIPACION } = {}) {
  const [hh, mm] = hora.split(":").map(Number);
  const plan = [];
  const base = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const activos = negocios.filter(n => n.activo !== false);
  for (let i = 0; i < dias; i++) {
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, hh, mm || 0, 0, 0);
    if (at <= ahora) continue;
    const dia = ymd(at);
    const estados = activos.map(n => ({ n, st: estado(n, entregas, dia) }));
    const pendientes = estados
      .filter(x => x.st.tipo === "new" || x.st.dias <= 0)
      .sort((a, b) => a.st.orden - b.st.orden);
    const preparar = anticipacion > 0
      ? estados.filter(x => x.st.dias === anticipacion).sort((a, b) => a.n.nombre.localeCompare(b.n.nombre, "es"))
      : [];
    if (!pendientes.length && !preparar.length) continue;

    const etiqueta = x =>
      x.st.tipo === "new" ? x.n.nombre + " (primera entrega)"
      : x.st.dias === 0 ? x.n.nombre
      : x.n.nombre + " (atrasada " + (-x.st.dias) + " d)";
    const nombres = pendientes.map(etiqueta);
    const fechaEntrega = addDays(dia, anticipacion);
    const cuando = fmtLong(fechaEntrega);
    const prepNombres = preparar.map(x => x.n.nombre);
    const prepDetalle = preparar.map(x => {
      const p = piezas(x.st.ultima), d = TIPOS.filter(t => p[t.id]).map(t => p[t.id] + " " + t.nombre).join(", ");
      return "• " + x.n.nombre + (d ? " — la última vez: " + d : "");
    });

    let title;
    if (pendientes.length && preparar.length) {
      title = (pendientes.length === 1 ? "Hoy toca 1 entrega" : "Hoy tocan " + pendientes.length + " entregas") +
        " · prepara " + preparar.length + " para el " + cuando;
    } else if (pendientes.length) {
      title = pendientes.length === 1 ? "Hoy toca 1 entrega de brownies" : "Hoy tocan " + pendientes.length + " entregas de brownies";
    } else {
      title = "Prepara brownies: " + (preparar.length === 1 ? "1 entrega" : preparar.length + " entregas") + " el " + cuando;
    }
    const partes = [];
    if (nombres.length) partes.push(lista(nombres));
    if (prepNombres.length) partes.push((nombres.length ? "Preparar para el " + cuando + ": " : "En " + anticipacion + " días: ") + lista(prepNombres));
    const largo = [];
    if (nombres.length) largo.push((prepNombres.length ? "Hoy:\n" : "") + nombres.map(s => "• " + s).join("\n"));
    if (prepNombres.length) largo.push("Preparar para el " + cuando + " (en " + anticipacion + " días):\n" + prepDetalle.join("\n"));

    plan.push({
      id: idBase + i,
      at,
      fecha: dia,
      title,
      body: partes.join(" · "),
      largeBody: largo.join("\n\n"),
      total: pendientes.length,
      preparar: preparar.length,
      fechaEntregaPreparar: preparar.length ? fechaEntrega : null
    });
  }
  return plan;
}
