import { useState, useEffect, useMemo } from "react";
import {
  db,
  mergeCoachesData,
  mergeAthletesData,
  mergeGroupsData,
  resolveCoachAssignedGroups,
  type UnifiedGroup,
  type UnifiedAthlete
} from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Users,
  MapPin,
  Trash2,
  Search,
  RefreshCw,
  X,
  Database,
  CalendarDays,
  AlertTriangle,
  Eye,
  UserCheck,
  ClipboardCheck
} from "lucide-react";
import { seedInitialDataIfEmpty } from "@/lib/seedData";
import { useAuthStore } from "@/store/authStore";
import { Link } from "react-router-dom";

export type Group = UnifiedGroup;

export default function Groups() {
  const { user, role } = useAuthStore();
  const isCoach = role === "coach";

  const [fsGroups, setFsGroups] = useState<any[]>([]);
  const [fsCoaches, setFsCoaches] = useState<any[]>([]);
  const [fsAthletes, setFsAthletes] = useState<any[]>([]);
  const [localRefreshTick, setLocalRefreshTick] = useState(0);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [coachScope, setCoachScope] = useState<"assigned" | "all">("assigned");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Estado para Visualización de Alumnos
  const [rosterGroup, setRosterGroup] = useState<UnifiedGroup | null>(null);

  // Estado para Diálogo de Eliminación
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    category: "Juvenil",
    coach: "Juan Pérez",
    location: "Sede Norte",
    schedule: "Lun-Mié-Vie 18:00",
    athletes: "15"
  });

  // Listeners en tiempo real de grupos, entrenadores y deportistas (con respaldo híbrido automático)
  useEffect(() => {
    const unsubGroups = onSnapshot(
      collection(db, "groups"),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setFsGroups(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    const unsubCoaches = onSnapshot(
      collection(db, "coaches"),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setFsCoaches(list);
      },
      () => {}
    );

    const unsubAthletes = onSnapshot(
      collection(db, "athletes"),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setFsAthletes(list);
      },
      () => {}
    );

    return () => {
      unsubGroups();
      unsubCoaches();
      unsubAthletes();
    };
  }, []);

  // Unificar datos de entrenadores, deportistas y grupos
  const allCoaches = useMemo(() => mergeCoachesData(fsCoaches), [fsCoaches, localRefreshTick]);
  const allAthletes = useMemo(() => mergeAthletesData(fsAthletes), [fsAthletes, localRefreshTick]);
  const allGroups = useMemo(
    () => mergeGroupsData(fsGroups, allCoaches, allAthletes),
    [fsGroups, allCoaches, allAthletes, localRefreshTick]
  );

  // Resolver grupos asignados al entrenador actual
  const { assignedGroups, assignedGroupNames } = useMemo(
    () => resolveCoachAssignedGroups(user, allCoaches, allGroups),
    [user, allCoaches, allGroups]
  );

  // Lista base según rol y filtro del entrenador
  const activeGroupsList = useMemo(() => {
    if (!isCoach) return allGroups;
    return coachScope === "assigned" ? assignedGroups : allGroups;
  }, [isCoach, coachScope, assignedGroups, allGroups]);

  // Crear Grupo en Firestore + LocalStorage
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    const newGroupPayload = {
      name: formData.name.trim(),
      category: formData.category,
      coach: formData.coach.trim(),
      location: formData.location.trim(),
      schedule: formData.schedule.trim(),
      athletes: parseInt(formData.athletes, 10) || 0
    };

    let createdId = `local-grp-${Date.now()}`;

    try {
      const ref = await addDoc(collection(db, "groups"), {
        ...newGroupPayload,
        createdAt: serverTimestamp()
      });
      createdId = ref.id;
    } catch {
      // Continuar con persistencia local si Firestore está restringido
    }

    try {
      const stored = JSON.parse(localStorage.getItem("soul_local_groups") || "[]");
      const filtered = stored.filter(
        (g: any) => (g.name || "").trim().toLowerCase() !== newGroupPayload.name.toLowerCase()
      );
      filtered.push({ id: createdId, ...newGroupPayload });
      localStorage.setItem("soul_local_groups", JSON.stringify(filtered));
    } catch {}

    setLocalRefreshTick((t) => t + 1);
    setFormData({
      name: "",
      category: "Juvenil",
      coach: "Juan Pérez",
      location: "Sede Norte",
      schedule: "Lun-Mié-Vie 18:00",
      athletes: "15"
    });
    setIsModalOpen(false);
    setSubmitting(false);
  };

  // Confirmar y Eliminar Grupo
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, "groups", deleteTarget.id));
    } catch {
      // Ignorar si no existe en Firestore o reglas restringidas
    } finally {
      try {
        const stored = JSON.parse(localStorage.getItem("soul_local_groups") || "[]");
        const filtered = stored.filter(
          (g: any) =>
            g.id !== deleteTarget.id &&
            (g.name || "").trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase()
        );
        localStorage.setItem("soul_local_groups", JSON.stringify(filtered));
      } catch {}
      setLocalRefreshTick((t) => t + 1);
      setDeleteTarget(null);
      setIsDeleting(false);
    }
  };

  const handleSeed = async () => {
    setLoading(true);
    await seedInitialDataIfEmpty(true);
    setLocalRefreshTick((t) => t + 1);
    setLoading(false);
  };

  const handleOpenRoster = (group: UnifiedGroup) => {
    setRosterGroup(group);
  };

  const filteredGroups = activeGroupsList.filter(
    (g) =>
      (g.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (g.coach?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (g.location?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      g.studentsList.some((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const inputFieldClass =
    "w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors";

  // Obtener lista actualizada de alumnos para el grupo seleccionado en el modal
  const currentRosterStudents: UnifiedAthlete[] = useMemo(() => {
    if (!rosterGroup) return [];
    const found = allGroups.find(
      (g) => g.name.trim().toLowerCase() === rosterGroup.name.trim().toLowerCase()
    );
    return found ? found.studentsList : rosterGroup.studentsList || [];
  }, [rosterGroup, allGroups]);

  return (
    <div className="space-y-5 sm:space-y-6 pb-8 max-w-5xl mx-auto">
      {/* Cabecera Simplificada */}
      <div className="agy-card p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                {isCoach ? "Mis Grupos y Deportistas" : "Grupos"}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 tabular-nums">
                {activeGroupsList.length} {activeGroupsList.length === 1 ? "grupo" : "grupos"}
              </span>
            </div>
            <p className="text-slate-500 dark:text-zinc-400 mt-0.5 text-xs sm:text-sm">
              {isCoach
                ? "Categorías, horarios asignados y deportistas inscritos en cada uno de tus grupos."
                : "Gestión en tiempo real de grupos, horarios y deportistas asignados."}
            </p>
          </div>
        </div>

        {isCoach ? (
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 p-1 rounded-lg border border-slate-200/80 dark:border-zinc-700 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setCoachScope("assigned")}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                coachScope === "assigned"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              Mis Grupos ({assignedGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setCoachScope("all")}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                coachScope === "all"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              Todos ({allGroups.length})
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {allGroups.length === 0 && !loading && (
              <Button variant="outline" onClick={handleSeed} className="rounded-lg text-xs">
                <Database className="w-4 h-4 mr-2" />
                Cargar Demo
              </Button>
            )}

            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold rounded-lg shadow-sm w-full sm:w-auto h-10 px-4"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Crear Grupo
            </Button>
          </div>
        )}
      </div>

      <div className="agy-card overflow-hidden">
        {/* Buscador */}
        <div className="p-4 border-b border-slate-200/70 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              placeholder="Buscar por grupo, deportista, entrenador o sede..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${inputFieldClass} pl-9`}
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 hidden sm:block">
            Sincronizado con la base de datos
          </div>
        </div>

        {/* Vista Desktop: Tabla */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-zinc-800/50">
              <TableRow className="border-slate-200 dark:border-zinc-800 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  Grupo
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  Entrenador
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  Sede & Horario
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  Deportistas en el Grupo
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Cargando grupos y deportistas...
                  </TableCell>
                </TableRow>
              ) : filteredGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                    No se encontraron grupos.
                  </TableCell>
                </TableRow>
              ) : (
                filteredGroups.map((group) => {
                  const isAssignedToMe = assignedGroupNames.some(
                    (gName) => gName.trim().toLowerCase() === group.name.trim().toLowerCase()
                  );
                  return (
                    <TableRow
                      key={group.id}
                      className="border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-zinc-100">{group.name}</p>
                          {isCoach && isAssignedToMe && (
                            <Badge variant="success" className="text-[10px]">
                              Mi Grupo
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 mt-1 text-xs"
                        >
                          {group.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        {group.coach}
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-zinc-300">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{group.location}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                            <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>{group.schedule}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <span className="inline-flex items-center gap-1.5 text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-2.5 py-0.5 rounded-md text-xs font-semibold tabular-nums">
                            <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            {group.studentsList.length}{" "}
                            {group.studentsList.length === 1 ? "deportista" : "deportistas"}
                          </span>
                          {group.studentsList.length > 0 && (
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-xs truncate">
                              {group.studentsList.map((s) => s.name).join(", ")}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenRoster(group)}
                            className="text-xs h-8 gap-1.5 rounded-lg"
                            title="Ver lista completa de deportistas"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver Deportistas ({group.studentsList.length})</span>
                          </Button>
                          <Link to={`/attendance?group=${encodeURIComponent(group.name)}`}>
                            <Button
                              size="sm"
                              className="text-xs h-8 gap-1.5 rounded-lg"
                              title="Tomar asistencia a este grupo"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              <span>Asistencia</span>
                            </Button>
                          </Link>
                          {!isCoach && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget({ id: group.id, name: group.name })}
                              className="text-slate-400 hover:text-rose-500 h-8 w-8"
                              title="Eliminar grupo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Vista Mobile: Tarjetas cómodas */}
        <div className="md:hidden flex flex-col divide-y divide-slate-200/70 dark:divide-zinc-800">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Cargando grupos...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No hay grupos registrados.
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-slate-900 dark:text-zinc-100 leading-tight truncate">
                      {group.name}
                    </h3>
                    <span className="inline-block text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {group.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenRoster(group)}
                      className="text-xs h-8 px-2.5 gap-1.5 rounded-lg"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{group.studentsList.length} alumnos</span>
                    </Button>
                    <Link to={`/attendance?group=${encodeURIComponent(group.name)}`}>
                      <Button size="sm" className="text-xs h-8 px-2.5 rounded-lg">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    {!isCoach && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget({ id: group.id, name: group.name })}
                        className="text-slate-400 hover:text-rose-500 h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="agy-surface-subtle p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Entrenador:</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                      {group.coach}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Sede:</span>
                    <span className="text-slate-700 dark:text-zinc-300 font-medium">{group.location}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Horario:</span>
                    <span className="text-slate-700 dark:text-zinc-300 font-medium">{group.schedule}</span>
                  </div>
                  {group.studentsList.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-200/70 dark:border-zinc-800">
                      <span className="text-slate-500 block mb-1">Deportistas:</span>
                      <p className="text-slate-800 dark:text-zinc-200 font-medium leading-relaxed">
                        {group.studentsList.map((s) => s.name).join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Confirmar Eliminación */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="agy-card w-full max-w-md p-6 relative space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">¿Eliminar Grupo?</h3>
                <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              ¿Estás seguro de que deseas eliminar permanentemente el grupo{" "}
              <strong className="text-slate-900 dark:text-white">{deleteTarget.name}</strong>?
            </p>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs"
              >
                {isDeleting ? "Eliminando..." : "Sí, Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Grupo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="agy-card w-full max-w-lg p-5 sm:p-6 relative space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Crear Nuevo Grupo
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Nombre del Grupo *
                </label>
                <input
                  required
                  placeholder="Ej: Selección C / Formativo Fin de Semana"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={inputFieldClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Categoría
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className={inputFieldClass}
                  >
                    <option value="Iniciación">Iniciación</option>
                    <option value="Infantil">Infantil</option>
                    <option value="Pre-Juvenil">Pre-Juvenil</option>
                    <option value="Juvenil">Juvenil</option>
                    <option value="Mayores">Mayores</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Capacidad / Alumnos
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="15"
                    value={formData.athletes}
                    onChange={(e) => setFormData({ ...formData, athletes: e.target.value })}
                    className={inputFieldClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Entrenador Encargado
                  </label>
                  <input
                    placeholder="Ej: Juan Pérez"
                    value={formData.coach}
                    onChange={(e) => setFormData({ ...formData, coach: e.target.value })}
                    className={inputFieldClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Sede
                  </label>
                  <select
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className={inputFieldClass}
                  >
                    <option value="Sede Norte">Sede Norte</option>
                    <option value="Sede Sur">Sede Sur</option>
                    <option value="Sede Central">Sede Central</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Horario de Entrenamiento
                </label>
                <input
                  placeholder="Ej: Lun-Mié-Vie 18:00 - 20:00"
                  value={formData.schedule}
                  onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                  className={inputFieldClass}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
                >
                  {submitting ? "Creando..." : "Crear Grupo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lista de Deportistas del Grupo */}
      {rosterGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="agy-card max-w-lg w-full p-5 sm:p-6 relative">
            <button
              onClick={() => setRosterGroup(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pr-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
                  Deportistas: {rosterGroup.name}
                </h2>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">
                  {rosterGroup.category} • {rosterGroup.location} • {rosterGroup.schedule}
                </p>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto agy-surface-subtle divide-y divide-slate-200/70 dark:divide-zinc-800">
              {currentRosterStudents.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No hay deportistas asignados a este grupo todavía.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/80 dark:bg-zinc-900/90 text-slate-500 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Nombre del Deportista</th>
                      <th className="py-2.5 px-3">Categoría</th>
                      <th className="py-2.5 px-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
                    {currentRosterStudents.map((s, idx) => (
                      <tr
                        key={s.id}
                        className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3 text-slate-400 font-mono tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                          {s.name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-zinc-400">
                          {s.category || rosterGroup.category}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Badge
                            variant={s.status === "Inactivo" ? "neutral" : "success"}
                            className="text-[10px]"
                          >
                            {s.status || "Activo"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                <UserCheck className="w-4 h-4" />
                Total: {currentRosterStudents.length} deportistas
              </span>
              <div className="flex items-center gap-2">
                <Link to={`/attendance?group=${encodeURIComponent(rosterGroup.name)}`}>
                  <Button size="sm" className="text-xs h-8 gap-1.5 rounded-lg">
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>Tomar Asistencia</span>
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRosterGroup(null)}
                  className="text-xs h-8 rounded-lg"
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
