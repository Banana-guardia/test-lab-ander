import React, { useEffect, useMemo, useState } from "react";
import { db, mergeAthletesData, sendPortalPaymentNotification } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import {
  PAYMENT_PLANS,
  PLANES_PAGO,
  getPlanDetails,
  getWompiPaymentLink,
  normalizePlanKey,
  isBasicPlan,
  type PaymentPlanInfo
} from "@/lib/plans";
import { buildOverdueMessagePreview, sanitizeColombianPhone } from "@/lib/whatsappMoraService";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  ExternalLink,
  Send,
  Search,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  MessageSquare,
  Sparkles,
  Check,
  Users,
  Calendar,
  Phone,
  Flame,
  Award,
  HeartHandshake,
  Trophy,
  MapPin,
  ArrowRight
} from "lucide-react";
import { seedAdditionalAthletes, initialAthletes } from "@/lib/seedData";

export interface AthletePaymentRecord {
  id: string;
  name: string;
  documento: string;
  email: string;
  phone: string;
  plan: string;
  group: string;
  category: string;
  financialStatus: "Al día" | "Pago parcial" | "En mora";
  estadoPago: string;
  valorPendiente: number;
  valorAbonado: number;
  lastPaymentDate?: string;
  lastPaymentReference?: string;
}

export interface PublicTournamentItem {
  id: string;
  name: string;
  categoryTag: string;
  description: string;
  price: number;
  wompiLink: string;
  active: boolean;
  date?: string;
  sede?: string;
}

