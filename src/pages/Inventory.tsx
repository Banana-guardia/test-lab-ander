import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/store/authStore";
import {
  db,
  mergeInventoryData,
  saveInventoryItem,
  deleteInventoryItem
} from "@/lib/firebase";
import { 
  collection, 
  onSnapshot
} from "firebase/firestore";
import { formatCurrency } from "@/lib/utils";
import { initialInventory } from "@/lib/seedData";
import {
  subscribeCoachSessions,
  saveCoachSessionRecord,
  type CoachSessionRecord,
  type SessionInventoryUsageItem
} from "@/lib/coachSessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Package, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  AlertTriangle, 
  Check, 
  DollarSign, 
  Boxes, 
  MapPin, 
  Layers, 
  RotateCcw, 
  X, 
  Minus,
  ClipboardList,
  CheckCircle2,
  PackageCheck,
  Clock,
  Calendar,
  Users,
  Eye,
  ArrowRight,
  ShieldCheck
} from "lucide-react";

export type ItemCondition = "Excelente" | "Bueno" | "Desgastado" | "Requiere Reemplazo";

export type ItemCategory = 
  | "Balones" 
  | "Indumentaria & Uniformes" 
  | "Equipamiento de Cancha" 
  | "Entrenamiento Físico" 
  | "Médico & Arbitraje" 
  | "Otros";

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  minQuantity: number;
  condition: ItemCondition;
  location: string;
  unitValue: number;
  notes?: string;
  assignedTo?: string;
  lastUpdated?: any;
  createdAt?: any;
}

const CATEGORIES: ItemCategory[] = [
  "Balones",
  "Indumentaria & Uniformes",
  "Equipamiento de Cancha",
  "Entrenamiento Físico",
  "Médico & Arbitraje",
  "Otros"
];

const CONDITIONS: ItemCondition[] = [
  "Excelente",
  "Bueno",
  "Desgastado",
  "Requiere Reemplazo"
];

const LOCATIONS = [
  "Sede Norte",
  "Sede Central",
  "Bodega Coliseo",
  "Bodega Central",
  "Enfermería Sede Central",
  "En Préstamo"
];

