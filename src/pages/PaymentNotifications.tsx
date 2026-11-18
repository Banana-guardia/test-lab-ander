import { useState, useEffect, useMemo } from "react";
import { db, mergeFinancesData, saveFinanceTransaction, saveAthleteToDatabase } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp
} from "firebase/firestore";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Bell, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Search, 
  ExternalLink, 
  Copy, 
  Check, 
  DollarSign, 
  FileText, 
  X,
  CreditCard,
  Zap,
  TrendingUp,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";

export interface PaymentNotification {
  id: string;
  txCode: string;
  athlete: string;
  athleteId?: string;
  amount: number;
  concept: string;
  date: string;
  status: "completed" | "pending" | "declined" | string;
  paymentMethod?: string;
  wompiReference?: string;
  wompiTxId?: string;
  createdAt?: any;
  revisado?: boolean;
  notificationDocId?: string;
}

export default function PaymentNotifications() {
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "completed" | "pending" | "wompi">("todos");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentNotification | null>(null);

  // Escuchar transacciones de ingresos (`finances`) + alertas directas (`payment_notifications` y servidor `/api/pagos/notificaciones`) en tiempo real
  useEffect(() => {
    let rawFirestoreFinances: any[] = [];
    let rawFirestoreNotifs: any[] = [];
    let serverNotifs: any[] = [];

    const syncNotifications = () => {
      const mergedFinances = mergeFinancesData(rawFirestoreFinances);

      let localNotifs: any[] = [];
      try {
        localNotifs = JSON.parse(localStorage.getItem("soul_local_payment_notifications") || "[]");
      } catch {}

      const byRefOrId = new Map<string, PaymentNotification>();

      // 1. Cargar desde finances
      mergedFinances
        .filter((d) => d.type === "income" || d.wompiReference || d.wompiTxId)
        .forEach((d) => {
          const refKey = (d.wompiReference || d.txCode || d.id).toString();
          byRefOrId.set(refKey, {
            id: d.id,
            txCode: d.txCode || d.wompiReference || `TX-${String(d.id).slice(0, 6)}`,
            athlete: d.athlete || "Deportista No Especificado",
            athleteId: d.athleteId,
            amount: d.amount || 0,
            concept: d.concept || "Mensualidad de Voleibol",
            date: d.date || "Fecha Reciente",
            status: d.status || "completed",
            paymentMethod: d.paymentMethod || "Nequi / Wompi",
            wompiReference: d.wompiReference,
            wompiTxId: d.wompiTxId,
            createdAt: d.createdAt,
            revisado: Boolean(d.revisado)
          });
        });

      // 2. Fusionar alertas desde payment_notifications (Servidor + LocalStorage + Firestore)
      [...serverNotifs, ...localNotifs, ...rawFirestoreNotifs].forEach((n) => {
        const refKey = (n.wompiReference || n.txCode || n.id).toString();
        const existing = byRefOrId.get(refKey);
        if (existing) {
          byRefOrId.set(refKey, {
            ...existing,
            notificationDocId: existing.notificationDocId || n.id,
            revisado: existing.revisado || Boolean(n.revisado),
            status: existing.status === "completed" ? "completed" : n.status || existing.status
          });
        } else {
          byRefOrId.set(refKey, {
            id: n.id,
            notificationDocId: n.id,
            txCode: n.txCode || n.wompiReference || `TX-${String(n.id).slice(0, 6)}`,
            athlete: n.athlete || "Deportista No Especificado",
            athleteId: n.athleteId,
            amount: Number(n.amount) || 0,
            concept: n.concept || "Pago desde Portal",
            date: n.date || "Reciente",
            status: n.status || "pending",
            paymentMethod: n.paymentMethod || "Nequi / Wompi (Por revisar)",
            wompiReference: n.wompiReference,
            wompiTxId: n.wompiTxId,
            createdAt: n.createdAt,
            revisado: Boolean(n.revisado)
          });
        }
      });

      const list = Array.from(byRefOrId.values()).sort((a, b) => {
        // Mostrar primero las notificaciones sin revisar o pendientes
        if (!a.revisado && b.revisado) return -1;
        if (a.revisado && !b.revisado) return 1;
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return 0;
      });

      setNotifications(list);
      setLoading(false);
    };

    const fetchServerNotifications = async () => {
      try {
        const res = await fetch("/api/pagos/notificaciones");
        if (!res.ok) return;
        const json = await res.json();
        if (json?.ok && Array.isArray(json.notifications)) {
          serverNotifs = json.notifications;
          syncNotifications();
        }
      } catch {}
    };

    syncNotifications();
    fetchServerNotifications();

    const unsubFinances = onSnapshot(
      collection(db, "finances"),
      (snapshot) => {
        rawFirestoreFinances = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        syncNotifications();
      },
      () => syncNotifications()
    );

    const unsubNotifs = onSnapshot(
      collection(db, "payment_notifications"),
      (snapshot) => {
        rawFirestoreNotifs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        syncNotifications();
      },
      () => syncNotifications()
    );

    const handleLocalUpdate = () => {
      syncNotifications();
    };
    window.addEventListener("soul-finances-updated", handleLocalUpdate);
    window.addEventListener("soul-payment-notifications-updated", handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);
    window.addEventListener("focus", fetchServerNotifications);

    // Canal instantáneo entre pestañas del mismo navegador (0 ms)
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel("soul-payment-notifications");
      broadcastChannel.onmessage = () => {
        syncNotifications();
      };
    } catch {}

    // Stream SSE en tiempo real desde el servidor (/api/pagos/stream)
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/pagos/stream");
      eventSource.addEventListener("notifications", (evt: MessageEvent) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (parsed?.ok && Array.isArray(parsed.notifications)) {
            serverNotifs = parsed.notifications;
            syncNotifications();
          }
        } catch {}
      });
    } catch {}

    const pollId = window.setInterval(fetchServerNotifications, 15000);

    return () => {
      unsubFinances();
      unsubNotifs();
      window.removeEventListener("soul-finances-updated", handleLocalUpdate);
      window.removeEventListener("soul-payment-notifications-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
      window.removeEventListener("focus", fetchServerNotifications);
      if (broadcastChannel) broadcastChannel.close();
      if (eventSource) eventSource.close();
      window.clearInterval(pollId);
    };
  }, []);

  const syncNotificationDocState = async (notif: PaymentNotification, patch: Record<string, any>) => {
    if (
      notif.notificationDocId &&
      !notif.notificationDocId.startsWith("local-notif-") &&
      !notif.notificationDocId.startsWith("srv-notif-")
    ) {
      try {
        await setDoc(
          doc(db, "payment_notifications", notif.notificationDocId),
          { ...patch, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch {}
    }
    try {
      await fetch("/api/pagos/notificaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: notif.notificationDocId || notif.id,
          txCode: notif.txCode,
          wompiReference: notif.wompiReference,
          ...patch
        })
      });
    } catch {}
    try {
      const localNotifs: any[] = JSON.parse(localStorage.getItem("soul_local_payment_notifications") || "[]");
      const updated = localNotifs.map((n) =>
        n.id === notif.notificationDocId || n.txCode === notif.txCode || (notif.wompiReference && n.wompiReference === notif.wompiReference)
          ? { ...n, ...patch }
          : n
      );
      localStorage.setItem("soul_local_payment_notifications", JSON.stringify(updated));
      window.dispatchEvent(new Event("soul-payment-notifications-updated"));
    } catch {}
  };

  // Marcar como revisado
  const handleMarkAsReviewed = async (id: string, currentState: boolean) => {
    try {
      const target = notifications.find((n) => n.id === id);
      const nextState = !currentState;
      await saveFinanceTransaction(
        {
          ...(target || {}),
          revisado: nextState
        },
        id
      );
      if (target) {
        await syncNotificationDocState(target, { revisado: nextState });
      }
    } catch (err) {
      console.error("Error al actualizar estado de revisión:", err);
    }
  };

  // Aprobar pago pendiente tras revisión
  const handleApprovePending = async (notif: PaymentNotification) => {
    try {
      await saveFinanceTransaction(
        {
          ...notif,
          type: "income",
          status: "completed",
          revisado: true,
          paymentMethod: (notif.paymentMethod || "Nequi / Wompi").replace(" (Por revisar)", " (Verificado)")
        },
        notif.id
      );
      await syncNotificationDocState(notif, { status: "completed", revisado: true });

      if (notif.athleteId) {
        await saveAthleteToDatabase(
          {
            financialStatus: "Al día",
            estado_pago: "al_dia",
            valorPendiente: 0,
            lastPaymentDate: notif.date,
            lastPaymentReference: notif.txCode
          },
          { id: notif.athleteId, name: notif.athlete }
        );
      }
    } catch (err) {
      console.error("Error al aprobar pago pendiente:", err);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Filtrado
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const matchSearch =
        item.athlete.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.txCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.concept.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (filterStatus === "completed") return item.status === "completed";
      if (filterStatus === "pending") return item.status === "pending";
      if (filterStatus === "wompi") return item.paymentMethod?.toLowerCase().includes("wompi");
      return true;
    });
  }, [notifications, searchTerm, filterStatus]);

  // Métricas rápidas
  const totalRecaudado = useMemo(() => {
    return notifications
      .filter((n) => n.status === "completed")
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [notifications]);

  const totalWompi = useMemo(() => {
    return notifications.filter((n) => n.paymentMethod?.toLowerCase().includes("wompi")).length;
  }, [notifications]);

  const nuevasSinRevisar = useMemo(() => {
    return notifications.filter((n) => !n.revisado).length;
  }, [notifications]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header con enlace directo a la App Independiente del Portal de Pagos */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-indigo-600 dark:text-indigo-400">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">Notificaciones de Pago</h1>
                {nuevasSinRevisar > 0 && (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-semibold text-xs tabular-nums">
                    {nuevasSinRevisar} pendientes de revisar
                  </Badge>
                )}
              </div>
              <p className="text-slate-500 dark:text-zinc-400 text-sm mt-0.5">
                Feed en tiempo real de pagos completados y transacciones de los deportistas.
              </p>
            </div>
          </div>
        </div>

        {/* Acceso a la App Externa del Portal de Pagos */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <a
            href="/pagos"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white shadow-sm transition-all group w-full sm:w-auto"
          >
            <span>Abrir Portal de Pagos de Deportistas</span>
            <ExternalLink className="w-4 h-4 text-white/90 group-hover:translate-x-0.5 transition-transform" />
          </a>
        </div>
      </div>

      {/* Banner Informativo de Desacople */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-zinc-300">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>
            <strong className="text-slate-900 dark:text-zinc-100">Portal de Pagos sincronizado:</strong> Los deportistas realizan sus pagos en el portal público y las alertas ingresan automáticamente a este módulo.
          </span>
        </div>
        <span className="text-indigo-600 dark:text-indigo-400 font-mono text-[11px] bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-500/20">
          Gateway: Wompi Bancolombia
        </span>
      </div>

      {/* Métricas del Módulo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Total Notificaciones</p>
              <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100 mt-1">{notifications.length}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">Eventos financieros</p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Total Recaudado</p>
              <p className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(totalRecaudado)}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">Pagos confirmados</p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Vía Wompi (Online)</p>
              <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100 mt-1">{totalWompi}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">Pagos con tarjeta/PSE</p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400">
              <Zap className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Sin Revisar</p>
              <p className="text-2xl font-bold tracking-tight tabular-nums text-amber-600 dark:text-amber-400 mt-1">{nuevasSinRevisar}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">Requieren visto bueno</p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contenedor Principal: Filtros y Tabla de Notificaciones */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-zinc-500" />
            <Input 
              placeholder="Buscar por deportista, referencia o concepto..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <Button
              size="sm"
              variant={filterStatus === "todos" ? "default" : "ghost"}
              onClick={() => setFilterStatus("todos")}
              className={filterStatus === "todos" 
                ? "bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 tabular-nums" 
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs h-8 tabular-nums"}
            >
              Todos ({notifications.length})
            </Button>
            <Button
              size="sm"
              variant={filterStatus === "completed" ? "default" : "ghost"}
              onClick={() => setFilterStatus("completed")}
              className={filterStatus === "completed" 
                ? "bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8" 
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs h-8"}
            >
              Aprobados
            </Button>
            <Button
              size="sm"
              variant={filterStatus === "pending" ? "default" : "ghost"}
              onClick={() => setFilterStatus("pending")}
              className={filterStatus === "pending" 
                ? "bg-amber-600 hover:bg-amber-500 text-white text-xs h-8" 
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs h-8"}
            >
              Pendientes
            </Button>
            <Button
              size="sm"
              variant={filterStatus === "wompi" ? "default" : "ghost"}
              onClick={() => setFilterStatus("wompi")}
              className={filterStatus === "wompi" 
                ? "bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8" 
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs h-8"}
            >
              Wompi
            </Button>
          </div>
        </div>

        {/* Tabla Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-zinc-800/50">
              <TableRow className="border-slate-200 dark:border-zinc-800 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Estado</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Deportista</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Concepto</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Monto</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Referencia</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Método</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Fecha</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                    <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Cargando notificaciones en tiempo real desde Firestore...
                  </TableCell>
                </TableRow>
              ) : filteredNotifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-zinc-600" />
                    No hay notificaciones de pago registradas con estos filtros.
                  </TableCell>
                </TableRow>
              ) : (
                filteredNotifications.map((notif) => {
                  const isCompleted = notif.status === "completed";
                  return (
                    <TableRow 
                      key={notif.id} 
                      className={`border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors ${
                        !notif.revisado ? "bg-indigo-50/40 dark:bg-indigo-500/5" : ""
                      }`}
                    >
                      {/* Estado */}
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={isCompleted 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-semibold" 
                            : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-semibold"}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 mr-1 inline" />
                          )}
                          {isCompleted ? "Aprobado" : "Pendiente"}
                        </Badge>
                      </TableCell>

                      {/* Deportista */}
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                          {notif.athlete}
                          {!notif.revisado && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" title="Nuevo sin revisar" />
                          )}
                        </div>
                      </TableCell>

                      {/* Concepto */}
                      <TableCell className="text-xs text-slate-600 dark:text-zinc-300">
                        {notif.concept}
                      </TableCell>

                      {/* Monto */}
                      <TableCell>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums text-sm">
                          {formatCurrency(notif.amount)}
                        </span>
                      </TableCell>

                      {/* Referencia */}
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs font-mono tabular-nums text-slate-700 dark:text-zinc-300">
                          <span className="truncate max-w-[150px]">{notif.txCode}</span>
                          <button
                            onClick={() => handleCopy(notif.txCode, notif.id)}
                            className="text-slate-400 hover:text-slate-900 dark:hover:text-zinc-100 p-1 rounded"
                            title="Copiar Referencia"
                          >
                            {copiedId === notif.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </TableCell>

                      {/* Método de Pago */}
                      <TableCell>
                        <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                          {notif.paymentMethod || "Wompi"}
                        </span>
                      </TableCell>

                      {/* Fecha */}
                      <TableCell className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
                        {notif.date}
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {notif.status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleApprovePending(notif)}
                              className="text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 h-7 px-2 font-semibold"
                              title="Aprobar pago y marcar deportista al día"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Aprobar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedReceipt(notif)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 h-7 px-2"
                            title="Ver detalles"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            Detalles
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleMarkAsReviewed(notif.id, notif.revisado || false)}
                            className={`text-xs h-7 px-2 ${
                              notif.revisado 
                                ? "text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300" 
                                : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 font-semibold"
                            }`}
                            title={notif.revisado ? "Marcar como no leído" : "Marcar como revisado"}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {notif.revisado ? "Revisado" : "Visto"}
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

        {/* Vista Móvil (Tarjetas de Notificación) */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-zinc-800">
          {loading ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Cargando notificaciones...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
              No hay notificaciones con los filtros actuales.
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div key={notif.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={notif.status === "completed" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[10px]" 
                        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[10px]"}
                    >
                      {notif.status === "completed" ? "Aprobado" : "Pendiente"}
                    </Badge>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">{notif.date}</span>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums text-sm">
                    {formatCurrency(notif.amount)}
                  </span>
                </div>

                <div>
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">{notif.athlete}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{notif.concept}</p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-zinc-500 mt-0.5 truncate">
                    Ref: {notif.txCode}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-800 text-xs">
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">{notif.paymentMethod || "Wompi"}</span>
                  <div className="flex items-center gap-1">
                    {notif.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleApprovePending(notif)}
                        className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 h-7 text-xs px-2 font-semibold"
                      >
                        Aprobar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedReceipt(notif)}
                      className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 h-7 text-xs px-2"
                    >
                      Ver Comprobante
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal / Comprobante de Notificación Detallada */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-zinc-100 font-bold text-lg">
                <CreditCard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Detalle de Transacción</span>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="bg-slate-50 dark:bg-zinc-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500 dark:text-zinc-400">Estado</span>
                  <Badge
                    className={
                      selectedReceipt.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                    }
                  >
                    {selectedReceipt.status === "completed" ? "Aprobado y Verificado" : "Pendiente de Revisión"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500 dark:text-zinc-400">Monto Cancelado</span>
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    {formatCurrency(selectedReceipt.amount)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500 dark:text-zinc-400">Deportista:</span>
                  <span className="font-semibold text-slate-900 dark:text-zinc-100">{selectedReceipt.athlete}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500 dark:text-zinc-400">Concepto:</span>
                  <span className="text-slate-700 dark:text-zinc-300">{selectedReceipt.concept}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500 dark:text-zinc-400">Referencia Única:</span>
                  <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">{selectedReceipt.txCode}</span>
                </div>
                {selectedReceipt.wompiTxId && (
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-zinc-800">
                    <span className="text-slate-500 dark:text-zinc-400">ID Wompi:</span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-zinc-300">{selectedReceipt.wompiTxId}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-zinc-800">
                  <span className="text-slate-500 dark:text-zinc-400">Método:</span>
                  <span className="text-slate-700 dark:text-zinc-300">{selectedReceipt.paymentMethod || "Wompi Widget"}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500 dark:text-zinc-400">Fecha y Hora:</span>
                  <span className="text-slate-700 dark:text-zinc-300 tabular-nums">{selectedReceipt.date}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Link
                to="/athletes"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                onClick={() => setSelectedReceipt(null)}
              >
                <Users className="w-3.5 h-3.5" />
                Ver en Deportistas
              </Link>
              <div className="flex items-center gap-2">
                {selectedReceipt.status === "pending" && (
                  <Button
                    onClick={async () => {
                      await handleApprovePending(selectedReceipt);
                      setSelectedReceipt(null);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                  >
                    Aprobar Pago
                  </Button>
                )}
                <Button
                  onClick={() => setSelectedReceipt(null)}
                  className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-xs"
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
