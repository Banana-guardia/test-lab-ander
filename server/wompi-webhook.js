/**
 * SOUL Volley Club - Pasarela de Pagos Wompi (Firma Criptográfica SHA-256 + Webhook + Firestore + Recibo WhatsApp)
 *
 * Endpoints soportados:
 * 1. POST /api/pagos/generar-firma
 *    - Recibe monto (en COP) y datos del alumno.
 *    - Genera referencia única (alfanumérica con guiones).
 *    - Calcula amount-in-cents = monto * 100.
 *    - Genera el hash SHA256 concatenando exactamente:
 *      <Referencia><MontoEnCentavos><Moneda><SecretoIntegridad>
 *    - Retorna { reference, amountInCents, currency, signature } sin exponer jamás el secreto de integridad.
 *
 * 2. POST /api/pagos/webhook-wompi (y /api/wompi/webhook)
 *    - Recibe eventos de transacción de Wompi (transaction.updated).
 *    - Extrae el ID de la transacción (transaction.id) y el estado final (transaction.status).
 *    - Si es APPROVED:
 *      a) Actualiza el estado de la cuota del deportista en Firestore (de pendiente/en_mora a pagado / "Al día").
 *      b) Registra el ingreso en la colección `finances` y la alerta en `payment_notifications`.
 *      c) Envía el recibo de pago al alumno a través del bot de WhatsApp (Baileys en http://193.122.218.65:3000/send-message).
 */

import crypto from 'node:crypto';
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
  setDoc,
  updateDoc,
  addDoc
} from 'firebase/firestore';
import { sanitizePhone, dispatchToBaileysBot, BAILEYS_BOT_URL } from './whatsapp-mora.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '../logs');

// Cargar variables desde archivo .env si existe
function loadDotEnvIfPresent() {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch (_) {}
}

loadDotEnvIfPresent();

if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (_) {}
}

// Secretos y llaves de Wompi (El secreto de integridad SOLO vive en el servidor Node.js)
const WOMPI_PUBLIC_KEY =
  process.env.WOMPI_PUBLIC_KEY ||
  process.env.VITE_WOMPI_PUBLIC_KEY ||
  'pub_test_Q5yDA9xoKdePzhSGeVe9HAez7HgGObCi';

const WOMPI_INTEGRITY_SECRET =
  process.env.WOMPI_INTEGRITY_SECRET ||
  process.env.VITE_WOMPI_INTEGRITY_SECRET ||
  'test_integrity_45Kj9PZ8xL0q1m3v5b7n9';

const WOMPI_EVENTS_SECRET =
  process.env.WOMPI_EVENTS_SECRET || 'test_events_secret_12345';

const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || '';

// Configuración de Firebase Firestore
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyD1VLToyyYhKhitmiOOjC-wC6DBSGKCvLY',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'soul-volley-clu.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'soul-volley-clu',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'soul-volley-clu.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '616627443720',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:616627443720:web:bca3f53a0197ed43e719bd'
};

const appName = 'SoulBackendWompiService';
const firebaseApp = getApps().some((a) => a.name === appName)
  ? getApp(appName)
  : initializeApp(firebaseConfig, appName);

const db = getFirestore(firebaseApp);

// Memoria caché de intenciones de pago generadas por /api/pagos/generar-firma
const paymentIntentsCache = new Map();

/**
 * Genera una referencia única alfanumérica con guiones para Wompi.
 * Ejemplo: SOUL-MEN-ANDR-37891234-8492
 */
export function buildUniqueWompiReference(alumnoNombreOrId = 'ALUMNO', prefix = 'MEN') {
  const cleanPrefix =
    String(prefix || 'MEN')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4) || 'MEN';

  const cleanSlug =
    String(alumnoNombreOrId || 'ATL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4) || 'SOUL';

  const timestampPart = Date.now().toString().slice(-8);
  const randomPart = crypto.randomInt(1000, 9999);

  return `SOUL-${cleanPrefix}-${cleanSlug}-${timestampPart}-${randomPart}`;
}

/**
 * Calcula el hash criptográfico SHA256 exigido por el Widget de Wompi.
 * Orden estricto oficial de concatenación:
 * <Referencia><MontoEnCentavos><Moneda><SecretoIntegridad>
 */
export function generateWompiIntegrityHash(
  reference,
  amountInCents,
  currency = 'COP',
  integritySecret = WOMPI_INTEGRITY_SECRET
) {
  const cadenaConcatenada = `${reference}${amountInCents}${currency}${integritySecret}`;
  return crypto.createHash('sha256').update(cadenaConcatenada, 'utf8').digest('hex');
}

/**
 * Valida la firma de integridad de los eventos Webhook enviados por Wompi.
 * Fórmula oficial Wompi:
 * SHA256(concatenación de las propiedades indicadas en signature.properties + timestamp + eventsSecret)
 */
