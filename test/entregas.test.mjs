import assert from "node:assert/strict";
import { validarCantidades, piezas, sobrantes, resultados, estadisticas, desdeRango, porMes, totalTipos } from "../src/core.js";

/* ---- validación de cantidades ---- */
let v = validarCantidades({ normal: "12", sinAzucar: "", proteina: "0" }, { requiereAlguno: true });
assert.equal(v.ok, true);
assert.deepEqual(v.valores, { normal: 12, sinAzucar: 0, proteina: 0 });

for (const malo of ["-3", "2.5", "abc", "1e3", " - 1"]) {
  v = validarCantidades({ normal: malo }, { requiereAlguno: true });
  assert.equal(v.ok, false, "debe rechazar " + malo);
  assert.ok(v.errores.normal, "marca el campo con " + malo);
}
v = validarCantidades({ normal: "10000" });
assert.equal(v.ok, false);
v = validarCantidades({ normal: "", sinAzucar: "0", proteina: "" }, { requiereAlguno: true });
assert.equal(v.ok, false);
assert.match(v.error, /al menos un brownie/);
v = validarCantidades({ normal: "0" }); // sobrantes: 0 es válido sin requerir piezas
assert.equal(v.ok, true);

/* ---- compatibilidad con entregas guardadas antes de los tipos ---- */
assert.deepEqual(piezas({ cantidad: 24 }), { normal: 24, sinAzucar: 0, proteina: 0 });
assert.deepEqual(sobrantes({ devueltos: 3 }), { normal: 3, sinAzucar: 0, proteina: 0 });
assert.equal(sobrantes({ devueltos: null }), null);

/* ---- ventas por tipo ---- */
const negocios = [{ id: "a", nombre: "Café" }, { id: "b", nombre: "Gimnasio" }];
const entregas = [
  { id: "1", negocioId: "a", fecha: "2026-09-20", cantidad: 20 },                                                    // antigua: 20 normal
  { id: "2", negocioId: "a", fecha: "2026-10-05", tipos: { normal: 10, sinAzucar: 6, proteina: 4 }, sobrantes: null },   // no se contaron sobrantes
  { id: "3", negocioId: "a", fecha: "2026-10-20", tipos: { normal: 12, sinAzucar: 6, proteina: 6 }, sobrantes: { normal: 2, sinAzucar: 1, proteina: 0 } },
  { id: "4", negocioId: "b", fecha: "2026-10-15", tipos: { normal: 0, sinAzucar: 0, proteina: 15 }, sobrantes: null },
  { id: "5", negocioId: "b", fecha: "2026-10-21", tipos: { normal: 0, sinAzucar: 0, proteina: 18 }, sobrantes: { normal: 0, sinAzucar: 0, proteina: 5 } }
];
const ra = resultados(entregas, "a");
assert.equal(ra[0].vendidos, null, "sin sobrantes anotados en la visita 2 no hay venta de la 1");
assert.deepEqual(ra[1].vendidosTipos, { normal: 8, sinAzucar: 5, proteina: 4 });
assert.equal(ra[1].vendidos, 17);
assert.equal(ra[2].vendidos, null, "la última entrega aún no tiene venta");

/* ---- rangos ---- */
assert.equal(desdeRango("7", "2026-10-21"), "2026-10-15");
assert.equal(desdeRango("15", "2026-10-21"), "2026-10-07");
assert.equal(desdeRango("30", "2026-10-21"), "2026-09-22");
assert.equal(desdeRango("all", "2026-10-21"), "0000-01-01");

let st = estadisticas(negocios, entregas, { rango: "7", hoy: "2026-10-21" });
assert.equal(st.total.visitas, 3, "7 días: entregas del 15, 20 y 21");
assert.equal(st.total.entregadas, 24 + 15 + 18);
assert.equal(st.top.n.id, "b");
assert.equal(st.porTipo.proteina.entregadas, 6 + 15 + 18);
assert.equal(st.porTipo.proteina.vendidos, 10, "15 dejados − 5 sobrantes");
assert.equal(st.porTipo.proteina.pct, 67);
assert.equal(st.porTipo.normal.pct, null, "sin datos de venta de normal en 7 días");

st = estadisticas(negocios, entregas, { rango: "15", hoy: "2026-10-21" });
assert.equal(st.total.visitas, 3, "15 días = desde el 7 oct; la del 5 oct queda fuera");
assert.equal(st.porNegocio.find(r => r.n.id === "a").pct, null);

st = estadisticas(negocios, entregas, { rango: "30", hoy: "2026-10-21" });
assert.equal(st.total.visitas, 4, "la del 20 sep queda fuera de 30 días (desde el 22)");
const cafe = st.porNegocio.find(r => r.n.id === "a");
assert.equal(cafe.entregadas, 20 + 24);
assert.equal(cafe.vendidos, 17);
assert.equal(cafe.pct, 85, "17 de 20 piezas con venta conocida");
assert.equal(cafe.tipos.sinAzucar.pct, 83);
assert.equal(cafe.promedio, 22);
st = estadisticas(negocios, entregas, { rango: "all", hoy: "2026-10-21" });
assert.equal(st.total.visitas, 5);
assert.equal(st.porTipo.normal.entregadas, 42);
assert.equal(st.porTipo.normal.participacion + st.porTipo.sinAzucar.participacion + st.porTipo.proteina.participacion >= 99, true);
assert.equal(estadisticas(negocios, [], { rango: "7" }).top, null);

/* ---- por mes ---- */
const pm = porMes(entregas, { hoy: "2026-10-21" });
assert.equal(pm.length, 6);
assert.equal(pm[5].mes, "2026-10");
assert.equal(pm[5].total, 20 + 24 + 15 + 18);
assert.equal(pm[4].tipos.normal, 20);
assert.equal(totalTipos(pm[5].tipos), pm[5].total);

console.log("OK — validación, tipos, ventas y estadísticas 7/15/30/Todo");
