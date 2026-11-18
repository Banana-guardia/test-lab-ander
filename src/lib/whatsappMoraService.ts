/**
 * Servicio Frontend para Cobro de Cartera en Mora vía Bot de WhatsApp (Baileys)
 * Conecta el panel administrativo (React 19 + TypeScript) con los endpoints de `serve-public.js`:
 * - GET  /api/whatsapp/ping
 * - GET  /api/cartera/morosos
 * - POST /api/whatsapp/cobro-mora-individual
 * - POST /api/whatsapp/cobro-mora-masivo
 */

import { getPlanDetails, getWompiPaymentLink } from "@/lib/plans";

export interface MorosoItem {
  id: string;
  nombres: string;
  documento?: string;
  telefono: string;
  telefonoOriginal?: string;
  telefonoValido: boolean;
  valorPendiente: number;
  fechaVencimiento: string;
  diasMora: number;
  concepto: string;
  plan?: string;
  grupo?: string;
  ultimoRecordatorioEnviado?: string | null;
}

export interface IndividualCobroResponse {
  success: boolean;
  deportistaId: string;
  nombres: string;
  telefono: string;
  valorPendiente: number;
  fechaVencimiento: string;
  diasMora: number;
  concepto: string;
  ultimoRecordatorioEnviado: string;
  mensajeEnviado: string;
  error?: string;
}

export interface MassiveCobroSummary {
  total: number;
  exitosos: number;
  fallidos: number;
  ultimoError?: string | null;
  erroresResumen?: string[];
  detalles?: Array<{
    deportistaId: string;
    nombres: string;
    telefono: string;
    estado: "ENVIADO" | "FALLIDO";
    ultimoRecordatorioEnviado?: string;
    error?: string;
  }>;
  error?: string;
}

export interface PingBotResponse {
  ok?: boolean;
  reachable: boolean;
  endpoint?: string;
  targetUrl: string;
  httpStatus: number | null;
  statusText?: string;
  latencyMs: number;
  responseText?: string;
  responseBody?: string;
  errorCode?: string | number;
  error?: string;
  diagnosis: string;
}

/**
 * Sanitiza un número de teléfono eliminando caracteres no numéricos (incluyendo '+', espacios, guiones)
 * y asegurando el código internacional 57 para móviles de Colombia (10 dígitos que inician en 3 -> 573XXXXXXXXX).
 */