export function verifyWompiChecksum(eventPayload, secret = WOMPI_EVENTS_SECRET) {
  if (!eventPayload?.signature || !eventPayload?.signature?.checksum) {
    return { valid: false, reason: 'Evento sin estructura de firma' };
  }

  const { properties, checksum } = eventPayload.signature;
  const timestamp = eventPayload.timestamp;

  if (!properties || !Array.isArray(properties) || !timestamp) {
    return { valid: false, reason: 'Propiedades de firma o timestamp ausentes' };
  }

  try {
    let concatenated = '';
    for (const propPath of properties) {
      const keys = propPath.split('.');
      let val = eventPayload.data;
      for (const k of keys) {
        val = val ? val[k] : undefined;
      }
      concatenated += val !== undefined && val !== null ? String(val) : '';
    }

    concatenated += String(timestamp);
    concatenated += secret;

    const calculatedChecksum = crypto
      .createHash('sha256')
      .update(concatenated, 'utf8')
      .digest('hex');

    const isValid = calculatedChecksum.toLowerCase() === checksum.toLowerCase();
    return {
      valid: isValid,
      calculated: calculatedChecksum,
      received: checksum
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Construye el mensaje de WhatsApp con el Recibo Oficial de Pago Aprobado para el alumno.
 */
export function buildWhatsAppPaymentReceiptMessage({
  nombres,
  concepto,
  montoCOP,
  reference,
  transactionId,
  paymentMethod,
  fechaPago
}) {
  const formattedMonto = Number(montoCOP || 0).toLocaleString('es-CO');
  return (
    `🏐 *CLUB DE VOLEIBOL SOUL*\n` +
    `✅ *COMPROBANTE OFICIAL DE PAGO APROBADO*\n\n` +
    `Hola *${nombres}*, ¡gracias por tu pago! Te confirmamos que hemos recibido y validado exitosamente tu transacción a través de *Wompi*:\n\n` +
    `🧾 *Referencia:* ${reference}\n` +
    `🆔 *ID Transacción Wompi:* ${transactionId}\n` +
    `📋 *Concepto:* ${concepto}\n` +
    `💰 *Valor Pagado:* $${formattedMonto} COP\n` +
    `💳 *Medio de Pago:* ${paymentMethod || 'Wompi Online'}\n` +
    `📅 *Fecha:* ${fechaPago}\n` +
    `🟢 *Estado de Cartera:* PAGADO (Al día)\n\n` +
    `Tu estado en el sistema ha sido actualizado automáticamente a *Al día*.\n\n` +
    `¡Nos vemos en la cancha! 💜🏐`
  );
}

/**
 * Busca al deportista en Firestore a partir de los datos de la intención de pago o de la transacción de Wompi.
 */
async function findAthleteInFirestore({ athleteId, reference, customerEmail, customerPhone, customerName, legalId }) {
  try {
    // 1. Si tenemos athleteId directo, consultarlo
    if (athleteId) {
      const directRef = doc(db, 'athletes', String(athleteId));
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        return { id: directSnap.id, ...directSnap.data() };
      }
    }

    // 2. Consultar todos los deportistas para coincidencia por documento, email, teléfono o nombre
    const snapshot = await getDocs(collection(db, 'athletes'));
    let matched = null;

    const cleanEmail = String(customerEmail || '').trim().toLowerCase();
    const cleanDoc = String(legalId || '').trim().toLowerCase();
    const cleanPhone = sanitizePhone(customerPhone || '');
    const cleanName = String(customerName || '').trim().toLowerCase();

    snapshot.forEach((docSnap) => {
      if (matched) return;
      const data = docSnap.data();
      const docAthleteId = docSnap.id;

      // Coincidencia por documento
      const athleteDoc = String(data.documento || data.numeroIdentidad || data.cedula || '').trim().toLowerCase();
      if (cleanDoc && athleteDoc && athleteDoc === cleanDoc) {
        matched = { id: docAthleteId, ...data };
        return;
      }

      // Coincidencia por nombre exacto
      const athleteName = String(data.name || data.nombres || '').trim().toLowerCase();
      if (cleanName && athleteName && athleteName === cleanName) {
        matched = { id: docAthleteId, ...data };
        return;
      }

      // Coincidencia por email (si no es el genérico)
      const athleteEmail = String(data.email || '').trim().toLowerCase();
      if (cleanEmail && cleanEmail !== 'deportista@soul.com' && athleteEmail === cleanEmail) {
        matched = { id: docAthleteId, ...data };
        return;
      }

      // Coincidencia por teléfono sanitizado
      const athletePhone = sanitizePhone(data.telefono || data.phone || data.celular || data.whatsapp || '');
      if (cleanPhone && athletePhone && athletePhone === cleanPhone) {
        matched = { id: docAthleteId, ...data };
        return;
      }
    });

    // 3. Si aún no se encontró, intentar por el prefijo del nombre en la referencia (ej. SOUL-MEN-ANDR-...)
    if (!matched && reference) {
      const slug = extractAthleteNameFromReference(reference).toLowerCase();
      if (slug && slug.length >= 3) {
        snapshot.forEach((docSnap) => {
          if (matched) return;
          const data = docSnap.data();
          const normalizedName = String(data.name || data.nombres || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase();
          if (normalizedName.startsWith(slug)) {
            matched = { id: docSnap.id, ...data };
          }
        });
      }
    }

    return matched;
  } catch (err) {
    console.error('⚠️ [Wompi Webhook] Error buscando deportista en Firestore:', err.message);
    return null;
  }
}

/**
 * Sincroniza la transacción con Google Sheets disparando el webhook de Google Apps Script.
 */
export async function syncToGoogleSheets(paymentData) {
  const rowData = {
    timestamp: new Date().toISOString(),
    fechaLocal: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
    referencia: paymentData.reference,
    idTransaccionWompi: paymentData.wompiTxId,
    deportista: paymentData.athleteName || 'No especificado',
    correo: paymentData.customerEmail || 'No especificado',
    plan: paymentData.plan || 'Plan Voleibol SOUL',
    montoCOP: paymentData.amount,
    montoEnCentavos: paymentData.amountInCents,
    metodoPago: paymentData.paymentMethod || 'Wompi',
    estado: 'APROBADO',
    origen: 'Wompi Webhook'
  };

  const logEntry = `[${rowData.timestamp}] SYNC-SHEETS: ${JSON.stringify(rowData)}\n`;
  const logFilePath = path.join(LOGS_DIR, 'google-sheets-sync.log');

  try {
    fs.appendFileSync(logFilePath, logEntry);
  } catch (_) {}

  if (GOOGLE_SHEETS_WEBHOOK_URL && GOOGLE_SHEETS_WEBHOOK_URL.startsWith('http')) {
    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowData)
      });
      const resultText = await response.text();
      return { success: true, response: resultText };
    } catch (sheetError) {
      return { success: false, error: sheetError.message };
    }
  }
  return { success: true, note: 'Logged locally' };
}

