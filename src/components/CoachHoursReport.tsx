import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteDoc, doc } from "firebase/firestore";
import { db, type UnifiedCoach } from "@/lib/firebase";
import {
  buildCoachAccountingSummaries,
  COACH_SESSIONS_UPDATED_EVENT,
  exportCoachAccountingCSV,
  exportCoachSessionsDetailCSV,
  LOCAL_COACH_SESSIONS_KEY,
  resolveSessionCoachDisplay,
  subscribeCoachSessions,
  type CoachSessionRecord
} from "@/lib/coachSessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Award,
  Calendar,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  CalendarRange
} from "lucide-react";

interface CoachHoursReportProps {
  coaches: Array<Pick<UnifiedCoach, "id" | "name" | "email" | "role">>;
}

export default function CoachHoursReport({ coaches }: CoachHoursReportProps) {
  const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const [sessions, setSessions] = useState<CoachSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);
  const [selectedCoachKey, setSelectedCoachKey] = useState<string>("todos");
  const [roleFilter, setRoleFilter] = useState<"todos" | "principal" | "asistente">("todos");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedReportModal, setSelectedReportModal] = useState<CoachSessionRecord | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeCoachSessions(
      (merged) => {
        setSessions(merged);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 1. Filtrar por período (mes o histórico completo) y rol en cancha
  const periodAndRoleSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (!showAllMonths && selectedMonth) {
        if (!s.date || !s.date.startsWith(selectedMonth)) return false;
      }
      if (roleFilter !== "todos" && s.roleInSession !== roleFilter) {
        return false;
      }
      return true;
    });
  }, [sessions, showAllMonths, selectedMonth, roleFilter]);

  // 2. Construir resumen contable consolidado por profesor
  const allSummariesForPeriod = useMemo(() => {
    return buildCoachAccountingSummaries(periodAndRoleSessions, coaches, true);
  }, [periodAndRoleSessions, coaches]);

  // Lista de profesores disponibles para el selector
  const coachFilterOptions = useMemo(() => {
    return allSummariesForPeriod.map((s) => ({
      key: s.coachKey,
      name: s.coachName,
      totalClasses: s.totalClasses
    }));
  }, [allSummariesForPeriod]);

  // 3. Filtrar resúmenes según buscador o profesor seleccionado
  const visibleSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSummariesForPeriod.filter((summary) => {
      if (selectedCoachKey !== "todos" && summary.coachKey !== selectedCoachKey) {
        return false;
      }
      if (!q) return true;
      return (
        summary.coachName.toLowerCase().includes(q) ||
        summary.coachEmail.toLowerCase().includes(q) ||
        summary.coachRole.toLowerCase().includes(q) ||
        summary.groups.some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [allSummariesForPeriod, selectedCoachKey, searchQuery]);

  // 4. Sesiones detalladas filtradas por profesor y búsqueda
  const visibleDetailSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return periodAndRoleSessions.filter((s) => {
      const resolved = resolveSessionCoachDisplay(s, coaches);
      if (selectedCoachKey !== "todos" && resolved.key !== selectedCoachKey) {
        return false;
      }
      if (!q) return true;
      return (
        resolved.name.toLowerCase().includes(q) ||
        resolved.email.toLowerCase().includes(q) ||
        (s.group || "").toLowerCase().includes(q) ||
        (s.location || "").toLowerCase().includes(q) ||
        (s.trainingTopic || "").toLowerCase().includes(q)
      );
    });
  }, [periodAndRoleSessions, coaches, selectedCoachKey, searchQuery]);

  // 5. KPIs y Totales Contables
  const totals = useMemo(() => {
    let totalClasses = 0;
    let principalClasses = 0;
    let principalHours = 0;
    let assistantClasses = 0;
    let assistantHours = 0;
    let totalHours = 0;
    let totalStudents = 0;
    let activeCoaches = 0;

    visibleSummaries.forEach((s) => {
      if (s.totalClasses > 0) activeCoaches += 1;
      totalClasses += s.totalClasses;
      principalClasses += s.principalClasses;
      principalHours += s.principalHours;
      assistantClasses += s.assistantClasses;
      assistantHours += s.assistantHours;
      totalHours += s.totalHours;
      totalStudents += s.totalStudentsAttended;
    });

    return {
      totalClasses,
      principalClasses,
      principalHours: Math.round(principalHours * 10) / 10,
      assistantClasses,
      assistantHours: Math.round(assistantHours * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
      totalStudents,
      activeCoaches
    };
  }, [visibleSummaries]);

  const periodLabel = showAllMonths ? "historico_completo" : selectedMonth || currentMonthStr;

  const formatDisplayDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      return new Intl.DateTimeFormat("es-CO", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const handleDeleteSession = async (session: CoachSessionRecord) => {
    const coach = resolveSessionCoachDisplay(session, coaches);
    if (!confirm(`¿Eliminar el registro de clase de ${coach.name} (${session.group} - ${session.date})?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "coach_sessions", session.id));
    } catch {
      // Continuar con limpieza local si Firestore no permite borrar o es sesión local
    }
    try {
      const stored: CoachSessionRecord[] = JSON.parse(localStorage.getItem(LOCAL_COACH_SESSIONS_KEY) || "[]");
      localStorage.setItem(
        LOCAL_COACH_SESSIONS_KEY,
        JSON.stringify(stored.filter((item) => item.id !== session.id))
      );
      window.dispatchEvent(new Event(COACH_SESSIONS_UPDATED_EVENT));
    } catch {}
    setSessions((prev) => prev.filter((item) => item.id !== session.id));
    if (selectedReportModal?.id === session.id) {
      setSelectedReportModal(null);
    }
  };

  const selectedModalCoach = selectedReportModal
    ? resolveSessionCoachDisplay(selectedReportModal, coaches)
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Barra de Filtros Contables y Exportación */}
      <div className="agy-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Control Contable de Horas & Clases por Profesor</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Consolidado de sesiones certificadas en cancha para liquidación y revisión administrativa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/planner">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-100"
              >
                <CalendarRange className="w-3.5 h-3.5" />
                <span>Planificador & Cumplimiento</span>
              </Button>
            </Link>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={visibleSummaries.length === 0}
              onClick={() => exportCoachAccountingCSV(visibleSummaries, periodLabel)}
              className="text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Resumen CSV</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={visibleDetailSessions.length === 0}
              onClick={() => exportCoachSessionsDetailCSV(visibleDetailSessions, coaches, periodLabel)}
              className="text-xs gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Exportar Detalle CSV</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-2 border-t border-slate-200/70 dark:border-zinc-800">
          {/* Filtro por Mes */}
          <div className="lg:col-span-3 flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              disabled={showAllMonths}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setShowAllMonths(false);
              }}
              className="flex-1 h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <Button
              type="button"
              size="sm"
              variant={showAllMonths ? "default" : "outline"}
              onClick={() => setShowAllMonths((prev) => !prev)}
              className="h-10 text-xs shrink-0"
              title="Alternar entre mes seleccionado e histórico completo"
            >
              {showAllMonths ? "Todo" : "Histórico"}
            </Button>
          </div>

          {/* Filtro por Profesor */}
          <div className="lg:col-span-3 flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 h-10">
            <Users className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
            <select
              value={selectedCoachKey}
              onChange={(e) => setSelectedCoachKey(e.target.value)}
              className="w-full bg-transparent text-slate-900 dark:text-zinc-100 text-xs outline-none cursor-pointer"
            >
              <option value="todos" className="bg-white dark:bg-zinc-900">
                Todos los Profesores ({coachFilterOptions.length})
              </option>
              {coachFilterOptions.map((c) => (
                <option key={c.key} value={c.key} className="bg-white dark:bg-zinc-900">
                  {c.name} ({c.totalClasses})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Rol en Cancha */}
          <div className="lg:col-span-2 flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 h-10">
            <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "todos" | "principal" | "asistente")}
              className="w-full bg-transparent text-slate-900 dark:text-zinc-100 text-xs outline-none cursor-pointer"
            >
              <option value="todos" className="bg-white dark:bg-zinc-900">Todos los Roles</option>
              <option value="principal" className="bg-white dark:bg-zinc-900">Solo Principal</option>
              <option value="asistente" className="bg-white dark:bg-zinc-900">Solo Asistente</option>
            </select>
          </div>

          {/* Buscador */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-3 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar profesor, grupo, sede o tema..."
              className="pl-9 text-xs h-10"
            />
          </div>
        </div>
      </div>

      {/* Tarjetas KPI de Contabilidad */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Total Horas Dictadas
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {totals.totalHours.toFixed(1)} <span className="text-sm font-medium text-slate-500">hrs</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">
            {totals.principalHours}h Principal • {totals.assistantHours}h Asistente
          </p>
        </div>

        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Clases Certificadas
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {totals.totalClasses}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">
            🥇 {totals.principalClasses} Principal • 🥈 {totals.assistantClasses} Asistente
          </p>
        </div>

        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Profes con Clases
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {totals.activeCoaches}
            <span className="text-sm font-normal text-slate-400"> / {visibleSummaries.length}</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Con registros en el período
          </p>
        </div>

        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Asistencias Atendidas
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-purple-600 dark:text-purple-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {totals.totalStudents}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Deportistas presentes sumados
          </p>
        </div>
      </div>

      {/* Tabla 1: Resumen Consolidado por Profesor (Contabilidad) */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
              Resumen por Profesor ({showAllMonths ? "Histórico Completo" : selectedMonth})
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Haz clic en un profesor para filtrar su detalle de clases abajo.
            </p>
          </div>
          {selectedCoachKey !== "todos" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedCoachKey("todos")}
              className="text-xs h-7 text-indigo-600 dark:text-indigo-400"
            >
              Ver todos los profesores
            </Button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 dark:text-zinc-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
            Cargando sesiones registradas...
          </div>
        ) : visibleSummaries.length === 0 ? (
          <div className="py-10 text-center text-slate-500 dark:text-zinc-400 text-xs">
            No se encontraron profesores con los filtros actuales.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Profesor / Entrenador</TableHead>
                  <TableHead className="text-center">Clases</TableHead>
                  <TableHead className="text-center">Principal (🥇)</TableHead>
                  <TableHead className="text-center">Asistente (🥈)</TableHead>
                  <TableHead className="text-right">Total Horas</TableHead>
                  <TableHead>Grupos Dictados</TableHead>
                  <TableHead className="text-right pr-5">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSummaries.map((item) => {
                  const isSelected = selectedCoachKey === item.coachKey;
                  return (
                    <TableRow
                      key={item.coachKey}
                      className={isSelected ? "bg-indigo-50/60 dark:bg-indigo-500/10" : undefined}
                    >
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border border-slate-200 dark:border-zinc-700">
                            <AvatarFallback className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold text-xs">
                              {item.coachName
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm text-slate-900 dark:text-zinc-100">
                              {item.coachName}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                              {item.coachRole}
                              {item.coachEmail ? ` • ${item.coachEmail}` : ""}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-center tabular-nums font-semibold">
                        {item.totalClasses}
                      </TableCell>

                      <TableCell className="text-center tabular-nums text-xs">
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          {item.principalHours.toFixed(1)} hrs
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-zinc-400">
                          {item.principalClasses} {item.principalClasses === 1 ? "clase" : "clases"}
                        </span>
                      </TableCell>

                      <TableCell className="text-center tabular-nums text-xs">
                        <span className="font-semibold text-blue-700 dark:text-blue-300">
                          {item.assistantHours.toFixed(1)} hrs
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-zinc-400">
                          {item.assistantClasses} {item.assistantClasses === 1 ? "clase" : "clases"}
                        </span>
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                            item.totalHours > 0
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30"
                              : "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {item.totalHours.toFixed(1)} hrs
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {item.groups.length === 0 ? (
                            <span className="text-[11px] text-slate-400 dark:text-zinc-500">Sin clases</span>
                          ) : (
                            item.groups.map((g) => (
                              <Badge key={g} variant="secondary" className="text-[10px]">
                                {g}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() =>
                              setSelectedCoachKey(isSelected ? "todos" : item.coachKey)
                            }
                            className="h-8 text-xs"
                          >
                            {isSelected ? "Mostrando" : "Ver clases"}
                          </Button>
                          <Link
                            to={`/planner?coach=${encodeURIComponent(item.coachKey)}&tab=byCoach`}
                            className="h-8 px-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                            title="Ver clases planificadas de este profesor en el planificador semanal"
                          >
                            <CalendarRange className="w-3.5 h-3.5" />
                            <span>Plan semanal</span>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="font-bold text-slate-900 dark:text-zinc-100">
                    TOTAL CONSOLIDADO
                  </TableCell>
                  <TableCell className="text-center font-bold tabular-nums text-slate-900 dark:text-zinc-100">
                    {totals.totalClasses}
                  </TableCell>
                  <TableCell className="text-center font-bold tabular-nums text-xs text-amber-700 dark:text-amber-300">
                    {totals.principalHours.toFixed(1)} hrs ({totals.principalClasses})
                  </TableCell>
                  <TableCell className="text-center font-bold tabular-nums text-xs text-blue-700 dark:text-blue-300">
                    {totals.assistantHours.toFixed(1)} hrs ({totals.assistantClasses})
                  </TableCell>
                  <TableCell className="text-right font-extrabold tabular-nums text-indigo-700 dark:text-indigo-300">
                    {totals.totalHours.toFixed(1)} hrs
                  </TableCell>
                  <TableCell colSpan={2} className="text-right text-xs text-slate-500 dark:text-zinc-400 pr-5">
                    {totals.totalStudents} asistencias totales
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>

      {/* Tabla 2: Detalle Cronológico de Sesiones Dictadas */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
              Detalle de Clases Dictadas ({visibleDetailSessions.length})
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Cada registro proviene de la toma de asistencia oficial en cancha.
            </p>
          </div>
        </div>

        {visibleDetailSessions.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-zinc-400">
            <FileText className="w-9 h-9 text-slate-400 mx-auto mb-2" />
            <p className="font-semibold text-sm text-slate-800 dark:text-zinc-200">
              No hay clases registradas en este período
            </p>
            <p className="text-xs mt-1">
              Cuando los profesores guarden asistencia desde Asistencia & Cancha, sus sesiones aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Profesor</TableHead>
                  <TableHead>Grupo & Sede</TableHead>
                  <TableHead>Rol en Cancha</TableHead>
                  <TableHead>Horario / Duración</TableHead>
                  <TableHead className="text-center">Presentes</TableHead>
                  <TableHead>Tema Dictado</TableHead>
                  <TableHead className="text-right pr-5">Planilla</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDetailSessions.map((session) => {
                  const coach = resolveSessionCoachDisplay(session, coaches);
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-semibold text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>{formatDisplayDate(session.date)}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <p className="font-semibold text-xs text-slate-900 dark:text-zinc-100">
                          {coach.name}
                        </p>
                        {coach.email && (
                          <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                            {coach.email}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="text-xs">
                        <p className="font-bold text-indigo-600 dark:text-indigo-400">{session.group}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {session.location || "Sede Norte"}
                        </p>
                      </TableCell>

                      <TableCell>
                        {session.roleInSession === "principal" ? (
                          <Badge className="bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px]">
                            🥇 Principal
                          </Badge>
                        ) : (
                          <div>
                            <Badge className="bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300 text-[11px]">
                              🥈 Asistente
                            </Badge>
                            {session.headCoachName && (
                              <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                                De: <strong>{session.headCoachName}</strong>
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="tabular-nums text-xs whitespace-nowrap">
                        <span className="font-bold text-slate-900 dark:text-zinc-100">
                          {Number(session.durationHours || 0).toFixed(1)} hrs
                        </span>
                        {session.startTime && session.endTime && (
                          <span className="block text-[11px] text-slate-500 dark:text-zinc-400">
                            {session.startTime} - {session.endTime}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-center tabular-nums text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {session.totalPresentes}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          {" "}/ {(session.totalPresentes || 0) + (session.totalAusentes || 0)}
                        </span>
                      </TableCell>

                      <TableCell className="max-w-xs truncate text-xs" title={session.trainingTopic || ""}>
                        {session.trainingTopic || "Sesión técnica regular"}
                      </TableCell>

                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedReportModal(session)}
                            className="h-8 px-2.5 text-xs gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Planilla</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSession(session)}
                            className="h-8 w-8 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                            title="Eliminar registro de sesión"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Modal: Planilla Oficial de Clase */}
      {selectedReportModal && selectedModalCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="agy-card w-full max-w-lg p-5 sm:p-6 relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    Planilla Oficial de Clase
                  </h3>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">
                    Soporte contable de horas dictadas
                  </p>
                </div>
              </div>
              <button
                type="button"
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
                <strong className="text-slate-900 dark:text-white text-sm">
                  {formatDisplayDate(selectedReportModal.date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Horario Dictado</span>
                <span className="text-slate-700 dark:text-slate-300 font-mono">
                  {selectedReportModal.startTime || "16:00"} - {selectedReportModal.endTime || "18:00"} (
                  {selectedReportModal.durationHours} hrs)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Sede de Cancha</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {selectedReportModal.location || "Sede Norte"}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/25 rounded-xl space-y-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400 block font-medium">Profesor / Entrenador:</span>
              <div className="text-slate-900 dark:text-white font-bold text-sm flex flex-wrap items-center justify-between gap-2">
                <span>{selectedModalCoach.name}</span>
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
                <strong className="text-emerald-600 dark:text-emerald-400 text-base">
                  {selectedReportModal.totalPresentes}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">AUSENTES</span>
                <strong className="text-rose-600 dark:text-rose-400 text-base">
                  {selectedReportModal.totalAusentes || 0}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">PERMISO</span>
                <strong className="text-amber-600 dark:text-amber-400 text-base">
                  {selectedReportModal.totalJustificados || 0}
                </strong>
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

            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Certificada en base de datos
              </span>
              <Button
                type="button"
                onClick={() => setSelectedReportModal(null)}
                className="text-xs h-8 rounded-lg"
              >
                Cerrar Planilla
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

