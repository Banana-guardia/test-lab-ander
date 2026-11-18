import { collection, onSnapshot } from "firebase/firestore";
import { db, type UnifiedCoach } from "@/lib/firebase";

export interface SessionInventoryUsageItem {
  id: string; // id del artículo de inventario o identificador único
  name: string;
  category?: string;
  location?: string;
  initialStock?: number;
  usedQuantity: number;      // Cuánto inventario se usó en el entreno
  returnedQuantity: number;  // Cuánto inventario quedó después de la jornada
  difference?: number;        // returnedQuantity - usedQuantity (negativo si falta)
  conditionAtEnd?: "Excelente" | "Bueno" | "Desgastado" | "Requiere Reemplazo" | "Extraviado";
  status?: "complete" | "missing" | "damaged" | "surplus";
  notes?: string;
}

export interface CoachSessionRecord {
  id: string;
  coachId: string;
  coachName?: string;
  coachEmail?: string;
  roleInSession: "principal" | "asistente";
  headCoachName?: string;
  group: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationHours: number;
  location?: string;
  totalPresentes: number;
  totalAusentes?: number;
  totalJustificados?: number;
  trainingTopic?: string;
  courtNotes?: string;
  inventoryUsage?: SessionInventoryUsageItem[];
  createdAt?: any;
}

export interface CoachAccountingSummary {
  coachKey: string;
  coachId: string;
  coachName: string;
  coachEmail: string;
  coachRole: string;
  totalClasses: number;
  principalClasses: number;
  principalHours: number;
  assistantClasses: number;
  assistantHours: number;
  totalHours: number;
  totalStudentsAttended: number;
  groups: string[];
  sessions: CoachSessionRecord[];
}

export const LOCAL_COACH_SESSIONS_KEY = "soul_local_coach_sessions";
export const COACH_SESSIONS_UPDATED_EVENT = "soul-coach-sessions-updated";