/**
 * Procesa una transacción aprobada desde el Webhook de Wompi:
 * 1. Actualiza la cuota del deportista en Firestore (de `pendiente`/`en_mora` a `pagado` / `Al día`).
 * 2. Registra el movimiento en `finances` y `payment_notifications`.
 * 3. Envía el recibo de pago al alumno por el Bot de WhatsApp (`http://193.122.218.65:3000/send-message`).
 */
export async function processApprovedPayment(transaction) {
  const amountInCents = Number(transaction.amount_in_cents || transaction.amountInCents || 0);
  const amountCOP = Math.round(amountInCents / 100);
  const ref = transaction.reference || 'SOUL-REF-DESCONOCIDA';
  const txId = String(transaction.id || `WOMPI-${Date.now()}`);
  const paymentMethod =
    transaction.payment_method_type || transaction.paymentMethodType || 'Wompi Online';

  // Recuperar metadatos guardados al generar la firma (si existen en caché o en Firestore)
  let savedIntent = paymentIntentsCache.get(ref) || null;
  if (!savedIntent) {
    try {
      const intentSnap = await getDoc(doc(db, 'wompi_intents', ref));
      if (intentSnap.exists()) {
        savedIntent = intentSnap.data();
      }
    } catch (_) {}
  }

  const customerEmail =
    transaction.customer_email ||
    transaction.customer_data?.email ||
    savedIntent?.email ||
    '';
  const customerPhone =
    transaction.customer_data?.phone_number ||
    savedIntent?.telefono ||
    savedIntent?.phoneNumber ||
    '';
  const customerName =
    transaction.customer_data?.full_name ||
    savedIntent?.nombres ||
    savedIntent?.fullName ||
    '';
  const legalId =
    transaction.customer_data?.legal_id ||
    savedIntent?.documento ||
    savedIntent?.legalId ||
    '';

  const fechaPago = new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  console.log(`🎉 [Wompi Webhook] Transacción APROBADA detectada:`);
  console.log(`   - ID Transacción: ${txId}`);
  console.log(`   - Referencia: ${ref}`);
  console.log(`   - Monto: $${amountCOP.toLocaleString('es-CO')} COP`);

  // Buscar al deportista en Firestore
  const athlete = await findAthleteInFirestore({
    athleteId: savedIntent?.athleteId || transaction.athleteId,
    reference: ref,
    customerEmail,
    customerPhone,
    customerName,
    legalId
  });

  const resolvedAthleteId = athlete?.id || savedIntent?.athleteId || null;
  const resolvedAthleteName =
    athlete?.name ||
    athlete?.nombres ||
    customerName ||
    extractAthleteNameFromReference(ref) ||
    'Deportista SOUL';
  const resolvedPhone = sanitizePhone(
    customerPhone ||
      athlete?.telefono ||
      athlete?.phone ||
      athlete?.celular ||
      athlete?.whatsapp ||
      ''
  );
  const resolvedPlan =
    savedIntent?.plan ||
    athlete?.plan ||
    extractPlanFromReference(ref) ||
    'Plan Alfa';
  const resolvedConcept =
    savedIntent?.concepto ||
    (ref.includes('-TOR-')
      ? `Inscripción Torneo - ${resolvedPlan}`
      : `Mensualidad - ${resolvedPlan}`);

  const isTournament = ref.includes('-TOR-') || savedIntent?.tipoPago === 'torneo';

  // 1. Actualizar estado de la cuota en Firestore (de `pendiente`/`en_mora` a `pagado` y `Al día`)
  let firestoreUpdated = false;
  if (resolvedAthleteId) {
    try {
      const athleteDocRef = doc(db, 'athletes', resolvedAthleteId);
      const updatePayload = {
        lastPaymentDate: fechaPago,
        lastPaymentReference: ref,
        lastWompiTransactionId: txId,
        updatedAt: new Date().toISOString()
      };

      if (!isTournament) {
        updatePayload.estado_pago = 'pagado';
        updatePayload.estadoCuota = 'pagado';
        updatePayload.financialStatus = 'Al día';
        updatePayload.valorPendiente = 0;
        updatePayload.valorAbonado = 0;
      }

      await updateDoc(athleteDocRef, updatePayload);
      firestoreUpdated = true;
      console.log(
        `✅ [Firestore] Cuota de "${resolvedAthleteName}" (${resolvedAthleteId}) actualizada a estado "pagado" / "Al día".`
      );
    } catch (dbErr) {
      console.error('⚠️ [Firestore] Error actualizando estado del deportista:', dbErr.message);
    }
  }

  // 2. Registrar transacción aprobada en la colección `finances` y `payment_notifications`
  try {
    await addDoc(collection(db, 'finances'), {
      txCode: ref,
      date: fechaPago,
      athlete: resolvedAthleteName,
      athleteId: resolvedAthleteId,
      type: 'income',
      amount: amountCOP,
      status: 'completed',
      estado: 'pagado',
      concept: resolvedConcept,
      paymentMethod: `Wompi (${paymentMethod})`,
      wompiReference: ref,
      wompiTxId: txId,
      createdAt: new Date().toISOString()
    });

    await addDoc(collection(db, 'payment_notifications'), {
      athleteName: resolvedAthleteName,
      athleteId: resolvedAthleteId,
      amount: amountCOP,
      concept: resolvedConcept,
      paymentMethod: `Wompi (${paymentMethod})`,
      reference: ref,
      wompiTxId: txId,
      status: 'APPROVED',
      read: false,
      createdAt: new Date().toISOString()
    });

    if (ref) {
      await setDoc(
        doc(db, 'wompi_intents', ref),
        {
          reference: ref,
          wompiTxId: txId,
          status: 'pagado',
          wompiStatus: 'APPROVED',
          amountCOP,
          amountInCents,
          athleteId: resolvedAthleteId,
          nombres: resolvedAthleteName,
          telefono: resolvedPhone,
          concepto: resolvedConcept,
          approvedAt: new Date().toISOString()
        },
        { merge: true }
      );
    }
  } catch (finErr) {
    console.error('⚠️ [Firestore] Error guardando recibo en finances:', finErr.message);
  }

  // 3. Enviar recibo de pago por WhatsApp al alumno a través de Baileys (`http://193.122.218.65:3000/send-message`)
  let whatsappReceiptResult = {
    attempted: false,
    sent: false,
    telefono: resolvedPhone || null,
    endpoint: BAILEYS_BOT_URL
  };

  if (resolvedPhone && resolvedPhone.length >= 10) {
    whatsappReceiptResult.attempted = true;
    const receiptMessage = buildWhatsAppPaymentReceiptMessage({
      nombres: resolvedAthleteName,
      concepto: resolvedConcept,
      montoCOP: amountCOP,
      reference: ref,
      transactionId: txId,
      paymentMethod,
      fechaPago
    });

    const botResult = await dispatchToBaileysBot(resolvedPhone, receiptMessage);
    whatsappReceiptResult = {
      attempted: true,
      sent: Boolean(botResult.ok),
      telefono: resolvedPhone,
      endpoint: BAILEYS_BOT_URL,
      httpStatus: botResult.status,
      error: botResult.ok ? null : botResult.errorSummary || botResult.rawResponse
    };
  } else {
    console.warn(
      `⚠️ [WhatsApp Recibo] No se encontró teléfono válido para "${resolvedAthleteName}". Se omitió envío de recibo.`
    );
  }

  // 4. Auditoría local y sincronización con Google Sheets
  const auditEntry = {
    processedAt: new Date().toISOString(),
    status: 'APPROVED',
    estadoCuota: 'pagado',
    reference: ref,
    wompiTxId: txId,
    athleteId: resolvedAthleteId,
    athleteName: resolvedAthleteName,
    telefono: resolvedPhone,
    amount: amountCOP,
    amountInCents,
    customerEmail,
    paymentMethod,
    firestoreUpdated,
    whatsappReceipt: whatsappReceiptResult
  };

  const auditFilePath = path.join(LOGS_DIR, 'wompi-payments.jsonl');
  try {
    fs.appendFileSync(auditFilePath, JSON.stringify(auditEntry) + '\n');
  } catch (_) {}

  const sheetsSync = await syncToGoogleSheets({
    reference: ref,
    wompiTxId: txId,
    athleteName: resolvedAthleteName,
    customerEmail,
    plan: resolvedConcept,
    amount: amountCOP,
    amountInCents,
    paymentMethod
  });

  return {
    success: true,
    transactionId: txId,
    reference: ref,
    estadoCuota: 'pagado',
    financialStatus: 'Al día',
    athleteId: resolvedAthleteId,
    athleteName: resolvedAthleteName,
    amount: amountCOP,
    firestoreUpdated,
    whatsappReceipt: whatsappReceiptResult,
    sheetsSync
  };
}

