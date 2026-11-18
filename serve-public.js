import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

import {
  handleWompiWebhookRequest,
  handleGenerateWompiSignature,
  handlePortalPaymentNotificationsRoute,
  handleSolicitudesRoute
} from './server/wompi-webhook.js';
import { handleMoraAndWhatsAppRoutes } from './server/whatsapp-mora.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const cleanPath = (req.url || '').split('?')[0];

  // 1. Endpoint Wompi: Generación segura de firma de integridad SHA-256 (POST /api/pagos/generar-firma)
  if (cleanPath === '/api/pagos/generar-firma') {
    handleGenerateWompiSignature(req, res);
    return;
  }

  // 1B. Endpoints de Notificaciones de Pago desde Portales Públicos
  if (
    cleanPath === '/api/pagos/notificar' ||
    cleanPath === '/api/pagos/notificaciones' ||
    cleanPath === '/api/pagos/stream'
  ) {
    handlePortalPaymentNotificationsRoute(req, res);
    return;
  }

  // 1C. Endpoint de Solicitudes de Inscripción (+ stream SSE)
  if (cleanPath === '/api/solicitudes' || cleanPath === '/api/solicitudes/stream') {
    handleSolicitudesRoute(req, res);
    return;
  }

  // 2. Endpoint Wompi: Recepción de Webhook de transacciones (POST /api/pagos/webhook-wompi y /api/wompi/*)
  if (
    cleanPath === '/api/pagos/webhook-wompi' ||
    req.url.startsWith('/api/wompi')
  ) {
    handleWompiWebhookRequest(req, res);
    return;
  }

  // Rutas de API para Detección de Cartera en Mora y Bot de WhatsApp (Baileys)
  if (req.url.startsWith('/api/cartera/morosos') || req.url.startsWith('/api/whatsapp/')) {
    handleMoraAndWhatsAppRoutes(req, res);
    return;
  }

  // Redirigir al portal oficial único en React (PortalPagosWompi)
  res.writeHead(302, { Location: 'http://localhost:5173/pagos' });
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`API & static server running at http://localhost:${PORT}/`);
});
