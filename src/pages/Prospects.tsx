import { useState, useEffect } from "react";
import { db, saveAthleteToDatabase, mergeAthletesData } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  serverTimestamp,
  Timestamp 
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  UserCheck, 
  Archive, 
  MessageCircle, 
  Sparkles, 
  Calendar, 
  Mail, 
  Phone,
  RefreshCw, 
  Users,
  CheckCircle2,
  ExternalLink,
  UserPlus,
  Eye,
  HeartPulse,
  FileText,
  X
} from "lucide-react";
import { Link } from "react-router-dom";
import { normalizePlanName } from "@/lib/plans";

export interface SolicitudArchivos {
  certificadoEpsNombre?: string | null;
  certificadoEpsDataUrl?: string | null;
  documentoIdentidadFrenteNombre?: string | null;
  documentoIdentidadFrenteDataUrl?: string | null;
  documentoIdentidadReversoNombre?: string | null;
  documentoIdentidadReversoDataUrl?: string | null;
  documentoIdentidadNombre?: string | null;
  documentoIdentidadDataUrl?: string | null;
  fotoTipoDocumentoNombre?: string | null;
  fotoTipoDocumentoDataUrl?: string | null;
  cartaLibertadNombre?: string | null;
  cartaLibertadDataUrl?: string | null;
}

export interface Solicitud {
  id: string;
  nombre: string;
  telefono: string;
  correo?: string;
  edad?: number;
  altura_cm?: number;
  peso_kg?: number;
  datos_biometricos?: {
    edad?: number;
    alturaCm?: number;
    pesoKg?: number;
    imc?: number | null;
  };
  fecha_nacimiento?: string;
  tipo_documento?: string;
  documento?: string;
  genero?: string;
  localidad?: string;
  barrio?: string;
  direccion?: string;
  acudientes?: string;
  eps?: string;
  alergias?: string;
  talla?: string;
  experiencia?: string;
  pertenecio_otro_club?: string;
  archivos?: SolicitudArchivos;
  objetivo: string;
  plan?: string;
  nivel?: string;
  sede?: string;
  notas?: string;
  estado: "Nueva Solicitud" | "Inscrito" | "Archivado" | string;
  athleteId?: string;
  fecha_creacion?: Timestamp | any;
  origen?: string;
}