/**
 * Helper para leer el body JSON de una petición Node.js `http.IncomingMessage`
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let bodyData = '';
    req.on('data', (chunk) => {
      bodyData += chunk;
    });
    req.on('end', () => resolve(bodyData));
    req.on('error', reject);
  });
}

/**
 * ENDPOINT 1: `POST /api/pagos/generar-firma`
 * - Recibe `monto` (en COP) y los datos del alumno.
 * - Genera `referencia` única alfanumérica con guiones.
 * - Calcula `amountInCents = Math.round(monto * 100)`.
 * - Genera el hash SHA256 concatenando exactamente:
 *   `<Referencia><MontoEnCentavos><Moneda><SecretoIntegridad>`
 * - Retorna al frontend la referencia, el monto en centavos y el hash generado.
 */
export async function handleGenerateWompiSignature(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Método no permitido. Usa POST /api/pagos/generar-firma' }));
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const body = rawBody ? JSON.parse(rawBody) : {};

    const montoCOP = Number(body.monto ?? body.amount ?? body.valor ?? 0);
    if (!Number.isFinite(montoCOP) || montoCOP <= 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: false,
          error: 'El campo "monto" (en COP) es obligatorio y debe ser mayor a 0.'
        })
      );
      return;
    }

    const alumno = body.alumno || {};
    const athleteId = body.athleteId || alumno.id || alumno.athleteId || '';
    const nombres =
      body.nombres ||
      body.fullName ||
      alumno.nombres ||
      alumno.name ||
      alumno.fullName ||
      'Deportista SOUL';
    const documento =
      body.documento ||
      body.legalId ||
      alumno.documento ||
      alumno.legalId ||
      '';
    const legalIdType = body.legalIdType || alumno.legalIdType || 'CC';
    const email =
      body.email || alumno.email || 'deportista@soulvolley.com';
    const telefono =
      body.telefono ||
      body.phoneNumber ||
      alumno.telefono ||
      alumno.phone ||
      alumno.phoneNumber ||
      '';
    const plan = body.plan || alumno.plan || 'Plan Alfa';
    const tipoPago = body.tipoPago || (body.isTournament ? 'torneo' : 'mensualidad');
    const prefix = tipoPago === 'torneo' ? 'TOR' : 'MEN';
    const concepto =
      body.concepto ||
      alumno.concepto ||
      (tipoPago === 'torneo' ? `Inscripción Torneo - ${plan}` : `Mensualidad - ${plan}`);

    // 1. Generar referencia única alfanumérica con guiones
    const referencia =
      body.referencia && String(body.referencia).trim()
        ? String(body.referencia).trim()
        : buildUniqueWompiReference(nombres || athleteId, prefix);

    // 2. Calcular amount-in-cents multiplicando el monto en COP por 100
    const amountInCents = Math.round(montoCOP * 100);
    const currency = 'COP';

    // 3. Generar hash criptográfico SHA256 concatenando exactamente:
    //    <Referencia><MontoEnCentavos><Moneda><SecretoIntegridad>
    const cadenaOrdenExacto = `${referencia}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`;
    const signatureHash = crypto
      .createHash('sha256')
      .update(cadenaOrdenExacto, 'utf8')
      .digest('hex');

    // Guardar intención de pago para cruzar datos automáticamente cuando llegue el Webhook de Wompi
    const intentData = {
      reference: referencia,
      athleteId: athleteId || null,
      nombres,
      documento,
      legalIdType,
      email,
      telefono: sanitizePhone(telefono),
      plan,
      concepto,
      tipoPago,
      montoCOP,
      amountInCents,
      currency,
      status: 'pendiente',
      createdAt: new Date().toISOString()
    };

    paymentIntentsCache.set(referencia, intentData);

    // Guardar en Firestore en segundo plano sin bloquear la respuesta de la firma al alumno
    setDoc(doc(db, 'wompi_intents', referencia), intentData, { merge: true }).catch(() => {});

    console.log(
      `🔐 [Wompi Firma Generada] Ref: ${referencia} | Monto: $${montoCOP.toLocaleString('es-CO')} COP (${amountInCents} centavos) | Alumno: ${nombres}`
    );

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        reference: referencia,
        referencia,
        amountInCents,
        'amount-in-cents': amountInCents,
        montoCOP,
        currency,
        signature: signatureHash,
        integrity: signatureHash,
        publicKey: WOMPI_PUBLIC_KEY
      })
    );
  } catch (err) {
    console.error('❌ [Wompi Generar Firma] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: false,
        error: 'Error interno al generar la firma criptográfica de Wompi',
        details: err.message
      })
    );
  }
}