export function sanitizeColombianPhone(raw?: string | null): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "").trim();
  if (!digits) return "";

  if (digits.startsWith("0057")) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return `57${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("573")) {
    return digits;
  }
  if (digits.length === 10) {
    return `57${digits}`;
  }
  return digits;
}

/**
 * Calcula la fecha de vencimiento por defecto (día 5 del mes) si el deportista no tiene `fechaVencimiento` explícita.
 */
export function resolveAthleteDueDate(explicitDate?: string | null, today = new Date()): string {
  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate.trim())) {
    return explicitDate.trim();
  }
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  const dueObj = day > 5 ? new Date(year, month, 5) : new Date(year, month - 1, 5);
  const yyyy = dueObj.getFullYear();
  const mm = String(dueObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dueObj.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calcula dinámicamente los días de retraso transcurridos desde `fechaVencimiento`.
 */
export function calculateAthleteDaysOverdue(fechaVencimiento?: string | null, today = new Date()): number {
  const resolved = resolveAthleteDueDate(fechaVencimiento, today);
  const parts = resolved.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 1;

  const dueUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayUtc - dueUtc) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 1;
}

/**
 * Genera la vista previa exacta del mensaje formal de cobro para Soul Volley Club,
 * diferenciando entre Situación A (Pago Parcial con saldo restante) y Situación B (Mora Total).
 */
export function buildOverdueMessagePreview(params: {
  nombres: string;
  plan?: string;
  concepto?: string;
  valorPendiente?: number;
  valorAbonado?: number;
  valorTotalPlan?: number;
  fechaVencimiento?: string;
  diasMora?: number;
  esPagoParcial?: boolean;
}): string {
  const planInfo = getPlanDetails(params.plan || "Plan Alfa");
  const totalPlan = params.valorTotalPlan || planInfo?.normalPrice || 150000;
  const pendiente =
    params.valorPendiente !== undefined && params.valorPendiente !== null && params.valorPendiente > 0
      ? params.valorPendiente
      : params.valorAbonado && params.valorAbonado > 0 && params.valorAbonado < totalPlan
      ? totalPlan - params.valorAbonado
      : totalPlan;
  const abonado =
    params.valorAbonado !== undefined && params.valorAbonado !== null && params.valorAbonado > 0
      ? params.valorAbonado
      : Math.max(0, totalPlan - pendiente);

  const concepto = params.concepto || `Mensualidad - ${planInfo?.name || params.plan || "Plan Alfa"}`;
  const fechaVenc = resolveAthleteDueDate(params.fechaVencimiento);
  const dias = params.diasMora ?? calculateAthleteDaysOverdue(fechaVenc);
  const diasTexto = dias === 1 ? "1 día" : `${dias} días`;
  const paymentLink = getWompiPaymentLink(params.plan);

  if (params.esPagoParcial) {
    return (
      `🏐 *CLUB DE VOLEIBOL SOUL*\n` +
      `_Recordatorio de Saldo Pendiente (Pago Parcial)_\n\n` +
      `Hola *${params.nombres}*, esperamos que te encuentres muy bien.\n\n` +
      `Te escribimos desde la administración de *Soul Volley Club* para confirmar que tenemos registrado tu abono parcial y recordarte el saldo restante pendiente para completar tu mensualidad:\n\n` +
      `📋 *Concepto:* ${concepto}\n` +
      `🏷️ *Valor total del plan:* $${totalPlan.toLocaleString("es-CO")} COP\n` +
      (abonado > 0 ? `✅ *Abono registrado:* $${abonado.toLocaleString("es-CO")} COP\n` : "") +
      `💳 *Saldo restante por pagar:* $${pendiente.toLocaleString("es-CO")} COP\n` +
      `📅 *Fecha límite de pago:* ${fechaVenc}\n\n` +
      (paymentLink
        ? `🔗 *Paga tu saldo restante en línea aquí (Wompi / Nequi / PSE):*\n${paymentLink}\n\n` +
          `Te agradecemos realizar el pago a través del enlace anterior y enviarnos el soporte por este medio para actualizar tu estado a *Al día*.\n\n`
        : `Te agradecemos realizar el pago a través de nuestros canales autorizados (Transferencia Bancolombia / Nequi / Efectivo) y enviarnos el soporte por este medio para actualizar tu estado a *Al día*.\n\n`) +
      `_Si ya completaste el pago recientemente, por favor haz caso omiso a este mensaje y compártenos el comprobante._\n\n` +
      `¡Muchas gracias por tu compromiso con el club! 💜🏐`
    );
  }

  return (
    `🏐 *CLUB DE VOLEIBOL SOUL*\n` +
    `_Notificación Administrativa de Cartera en Mora_\n\n` +
    `Hola *${params.nombres}*, esperamos que te encuentres muy bien.\n\n` +
    `Te escribimos de manera atenta desde la administración de *Soul Volley Club* para recordarte que a la fecha tu mensualidad se encuentra pendiente de pago:\n\n` +
    `📋 *Concepto:* ${concepto}\n` +
    `💳 *Valor pendiente:* $${pendiente.toLocaleString("es-CO")} COP\n` +
    `📅 *Fecha de vencimiento:* ${fechaVenc}\n` +
    `⏳ *Tiempo en mora:* ${diasTexto}\n\n` +
    (paymentLink
      ? `🔗 *Paga tu mensualidad en línea aquí (Wompi / Nequi / PSE):*\n${paymentLink}\n\n` +
        `Te agradecemos realizar tu pago a través del enlace oficial anterior y enviarnos el soporte por este medio para actualizar tu estado a *Al día*.\n\n`
      : `Te agradecemos realizar tu pago a través de nuestros canales autorizados (Transferencia Bancolombia / Nequi / Efectivo) y enviarnos el soporte por este medio para actualizar tu estado a *Al día*.\n\n`) +
    `_Si ya realizaste el pago recientemente, por favor haz caso omiso a este mensaje y compártenos el comprobante._\n\n` +
    `¡Muchas gracias por tu puntualidad y compromiso con el club! 💜🏐`
  );
}

/**
 * Resuelve la URL base del backend (`serve-public.js`).
 */
async function requestBackendApi<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const urlsToTry = [endpoint, `http://localhost:3000${endpoint}`];
  let lastError: Error | null = null;

  for (const url of urlsToTry) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {})
        }
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Respuesta no JSON desde ${url}: ${text.slice(0, 120)}`);
      }

      if (!response.ok && !("reachable" in data)) {
        throw new Error(data.error || `Error HTTP ${response.status}`);
      }
      return data as T;
    } catch (err: any) {
      lastError = err;
      if (
        err?.message &&
        !err.message.includes("Failed to fetch") &&
        !err.message.includes("NetworkError") &&
        !err.message.includes("Respuesta no JSON")
      ) {
        throw err;
      }
    }
  }

  throw lastError || new Error("No se pudo conectar con el servidor backend de cobros.");
}

/**
 * 0. GET /api/whatsapp/ping (Diagnóstico de conectividad con servidor Oracle 193.122.218.65:3000)
 */
export async function pingWhatsAppBot(): Promise<PingBotResponse> {
  return requestBackendApi<PingBotResponse>("/api/whatsapp/ping", {
    method: "GET"
  });
}

/**
 * 1. GET /api/cartera/morosos
 */
export async function getMorososFromBackend(): Promise<{ total: number; morosos: MorosoItem[] }> {
  return requestBackendApi<{ total: number; morosos: MorosoItem[] }>("/api/cartera/morosos", {
    method: "GET"
  });
}

/**
 * 2. POST /api/whatsapp/cobro-mora-individual
 */
export async function sendCobroMoraIndividual(
  deportistaId: string,
  athlete?: Record<string, any>
): Promise<IndividualCobroResponse> {
  return requestBackendApi<IndividualCobroResponse>("/api/whatsapp/cobro-mora-individual", {
    method: "POST",
    body: JSON.stringify({ deportistaId, athlete })
  });
}

/**
 * 3. POST /api/whatsapp/cobro-mora-masivo
 */
export async function sendCobroMoraMasivo(
  morosos?: Array<Record<string, any>>
): Promise<MassiveCobroSummary> {
  return requestBackendApi<MassiveCobroSummary>("/api/whatsapp/cobro-mora-masivo", {
    method: "POST",
    body: JSON.stringify({ morosos })
  });
}
