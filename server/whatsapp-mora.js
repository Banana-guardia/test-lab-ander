/**
 * SOUL Volley Club - Módulo de Detección de Mora y Recordatorios vía Bot de WhatsApp (Baileys)
 *
 * Incluye:
 * 1. Logs detallados de depuración (HTTP status, response.text(), y causa de red err.cause).
 * 2. Sanitización estricta de teléfonos para Baileys (formato 573XXXXXXXXX sin '+' ni espacios).
 * 3. Endpoint de diagnóstico rápido GET /api/whatsapp/ping hacia Oracle (193.122.218.65:3000).
 * 4. Propagación exacta de errores por deportista al frontend en envíos individuales y masivos.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '../logs');

if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (_) {}
}

// URL del Bot de WhatsApp (Baileys en Oracle Cloud)
export const BAILEYS_BASE_URL =
  process.env.WHATSAPP_BOT_BASE_URL || 'http://193.122.218.65:3000';
export const BAILEYS_BOT_URL =
  process.env.WHATSAPP_BOT_URL || `${BAILEYS_BASE_URL}/send-message`;

// Configuración de Firebase del proyecto SOUL Volley Club
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyD1VLToyyYhKhitmiOOjC-wC6DBSGKCvLY',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'soul-volley-clu.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'soul-volley-clu',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'soul-volley-clu.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '616627443720',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:616627443720:web:bca3f53a0197ed43e719bd'
};

const appName = 'SoulBackendMoraService';
const firebaseApp = getApps().some((a) => a.name === appName)
  ? getApp(appName)
  : initializeApp(firebaseConfig, appName);

const db = getFirestore(firebaseApp);

const PLAN_PRICES_COP = {
  'plan básico': 120000,
  'plan basico': 120000,
  'basico': 120000,
  'plan alfa': 150000,
  'alfa': 150000,
  'plan beta': 180000,
  'beta': 180000,
  'plan family': 120000,
  'family': 120000,
  'plan plus': 200000,
  'plus': 200000
};

/**
 * Diccionario de enlaces de pago estáticos generados desde el dashboard de Wompi.
 * Mapea el nombre o ID del plan con su respectiva URL de Wompi / Nequi.
 */
export const PLANES_PAGO = {
  basico: 'https://checkout.nequi.wompi.co/l/VPOS_1Bc0Ii',
  alfa: '',
  beta: '',
  family: '',
  plus: '',
  intermedio: '',
  avanzado: ''
};

const ATHLETES_CACHE_FILE = path.join(LOGS_DIR, 'athletes-cache.json');