/**
 * ENDPOINT 2: `POST /api/pagos/webhook-wompi` (y `/api/wompi/webhook`)
 * Recibe los eventos de transacción de Wompi, actualiza Firestore y envía recibo por WhatsApp.
 */
export async function handleWompiWebhookRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Event-Checksum');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = (req.url || '').split('?')[0];

  // Si es la ruta de generar firma llamada desde este router
  if (cleanUrl === '/api/pagos/generar-firma' || cleanUrl === '/api/wompi/generar-firma') {
    return handleGenerateWompiSignature(req, res);
  }

  // Comprobación de salud GET
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'active',
        gateway: 'Wompi Colombia Webhook & Signature Service',
        endpoints: [
          'POST /api/pagos/generar-firma',
          'POST /api/pagos/webhook-wompi',
          'POST /api/wompi/webhook'
        ],
        whatsappBotEndpoint: BAILEYS_BOT_URL,
        timestamp: new Date().toISOString()
      })
    );
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const bodyData = await readRequestBody(req);
    if (!bodyData) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Payload vacío' }));
      return;
    }

    const payload = JSON.parse(bodyData);
    const eventType = payload.event || 'transaction.updated';
    console.log(`📩 [Wompi Webhook Recibido] Evento: ${eventType}`);

    const transaction = payload.data?.transaction || payload.transaction || payload;
    if (!transaction || (!transaction.id && !transaction.reference)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Estructura de transacción ausente en el evento' }));
      return;
    }

    // Validar firma de evento de Wompi si viene firma y hay secreto configurado en producción
    if (payload.signature && WOMPI_EVENTS_SECRET !== 'test_events_secret_12345') {
      const verify = verifyWompiChecksum(payload, WOMPI_EVENTS_SECRET);
      if (!verify.valid) {
        console.warn('⚠️ [Wompi Webhook] Checksum inválido recibido:', verify);
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Firma de evento inválida', details: verify }));
        return;
      }
    }

    const transactionId = String(transaction.id || `WOMPI-${Date.now()}`);
    const txStatus = String(transaction.status || '').toUpperCase();
    const reference = String(transaction.reference || '');

    console.log(
      `💳 [Wompi Webhook] ID: ${transactionId} | Estado final: ${txStatus} | Ref: ${reference}`
    );

    if (txStatus === 'APPROVED') {
      const processResult = await processApprovedPayment(transaction);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          status: 'success',
          transactionId,
          transactionStatus: txStatus,
          message:
            'Transacción aprobada: cuota actualizada en Firestore a pagado y recibo enviado por WhatsApp.',
          data: processResult
        })
      );
      return;
    }

    // Otros estados finales (DECLINED, VOIDED, ERROR)
    if (reference) {
      try {
        await setDoc(
          doc(db, 'wompi_intents', reference),
          {
            reference,
            wompiTxId: transactionId,
            status: txStatus.toLowerCase(),
            wompiStatus: txStatus,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      } catch (_) {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        status: 'acknowledged',
        transactionId,
        transactionStatus: txStatus,
        reference,
        message: `Evento recibido con estado ${txStatus} (no aprobado)`
      })
    );
  } catch (parseErr) {
    console.error('❌ [Wompi Webhook] Error procesando webhook:', parseErr);
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Error procesando evento de Wompi', details: parseErr.message }));
  }
}

