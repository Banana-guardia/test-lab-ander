import { useState, useEffect, useRef } from "react";
import {
  db,
  mergeAthletesData,
  saveAthleteToDatabase,
  deleteAthleteFromDatabase
} from "@/lib/firebase";
import { 
  collection, 
  onSnapshot 
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Search, 
  Trash2, 
  Phone, 
  Mail, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  XCircle,
  Database,
  Users,
  AlertTriangle,
  Pencil,
  IdCard,
  Eye,
  FileText,
  HeartPulse,
  Activity
} from "lucide-react";
import { seedInitialDataIfEmpty, seedAdditionalAthletes } from "@/lib/seedData";
import { PAYMENT_PLANS, getPlanDetails } from "@/lib/plans";

export type PaymentStatus = "al_dia" | "en_mora";

export interface AthleteArchivos {
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

export interface Athlete {
  id: string;
  name: string;
  nombres?: string;
  documento?: string;
  tipoDocumento?: string;
  numeroIdentidad?: string;
  cedula?: string;
  age: number;
  fechaNacimiento?: string | null;
  genero?: string | null;
  alturaCm?: number | null;
  pesoKg?: number | null;
  imc?: number | null;
  category: string;
  group: string;
  status: "Activo" | "Inactivo";
  estado_pago?: PaymentStatus;
  financialStatus?: "Al día" | "Pago parcial" | "En mora";
  phone?: string;
  telefono?: string;
  celular?: string;
  whatsapp?: string;
  email?: string;
  plan?: string;
  fechaVencimiento?: string;
  valorPendiente?: number;
  parentName?: string;
  parentPhone?: string;
  acudientes?: string | null;
  localidad?: string | null;
  barrio?: string | null;
  direccion?: string | null;
  eps?: string;
  alergias?: string | null;
  talla?: string | null;
  experiencia?: string | null;
  pertenecioOtroClub?: string | null;
  archivos?: AthleteArchivos | null;
}

/**
 * Obtiene el estado de pago del deportista garantizando compatibilidad con registros antiguos.
 * Si el campo `estado_pago` no existe, se asume 'al_dia' por defecto (o 'en_mora' si legacy financialStatus era 'En mora').
 */
const getAthletePaymentStatus = (athlete: Athlete): PaymentStatus => {
  if (athlete.estado_pago === "al_dia" || athlete.estado_pago === "en_mora") {
    return athlete.estado_pago;
  }
  if (athlete.financialStatus === "En mora" || athlete.financialStatus === "Pago parcial") {
    return "en_mora";
  }
  return "al_dia";
};

const getAthletePhone = (athlete: Athlete): string => {
  return athlete.phone || athlete.telefono || athlete.celular || athlete.whatsapp || "";
};

const getAthleteDocumento = (athlete: Athlete): string => {
  return athlete.documento || athlete.numeroIdentidad || athlete.cedula || "";
};

const DEFAULT_GROUPS = [
  "Selección A",
  "Selección B",
  "Formativo Mañana",
  "Formativo Tarde"
];

export default function Athletes() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [availableGroups, setAvailableGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null);
  const [selectedAthleteFicha, setSelectedAthleteFicha] = useState<Athlete | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Estado para Diálogo de Confirmación de Eliminación
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estado para actualización en curso de pago
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);

  // Estado para Alerta Visual Flotante (Toast Notification)
  const [toast, setToast] = useState<{
    id: number;
    athleteName: string;
    newStatus: PaymentStatus;
    customMessage?: string;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastCounterRef = useRef<number>(0);

  const showToast = (athleteName: string, newStatus: PaymentStatus, customMessage?: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastCounterRef.current += 1;
    setToast({
      id: toastCounterRef.current,
      athleteName,
      newStatus,
      customMessage
    });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Form State (Crear / Editar Deportista)
  const [formData, setFormData] = useState({
    name: "",
    documento: "",
    age: "",
    alturaCm: "",
    pesoKg: "",
    category: "Juvenil",
    group: "Selección A",
    plan: "Plan Alfa",
    phone: "",
    email: "",
    status: "Activo" as "Activo" | "Inactivo",
    estado_pago: "al_dia" as PaymentStatus,
    financialStatus: "Al día" as "Al día" | "Pago parcial" | "En mora",
    fechaVencimiento: "",
    valorPendiente: "",
    parentName: "",
    parentPhone: "",
    eps: "",
    alergias: "",
    talla: "",
    localidad: "",
    direccion: ""
  });

  // Suscripción en tiempo real a Firestore (athletes y groups) con sincronización híbrida completa
  useEffect(() => {
    let latestFirestoreList: any[] = [];

    const refreshUnifiedAthletes = () => {
      const merged = mergeAthletesData(latestFirestoreList) as Athlete[];
      setAthletes(merged);
      setLoading(false);
    };

    const unsubscribeAthletes = onSnapshot(
      collection(db, "athletes"),
      (snapshot) => {
        if (snapshot.size < 15) {
          seedAdditionalAthletes().catch(() => {});
        }

        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ...d,
            name: d.name || d.nombres || "Sin Nombre"
          });
        });

        latestFirestoreList = list;
        refreshUnifiedAthletes();
      },
      (error) => {
        console.warn("Aviso en listener de athletes (usando copia local y base de datos):", error);
        refreshUnifiedAthletes();
      }
    );

    const unsubscribeGroups = onSnapshot(
      collection(db, "groups"),
      (snapshot) => {
        const groupNames = new Set<string>(DEFAULT_GROUPS);
        snapshot.forEach((docSnap) => {
          const gName = docSnap.data()?.name;
          if (gName && typeof gName === "string") {
            groupNames.add(gName.trim());
          }
        });
        try {
          const localGrps = JSON.parse(localStorage.getItem("soul_local_groups") || "[]");
          localGrps.forEach((lg: any) => {
            if (lg?.name) groupNames.add(String(lg.name).trim());
          });
        } catch {}
        setAvailableGroups(Array.from(groupNames));
      },
      () => {}
    );

    window.addEventListener("soul-athletes-updated", refreshUnifiedAthletes);

    return () => {
      unsubscribeAthletes();
      unsubscribeGroups();
      window.removeEventListener("soul-athletes-updated", refreshUnifiedAthletes);
    };
  }, []);

  // Abrir modal para Crear Nuevo Deportista
  const handleOpenCreateModal = () => {
    setEditingAthlete(null);
    setFormData({
      name: "",
      documento: "",
      age: "",
      alturaCm: "",
      pesoKg: "",
      category: "Juvenil",
      group: availableGroups[0] || "Selección A",
      plan: "Plan Alfa",
      phone: "",
      email: "",
      status: "Activo",
      estado_pago: "al_dia",
      financialStatus: "Al día",
      fechaVencimiento: "",
      valorPendiente: "",
      parentName: "",
      parentPhone: "",
      eps: "",
      alergias: "",
      talla: "",
      localidad: "",
      direccion: ""
    });
    setIsModalOpen(true);
  };

  // Abrir modal para Editar Deportista Existente
  const handleOpenEditModal = (athlete: Athlete) => {
    const resolvedPaymentStatus = getAthletePaymentStatus(athlete);
    const resolvedFinStatus =
      athlete.financialStatus ||
      (resolvedPaymentStatus === "en_mora" ? "En mora" : "Al día");

    setEditingAthlete(athlete);
    setFormData({
      name: athlete.name || athlete.nombres || "",
      documento: getAthleteDocumento(athlete),
      age: athlete.age !== undefined && athlete.age !== null ? String(athlete.age) : "16",
      alturaCm: athlete.alturaCm !== undefined && athlete.alturaCm !== null ? String(athlete.alturaCm) : "",
      pesoKg: athlete.pesoKg !== undefined && athlete.pesoKg !== null ? String(athlete.pesoKg) : "",
      category: athlete.category || "Juvenil",
      group: athlete.group || availableGroups[0] || "Selección A",
      plan: athlete.plan || "Plan Alfa",
      phone: getAthletePhone(athlete),
      email: athlete.email || "",
      status: athlete.status || "Activo",
      estado_pago: resolvedPaymentStatus,
      financialStatus: resolvedFinStatus,
      fechaVencimiento: athlete.fechaVencimiento || "",
      valorPendiente:
        athlete.valorPendiente !== undefined && athlete.valorPendiente !== null
          ? String(athlete.valorPendiente)
          : "",
      parentName: athlete.parentName || athlete.acudientes || "",
      parentPhone: athlete.parentPhone || "",
      eps: athlete.eps || "",
      alergias: athlete.alergias || "",
      talla: athlete.talla || "",
      localidad: athlete.localidad || "",
      direccion: athlete.direccion || ""
    });
    setIsModalOpen(true);
  };

  // Guardar (Crear o Actualizar) Deportista en Firestore + Sincronización Local
  const handleSaveAthlete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    const cleanPhone = formData.phone.trim();
    const cleanDoc = formData.documento.trim();
    const syncedEstadoPago: PaymentStatus =
      formData.financialStatus === "Al día" ? "al_dia" : "en_mora";

    const parsedHeight = formData.alturaCm.trim() ? Number(formData.alturaCm) : null;
    const parsedWeight = formData.pesoKg.trim() ? Number(formData.pesoKg) : null;
    const computedImc =
      parsedHeight && parsedWeight && parsedHeight > 0
        ? Number((parsedWeight / Math.pow(parsedHeight / 100, 2)).toFixed(1))
        : null;

    const payload: Record<string, any> = {
      ...(editingAthlete || {}),
      name: formData.name.trim(),
      nombres: formData.name.trim(),
      documento: cleanDoc,
      age: parseInt(formData.age, 10) || 16,
      alturaCm: parsedHeight,
      pesoKg: parsedWeight,
      imc: computedImc,
      category: formData.category,
      group: formData.group,
      plan: formData.plan || "Plan Alfa",
      phone: cleanPhone,
      telefono: cleanPhone,
      email: formData.email.trim(),
      status: formData.status,
      estado_pago: syncedEstadoPago,
      financialStatus: formData.financialStatus,
      fechaVencimiento: formData.fechaVencimiento.trim() || null,
      valorPendiente: formData.valorPendiente.trim()
        ? Number(formData.valorPendiente)
        : null,
      parentName: formData.parentName.trim(),
      acudientes: formData.parentName.trim() || editingAthlete?.acudientes || null,
      parentPhone: formData.parentPhone.trim(),
      eps: formData.eps.trim(),
      alergias: formData.alergias.trim() || null,
      talla: formData.talla.trim() || null,
      localidad: formData.localidad.trim() || null,
      direccion: formData.direccion.trim() || null
    };

    await saveAthleteToDatabase(
      payload,
      editingAthlete
        ? {
            id: editingAthlete.id,
            documento: getAthleteDocumento(editingAthlete),
            name: editingAthlete.name || editingAthlete.nombres || ""
          }
        : null
    );

    showToast(
      payload.name,
      syncedEstadoPago,
      editingAthlete
        ? `Datos de ${payload.name} actualizados con éxito.`
        : `Deportista ${payload.name} registrado con éxito.`
    );

    setEditingAthlete(null);
    setIsModalOpen(false);
    setSubmitting(false);
  };

  // Alternar Estado Activo / Inactivo
  const handleToggleStatus = async (athlete: Athlete) => {
    const newStatus: "Activo" | "Inactivo" = athlete.status === "Activo" ? "Inactivo" : "Activo";
    const currentPayment = getAthletePaymentStatus(athlete);

    await saveAthleteToDatabase(
      {
        ...athlete,
        documento: getAthleteDocumento(athlete),
        phone: getAthletePhone(athlete),
        status: newStatus
      },
      {
        id: athlete.id,
        documento: getAthleteDocumento(athlete),
        name: athlete.name
      }
    );

    showToast(
      athlete.name,
      currentPayment,
      `Estado de ${athlete.name} cambiado a ${newStatus}.`
    );
  };

  // Alternar Estado de Pago Manual (Al día <-> En mora)
  const handleTogglePaymentStatus = async (athlete: Athlete) => {
    const currentStatus = getAthletePaymentStatus(athlete);
    const nextStatus: PaymentStatus = currentStatus === "al_dia" ? "en_mora" : "al_dia";
    const nextFinStatus = nextStatus === "al_dia" ? "Al día" : "En mora";

    try {
      setUpdatingPaymentId(athlete.id);
      await saveAthleteToDatabase(
        {
          ...athlete,
          documento: getAthleteDocumento(athlete),
          phone: getAthletePhone(athlete),
          estado_pago: nextStatus,
          financialStatus: nextFinStatus
        },
        {
          id: athlete.id,
          documento: getAthleteDocumento(athlete),
          name: athlete.name
        }
      );

      showToast(athlete.name, nextStatus);
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  // Confirmar y Ejecutar Eliminación
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const matched = athletes.find((a) => a.id === deleteTarget.id);
      await deleteAthleteFromDatabase({
        id: deleteTarget.id,
        name: deleteTarget.name,
        documento: matched ? getAthleteDocumento(matched) : ""
      });
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeed = async () => {
    setLoading(true);
    await seedInitialDataIfEmpty(true);
    setLoading(false);
  };

  const filteredAthletes = athletes.filter((a) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const docVal = getAthleteDocumento(a).toLowerCase();
    const phoneVal = getAthletePhone(a).toLowerCase();
    return (
      (a.name?.toLowerCase() || "").includes(q) ||
      docVal.includes(q) ||
      phoneVal.includes(q) ||
      (a.group?.toLowerCase() || "").includes(q) ||
      (a.category?.toLowerCase() || "").includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">Deportistas</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20">
              {athletes.length} {athletes.length === 1 ? "jugador" : "jugadores"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-zinc-400 text-xs sm:text-sm mt-1">
            Gestión y edición en tiempo real con Firestore de los jugadores del Club SOUL.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={async () => {
              setLoading(true);
              await seedAdditionalAthletes();
              setLoading(false);
            }}
            className="text-xs tabular-nums"
            title="Sincronizar plantilla completa de deportistas en Firestore"
          >
            <Database className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
            Cargar Plantilla Completa ({athletes.length < 17 ? `+${17 - athletes.length}` : "✓"})
          </Button>

          <Button 
            onClick={handleOpenCreateModal}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Deportista
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        {/* Barra de Búsqueda */}
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-zinc-500" />
            <Input 
              placeholder="Buscar por nombre, documento, teléfono o grupo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 hidden sm:block">
            Haz clic en el lápiz o en un jugador para editar sus datos
          </div>
        </div>
        
        {/* Vista Desktop: Tabla */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nombre / Documento</TableHead>
                <TableHead>Edad</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado de Pago</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
                    Cargando jugadores en tiempo real desde Firestore...
                  </TableCell>
                </TableRow>
              ) : filteredAthletes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-zinc-500" />
                    No se encontraron deportistas registrados. Haz clic en "Nuevo Deportista".
                  </TableCell>
                </TableRow>
              ) : (
                filteredAthletes.map((athlete) => {
                  const phoneVal = getAthletePhone(athlete);
                  const docVal = getAthleteDocumento(athlete);

                  return (
                    <TableRow key={athlete.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(athlete)}
                          className="text-left group focus:outline-none"
                          title="Haz clic para modificar los datos del deportista"
                        >
                          <p className="font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                            <span>{athlete.name}</span>
                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 text-indigo-600 dark:text-indigo-400 transition-opacity" />
                          </p>
                          {docVal ? (
                            <span className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums flex items-center gap-1 mt-0.5">
                              <IdCard className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                              Doc: {docVal}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-zinc-500 italic">Sin documento</span>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-zinc-300 tabular-nums">
                        <div>
                          <span>{athlete.age} años</span>
                          {(athlete.alturaCm || athlete.pesoKg) && (
                            <span className="block text-[11px] text-slate-400 dark:text-zinc-500">
                              {athlete.alturaCm ? `${athlete.alturaCm} cm` : ""}
                              {athlete.alturaCm && athlete.pesoKg ? " • " : ""}
                              {athlete.pesoKg ? `${athlete.pesoKg} kg` : ""}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          {athlete.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const planDetails = getPlanDetails(athlete.plan);
                          return planDetails ? (
                            <Badge variant="secondary" className="text-[11px]">
                              {planDetails.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[11px]">
                              {athlete.plan || "Sin Asignar"}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-zinc-300 font-medium">{athlete.group}</TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          {phoneVal ? (
                            <a 
                              href={`https://wa.me/57${phoneVal.replace(/\D/g, '').replace(/^57/, '')}`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 tabular-nums hover:underline font-medium"
                            >
                              <Phone className="w-3 h-3" />
                              {phoneVal}
                            </a>
                          ) : (
                            <span className="text-slate-400 dark:text-zinc-500 italic">Sin teléfono</span>
                          )}
                          {athlete.email && (
                            <div className="flex items-center gap-1 text-slate-500 dark:text-zinc-400 truncate max-w-[140px]">
                              <Mail className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                              {athlete.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      {/* Columna: Estado de Pago con Botón / Badge Interactivo */}
                      <TableCell>
                        {(() => {
                          const paymentStatus = getAthletePaymentStatus(athlete);
                          const isUpdating = updatingPaymentId === athlete.id;
                          const isAlDia = paymentStatus === "al_dia";

                          return (
                            <button
                              type="button"
                              onClick={() => handleTogglePaymentStatus(athlete)}
                              disabled={isUpdating}
                              title={`Estado de pago: ${isAlDia ? "Al día" : "En mora"}. Haz clic para cambiar a ${isAlDia ? "En mora" : "Al día"}.`}
                              className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                                isAlDia
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 dark:hover:bg-emerald-500/20"
                                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/80 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 dark:hover:bg-rose-500/20"
                              } ${isUpdating ? "opacity-60 cursor-not-allowed" : ""}`}
                            >
                              {isUpdating ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-current" />
                              ) : isAlDia ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                              )}
                              <span>{isAlDia ? "Al día" : "En mora"}</span>
                              <span 
                                aria-hidden="true" 
                                className="text-[10px] opacity-50 group-hover:opacity-100 transition-opacity ml-0.5"
                              >
                                ⇄
                              </span>
                            </button>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleToggleStatus(athlete)}
                          title="Haz clic para cambiar estado"
                          className="cursor-pointer focus:outline-none"
                        >
                          <Badge 
                            variant={athlete.status === "Activo" ? "success" : "destructive"}
                          >
                            {athlete.status === "Activo" ? (
                              <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                            ) : (
                              <XCircle className="w-3 h-3 mr-1 inline" />
                            )}
                            {athlete.status}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedAthleteFicha(athlete)}
                            className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 h-8 px-2.5 rounded-lg gap-1 text-xs"
                            title="Ver ficha biométrica, EPS y documentos"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Ficha</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(athlete)}
                            className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 h-8 px-2.5 rounded-lg gap-1 text-xs"
                            title="Editar datos del deportista"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Editar</span>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeleteTarget({ id: athlete.id, name: athlete.name })}
                            className="text-slate-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 h-8 w-8"
                            title="Eliminar deportista de Firestore"
                          >
                            <Trash2 className="h-4 w-4" />
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

        {/* Vista Mobile: Lista de Tarjetas */}
        <div className="md:hidden flex flex-col divide-y divide-slate-200 dark:divide-zinc-800">
          {loading ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
              Cargando deportistas...
            </div>
          ) : filteredAthletes.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
              No hay deportistas registrados.
            </div>
          ) : (
            filteredAthletes.map((athlete) => {
              const docVal = getAthleteDocumento(athlete);
              const phoneVal = getAthletePhone(athlete);

              return (
                <div key={athlete.id} className="p-4 flex justify-between items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(athlete)}
                      className="font-semibold text-slate-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 text-left flex items-center gap-1.5"
                    >
                      <span className="truncate">{athlete.name}</span>
                      <Pencil className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    </button>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                      {athlete.group} • {athlete.age} años
                      {athlete.alturaCm ? ` • ${athlete.alturaCm} cm` : ""}
                      {athlete.pesoKg ? ` • ${athlete.pesoKg} kg` : ""}
                      {docVal ? ` • Doc: ${docVal}` : ""}
                    </p>
                    {phoneVal && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">Tel: {phoneVal}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge variant="default" className="text-[10px]">{athlete.category}</Badge>
                      {athlete.plan && (
                        <Badge variant="secondary" className="text-[10px]">
                          {athlete.plan}
                        </Badge>
                      )}
                      {/* Badge / Botón interactivo de Estado de Pago (Móvil) */}
                      {(() => {
                        const paymentStatus = getAthletePaymentStatus(athlete);
                        const isAlDia = paymentStatus === "al_dia";
                        const isUpdating = updatingPaymentId === athlete.id;

                        return (
                          <button
                            type="button"
                            onClick={() => handleTogglePaymentStatus(athlete)}
                            disabled={isUpdating}
                            title={`Pago: ${isAlDia ? "Al día" : "En mora"}. Toca para cambiar.`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                              isAlDia
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                            } ${isUpdating ? "opacity-60" : ""}`}
                          >
                            {isUpdating ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            ) : isAlDia ? (
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" />
                            )}
                            <span>{isAlDia ? "Al día" : "En mora"}</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedAthleteFicha(athlete)}
                      className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 h-8 w-8"
                      title="Ver ficha completa y documentos"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEditModal(athlete)}
                      className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 h-8 w-8"
                      title="Editar deportista"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <button onClick={() => handleToggleStatus(athlete)}>
                      <Badge 
                        variant={athlete.status === "Activo" ? "success" : "destructive"}
                      >
                        {athlete.status}
                      </Badge>
                    </button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteTarget({ id: athlete.id, name: athlete.name })}
                      className="text-slate-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Toast Notification Flotante para Confirmación de Guardado en Firebase */}
      {toast && (
        <div 
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-lg animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-sm sm:max-w-md"
        >
          <div className={`p-2 rounded-lg shrink-0 ${toast.newStatus === "al_dia" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"}`}>
            {toast.newStatus === "al_dia" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0 pr-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {toast.customMessage ? "Cambios Guardados en Firebase" : "Pago Guardado en Firebase"}
            </p>
            {toast.customMessage ? (
              <p className="text-sm text-slate-900 dark:text-zinc-100 font-medium truncate">{toast.customMessage}</p>
            ) : (
              <p className="text-sm text-slate-900 dark:text-zinc-100 font-medium truncate">
                <span className="font-bold">{toast.athleteName}</span>: ahora está{" "}
                <span className={toast.newStatus === "al_dia" ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"}>
                  {toast.newStatus === "al_dia" ? "Al día" : "En mora"}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            title="Cerrar notificación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal / Dialog para Confirmar Eliminación */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-xl relative space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-lg border border-rose-200 dark:border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">¿Eliminar Deportista?</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-zinc-300">
              ¿Estás seguro de que deseas eliminar permanentemente a <strong className="text-slate-900 dark:text-zinc-100">{deleteTarget.name}</strong> de Firestore?
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? "Eliminando..." : "Sí, Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog para Crear o Editar Deportista */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl w-full max-w-xl p-6 shadow-xl relative space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                {editingAthlete ? (
                  <>
                    <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Editar Datos del Deportista
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Registrar Nuevo Deportista
                  </>
                )}
              </h3>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingAthlete(null);
                }}
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAthlete} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Nombre Completo *</label>
                  <Input 
                    required
                    placeholder="Ej: Daniel Gómez" 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Documento de Identidad (TI / CC)</label>
                  <Input 
                    placeholder="Ej: 1093496820" 
                    value={formData.documento}
                    onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Edad *</label>
                  <Input 
                    type="number"
                    min="4"
                    max="99"
                    required
                    placeholder="16" 
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Altura (cm)</label>
                  <Input 
                    type="number"
                    min="80"
                    max="240"
                    placeholder="168" 
                    value={formData.alturaCm}
                    onChange={(e) => setFormData({ ...formData, alturaCm: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Peso (kg)</label>
                  <Input 
                    type="number"
                    step="0.1"
                    min="15"
                    max="200"
                    placeholder="60.5" 
                    value={formData.pesoKg}
                    onChange={(e) => setFormData({ ...formData, pesoKg: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Categoría</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="Iniciación">Iniciación</option>
                    <option value="Infantil">Infantil</option>
                    <option value="Pre-Juvenil">Pre-Juvenil</option>
                    <option value="Juvenil">Juvenil</option>
                    <option value="Mayores">Mayores</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Estado en Club</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Grupo de Entrenamiento</label>
                  <select 
                    value={formData.group}
                    onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {availableGroups.map((gName) => (
                      <option key={gName} value={gName}>
                        {gName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Plan de Pago (Mensualidad)</label>
                  <select 
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {PAYMENT_PLANS.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} (${p.prontoPagoPrice / 1000}k pronto pago)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Teléfono / WhatsApp (Para Cobros)</label>
                  <Input 
                    placeholder="3001234567" 
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Correo Electrónico</label>
                  <Input 
                    type="email"
                    placeholder="deportista@gmail.com" 
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              {/* Sección Financiera / Cartera */}
              <div className="pt-3 border-t border-slate-200 dark:border-zinc-800">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2">
                  Estado de Cartera & Mensualidad
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Estado Financiero</label>
                    <select 
                      value={formData.financialStatus}
                      onChange={(e) => {
                        const val = e.target.value as "Al día" | "Pago parcial" | "En mora";
                        setFormData({
                          ...formData,
                          financialStatus: val,
                          estado_pago: val === "Al día" ? "al_dia" : "en_mora"
                        });
                      }}
                      className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="Al día">Al día</option>
                      <option value="Pago parcial">Pago parcial</option>
                      <option value="En mora">En mora</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Fecha Vencimiento</label>
                    <Input 
                      type="date"
                      value={formData.fechaVencimiento}
                      onChange={(e) => setFormData({ ...formData, fechaVencimiento: e.target.value })}
                      className="text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Saldo Pendiente (COP)</label>
                    <Input 
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="Automático según plan"
                      value={formData.valorPendiente}
                      onChange={(e) => setFormData({ ...formData, valorPendiente: e.target.value })}
                      className="text-xs tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Datos Adicionales de Ficha (Acudiente / EPS) */}
              <div className="pt-3 border-t border-slate-200 dark:border-zinc-800">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
                  Datos de Acudiente / Salud (Opcional)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Nombre Acudiente</label>
                    <Input 
                      placeholder="Nombre del acudiente" 
                      value={formData.parentName}
                      onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Tel. Acudiente</label>
                    <Input 
                      placeholder="310..." 
                      value={formData.parentPhone}
                      onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                      className="text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">EPS</label>
                    <Input 
                      placeholder="Ej: Sura, Sanitas..." 
                      value={formData.eps}
                      onChange={(e) => setFormData({ ...formData, eps: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Alergias</label>
                    <Input 
                      placeholder="Ninguna o especificar" 
                      value={formData.alergias}
                      onChange={(e) => setFormData({ ...formData, alergias: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Talla Indumentaria</label>
                    <Input 
                      placeholder="Ej: M (Adulto)" 
                      value={formData.talla}
                      onChange={(e) => setFormData({ ...formData, talla: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Localidad / Dirección</label>
                    <Input 
                      placeholder="Ej: Suba - Calle 140..." 
                      value={formData.localidad || formData.direccion}
                      onChange={(e) => setFormData({ ...formData, localidad: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingAthlete(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitting}
                >
                  {submitting
                    ? "Guardando cambios..."
                    : editingAthlete
                    ? "Guardar Cambios"
                    : "Guardar en Firestore"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ficha Completa del Deportista (Datos Biométricos, EPS y Documentos) */}
      {selectedAthleteFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-zinc-800 pb-3 gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span>Ficha Integral del Deportista</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  {selectedAthleteFicha.name} • {selectedAthleteFicha.group} ({selectedAthleteFicha.category})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAthleteFicha(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* 1. Datos Personales y Biométricos */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  1. Datos Personales & Biométricos
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Documento:</span>{" "}
                  <strong className="font-mono">{getAthleteDocumento(selectedAthleteFicha) || "No registrado"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Edad / F. Nacimiento:</span>{" "}
                  <strong className="tabular-nums">
                    {selectedAthleteFicha.age} años
                    {selectedAthleteFicha.fechaNacimiento ? ` (${selectedAthleteFicha.fechaNacimiento})` : ""}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Altura / Peso / IMC:</span>{" "}
                  <strong className="tabular-nums">
                    {selectedAthleteFicha.alturaCm ? `${selectedAthleteFicha.alturaCm} cm` : "Altura s/d"} •{" "}
                    {selectedAthleteFicha.pesoKg ? `${selectedAthleteFicha.pesoKg} kg` : "Peso s/d"}
                    {selectedAthleteFicha.imc ? ` (IMC ${selectedAthleteFicha.imc})` : ""}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Género:</span>{" "}
                  <strong>{selectedAthleteFicha.genero || "No especificado"}</strong>
                </p>
              </div>

              {/* 2. Salud y EPS */}
              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-1.5">
                <p className="font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <HeartPulse className="w-4 h-4" />
                  2. Información Médica & EPS
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">EPS:</span>{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {selectedAthleteFicha.eps || "Pendiente de registrar"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Alergias / Condiciones:</span>{" "}
                  <strong>{selectedAthleteFicha.alergias || "Ninguna"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Certificado EPS / ADRES:</span>{" "}
                  <strong>{selectedAthleteFicha.archivos?.certificadoEpsNombre || "Sin soporte adjunto"}</strong>
                </p>
              </div>

              {/* 3. Contacto y Residencia */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                  3. Ubicación & Acudientes
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Acudiente(s):</span>{" "}
                  <strong>{selectedAthleteFicha.parentName || selectedAthleteFicha.acudientes || "No especificado"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Teléfono / WhatsApp:</span>{" "}
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                    {getAthletePhone(selectedAthleteFicha) || "Sin teléfono"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Localidad / Barrio:</span>{" "}
                  <strong>
                    {selectedAthleteFicha.localidad || "—"}
                    {selectedAthleteFicha.barrio ? ` / ${selectedAthleteFicha.barrio}` : ""}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Dirección:</span>{" "}
                  <strong>{selectedAthleteFicha.direccion || "No especificada"}</strong>
                </p>
              </div>

              {/* 4. Perfil Deportivo */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                  4. Perfil Deportivo & Plan
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Talla Indumentaria:</span>{" "}
                  <strong>{selectedAthleteFicha.talla || "No especificada"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Experiencia:</span>{" "}
                  <strong>{selectedAthleteFicha.experiencia || "No especificada"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">¿Perteneció a otro club?:</span>{" "}
                  <strong>{selectedAthleteFicha.pertenecioOtroClub || "No"}</strong>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-400">Plan:</span>{" "}
                  <strong className="text-indigo-600 dark:text-indigo-400">{selectedAthleteFicha.plan || "Plan Alfa"}</strong>
                </p>
              </div>
            </div>

            {/* 5. Documentos Cargados */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-3 text-xs">
              <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                5. Documentos Verificables Cargados
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {
                    title: "Certificado EPS / ADRES",
                    name: selectedAthleteFicha.archivos?.certificadoEpsNombre,
                    dataUrl: selectedAthleteFicha.archivos?.certificadoEpsDataUrl,
                    fallback: "Sin soporte EPS"
                  },
                  {
                    title: "Documento (Frente)",
                    name:
                      selectedAthleteFicha.archivos?.documentoIdentidadFrenteNombre ||
                      selectedAthleteFicha.archivos?.documentoIdentidadNombre,
                    dataUrl:
                      selectedAthleteFicha.archivos?.documentoIdentidadFrenteDataUrl ||
                      selectedAthleteFicha.archivos?.documentoIdentidadDataUrl,
                    fallback: "Sin archivo"
                  },
                  {
                    title: "Documento (Reverso)",
                    name: selectedAthleteFicha.archivos?.documentoIdentidadReversoNombre,
                    dataUrl: selectedAthleteFicha.archivos?.documentoIdentidadReversoDataUrl,
                    fallback: "Sin archivo"
                  },
                  {
                    title: "Foto Tipo Documento",
                    name: selectedAthleteFicha.archivos?.fotoTipoDocumentoNombre,
                    dataUrl: selectedAthleteFicha.archivos?.fotoTipoDocumentoDataUrl,
                    fallback: "Sin foto"
                  },
                  {
                    title: "Carta de Libertad",
                    name: selectedAthleteFicha.archivos?.cartaLibertadNombre,
                    dataUrl: selectedAthleteFicha.archivos?.cartaLibertadDataUrl,
                    fallback: "No aplica"
                  }
                ].map((docItem) => (
                  <div
                    key={docItem.title}
                    className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2"
                  >
                    <p className="font-semibold text-slate-900 dark:text-zinc-100">{docItem.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                      {docItem.name || docItem.fallback}
                    </p>
                    {docItem.dataUrl && (
                      <div className="space-y-1.5">
                        {docItem.dataUrl.startsWith("data:image/") && (
                          <img
                            src={docItem.dataUrl}
                            alt={docItem.title}
                            className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-zinc-700"
                          />
                        )}
                        <a
                          href={docItem.dataUrl}
                          download={docItem.name || docItem.title}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Ver / Descargar →
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const target = selectedAthleteFicha;
                  setSelectedAthleteFicha(null);
                  handleOpenEditModal(target);
                }}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Editar Datos
              </Button>
              <Button type="button" onClick={() => setSelectedAthleteFicha(null)}>
                Cerrar Ficha
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
