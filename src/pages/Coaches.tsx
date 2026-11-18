import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CoachHoursReport from "@/components/CoachHoursReport";
import {
  Plus,
  Mail,
  Phone,
  Trash2,
  RefreshCw,
  X,
  Database,
  UserCheck2,
  AlertTriangle,
  Check,
  Layers,
  Lock,
  KeyRound,
  FileSpreadsheet,
  CheckCircle2,
  Download,
  Search,
  Filter,
  Users,
  Award,
  UserCog,
  Briefcase,
  Edit3,
  ExternalLink,
  Table as TableIcon,
  LayoutGrid,
  Clock
} from "lucide-react";
import { initialCoaches, seedInitialDataIfEmpty } from "@/lib/seedData";
import { createCoachAuthUser } from "@/lib/firebase";

export interface Coach {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  groups: string[];
  createdAt?: any;
}

export interface AthleteSimple {
  id: string;
  name?: string;
  group?: string;
  status?: string;
}

export default function Coaches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection: "directory" | "hours" =
    searchParams.get("tab") === "hours" ? "hours" : "directory";

  const setActiveSection = (section: "directory" | "hours") => {
    if (section === "hours") {
      setSearchParams({ tab: "hours" });
    } else {
      setSearchParams({});
    }
  };

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [athletes, setAthletes] = useState<AthleteSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null);

  // Selector de vista: "report" (Tabla Ejecutiva) o "cards" (Fichas Visuales)
  const [viewMode, setViewMode] = useState<"report" | "cards">("report");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("todos");

  // Lista de grupos disponibles
  const [availableGroups, setAvailableGroups] = useState<string[]>([
    "Selección A",
    "Selección B",
    "Formativo Mañana",
    "Formativo Tarde",
    "Iniciación",
    "Juvenil Especial"
  ]);

  // Grupos seleccionados en el formulario
  const [selectedGroups, setSelectedGroups] = useState<string[]>(["Selección A"]);
  const [customGroupInput, setCustomGroupInput] = useState("");

  // Estado para Diálogo de Eliminación
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    role: "Entrenador Principal",
    email: "",
    phone: ""
  });

  // 1. Escuchar lista de entrenadores/asistentes en tiempo real
  useEffect(() => {
    const getLocalCoaches = (): Coach[] => {
      try {
        return JSON.parse(localStorage.getItem("soul_local_coaches") || "[]");
      } catch {
        return [];
      }
    };

    const unsubscribe = onSnapshot(
      collection(db, "coaches"),
      (snapshot) => {
        const list: Coach[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Coach);
        });

        // Combinar con coaches guardados localmente para asegurar persistencia
        const localList = getLocalCoaches();
        const existingIds = new Set(list.map((c) => c.id));
        const existingNames = new Set(list.map((c) => (c.name || "").toLowerCase().trim()));

        localList.forEach((lc) => {
          if (!existingIds.has(lc.id) && !existingNames.has((lc.name || "").toLowerCase().trim())) {
            list.push(lc);
          }
        });

        // Si la base de datos está vacía, incluir los entrenadores de ejemplo iniciales
        if (list.length === 0) {
          initialCoaches.forEach((ic, idx) => {
            list.push({ id: `initial-${idx}`, ...ic } as Coach);
          });
        }

        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setCoaches(list);
        setLoading(false);
      },
      (error) => {
        console.warn("Firestore listener de coaches con restricción o sin conexión, usando copia local:", error);
        const localList = getLocalCoaches();
        const fallback = [...initialCoaches.map((ic, idx) => ({ id: `init-${idx}`, ...ic })), ...localList];
        const unique = Array.from(new Map(fallback.map((c) => [c.name.toLowerCase(), c])).values());
        unique.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setCoaches(unique as Coach[]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Escuchar deportistas para calcular cuántos alumnos están bajo la tutela de cada profe/asistente
  useEffect(() => {
    const unsubAthletes = onSnapshot(collection(db, "athletes"), (snapshot) => {
      const list: AthleteSimple[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name || data.nombres,
          group: data.group || "General",
          status: data.status || "Activo"
        });
      });
      setAthletes(list);
    });

    return () => unsubAthletes();
  }, []);

  // 3. Escuchar grupos de Firestore
  useEffect(() => {
    const unsubGroups = onSnapshot(collection(db, "groups"), (snapshot) => {
      if (!snapshot.empty) {
        const names: string[] = [];
        snapshot.forEach((d) => {
          const gName = d.data().name;
          if (gName) names.push(gName);
        });
        const combined = Array.from(
          new Set([...names, "Selección A", "Selección B", "Formativo Mañana", "Formativo Tarde"])
        );
        setAvailableGroups(combined);
      }
    });

    return () => unsubGroups();
  }, []);

  // Estadísticas del cuerpo técnico
  const stats = useMemo(() => {
    let profesores = 0;
    let asistentes = 0;
    let preparadores = 0;
    const allAssignedGroups = new Set<string>();

    coaches.forEach((c) => {
      const r = (c.role || "").toLowerCase();
      if (r.includes("asistente") || r.includes("monitor")) {
        asistentes++;
      } else if (r.includes("físico") || r.includes("fisico") || r.includes("fisioterapeuta")) {
        preparadores++;
      } else {
        profesores++;
      }

      (c.groups || []).forEach((g) => allAssignedGroups.add(g));
    });

    return {
      total: coaches.length,
      profesores,
      asistentes,
      preparadores,
      gruposCubiertos: allAssignedGroups.size
    };
  }, [coaches]);

  // Cruzar la cantidad de alumnos por profesor o asistente
  const getCoachAthletesCount = (coachGroups?: string[]) => {
    if (!coachGroups || coachGroups.length === 0) return 0;
    return athletes.filter((a) => a.group && coachGroups.includes(a.group)).length;
  };

  // Filtrado de la lista
  const filteredCoaches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return coaches.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.role && c.role.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.groups && c.groups.some((g) => g.toLowerCase().includes(q)));

      if (!matchesSearch) return false;

      if (selectedRoleFilter === "todos") return true;
      const r = (c.role || "").toLowerCase();
      if (selectedRoleFilter === "profes") {
        return r.includes("principal") || r.includes("titular") || (!r.includes("asistente") && !r.includes("monitor") && !r.includes("físico") && !r.includes("fisico"));
      }
      if (selectedRoleFilter === "asistentes") {
        return r.includes("asistente") || r.includes("monitor");
      }
      if (selectedRoleFilter === "preparadores") {
        return r.includes("físico") || r.includes("fisico") || r.includes("fisioterapeuta");
      }

      return true;
    });
  }, [coaches, searchQuery, selectedRoleFilter]);

  // Alternar selección de un grupo
  const toggleGroup = (groupName: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupName) ? prev.filter((g) => g !== groupName) : [...prev, groupName]
    );
  };

  // Agregar nuevo grupo personalizado
  const handleAddCustomGroup = () => {
    const trimmed = customGroupInput.trim();
    if (!trimmed) return;
    if (!availableGroups.includes(trimmed)) {
      setAvailableGroups((prev) => [...prev, trimmed]);
    }
    if (!selectedGroups.includes(trimmed)) {
      setSelectedGroups((prev) => [...prev, trimmed]);
    }
    setCustomGroupInput("");
  };

  // Abrir modal de creación
  const handleOpenCreateModal = () => {
    setEditingCoachId(null);
    setFormData({
      name: "",
      role: "Entrenador Principal",
      email: "",
      phone: ""
    });
    setSelectedGroups(["Selección A"]);
    setIsModalOpen(true);
  };

  // Abrir modal de edición
  const handleOpenEditModal = (coach: Coach) => {
    setEditingCoachId(coach.id);
    setFormData({
      name: coach.name || "",
      role: coach.role || "Entrenador Principal",
      email: coach.email || "",
      phone: coach.phone || ""
    });
    setSelectedGroups(coach.groups && coach.groups.length > 0 ? coach.groups : ["Selección A"]);
    setIsModalOpen(true);
  };

  // Guardar (Crear o Actualizar)
  const handleSaveCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    const dataToSave = {
      name: formData.name.trim(),
      role: formData.role.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      groups: selectedGroups.length > 0 ? selectedGroups : ["General"]
    };

    let savedId = editingCoachId || "";

    // Si es un nuevo entrenador con correo, crear su acceso Auth provisional de forma independiente
    if (!editingCoachId && formData.email.trim()) {
      const cleanCoachEmail = formData.email.trim().toLowerCase();
      try {
        localStorage.removeItem(`soul_password_changed_${cleanCoachEmail}`);
        const localUsers = JSON.parse(localStorage.getItem("soul_local_users") || "[]");
        const filteredUsers = Array.isArray(localUsers)
          ? localUsers.filter((u: any) => (u.email || "").trim().toLowerCase() !== cleanCoachEmail)
          : [];
        filteredUsers.push({
          email: cleanCoachEmail,
          displayName: formData.name.trim(),
          role: "coach",
          mustChangePassword: true
        });
        localStorage.setItem("soul_local_users", JSON.stringify(filteredUsers));
      } catch {}

      try {
        const coachUid = await createCoachAuthUser(cleanCoachEmail, "Soul2026*");
        try {
          await setDoc(
            doc(db, "users", coachUid),
            {
              uid: coachUid,
              email: cleanCoachEmail,
              displayName: formData.name.trim(),
              role: "coach",
              mustChangePassword: true,
              createdAt: serverTimestamp()
            },
            { merge: true }
          );
        } catch {}
      } catch (authErr: any) {
        console.warn("Aviso Auth (no bloqueante):", authErr?.message);
      }
    }

    try {
      if (editingCoachId) {
        // Actualizar existente en Firestore
        await updateDoc(doc(db, "coaches", editingCoachId), {
          ...dataToSave,
          updatedAt: serverTimestamp()
        });
      } else {
        // Crear nuevo en Firestore
        const coachRef = await addDoc(collection(db, "coaches"), {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
        savedId = coachRef.id;
      }
    } catch (err: any) {
      console.warn("Firestore restringido o sin conexión. Guardando localmente de forma segura:", err);
      if (!savedId) {
        savedId = `coach-local-${Date.now()}`;
      }
    }

    // Persistencia local inmediata para garantizar que NUNCA se pierdan datos
    const finalCoach: Coach = {
      id: savedId || `coach-local-${Date.now()}`,
      ...dataToSave
    };

    try {
      const stored: Coach[] = JSON.parse(localStorage.getItem("soul_local_coaches") || "[]");
      const filtered = stored.filter((c) => c.id !== finalCoach.id && c.name.toLowerCase() !== finalCoach.name.toLowerCase());
      filtered.push(finalCoach);
      localStorage.setItem("soul_local_coaches", JSON.stringify(filtered));
    } catch (e) {
      console.warn("Error en localStorage:", e);
    }

    setCoaches((prev) => {
      const filtered = prev.filter((c) => c.id !== finalCoach.id && c.name.toLowerCase() !== finalCoach.name.toLowerCase());
      const updated = [...filtered, finalCoach];
      updated.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return updated;
    });

    setIsModalOpen(false);
    setEditingCoachId(null);
    setSubmitting(false);
  };

  // Reiniciar clave provisional
  const handleResetCoachPassword = async (coach: Coach) => {
    if (!coach.email) {
      alert("Este miembro no tiene un correo registrado.");
      return;
    }
    if (
      !confirm(
        `¿Restablecer el acceso de ${coach.name} a la contraseña provisional "Soul2026*" y exigir cambio obligatorio en su próximo ingreso?`
      )
    )
      return;

    const cleanCoachEmail = coach.email.trim().toLowerCase();
    try {
      localStorage.removeItem(`soul_password_changed_${cleanCoachEmail}`);
      const customPasswords = JSON.parse(localStorage.getItem("soul_user_passwords") || "{}");
      delete customPasswords[cleanCoachEmail];
      localStorage.setItem("soul_user_passwords", JSON.stringify(customPasswords));

      const localUsers = JSON.parse(localStorage.getItem("soul_local_users") || "[]");
      const filteredUsers = Array.isArray(localUsers)
        ? localUsers.filter((u: any) => (u.email || "").trim().toLowerCase() !== cleanCoachEmail)
        : [];
      filteredUsers.push({
        email: cleanCoachEmail,
        displayName: coach.name,
        role: "coach",
        mustChangePassword: true
      });
      localStorage.setItem("soul_local_users", JSON.stringify(filteredUsers));
    } catch {}

    try {
      const q = query(collection(db, "users"), where("email", "==", cleanCoachEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await Promise.all(
          snap.docs.map((d) =>
            setDoc(
              doc(db, "users", d.id),
              {
                mustChangePassword: true,
                updatedAt: serverTimestamp()
              },
              { merge: true }
            )
          )
        );
        alert(`Se configuró cambio obligatorio de contraseña para ${coach.name}.`);
      } else {
        await setDoc(
          doc(db, "users", cleanCoachEmail.replace(/[^a-zA-Z0-9]/g, "_")),
          {
            email: cleanCoachEmail,
            displayName: coach.name,
            role: "coach",
            mustChangePassword: true,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
        alert(
          `Se configuró cambio obligatorio de contraseña para ${coach.name} en su próximo ingreso.`
        );
      }
    } catch (err: any) {
      console.error(err);
      alert("Se exigirá cambio de contraseña en el próximo ingreso local de este usuario.");
    }
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, "coaches", deleteTarget.id));
    } catch (err) {
      console.warn("Aviso al eliminar en Firestore:", err);
    } finally {
      try {
        const stored: Coach[] = JSON.parse(localStorage.getItem("soul_local_coaches") || "[]");
        const filtered = stored.filter((c) => c.id !== deleteTarget.id);
        localStorage.setItem("soul_local_coaches", JSON.stringify(filtered));
      } catch {}

      setCoaches((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      setIsDeleting(false);
    }
  };

  // Exportar reporte de profesores y asistentes a CSV
  const handleExportCSV = () => {
    if (coaches.length === 0) return;

    const headers = [
      "Nombre",
      "Cargo / Rol",
      "Tipo",
      "Teléfono",
      "Correo Electrónico",
      "Grupos Asignados",
      "Total Alumnos a Cargo"
    ];

    const rows = coaches.map((c) => {
      const r = (c.role || "").toLowerCase();
      const tipo = r.includes("asistente") || r.includes("monitor")
        ? "Asistente Técnico"
        : r.includes("físico") || r.includes("fisico")
        ? "Preparador Físico"
        : "Profesor Titular";
      const alumnosCount = getCoachAthletesCount(c.groups);
      const gruposStr = (c.groups || []).join(" - ");

      return [
        `"${c.name || ""}"`,
        `"${c.role || ""}"`,
        `"${tipo}"`,
        `"${c.phone || ""}"`,
        `"${c.email || ""}"`,
        `"${gruposStr}"`,
        alumnosCount
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `reporte_profes_y_asistentes_soul_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSeed = async () => {
    setLoading(true);
    await seedInitialDataIfEmpty(true);
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
              <UserCog className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              <span>Reporte de Profesores & Asistentes</span>
            </h1>
            <Badge variant="default" className="text-xs tabular-nums">
              {coaches.length} miembros
            </Badge>
          </div>
          <p className="text-slate-500 dark:text-zinc-400 text-xs sm:text-sm mt-1 max-w-2xl">
            Control consolidado del cuerpo técnico del Club SOUL: profesores titulares, asistentes de campo y preparadores físicos con asignación de grupos y conteo de alumnos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {coaches.length === 0 && !loading && activeSection === "directory" && (
            <Button
              variant="outline"
              onClick={handleSeed}
              className="text-xs"
            >
              <Database className="w-4 h-4 mr-1.5 text-indigo-600 dark:text-indigo-400" />
              Cargar Demo
            </Button>
          )}

          {activeSection === "directory" && (
            <Button
              type="button"
              variant="outline"
              onClick={handleExportCSV}
              disabled={coaches.length === 0}
              className="text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </Button>
          )}

          <Button
            type="button"
            onClick={handleOpenCreateModal}
            className="text-xs gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Añadir Profe / Asistente</span>
          </Button>
        </div>
      </div>

      {/* Selector de Sección: Directorio vs Reporte Contable de Horas & Clases */}
      <div className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:inline-flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSection("directory")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeSection === "directory"
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Directorio & Grupos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("hours")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeSection === "hours"
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Horas & Clases (Contabilidad)</span>
          </button>
        </div>
      </div>

      {activeSection === "hours" ? (
        <CoachHoursReport coaches={coaches} />
      ) : (
        <>
      {/* Tarjetas KPI de Resumen del Reporte */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Total Cuerpo Técnico
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{stats.total}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Profesionales registrados</p>
        </div>

        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Profesores Titulares
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{stats.profesores}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Entrenadores principales</p>
        </div>

        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Asistentes & Monitores
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{stats.asistentes}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Apoyo técnico en cancha</p>
        </div>

        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Grupos Cubiertos
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {stats.gruposCubiertos}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">{athletes.length} deportistas activos</p>
        </div>
      </div>

      {/* Barra de Filtros, Búsqueda y Alternador de Vistas */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 agy-card p-3.5">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Buscador */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-3 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, correo, teléfono o grupo..."
              className="pl-9 text-xs"
            />
          </div>

          {/* Filtro por Cargo */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-2.5 h-10">
            <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="bg-transparent text-slate-900 dark:text-zinc-100 text-xs outline-none cursor-pointer pr-1"
            >
              <option value="todos" className="bg-white dark:bg-zinc-900">Todos los Cargos</option>
              <option value="profes" className="bg-white dark:bg-zinc-900">Solo Profesores Titulares</option>
              <option value="asistentes" className="bg-white dark:bg-zinc-900">Solo Asistentes & Monitores</option>
              <option value="preparadores" className="bg-white dark:bg-zinc-900">Solo Preparadores Físicos</option>
            </select>
          </div>
        </div>

        {/* Switch de Vistas: Reporte (Tabla) vs Cuadrícula (Fichas) */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-800 rounded-lg p-1 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("report")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              viewMode === "report"
                ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
            title="Vista de Reporte Tabular"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Reporte Tabular</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              viewMode === "cards"
                ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
            title="Vista de Fichas"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Fichas</span>
          </button>
        </div>
      </div>

      {/* Contenido Principal */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 dark:text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600 dark:text-indigo-400" />
          Cargando reporte de cuerpo técnico en tiempo real...
        </div>
      ) : filteredCoaches.length === 0 ? (
        <div className="agy-card p-12 text-center text-slate-500 dark:text-zinc-400">
          <UserCheck2 className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-zinc-600" />
          No se encontraron profesores ni asistentes con los filtros aplicados.
        </div>
      ) : viewMode === "report" ? (
        /* VISTA 1: REPORTE TABULAR EJECUTIVO */
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    Profesor / Asistente
                  </TableHead>
                  <TableHead>
                    Cargo / Rol
                  </TableHead>
                  <TableHead>
                    Grupos Asignados
                  </TableHead>
                  <TableHead className="text-center">
                    Alumnos
                  </TableHead>
                  <TableHead>
                    Contacto Directo
                  </TableHead>
                  <TableHead className="text-right pr-6">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredCoaches.map((coach) => {
                  const r = (coach.role || "").toLowerCase();
                  const isAssistant = r.includes("asistente") || r.includes("monitor");
                  const isPhysicalTrainer = r.includes("físico") || r.includes("fisico");
                  const studentsCount = getCoachAthletesCount(coach.groups);

                  return (
                    <TableRow key={coach.id}>
                      {/* Nombre y Avatar */}
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-slate-200 dark:border-zinc-700">
                            <AvatarFallback className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold text-xs">
                              {coach.name
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm text-slate-900 dark:text-zinc-100">{coach.name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400">{coach.email || "Sin correo"}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Cargo / Rol */}
                      <TableCell>
                        <Badge
                          variant={isAssistant ? "warning" : isPhysicalTrainer ? "success" : "default"}
                        >
                          {coach.role || "Entrenador Principal"}
                        </Badge>
                      </TableCell>

                      {/* Grupos */}
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(coach.groups || []).map((g) => (
                            <Badge
                              key={g}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {g}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>

                      {/* Alumnos a cargo */}
                      <TableCell className="text-center">
                        <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-zinc-100 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-2.5 py-1 rounded-md">
                          {studentsCount}
                        </span>
                      </TableCell>

                      {/* Contacto Directo */}
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          {coach.phone ? (
                            <a
                              href={`https://wa.me/57${coach.phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center text-emerald-600 dark:text-emerald-400 hover:underline gap-1.5 font-medium tabular-nums"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-xs">{coach.phone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 dark:text-zinc-500 text-[11px]">Sin teléfono</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEditModal(coach)}
                            className="h-8 w-8 p-0 text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                            title="Editar datos del profesor/asistente"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>

                          {coach.email && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleResetCoachPassword(coach)}
                              className="h-8 w-8 p-0 text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                              title="Restablecer clave provisional (Soul2026*)"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                          )}

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget({ id: coach.id, name: coach.name })}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                            title="Eliminar del cuerpo técnico"
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
        </div>
      ) : (
        /* VISTA 2: CUADRÍCULA DE FICHAS */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredCoaches.map((coach) => {
            const r = (coach.role || "").toLowerCase();
            const isAssistant = r.includes("asistente") || r.includes("monitor");
            const isPhysicalTrainer = r.includes("físico") || r.includes("fisico");
            const studentsCount = getCoachAthletesCount(coach.groups);

            return (
              <div
                key={coach.id}
                className="agy-card agy-card-interactive p-5 flex flex-col justify-between relative group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 border border-slate-200 dark:border-zinc-700">
                        <AvatarFallback className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
                          {coach.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-base text-slate-900 dark:text-zinc-100">{coach.name}</h3>
                        <Badge
                          variant={isAssistant ? "warning" : isPhysicalTrainer ? "success" : "default"}
                          className="mt-1 text-[10px]"
                        >
                          {coach.role}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(coach)}
                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: coach.id, name: coach.name })}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-zinc-300 mb-4 agy-surface-subtle p-3">
                    {coach.email && (
                      <div className="flex items-center text-slate-500 dark:text-zinc-400">
                        <Mail className="w-3.5 h-3.5 mr-2 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="truncate">{coach.email}</span>
                      </div>
                    )}
                    {coach.phone && (
                      <a
                        href={`https://wa.me/57${coach.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-emerald-600 dark:text-emerald-400 hover:underline tabular-nums"
                      >
                        <Phone className="w-3.5 h-3.5 mr-2 shrink-0" />
                        <span>{coach.phone}</span>
                      </a>
                    )}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 dark:border-zinc-800 text-[11px] tabular-nums">
                      <span className="text-slate-500 dark:text-zinc-400">Alumnos a cargo:</span>
                      <strong className="text-slate-900 dark:text-zinc-100 font-semibold">{studentsCount} deportistas</strong>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="pt-2 border-t border-slate-200/80 dark:border-zinc-800">
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold mb-1.5 flex items-center gap-1 tabular-nums">
                      <Layers className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      Grupos ({(coach.groups || []).length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(coach.groups || []).map((g) => (
                        <Badge
                          key={g}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {g}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {coach.email && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-zinc-400">Clave provisional:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetCoachPassword(coach)}
                        className="h-6 text-[10px] px-2 text-indigo-600 dark:text-indigo-400"
                      >
                        Reiniciar Clave
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Modal Añadir / Editar Entrenador o Asistente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <UserCog className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>{editingCoachId ? "Editar Profe / Asistente" : "Añadir Profe / Asistente"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCoach} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Nombre Completo *</label>
                <Input
                  required
                  placeholder="Ej: David Morales"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Cargo / Rol *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="Entrenador Principal">Entrenador Principal (Profe Titular)</option>
                    <option value="Asistente Técnico">Asistente Técnico (Campo)</option>
                    <option value="Monitor Deportivo">Monitor Deportivo</option>
                    <option value="Preparador Físico">Preparador Físico</option>
                    <option value="Fisioterapeuta">Fisioterapeuta</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Teléfono / WhatsApp</label>
                  <Input
                    placeholder="+57 300 000 0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Correo Electrónico</label>
                <Input
                  type="email"
                  placeholder="profesor@soul.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              {/* Selector de Grupos */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5 tabular-nums">
                    <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Grupos Asignados ({selectedGroups.length} seleccionados)
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500">Haz clic para agregar o quitar</span>
                </div>

                <div className="flex flex-wrap gap-2 p-3 agy-surface-subtle max-h-40 overflow-y-auto">
                  {availableGroups.map((groupName) => {
                    const isSelected = selectedGroups.includes(groupName);
                    return (
                      <button
                        key={groupName}
                        type="button"
                        onClick={() => toggleGroup(groupName)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          isSelected
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20"
                            : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-zinc-100"
                        }`}
                      >
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                        )}
                        <span>{groupName}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder="¿Falta algún grupo? Escribe el nombre aquí..."
                    value={customGroupInput}
                    onChange={(e) => setCustomGroupInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomGroup();
                      }
                    }}
                    className="text-xs h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddCustomGroup}
                    className="text-xs h-9 px-3 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Agregar
                  </Button>
                </div>
              </div>

              {!editingCoachId && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/20 rounded-lg flex items-start gap-2.5 text-xs text-slate-700 dark:text-zinc-300">
                  <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-slate-900 dark:text-zinc-100">Clave Provisional de Acceso</span>
                    Si ingresas correo, se creará el usuario con clave provisional{" "}
                    <code className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                      Soul2026*
                    </code>
                    .
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="text-xs"
                >
                  {submitting
                    ? "Guardando..."
                    : editingCoachId
                    ? "Actualizar Datos"
                    : "Guardar en Cuerpo Técnico"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-xl relative space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-lg border border-rose-200 dark:border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">¿Eliminar del Cuerpo Técnico?</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-zinc-300">
              ¿Estás seguro de que deseas eliminar permanentemente a{" "}
              <strong className="text-slate-900 dark:text-zinc-100">{deleteTarget.name}</strong> de Firestore?
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="text-xs"
              >
                {isDeleting ? "Eliminando..." : "Sí, Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
