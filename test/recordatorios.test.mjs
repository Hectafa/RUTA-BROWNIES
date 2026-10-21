import assert from "node:assert/strict";
import { planRecordatorios, estado } from "../src/core.js";

const negocios = [
  { id: "a", nombre: "Café La Esquina", frecuenciaDias: 15 },
  { id: "b", nombre: "Tienda Don Beto", frecuenciaDias: 15 },
  { id: "c", nombre: "Gimnasio Fuerza", frecuenciaDias: 15 },
  { id: "d", nombre: "Papelería Sol", frecuenciaDias: 15 },
  { id: "e", nombre: "Pausado", frecuenciaDias: 15, activo: false }
];
const entregas = [
  { id: "1", negocioId: "a", fecha: "2026-10-06", cantidad: 30 }, // toca 21 oct
  { id: "2", negocioId: "b", fecha: "2026-09-29", cantidad: 10 }, // tocaba 14 oct → atrasada
  { id: "3", negocioId: "c", fecha: "2026-10-05", cantidad: 25 }, // toca 20 oct
  { id: "4", negocioId: "e", fecha: "2026-01-01", cantidad: 5 }
];

// Son las 23:15 del 20 de octubre: el aviso de hoy ya pasó, el primero es mañana 21 a las 08:00.
const ahora = new Date(2026, 9, 20, 23, 15);
const plan = planRecordatorios(negocios, entregas, { hora: "08:00", dias: 30, ahora });
const p0 = plan[0];
assert.equal(p0.fecha, "2026-10-21");
assert.equal(p0.at.getHours(), 8);
assert.equal(p0.total, 4, "a (hoy), b (atrasada), c (atrasada 1), d (nuevo); el pausado no cuenta");
assert.match(p0.body, /Tienda Don Beto \(atrasada 7 d\)/);
assert.match(p0.body, /Papelería Sol \(primera entrega\)/);
assert.ok(!p0.largeBody.includes("Pausado"));
assert.match(p0.title, /Hoy tocan 4 entregas/);

// Si ya se entregó en todos el 21, no hay avisos hasta que vuelva a tocar (5 nov).
const todas = entregas.concat(["a","b","c","d"].map((n,i) => ({ id: "n"+i, negocioId: n, fecha: "2026-10-21", cantidad: 10 })));
const plan2 = planRecordatorios(negocios, todas, { hora: "08:00", dias: 30, ahora });
assert.equal(plan2[0].fecha, "2026-11-05");
assert.equal(plan2[0].total, 4);
assert.equal(plan2.find(p => p.fecha < "2026-11-05"), undefined);

// A las 07:00 del día, el aviso de hoy todavía se programa.
const temprano = planRecordatorios(negocios, entregas, { hora: "08:00", ahora: new Date(2026, 9, 21, 7, 0) });
assert.equal(temprano[0].fecha, "2026-10-21");
// IDs únicos y dentro del rango que la app cancela al reprogramar.
assert.ok(plan.every(p => p.id >= 1000 && p.id <= 1099));
assert.equal(new Set(plan.map(p => p.id)).size, plan.length);
// Estado en un día dado.
assert.equal(estado(negocios[0], entregas, "2026-10-21").tipo, "today");

console.log("OK —", plan.length, "avisos planeados. Primero:", p0.fecha, "08:00 →", p0.title, "|", p0.body);