function extractAthleteNameFromReference(ref) {
  const parts = String(ref || '').split('-');
  if (parts.length >= 3) {
    return parts[2];
  }
  return '';
}

function extractPlanFromReference(ref) {
  const upper = String(ref || '').toUpperCase();
  if (upper.includes('ALF')) return 'Plan Alfa';
  if (upper.includes('BAS')) return 'Plan Básico';
  if (upper.includes('BET')) return 'Plan Beta';
  if (upper.includes('FAM')) return 'Plan Family';
  if (upper.includes('PLU')) return 'Plan Plus';
  return 'Mensualidad SOUL';
}

// ============================================================================
// NOTIFICACIONES DE PAGO DESDE PORTALES PÚBLICOS (Persistencia compartida local + Firestore)
// ============================================================================

const PAYMENT_NOTIFICATIONS_FILE = path.join(LOGS_DIR, 'payment-notifications.json');
const notificationStreamClients = new Set();

function readStoredPaymentNotifications() {
  try {
    if (fs.existsSync(PAYMENT_NOTIFICATIONS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PAYMENT_NOTIFICATIONS_FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (_) {}
  return [];
}

function writeStoredPaymentNotifications(list) {
  try {
    fs.writeFileSync(PAYMENT_NOTIFICATIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (_) {}
}

function broadcastPaymentNotificationsStream(list) {
  if (notificationStreamClients.size === 0) return;
  const payload = `event: notifications\ndata: ${JSON.stringify({ ok: true, notifications: list })}\n\n`;
  for (const clientRes of notificationStreamClients) {
    try {
      clientRes.write(payload);
    } catch (_) {
      notificationStreamClients.delete(clientRes);
    }
  }
}

export async function handlePortalPaymentNotificationsRoute(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = (req.url || '').split('?')[0];

  // Stream SSE en tiempo real (GET /api/pagos/stream)
  if (req.method === 'GET' && cleanUrl === '/api/pagos/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    const initialList = readStoredPaymentNotifications();
    res.write(`event: notifications\ndata: ${JSON.stringify({ ok: true, notifications: initialList })}\n\n`);

    notificationStreamClients.add(res);
    const heartbeatId = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_) {
        clearInterval(heartbeatId);
        notificationStreamClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeatId);
      notificationStreamClients.delete(res);
    });
    return;
  }

  if (req.method === 'GET') {
    const list = readStoredPaymentNotifications();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, notifications: list }));
    return;
  }

  if (req.method === 'POST') {
    try {
      const bodyRaw = await readRequestBody(req);
      const data = bodyRaw ? JSON.parse(bodyRaw) : {};
      const reference =
        data.txCode ||
        data.wompiReference ||
        `SOUL-INT-${Date.now().toString().slice(-6)}-${crypto.randomInt(100, 999)}`;

      const notification = {
        id: data.id || `srv-notif-${Date.now()}-${crypto.randomInt(100, 999)}`,
        txCode: reference,
        wompiReference: reference,
        date:
          data.date ||
          new Date().toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
        athlete: data.athlete || data.athleteName || 'Deportista SOUL',
        athleteId: data.athleteId || '',
        type: 'income',
        amount: Number(data.amount) || 0,
        status: data.status === 'completed' ? 'completed' : 'pending',
        concept: data.concept || 'Pago desde Portal',
        paymentMethod: data.paymentMethod || 'Nequi / Wompi (Por revisar)',
        revisado: Boolean(data.revisado),
        source: data.source || 'portal_pagos',
        deviceTimestamp: data.deviceTimestamp || new Date().toISOString()
      };

      const existing = readStoredPaymentNotifications();
      const filtered = existing.filter(
        (n) => n.txCode !== reference && n.wompiReference !== reference && n.id !== notification.id
      );
      filtered.unshift(notification);
      writeStoredPaymentNotifications(filtered);

      // Empujar de inmediato a todas las pestañas administrativas conectadas vía SSE
      broadcastPaymentNotificationsStream(filtered);

      // Responder inmediatamente sin esperar a Firebase
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, notification }));

      // Sincronizar con Firestore en segundo plano (no bloqueante)
      addDoc(collection(db, 'payment_notifications'), {
        ...notification,
        createdAt: new Date().toISOString()
      }).catch(() => {});
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || 'Payload inválido' }));
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const bodyRaw = await readRequestBody(req);
      const patch = bodyRaw ? JSON.parse(bodyRaw) : {};
      const existing = readStoredPaymentNotifications();
      const updated = existing.map((n) => {
        const matches =
          (patch.id && n.id === patch.id) ||
          (patch.txCode && n.txCode === patch.txCode) ||
          (patch.wompiReference && n.wompiReference === patch.wompiReference);
        if (!matches) return n;
        return {
          ...n,
          ...(typeof patch.revisado === 'boolean' ? { revisado: patch.revisado } : {}),
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.paymentMethod ? { paymentMethod: patch.paymentMethod } : {})
        };
      });
      writeStoredPaymentNotifications(updated);
      broadcastPaymentNotificationsStream(updated);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || 'Error actualizando notificación' }));
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
}

