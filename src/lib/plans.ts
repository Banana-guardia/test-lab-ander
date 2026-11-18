// Definiciones Oficiales de Planes de Pago y Enlaces Estáticos de Wompi del Club SOUL

export interface PaymentPlanInfo {
  id: "basico" | "alfa" | "beta" | "family" | "plus";
  name: string;
  tagline: string;
  classes: number;
  classesLabel: string;
  prontoPagoPrice: number;
  normalPrice: number;
  scope: string;
  wompiLink: string;
  isPopular?: boolean;
  badgeClass: string;
  badgeBg: string;
  borderClass: string;
  accentColor: string;
}

/**
 * Diccionario central `PLANES_PAGO`.
 * ÚNICAMENTE el Plan Básico cuenta con enlace oficial de Wompi.
 * Para los demás planes permanece vacío para no redireccionar a ningún lado.
 */
export const OFFICIAL_WOMPI_LINK = "https://checkout.nequi.wompi.co/l/VPOS_1Bc0Ii";

export const PLANES_PAGO: Record<string, string> = {
  basico: OFFICIAL_WOMPI_LINK,
  "plan básico": OFFICIAL_WOMPI_LINK,
  "plan basico": OFFICIAL_WOMPI_LINK,
  alfa: OFFICIAL_WOMPI_LINK,
  beta: OFFICIAL_WOMPI_LINK,
  family: OFFICIAL_WOMPI_LINK,
  plus: OFFICIAL_WOMPI_LINK,
  intermedio: OFFICIAL_WOMPI_LINK,
  avanzado: OFFICIAL_WOMPI_LINK,
  "plan alfa": OFFICIAL_WOMPI_LINK,
  "plan beta": OFFICIAL_WOMPI_LINK,
  "plan family": OFFICIAL_WOMPI_LINK,
  "plan plus": OFFICIAL_WOMPI_LINK
};

export const PAYMENT_PLANS: PaymentPlanInfo[] = [
  {
    id: "basico",
    name: "Plan Básico",
    tagline: "Iniciación y técnica básica",
    classes: 8,
    classesLabel: "8 clases al mes",
    prontoPagoPrice: 95000,
    normalPrice: 120000,
    scope: "Válido por un estudiante",
    wompiLink: PLANES_PAGO.basico,
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/40",
    badgeBg: "rgba(59, 130, 246, 0.15)",
    borderClass: "border-blue-500/40",
    accentColor: "#3b82f6"
  },
  {
    id: "alfa",
    name: "Plan Alfa",
    tagline: "Desarrollo táctico y juego continuo",
    classes: 12,
    classesLabel: "12 clases al mes",
    prontoPagoPrice: 135000,
    normalPrice: 150000,
    scope: "Válido para un estudiante",
    wompiLink: "",
    isPopular: true,
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/50",
    badgeBg: "rgba(168, 85, 247, 0.2)",
    borderClass: "border-purple-500/50",
    accentColor: "#a855f7"
  },
  {
    id: "beta",
    name: "Plan Beta",
    tagline: "Entrenamiento competitivo avanzado",
    classes: 16,
    classesLabel: "16 clases al mes",
    prontoPagoPrice: 155000,
    normalPrice: 180000,
    scope: "Válido para un estudiante",
    wompiLink: "",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    badgeBg: "rgba(16, 185, 129, 0.15)",
    borderClass: "border-emerald-500/40",
    accentColor: "#10b981"
  },
  {
    id: "family",
    name: "Plan Family",
    tagline: "Tarifa preferencial para familias",
    classes: 8,
    classesLabel: "8 clases al mes",
    prontoPagoPrice: 80000,
    normalPrice: 120000,
    scope: "Para 2 o más estudiantes (tarifa c/u)",
    wompiLink: "",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    badgeBg: "rgba(245, 158, 11, 0.15)",
    borderClass: "border-amber-500/40",
    accentColor: "#f59e0b"
  },
  {
    id: "plus",
    name: "Plan Plus",
    tagline: "Preparación física intensiva",
    classes: 16,
    classesLabel: "16 clases al mes",
    prontoPagoPrice: 170000,
    normalPrice: 200000,
    scope: "Válido para un estudiante",
    wompiLink: "",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    badgeBg: "rgba(244, 63, 94, 0.15)",
    borderClass: "border-rose-500/40",
    accentColor: "#f43f5e"
  }
];

export const ENROLLMENT_FEE = 120000;
export const ENROLLMENT_LABEL = "Inscripción $120.000 COP (incluye uniforme y afiliación anual)";
export const PRONTO_PAGO_DEADLINE = "Pronto pago válido hasta el día 5 de cada mes";

/**
 * Normaliza cualquier texto de plan al nombre oficial del plan.
 */
export function normalizePlanName(raw?: string | null): string {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return "Sin Asignar";
  }
  const s = raw.toLowerCase().trim();
  if (s.includes("alfa") || s.includes("intermedio")) return "Plan Alfa";
  if (s.includes("beta") || s.includes("avanzado")) return "Plan Beta";
  if (s.includes("family") || s.includes("famil")) return "Plan Family";
  if (s.includes("plus")) return "Plan Plus";
  if (s.includes("básico") || s.includes("basico")) return "Plan Básico";
  return raw;
}

/**
 * Normaliza cualquier nombre o ID de plan a su clave corta en `PLANES_PAGO`
 * (`basico`, `alfa`, `beta`, `family`, `plus`, `intermedio`, `avanzado`).
 */
export function normalizePlanKey(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "basico";
  const s = raw.toLowerCase().trim();
  if (s.includes("básico") || s.includes("basico")) return "basico";
  if (s.includes("intermedio")) return "intermedio";
  if (s.includes("avanzado")) return "avanzado";
  if (s.includes("alfa")) return "alfa";
  if (s.includes("beta")) return "beta";
  if (s.includes("family") || s.includes("famil")) return "family";
  if (s.includes("plus")) return "plus";
  return "basico";
}

/**
 * Determina si un plan corresponde estrictamente al Plan Básico.
 */
export function isBasicPlan(planNameOrId?: string | null): boolean {
  if (!planNameOrId) return false;
  const s = String(planNameOrId).toLowerCase().trim();
  return s.includes("básico") || s.includes("basico") || s === "basico";
}

/**
 * Obtiene el enlace de pago de Wompi correspondiente al plan del deportista.
 */
export function getWompiPaymentLink(
  planNameOrId?: string | null,
  customPlanesPago?: Record<string, string> | null
): string {
  const key = normalizePlanKey(planNameOrId);
  const merged = { ...PLANES_PAGO, ...(customPlanesPago || {}) };
  return merged[key] || merged.basico || OFFICIAL_WOMPI_LINK;
}

/**
 * Obtiene la información detallada de un plan por su nombre o id.
 */
export function getPlanDetails(planNameOrId?: string | null): PaymentPlanInfo | null {
  if (!planNameOrId) return null;
  const normalized = normalizePlanName(planNameOrId);
  const found = PAYMENT_PLANS.find(
    (p) =>
      p.name.toLowerCase() === normalized.toLowerCase() ||
      p.id.toLowerCase() === planNameOrId.toLowerCase()
  );
  return found || null;
}
