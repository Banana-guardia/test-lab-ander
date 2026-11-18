import { useState, useEffect, useMemo } from "react";
import {
  db,
  mergeCoachesData,
  mergeAthletesData,
  mergeGroupsData,
  resolveCoachAssignedGroups,
  type UnifiedCoach,
  type UnifiedAthlete,
  type UnifiedGroup
} from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuthStore } from "@/store/authStore";
import { Link } from "react-router-dom";
import {
  Clock,
  Calendar,
  Award,
  Users,
  ClipboardCheck,
  ArrowRight,
  Sparkles,
  FileText,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Layers,
  CalendarRange,
  Boxes
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface CoachSession {
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
  trainingTopic?: string;
  courtNotes?: string;
  createdAt?: any;
}

export default function CoachDashboard() {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [fsCoaches, setFsCoaches] = useState<any[]>([]);
  const [fsAthletes, setFsAthletes] = useState<any[]>([]);
  const [fsGroups, setFsGroups] = useState<any[]>([]);

  // Fecha actual formateada
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const formattedToday = today.toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // 1. Escuchar entrenadores, deportistas y grupos desde Firestore (con respaldo híbrido automático)
  useEffect(() => {
    const unsubCoaches = onSnapshot(
      collection(db, "coaches"),
      (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setFsCoaches(list);
      },
      () => {}
    );

    const unsubAthletes = onSnapshot(
      collection(db, "athletes"),
      (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setFsAthletes(list);
      },
      () => {}
    );

    const unsubGroups = onSnapshot(
      collection(db, "groups"),
      (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setFsGroups(list);
      },
      () => {}
    );

    return () => {
      unsubCoaches();
      unsubAthletes();
      unsubGroups();
    };
  }, []);

  // Unificar datos de entrenadores, deportistas y grupos
  const allCoaches: UnifiedCoach[] = useMemo(() => mergeCoachesData(fsCoaches), [fsCoaches]);
  const allAthletes: UnifiedAthlete[] = useMemo(() => mergeAthletesData(fsAthletes), [fsAthletes]);
  const allGroups: UnifiedGroup[] = useMemo(
    () => mergeGroupsData(fsGroups, allCoaches, allAthletes),
    [fsGroups, allCoaches, allAthletes]
  );

  // Resolver grupos asignados al entrenador logueado y sus deportistas
  const { coachProfile, assignedGroups } = useMemo(
    () => resolveCoachAssignedGroups(user, allCoaches, allGroups),
    [user, allCoaches, allGroups]
  );

  const totalAssignedAthletes = useMemo(
    () => assignedGroups.reduce((acc, g) => acc + g.studentsList.length, 0),
    [assignedGroups]
  );

  // 2. Escuchar sesiones del entrenador actual (Firestore + LocalStorage)
  useEffect(() => {
    if (!user) return;
    const cleanEmail = (user.email || "").trim().toLowerCase();

    const getLocalCoachSessions = (): CoachSession[] => {
      try {
        const stored: CoachSession[] = JSON.parse(localStorage.getItem("soul_local_coach_sessions") || "[]");
        return stored.filter(
          (s) =>
            s.coachId === user.uid ||
            (cleanEmail && (s.coachEmail || "").trim().toLowerCase() === cleanEmail)
        );
      } catch {
        return [];
      }
    };

    try {
      const unsubscribe = onSnapshot(
        collection(db, "coach_sessions"),
        (snapshot) => {
          const list: CoachSession[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as CoachSession;
            if (
              data.coachId === user.uid ||
              (cleanEmail && (data.coachEmail || "").trim().toLowerCase() === cleanEmail)
            ) {
              list.push({ ...data, id: d.id || data.id });
            }
          });

          const localList = getLocalCoachSessions();
          const map = new Map<string, CoachSession>();
          [...localList, ...list].forEach((item) => map.set(item.id, item));

          const merged = Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          setSessions(merged);
          setLoading(false);
        },
        () => {
          const localList = getLocalCoachSessions();
          localList.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          setSessions(localList);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch {
      const localList = getLocalCoachSessions();
      setSessions(localList);
      setLoading(false);
    }
  }, [user]);

  // Filtrar sesiones del mes en curso para métricas
  const currentMonthSessions = sessions.filter((s) => s.date && s.date.startsWith(currentMonthStr));
  const totalHoursThisMonth = currentMonthSessions.reduce((acc, s) => acc + (Number(s.durationHours) || 0), 0);
  const principalCount = currentMonthSessions.filter((s) => s.roleInSession === "principal").length;

  const displayCoachName = coachProfile?.name || user?.displayName || user?.email?.split("@")[0] || "Entrenador";

  return (
    <div className="space-y-6 pb-6">
      {/* Banner de Bienvenida SaaS */}
      <div className="agy-card p-6 relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-[11px] font-medium mb-2.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{coachProfile?.role || "Portal de Entrenador Oficial"}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
              ¡Hola, <span className="text-indigo-600 dark:text-indigo-400">{displayCoachName}</span>!
            </h1>
            <p className="text-slate-500 dark:text-zinc-400 text-xs sm:text-sm mt-1 capitalize">
              {formattedToday}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/planner">
              <Button variant="outline" className="w-full sm:w-auto text-xs sm:text-sm font-semibold gap-1.5 rounded-lg h-10 px-4 border-slate-200 dark:border-zinc-700">
                <CalendarRange className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Planificador Semanal</span>
              </Button>
            </Link>

            <Link to="/inventory">
              <Button variant="outline" className="w-full sm:w-auto text-xs sm:text-sm font-semibold gap-1.5 rounded-lg h-10 px-4 border-slate-200 dark:border-zinc-700">
                <Boxes className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Materiales de Cancha</span>
              </Button>
            </Link>

            <Link
              to={
                assignedGroups.length > 0
                  ? `/attendance?group=${encodeURIComponent(assignedGroups[0].name)}`
                  : "/attendance"
              }
              className="w-full sm:w-auto"
            >
              <Button className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold shadow-xs gap-2 rounded-lg h-10 px-5">
                <ClipboardCheck className="w-4 h-4" />
                <span>Tomar Asistencia Hoy</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tarjetas de Resumen del Entrenador */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Mi Resumen de Cancha</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Grupos asignados, deportistas a cargo y horas dictadas este mes
            </p>
          </div>
          <Link
            to="/attendance"
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold shrink-0"
          >
            <span className="hidden sm:inline">Ver historial</span>
            <span className="sm:hidden">Historial</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Mis Grupos Asignados */}
          <div className="agy-card p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
                Mis Grupos
              </p>
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
                {assignedGroups.length}
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                {assignedGroups.length === 1 ? "grupo" : "grupos"}
              </span>
            </div>
            <Link
              to="/groups"
              className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline mt-1.5 block truncate"
            >
              Ver mis grupos →
            </Link>
          </div>

          {/* Deportistas a Cargo */}
          <div className="agy-card p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
                Deportistas a Cargo
              </p>
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
                {totalAssignedAthletes}
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">alumnos</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 truncate">
              En tus grupos activos
            </p>
          </div>

          {/* Horas Totales */}
          <div className="agy-card p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
                Horas Este Mes
              </p>
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
                {totalHoursThisMonth.toFixed(1)}
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">hrs</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 truncate tabular-nums">
              {currentMonthSessions.length}{" "}
              {currentMonthSessions.length === 1 ? "clase este mes" : "clases este mes"}
            </p>
          </div>

          {/* Entrenador Principal */}
          <div className="agy-card p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
                Como Principal
              </p>
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
                {principalCount}
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">clases</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 truncate">
              Liderazgo en cancha
            </p>
          </div>
        </div>
      </div>

      {/* SECCIÓN PRINCIPAL: Mis Grupos a Cargo y Deportistas de cada Grupo */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Mis Grupos Asignados y Deportistas</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Listado en tiempo real de los grupos donde dictas clase y los alumnos inscritos en cada uno
            </p>
          </div>
          <Link
            to="/groups"
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold shrink-0"
          >
            <span>Ver todos los grupos</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {assignedGroups.map((group) => (
            <div key={group.id} className="agy-card p-5 sm:p-6 flex flex-col justify-between space-y-4">
              <div>
                {/* Cabecera del Grupo */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-zinc-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                        {group.name}
                      </h3>
                      <Badge variant="default" className="text-[11px]">
                        {group.category}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {group.location}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        {group.schedule}
                      </span>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-semibold tabular-nums text-slate-800 dark:text-zinc-200 shrink-0">
                    <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    {group.studentsList.length}{" "}
                    {group.studentsList.length === 1 ? "deportista" : "deportistas"}
                  </span>
                </div>

                {/* Lista de Deportistas del Grupo */}
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2.5">
                    Deportistas del Grupo ({group.studentsList.length})
                  </p>

                  {group.studentsList.length === 0 ? (
                    <div className="agy-surface-subtle py-6 px-4 text-center text-xs text-slate-500 dark:text-zinc-400">
                      Aún no hay deportistas asignados a <strong>{group.name}</strong>.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-200/60 dark:divide-zinc-800/80 rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40">
                      {group.studentsList.map((student, idx) => (
                        <div
                          key={student.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-white dark:hover:bg-zinc-800/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold tabular-nums flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">
                                {student.name}
                              </p>
                              {student.category && (
                                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                                  Categoría: {student.category}
                                  {student.age ? ` • ${student.age} años` : ""}
                                </p>
                              )}
                            </div>
                          </div>

                          <Badge
                            variant={student.status === "Inactivo" ? "neutral" : "success"}
                            className="text-[10px] shrink-0"
                          >
                            {student.status || "Activo"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Botón de Acción Directa para el Grupo */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  Profe titular: <strong className="text-slate-700 dark:text-zinc-300">{group.coach}</strong>
                </span>
                <Link to={`/attendance?group=${encodeURIComponent(group.name)}`}>
                  <Button size="sm" className="h-8 px-3 text-xs gap-1.5 rounded-lg">
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>Tomar Asistencia</span>
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Clases Dictadas Recientemente */}
      <div className="agy-card p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate">Mis Últimas Clases Registradas</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
              Reporte de asistencia y horas certificadas en cancha
            </p>
          </div>
          <Link to="/attendance" className="shrink-0">
            <Button variant="outline" size="sm" className="text-xs rounded-lg">
              + Nueva Clase
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400 dark:text-zinc-500 text-sm">
            Cargando tus clases dictadas...
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
            <FileText className="w-9 h-9 text-slate-400 dark:text-zinc-500 mx-auto mb-2" />
            <p className="text-slate-800 dark:text-zinc-200 font-semibold text-sm">
              Aún no has registrado ninguna clase dictada
            </p>
            <p className="text-slate-500 dark:text-zinc-400 text-xs mt-1 max-w-sm mx-auto">
              Cada vez que tomes asistencia para tu grupo, se generará tu reporte automático de horas y rol en cancha.
            </p>
            <Link to="/attendance" className="mt-4 inline-block">
              <Button size="sm" className="text-xs mt-2 rounded-lg">
                Tomar Mi Primera Asistencia
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Vista Móvil */}
            <div className="space-y-3 md:hidden">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="agy-surface-subtle p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tabular-nums text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      {s.date}
                    </span>
                    <Badge variant="success" className="text-[10px] gap-1 tabular-nums">
                      <CheckCircle2 className="w-3 h-3" />
                      {s.durationHours} hrs
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                      {s.group}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                      <strong className="text-emerald-600 dark:text-emerald-400">{s.totalPresentes}</strong> presentes
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-zinc-800 text-[11px]">
                    <span className="text-slate-600 dark:text-zinc-300 truncate">
                      {s.roleInSession === "principal"
                        ? "Principal"
                        : `Asistente${s.headCoachName ? ` (${s.headCoachName})` : ""}`}
                    </span>
                    {s.startTime && s.endTime && (
                      <span className="text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">
                        {s.startTime} - {s.endTime}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Vista Escritorio: Tabla */}
            <div className="hidden md:block rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Fecha</th>
                    <th className="py-3 px-4 font-semibold">Grupo</th>
                    <th className="py-3 px-4 font-semibold">Rol en Cancha</th>
                    <th className="py-3 px-4 font-semibold">Horario / Duración</th>
                    <th className="py-3 px-4 font-semibold">Asistentes</th>
                    <th className="py-3 px-4 font-semibold">Tema de Entrenamiento</th>
                    <th className="py-3 px-4 font-semibold text-right">Certificación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
                  {sessions.slice(0, 5).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-medium tabular-nums text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>{s.date}</span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-zinc-100">
                        {s.group}
                      </td>
                      <td className="py-3.5 px-4">
                        {s.roleInSession === "principal" ? (
                          <Badge variant="warning" className="text-xs">
                            Entrenador Principal
                          </Badge>
                        ) : (
                          <div className="flex flex-col">
                            <Badge variant="default" className="text-xs w-fit">
                              Asistente
                            </Badge>
                            {s.headCoachName && (
                              <span className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                                De: <strong className="text-slate-700 dark:text-zinc-200">{s.headCoachName}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs tabular-nums">
                        <span className="font-semibold text-slate-900 dark:text-zinc-100">
                          {s.durationHours} hrs
                        </span>
                        {s.startTime && s.endTime && (
                          <span className="text-slate-500 dark:text-zinc-400 block text-[11px]">
                            {s.startTime} - {s.endTime}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {s.totalPresentes}
                        </span>{" "}
                        alumnos
                      </td>
                      <td
                        className="py-3.5 px-4 text-xs text-slate-600 dark:text-zinc-300 max-w-xs truncate"
                        title={s.trainingTopic || "Sin tema especificado"}
                      >
                        {s.trainingTopic || "Sesión regular"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Badge variant="success" className="text-[11px] gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Registrada
                        </Badge>
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
  );
}
