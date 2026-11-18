import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { 
  PAYMENT_PLANS, 
  normalizePlanName, 
  getPlanDetails, 
  ENROLLMENT_FEE,
  PRONTO_PAGO_DEADLINE
} from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, 
  CheckCircle2, 
  RefreshCw, 
  Sparkles, 
  Phone, 
  Mail, 
  Edit3, 
  X, 
  TrendingUp, 
  Wallet, 
  Calendar, 
  Tag, 
  ShieldCheck,
  Check,
  Download,
  AlertCircle,
  Clock,
  Layers,
  Copy,
  ExternalLink,
  CreditCard
} from "lucide-react";
import { Link } from "react-router-dom";

interface AthleteRecord {
  id: string;
  name: string;
  age?: number;
  category?: string;
  group?: string;
  status?: "Activo" | "Inactivo" | string;
  phone?: string;
  email?: string;
  plan?: string;
}

interface SolicitudRecord {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  plan?: string;
  estado: string;
  fecha_creacion?: any;
}

export default function Plans() {
  const [athletes, setAthletes] = useState<AthleteRecord[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlanFilter, setSelectedPlanFilter] = useState<string>("todos");
  const [activeTab, setActiveTab] = useState<"athletes" | "prospects">("athletes");
  
  // Modal de Asignación / Cambio de Plan
  const [editingAthlete, setEditingAthlete] = useState<AthleteRecord | null>(null);
  const [newPlanChoice, setNewPlanChoice] = useState<string>("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [batchAssigning, setBatchAssigning] = useState(false);
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);

  const handleCopyWompiLink = (e: React.MouseEvent, planId: string, link: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(link);
    setCopiedPlanId(planId);
    setTimeout(() => setCopiedPlanId(null), 2500);
  };

  // 1. Escuchar Deportistas en tiempo real
  useEffect(() => {
    const unsubAthletes = onSnapshot(collection(db, "athletes"), (snap) => {
      const list: AthleteRecord[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as AthleteRecord);
      });
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setAthletes(list);
      setLoading(false);
    }, (err) => {
      console.error("Error al escuchar athletes en Planes:", err);
      setLoading(false);
    });

    // 2. Escuchar Solicitudes en tiempo real
    const unsubSolicitudes = onSnapshot(collection(db, "solicitudes"), (snap) => {
      const list: SolicitudRecord[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as SolicitudRecord);
      });
      setSolicitudes(list);
    });

    return () => {
      unsubAthletes();
      unsubSolicitudes();
    };
  }, []);

  // Normalizar el plan de cada deportista
  const athletesWithNormalizedPlan = useMemo(() => {
    return athletes.map((a) => ({
      ...a,
      normalizedPlan: normalizePlanName(a.plan)
    }));
  }, [athletes]);

  // Conteo de deportistas por plan oficial
  const planCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "Plan Básico": 0,
      "Plan Alfa": 0,
      "Plan Beta": 0,
      "Plan Family": 0,
      "Plan Plus": 0,
      "Sin Asignar": 0
    };

    athletesWithNormalizedPlan.forEach((a) => {
      if (counts[a.normalizedPlan] !== undefined) {
        counts[a.normalizedPlan]++;
      } else {
        counts["Sin Asignar"]++;
      }
    });

    return counts;
  }, [athletesWithNormalizedPlan]);

  // Conteo de solicitudes web por plan
  const prospectCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "Plan Básico": 0,
      "Plan Alfa": 0,
      "Plan Beta": 0,
      "Plan Family": 0,
      "Plan Plus": 0,
      "Sin Asignar": 0
    };

    solicitudes.forEach((s) => {
      const norm = normalizePlanName(s.plan);
      if (counts[norm] !== undefined) {
        counts[norm]++;
      } else {
        counts["Sin Asignar"]++;
      }
    });

    return counts;
  }, [solicitudes]);

  // Proyecciones Financieras Globales (basado en deportistas activos con plan)
  const financialProjections = useMemo(() => {
    let prontoPagoTotal = 0;
    let normalTotal = 0;
    let totalWithPlan = 0;

    athletesWithNormalizedPlan.forEach((a) => {
      // Tomamos en cuenta preferentemente deportistas activos (o todos si no tienen status)
      if (a.status !== "Inactivo") {
        const details = getPlanDetails(a.normalizedPlan);
        if (details) {
          prontoPagoTotal += details.prontoPagoPrice;
          normalTotal += details.normalPrice;
          totalWithPlan++;
        }
      }
    });

    const totalSavings = normalTotal - prontoPagoTotal;
    return {
      prontoPagoTotal,
      normalTotal,
      totalSavings,
      totalWithPlan
    };
  }, [athletesWithNormalizedPlan]);

  // Lista de deportistas filtrada
  const filteredAthletes = useMemo(() => {
    return athletesWithNormalizedPlan.filter((a) => {
      const matchesSearch = 
        (a.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.group || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.category || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.phone || "").includes(searchTerm);

      if (!matchesSearch) return false;

      if (selectedPlanFilter === "todos") return true;
      if (selectedPlanFilter === "sin_asignar") return a.normalizedPlan === "Sin Asignar";
      return a.normalizedPlan.toLowerCase() === selectedPlanFilter.toLowerCase();
    });
  }, [athletesWithNormalizedPlan, searchTerm, selectedPlanFilter]);

  // Lista de solicitudes web filtrada
  const filteredSolicitudes = useMemo(() => {
    return solicitudes.filter((s) => {
      const norm = normalizePlanName(s.plan);
      const matchesSearch = 
        (s.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.correo || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.telefono || "").includes(searchTerm);

      if (!matchesSearch) return false;

      if (selectedPlanFilter === "todos") return true;
      if (selectedPlanFilter === "sin_asignar") return norm === "Sin Asignar";
      return norm.toLowerCase() === selectedPlanFilter.toLowerCase();
    });
  }, [solicitudes, searchTerm, selectedPlanFilter]);

  // Guardar cambio de plan individual en Firestore
  const handleSavePlanChange = async () => {
    if (!editingAthlete || !newPlanChoice) return;

    try {
      setSavingPlan(true);
      await updateDoc(doc(db, "athletes", editingAthlete.id), {
        plan: newPlanChoice,
        updatedAt: serverTimestamp()
      });

      setFeedbackMsg(`Plan de "${editingAthlete.name}" actualizado a ${newPlanChoice}`);
      setEditingAthlete(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error("Error al actualizar plan en Firestore:", err);
      alert("No se pudo actualizar el plan. Revisa la consola.");
    } finally {
      setSavingPlan(false);
    }
  };

  // Asignar planes sugeridos a deportistas que están "Sin Asignar"
  const handleAutoAssignPlans = async () => {
    const unassigned = athletesWithNormalizedPlan.filter((a) => a.normalizedPlan === "Sin Asignar");
    if (unassigned.length === 0) {
      alert("Todos los deportistas ya tienen un plan asignado.");
      return;
    }

    try {
      setBatchAssigning(true);
      const batch = writeBatch(db);
      
      // Distribuir equitativamente entre los planes oficiales
      const planPool = [
        "Plan Alfa",
        "Plan Básico",
        "Plan Beta",
        "Plan Family",
        "Plan Plus"
      ];

      unassigned.forEach((athlete, index) => {
        const assigned = planPool[index % planPool.length];
        const ref = doc(db, "athletes", athlete.id);
        batch.update(ref, {
          plan: assigned,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      setFeedbackMsg(`¡Se asignaron planes automáticamente a ${unassigned.length} deportistas!`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error("Error en asignación masiva de planes:", err);
      alert("Error al asignar planes automáticamente.");
    } finally {
      setBatchAssigning(false);
    }
  };

  // Exportar reporte de deportistas y planes a CSV
  const handleExportCSV = () => {
    if (athletesWithNormalizedPlan.length === 0) return;

    const headers = ["Nombre", "Edad", "Categoría", "Grupo", "Estado", "Plan de Pago", "Tarifa Pronto Pago", "Tarifa Normal", "Clases Mes", "Teléfono", "Correo"];
    const rows = athletesWithNormalizedPlan.map((a) => {
      const details = getPlanDetails(a.normalizedPlan);
      return [
        `"${a.name || ''}"`,
        a.age || '',
        `"${a.category || ''}"`,
        `"${a.group || ''}"`,
        `"${a.status || 'Activo'}"`,
        `"${a.normalizedPlan}"`,
        details ? details.prontoPagoPrice : 0,
        details ? details.normalPrice : 0,
        details ? details.classes : 0,
        `"${a.phone || ''}"`,
        `"${a.email || ''}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `planes_soul_voley_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalAthletesCount = athletes.length;
  const unassignedCount = planCounts["Sin Asignar"] || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Mensaje de confirmación emergente */}
      {feedbackMsg && (
        <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-emerald-600 dark:text-emerald-400 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Principal */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
              <span>Planes de Pago</span>
            </h1>
            <Badge variant="default">
              5 Planes Oficiales
            </Badge>
          </div>
          <p className="text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl text-xs sm:text-sm">
            Control de deportistas inscritos a cada plan mensual, proyección de recaudo y seguimiento de pronto pago.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {unassignedCount > 0 && (
            <Button
              variant="outline"
              onClick={handleAutoAssignPlans}
              disabled={batchAssigning}
              className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 text-xs tabular-nums"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {batchAssigning ? "Asignando..." : `Asignar planes a ${unassignedCount} faltantes`}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV
          </Button>

          <Link to="/athletes">
            <Button className="text-xs">
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              Gestión Deportistas
            </Button>
          </Link>
        </div>
      </div>

      {/* Reglas del Club & Banner Informativo */}
      <div className="agy-card p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Reglas y Condiciones del Club SOUL</h3>
              <Badge variant="default" className="text-[10px]">
                Oficial 2026
              </Badge>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 leading-relaxed tabular-nums">
              • <strong className="text-slate-900 dark:text-zinc-100">Pronto Pago:</strong> {PRONTO_PAGO_DEADLINE}. A partir del día 6 rige la tarifa normal.
              <br />
              • <strong className="text-slate-900 dark:text-zinc-100">Inscripción General:</strong> {formatCurrency(ENROLLMENT_FEE)} (incluye uniforme y afiliación anual).
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/60 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-zinc-800">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Todos los planes son mensuales</span>
        </div>
      </div>

      {/* KPIs de Proyección Financiera */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Deportistas */}
        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Total Deportistas</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {totalAthletesCount}
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{financialProjections.totalWithPlan} con plan asignado</span>
            {unassignedCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">({unassignedCount} sin asignar)</span>
            )}
          </div>
        </div>

        {/* Recaudo Pronto Pago Estimado */}
        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Recaudo Pronto Pago (hasta el 5)</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(financialProjections.prontoPagoTotal)}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
            Si todos los deportistas cancelan antes del día 5
          </p>
        </div>

        {/* Recaudo Normal Estimado */}
        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Recaudo Tarifa Normal (día 6+)</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {formatCurrency(financialProjections.normalTotal)}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
            Tarifa completa sin descuento por pronto pago
          </p>
        </div>

        {/* Ahorro para Familias */}
        <div className="agy-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Ahorro Mensual Familias</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
            {formatCurrency(financialProjections.totalSavings)}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
            Beneficio otorgado por pago puntual
          </p>
        </div>
      </div>

      {/* Barra de Distribución Porcentual */}
      {totalAthletesCount > 0 && (
        <div className="agy-card p-4 space-y-2.5">
          <div className="flex justify-between items-center text-xs tabular-nums">
            <span className="text-slate-500 dark:text-zinc-400 font-medium">Distribución de Alumnos por Plan</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{totalAthletesCount} deportistas en total</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden flex">
            {PAYMENT_PLANS.map((plan) => {
              const count = planCounts[plan.name] || 0;
              const percent = totalAthletesCount ? (count / totalAthletesCount) * 100 : 0;
              if (percent === 0) return null;
              return (
                <div
                  key={plan.id}
                  style={{ width: `${percent}%`, backgroundColor: plan.accentColor }}
                  className="h-full transition-all duration-500"
                  title={`${plan.name}: ${count} (${percent.toFixed(1)}%)`}
                />
              );
            })}
            {unassignedCount > 0 && (
              <div
                style={{ width: `${(unassignedCount / totalAthletesCount) * 100}%` }}
                className="h-full bg-slate-300 dark:bg-zinc-600 transition-all duration-500"
                title={`Sin Asignar: ${unassignedCount}`}
              />
            )}
          </div>
        </div>
      )}

      {/* Grid de las 5 Tarjetas Oficiales de Planes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <span>Planes de Entrenamiento</span>
            <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">(Haz clic en una tarjeta para filtrar la lista)</span>
          </h2>
          {selectedPlanFilter !== "todos" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedPlanFilter("todos")}
              className="text-xs text-indigo-600 dark:text-indigo-400 h-7 tabular-nums"
            >
              Mostrar Todos ({totalAthletesCount})
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {PAYMENT_PLANS.map((plan) => {
            const count = planCounts[plan.name] || 0;
            const prospectCount = prospectCounts[plan.name] || 0;
            const percent = totalAthletesCount ? ((count / totalAthletesCount) * 100).toFixed(0) : 0;
            const isSelected = selectedPlanFilter.toLowerCase() === plan.name.toLowerCase();
            const planProntoTotal = count * plan.prontoPagoPrice;
            const planNormalTotal = count * plan.normalPrice;

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanFilter(isSelected ? "todos" : plan.name)}
                className={`
                  relative rounded-xl p-5 transition-all cursor-pointer flex flex-col justify-between bg-white dark:bg-zinc-900 shadow-sm
                  ${isSelected 
                    ? "border-2 border-indigo-600 dark:border-indigo-500 ring-2 ring-indigo-500/20" 
                    : "border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                  }
                `}
              >
                {/* Popular Pill */}
                {plan.isPopular && (
                  <div className="absolute -top-2.5 right-3 bg-indigo-600 dark:bg-indigo-500 text-[10px] font-bold text-white px-2 py-0.5 rounded-full shadow-xs">
                    ★ Más Popular
                  </div>
                )}

                <div>
                  {/* Plan Header */}
                  <div className="flex items-center justify-between">
                    <Badge variant="default" className="text-xs">
                      {plan.name}
                    </Badge>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-semibold tabular-nums">
                      {plan.classesLabel}
                    </span>
                  </div>

                  {/* Contador Gigante de Inscritos */}
                  <div className="mt-4 flex items-baseline justify-between tabular-nums">
                    <div>
                      <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
                        {count}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {count === 1 ? "deportista inscrito" : "deportistas inscritos"} ({percent}%)
                      </div>
                    </div>
                    {prospectCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]" title="Interesados en la web pública">
                        +{prospectCount} web
                      </Badge>
                    )}
                  </div>

                  {/* Precios */}
                  <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-zinc-800 space-y-1.5 text-xs tabular-nums">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-zinc-400">Pronto pago:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(plan.prontoPagoPrice)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-zinc-400">Tarifa normal:</span>
                      <span className="text-slate-700 dark:text-zinc-300 font-semibold">{formatCurrency(plan.normalPrice)}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 italic pt-0.5">
                      {plan.scope}
                    </div>
                  </div>

                  {/* Botón de Redirección Oficial Wompi - Exclusivo Plan Básico */}
                  {plan.id === "basico" && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => window.open(plan.wompiLink, "_blank", "noopener,noreferrer")}
                        className="w-full text-[11px] font-semibold h-8 rounded-lg gap-1.5"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Ir a Pagar en Wompi</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Subtotal Recaudo del Plan */}
                <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-zinc-800 tabular-nums">
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">Recaudo pronto pago estimado:</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {formatCurrency(planProntoTotal)}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">Normal: {formatCurrency(planNormalTotal)}</div>

                  <div className={`mt-3 w-full py-1.5 text-center rounded-md text-xs font-semibold transition-colors ${
                    isSelected 
                      ? "bg-indigo-600 dark:bg-indigo-500 text-white" 
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                  }`}>
                    {isSelected ? "Filtro activo" : `Ver ${count} deportistas`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tarjeta de "Sin Asignar" si existen deportistas sin plan */}
        {unassignedCount > 0 && (
          <div 
            onClick={() => setSelectedPlanFilter(selectedPlanFilter === "sin_asignar" ? "todos" : "sin_asignar")}
            className={`mt-4 p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
              selectedPlanFilter === "sin_asignar"
                ? "bg-amber-50 border-amber-300 dark:bg-amber-500/15 dark:border-amber-500/40"
                : "bg-amber-50/60 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 hover:bg-amber-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Atención requerida</span>
                <p className="text-sm text-slate-900 dark:text-zinc-100 font-medium tabular-nums">
                  Hay <strong>{unassignedCount} deportistas</strong> sin plan de pago asignado.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAutoAssignPlans();
                }}
                disabled={batchAssigning}
                className="text-xs h-8"
              >
                {batchAssigning ? "Asignando..." : "Asignar Automáticamente"}
              </Button>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 underline">
                {selectedPlanFilter === "sin_asignar" ? "Ver todos" : "Ver faltantes"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs y Contenedor Principal de Tablas */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        {/* Barra superior: Tabs y Búsqueda */}
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-lg border border-slate-200/80 dark:border-zinc-800 tabular-nums">
            <button
              onClick={() => setActiveTab("athletes")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "athletes"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
              }`}
            >
              Deportistas Inscritos ({athletes.length})
            </button>
            <button
              onClick={() => setActiveTab("prospects")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "prospects"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
              }`}
            >
              Aspirantes Web por Plan ({solicitudes.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-zinc-500" />
              <Input
                placeholder="Buscar por nombre, grupo o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Filtros Rápidos de Plan */}
        <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-zinc-800/40 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto text-xs tabular-nums">
          <span className="text-slate-500 dark:text-zinc-400 shrink-0 mr-1 font-medium">Filtrar plan:</span>
          <button
            onClick={() => setSelectedPlanFilter("todos")}
            className={`px-2.5 py-1 rounded-md shrink-0 transition-colors ${
              selectedPlanFilter === "todos"
                ? "bg-indigo-600 dark:bg-indigo-500 text-white font-semibold"
                : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            Todos ({totalAthletesCount})
          </button>
          {PAYMENT_PLANS.map((p) => {
            const count = planCounts[p.name] || 0;
            const isSelected = selectedPlanFilter.toLowerCase() === p.name.toLowerCase();
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlanFilter(isSelected ? "todos" : p.name)}
                className={`px-2.5 py-1 rounded-md shrink-0 transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-indigo-600 dark:bg-indigo-500 text-white font-semibold"
                    : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
                }`}
              >
                <span>{p.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                  {count}
                </span>
              </button>
            );
          })}
          {unassignedCount > 0 && (
            <button
              onClick={() => setSelectedPlanFilter("sin_asignar")}
              className={`px-2.5 py-1 rounded-md shrink-0 transition-colors flex items-center gap-1.5 ${
                selectedPlanFilter === "sin_asignar"
                  ? "bg-amber-500 text-white font-semibold"
                  : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
              }`}
            >
              <span>Sin Asignar</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                {unassignedCount}
              </span>
            </button>
          )}
        </div>

        {/* TAB 1: Deportistas Inscritos */}
        {activeTab === "athletes" && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Deportista</TableHead>
                  <TableHead>Plan Asignado</TableHead>
                  <TableHead>Clases / Mes</TableHead>
                  <TableHead>Pronto Pago (hasta el 5)</TableHead>
                  <TableHead>Tarifa Normal</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
                      Cargando asignaciones de planes en vivo desde Firestore...
                    </TableCell>
                  </TableRow>
                ) : filteredAthletes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                      No se encontraron deportistas con el filtro seleccionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAthletes.map((athlete) => {
                    const planDetails = getPlanDetails(athlete.normalizedPlan);
                    const isUnassigned = athlete.normalizedPlan === "Sin Asignar";

                    return (
                      <TableRow key={athlete.id}>
                        {/* Nombre y Edad */}
                        <TableCell>
                          <div className="font-semibold text-slate-900 dark:text-zinc-100">{athlete.name}</div>
                          <div className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">{athlete.age} años • {athlete.category || "General"}</div>
                        </TableCell>

                        {/* Plan */}
                        <TableCell>
                          {planDetails ? (
                            <Badge variant="default">
                              {planDetails.name}
                            </Badge>
                          ) : (
                            <Badge variant="warning">
                              Sin Asignar
                            </Badge>
                          )}
                        </TableCell>

                        {/* Clases */}
                        <TableCell className="text-slate-700 dark:text-zinc-300 text-xs font-medium tabular-nums">
                          {planDetails ? `${planDetails.classes} clases` : "—"}
                        </TableCell>

                        {/* Pronto Pago */}
                        <TableCell className="tabular-nums">
                          {planDetails ? (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                              {formatCurrency(planDetails.prontoPagoPrice)}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-zinc-500 text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Normal */}
                        <TableCell className="tabular-nums">
                          {planDetails ? (
                            <span className="text-slate-700 dark:text-zinc-300 text-xs">
                              {formatCurrency(planDetails.normalPrice)}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-zinc-500 text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Grupo */}
                        <TableCell className="text-slate-700 dark:text-zinc-300 text-xs font-medium">
                          {athlete.group || "Sin grupo"}
                        </TableCell>

                        {/* Contacto */}
                        <TableCell>
                          <div className="space-y-0.5 text-xs tabular-nums">
                            {athlete.phone && (
                              <a
                                href={`https://wa.me/57${athlete.phone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                              >
                                <Phone className="w-3 h-3" />
                                {athlete.phone}
                              </a>
                            )}
                            {athlete.email && (
                              <div className="flex items-center gap-1 text-slate-500 dark:text-zinc-400 truncate max-w-[130px]">
                                <Mail className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                                {athlete.email}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Estado */}
                        <TableCell>
                          <Badge
                            variant={athlete.status === "Inactivo" ? "destructive" : "success"}
                          >
                            {athlete.status || "Activo"}
                          </Badge>
                        </TableCell>

                        {/* Acción: Cambiar Plan */}
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingAthlete(athlete);
                              setNewPlanChoice(isUnassigned ? "Plan Alfa" : athlete.normalizedPlan);
                            }}
                            className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-xs h-8"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" />
                            {isUnassigned ? "Asignar Plan" : "Cambiar Plan"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* TAB 2: Aspirantes Web por Plan */}
        {activeTab === "prospects" && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Aspirante</TableHead>
                  <TableHead>Plan Seleccionado en Web</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Estado de Solicitud</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSolicitudes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                      No hay solicitudes web registradas con este criterio.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSolicitudes.map((solicitud) => {
                    const norm = normalizePlanName(solicitud.plan);
                    const planDetails = getPlanDetails(norm);

                    return (
                      <TableRow key={solicitud.id}>
                        <TableCell className="font-semibold text-slate-900 dark:text-zinc-100">
                          {solicitud.nombre}
                        </TableCell>

                        <TableCell>
                          {planDetails ? (
                            <Badge variant="default">
                              {planDetails.name} ({planDetails.classesLabel})
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              {solicitud.plan || "Sin especificar"}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-slate-700 dark:text-zinc-300 text-xs tabular-nums">
                          {solicitud.telefono}
                        </TableCell>

                        <TableCell className="text-slate-500 dark:text-zinc-400 text-xs">
                          {solicitud.correo}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              solicitud.estado === "Inscrito"
                                ? "success"
                                : solicitud.estado === "Nueva Solicitud"
                                ? "warning"
                                : "secondary"
                            }
                          >
                            {solicitud.estado}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          <Link to="/prospects">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-xs h-8"
                            >
                              Ver en Solicitudes
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* MODAL PARA CAMBIAR O ASIGNAR PLAN */}
      {editingAthlete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl max-w-xl w-full p-6 shadow-xl relative">
            <button
              onClick={() => setEditingAthlete(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">
                  Asignar Plan de Pagos
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Deportista: <strong className="text-indigo-600 dark:text-indigo-400">{editingAthlete.name}</strong> ({editingAthlete.group || "Sin grupo"})
                </p>
              </div>
            </div>

            <div className="space-y-2.5 my-5 max-h-[60vh] overflow-y-auto pr-1">
              {PAYMENT_PLANS.map((plan) => {
                const isSelected = newPlanChoice.toLowerCase() === plan.name.toLowerCase();

                return (
                  <div
                    key={plan.id}
                    onClick={() => setNewPlanChoice(plan.name)}
                    className={`
                      p-3.5 rounded-xl border cursor-pointer transition-colors flex items-center justify-between
                      ${isSelected 
                        ? "bg-indigo-50/70 border-indigo-500 dark:bg-indigo-500/10 dark:border-indigo-500" 
                        : "bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900"
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm">{plan.name}</span>
                          <Badge variant="default" className="text-[10px]">
                            {plan.classesLabel}
                          </Badge>
                          {plan.isPopular && (
                            <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">★ Más Popular</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{plan.tagline} • {plan.scope}</p>
                      </div>
                    </div>

                    <div className="text-right tabular-nums">
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(plan.prontoPagoPrice)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                        Normal: {formatCurrency(plan.normalPrice)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-zinc-800">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Pronto pago hasta el día 5</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingAthlete(null)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSavePlanChange}
                  disabled={savingPlan || !newPlanChoice}
                  className="text-xs"
                >
                  {savingPlan ? "Guardando..." : "Guardar Asignación"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
