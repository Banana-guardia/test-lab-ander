import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import {
  db,
  mergeCoachesData,
  mergeGroupsData,
  resolveCoachAssignedGroups,
  type UnifiedCoach
} from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import {
  subscribeCoachSessions,
  type CoachSessionRecord
} from "@/lib/coachSessions";
import {
  DAYS_OF_WEEK,
  VOLLEYBALL_TOPIC_TEMPLATES,
  SOUL_CLASS_VALUES,
  SOUL_WEEKLY_THEMES,
  SOUL_SPECIFIC_THEMES,
  parseGroupSchedule,
  getGroupWeeklyTopic,
  saveGroupWeeklyTopic,
  getMondayOfWeek,
  addDays,
  formatDateIso,
  formatDisplayDate,
  getWeekNumber,
  subscribeWeeklyPlannedSessions,
  savePlannedSession,
  deletePlannedSession,
  computeCoachPlanningAccounting,
  exportWeeklyPlanningCSV,
  type DayOfWeek,
  type PlannedClassSession,
  type SessionPhase,
  type ParsedGroupSchedule
} from "@/lib/classPlanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CalendarRange,
  CalendarDays,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Clock,
  Calendar,
  Users,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  FileSpreadsheet,
  Download,
  Trash2,
  Edit2,
  Sparkles,
  ClipboardCheck,
  ArrowRight,
  ShieldCheck,
  Search,
  Filter,
  Check,
  X,
  MessageSquare,
  BookOpen,
  Eye,
  FileText
} from "lucide-react";

