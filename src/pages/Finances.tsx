import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  db,
  mergeFinancesData,
  saveFinanceTransaction,
  deleteFinanceTransaction,
  mergeAthletesData,
  saveAthleteToDatabase
} from "@/lib/firebase";
import { 
  collection, 
  onSnapshot
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  DollarSign, 
  Download, 
  Plus, 
  Trash2, 
  RefreshCw, 
  X, 
  Database,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  CreditCard,
  Search,
  Send,
  MessageSquare,
  Eye,
  Activity,
  Pencil
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { seedInitialDataIfEmpty } from "@/lib/seedData";
import { PAYMENT_PLANS, getPlanDetails } from "@/lib/plans";
import {
  sanitizeColombianPhone,
  resolveAthleteDueDate,
  calculateAthleteDaysOverdue,
  buildOverdueMessagePreview,
  sendCobroMoraIndividual,
  sendCobroMoraMasivo,
  pingWhatsAppBot,
  type MassiveCobroSummary
} from "@/lib/whatsappMoraService";

export type FinancialStatus = "Al día" | "Pago parcial" | "En mora";

export interface AthleteFinancialItem {
  id: string;
  name: string;
  documento?: string;
  plan?: string;
  category?: string;
  group?: string;
  phone?: string;
  email?: string;
  status: "Activo" | "Inactivo";
  financialStatus: FinancialStatus;
  estado_pago?: "al_dia" | "pago_parcial" | "en_mora" | "pendiente";
  fechaVencimiento?: string;
  valorPendiente?: number;
  valorAbonado?: number;
  ultimoRecordatorioEnviado?: string | null;
  lastPaymentDate?: string;
  lastPaymentReference?: string;
}

export interface Transaction {
  id: string;
  txCode: string;
  date: string;
  athlete: string;
  athleteId?: string;
  type: "income" | "expense";
  amount: number;
  status: "completed" | "pending";
  concept: string;
  paymentMethod?: string;
}

export default function Finances() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [athletes, setAthletes] = useState<AthleteFinancialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [activeTab, setActiveTab] = useState<"cartera" | "transacciones">("cartera");
  const [statusFilter, setStatusFilter] = useState<"all" | FinancialStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Estados para Bot de Cobranza por WhatsApp (Baileys)
  const [sendingIndividualId, setSendingIndividualId] = useState<string | null>(null);
  const [sendingMassive, setSendingMassive] = useState(false);
  const [pingingBot, setPingingBot] = useState(false);
  const [massiveSummary, setMassiveSummary] = useState<MassiveCobroSummary | null>(null);
  const [botFeedback, setBotFeedback] = useState<{
    type: "success" | "error";
    text: string;
    details?: string[];
  } | null>(null);
  const [toastAlert, setToastAlert] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [previewAthleteModal, setPreviewAthleteModal] = useState<AthleteFinancialItem | null>(null);

  // Modal interactivo cuando se selecciona "Pago parcial" para definir cuánto abonó y cuánto falta
  const [partialPaymentTarget, setPartialPaymentTarget] = useState<AthleteFinancialItem | null>(null);
  const [partialPaymentForm, setPartialPaymentForm] = useState({
    planTotal: 150000,
    valorAbonado: "",
    valorPendiente: ""
  });

  const showToast = (type: "success" | "error", title: string, message: string) => {
    setToastAlert({ type, title, message });
    setTimeout(() => {
      setToastAlert((prev) => (prev?.message === message ? null : prev));
    }, 9000);
  };

  // Modal para Registro Rápido de Pago a Deportista
  const [selectedAthleteForPayment, setSelectedAthleteForPayment] = useState<AthleteFinancialItem | null>(null);
  const [athletePaymentData, setAthletePaymentData] = useState({
    amount: "",
    concept: "Mensualidad",
    outcomeStatus: "Al día" as FinancialStatus,
    paymentMethod: "Efectivo / Transferencia"
  });

  // Modal para Edición Rápida de Datos del Deportista desde Cartera
  const [editingAthleteInCartera, setEditingAthleteInCartera] = useState<AthleteFinancialItem | null>(null);
  const [editAthleteForm, setEditAthleteForm] = useState({
    name: "",
    documento: "",
    phone: "",
    email: "",
    plan: "Plan Alfa",
    group: "Selección A",
    fechaVencimiento: "",
    valorPendiente: "",
    financialStatus: "Al día" as FinancialStatus
  });

  // Estado para Diálogo de Eliminación de Transacción
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; concept: string; amount: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State para Transacción General
  const [formData, setFormData] = useState({
    athlete: "",
    type: "income" as "income" | "expense",
    amount: "",
    concept: "Mensualidad",
    status: "completed" as "completed" | "pending"
  });

  // 1. Listener en tiempo real de transacciones unificado con base de datos y almacenamiento local
  useEffect(() => {
    let rawFirestoreFinances: any[] = [];

    const syncFinances = () => {
      const merged = mergeFinancesData(rawFirestoreFinances);
      setTransactions(merged as Transaction[]);
      setLoading(false);
    };

    syncFinances();

    const unsubscribe = onSnapshot(
      collection(db, "finances"),
      (snapshot) => {
        rawFirestoreFinances = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        syncFinances();
      },
      () => {
        syncFinances();
      }
    );

    const handleLocalUpdate = () => syncFinances();
    window.addEventListener("soul-finances-updated", handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener("soul-finances-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
    };
  }, []);

  // 2. Listener en tiempo real de deportistas y su estado de cartera unificado
  useEffect(() => {
    let rawFirestoreAthletes: any[] = [];

    const syncAthletes = () => {
      const unified = mergeAthletesData(rawFirestoreAthletes);
      const list: AthleteFinancialItem[] = unified.map((d: any) => {
        const rawStatus = d.financialStatus as FinancialStatus;
        const estadoPago = d.estado_pago;

        let resolvedStatus: FinancialStatus = "Al día";
        if (rawStatus === "Pago parcial" || estadoPago === "pago_parcial") {
          resolvedStatus = "Pago parcial";
        } else if (rawStatus === "En mora" || estadoPago === "en_mora" || estadoPago === "pendiente") {
          resolvedStatus = "En mora";
        } else if (rawStatus === "Al día" || estadoPago === "al_dia") {
          resolvedStatus = "Al día";
        } else if (d.status === "Inactivo") {
          resolvedStatus = "En mora";
        }

        const rawPhone = d.telefono || d.celular || d.whatsapp || d.phone || "";

        return {
          id: d.id,
          name: d.name || d.nombres || "Sin Nombre",
          documento: d.documento || d.numeroIdentidad || d.cedula || d.identificacion || d.idNumber || "",
          plan: d.plan || "Plan Alfa",
          category: d.category || "General",
          group: d.group || "Club",
          phone: rawPhone,
          email: d.email || "",
          status: d.status || "Activo",
          financialStatus: resolvedStatus,
          estado_pago: estadoPago,
          fechaVencimiento: d.fechaVencimiento || d.dueDate || "",
          valorPendiente: d.valorPendiente !== undefined && d.valorPendiente !== null ? Number(d.valorPendiente) : undefined,
          valorAbonado: d.valorAbonado !== undefined && d.valorAbonado !== null ? Number(d.valorAbonado) : undefined,
          ultimoRecordatorioEnviado: d.ultimoRecordatorioEnviado || null,
          lastPaymentDate: d.lastPaymentDate || "",
          lastPaymentReference: d.lastPaymentReference || ""
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setAthletes(list);
      setLoadingAthletes(false);
    };

    syncAthletes();

    const unsubscribe = onSnapshot(
      collection(db, "athletes"),
      (snapshot) => {
        rawFirestoreAthletes = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        syncAthletes();
      },
      () => {
        syncAthletes();
      }
    );

    const handleLocalUpdate = () => syncAthletes();
    window.addEventListener("soul-athletes-updated", handleLocalUpdate);
    window.addEventListener("storage", handleLocalUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener("soul-athletes-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleLocalUpdate);
    };
  }, []);

  // Métricas financieras globales
  const totalIncome = useMemo(() => {
    return transactions
      .filter((t) => t.type === "income" && t.status === "completed")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [transactions]);

  // Desglose de deportistas por estado de pago
  const paidAthletes = useMemo(() => {
    return athletes.filter((a) => a.financialStatus === "Al día");
  }, [athletes]);

  const partialAthletes = useMemo(() => {
    return athletes.filter((a) => a.financialStatus === "Pago parcial");
  }, [athletes]);

  const moraAthletes = useMemo(() => {
    return athletes.filter((a) => a.financialStatus === "En mora" || a.financialStatus === "Pago parcial");
  }, [athletes]);

  // Lista filtrada de deportistas para la tabla
  const filteredAthletes = useMemo(() => {
    return athletes.filter((a) => {
      if (statusFilter !== "all" && a.financialStatus !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = a.name.toLowerCase().includes(q);
        const docMatch = a.documento ? a.documento.toLowerCase().includes(q) : false;
        const planMatch = a.plan ? a.plan.toLowerCase().includes(q) : false;
        const categoryMatch = a.category ? a.category.toLowerCase().includes(q) : false;
        return nameMatch || docMatch || planMatch || categoryMatch;
      }
      return true;
    });
  }, [athletes, statusFilter, searchQuery]);

  // Abrir modal para configurar el abono y el saldo restante de un Pago Parcial
  const openPartialPaymentConfigModal = (athlete: AthleteFinancialItem) => {
    const planInfo = getPlanDetails(athlete.plan || "Plan Alfa");
    const planTotal = planInfo?.normalPrice || 150000;
    const currentAbono =
      athlete.valorAbonado && athlete.valorAbonado > 0
        ? athlete.valorAbonado
        : athlete.valorPendiente && athlete.valorPendiente < planTotal
        ? planTotal - athlete.valorPendiente
        : Math.round(planTotal / 2);
    const currentPendiente = Math.max(0, planTotal - currentAbono);

    setPartialPaymentTarget(athlete);
    setPartialPaymentForm({
      planTotal,
      valorAbonado: String(currentAbono),
      valorPendiente: String(currentPendiente)
    });
  };

  // Guardar configuración de Pago Parcial (Abono + Saldo que falta por hacer)
  const handleSavePartialPaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partialPaymentTarget) return;

    const abonadoNum = Math.max(0, Number(partialPaymentForm.valorAbonado) || 0);
    const pendienteNum = Math.max(0, Number(partialPaymentForm.valorPendiente) || 0);

    if (pendienteNum <= 0) {
      showToast("error", "Saldo inválido", "Ingresa el valor que falta por pagar (mayor a $0).");
      return;
    }

    try {
      setSubmitting(true);
      await saveAthleteToDatabase(
        {
          ...partialPaymentTarget,
          financialStatus: "Pago parcial",
          estado_pago: "pago_parcial",
          valorAbonado: abonadoNum,
          valorPendiente: pendienteNum
        },
        partialPaymentTarget
      );

      showToast(
        "success",
        "Pago parcial registrado",
        `${partialPaymentTarget.name}: Abonó ${formatCurrency(abonadoNum)} — Falta por pagar ${formatCurrency(pendienteNum)}.`
      );
      setPartialPaymentTarget(null);
    } catch (err: any) {
      console.error("Error al guardar pago parcial:", err);
      showToast("error", "Error al guardar", err?.message || "No se pudo guardar el pago parcial.");
    } finally {
      setSubmitting(false);
    }
  };

  // Actualizar estado financiero de un deportista directamente en la base de datos
  const handleUpdateAthleteStatus = async (athlete: AthleteFinancialItem, newStatus: FinancialStatus) => {
    // Si selecciona "Pago parcial", abrimos el modal para indicar cuánto abonó y cuánto le falta por pagar
    if (newStatus === "Pago parcial") {
      openPartialPaymentConfigModal(athlete);
      return;
    }

    try {
      const planInfo = getPlanDetails(athlete.plan || "Plan Alfa");
      const planTotal = planInfo?.normalPrice || 150000;

      await saveAthleteToDatabase(
        {
          ...athlete,
          financialStatus: newStatus,
          estado_pago: newStatus === "Al día" ? "al_dia" : "en_mora",
          valorAbonado: 0,
          valorPendiente: newStatus === "Al día" ? 0 : planTotal
        },
        athlete
      );
    } catch (err) {
      console.error("Error al actualizar estado financiero:", err);
    }
  };

  // Diagnóstico rápido al servidor de Oracle (GET /api/whatsapp/ping)
  const handlePingOracleBot = async () => {
    try {
      setPingingBot(true);
      setBotFeedback(null);
      const ping = await pingWhatsAppBot();
      const target = ping.targetUrl || ping.endpoint || "http://193.122.218.65:3000/send-message";
      if (ping.reachable || ping.ok) {
        const msg = ping.diagnosis || `Conexión exitosa con Oracle (${target}) en ${ping.latencyMs}ms — HTTP ${ping.httpStatus}`;
        setBotFeedback({ type: "success", text: msg });
        showToast("success", "Puerto 3000 de Oracle responde", msg);
      } else {
        const msg = ping.diagnosis || ping.error || `Fallo al conectar con ${target} (${ping.latencyMs}ms)`;
        setBotFeedback({
          type: "error",
          text: msg,
          details: ping.errorCode ? [`Código de diagnóstico: ${ping.errorCode}`] : undefined
        });
        showToast("error", "Fallo en Ping a Oracle (Puerto 3000)", msg);
      }
    } catch (err: any) {
      const msg = err?.message || "No se pudo ejecutar el ping de diagnóstico";
      setBotFeedback({ type: "error", text: `Error en ping: ${msg}` });
      showToast("error", "Error de Diagnóstico", msg);
    } finally {
      setPingingBot(false);
    }
  };

  // Enviar recordatorio individual de mora vía Bot Baileys (POST /api/whatsapp/cobro-mora-individual)
  const handleSendIndividualCobro = async (athlete: AthleteFinancialItem) => {
    const cleanPhone = sanitizeColombianPhone(athlete.phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      const msg = `${athlete.name} no tiene un número de teléfono válido registrado (${athlete.phone || "vacío"}).`;
      setBotFeedback({
        type: "error",
        text: msg
      });
      showToast("error", "Teléfono inválido", msg);
      return;
    }

    try {
      setSendingIndividualId(athlete.id);
      setBotFeedback(null);
      const res = await sendCobroMoraIndividual(athlete.id, athlete);
      if (res.ultimoRecordatorioEnviado) {
        await saveAthleteToDatabase(
          {
            ...athlete,
            ultimoRecordatorioEnviado: res.ultimoRecordatorioEnviado
          },
          athlete
        );
      }
      const successMsg = `Recordatorio enviado por WhatsApp a ${res.nombres} (${res.telefono}).`;
      setBotFeedback({
        type: "success",
        text: successMsg
      });
      showToast("success", "Cobro individual enviado", successMsg);
    } catch (err: any) {
      const errorMsg = err?.message || "Verifica la conexión con el bot Baileys";
      setBotFeedback({
        type: "error",
        text: `Error al enviar a ${athlete.name} (${cleanPhone}): ${errorMsg}`
      });
      showToast("error", `Fallo al enviar a ${athlete.name}`, errorMsg);
    } finally {
      setSendingIndividualId(null);
    }
  };

  // Enviar recordatorio masivo con regla anti-baneo (7 a 12 segundos entre mensajes)
  const handleSendMassiveCobro = async () => {
    if (moraAthletes.length === 0) return;
    const confirmMsg = `Se enviarán recordatorios de cobro por WhatsApp a ${moraAthletes.length} deportista(s) en mora con una pausa anti-baneo de 7 a 12 segundos entre cada mensaje.\n\n¿Deseas iniciar el envío masivo?`;
    if (!confirm(confirmMsg)) return;

    try {
      setSendingMassive(true);
      setMassiveSummary(null);
      setBotFeedback(null);
      const summary = await sendCobroMoraMasivo(moraAthletes);
      setMassiveSummary(summary);

      // Persistir la marca de tiempo de último recordatorio enviado para los exitosos
      for (const det of summary.detalles || []) {
        if (det.estado === "ENVIADO" && det.ultimoRecordatorioEnviado) {
          const targetAth = athletes.find((a) => a.id === det.deportistaId);
          if (targetAth) {
            await saveAthleteToDatabase(
              {
                ...targetAth,
                ultimoRecordatorioEnviado: det.ultimoRecordatorioEnviado
              },
              targetAth
            );
          }
        }
      }

      const failedDetails =
        summary.erroresResumen && summary.erroresResumen.length > 0
          ? summary.erroresResumen
          : (summary.detalles || [])
              .filter((d) => d.estado === "FALLIDO")
              .map((d) => `${d.nombres} (${d.telefono || "sin tel"}): ${d.error || "Error desconocido"}`);

      if (summary.fallidos > 0) {
        const firstError = summary.ultimoError || failedDetails[0] || "El servidor de Oracle rechazó o no respondió la petición.";
        setBotFeedback({
          type: "error",
          text: `Envío masivo finalizado: ${summary.exitosos} exitosos, ${summary.fallidos} fallidos de ${summary.total} en mora. Causa: ${firstError}`,
          details: failedDetails
        });
        showToast(
          "error",
          `Envío con ${summary.fallidos} fallo(s)`,
          firstError
        );
      } else {
        const okMsg = `Envío masivo finalizado con éxito: ${summary.exitosos} de ${summary.total} recordatorios entregados.`;
        setBotFeedback({
          type: "success",
          text: okMsg
        });
        showToast("success", "Envío masivo completado", okMsg);
      }
    } catch (err: any) {
      const errorReason = err?.message || "No se pudo completar el despacho";
      setBotFeedback({
        type: "error",
        text: `Error crítico en envío masivo: ${errorReason}`
      });
      showToast("error", "Error en envío masivo", errorReason);
    } finally {
      setSendingMassive(false);
    }
  };

  // Abrir modal de edición de datos del deportista desde Cartera
  const handleOpenEditAthleteFromCartera = (athlete: AthleteFinancialItem) => {
    setEditingAthleteInCartera(athlete);
    setEditAthleteForm({
      name: athlete.name || "",
      documento: athlete.documento || "",
      phone: athlete.phone || "",
      email: athlete.email || "",
      plan: athlete.plan || "Plan Alfa",
      group: athlete.group || "Selección A",
      fechaVencimiento: athlete.fechaVencimiento || "",
      valorPendiente:
        athlete.valorPendiente !== undefined && athlete.valorPendiente !== null
          ? String(athlete.valorPendiente)
          : "",
      financialStatus: athlete.financialStatus || "Al día"
    });
  };

  // Guardar datos editados del deportista desde Cartera
  const handleSaveEditedAthleteFromCartera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAthleteInCartera || !editAthleteForm.name.trim()) return;

    try {
      setSubmitting(true);
      const cleanPhone = editAthleteForm.phone.trim();
      const planInfo = getPlanDetails(editAthleteForm.plan || "Plan Alfa");
      const planTotal = planInfo?.normalPrice || 150000;
      const customPending = editAthleteForm.valorPendiente.trim()
        ? Number(editAthleteForm.valorPendiente)
        : null;

      const estadoPagoCode =
        editAthleteForm.financialStatus === "Al día"
          ? "al_dia"
          : editAthleteForm.financialStatus === "Pago parcial"
          ? "pago_parcial"
          : "en_mora";

      const resolvedPending =
        editAthleteForm.financialStatus === "Al día"
          ? 0
          : customPending !== null
          ? customPending
          : editAthleteForm.financialStatus === "Pago parcial"
          ? Math.round(planTotal / 2)
          : planTotal;

      const resolvedAbono =
        editAthleteForm.financialStatus === "Pago parcial"
          ? Math.max(0, planTotal - resolvedPending)
          : 0;

      await saveAthleteToDatabase(
        {
          ...editingAthleteInCartera,
          name: editAthleteForm.name.trim(),
          nombres: editAthleteForm.name.trim(),
          documento: editAthleteForm.documento.trim(),
          phone: cleanPhone,
          telefono: cleanPhone,
          email: editAthleteForm.email.trim(),
          plan: editAthleteForm.plan,
          group: editAthleteForm.group,
          fechaVencimiento: editAthleteForm.fechaVencimiento.trim() || null,
          valorPendiente: resolvedPending,
          valorAbonado: resolvedAbono,
          financialStatus: editAthleteForm.financialStatus,
          estado_pago: estadoPagoCode
        },
        editingAthleteInCartera
      );

      showToast(
        "success",
        "Datos actualizados",
        `Se guardaron los datos de ${editAthleteForm.name.trim()} correctamente.`
      );
      setEditingAthleteInCartera(null);
    } catch (err: any) {
      console.error("Error al editar deportista desde Cartera:", err);
      showToast("error", "Error al guardar", err?.message || "No se pudo actualizar el deportista.");
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir modal de pago rápido para un deportista
  const handleOpenAthletePayment = (athlete: AthleteFinancialItem) => {
    const planInfo = getPlanDetails(athlete.plan || "Plan Alfa");
    const isProntoPago = new Date().getDate() <= 5;
    const currentFee = isProntoPago ? (planInfo?.prontoPagoPrice || 135000) : (planInfo?.normalPrice || 150000);

    setSelectedAthleteForPayment(athlete);
    setAthletePaymentData({
      amount: String(currentFee),
      concept: `Mensualidad - ${planInfo?.name || athlete.plan || "Plan Alfa"}`,
      outcomeStatus: "Al día",
      paymentMethod: "Efectivo / Transferencia"
    });
  };

  // Guardar pago rápido de deportista
  const handleSaveAthletePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAthleteForPayment) return;

    try {
      setSubmitting(true);
      const parsedAmount = parseInt(athletePaymentData.amount.replace(/\D/g, ""), 10) || 0;
      const todayFormatted = new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date());

      const nextCode = `SOUL-PAY-${Date.now().toString().slice(-6)}`;

      await saveFinanceTransaction({
        txCode: nextCode,
        date: todayFormatted,
        athlete: selectedAthleteForPayment.name,
        athleteId: selectedAthleteForPayment.id,
        type: "income",
        amount: parsedAmount,
        status: "completed",
        concept: athletePaymentData.concept.trim(),
        paymentMethod: athletePaymentData.paymentMethod
      });

      const planInfo = getPlanDetails(selectedAthleteForPayment.plan || "Plan Alfa");
      const planTotal = planInfo?.normalPrice || 150000;
      const isPartialOutcome = athletePaymentData.outcomeStatus === "Pago parcial";
      const estadoPagoCode =
        athletePaymentData.outcomeStatus === "Al día"
          ? "al_dia"
          : isPartialOutcome
          ? "pago_parcial"
          : "en_mora";

      const prevAbonado = Number(selectedAthleteForPayment.valorAbonado || 0);
      const totalAbonado = isPartialOutcome ? prevAbonado + parsedAmount : 0;
      const remainingPending =
        athletePaymentData.outcomeStatus === "Al día"
          ? 0
          : isPartialOutcome
          ? Math.max(0, planTotal - totalAbonado)
          : planTotal;

      await saveAthleteToDatabase(
        {
          ...selectedAthleteForPayment,
          financialStatus: athletePaymentData.outcomeStatus,
          estado_pago: estadoPagoCode,
          valorAbonado: totalAbonado,
          valorPendiente: remainingPending,
          lastPaymentDate: todayFormatted,
          lastPaymentReference: nextCode
        },
        selectedAthleteForPayment
      );

      showToast(
        "success",
        "Pago registrado",
        `Se registró el pago de ${formatCurrency(parsedAmount)} para ${selectedAthleteForPayment.name}.`
      );
      setSelectedAthleteForPayment(null);
    } catch (err) {
      console.error("Error al registrar pago del deportista:", err);
      showToast("error", "Error al guardar", "No se pudo registrar el pago.");
    } finally {
      setSubmitting(false);
    }
  };

  // Registrar Transacción General
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.athlete.trim() || !formData.amount) return;

    try {
      setSubmitting(true);
      const parsedAmount = parseInt(formData.amount.replace(/\D/g, ""), 10) || 0;
      const todayFormatted = new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date());

      const nextCode = `TX-${String(transactions.length + 1).padStart(3, "0")}`;

      await saveFinanceTransaction({
        txCode: nextCode,
        date: todayFormatted,
        athlete: formData.athlete.trim(),
        type: formData.type,
        amount: parsedAmount,
        status: formData.status,
        concept: formData.concept.trim()
      });

      setFormData({
        athlete: "",
        type: "income",
        amount: "",
        concept: "Mensualidad",
        status: "completed"
      });
      setIsModalOpen(false);
      showToast("success", "Movimiento registrado", `Se registró el movimiento ${nextCode} correctamente.`);
    } catch (err) {
      console.error("Error al registrar transacción:", err);
      showToast("error", "Error al guardar", "No se pudo guardar el movimiento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (tx: Transaction) => {
    try {
      const newStatus = tx.status === "completed" ? "pending" : "completed";
      await saveFinanceTransaction(
        {
          ...tx,
          status: newStatus
        },
        tx.id
      );
    } catch (err) {
      console.error("Error al actualizar estado:", err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteFinanceTransaction({ id: deleteTarget.id });
      setDeleteTarget(null);
      showToast("success", "Registro eliminado", "El movimiento financiero fue eliminado.");
    } catch (err) {
      console.error("Error al eliminar:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCSV = () => {
    if (activeTab === "cartera") {
      if (athletes.length === 0) return;
      const headers = "Nombre,Documento,Telefono,Categoría,Grupo,Plan,Estado Financiero,Ultimo Recordatorio,Último Pago\n";
      const rows = athletes.map((a) => 
        `"${a.name}","${a.documento || ''}","${sanitizeColombianPhone(a.phone)}","${a.category}","${a.group}","${a.plan}","${a.financialStatus}","${a.ultimoRecordatorioEnviado || ''}","${a.lastPaymentDate || 'Sin registro'}"`
      ).join("\n");

      const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Cartera_Deportistas_SOUL_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (transactions.length === 0) return;
      const headers = "Código,Fecha,Deportista/Entidad,Concepto,Tipo,Monto,Estado\n";
      const rows = transactions.map((t) => 
        `"${t.txCode}","${t.date}","${t.athlete}","${t.concept}","${t.type === "income" ? "Ingreso" : "Gasto"}",${t.amount},"${t.status === "completed" ? "Completado" : "Pendiente"}"`
      ).join("\n");

      const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Transacciones_SOUL_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleSeed = async () => {
    setLoading(true);
    await seedInitialDataIfEmpty(true);
    setLoading(false);
  };

  const formatReminderTimestamp = (iso?: string | null) => {
    if (!iso) return null;
    try {
      return new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
            Finanzas y Cartera Deportiva
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1 text-xs sm:text-sm">
            Control en vivo de pagos, detección de mora y cobro automatizado por Bot de WhatsApp.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {transactions.length === 0 && !loading && (
            <Button
              variant="outline"
              onClick={handleSeed}
            >
              <Database className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
              Cargar Demo
            </Button>
          )}

          <Link to="/coaches?tab=hours" className="flex-1 sm:flex-none">
            <Button
              type="button"
              variant="outline"
              className="w-full text-xs gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Horas Profes</span>
            </Button>
          </Link>

          <Button 
            variant="outline" 
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none text-xs"
          >
            Exportar CSV
            <Download className="w-4 h-4 ml-2" />
          </Button>

          <Button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 sm:flex-none text-xs font-semibold"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo Movimiento
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI de Estado de Cartera (2x2 en celular, 4 en escritorio) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div 
          onClick={() => {
            setActiveTab("cartera");
            setStatusFilter("Al día");
          }}
          className={`agy-card agy-card-interactive p-5 cursor-pointer ${
            activeTab === "cartera" && statusFilter === "Al día"
              ? "ring-2 ring-emerald-500/60"
              : ""
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Al Día</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{paidAthletes.length}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 truncate tabular-nums">
            {athletes.length > 0 ? `${Math.round((paidAthletes.length / athletes.length) * 100)}% al día` : "Sin registros"}
          </p>
        </div>

        <div 
          onClick={() => {
            setActiveTab("cartera");
            setStatusFilter("Pago parcial");
          }}
          className={`agy-card agy-card-interactive p-5 cursor-pointer ${
            activeTab === "cartera" && statusFilter === "Pago parcial"
              ? "ring-2 ring-amber-500/60"
              : ""
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Pago Parcial</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">{partialAthletes.length}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 truncate">Abonos con saldo</p>
        </div>

        <div 
          onClick={() => {
            setActiveTab("cartera");
            setStatusFilter("En mora");
          }}
          className={`agy-card agy-card-interactive p-5 cursor-pointer ${
            activeTab === "cartera" && statusFilter === "En mora"
              ? "ring-2 ring-rose-500/60"
              : ""
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">En Mora</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100">
            {athletes.filter((a) => a.financialStatus === "En mora").length}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 truncate">Pendientes de cobro</p>
        </div>

        <div 
          onClick={() => setActiveTab("transacciones")}
          className={`agy-card agy-card-interactive p-5 cursor-pointer ${
            activeTab === "transacciones"
              ? "ring-2 ring-indigo-500/60"
              : ""
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Recaudado</span>
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-zinc-100 truncate">{formatCurrency(totalIncome)}</p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-1.5 truncate tabular-nums">{transactions.length} movimientos</p>
        </div>
      </div>

      {/* TOAST TEMPORAL DE RETROALIMENTACIÓN DE ERRORES / ÉXITO DEL BOT */}
      {toastAlert && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-md w-full p-4 rounded-xl shadow-lg border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-3 ${
            toastAlert.type === "success"
              ? "bg-white dark:bg-zinc-900 border-emerald-200 dark:border-emerald-500/30 text-slate-900 dark:text-zinc-100"
              : "bg-white dark:bg-zinc-900 border-rose-200 dark:border-rose-500/30 text-slate-900 dark:text-zinc-100"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {toastAlert.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider">
                  {toastAlert.title}
                </p>
                <p className="text-xs leading-relaxed break-words text-slate-600 dark:text-zinc-400">
                  {toastAlert.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setToastAlert(null)}
              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* PANEL DE COBRANZA AUTOMATIZADA POR BOT DE WHATSAPP (BAILEYS) */}
      <div className="agy-card p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-zinc-100">
                  Bot de Cobro en Mora por WhatsApp (Baileys)
                </h2>
                <Badge variant="success" className="text-[10px] tabular-nums">
                  {moraAthletes.length} en mora detectados
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Sanitización estricta (573XXXXXXXXX), cálculo de días de retraso y envío con pausa anti-baneo (7 a 12s).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pingingBot}
              onClick={handlePingOracleBot}
              className="text-xs h-9 gap-1.5"
              title="Probar si el puerto 3000 del servidor Oracle responde"
            >
              <Activity className={`w-3.5 h-3.5 ${pingingBot ? "animate-pulse text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`} />
              <span>{pingingBot ? "Probando..." : "Ping Bot Oracle"}</span>
            </Button>

            {moraAthletes.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewAthleteModal(moraAthletes[0])}
                className="text-xs h-9 gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Ver Plantilla</span>
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              disabled={sendingMassive || moraAthletes.length === 0}
              onClick={handleSendMassiveCobro}
              className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold text-xs h-9 px-4 gap-1.5 shadow-xs tabular-nums"
            >
              {sendingMassive ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Enviando lote (pausa 7-12s)...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Cobro Masivo ({moraAthletes.length})</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Feedback detallado de envío individual, masivo o ping */}
        {botFeedback && (
          <div
            className={`px-3.5 py-2.5 rounded-lg text-xs font-medium space-y-1.5 border ${
              botFeedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400"
                : "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="break-words">{botFeedback.text}</span>
              <button onClick={() => setBotFeedback(null)} className="text-xs opacity-70 hover:opacity-100 shrink-0">
                ✕
              </button>
            </div>
            {botFeedback.details && botFeedback.details.length > 0 && (
              <ul className="list-disc list-inside text-[11px] font-mono opacity-90 space-y-0.5 pt-1 border-t border-rose-500/20">
                {botFeedback.details.map((detail, idx) => (
                  <li key={idx} className="break-words">{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {massiveSummary && (
          <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs tabular-nums">
            <div className="agy-surface-subtle p-2">
              <span className="text-slate-500 dark:text-zinc-400 block text-[10px]">TOTAL PROCESADOS</span>
              <strong className="text-slate-900 dark:text-zinc-100 text-sm">{massiveSummary.total}</strong>
            </div>
            <div className="agy-surface-subtle p-2">
              <span className="text-emerald-600 dark:text-emerald-400 block text-[10px]">EXITOSOS</span>
              <strong className="text-emerald-600 dark:text-emerald-400 text-sm">{massiveSummary.exitosos}</strong>
            </div>
            <div className="agy-surface-subtle p-2">
              <span className="text-rose-600 dark:text-rose-400 block text-[10px]">FALLIDOS</span>
              <strong className="text-rose-600 dark:text-rose-400 text-sm">{massiveSummary.fallidos}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Pestañas de Vista: Cartera vs Movimientos */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="grid grid-cols-2 sm:flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-900 p-1 rounded-lg border border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab("cartera")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 tabular-nums ${
              activeTab === "cartera"
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">Cartera ({athletes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("transacciones")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 tabular-nums ${
              activeTab === "transacciones"
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
            }`}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span className="truncate">Movimientos ({transactions.length})</span>
          </button>
        </div>

        {/* Buscador Contextual */}
        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-3" />
          <Input 
            placeholder={activeTab === "cartera" ? "Buscar deportista o documento..." : "Filtrar transacciones..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          VISTA 1: ESTADO DE CARTERA (PAGADOS, PAGO PARCIAL, EN MORA)
          ========================================================================= */}
      {activeTab === "cartera" && (
        <div className="space-y-4">
          
          {/* Botones de Filtro Rápido por Estado */}
          <div className="flex flex-wrap items-center gap-2 tabular-nums">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === "all"
                  ? "bg-indigo-600 dark:bg-indigo-500 text-white shadow-xs"
                  : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
              }`}
            >
              Todos ({athletes.length})
            </button>

            <button
              onClick={() => setStatusFilter("Al día")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
                statusFilter === "Al día"
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Al Día ({paidAthletes.length})
            </button>

            <button
              onClick={() => setStatusFilter("Pago parcial")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
                statusFilter === "Pago parcial"
                  ? "bg-amber-500 border-amber-500 text-white shadow-xs"
                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Parcial ({partialAthletes.length})
            </button>

            <button
              onClick={() => setStatusFilter("En mora")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
                statusFilter === "En mora"
                  ? "bg-rose-600 border-rose-600 text-white shadow-xs"
                  : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              En Mora ({athletes.filter((a) => a.financialStatus === "En mora").length})
            </button>
          </div>

          {/* Tabla de Cartera de Deportistas */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Deportista / Teléfono</TableHead>
                    <TableHead>Plan & Valor</TableHead>
                    <TableHead>Vencimiento / Mora</TableHead>
                    <TableHead>Estado Cartera</TableHead>
                    <TableHead>Último Recordatorio</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAthletes ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
                        Cargando cartera de deportistas...
                      </TableCell>
                    </TableRow>
                  ) : filteredAthletes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                        No se encontraron deportistas con el filtro seleccionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAthletes.map((athlete) => {
                      const planInfo = getPlanDetails(athlete.plan || "Plan Alfa");
                      const planTotal = planInfo?.normalPrice || 150000;
                      const isPartial = athlete.financialStatus === "Pago parcial";
                      const fee =
                        athlete.valorPendiente && athlete.valorPendiente > 0
                          ? athlete.valorPendiente
                          : isPartial && athlete.valorAbonado && athlete.valorAbonado > 0
                          ? Math.max(0, planTotal - athlete.valorAbonado)
                          : planTotal;
                      const abonado =
                        isPartial
                          ? athlete.valorAbonado && athlete.valorAbonado > 0
                            ? athlete.valorAbonado
                            : Math.max(0, planTotal - fee)
                          : 0;
                      const isOverdue = athlete.financialStatus === "En mora" || athlete.financialStatus === "Pago parcial";
                      const dueDate = resolveAthleteDueDate(athlete.fechaVencimiento);
                      const diasMora = isOverdue ? calculateAthleteDaysOverdue(dueDate) : 0;
                      const cleanPhone = sanitizeColombianPhone(athlete.phone);
                      const lastSentFormatted = formatReminderTimestamp(athlete.ultimoRecordatorioEnviado);

                      return (
                        <TableRow key={athlete.id}>
                          {/* Deportista y Teléfono Sanitizado */}
                          <TableCell>
                            <p className="font-semibold text-slate-900 dark:text-zinc-100 text-sm">{athlete.name}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] tabular-nums">
                              {cleanPhone ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">+{cleanPhone}</span>
                              ) : (
                                <span className="text-rose-500 italic">Sin teléfono</span>
                              )}
                              {athlete.group && (
                                <span className="text-slate-400 dark:text-zinc-500">• {athlete.group}</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Plan & Tarifa / Saldo de Pago Parcial */}
                          <TableCell className="tabular-nums">
                            <Badge variant="default" className="text-[11px]">
                              {planInfo?.name || athlete.plan || "Plan Alfa"}
                            </Badge>
                            {isPartial ? (
                              <div className="mt-1 space-y-0.5">
                                <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                  Abonó: {formatCurrency(abonado)}
                                </span>
                                <span className="block font-bold text-xs text-amber-600 dark:text-amber-400">
                                  Falta: {formatCurrency(fee)}
                                </span>
                              </div>
                            ) : (
                              <span className="block font-semibold text-xs text-slate-900 dark:text-zinc-100 mt-1">
                                {formatCurrency(fee)}
                              </span>
                            )}
                          </TableCell>

                          {/* Vencimiento y Días en Mora */}
                          <TableCell className="text-xs tabular-nums">
                            <span className="text-slate-700 dark:text-zinc-300 block">
                              Vence: {dueDate}
                            </span>
                            {isPartial ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-0.5">
                                Saldo parcial pendiente
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 mt-0.5">
                                {diasMora} {diasMora === 1 ? "día" : "días"} en mora
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Sin mora</span>
                            )}
                          </TableCell>

                          {/* Selector Interactivo de Estado Financiero */}
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <select
                                value={athlete.financialStatus}
                                onChange={(e) => handleUpdateAthleteStatus(athlete, e.target.value as FinancialStatus)}
                                className={`text-xs font-medium rounded-lg px-2.5 py-1.5 border outline-none cursor-pointer transition-colors ${
                                  athlete.financialStatus === "Al día"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                    : athlete.financialStatus === "Pago parcial"
                                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                                }`}
                              >
                                <option value="Al día" className="bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400">● Al día</option>
                                <option value="Pago parcial" className="bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400">● Pago parcial</option>
                                <option value="En mora" className="bg-white dark:bg-zinc-900 text-rose-600 dark:text-rose-400">● En mora</option>
                              </select>
                              {isPartial && (
                                <button
                                  type="button"
                                  onClick={() => openPartialPaymentConfigModal(athlete)}
                                  className="text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                                >
                                  ✎ Ajustar saldo parcial
                                </button>
                              )}
                            </div>
                          </TableCell>

                          {/* Último Recordatorio Enviado */}
                          <TableCell className="text-xs tabular-nums">
                            {lastSentFormatted ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium block">
                                ✓ {lastSentFormatted}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-zinc-500 italic text-[11px]">No enviado</span>
                            )}
                          </TableCell>

                          {/* Acciones: Bot Cobrar Mora + Registrar Pago */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isOverdue && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={sendingIndividualId === athlete.id || !cleanPhone}
                                    onClick={() => handleSendIndividualCobro(athlete)}
                                    className="border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-400 text-xs h-8 px-2.5 rounded-lg gap-1"
                                    title="Enviar recordatorio de mora por Bot de WhatsApp"
                                  >
                                    {sendingIndividualId === athlete.id ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Send className="w-3.5 h-3.5" />
                                    )}
                                    <span>Cobrar</span>
                                  </Button>

                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setPreviewAthleteModal(athlete)}
                                    className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                    title="Ver mensaje de cobro"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </>
                              )}

                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleOpenEditAthleteFromCartera(athlete)}
                                className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                title="Editar datos del deportista (teléfono, documento, plan, vencimiento)"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>

                              <Button
                                size="sm"
                                onClick={() => handleOpenAthletePayment(athlete)}
                                className="text-xs h-8 px-2.5 rounded-lg"
                                title="Registrar pago o abono"
                              >
                                <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                                <span>Pago</span>
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
          </div>
        </div>
      )}

      {/* =========================================================================
          VISTA 2: HISTORIAL DE TRANSACCIONES (MOVIMIENTOS FINANCIEROS)
          ========================================================================= */}
      {activeTab === "transacciones" && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-zinc-100 text-base">Libro Diario de Transacciones</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Ingresos de mensualidades y gastos operativos registrados.</p>
            </div>
            <span className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums font-medium">{transactions.length} registros</span>
          </div>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>ID / Fecha</TableHead>
                  <TableHead>Deportista / Entidad</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
                      Cargando finanzas...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-zinc-400">
                      No hay transacciones registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions
                    .filter((tx) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase().trim();
                      return tx.athlete?.toLowerCase().includes(q) ||
                             tx.concept?.toLowerCase().includes(q) ||
                             tx.txCode?.toLowerCase().includes(q);
                    })
                    .map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="tabular-nums">
                          <p className="font-semibold text-slate-900 dark:text-zinc-100 text-xs">{tx.txCode || "TX"}</p>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400">{tx.date}</p>
                        </TableCell>
                        <TableCell className="text-slate-900 dark:text-zinc-100 font-medium text-sm">{tx.athlete}</TableCell>
                        <TableCell className="text-slate-500 dark:text-zinc-400 text-sm">{tx.concept}</TableCell>
                        <TableCell>
                          <button onClick={() => handleToggleStatus(tx)} className="cursor-pointer">
                            <Badge 
                              variant={tx.status === "completed" ? "success" : "warning"}
                            >
                              {tx.status === "completed" ? "Completado" : "Pendiente"}
                            </Badge>
                          </button>
                        </TableCell>
                        <TableCell className={`text-right font-bold tabular-nums text-sm ${tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeleteTarget({ id: tx.id, concept: tx.concept, amount: tx.amount })}
                            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Modal Vista Previa de Mensaje de Cobro en Mora o Saldo Parcial (WhatsApp) */}
      {previewAthleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                      {previewAthleteModal.financialStatus === "Pago parcial"
                        ? "Plantilla A: Saldo de Pago Parcial"
                        : "Plantilla B: Cobro de Mora Total"}
                    </h3>
                    <Badge variant={previewAthleteModal.financialStatus === "Pago parcial" ? "warning" : "destructive"} className="text-[10px]">
                      {previewAthleteModal.financialStatus === "Pago parcial"
                        ? "Cobro de Saldo Restante"
                        : "Cobro de Mensualidad en Mora"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                    Destinatario: +{sanitizeColombianPhone(previewAthleteModal.phone) || "Sin número"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewAthleteModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <pre className="agy-surface-subtle p-4 text-xs text-slate-800 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
              {buildOverdueMessagePreview({
                nombres: previewAthleteModal.name,
                plan: previewAthleteModal.plan,
                valorPendiente: previewAthleteModal.valorPendiente,
                valorAbonado: previewAthleteModal.valorAbonado,
                esPagoParcial: previewAthleteModal.financialStatus === "Pago parcial",
                fechaVencimiento: previewAthleteModal.fechaVencimiento
              })}
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
              {previewAthleteModal.financialStatus === "Pago parcial" ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = previewAthleteModal;
                    setPreviewAthleteModal(null);
                    openPartialPaymentConfigModal(target);
                  }}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  ✎ Modificar valor que falta por pagar
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Cambia a &ldquo;Pago parcial&rdquo; en la tabla si ya hizo un abono.
                </span>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewAthleteModal(null)}
                  className="text-xs"
                >
                  Cerrar
                </Button>
                <Button
                  size="sm"
                  disabled={sendingIndividualId === previewAthleteModal.id}
                  onClick={async () => {
                    const target = previewAthleteModal;
                    setPreviewAthleteModal(null);
                    await handleSendIndividualCobro(target);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Ahora por Bot</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configurar Pago Parcial (Cuánto abonó y cuánto falta por pagar) */}
      {partialPaymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-6 relative space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  Configurar Pago Parcial
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-0.5 tabular-nums">
                  {partialPaymentTarget.name} • {partialPaymentTarget.plan || "Plan Alfa"} (Total: {formatCurrency(partialPaymentForm.planTotal)})
                </p>
              </div>
              <button
                onClick={() => setPartialPaymentTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePartialPaymentConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">
                    Abono Realizado ($ COP)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={partialPaymentForm.valorAbonado}
                    onChange={(e) => {
                      const abonoVal = e.target.value;
                      const abonoNum = Math.max(0, Number(abonoVal) || 0);
                      const restante = Math.max(0, partialPaymentForm.planTotal - abonoNum);
                      setPartialPaymentForm({
                        ...partialPaymentForm,
                        valorAbonado: abonoVal,
                        valorPendiente: String(restante)
                      });
                    }}
                    className="font-bold text-sm tabular-nums"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">Lo que ya pagó el deportista</span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-amber-600 dark:text-amber-400 block mb-1">
                    Falta por Pagar ($ COP) *
                  </label>
                  <Input
                    type="number"
                    required
                    min="1000"
                    step="1000"
                    value={partialPaymentForm.valorPendiente}
                    onChange={(e) => {
                      const faltaVal = e.target.value;
                      const faltaNum = Math.max(0, Number(faltaVal) || 0);
                      const abonoCalc = Math.max(0, partialPaymentForm.planTotal - faltaNum);
                      setPartialPaymentForm({
                        ...partialPaymentForm,
                        valorPendiente: faltaVal,
                        valorAbonado: String(abonoCalc)
                      });
                    }}
                    className="font-bold text-sm tabular-nums"
                  />
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">Valor que cobrará el Bot de WhatsApp</span>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 p-3 text-xs space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  El mensaje de WhatsApp se ajustará automáticamente:
                </p>
                <p className="text-slate-600 dark:text-zinc-300 tabular-nums">
                  Confirmará el abono de <strong>{formatCurrency(Number(partialPaymentForm.valorAbonado) || 0)}</strong> y cobrará únicamente el saldo restante de{" "}
                  <strong className="text-amber-700 dark:text-amber-400">{formatCurrency(Number(partialPaymentForm.valorPendiente) || 0)}</strong>.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPartialPaymentTarget(null)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="text-xs"
                >
                  {submitting ? "Guardando..." : "Guardar Pago Parcial"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Registrar Pago Rápido para un Deportista */}
      {selectedAthleteForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-6 relative space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Registrar Pago
                </h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{selectedAthleteForPayment.name}</p>
              </div>
              <button 
                onClick={() => setSelectedAthleteForPayment(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAthletePayment} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Monto Recibido ($ COP) *</label>
                <Input 
                  type="number"
                  required
                  value={athletePaymentData.amount}
                  onChange={(e) => setAthletePaymentData({ ...athletePaymentData, amount: e.target.value })}
                  className="font-bold text-base tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Concepto de Pago</label>
                <Input 
                  required
                  value={athletePaymentData.concept}
                  onChange={(e) => setAthletePaymentData({ ...athletePaymentData, concept: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Nuevo Estado</label>
                <select 
                  value={athletePaymentData.outcomeStatus}
                  onChange={(e) => setAthletePaymentData({ ...athletePaymentData, outcomeStatus: e.target.value as FinancialStatus })}
                  className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs font-medium text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="Al día">Al día (Pago Total)</option>
                  <option value="Pago parcial">Pago parcial (Abono)</option>
                  <option value="En mora">En mora</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button type="button" variant="outline" onClick={() => setSelectedAthleteForPayment(null)} className="text-xs">
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="text-xs">
                  {submitting ? "Guardando..." : "Confirmar Pago"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Transacción */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">¿Eliminar Transacción?</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-300 tabular-nums">
              ¿Eliminar permanentemente <strong className="text-slate-900 dark:text-zinc-100">{deleteTarget.concept}</strong> ({formatCurrency(deleteTarget.amount)})?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} className="text-xs">
                Cancelar
              </Button>
              <Button variant="destructive" disabled={isDeleting} onClick={handleConfirmDelete} className="text-xs">
                {isDeleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Movimiento General */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Registrar Movimiento</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Tipo</label>
                  <select 
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="income">Ingreso (Cobro)</option>
                    <option value="expense">Gasto (Egreso)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Estado</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="completed">Completado</option>
                    <option value="pending">Pendiente (Mora)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Deportista o Proveedor *</label>
                <Input 
                  required
                  placeholder="Ej: Carlos Ramírez" 
                  value={formData.athlete}
                  onChange={(e) => setFormData({ ...formData, athlete: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Monto ($ COP) *</label>
                  <Input 
                    type="number"
                    required
                    placeholder="150000" 
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Concepto</label>
                  <Input 
                    placeholder="Mensualidad" 
                    value={formData.concept}
                    onChange={(e) => setFormData({ ...formData, concept: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="text-xs">
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="text-xs">
                  {submitting ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edición Rápida de Deportista desde Cartera */}
      {editingAthleteInCartera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">
                  Modificar Datos del Deportista
                </h3>
              </div>
              <button
                onClick={() => setEditingAthleteInCartera(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedAthleteFromCartera} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Nombre Completo *</label>
                  <Input
                    required
                    value={editAthleteForm.name}
                    onChange={(e) => setEditAthleteForm({ ...editAthleteForm, name: e.target.value })}
                    placeholder="Nombre del deportista"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Documento (TI / CC)</label>
                  <Input
                    value={editAthleteForm.documento}
                    onChange={(e) => setEditAthleteForm({ ...editAthleteForm, documento: e.target.value })}
                    placeholder="1093496820"
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Teléfono / WhatsApp</label>
                  <Input
                    value={editAthleteForm.phone}
                    onChange={(e) => setEditAthleteForm({ ...editAthleteForm, phone: e.target.value })}
                    placeholder="3001234567"
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Correo Electrónico</label>
                  <Input
                    type="email"
                    value={editAthleteForm.email}
                    onChange={(e) => setEditAthleteForm({ ...editAthleteForm, email: e.target.value })}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Plan de Pago</label>
                  <select
                    value={editAthleteForm.plan}
                    onChange={(e) => setEditAthleteForm({ ...editAthleteForm, plan: e.target.value })}
                    className="w-full h-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {PAYMENT_PLANS.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} (${p.prontoPagoPrice / 1000}k pronto pago)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Grupo</label>
                  <Input
                    value={editAthleteForm.group}
                    onChange={(e) => setEditAthleteForm({ ...editAthleteForm, group: e.target.value })}
                    placeholder="Selección A / Formativo..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Estado Cartera</label>
                  <select
                    value={editAthleteForm.financialStatus}
                    onChange={(e) =>
                      setEditAthleteForm({
                        ...editAthleteForm,
                        financialStatus: e.target.value as FinancialStatus
                      })
                    }
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
                    value={editAthleteForm.fechaVencimiento}
                    onChange={(e) =>
                      setEditAthleteForm({ ...editAthleteForm, fechaVencimiento: e.target.value })
                    }
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">Valor Pendiente ($)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="Auto según plan"
                    value={editAthleteForm.valorPendiente}
                    onChange={(e) =>
                      setEditAthleteForm({ ...editAthleteForm, valorPendiente: e.target.value })
                    }
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAthleteInCartera(null)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="text-xs"
                >
                  {submitting ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