export default function Inventory() {
  const { user, role } = useAuthStore();
  const isCoach = role === "coach";
  const isAdmin = !isCoach;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("Todas");
  const [conditionFilter, setConditionFilter] = useState<string>("Todos");
  const [onlyLowStock, setOnlyLowStock] = useState<boolean>(false);

  // Vista activa: para profes inicia directamente en "sessions" (Reportes de Clase)
  const [activeView, setActiveView] = useState<"catalog" | "sessions">(isCoach ? "sessions" : "catalog");
  const [coachSessions, setCoachSessions] = useState<CoachSessionRecord[]>([]);
  const [sessionFilterTerm, setSessionFilterTerm] = useState("");
  const [sessionStatusFilter, setSessionStatusFilter] = useState<"all" | "missing" | "complete">("all");
  const [selectedSessionModal, setSelectedSessionModal] = useState<CoachSessionRecord | null>(null);

  // Modal para que el profesor reporte el material usado en su clase
  const [isClassReportModalOpen, setIsClassReportModalOpen] = useState(false);
  const [reportGroup, setReportGroup] = useState<string>("Selección A");
  const [reportDate, setReportDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reportLocation, setReportLocation] = useState<string>("Sede Central");
  const [reportItems, setReportItems] = useState<SessionInventoryUsageItem[]>([]);
  const [reportNotes, setReportNotes] = useState<string>("");
  const [isSavingReport, setIsSavingReport] = useState(false);

  // Estados de Modales Administrativos
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [quickAdjustingId, setQuickAdjustingId] = useState<string | null>(null);

  // Notificación Toast
  const [toast, setToast] = useState<{ id: number; message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ id: Date.now(), message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Métodos del Modal de Reporte de Clase para el Profesor
  const handleOpenClassReportModal = (preselectedItem?: InventoryItem) => {
    let initialList: SessionInventoryUsageItem[] = [];
    if (preselectedItem) {
      initialList = [
        {
          id: preselectedItem.id,
          name: preselectedItem.name,
          category: preselectedItem.category,
          location: preselectedItem.location,
          initialStock: preselectedItem.quantity,
          usedQuantity: Math.min(preselectedItem.quantity || 10, 10),
          returnedQuantity: Math.min(preselectedItem.quantity || 10, 10),
          difference: 0,
          conditionAtEnd: "Bueno",
          status: "complete",
          notes: ""
        }
      ];
    }
    setReportItems(initialList);
    setReportNotes("");
    setIsClassReportModalOpen(true);
  };

  const handleAddReportItem = (item: InventoryItem, defaultQty = 10) => {
    setReportItems((prev) => {
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

  const handleUpdateReportItemQty = (
    itemId: string,
    _field: "usedQuantity" | "returnedQuantity",
    deltaOrVal: number,
    isAbsolute = false
  ) => {
    setReportItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const currentVal = it.usedQuantity;
        const nextVal = Math.max(0, isAbsolute ? deltaOrVal : currentVal + deltaOrVal);
        return {
          ...it,
          usedQuantity: nextVal,
          returnedQuantity: nextVal,
          difference: 0,
          status: "complete"
        };
      })
    );
  };

  const handleRemoveReportItem = (itemId: string) => {
    setReportItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleSaveClassReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reportItems.length === 0) {
      showToast("Debes seleccionar al menos un material utilizado en la clase", "error");
      return;
    }

    setIsSavingReport(true);
    try {
      const coachName = user?.displayName || user?.email?.split("@")[0] || "Profesor SOUL";
      await saveCoachSessionRecord({
        group: reportGroup,
        date: reportDate,
        startTime: "16:00",
        endTime: "17:30",
        durationHours: 1.5,
        location: reportLocation,
        coachId: user?.uid || "coach-soul",
        coachName,
        coachEmail: user?.email || "",
        inventoryUsage: reportItems,
        courtNotes: reportNotes.trim()
      });

      showToast(`Reporte de material para ${reportGroup} guardado exitosamente.`);
      setIsClassReportModalOpen(false);
      setActiveView("sessions");
    } catch (err) {
      console.error("Error guardando reporte de material:", err);
      showToast("No se pudo registrar el reporte de material", "error");
    } finally {
      setIsSavingReport(false);
    }
  };

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    category: ItemCategory;
    quantity: number;
    minQuantity: number;
    condition: ItemCondition;
    location: string;
    unitValue: number;
    notes: string;
    assignedTo: string;
  }>({
    name: "",
    category: "Balones",
    quantity: 1,
    minQuantity: 2,
    condition: "Excelente",
    location: "Sede Norte",
    unitValue: 0,
    notes: "",
    assignedTo: ""
  });

  // 1. Escuchar la colección 'inventory' de Firestore + datos locales y semilla en tiempo real
  useEffect(() => {
    let rawFirestoreInventory: any[] = [];

    const syncInventory = () => {
      const merged = mergeInventoryData(rawFirestoreInventory);
      const loaded: InventoryItem[] = merged.map((data: any) => ({
        id: data.id,
        name: data.name || "Artículo sin nombre",
        category: (data.category as ItemCategory) || "Otros",
        quantity: Number(data.quantity) || 0,
        minQuantity: Number(data.minQuantity) || 2,
        condition: (data.condition as ItemCondition) || "Bueno",
        location: data.location || "Sede Norte",
        unitValue: Number(data.unitValue) || 0,
        notes: data.notes || "",
        assignedTo: data.assignedTo || "",
        lastUpdated: data.lastUpdated,
        createdAt: data.createdAt
      }));

      loaded.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      setItems(loaded);
      setLoading(false);
    };

    syncInventory();

    const unsubscribe = onSnapshot(
      collection(db, "inventory"),
      (snapshot) => {
        rawFirestoreInventory = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        syncInventory();
      },
      () => {
        syncInventory();
      }
    );

    const handleLocalUpdate = () => syncInventory();
    window.addEventListener("soul-inventory-updated", handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener("soul-inventory-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
    };
  }, []);

  // Suscripción a sesiones de cancha y uso de material en entrenos
  useEffect(() => {
    const unsub = subscribeCoachSessions((sessions) => {
      setCoachSessions(sessions);
    });
    return () => unsub();
  }, []);

  const sessionInventoryLogs = useMemo(() => {
    return coachSessions.filter(
      (s) => s.inventoryUsage && s.inventoryUsage.length > 0
    );
  }, [coachSessions]);

  const filteredSessionLogs = useMemo(() => {
    return sessionInventoryLogs.filter((s) => {
      const coach = s.coachName || "";
      const group = s.group || "";
      const loc = s.location || "";
      const matchesSearch =
        coach.toLowerCase().includes(sessionFilterTerm.toLowerCase()) ||
        group.toLowerCase().includes(sessionFilterTerm.toLowerCase()) ||
        loc.toLowerCase().includes(sessionFilterTerm.toLowerCase()) ||
        s.date.includes(sessionFilterTerm) ||
        (s.inventoryUsage &&
          s.inventoryUsage.some((u) =>
            u.name.toLowerCase().includes(sessionFilterTerm.toLowerCase())
          ));

      const hasDiscrepancy = s.inventoryUsage?.some(
        (u) => (u.returnedQuantity || 0) < (u.usedQuantity || 0)
      );

      if (sessionStatusFilter === "missing" && !hasDiscrepancy) return false;
      if (sessionStatusFilter === "complete" && hasDiscrepancy) return false;
      return matchesSearch;
    });
  }, [sessionInventoryLogs, sessionFilterTerm, sessionStatusFilter]);

  const sessionStats = useMemo(() => {
    let totalItemsMobilized = 0;
    let totalItemsReturned = 0;
    let sessionsWithMissing = 0;

    sessionInventoryLogs.forEach((s) => {
      let sessionHasMissing = false;
      s.inventoryUsage?.forEach((u) => {
        totalItemsMobilized += Number(u.usedQuantity) || 0;
        totalItemsReturned += Number(u.returnedQuantity) || 0;
        if ((Number(u.returnedQuantity) || 0) < (Number(u.usedQuantity) || 0)) {
          sessionHasMissing = true;
        }
      });
      if (sessionHasMissing) sessionsWithMissing++;
    });

    return {
      totalSessions: sessionInventoryLogs.length,
      totalItemsMobilized,
      totalItemsReturned,
      sessionsWithMissing,
      cleanRate:
        sessionInventoryLogs.length > 0
          ? Math.round(
              ((sessionInventoryLogs.length - sessionsWithMissing) /
                sessionInventoryLogs.length) *
                100
            )
          : 100
    };
  }, [sessionInventoryLogs]);

  // 2. Cálculos y Métricas en Vivo
  const stats = useMemo(() => {
    let totalUnits = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let replacementCount = 0;

    items.forEach((item) => {
      totalUnits += item.quantity;
      totalValue += item.quantity * item.unitValue;
      if (item.quantity <= item.minQuantity) {
        lowStockCount++;
      }
      if (item.condition === "Requiere Reemplazo") {
        replacementCount++;
      }
    });

    return {
      totalItems: items.length,
      totalUnits,
      totalValue,
      lowStockCount,
      replacementCount
    };
  }, [items]);

  // 3. Filtrado de Artículos
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory = categoryFilter === "Todas" || item.category === categoryFilter;
      const matchesCondition = conditionFilter === "Todos" || item.condition === conditionFilter;
      const matchesStock = !onlyLowStock || item.quantity <= item.minQuantity;

      return matchesSearch && matchesCategory && matchesCondition && matchesStock;
    });
  }, [items, searchTerm, categoryFilter, conditionFilter, onlyLowStock]);

  // Abrir Modal para Crear
  const handleOpenCreateModal = () => {
    if (isCoach) {
      showToast("Los profesores solo pueden reportar material usado en sus clases.", "info");
      return;
    }
    setEditingItem(null);
    setFormData({
      name: "",
      category: "Balones",
      quantity: 1,
      minQuantity: 2,
      condition: "Excelente",
      location: "Sede Norte",
      unitValue: 0,
      notes: "",
      assignedTo: ""
    });
    setIsModalOpen(true);
  };

  // Abrir Modal para Editar
  const handleOpenEditModal = (item: InventoryItem) => {
    if (isCoach) {
      showToast("Los profesores solo pueden reportar material usado en sus clases.", "info");
      return;
    }
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      condition: item.condition,
      location: item.location,
      unitValue: item.unitValue,
      notes: item.notes || "",
      assignedTo: item.assignedTo || ""
    });
    setIsModalOpen(true);
  };

  // Guardar (Crear o Actualizar) en Firestore
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCoach) {
      showToast("Acción no permitida para el rol de profesor", "error");
      return;
    }
    if (!formData.name.trim()) {
      showToast("El nombre del artículo es obligatorio", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        quantity: Number(formData.quantity) || 0,
        minQuantity: Number(formData.minQuantity) || 1,
        condition: formData.condition,
        location: formData.location,
        unitValue: Number(formData.unitValue) || 0,
        notes: formData.notes.trim(),
        assignedTo: formData.assignedTo.trim()
      };

      await saveInventoryItem(payload, editingItem);

      if (editingItem) {
        showToast(`"${formData.name}" actualizado correctamente en la base de datos.`);
      } else {
        showToast(`"${formData.name}" registrado con éxito en el inventario.`);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error guardando artículo:", err);
      showToast("Error al guardar en la base de datos", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ajuste rápido de Stock (+1 / -1) directo en la tabla
  const handleQuickAdjustStock = async (item: InventoryItem, delta: number) => {
    if (isCoach) {
      showToast("Solo los administradores pueden ajustar el stock general.", "error");
      return;
    }
    const newQty = item.quantity + delta;
    if (newQty < 0) return;

    setQuickAdjustingId(item.id);
    try {
      await saveInventoryItem(
        {
          ...item,
          quantity: newQty
        },
        item
      );
      showToast(`Stock de "${item.name}" ajustado a ${newQty} unidades.`);
    } catch (err) {
      console.error("Error ajustando stock:", err);
      showToast("No se pudo actualizar el stock", "error");
    } finally {
      setQuickAdjustingId(null);
    }
  };

  // Confirmar y Ejecutar Eliminación
  const handleExecuteDelete = async () => {
    if (isCoach || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteInventoryItem({ id: deleteTarget.id, name: deleteTarget.name });
      showToast(`"${deleteTarget.name}" eliminado del inventario.`);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Error eliminando artículo:", err);
      showToast("Error al eliminar el artículo", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Si el inventario está vacío, sembrar catálogo inicial de muestra
  const handleSeedDefaultInventory = async () => {
    if (isCoach) return;
    setIsSubmitting(true);
    try {
      localStorage.removeItem("soul_deleted_inventory");
      for (const item of initialInventory) {
        await saveInventoryItem(item);
      }
      showToast("Inventario inicial de voleibol cargado exitosamente.");
    } catch (err) {
      console.error("Error cargando inventario de muestra:", err);
      showToast("Error al cargar inventario de muestra", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Badge de Condición
  const getConditionBadge = (condition: ItemCondition) => {
    switch (condition) {
      case "Excelente":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[11px] font-semibold">● Excelente</Badge>;
      case "Bueno":
        return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-[11px] font-semibold">● Bueno</Badge>;
      case "Desgastado":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[11px] font-semibold">● Desgastado</Badge>;
      case "Requiere Reemplazo":
        return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[11px] font-semibold">⚠️ Reemplazo</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500 max-w-7xl mx-auto pb-12">
      
      {/* Toast Notification Flotante */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5 text-sm font-medium ${
          toast.type === "error" 
            ? "bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-500/50 text-rose-700 dark:text-rose-200" 
            : toast.type === "info" 
            ? "bg-indigo-50 dark:bg-indigo-950/90 border-indigo-200 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-200"
            : "bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-200"
        }`}>
          {toast.type === "error" ? <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" /> : <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 text-xs px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-500/20 font-semibold tracking-wide flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5" /> {isCoach ? "MATERIALES DE CANCHA" : "GESTIÓN DE ACTIVOS"}
            </span>
            <span className="text-slate-400 dark:text-zinc-500 text-xs flex items-center gap-1 font-mono">
              {isCoach ? "Modo Profesor" : "Firestore Sync"}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100 flex items-center gap-2.5">
            {isCoach ? "Reporte de Material para Clases" : "Inventario Deportivo"}
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1">
            {isCoach
              ? "Reporta únicamente los balones y materiales utilizados en tus entrenamientos y confirma lo devuelto al finalizar la jornada."
              : "Monitorea balones, indumentaria, redes, material de entrenamiento y equipamiento físico del club."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isCoach ? (
            <Button
              onClick={() => handleOpenClassReportModal()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 text-xs sm:text-sm rounded-xl gap-2 shadow-sm"
            >
              <ClipboardList className="w-4 h-4" />
              <span>Reportar Material de Clase</span>
            </Button>
          ) : (
            <>
              {items.length === 0 && !loading && (
                <Button
                  variant="outline"
                  onClick={handleSeedDefaultInventory}
                  disabled={isSubmitting}
                  className="border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-xs"
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Cargar Muestra Oficial
                </Button>
              )}

              <Button
                onClick={handleOpenCreateModal}
                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold px-5 shadow-sm"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Nuevo Artículo
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pestañas de Vista */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
        {isCoach ? (
          <>
            <button
              type="button"
              onClick={() => setActiveView("sessions")}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
                activeView === "sessions"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Mis Reportes de Clase ({sessionInventoryLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("catalog")}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
                activeView === "catalog"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span>Consultar Stock Disponible ({items.length})</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setActiveView("catalog")}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
                activeView === "catalog"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span>Artículos & Stock General ({items.length})</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tabular-nums ${
                activeView === "catalog" ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300"
              }`}>
                {items.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("sessions")}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
                activeView === "sessions"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Control de Entrenos & Jornadas ({sessionInventoryLogs.length})</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tabular-nums ${
                activeView === "sessions"
                  ? "bg-white/20 text-white"
                  : "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
              }`}>
                {sessionInventoryLogs.length}
              </span>
            </button>
          </>
        )}
      </div>

      {/* VISTA 1: CATÁLOGO Y STOCK GENERAL */}
      {activeView === "catalog" && (
        <div className="space-y-6">
          {/* Tarjetas de Métricas en Vivo */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${isCoach ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-6`}>
        
        {/* Total de Unidades */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Unidades en Stock</span>
            <div className="p-2.5 bg-slate-100 dark:bg-zinc-800 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{stats.totalUnits}</div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">
            Distribuido en {stats.totalItems} artículos únicos
          </p>
        </div>

        {/* Stock Crítico / Bajo */}
        <div className={`p-5 rounded-xl border shadow-sm transition-all ${
          stats.lowStockCount > 0 
            ? "bg-rose-50/50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20" 
            : "bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Alertas de Stock</span>
            <div className={`p-2.5 rounded-lg ${stats.lowStockCount > 0 ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${stats.lowStockCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-zinc-100"}`}>
            {stats.lowStockCount}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {stats.lowStockCount > 0 ? "Artículos en nivel crítico de reposición" : "Niveles de stock estables"}
          </p>
        </div>

        {/* Valor Total del Inventario (Solo Administradores) */}
        {!isCoach && (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Valoración Total</span>
              <div className="p-2.5 bg-slate-100 dark:bg-zinc-800 rounded-lg text-emerald-600 dark:text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(stats.totalValue)}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Patrimonio material estimado del club
            </p>
          </div>
        )}

        {/* Requiere Reemplazo */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Mantenimiento</span>
            <div className="p-2.5 bg-slate-100 dark:bg-zinc-800 rounded-lg text-amber-600 dark:text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{stats.replacementCount}</div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Material deteriorado o para reposición
          </p>
        </div>

      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
        
        {/* Buscador de texto */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3" />
          <Input
            placeholder="Buscar por artículo, ubicación o notas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 placeholder-slate-400 text-xs h-10 rounded-lg"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtro por Categoría */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por categoría"
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs rounded-lg px-3 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="Todas">Todas las Categorías</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Filtro por Condición */}
          <select
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value)}
            aria-label="Filtrar por condición física"
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs rounded-lg px-3 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="Todos">Todos los Estados</option>
            {CONDITIONS.map((cond) => (
              <option key={cond} value={cond}>{cond}</option>
            ))}
          </select>

          {/* Toggle de Stock Bajo */}
          <Button
            variant={onlyLowStock ? "default" : "outline"}
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            size="sm"
            className={`h-10 text-xs rounded-lg ${
              onlyLowStock 
                ? "bg-rose-600 hover:bg-rose-500 text-white font-semibold" 
                : "border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 mr-1 ${onlyLowStock ? "text-white" : "text-rose-500"}`} />
            Solo Stock Crítico
          </Button>
        </div>

      </div>

      {/* Tabla de Inventario */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-zinc-800/50">
            <TableRow className="border-b border-slate-200 dark:border-zinc-800 hover:bg-transparent">
              <TableHead className="text-slate-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider py-3.5">Artículo & Notas</TableHead>
              <TableHead className="text-slate-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">Categoría</TableHead>
              <TableHead className="text-slate-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider text-center">
                {isCoach ? "Stock Disponible" : "Stock / Ajuste Rápido"}
              </TableHead>
              <TableHead className="text-slate-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider text-center">Condición</TableHead>
              <TableHead className="text-slate-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">Ubicación</TableHead>
              {!isCoach && (
                <TableHead className="text-slate-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider text-right">Valor Unitario / Total</TableHead>
              )}
              <TableHead className="text-slate-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider text-center">
                {isCoach ? "Reporte en Cancha" : "Acciones"}
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={isCoach ? 6 : 7} className="text-center py-16 text-slate-500 dark:text-zinc-400 text-sm">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Boxes className="w-8 h-8 animate-spin text-indigo-500" />
                    <span>Cargando inventario desde Firestore...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isCoach ? 6 : 7} className="text-center py-16 text-slate-500 dark:text-zinc-400 text-sm">
                  <div className="max-w-md mx-auto space-y-3">
                    <Package className="w-10 h-10 mx-auto text-slate-400 dark:text-zinc-600" />
                    <h3 className="text-slate-900 dark:text-zinc-100 font-bold">No se encontraron artículos</h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      {searchTerm || categoryFilter !== "Todas" || onlyLowStock
                        ? "Ningún elemento coincide con los filtros aplicados. Intenta restablecer los filtros."
                        : "El inventario se encuentra actualmente vacío. Agrega tu primer artículo o carga el catálogo de muestra."}
                    </p>
                    {items.length === 0 && !isCoach && (
                      <Button
                        size="sm"
                        onClick={handleSeedDefaultInventory}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs mt-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Cargar Inventario Inicial
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const isLowStock = item.quantity <= item.minQuantity;
                const isZeroStock = item.quantity === 0;

                return (
                  <TableRow 
                    key={item.id} 
                    className="border-b border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* Nombre y notas */}
                    <TableCell className="py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-zinc-100 text-sm flex items-center gap-2">
                        {item.name}
                        {isLowStock && (
                          <span className="text-[10px] bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 px-1.5 py-0.5 rounded font-mono font-semibold">
                            ¡Stock Crítico!
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-slate-500 dark:text-zinc-400 text-xs mt-0.5 line-clamp-1">{item.notes}</p>
                      )}
                      {item.assignedTo && (
                        <span className="text-[11px] text-indigo-600 dark:text-indigo-400 block mt-0.5 font-medium">
                          Asignado: {item.assignedTo}
                        </span>
                      )}
                    </TableCell>

                    {/* Categoría */}
                    <TableCell>
                      <span className="text-xs font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-2.5 py-1 rounded-md">
                        {item.category}
                      </span>
                    </TableCell>

                    {/* Stock y Ajuste Rápido */}
                    <TableCell className="text-center">
                      {isCoach ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700">
                          <span className={`font-bold text-base tabular-nums ${isZeroStock ? "text-rose-600 dark:text-rose-400" : isLowStock ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-zinc-100"}`}>
                            {item.quantity}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">uds</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 px-2 py-1 rounded-lg tabular-nums">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjustStock(item, -1)}
                            disabled={item.quantity <= 0 || quickAdjustingId === item.id}
                            className="w-6 h-6 rounded-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                            title="Disminuir -1 unidad en Firestore"
                          >
                            <Minus className="w-3 h-3" />
                          </button>

                          <div className="min-w-[42px] text-center">
                            <span className={`font-bold text-base ${isZeroStock ? "text-rose-600 dark:text-rose-400" : isLowStock ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-zinc-100"}`}>
                              {item.quantity}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-500 block leading-none">
                              Mín: {item.minQuantity}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleQuickAdjustStock(item, 1)}
                            disabled={quickAdjustingId === item.id}
                            className="w-6 h-6 rounded-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 text-slate-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center justify-center transition-colors text-xs font-bold"
                            title="Aumentar +1 unidad en Firestore"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </TableCell>

                    {/* Condición */}
                    <TableCell className="text-center">
                      {getConditionBadge(item.condition)}
                    </TableCell>

                    {/* Ubicación */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-zinc-300">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                        <span>{item.location}</span>
                      </div>
                    </TableCell>

                    {/* Valor Unitario & Total (Solo Administrador) */}
                    {!isCoach && (
                      <TableCell className="text-right tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-zinc-100 text-xs">
                          {formatCurrency(item.unitValue)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Total: {formatCurrency(item.quantity * item.unitValue)}
                        </div>
                      </TableCell>
                    )}

                    {/* Acciones */}
                    <TableCell className="text-center">
                      {isCoach ? (
                        <Button
                          size="sm"
                          onClick={() => handleOpenClassReportModal(item)}
                          className="h-8 text-xs font-semibold bg-indigo-50 dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-zinc-700 gap-1.5 rounded-lg border border-indigo-200/60 dark:border-zinc-700 shadow-none"
                          title="Reportar uso de este material en mi clase"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span>Reportar en Clase</span>
                        </Button>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditModal(item)}
                            className="h-8 w-8 text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg"
                            title="Editar artículo"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(item)}
                            className="h-8 w-8 text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg"
                            title="Eliminar artículo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )}

  {/* VISTA 2: CONTROL DE ENTRENOS & JORNADAS */}
  {activeView === "sessions" && (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Métricas de Uso de Material en Cancha */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Total Material Usado</span>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {sessionStats.totalItemsMobilized}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Unidades movilizadas en entrenamientos
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Material Retornado</span>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
            {sessionStats.totalItemsReturned}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Unidades devueltas al cierre de jornada
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Tasa de Devolución</span>
            <div className="p-2.5 bg-purple-50 dark:bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-purple-600 dark:text-purple-400">
            {sessionStats.cleanRate}%
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Jornadas cerradas sin faltantes
          </p>
        </div>

        <div className={`p-5 rounded-xl border shadow-sm ${
          sessionStats.sessionsWithMissing > 0
            ? "bg-rose-50/50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20"
            : "bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Sesiones con Faltantes</span>
            <div className={`p-2.5 rounded-lg ${
              sessionStats.sessionsWithMissing > 0
                ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${
            sessionStats.sessionsWithMissing > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-zinc-100"
          }`}>
            {sessionStats.sessionsWithMissing}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {sessionStats.sessionsWithMissing > 0
              ? "Entrenamientos con material pendiente o dañado"
              : "Todos los materiales en orden"}
          </p>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros de Sesiones */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <Input
            placeholder="Buscar por profesor, grupo, sede o nombre de material..."
            value={sessionFilterTerm}
            onChange={(e) => setSessionFilterTerm(e.target.value)}
            className="pl-10 text-xs h-10 rounded-lg bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
          />
          {sessionFilterTerm && (
            <button
              type="button"
              onClick={() => setSessionFilterTerm("")}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant={sessionStatusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSessionStatusFilter("all")}
            className={`h-10 text-xs rounded-lg ${
              sessionStatusFilter === "all" ? "bg-indigo-600 text-white" : ""
            }`}
          >
            Todas ({sessionInventoryLogs.length})
          </Button>
          <Button
            type="button"
            variant={sessionStatusFilter === "missing" ? "default" : "outline"}
            size="sm"
            onClick={() => setSessionStatusFilter("missing")}
            className={`h-10 text-xs rounded-lg ${
              sessionStatusFilter === "missing"
                ? "bg-rose-600 text-white"
                : "border-slate-200 dark:border-zinc-800 text-rose-600 dark:text-rose-400"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Con Faltantes ({sessionStats.sessionsWithMissing})
          </Button>
          <Button
            type="button"
            variant={sessionStatusFilter === "complete" ? "default" : "outline"}
            size="sm"
            onClick={() => setSessionStatusFilter("complete")}
            className={`h-10 text-xs rounded-lg ${
              sessionStatusFilter === "complete" ? "bg-emerald-600 text-white" : ""
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            100% Retornados ({sessionInventoryLogs.length - sessionStats.sessionsWithMissing})
          </Button>
        </div>
      </div>

      {/* Lista de Registros de Inventario en Sesiones */}
      {filteredSessionLogs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-12 text-center shadow-sm">
          <Boxes className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900 dark:text-zinc-100 text-sm">
            No hay registros de inventario de cancha
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
            {sessionFilterTerm || sessionStatusFilter !== "all"
              ? "No se encontraron entrenamientos con los filtros seleccionados."
              : "Cuando los profesores pasen lista y registren el material usado y devuelto en cancha, cada planilla se registrará aquí automáticamente."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSessionLogs.map((session) => {
            const itemsList = session.inventoryUsage || [];
            const totalUsed = itemsList.reduce((acc, it) => acc + (it.usedQuantity || 0), 0);
            const totalReturned = itemsList.reduce((acc, it) => acc + (it.returnedQuantity || 0), 0);
            const hasMissing = itemsList.some((it) => (it.returnedQuantity || 0) < (it.usedQuantity || 0));

            return (
              <div
                key={session.id}
                className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 sm:p-5 shadow-sm transition-all ${
                  hasMissing
                    ? "border-rose-300 dark:border-rose-900/60"
                    : "border-slate-200/80 dark:border-zinc-800"
                }`}
              >
                {/* Encabezado de la Sesión */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                      hasMissing
                        ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                        : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    }`}>
                      <Boxes className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {session.group}
                        </span>
                        <span className="text-slate-300 dark:text-zinc-700">•</span>
                        <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium">
                          {session.coachName || "Profesor SOUL"}
                        </span>
                        {session.roleInSession === "asistente" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold">
                            Asistente
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {session.date}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {session.startTime || "16:00"} - {session.endTime || "17:30"}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {session.location || "Sede Norte"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    {hasMissing ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 flex items-center gap-1.5 animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Presenta Faltantes ({totalReturned}/{totalUsed})</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>100% Retornado ({totalReturned}/{totalUsed})</span>
                      </span>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSessionModal(session)}
                      className="h-8 text-xs rounded-lg gap-1 border-slate-200 dark:border-zinc-700"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Planilla</span>
                    </Button>
                  </div>
                </div>

                {/* Tabla de Artículos Usados */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-zinc-800 text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                        <th className="pb-2">Material / Artículo</th>
                        <th className="pb-2 text-center">Usado en Clase</th>
                        <th className="pb-2">Observaciones / Novedad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                      {itemsList.map((item, idx) => {
                        const uQty = item.usedQuantity || 0;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                            <td className="py-2.5 font-semibold text-slate-900 dark:text-zinc-100">
                              <div className="flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {item.category && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                                    {item.category}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 text-center font-bold text-slate-800 dark:text-zinc-200 tabular-nums">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                                {uQty} {uQty === 1 ? "unidad" : "unidades"}
                              </span>
                            </td>
                            <td className="py-2.5 text-slate-500 dark:text-zinc-400 italic">
                              {item.notes || "Sin novedades particulares"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  )}

  {/* MODAL DETALLE DE PLANILLA DE SESIÓN */}
  {selectedSessionModal && (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Planilla Oficial de Entrenamiento
              </h3>
              <p className="text-[11px] text-slate-500">
                {selectedSessionModal.group} • {selectedSessionModal.date}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedSessionModal(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Datos generales */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800">
          <div>
            <span className="text-slate-500 block text-[10px]">PROFESOR</span>
            <strong className="text-slate-900 dark:text-white">{selectedSessionModal.coachName}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">SEDE</span>
            <strong className="text-slate-900 dark:text-white">{selectedSessionModal.location || "Sede Norte"}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">HORARIO</span>
            <strong className="text-slate-900 dark:text-white">{selectedSessionModal.startTime} - {selectedSessionModal.endTime}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">ASISTENCIA</span>
            <strong className="text-emerald-600 dark:text-emerald-400">{selectedSessionModal.totalPresentes} presentes</strong>
          </div>
        </div>

        {/* Inventario Utilizado */}
        {selectedSessionModal.inventoryUsage && selectedSessionModal.inventoryUsage.length > 0 && (
          <div className="space-y-2 text-xs">
            <label className="font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-indigo-600" />
              <span>Materiales Registrados en la Jornada:</span>
            </label>
            <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800 bg-slate-50/50 dark:bg-zinc-900">
              {selectedSessionModal.inventoryUsage.map((inv, idx) => {
                const u = inv.usedQuantity || 0;
                const r = inv.returnedQuantity || 0;
                const isOk = r >= u;
                return (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{inv.name}</div>
                      {inv.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">{inv.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[11px]">
                        Usado: <strong>{u}</strong> | Quedó: <strong className={isOk ? "text-emerald-600" : "text-rose-600"}>{r}</strong>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isOk ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}>
                        {isOk ? "Completo" : `Faltan ${u - r}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <Button
            type="button"
            onClick={() => setSelectedSessionModal(null)}
            className="text-xs h-8 rounded-lg"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )}

      {/* =========================================================================
          MODAL DE REPORTE DE MATERIAL USADO EN CLASE (EXCLUSIVO PROFESORES)
          ========================================================================= */}
      {isClassReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-5">
            
            {/* Header del Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                    Reportar Material Utilizado en Clase
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Registra únicamente los materiales e insumos que se usaron en el entrenamiento de esta clase.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClassReportModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClassReport} className="space-y-4 text-xs">
              
              {/* Metadatos de la Sesión: Grupo, Fecha, Sede */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 dark:bg-zinc-800/40 p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800">
                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1">
                    Grupo / Equipo *
                  </label>
                  <select
                    value={reportGroup}
                    onChange={(e) => setReportGroup(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-xs rounded-lg px-2.5 h-9 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="Selección A">Selección A</option>
                    <option value="Selección B">Selección B</option>
                    <option value="Formativo Mañana">Formativo Mañana</option>
                    <option value="Formativo Tarde">Formativo Tarde</option>
                    <option value="Semillero Infantil">Semillero Infantil</option>
                    <option value="Mayores Femenino">Mayores Femenino</option>
                    <option value="Mayores Masculino">Mayores Masculino</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1">
                    Fecha de la Clase *
                  </label>
                  <Input
                    type="date"
                    required
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="h-9 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-xs rounded-lg"
                  />
                </div>

                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1">
                    Sede / Cancha
                  </label>
                  <select
                    value={reportLocation}
                    onChange={(e) => setReportLocation(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-xs rounded-lg px-2.5 h-9 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selector Rápido de Materiales del Catálogo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-indigo-600" />
                    <span>Seleccionar Materiales a Utilizar:</span>
                  </label>
                </div>

                {/* Chips rápidos de balones y equipamiento común */}
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 bg-slate-50 dark:bg-zinc-800/30 rounded-lg border border-slate-200/80 dark:border-zinc-800">
                  {items.map((it) => {
                    const isAdded = reportItems.some((r) => r.id === it.id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => handleAddReportItem(it, it.category === "Balones" ? 10 : 4)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                          isAdded
                            ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 font-bold"
                            : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-indigo-300"
                        }`}
                      >
                        {isAdded ? <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> : <Plus className="w-3 h-3 text-slate-400" />}
                        <span>{it.name}</span>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">({it.quantity})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lista Detallada de Materiales en el Reporte */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wider flex items-center justify-between">
                  <span>Materiales en este Reporte ({reportItems.length})</span>
                  <span className="text-[10px] font-normal normal-case text-slate-400">
                    Ajusta la cantidad de cada material utilizado en el entrenamiento
                  </span>
                </h4>

                {reportItems.length === 0 ? (
                  <div className="border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl p-8 text-center bg-slate-50/50 dark:bg-zinc-800/20">
                    <Boxes className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-zinc-300 text-xs">
                      Ningún material seleccionado aún
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Haz clic en los botones de arriba o desde la tabla para agregar balones, conos o materiales a tu reporte.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {reportItems.map((rep) => {
                      return (
                        <div
                          key={rep.id}
                          className="p-3 rounded-xl border transition-all bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800/60">
                            <div>
                              <div className="font-bold text-slate-900 dark:text-zinc-100 text-xs flex items-center gap-2">
                                <span>{rep.name}</span>
                                {rep.category && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 font-normal">
                                    {rep.category}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Stock disponible en club: {rep.initialStock || 0} unidades
                              </span>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                {rep.usedQuantity} uds en uso
                              </span>

                              <button
                                type="button"
                                onClick={() => handleRemoveReportItem(rep.id)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Quitar de este reporte"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Controles de Cantidad Usada */}
                          <div className="pt-2.5">
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-800/50 p-2 rounded-lg border border-slate-100 dark:border-zinc-800">
                              <span className="font-semibold text-slate-700 dark:text-zinc-300 text-[11px]">
                                Usado en el entreno:
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateReportItemQty(rep.id, "usedQuantity", -1)}
                                  disabled={rep.usedQuantity <= 0}
                                  className="w-6 h-6 rounded bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 disabled:opacity-30"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={rep.usedQuantity}
                                  onChange={(e) => handleUpdateReportItemQty(rep.id, "usedQuantity", parseInt(e.target.value, 10) || 0, true)}
                                  className="w-12 h-6 text-center font-bold text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded tabular-nums"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateReportItemQty(rep.id, "usedQuantity", 1)}
                                  className="w-6 h-6 rounded bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Nota específica por artículo */}
                          <div className="mt-2">
                            <input
                              type="text"
                              placeholder="Observación de este material (ej: 1 balón pinchado, quedó guardado en bodega norte...)"
                              value={rep.notes || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReportItems((prev) =>
                                  prev.map((it) => (it.id === rep.id ? { ...it, notes: val } : it))
                                );
                              }}
                              className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Observaciones generales de cancha */}
              <div>
                <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1">
                  Observaciones Generales de la Jornada
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales sobre el uso del material, incidentes en cancha o estado del coliseo..."
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsClassReportModalOpen(false)}
                  className="text-xs text-slate-500 dark:text-zinc-400"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingReport || reportItems.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 text-xs h-10 rounded-lg gap-2 shadow-sm disabled:opacity-50"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>{isSavingReport ? "Guardando Planilla..." : "Guardar Reporte de Clase"}</span>
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE CREACIÓN / EDICIÓN DE ARTÍCULO (SOLO ADMINISTRADORES)
          ========================================================================= */}
      {!isCoach && isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  {editingItem ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">
                    {editingItem ? "Editar Artículo de Inventario" : "Registrar Nuevo Artículo"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Sincronización instantánea con la base de datos de Firebase.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="py-4 space-y-4 text-xs">
              
              {/* Nombre del Artículo */}
              <div>
                <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                  Nombre del Artículo *
                </label>
                <Input
                  required
                  placeholder="Ej: Balón Molten V5M5000, Malla Profesional..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs h-10 rounded-lg"
                />
              </div>

              {/* Categoría y Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as ItemCategory })}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs rounded-lg px-3 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                    Condición Física
                  </label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as ItemCondition })}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs rounded-lg px-3 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {CONDITIONS.map((cond) => (
                      <option key={cond} value={cond}>{cond}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cantidades: Stock Actual y Mínimo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                    Cantidad Actual (Unidades) *
                  </label>
                  <Input
                    type="number"
                    min="0"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 0 })}
                    className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs h-10 rounded-lg tabular-nums"
                  />
                </div>

                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                    Stock Mínimo (Alerta de Reposición) *
                  </label>
                  <Input
                    type="number"
                    min="0"
                    required
                    value={formData.minQuantity}
                    onChange={(e) => setFormData({ ...formData, minQuantity: parseInt(e.target.value, 10) || 0 })}
                    className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs h-10 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              {/* Ubicación y Valor Unitario */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                    Ubicación / Sede
                  </label>
                  <input
                    list="location-options"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Sede Norte, Central..."
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs rounded-lg px-3 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <datalist id="location-options">
                    {LOCATIONS.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                    Valor Unitario Estimado (COP)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ej: 320000"
                    value={formData.unitValue || ""}
                    onChange={(e) => setFormData({ ...formData, unitValue: parseInt(e.target.value, 10) || 0 })}
                    className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs h-10 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              {/* Asignado a */}
              <div>
                <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                  Responsable / Asignado a (Opcional)
                </label>
                <Input
                  placeholder="Ej: Entrenador Juan Pérez / Selección A..."
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs h-10 rounded-lg"
                />
              </div>

              {/* Notas y Observaciones */}
              <div>
                <label className="text-slate-700 dark:text-zinc-300 font-semibold block mb-1.5">
                  Notas u Observaciones
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles sobre marca, estado de inflado, fecha de adquisición..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Botones del Formulario */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold px-6 text-xs h-10 rounded-lg shadow-sm"
                >
                  {isSubmitting 
                    ? "Guardando en Firestore..." 
                    : editingItem 
                    ? "Guardar Cambios" 
                    : "Crear Artículo"}
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE CONFIRMACIÓN DE ELIMINACIÓN (SOLO ADMINISTRADORES)
          ========================================================================= */}
      {!isCoach && deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 text-center">
            
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">¿Eliminar del Inventario?</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">
              Estás a punto de eliminar <strong className="text-slate-900 dark:text-zinc-100">"{deleteTarget.name}"</strong> con <strong className="text-slate-900 dark:text-zinc-100 tabular-nums">{deleteTarget.quantity} unidades</strong> registradas. Esta acción se sincronizará inmediatamente en la base de datos.
            </p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                className="border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-sm"
              >
                {isDeleting ? "Eliminando..." : "Sí, Eliminar Artículo"}
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