// ============================================================================
// SOLICITUDES DE INSCRIPCIÓN (Respaldo compartido local + Firestore)
// ============================================================================

const SOLICITUDES_FILE = path.join(LOGS_DIR, 'solicitudes.json');
const solicitudesStreamClients = new Set();
const notifiedSolicitudIds = new Set();
const DEFAULT_ADMIN_WHATSAPP_PHONE = '3213248713';

/**
 * Construye el mensaje de WhatsApp con el resumen completo del nuevo prospecto
 * para que el administrador revise sus datos apenas se inscriba.
 */
export function buildNewEnrollmentWhatsAppMessage(record = {}) {
  const archivos = record.archivos || {};
  const bio = record.datos_biometricos || {};
  const edad = record.edad ?? bio.edad;
  const altura = record.altura_cm ?? bio.alturaCm;
  const peso = record.peso_kg ?? bio.pesoKg;
  const imc = bio.imc;

  const bioParts = [];
  if (edad) bioParts.push(`${edad} años`);
  if (altura) bioParts.push(`${altura} cm`);
  if (peso) bioParts.push(`${peso} kg`);
  if (imc) bioParts.push(`IMC ${imc}`);

  const docLine = [record.tipo_documento, record.documento].filter(Boolean).join(' ').trim();
  const ubicacionLine = [record.localidad, record.barrio, record.direccion].filter(Boolean).join(' · ');

  const adjuntos = [];
  if (archivos.certificadoEpsNombre || archivos.certificadoEpsDataUrl) {
    adjuntos.push(`Cert. EPS (${archivos.certificadoEpsNombre || 'adjunto'})`);
  }
  if (archivos.documentoIdentidadFrenteNombre || archivos.documentoIdentidadFrenteDataUrl) {
    adjuntos.push(`Doc. Frente (${archivos.documentoIdentidadFrenteNombre || 'adjunto'})`);
  } else if (archivos.documentoIdentidadNombre || archivos.documentoIdentidadDataUrl) {
    adjuntos.push(`Doc. ID (${archivos.documentoIdentidadNombre || 'adjunto'})`);
  }
  if (archivos.documentoIdentidadReversoNombre || archivos.documentoIdentidadReversoDataUrl) {
    adjuntos.push(`Doc. Reverso (${archivos.documentoIdentidadReversoNombre || 'adjunto'})`);
  }
  if (archivos.fotoTipoDocumentoNombre || archivos.fotoTipoDocumentoDataUrl) {
    adjuntos.push(`Foto (${archivos.fotoTipoDocumentoNombre || 'adjunta'})`);
  }
  if (archivos.cartaLibertadDataUrl || (archivos.cartaLibertadNombre && archivos.cartaLibertadNombre !== 'No aplica')) {
    adjuntos.push(`Carta Libertad (${archivos.cartaLibertadNombre || 'adjunta'})`);
  }

  const lines = [
    '🏐 *NUEVA INSCRIPCIÓN - SOUL VOLEY*',
    'Se registró un nuevo prospecto para revisión en el panel:',
    '',
    `👤 *Nombre:* ${record.nombre || 'Sin nombre'}`,
    ...(docLine ? [`🪪 *Documento:* ${docLine}`] : []),
    `📱 *Teléfono:* ${record.telefono || 'Sin teléfono'}`,
    ...(record.correo ? [`✉️ *Correo:* ${record.correo}`] : []),
    ...(bioParts.length > 0 ? [`📏 *Biometría:* ${bioParts.join(' | ')}`] : []),
    ...(ubicacionLine ? [`📍 *Ubicación:* ${ubicacionLine}`] : []),
    ...(record.acudientes ? [`👨‍👩‍👧 *Acudientes:* ${record.acudientes}`] : []),
    ...(record.eps
      ? [`🏥 *EPS:* ${record.eps}${archivos.certificadoEpsNombre || archivos.certificadoEpsDataUrl ? ' (Certificado adjunto ✅)' : ''}`]
      : []),
    ...(record.alergias ? [`🩺 *Alergias:* ${record.alergias}`] : []),
    `📋 *Plan / Objetivo:* ${record.plan || record.objetivo || 'No especificado'}`,
    ...(record.experiencia || record.talla
      ? [`⚡ *Perfil:* Exp: ${record.experiencia || 'N/A'} | Talla: ${record.talla || 'N/A'} | Otro club: ${record.pertenecio_otro_club || 'N/A'}`]
      : []),
    ...(adjuntos.length > 0 ? [`📎 *Documentos:* ${adjuntos.join(', ')}`] : []),
    `🆔 *Ref:* ${record.id || 'N/A'}`,
    '',
    '🔎 *Acción:* Revisa la ficha completa y documentos verificables en el Panel Admin → *Solicitudes* (/prospects).'
  ];

  return lines.join('\n');
}

