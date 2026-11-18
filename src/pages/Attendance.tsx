import { useState, useEffect, useMemo } from "react";
import {
  db,
  mergeCoachesData,
  mergeAthletesData,
  mergeGroupsData,
  resolveCoachAssignedGroups,
  mergeInventoryData,
  type UnifiedInventoryItem
} from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  addDoc,
  doc, 
  getDoc,
  deleteDoc,
  serverTimestamp 
} from "firebase/firestore";
import { useAuthStore } from "@/store/authStore";
import { Link, useSearchParams } from "react-router-dom";
import {
  COACH_SESSIONS_UPDATED_EVENT,
  resolveSessionCoachDisplay,
  type SessionInventoryUsageItem
} from "@/lib/coachSessions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Check, 
  X, 
  Clock, 
  Calendar, 
  RefreshCw, 
  CheckCheck,
  Users,
  History,
  ClipboardList,
  Eye,
  Trash2,
  CalendarDays,
  Percent,
  Search,
  ArrowRight,
  Award,
  FileText,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  Lock,
  Boxes,
  Minus,
  Plus,
  Package
} from "lucide-react";

interface StudentAttendance {
  id: string;
  name: string;
  group: string;
  status: "present" | "absent" | "excused" | "none";
}

interface AttendanceSession {
  id: string;
  date: string;
  group: string;
  records: Array<{ id: string; name: string; status: "present" | "absent" | "excused" | "none" }>;
  totalPresentes: number;
  totalAusentes: number;
  totalJustificados: number;
  courtNotes?: string;
  inventoryUsage?: SessionInventoryUsageItem[];
  updatedAt?: any;
}

export interface CoachSessionReport {
  id: string;
  coachId: string;
  coachName: string;
  coachEmail: string;
  roleInSession: "principal" | "asistente";
  headCoachName?: string;
  group: string;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  location: string;
  totalPresentes: number;
  totalAusentes: number;
  totalJustificados: number;
  trainingTopic?: string;
  courtNotes?: string;
  inventoryUsage?: SessionInventoryUsageItem[];
  createdAt?: any;
}

