import { useState, useEffect } from "react";
import {
  db,
  mergeAthletesData,
  mergeGroupsData,
  mergeCoachesData,
  mergeFinancesData,
  mergeInventoryData
} from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { formatCurrency } from "@/lib/utils";
import {
  Users,
  CreditCard,
  UserCheck,
  ShieldCheck,
  Layers,
  ArrowRight,
  Sparkles,
  Boxes,
  LayoutDashboard,
  ClipboardCheck
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import CoachDashboard from "@/pages/CoachDashboard";

export default function Dashboard() {
  const { role } = useAuthStore();

  const [totalAthletes, setTotalAthletes] = useState<number>(0);
  const [totalGroups, setTotalGroups] = useState<number>(0);
  const [totalCoaches, setTotalCoaches] = useState<number>(0);
  const [newRequestsCount, setNewRequestsCount] = useState<number>(0);
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [recentSolicitudes, setRecentSolicitudes] = useState<any[]>([]);
  const [totalInventoryUnits, setTotalInventoryUnits] = useState<number>(0);
  const [inventoryLowStock, setInventoryLowStock] = useState<number>(0);

  useEffect(() => {
    if (role === "coach") return;

    let fsAthletes: any[] = [];
    let fsGroups: any[] = [];
    let fsCoaches: any[] = [];
    let fsFinances: any[] = [];
    let fsInventory: any[] = [];

    const syncMetrics = () => {
      const mergedAthletes = mergeAthletesData(fsAthletes);
      const mergedCoaches = mergeCoachesData(fsCoaches);
      const mergedGroups = mergeGroupsData(fsGroups, mergedCoaches, mergedAthletes);
      const mergedFinances = mergeFinancesData(fsFinances);
      const mergedInventory = mergeInventoryData(fsInventory);

      setTotalAthletes(mergedAthletes.length);
      setTotalCoaches(mergedCoaches.length);
      setTotalGroups(mergedGroups.length);

      const incomeSum = mergedFinances
        .filter((t) => t.type === "income" && t.status === "completed")
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      setTotalIncome(incomeSum);

      let units = 0;
      let low = 0;
      mergedInventory.forEach((d) => {
        const qty = Number(d.quantity) || 0;
        const min = Number(d.minQuantity) || 1;
        units += qty;
        if (qty <= min) low++;
      });
      setTotalInventoryUnits(units);
      setInventoryLowStock(low);
    };

    syncMetrics();

    // 1. Escuchar Deportistas
    const unsubAthletes = onSnapshot(
      collection(db, "athletes"),
      (snap) => {
        fsAthletes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncMetrics();
      },
      () => syncMetrics()
    );

    // 2. Escuchar Grupos
    const unsubGroups = onSnapshot(
      collection(db, "groups"),
      (snap) => {
        fsGroups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncMetrics();
      },
      () => syncMetrics()
    );

    // 3. Escuchar Entrenadores
    const unsubCoaches = onSnapshot(
      collection(db, "coaches"),
      (snap) => {
        fsCoaches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncMetrics();
      },
      () => syncMetrics()
    );

    // 4. Escuchar Finanzas
    const unsubFinances = onSnapshot(
      collection(db, "finances"),
      (snap) => {
        fsFinances = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncMetrics();
      },
      () => syncMetrics()
    );

    // 5. Escuchar Solicitudes (Firestore + API local + LocalStorage)
    let fsSolicitudes: any[] = [];
    let apiSolicitudes: any[] = [];

    const syncSolicitudesMetrics = () => {
      let localSolicitudes: any[] = [];
      try {
        localSolicitudes = JSON.parse(localStorage.getItem("soul_local_solicitudes") || "[]");
      } catch {}
      const map = new Map<string, any>();
      [...localSolicitudes, ...apiSolicitudes, ...fsSolicitudes].forEach((s) => {
        if (!s || !s.id) return;
        map.set(s.id, { ...(map.get(s.id) || {}), ...s });
      });
      const all = Array.from(map.values());
      setNewRequestsCount(all.filter((s) => s.estado === "Nueva Solicitud").length);
      setRecentSolicitudes(all.slice(0, 4));
    };

    const fetchApiSolicitudes = async () => {
      try {
        const res = await fetch("/api/solicitudes");
        if (!res.ok) return;
        const json = await res.json();
        if (json?.ok && Array.isArray(json.solicitudes)) {
          apiSolicitudes = json.solicitudes;
          syncSolicitudesMetrics();
        }
      } catch {}
    };

    syncSolicitudesMetrics();
    fetchApiSolicitudes();

    const unsubSolicitudes = onSnapshot(
      collection(db, "solicitudes"),
      (snap) => {
        fsSolicitudes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncSolicitudesMetrics();
      },
      () => syncSolicitudesMetrics()
    );

    // 6. Escuchar Inventario
    const unsubInventory = onSnapshot(
      collection(db, "inventory"),
      (snap) => {
        fsInventory = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncMetrics();
      },
      () => syncMetrics()
    );

    const handleLocalUpdate = () => {
      syncMetrics();
      syncSolicitudesMetrics();
    };
    window.addEventListener("soul-athletes-updated", handleLocalUpdate);
    window.addEventListener("soul-finances-updated", handleLocalUpdate);
    window.addEventListener("soul-inventory-updated", handleLocalUpdate);
    window.addEventListener("soul-solicitudes-updated", handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);

    return () => {
      unsubAthletes();
      unsubGroups();
      unsubCoaches();
      unsubFinances();
      unsubSolicitudes();
      unsubInventory();
      window.removeEventListener("soul-athletes-updated", handleLocalUpdate);
      window.removeEventListener("soul-finances-updated", handleLocalUpdate);
      window.removeEventListener("soul-inventory-updated", handleLocalUpdate);
      window.removeEventListener("soul-solicitudes-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
    };
  }, [role]);

  // Si el usuario es entrenador, renderizar el panel exclusivo para profesores
  if (role === "coach") {
    return <CoachDashboard />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Cabecera SaaS Limpia */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 text-indigo-600 dark:text-indigo-400 shrink-0">
            <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight leading-tight">
              Panel Principal
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
              Resumen operativo y métricas en tiempo real del club.
            </p>
          </div>
        </div>

        {/* Acciones Principales */}
        <div className="flex flex-wrap items-center gap-2.5">
          {newRequestsCount > 0 && (
            <Link
              to="/prospects"
              className="flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 hover:bg-amber-100/70 transition-colors tabular-nums"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>
                {newRequestsCount} {newRequestsCount === 1 ? "solicitud nueva" : "solicitudes nuevas"}
              </span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          )}

          <Link
            to="/attendance"
            className="flex-1 sm:flex-initial justify-center inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white shadow-xs transition-colors"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>Tomar Asistencia</span>
          </Link>
        </div>
      </header>

      {/* Tarjetas KPI Uniformes */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* 1. Deportistas */}
        <Link to="/athletes" className="agy-card agy-card-interactive p-5 sm:p-6 flex flex-col justify-between group">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
              Deportistas Activos
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
              {totalAthletes}
            </p>
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-2 flex items-center gap-1">
              <span className="truncate">Ver directorio</span>
              <ArrowRight className="w-3 h-3 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>
        </Link>

        {/* 2. Recaudo del Mes */}
        <Link to="/finances" className="agy-card agy-card-interactive p-5 sm:p-6 flex flex-col justify-between group">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
              Recaudo del Mes
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100 truncate">
              {formatCurrency(totalIncome)}
            </p>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1">
              <span className="truncate">Ver cartera</span>
              <ArrowRight className="w-3 h-3 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>
        </Link>

        {/* 3. Grupos Activos */}
        <Link to="/groups" className="agy-card agy-card-interactive p-5 sm:p-6 flex flex-col justify-between group">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
              Grupos Activos
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
              {totalGroups}
            </p>
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-2 flex items-center gap-1">
              <span className="truncate">Horarios</span>
              <ArrowRight className="w-3 h-3 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>
        </Link>

        {/* 4. Cuerpo Técnico */}
        <Link to="/coaches" className="agy-card agy-card-interactive p-5 sm:p-6 flex flex-col justify-between group">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 truncate">
              Cuerpo Técnico
            </span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
              {totalCoaches}
            </p>
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-2 flex items-center gap-1">
              <span className="truncate">Ver entrenadores</span>
              <ArrowRight className="w-3 h-3 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>
        </Link>
      </section>

      {/* Sección Inferior */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda (7 cols): Solicitudes Recientes del Portal Web */}
        <div className="lg:col-span-7 agy-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                    Solicitudes Recientes del Portal Web
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Prospectos interesados en clases de cortesía o inscripción directa
                  </p>
                </div>
              </div>

              <Link
                to="/prospects"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>Ver todas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentSolicitudes.length === 0 ? (
              <div className="agy-surface-subtle py-12 px-4 text-center">
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Aún no hay solicitudes registradas desde la web pública.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentSolicitudes.map((item) => {
                  const isInscrito = item.estado === "Inscrito";
                  return (
                    <div
                      key={item.id}
                      className="agy-surface-subtle p-3.5 flex items-center justify-between gap-4 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 dark:text-zinc-100 truncate">
                          {item.nombre}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate tabular-nums">
                          {item.objetivo} • {item.telefono}
                        </p>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 border ${
                          isInscrito
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                            : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                        }`}
                      >
                        {item.estado}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Captación automática desde el portal público</span>
            <Link to="/prospects" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              Gestionar inscripciones →
            </Link>
          </div>
        </div>

        {/* Columna Derecha (5 cols): Accesos Rápidos de Gestión */}
        <div className="lg:col-span-5 agy-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                  Atajos Operativos
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Tareas frecuentes para la jornada diaria
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <Link
                to="/attendance"
                className="agy-surface-subtle p-4 hover:border-indigo-500/40 transition-colors flex flex-col gap-2.5 group"
              >
                <div className="p-2 w-fit rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-700 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100 block">
                    Asistencia & Horas
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Pase de lista en cancha
                  </span>
                </div>
              </Link>

              <Link
                to="/finances"
                className="agy-surface-subtle p-4 hover:border-emerald-500/40 transition-colors flex flex-col gap-2.5 group"
              >
                <div className="p-2 w-fit rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-700 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100 block">
                    Registrar Pago
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Mensualidades y abonos
                  </span>
                </div>
              </Link>

              <Link
                to="/users-roles"
                className="agy-surface-subtle p-4 hover:border-indigo-500/40 transition-colors flex flex-col gap-2.5 group"
              >
                <div className="p-2 w-fit rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100 block">
                    Usuarios & Roles
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Permisos de Firebase
                  </span>
                </div>
              </Link>

              <Link
                to="/inventory"
                className="agy-surface-subtle p-4 hover:border-amber-500/40 transition-colors flex flex-col gap-2.5 group"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 w-fit rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-700 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Boxes className="w-4 h-4" />
                  </div>
                  {inventoryLowStock > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                      {inventoryLowStock} bajo
                    </span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100 block tabular-nums">
                    Inventario ({totalInventoryUnits} u.)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Balones y material
                  </span>
                </div>
              </Link>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>Firebase Firestore</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Sincronización en vivo
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