function readStoredSolicitudes() {
  try {
    if (fs.existsSync(SOLICITUDES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SOLICITUDES_FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (_) {}
  return [];
}

function writeStoredSolicitudes(list) {
  try {
    fs.writeFileSync(SOLICITUDES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (_) {}
}

function broadcastSolicitudesStream(list, latestRecord = null) {
  if (solicitudesStreamClients.size === 0) return;
  const payload = `event: solicitudes\ndata: ${JSON.stringify({ ok: true, solicitudes: list, latest: latestRecord })}\n\n`;
  for (const clientRes of solicitudesStreamClients) {
    try {
      clientRes.write(payload);
    } catch (_) {
      solicitudesStreamClients.delete(clientRes);
    }
  }
}

export async function handleSolicitudesRoute(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = (req.url || '').split('?')[0];

  if (req.method === 'GET' && cleanUrl === '/api/solicitudes/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    const initialList = readStoredSolicitudes();
    res.write(`event: solicitudes\ndata: ${JSON.stringify({ ok: true, solicitudes: initialList })}\n\n`);

    solicitudesStreamClients.add(res);
    const heartbeatId = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_) {
        clearInterval(heartbeatId);
        solicitudesStreamClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeatId);
      solicitudesStreamClients.delete(res);
    });
    return;
  }

  if (req.method === 'GET') {
    const list = readStoredSolicitudes();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, solicitudes: list }));
    return;
  }

  if (req.method === 'POST') {
    try {
      const bodyRaw = await readRequestBody(req);
      const data = bodyRaw ? JSON.parse(bodyRaw) : {};
      const record = {
        ...data,
        id: data.id || `sol-${Date.now()}-${crypto.randomInt(100, 999)}`,
        estado: data.estado || 'Nueva Solicitud',
        fecha_creacion_iso: data.fecha_creacion_iso || new Date().toISOString()
      };

      const existing = readStoredSolicitudes();
      const alreadyExists = existing.some((s) => s.id === record.id);
      const filtered = existing.filter((s) => s.id !== record.id);
      filtered.unshift(record);
      writeStoredSolicitudes(filtered);
      broadcastSolicitudesStream(filtered, record);

      const adminPhone = (process.env.ADMIN_WHATSAPP_PHONE || DEFAULT_ADMIN_WHATSAPP_PHONE).trim();
      const shouldNotifyWhatsApp = Boolean(adminPhone && !alreadyExists && !notifiedSolicitudIds.has(record.id));
      if (shouldNotifyWhatsApp) {
        notifiedSolicitudIds.add(record.id);
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          solicitud: record,
          whatsappNotification: {
            scheduled: shouldNotifyWhatsApp,
            target: adminPhone ? sanitizePhone(adminPhone) : null
          }
        })
      );

      // Notificar por WhatsApp (Bot Baileys) al número administrador configurado en segundo plano
      if (shouldNotifyWhatsApp) {
        const msg = buildNewEnrollmentWhatsAppMessage(record);
        console.log(
          `📲 [Solicitudes WhatsApp] Enviando notificación de nuevo prospecto (${record.nombre || record.id}) a ${adminPhone}...`
        );
        dispatchToBaileysBot(adminPhone, msg)
          .then(() => {
            console.log(
              `✅ [Solicitudes WhatsApp] Notificación enviada correctamente a ${sanitizePhone(adminPhone)} (${record.nombre || record.id}).`
            );
          })
          .catch((waErr) => {
            console.error(
              `❌ [Solicitudes WhatsApp] No se pudo enviar la alerta a ${adminPhone}: ${waErr?.message || waErr}`
            );
          });
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || 'Payload inválido' }));
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const bodyRaw = await readRequestBody(req);
      const patch = bodyRaw ? JSON.parse(bodyRaw) : {};
      const existing = readStoredSolicitudes();
      const updated = existing.map((s) => {
        if (patch.id && s.id === patch.id) {
          return { ...s, ...patch, fecha_actualizacion_iso: new Date().toISOString() };
        }
        return s;
      });
      writeStoredSolicitudes(updated);
      broadcastSolicitudesStream(updated);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || 'Error actualizando solicitud' }));
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
}