export default function Attendance() {
  const { user, role } = useAuthStore();
  const isCoach = role === "coach";
  const [searchParams] = useSearchParams();
  const initialQueryGroup = searchParams.get("group") || "";
  const initialQueryTopic = searchParams.get("topic") || "";

  const [activeTab, setActiveTab] = useState<"take" | "hours" | "history">("take");

  // Controla si ya se respondió la pregunta previa de Rol en Cancha antes de pasar a la lista
  const [isSessionSetupDone, setIsSessionSetupDone] = useState<boolean>(!!initialQueryGroup);

  // TAKE ATTENDANCE & SESSION REPORT STATE
  const [selectedGroup, setSelectedGroup] = useState<string>(initialQueryGroup || "Selección A");
  const [groups, setGroups] = useState<string[]>(["Selección A", "Selección B", "Formativo Mañana", "Formativo Tarde"]);
  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [loadingTake, setLoadingTake] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [fsGroups, setFsGroups] = useState<any[]>([]);
  const [fsCoaches, setFsCoaches] = useState<any[]>([]);
  const [fsAthletes, setFsAthletes] = useState<any[]>([]);
  const [hasInitializedCoachGroup, setHasInitializedCoachGroup] = useState<boolean>(!!initialQueryGroup);

  const DEFAULT_CLASS_DURATION_HOURS = 1.5;

  const getDeviceDateStr = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getDeviceTimeStr = (d: Date = new Date()) => {
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const addHoursToDate = (d: Date, hoursToAdd: number) => {
    return new Date(d.getTime() + hoursToAdd * 60 * 60 * 1000);
  };

  // Fecha y hora tomadas automáticamente del dispositivo (no editables)
  const [deviceNow, setDeviceNow] = useState<Date>(() => new Date());
  const selectedDate = getDeviceDateStr(deviceNow);
  const startTime = getDeviceTimeStr(deviceNow);
  const endTime = getDeviceTimeStr(addHoursToDate(deviceNow, DEFAULT_CLASS_DURATION_HOURS));
  const durationHours = DEFAULT_CLASS_DURATION_HOURS;

  // ROL EN CANCHA Y REPORTE DE SESIÓN
  const [roleInSession, setRoleInSession] = useState<"principal" | "asistente">("principal");
  const [headCoachName, setHeadCoachName] = useState<string>("");
  const [availableCoaches, setAvailableCoaches] = useState<string[]>([]);
  const [sessionLocation, setSessionLocation] = useState<string>("Sede Norte");
  const [trainingTopic, setTrainingTopic] = useState<string>(initialQueryTopic || "");
  const [courtNotes, setCourtNotes] = useState<string>("");

  // INVENTARIO Y MATERIAL DE CANCHA PARA LA SESIÓN
  const [availableInventory, setAvailableInventory] = useState<UnifiedInventoryItem[]>([]);
  const [sessionInventory, setSessionInventory] = useState<SessionInventoryUsageItem[]>([]);
  const [selectedInventoryToAdd, setSelectedInventoryToAdd] = useState<string>("");

  const handleAddInventoryItem = (item: UnifiedInventoryItem, defaultQty = 10) => {
    setSessionInventory((prev) => {
      const existing = prev.find((it) => it.id === item.id);
      if (existing) {
        return prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                usedQuantity: it.usedQuantity + defaultQty,
                returnedQuantity: it.returnedQuantity + defaultQty,
                difference: 0,
                status: "complete"
              }
            : it
        );
      }
      const initialQty = Math.min(item.quantity || defaultQty, defaultQty);
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          category: item.category,
          location: item.location,
          initialStock: item.quantity,
          usedQuantity: initialQty,
          returnedQuantity: initialQty,
          difference: 0,
          conditionAtEnd: "Bueno",
          status: "complete",
          notes: ""
        }
      ];
    });
  };

  const handleQuickAddPreset = (keyword: string, defaultName: string, defaultCategory: string, defaultQty: number) => {
    const matched = availableInventory.find((inv) =>
      inv.name.toLowerCase().includes(keyword.toLowerCase()) ||
      inv.category.toLowerCase().includes(keyword.toLowerCase())
    );
    if (matched) {
      handleAddInventoryItem(matched, defaultQty);
    } else {
      setSessionInventory((prev) => {
        const existing = prev.find((it) => it.name.toLowerCase().includes(keyword.toLowerCase()));
        if (existing) {
          return prev.map((it) =>
            it.id === existing.id
              ? {
                  ...it,
                  usedQuantity: it.usedQuantity + defaultQty,
                  returnedQuantity: it.returnedQuantity + defaultQty,
                  difference: 0,
                  status: "complete"
                }
              : it
          );
        }
        return [
          ...prev,
          {
            id: `inv-preset-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: defaultName,
            category: defaultCategory,
            location: sessionLocation,
            initialStock: defaultQty,
            usedQuantity: defaultQty,
            returnedQuantity: defaultQty,
            difference: 0,
            conditionAtEnd: "Bueno",
            status: "complete",
            notes: ""
          }
        ];
      });
    }
  };

  const handleUpdateItemQty = (
    itemId: string,
    _field: "usedQuantity" | "returnedQuantity",
    deltaOrVal: number,
    isAbsolute = false
  ) => {
    setSessionInventory((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const currentVal = it.usedQuantity;
        const nextVal = Math.max(0, isAbsolute ? deltaOrVal : currentVal + deltaOrVal);
        return {
          ...it,
          usedQuantity: nextVal,
          returnedQuantity: nextVal, // En clase solo se registra lo usado; el conteo de sobrante se hace al final de jornada
          difference: 0,
          status: "complete"
        };
      })
    );
  };

  const handleUpdateItemNotes = (itemId: string, notes: string) => {
    setSessionInventory((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, notes } : it))
    );
  };

  const handleRemoveInventoryItem = (itemId: string) => {
    setSessionInventory((prev) => prev.filter((it) => it.id !== itemId));
  };

  // Sincronizar reloj del dispositivo automáticamente cada 15 segundos
  useEffect(() => {
    const syncClock = () => setDeviceNow(new Date());
    syncClock();
    const intervalId = window.setInterval(syncClock, 15000);
    return () => window.clearInterval(intervalId);
  }, []);

  // HISTORY STATE (Listas de Asistencia tradicionales)
  const [historySessions, setHistorySessions] = useState<AttendanceSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyFilterGroup, setHistoryFilterGroup] = useState<string>("todos");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<AttendanceSession | null>(null);

  // COACH SESSIONS STATE (Control Financiero y Horas Dictadas)
  const [coachSessions, setCoachSessions] = useState<CoachSessionReport[]>([]);
  const [loadingCoachSessions, setLoadingCoachSessions] = useState(true);
  const [hoursMonthFilter, setHoursMonthFilter] = useState<string>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [selectedReportModal, setSelectedReportModal] = useState<CoachSessionReport | null>(null);

  // 1. Cargar grupos, entrenadores y deportistas (Firestore + Respaldo Híbrido)
  useEffect(() => {
    const unsubGroups = onSnapshot(
      collection(db, "groups"),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setFsGroups(list);
      },
      () => {}
    );

    const unsubCoaches = onSnapshot(
      collection(db, "coaches"),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setFsCoaches(list);
      },
      () => {}
    );

    const unsubAthletes = onSnapshot(
      collection(db, "athletes"),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setFsAthletes(list);
      },
      () => {}
    );

    let rawFsInventory: any[] = [];
    const syncInv = () => {
      setAvailableInventory(mergeInventoryData(rawFsInventory));
    };
    syncInv();

    const unsubInventory = onSnapshot(
      collection(db, "inventory"),
      (snapshot) => {
        rawFsInventory = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncInv();
      },
      () => syncInv()
    );

    const onLocalInv = () => syncInv();
    window.addEventListener("soul-inventory-updated", onLocalInv);
    window.addEventListener("storage", onLocalInv);

    return () => {
      unsubGroups();
      unsubCoaches();
      unsubAthletes();
      unsubInventory();
      window.removeEventListener("soul-inventory-updated", onLocalInv);
      window.removeEventListener("storage", onLocalInv);
    };
  }, []);

  // Unificar entrenadores, deportistas y grupos
  const allCoaches = useMemo(() => mergeCoachesData(fsCoaches), [fsCoaches]);
  const allAthletes = useMemo(() => mergeAthletesData(fsAthletes), [fsAthletes]);
  const allGroups = useMemo(
    () => mergeGroupsData(fsGroups, allCoaches, allAthletes),
    [fsGroups, allCoaches, allAthletes]
  );

  // Resolver grupos asignados al entrenador logueado
  const { assignedGroupNames } = useMemo(
    () => resolveCoachAssignedGroups(user, allCoaches, allGroups),
    [user, allCoaches, allGroups]
  );

  // Sincronizar selectores de grupos y entrenadores
  useEffect(() => {
    const coachNames = allCoaches.map((c) => c.name);
    setAvailableCoaches(coachNames);
    if (!headCoachName && coachNames.length > 0) {
      setHeadCoachName(coachNames[0]);
    }

    const allGroupNames = allGroups.map((g) => g.name);
    if (isCoach && assignedGroupNames.length > 0) {
      // Ordenar poniendo primero los grupos asignados al entrenador
      const ordered = [
        ...assignedGroupNames,
        ...allGroupNames.filter((g) => !assignedGroupNames.includes(g))
      ];
      setGroups(ordered);
      if (!hasInitializedCoachGroup) {
        setSelectedGroup(assignedGroupNames[0]);
        setHasInitializedCoachGroup(true);
      }
    } else if (allGroupNames.length > 0) {
      setGroups(allGroupNames);
    }
  }, [allCoaches, allGroups, isCoach, assignedGroupNames, headCoachName, hasInitializedCoachGroup]);

  // 3. Cargar deportistas y estado para la fecha y grupo seleccionados
  useEffect(() => {
    let isMounted = true;
    setLoadingTake(true);
    setSaveSuccess(false);

    const loadGroupAttendance = async () => {
      const groupAthletes: StudentAttendance[] = allAthletes
        .filter((a) => (a.group || "").trim().toLowerCase() === selectedGroup.trim().toLowerCase())
        .map((a) => ({
          id: a.id,
          name: a.name,
          group: a.group || selectedGroup,
          status: "none" as const
        }));

      const attendanceDocId = `${selectedDate}_${selectedGroup.replace(/\s+/g, "_")}`;
      let recordsMap: Record<string, "present" | "absent" | "excused" | "none"> | null = null;

      // 1. Intentar consultar asistencia guardada en Firestore
      try {
        const docRef = doc(db, "attendance", attendanceDocId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const savedData = docSnap.data();
          recordsMap = {};
          (savedData.records || []).forEach((r: any) => {
            recordsMap![r.id] = r.status;
          });
        }
      } catch {
        // Ignorar si Firestore está restringido y consultar copia local
      }

      // 2. Si no se encontró en Firestore, revisar respaldo local (`soul_local_attendance`)
      if (!recordsMap) {
        try {
          const localAtt: AttendanceSession[] = JSON.parse(
            localStorage.getItem("soul_local_attendance") || "[]"
          );
          const matched = localAtt.find((item) => item.id === attendanceDocId);
          if (matched && Array.isArray(matched.records)) {
            recordsMap = {};
            matched.records.forEach((r) => {
              recordsMap![r.id] = r.status;
            });
          }
        } catch {}
      }

      if (!isMounted) return;

      if (recordsMap) {
        setStudents(
          groupAthletes.map((s) => ({
            ...s,
            status: recordsMap![s.id] || "none"
          }))
        );
      } else {
        setStudents(groupAthletes);
      }
      setLoadingTake(false);
    };

    loadGroupAttendance();

    return () => {
      isMounted = false;
    };
  }, [selectedGroup, selectedDate, allAthletes]);

  // 4. Cargar Histórico de Listas de Asistencia (Firestore + LocalStorage)
  useEffect(() => {
    const getLocalAttendance = (): AttendanceSession[] => {
      try {
        return JSON.parse(localStorage.getItem("soul_local_attendance") || "[]");
      } catch {
        return [];
      }
    };

    const unsubscribe = onSnapshot(
      collection(db, "attendance"),
      (snapshot) => {
        const list: AttendanceSession[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as AttendanceSession);
        });
        const localList = getLocalAttendance();
        const map = new Map<string, AttendanceSession>();
        [...localList, ...list].forEach((item) => map.set(item.id, item));
        const merged = Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setHistorySessions(merged);
        setLoadingHistory(false);
      },
      () => {
        const localList = getLocalAttendance().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setHistorySessions(localList);
        setLoadingHistory(false);
      }
    );

    return () => unsubscribe();
  }, [saveSuccess]);

  // 5. Cargar Sesiones de Entrenador (coach_sessions) en tiempo real (Firestore + LocalStorage)
  useEffect(() => {
    const getLocalCoachSessions = (): CoachSessionReport[] => {
      try {
        return JSON.parse(localStorage.getItem("soul_local_coach_sessions") || "[]");
      } catch {
        return [];
      }
    };

    const unsubscribe = onSnapshot(
      collection(db, "coach_sessions"),
      (snapshot) => {
        const list: CoachSessionReport[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as CoachSessionReport);
        });
        const localList = getLocalCoachSessions();
        const map = new Map<string, CoachSessionReport>();
        [...localList, ...list].forEach((item) => map.set(item.id, item));
        const merged = Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setCoachSessions(merged);
        setLoadingCoachSessions(false);
      },
      () => {
        const localList = getLocalCoachSessions().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setCoachSessions(localList);
        setLoadingCoachSessions(false);
      }
    );

    return () => unsubscribe();
  }, [saveSuccess]);

  // Cambiar estado individual de un alumno
  const setStatus = (id: string, status: "present" | "absent" | "excused") => {
    setStudents((prev) =>
      prev.map((student) => {
        if (student.id === id) {
          const nextStatus = student.status === status ? "none" : status;
          return { ...student, status: nextStatus };
        }
        return student;
      })
    );
    setSaveSuccess(false);
  };

  // Marcar todos como presentes
  const handleMarkAllPresent = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, status: "present" })));
    setSaveSuccess(false);
  };

  // Guardar en Firestore + LocalStorage: Guarda la asistencia y genera el reporte de sesión de cancha
  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      const totalPresentes = students.filter((s) => s.status === "present").length;
      const totalAusentes = students.filter((s) => s.status === "absent").length;
      const totalJustificados = students.filter((s) => s.status === "excused").length;

      // Capturar fecha y hora exactas del dispositivo en el momento de guardar
      const exactDeviceNow = new Date();
      setDeviceNow(exactDeviceNow);
      const lockedDate = getDeviceDateStr(exactDeviceNow);
      const lockedStartTime = getDeviceTimeStr(exactDeviceNow);
      const lockedEndTime = getDeviceTimeStr(addHoursToDate(exactDeviceNow, DEFAULT_CLASS_DURATION_HOURS));

      const attendanceDocId = `${lockedDate}_${selectedGroup.replace(/\s+/g, "_")}`;

      const attendancePayload = {
        date: lockedDate,
        group: selectedGroup,
        records: students.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status
        })),
        totalPresentes,
        totalAusentes,
        totalJustificados,
        trainingTopic: trainingTopic.trim() || "Entrenamiento técnico y acondicionamiento",
        courtNotes: courtNotes.trim(),
        inventoryUsage: sessionInventory
      };

      const coachSessionBase = {
        coachId: user?.uid || "coach-soul",
        coachName: user?.displayName || user?.email?.split("@")[0] || "Profesor SOUL",
        coachEmail: user?.email || "",
        roleInSession,
        headCoachName: roleInSession === "asistente" ? headCoachName : "",
        group: selectedGroup,
        date: lockedDate,
        startTime: lockedStartTime,
        endTime: lockedEndTime,
        durationHours: DEFAULT_CLASS_DURATION_HOURS,
        location: sessionLocation,
        totalPresentes,
        totalAusentes,
        totalJustificados,
        trainingTopic: trainingTopic.trim() || "Entrenamiento técnico y acondicionamiento",
        courtNotes: courtNotes.trim(),
        inventoryUsage: sessionInventory,
        deviceTimestamp: exactDeviceNow.toISOString()
      };

      let savedSessionId = `session-${Date.now()}`;

      // 1. Intentar guardar en Firestore (no bloqueante si hay restricción de reglas)
      try {
        const docRef = doc(db, "attendance", attendanceDocId);
        await setDoc(docRef, { ...attendancePayload, updatedAt: serverTimestamp() }, { merge: true });
        const sessionRef = await addDoc(collection(db, "coach_sessions"), {
          ...coachSessionBase,
          createdAt: serverTimestamp()
        });
        savedSessionId = sessionRef.id;
      } catch {
        // Persistir localmente de forma transparente
      }

      // 2. Guardar siempre en LocalStorage para disponibilidad inmediata
      try {
        const localAtt: AttendanceSession[] = JSON.parse(
          localStorage.getItem("soul_local_attendance") || "[]"
        );
        const filteredAtt = localAtt.filter((a) => a.id !== attendanceDocId);
        filteredAtt.push({ id: attendanceDocId, ...attendancePayload });
        localStorage.setItem("soul_local_attendance", JSON.stringify(filteredAtt));

        const localSessions: CoachSessionReport[] = JSON.parse(
          localStorage.getItem("soul_local_coach_sessions") || "[]"
        );
        localSessions.unshift({ id: savedSessionId, ...coachSessionBase });
        localStorage.setItem("soul_local_coach_sessions", JSON.stringify(localSessions));
        window.dispatchEvent(new Event(COACH_SESSIONS_UPDATED_EVENT));

        if (sessionInventory.length > 0) {
          try {
            const storedLogs = JSON.parse(localStorage.getItem("soul_inventory_session_logs") || "[]");
            storedLogs.unshift({
              id: `invlog-${savedSessionId}`,
              sessionId: savedSessionId,
              date: lockedDate,
              startTime: lockedStartTime,
              endTime: lockedEndTime,
              group: selectedGroup,
              coachName: user?.displayName || user?.email?.split("@")[0] || "Profesor SOUL",
              location: sessionLocation,
              items: sessionInventory,
              totalUsed: sessionInventory.reduce((acc, it) => acc + (it.usedQuantity || 0), 0),
              totalReturned: sessionInventory.reduce((acc, it) => acc + (it.returnedQuantity || 0), 0),
              hasDiscrepancy: sessionInventory.some((it) => (it.returnedQuantity || 0) < (it.usedQuantity || 0)),
              createdAt: exactDeviceNow.toISOString()
            });
            localStorage.setItem("soul_inventory_session_logs", JSON.stringify(storedLogs.slice(0, 100)));
            window.dispatchEvent(new Event("soul-inventory-session-logs-updated"));
          } catch {}
        }
      } catch {}

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } finally {
      setSaving(false);
    }
  };

  // Eliminar sesión del histórico de asistencia
  const handleDeleteHistorySession = async (id: string, date: string, group: string) => {
    if (!confirm(`¿Eliminar el registro de asistencia del grupo "${group}" para la fecha ${date}?`)) return;
    try {
      await deleteDoc(doc(db, "attendance", id));
    } catch {}
    try {
      const localAtt: AttendanceSession[] = JSON.parse(
        localStorage.getItem("soul_local_attendance") || "[]"
      );
      localStorage.setItem(
        "soul_local_attendance",
        JSON.stringify(localAtt.filter((a) => a.id !== id))
      );
    } catch {}
    setHistorySessions((prev) => prev.filter((a) => a.id !== id));
    if (selectedSessionDetail?.id === id) {
      setSelectedSessionDetail(null);
    }
  };

  // Eliminar sesión del reporte de horas
  const handleDeleteCoachSession = async (id: string, date: string, group: string) => {
    if (!confirm(`¿Eliminar este reporte de sesión de cancha (${group} - ${date})?`)) return;
    try {
      await deleteDoc(doc(db, "coach_sessions", id));
    } catch {}
    try {
      const localSessions: CoachSessionReport[] = JSON.parse(
        localStorage.getItem("soul_local_coach_sessions") || "[]"
      );
      localStorage.setItem(
        "soul_local_coach_sessions",
        JSON.stringify(localSessions.filter((s) => s.id !== id))
      );
      window.dispatchEvent(new Event(COACH_SESSIONS_UPDATED_EVENT));
    } catch {}
    setCoachSessions((prev) => prev.filter((s) => s.id !== id));
    if (selectedReportModal?.id === id) {
      setSelectedReportModal(null);
    }
  };

  // Cargar una sesión histórica de regreso en la pestaña de toma de asistencia (la fecha/hora permanece bloqueada al dispositivo)
  const handleLoadSessionIntoTake = (session: AttendanceSession) => {
    setSelectedGroup(session.group);
    setDeviceNow(new Date());
    setIsSessionSetupDone(true);
    setActiveTab("take");
  };

  // Formato legible para fechas
  const formatDisplayDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return new Intl.DateTimeFormat("es-CO", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date);
    } catch (_) {
      return dateStr;
    }
  };

  const presentCount = students.filter((s) => s.status === "present").length;
  const absentCount = students.filter((s) => s.status === "absent").length;
  const excusedCount = students.filter((s) => s.status === "excused").length;

  // Filtrado de coach_sessions para la pestaña de "Mis Horas & Clases Dictadas"
  const visibleCoachSessions = coachSessions.filter((s) => {
    if (isCoach && s.coachId !== user?.uid && s.coachEmail !== user?.email) {
      return false;
    }
    if (hoursMonthFilter && s.date && !s.date.startsWith(hoursMonthFilter)) {
      return false;
    }
    return true;
  });

  // Métricas para la pestaña de horas
  const totalHoursAccumulated = visibleCoachSessions.reduce((acc, s) => acc + (Number(s.durationHours) || 0), 0);
  const principalSessionsCount = visibleCoachSessions.filter((s) => s.roleInSession === "principal").length;
  const assistantSessionsCount = visibleCoachSessions.filter((s) => s.roleInSession === "asistente").length;
  const totalStudentsTrained = visibleCoachSessions.reduce((acc, s) => acc + (Number(s.totalPresentes) || 0), 0);

  // Histórico tradicional filtrado
  const filteredHistory = historySessions.filter((s) => {
    const matchGroup = historyFilterGroup === "todos" || s.group === historyFilterGroup;
    const matchSearch =
      (s.date || "").toLowerCase().includes(historySearchTerm.toLowerCase()) ||
      (s.group || "").toLowerCase().includes(historySearchTerm.toLowerCase());
    return matchGroup && matchSearch;
  });

  const totalSessions = historySessions.length;
  const totalPresentHistory = historySessions.reduce((acc, curr) => acc + (curr.totalPresentes || 0), 0);
  const totalRosterHistory = historySessions.reduce((acc, curr) => 
    acc + (curr.totalPresentes || 0) + (curr.totalAusentes || 0) + (curr.totalJustificados || 0), 0
  );
  const globalAttendanceRate = totalRosterHistory > 0 
    ? Math.round((totalPresentHistory / totalRosterHistory) * 100) 
    : 0;

  // Clases reutilizables de inputs adaptables a Día/Noche
  const inputFieldClass = "w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors";

  return (
    <div className="space-y-4 sm:space-y-6 pb-8 max-w-5xl mx-auto">
      {/* Cabecera Simplificada + Pestañas */}
      <div className="agy-card p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                Asistencia & Cancha
              </h1>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 font-semibold">
                SOUL Club
              </span>
            </div>
            <p className="text-slate-500 dark:text-zinc-400 mt-0.5 text-xs sm:text-sm">
              Toma de lista rápida, rol en cancha y control de clases dictadas.
            </p>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="grid grid-cols-3 sm:flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-800 p-1.5 rounded-xl w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab("take")}
            className={`flex items-center justify-center gap-1.5 rounded-lg text-[11px] sm:text-xs font-semibold px-2.5 py-2 transition-all ${
              activeTab === "take"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Asistencia</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("hours")}
            className={`flex items-center justify-center gap-1.5 rounded-lg text-[11px] sm:text-xs font-semibold px-2.5 py-2 transition-all ${
              activeTab === "hours"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isCoach ? "Mis Horas" : "Horas Profes"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center justify-center gap-1.5 rounded-lg text-[11px] sm:text-xs font-semibold px-2.5 py-2 transition-all ${
              activeTab === "history"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Historial</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* PESTAÑA 1: FLUJO EN 2 PASOS (1. PREGUNTA ROL -> 2. ASISTENCIA) */}
      {/* ============================================================== */}
      {activeTab === "take" && (
        <div className="space-y-4">
          
          {/* PASO 1: PREGUNTA PREVIA ANTES DE TOMAR ASISTENCIA */}
          {!isSessionSetupDone ? (
            <div className="agy-card p-5 sm:p-7 max-w-2xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-zinc-800 pb-3 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                      Paso 1 de 2
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-zinc-100 text-sm sm:text-base leading-snug truncate">
                      Datos de la Clase
                    </h3>
                  </div>
                </div>
              </div>

              {/* Grupo y Fecha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Grupo
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className={inputFieldClass}
                  >
                    {groups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between mb-1">
                    <span>Fecha (Automática)</span>
                    <Lock className="w-3 h-3 text-slate-400" />
                  </label>
                  <div
                    className="w-full h-10 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 px-3 flex items-center justify-between text-xs sm:text-sm text-slate-700 dark:text-zinc-200 select-none cursor-not-allowed tabular-nums"
                    title="Fecha tomada automáticamente del dispositivo (no editable)"
                  >
                    <span className="font-semibold truncate">{formatDisplayDate(selectedDate)}</span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 ml-2 shrink-0">{selectedDate}</span>
                  </div>
                </div>
              </div>

              {/* Selector de Rol: Principal vs Asistente */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1.5">
                  Tu rol hoy
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRoleInSession("principal")}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      roleInSession === "principal"
                        ? "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40 text-slate-900 dark:text-white shadow-sm"
                        : "bg-slate-50/70 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                    }`}
                  >
                    <span className="text-lg shrink-0">🥇</span>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs sm:text-sm text-amber-700 dark:text-amber-300 truncate">
                        Principal
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                        Líder de clase
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRoleInSession("asistente")}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      roleInSession === "asistente"
                        ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/40 text-slate-900 dark:text-white shadow-sm"
                        : "bg-slate-50/70 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                    }`}
                  >
                    <span className="text-lg shrink-0">🥈</span>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs sm:text-sm text-indigo-700 dark:text-indigo-300 truncate">
                        Asistente
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                        Apoyo en cancha
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* SI ELIGE ASISTENTE: Selector dinámico de profesor principal */}
              {roleInSession === "asistente" && (
                <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 rounded-xl space-y-2 animate-in fade-in duration-200">
                  <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 block">
                    Profe titular *
                  </label>
                  <select
                    value={headCoachName}
                    onChange={(e) => setHeadCoachName(e.target.value)}
                    className={inputFieldClass}
                  >
                    {availableCoaches.map((c) => (
                      <option key={c} value={c}>
                        Prof. {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Horario, Duración y Sede */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-xs text-slate-600 dark:text-zinc-300 font-medium flex items-center justify-between mb-1">
                    <span>Inicio</span>
                    <Lock className="w-3 h-3 text-slate-400" />
                  </label>
                  <div
                    className="w-full h-10 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 px-3 flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-200 select-none cursor-not-allowed tabular-nums"
                    title="Hora tomada automáticamente del dispositivo (no editable)"
                  >
                    <span>{startTime}</span>
                    <span className="text-[10px] font-normal text-slate-500 dark:text-zinc-400">reloj</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-600 dark:text-zinc-300 font-medium flex items-center justify-between mb-1">
                    <span>Fin</span>
                    <Lock className="w-3 h-3 text-slate-400" />
                  </label>
                  <div
                    className="w-full h-10 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 px-3 flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-200 select-none cursor-not-allowed tabular-nums"
                    title="Calculada automáticamente desde la hora del dispositivo"
                  >
                    <span>{endTime}</span>
                    <span className="text-[10px] font-normal text-slate-500 dark:text-zinc-400">auto</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-600 dark:text-zinc-300 font-medium block mb-1">Horas</label>
                  <div className="h-10 px-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-lg flex items-center justify-between text-xs tabular-nums">
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">{durationHours}h</span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">auto</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-600 dark:text-zinc-300 font-medium block mb-1">Sede</label>
                  <select
                    value={sessionLocation}
                    onChange={(e) => setSessionLocation(e.target.value)}
                    className={inputFieldClass}
                  >
                    <option value="Sede Norte">Sede Norte</option>
                    <option value="Sede Sur">Sede Sur</option>
                    <option value="Sede Central">Sede Central</option>
                    <option value="Coliseo Mayor">Coliseo Mayor</option>
                  </select>
                </div>
              </div>

              {/* Tema y Novedades */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs text-slate-600 dark:text-zinc-300 font-medium block mb-1">
                    Tema (Opcional)
                  </label>
                  <input 
                    placeholder="Ej: Recepción y saque..."
                    value={trainingTopic}
                    onChange={(e) => setTrainingTopic(e.target.value)}
                    className={inputFieldClass}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-600 dark:text-zinc-300 font-medium block mb-1">
                    Notas Generales (Opcional)
                  </label>
                  <input 
                    placeholder="Ej: Sin novedades en la sede..."
                    value={courtNotes}
                    onChange={(e) => setCourtNotes(e.target.value)}
                    className={inputFieldClass}
                  />
                </div>
              </div>

              {/* SECCIÓN ESTRUCTURADA DE INVENTARIO Y MATERIALES DE CANCHA */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-indigo-200/80 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-zinc-900 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-indigo-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                      <Boxes className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          Material e Inventario de Cancha
                        </h4>
                        {sessionInventory.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 tabular-nums">
                            {sessionInventory.length} {sessionInventory.length === 1 ? "artículo" : "artículos"}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Registra los materiales e insumos que se usaron en este entrenamiento.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Acceso rápido a materiales frecuentes de voleibol */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                    Acceso Rápido Material Voleibol (1-Click):
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset("Molten", "Balones Molten V5M5000", "Balones", 12)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 text-slate-700 dark:text-zinc-200 flex items-center gap-1 shadow-2xs hover:bg-indigo-50/50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <span>🏐 Balones Molten (+12)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset("Mikasa", "Balones Mikasa V200W", "Balones", 10)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 text-slate-700 dark:text-zinc-200 flex items-center gap-1 shadow-2xs hover:bg-indigo-50/50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <span>🏐 Balones Mikasa (+10)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset("Peto", "Juego de Petos de Entrenamiento", "Indumentaria & Uniformes", 20)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 text-slate-700 dark:text-zinc-200 flex items-center gap-1 shadow-2xs hover:bg-indigo-50/50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <span>🎽 Petos (+20)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset("Cono", "Conos de Delimitación 30cm", "Entrenamiento Físico", 15)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 text-slate-700 dark:text-zinc-200 flex items-center gap-1 shadow-2xs hover:bg-indigo-50/50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <span>🔶 Conos (+15)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset("Escalera", "Escaleras de Coordinación", "Entrenamiento Físico", 2)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 text-slate-700 dark:text-zinc-200 flex items-center gap-1 shadow-2xs hover:bg-indigo-50/50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <span>🪜 Escaleras (+2)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset("Banda", "Bandas de Resistencia", "Entrenamiento Físico", 10)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 text-slate-700 dark:text-zinc-200 flex items-center gap-1 shadow-2xs hover:bg-indigo-50/50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <span>➰ Bandas (+10)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset("Botiquín", "Botiquín Primeros Auxilios", "Médico & Arbitraje", 1)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 text-slate-700 dark:text-zinc-200 flex items-center gap-1 shadow-2xs hover:bg-indigo-50/50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <span>🧰 Botiquín (+1)</span>
                    </button>
                  </div>
                </div>

                {/* Selector Desplegable del Inventario Oficial del Club */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={selectedInventoryToAdd}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedInventoryToAdd(val);
                        if (val) {
                          const item = availableInventory.find((it) => it.id === val);
                          if (item) {
                            handleAddInventoryItem(item, 10);
                          }
                          setSelectedInventoryToAdd("");
                        }
                      }}
                      className={inputFieldClass}
                    >
                      <option value="">➕ Buscar o agregar otro artículo del inventario del club...</option>
                      {availableInventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.category}) — Stock disp: {item.quantity} en {item.location}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Lista de Artículos de la Sesión */}
                {sessionInventory.length > 0 ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Artículos Seleccionados para el Entrenamiento</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold tabular-nums">
                        {sessionInventory.reduce((acc, it) => acc + (it.usedQuantity || 0), 0)} unidades en cancha
                      </span>
                    </div>

                    <div className="space-y-2">
                      {sessionInventory.map((inv) => {
                        const used = inv.usedQuantity || 0;

                        return (
                          <div
                            key={inv.id}
                            className="p-3 rounded-xl border transition-all bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800"
                          >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              {/* Nombre del artículo y badges */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                                    {inv.name}
                                  </span>
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                                    {inv.category || "Material"}
                                  </span>
                                  {inv.initialStock !== undefined && (
                                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                                      Stock total: {inv.initialStock}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                                    <Package className="w-3.5 h-3.5 shrink-0" />
                                    {used} {used === 1 ? "unidad utilizada" : "unidades utilizadas"} en este entreno
                                  </span>
                                </div>
                              </div>

                              {/* Controles de Cantidad Usada */}
                              <div className="flex items-center gap-3 shrink-0">
                                {/* Cuánto se usó en el entreno */}
                                <div className="space-y-1">
                                  <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 block">
                                    Se usó en entreno:
                                  </span>
                                  <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 overflow-hidden h-8">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateItemQty(inv.id, "usedQuantity", -1)}
                                      className="w-7 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-zinc-700"
                                      title="Restar 1"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <input
                                      type="number"
                                      min={0}
                                      value={used}
                                      onChange={(e) =>
                                        handleUpdateItemQty(inv.id, "usedQuantity", Number(e.target.value) || 0, true)
                                      }
                                      className="w-10 h-full text-center text-xs font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateItemQty(inv.id, "usedQuantity", 1)}
                                      className="w-7 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-zinc-700"
                                      title="Sumar 1"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* Botón Quitar Artículo */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInventoryItem(inv.id)}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors mt-4 sm:mt-0"
                                  title="Quitar este artículo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Campo de novedades específicas del ítem */}
                            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
                              <input
                                placeholder="Observación específica (Ej: 1 balón con fuga en válvula, devuelto en bodega)..."
                                value={inv.notes || ""}
                                onChange={(e) => handleUpdateItemNotes(inv.id, e.target.value)}
                                className="w-full text-[11px] bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-lg px-2.5 py-1 text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-zinc-800 text-center">
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      💡 Selecciona arriba los balones y materiales que vas a utilizar en este entreno.
                    </p>
                  </div>
                )}
              </div>

              {/* Botón corto y directo */}
              <div className="pt-2 border-t border-slate-200/70 dark:border-zinc-800 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setIsSessionSetupDone(true)}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold rounded-lg h-10 px-5 shadow-sm flex items-center justify-center gap-2 text-xs sm:text-sm"
                >
                  <span>Pasar Lista</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Button>
              </div>
            </div>
          ) : (
            /* PASO 2: VISTA LIMPIA DE ASISTENCIA (El formulario de rol no ocupa espacio) */
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Barra ultracompacta de resumen de la sesión con botón "Editar" */}
              <div className="agy-card px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs min-w-0">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {roleInSession === "principal" ? "🥇 Principal" : "🥈 Asistente"}
                  </span>
                  <span className="text-slate-300 dark:text-zinc-700">•</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                    {selectedGroup}
                  </span>
                  <span className="text-slate-300 dark:text-zinc-700">•</span>
                  <span className="text-slate-500 dark:text-zinc-400 tabular-nums inline-flex items-center gap-1">
                    <Lock className="w-3 h-3 shrink-0" />
                    {selectedDate} • {startTime} - {endTime} ({durationHours}h)
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSessionSetupDone(false)}
                  className="h-7 px-2.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg gap-1 shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </Button>
              </div>

              {/* Resumen y Verificación de Inventario al Cierre de la Jornada */}
              {sessionInventory.length > 0 && (
                <div className="p-3 rounded-xl border border-indigo-200/80 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Boxes className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 dark:text-white block sm:inline">
                        Material de Cancha ({sessionInventory.reduce((acc, it) => acc + (it.usedQuantity || 0), 0)} usados):
                      </span>{" "}
                      <span className="text-slate-600 dark:text-zinc-300 truncate inline-block max-w-full">
                        {sessionInventory.map((it) => `${it.usedQuantity}x ${it.name} (${it.returnedQuantity} devueltos)`).join(" • ")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    {sessionInventory.every((it) => (it.returnedQuantity || 0) >= (it.usedQuantity || 0)) ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                        ✅ 100% Devuelto
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 animate-pulse">
                        ⚠️ Faltantes
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsSessionSetupDone(false)}
                      className="h-7 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 px-2"
                    >
                      Ajustar
                    </Button>
                  </div>
                </div>
              )}

              {/* Contadores rápidos + Botón Todos Presentes */}
              <div className="agy-card p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="grid grid-cols-3 gap-2 flex-1 tabular-nums">
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-2 text-center">
                    <span className="block text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 leading-none">
                      {presentCount}
                    </span>
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 mt-1 block">
                      Presentes
                    </span>
                  </div>

                  <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-2.5 py-2 text-center">
                    <span className="block text-base sm:text-lg font-extrabold text-rose-600 dark:text-rose-400 leading-none">
                      {absentCount}
                    </span>
                    <span className="text-[11px] font-medium text-rose-700 dark:text-rose-300 mt-1 block">
                      Ausentes
                    </span>
                  </div>

                  <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2.5 py-2 text-center">
                    <span className="block text-base sm:text-lg font-extrabold text-amber-600 dark:text-amber-400 leading-none">
                      {excusedCount}
                    </span>
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mt-1 block">
                      Permiso
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleMarkAllPresent}
                  className="w-full sm:w-auto h-10 rounded-lg border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-500/5 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-4 shrink-0"
                >
                  <CheckCheck className="w-4 h-4 mr-1.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Todos Presentes</span>
                </Button>
              </div>

              {/* LISTA DE DEPORTISTAS: 100% protagonista */}
              <div className="agy-card overflow-hidden">
                <div className="px-4 sm:px-6 py-3 border-b border-slate-200/70 dark:border-zinc-800/80 flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2 tabular-nums">
                    <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Deportistas ({students.length})</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                    {formatDisplayDate(selectedDate)}
                  </span>
                </div>

                {loadingTake ? (
                  <div className="p-10 text-center text-slate-500 dark:text-zinc-400 text-sm">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Cargando lista de deportistas...
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-10 text-center text-slate-500 dark:text-zinc-400 text-sm">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    No hay deportistas registrados en el grupo "{selectedGroup}".
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200/70 dark:divide-zinc-800/80">
                    {students.map((student) => (
                      <div
                        key={student.id}
                        className="p-3.5 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10 border border-slate-200 dark:border-zinc-700 shrink-0">
                            <AvatarFallback className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                              {student.name.split(" ").map((n) => n[0]).join("").slice(0, 3)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-900 dark:text-zinc-100 text-sm sm:text-base truncate">
                              {student.name}
                            </p>
                            <p className="text-xs mt-0.5">
                              {student.status === "present" && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Presente en cancha</span>
                              )}
                              {student.status === "absent" && (
                                <span className="text-rose-600 dark:text-rose-400 font-semibold">✕ Ausente</span>
                              )}
                              {student.status === "excused" && (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">⏱ Permiso / Justificado</span>
                              )}
                              {student.status === "none" && (
                                <span className="text-slate-400 dark:text-zinc-500">Pendiente por marcar</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
                          <button
                            type="button"
                            onClick={() => setStatus(student.id, "present")}
                            className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                              student.status === "present"
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                : "bg-slate-100/80 dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            <span>Presente</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatus(student.id, "absent")}
                            className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                              student.status === "absent"
                                ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                : "bg-slate-100/80 dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400"
                            }`}
                          >
                            <X className="h-3.5 w-3.5 shrink-0" />
                            <span>Ausente</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatus(student.id, "excused")}
                            className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                              student.status === "excused"
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : "bg-slate-100/80 dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400"
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span>Permiso</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BOTÓN GUARDAR */}
              <div className="agy-card p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                {saveSuccess ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 px-3 py-2 rounded-lg w-full sm:w-auto">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>¡Asistencia guardada!</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-zinc-400 text-center sm:text-left tabular-nums">
                    🔒 {students.length} deportistas en lista
                  </p>
                )}

                <Button 
                  onClick={handleSaveAttendance}
                  disabled={saving || students.length === 0}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold rounded-lg shadow-sm h-10 px-5 text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4 shrink-0" />
                      <span>Guardar Asistencia</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ============================================================== */}
      {/* PESTAÑA 2: MIS HORAS & CLASES DICTADAS (CONTROL FINANCIERO)     */}
      {/* ============================================================== */}
      {activeTab === "hours" && (
        <div className="space-y-5">
          
          {/* Barra de Filtro de Mes */}
          <div className="agy-card p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>Control de Horas Dictadas & Liquidación</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Historial de sesiones certificadas para control de tiempo trabajado
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <label className="text-xs text-slate-600 dark:text-slate-300 font-semibold shrink-0">Mes:</label>
              <input 
                type="month"
                value={hoursMonthFilter}
                onChange={(e) => setHoursMonthFilter(e.target.value)}
                className={inputFieldClass}
              />
              {!isCoach && (
                <Link to="/coaches?tab=hours" className="shrink-0">
                  <Button type="button" variant="outline" size="sm" className="h-10 text-xs gap-1.5">
                    <span>Contabilidad por Profe</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Tarjetas de Métricas de Horas y Roles (2x2 en móvil, 4 en escritorio) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="agy-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Horas Cancha</span>
                <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                {totalHoursAccumulated.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">Certificadas en el mes</p>
            </div>

            <div className="agy-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Principal</span>
                <span className="text-sm">🥇</span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                {principalSessionsCount} <span className="text-xs font-normal text-slate-500">clases</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">Líder técnico</p>
            </div>

            <div className="agy-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Asistente</span>
                <span className="text-sm">🥈</span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                {assistantSessionsCount} <span className="text-xs font-normal text-slate-500">clases</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">Apoyo en cancha</p>
            </div>

            <div className="agy-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Asistencias</span>
                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                {totalStudentsTrained}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">Deportistas atendidos</p>
            </div>
          </div>

          {/* Lista de Clases Dictadas (Tarjetas en móvil, Tabla en escritorio) */}
          <div className="agy-card overflow-hidden">
            {loadingCoachSessions ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                Cargando historial de clases y horas...
              </div>
            ) : visibleCoachSessions.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-800 dark:text-slate-200 font-semibold text-sm">
                  No hay clases registradas en este mes
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  Cuando tomes asistencia y guardes tu reporte de clase, aparecerá aquí.
                </p>
              </div>
            ) : (
              <>
                {/* Vista Móvil: Tarjetas */}
                <div className="divide-y divide-slate-200/70 dark:divide-slate-800 md:hidden">
                  {visibleCoachSessions.map((session) => (
                    <div key={session.id} className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          {formatDisplayDate(session.date)}
                        </span>
                        <span className="text-xs font-extrabold text-purple-600 dark:text-purple-400">
                          {session.durationHours} hrs ({session.startTime} - {session.endTime})
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div>
                          {!isCoach && (
                            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                              {resolveSessionCoachDisplay(session, allCoaches).name}
                            </p>
                          )}
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{session.group}</p>
                          <p className="text-[11px] text-slate-500">{session.location || "Sede Norte"}</p>
                        </div>
                        {session.roleInSession === "principal" ? (
                          <Badge className="bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px]">
                            🥇 Principal
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300 text-[11px]">
                            🥈 Asistente
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/70">
                        <span className="text-xs text-slate-500">
                          <strong className="text-emerald-600 dark:text-emerald-400">{session.totalPresentes}</strong> presentes
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedReportModal(session)}
                            className="h-8 text-xs rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Planilla
                          </Button>
                          {(!isCoach || session.coachId === user?.uid) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCoachSession(session.id, session.date, session.group)}
                              className="text-slate-400 hover:text-rose-500 h-8 w-8"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Vista Escritorio: Tabla */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[11px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3.5 px-4 font-semibold">Fecha</th>
                        {!isCoach && <th className="py-3.5 px-4 font-semibold">Profesor</th>}
                        <th className="py-3.5 px-4 font-semibold">Grupo & Sede</th>
                        <th className="py-3.5 px-4 font-semibold">Rol en Cancha</th>
                        <th className="py-3.5 px-4 font-semibold">Horario / Duración</th>
                        <th className="py-3.5 px-4 font-semibold">Alumnos</th>
                        <th className="py-3.5 px-4 font-semibold">Tema Dictado</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {visibleCoachSessions.map((session) => (
                        <tr key={session.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                              <span>{formatDisplayDate(session.date)}</span>
                            </div>
                          </td>

                          {!isCoach && (
                            <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                              {resolveSessionCoachDisplay(session, allCoaches).name}
                            </td>
                          )}

                          <td className="py-3.5 px-4">
                            <p className="font-bold text-purple-600 dark:text-purple-300">{session.group}</p>
                            <p className="text-[11px] text-slate-500">{session.location || "Sede Norte"}</p>
                          </td>

                          <td className="py-3.5 px-4">
                            {session.roleInSession === "principal" ? (
                              <Badge className="bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
                                🥇 Principal
                              </Badge>
                            ) : (
                              <div>
                                <Badge className="bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs">
                                  🥈 Asistente
                                </Badge>
                                {session.headCoachName && (
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    De: <strong className="text-slate-700 dark:text-slate-200">{session.headCoachName}</strong>
                                  </p>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{session.durationHours} hrs</span>
                            {session.startTime && session.endTime && (
                              <span className="block text-[11px] text-slate-500">
                                {session.startTime} - {session.endTime}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{session.totalPresentes}</span>
                            <span className="text-slate-400 text-[11px]"> / {(session.totalPresentes || 0) + (session.totalAusentes || 0)}</span>
                          </td>

                          <td className="py-3.5 px-4 max-w-xs truncate" title={session.trainingTopic || "Sesión regular"}>
                            <span>{session.trainingTopic || "Sesión técnica regular"}</span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedReportModal(session)}
                                className="text-xs h-8 px-2.5 gap-1 rounded-lg"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Planilla</span>
                              </Button>

                              {(!isCoach || session.coachId === user?.uid) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteCoachSession(session.id, session.date, session.group)}
                                  className="text-slate-400 hover:text-rose-500 h-8 w-8"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PESTAÑA 3: HISTÓRICO DE LISTAS DE ASISTENCIA POR FECHA/GRUPO    */}
      {/* ============================================================== */}
      {activeTab === "history" && (
        <div className="space-y-4 sm:space-y-5">
          
          {/* Métricas Globales del Histórico */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="agy-card p-3.5 sm:p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-semibold uppercase truncate">Listas</h3>
                <CalendarDays className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">{totalSessions}</p>
            </div>

            <div className="agy-card p-3.5 sm:p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-semibold uppercase truncate">Asistencia</h3>
                <Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{globalAttendanceRate}%</p>
            </div>

            <div className="agy-card p-3.5 sm:p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs font-semibold uppercase truncate">Presentes</h3>
                <Users className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">{totalPresentHistory}</p>
            </div>
          </div>

          {/* Filtros del Histórico */}
          <div className="agy-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input 
                placeholder="Buscar fecha (YYYY-MM-DD) o grupo..."
                value={historySearchTerm}
                onChange={(e) => setHistorySearchTerm(e.target.value)}
                className={`${inputFieldClass} pl-9`}
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setHistoryFilterGroup("todos")}
                className={`text-xs px-3 h-8 rounded-lg shrink-0 ${
                  historyFilterGroup === "todos" 
                    ? "bg-purple-600 text-white" 
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                Todos
              </Button>
              {groups.map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistoryFilterGroup(g)}
                  className={`text-xs px-3 h-8 rounded-lg whitespace-nowrap shrink-0 ${
                    historyFilterGroup === g 
                      ? "bg-purple-600 text-white" 
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {g}
                </Button>
              ))}
            </div>
          </div>

          {/* Listado de Sesiones Guardadas */}
          <div className="agy-card overflow-hidden divide-y divide-slate-200/70 dark:divide-slate-800">
            {loadingHistory ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                Cargando histórico de asistencias...
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                No se encontraron listas de asistencia guardadas.
              </div>
            ) : (
              filteredHistory.map((session) => {
                const totalAlumnos = (session.totalPresentes || 0) + (session.totalAusentes || 0) + (session.totalJustificados || 0);
                const porcentaje = totalAlumnos > 0 ? Math.round(((session.totalPresentes || 0) / totalAlumnos) * 100) : 0;

                return (
                  <div key={session.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/20 flex flex-col items-center justify-center text-center shrink-0">
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 uppercase font-bold">
                          {session.date ? session.date.split("-")[1] : "--"}
                        </span>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white leading-none">
                          {session.date ? session.date.split("-")[2] : "--"}
                        </span>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{session.group}</h4>
                          <span className="text-xs text-slate-500">({formatDisplayDate(session.date)})</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs mt-1">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ {session.totalPresentes || 0}</span>
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">✕ {session.totalAusentes || 0}</span>
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">⏱ {session.totalJustificados || 0}</span>
                          <span className="text-slate-400">({porcentaje}% asist.)</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedSessionDetail(session)}
                        className="text-xs h-8 rounded-lg"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Ver Lista
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleLoadSessionIntoTake(session)}
                        className="h-8 px-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        title="Abrir en Pase de Lista para editar"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Button>

                      {!isCoach && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteHistorySession(session.id, session.date, session.group)}
                          className="h-8 px-2 text-xs text-slate-400 hover:text-rose-500"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: PLANILLA OFICIAL DE SESIÓN DE CANCHA (REPORTE PROFE)   */}
      {/* ============================================================== */}
      {selectedReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="agy-card w-full max-w-lg p-5 sm:p-6 relative space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-300">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    Planilla Oficial de Clase
                  </h3>
                  <p className="text-xs text-purple-600 dark:text-purple-300">
                    Certificación de horas de entrenamiento
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedReportModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs agy-surface-subtle p-4">
              <div>
                <span className="text-slate-500 block">Grupo Deportivo</span>
                <strong className="text-slate-900 dark:text-white text-sm">{selectedReportModal.group}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Fecha</span>
                <strong className="text-slate-900 dark:text-white text-sm">{formatDisplayDate(selectedReportModal.date)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Horario Dictado</span>
                <span className="text-slate-700 dark:text-slate-300 font-mono">
                  {selectedReportModal.startTime || "16:00"} - {selectedReportModal.endTime || "17:30"} ({selectedReportModal.durationHours} hrs)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Sede de Cancha</span>
                <span className="text-slate-700 dark:text-slate-300">{selectedReportModal.location || "Sede Norte"}</span>
              </div>
            </div>

            <div className="p-3.5 bg-purple-500/10 border border-purple-500/25 rounded-xl space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400 block font-medium">Profesor / Entrenador:</span>
              <div className="text-slate-900 dark:text-white font-bold text-sm flex flex-wrap items-center justify-between gap-2">
                <span>{selectedReportModal.coachName}</span>
                {selectedReportModal.roleInSession === "principal" ? (
                  <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-xs">
                    🥇 Entrenador Principal
                  </Badge>
                ) : (
                  <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40 text-xs">
                    🥈 Asistente de {selectedReportModal.headCoachName || "Titular"}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs agy-surface-subtle p-3">
              <div>
                <span className="text-slate-500 block text-[10px]">PRESENTES</span>
                <strong className="text-emerald-600 dark:text-emerald-400 text-base">{selectedReportModal.totalPresentes}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">AUSENTES</span>
                <strong className="text-rose-600 dark:text-rose-400 text-base">{selectedReportModal.totalAusentes}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">PERMISO</span>
                <strong className="text-amber-600 dark:text-amber-400 text-base">{selectedReportModal.totalJustificados}</strong>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="text-slate-500 font-semibold block">Tema Técnico Dictado:</label>
              <div className="p-3 agy-surface-subtle text-slate-800 dark:text-slate-200">
                {selectedReportModal.trainingTopic || "Sesión regular de acondicionamiento físico y fundamentos de juego."}
              </div>
            </div>

            {selectedReportModal.courtNotes && (
              <div className="space-y-1.5 text-xs">
                <label className="text-slate-500 font-semibold block">Notas Generales de Cancha:</label>
                <div className="p-3 agy-surface-subtle text-slate-700 dark:text-slate-300">
                  {selectedReportModal.courtNotes}
                </div>
              </div>
            )}

            {/* Inventario Utilizado en la Jornada */}
            {selectedReportModal.inventoryUsage && selectedReportModal.inventoryUsage.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <label className="text-slate-500 font-semibold flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Control de Inventario de Cancha:</span>
                  </label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    selectedReportModal.inventoryUsage.every(u => (u.returnedQuantity || 0) >= (u.usedQuantity || 0))
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
                  }`}>
                    {selectedReportModal.inventoryUsage.every(u => (u.returnedQuantity || 0) >= (u.usedQuantity || 0))
                      ? "✅ 100% Retornado"
                      : "⚠️ Presenta faltantes"}
                  </span>
                </div>

                <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/50">
                  {selectedReportModal.inventoryUsage.map((inv, idx) => {
                    const used = inv.usedQuantity || 0;
                    const ret = inv.returnedQuantity || 0;
                    const diff = ret - used;
                    const isOk = diff >= 0;

                    return (
                      <div key={idx} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                            <span>{inv.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                              {inv.category || "Material"}
                            </span>
                          </div>
                          {inv.notes && (
                            <p className="text-[10px] text-slate-500 italic mt-0.5">Nota: {inv.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <div className="text-[11px] tabular-nums">
                            <span className="text-slate-500">Usado: </span>
                            <strong className="text-slate-800 dark:text-slate-200">{used}</strong>
                            <span className="text-slate-400 mx-1">|</span>
                            <span className="text-slate-500">Quedó: </span>
                            <strong className={isOk ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                              {ret}
                            </strong>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isOk
                              ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                              : "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300"
                          }`}>
                            {isOk ? "Completo" : `Faltan ${Math.abs(diff)}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Certificada en base de datos
              </span>
              <Button 
                onClick={() => setSelectedReportModal(null)}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-8 rounded-lg"
              >
                Cerrar Planilla
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: DETALLE DE ALUMNOS DE UNA SESIÓN HISTÓRICA             */}
      {/* ============================================================== */}
      {selectedSessionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="agy-card w-full max-w-lg p-5 sm:p-6 relative space-y-4 max-h-[85vh] flex flex-col">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  {selectedSessionDetail.group}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fecha: {formatDisplayDate(selectedSessionDetail.date)}
                </p>
              </div>
              <button 
                onClick={() => setSelectedSessionDetail(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 agy-surface-subtle p-3 shrink-0 text-xs text-center">
              <div>
                <span className="text-slate-500 block">Presentes</span>
                <strong className="text-emerald-600 dark:text-emerald-400 text-sm">{selectedSessionDetail.totalPresentes || 0}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Ausentes</span>
                <strong className="text-rose-600 dark:text-rose-400 text-sm">{selectedSessionDetail.totalAusentes || 0}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Permiso</span>
                <strong className="text-amber-600 dark:text-amber-400 text-sm">{selectedSessionDetail.totalJustificados || 0}</strong>
              </div>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1 divide-y divide-slate-200/70 dark:divide-slate-800">
              {selectedSessionDetail.records?.map((record, idx) => (
                <div key={record.id || idx} className="pt-2.5 flex items-center justify-between text-xs">
                  <span className="text-slate-900 dark:text-white font-semibold">{record.name}</span>
                  <span>
                    {record.status === "present" && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                        ✓ Presente
                      </span>
                    )}
                    {record.status === "absent" && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold">
                        ✕ Ausente
                      </span>
                    )}
                    {record.status === "excused" && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
                        ⏱ Permiso
                      </span>
                    )}
                    {(!record.status || record.status === "none") && (
                      <span className="text-slate-400">Sin marcar</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <Button 
                onClick={() => setSelectedSessionDetail(null)}
                variant="outline"
                className="text-xs h-8 rounded-lg"
              >
                Cerrar
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