export default function Prospects() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [existingAthleteIds, setExistingAthleteIds] = useState<Set<string>>(new Set());
  const [existingAthleteNames, setExistingAthleteNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterState, setFilterState] = useState<string>("todos");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedSolicitudForReview, setSelectedSolicitudForReview] = useState<Solicitud | null>(null);

  // 1. Escuchar Deportistas existentes (Firestore + LocalStorage) para saber quiénes ya fueron migrados
  useEffect(() => {
    const syncAthletesIndex = (fsAthletes: any[] = []) => {
      const merged = mergeAthletesData(fsAthletes);
      const ids = new Set<string>();
      const names = new Set<string>();
      merged.forEach((data: any) => {
        if (data.solicitudId) ids.add(data.solicitudId);
        if (data.name) names.add(String(data.name).trim().toLowerCase());
      });
      setExistingAthleteIds(ids);
      setExistingAthleteNames(names);
    };

    syncAthletesIndex([]);

    const unsubAthletes = onSnapshot(
      collection(db, "athletes"),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncAthletesIndex(list);
      },
      () => syncAthletesIndex([])
    );

    const handleLocalAth = () => syncAthletesIndex([]);
    window.addEventListener("soul-athletes-updated", handleLocalAth);

    return () => {
      unsubAthletes();
      window.removeEventListener("soul-athletes-updated", handleLocalAth);
    };
  }, []);

  // 2. Suscripción a Solicitudes en tiempo real (Firestore + API local + LocalStorage)
  useEffect(() => {
    let unsubscribe: () => void;
    let fsList: Solicitud[] = [];
    let apiList: Solicitud[] = [];

    const mergeAndSetSolicitudes = () => {
      let localList: Solicitud[] = [];
      try {
        localList = JSON.parse(localStorage.getItem("soul_local_solicitudes") || "[]");
      } catch {}

      const byKey = new Map<string, Solicitud>();
      [...localList, ...apiList, ...fsList].forEach((s) => {
        if (!s || !s.nombre) return;
        const key = s.id || `${s.documento || ""}_${s.nombre.trim().toLowerCase()}`;
        const prev = byKey.get(key);
        byKey.set(key, prev ? { ...prev, ...s } : s);
      });

      const merged = Array.from(byKey.values()).sort((a, b) => {
        const tA = a.fecha_creacion?.toMillis
          ? a.fecha_creacion.toMillis()
          : (a as any).fecha_creacion_iso
          ? new Date((a as any).fecha_creacion_iso).getTime()
          : 0;
        const tB = b.fecha_creacion?.toMillis
          ? b.fecha_creacion.toMillis()
          : (b as any).fecha_creacion_iso
          ? new Date((b as any).fecha_creacion_iso).getTime()
          : 0;
        return tB - tA;
      });

      setSolicitudes(merged);
      setLoading(false);
    };

    const fetchApiSolicitudes = async () => {
      try {
        const res = await fetch("/api/solicitudes");
        if (!res.ok) return;
        const json = await res.json();
        if (json?.ok && Array.isArray(json.solicitudes)) {
          apiList = json.solicitudes;
          mergeAndSetSolicitudes();
        }
      } catch {}
    };

    mergeAndSetSolicitudes();
    fetchApiSolicitudes();

    try {
      const q = query(collection(db, "solicitudes"), orderBy("fecha_creacion", "desc"));
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: Solicitud[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() } as Solicitud);
          });
          fsList = list;
          mergeAndSetSolicitudes();
        },
        () => {
          unsubscribe = onSnapshot(
            collection(db, "solicitudes"),
            (snapshot) => {
              const list: Solicitud[] = [];
              snapshot.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() } as Solicitud);
              });
              fsList = list;
              mergeAndSetSolicitudes();
            },
            () => mergeAndSetSolicitudes()
          );
        }
      );
    } catch {
      mergeAndSetSolicitudes();
    }

    const handleLocalUpdate = () => {
      mergeAndSetSolicitudes();
      fetchApiSolicitudes();
    };
    window.addEventListener("soul-solicitudes-updated", handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);
    window.addEventListener("focus", fetchApiSolicitudes);
    const pollId = window.setInterval(fetchApiSolicitudes, 5000);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener("soul-solicitudes-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
      window.removeEventListener("focus", fetchApiSolicitudes);
      window.clearInterval(pollId);
    };
  }, []);

  // Determinar categoría por edad
  const determineCategory = (age?: number) => {
    if (!age) return "Juvenil";
    if (age < 12) return "Iniciación";
    if (age < 15) return "Infantil";
    if (age < 18) return "Juvenil";
    return "Mayores";
  };

  // Determinar grupo adecuado
  const determineGroup = (nivel?: string) => {
    const n = (nivel || "").toLowerCase();
    if (n.includes("avanzado") || n.includes("competitivo") || n.includes("selección") || n.includes("seleccion") || n.includes("2.5")) return "Selección A";
    if (n.includes("intermedio") || n.includes("tecnificación") || n.includes("tecnificacion")) return "Formativo Tarde";
    if (n.includes("fundamentación") || n.includes("fundamentacion")) return "Formativo Mañana";
    return "Formativo Mañana";
  };

  // INSCRIBIR Y AGREGAR DIRECTAMENTE A DEPORTISTAS
  const handleAprobarEInscribir = async (solicitud: Solicitud) => {
    try {
      setUpdatingId(solicitud.id);

      // Verificar si ya está en deportistas
      const isAlreadyInAthletes = 
        existingAthleteIds.has(solicitud.id) || 
        existingAthleteNames.has(solicitud.nombre.trim().toLowerCase());

      let newAthleteId = solicitud.athleteId;

      if (!isAlreadyInAthletes) {
        const assignedPlan = normalizePlanName(solicitud.plan);
        const fullDoc = solicitud.documento 
          ? `${solicitud.tipo_documento ? solicitud.tipo_documento + " " : ""}${solicitud.documento}`
          : "";
        const savedAthlete = await saveAthleteToDatabase({
          name: solicitud.nombre.trim(),
          documento: fullDoc,
          tipoDocumento: solicitud.tipo_documento || "TI",
          fechaNacimiento: solicitud.fecha_nacimiento || null,
          genero: solicitud.genero || null,
          age: solicitud.edad || solicitud.datos_biometricos?.edad || 16,
          alturaCm: solicitud.altura_cm ?? solicitud.datos_biometricos?.alturaCm ?? null,
          pesoKg: solicitud.peso_kg ?? solicitud.datos_biometricos?.pesoKg ?? null,
          imc: solicitud.datos_biometricos?.imc ?? null,
          category: determineCategory(solicitud.edad || solicitud.datos_biometricos?.edad),
          group: determineGroup(solicitud.experiencia || solicitud.nivel),
          phone: (solicitud.telefono || "").trim(),
          telefono: (solicitud.telefono || "").trim(),
          email: (solicitud.correo || "").trim(),
          localidad: solicitud.localidad || null,
          barrio: solicitud.barrio || null,
          direccion: solicitud.direccion || null,
          acudientes: solicitud.acudientes || null,
          parentName: solicitud.acudientes || null,
          parentPhone: (solicitud.telefono || "").trim(),
          eps: solicitud.eps || null,
          alergias: solicitud.alergias || "Ninguna",
          talla: solicitud.talla || null,
          experiencia: solicitud.experiencia || null,
          pertenecioOtroClub: solicitud.pertenecio_otro_club || "No",
          archivos: solicitud.archivos || null,
          status: "Activo",
          financialStatus: "Al día",
          estado_pago: "al_dia",
          sede: solicitud.sede || "Sede Norte",
          plan: assignedPlan !== "Sin Asignar" ? assignedPlan : "Plan Básico",
          solicitudId: solicitud.id
        });
        newAthleteId = savedAthlete.id;
      }

      // 2. Actualizar estado de la solicitud (Firestore + API local + LocalStorage)
      try {
        if (!solicitud.id.startsWith("sol-")) {
          const docRef = doc(db, "solicitudes", solicitud.id);
          await updateDoc(docRef, {
            estado: "Inscrito",
            athleteId: newAthleteId || null,
            fecha_actualizacion: serverTimestamp(),
          });
        }
      } catch {}

      try {
        await fetch("/api/solicitudes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: solicitud.id,
            estado: "Inscrito",
            athleteId: newAthleteId || null
          })
        });
      } catch {}

      try {
        const stored: any[] = JSON.parse(localStorage.getItem("soul_local_solicitudes") || "[]");
        const updated = stored.map((s) =>
          s.id === solicitud.id ? { ...s, estado: "Inscrito", athleteId: newAthleteId || null } : s
        );
        localStorage.setItem("soul_local_solicitudes", JSON.stringify(updated));
        window.dispatchEvent(new Event("soul-solicitudes-updated"));
      } catch {}

      setSolicitudes((prev) =>
        prev.map((s) =>
          s.id === solicitud.id ? { ...s, estado: "Inscrito", athleteId: newAthleteId || undefined } : s
        )
      );

      // Mostrar confirmación
      setNotification(`¡"${solicitud.nombre}" ha sido inscrito y añadido automáticamente a Deportistas!`);
      setTimeout(() => setNotification(null), 5000);

    } catch (error) {
      console.error("Error al inscribir deportista:", error);
      alert("No se pudo inscribir. Revisa la consola.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Actualizar estado a 'Archivado'
  const handleArchivar = async (id: string) => {
    try {
      setUpdatingId(id);
      try {
        if (!id.startsWith("sol-")) {
          const docRef = doc(db, "solicitudes", id);
          await updateDoc(docRef, {
            estado: "Archivado",
            fecha_actualizacion: serverTimestamp(),
          });
        }
      } catch {}

      try {
        await fetch("/api/solicitudes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, estado: "Archivado" })
        });
      } catch {}

      try {
        const stored: any[] = JSON.parse(localStorage.getItem("soul_local_solicitudes") || "[]");
        const updated = stored.map((s) => (s.id === id ? { ...s, estado: "Archivado" } : s));
        localStorage.setItem("soul_local_solicitudes", JSON.stringify(updated));
        window.dispatchEvent(new Event("soul-solicitudes-updated"));
      } catch {}

      setSolicitudes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, estado: "Archivado" } : s))
      );
    } catch (error) {
      console.error("Error al archivar solicitud:", error);
      alert("No se pudo archivar la solicitud.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Filtrado
  const filtered = solicitudes.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      (item.nombre?.toLowerCase() || "").includes(q) ||
      (item.correo?.toLowerCase() || "").includes(q) ||
      (item.documento || "").includes(q) ||
      (item.localidad?.toLowerCase() || "").includes(q) ||
      (item.barrio?.toLowerCase() || "").includes(q) ||
      (item.telefono || "").includes(searchTerm);

    if (filterState === "todos") return matchesSearch;
    if (filterState === "nuevas") return matchesSearch && item.estado === "Nueva Solicitud";
    if (filterState === "inscrito") return matchesSearch && item.estado === "Inscrito";
    if (filterState === "archivado") return matchesSearch && item.estado === "Archivado";
    return matchesSearch;
  });

  const totalNuevas = solicitudes.filter((s) => s.estado === "Nueva Solicitud").length;
  const totalInscritos = solicitudes.filter((s) => s.estado === "Inscrito").length;

  const formatDate = (timestamp: any, fallbackIso?: string) => {
    if (timestamp?.toDate) {
      const date = timestamp.toDate();
      return new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }
    const raw = typeof timestamp === "string" ? timestamp : fallbackIso;
    if (raw) {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) {
        return new Intl.DateTimeFormat("es-CO", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(parsed);
      }
    }
    return "Reciente";
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Banner de Notificación de Éxito */}
      {notification && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4 flex items-center justify-between text-sm text-emerald-700 dark:text-emerald-300 animate-in fade-in slide-in-from-top-2 shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium">{notification}</span>
          </div>
          <Link 
            to="/athletes" 
            className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-4"
          >
            Ver en Deportistas <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">Gestión de Solicitudes e Inscripciones</h1>
            {totalNuevas > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 tabular-nums">
                <Sparkles className="w-3.5 h-3.5" />
                {totalNuevas} {totalNuevas === 1 ? "nueva" : "nuevas"}
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-zinc-400 mt-1 text-xs sm:text-sm">
            Aquí puedes validar toda la información del formulario de inscripción (EPS, alergias, acudientes, talla y documentos adjuntos) antes de aprobar al deportista.
          </p>
        </div>

        <Link to="/inscripcion" target="_blank">
          <Button className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg gap-1.5 shadow-sm">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir Formulario de Inscripción</span>
          </Button>
        </Link>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-500 dark:text-zinc-400 text-xs font-medium">Nuevas Solicitudes</h3>
            <div className="p-2.5 bg-slate-100 dark:bg-zinc-800 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{totalNuevas}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Pendientes por aprobar</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-500 dark:text-zinc-400 text-xs font-medium">Inscritos Aprobados</h3>
            <div className="p-2.5 bg-slate-100 dark:bg-zinc-800 rounded-lg text-emerald-600 dark:text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{totalInscritos}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">Sincronizados con Deportistas</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-500 dark:text-zinc-400 text-xs font-medium">Total de Registros</h3>
            <div className="p-2.5 bg-slate-100 dark:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{solicitudes.length}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Captados por el portal web</p>
        </div>
      </div>

      {/* Contenedor Principal: Búsqueda y Filtros */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-zinc-500" />
            <Input 
              placeholder="Buscar por nombre, correo o teléfono..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 rounded-lg border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterState("todos")}
              className={`rounded-lg text-xs font-medium px-3 tabular-nums ${
                filterState === "todos" 
                  ? "bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20" 
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
            >
              Todos ({solicitudes.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterState("nuevas")}
              className={`rounded-lg text-xs font-medium px-3 tabular-nums ${
                filterState === "nuevas" 
                  ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20" 
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
            >
              Nuevas ({totalNuevas})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterState("inscrito")}
              className={`rounded-lg text-xs font-medium px-3 tabular-nums ${
                filterState === "inscrito" 
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" 
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
            >
              Inscritos ({totalInscritos})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterState("archivado")}
              className={`rounded-lg text-xs font-medium px-3 ${
                filterState === "archivado" 
                  ? "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" 
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
            >
              Archivados
            </Button>
          </div>
        </div>

        {/* Tabla Desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-zinc-800/50">
              <TableRow className="border-slate-200 dark:border-zinc-800 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Fecha / Origen</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Deportista</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Contacto</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Objetivo & Nivel</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Sede</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Estado</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Cargando solicitudes en tiempo real desde Firestore...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                    No se encontraron solicitudes con el filtro actual.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => {
                  const isAthleteSynced = 
                    existingAthleteIds.has(item.id) || 
                    existingAthleteNames.has(item.nombre.trim().toLowerCase());

                  return (
                    <TableRow key={item.id} className="border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                      
                      {/* Fecha */}
                      <TableCell className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap tabular-nums">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                          {formatDate(item.fecha_creacion, (item as any).fecha_creacion_iso)}
                        </div>
                      </TableCell>

                      {/* Deportista */}
                      <TableCell>
                        <p className="font-semibold text-slate-900 dark:text-zinc-100 leading-tight">{item.nombre}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">
                          {item.documento && (
                            <span className="font-mono text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
                              {item.tipo_documento ? `${item.tipo_documento} ` : ""}{item.documento}
                            </span>
                          )}
                          <span>{item.edad ? `${item.edad} años` : "Edad s/d"}</span>
                          {(item.altura_cm || item.datos_biometricos?.alturaCm) && (
                            <span>• {item.altura_cm || item.datos_biometricos?.alturaCm} cm</span>
                          )}
                          {(item.peso_kg || item.datos_biometricos?.pesoKg) && (
                            <span>• {item.peso_kg || item.datos_biometricos?.pesoKg} kg</span>
                          )}
                          {item.genero && <span className="text-slate-400 dark:text-zinc-500">• {item.genero}</span>}
                          {item.archivos?.certificadoEpsNombre && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                              EPS ✓
                            </span>
                          )}
                        </div>
                        {(item.localidad || item.barrio) && (
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 truncate max-w-xs" title={`${item.localidad || ""} - ${item.barrio || ""} (${item.direccion || ""})`}>
                            📍 {item.localidad ? `${item.localidad}` : ""}{item.barrio ? `, ${item.barrio}` : ""}{item.direccion ? ` • ${item.direccion}` : ""}
                          </p>
                        )}
                        {item.notas && (
                          <p className="text-xs text-slate-500 dark:text-zinc-500 italic mt-1 max-w-xs truncate" title={item.notas}>
                            "{item.notas}"
                          </p>
                        )}
                      </TableCell>

                      {/* Contacto */}
                      <TableCell>
                        <div className="space-y-1">
                          <a 
                            href={`https://wa.me/57${item.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`¡Hola ${item.nombre}! Te escribimos del Club de Voleibol SOUL respecto a tu solicitud.`)}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline transition-colors font-medium tabular-nums"
                            title="Contactar por WhatsApp"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {item.telefono}
                            <MessageCircle className="w-3 h-3 ml-0.5" />
                          </a>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                            <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                            <span className="truncate max-w-[150px]">{item.correo}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Objetivo & Experiencia */}
                      <TableCell>
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md border ${
                          item.objetivo?.includes("Cortesía") || item.objetivo?.includes("Cortesia")
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20"
                            : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                        }`}>
                          {item.objetivo}
                        </span>
                        {(item.experiencia || item.nivel) && (
                          <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium mt-1 max-w-[200px]" title={item.experiencia || item.nivel}>
                            {item.experiencia || item.nivel}
                          </p>
                        )}
                        {item.plan && item.plan !== "Clase de Cortesía (Gratis)" && (
                          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate max-w-[200px]" title={item.plan}>
                            {item.plan}
                          </p>
                        )}
                      </TableCell>

                      {/* Sede */}
                      <TableCell className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                        {item.sede || "Sede Norte"}
                      </TableCell>

                      {/* Estado */}
                      <TableCell>
                        <div className="space-y-1">
                          <Badge 
                            variant="outline" 
                            className={`text-xs px-2.5 py-0.5 font-semibold ${
                              item.estado === "Inscrito"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                : item.estado === "Archivado"
                                ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                            }`}
                          >
                            {item.estado}
                          </Badge>
                          {isAthleteSynced && (
                            <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>En Deportistas</span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedSolicitudForReview(item)}
                            className="h-8 px-2.5 text-xs font-medium border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                            title="Ver y validar todos los datos de inscripción (EPS, acudientes, talla, archivos)"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
                            Validar Ficha
                          </Button>
                          
                          {/* Botón Inscribir / Agregar a Deportistas */}
                          {isAthleteSynced ? (
                            <Link to="/athletes">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs font-medium border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                title="Ver ficha en el catálogo de Deportistas"
                              >
                                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                Ver Deportista
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              disabled={updatingId === item.id}
                              onClick={() => handleAprobarEInscribir(item)}
                              className="h-8 px-2.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white shadow-sm transition-all"
                              title="Inscribir y añadir automáticamente al catálogo de Deportistas"
                            >
                              <UserPlus className="w-3.5 h-3.5 mr-1" />
                              {item.estado === "Inscrito" ? "Agregar a Deportistas" : "Inscribir"}
                            </Button>
                          )}

                          {/* Botón Archivar */}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === item.id || item.estado === "Archivado"}
                            onClick={() => handleArchivar(item.id)}
                            className={`h-8 px-2 text-xs font-medium border-slate-200 dark:border-zinc-700 transition-all ${
                              item.estado === "Archivado"
                                ? "opacity-30 text-slate-400 dark:text-zinc-600 cursor-not-allowed"
                                : "text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:border-rose-200 dark:hover:border-rose-500/30"
                            }`}
                            title="Archivar solicitud"
                          >
                            <Archive className="w-3.5 h-3.5 mr-1" />
                            Archivar
                          </Button>

                        </div>
                      </TableCell>

                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Vista Móvil */}
        <div className="lg:hidden flex flex-col divide-y divide-slate-200 dark:divide-zinc-800">
          {loading ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Cargando solicitudes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
              No se encontraron solicitudes.
            </div>
          ) : (
            filtered.map((item) => {
              const isAthleteSynced = 
                existingAthleteIds.has(item.id) || 
                existingAthleteNames.has(item.nombre.trim().toLowerCase());

              return (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-zinc-100 text-base leading-tight">{item.nombre}</h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
                        {item.edad ? `${item.edad} años • ` : ""}
                        {item.altura_cm ? `${item.altura_cm} cm • ` : ""}
                        {item.peso_kg ? `${item.peso_kg} kg • ` : ""}
                        {item.sede || "Sede Norte"}
                      </p>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-xs px-2 py-0.5 ${
                        item.estado === "Inscrito"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                          : item.estado === "Archivado"
                          ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                      }`}
                    >
                      {item.estado}
                    </Badge>
                  </div>

                  <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-1.5 text-xs border border-slate-200/80 dark:border-zinc-800 tabular-nums">
                    {item.documento && (
                      <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                        <span>Documento:</span>
                        <span className="font-mono text-slate-900 dark:text-zinc-200">{item.tipo_documento ? `${item.tipo_documento} ` : ""}{item.documento}</span>
                      </div>
                    )}
                    {item.genero && (
                      <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                        <span>Género:</span>
                        <span className="text-slate-900 dark:text-zinc-200">{item.genero}</span>
                      </div>
                    )}
                    {(item.localidad || item.barrio) && (
                      <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                        <span>Residencia:</span>
                        <span className="text-slate-900 dark:text-zinc-200 text-right truncate max-w-[180px]">
                          {item.localidad ? item.localidad : ""}{item.barrio ? `, ${item.barrio}` : ""}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                      <span>Experiencia:</span>
                      <strong className="text-indigo-600 dark:text-indigo-400">{item.experiencia || item.nivel || item.objetivo}</strong>
                    </div>
                    {item.plan && item.plan !== "Clase de Cortesía (Gratis)" && (
                      <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                        <span>Plan:</span>
                        <strong className="text-slate-900 dark:text-zinc-200">{item.plan}</strong>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                      <span>Teléfono:</span>
                      <span className="text-slate-900 dark:text-zinc-200">{item.telefono}</span>
                    </div>
                    {isAthleteSynced && (
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Sincronizado en Deportistas</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedSolicitudForReview(item)}
                      className="h-8 px-2.5 text-xs font-semibold border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
                      Validar Ficha
                    </Button>

                    <a
                      href={`https://wa.me/57${item.telefono.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 h-8 px-3 rounded-md text-xs font-medium"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>

                    {isAthleteSynced ? (
                      <Link to="/athletes" className="flex-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-8 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs"
                        >
                          Ver en Deportistas
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        disabled={updatingId === item.id}
                        onClick={() => handleAprobarEInscribir(item)}
                        className="flex-1 h-8 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-xs font-medium"
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1" />
                        {item.estado === "Inscrito" ? "Agregar a Deportistas" : "Inscribir"}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === item.id || item.estado === "Archivado"}
                      onClick={() => handleArchivar(item.id)}
                      className="h-8 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs px-2.5"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>

      {/* =====================================================================
          MODAL DE VALIDACIÓN COMPLETA DE LA FICHA DE INSCRIPCIÓN (6 SECCIONES)
          ===================================================================== */}
      {selectedSolicitudForReview && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5 text-slate-900 dark:text-zinc-100">
            {/* Cabecera del Modal */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-xs">
                    EXPEDIENTE DE INSCRIPCIÓN
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      selectedSolicitudForReview.eps
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-xs"
                        : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-xs"
                    }
                  >
                    {selectedSolicitudForReview.eps
                      ? `✓ EPS: ${selectedSolicitudForReview.eps}`
                      : "⚠️ Sin EPS registrada"}
                  </Badge>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-100">
                  {selectedSolicitudForReview.nombre}
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Origen: {selectedSolicitudForReview.origen || "Portal Web"} • Estado:{" "}
                  <strong className="text-indigo-600 dark:text-indigo-400">{selectedSolicitudForReview.estado}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedSolicitudForReview(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid con las 6 secciones de la inscripción */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* 1. Datos Personales */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                  1. Datos Personales del Estudiante
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Nombres completos:</span>{" "}
                  <strong>{selectedSolicitudForReview.nombre}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Fecha de nacimiento:</span>{" "}
                  <strong className="tabular-nums">{selectedSolicitudForReview.fecha_nacimiento || "No especificada"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Documento:</span>{" "}
                  <strong className="font-mono tabular-nums">
                    {selectedSolicitudForReview.tipo_documento || ""}{" "}
                    {selectedSolicitudForReview.documento || "No especificado"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Género:</span>{" "}
                  <strong>{selectedSolicitudForReview.genero || "No especificado"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Datos biométricos:</span>{" "}
                  <strong className="tabular-nums">
                    {selectedSolicitudForReview.edad || selectedSolicitudForReview.datos_biometricos?.edad
                      ? `${selectedSolicitudForReview.edad || selectedSolicitudForReview.datos_biometricos?.edad} años`
                      : "Edad s/d"}
                    {selectedSolicitudForReview.altura_cm || selectedSolicitudForReview.datos_biometricos?.alturaCm
                      ? ` • ${selectedSolicitudForReview.altura_cm || selectedSolicitudForReview.datos_biometricos?.alturaCm} cm`
                      : ""}
                    {selectedSolicitudForReview.peso_kg || selectedSolicitudForReview.datos_biometricos?.pesoKg
                      ? ` • ${selectedSolicitudForReview.peso_kg || selectedSolicitudForReview.datos_biometricos?.pesoKg} kg`
                      : ""}
                    {selectedSolicitudForReview.datos_biometricos?.imc
                      ? ` (IMC ${selectedSolicitudForReview.datos_biometricos.imc})`
                      : ""}
                  </strong>
                </p>
              </div>

              {/* 2. Ubicación y Contacto */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                  2. Ubicación y Contacto
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Localidad / Barrio:</span>{" "}
                  <strong>
                    {selectedSolicitudForReview.localidad || "—"} /{" "}
                    {selectedSolicitudForReview.barrio || "—"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Dirección:</span>{" "}
                  <strong>{selectedSolicitudForReview.direccion || "No especificada"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Teléfono de contacto:</span>{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    {selectedSolicitudForReview.telefono}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Padres o Acudientes:</span>{" "}
                  <strong>{selectedSolicitudForReview.acudientes || "No especificado"}</strong>
                </p>
              </div>

              {/* 3. Información Médica (Crítico) */}
              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-1.5">
                <p className="font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <HeartPulse className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  3. Información Médica (Crítico)
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">EPS del estudiante:</span>{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {selectedSolicitudForReview.eps || "⚠️ Pendiente de verificar"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Alergias / Condiciones:</span>{" "}
                  <strong>{selectedSolicitudForReview.alergias || "Ninguna"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Certificado EPS / ADRES:</span>{" "}
                  {selectedSolicitudForReview.archivos?.certificadoEpsNombre ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {selectedSolicitudForReview.archivos.certificadoEpsNombre}
                      </strong>
                      {selectedSolicitudForReview.archivos.certificadoEpsDataUrl && (
                        <a
                          href={selectedSolicitudForReview.archivos.certificadoEpsDataUrl}
                          download={selectedSolicitudForReview.archivos.certificadoEpsNombre}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Verificar documento →
                        </a>
                      )}
                    </span>
                  ) : (
                    <strong className="text-amber-600 dark:text-amber-400">Sin soporte adjunto</strong>
                  )}
                </p>
              </div>

              {/* 4. Perfil Deportivo y 6. Plan */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                  4. Perfil Deportivo y Plan Elegido
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Talla de indumentaria:</span>{" "}
                  <strong>{selectedSolicitudForReview.talla || "No especificada"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Tiempo entrenando:</span>{" "}
                  <strong>
                    {selectedSolicitudForReview.experiencia ||
                      selectedSolicitudForReview.nivel ||
                      "No especificado"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">¿Perteneció a otro club?:</span>{" "}
                  <strong>{selectedSolicitudForReview.pertenecio_otro_club || "No"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">6. Plan a pagar:</span>{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {selectedSolicitudForReview.plan || selectedSolicitudForReview.objetivo}
                  </strong>
                </p>
              </div>
            </div>

            {/* 5. Documentación y Archivos Adjuntos */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-3 text-xs">
              <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                5. Documentación y Archivos Cargados
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Certificado Verificable EPS */}
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-500/30 space-y-2">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">Certificado EPS / ADRES</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    {selectedSolicitudForReview.archivos?.certificadoEpsNombre ||
                      "Sin soporte adjunto"}
                  </p>
                  {selectedSolicitudForReview.archivos?.certificadoEpsDataUrl && (
                    <div className="space-y-1.5">
                      {selectedSolicitudForReview.archivos.certificadoEpsDataUrl.startsWith("data:image/") && (
                        <img
                          src={selectedSolicitudForReview.archivos.certificadoEpsDataUrl}
                          alt="Soporte EPS"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-zinc-700"
                        />
                      )}
                      <a
                        href={selectedSolicitudForReview.archivos.certificadoEpsDataUrl}
                        download={
                          selectedSolicitudForReview.archivos.certificadoEpsNombre ||
                          "certificado-eps"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Ver / Descargar EPS →
                      </a>
                    </div>
                  )}
                </div>

                {/* Documento de Identidad (Frente) */}
                {(() => {
                  const frenteNombre =
                    selectedSolicitudForReview.archivos?.documentoIdentidadFrenteNombre ||
                    selectedSolicitudForReview.archivos?.documentoIdentidadNombre;
                  const frenteUrl =
                    selectedSolicitudForReview.archivos?.documentoIdentidadFrenteDataUrl ||
                    selectedSolicitudForReview.archivos?.documentoIdentidadDataUrl;
                  return (
                    <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                      <p className="font-semibold text-slate-900 dark:text-zinc-100">1. Documento (Frente)</p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                        {frenteNombre || "Sin archivo adjunto"}
                      </p>
                      {frenteUrl && (
                        <div className="space-y-1.5">
                          {frenteUrl.startsWith("data:image/") && (
                            <img
                              src={frenteUrl}
                              alt="Documento frente"
                              className="w-20 h-14 object-cover rounded-lg border border-slate-200 dark:border-zinc-700"
                            />
                          )}
                          <a
                            href={frenteUrl}
                            download={frenteNombre || "documento-frente"}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            Ver / Descargar frente →
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Documento de Identidad (Reverso) */}
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">2. Documento (Reverso)</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    {selectedSolicitudForReview.archivos?.documentoIdentidadReversoNombre ||
                      "Sin archivo adjunto"}
                  </p>
                  {selectedSolicitudForReview.archivos?.documentoIdentidadReversoDataUrl && (
                    <div className="space-y-1.5">
                      {selectedSolicitudForReview.archivos.documentoIdentidadReversoDataUrl.startsWith("data:image/") && (
                        <img
                          src={selectedSolicitudForReview.archivos.documentoIdentidadReversoDataUrl}
                          alt="Documento reverso"
                          className="w-20 h-14 object-cover rounded-lg border border-slate-200 dark:border-zinc-700"
                        />
                      )}
                      <a
                        href={selectedSolicitudForReview.archivos.documentoIdentidadReversoDataUrl}
                        download={
                          selectedSolicitudForReview.archivos.documentoIdentidadReversoNombre ||
                          "documento-reverso"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Ver / Descargar reverso →
                      </a>
                    </div>
                  )}
                </div>

                {/* Foto Tipo Documento */}
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">3. Foto Tipo Documento</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    {selectedSolicitudForReview.archivos?.fotoTipoDocumentoNombre ||
                      "Sin foto adjunta"}
                  </p>
                  {selectedSolicitudForReview.archivos?.fotoTipoDocumentoDataUrl && (
                    <div className="space-y-1.5">
                      <img
                        src={selectedSolicitudForReview.archivos.fotoTipoDocumentoDataUrl}
                        alt="Foto deportista"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-zinc-700"
                      />
                      <a
                        href={selectedSolicitudForReview.archivos.fotoTipoDocumentoDataUrl}
                        download={
                          selectedSolicitudForReview.archivos.fotoTipoDocumentoNombre ||
                          "foto-documento.jpg"
                        }
                        className="inline-block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Descargar foto →
                      </a>
                    </div>
                  )}
                </div>

                {/* Carta de Libertad */}
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">4. Carta de Libertad</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    {selectedSolicitudForReview.archivos?.cartaLibertadNombre ||
                      (selectedSolicitudForReview.pertenecio_otro_club === "Sí"
                        ? "Pendiente"
                        : "No aplica (Primer club)")}
                  </p>
                  {selectedSolicitudForReview.archivos?.cartaLibertadDataUrl && (
                    <a
                      href={selectedSolicitudForReview.archivos.cartaLibertadDataUrl}
                      download={
                        selectedSolicitudForReview.archivos.cartaLibertadNombre ||
                        "carta-libertad"
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Ver / Descargar carta →
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Botones de Acción del Modal */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedSolicitudForReview(null)}
                className="border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-xs rounded-lg"
              >
                Cerrar
              </Button>
              <Button
                type="button"
                disabled={updatingId === selectedSolicitudForReview.id}
                onClick={async () => {
                  const target = selectedSolicitudForReview;
                  setSelectedSolicitudForReview(null);
                  await handleAprobarEInscribir(target);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold text-xs rounded-lg gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Validar y Aprobar Inscripción en Deportistas</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
