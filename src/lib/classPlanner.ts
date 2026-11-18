import { collection, onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, type UnifiedCoach } from "@/lib/firebase";
import type { CoachSessionRecord } from "@/lib/coachSessions";

export type DayOfWeek = "Lunes" | "Martes" | "Miércoles" | "Jueves" | "Viernes" | "Sábado" | "Domingo";

export interface SessionPhase {
  phase: "Calentamiento" | "Parte Principal" | "Vuelta a la Calma";
  description: string;
  durationMinutes: number;
}

export interface PlannedClassSession {
  id: string;
  coachId: string;
  coachName: string;
  coachEmail?: string;
  group: string;
  dayOfWeek: DayOfWeek;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationHours: number;
  location: string;
  trainingTopic: string;
  technicalObjectives: string;
  // Parámetros solicitados por el usuario para simplificación móvil:
  weeklyTopic?: string; // Tema general de la semana
  specificTopic?: string; // Tema específico de cada clase
  workedValue?: string; // Valor trabajado en la clase (ej: Disciplina, Compañerismo, Resiliencia)
  workedTopic?: string; // Tema trabajado / dinámica desarrollada en la sesión
  phaseCalentamiento?: string;
  phasePrincipal?: string;
  phaseVueltaCalma?: string;
  phases?: SessionPhase[];
  materialsNeeded?: string[];
  status: "planificada" | "en_curso" | "completada" | "cancelada";
  executedSessionId?: string;
  executedAt?: string;
  adminApproved?: boolean;
  adminFeedback?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface WeeklyPlan {
  id: string;
  weekStart: string; // YYYY-MM-DD del lunes
  weekEnd: string; // YYYY-MM-DD del domingo
  year: number;
  weekNumber: number;
  coachId: string;
  coachName: string;
  coachEmail?: string;
  sessions: PlannedClassSession[];
  generalWeeklyObjective?: string;
  notes?: string;
  status: "borrador" | "enviada" | "aprobada" | "con_observaciones";
  adminFeedback?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CoachPlanningAccountingMetric {
  coachId: string;
  coachName: string;
  coachEmail: string;
  coachRole: string;
  plannedClassesCount: number;
  plannedHours: number;
  executedClassesCount: number;
  executedHours: number;
  complianceRate: number; // %
  hoursDifference: number; // executed - planned
  groupsCovered: string[];
  topicsCovered: string[];
}

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo"
];

export const VOLLEYBALL_TOPIC_TEMPLATES = [
  {
    topic: "Complejo K1: Recepción de Saque y Armado Rápido",
    objective: "Consolidar la postura baja de recepción, control de parábola al colocador y ataque por zona 4.",
    materials: ["15 Balones Molten V5M5000", "20 Conos", "1 Red Oficial", "1 Pizarra Táctica"]
  },
  {
    topic: "Complejo K2: Bloqueo Doble, Defensa en Zona 6 y Transición",
    objective: "Perfeccionar el salto y penetración de brazos sobre la red, lectura de remate rival y contraataque.",
    materials: ["14 Balones Molten", "1 Carro Portabalones", "2 Escaleras de Coordinación"]
  },
  {
    topic: "Fundamentos de Saque: Flotante Táctico y Potencia",
    objective: "Dominar la zona de impacto con la palma extendida y dirigir el saque a zonas de conflicto rival.",
    materials: ["20 Balones Mikasa", "Conos de Delimitación", "Cintas Elásticas de Altura"]
  },
  {
    topic: "Acondicionamiento Físico y Pliometría Específica",
    objective: "Incrementar la potencia de despegue vertical, agilidad de desplazamientos y resistencia aeróbica.",
    materials: ["2 Escaleras de Agilidad", "10 Bandas de Resistencia", "Conos", "Botiquín"]
  },
  {
    topic: "Iniciación y Control de Bola: Pase de Dedos y Antebrazos",
    objective: "Asegurar la amortiguación del balón en flexión y extensión armónica de rodillas y hombros.",
    materials: ["18 Balones de Iniciación Molten Soft", "Petos Numerados", "Conos"]
  },
  {
    topic: "Táctica Colectiva y Simulación de Partido Real",
    objective: "Aplicar rotaciones reglamentarias, comunicación en campo y toma de decisiones bajo presión.",
    materials: ["12 Balones Oficiales", "Juego de Petos Azul y Naranja", "Pizarra Táctica"]
  }
];

export const LOCAL_WEEKLY_THEMES_STORAGE_KEY = "soul_group_weekly_themes";

export interface ParsedGroupSchedule {
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
  durationHours: number;
  raw: string;
}

export const SOUL_CLASS_VALUES = [
  { name: "Disciplina", emoji: "🛡️", color: "border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800" },
  { name: "Trabajo en Equipo", emoji: "🤝", color: "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800" },
  { name: "Resiliencia", emoji: "⚡", color: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
  { name: "Comunicación", emoji: "🗣️", color: "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800" },
  { name: "Liderazgo", emoji: "🎖️", color: "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800" },
  { name: "Puntualidad", emoji: "⏰", color: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
  { name: "Concentración", emoji: "🎯", color: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800" },
  { name: "Esfuerzo", emoji: "💪", color: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" },
  { name: "Respeto", emoji: "❤️", color: "border-pink-300 bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800" },
  { name: "Actitud Positiva", emoji: "🔥", color: "border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800" },
  { name: "Autonomía", emoji: "🧘", color: "border-teal-300 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800" },
  { name: "Toma de Decisiones", emoji: "🧠", color: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" }
];

export const SOUL_WEEKLY_THEMES = [
  "Fundamentos de Recepción y K1",
  "Armado Rápido y Combinaciones de Ataque",
  "Bloqueo Doble y Defensa en Zona 6 (K2)",
  "Transición y Contraataque en Apoyo",
  "Saque Táctico Flotante y de Potencia",
  "Acondicionamiento Físico y Pliometría",
  "Táctica Colectiva y Simulación de Partido",
  "Control de Balón y Coordinación de Pase",
  "Sistemas Defensivos y Cobertura de Remate"
];

export const SOUL_SPECIFIC_THEMES = [
  "Recepción de saque flotante con pase a zona 3",
  "Técnica de golpe de dedos en suspensión",
  "Ataque rápido por zona 3 con centrales",
  "Bloqueo doble punta-central y cierre de diagonal",
  "Defensa baja de antebrazos en zona 5 y 6",
  "Saque dirigido a zonas de conflicto rival",
  "Transición ofensiva rápida tras defensa",
  "Lectura del colocador y anticipación defensiva",
  "Cobertura de rematador y balones de choque",
  "Partido de aplicación táctica 6 vs 6"
];

export function parseGroupSchedule(scheduleStr?: string): ParsedGroupSchedule {
  const raw = (scheduleStr || "").trim();
  const lower = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const days: DayOfWeek[] = [];

  // Mapear días de la semana de forma no ambigua
  if (lower.includes("lun")) days.push("Lunes");
  if (lower.includes("mar")) days.push("Martes");
  if (lower.includes("mie")) days.push("Miércoles");
  if (lower.includes("jue")) days.push("Jueves");
  if (lower.includes("vie")) days.push("Viernes");
  if (lower.includes("sab")) days.push("Sábado");
  if (lower.includes("dom")) days.push("Domingo");

  // Fallback si no tiene días especificados
  if (days.length === 0) {
    days.push("Lunes", "Miércoles", "Viernes");
  }

  // Parsear horas: ej: "18:00 - 20:00" o "18:00"
  const timeMatches = raw.match(/(\d{1,2}:\d{2})/g);
  let startTime = "16:00";
  let endTime = "17:30";
  let durationHours = 1.5;

  if (timeMatches && timeMatches.length >= 2) {
    startTime = timeMatches[0].padStart(5, "0");
    endTime = timeMatches[1].padStart(5, "0");
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diffMin = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMin > 0) {
      durationHours = Math.round((diffMin / 60) * 10) / 10;
    }
  } else if (timeMatches && timeMatches.length === 1) {
    startTime = timeMatches[0].padStart(5, "0");
    const [sh, sm] = startTime.split(":").map(Number);
    const endMinutes = sh * 60 + sm + 90; // 1.5 horas por defecto
    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    durationHours = 1.5;
  }

  return {
    days,
    startTime,
    endTime,
    durationHours,
    raw
  };
}

export function getGroupWeeklyTopic(group: string, weekKey: string): string {
  try {
    const raw = localStorage.getItem(LOCAL_WEEKLY_THEMES_STORAGE_KEY);
    if (!raw) return "";
    const map = JSON.parse(raw);
    const key = `${group.trim().toLowerCase()}__${weekKey}`;
    return map[key] || "";
  } catch {
    return "";
  }
}

export function saveGroupWeeklyTopic(group: string, weekKey: string, topic: string): void {
  try {
    const raw = localStorage.getItem(LOCAL_WEEKLY_THEMES_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const key = `${group.trim().toLowerCase()}__${weekKey}`;
    map[key] = topic.trim();
    localStorage.setItem(LOCAL_WEEKLY_THEMES_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export const LOCAL_WEEKLY_PLANS_KEY = "soul_local_weekly_plans";
export const WEEKLY_PLANS_UPDATED_EVENT = "soul-weekly-plans-updated";

// Helper de fechas
export function getMondayOfWeek(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short"
  });
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Datos semilla de planificación para mostrar valor de inmediato
export function generateSeedWeeklyPlans(): PlannedClassSession[] {
  const monday = getMondayOfWeek(new Date());
  
  const d1 = formatDateIso(monday); // Lunes
  const d2 = formatDateIso(addDays(monday, 1)); // Martes
  const d3 = formatDateIso(addDays(monday, 2)); // Miércoles
  const d4 = formatDateIso(addDays(monday, 3)); // Jueves
  const d5 = formatDateIso(addDays(monday, 4)); // Viernes
  const d6 = formatDateIso(addDays(monday, 5)); // Sábado

  return [
    {
      id: "plan-seed-1",
      coachId: "coach-seed-andres",
      coachName: "Andrés Rodríguez",
      coachEmail: "andres.coach@soulvoley.com",
      group: "Selección A",
      dayOfWeek: "Lunes",
      date: d1,
      startTime: "16:00",
      endTime: "17:30",
      durationHours: 1.5,
      location: "Sede Central",
      trainingTopic: "Complejo K1: Recepción de Saque y Armado Rápido",
      technicalObjectives: "Lograr que el 80% de los balones recibidos lleguen en zona 3 a la mano del colocador.",
      phases: [
        { phase: "Calentamiento", description: "Movilidad articular y trenzas de 3 con desplazamiento", durationMinutes: 15 },
        { phase: "Parte Principal", description: "Recepción de saques dirigidos a zona 5 y 1, ataque por 4 y 2", durationMinutes: 60 },
        { phase: "Vuelta a la Calma", description: "Elongación de tren inferior y retroalimentación técnica", durationMinutes: 15 }
      ],
      materialsNeeded: ["15 Balones Molten V5M5000", "20 Conos", "1 Pizarra Táctica"],
      status: "completada",
      adminApproved: true,
      adminFeedback: "Excelente estructura pedagógica enfocada en el próximo torneo distrital."
    },
    {
      id: "plan-seed-2",
      coachId: "coach-seed-andres",
      coachName: "Andrés Rodríguez",
      coachEmail: "andres.coach@soulvoley.com",
      group: "Selección B",
      dayOfWeek: "Martes",
      date: d2,
      startTime: "17:30",
      endTime: "19:00",
      durationHours: 1.5,
      location: "Sede Norte",
      trainingTopic: "Fundamentos de Saque: Flotante Táctico y Potencia",
      technicalObjectives: "Dominar la trayectoria del saque hacia las zonas libres del receptor más vulnerable.",
      phases: [
        { phase: "Calentamiento", description: "Acondicionamiento físico con bandas elásticas y movilidad de hombro", durationMinutes: 20 },
        { phase: "Parte Principal", description: "Series de 10 saques dirigidos a conos colocados en zonas 1, 5 y 6", durationMinutes: 55 },
        { phase: "Vuelta a la Calma", description: "Estiramiento dinámico de manguito rotador y charla", durationMinutes: 15 }
      ],
      materialsNeeded: ["18 Balones Mikasa", "Conos de Delimitación"],
      status: "completada",
      adminApproved: true
    },
    {
      id: "plan-seed-3",
      coachId: "coach-seed-andres",
      coachName: "Andrés Rodríguez",
      coachEmail: "andres.coach@soulvoley.com",
      group: "Selección A",
      dayOfWeek: "Miércoles",
      date: d3,
      startTime: "16:00",
      endTime: "17:30",
      durationHours: 1.5,
      location: "Sede Central",
      trainingTopic: "Complejo K2: Bloqueo Doble, Defensa en Zona 6 y Transición",
      technicalObjectives: "Coordinación entre central y punta en el bloqueo, apertura rápida a remate de contraataque.",
      phases: [
        { phase: "Calentamiento", description: "Juegos de pies sobre escalera de agilidad y desplazamientos", durationMinutes: 15 },
        { phase: "Parte Principal", description: "Trabajo en red con bloqueadores fijos ante diferentes direcciones", durationMinutes: 60 },
        { phase: "Vuelta a la Calma", description: "Terapia de descompresión y registro de novedades", durationMinutes: 15 }
      ],
      materialsNeeded: ["14 Balones Molten", "Carro Portabalones", "Pizarra Táctica"],
      status: "en_curso",
      adminApproved: true
    },
    {
      id: "plan-seed-4",
      coachId: "coach-seed-camila",
      coachName: "Camila Torres",
      coachEmail: "camila.coach@soulvoley.com",
      group: "Formativo Mañana",
      dayOfWeek: "Jueves",
      date: d4,
      startTime: "09:00",
      endTime: "10:30",
      durationHours: 1.5,
      location: "Sede Norte",
      trainingTopic: "Iniciación y Control de Bola: Pase de Dedos y Antebrazos",
      technicalObjectives: "Enseñar la triangulación de manos para voleo alto y la plataforma rígida de antebrazos.",
      phases: [
        { phase: "Calentamiento", description: "Juego lúdico de persecución y autopases individuales", durationMinutes: 20 },
        { phase: "Parte Principal", description: "Circuitos en parejas de golpe de dedos contra la pared y en cancha", durationMinutes: 55 },
        { phase: "Vuelta a la Calma", description: "Estiramiento guiado y entrega de carnés", durationMinutes: 15 }
      ],
      materialsNeeded: ["20 Balones Molten Soft", "Petos Numerados", "Conos"],
      status: "planificada",
      adminApproved: true
    },
    {
      id: "plan-seed-5",
      coachId: "coach-seed-andres",
      coachName: "Andrés Rodríguez",
      coachEmail: "andres.coach@soulvoley.com",
      group: "Selección A",
      dayOfWeek: "Viernes",
      date: d5,
      startTime: "16:00",
      endTime: "17:30",
      durationHours: 1.5,
      location: "Sede Central",
      trainingTopic: "Táctica Colectiva y Simulación de Partido Real",
      technicalObjectives: "Simular 3 sets competitivos aplicando cambios de colocador y juego con centrales.",
      phases: [
        { phase: "Calentamiento", description: "Calentamiento balístico y remate en red con colocador titular", durationMinutes: 25 },
        { phase: "Parte Principal", description: "Partido de 3 sets a 25 puntos con reglamento oficial FIVB", durationMinutes: 50 },
        { phase: "Vuelta a la Calma", description: "Vuelta a la calma, hidratación y análisis de rendimiento", durationMinutes: 15 }
      ],
      materialsNeeded: ["12 Balones Oficiales", "Petos", "Pizarra Táctica", "Botiquín"],
      status: "planificada",
      adminApproved: true
    },
    {
      id: "plan-seed-6",
      coachId: "coach-seed-camila",
      coachName: "Camila Torres",
      coachEmail: "camila.coach@soulvoley.com",
      group: "Formativo Tarde",
      dayOfWeek: "Sábado",
      date: d6,
      startTime: "14:00",
      endTime: "15:30",
      durationHours: 1.5,
      location: "Coliseo Mayor",
      trainingTopic: "Acondicionamiento Físico y Pliometría Específica",
      technicalObjectives: "Mejorar la agilidad lateral de los novatos y evitar lesiones en tobillos.",
      phases: [
        { phase: "Calentamiento", description: "Trote regenerativo y dinámicas con conos", durationMinutes: 20 },
        { phase: "Parte Principal", description: "Estaciones de agilidad y multisaltos con conos bajos", durationMinutes: 55 },
        { phase: "Vuelta a la Calma", description: "Vuelta a la calma y estiramiento en piso", durationMinutes: 15 }
      ],
      materialsNeeded: ["15 Conos", "2 Escaleras de Agilidad", "Bandas"],
      status: "planificada"
    }
  ];
}

export function readLocalPlannedSessions(): PlannedClassSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_WEEKLY_PLANS_KEY);
    if (!raw) {
      const seeded = generateSeedWeeklyPlans();
      localStorage.setItem(LOCAL_WEEKLY_PLANS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return generateSeedWeeklyPlans();
  }
}

export function saveLocalPlannedSessions(sessions: PlannedClassSession[]): void {
  try {
    localStorage.setItem(LOCAL_WEEKLY_PLANS_KEY, JSON.stringify(sessions));
    window.dispatchEvent(new Event(WEEKLY_PLANS_UPDATED_EVENT));
  } catch {}
}

export function mergePlannedSessions(
  firestoreSessions: PlannedClassSession[] = [],
  localSessions: PlannedClassSession[] = readLocalPlannedSessions()
): PlannedClassSession[] {
  const map = new Map<string, PlannedClassSession>();
  [...localSessions, ...firestoreSessions].forEach((item) => {
    if (!item || !item.id) return;
    map.set(item.id, {
      ...item,
      durationHours: Number(item.durationHours) || 1.5,
      phases: Array.isArray(item.phases) ? item.phases : [],
      materialsNeeded: Array.isArray(item.materialsNeeded) ? item.materialsNeeded : [],
      weeklyTopic: item.weeklyTopic || "",
      specificTopic: item.specificTopic || item.trainingTopic || "",
      workedValue: item.workedValue || "Disciplina",
      workedTopic: item.workedTopic || item.technicalObjectives || ""
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const dateCmp = (a.date || "").localeCompare(b.date || "");
    if (dateCmp !== 0) return dateCmp;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });
}

/**
 * Suscripción en tiempo real a las planificaciones de clases en Firestore + LocalStorage
 */
export function subscribeWeeklyPlannedSessions(
  onUpdate: (sessions: PlannedClassSession[]) => void,
  onError?: () => void
): () => void {
  let latestFirestore: PlannedClassSession[] = [];

  const emitMerged = () => {
    onUpdate(mergePlannedSessions(latestFirestore, readLocalPlannedSessions()));
  };

  emitMerged();

  const handleLocalEvent = () => emitMerged();
  window.addEventListener(WEEKLY_PLANS_UPDATED_EVENT, handleLocalEvent);

  let unsubFirestore: (() => void) | null = null;
  try {
    unsubFirestore = onSnapshot(
      collection(db, "planned_sessions"),
      (snapshot) => {
        const list: PlannedClassSession[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as Omit<PlannedClassSession, "id">) });
        });
        latestFirestore = list;
        emitMerged();
      },
      () => {
        emitMerged();
        onError?.();
      }
    );
  } catch {
    emitMerged();
    onError?.();
  }

  return () => {
    window.removeEventListener(WEEKLY_PLANS_UPDATED_EVENT, handleLocalEvent);
    if (unsubFirestore) unsubFirestore();
  };
}

/**
 * Guarda o actualiza una sesión planificada en Firestore y Respaldo Local
 */
export async function savePlannedSession(
  session: Partial<PlannedClassSession> & { group: string; date: string; coachName: string }
): Promise<PlannedClassSession> {
  const sessionId = session.id || `plan-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const cleanSession: PlannedClassSession = {
    id: sessionId,
    coachId: session.coachId || "coach-soul",
    coachName: session.coachName,
    coachEmail: session.coachEmail || "",
    group: session.group,
    dayOfWeek: session.dayOfWeek || "Lunes",
    date: session.date,
    startTime: session.startTime || "16:00",
    endTime: session.endTime || "17:30",
    durationHours: Number(session.durationHours) || 1.5,
    location: session.location || "Sede Central",
    trainingTopic: session.specificTopic || session.trainingTopic || "Fundamentos técnicos y tácticos",
    technicalObjectives: session.workedTopic || session.technicalObjectives || "Desarrollo de habilidades de juego",
    weeklyTopic: session.weeklyTopic || "",
    specificTopic: session.specificTopic || session.trainingTopic || "",
    workedValue: session.workedValue || "Disciplina",
    workedTopic: session.workedTopic || session.technicalObjectives || "",
    phases: session.phases || [],
    materialsNeeded: session.materialsNeeded || [],
    status: session.status || "planificada",
    executedSessionId: session.executedSessionId || undefined,
    adminApproved: session.adminApproved !== undefined ? session.adminApproved : false,
    adminFeedback: session.adminFeedback || "",
    updatedAt: new Date().toISOString()
  };

  // 1. Guardar en Firestore si es posible
  try {
    await setDoc(doc(db, "planned_sessions", sessionId), {
      ...cleanSession,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (fsErr) {
    console.warn("Aviso: guardando planificación localmente:", fsErr);
  }

  // 2. Guardar en LocalStorage
  const stored = readLocalPlannedSessions();
  const existingIdx = stored.findIndex((s) => s.id === sessionId);
  if (existingIdx >= 0) {
    stored[existingIdx] = cleanSession;
  } else {
    stored.unshift(cleanSession);
  }
  saveLocalPlannedSessions(stored);

  return cleanSession;
}

/**
 * Elimina una sesión planificada
 */
export async function deletePlannedSession(sessionId: string): Promise<void> {
  try {
    const { deleteDoc, doc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "planned_sessions", sessionId));
  } catch {}

  const stored = readLocalPlannedSessions();
  saveLocalPlannedSessions(stored.filter((s) => s.id !== sessionId));
}

/**
 * Cálculos contables y de cumplimiento pedagógico:
 * Cruza las clases planificadas contra las sesiones certificadas en cancha (CoachSessionRecord)
 */
export function computeCoachPlanningAccounting(
  plannedSessions: PlannedClassSession[],
  executedSessions: CoachSessionRecord[],
  coaches: Array<Pick<UnifiedCoach, "id" | "name" | "email" | "role">>
): CoachPlanningAccountingMetric[] {
  const map = new Map<string, CoachPlanningAccountingMetric>();

  coaches.forEach((c) => {
    const key = (c.email || c.name || c.id).trim().toLowerCase();
    if (!key) return;
    map.set(key, {
      coachId: c.id,
      coachName: c.name,
      coachEmail: c.email || "",
      coachRole: c.role || "Entrenador",
      plannedClassesCount: 0,
      plannedHours: 0,
      executedClassesCount: 0,
      executedHours: 0,
      complianceRate: 100,
      hoursDifference: 0,
      groupsCovered: [],
      topicsCovered: []
    });
  });

  // Sumar planificaciones
  plannedSessions.forEach((p) => {
    const key = (p.coachEmail || p.coachName || p.coachId).trim().toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = {
        coachId: p.coachId,
        coachName: p.coachName,
        coachEmail: p.coachEmail || "",
        coachRole: "Entrenador",
        plannedClassesCount: 0,
        plannedHours: 0,
        executedClassesCount: 0,
        executedHours: 0,
        complianceRate: 0,
        hoursDifference: 0,
        groupsCovered: [],
        topicsCovered: []
      };
      map.set(key, entry);
    }

    if (p.status !== "cancelada") {
      entry.plannedClassesCount += 1;
      entry.plannedHours += Number(p.durationHours) || 1.5;
    }
    if (p.group && !entry.groupsCovered.includes(p.group)) {
      entry.groupsCovered.push(p.group);
    }
    if (p.trainingTopic && !entry.topicsCovered.includes(p.trainingTopic)) {
      entry.topicsCovered.push(p.trainingTopic);
    }
  });

  // Sumar sesiones certificadas ejecutadas en cancha
  executedSessions.forEach((e) => {
    const key = (e.coachEmail || e.coachName || e.coachId).trim().toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = {
        coachId: e.coachId,
        coachName: e.coachName || "Profesor SOUL",
        coachEmail: e.coachEmail || "",
        coachRole: "Entrenador",
        plannedClassesCount: 0,
        plannedHours: 0,
        executedClassesCount: 0,
        executedHours: 0,
        complianceRate: 0,
        hoursDifference: 0,
        groupsCovered: [],
        topicsCovered: []
      };
      map.set(key, entry);
    }

    entry.executedClassesCount += 1;
    entry.executedHours += Number(e.durationHours) || 1.5;
    if (e.group && !entry.groupsCovered.includes(e.group)) {
      entry.groupsCovered.push(e.group);
    }
  });

  // Calcular ratios y diferencias
  const result: CoachPlanningAccountingMetric[] = [];
  map.forEach((entry) => {
    const planned = entry.plannedClassesCount;
    const executed = entry.executedClassesCount;
    entry.complianceRate = planned > 0 ? Math.min(100, Math.round((executed / planned) * 100)) : (executed > 0 ? 100 : 0);
    entry.hoursDifference = Number((entry.executedHours - entry.plannedHours).toFixed(1));
    result.push(entry);
  });

  return result.sort((a, b) => b.plannedHours - a.plannedHours);
}

/**
 * Exportar la sábana semanal a CSV para revisión administrativa y contabilidad
 */
export function exportWeeklyPlanningCSV(
  sessions: PlannedClassSession[],
  weekLabel: string
): void {
  const headers = [
    "Semana",
    "Día",
    "Fecha",
    "Horario Inicio",
    "Horario Fin",
    "Duración (Horas)",
    "Profesor",
    "Grupo",
    "Sede",
    "Tema Técnico Dictado",
    "Objetivos Pedagógicos",
    "Materiales Requeridos",
    "Estado",
    "Aprobación Administrativa",
    "Observaciones Administrador"
  ];

  const rows = sessions.map((s) => [
    weekLabel,
    s.dayOfWeek,
    s.date,
    s.startTime,
    s.endTime,
    s.durationHours,
    s.coachName,
    s.group,
    s.location,
    s.trainingTopic,
    s.technicalObjectives,
    (s.materialsNeeded || []).join(" | "),
    s.status === "completada" ? "Completada / Dictada" : s.status === "en_curso" ? "En Curso" : s.status === "cancelada" ? "Cancelada" : "Planificada",
    s.adminApproved ? "Aprobada" : "Pendiente",
    s.adminFeedback || "Sin observaciones"
  ]);

  const escapeCell = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const csvContent =
    "\uFEFF" +
    [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `planificacion_semanal_${weekLabel.replace(/[\s/:]+/g, "_")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

