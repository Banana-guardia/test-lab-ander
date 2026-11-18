import { useState, useEffect, useMemo } from "react";
import { db, sendPortalPaymentNotification } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  getPlanDetails, 
  PRONTO_PAGO_DEADLINE,
  OFFICIAL_WOMPI_LINK,
  getWompiPaymentLink
} from "@/lib/plans";
import { seedAdditionalAthletes, initialAthletes } from "@/lib/seedData";
import { 
  requestWompiSignatureFromBackend,
  openWompiCheckout
} from "@/lib/wompi";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Calendar, 
  Copy, 
  Check, 
  Search, 
  ExternalLink,
  Zap,
  Info,
  Trophy
} from "lucide-react";

export type FinancialStatus = "Al día" | "En mora" | "Pago parcial";

export interface AthleteData {
  id: string;
  name: string;
  documento?: string;
  age?: number;
  category?: string;
  group?: string;
  email?: string;
  phone?: string;
  plan?: string;
  status?: string;
  financialStatus?: FinancialStatus;
  lastPaymentDate?: any;
  lastPaymentReference?: string;
  amountDue?: number;
}

export interface PaymentTransaction {
  id: string;
  txCode: string;
  date: string;
  athlete: string;
  athleteId?: string;
  type: "income" | "expense";
  amount: number;
  status: "completed" | "pending" | "declined";
  concept: string;
  paymentMethod?: string;
  wompiReference?: string;
  wompiTxId?: string;
}

export interface TournamentOption {
  id: string;
  name: string;
  description: string;
  categoryTag: string;
  price: number;
  tagColor: string;
  wompiLink?: string;
  isCustom?: boolean;
}

const TOURNAMENT_OPTIONS: TournamentOption[] = [
  {
    id: "torneo-1",
    name: "Copa Élite Interclubes Bogotá 2026",
    description: "Categoría Selección & Mayores • Coliseo El Salitre • Incluye planillaje, carnetización de liga y arbitraje oficial.",
    categoryTag: "🏆 Copa Élite Interclubes",
    price: 65000,
    tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/30"
  },
  {
    id: "torneo-2",
    name: "Torneo Departamental de Voleibol Cundinamarca",
    description: "Categoría Juvenil • Fase clasificatoria y cuadrangulares finales • Incluye seguro deportivo de competencia.",
    categoryTag: "⚡ Liga & Departamental",
    price: 85000,
    tagColor: "bg-purple-500/20 text-purple-300 border-purple-500/30"
  },
  {
    id: "torneo-3",
    name: "Festival Formativo de Voleibol SOUL",
    description: "Categorías Formativas • Canchas Sede Norte • Incluye medalla de participación, carnet de evento e hidratación.",
    categoryTag: "🌱 Festival Formativo",
    price: 45000,
    tagColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
  },
  {
    id: "torneo-custom",
    name: "Otro Torneo / Evento Especial",
    description: "Ingresa el nombre del torneo y el valor acordado con la coordinación deportiva del Club SOUL.",
    categoryTag: "🎯 Torneo Especial / Personalizado",
    price: 0,
    isCustom: true,
    tagColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
  }
];

