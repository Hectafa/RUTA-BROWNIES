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

/** Vendidos de cada entrega = piezas dejadas − sobrantes anotados en la visita siguiente. */
export function resultados(entregas, negocioId) {
  const es = entregasDe(entregas, negocioId).slice().reverse();
  return es.map((e, i) => {
    const sig = es[i + 1];
    const known = sig && sig.devueltos != null && sig.devueltos !== "";
    return Object.assign({}, e, { vendidos: known ? Math.max(0, Number(e.cantidad) - Number(sig.devueltos)) : null });
  });
}

/**
 * Plan de avisos para los próximos `dias` días a la hora indicada ("HH:MM").
 * Cada día avisa de los negocios que, si no se registra nada más, ya tocan o están atrasados.
 * Los días sin entregas pendientes no generan aviso.
 * Se recalcula cada vez que cambian los datos, así que registrar una entrega quita ese negocio de los avisos.
 */
export function planRecordatorios(negocios, entregas, { hora = "08:00", dias = 30, ahora = new Date(), idBase = 1000 } = {}) {
  const [hh, mm] = hora.split(":").map(Number);
  const plan = [];
  const base = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const activos = negocios.filter(n => n.activo !== false);
  for (let i = 0; i < dias; i++) {
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, hh, mm || 0, 0, 0);
    if (at <= ahora) continue;
    const dia = ymd(at);
    const pendientes = activos
      .map(n => ({ n, st: estado(n, entregas, dia) }))
      .filter(x => x.st.tipo === "new" || x.st.dias <= 0)
      .sort((a, b) => a.st.orden - b.st.orden);
    if (!pendientes.length) continue;
    const etiqueta = x =>
      x.st.tipo === "new" ? x.n.nombre + " (primera entrega)"
      : x.st.dias === 0 ? x.n.nombre
      : x.n.nombre + " (atrasada " + (-x.st.dias) + " d)";
    const nombres = pendientes.map(etiqueta);
    const corto = nombres.length > 3 ? nombres.slice(0, 3).join(", ") + " y " + (nombres.length - 3) + " más" : nombres.join(", ");
    plan.push({
      id: idBase + i,
      at,
      fecha: dia,
      title: pendientes.length === 1 ? "Hoy toca 1 entrega de brownies" : "Hoy tocan " + pendientes.length + " entregas de brownies",
      body: corto,
      largeBody: nombres.map(s => "• " + s).join("\n"),
      total: pendientes.length
    });
  }
  return plan;
}