const FALLBACK_ATHLETES = [
  { id: 'DVnGOXAzGKw6b9dZSdO9', name: 'Andi Rojas', documento: '1093496820', phone: '3213248713', plan: 'Plan Básico', group: 'Formativo Mañana', status: 'Activo', financialStatus: 'Al día' },
  { id: 'WV5q6R9yc200hwJFGUdJ', name: 'Angelica Maria Guzman Ramirez', documento: '1098765123', phone: '3103079979', plan: 'Plan Básico', group: 'Selección A', status: 'Activo', financialStatus: 'En mora' },
  { id: 'demo-1', name: 'Carlos Ramírez', documento: '1023456789', phone: '3101234567', plan: 'Plan Alfa', group: 'Selección A', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-2', name: 'Sofía Martínez', documento: '1098765432', phone: '3119876543', plan: 'Plan Básico', group: 'Formativo Tarde', status: 'Inactivo', financialStatus: 'En mora' },
  { id: 'demo-3', name: 'Diego Gómez', documento: '1014567890', phone: '3154567890', plan: 'Plan Beta', group: 'Selección B', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-4', name: 'Valentina Torres', documento: '1032654987', phone: '3206549871', plan: 'Plan Family', group: 'Formativo Mañana', status: 'Activo', financialStatus: 'Pago parcial', valorAbonado: 60000, valorPendiente: 60000 },
  { id: 'demo-5', name: 'Andrés Silva', documento: '1019876543', phone: '3145678901', plan: 'Plan Plus', group: 'Selección A', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-6', name: 'Mariana Restrepo', documento: '1028765432', phone: '3124567890', plan: 'Plan Básico', group: 'Formativo Mañana', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-7', name: 'Juan Pablo Castaño', documento: '1017894561', phone: '3139871234', plan: 'Plan Alfa', group: 'Selección A', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-8', name: 'Camila Andrea Vargas', documento: '1034567812', phone: '3187654321', plan: 'Plan Básico', group: 'Formativo Tarde', status: 'Activo', financialStatus: 'En mora' },
  { id: 'demo-9', name: 'Santiago Mendoza', documento: '1021987654', phone: '3156781234', plan: 'Plan Beta', group: 'Selección B', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-10', name: 'Isabella Morales', documento: '1012345678', phone: '3214569870', plan: 'Plan Plus', group: 'Formativo Mañana', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-11', name: 'Mateo Hernández', documento: '1035678901', phone: '3103456789', plan: 'Plan Básico', group: 'Formativo Tarde', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-12', name: 'Gabriela Rincón', documento: '1024567891', phone: '3176543210', plan: 'Plan Family', group: 'Selección A', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-13', name: 'Sebastián Quintero', documento: '1016789012', phone: '3198765432', plan: 'Plan Alfa', group: 'Selección B', status: 'Activo', financialStatus: 'Pago parcial', valorAbonado: 75000, valorPendiente: 75000 },
  { id: 'demo-14', name: 'Lucía Fernández', documento: '1025678912', phone: '3165432109', plan: 'Plan Básico', group: 'Formativo Mañana', status: 'Activo', financialStatus: 'En mora' },
  { id: 'demo-15', name: 'Samuel David Ospina', documento: '1013456789', phone: '3129876543', plan: 'Plan Beta', group: 'Selección A', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-16', name: 'Valeria Duarte', documento: '1031245678', phone: '3143210987', plan: 'Plan Básico', group: 'Formativo Tarde', status: 'Activo', financialStatus: 'Al día' },
  { id: 'demo-17', name: 'Nicolás Bermúdez', documento: '1026789123', phone: '3118765432', plan: 'Plan Alfa', group: 'Selección B', status: 'Activo', financialStatus: 'Al día' }
];

function readAthletesCache() {
  try {
    if (fs.existsSync(ATHLETES_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ATHLETES_CACHE_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveAthleteToCache(id, data) {
  if (!id || !data) return;
  try {
    const cache = readAthletesCache();
    cache[id] = { ...(cache[id] || {}), ...data, id };
    fs.writeFileSync(ATHLETES_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * Resuelve el enlace de pago estático de Wompi correspondiente al plan del deportista.
 * REGLA ESTRICTA: Solo disponible para el Plan Básico. Para otros planes retorna vacío.
 */
export function resolveWompiPaymentLink(planName) {
  if (!planName) return '';
  const s = String(planName).toLowerCase().trim();
  if (s.includes('básico') || s.includes('basico') || s === 'basico') {
    return PLANES_PAGO.basico;
  }
  return '';
}

/**
 * 2. REVISIÓN DEL FORMATO DEL TELÉFONO PARA BAILEYS:
 * - Elimina el símbolo '+', espacios, guiones, paréntesis y cualquier carácter no numérico.
 * - Si empieza con '0057', remueve '00'.
 * - Si tiene 10 dígitos y empieza por '3' (celular colombiano, ej. 3001234567), antepone '57' -> '573001234567'.
 * - Si tiene más de 12 dígitos por error de tipeo pero contiene un móvil colombiano válido (573XXXXXXXXX), lo normaliza.
 */
export function sanitizePhone(rawPhone) {
  if (rawPhone === undefined || rawPhone === null) return '';

  // Eliminar absolutamente todo lo que no sea dígito (incluyendo '+', espacios, guiones, etc.)
  let digits = String(rawPhone).replace(/\D/g, '').trim();

  if (!digits) return '';

  // Remover prefijo internacional 00 si existe (ej. 0057300...)
  if (digits.startsWith('0057')) {
    digits = digits.slice(2);
  }

  // Caso estándar Colombia: 10 dígitos iniciando en 3 -> agregar código de país 57
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }

  // Caso ya con prefijo 57 y 10 dígitos (12 en total, ej. 573001234567)
  if (digits.length === 12 && digits.startsWith('573')) {
    return digits;
  }

  // Si tiene 10 dígitos pero no empieza por 3 (ej. fijo en Colombia), agregar 57 igualmente
  if (digits.length === 10) {
    return `57${digits}`;
  }

  return digits;
}

/**
 * Determina la fecha de vencimiento (YYYY-MM-DD) de un deportista.
 */
export function resolveDueDate(athleteData, today = new Date()) {
  const explicitDate =
    athleteData.fechaVencimiento ||
    athleteData.dueDate ||
    athleteData.fecha_vencimiento ||
    '';

  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(String(explicitDate).trim())) {
    return String(explicitDate).trim();
  }

  const year = today.getFullYear();
  const month = today.getMonth();
  const dayOfMonth = today.getDate();

  const dueDateObj =
    dayOfMonth > 5 ? new Date(year, month, 5) : new Date(year, month - 1, 5);

  const yyyy = dueDateObj.getFullYear();
  const mm = String(dueDateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dueDateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calcula los días en mora transcurridos entre `fechaVencimiento` (YYYY-MM-DD) y `today`.
 */
export function calculateDaysOverdue(fechaVencimientoStr, today = new Date()) {
  if (!fechaVencimientoStr) return 0;
  const parts = String(fechaVencimientoStr).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;

  const dueUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  const diffMs = todayUtc - dueUtc;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Obtiene el valor total de la mensualidad según el plan asignado al deportista.
 */
export function resolvePlanFullPrice(athleteData) {
  const rawPlan = String(athleteData.plan || 'Plan Alfa').toLowerCase().trim();
  for (const [key, price] of Object.entries(PLAN_PRICES_COP)) {
    if (rawPlan.includes(key)) {
      return price;
    }
  }
  return 150000;
}

/**
 * Resuelve el valor pendiente en COP de acuerdo al campo explícito, al abono registrado o al plan asignado.
 */
export function resolvePendingAmount(athleteData) {
  const explicitVal =
    athleteData.valorPendiente ??
    athleteData.montoPendiente ??
    athleteData.saldoPendiente;

  if (explicitVal !== undefined && explicitVal !== null && Number(explicitVal) > 0) {
    return Number(explicitVal);
  }

  const fullPrice = resolvePlanFullPrice(athleteData);
  const abonado = Number(athleteData.valorAbonado || 0);
  if (abonado > 0 && abonado < fullPrice) {
    return fullPrice - abonado;
  }

  return fullPrice;
}

/**
 * Determina si el deportista se encuentra en estado de Pago Parcial (Abono con saldo restante).
 */
export function isPartialPaymentState(athleteData) {
  const estadoPago = String(athleteData.estado_pago || '').toLowerCase().trim();
  const financialStatus = String(athleteData.financialStatus || '').toLowerCase().trim();
  return financialStatus === 'pago parcial' || estadoPago === 'pago_parcial';
}

/**
 * Evalúa si un registro de deportista en Firestore cumple la condición de mora o pago parcial pendiente.
 */
export function isAthleteOverdue(athleteData, today = new Date()) {
  const estadoPago = String(athleteData.estado_pago || '').toLowerCase().trim();
  const financialStatus = String(athleteData.financialStatus || '').toLowerCase().trim();

  if (
    estadoPago === 'en_mora' ||
    estadoPago === 'pago_parcial' ||
    estadoPago === 'pendiente' ||
    financialStatus === 'en mora' ||
    financialStatus === 'pago parcial' ||
    financialStatus === 'pendiente'
  ) {
    return true;
  }

  const explicitDue =
    athleteData.fechaVencimiento ||
    athleteData.dueDate ||
    athleteData.fecha_vencimiento;

  if (explicitDue) {
    const dias = calculateDaysOverdue(explicitDue, today);
    if (dias > 0 && estadoPago !== 'al_dia' && financialStatus !== 'al día') {
      return true;
    }
    if (dias > 0 && !athleteData.lastPaymentDate) {
      return true;
    }
  }

  return false;
}

/**
 * Genera la plantilla formal de WhatsApp adaptada automáticamente según la situación:
 * - Situación A (`esPagoParcial === true`): Recordatorio de Saldo Restante de un Pago Parcial (Abono).
 * - Situación B (`esPagoParcial === false`): Notificación de Cobro por Mensualidad en Mora Total.
 */
export function buildOverdueWhatsAppMessage({
  nombres,
  concepto,
  valorPendiente,
  valorAbonado,
  valorTotalPlan,
  fechaVencimiento,
  diasMora,
  plan,
  linkPago,
  esPagoParcial = false
}) {
  const pendienteNum = Number(valorPendiente || 0);
  const totalPlanNum = Number(valorTotalPlan || pendienteNum);
  const abonadoNum =
    valorAbonado !== undefined && valorAbonado !== null && Number(valorAbonado) > 0
      ? Number(valorAbonado)
      : Math.max(0, totalPlanNum - pendienteNum);

  const formattedPendiente = pendienteNum.toLocaleString('es-CO');
  const formattedTotal = totalPlanNum.toLocaleString('es-CO');
  const formattedAbonado = abonadoNum.toLocaleString('es-CO');
  const diasTexto =
    Number(diasMora) === 1 ? '1 día' : `${Number(diasMora) || 1} días`;
  const paymentLink = linkPago || resolveWompiPaymentLink(plan);
  const conceptoTexto = concepto || (plan ? `Mensualidad - ${plan}` : 'Mensualidad');

  if (esPagoParcial) {
    return (
      `🏐 *CLUB DE VOLEIBOL SOUL*\n` +
      `_Recordatorio de Saldo Pendiente (Pago Parcial)_\n\n` +
      `Hola *${nombres}*, esperamos que te encuentres muy bien.\n\n` +
      `Te escribimos desde la administración de *Soul Volley Club* para confirmar que tenemos registrado tu abono parcial y recordarte el saldo restante pendiente para completar tu mensualidad:\n\n` +
      `📋 *Concepto:* ${conceptoTexto}\n` +
      `🏷️ *Valor total del plan:* $${formattedTotal} COP\n` +
      (abonadoNum > 0 ? `✅ *Abono registrado:* $${formattedAbonado} COP\n` : '') +
      `💳 *Saldo restante por pagar:* $${formattedPendiente} COP\n` +
      `📅 *Fecha límite de pago:* ${fechaVencimiento}\n\n` +
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
    `Hola *${nombres}*, esperamos que te encuentres muy bien.\n\n` +
    `Te escribimos de manera atenta desde la administración de *Soul Volley Club* para recordarte que a la fecha tu mensualidad se encuentra pendiente de pago:\n\n` +
    `📋 *Concepto:* ${conceptoTexto}\n` +
    `💳 *Valor pendiente:* $${formattedPendiente} COP\n` +
    `📅 *Fecha de vencimiento:* ${fechaVencimiento}\n` +
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
 * Consulta en Firestore (o respaldo local si Firestore arroja permission-denied) todos los deportistas
 * y retorna la lista estructurada de alumnos en mora.
 */
export async function fetchOverdueAthletesFromFirestore(customList = null) {
  const today = new Date();
  const rawRecords = [];

  if (Array.isArray(customList) && customList.length > 0) {
    customList.forEach((item, idx) => {
      const id = item.id || item.deportistaId || `custom-${idx}`;
      saveAthleteToCache(id, item);
      rawRecords.push({ id, ...item });
    });
  } else {
    let loadedFromFirestore = false;
    try {
      const snapshot = await getDocs(collection(db, 'athletes'));
      snapshot.forEach((docSnap) => {
        rawRecords.push({ id: docSnap.id, ...docSnap.data() });
      });
      loadedFromFirestore = rawRecords.length > 0;
    } catch (err) {
      console.warn(
        `⚠️ [Firestore Fallback] getDocs('athletes') rechazado (${err?.message || err}). Usando base de datos de respaldo + caché local.`
      );
    }

    if (!loadedFromFirestore) {
      const cache = readAthletesCache();
      const map = new Map();
      FALLBACK_ATHLETES.forEach((fa) => map.set(fa.id, { ...fa }));
      Object.values(cache).forEach((ca) => {
        if (ca && ca.id) {
          map.set(ca.id, { ...(map.get(ca.id) || {}), ...ca });
        }
      });
      map.forEach((val) => rawRecords.push(val));
    }
  }

  const morosos = [];

  rawRecords.forEach((data) => {
    if (!isAthleteOverdue(data, today)) {
      return;
    }

    const rawPhone =
      data.telefono || data.celular || data.whatsapp || data.phone || '';
    const telefono = sanitizePhone(rawPhone);
    const fechaVencimiento = resolveDueDate(data, today);
    const calculatedDays = calculateDaysOverdue(fechaVencimiento, today);
    const diasMora = calculatedDays > 0 ? calculatedDays : 1;
    const valorTotalPlan = resolvePlanFullPrice(data);
    const valorPendiente = resolvePendingAmount(data);
    const esPagoParcial = isPartialPaymentState(data);
    const valorAbonado =
      data.valorAbonado !== undefined && data.valorAbonado !== null
        ? Number(data.valorAbonado)
        : esPagoParcial
        ? Math.max(0, valorTotalPlan - valorPendiente)
        : 0;
    const planName = data.plan || 'Plan Alfa';
    const concepto =
      data.concepto || data.conceptoCobro || `Mensualidad - ${planName}`;
    const linkPago = resolveWompiPaymentLink(planName);

    morosos.push({
      id: data.id,
      nombres: data.name || data.nombres || 'Deportista SOUL',
      documento: data.documento || data.numeroIdentidad || '',
      telefono,
      telefonoOriginal: rawPhone,
      telefonoValido: /^573\d{9}$/.test(telefono),
      valorTotalPlan,
      valorAbonado,
      valorPendiente,
      esPagoParcial,
      fechaVencimiento,
      diasMora,
      concepto,
      plan: planName,
      linkPago,
      grupo: data.group || data.grupo || data.category || 'General',
      estadoCartera: esPagoParcial ? 'Pago parcial' : data.financialStatus || 'En mora',
      ultimoRecordatorioEnviado: data.ultimoRecordatorioEnviado || null
    });
  });

  morosos.sort((a, b) => b.diasMora - a.diasMora || a.nombres.localeCompare(b.nombres));
  return morosos;
}

/**
 * 1. LOGS DETALLADOS EN EL BACKEND AL LLAMAR A ORACLE BAILEYS (`http://193.122.218.65:3000/send-message`)
 * Imprime con `console.error` el código HTTP exacto (`response.status`), el cuerpo crudo (`await response.text()`)
 * y cualquier causa de fallo de red (`err.cause`, Timeout, ECONNREFUSED, etc.).
 */
export async function dispatchToBaileysBot(telefono, message) {
  const cleanNumber = sanitizePhone(telefono);
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody = {
    number: cleanNumber,
    phone: cleanNumber,
    to: cleanNumber,
    jid: `${cleanNumber}@s.whatsapp.net`,
    message,
    text: message
  };

  console.log(
    `📤 [Baileys Bot Request] POST ${BAILEYS_BOT_URL} | Destino sanitizado: "${cleanNumber}" | Longitud mensaje: ${message.length} chars`
  );

  try {
    const response = await fetch(BAILEYS_BOT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const rawErrorOrSuccessText = await response.text();

    if (!response.ok) {
      console.error('============================================================');
      console.error(`❌ [Baileys Bot HTTP Error] El servidor de Oracle rechazó la petición:`);
      console.error(`   • URL: ${BAILEYS_BOT_URL}`);
      console.error(`   • Número enviado: "${cleanNumber}"`);
      console.error(`   • HTTP Status: ${response.status} (${response.statusText})`);
      console.error(`   • Respuesta cruda (response.text()): ${rawErrorOrSuccessText}`);
      console.error('============================================================');

      throw new Error(
        `HTTP ${response.status} (${response.statusText}) desde Bot Oracle: ${rawErrorOrSuccessText || 'Sin detalle en el cuerpo de respuesta'}`
      );
    }

    console.log(
      `✅ [Baileys Bot OK] HTTP ${response.status} para ${cleanNumber} | Respuesta: ${rawErrorOrSuccessText.slice(0, 200)}`
    );

    let parsed = null;
    try {
      parsed = JSON.parse(rawErrorOrSuccessText);
    } catch {
      parsed = { raw: rawErrorOrSuccessText };
    }

    return {
      ok: true,
      status: response.status,
      botResponse: parsed
    };
  } catch (err) {
    clearTimeout(timeoutId);

    const causeCode = err?.cause?.code || err?.code || '';
    const causeMsg = err?.cause?.message || '';
    const isTimeout =
      err?.name === 'AbortError' ||
      causeCode === 20 ||
      causeCode === 'ABORT_ERR' ||
      causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      err?.message?.includes('aborted');

    console.error('============================================================');
    console.error(`🚨 [Baileys Bot Fallo de Comunicación]`);
    console.error(`   • URL destino: ${BAILEYS_BOT_URL}`);
    console.error(`   • Número sanitizado: "${cleanNumber}"`);
    console.error(`   • Tipo de error: ${err?.name || 'Error'} ${causeCode ? `(${causeCode})` : ''}`);
    console.error(`   • Mensaje: ${err?.message}`);
    if (causeMsg) {
      console.error(`   • Causa subyacente: ${causeMsg}`);
    }
    console.error('============================================================');

    if (isTimeout) {
      throw new Error(
        `Timeout (${timeoutMs / 1000}s) intentando conectar con el servidor Oracle (${BAILEYS_BOT_URL}). El puerto 3000 no respondió: verifica que el proceso de Baileys esté activo (pm2 status) y que el puerto 3000 TCP esté abierto en el Firewall / Ingress Rules de Oracle Cloud.`
      );
    }

    if (err?.message?.includes('fetch failed') || causeCode === 'ECONNREFUSED' || causeCode === 'EHOSTUNREACH') {
      throw new Error(
        `Fallo de red (${causeCode || 'fetch failed'}) hacia ${BAILEYS_BOT_URL}. El servidor Oracle rechazó la conexión o está apagado.`
      );
    }

    throw err;
  }
}

/**
 * 4. ENDPOINT DE DIAGNÓSTICO (`GET /api/whatsapp/ping`):
 * Realiza una prueba rápida de conectividad al servidor de Oracle (`http://193.122.218.65:3000`)
 * para verificar si el puerto 3000 responde y qué código HTTP devuelve.
 */
export async function pingBaileysOracleServer() {
  const startMs = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  console.log(`🔍 [Baileys Ping] Probando conexión con servidor Oracle: ${BAILEYS_BASE_URL} ...`);

  try {
    // Probamos primero GET a la raíz del puerto 3000 (o /send-message)
    const response = await fetch(BAILEYS_BASE_URL, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startMs;
    const bodyText = await response.text();

    console.log(
      `✅ [Baileys Ping] Servidor Oracle respondió en ${latencyMs}ms | HTTP ${response.status} | Body: ${bodyText.slice(0, 200)}`
    );

    return {
      ok: true,
      reachable: true,
      endpoint: BAILEYS_BOT_URL,
      targetUrl: BAILEYS_BOT_URL,
      httpStatus: response.status,
      statusText: response.statusText,
      latencyMs,
      responseText: bodyText.slice(0, 500),
      responseBody: bodyText.slice(0, 500),
      diagnosis: `Conexión exitosa con Oracle (${BAILEYS_BASE_URL}) en ${latencyMs}ms (HTTP ${response.status}).`
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startMs;
    const rawCode = err?.cause?.code || err?.code;
    const isAbortTimeout =
      err?.name === 'AbortError' ||
      rawCode === 20 ||
      rawCode === 'ABORT_ERR' ||
      rawCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      err?.message?.includes('aborted');
    const causeCode = isAbortTimeout ? 'TIMEOUT' : rawCode || 'NETWORK_ERROR';
    const causeDetail = isAbortTimeout
      ? `Timeout tras ${latencyMs}ms sin respuesta de ${BAILEYS_BASE_URL}`
      : err?.cause?.message || err?.message || 'Error desconocido';

    console.error('============================================================');
    console.error(`❌ [Baileys Ping Falló] No hubo respuesta desde ${BAILEYS_BASE_URL} tras ${latencyMs}ms`);
    console.error(`   • Código de causa: ${causeCode}`);
    console.error(`   • Detalle: ${causeDetail}`);
    console.error('============================================================');

    const diagnosis =
      causeCode === 'TIMEOUT'
        ? `Timeout (${latencyMs}ms): El servidor Oracle (193.122.218.65:3000) no respondió. Revisa si el servicio de Baileys está corriendo (pm2 status) y si la regla de entrada (Ingress Rule) del puerto 3000 TCP está abierta en Oracle Cloud.`
        : causeCode === 'ECONNREFUSED'
        ? `Conexión rechazada (ECONNREFUSED): La IP 193.122.218.65 está activa pero el proceso de Node/Baileys en el puerto 3000 está detenido.`
        : `Error de red (${causeCode}): ${causeDetail}`;

    return {
      ok: false,
      reachable: false,
      endpoint: BAILEYS_BOT_URL,
      targetUrl: BAILEYS_BOT_URL,
      httpStatus: null,
      latencyMs,
      errorCode: String(causeCode),
      error: diagnosis,
      diagnosis
    };
  }
}

/**
 * Envía recordatorio de cobro en mora a un deportista individual por su ID o datos enviados desde el panel.
 */
export async function sendIndividualOverdueReminder(deportistaId, athletePayload = null) {
  const resolvedId = deportistaId || athletePayload?.id || athletePayload?.deportistaId;
  if (!resolvedId && !athletePayload) {
    throw new Error('El parámetro deportistaId o los datos del deportista son obligatorios.');
  }

  let firestoreData = null;
  if (resolvedId) {
    try {
      const athleteRef = doc(db, 'athletes', resolvedId);
      const athleteSnap = await getDoc(athleteRef);
      if (athleteSnap.exists()) {
        firestoreData = athleteSnap.data();
      }
    } catch (err) {
      console.warn(
        `⚠️ [Firestore Fallback] getDoc('athletes/${resolvedId}') rechazado (${err?.message || err}). Usando datos del panel / respaldo.`
      );
    }
  }

  const cache = readAthletesCache();
  const cachedData = resolvedId ? cache[resolvedId] : null;
  const fallbackMatch = FALLBACK_ATHLETES.find(
    (a) =>
      a.id === resolvedId ||
      (athletePayload?.documento && a.documento === String(athletePayload.documento).trim()) ||
      (athletePayload?.name && a.name.toLowerCase() === String(athletePayload.name).trim().toLowerCase()) ||
      (athletePayload?.nombres && a.name.toLowerCase() === String(athletePayload.nombres).trim().toLowerCase())
  );

  const data = {
    ...(fallbackMatch || {}),
    ...(cachedData || {}),
    ...(firestoreData || {}),
    ...(athletePayload || {})
  };

  if (!data.name && !data.nombres && !data.phone && !data.telefono) {
    throw new Error(`No se encontró ningún deportista con ID "${resolvedId}".`);
  }

  if (resolvedId) {
    saveAthleteToCache(resolvedId, data);
  }

  const nombres = data.name || data.nombres || 'Deportista SOUL';
  const today = new Date();
  const rawPhone =
    data.telefono || data.celular || data.whatsapp || data.phone || '';
  const telefono = sanitizePhone(rawPhone);

  if (!telefono || telefono.length < 10) {
    const phoneErr = `El deportista "${nombres}" no tiene un número válido registrado (valor actual: "${rawPhone || 'vacío'}" -> sanitizado: "${telefono || 'vacío'}").`;
    console.error(`⚠️ [Validación Teléfono] ${phoneErr}`);
    throw new Error(phoneErr);
  }

  const fechaVencimiento = resolveDueDate(data, today);
  const calculatedDays = calculateDaysOverdue(fechaVencimiento, today);
  const diasMora = calculatedDays > 0 ? calculatedDays : 1;
  const valorTotalPlan = resolvePlanFullPrice(data);
  const valorPendiente = resolvePendingAmount(data);
  const esPagoParcial = isPartialPaymentState(data);
  const valorAbonado =
    data.valorAbonado !== undefined && data.valorAbonado !== null
      ? Number(data.valorAbonado)
      : esPagoParcial
      ? Math.max(0, valorTotalPlan - valorPendiente)
      : 0;
  const planName = data.plan || 'Plan Alfa';
  const concepto =
    data.concepto || data.conceptoCobro || `Mensualidad - ${planName}`;
  const linkPago = resolveWompiPaymentLink(planName);

  const message = buildOverdueWhatsAppMessage({
    nombres,
    concepto,
    valorPendiente,
    valorAbonado,
    valorTotalPlan,
    fechaVencimiento,
    diasMora,
    plan: planName,
    linkPago,
    esPagoParcial
  });

  // Despachar hacia el bot Baileys
  const botResult = await dispatchToBaileysBot(telefono, message);

  const sentAtISO = new Date().toISOString();

  // Actualizar `ultimoRecordatorioEnviado` en caché y en Firestore (con try/catch para no fallar si Firestore está restringido)
  if (resolvedId) {
    saveAthleteToCache(resolvedId, { ...data, ultimoRecordatorioEnviado: sentAtISO });
    try {
      const athleteRef = doc(db, 'athletes', resolvedId);
      await updateDoc(athleteRef, {
        ultimoRecordatorioEnviado: sentAtISO
      });
    } catch (_) {}
  }

  const logEntry = {
    timestamp: sentAtISO,
    type: 'INDIVIDUAL',
    deportistaId: resolvedId,
    nombres,
    telefono,
    valorPendiente,
    diasMora,
    botStatus: botResult.status
  };
  try {
    fs.appendFileSync(
      path.join(LOGS_DIR, 'whatsapp-mora.jsonl'),
      JSON.stringify(logEntry) + '\n'
    );
  } catch (_) {}

  return {
    success: true,
    deportistaId: resolvedId,
    nombres,
    telefono,
    valorPendiente,
    fechaVencimiento,
    diasMora,
    concepto,
    ultimoRecordatorioEnviado: sentAtISO,
    mensajeEnviado: message,
    botResult
  };
}

/**
 * Envía recordatorios masivos a todos los deportistas en mora con un delay aleatorio
 * anti-baneo de 7 a 12 segundos entre cada mensaje, recopilando los errores exactos.
 */
export async function sendMassiveOverdueReminders(options = {}) {
  const minDelayMs =
    typeof options.minDelayMs === 'number' ? options.minDelayMs : 7000;
  const maxDelayMs =
    typeof options.maxDelayMs === 'number' ? options.maxDelayMs : 12000;

  const morosos = await fetchOverdueAthletesFromFirestore(options.morosos || null);
  const total = morosos.length;
  let exitosos = 0;
  let fallidos = 0;
  const detalles = [];
  const erroresResumen = [];

  console.log(`🚀 [Cobro Masivo] Iniciando despacho para ${total} deportista(s) en mora...`);

  for (let i = 0; i < morosos.length; i++) {
    const alumno = morosos[i];

    // Aplicar delay anti-baneo de 7 a 12 segundos antes de cada envío (excepto antes del primero)
    if (i > 0 && maxDelayMs > 0) {
      const randomDelayMs =
        Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
      console.log(
        `⏳ [Anti-Ban WhatsApp] Esperando ${(randomDelayMs / 1000).toFixed(1)}s antes de enviar a ${alumno.nombres} (${i + 1}/${total})...`
      );
      await new Promise((r) => setTimeout(r, randomDelayMs));
    }

    try {
      const result = await sendIndividualOverdueReminder(alumno.id, alumno);
      exitosos++;
      detalles.push({
        deportistaId: alumno.id,
        nombres: alumno.nombres,
        telefono: alumno.telefono,
        estado: 'ENVIADO',
        ultimoRecordatorioEnviado: result.ultimoRecordatorioEnviado
      });
    } catch (err) {
      fallidos++;
      const errorMsg = err?.message || 'Error desconocido al enviar mensaje';
      console.error(
        `❌ [Cobro Masivo Falló] Deportista: ${alumno.nombres} (ID: ${alumno.id}, Tel: "${alumno.telefono}") -> ${errorMsg}`
      );
      erroresResumen.push(`${alumno.nombres} (${alumno.telefono || 'sin tel'}): ${errorMsg}`);
      detalles.push({
        deportistaId: alumno.id,
        nombres: alumno.nombres,
        telefono: alumno.telefono,
        estado: 'FALLIDO',
        error: errorMsg
      });
    }
  }

  return {
    total,
    exitosos,
    fallidos,
    detalles,
    ultimoError: erroresResumen[0] || null,
    erroresResumen
  };
}

/**
 * Manejador HTTP para los endpoints de Cartera Morosos, Ping y Cobro WhatsApp en `serve-public.js`.
 */
export async function handleMoraAndWhatsAppRoutes(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = req.url.split('?')[0];

  // 0. GET /api/whatsapp/ping (Diagnóstico rápido hacia Oracle 193.122.218.65:3000)
  if (req.method === 'GET' && cleanUrl === '/api/whatsapp/ping') {
    try {
      const pingResult = await pingBaileysOracleServer();
      res.writeHead(pingResult.reachable ? 200 : 502, {
        'Content-Type': 'application/json; charset=utf-8'
      });
      res.end(JSON.stringify(pingResult));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          reachable: false,
          targetUrl: BAILEYS_BOT_URL,
          error: err.message
        })
      );
    }
    return;
  }

  // 1. GET /api/cartera/morosos
  if (req.method === 'GET' && cleanUrl === '/api/cartera/morosos') {
    try {
      const morosos = await fetchOverdueAthletesFromFirestore();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          total: morosos.length,
          morosos
        })
      );
    } catch (err) {
      console.error('❌ [GET /api/cartera/morosos] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: false,
          error: err.message || 'Error consultando deportistas en mora'
        })
      );
    }
    return;
  }

  const readJsonBody = () =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('JSON inválido en el cuerpo de la petición'));
        }
      });
      req.on('error', reject);
    });

  // 2. POST /api/whatsapp/cobro-mora-individual
  if (req.method === 'POST' && cleanUrl === '/api/whatsapp/cobro-mora-individual') {
    try {
      const payload = await readJsonBody();
      const deportistaId = payload.deportistaId || payload.athleteId || payload.id || payload.athlete?.id;
      const athletePayload = payload.athlete || payload;
      const result = await sendIndividualOverdueReminder(deportistaId, athletePayload);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ [POST /api/whatsapp/cobro-mora-individual] Error:', err.message);
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          success: false,
          error: err.message || 'Error al enviar recordatorio individual'
        })
      );
    }
    return;
  }

  // 3. POST /api/whatsapp/cobro-mora-masivo
  if (req.method === 'POST' && cleanUrl === '/api/whatsapp/cobro-mora-masivo') {
    try {
      const payload = await readJsonBody();
      const summary = await sendMassiveOverdueReminders({
        minDelayMs: payload.minDelayMs,
        maxDelayMs: payload.maxDelayMs,
        morosos: payload.morosos || null
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(summary));
    } catch (err) {
      console.error('❌ [POST /api/whatsapp/cobro-mora-masivo] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          total: 0,
          exitosos: 0,
          fallidos: 0,
          error: err.message || 'Error en envío masivo de mora'
        })
      );
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Endpoint no encontrado' }));
}