export default function AthletePaymentPortal() {
  const [athletes, setAthletes] = useState<AthleteData[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState<any | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [generatedRef, setGeneratedRef] = useState<string>("");
  const [generatedSignature, setGeneratedSignature] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"mensualidades" | "torneos">("mensualidades");
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("torneo-1");
  const [customTournamentName, setCustomTournamentName] = useState("");
  const [customTournamentAmount, setCustomTournamentAmount] = useState<string>("");
  const [checkoutType, setCheckoutType] = useState<"mensualidad" | "torneo">("mensualidad");
  const [dbTournaments, setDbTournaments] = useState<TournamentOption[]>([]);

  // Cargar deportistas en tiempo real
  useEffect(() => {
    const KNOWN_DOCS: Record<string, string> = {
      "andi rojas": "1093496820",
      "andi": "1093496820",
      "carlos ramírez": "1023456789",
      "carlos ramirez": "1023456789",
      "sofía martínez": "1098765432",
      "sofia martinez": "1098765432",
      "diego gómez": "1014567890",
      "diego gomez": "1014567890",
      "valentina torres": "1032654987",
      "andrés silva": "1019876543",
      "andres silva": "1019876543",
      "mariana restrepo": "1028765432",
      "juan pablo castaño": "1017894561",
      "juan pablo castano": "1017894561",
      "camila andrea vargas": "1034567812",
      "camila vargas": "1034567812",
      "santiago mendoza": "1021987654",
      "isabella morales": "1012345678",
      "mateo hernández": "1035678901",
      "mateo hernandez": "1035678901",
      "gabriela rincón": "1024567891",
      "gabriela rincon": "1024567891",
      "sebastián quintero": "1016789012",
      "sebastian quintero": "1016789012",
      "lucía fernández": "1025678912",
      "lucia fernandez": "1025678912",
      "samuel david ospina": "1013456789",
      "samuel ospina": "1013456789",
      "valeria duarte": "1031245678",
      "nicolás bermúdez": "1026789123",
      "nicolas bermudez": "1026789123"
    };

    const unsub = onSnapshot(collection(db, "athletes"), (snap) => {
      // Sincronizar automáticamente en Firestore si hay pocos registros
      if (snap.size < 15) {
        seedAdditionalAthletes().catch(() => {});
      }

      const list: AthleteData[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const rawDoc = data.documento || data.numeroIdentidad || data.cedula || data.identificacion || data.idNumber;
        const nameKey = (data.name || "").toLowerCase().trim();
        const docNum = rawDoc ? String(rawDoc).trim() : (KNOWN_DOCS[nameKey] || "");

        list.push({
          id: d.id,
          name: data.name || "Sin Nombre",
          documento: docNum,
          age: data.age,
          category: data.category,
          group: data.group,
          email: data.email || "deportista@soul.com",
          phone: data.phone || "3001234567",
          plan: data.plan || "Plan Alfa",
          status: data.status || "Activo",
          financialStatus: (data.financialStatus as FinancialStatus) || (data.status === "Inactivo" ? "En mora" : "Al día"),
          lastPaymentDate: data.lastPaymentDate,
          lastPaymentReference: data.lastPaymentReference,
          amountDue: data.amountDue || 0
        });
      });

      // Asegurar que todos los 17 deportistas estén presentes
      const existingDocs = new Set(list.map((a) => a.documento).filter(Boolean));
      const existingNames = new Set(list.map((a) => a.name.toLowerCase().trim()));

      initialAthletes.forEach((item, idx) => {
        const docKey = String(item.documento).trim();
        const nameKey = item.name.toLowerCase().trim();
        if (!existingDocs.has(docKey) && !existingNames.has(nameKey)) {
          list.push({
            id: `seed-ath-${idx}-${item.documento}`,
            name: item.name,
            documento: item.documento,
            age: item.age,
            category: item.category,
            group: item.group,
            email: item.email,
            phone: item.phone,
            plan: item.plan,
            status: item.status as any,
            financialStatus: item.financialStatus as any,
            lastPaymentDate: (item as any).lastPaymentDate,
            lastPaymentReference: (item as any).lastPaymentReference,
            amountDue: 0
          });
        }
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      setAthletes(list);
      if (list.length > 0 && !selectedAthleteId) {
        setSelectedAthleteId(list[0].id);
      }
    }, (err) => {
      console.error("Error cargando atletas, usando plantilla completa:", err);
      const fallbackList: AthleteData[] = initialAthletes.map((item, idx) => ({
        id: `offline-${idx}-${item.documento}`,
        name: item.name,
        documento: item.documento,
        age: item.age,
        category: item.category,
        group: item.group,
        email: item.email,
        phone: item.phone,
        plan: item.plan,
        status: item.status as any,
        financialStatus: item.financialStatus as any,
        lastPaymentDate: (item as any).lastPaymentDate,
        lastPaymentReference: (item as any).lastPaymentReference,
        amountDue: 0
      }));
      fallbackList.sort((a, b) => a.name.localeCompare(b.name));
      setAthletes(fallbackList);
    });

    return () => unsub();
  }, []);

  // Cargar transacciones de la colección finances
  useEffect(() => {
    const unsubFinances = onSnapshot(collection(db, "finances"), (snap) => {
      const txs: PaymentTransaction[] = [];
      snap.forEach((d) => {
        const data = d.data();
        txs.push({
          id: d.id,
          txCode: data.txCode || d.id.slice(0, 8).toUpperCase(),
          date: data.date || "Reciente",
          athlete: data.athlete || "Deportista",
          athleteId: data.athleteId,
          type: data.type || "income",
          amount: Number(data.amount) || 0,
          status: data.status === "completed" ? "completed" : data.status === "declined" ? "declined" : "pending",
          concept: data.concept || "Mensualidad",
          paymentMethod: data.paymentMethod || "Wompi / PSE",
          wompiReference: data.wompiReference || data.reference || data.txCode,
          wompiTxId: data.wompiTxId
        });
      });
      setTransactions(txs);
    }, (err) => {
      console.error("Error cargando finanzas:", err);
    });

    // Escuchar colección de torneos en tiempo real
    const unsubTournaments = onSnapshot(collection(db, "tournaments"), (snapshot) => {
      const list: TournamentOption[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.active !== false) {
          list.push({
            id: docSnap.id,
            name: data.name,
            description: data.description || (data.sede ? `Sede: ${data.sede} • Fecha: ${data.date || 'Por confirmar'}` : 'Inscripción oficial.'),
            categoryTag: data.categoryTag || "🏆 Torneo Oficial",
            price: Number(data.price) || 0,
            tagColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
            wompiLink: data.wompiLink || ""
          });
        }
      });
      setDbTournaments(list);
    }, (err) => {
      console.warn("⚠️ Usando torneos por defecto:", err);
    });

    return () => {
      unsubFinances();
      unsubTournaments();
    };
  }, []);

  const [showSuggestions, setShowSuggestions] = useState(false);

  // Atletas filtrados por lo que el usuario escribe (nombre o número de identidad)
  const filteredAthletes = useMemo(() => {
    if (!nameSearch.trim()) return [];
    const term = nameSearch.toLowerCase().trim();
    return athletes.filter((a) => {
      const nameMatch = a.name.toLowerCase().includes(term);
      const docMatch = a.documento ? a.documento.toLowerCase().includes(term) : false;
      return nameMatch || docMatch;
    });
  }, [athletes, nameSearch]);

  // Atleta seleccionado actualmente
  const currentAthlete = useMemo(() => {
    return athletes.find((a) => a.id === selectedAthleteId) || null;
  }, [athletes, selectedAthleteId]);

  // Lista combinada de torneos disponibles
  const tournamentList = useMemo(() => {
    return dbTournaments.length > 0 ? dbTournaments : TOURNAMENT_OPTIONS;
  }, [dbTournaments]);

  // Información del plan del atleta
  const planDetails = useMemo(() => {
    return getPlanDetails(currentAthlete?.plan || "Plan Alfa");
  }, [currentAthlete?.plan]);

  // Cálculo de tarifa según fecha (Pronto pago hasta el 5 del mes)
  const currentDay = new Date().getDate();
  const isProntoPago = currentDay <= 5;
  const currentFee = useMemo(() => {
    if (!planDetails) return 135000;
    return isProntoPago ? planDetails.prontoPagoPrice : planDetails.normalPrice;
  }, [planDetails, isProntoPago]);

  // Torneo seleccionado actualmente y cálculo de precio
  const currentTournament = useMemo(() => {
    const found = tournamentList.find(t => t.id === selectedTournamentId) || tournamentList[0] || {
      id: "torneo-1",
      name: "Torneo Oficial",
      description: "",
      categoryTag: "🏆 Torneo",
      price: 65000,
      tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      wompiLink: "https://checkout.nequi.wompi.co/l/xAbkDK"
    };
    if (found.isCustom) {
      const parsedAmount = parseInt(customTournamentAmount, 10) || 0;
      return {
        ...found,
        name: customTournamentName.trim() || "Otro Torneo / Evento Especial",
        price: parsedAmount
      };
    }
    return found;
  }, [tournamentList, selectedTournamentId, customTournamentName, customTournamentAmount]);

  // Transacciones asociadas al atleta
  const athleteTransactions = useMemo(() => {
    if (!currentAthlete) return [];
    return transactions.filter(
      (tx) => tx.athlete.toLowerCase() === currentAthlete.name.toLowerCase() ||
              (tx.athleteId && tx.athleteId === currentAthlete.id)
    );
  }, [transactions, currentAthlete]);

  // Redirección directa en segunda pestaña al checkout de Wompi para Mensualidades + Notificación para revisión
  const handleInitiatePayment = async () => {
    if (!currentAthlete) return;
    const link = getWompiPaymentLink(currentAthlete.plan) || OFFICIAL_WOMPI_LINK;
    const openedWindow = window.open(link, "_blank");
    if (openedWindow) {
      openedWindow.opener = null;
    }
    try {
      await sendPortalPaymentNotification({
        athleteName: currentAthlete.name,
        athleteId: currentAthlete.id,
        amount: currentFee,
        concept: `Mensualidad - ${currentAthlete.plan}`,
        paymentMethod: "Nequi / Wompi (Por revisar)",
        source: "athlete_payment_portal"
      });
    } catch {}
  };

  // Redirección directa en segunda pestaña al checkout de Wompi para Torneos + Notificación para revisión
  const handleInitiateTournamentPayment = async () => {
    if (!currentAthlete) {
      alert("Por favor busca y selecciona tu cuenta de deportista en el buscador superior antes de pagar el torneo.");
      return;
    }
    if (currentTournament.price <= 0) {
      alert("Por favor ingresa un monto válido para la inscripción del torneo.");
      return;
    }
    const link =
      currentTournament.wompiLink && currentTournament.wompiLink.startsWith("http")
        ? currentTournament.wompiLink
        : OFFICIAL_WOMPI_LINK;
    const openedWindow = window.open(link, "_blank");
    if (openedWindow) {
      openedWindow.opener = null;
    }
    try {
      await sendPortalPaymentNotification({
        athleteName: currentAthlete.name,
        athleteId: currentAthlete.id,
        amount: currentTournament.price,
        concept: `Inscripción Torneo: ${currentTournament.name}`,
        paymentMethod: "Nequi / Wompi (Por revisar)",
        source: "athlete_payment_portal"
      });
    } catch {}
  };

  // Ejecutar Widget Oficial de Wompi
  const handleLaunchWompiWidget = async () => {
    if (!currentAthlete) return;
    setShowCheckoutModal(false);
    setProcessingPayment(true);

    const amountToPay = checkoutType === "torneo" ? currentTournament.price : currentFee;
    const conceptToPay = checkoutType === "torneo" 
      ? `Inscripción Torneo: ${currentTournament.name}` 
      : `Mensualidad - ${planDetails?.name || "Plan Club"}`;
    const amountInCents = amountToPay * 100;

    try {
      const result = await openWompiCheckout({
        reference: generatedRef,
        amountInCents: amountInCents,
        signatureIntegrity: generatedSignature,
        customerData: {
          email: currentAthlete.email || "deportista@soul.com",
          fullName: currentAthlete.name,
          phoneNumber: currentAthlete.phone || "3001234567"
        },
        onSuccess: async (tx) => {
          await handlePaymentApproved({
            reference: generatedRef,
            amount: amountToPay,
            concept: conceptToPay,
            isTournament: checkoutType === "torneo",
            wompiId: tx.id || "WOMPI-" + Date.now(),
            athleteName: currentAthlete.name,
            athleteId: currentAthlete.id
          });
        }
      });

      console.log("💳 [Wompi Checkout Resultado]:", result);

      // Si Wompi devolvió un resultado aprobado en el callback
      if (result.status === "APPROVED") {
        await handlePaymentApproved({
          reference: result.reference,
          amount: amountToPay,
          concept: conceptToPay,
          isTournament: checkoutType === "torneo",
          wompiId: result.id || "WOMPI-WIDGET",
          athleteName: currentAthlete.name,
          athleteId: currentAthlete.id
        });
      }
    } catch (error) {
      console.error("Error abriendo widget Wompi:", error);
    } finally {
      setProcessingPayment(false);
    }
  };

  // Simulación directa para pruebas sandbox / demo
  const handleSimulatePaymentApproval = async () => {
    if (!currentAthlete) return;
    setProcessingPayment(true);
    setShowCheckoutModal(false);

    const amountToPay = checkoutType === "torneo" ? currentTournament.price : currentFee;
    const conceptToPay = checkoutType === "torneo" 
      ? `Inscripción Torneo: ${currentTournament.name}` 
      : `Mensualidad - ${planDetails?.name || "Plan Club"}`;
    const prefix = checkoutType === "torneo" ? "TOR" : "MEN";
    const ref = generatedRef || `SOUL-${prefix}-${Date.now().toString().slice(-6)}`;

    await handlePaymentApproved({
      reference: ref,
      amount: amountToPay,
      concept: conceptToPay,
      isTournament: checkoutType === "torneo",
      wompiId: "WOMPI-SIM-" + Date.now(),
      athleteName: currentAthlete.name,
      athleteId: currentAthlete.id
    });

    setProcessingPayment(false);
  };

  // Acción cuando un pago se aprueba
  const handlePaymentApproved = async (data: {
    reference: string;
    amount: number;
    concept: string;
    isTournament?: boolean;
    wompiId: string;
    athleteName: string;
    athleteId: string;
  }) => {
    try {
      // 1. Si es mensualidad, actualizar estado del atleta a "Al día"
      if (!data.isTournament) {
        const athleteRef = doc(db, "athletes", data.athleteId);
        await updateDoc(athleteRef, {
          financialStatus: "Al día",
          lastPaymentDate: new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }),
          lastPaymentReference: data.reference,
          updatedAt: serverTimestamp()
        });
      }

      // 2. Registrar en la colección finances
      await addDoc(collection(db, "finances"), {
        txCode: data.reference,
        date: new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }),
        athlete: data.athleteName,
        athleteId: data.athleteId,
        type: "income",
        amount: data.amount,
        status: "completed",
        concept: data.concept,
        paymentMethod: "Wompi (Widget)",
        wompiReference: data.reference,
        wompiTxId: data.wompiId,
        createdAt: serverTimestamp()
      });

      // 3. Registrar en payment_notifications para alertar al panel administrativo
      await addDoc(collection(db, "payment_notifications"), {
        athleteName: data.athleteName,
        athleteId: data.athleteId,
        amount: data.amount,
        concept: data.concept,
        paymentMethod: "Wompi",
        reference: data.reference,
        status: "APPROVED",
        read: false,
        createdAt: serverTimestamp()
      });

      setPaymentSuccessData({
        reference: data.reference,
        amount: data.amount,
        athlete: data.athleteName,
        plan: data.concept
      });
    } catch (e) {
      console.error("Error actualizando base de datos tras pago:", e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Configuración del badge de estado financiero
  const financialStatusBadge = useMemo(() => {
    const status = currentAthlete?.financialStatus || "Al día";
    switch (status) {
      case "Al día":
        return {
          label: "Al día",
          icon: CheckCircle2,
          className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
          desc: "Tu membresía se encuentra activa y sin pagos pendientes."
        };
      case "En mora":
        return {
          label: "En mora",
          icon: AlertTriangle,
          className: "bg-rose-500/15 text-rose-400 border-rose-500/40",
          desc: "Presentas saldo pendiente. Cancela para evitar suspensión temporal de acceso a cancha."
        };
      case "Pago parcial":
        return {
          label: "Pago parcial",
          icon: Clock,
          className: "bg-amber-500/15 text-amber-400 border-amber-500/40",
          desc: "Tienes un abono registrado con saldo pendiente por liquidar."
        };
      default:
        return {
          label: status,
          icon: Info,
          className: "bg-zinc-800 text-zinc-300 border-zinc-700",
          desc: "Consulta con administración deportiva."
        };
    }
  }, [currentAthlete?.financialStatus]);

  const StatusIcon = financialStatusBadge.icon;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#241a2e] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-purple-500/15 text-purple-400 text-xs px-2.5 py-0.5 rounded-full border border-purple-500/30 font-semibold tracking-wide">
              PASARELA OFICIAL
            </span>
            <span className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Conectado a Base de Datos
            </span>
            <span className="text-zinc-500 text-xs flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Wompi Powered
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Portal de Pagos de Deportistas
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Gestiona tu membresía deportiva, consulta tu estado de cuenta y realiza pagos seguros en línea.
          </p>
        </div>

        {/* Buscador de Deportista (SOLO POR ESCRITURA DE NOMBRE O NÚMERO DE IDENTIDAD) */}
        <div className="relative w-full sm:w-96">
          <div className="flex items-center gap-2 bg-[#110c1c] border border-[#2b1e3a] px-3.5 py-2.5 rounded-xl shadow-inner">
            <Search className="w-4 h-4 text-purple-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar por nombre o N° de identidad..."
              value={nameSearch}
              onChange={(e) => {
                setNameSearch(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none w-full"
            />
            {nameSearch && (
              <button
                type="button"
                onClick={() => {
                  setNameSearch("");
                  setShowSuggestions(false);
                  setSelectedAthleteId("");
                  setPaymentSuccessData(null);
                }}
                className="text-zinc-400 hover:text-white text-xs px-1"
                title="Borrar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {/* Menú Flotante de Resultados de Búsqueda (Solo visible al escribir) */}
          {showSuggestions && nameSearch.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#140b20] border border-purple-500/40 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
              {filteredAthletes.length === 0 ? (
                <div className="p-3 text-xs text-zinc-400 text-center">
                  No se encontró ningún deportista con ese nombre o número de identidad.
                </div>
              ) : (
                filteredAthletes.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      setSelectedAthleteId(a.id);
                      setNameSearch(a.documento ? `${a.name} (${a.documento})` : a.name);
                      setShowSuggestions(false);
                      setPaymentSuccessData(null);
                    }}
                    className="p-3 hover:bg-purple-900/30 cursor-pointer border-b border-white/5 last:border-b-0 flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="font-semibold text-white">{a.name}</span>
                    {a.documento && (
                      <span className="font-mono text-zinc-400 text-[11px]">Doc: {a.documento}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alerta de Éxito de Pago si acaba de ocurrir */}
      {paymentSuccessData && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-emerald-900/40 to-zinc-950 border border-emerald-500/50 p-5 rounded-2xl flex items-start justify-between gap-4 shadow-[0_0_30px_rgba(16,185,129,0.2)] animate-in fade-in slide-in-from-top-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl mt-0.5">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-emerald-300 font-bold text-lg">¡Pago Aprobado y Registrado con Éxito!</h3>
              <p className="text-zinc-300 text-sm mt-0.5">
                La mensualidad de <strong>{paymentSuccessData.athlete}</strong> por{" "}
                <span className="text-white font-semibold">{formatCurrency(paymentSuccessData.amount)}</span> ha sido aprobada.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-zinc-400 font-mono">
                <span>Ref: <strong className="text-emerald-400">{paymentSuccessData.reference}</strong></span>
                <span>Plan: <strong>{paymentSuccessData.plan}</strong></span>
                <span>Estado: <strong className="text-emerald-400">Al día</strong></span>
              </div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setPaymentSuccessData(null)}
            className="text-zinc-400 hover:text-white"
          >
            Cerrar
          </Button>
        </div>
      )}

      {/* Selector de Pestañas / Módulos de Pago */}
      <div className="flex items-center gap-2 bg-[#120a1f] p-1.5 rounded-2xl border border-purple-500/25 max-w-md">
        <button
          type="button"
          onClick={() => setActiveTab("mensualidades")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "mensualidades"
              ? "bg-gradient-to-r from-purple-700 to-indigo-700 text-white shadow-lg shadow-purple-900/40"
              : "text-zinc-400 hover:text-white hover:bg-purple-950/30"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Mensualidades</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("torneos")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "torneos"
              ? "bg-gradient-to-r from-amber-600 to-rose-700 text-white shadow-lg shadow-amber-900/40"
              : "text-zinc-400 hover:text-white hover:bg-purple-950/30"
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Pago de Torneos</span>
          <span className="bg-amber-400 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase">Nuevo</span>
        </button>
      </div>

      {activeTab === "mensualidades" ? (
        /* =========================================================================
            1. RESUMEN DE CUENTA (TARJETA PRINCIPAL DE MENSUALIDADES)
            ========================================================================= */
        <div className="max-w-4xl mx-auto">
          
          {/* Tarjeta Principal de Resumen */}
          <Card className="bg-gradient-to-br from-[#150d22] via-[#0e0917] to-[#08050e] border-[#2f1b47] shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
            {/* Resplandor ambiental de fondo */}
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

            <CardHeader className="border-b border-[#241a2e]/60 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardDescription className="text-zinc-400 uppercase tracking-widest text-[11px] font-semibold">
                    Estado Financiero y Membresía
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-white flex items-center gap-2 mt-1">
                    {currentAthlete ? (
                      <>
                        {currentAthlete.name}
                        {currentAthlete.documento && (
                          <span className="text-xs font-mono font-normal text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/60">
                            Doc: {currentAthlete.documento}
                          </span>
                        )}
                        <span className="text-sm font-normal text-zinc-400">({currentAthlete.category} • {currentAthlete.group})</span>
                      </>
                    ) : (
                      <span className="text-lg text-zinc-400 font-medium">
                        Escribe tu nombre o N° de identidad arriba
                      </span>
                    )}
                  </CardTitle>
                </div>

                {/* Badge de Estado Financiero */}
                {currentAthlete && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${financialStatusBadge.className}`}>
                      <StatusIcon className="w-4 h-4" />
                      {financialStatusBadge.label}
                    </Badge>
                  </div>
                )}
              </div>
            </CardHeader>

            {currentAthlete ? (
              <CardContent className="pt-6 space-y-6">
                
                {/* Fila de Métricas del Plan */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Plan Actual */}
                  <div className="bg-[#191029]/70 border border-[#2e1d44] p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-zinc-400 font-medium">Plan Actual</span>
                      <h4 className="text-lg font-bold text-purple-200 mt-1">
                        {planDetails?.name || currentAthlete.plan || "Plan Alfa"}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5">{planDetails?.classesLabel || "12 clases al mes"}</p>
                    </div>
                    <div className="mt-3">
                      <span className="text-[11px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">
                        {planDetails?.scope || "1 estudiante"}
                      </span>
                    </div>
                  </div>

                  {/* Valor de Mensualidad */}
                  <div className="bg-[#191029]/70 border border-[#2e1d44] p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-zinc-400 font-medium">Valor de Mensualidad</span>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-2xl font-black text-white">{formatCurrency(currentFee)}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {isProntoPago ? "✨ Tarifa con Pronto Pago" : "Tarifa estándar del mes"}
                      </p>
                    </div>
                    <div className="mt-3">
                      <span className="text-[11px] text-emerald-400 font-medium">
                        Pronto pago: {formatCurrency(planDetails?.prontoPagoPrice || 135000)} (hasta el 5)
                      </span>
                    </div>
                  </div>

                  {/* Próximo Vencimiento / Fecha */}
                  <div className="bg-[#191029]/70 border border-[#2e1d44] p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-zinc-400 font-medium">Último Pago / Vencimiento</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-semibold text-white">
                          {currentAthlete.lastPaymentDate || "Sin pagos registrados"}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Corte: día 5 de cada mes
                      </p>
                    </div>
                    <div className="mt-3">
                      <span className={`text-[11px] font-semibold ${currentAthlete.financialStatus === 'En mora' ? 'text-rose-400' : 'text-zinc-400'}`}>
                        {currentAthlete.financialStatus === 'En mora' ? '⚠️ Pago retrasado' : '✅ En período activo'}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Aviso Explicativo del Estado */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  currentAthlete.financialStatus === 'En mora'
                    ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    : 'bg-purple-950/20 border-purple-500/20 text-zinc-300'
                }`}>
                  <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${
                    currentAthlete.financialStatus === 'En mora' ? 'text-rose-400' : 'text-purple-400'
                  }`} />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">{financialStatusBadge.desc}</p>
                    <p className="text-zinc-400">
                      {PRONTO_PAGO_DEADLINE}. Puedes pagar con tarjetas crédito/débito, PSE, Nequi o Bancolombia directamente por Wompi.
                    </p>
                  </div>
                </div>

                {/* Botón Principal de Pago */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Transacción segura y encriptada por Wompi Bancolombia</span>
                  </div>

                  <Button
                    size="lg"
                    onClick={handleInitiatePayment}
                    disabled={processingPayment}
                    className="w-full sm:w-auto bg-gradient-to-r from-rose-700 via-purple-700 to-indigo-700 hover:from-rose-600 hover:via-purple-600 hover:to-indigo-600 text-white font-bold px-8 shadow-[0_0_25px_rgba(147,51,234,0.45)] border border-purple-400/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <CreditCard className="w-5 h-5 mr-2" />
                    {processingPayment ? "Iniciando Wompi..." : `Pagar Mensualidad (${formatCurrency(currentFee)})`}
                  </Button>
                </div>

              </CardContent>
            ) : (
              <CardContent className="py-16 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Búsqueda Requerida</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Escribe tu nombre o número de documento en el buscador superior para cargar tu mensualidad y habilitar el botón de pago Wompi.
                </p>
              </CardContent>
            )}
          </Card>

        </div>
      ) : (
        /* =========================================================================
            MÓDULO DE PAGO DE TORNEOS Y COMPETENCIAS (NUEVO)
            ========================================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Lado Izquierdo: Selección de Torneo Oficial */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-[#150d22] via-[#0e0917] to-[#08050e] border-[#2f1b47] shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-600/15 rounded-full blur-3xl pointer-events-none" />

            <CardHeader className="border-b border-[#241a2e]/60 pb-5">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Trophy className="w-4 h-4" /> Calendario Oficial de Competencias 2026
                </span>
              </div>
              <CardTitle className="text-2xl font-bold text-white mt-1">
                Pago de Inscripción a Torneos
              </CardTitle>
              <CardDescription className="text-zinc-400 text-xs">
                Selecciona el torneo o festival oficial en el que participará el deportista para generar su boleta de pago:
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 gap-3.5">
                {tournamentList.map((torneo) => {
                  const isSelected = selectedTournamentId === torneo.id;
                  return (
                    <div
                      key={torneo.id}
                      onClick={() => setSelectedTournamentId(torneo.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative flex items-start gap-3.5 ${
                        isSelected
                          ? "bg-gradient-to-r from-amber-950/30 via-purple-950/20 to-zinc-900 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                          : "bg-[#140b20]/60 border-[#28183c] hover:border-amber-500/40 hover:bg-[#1a0f2b]"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedTournamentId(torneo.id)}
                        className="mt-1 accent-amber-500 h-4 w-4 shrink-0 cursor-pointer"
                      />

                      <div className="flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${torneo.tagColor}`}>
                            {torneo.categoryTag}
                          </span>
                          <span className="text-sm font-bold text-emerald-400">
                            {torneo.isCustom
                              ? (currentTournament.price > 0 ? formatCurrency(currentTournament.price) : "Monto Variable")
                              : formatCurrency(torneo.price)}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-white">{torneo.name}</h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">{torneo.description}</p>

                        {torneo.isCustom && isSelected && (
                          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-[10px] text-zinc-400 uppercase font-semibold">Nombre del Torneo / Copa:</label>
                              <input
                                type="text"
                                placeholder="Ej: Copa Amistad Voley..."
                                value={customTournamentName}
                                onChange={(e) => setCustomTournamentName(e.target.value)}
                                className="w-full mt-1 bg-[#0e0717] border border-purple-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-zinc-400 uppercase font-semibold">Valor a Pagar (COP):</label>
                              <input
                                type="number"
                                placeholder="Ej: 50000"
                                value={customTournamentAmount}
                                onChange={(e) => setCustomTournamentAmount(e.target.value)}
                                className="w-full mt-1 bg-[#0e0717] border border-purple-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Lado Derecho: Resumen del Torneo y Botón Wompi */}
          <Card className="bg-[#0f0919] border-[#29173d] flex flex-col justify-between">
            <CardHeader className="border-b border-[#241a2e]/60 pb-4">
              <span className="text-[11px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" /> Boleta de Inscripción
              </span>
              <CardTitle className="text-lg font-bold text-white mt-1">
                {currentTournament.name}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 pt-4 text-xs">
              
              <div className="bg-[#170e24] p-3.5 rounded-xl border border-[#2b1942] space-y-2">
                <div className="flex justify-between text-zinc-400">
                  <span>Deportista:</span>
                  <span className="font-bold text-white">
                    {currentAthlete ? currentAthlete.name : "(Busca tu cuenta arriba)"}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Documento:</span>
                  <span className="font-mono text-purple-300">
                    {currentAthlete?.documento || "---"}
                  </span>
                </div>
                <div className="border-t border-[#2d1c47] pt-2 flex justify-between items-baseline font-bold">
                  <span className="text-zinc-200">Total Inscripción:</span>
                  <span className="text-lg text-emerald-400 font-extrabold">
                    {formatCurrency(currentTournament.price)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-zinc-300 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✔</span> Inscripción oficial y planilla de juego
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✔</span> Arbitraje federado de los encuentros
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✔</span> Notificación instantánea al cuerpo técnico
                </div>
              </div>

              <div className="pt-2">
                <Button
                  size="lg"
                  onClick={handleInitiateTournamentPayment}
                  disabled={processingPayment || !currentAthlete || currentTournament.price <= 0}
                  className="w-full bg-gradient-to-r from-amber-600 via-rose-700 to-purple-800 hover:from-amber-500 hover:via-rose-600 hover:to-purple-700 text-white font-bold py-3 shadow-[0_0_20px_rgba(245,158,11,0.35)] border border-amber-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  {processingPayment
                    ? "Iniciando Wompi..."
                    : `Pagar Torneo (${formatCurrency(currentTournament.price)})`}
                </Button>
              </div>

            </CardContent>

            <div className="p-4 bg-[#140b20] border-t border-[#29173d] text-[11px] text-zinc-400 flex items-center justify-between rounded-b-xl">
              <span>Arbitraje y seguro federado</span>
              <span className="text-amber-400 font-semibold">Club SOUL</span>
            </div>
          </Card>

        </div>
      )}

      {/* =========================================================================
          2. HISTORIAL DE TRANSACCIONES (TABLA)
          ========================================================================= */}
      <Card className="bg-[#0c0814] border-[#241a2e]">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#241a2e]/60 pb-4">
          <div>
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              Historial de Transacciones
              <span className="text-xs font-normal text-zinc-400">({athleteTransactions.length} registros para {currentAthlete?.name})</span>
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400 mt-1">
              Registro histórico de aportes, mensualidades y pagos procesados a través de la pasarela.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar referencia o fecha..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="bg-[#160d24] border border-[#2b183f] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 w-52"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-[#120a1e]/80">
                <TableRow className="border-b border-[#241a2e] hover:bg-transparent">
                  <TableHead className="text-zinc-400 font-semibold text-xs">Fecha</TableHead>
                  <TableHead className="text-zinc-400 font-semibold text-xs">Concepto</TableHead>
                  <TableHead className="text-zinc-400 font-semibold text-xs">Referencia Wompi</TableHead>
                  <TableHead className="text-zinc-400 font-semibold text-xs">Método</TableHead>
                  <TableHead className="text-zinc-400 font-semibold text-xs text-right">Monto</TableHead>
                  <TableHead className="text-zinc-400 font-semibold text-xs text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {athleteTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-zinc-500 text-sm">
                      No hay transacciones registradas para este deportista. Haz clic en "Pagar Mensualidad" para generar el primer registro.
                    </TableCell>
                  </TableRow>
                ) : (
                  athleteTransactions
                    .filter((tx) => 
                      !searchFilter || 
                      tx.wompiReference?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      tx.date.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      tx.concept.toLowerCase().includes(searchFilter.toLowerCase())
                    )
                    .map((tx) => (
                      <TableRow key={tx.id} className="border-b border-[#1f152a] hover:bg-purple-950/10 transition-colors">
                        <TableCell className="font-medium text-white text-xs">
                          {tx.date}
                        </TableCell>
                        <TableCell className="text-zinc-300 text-xs font-semibold">
                          {tx.concept}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-purple-300">
                          {tx.wompiReference || tx.txCode}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-xs">
                          {tx.paymentMethod || "Wompi / PSE"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-white text-xs">
                          {formatCurrency(tx.amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          {tx.status === "completed" ? (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[11px] font-semibold">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Aprobado
                            </Badge>
                          ) : tx.status === "declined" ? (
                            <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-[11px] font-semibold">
                              Rechazado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[11px] font-semibold">
                              <Clock className="w-3 h-3 mr-1" /> Pendiente
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          MODAL DE CONFIRMACIÓN PREVIO A INVOCAR EL CHECKOUT DE WOMPI
          ========================================================================= */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#120a1e] border border-purple-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in zoom-in-95">
            
            <div className="flex items-center justify-between pb-4 border-b border-[#241a2e]">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${checkoutType === "torneo" ? "bg-amber-500/20 text-amber-400" : "bg-purple-500/20 text-purple-400"}`}>
                  {checkoutType === "torneo" ? <Trophy className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {checkoutType === "torneo" ? "Confirmar Pago de Torneo" : "Confirmar Pago de Mensualidad"}
                  </h3>
                  <p className="text-xs text-zinc-400">Checkout Oficial de Wompi Bancolombia</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCheckoutModal(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              
              <div className="bg-[#1a0f2b] p-4 rounded-xl border border-[#301c4e] space-y-2">
                <div className="flex justify-between text-zinc-300">
                  <span>Deportista:</span>
                  <span className="font-bold text-white">{currentAthlete?.name}</span>
                </div>
                {checkoutType === "torneo" ? (
                  <div className="flex justify-between text-zinc-300">
                    <span>Torneo / Evento:</span>
                    <span className="font-semibold text-amber-300">{currentTournament.name}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-zinc-300">
                      <span>Plan Seleccionado:</span>
                      <span className="font-semibold text-purple-300">{planDetails?.name || "Plan Alfa"}</span>
                    </div>
                    <div className="flex justify-between text-zinc-300">
                      <span>Tarifa Aplicada:</span>
                      <span className="text-emerald-400 font-medium">
                        {isProntoPago ? "Pronto Pago (Hasta el día 5)" : "Tarifa Plena"}
                      </span>
                    </div>
                  </>
                )}
                <div className="border-t border-[#311d4e] pt-2 flex justify-between text-sm font-bold text-white">
                  <span>Total a Pagar:</span>
                  <span className="text-xl text-emerald-400 font-extrabold">
                    {formatCurrency(checkoutType === "torneo" ? currentTournament.price : currentFee)}
                  </span>
                </div>
              </div>

              {/* Referencia y Firma de Integridad Calculada */}
              <div className="bg-[#0b0612] p-3.5 rounded-lg border border-[#211333] space-y-2 text-[11px] font-mono">
                <div>
                  <span className="text-zinc-500 block">Referencia Única Generada:</span>
                  <div className="flex items-center justify-between text-purple-300 mt-0.5">
                    <span>{generatedRef}</span>
                    <button 
                      onClick={() => copyToClipboard(generatedRef)}
                      className="text-zinc-400 hover:text-white"
                      title="Copiar Referencia"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 block">Firma de Integridad (SHA-256):</span>
                  <span className="text-zinc-400 text-[10px] break-all block mt-0.5" title={generatedSignature}>
                    {generatedSignature.slice(0, 32)}...
                  </span>
                </div>
              </div>

            </div>

            {/* Botones de Acción */}
            <div className="flex flex-col gap-2.5 pt-2">
              <Button
                onClick={handleLaunchWompiWidget}
                className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:via-indigo-500 hover:to-rose-500 text-white font-bold py-2.5 shadow-lg"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir Pasarela de Pago Wompi
              </Button>

              {/* Botón de Simulación para entorno local/desarrollo */}
              <Button
                variant="outline"
                onClick={handleSimulatePaymentApproval}
                className="w-full text-zinc-300 border-purple-500/30 hover:bg-purple-950/30 text-xs"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-400" />
                Simular Pago Aprobado (Modo Demo / Sandbox)
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCheckoutModal(false)}
                className="text-zinc-400 hover:text-white text-xs"
              >
                Cancelar
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
