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
// Primero llega el aviso de preparar (31 oct, 5 días antes) y luego el de entrega (5 nov).
assert.equal(plan2[0].fecha, "2026-10-31");
assert.equal(plan2[0].total, 0);
assert.equal(plan2[0].preparar, 4);
const p5nov = plan2.find(p => p.fecha === "2026-11-05");
assert.equal(p5nov.total, 4);
assert.equal(plan2.find(p => p.fecha > "2026-10-31" && p.fecha < "2026-11-05"), undefined);

// A las 07:00 del día, el aviso de hoy todavía se programa.
const temprano = planRecordatorios(negocios, entregas, { hora: "08:00", ahora: new Date(2026, 9, 21, 7, 0) });
assert.equal(temprano[0].fecha, "2026-10-21");
// IDs únicos y dentro del rango que la app cancela al reprogramar.
assert.ok(plan.every(p => p.id >= 1000 && p.id <= 1099));
assert.equal(new Set(plan.map(p => p.id)).size, plan.length);
// Estado en un día dado.
assert.equal(estado(negocios[0], entregas, "2026-10-21").tipo, "today");

console.log("OK —", plan.length, "avisos planeados. Primero:", p0.fecha, "08:00 →", p0.title, "|", p0.body);

/* ---- aviso de preparación 5 días antes ---- */
{
  const neg = [
    { id: "x", nombre: "Café", frecuenciaDias: 15 },
    { id: "y", nombre: "Gimnasio", frecuenciaDias: 15 }
  ];
  const ent = [
    { id: "1", negocioId: "x", fecha: "2026-10-15", tipos: { normal: 12, sinAzucar: 6, proteina: 0 }, cantidad: 18 }, // toca 30 oct
    { id: "2", negocioId: "y", fecha: "2026-10-20", tipos: { normal: 0, sinAzucar: 0, proteina: 20 }, cantidad: 20 }  // toca 4 nov
  ];
  const ahora = new Date(2026, 9, 23, 18, 48);
  const plan = planRecordatorios(neg, ent, { hora: "08:00", dias: 30, ahora });
  const dia = f => plan.find(p => p.fecha === f);

  // 25 oct: 5 días antes del Café (30 oct)
  const p25 = dia("2026-10-25");
  assert.ok(p25, "aviso de preparación el 25 oct");
  assert.equal(p25.total, 0);
  assert.equal(p25.preparar, 1);
  assert.equal(p25.fechaEntregaPreparar, "2026-10-30");
  assert.match(p25.title, /^Prepara brownies: 1 entrega el /);
  assert.match(p25.largeBody, /Café — la última vez: 12 Normal, 6 Sin azúcar/);
  assert.ok(!p25.largeBody.includes("Proteína"), "solo los tipos que se dejaron");

  // Días intermedios (26–29 oct) sin aviso
  for (const f of ["2026-10-24", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]) assert.equal(dia(f), undefined, "sin aviso el " + f);

  // 30 oct: entrega del Café + preparar Gimnasio (4 nov) en un solo aviso
  const p30 = dia("2026-10-30");
  assert.equal(p30.total, 1);
  assert.equal(p30.preparar, 1);
  assert.match(p30.title, /^Hoy toca 1 entrega · prepara 1 para el /);
  assert.match(p30.body, /^Café · Preparar para el .*: Gimnasio$/);
  assert.match(p30.largeBody, /^Hoy:\n• Café\n\nPreparar para el .* \(en 5 días\):\n• Gimnasio — la última vez: 20 Proteína$/);

  // 31 oct: el Café sigue atrasado si no se registra
  assert.equal(dia("2026-10-31").total, 1);
  assert.match(dia("2026-10-31").body, /Café \(atrasada 1 d\)/);

  // Si se registra la entrega del Café el 30, desaparece de los avisos siguientes y su próximo "preparar" cae el 9 nov
  const ent2 = ent.concat([{ id: "3", negocioId: "x", fecha: "2026-10-30", tipos: { normal: 10, sinAzucar: 5, proteina: 0 }, cantidad: 15 }]);
  const plan2 = planRecordatorios(neg, ent2, { hora: "08:00", dias: 30, ahora });
  assert.equal(plan2.find(p => p.fecha === "2026-10-31"), undefined);
  const p9 = plan2.find(p => p.fecha === "2026-11-09");
  assert.equal(p9.preparar, 1);
  assert.match(p9.largeBody, /Café — la última vez: 10 Normal, 5 Sin azúcar/);

  // Negocio pausado no genera aviso de preparar
  const plan3 = planRecordatorios([{ ...neg[0], activo: false }], ent, { hora: "08:00", ahora });
  assert.equal(plan3.length, 0);

  // Varios por preparar el mismo día
  const ent4 = [ent[0], { id: "5", negocioId: "y", fecha: "2026-10-15", cantidad: 8 }];
  const p25b = planRecordatorios(neg, ent4, { hora: "08:00", ahora }).find(p => p.fecha === "2026-10-25");
  assert.equal(p25b.preparar, 2);
  assert.match(p25b.title, /2 entregas el /);
  assert.match(p25b.body, /^En 5 días: Café, Gimnasio$/);

  console.log("OK — aviso de preparación 5 días antes:", p25.title, "|", p25.largeBody.replace(/\n/g, " / "));
}
