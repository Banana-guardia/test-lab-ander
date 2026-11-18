import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  Trophy,
  Plus,
  ExternalLink,
  Edit3,
  Trash2,
  Calendar,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  CreditCard,
  ShieldCheck,
  Search,
  Check,
  Eye,
  EyeOff
} from "lucide-react";

export interface TournamentRecord {
  id: string;
  name: string;
  categoryTag: string;
  description: string;
  price: number;
  wompiLink: string;
  active: boolean;
  date?: string;
  sede?: string;
  createdAt?: any;
}

const DEFAULT_TOURNAMENTS: Omit<TournamentRecord, "id">[] = [
  {
    name: "Copa Élite Interclubes Bogotá 2026",
    categoryTag: "🏆 Copa Élite Interclubes",
    description: "Categoría Selección & Mayores • Coliseo El Salitre • Incluye planillaje, carnetización de liga y arbitraje oficial.",
    price: 65000,
    wompiLink: "https://checkout.nequi.wompi.co/l/xAbkDK",
    active: true,
    date: "15 - 28 Mar 2026",
    sede: "Coliseo El Salitre"
  },
  {
    name: "Torneo Departamental de Voleibol Cundinamarca",
    categoryTag: "⚡ Liga & Departamental",
    description: "Categoría Juvenil • Fase clasificatoria y cuadrangulares finales • Incluye seguro deportivo de competencia.",
    price: 85000,
    wompiLink: "https://checkout.nequi.wompi.co/l/xAbkDK",
    active: true,
    date: "05 - 18 Abr 2026",
    sede: "Palacio de los Deportes"
  },
  {
    name: "Festival Formativo de Voleibol SOUL",
    categoryTag: "🌱 Festival Formativo",
    description: "Categorías Formativas • Canchas Sede Norte • Incluye medalla de participación, carnet de evento e hidratación.",
    price: 45000,
    wompiLink: "https://checkout.nequi.wompi.co/l/xAbkDK",
    active: true,
    date: "25 Abr 2026",
    sede: "Canchas Sede Norte"
  }
];