export default function ClassPlanner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, role } = useAuthStore();
  const isCoach = role === "coach";
  const isAdmin = role === "admin" || !isCoach;

  // Fecha de referencia de la semana (Lunes)
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMondayOfWeek(new Date()));

  // Pestaña activa: "byGroupMonth" (Planificador por Grupo - Mes) | "calendar" (Vista semanal) | "byCoach" (Por Profesor) | "accounting" (Auditoría administrativa) | "templates" (Currículo)
  const [activeTab, setActiveTab] = useState<"byGroupMonth" | "calendar" | "byCoach" | "accounting" | "templates">("byGroupMonth");

  // Estado para el Planificador Mensual por Grupo (Requerimiento Simplificado Móvil)
  const [selectedMonthlyGroup, setSelectedMonthlyGroup] = useState<string>("");
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => new Date());
  const [editingWeeklyTopicWeekKey, setEditingWeeklyTopicWeekKey] = useState<string | null>(null);
  const [weeklyTopicInput, setWeeklyTopicInput] = useState<string>("");
  const [showAdvancedInModal, setShowAdvancedInModal] = useState<boolean>(false);

  // Filtros
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string>("todos");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Estado de tarjetas desplegadas (al hacer clic sobre la tarjeta sencilla se despliega su contenido)
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());

  // Modal para ver los datos a detalle de la clase seleccionada
  const [selectedClassDetails, setSelectedClassDetails] = useState<PlannedClassSession | null>(null);

  // Estado de Datos
  const [plannedSessions, setPlannedSessions] = useState<PlannedClassSession[]>([]);
  const [coachSessions, setCoachSessions] = useState<CoachSessionRecord[]>([]);
  const [fsCoaches, setFsCoaches] = useState<any[]>([]);
  const [fsGroups, setFsGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<PlannedClassSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlannedClassSession | null>(null);
  const [reviewModalTarget, setReviewModalTarget] = useState<PlannedClassSession | null>(null);
  const [adminFeedbackInput, setAdminFeedbackInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Estado del Formulario de Creación/Edición
  const [formData, setFormData] = useState<{
    group: string;
    coachId: string;
    coachName: string;
    coachEmail: string;
    date: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    durationHours: number;
    location: string;
    weeklyTopic: string;
    specificTopic: string;
    workedValue: string;
    workedTopic: string;
    trainingTopic: string;
    technicalObjectives: string;
    materialsNeeded: string;
    phaseCalentamiento: string;
    phasePrincipal: string;
    phaseVueltaCalma: string;
    status: "planificada" | "en_curso" | "completada" | "cancelada";
  }>({
    group: "Selección A",
    coachId: "",
    coachName: "",
    coachEmail: "",
    date: formatDateIso(new Date()),
    dayOfWeek: "Lunes",
    startTime: "16:00",
    endTime: "17:30",
    durationHours: 1.5,
    location: "Sede Central",
    weeklyTopic: "",
    specificTopic: "",
    workedValue: "Disciplina",
    workedTopic: "",
    trainingTopic: "",
    technicalObjectives: "",
    materialsNeeded: "Balones Molten, Conos",
    phaseCalentamiento: "Movilidad articular y desplazamientos (15 min)",
    phasePrincipal: "Ejercicios técnicos en parejas y tríos con rotación (60 min)",
    phaseVueltaCalma: "Elongación guiada y retroalimentación grupal (15 min)",
    status: "planificada"
  });

  // 1. Cargar Grupos y Entrenadores
  useEffect(() => {
    const unsubC = onSnapshot(collection(db, "coaches"), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setFsCoaches(list);
    }, () => {});

    const unsubG = onSnapshot(collection(db, "groups"), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setFsGroups(list);
    }, () => {});

    return () => {
      unsubC();
      unsubG();
    };
  }, []);

  const allCoaches = useMemo(() => mergeCoachesData(fsCoaches), [fsCoaches]);
  const allGroups = useMemo(() => mergeGroupsData(fsGroups, allCoaches), [fsGroups, allCoaches]);
  const { assignedGroupNames } = useMemo(
    () => resolveCoachAssignedGroups(user, allCoaches, allGroups),
    [user, allCoaches, allGroups]
  );

  // Inicializar grupo mensual por defecto
  useEffect(() => {
    if (!selectedMonthlyGroup && allGroups.length > 0) {
      if (isCoach && assignedGroupNames.length > 0) {
        setSelectedMonthlyGroup(assignedGroupNames[0]);
      } else {
        setSelectedMonthlyGroup(allGroups[0].name);
      }
    }
  }, [selectedMonthlyGroup, allGroups, assignedGroupNames, isCoach]);

  // 2. Suscripción a Planificaciones y Sesiones Ejecutadas
  useEffect(() => {
    const unsubPlans = subscribeWeeklyPlannedSessions((plans) => {
      setPlannedSessions(plans);
      setLoading(false);
    });

    const unsubExec = subscribeCoachSessions((sessions) => {
      setCoachSessions(sessions);
    });

    return () => {
      unsubPlans();
      unsubExec();
    };
  }, []);

  // Inicializar filtro de profesor si es rol entrenador
  useEffect(() => {
    if (isCoach && user?.email && selectedCoachFilter === "todos") {
      const matched = allCoaches.find((c) => c.email?.toLowerCase() === user.email?.toLowerCase());
      if (matched) {
        setSelectedCoachFilter(matched.id);
      }
    }
  }, [isCoach, user, allCoaches, selectedCoachFilter]);

  // Manejo de parámetros de búsqueda en URL (?coach=xxx&tab=byCoach)
  useEffect(() => {
    const qCoach = searchParams.get("coach");
    const qTab = searchParams.get("tab");
    if (qCoach) setSelectedCoachFilter(qCoach);
    if (qTab && ["byGroupMonth", "calendar", "byCoach", "accounting", "templates"].includes(qTab)) {
      setActiveTab(qTab as any);
    }
  }, [searchParams]);

  // Fechas de la semana activa
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(currentMonday, i);
      const iso = formatDateIso(d);
      const dayName = DAYS_OF_WEEK[i];
      return { dayName, date: d, iso };
    });
  }, [currentMonday]);

  const currentSunday = useMemo(() => addDays(currentMonday, 6), [currentMonday]);
  const weekNumber = useMemo(() => getWeekNumber(currentMonday), [currentMonday]);
  const weekRangeLabel = useMemo(() => {
    return `${currentMonday.getDate()} ${currentMonday.toLocaleDateString("es-CO", { month: "short" })} - ${currentSunday.getDate()} ${currentSunday.toLocaleDateString("es-CO", { month: "short", year: "numeric" })}`;
  }, [currentMonday, currentSunday]);

  // Navegación de Semanas
  const handlePrevWeek = () => setCurrentMonday((prev) => addDays(prev, -7));
  const handleNextWeek = () => setCurrentMonday((prev) => addDays(prev, 7));
  const handleCurrentWeek = () => setCurrentMonday(getMondayOfWeek(new Date()));

  // Navegación de Meses para la Vista Mensual por Grupo
  const handlePrevMonth = () => {
    setSelectedMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setSelectedMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  const handleCurrentMonth = () => {
    setSelectedMonthDate(new Date());
  };
  const monthNameLabel = useMemo(() => {
    return selectedMonthDate.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  }, [selectedMonthDate]);

  // 1. Grupo seleccionado para la vista mensual simplificada
  const activeGroupObj = useMemo(() => {
    return allGroups.find((g) => g.name === selectedMonthlyGroup) || allGroups[0];
  }, [allGroups, selectedMonthlyGroup]);

  // 2. Horario parseado del grupo (días, horas automáticas)
  const parsedGroupSchedule = useMemo(() => {
    return parseGroupSchedule(activeGroupObj?.schedule);
  }, [activeGroupObj]);

  // 3. Clases de todo el mes según los días de entrenamiento configurados para dicho grupo
  const monthlyGroupClasses = useMemo(() => {
    if (!activeGroupObj) return [];

    const year = selectedMonthDate.getFullYear();
    const month = selectedMonthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const DAY_INDEX_TO_NAME: Record<number, DayOfWeek> = {
      0: "Domingo",
      1: "Lunes",
      2: "Martes",
      3: "Miércoles",
      4: "Jueves",
      5: "Viernes",
      6: "Sábado"
    };

    const result: {
      date: string;
      dateObj: Date;
      dayOfWeek: DayOfWeek;
      dayNumber: number;
      weekKey: string;
      mondayDate: Date;
      session?: PlannedClassSession;
    }[] = [];

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dt = new Date(year, month, dayNum);
      const dayName = DAY_INDEX_TO_NAME[dt.getDay()];

      // Mostrar SOLO los días que se tiene clase con dicho grupo
      if (parsedGroupSchedule.days.includes(dayName)) {
        const iso = formatDateIso(dt);
        const monday = getMondayOfWeek(dt);
        const weekKey = formatDateIso(monday);

        const found = plannedSessions.find(
          (s) =>
            s.group.trim().toLowerCase() === activeGroupObj.name.trim().toLowerCase() &&
            s.date === iso
        );

        result.push({
          date: iso,
          dateObj: dt,
          dayOfWeek: dayName,
          dayNumber: dayNum,
          weekKey,
          mondayDate: monday,
          session: found
        });
      }
    }

    return result;
  }, [activeGroupObj, parsedGroupSchedule, selectedMonthDate, plannedSessions]);

  // 4. Agrupar las clases del mes por semanas
  const monthlyWeeks = useMemo(() => {
    const map = new Map<
      string,
      {
        weekKey: string;
        mondayDate: Date;
        sundayDate: Date;
        weekNumber: number;
        label: string;
        weeklyTopic: string;
        classes: typeof monthlyGroupClasses;
      }
    >();

    monthlyGroupClasses.forEach((item) => {
      if (!map.has(item.weekKey)) {
        const sunday = addDays(item.mondayDate, 6);
        const wNum = getWeekNumber(item.mondayDate);
        const savedWeeklyTopic =
          getGroupWeeklyTopic(activeGroupObj?.name || "", item.weekKey) ||
          item.session?.weeklyTopic ||
          "";

        map.set(item.weekKey, {
          weekKey: item.weekKey,
          mondayDate: item.mondayDate,
          sundayDate: sunday,
          weekNumber: wNum,
          label: `Semana ${wNum} (${item.mondayDate.getDate()} ${item.mondayDate.toLocaleDateString("es-CO", { month: "short" })} - ${sunday.getDate()} ${sunday.toLocaleDateString("es-CO", { month: "short" })})`,
          weeklyTopic: savedWeeklyTopic,
          classes: []
        });
      }

      const weekEntry = map.get(item.weekKey)!;
      weekEntry.classes.push(item);
      if (!weekEntry.weeklyTopic && item.session?.weeklyTopic) {
        weekEntry.weeklyTopic = item.session.weeklyTopic;
      }
    });

    return Array.from(map.values());
  }, [monthlyGroupClasses, activeGroupObj]);

  // Guardar Tema General de la Semana
  const handleSaveWeekTopic = (weekKey: string, topic: string) => {
    if (!activeGroupObj?.name) return;
    saveGroupWeeklyTopic(activeGroupObj.name, weekKey, topic);

    // Actualizar también las sesiones existentes de esa semana
    const targetClasses = monthlyGroupClasses.filter((c) => c.weekKey === weekKey && c.session);
    targetClasses.forEach(async (c) => {
      if (c.session) {
        await savePlannedSession({
          ...c.session,
          weeklyTopic: topic.trim()
        });
      }
    });

    setEditingWeeklyTopicWeekKey(null);
    showToast("Tema general de la semana actualizado con éxito");
  };

  // Abrir Modal Simplificado para Llenar/Editar Clase de Grupo
  const handleOpenSimplifiedModal = (
    classItem: typeof monthlyGroupClasses[0],
    existingWeeklyTopic?: string
  ) => {
    const session = classItem.session;
    setEditingSession(session || null);
    setShowAdvancedInModal(false);

    let defaultCoach = allCoaches.find((c) => c.name === activeGroupObj?.coach);
    if (!defaultCoach && isCoach && user?.email) {
      defaultCoach = allCoaches.find((c) => c.email?.toLowerCase() === user.email?.toLowerCase());
    }
    if (!defaultCoach) defaultCoach = allCoaches[0];

    const weekTopic =
      existingWeeklyTopic ||
      session?.weeklyTopic ||
      getGroupWeeklyTopic(activeGroupObj?.name || "", classItem.weekKey) ||
      "";

    const sTopic = session?.specificTopic || session?.trainingTopic || "";
    const wTopic = session?.workedTopic || session?.technicalObjectives || "";
    const wVal = session?.workedValue || "Disciplina";

    setFormData({
      group: activeGroupObj?.name || "Selección A",
      coachId: session?.coachId || defaultCoach?.id || "coach-soul",
      coachName: session?.coachName || defaultCoach?.name || user?.displayName || "Profesor SOUL",
      coachEmail: session?.coachEmail || defaultCoach?.email || user?.email || "",
      date: classItem.date,
      dayOfWeek: classItem.dayOfWeek,
      startTime: session?.startTime || parsedGroupSchedule.startTime,
      endTime: session?.endTime || parsedGroupSchedule.endTime,
      durationHours: session?.durationHours || parsedGroupSchedule.durationHours,
      location: session?.location || activeGroupObj?.location || "Sede Central",
      weeklyTopic: weekTopic,
      specificTopic: sTopic,
      workedValue: wVal,
      workedTopic: wTopic,
      trainingTopic: sTopic,
      technicalObjectives: wTopic,
      materialsNeeded: (session?.materialsNeeded || ["Balones Molten", "Conos"]).join(", "),
      phaseCalentamiento:
        session?.phases?.find((p) => p.phase === "Calentamiento")?.description ||
        "Movilidad articular y activación (15 min)",
      phasePrincipal:
        session?.phases?.find((p) => p.phase === "Parte Principal")?.description ||
        "Trabajo técnico-táctico en cancha (60 min)",
      phaseVueltaCalma:
        session?.phases?.find((p) => p.phase === "Vuelta a la Calma")?.description ||
        "Vuelta a la calma y elongación (15 min)",
      status: session?.status || "planificada"
    });

    setIsModalOpen(true);
  };

  // Sesiones de la semana filtradas
  const weekSessions = useMemo(() => {
    const mondayIso = formatDateIso(currentMonday);
    const sundayIso = formatDateIso(currentSunday);

    return plannedSessions.filter((s) => {
      const inDateRange = s.date >= mondayIso && s.date <= sundayIso;
      if (!inDateRange) return false;

      // Filtro por Profe
      if (selectedCoachFilter !== "todos") {
        const coach = allCoaches.find((c) => c.id === selectedCoachFilter);
        if (coach) {
          const matchId = s.coachId === coach.id;
          const matchEmail = s.coachEmail && coach.email && s.coachEmail.toLowerCase() === coach.email.toLowerCase();
          const matchName = s.coachName && coach.name && s.coachName.toLowerCase() === coach.name.toLowerCase();
          if (!matchId && !matchEmail && !matchName) return false;
        }
      }

      // Filtro por Grupo
      if (selectedGroupFilter !== "todos" && s.group !== selectedGroupFilter) {
        return false;
      }

      // Filtro por Estado
      if (statusFilter !== "todos" && s.status !== statusFilter) {
        return false;
      }

      // Filtro por Búsqueda de texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesTopic = (s.trainingTopic || "").toLowerCase().includes(term);
        const matchesObj = (s.technicalObjectives || "").toLowerCase().includes(term);
        const matchesGroup = (s.group || "").toLowerCase().includes(term);
        const matchesCoach = (s.coachName || "").toLowerCase().includes(term);
        if (!matchesTopic && !matchesObj && !matchesGroup && !matchesCoach) return false;
      }

      return true;
    });
  }, [
    plannedSessions,
    currentMonday,
    currentSunday,
    selectedCoachFilter,
    selectedGroupFilter,
    statusFilter,
    searchTerm,
    allCoaches
  ]);

  // Sesiones agrupadas por día
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, PlannedClassSession[]>();
    weekDays.forEach((w) => map.set(w.iso, []));

    weekSessions.forEach((s) => {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    });

    return map;
  }, [weekDays, weekSessions]);

  // Sesiones agrupadas por profesor para la vista administrativa "Por Profesor"
  const coachWeeklyPlans = useMemo(() => {
    return allCoaches.map((coach) => {
      const matchCoachSessions = weekSessions.filter((s) => {
        const matchId = s.coachId === coach.id;
        const matchEmail = s.coachEmail && coach.email && s.coachEmail.toLowerCase() === coach.email.toLowerCase();
        const matchName = s.coachName && coach.name && s.coachName.toLowerCase() === coach.name.toLowerCase();
        return matchId || matchEmail || matchName;
      });

      const totalHours = matchCoachSessions.reduce((acc, s) => acc + (Number(s.durationHours) || 1.5), 0);
      const completedCount = matchCoachSessions.filter((s) => s.status === "completada").length;

      return {
        coach,
        sessions: matchCoachSessions,
        totalClasses: matchCoachSessions.length,
        completedClasses: completedCount,
        totalHours
      };
    }).filter((item) => {
      if (selectedCoachFilter === "todos") return true;
      return item.coach.id === selectedCoachFilter;
    });
  }, [allCoaches, weekSessions, selectedCoachFilter]);

  // Manejadores para desplegar / contraer el contenido de las tarjetas de clase
  const toggleSessionExpand = (sessionId: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedSessionIds(new Set(weekSessions.map((s) => s.id)));
  };

  const handleCollapseAll = () => {
    setExpandedSessionIds(new Set());
  };

  // Métricas y Contabilidad para Administrador
  const accountingMetrics = useMemo(() => {
    return computeCoachPlanningAccounting(plannedSessions, coachSessions, allCoaches);
  }, [plannedSessions, coachSessions, allCoaches]);

  // Abrir Modal para Crear
  const handleOpenCreateModal = (defaultDateIso?: string, defaultDay?: DayOfWeek) => {
    setEditingSession(null);
    setShowAdvancedInModal(false);
    const targetDate = defaultDateIso || formatDateIso(new Date());
    const matchedDay = defaultDay || "Lunes";

    let defaultCoach = allCoaches[0];
    if (isCoach && user?.email) {
      const mine = allCoaches.find((c) => c.email?.toLowerCase() === user.email?.toLowerCase());
      if (mine) defaultCoach = mine;
    }

    const targetGroup = activeGroupObj?.name || assignedGroupNames[0] || (allGroups[0]?.name ?? "Selección A");
    const monday = getMondayOfWeek(new Date(targetDate + "T12:00:00"));
    const weekKey = formatDateIso(monday);
    const savedWeeklyTopic = getGroupWeeklyTopic(targetGroup, weekKey) || "";

    setFormData({
      group: targetGroup,
      coachId: defaultCoach?.id || "coach-soul",
      coachName: defaultCoach?.name || (user?.displayName ?? "Profesor SOUL"),
      coachEmail: defaultCoach?.email || (user?.email ?? ""),
      date: targetDate,
      dayOfWeek: matchedDay,
      startTime: parsedGroupSchedule.startTime || "16:00",
      endTime: parsedGroupSchedule.endTime || "17:30",
      durationHours: parsedGroupSchedule.durationHours || 1.5,
      location: activeGroupObj?.location || "Sede Central",
      weeklyTopic: savedWeeklyTopic,
      specificTopic: "",
      workedValue: "Disciplina",
      workedTopic: "",
      trainingTopic: "",
      technicalObjectives: "",
      materialsNeeded: "15 Balones Molten, Conos",
      phaseCalentamiento: "Movilidad articular y trenzas de 3 (15 min)",
      phasePrincipal: "Ejercicios técnicos y combinaciones de ataque (60 min)",
      phaseVueltaCalma: "Elongación estática y recomendaciones (15 min)",
      status: "planificada"
    });
    setIsModalOpen(true);
  };

  // Abrir Modal para Editar
  const handleOpenEditModal = (session: PlannedClassSession) => {
    setEditingSession(session);
    setShowAdvancedInModal(false);
    const cal = session.phases?.find((p) => p.phase === "Calentamiento")?.description || "";
    const pri = session.phases?.find((p) => p.phase === "Parte Principal")?.description || "";
    const vue = session.phases?.find((p) => p.phase === "Vuelta a la Calma")?.description || "";

    const monday = getMondayOfWeek(new Date(session.date + "T12:00:00"));
    const weekKey = formatDateIso(monday);
    const weekTopic = session.weeklyTopic || getGroupWeeklyTopic(session.group, weekKey) || "";

    setFormData({
      group: session.group,
      coachId: session.coachId,
      coachName: session.coachName,
      coachEmail: session.coachEmail || "",
      date: session.date,
      dayOfWeek: session.dayOfWeek,
      startTime: session.startTime,
      endTime: session.endTime,
      durationHours: session.durationHours,
      location: session.location,
      weeklyTopic: weekTopic,
      specificTopic: session.specificTopic || session.trainingTopic,
      workedValue: session.workedValue || "Disciplina",
      workedTopic: session.workedTopic || session.technicalObjectives,
      trainingTopic: session.trainingTopic,
      technicalObjectives: session.technicalObjectives,
      materialsNeeded: (session.materialsNeeded || []).join(", "),
      phaseCalentamiento: cal || "Movilidad articular y activación (15 min)",
      phasePrincipal: pri || "Trabajo técnico-táctico en cancha (60 min)",
      phaseVueltaCalma: vue || "Vuelta a la calma y elongación (15 min)",
      status: session.status
    });
    setIsModalOpen(true);
  };

  // Aplicar plantilla rápida de voleibol
  const handleApplyTopicTemplate = (template: typeof VOLLEYBALL_TOPIC_TEMPLATES[0]) => {
    setFormData((prev) => ({
      ...prev,
      specificTopic: template.topic,
      trainingTopic: template.topic,
      workedTopic: template.objective,
      technicalObjectives: template.objective,
      materialsNeeded: template.materials.join(", ")
    }));
  };

  // Guardar Sesión Planificada
  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalSpecific = (formData.specificTopic || formData.trainingTopic).trim();
    if (!finalSpecific) {
      showToast("Debes ingresar el tema específico de la clase", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCoachObj = allCoaches.find((c) => c.id === formData.coachId);
      const coachName = selectedCoachObj?.name || formData.coachName;
      const coachEmail = selectedCoachObj?.email || formData.coachEmail;

      const phases: SessionPhase[] = [
        { phase: "Calentamiento", description: formData.phaseCalentamiento, durationMinutes: 15 },
        { phase: "Parte Principal", description: formData.phasePrincipal, durationMinutes: 60 },
        { phase: "Vuelta a la Calma", description: formData.phaseVueltaCalma, durationMinutes: 15 }
      ];

      const materials = formData.materialsNeeded
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const monday = getMondayOfWeek(new Date(formData.date + "T12:00:00"));
      const weekKey = formatDateIso(monday);

      // Si especificó tema general semanal, guardarlo para el grupo en esta semana
      if (formData.weeklyTopic.trim()) {
        saveGroupWeeklyTopic(formData.group, weekKey, formData.weeklyTopic.trim());
      }

      const finalWorked = (formData.workedTopic || formData.technicalObjectives).trim();

      const payload: Partial<PlannedClassSession> & { group: string; date: string; coachName: string } = {
        id: editingSession?.id,
        coachId: formData.coachId,
        coachName,
        coachEmail,
        group: formData.group,
        dayOfWeek: formData.dayOfWeek,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        durationHours: Number(formData.durationHours) || 1.5,
        location: formData.location,
        weeklyTopic: formData.weeklyTopic.trim(),
        specificTopic: finalSpecific,
        workedValue: formData.workedValue.trim() || "Disciplina",
        workedTopic: finalWorked,
        trainingTopic: finalSpecific,
        technicalObjectives: finalWorked,
        phases,
        materialsNeeded: materials,
        status: formData.status,
        adminApproved: editingSession ? editingSession.adminApproved : false,
        adminFeedback: editingSession ? editingSession.adminFeedback : ""
      };

      await savePlannedSession(payload);
      showToast(editingSession ? "Clase actualizada exitosamente" : "Clase planificada con éxito");
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error guardando clase planificada:", err);
      showToast("No se pudo guardar la planificación", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Eliminar Sesión Planificada
  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePlannedSession(deleteTarget.id);
      showToast(`Clase de "${deleteTarget.group}" eliminada.`);
      setDeleteTarget(null);
    } catch (err) {
      showToast("Error eliminando la clase", "error");
    }
  };

  // Guardar Revisión Administrativa (Aprobación / Observaciones)
  const handleSaveAdminReview = async () => {
    if (!reviewModalTarget) return;
    try {
      await savePlannedSession({
        ...reviewModalTarget,
        adminApproved: true,
        adminFeedback: adminFeedbackInput.trim()
      });
      showToast("Revisión administrativa registrada con éxito.");
      setReviewModalTarget(null);
      setAdminFeedbackInput("");
    } catch {
      showToast("Error guardando revisión", "error");
    }
  };

  // Exportar a CSV
  const handleExportCSV = () => {
    exportWeeklyPlanningCSV(weekSessions, `Semana_${weekNumber}_${weekRangeLabel}`);
    showToast("Planificación exportada a CSV");
  };

  // Renderizado de Tarjeta de Clase: Vista Previa Sencilla sin tanto texto, desplegable al hacer clic
  const renderClassCard = (session: PlannedClassSession, showDayBadge = false) => {
    const isExpanded = expandedSessionIds.has(session.id);
    const isCompleted = session.status === "completada";

    return (
      <div
        key={session.id}
        className={`rounded-2xl border transition-all text-xs overflow-hidden ${
          isExpanded
            ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/10 dark:ring-indigo-500/20 bg-white dark:bg-zinc-900 shadow-md"
            : isCompleted
            ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/40 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm"
            : "bg-white dark:bg-zinc-900/95 border-slate-200/90 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm"
        }`}
      >
        {/* VISTA PREVIA SENCILLA (Sin tanto texto - Al dar clic se despliega) */}
        <div
          onClick={() => toggleSessionExpand(session.id)}
          className="p-3 cursor-pointer select-none space-y-1.5 transition-colors hover:bg-slate-50/60 dark:hover:bg-zinc-800/40"
          role="button"
          tabIndex={0}
          title={isExpanded ? "Clic para contraer" : "Clic para desplegar contenido detallado"}
        >
          {/* Fila 1: Grupo + Día (opcional) + Estado + Flecha de despliegue */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                isCompleted ? "bg-emerald-500" : session.status === "en_curso" ? "bg-amber-500" : "bg-indigo-600"
              }`} />
              <span className="font-extrabold text-indigo-700 dark:text-indigo-300 text-xs truncate">
                {session.group}
              </span>
              {showDayBadge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 font-medium">
                  {session.dayOfWeek.slice(0, 3)} {session.date.slice(8, 10)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                isCompleted
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : session.status === "en_curso"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                  : "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}>
                {isCompleted ? "Dictada" : session.status}
              </span>

              <span className="p-0.5 text-slate-400 dark:text-zinc-500 hover:text-indigo-600 transition-transform">
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </div>
          </div>

          {/* Fila 2: Título conciso del Tema Técnico + Valor Trabajado */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="font-bold text-slate-900 dark:text-zinc-100 text-xs leading-tight line-clamp-1 flex-1">
              {session.specificTopic || session.trainingTopic || "Sesión Técnica"}
            </div>
            {session.workedValue && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                {session.workedValue}
              </span>
            )}
          </div>

          {/* Fila 3: Horario y Profesor */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 pt-0.5">
            <span className="inline-flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              {session.startTime} - {session.endTime}
            </span>
            <div className="flex items-center gap-1">
              <span className="font-medium truncate max-w-[95px]">
                Prof. {session.coachName.split(" ")[0]}
              </span>
              {session.adminApproved && (
                <span title="Aprobada por Administrador" className="inline-flex items-center">
                  <ShieldCheck className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CONTENIDO DESPLEGABLE (Al dar click sobre la tarjeta) */}
        {isExpanded && (
          <div className="px-3 pb-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800/80 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200 bg-slate-50/40 dark:bg-zinc-900/60">
            
            {/* Ubicación y Duración */}
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-300 bg-white dark:bg-zinc-800/80 p-2 rounded-xl border border-slate-200/70 dark:border-zinc-700/60">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3 text-indigo-500" />
                {session.location || "Sede Central"}
              </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                {session.durationHours || 1.5} hrs
              </span>
            </div>

            {/* Tema General de la Semana si está asignado */}
            {session.weeklyTopic && (
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/50 text-[11px] space-y-0.5">
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                  🎯 Tema de la Semana:
                </span>
                <p className="font-semibold text-purple-900 dark:text-purple-200">{session.weeklyTopic}</p>
              </div>
            )}

            {/* Tema Trabajado / Contenido */}
            {(session.workedTopic || session.technicalObjectives) && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">
                  Tema Trabajado / Dinámica:
                </span>
                <p className="text-slate-700 dark:text-zinc-300 text-[11px] leading-relaxed italic bg-white dark:bg-zinc-800/80 p-2 rounded-xl border border-slate-200/70 dark:border-zinc-700/60">
                  "{session.workedTopic || session.technicalObjectives}"
                </p>
              </div>
            )}

            {/* Fases Metodológicas */}
            {(session.phaseCalentamiento || session.phasePrincipal || session.phaseVueltaCalma) && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">
                  Fases de la Clase:
                </span>
                <div className="space-y-1 text-[10px]">
                  {session.phaseCalentamiento && (
                    <div className="p-1.5 rounded-lg bg-white dark:bg-zinc-800/80 border border-slate-200/70 dark:border-zinc-700/60">
                      <strong className="text-indigo-600 dark:text-indigo-400">1. Calentamiento (15m):</strong>{" "}
                      <span className="text-slate-600 dark:text-zinc-300">{session.phaseCalentamiento}</span>
                    </div>
                  )}
                  {session.phasePrincipal && (
                    <div className="p-1.5 rounded-lg bg-white dark:bg-zinc-800/80 border border-slate-200/70 dark:border-zinc-700/60">
                      <strong className="text-indigo-600 dark:text-indigo-400">2. Principal (60m):</strong>{" "}
                      <span className="text-slate-600 dark:text-zinc-300">{session.phasePrincipal}</span>
                    </div>
                  )}
                  {session.phaseVueltaCalma && (
                    <div className="p-1.5 rounded-lg bg-white dark:bg-zinc-800/80 border border-slate-200/70 dark:border-zinc-700/60">
                      <strong className="text-indigo-600 dark:text-indigo-400">3. Calma (15m):</strong>{" "}
                      <span className="text-slate-600 dark:text-zinc-300">{session.phaseVueltaCalma}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Materiales Necesarios */}
            {session.materialsNeeded && (
              <div className="text-[10px] text-slate-600 dark:text-zinc-400 flex items-start gap-1.5 bg-white dark:bg-zinc-800/80 p-2 rounded-xl border border-slate-200/70 dark:border-zinc-700/60">
                <Boxes className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <span><strong>Materiales:</strong> {session.materialsNeeded}</span>
              </div>
            )}

            {/* Feedback Administrativo si existe */}
            {session.adminFeedback && (
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-[10px] space-y-0.5">
                <span className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Feedback del Administrador:
                </span>
                <p className="text-purple-900 dark:text-purple-200 italic">{session.adminFeedback}</p>
              </div>
            )}

            {/* Botones de Acción */}
            <div className="pt-2 flex items-center justify-between gap-1.5 border-t border-slate-200 dark:border-zinc-800">
              <Link
                to={`/attendance?group=${encodeURIComponent(session.group)}&topic=${encodeURIComponent(session.trainingTopic || "")}`}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors shadow-sm"
                title="Iniciar clase y pasar lista en cancha"
              >
                <ClipboardCheck className="w-3 h-3" />
                <span>Pasar Lista</span>
              </Link>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectedClassDetails(session)}
                className="h-7 text-[10px] px-2 rounded-lg gap-1 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200"
                title="Ver todos los datos de la clase a detalle"
              >
                <Eye className="w-3 h-3" />
                <span>Ficha</span>
              </Button>

              <button
                type="button"
                onClick={() => handleOpenEditModal(session)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
                title="Editar clase"
              >
                <Edit2 className="w-3 h-3" />
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setReviewModalTarget(session);
                    setAdminFeedbackInput(session.adminFeedback || "");
                  }}
                  className="p-1.5 text-purple-500 hover:text-purple-700 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40"
                  title="Auditoría y Feedback Administrativo"
                >
                  <MessageSquare className="w-3 h-3" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setDeleteTarget(session)}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                title="Eliminar clase"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
      
      {/* Toast Flotante */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5 text-xs sm:text-sm font-semibold ${
          toast.type === "error"
            ? "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200"
            : toast.type === "info"
            ? "bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200"
            : "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200"
        }`}>
          {toast.type === "error" ? <AlertTriangle className="w-4 h-4 text-rose-600" /> : <Check className="w-4 h-4 text-emerald-600" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ENCABEZADO PRINCIPAL */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 text-xs px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-500/20 font-bold tracking-wide flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" /> PLANIFICACIÓN SEMANAL
            </span>
            <span className="text-slate-400 dark:text-zinc-500 text-xs font-mono">
              Semana {weekNumber} • {new Date().getFullYear()}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            Planificador de Clases & Currículo
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Programa los temas técnicos, objetivos y grupos de entrenamiento por semana. Permite al administrador auditar el trabajo docente y contabilizar horas y cumplimiento asertivamente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs h-9 gap-1.5 rounded-xl border-slate-200 dark:border-zinc-700 font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Sábana CSV</span>
          </Button>

          <Button
            type="button"
            onClick={() => handleOpenCreateModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm h-9 px-4 rounded-xl font-semibold gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Clase</span>
          </Button>
        </div>
      </div>

      {/* BARRA DE NAVEGACIÓN Y PESTAÑAS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3 rounded-2xl shadow-sm">
        
        {/* Controles de Navegación: Mes (si es vista por grupo) o Semana (si es calendario) */}
        {activeTab === "byGroupMonth" ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handlePrevMonth}
              className="h-8 w-8 rounded-lg"
              title="Mes Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white font-bold text-xs sm:text-sm tabular-nums flex items-center gap-1.5 capitalize">
              <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{monthNameLabel}</span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              className="h-8 w-8 rounded-lg"
              title="Mes Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCurrentMonth}
              className="text-xs h-8 px-2.5 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg"
            >
              Mes Actual
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handlePrevWeek}
              className="h-8 w-8 rounded-lg"
              title="Semana Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white font-bold text-xs sm:text-sm tabular-nums flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{weekRangeLabel}</span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleNextWeek}
              className="h-8 w-8 rounded-lg"
              title="Semana Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCurrentWeek}
              className="text-xs h-8 px-2.5 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg"
            >
              Semana Actual
            </Button>
          </div>
        )}

        {/* Pestañas de Vista */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab("byGroupMonth")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "byGroupMonth"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Planificador por Grupo ({monthlyGroupClasses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "calendar"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>Semana en Cancha ({weekSessions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("byCoach")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "byCoach"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Por Profesor ({coachWeeklyPlans.reduce((acc, c) => acc + c.totalClasses, 0)})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("accounting")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "accounting"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Auditoría ({accountingMetrics.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("templates")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "templates"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Currículo</span>
          </button>
        </div>
      </div>

      {/* BARRA DE FILTROS (PROFESOR, GRUPO, ESTADO, BÚSQUEDA) - VISIBLE EN VISTA SEMANAL Y PROFESORES */}
      {activeTab !== "byGroupMonth" && (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3 sm:p-4 rounded-2xl flex flex-wrap items-center gap-2.5 shadow-sm">
        
        {/* Buscador */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <Input
            placeholder="Buscar por tema técnico, objetivo, grupo o profe..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/60 border-slate-200 dark:border-zinc-700"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtro por Profesor */}
        <select
          value={selectedCoachFilter}
          onChange={(e) => setSelectedCoachFilter(e.target.value)}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-xs font-medium text-slate-700 dark:text-zinc-200 focus:outline-none"
        >
          <option value="todos">Todos los Profesores</option>
          {allCoaches.map((c) => (
            <option key={c.id} value={c.id}>
              Prof. {c.name}
            </option>
          ))}
        </select>

        {/* Filtro por Grupo */}
        <select
          value={selectedGroupFilter}
          onChange={(e) => setSelectedGroupFilter(e.target.value)}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-xs font-medium text-slate-700 dark:text-zinc-200 focus:outline-none"
        >
          <option value="todos">Todos los Grupos</option>
          {allGroups.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>

        {/* Filtro por Estado */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 text-xs font-medium text-slate-700 dark:text-zinc-200 focus:outline-none"
        >
          <option value="todos">Todos los Estados</option>
          <option value="planificada">Planificada</option>
          <option value="en_curso">En Curso</option>
          <option value="completada">Completada / Dictada</option>
          <option value="cancelada">Cancelada</option>
        </select>

        {/* Botones rápidos para Desplegar Todo / Vista Sencilla */}
        <div className="flex items-center gap-1.5 sm:ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="text-xs h-9 px-2.5 rounded-xl border-slate-200 dark:border-zinc-700 text-indigo-600 dark:text-indigo-400 gap-1 font-semibold"
            title="Desplegar todas las tarjetas para ver los datos completos"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desplegar Todo</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="text-xs h-9 px-2.5 rounded-xl border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 gap-1"
            title="Volver a la vista previa sencilla sin tanto texto"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vista Sencilla</span>
          </Button>
        </div>
      </div>
      )}

      {/* =====================================================================
          PESTAÑA 1: PLANIFICADOR MENSUAL POR GRUPO (SIMPLIFICADO MÓVIL)
          ===================================================================== */}
      {activeTab === "byGroupMonth" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* CARD DE CABECERA: SELECTOR DE GRUPO + MES + HORARIO DETECTADO */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-4 sm:p-5 rounded-2xl shadow-sm space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  1. Selecciona el Grupo de Entrenamiento:
                </label>
                <div className="relative max-w-md">
                  <select
                    value={selectedMonthlyGroup}
                    onChange={(e) => setSelectedMonthlyGroup(e.target.value)}
                    className="w-full h-11 rounded-xl border-2 border-indigo-500/40 focus:border-indigo-600 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white font-bold text-xs sm:text-sm px-3.5 pr-8 appearance-none shadow-sm cursor-pointer"
                  >
                    {allGroups.map((g) => {
                      const isAssigned = assignedGroupNames.includes(g.name);
                      return (
                        <option key={g.id} value={g.name}>
                          {isAssigned ? "⭐ " : ""}{g.name} ({g.category}) — {g.schedule}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Selector de Mes y Año */}
              <div className="space-y-1 sm:text-right">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block">
                  2. Mes de Planificación:
                </span>
                <div className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-800/80 p-1 rounded-xl border border-slate-200 dark:border-zinc-700">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevMonth}
                    className="h-8 w-8 rounded-lg"
                    title="Mes Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  <span className="px-2.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white capitalize">
                    {monthNameLabel}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleNextMonth}
                    className="h-8 w-8 rounded-lg"
                    title="Mes Siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCurrentMonth}
                    className="text-[10px] h-7 px-2 font-bold text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 rounded-lg ml-1"
                  >
                    Hoy
                  </Button>
                </div>
              </div>
            </div>

            {/* Banner Informativo del Horario Oficial del Grupo */}
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/50 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Horario de Entrenamiento:
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 font-mono">
                  {parsedGroupSchedule.days.join(", ")}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 font-bold text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/60 font-mono">
                  {parsedGroupSchedule.startTime} - {parsedGroupSchedule.endTime} ({parsedGroupSchedule.durationHours}h)
                </span>
                <span className="text-slate-500 dark:text-zinc-400">
                  • Sede: <strong className="text-slate-700 dark:text-zinc-200">{activeGroupObj?.location || "Sede Central"}</strong>
                </span>
                <span className="text-slate-500 dark:text-zinc-400">
                  • Entrenador: <strong className="text-slate-700 dark:text-zinc-200">{activeGroupObj?.coach || "Por asignar"}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge className="bg-emerald-600 text-white font-bold text-[10px]">
                  {monthlyGroupClasses.filter((c) => c.session).length} / {monthlyGroupClasses.length} Clases Listas
                </Badge>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                  ({monthlyGroupClasses.length} clases en {monthNameLabel})
                </span>
              </div>
            </div>
          </div>

          {/* LISTA DE SEMANAS Y CLASES DEL MES */}
          {monthlyWeeks.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 text-slate-500">
              <CalendarRange className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-sm">No se encontraron días de entrenamiento para este grupo en este mes.</p>
              <p className="text-xs text-slate-400 mt-1">Verifica el horario asignado al grupo en el módulo de Grupos.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {monthlyWeeks.map((week) => {
                const isEditingThisWeek = editingWeeklyTopicWeekKey === week.weekKey;
                const weekClassesCount = week.classes.length;
                const plannedInWeek = week.classes.filter((c) => c.session).length;

                return (
                  <div
                    key={week.weekKey}
                    className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4"
                  >
                    {/* CABECERA DE LA SEMANA + CONFIGURACIÓN DEL TEMA GENERAL */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-xs uppercase tracking-wider">
                            {week.label.split("(")[0].trim()}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                            ({week.label.split("(")[1]}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            • {plannedInWeek}/{weekClassesCount} clases planificadas
                          </span>
                        </div>

                        {/* TEMA GENERAL DE LA SEMANA */}
                        {!isEditingThisWeek ? (
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                              Tema General de la Semana:
                            </span>
                            {week.weeklyTopic ? (
                              <span className="px-3 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800 font-bold text-xs flex items-center gap-1.5 shadow-xs">
                                {week.weeklyTopic}
                              </span>
                            ) : (
                              <span className="text-xs text-amber-600 dark:text-amber-400 italic">
                                Sin tema semanal general asignado
                              </span>
                            )}

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingWeeklyTopicWeekKey(week.weekKey);
                                setWeeklyTopicInput(week.weeklyTopic || "");
                              }}
                              className="h-7 px-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg gap-1 font-semibold"
                            >
                              <Edit2 className="w-3 h-3" />
                              {week.weeklyTopic ? "Cambiar" : "Configurar Tema"}
                            </Button>
                          </div>
                        ) : (
                          /* Formulario Rápido para Editar Tema de la Semana */
                          <div className="p-3 bg-slate-50 dark:bg-zinc-800/80 rounded-xl border border-indigo-200 dark:border-indigo-800/80 space-y-2.5 mt-2 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Definir Tema General de la Semana:
                              </label>
                              <button
                                type="button"
                                onClick={() => setEditingWeeklyTopicWeekKey(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex gap-2">
                              <Input
                                value={weeklyTopicInput}
                                onChange={(e) => setWeeklyTopicInput(e.target.value)}
                                placeholder="Ej: Fundamentos de Recepción y K1"
                                className="h-9 text-xs bg-white dark:bg-zinc-900 font-semibold rounded-xl"
                                autoFocus
                              />
                              <Button
                                type="button"
                                onClick={() => handleSaveWeekTopic(week.weekKey, weeklyTopicInput)}
                                className="h-9 px-4 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shrink-0"
                              >
                                Guardar Tema
                              </Button>
                            </div>

                            {/* Sugerencias Rápidas de Temas Semanales (1 Toque) */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <span className="text-[10px] text-slate-400 block w-full">Sugerencias rápidas:</span>
                              {SOUL_WEEKLY_THEMES.slice(0, 5).map((theme, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setWeeklyTopicInput(theme)}
                                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-[10px] text-slate-700 dark:text-zinc-300 font-medium hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                                >
                                  {theme}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* GRID DE CLASES DE LA SEMANA */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {week.classes.map((item) => {
                        const session = item.session;
                        const isPlanned = Boolean(session);
                        const isCompleted = session?.status === "completada";

                        return (
                          <div
                            key={item.date}
                            className={`rounded-2xl border transition-all text-xs overflow-hidden flex flex-col justify-between p-3.5 ${
                              isCompleted
                                ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 shadow-sm"
                                : isPlanned
                                ? "bg-white dark:bg-zinc-900 border-slate-200/90 dark:border-zinc-800 shadow-sm hover:border-indigo-400"
                                : "bg-slate-50/60 dark:bg-zinc-900/40 border-dashed border-2 border-slate-200 dark:border-zinc-800 hover:border-indigo-300"
                            }`}
                          >
                            <div>
                              {/* Fila 1: Fecha Automática + Día */}
                              <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100 dark:border-zinc-800/80">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    isCompleted ? "bg-emerald-500" : isPlanned ? "bg-indigo-600" : "bg-slate-300 dark:bg-zinc-600"
                                  }`} />
                                  <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                                    {item.dayOfWeek} {item.dayNumber} {item.dateObj.toLocaleDateString("es-CO", { month: "short" })}
                                  </span>
                                </div>

                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  isCompleted
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : isPlanned
                                    ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                }`}>
                                  {isCompleted ? "Dictada" : isPlanned ? "Planificada" : "Por Planificar"}
                                </span>
                              </div>

                              {/* Horario y Sede Automáticos del Grupo */}
                              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 py-1.5">
                                <span className="font-mono flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-semibold">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {session?.startTime || parsedGroupSchedule.startTime} - {session?.endTime || parsedGroupSchedule.endTime}
                                </span>
                                <span className="truncate max-w-[120px] text-[10px] text-slate-400">
                                  {session?.location || activeGroupObj?.location}
                                </span>
                              </div>

                              {/* Contenido si ya está planificada */}
                              {isPlanned && session ? (
                                <div className="space-y-2 pt-1">
                                  {/* Tema Específico */}
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      🎯 Tema Específico:
                                    </span>
                                    <p className="font-bold text-slate-900 dark:text-zinc-100 text-xs leading-snug">
                                      {session.specificTopic || session.trainingTopic}
                                    </p>
                                  </div>

                                  {/* Valor Trabajado */}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                      💎 Valor:
                                    </span>
                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold border border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
                                      {session.workedValue || "Disciplina"}
                                    </span>
                                  </div>

                                  {/* Tema Trabajado */}
                                  {(session.workedTopic || session.technicalObjectives) && (
                                    <div className="space-y-0.5 pt-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                        📝 Tema Trabajado:
                                      </span>
                                      <p className="text-[11px] text-slate-600 dark:text-zinc-300 line-clamp-2 italic">
                                        "{session.workedTopic || session.technicalObjectives}"
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                /* Estado Pendiente por Planificar */
                                <div className="py-4 text-center space-y-1">
                                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                                    Sin plan registrado para este día.
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Botones de Acción de la Tarjeta */}
                            <div className="pt-3 mt-2 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-1.5">
                              {isPlanned && session ? (
                                <>
                                  <Link
                                    to={`/attendance?group=${encodeURIComponent(session.group)}&date=${session.date}&topic=${encodeURIComponent(session.specificTopic || session.trainingTopic || "")}`}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-2 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-colors shadow-sm"
                                    title="Ir a Asistencia en Cancha"
                                  >
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                    <span>Pasar Lista</span>
                                  </Link>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenSimplifiedModal(item, week.weeklyTopic)}
                                    className="h-8 text-[11px] px-2.5 rounded-xl gap-1 border-slate-200 dark:border-zinc-700"
                                    title="Editar información de la clase"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Editar</span>
                                  </Button>

                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(session)}
                                    className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                    title="Eliminar clase"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  onClick={() => handleOpenSimplifiedModal(item, week.weeklyTopic)}
                                  className="w-full h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>⚡ Llenar Plan de Clase</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: CALENDARIO SEMANAL POR DÍAS (LUNES A DOMINGO)
          ===================================================================== */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          
          {/* Métricas rápidas de la semana activa */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block">Clases Planificadas</span>
              <strong className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {weekSessions.length}
              </strong>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block">Horas Estimadas</span>
              <strong className="text-xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                {weekSessions.reduce((acc, s) => acc + (Number(s.durationHours) || 1.5), 0).toFixed(1)} hrs
              </strong>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block">Clases Dictadas</span>
              <strong className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {weekSessions.filter((s) => s.status === "completada").length}
              </strong>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block">Aprobadas por Admin</span>
              <strong className="text-xl font-bold text-purple-600 dark:text-purple-400 tabular-nums">
                {weekSessions.filter((s) => s.adminApproved).length} / {weekSessions.length}
              </strong>
            </div>
          </div>

          {/* Grid de 7 Columnas para los Días de la Semana */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3 items-start">
            {weekDays.map(({ dayName, date, iso }) => {
              const daySessions = sessionsByDay.get(iso) || [];
              const isToday = iso === formatDateIso(new Date());

              return (
                <div
                  key={iso}
                  className={`flex flex-col rounded-2xl border transition-all min-h-[350px] ${
                    isToday
                      ? "bg-indigo-50/30 dark:bg-indigo-950/15 border-indigo-300 dark:border-indigo-800 shadow-sm"
                      : "bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800"
                  }`}
                >
                  {/* Encabezado del Día */}
                  <div className={`p-3 border-b flex items-center justify-between rounded-t-2xl ${
                    isToday
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-50 dark:bg-zinc-800/60 border-slate-200/80 dark:border-zinc-800 text-slate-900 dark:text-zinc-100"
                  }`}>
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider block">
                        {dayName}
                      </span>
                      <span className={`text-[11px] font-medium ${isToday ? "text-indigo-100" : "text-slate-500 dark:text-zinc-400"}`}>
                        {date.getDate()} {date.toLocaleDateString("es-CO", { month: "short" })}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenCreateModal(iso, dayName)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        isToday
                          ? "bg-white/20 hover:bg-white/30 text-white"
                          : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200"
                      }`}
                      title={`Planificar clase para el ${dayName} ${iso}`}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Lista de Clases del Día (Vista Sencilla Desplegable) */}
                  <div className="p-2 space-y-2 flex-1">
                    {daySessions.length === 0 ? (
                      <div className="h-32 flex flex-col items-center justify-center text-center p-3 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                        <span className="text-[11px] text-slate-400 dark:text-zinc-600">
                          Sin clases planificadas
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenCreateModal(iso, dayName)}
                          className="mt-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                        >
                          + Agregar
                        </button>
                      </div>
                    ) : (
                      daySessions.map((session) => renderClassCard(session, false))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: VISTA AGRUPADA POR PROFESOR (GESTIÓN ADMINISTRATIVA)
          ===================================================================== */}
      {activeTab === "byCoach" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Tarjeta Informativa de Coordinación */}
          <div className="bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900 border border-indigo-100 dark:border-zinc-800 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Control Semanal de Planificación por Profesor</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Supervisa el trabajo curricular de cada entrenador para la semana ({weekRangeLabel}). Haz clic en cualquier tarjeta para desplegar sus datos a detalle.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleExpandAll}
                className="text-xs h-8 gap-1 rounded-xl"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Desplegar Todo</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCollapseAll}
                className="text-xs h-8 gap-1 rounded-xl"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Vista Sencilla</span>
              </Button>
            </div>
          </div>

          {/* Lista de Profesores y sus Clases Planificadas */}
          <div className="space-y-6">
            {coachWeeklyPlans.map(({ coach, sessions, totalClasses, completedClasses, totalHours }) => {
              return (
                <div
                  key={coach.id}
                  className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4"
                >
                  {/* Encabezado del Profesor */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-extrabold flex items-center justify-center text-sm border border-indigo-200/50 dark:border-indigo-500/20">
                        {coach.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                            Prof. {coach.name}
                          </h4>
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                            • {coach.email}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex-wrap">
                          <span>Especialidad: {coach.role || "Entrenador Principal"}</span>
                          {coach.assignedGroups && coach.assignedGroups.length > 0 && (
                            <>
                              <span>•</span>
                              <span>Grupos: {coach.assignedGroups.join(", ")}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      <div className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">{totalClasses}</strong> clases planificadas
                      </div>
                      <div className="px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        <strong className="tabular-nums">{totalHours.toFixed(1)}</strong> hrs
                      </div>
                      <div className="px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <strong className="tabular-nums">{completedClasses}</strong> dictadas
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          handleOpenCreateModal();
                          setFormData((prev) => ({
                            ...prev,
                            coachId: coach.id,
                            coachName: coach.name,
                            coachEmail: coach.email || ""
                          }));
                        }}
                        className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-1 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nueva Clase</span>
                      </Button>
                    </div>
                  </div>

                  {/* Grid de Clases Planificadas por este Profesor */}
                  {sessions.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50/50 dark:bg-zinc-800/20">
                      <Calendar className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                        Este profesor aún no tiene clases planificadas para esta semana
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Puedes asignar temas y grupos de entrenamiento usando el botón "+ Nueva Clase".
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sessions.map((sess) => renderClassCard(sess, true))}
                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: AUDITORÍA & CONTABILIDAD ADMINISTRATIVA
          ===================================================================== */}
      {activeTab === "accounting" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          
          <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                  <span>Consolidado Contable: Planificación vs Ejecución en Cancha</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Cruza las clases planificadas curricularmente contra las sesiones liquidadas en cancha por cada profesor.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="text-xs gap-1.5 h-8 rounded-xl font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Consolidado CSV</span>
              </Button>
            </div>

            {/* Tabla de Rendimiento Docente y Contabilidad */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                    <th className="pb-3">Profesor / Entrenador</th>
                    <th className="pb-3 text-center">Clases Planificadas</th>
                    <th className="pb-3 text-center">Horas Planificadas</th>
                    <th className="pb-3 text-center">Clases Ejecutadas (Cancha)</th>
                    <th className="pb-3 text-center">Horas Certificadas</th>
                    <th className="pb-3 text-center">Diferencia Horas</th>
                    <th className="pb-3 text-center">% Cumplimiento</th>
                    <th className="pb-3 text-right">Grupos Asignados</th>
                    <th className="pb-3 text-center pr-2">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                  {accountingMetrics.map((coachMetric) => {
                    const isFullyCompliant = coachMetric.complianceRate >= 90;
                    const hasDeficit = coachMetric.complianceRate < 70;

                    return (
                      <tr key={coachMetric.coachId} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/40">
                        <td className="py-3.5 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-xs">
                              {coachMetric.coachName.charAt(0)}
                            </div>
                            <div>
                              <span>{coachMetric.coachName}</span>
                              <span className="block text-[10px] text-slate-400 font-normal">
                                {coachMetric.coachEmail}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 text-center font-bold text-slate-700 dark:text-zinc-200 tabular-nums">
                          {coachMetric.plannedClassesCount}
                        </td>

                        <td className="py-3.5 text-center font-semibold text-slate-600 dark:text-zinc-400 tabular-nums">
                          {coachMetric.plannedHours.toFixed(1)} hrs
                        </td>

                        <td className="py-3.5 text-center font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {coachMetric.executedClassesCount}
                        </td>

                        <td className="py-3.5 text-center font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                          {coachMetric.executedHours.toFixed(1)} hrs
                        </td>

                        <td className="py-3.5 text-center font-bold tabular-nums">
                          <span className={coachMetric.hoursDifference >= 0 ? "text-emerald-600" : "text-amber-600"}>
                            {coachMetric.hoursDifference > 0 ? `+${coachMetric.hoursDifference}` : coachMetric.hoursDifference} hrs
                          </span>
                        </td>

                        <td className="py-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isFullyCompliant
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : hasDeficit
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                          }`}>
                            {coachMetric.complianceRate}%
                          </span>
                        </td>

                        <td className="py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {coachMetric.groupsCovered.map((g) => (
                              <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-medium">
                                {g}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 text-center pr-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCoachFilter(coachMetric.coachId);
                              setActiveTab("byCoach");
                            }}
                            className="h-7 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1 rounded-lg font-semibold"
                            title="Ver clases planificadas de este profesor"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver Clases</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: PLANTILLAS OFICIALES DE VOLEIBOL
          ===================================================================== */}
      {activeTab === "templates" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-2xl shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <span>Currículo Oficial de Entrenamiento SOUL Voley</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Plantillas pedagógicas listas para aplicar con 1-clic a cualquier día de la semana.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {VOLLEYBALL_TOPIC_TEMPLATES.map((tmpl, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/40 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                      Módulo Pedagógico {idx + 1}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {tmpl.topic}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-zinc-300">
                      {tmpl.objective}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-700">
                    <div className="text-[10px] text-slate-500">
                      <strong>Materiales recomendados:</strong> {tmpl.materials.join(", ")}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        handleOpenCreateModal();
                        handleApplyTopicTemplate(tmpl);
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 rounded-lg gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Usar en Planificación</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL SIMPLIFICADO MÓVIL: PLANIFICAR / EDITAR CLASE DEL GRUPO
          ===================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl relative space-y-4 my-6 max-h-[94vh] overflow-y-auto">
            
            {/* Encabezado del Modal con datos automáticos */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight">
                    {editingSession ? "Editar Plan de Clase" : "Planificar Clase del Grupo"}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Fechas y horas tomadas automáticamente del horario del grupo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Badges de Información Automática (Grupo, Fecha, Horario, Sede) */}
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-200">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>{formData.group}</span>
              </div>
              <span className="text-indigo-300">•</span>
              <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-semibold">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{formData.dayOfWeek}, {formatDisplayDate(formData.date)}</span>
              </div>
              <span className="text-indigo-300">•</span>
              <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{formData.startTime} - {formData.endTime} ({formData.durationHours}h)</span>
              </div>
              <span className="text-indigo-300">•</span>
              <div className="flex items-center gap-1 text-slate-500 dark:text-zinc-400">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{formData.location}</span>
              </div>
            </div>

            <form onSubmit={handleSaveSession} className="space-y-4 text-xs">
              
              {/* 1. TEMA GENERAL DE LA SEMANA */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    Tema General de la Semana
                  </label>
                  <span className="text-[10px] text-slate-400">Aplica a las clases de la semana</span>
                </div>
                <Input
                  value={formData.weeklyTopic}
                  onChange={(e) => setFormData((prev) => ({ ...prev, weeklyTopic: e.target.value }))}
                  placeholder="Ej: Fundamentos de Recepción y K1"
                  className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 font-medium border-slate-200 dark:border-zinc-700"
                />
                {/* Sugerencias rápidas de temas semanales */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
                  <span className="text-[10px] text-slate-400 shrink-0 font-medium">Sugerir:</span>
                  {SOUL_WEEKLY_THEMES.slice(0, 4).map((th, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, weeklyTopic: th }))}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-purple-100 dark:hover:bg-purple-950/40 text-[10px] text-slate-700 dark:text-zinc-300 whitespace-nowrap transition-colors"
                    >
                      {th.split(":")[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. TEMA ESPECÍFICO DE CADA CLASE */}
              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Tema Específico de la Clase *
                </label>
                <Input
                  value={formData.specificTopic}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      specificTopic: e.target.value,
                      trainingTopic: e.target.value
                    }))
                  }
                  placeholder="Ej: Recepción de saque flotante en zona 5"
                  className="h-10 text-xs rounded-xl bg-white dark:bg-zinc-800 font-bold border-2 border-indigo-500/30 focus:border-indigo-600"
                  required
                  autoFocus
                />
                {/* Sugerencias rápidas de temas específicos */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
                  <span className="text-[10px] text-slate-400 shrink-0 font-medium">Sugerir:</span>
                  {SOUL_SPECIFIC_THEMES.slice(0, 4).map((th, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          specificTopic: th,
                          trainingTopic: th
                        }))
                      }
                      className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-[10px] whitespace-nowrap transition-colors font-medium"
                    >
                      {th}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. VALOR TRABAJADO EN LA CLASE (SELECTOR DE CHIPS TÁCTILES) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 text-xs">
                    <span>💎</span>
                    Valor Trabajado en la Clase *
                  </label>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">
                    Seleccionado: {formData.workedValue || "Disciplina"}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto p-1 bg-slate-50/80 dark:bg-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-700/60">
                  {SOUL_CLASS_VALUES.map((val) => {
                    const isSelected = formData.workedValue === val.name;
                    return (
                      <button
                        key={val.name}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, workedValue: val.name }))}
                        className={`p-2 rounded-xl text-left transition-all border flex items-center gap-1.5 select-none ${
                          isSelected
                            ? "ring-2 ring-indigo-500 bg-indigo-600 text-white border-transparent font-bold shadow-sm scale-[1.02]"
                            : `${val.color} hover:brightness-95 font-medium`
                        }`}
                      >
                        <span className="text-sm shrink-0">{val.emoji}</span>
                        <span className="text-[11px] truncate leading-tight">{val.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. TEMA TRABAJADO / CONTENIDO O DINÁMICA */}
              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Tema Trabajado / Dinámica de la Sesión
                </label>
                <textarea
                  rows={2}
                  value={formData.workedTopic}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      workedTopic: e.target.value,
                      technicalObjectives: e.target.value
                    }))
                  }
                  placeholder="Ej: Rueda de 10 saques dirigidos, recepción en tríos y juego condicionado 6 vs 6."
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-2.5 text-xs focus:bg-white dark:focus:bg-zinc-900"
                />
              </div>

              {/* ACORDEÓN: PARÁMETROS ADICIONALES (OPCIONALES) */}
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAdvancedInModal(!showAdvancedInModal)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 hover:underline py-1"
                >
                  {showAdvancedInModal ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{showAdvancedInModal ? "Ocultar opciones avanzadas" : "Modificar horario, sede o materiales (Opcional)"}</span>
                </button>

                {showAdvancedInModal && (
                  <div className="space-y-3 pt-2 animate-in fade-in duration-200">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 block mb-0.5">
                          Hora Inicio
                        </label>
                        <Input
                          type="time"
                          value={formData.startTime}
                          onChange={(e) => setFormData((prev) => ({ ...prev, startTime: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 block mb-0.5">
                          Hora Fin
                        </label>
                        <Input
                          type="time"
                          value={formData.endTime}
                          onChange={(e) => setFormData((prev) => ({ ...prev, endTime: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 block mb-0.5">
                        Materiales Necesarios
                      </label>
                      <Input
                        value={formData.materialsNeeded}
                        onChange={(e) => setFormData((prev) => ({ ...prev, materialsNeeded: e.target.value }))}
                        placeholder="Ej: 15 Balones Molten, Conos"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* BOTONES DE ACCIÓN: EN CELULAR OCUPAN ANCHO COMPLETO TÁCTIL */}
              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-col-reverse sm:flex-row items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto h-10 rounded-xl text-xs"
                >
                  Cancelar
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? "Guardando..." : "✅ Guardar Plan de Clase"}</span>
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: FEEDBACK ADMINISTRATIVO & AUDITORÍA
          ===================================================================== */}
      {reviewModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Auditoría Administrativa
                </h3>
              </div>
              <button onClick={() => setReviewModalTarget(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2 bg-slate-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-slate-200 dark:border-zinc-700">
              <div>
                <span className="text-slate-500 text-[10px] block">GRUPO & PROFESOR:</span>
                <strong className="text-slate-900 dark:text-white">{reviewModalTarget.group} • Prof. {reviewModalTarget.coachName}</strong>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">TEMA PLANIFICADO:</span>
                <p className="font-semibold text-slate-800 dark:text-zinc-200">{reviewModalTarget.trainingTopic}</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                Observaciones o Recomendaciones al Profe:
              </label>
              <textarea
                rows={3}
                placeholder="Ej: Excelente enfoque técnico en recepción. Monitorear intensidad con juveniles..."
                value={adminFeedbackInput}
                onChange={(e) => setAdminFeedbackInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-2.5 text-xs"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReviewModalTarget(null)}
                className="text-xs"
              >
                Cerrar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveAdminReview}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1 font-semibold"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aprobar y Guardar Feedback</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: CONFIRMACIÓN DE ELIMINACIÓN
          ===================================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">¿Eliminar Clase Planificada?</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400">
              Se eliminará la planificación de <strong>{deleteTarget.group}</strong> del día <strong>{deleteTarget.date}</strong> ({deleteTarget.trainingTopic}).
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleExecuteDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Eliminar Clase
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: DETALLES COMPLETOS DE LA CLASE PLANIFICADA
          ===================================================================== */}
      {selectedClassDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            
            {/* Encabezado del Detalle */}
            <div className="flex items-start justify-between pb-3.5 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <CalendarRange className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                      {selectedClassDetails.group}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      selectedClassDetails.status === "completada"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : selectedClassDetails.status === "en_curso"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        : "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"
                    }`}>
                      {selectedClassDetails.status === "completada" ? "Clase Dictada" : selectedClassDetails.status}
                    </span>
                    {selectedClassDetails.adminApproved && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Aprobada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {selectedClassDetails.dayOfWeek}, {formatDisplayDate(selectedClassDetails.date)} • {selectedClassDetails.startTime} a {selectedClassDetails.endTime} ({selectedClassDetails.durationHours || 1.5} hrs)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClassDetails(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid de Datos Clave: Profesor, Sede, Horario */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Profesor a Cargo</span>
                <strong className="text-slate-900 dark:text-white block text-sm">{selectedClassDetails.coachName}</strong>
                <span className="text-[11px] text-slate-500 block truncate">{selectedClassDetails.coachEmail}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ubicación / Sede</span>
                <div className="flex items-center gap-1 text-slate-900 dark:text-white text-sm font-semibold">
                  <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>{selectedClassDetails.location || "Sede Central"}</span>
                </div>
                <span className="text-[11px] text-slate-500 block">Cancha oficial del club</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fecha & Horario</span>
                <div className="flex items-center gap-1 text-slate-900 dark:text-white text-sm font-semibold">
                  <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>{selectedClassDetails.durationHours || 1.5} Horas</span>
                </div>
                <span className="text-[11px] text-slate-500 block font-mono">{selectedClassDetails.startTime} - {selectedClassDetails.endTime}</span>
              </div>
            </div>

            {/* Tema y Valor Trabajado */}
            <div className="p-4 rounded-2xl border border-indigo-100 dark:border-indigo-950/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                  Tema Específico de la Sesión:
                </span>
                {selectedClassDetails.workedValue && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                    💎 Valor Trabajado: {selectedClassDetails.workedValue}
                  </span>
                )}
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {selectedClassDetails.specificTopic || selectedClassDetails.trainingTopic}
              </h4>
              {selectedClassDetails.weeklyTopic && (
                <div className="text-xs text-purple-700 dark:text-purple-300 font-semibold flex items-center gap-1.5 pt-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tema de la Semana: {selectedClassDetails.weeklyTopic}</span>
                </div>
              )}
              {(selectedClassDetails.workedTopic || selectedClassDetails.technicalObjectives) && (
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed italic border-t border-indigo-200/50 dark:border-indigo-900/40 pt-2">
                  "{selectedClassDetails.workedTopic || selectedClassDetails.technicalObjectives}"
                </p>
              )}
            </div>

            {/* Estructura de Fases de Entrenamiento */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Fases Metodológicas del Entrenamiento:</span>
              </h5>
              
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-indigo-700 dark:text-indigo-400 text-xs">1. Calentamiento y Activación</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold">15 min</span>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-300 text-xs">
                    {selectedClassDetails.phaseCalentamiento || "Movilidad articular, desplazamientos y coordinación motriz."}
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-indigo-700 dark:text-indigo-400 text-xs">2. Fase Principal & Drills Técnicos</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold">60 min</span>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-300 text-xs">
                    {selectedClassDetails.phasePrincipal || "Ejercicios específicos en parejas, tríos y secuencias tácticas."}
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-indigo-700 dark:text-indigo-400 text-xs">3. Vuelta a la Calma & Cierre</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 font-semibold">15 min</span>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-300 text-xs">
                    {selectedClassDetails.phaseVueltaCalma || "Elongación guiada, feedback y retroalimentación con el grupo."}
                  </p>
                </div>
              </div>
            </div>

            {/* Materiales Requeridos */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="font-semibold text-slate-700 dark:text-zinc-300">Materiales Necesarios:</span>
              </div>
              <span className="font-medium text-slate-900 dark:text-zinc-100">{selectedClassDetails.materialsNeeded || "Balones Molten, Conos"}</span>
            </div>

            {/* Sección de Auditoría y Feedback Administrativo */}
            <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Auditoría de Coordinación / Administrador
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  selectedClassDetails.adminApproved
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                }`}>
                  {selectedClassDetails.adminApproved ? "Aprobada por Administrador" : "Pendiente de Aprobación"}
                </span>
              </div>

              {selectedClassDetails.adminFeedback ? (
                <p className="text-purple-900 dark:text-purple-200 italic bg-white/70 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800/60">
                  "{selectedClassDetails.adminFeedback}"
                </p>
              ) : (
                <p className="text-slate-500 dark:text-zinc-400 text-[11px]">
                  Sin observaciones registradas por la administración aún.
                </p>
              )}

              {isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const sess = selectedClassDetails;
                    setReviewModalTarget(sess);
                    setAdminFeedbackInput(sess.adminFeedback || "");
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs h-8 rounded-lg gap-1.5 font-semibold mt-1"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{selectedClassDetails.adminApproved ? "Editar Feedback o Aprobación" : "Aprobar Clase & Dejar Feedback"}</span>
                </Button>
              )}
            </div>

            {/* Botones de Pie de Modal */}
            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
              <Link
                to={`/attendance?group=${encodeURIComponent(selectedClassDetails.group)}&topic=${encodeURIComponent(selectedClassDetails.trainingTopic || "")}`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Iniciar & Pasar Lista en Cancha</span>
              </Link>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const sess = selectedClassDetails;
                    setSelectedClassDetails(null);
                    handleOpenEditModal(sess);
                  }}
                  className="text-xs h-9 rounded-xl gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedClassDetails(null)}
                  className="text-xs h-9 rounded-xl"
                >
                  Cerrar
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