const DEFAULT_PUBLIC_TOURNAMENTS: PublicTournamentItem[] = [
  {
    id: "torneo-1",
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
    id: "torneo-2",
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
    id: "torneo-3",
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

interface ScheduleItem {
  color: "yellow" | "pink" | "blue" | "green" | "orange" | "purple" | "white";
  time: string;
  category: string;
}

interface DaySchedule {
  day: string;
  items: ScheduleItem[];
}

const SCHEDULES: DaySchedule[] = [
  {
    day: "LUNES",
    items: [
      { color: "yellow", time: "4:00 PM – 5:30 PM", category: "INICIACIÓN MIXTA" },
      { color: "pink", time: "5:30 PM – 7:00 PM", category: "FUNDAMENTACIÓN U15" },
      { color: "blue", time: "7:00 PM – 8:00 PM", category: "ESPECIALIZACIÓN" }
    ]
  },
  {
    day: "MARTES",
    items: [
      { color: "pink", time: "5:00 PM – 7:00 PM", category: "INFANTIL FEMENINO U15" },
      { color: "blue", time: "7:00 PM – 8:30 PM", category: "TECNIFICACIÓN MASCULINA" },
      { color: "green", time: "8:30 PM – 10:00 PM", category: "MAYORES MASCULINOS" }
    ]
  },
  {
    day: "MIÉRCOLES",
    items: [
      { color: "orange", time: "4:00 PM – 5:30 PM", category: "INICIACIÓN MIXTA" },
      { color: "pink", time: "5:00 PM – 7:00 PM", category: "TECNIFICACIÓN FEMENINA" },
      { color: "yellow", time: "5:30 PM – 7:00 PM", category: "FUNDAMENTACIÓN U15" },
      { color: "purple", time: "6:30 PM – 8:30 PM", category: "MENORES Y JUVENIL FEMENINO U17" },
      { color: "pink", time: "8:00 PM – 10:00 PM", category: "SUB-21 Y MAYORES FEMENINO" }
    ]
  },
  {
    day: "JUEVES",
    items: [
      { color: "pink", time: "5:00 PM – 7:00 PM", category: "INFANTIL FEMENINO U15" },
      { color: "blue", time: "7:00 PM – 8:30 PM", category: "TECNIFICACIÓN MASCULINA" },
      { color: "green", time: "8:30 PM – 10:00 PM", category: "MAYORES MASCULINOS" }
    ]
  },
  {
    day: "VIERNES",
    items: [
      { color: "pink", time: "5:00 PM – 7:00 PM", category: "TECNIFICACIÓN FEMENINA" },
      { color: "purple", time: "6:30 PM – 8:30 PM", category: "MENORES Y JUVENIL FEMENINO U17" },
      { color: "pink", time: "8:00 PM – 10:00 PM", category: "SUB-21 Y MAYORES FEMENINO" }
    ]
  },
  {
    day: "SÁBADO Y DOMINGO",
    items: [
      { color: "yellow", time: "7:00 AM – 9:00 AM", category: "FUNDAMENTACIÓN SUB-18" },
      { color: "white", time: "9:00 AM – 10:30 AM", category: "FUNDAMENTACIÓN 2 MIXTA" },
      { color: "orange", time: "10:30 AM – 12:00 PM", category: "INICIACIÓN 2" }
    ]
  }
];

const PRICE_LIST = [
  {
    id: "basico",
    name: "Plan Básico",
    tag: "1 mes",
    classes: "8 clases",
    prontoPago: 95000,
    normal: 120000,
    athletesText: "1 deportista",
    isOnlinePayment: true
  },
  {
    id: "alfa",
    name: "Plan Alfa",
    tag: "1 mes",
    classes: "12 clases",
    prontoPago: 135000,
    normal: 150000,
    athletesText: "1 deportista",
    isOnlinePayment: false
  },
  {
    id: "beta",
    name: "Plan Beta",
    tag: "1 mes",
    classes: "16 clases",
    prontoPago: 155000,
    normal: 180000,
    athletesText: "1 deportista",
    isOnlinePayment: false
  },
  {
    id: "family",
    name: "Plan Family",
    tag: "1 mes",
    classes: "8 clases",
    prontoPago: 80000,
    normal: 120000,
    athletesText: "2 o más deportistas",
    isOnlinePayment: false,
    note: "Precio por cada deportista"
  },
  {
    id: "plus",
    name: "Plan Plus",
    tag: "2 meses",
    classes: "16 clases",
    prontoPago: 170000,
    normal: 200000,
    athletesText: "1 deportista",
    isOnlinePayment: false
  }
];

export type SpaceKey = "hero" | "horarios" | "precios" | "pagos" | "contacto";

const SPACES_NAV: { id: SpaceKey; label: string; shortLabel: string }[] = [
  { id: "hero", label: "1. El Club", shortLabel: "El Club" },
  { id: "horarios", label: "2. Horarios", shortLabel: "Horarios" },
  { id: "precios", label: "3. Precios y Planes", shortLabel: "Precios" },
  { id: "pagos", label: "4. Portal de Pagos", shortLabel: "Pagos" },
  { id: "contacto", label: "5. Contacto", shortLabel: "Contacto" }
];

function resolveInitialSpace(): SpaceKey {
  if (typeof window === "undefined") return "hero";
  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "hero" || hash === "horarios" || hash === "precios" || hash === "pagos" || hash === "contacto") {
    return hash as SpaceKey;
  }
  if (window.location.pathname.includes("portal-pagos")) {
    return "pagos";
  }
  return "hero";
}



export default function PortalPagosWompi() {
  // Vista activa independiente (cada espacio en su propia vista aislada sin tener que bajar por toda la página)
  const [activeSpace, setActiveSpace] = useState<SpaceKey>(resolveInitialSpace);

  // Sub-pestaña dentro del Portal de Pagos: "mensualidades" | "torneos"
  const [paymentSubTab, setPaymentSubTab] = useState<"mensualidades" | "torneos">("mensualidades");

  const [athletes, setAthletes] = useState<AthletePaymentRecord[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");

  // Torneos activos desde Firestore / LocalStorage
  const [tournaments, setTournaments] = useState<PublicTournamentItem[]>(DEFAULT_PUBLIC_TOURNAMENTS);

  // Enlaces de Wompi dinámicos (Firestore configuracion/planes_pago con fallback a PLANES_PAGO local)
  const [customPlanesLinks, setCustomPlanesLinks] = useState<Record<string, string>>(PLANES_PAGO);

  // Plan seleccionado para pago (por defecto "basico")
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>("basico");

  // Estado de copiado de mensaje
  const [copiedMessage, setCopiedMessage] = useState<boolean>(false);

  // Estado de alerta/notificación
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    title: string;
    description: string;
  } | null>(null);

  // Función para cambiar de espacio independiente y subir al inicio
  const navigateToSpace = (space: SpaceKey) => {
    setActiveSpace(space);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${space}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Escuchar cambios en el hash de la URL (por si el usuario usa enlaces con #horarios, #precios, #pagos, etc.)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (hash === "hero" || hash === "horarios" || hash === "precios" || hash === "pagos" || hash === "contacto") {
        setActiveSpace(hash as SpaceKey);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // 1. Cargar configuración de Firestore (`configuracion/planes_pago`) en tiempo real
  useEffect(() => {
    const unsubConfig = onSnapshot(
      doc(db, "configuracion", "planes_pago"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Record<string, string>;
          setCustomPlanesLinks((prev) => ({ ...prev, ...data }));
        }
      },
      (err) => {
        console.warn("Nota: No se encontró configuracion/planes_pago en Firestore, usando constantes locales:", err);
      }
    );
    return () => unsubConfig();
  }, []);

  // 1b. Cargar torneos desde Firestore (`tournaments`) + LocalStorage
  useEffect(() => {
    const getLocalTournaments = (): PublicTournamentItem[] => {
      try {
        return JSON.parse(localStorage.getItem("soul_local_tournaments") || "[]");
      } catch {
        return [];
      }
    };

    const unsubTournaments = onSnapshot(
      collection(db, "tournaments"),
      (snapshot) => {
        const list: PublicTournamentItem[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            name: d.name || "Torneo SOUL",
            categoryTag: d.categoryTag || "🏆 Torneo Oficial",
            description: d.description || "Evento competitivo oficial del Club de Voleibol SOUL.",
            price: Number(d.price || 65000),
            wompiLink: d.wompiLink || "https://checkout.nequi.wompi.co/l/xAbkDK",
            active: d.active !== false,
            date: d.date || "Próximamente",
            sede: d.sede || "Sede Oficial"
          });
        });

        const localList = getLocalTournaments();
        const existingNames = new Set(list.map((t) => t.name.toLowerCase().trim()));
        localList.forEach((lt) => {
          if (!existingNames.has((lt.name || "").toLowerCase().trim())) {
            list.push(lt);
          }
        });

        const activeOnly = list.filter((t) => t.active !== false);
        setTournaments(activeOnly.length > 0 ? activeOnly : DEFAULT_PUBLIC_TOURNAMENTS);
      },
      () => {
        const localList = getLocalTournaments();
        const combined = [...localList, ...DEFAULT_PUBLIC_TOURNAMENTS];
        const unique = Array.from(new Map(combined.map((t) => [t.name.toLowerCase().trim(), t])).values());
        setTournaments(unique.filter((t) => t.active !== false));
      }
    );

    return () => unsubTournaments();
  }, []);

  // 2. Suscripción a deportistas en Firestore + Sincronización con cambios del Panel Administrativo
  useEffect(() => {
    let latestFirestoreRaw: any[] = [];

    const buildPaymentRecords = () => {
      const unified = mergeAthletesData(latestFirestoreRaw);
      const rows: AthletePaymentRecord[] = unified.map((data) => {
        const planInfo = getPlanDetails(data.plan || "Plan Alfa");
        const planPrice = planInfo?.normalPrice || 150000;

        const rawStatus = String(data.financialStatus || "").trim();
        const estadoPago = String(data.estado_pago || "").toLowerCase().trim();

        let finStatus: "Al día" | "Pago parcial" | "En mora" = "Al día";
        if (rawStatus === "Pago parcial" || estadoPago === "pago_parcial") {
          finStatus = "Pago parcial";
        } else if (rawStatus === "En mora" || estadoPago === "en_mora" || estadoPago === "pendiente") {
          finStatus = "En mora";
        }

        const valorPendiente =
          data.valorPendiente !== undefined && data.valorPendiente !== null && Number(data.valorPendiente) > 0
            ? Number(data.valorPendiente)
            : planPrice;

        return {
          id: data.id,
          name: data.name || data.nombres || "Deportista SOUL",
          documento: String(data.documento || "").trim(),
          email: data.email || "deportista@soulvolley.com",
          phone: String(data.telefono || data.phone || "").trim(),
          plan: data.plan || "Plan Alfa",
          group: data.group || "General",
          category: data.category || "Formativo",
          financialStatus: finStatus,
          estadoPago: estadoPago || (finStatus === "Al día" ? "al_dia" : "en_mora"),
          valorPendiente,
          valorAbonado: Number(data.valorAbonado || 0),
          lastPaymentDate: data.lastPaymentDate,
          lastPaymentReference: data.lastPaymentReference
        };
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setAthletes(rows);
      setLoadingAthletes(false);
    };

    const unsubscribe = onSnapshot(
      collection(db, "athletes"),
      (snapshot) => {
        if (snapshot.size < 15) {
          seedAdditionalAthletes().catch(() => {});
        }
        const raw: any[] = [];
        snapshot.forEach((docSnap) => {
          raw.push({ id: docSnap.id, ...docSnap.data() });
        });
        latestFirestoreRaw = raw;
        buildPaymentRecords();
      },
      () => {
        buildPaymentRecords();
      }
    );

    window.addEventListener("soul-athletes-updated", buildPaymentRecords);
    window.addEventListener("storage", buildPaymentRecords);

    return () => {
      unsubscribe();
      window.removeEventListener("soul-athletes-updated", buildPaymentRecords);
      window.removeEventListener("storage", buildPaymentRecords);
    };
  }, []);

  const selectedAthlete = useMemo(
    () => athletes.find((a) => a.id === selectedAthleteId) || null,
    [athletes, selectedAthleteId]
  );

  // Sincronizar el plan activo cuando cambia el deportista seleccionado
  const handleSelectAthlete = (athlete: AthletePaymentRecord) => {
    setSelectedAthleteId(athlete.id);
    setSearchTerm(athlete.documento ? `${athlete.name} (${athlete.documento})` : athlete.name);
    setShowDropdown(false);
    setStatusMessage(null);

    const key = normalizePlanKey(athlete.plan);
    setSelectedPlanKey(key);
  };

  const filteredAthletes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return athletes;
    return athletes.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.documento && a.documento.toLowerCase().includes(q)) ||
        (a.plan && a.plan.toLowerCase().includes(q)) ||
        (a.group && a.group.toLowerCase().includes(q))
    );
  }, [athletes, searchTerm]);

  // Plan activo anclado al deportista
  const currentPlanInfo: PaymentPlanInfo | null = useMemo(() => {
    return (
      getPlanDetails(selectedAthlete?.plan || "Plan Básico") ||
      PAYMENT_PLANS.find((p) => p.id === selectedPlanKey) ||
      PAYMENT_PLANS[0]
    );
  }, [selectedPlanKey, selectedAthlete]);

  // Modalidad de tarifa (Pronto Pago hasta el día 5 por defecto, o seleccionable al pagar)
  const [useProntoPago, setUseProntoPago] = useState<boolean>(() => new Date().getDate() <= 5);

  // Valor numérico total sin formato (ej. 95000) según el plan anclado del deportista
  const totalAmount: number = useMemo(() => {
    if (!currentPlanInfo) return 95000;
    return useProntoPago ? currentPlanInfo.prontoPagoPrice : currentPlanInfo.normalPrice;
  }, [currentPlanInfo, useProntoPago]);

  // Enlace oficial único de Nequi / Wompi VPOS
  const OFFICIAL_NEQUI_WOMPI_URL = "https://checkout.nequi.wompi.co/l/VPOS_1Bc0Ii";

  const isPlanBasico = useMemo(() => {
    const planToCheck = selectedAthlete ? selectedAthlete.plan : selectedPlanKey;
    return isBasicPlan(planToCheck);
  }, [selectedAthlete, selectedPlanKey]);

  const activeWompiLink = OFFICIAL_NEQUI_WOMPI_URL;

  // Estado del Modal de Confirmación Pre-Redirección (#EstiloSoul)
  const [paymentModalData, setPaymentModalData] = useState<{
    open: boolean;
    amount: number;
    conceptLabel: string;
    targetUrl: string;
    copiedAgain: boolean;
    notificationRef?: string;
  } | null>(null);

  // Copiado automático sin formato (solo dígitos, ej. "95000") con fallback document.execCommand('copy')
  const copyPlainAmountToClipboard = async (rawAmount: number): Promise<boolean> => {
    const plainDigits = String(Math.round(Number(rawAmount) || 0)).replace(/[^0-9]/g, "");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(plainDigits);
        return true;
      }
    } catch {
      // Fallback para navegadores móviles que restrinjan navigator.clipboard
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = plainDigits;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, plainDigits.length);
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    } catch (err) {
      console.warn("No se pudo copiar automáticamente al portapapeles:", err);
      return false;
    }
  };

  // Mensaje de WhatsApp adaptado
  const generatedWhatsAppMessage = useMemo(() => {
    if (!selectedAthlete) return "";
    const isPartial = selectedAthlete.financialStatus === "Pago parcial";
    return buildOverdueMessagePreview({
      nombres: selectedAthlete.name,
      plan: selectedAthlete.plan,
      valorPendiente: selectedAthlete.valorPendiente,
      valorAbonado: selectedAthlete.valorAbonado,
      esPagoParcial: isPartial
    });
  }, [selectedAthlete]);

  // Copiar mensaje completo
  const handleCopyMessage = () => {
    if (!generatedWhatsAppMessage) return;
    navigator.clipboard.writeText(generatedWhatsAppMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  // Acción al dar clic en "Pagar": abre Wompi en una segunda pestaña, copia el monto y envía notificación para revisión
  const handleOpenWompi = async (customAmount?: number, customLabel?: string, customUrl?: string) => {
    const amountToCopy = typeof customAmount === "number" ? customAmount : totalAmount;
    const label = customLabel || (selectedAthlete ? `${selectedAthlete.plan} (${useProntoPago ? "Pronto Pago" : "Tarifa Normal"})` : "Mensualidad SOUL");
    const targetUrl = customUrl || OFFICIAL_NEQUI_WOMPI_URL;

    // Abrir la pasarela de pago en una segunda pestaña sin navegar fuera de la pestaña actual
    const openedWindow = window.open(targetUrl, "_blank");
    if (openedWindow) {
      openedWindow.opener = null;
    }

    await copyPlainAmountToClipboard(amountToCopy);

    let notificationRef: string | undefined;
    try {
      const res = await sendPortalPaymentNotification({
        athleteName: selectedAthlete?.name || (searchTerm.trim() ? searchTerm.trim() : "Deportista / Visitante Web"),
        athleteId: selectedAthlete?.id || "",
        amount: amountToCopy,
        concept: label,
        paymentMethod: "Nequi / Wompi (Por revisar)",
        source: "portal_pagos_wompi"
      });
      notificationRef = res.reference;
    } catch (err) {
      console.warn("Aviso al enviar notificación de pago:", err);
    }

    setPaymentModalData({
      open: true,
      amount: amountToCopy,
      conceptLabel: label,
      targetUrl,
      copiedAgain: false,
      notificationRef
    });
  };

  // Enviar recordatorio vía WhatsApp al número del alumno
  const handleSendViaWhatsAppWeb = () => {
    if (!selectedAthlete) return;
    const cleanPhone = sanitizeColombianPhone(selectedAthlete.phone);
    if (!cleanPhone) {
      alert("El deportista no tiene un teléfono celular válido registrado.");
      return;
    }
    const encoded = encodeURIComponent(generatedWhatsAppMessage);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  // Marcar como Pagado manualmente en Firestore
  const handleMarkAsPaid = async () => {
    if (!selectedAthlete) return;
    if (!confirm(`¿Confirmas marcar a ${selectedAthlete.name} como "Al día" en Firestore?`)) return;

    try {
      const athleteRef = doc(db, "athletes", selectedAthlete.id);
      const todayFormatted = new Date().toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      const txCode = `SOUL-RECIBO-${Date.now().toString().slice(-6)}`;

      await updateDoc(athleteRef, {
        financialStatus: "Al día",
        estado_pago: "al_dia",
        valorPendiente: 0,
        lastPaymentDate: todayFormatted,
        lastPaymentReference: txCode,
        updatedAt: serverTimestamp()
      });

      // Registrar ingreso en finances
      await addDoc(collection(db, "finances"), {
        txCode,
        date: todayFormatted,
        athlete: selectedAthlete.name,
        athleteId: selectedAthlete.id,
        type: "income",
        amount: currentPlanInfo?.normalPrice || 120000,
        status: "completed",
        concept: `Mensualidad - ${selectedAthlete.plan}`,
        paymentMethod: isPlanBasico ? "Wompi" : "Transferencia / Efectivo",
        wompiReference: txCode,
        createdAt: serverTimestamp()
      });

      setStatusMessage({
        type: "success",
        title: "¡Estado actualizado exitosamente!",
        description: `${selectedAthlete.name} ahora figura Al día y se registró el ingreso en Finanzas.`
      });
    } catch (err: any) {
      console.error("Error al actualizar estado en Firestore:", err);
      setStatusMessage({
        type: "error",
        title: "Error al actualizar",
        description: err?.message || "No se pudo actualizar el registro en Firestore."
      });
    }
  };

  // Helper para pintar el punto de color en los horarios con tonos vivos y resplandor
  const renderDot = (color: ScheduleItem["color"]) => {
    switch (color) {
      case "yellow":
        return <span className="w-3.5 h-3.5 rounded-full bg-yellow-400 shrink-0 shadow-[0_0_12px_rgba(250,204,21,0.9)]" />;
      case "pink":
        return <span className="w-3.5 h-3.5 rounded-full bg-pink-500 shrink-0 shadow-[0_0_12px_rgba(236,72,153,0.9)]" />;
      case "blue":
        return <span className="w-3.5 h-3.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />;
      case "green":
        return <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />;
      case "orange":
        return <span className="w-3.5 h-3.5 rounded-full bg-orange-500 shrink-0 shadow-[0_0_12px_rgba(249,115,22,0.9)]" />;
      case "purple":
        return <span className="w-3.5 h-3.5 rounded-full bg-fuchsia-500 shrink-0 shadow-[0_0_12px_rgba(217,70,239,0.9)]" />;
      case "white":
      default:
        return <span className="w-3.5 h-3.5 rounded-full bg-white shrink-0 shadow-[0_0_12px_rgba(255,255,255,0.9)]" />;
    }
  };

  return (
    <div
      className="w-full min-h-screen flex flex-col text-white selection:bg-amber-400 selection:text-black relative"
      style={{
        backgroundImage: "url('/bg-soul-official.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed"
      }}
    >
      {/* Fondo Oficial SOUL a Pantalla Completa, Fijo y Centrado */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: "url('/bg-soul-official.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed"
        }}
      />

      {/* =========================================================================
          BARRA DE NAVEGACIÓN SUPERIOR — SELECTOR DE ESPACIOS INDEPENDIENTES
          ========================================================================= */}
      <header className="sticky top-0 z-50 bg-[#120206]/92 backdrop-blur-xl border-b border-amber-400/35 px-4 sm:px-8 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Logo e Identidad */}
          <button
            type="button"
            onClick={() => navigateToSpace("hero")}
            className="flex items-center gap-3 group text-left"
          >
            <div className="w-10 h-10 rounded-full border-2 border-amber-400 p-0.5 bg-black/60 overflow-hidden shadow-[0_0_16px_rgba(245,158,11,0.5)] transition-transform group-hover:scale-105">
              <img src="/logo.png" alt="Club SOUL" className="w-full h-full object-contain rounded-full" />
            </div>
            <div>
              <span className="font-black text-lg tracking-wider text-white">
                SOUL <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent">VOLEY</span>
              </span>
              <span className="block text-[10px] text-amber-200/80 font-bold uppercase tracking-widest">
                #EstiloSoul • Voleibol de Piso
              </span>
            </div>
          </button>

          {/* Pestañas de Espacios Independientes */}
          <nav className="flex flex-wrap items-center justify-center gap-1.5 bg-[#1e0309]/90 p-1.5 rounded-2xl border border-amber-400/30 shadow-inner">
            {SPACES_NAV.map((item) => {
              const isActive = activeSpace === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToSpace(item.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] scale-[1.02]"
                      : "text-zinc-200 hover:text-amber-200 hover:bg-[#320611]"
                  }`}
                >
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* CTA Rápido a Pagos */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigateToSpace("pagos")}
              className="px-4 py-2 rounded-xl border border-amber-400/70 bg-gradient-to-r from-[#2c050f] to-[#1c0309] text-amber-200 hover:bg-gradient-to-r hover:from-amber-400 hover:to-amber-500 hover:text-zinc-950 font-black text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)]"
            >
              Ir a Pagar
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          CONTENEDOR PRINCIPAL DE VISTA AISLADA (UN SOLO ESPACIO A LA VEZ)
          ========================================================================= */}
      <main className="flex-1 flex flex-col">
        
        {/* -----------------------------------------------------------------------
            ESPACIO 1 — HERO & IDENTIDAD INSTITUCIONAL (VISTA EXCLUSIVA)
            ----------------------------------------------------------------------- */}
        {activeSpace === "hero" && (
          <section
            id="hero"
            className="flex-1 min-h-[calc(100vh-76px)] py-16 sm:py-24 flex flex-col justify-center items-center text-center relative bg-black/20 overflow-hidden px-4 animate-in fade-in duration-300"
          >
            <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
              {/* Badge con borde dorado brillante */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border-2 border-amber-400/80 bg-gradient-to-r from-rose-950/90 to-[#2c050f]/90 text-amber-300 text-xs font-black tracking-widest uppercase mb-6 shadow-[0_0_20px_rgba(245,158,11,0.35)]">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.9)]" />
                VOLEIBOL DE PISO
              </div>

              {/* Emblema Oficial SOUL */}
              <div className="relative mb-6">
                <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full border-2 border-amber-400 p-2 shadow-[0_0_30px_rgba(245,158,11,0.4)] bg-gradient-to-b from-[#3d0612] via-[#24040b] to-[#140206] flex items-center justify-center transform hover:scale-105 transition-all">
                  <img src="/logo.png" alt="Emblema Oficial Club SOUL" className="w-full h-full object-contain rounded-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" />
                </div>
              </div>

              {/* Título Principal */}
              <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight uppercase leading-tight drop-shadow-md">
                CLUB DE VOLEIBOL{" "}
                <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_20px_rgba(245,158,11,0.5)]">
                  SOUL
                </span>
              </h1>

              {/* Lema Oficial */}
              <p className="text-lg sm:text-2xl font-bold text-amber-100 italic max-w-2xl mt-4 drop-shadow">
                "Libertad para ser tu mejor versión."
              </p>

              {/* 3 Pilares del Club */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-7 w-full max-w-4xl mt-10">
                <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-b from-[#280510]/90 to-[#180308]/90 border border-amber-400/40 backdrop-blur-md text-center hover:border-amber-400 hover:shadow-[0_0_35px_rgba(245,158,11,0.4)] transition-all transform hover:-translate-y-1">
                  <div className="w-14 h-14 mx-auto rounded-xl bg-gradient-to-br from-amber-400/25 to-rose-600/25 border border-amber-400/60 flex items-center justify-center text-amber-300 mb-4 shadow-[0_0_18px_rgba(245,158,11,0.35)]">
                    <Flame className="w-7 h-7 text-amber-300" />
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-amber-300 uppercase tracking-wider">DISCIPLINA</h3>
                  <p className="text-sm text-zinc-100 mt-2 font-medium leading-relaxed">Superación y constancia en cada sesión de juego.</p>
                </div>

                <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-b from-[#280510]/90 to-[#180308]/90 border border-amber-400/40 backdrop-blur-md text-center hover:border-amber-400 hover:shadow-[0_0_35px_rgba(245,158,11,0.4)] transition-all transform hover:-translate-y-1">
                  <div className="w-14 h-14 mx-auto rounded-xl bg-gradient-to-br from-amber-400/25 to-rose-600/25 border border-amber-400/60 flex items-center justify-center text-amber-300 mb-4 shadow-[0_0_18px_rgba(245,158,11,0.35)]">
                    <HeartHandshake className="w-7 h-7 text-amber-300" />
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-amber-300 uppercase tracking-wider">PERTENENCIA</h3>
                  <p className="text-sm text-zinc-100 mt-2 font-medium leading-relaxed">Unión y orgullo de familia dentro y fuera del campo.</p>
                </div>

                <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-b from-[#280510]/90 to-[#180308]/90 border border-amber-400/40 backdrop-blur-md text-center hover:border-amber-400 hover:shadow-[0_0_35px_rgba(245,158,11,0.4)] transition-all transform hover:-translate-y-1">
                  <div className="w-14 h-14 mx-auto rounded-xl bg-gradient-to-br from-amber-400/25 to-rose-600/25 border border-amber-400/60 flex items-center justify-center text-amber-300 mb-4 shadow-[0_0_18px_rgba(245,158,11,0.35)]">
                    <Award className="w-7 h-7 text-amber-300" />
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-amber-300 uppercase tracking-wider">DESARROLLO INTEGRAL</h3>
                  <p className="text-sm text-zinc-100 mt-2 font-medium leading-relaxed">Formación técnica, física y de valores deportivos.</p>
                </div>
              </div>

              {/* Botones para abrir cada espacio en su propia vista */}
              <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
                <button
                  type="button"
                  onClick={() => navigateToSpace("horarios")}
                  className="px-6 py-3.5 rounded-xl bg-[#24040b] border-2 border-amber-400/70 text-amber-200 hover:bg-[#380612] hover:border-amber-300 hover:text-white font-black text-sm tracking-wider uppercase transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.2)] transform hover:scale-105"
                >
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>Ver Horarios</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToSpace("precios")}
                  className="px-6 py-3.5 rounded-xl bg-[#24040b] border-2 border-amber-400/70 text-amber-200 hover:bg-[#380612] hover:border-amber-300 hover:text-white font-black text-sm tracking-wider uppercase transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.2)] transform hover:scale-105"
                >
                  <span>Lista de Precios</span>
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                </button>

                <button
                  type="button"
                  onClick={() => navigateToSpace("pagos")}
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 font-black text-sm tracking-wider uppercase shadow-[0_0_30px_rgba(245,158,11,0.6)] hover:shadow-[0_0_45px_rgba(245,158,11,0.8)] hover:scale-105 transition-all flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Portal de Pagos</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToSpace("contacto")}
                  className="px-6 py-3.5 rounded-xl bg-[#24040b] border-2 border-amber-400/50 text-zinc-200 hover:text-white hover:border-amber-300 hover:bg-[#380612] font-black text-sm tracking-wider uppercase transition-all transform hover:scale-105"
                >
                  Contacto
                </button>
              </div>
            </div>
          </section>
        )}

        {/* -----------------------------------------------------------------------
            ESPACIO 2 — HORARIOS DE ENTRENAMIENTO (VISTA EXCLUSIVA)
            ----------------------------------------------------------------------- */}
        {activeSpace === "horarios" && (
          <section
            id="horarios"
            className="flex-1 min-h-[calc(100vh-76px)] py-16 sm:py-20 bg-black/25 relative px-4 sm:px-8 animate-in fade-in duration-300"
          >

            <div className="max-w-7xl mx-auto relative z-10">
              {/* Encabezado con cinta dorada luminosa detrás de "HORARIOS DE" */}
              <div className="text-center mb-12">
                <div className="inline-block relative">
                  <span className="inline-block bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 font-black text-2xl sm:text-4xl px-5 py-2 uppercase tracking-wider rounded-md shadow-[0_0_25px_rgba(245,158,11,0.45)] mr-2">
                    HORARIOS DE
                  </span>
                  <span className="text-2xl sm:text-4xl font-black text-white uppercase tracking-wider drop-shadow-md">
                    ENTRENAMIENTO
                  </span>
                </div>
                <p className="text-amber-100/90 text-sm sm:text-base mt-3 max-w-xl mx-auto font-medium">
                  Jornadas de entrenamiento semanal clasificadas por nivel y categoría oficial.
                </p>
              </div>

              {/* Grid espacioso de 6 tarjetas (3 columnas en desktop) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {SCHEDULES.map((sched) => (
                  <div
                    key={sched.day}
                    className="bg-gradient-to-b from-[#25050e]/95 to-[#160207]/95 backdrop-blur-md border-2 border-amber-400/40 rounded-2xl p-6 shadow-2xl hover:border-amber-400 transition-all hover:shadow-[0_0_30px_rgba(245,158,11,0.35)] flex flex-col justify-between transform hover:-translate-y-1"
                  >
                    <div>
                      {/* Encabezado de la Tarjeta */}
                      <div className="flex items-center gap-3 pb-4 border-b border-amber-400/25 mb-5">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center text-zinc-950 font-black shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                          <Calendar className="w-5 h-5 text-zinc-950" />
                        </div>
                        <h3 className="text-xl font-black text-amber-300 tracking-wider uppercase drop-shadow">
                          {sched.day}
                        </h3>
                      </div>

                      {/* Lista de Horarios con Indicador Circular de Color */}
                      <div className="space-y-3.5">
                        {sched.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-3 p-3 rounded-xl bg-[#0c0104]/80 border border-amber-400/20 hover:border-amber-400/50 transition-all"
                          >
                            <div className="mt-1">{renderDot(item.color)}</div>
                            <div className="flex-1">
                              <p className="font-mono text-sm font-black text-white tracking-wide">
                                {item.time}
                              </p>
                              <p className="text-xs font-bold text-amber-200/90 uppercase mt-0.5 tracking-wider">
                                {item.category}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 mt-5 border-t border-amber-400/20 flex items-center justify-between text-xs text-zinc-300">
                      <span className="font-semibold">Club de Voleibol SOUL</span>
                      <span className="text-amber-400 font-black tracking-wider">#EstiloSoul</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Navegación inferior entre espacios */}
              <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => navigateToSpace("precios")}
                  className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.45)] hover:shadow-[0_0_35px_rgba(245,158,11,0.7)] flex items-center gap-2 transform hover:scale-105 transition-all"
                >
                  <span>Siguiente: Ver Lista de Precios</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* -----------------------------------------------------------------------
            ESPACIO 3 — LISTA DE PRECIOS Y PLANES (VISTA EXCLUSIVA)
            ----------------------------------------------------------------------- */}
        {activeSpace === "precios" && (
          <section
            id="precios"
            className="flex-1 min-h-[calc(100vh-76px)] py-16 sm:py-20 bg-black/25 relative px-4 sm:px-8 overflow-hidden animate-in fade-in duration-300"
          >

            <div className="max-w-7xl mx-auto relative z-10">
              {/* Encabezado: "LISTA DE PRECIOS" con Escudo a la Derecha */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 pb-6 border-b border-amber-400/25">
                <div>
                  <span className="text-amber-400 text-xs font-black tracking-widest uppercase block drop-shadow">
                    TARIFAS Y MEMBRESÍAS 2026
                  </span>
                  <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight mt-1 drop-shadow-md">
                    LISTA DE PRECIOS
                  </h2>
                  <p className="text-amber-100/90 text-sm mt-2 max-w-xl font-medium">
                    Planes adaptados a tu frecuencia de entrenamiento y objetivos competitivos en voleibol de piso.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <span className="text-xs text-amber-200/80 uppercase tracking-widest block font-bold">Oficial</span>
                    <span className="text-white font-black text-sm tracking-wider">SOUL VOLLEYBALL</span>
                  </div>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-amber-400 p-1 shadow-[0_0_30px_rgba(245,158,11,0.5)] bg-gradient-to-b from-[#3a0612] to-[#140206] flex items-center justify-center">
                    <img src="/logo.png" alt="Escudo Oficial SOUL" className="w-full h-full object-contain rounded-full" />
                  </div>
                </div>
              </div>

              {/* Grid de Tarjetas de Planes */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {PRICE_LIST.map((plan) => (
                  <div
                    key={plan.id}
                    className="bg-gradient-to-b from-[#280510]/95 via-[#1d030c]/95 to-[#130206]/95 backdrop-blur-md border-2 border-amber-400/40 rounded-2xl p-6 shadow-2xl flex flex-col justify-between hover:border-amber-400 transition-all hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] relative overflow-hidden transform hover:-translate-y-1"
                  >
                    {plan.isOnlinePayment && (
                      <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 text-[10px] font-black uppercase px-3 py-1 rounded-bl-lg tracking-wider shadow-md">
                        Pago Wompi
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                          {plan.tag}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-amber-100 bg-[#0c0104] px-2.5 py-0.5 rounded border border-amber-400/25">
                          {plan.classes}
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-white mb-4 tracking-tight">
                        {plan.name}
                      </h3>

                      <div className="space-y-3 pt-3 border-t border-amber-400/20">
                        <div>
                          <p className="text-[11px] text-amber-200/90 uppercase font-black">Pronto Pago:</p>
                          <p className="text-3xl font-black text-amber-400 font-mono tracking-tight drop-shadow-[0_2px_10px_rgba(245,158,11,0.4)]">
                            {formatCurrency(plan.prontoPago)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] text-zinc-300 uppercase font-bold">Precio Normal:</p>
                          <p className="text-base font-extrabold text-slate-100 font-mono">
                            {formatCurrency(plan.normal)}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-amber-400/15">
                          <p className="text-xs text-amber-200 font-bold flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span>{plan.athletesText}</span>
                          </p>
                          {plan.note && (
                            <p className="text-[10px] text-zinc-300 mt-0.5 italic">{plan.note}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-3 border-t border-amber-400/20 flex items-center justify-between text-xs text-zinc-300">
                      <span>Membresía Oficial</span>
                      <span className="text-amber-400 font-black">#EstiloSoul</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Banner de Inscripción Destacado */}
              <div className="mt-12 max-w-4xl mx-auto p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#3a0612] via-[#630b1e] to-[#3a0612] border-2 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.3)] text-center relative overflow-hidden">
                <div className="relative z-10">
                  <span className="inline-block bg-gradient-to-r from-amber-400 to-yellow-400 text-zinc-950 text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest mb-3 shadow-md">
                    MATRÍCULA & BENEFICIOS
                  </span>
                  <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase drop-shadow-md">
                    INSCRIPCIÓN: $120.000 (INCLUYE UNIFORME Y AFILIACIÓN ANUAL)
                  </h3>
                  <p className="text-lg sm:text-xl font-black text-amber-200 mt-2 tracking-wider">
                    SOUL VOLLEYBALL
                  </p>
                  <p className="text-base sm:text-lg font-black text-amber-400 mt-1 tracking-widest">
                    #EstiloSoul
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* -----------------------------------------------------------------------
            ESPACIO 4 — PORTAL DE PAGOS (VISTA EXCLUSIVA: MENSUALIDADES Y TORNEOS)
            ----------------------------------------------------------------------- */}
        {activeSpace === "pagos" && (
          <section
            id="pagos"
            className="flex-1 min-h-[calc(100vh-76px)] py-12 sm:py-16 bg-black/25 relative px-4 sm:px-8 animate-in fade-in duration-300"
          >

            <div className="max-w-6xl mx-auto relative z-10 space-y-8">
              {/* Encabezado del Portal de Pagos */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-amber-400/25 pb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-gradient-to-r from-amber-400 to-yellow-400 text-zinc-950 border-0 text-xs font-black tracking-wider uppercase shadow-md">
                      PORTAL DE PAGOS
                    </Badge>
                    <Badge variant="outline" className="border-emerald-400/50 text-emerald-300 bg-emerald-950/40 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                      Conectado a Base de Datos
                    </Badge>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase drop-shadow-md">
                    PORTAL DE PAGOS <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent">OFICIAL</span>
                  </h2>
                  <p className="text-amber-100/90 text-xs sm:text-sm mt-1 font-medium">
                    Consulta tu estado de cuenta, paga tu mensualidad o inscríbete a los torneos activos.
                  </p>
                </div>

                {/* Selector Mensualidades vs Torneos */}
                <div className="flex items-center gap-2 bg-[#1e0309]/90 p-1.5 rounded-2xl border-2 border-amber-400/35 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setPaymentSubTab("mensualidades")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      paymentSubTab === "mensualidades"
                        ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] scale-[1.02]"
                        : "text-zinc-200 hover:text-amber-200 hover:bg-[#320611]"
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Mensualidades</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentSubTab("torneos")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      paymentSubTab === "torneos"
                        ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] scale-[1.02]"
                        : "text-zinc-200 hover:text-amber-200 hover:bg-[#320611]"
                    }`}
                  >
                    <Trophy className="w-4 h-4" />
                    <span>Torneos ({tournaments.length})</span>
                  </button>
                </div>
              </div>

              {/* Notificación de Estado */}
              {statusMessage && (
                <div
                  className={`p-4 rounded-2xl border-2 shadow-xl flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 ${
                    statusMessage.type === "success"
                      ? "bg-emerald-950/90 border-emerald-400/70 text-emerald-100 shadow-[0_0_25px_rgba(16,185,129,0.3)]"
                      : statusMessage.type === "error"
                      ? "bg-rose-950/90 border-rose-400/70 text-rose-100 shadow-[0_0_25px_rgba(244,63,94,0.3)]"
                      : "bg-[#280510] border-amber-400/70 text-amber-100 shadow-[0_0_25px_rgba(245,158,11,0.3)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {statusMessage.type === "success" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : statusMessage.type === "error" ? (
                      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-bold text-sm">{statusMessage.title}</p>
                      <p className="text-xs opacity-90 mt-0.5 font-medium">{statusMessage.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStatusMessage(null)}
                    className="text-xs opacity-80 hover:opacity-100 px-2 py-1 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {paymentSubTab === "mensualidades" ? (
                <>
                  {/* Grid de Pago: Buscador + Ficha con Plan Anclado + Botón Wompi */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Columna Izquierda (7 cols): Buscador de Alumno y Botón de Pago */}
                    <div className="lg:col-span-7 space-y-6">
                      <Card className="bg-gradient-to-b from-[#24050e]/95 to-[#160207]/95 border-2 border-amber-400/40 text-white shadow-2xl">
                        <CardHeader className="border-b border-amber-400/20 pb-4">
                          <CardTitle className="text-lg font-black text-amber-300 uppercase tracking-wide flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-amber-400" />
                            Buscar Deportista y Procesar Pago
                          </CardTitle>
                          <CardDescription className="text-zinc-200 text-xs font-medium">
                            Busca al deportista para cargar automáticamente su plan asignado y estado de cuenta.
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="pt-5 space-y-5">
                          {/* Buscador */}
                          <div className="relative">
                            <label className="text-xs font-bold text-amber-100 block mb-1.5 uppercase tracking-wider">
                              Buscar por Nombre o Documento de Identidad:
                            </label>
                            <div className="relative flex items-center">
                              <Search className="w-4 h-4 text-amber-400 absolute left-3.5 pointer-events-none" />
                              <input
                                type="text"
                                value={searchTerm}
                                onFocus={() => setShowDropdown(true)}
                                onChange={(e) => {
                                  setSearchTerm(e.target.value);
                                  setShowDropdown(true);
                                }}
                                placeholder={
                                  loadingAthletes
                                    ? "Cargando deportistas desde Firestore..."
                                    : "Escribe el nombre o documento..."
                                }
                                className="w-full bg-[#0d0104] border-2 border-amber-400/40 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 transition-all font-medium"
                              />
                              {searchTerm && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearchTerm("");
                                    setSelectedAthleteId("");
                                    setShowDropdown(true);
                                  }}
                                  className="absolute right-3 text-zinc-300 hover:text-white text-xs px-1 font-bold"
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            {showDropdown && (
                              <div className="absolute left-0 right-0 mt-1.5 bg-[#1e0309] border-2 border-amber-400/50 rounded-xl shadow-2xl z-40 max-h-60 overflow-y-auto">
                                {filteredAthletes.length === 0 ? (
                                  <div className="p-3 text-xs text-zinc-300 text-center font-medium">
                                    No se encontraron deportistas con ese criterio.
                                  </div>
                                ) : (
                                  filteredAthletes.map((athlete) => (
                                    <button
                                      key={athlete.id}
                                      type="button"
                                      onClick={() => handleSelectAthlete(athlete)}
                                      className="w-full text-left px-4 py-2.5 hover:bg-[#340712] border-b border-amber-400/10 last:border-b-0 flex items-center justify-between gap-2 transition-colors"
                                    >
                                      <div>
                                        <p className="text-sm font-bold text-white">{athlete.name}</p>
                                        <p className="text-[11px] text-zinc-300 font-medium">
                                          {athlete.plan} • {athlete.group}
                                          {athlete.documento ? ` • Doc: ${athlete.documento}` : ""}
                                        </p>
                                      </div>
                                      <span
                                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                                          athlete.financialStatus === "Al día"
                                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-400"
                                            : athlete.financialStatus === "Pago parcial"
                                            ? "bg-amber-500/20 text-amber-300 border-amber-400"
                                            : "bg-rose-500/20 text-rose-300 border-rose-400"
                                        }`}
                                      >
                                        {athlete.financialStatus}
                                      </span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>

                          {/* Ficha del Alumno Seleccionado con su Plan Anclado */}
                          {selectedAthlete ? (
                            <div className="space-y-4">
                              <div className="p-4 rounded-xl bg-gradient-to-r from-[#2c0510] to-[#1c0309] border-2 border-amber-400/50 space-y-3 shadow-xl">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-[10px] text-amber-200/80 uppercase tracking-wider font-black">Deportista Seleccionado</p>
                                    <h3 className="text-lg font-black text-white flex items-center gap-2 mt-0.5">
                                      {selectedAthlete.name}
                                    </h3>
                                    <p className="text-xs text-zinc-200 font-medium">
                                      {selectedAthlete.group} • {selectedAthlete.category}
                                      {selectedAthlete.documento ? ` • Doc: ${selectedAthlete.documento}` : ""}
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    <span
                                      className={`text-xs font-black px-3 py-1 rounded-full border inline-block ${
                                        selectedAthlete.financialStatus === "Al día"
                                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-400"
                                          : selectedAthlete.financialStatus === "Pago parcial"
                                          ? "bg-amber-500/20 text-amber-300 border-amber-400"
                                          : "bg-rose-500/20 text-rose-300 border-rose-400"
                                      }`}
                                    >
                                      {selectedAthlete.financialStatus}
                                    </span>
                                    <p className="text-xs font-mono font-black text-white mt-1">
                                      Saldo: {formatCurrency(selectedAthlete.valorPendiente)}
                                    </p>
                                  </div>
                                </div>

                                {/* Plan Anclado al Deportista (Solo lectura) + Selector de Modalidad de Tarifa */}
                                <div className="pt-3 border-t border-amber-400/20 bg-black/40 p-3.5 rounded-xl space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <span className="text-[10px] text-amber-200/80 uppercase tracking-wider font-bold block">
                                        Plan Anclado al Deportista
                                      </span>
                                      <span className="text-sm font-black text-amber-300 uppercase">
                                        {currentPlanInfo?.name || selectedAthlete.plan}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[10px] text-zinc-300 uppercase font-bold block">
                                        Total a Copiar y Pagar
                                      </span>
                                      <span className="text-xl font-black text-amber-400 font-mono drop-shadow">
                                        {formatCurrency(totalAmount)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setUseProntoPago(true)}
                                      className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                                        useProntoPago
                                          ? "bg-gradient-to-r from-[#3e0717] to-[#24050d] border-amber-400 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                          : "bg-black/50 border-amber-400/25 text-zinc-300 hover:text-white hover:border-amber-400/50"
                                      }`}
                                    >
                                      <span className="text-[10px] font-black uppercase block text-amber-300">
                                        Pronto Pago
                                      </span>
                                      <span className="text-xs font-mono font-black text-amber-400">
                                        {formatCurrency(currentPlanInfo?.prontoPagoPrice || 95000)}
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setUseProntoPago(false)}
                                      className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                                        !useProntoPago
                                          ? "bg-gradient-to-r from-[#3e0717] to-[#24050d] border-amber-400 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                          : "bg-black/50 border-amber-400/25 text-zinc-300 hover:text-white hover:border-amber-400/50"
                                      }`}
                                    >
                                      <span className="text-[10px] font-black uppercase block text-zinc-200">
                                        Tarifa Normal
                                      </span>
                                      <span className="text-xs font-mono font-black text-white">
                                        {formatCurrency(currentPlanInfo?.normalPrice || 120000)}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {selectedAthlete.financialStatus === "Pago parcial" && selectedAthlete.valorAbonado > 0 && (
                                  <div className="pt-2 border-t border-amber-400/20 text-xs flex justify-between text-amber-300 font-bold">
                                    <span>Abono registrado previamente:</span>
                                    <strong className="font-mono">{formatCurrency(selectedAthlete.valorAbonado)}</strong>
                                  </div>
                                )}
                              </div>

                              {/* Actualización manual para Staff */}
                              <div className="flex items-center justify-between text-xs text-zinc-300 px-1">
                                <span>¿El alumno ya canceló por consignación o efectivo?</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleMarkAsPaid}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/60 font-bold h-7"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                  Marcar "Al día" en Firestore
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-6 rounded-xl border-2 border-dashed border-amber-400/40 bg-black/40 text-center text-xs text-amber-100 font-medium">
                              <p>Busca y selecciona tu nombre o documento arriba para cargar tu plan asignado y habilitar el pago.</p>
                            </div>
                          )}

                          {/* Botones de Pago / Acción (Copiado automático sin formato + Redirección Nequi/Wompi) */}
                          {selectedAthlete && (
                            <div className="pt-3 border-t border-amber-400/20 space-y-3">
                              <div className="flex flex-col sm:flex-row gap-3">
                                <Button
                                  type="button"
                                  onClick={() =>
                                    handleOpenWompi(
                                      totalAmount,
                                      `${selectedAthlete.plan} — ${selectedAthlete.name}`,
                                      OFFICIAL_NEQUI_WOMPI_URL
                                    )
                                  }
                                  className="flex-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:brightness-110 text-zinc-950 font-black rounded-xl py-4 shadow-[0_0_30px_rgba(245,158,11,0.5)] gap-2 text-sm tracking-wider uppercase transition-all transform hover:scale-[1.01]"
                                >
                                  <CreditCard className="w-4 h-4" />
                                  <span>Pagar {formatCurrency(totalAmount)} en Nequi / Wompi</span>
                                  <ExternalLink className="w-4 h-4" />
                                </Button>

                                <Button
                                  type="button"
                                  onClick={handleSendViaWhatsAppWeb}
                                  className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black rounded-xl py-4 px-5 gap-2 text-sm shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                  <span>Enviar WhatsApp</span>
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Columna Derecha (5 cols): Previsualización del Recordatorio */}
                    <div className="lg:col-span-5 space-y-6">
                      <Card className="bg-gradient-to-b from-[#24050e]/95 to-[#160207]/95 border-2 border-amber-400/40 text-white shadow-2xl">
                        <CardHeader className="border-b border-amber-400/20 pb-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-black text-amber-300 uppercase tracking-wide flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-emerald-400" />
                              Recordatorio para el Alumno
                            </CardTitle>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={!selectedAthlete}
                              onClick={handleCopyMessage}
                              className="text-xs text-amber-300 hover:text-white hover:bg-[#380612] font-bold h-7 px-2"
                            >
                              <Send className="w-3.5 h-3.5 mr-1 text-amber-400" />
                              <span>{copiedMessage ? "Copiado" : "Copiar"}</span>
                            </Button>
                          </div>
                          <CardDescription className="text-zinc-200 text-xs font-medium">
                            Mensaje personalizado según el estado de cuenta del deportista.
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="pt-4 space-y-4">
                          {selectedAthlete ? (
                            <div className="p-4 rounded-xl bg-[#0d0104]/90 border border-emerald-500/40 font-sans text-xs text-emerald-100 whitespace-pre-line leading-relaxed max-h-[380px] overflow-y-auto shadow-inner">
                              {generatedWhatsAppMessage}
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl bg-black/40 border-2 border-dashed border-amber-400/30 text-center text-xs text-amber-100 font-medium py-12">
                              <p>Selecciona un deportista a la izquierda para previsualizar el mensaje de cobro o confirmación.</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </>
              ) : (
                /* SUB-SECCIÓN DE TORNEOS ACTIVOS */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tournaments.map((torneo) => (
                    <div
                      key={torneo.id}
                      className="bg-gradient-to-b from-[#260510]/95 via-[#1b030b]/95 to-[#120206]/95 backdrop-blur-md border-2 border-amber-400/40 rounded-2xl p-6 shadow-2xl flex flex-col justify-between hover:border-amber-400 transition-all hover:shadow-[0_0_30px_rgba(245,158,11,0.35)] transform hover:-translate-y-1"
                    >
                      <div>
                        <span className="inline-block text-xs font-black text-amber-300 bg-gradient-to-r from-rose-950 to-[#2c050f] border border-amber-400/50 px-3.5 py-1 rounded-full mb-3 shadow-md">
                          {torneo.categoryTag}
                        </span>
                        <h3 className="text-xl font-black text-white leading-snug drop-shadow-sm">
                          {torneo.name}
                        </h3>
                        <p className="text-xs text-slate-200 mt-2 leading-relaxed font-medium">
                          {torneo.description}
                        </p>

                        <div className="mt-4 pt-3 border-t border-amber-400/20 space-y-1.5 text-xs text-zinc-300">
                          {torneo.date && (
                            <p className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-amber-400" />
                              <span>Fecha: <strong className="text-white font-bold">{torneo.date}</strong></span>
                            </p>
                          )}
                          {torneo.sede && (
                            <p className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-amber-400" />
                              <span>Sede: <strong className="text-white font-bold">{torneo.sede}</strong></span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-amber-400/25 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-[10px] text-amber-200/80 uppercase font-black block">Inscripción</span>
                          <span className="text-2xl font-black text-amber-400 font-mono drop-shadow">
                            {formatCurrency(torneo.price)}
                          </span>
                        </div>

                        <Button
                          type="button"
                          onClick={() =>
                            handleOpenWompi(
                              torneo.price,
                              torneo.name,
                              OFFICIAL_NEQUI_WOMPI_URL
                            )
                          }
                          className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:brightness-110 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl px-4 py-2.5 gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Pagar Torneo</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* -----------------------------------------------------------------------
            ESPACIO 5 — FOOTER & CONTACTO (VISTA EXCLUSIVA)
            ----------------------------------------------------------------------- */}
        {activeSpace === "contacto" && (
          <section
            id="contacto"
            className="flex-1 min-h-[calc(100vh-76px)] py-20 bg-black/25 relative flex flex-col justify-center items-center text-center px-4 animate-in fade-in duration-300"
          >

            <div className="max-w-4xl mx-auto flex flex-col items-center relative z-10">
              {/* Emblema */}
              <div className="w-28 h-28 rounded-full border-2 border-amber-400 p-2 shadow-[0_0_40px_rgba(245,158,11,0.5),0_0_60px_rgba(225,29,72,0.3)] bg-gradient-to-b from-[#3a0612] to-[#140206] mb-6 transform hover:scale-105 transition-all">
                <img src="/logo.png" alt="Club SOUL" className="w-full h-full object-contain rounded-full drop-shadow" />
              </div>

              {/* Hashtag Oficial */}
              <h2 className="text-4xl sm:text-6xl font-black bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_25px_rgba(245,158,11,0.6)] tracking-widest uppercase mb-4">
                #EstiloSoul
              </h2>

              <p className="text-amber-100 font-medium text-sm sm:text-base max-w-lg mb-8 leading-relaxed">
                Formación integral, disciplina de alto impacto y pasión competitiva en voleibol de piso. Contáctanos directamente por WhatsApp para inscripciones y clases de cortesía.
              </p>

              {/* Iconos de Valores */}
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs font-black text-amber-200 uppercase tracking-wider mb-10">
                <span className="px-4 py-2.5 rounded-full bg-gradient-to-r from-[#2c0510] to-[#1c0309] border border-amber-400/50 shadow-md flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" /> Excelencia Deportiva
                </span>
                <span className="px-4 py-2.5 rounded-full bg-gradient-to-r from-[#2c0510] to-[#1c0309] border border-amber-400/50 shadow-md flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-amber-400" /> Sentido de Pertenencia
                </span>
                <span className="px-4 py-2.5 rounded-full bg-gradient-to-r from-[#2c0510] to-[#1c0309] border border-amber-400/50 shadow-md flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" /> Pasión y Disciplina
                </span>
              </div>

              {/* Botón de Acceso Directo a WhatsApp */}
              <a
                href="https://wa.me/573054353865"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 hover:brightness-110 text-zinc-950 font-black text-base sm:text-lg shadow-[0_0_35px_rgba(16,185,129,0.5)] transition-all transform hover:-translate-y-1"
              >
                <Phone className="w-5 h-5 text-zinc-950" />
                <span>Atención WhatsApp: 305 435 3865</span>
              </a>

              {/* Copyright */}
              <div className="mt-14 pt-8 border-t border-amber-400/20 w-full text-xs text-amber-100/90 font-medium">
                <p>Club de Voleibol SOUL © 2026. Todos los derechos reservados. Voleibol de Piso.</p>
              </div>
            </div>
          </section>
        )}

        {/* -----------------------------------------------------------------------
            MODAL DE CONFIRMACIÓN PRE-REDIRECCIÓN (#EstiloSoul)
            ----------------------------------------------------------------------- */}
        {paymentModalData?.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-3xl bg-gradient-to-b from-[#26050e] to-[#120206] border-2 border-amber-400 p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.5),0_0_80px_rgba(225,29,72,0.35)] text-center space-y-5 relative">
              <button
                type="button"
                onClick={() => setPaymentModalData(null)}
                className="absolute top-4 right-4 text-amber-200 hover:text-white text-base px-2 py-1 font-black transition-colors"
              >
                ✕
              </button>

              <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mx-auto text-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.4)]">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <span className="inline-block bg-gradient-to-r from-amber-400 to-yellow-400 text-zinc-950 text-[10px] font-black px-3.5 py-1 rounded-full uppercase tracking-widest shadow-md">
                  PASARELA OFICIAL NEQUI / WOMPI
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-sm">
                  ¡Valor copiado al portapapeles!{" "}
                  <span className="text-amber-400 block mt-1 font-mono font-black drop-shadow">
                    ({formatCurrency(paymentModalData.amount)})
                  </span>
                </h3>
                <p className="text-xs text-amber-200 font-bold">
                  {paymentModalData.conceptLabel}
                </p>
                {paymentModalData.notificationRef && (
                  <p className="text-[11px] text-emerald-300 font-bold bg-emerald-950/80 border border-emerald-400/50 rounded-lg px-3 py-1.5 inline-block shadow-sm">
                    Notificación enviada para revisión • Ref: <span className="font-mono">{paymentModalData.notificationRef}</span>
                  </p>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-black/60 border border-amber-400/30 text-sm text-zinc-100 leading-relaxed font-medium">
                En la siguiente pantalla de <strong className="text-white">Nequi / Wompi</strong>, solo mantén presionada la casilla del valor y selecciona{" "}
                <strong className="text-amber-400 underline font-black">Pegar</strong>{" "}
                <span className="font-mono text-xs text-zinc-300 block mt-1">
                  Valor sin formato en tu portapapeles: <strong className="text-white font-bold">{paymentModalData.amount}</strong>
                </span>
              </div>

              <div className="flex flex-col gap-3 pt-1">
                <a
                  href={paymentModalData.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPaymentModalData(null)}
                  className="w-full py-4 px-5 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:brightness-110 text-zinc-950 font-black text-sm uppercase tracking-wider shadow-[0_0_30px_rgba(245,158,11,0.5)] flex items-center justify-center gap-2 transition-all transform hover:scale-[1.01]"
                >
                  <span>Continuar a Nequi / Wompi</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                <button
                  type="button"
                  onClick={async () => {
                    await copyPlainAmountToClipboard(paymentModalData.amount);
                    setPaymentModalData((prev) => (prev ? { ...prev, copiedAgain: true } : null));
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#24040b] border-2 border-amber-400/60 hover:border-amber-400 text-amber-200 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                >
                  <Check className="w-4 h-4 text-amber-400" />
                  <span>
                    {paymentModalData.copiedAgain ? "¡Valor copiado de nuevo!" : "Copiar valor de nuevo"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