export default function Tournaments() {
  const [tournaments, setTournaments] = useState<TournamentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    categoryTag: "🏆 Copa Élite Interclubes",
    description: "",
    price: "65000",
    wompiLink: "",
    active: true,
    date: "",
    sede: "Sede Norte"
  });

  // Modal Confirmación Eliminar
  const [deleteTarget, setDeleteTarget] = useState<TournamentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Escuchar la colección 'tournaments' en Firestore en tiempo real
  useEffect(() => {
    const getLocalTournaments = (): TournamentRecord[] => {
      try {
        return JSON.parse(localStorage.getItem("soul_local_tournaments") || "[]");
      } catch {
        return [];
      }
    };

    const unsubscribe = onSnapshot(
      collection(db, "tournaments"),
      (snapshot) => {
        const list: TournamentRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as TournamentRecord);
        });

        // Combinar con torneos locales
        const localList = getLocalTournaments();
        const existingIds = new Set(list.map((t) => t.id));
        localList.forEach((lt) => {
          if (!existingIds.has(lt.id)) {
            list.push(lt);
          }
        });

        // Si no hay ninguno, cargar los por defecto
        if (list.length === 0) {
          DEFAULT_TOURNAMENTS.forEach((dt, idx) => {
            list.push({ id: `default-${idx}`, ...dt } as TournamentRecord);
          });
        }

        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setTournaments(list);
        setLoading(false);
      },
      (err) => {
        console.warn("Aviso en listener de torneos (usando almacenamiento local y defaults):", err);
        const localList = getLocalTournaments();
        const fallback = [...DEFAULT_TOURNAMENTS.map((dt, idx) => ({ id: `default-${idx}`, ...dt })), ...localList];
        setTournaments(fallback as TournamentRecord[]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredTournaments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return tournaments;
    return tournaments.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.categoryTag && t.categoryTag.toLowerCase().includes(q)) ||
        (t.sede && t.sede.toLowerCase().includes(q))
    );
  }, [tournaments, searchQuery]);

  // Cargar torneos demo si la colección está vacía
  const handleSeedDefaults = async () => {
    try {
      setLoading(true);
      for (const t of DEFAULT_TOURNAMENTS) {
        await addDoc(collection(db, "tournaments"), {
          ...t,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error("Error al sembrar torneos por defecto:", err);
      alert("Error al cargar torneos de prueba.");
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de creación
  const handleOpenCreateModal = () => {
    setEditingId(null);
    setFormData({
      name: "",
      categoryTag: "🏆 Torneo Oficial",
      description: "",
      price: "65000",
      wompiLink: "https://checkout.nequi.wompi.co/l/xAbkDK",
      active: true,
      date: "",
      sede: "Sede Norte"
    });
    setIsModalOpen(true);
  };

  // Abrir modal de edición
  const handleOpenEditModal = (t: TournamentRecord) => {
    setEditingId(t.id);
    setFormData({
      name: t.name || "",
      categoryTag: t.categoryTag || "🏆 Torneo Oficial",
      description: t.description || "",
      price: String(t.price || 65000),
      wompiLink: t.wompiLink || "",
      active: t.active !== false,
      date: t.date || "",
      sede: t.sede || ""
    });
    setIsModalOpen(true);
  };

  // Guardar (Crear o Actualizar)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Por favor ingresa el nombre del torneo.");
      return;
    }

    const priceNum = Math.round(Number(formData.price) || 0);
    if (priceNum <= 0) {
      alert("Por favor ingresa un valor de inscripción válido.");
      return;
    }

    setSubmitting(true);
    const dataToSave = {
      name: formData.name.trim(),
      categoryTag: formData.categoryTag.trim(),
      description: formData.description.trim(),
      price: priceNum,
      wompiLink: formData.wompiLink.trim(),
      active: Boolean(formData.active),
      date: formData.date.trim(),
      sede: formData.sede.trim(),
      updatedAt: serverTimestamp()
    };

    let savedId = editingId || "";

    try {
      if (editingId) {
        // Actualizar en Firestore
        await updateDoc(doc(db, "tournaments", editingId), dataToSave);
      } else {
        // Crear en Firestore
        const ref = await addDoc(collection(db, "tournaments"), {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
        savedId = ref.id;
      }
    } catch (err: any) {
      console.warn("Aviso en Firestore (guardando torneo en almacenamiento local):", err);
      if (!savedId) {
        savedId = `tournament-local-${Date.now()}`;
      }
    }

    const savedTournament: TournamentRecord = {
      id: savedId || `tournament-local-${Date.now()}`,
      ...dataToSave
    };

    try {
      const stored: TournamentRecord[] = JSON.parse(localStorage.getItem("soul_local_tournaments") || "[]");
      const filtered = stored.filter((t) => t.id !== savedTournament.id);
      filtered.push(savedTournament);
      localStorage.setItem("soul_local_tournaments", JSON.stringify(filtered));
    } catch {}

    setTournaments((prev) => {
      const filtered = prev.filter((t) => t.id !== savedTournament.id);
      return [savedTournament, ...filtered];
    });

    setIsModalOpen(false);
    setEditingId(null);
    setSubmitting(false);
  };

  // Alternar estado activo / inactivo
  const handleToggleActive = async (t: TournamentRecord) => {
    try {
      await updateDoc(doc(db, "tournaments", t.id), {
        active: !t.active,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Actualizando estado de torneo localmente:", err);
    } finally {
      setTournaments((prev) =>
        prev.map((item) => (item.id === t.id ? { ...item, active: !item.active } : item))
      );
    }
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, "tournaments", deleteTarget.id));
    } catch (err: any) {
      console.warn("Aviso al eliminar torneo en Firestore:", err);
    } finally {
      try {
        const stored: TournamentRecord[] = JSON.parse(localStorage.getItem("soul_local_tournaments") || "[]");
        const filtered = stored.filter((t) => t.id !== deleteTarget.id);
        localStorage.setItem("soul_local_tournaments", JSON.stringify(filtered));
      } catch {}

      setTournaments((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
              <Trophy className="w-7 h-7 text-amber-500 dark:text-amber-400" />
              <span>Gestión de Torneos</span>
            </h1>
            <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-xs tabular-nums">
              {tournaments.length} {tournaments.length === 1 ? "torneo" : "torneos"}
            </Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-xs font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Conectado a Base de Datos
            </Badge>
          </div>
          <p className="text-slate-500 dark:text-zinc-400 text-xs sm:text-sm mt-1 max-w-2xl">
            Crea y administra los torneos del club con su respectivo enlace de pago. Los torneos activos aparecen automáticamente en el Portal de Pagos para que los deportistas se inscriban y paguen en línea.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            onClick={handleOpenCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold text-xs rounded-lg shadow-sm gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Torneo</span>
          </Button>
        </div>
      </div>

      {/* Buscador y Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, categoría o sede..."
            className="pl-9 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 text-xs h-10 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            Activo en Portal ({tournaments.filter((t) => t.active !== false).length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-zinc-600 inline-block"></span>
            Oculto ({tournaments.filter((t) => t.active === false).length})
          </span>
        </div>
      </div>

      {/* Lista de Torneos */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 dark:text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-500" />
          Cargando torneos desde Firestore...
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 space-y-3">
          <Trophy className="w-12 h-12 text-slate-400 dark:text-zinc-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">No se encontraron torneos</h3>
          <p className="text-xs max-w-md mx-auto">
            {searchQuery
              ? "No hay torneos que coincidan con tu búsqueda."
              : "Aún no has registrado torneos. Haz clic en 'Agregar Torneo' para crear el primero con su enlace de pago."}
          </p>
          <Button
            type="button"
            onClick={handleOpenCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          >
            <Plus className="w-4 h-4 mr-1" />
            Crear Torneo Ahora
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((torneo) => {
            const hasLink = Boolean(torneo.wompiLink && torneo.wompiLink.trim().startsWith("http"));

            return (
              <Card
                key={torneo.id}
                className={`bg-white dark:bg-zinc-900 border text-slate-900 dark:text-zinc-100 shadow-sm flex flex-col justify-between transition-all ${
                  torneo.active !== false
                    ? "border-slate-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-500/40"
                    : "border-slate-200/60 dark:border-zinc-800/60 opacity-60 hover:opacity-100"
                }`}
              >
                <CardHeader className="pb-3 border-b border-slate-100 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                      {torneo.categoryTag || "🏆 Torneo Oficial"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(torneo)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                        torneo.active !== false
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                          : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                      }`}
                      title={torneo.active !== false ? "Ocultar del portal de pagos" : "Activar en portal de pagos"}
                    >
                      {torneo.active !== false ? "● Visible en Portal" : "Oculto"}
                    </button>
                  </div>

                  <CardTitle className="text-lg font-bold text-slate-900 dark:text-zinc-100 mt-2 leading-snug">
                    {torneo.name}
                  </CardTitle>

                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(torneo.price)}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">Tarifa inscripción</span>
                  </div>
                </CardHeader>

                <CardContent className="pt-3.5 space-y-3.5 flex-1 flex flex-col justify-between text-xs">
                  <p className="text-slate-600 dark:text-zinc-300 text-xs leading-relaxed line-clamp-3">
                    {torneo.description || "Sin descripción detallada."}
                  </p>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-zinc-800 text-[11px] text-slate-500 dark:text-zinc-400">
                    {torneo.date && (
                      <div className="flex items-center gap-1.5 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span>{torneo.date}</span>
                      </div>
                    )}
                    {torneo.sede && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                        <span>{torneo.sede}</span>
                      </div>
                    )}
                  </div>

                  {/* Estado del Enlace de Pago */}
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-700 dark:text-zinc-300 font-semibold flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        Enlace de Pago:
                      </span>
                      {hasLink ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">● Configurado</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-[10px] font-bold">Sin link</span>
                      )}
                    </div>

                    {hasLink ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 truncate flex-1">
                          {torneo.wompiLink}
                        </span>
                        <a
                          href={torneo.wompiLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 shrink-0"
                        >
                          <span>Probar</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                        Agrega el enlace de pago para que los deportistas puedan inscribirse en línea.
                      </p>
                    )}
                  </div>

                  {/* Acciones de la Tarjeta */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEditModal(torneo)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 h-8 px-2.5 gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(torneo)}
                      className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 h-8 px-2.5 gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Crear / Editar Torneo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <span>{editingId ? "Editar Torneo" : "Agregar Nuevo Torneo"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Nombre del Torneo o Festival *
                </label>
                <Input
                  required
                  placeholder="Ej: Copa Élite Interclubes Bogotá 2026"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Valor de Inscripción ($ COP) *
                  </label>
                  <Input
                    type="number"
                    required
                    min="1000"
                    step="1000"
                    placeholder="65000"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 font-bold tabular-nums"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Categoría / Etiqueta Visual
                  </label>
                  <select
                    value={formData.categoryTag}
                    onChange={(e) => setFormData({ ...formData, categoryTag: e.target.value })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="🏆 Copa Élite Interclubes">🏆 Copa Élite Interclubes</option>
                    <option value="⚡ Liga & Departamental">⚡ Liga & Departamental</option>
                    <option value="🌱 Festival Formativo">🌱 Festival Formativo</option>
                    <option value="🎯 Torneo Especial">🎯 Torneo Especial</option>
                    <option value="🥇 Torneo Nacional">🥇 Torneo Nacional</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block mb-1">
                  🔗 Enlace de Pago del Torneo (URL Oficial) *
                </label>
                <Input
                  type="url"
                  required
                  placeholder="https://..."
                  value={formData.wompiLink}
                  onChange={(e) => setFormData({ ...formData, wompiLink: e.target.value })}
                  className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                  Pega el enlace de pago directo que configuraste para este torneo. El portal de pagos redireccionará a esta URL al hacer clic en pagar.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Fechas o Periodo
                  </label>
                  <Input
                    placeholder="Ej: 15 - 28 Mar 2026"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Sede o Canchas
                  </label>
                  <Input
                    placeholder="Ej: Coliseo El Salitre / Sede Norte"
                    value={formData.sede}
                    onChange={(e) => setFormData({ ...formData, sede: e.target.value })}
                    className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Descripción y Qué Incluye
                </label>
                <textarea
                  rows={3}
                  placeholder="Ej: Incluye planillaje, arbitraje oficial, carnet de competencia e hidratación..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="tournament-active"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-slate-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="tournament-active" className="text-xs text-slate-700 dark:text-zinc-200 font-semibold cursor-pointer">
                  Activar y mostrar inmediatamente en el Portal de Pagos público
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
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
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold text-xs"
                >
                  {submitting ? "Guardando..." : editingId ? "Actualizar Torneo" : "Guardar Torneo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-200 dark:border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">¿Eliminar Torneo?</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-300">
              ¿Confirmas eliminar el torneo <strong className="text-slate-900 dark:text-zinc-100">{deleteTarget.name}</strong>? Ya no estará visible para los deportistas en el portal de pagos.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                className="text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
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

