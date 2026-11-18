import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { auth, db, clearActiveSession } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CreditCard,
  LogOut,
  Menu,
  UserCog,
  Contact,
  UserCheck,
  Bell,
  Boxes,
  ShieldCheck,
  Megaphone,
  Trophy,
  CalendarRange,
  X,
  ExternalLink,
  Globe,
  Sparkles,
  Eye
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

export default function Layout() {
  const { user, role, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [nuevasCount, setNuevasCount] = useState(0);
  const [nuevosPagosCount, setNuevosPagosCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [enrollmentAlert, setEnrollmentAlert] = useState<{
    id: string;
    nombre: string;
    plan: string;
  } | null>(null);

  const isCoach = role === "coach";
  const isActualAdmin =
    user?.email?.toLowerCase() === "andirojas0821@gmail.com" ||
    role === "admin" ||
    (typeof window !== "undefined" && localStorage.getItem("soul_original_role") === "admin");

  const handleToggleRoleSimulation = () => {
    if (role === "admin") {
      try { localStorage.setItem("soul_original_role", "admin"); } catch {}
      setUser(user, "coach", false);
    } else {
      setUser(user, "admin", false);
    }
  };

  // Escuchar contador y alertas en tiempo real de nuevas solicitudes (Firestore + SSE + BroadcastChannel + LocalStorage)
  useEffect(() => {
    if (isCoach) return;
    let fsSolicitudes: any[] = [];
    let apiSolicitudes: any[] = [];
    let initialized = false;
    const seenIds = new Set<string>();

    const triggerEnrollmentNotification = (record: any) => {
      if (!record || !record.nombre) return;
      setEnrollmentAlert({
        id: record.id || String(Date.now()),
        nombre: record.nombre,
        plan: record.plan || record.objetivo || "Inscripción Web"
      });
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Nueva Inscripción SOUL", {
            body: `${record.nombre} — ${record.plan || record.objetivo || "Nueva solicitud"}`
          });
        } catch {}
      }
    };

    const syncSolicitudesCount = () => {
      let localList: any[] = [];
      try {
        localList = JSON.parse(localStorage.getItem("soul_local_solicitudes") || "[]");
      } catch {}

      const byId = new Map<string, any>();
      [...localList, ...apiSolicitudes, ...fsSolicitudes].forEach((s) => {
        if (!s || !s.id) return;
        const prev = byId.get(s.id);
        byId.set(s.id, prev ? { ...prev, ...s } : s);
      });

      const merged = Array.from(byId.values());
      const nuevas = merged.filter((s) => s.estado === "Nueva Solicitud");
      setNuevasCount(nuevas.length);

      if (!initialized) {
        merged.forEach((s) => seenIds.add(s.id));
        initialized = true;
      } else {
        const brandNew = nuevas.find((s) => !seenIds.has(s.id));
        merged.forEach((s) => seenIds.add(s.id));
        if (brandNew) {
          triggerEnrollmentNotification(brandNew);
        }
      }
    };

    const fetchApiSolicitudes = async () => {
      try {
        const res = await fetch("/api/solicitudes");
        if (!res.ok) return;
        const json = await res.json();
        if (json?.ok && Array.isArray(json.solicitudes)) {
          apiSolicitudes = json.solicitudes;
          syncSolicitudesCount();
        }
      } catch {}
    };

    syncSolicitudesCount();
    fetchApiSolicitudes();

    let unsubFirestore: (() => void) | null = null;
    try {
      const q = query(collection(db, "solicitudes"), where("estado", "==", "Nueva Solicitud"));
      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          fsSolicitudes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          syncSolicitudesCount();
        },
        () => {}
      );
    } catch {}

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("soul-solicitudes");
      bc.onmessage = (evt) => {
        if (evt.data?.type === "new-solicitud" && evt.data.solicitud) {
          if (!seenIds.has(evt.data.solicitud.id)) {
            seenIds.add(evt.data.solicitud.id);
            triggerEnrollmentNotification(evt.data.solicitud);
          }
        }
        syncSolicitudesCount();
      };
    } catch {}

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/solicitudes/stream");
      es.addEventListener("solicitudes", (evt: MessageEvent) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (parsed?.ok && Array.isArray(parsed.solicitudes)) {
            apiSolicitudes = parsed.solicitudes;
            syncSolicitudesCount();
          }
        } catch {}
      });
    } catch {}

    const handleLocalUpdate = () => syncSolicitudesCount();
    window.addEventListener("soul-solicitudes-updated", handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);

    return () => {
      if (unsubFirestore) unsubFirestore();
      if (bc) bc.close();
      if (es) es.close();
      window.removeEventListener("soul-solicitudes-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
    };
  }, [isCoach]);

  // Escuchar contador en tiempo real de notificaciones de pago (solo para administradores)
  useEffect(() => {
    if (isCoach) return;
    try {
      const unsubNotifs = onSnapshot(
        collection(db, "payment_notifications"),
        (snapshot) => {
          const unreviewed = snapshot.docs.filter((d) => !d.data().revisado);
          setNuevosPagosCount(unreviewed.length);
        },
        () => {
          try {
            const local = JSON.parse(localStorage.getItem("soul_local_payment_notifications") || "[]");
            setNuevosPagosCount(local.filter((n: any) => !n.revisado).length);
          } catch {}
        }
      );
      return () => unsubNotifs();
    } catch {}
  }, [isCoach]);

  // Escuchar alertas de stock crítico en tiempo real (solo para administradores)
  useEffect(() => {
    if (isCoach) return;
    try {
      const unsubscribe = onSnapshot(
        collection(db, "inventory"),
        (snapshot) => {
          let count = 0;
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const qty = Number(d.quantity) || 0;
            const min = Number(d.minQuantity) || 1;
            if (qty <= min) count++;
          });
          setLowStockCount(count);
        },
        () => {}
      );
      return () => unsubscribe();
    } catch {}
  }, [isCoach]);

  // Cerrar el cajón móvil automáticamente al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    clearActiveSession();
    try {
      await signOut(auth);
    } catch {}
    setUser(null, null, false);
    navigate("/login");
  };

  const canManageMarketing = role === "admin" || role === "marketing";

  const allNavItems = [
    { name: "Dashboard", shortName: "Inicio", path: "/dashboard", icon: LayoutDashboard, coachAllowed: true, mobileBottom: true },
    { name: "Planificador", shortName: "Planificador", path: "/planner", icon: CalendarRange, coachAllowed: true, mobileBottom: true },
    { name: "Asistencia & Cancha", shortName: "Asistencia", path: "/attendance", icon: UserCog, coachAllowed: true, mobileBottom: true },
    { name: "Grupos", shortName: "Grupos", path: "/groups", icon: UserPlus, coachAllowed: true, mobileBottom: true },
    { name: "Deportistas", shortName: "Deportistas", path: "/athletes", icon: Users, coachAllowed: false, mobileBottom: true },
    { name: "Finanzas", shortName: "Finanzas", path: "/finances", icon: CreditCard, coachAllowed: false, mobileBottom: false },
    { name: "Torneos", shortName: "Torneos", path: "/tournaments", icon: Trophy, coachAllowed: false, mobileBottom: false },
    { name: "Solicitudes", shortName: "Solicitudes", path: "/prospects", icon: UserCheck, coachAllowed: false, mobileBottom: false },
    { name: "Entrenadores", shortName: "Profes", path: "/coaches", icon: Contact, coachAllowed: false, mobileBottom: false },
    { name: "Notificaciones de Pago", shortName: "Alertas", path: "/payment-notifications", icon: Bell, coachAllowed: false, mobileBottom: false },
    { name: isCoach ? "Materiales de Cancha" : "Inventario", shortName: isCoach ? "Materiales" : "Inventario", path: "/inventory", icon: Boxes, coachAllowed: true, mobileBottom: true },
    { name: "Marketing & Web", shortName: "Marketing", path: "/marketing", icon: Megaphone, coachAllowed: false, mobileBottom: false, marketingExclusive: true }
  ];

  const navItems = allNavItems.filter((item) => {
    if (isCoach) return item.coachAllowed;
    if ((item as any).marketingExclusive) return canManageMarketing;
    return true;
  });

  // Módulos principales para la Barra Inferior Táctil en Celular (máximo 4 + botón "Más" para Admin, o los 3 para Profe)
  const mobileBottomItems = isCoach
    ? navItems
    : [
        allNavItems[0], // Inicio
        allNavItems[1], // Asistencia
        allNavItems[3], // Deportistas
        allNavItems[4]  // Finanzas
      ];

  const totalAlerts = nuevasCount + lowStockCount;
  const activeNavItem = allNavItems.find((item) => item.path === location.pathname);

  return (
    <div className="h-[100dvh] w-full bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col md:flex-row overflow-hidden transition-colors duration-200">
      {/* =====================================================================
          1. BARRA SUPERIOR MÓVIL (Sticky Header en Celulares)
          ===================================================================== */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b border-slate-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shrink-0">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="SOUL"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 object-cover shadow-xs"
          />
          <div className="leading-none">
            <span className="font-bold text-sm text-slate-900 dark:text-zinc-100 tracking-tight">
              SOUL Workspace
            </span>
            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 uppercase block mt-0.5">
              {isCoach ? "Modo Entrenador" : "Panel Administrativo"}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {isActualAdmin && (
            <button
              type="button"
              onClick={handleToggleRoleSimulation}
              className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all flex items-center gap-1 ${
                isCoach
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300"
              }`}
            >
              {isCoach ? "Volver a Admin" : "Ver como Profe"}
            </button>
          )}
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Abrir menú completo"
            className="relative w-9 h-9 rounded-lg flex items-center justify-center border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <Menu className="w-4 h-4 text-slate-600 dark:text-zinc-300" />}
            {!isCoach && totalAlerts > 0 && !mobileMenuOpen && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold tabular-nums flex items-center justify-center">
                {totalAlerts}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* =====================================================================
          2. DRAWER / MENÚ DESLIZABLE MÓVIL (Con Backdrop Oscuro)
          ===================================================================== */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-slate-950/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-[82%] max-w-xs bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-zinc-800 p-4 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <img src="/logo.png" alt="SOUL" className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 object-cover" />
                <div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-zinc-100 leading-tight">Navegación</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                    {isCoach ? "Entrenador de Cancha" : "Administración"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                        : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-zinc-500"}`} />
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.path === "/prospects" && nuevasCount > 0 && (
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full">
                        {nuevasCount}
                      </span>
                    )}
                    {item.path === "/payment-notifications" && nuevosPagosCount > 0 && (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full">
                        {nuevosPagosCount}
                      </span>
                    )}
                    {item.path === "/inventory" && lowStockCount > 0 && (
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full">
                        {lowStockCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Portales Públicos en Celular */}
            <div className="py-2.5 border-t border-slate-200/80 dark:border-zinc-800 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider px-3 mb-1">
                Portales Públicos del Club
              </p>
              <Link
                to="/pagos"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Portal de Pagos Wompi</span>
                </span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </Link>
              <Link
                to="/inscripcion"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                <span className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Inscripción & Matrículas</span>
                </span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </Link>
              <Link
                to="/catalogo"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Catálogo de Diseños Web</span>
                </span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </Link>
            </div>

            <div className="pt-3 border-t border-slate-200/80 dark:border-zinc-800 space-y-2.5">
              <ThemeToggle />
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-800">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate text-slate-900 dark:text-zinc-100">
                    {user?.displayName || user?.email}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 capitalize">
                    {isCoach ? "Profesor" : role || "Admin"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-xs h-8 px-2.5"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  Salir
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. SIDEBAR DESKTOP (Visible en Pantallas Medianas y Grandes md:flex)
          ===================================================================== */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 transition-colors duration-200 z-30 h-screen sticky top-0">
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200/80 dark:border-zinc-800 shrink-0">
          <div className="flex items-center space-x-3">
            <img
              src="/logo.png"
              alt="SOUL"
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 object-cover shadow-xs"
            />
            <div>
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-zinc-100 block leading-none">
                SOUL Voley
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mt-1 block">
                {isCoach ? "Portal Entrenador" : "Panel Administrativo"}
              </span>
            </div>
          </div>
          <ThemeToggle compact />
        </div>

        {/* Badge de Rol */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          {isCoach ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Entrenador de Cancha</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Administración Central</span>
            </div>
          )}
        </div>

        {/* Navegación Desktop */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 font-semibold"
                    : "font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100/80 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-zinc-100"
                }`}
              >
                <item.icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-slate-400 dark:text-zinc-500"
                  }`}
                />
                <span className="flex-1 truncate">{item.name}</span>

                {item.path === "/prospects" && nuevasCount > 0 && (
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full">
                    {nuevasCount}
                  </span>
                )}
                {item.path === "/payment-notifications" && nuevosPagosCount > 0 && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full">
                    {nuevosPagosCount}
                  </span>
                )}
                {item.path === "/inventory" && lowStockCount > 0 && (
                  <span
                    className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
                    title={`${lowStockCount} artículos en stock crítico`}
                  >
                    {lowStockCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Acceso a Portales Web Públicos */}
        <div className="px-3 py-2.5 border-t border-slate-200/80 dark:border-zinc-800 shrink-0">
          <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider px-3 mb-1">
            Portales Públicos del Club
          </p>
          <div className="space-y-0.5">
            <Link
              to="/pagos"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/60 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <span className="flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                <span>Portal Pagos Wompi</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
            <Link
              to="/inscripcion"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/60 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                <span>Inscripción & Matrículas</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
            <Link
              to="/catalogo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/60 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                <span>Catálogo de Diseños</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
          </div>
        </div>

        {/* Footer del Sidebar Desktop */}
        <div className="p-3 border-t border-slate-200/80 dark:border-zinc-800 space-y-2 shrink-0">
          <ThemeToggle />

          <div className="px-3 py-2 bg-slate-50 dark:bg-zinc-800/50 rounded-lg border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate text-slate-900 dark:text-zinc-100">
                {user?.displayName || user?.email}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 capitalize font-medium">
                {isCoach ? "Profesor / Entrenador" : role || "Administrador"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              title="Cerrar Sesión"
              className="h-7 w-7 rounded-md text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 shrink-0"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* =====================================================================
          4. CONTENEDOR PRINCIPAL CON TOPBAR DESKTOP Y LIENZO ADAPTATIVO
          ===================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-50 dark:bg-zinc-950">
        {/* Topbar Desktop */}
        <header className="hidden md:flex items-center justify-between h-16 px-8 border-b border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 dark:text-zinc-500 font-medium">Workspace</span>
            <span className="text-slate-300 dark:text-zinc-700">/</span>
            <span className="font-semibold text-slate-900 dark:text-zinc-100">
              {activeNavItem?.name || "Panel"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isActualAdmin && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleToggleRoleSimulation}
                className={`h-8 text-xs font-semibold gap-1.5 border transition-all ${
                  isCoach
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 hover:bg-indigo-100"
                }`}
              >
                {isCoach ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Volver a Modo Administrador</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver como Profesor</span>
                  </>
                )}
              </Button>
            )}
            <span className="text-xs text-slate-500 dark:text-zinc-400 hidden lg:inline">
              {user?.email}
            </span>
            <ThemeToggle compact />
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:p-8 bg-slate-50 dark:bg-zinc-950 transition-colors duration-200">
          <Outlet />
        </main>
      </div>

      {/* =====================================================================
          5. BARRA DE NAVEGACIÓN INFERIOR TÁCTIL PARA CELULAR (Bottom Dock)
          ===================================================================== */}
      <nav
        aria-label="Navegación rápida móvil"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-around px-2 shadow-sm"
      >
        {mobileBottomItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 rounded-lg transition-colors ${
                isActive
                  ? "text-indigo-600 dark:text-indigo-400 font-semibold"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
              }`}
            >
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  isActive ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                }`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 leading-none truncate max-w-[68px]">
                {item.shortName}
              </span>
            </Link>
          );
        })}

        {/* Botón "Más Módulos" en la barra inferior cuando es Administrador */}
        {!isCoach && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 rounded-lg transition-colors ${
              mobileMenuOpen
                ? "text-indigo-600 dark:text-indigo-400 font-semibold"
                : "text-slate-500 dark:text-zinc-400"
            }`}
          >
            <div className="relative p-1.5 rounded-lg">
              <Menu className="w-5 h-5" />
              {totalAlerts > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 leading-none">Más</span>
          </button>
        )}
      </nav>
      {/* Notificación Flotante en Tiempo Real para Nuevas Inscripciones */}
      {!isCoach && enrollmentAlert && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 max-w-sm w-[calc(100%-2rem)] sm:w-96 p-4 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-indigo-500/60 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Nueva Inscripción Recibida
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate mt-0.5">
                {enrollmentAlert.nombre}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                {enrollmentAlert.plan}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <Link
                  to="/prospects"
                  onClick={() => setEnrollmentAlert(null)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                >
                  Revisar Ficha →
                </Link>
                <button
                  type="button"
                  onClick={() => setEnrollmentAlert(null)}
                  className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 px-2 py-1"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnrollmentAlert(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg shrink-0"
              aria-label="Cerrar alerta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