export function readLocalCoachSessions(): CoachSessionRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_COACH_SESSIONS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mergeCoachSessions(
  firestoreSessions: CoachSessionRecord[] = [],
  localSessions: CoachSessionRecord[] = readLocalCoachSessions()
): CoachSessionRecord[] {
  const map = new Map<string, CoachSessionRecord>();
  [...localSessions, ...firestoreSessions].forEach((item) => {
    if (!item || !item.id) return;
    map.set(item.id, {
      ...item,
      durationHours: Number(item.durationHours) || 0,
      totalPresentes: Number(item.totalPresentes) || 0,
      totalAusentes: Number(item.totalAusentes) || 0,
      totalJustificados: Number(item.totalJustificados) || 0,
      roleInSession: item.roleInSession === "asistente" ? "asistente" : "principal",
      inventoryUsage: Array.isArray(item.inventoryUsage)
        ? item.inventoryUsage.map((u: any) => {
            const used = Number(u.usedQuantity) || 0;
            const ret = Number(u.returnedQuantity) || 0;
            return {
              id: String(u.id || `inv-u-${Math.random()}`),
              name: String(u.name || "Artículo deportivo"),
              category: u.category || "General",
              location: u.location || "Cancha",
              initialStock: u.initialStock !== undefined ? Number(u.initialStock) : undefined,
              usedQuantity: used,
              returnedQuantity: ret,
              difference: ret - used,
              conditionAtEnd: u.conditionAtEnd || "Bueno",
              status:
                u.status ||
                (ret < used ? "missing" : ret > used ? "surplus" : "complete"),
              notes: u.notes || ""
            };
          })
        : []
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const dateCmp = (b.date || "").localeCompare(a.date || "");
    if (dateCmp !== 0) return dateCmp;
    return (b.startTime || "").localeCompare(a.startTime || "");
  });
}

/**
 * Suscripción en tiempo real a `coach_sessions` en Firestore combinada con respaldo local.
 */
export function subscribeCoachSessions(
  onUpdate: (sessions: CoachSessionRecord[]) => void,
  onError?: () => void
): () => void {
  let latestFirestore: CoachSessionRecord[] = [];

  const emitMerged = () => {
    onUpdate(mergeCoachSessions(latestFirestore, readLocalCoachSessions()));
  };

  // Emitir de inmediato con copia local mientras responde Firestore
  emitMerged();

  const handleLocalEvent = () => emitMerged();
  window.addEventListener(COACH_SESSIONS_UPDATED_EVENT, handleLocalEvent);

  let unsubFirestore: (() => void) | null = null;
  try {
    unsubFirestore = onSnapshot(
      collection(db, "coach_sessions"),
      (snapshot) => {
        const list: CoachSessionRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as Omit<CoachSessionRecord, "id">) });
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
    window.removeEventListener(COACH_SESSIONS_UPDATED_EVENT, handleLocalEvent);
    if (unsubFirestore) unsubFirestore();
  };
}

/**
 * Guarda o actualiza un registro de sesión de cancha / reporte de material en Firestore y LocalStorage
 */
export async function saveCoachSessionRecord(
  payload: Partial<CoachSessionRecord> & { group: string; date: string; coachName: string }
): Promise<CoachSessionRecord> {
  const sessionId = payload.id || `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const cleanRecord: CoachSessionRecord = {
    id: sessionId,
    coachId: payload.coachId || "coach-soul",
    coachName: payload.coachName,
    coachEmail: payload.coachEmail || "",
    roleInSession: payload.roleInSession || "principal",
    headCoachName: payload.headCoachName || "",
    group: payload.group,
    date: payload.date,
    startTime: payload.startTime || "16:00",
    endTime: payload.endTime || "17:30",
    durationHours: Number(payload.durationHours) || 1.5,
    location: payload.location || "Sede Norte",
    totalPresentes: Number(payload.totalPresentes) || 0,
    totalAusentes: Number(payload.totalAusentes) || 0,
    totalJustificados: Number(payload.totalJustificados) || 0,
    trainingTopic: payload.trainingTopic || "Entrenamiento de clase",
    courtNotes: payload.courtNotes || "",
    inventoryUsage: Array.isArray(payload.inventoryUsage) ? payload.inventoryUsage : []
  };

  try {
    const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
    await setDoc(doc(db, "coach_sessions", sessionId), {
      ...cleanRecord,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch {}

  const stored = readLocalCoachSessions();
  const existingIdx = stored.findIndex((s) => s.id === sessionId);
  if (existingIdx >= 0) {
    stored[existingIdx] = cleanRecord;
  } else {
    stored.unshift(cleanRecord);
  }
  localStorage.setItem(LOCAL_COACH_SESSIONS_KEY, JSON.stringify(stored));
  window.dispatchEvent(new Event(COACH_SESSIONS_UPDATED_EVENT));

  // Actualizar también log de inventario
  if (cleanRecord.inventoryUsage && cleanRecord.inventoryUsage.length > 0) {
    try {
      const storedLogs = JSON.parse(localStorage.getItem("soul_inventory_session_logs") || "[]");
      storedLogs.unshift({
        id: `invlog-${sessionId}`,
        sessionId,
        date: cleanRecord.date,
        startTime: cleanRecord.startTime,
        endTime: cleanRecord.endTime,
        group: cleanRecord.group,
        coachName: cleanRecord.coachName,
        location: cleanRecord.location,
        items: cleanRecord.inventoryUsage,
        totalUsed: cleanRecord.inventoryUsage.reduce((acc, it) => acc + (it.usedQuantity || 0), 0),
        totalReturned: cleanRecord.inventoryUsage.reduce((acc, it) => acc + (it.returnedQuantity || 0), 0),
        hasDiscrepancy: cleanRecord.inventoryUsage.some((it) => (it.returnedQuantity || 0) < (it.usedQuantity || 0)),
        createdAt: new Date().toISOString()
      });
      localStorage.setItem("soul_inventory_session_logs", JSON.stringify(storedLogs.slice(0, 100)));
      window.dispatchEvent(new Event("soul-inventory-session-logs-updated"));
    } catch {}
  }

  return cleanRecord;
}

function normalizeText(value?: string): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Resuelve el nombre legible del profesor de una sesión cruzando con el catálogo de entrenadores.
 */
export function resolveSessionCoachDisplay(
  session: CoachSessionRecord,
  coaches: Array<Pick<UnifiedCoach, "id" | "name" | "email" | "role">>
): { key: string; name: string; email: string; role: string } {
  const sEmail = (session.coachEmail || "").trim().toLowerCase();
  const sNameNorm = normalizeText(session.coachName);
  const sId = (session.coachId || "").trim();

  const matched = coaches.find((c) => {
    const cEmail = (c.email || "").trim().toLowerCase();
    const cNameNorm = normalizeText(c.name);
    if (sEmail && cEmail && sEmail === cEmail) return true;
    if (sId && c.id && sId === c.id) return true;
    if (sNameNorm && cNameNorm && sNameNorm === cNameNorm) return true;
    return false;
  });

  if (matched) {
    const key = (matched.email || matched.name || matched.id).trim().toLowerCase();
    return {
      key,
      name: matched.name,
      email: matched.email || session.coachEmail || "",
      role: matched.role || "Entrenador"
    };
  }

  const fallbackName =
    session.coachName?.trim() ||
    (sEmail ? sEmail.split("@")[0] : "") ||
    "Entrenador SOUL";
  const fallbackKey = (sEmail || normalizeText(fallbackName) || sId || "coach-unknown").toLowerCase();

  return {
    key: fallbackKey,
    name: fallbackName,
    email: sEmail,
    role: "Entrenador"
  };
}

/**
 * Agrupa las sesiones filtradas por profesor para generar el cuadro contable consolidado.
 * Si `includeInactiveCoaches` es true, incluye también a los profesores registrados con 0 horas en el período.
 */
export function buildCoachAccountingSummaries(
  sessions: CoachSessionRecord[],
  coaches: Array<Pick<UnifiedCoach, "id" | "name" | "email" | "role">>,
  includeInactiveCoaches = true
): CoachAccountingSummary[] {
  const map = new Map<string, CoachAccountingSummary>();

  if (includeInactiveCoaches) {
    coaches.forEach((c) => {
      const key = (c.email || c.name || c.id).trim().toLowerCase();
      if (!key) return;
      map.set(key, {
        coachKey: key,
        coachId: c.id,
        coachName: c.name,
        coachEmail: c.email || "",
        coachRole: c.role || "Entrenador",
        totalClasses: 0,
        principalClasses: 0,
        principalHours: 0,
        assistantClasses: 0,
        assistantHours: 0,
        totalHours: 0,
        totalStudentsAttended: 0,
        groups: [],
        sessions: []
      });
    });
  }

  sessions.forEach((session) => {
    const resolved = resolveSessionCoachDisplay(session, coaches);
    const existing = map.get(resolved.key) || {
      coachKey: resolved.key,
      coachId: session.coachId || resolved.key,
      coachName: resolved.name,
      coachEmail: resolved.email,
      coachRole: resolved.role,
      totalClasses: 0,
      principalClasses: 0,
      principalHours: 0,
      assistantClasses: 0,
      assistantHours: 0,
      totalHours: 0,
      totalStudentsAttended: 0,
      groups: [],
      sessions: []
    };

    const hrs = Number(session.durationHours) || 0;
    const isPrincipal = session.roleInSession === "principal";

    existing.totalClasses += 1;
    if (isPrincipal) {
      existing.principalClasses += 1;
      existing.principalHours = roundHours(existing.principalHours + hrs);
    } else {
      existing.assistantClasses += 1;
      existing.assistantHours = roundHours(existing.assistantHours + hrs);
    }
    existing.totalHours = roundHours(existing.totalHours + hrs);
    existing.totalStudentsAttended += Number(session.totalPresentes) || 0;

    if (session.group && !existing.groups.includes(session.group)) {
      existing.groups.push(session.group);
    }
    existing.sessions.push(session);

    map.set(resolved.key, existing);
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
    if (b.totalClasses !== a.totalClasses) return b.totalClasses - a.totalClasses;
    return a.coachName.localeCompare(b.coachName);
  });
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? "").replace(/"/g, '""');
  return `"${str}"`;
}

function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const csvLines = [headers.map(escapeCsvCell).join(","), ...rows.map((row) => row.map(escapeCsvCell).join(","))];
  const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCoachAccountingCSV(
  summaries: CoachAccountingSummary[],
  periodLabel: string
) {
  if (summaries.length === 0) return;

  const headers = [
    "Periodo",
    "Profesor / Entrenador",
    "Correo",
    "Cargo",
    "Total Clases",
    "Clases Principal",
    "Horas Principal",
    "Clases Asistente",
    "Horas Asistente",
    "Total Horas Trabajadas",
    "Asistencias Atendidas",
    "Grupos Dictados"
  ];

  const rows = summaries.map((s) => [
    periodLabel,
    s.coachName,
    s.coachEmail,
    s.coachRole,
    s.totalClasses,
    s.principalClasses,
    s.principalHours,
    s.assistantClasses,
    s.assistantHours,
    s.totalHours,
    s.totalStudentsAttended,
    s.groups.join(" | ")
  ]);

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  downloadCsvFile(`contabilidad_horas_profes_soul_${safePeriod}.csv`, headers, rows);
}

export function exportCoachSessionsDetailCSV(
  sessions: CoachSessionRecord[],
  coaches: Array<Pick<UnifiedCoach, "id" | "name" | "email" | "role">>,
  periodLabel: string
) {
  if (sessions.length === 0) return;

  const headers = [
    "Fecha",
    "Profesor",
    "Correo",
    "Rol en Cancha",
    "Entrenador Principal (si aplica)",
    "Grupo",
    "Sede",
    "Hora Inicio",
    "Hora Fin",
    "Duracion (hrs)",
    "Presentes",
    "Ausentes",
    "Permiso",
    "Tema Dictado",
    "Novedades"
  ];

  const rows = sessions.map((s) => {
    const coach = resolveSessionCoachDisplay(s, coaches);
    return [
      s.date,
      coach.name,
      coach.email,
      s.roleInSession === "principal" ? "Principal" : "Asistente",
      s.headCoachName || "",
      s.group,
      s.location || "Sede Norte",
      s.startTime || "",
      s.endTime || "",
      Number(s.durationHours) || 0,
      Number(s.totalPresentes) || 0,
      Number(s.totalAusentes) || 0,
      Number(s.totalJustificados) || 0,
      s.trainingTopic || "",
      s.courtNotes || ""
    ];
  });

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  downloadCsvFile(`detalle_clases_profes_soul_${safePeriod}.csv`, headers, rows);
}

