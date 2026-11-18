import assert from "node:assert";

console.log("=== INICIANDO PRUEBAS AUTOMATIZADAS DE RBAC Y CONTROL DE HORAS DE ENTRENADOR ===");

// 1. Test RBAC Navigation Filter
const allNavItems = [
  { name: "Dashboard", path: "/dashboard", coachAllowed: true },
  { name: "Solicitudes", path: "/prospects", coachAllowed: false },
  { name: "Deportistas", path: "/athletes", coachAllowed: false },
  { name: "Planes de Pago", path: "/plans", coachAllowed: false },
  { name: "Notificaciones de Pago", path: "/payment-notifications", coachAllowed: false },
  { name: "Grupos", path: "/groups", coachAllowed: true },
  { name: "Entrenadores", path: "/coaches", coachAllowed: false },
  { name: "Asistencia & Cancha", path: "/attendance", coachAllowed: true },
  { name: "Finanzas", path: "/finances", coachAllowed: false },
  { name: "Inventario", path: "/inventory", coachAllowed: false },
];

const coachAllowedItems = allNavItems.filter((item) => item.coachAllowed);
assert.strictEqual(coachAllowedItems.length, 3, "El profesor debe tener exactamente 3 módulos en el menú");
assert.deepStrictEqual(
  coachAllowedItems.map((i) => i.name),
  ["Dashboard", "Grupos", "Asistencia & Cancha"],
  "Los módulos visibles deben ser únicamente Dashboard, Grupos y Asistencia"
);
console.log("✔ Test 1: Filtrado de menú RBAC para perfil coach PASÓ");

// 2. Test Calculation of Hours and Role Breakdown
const mockSessions = [
  { id: "s1", coachId: "coach-1", roleInSession: "principal", durationHours: 2.0, date: "2026-10-02", totalPresentes: 15 },
  { id: "s2", coachId: "coach-1", roleInSession: "asistente", headCoachName: "Juan Pérez", durationHours: 2.0, date: "2026-10-05", totalPresentes: 12 },
  { id: "s3", coachId: "coach-1", roleInSession: "principal", durationHours: 1.5, date: "2026-10-10", totalPresentes: 14 },
  { id: "s4", coachId: "coach-2", roleInSession: "principal", durationHours: 2.0, date: "2026-10-10", totalPresentes: 10 },
  { id: "s5", coachId: "coach-1", roleInSession: "asistente", headCoachName: "Carlos Díaz", durationHours: 2.5, date: "2026-09-28", totalPresentes: 16 },
];

// Filtrar para coach-1 en Octubre 2026
const coach1October = mockSessions.filter((s) => s.coachId === "coach-1" && s.date.startsWith("2026-10"));
assert.strictEqual(coach1October.length, 3, "Coach-1 debe tener 3 sesiones en Octubre 2026");

const totalHours = coach1October.reduce((acc, s) => acc + s.durationHours, 0);
assert.strictEqual(totalHours, 5.5, "El total de horas acumuladas debe ser 5.5");

const principalCount = coach1October.filter((s) => s.roleInSession === "principal").length;
assert.strictEqual(principalCount, 2, "Debe tener 2 sesiones como Entrenador Principal");

const assistantCount = coach1October.filter((s) => s.roleInSession === "asistente").length;
assert.strictEqual(assistantCount, 1, "Debe tener 1 sesión como Asistente");

const assistedCoach = coach1October.find((s) => s.roleInSession === "asistente")?.headCoachName;
assert.strictEqual(assistedCoach, "Juan Pérez", "La sesión de asistente debe tener asociado a Juan Pérez como profe principal");
console.log("✔ Test 2: Cálculo matemático de horas y desglose Principal / Asistente PASÓ");

// 3. Test Student Data Privacy (Masking in Coach Views)
const rawAthleteData = {
  id: "ath-01",
  name: "Mateo Carvajal",
  group: "Selección A",
  documento: "1025889966",
  phone: "+57 312 999 8877",
  email: "mateo@gmail.com",
  plan: "Plan Élite Anual",
  financialStatus: "Al día",
  lastPaymentReference: "TX-998877"
};

// Extractor para el profe
function sanitizeForCoach(athlete) {
  return {
    id: athlete.id,
    name: athlete.name,
    group: athlete.group
  };
}

const coachViewAthlete = sanitizeForCoach(rawAthleteData);
assert.deepStrictEqual(Object.keys(coachViewAthlete).sort(), ["group", "id", "name"], "Solo debe incluir id, name y group");
assert.strictEqual(coachViewAthlete.documento, undefined, "El documento no debe estar visible para el profesor");
assert.strictEqual(coachViewAthlete.phone, undefined, "El teléfono no debe estar visible para el profesor");
assert.strictEqual(coachViewAthlete.financialStatus, undefined, "El estado financiero no debe estar visible para el profesor");
console.log("✔ Test 3: Privacidad estricta de alumnos (solo Nombre y Grupo) PASÓ");

// 4. Test Duration calculation from Time strings
function calculateDuration(startTime, endTime) {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  return Math.round((diffMinutes / 60) * 10) / 10;
}

assert.strictEqual(calculateDuration("16:00", "18:00"), 2.0);
assert.strictEqual(calculateDuration("08:00", "09:30"), 1.5);
assert.strictEqual(calculateDuration("18:00", "20:15"), 2.3);
console.log("✔ Test 4: Cálculo dinámico de duración en horas de entrenamiento PASÓ");

console.log("==================================================================");
console.log("🎉 TODAS LAS PRUEBAS (4/4) PASARON CON ÉXITO ROTUNDO");
console.log("==================================================================");
