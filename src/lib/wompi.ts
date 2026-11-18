/**
 * SOUL Volley Club - Cliente Seguro para el Widget de Wompi (Colombia)
 *
 * IMPORTANTE DE SEGURIDAD:
 * El secreto de integridad (`WOMPI_INTEGRITY_SECRET`) NUNCA se almacena ni expone en el frontend.
 * Toda firma criptográfica SHA-256 se solicita bajo demanda al backend Node.js (`POST /api/pagos/generar-firma`).
 */

export interface WompiConfig {
  publicKey: string;
  currency: "COP";
  widgetScriptUrl: string;
  redirectUrl?: string;
}

export const WOMPI_CONFIG: WompiConfig = {
  // Llave pública de Wompi (pub_test_... o pub_prod_...) leída de variables de entorno de Vite
  publicKey:
    import.meta.env.VITE_WOMPI_PUBLIC_KEY ||
    "pub_test_Q5yDA9xoKdePzhSGeVe9HAez7HgGObCi",
  currency: "COP",
  widgetScriptUrl: "https://checkout.wompi.co/widget.js",
  redirectUrl:
    typeof window !== "undefined"
      ? window.location.origin + "/pagos?payment_complete=true"
      : undefined
};

export interface WompiCustomerData {
  email: string;
  fullName: string;
  phoneNumber?: string;
  phoneNumberPrefix?: string;
  legalId?: string;
  legalIdType?: "CC" | "TI" | "CE" | "PP" | "NIT";
}

export interface WompiSignatureRequestPayload {
  monto: number; // Monto en pesos colombianos (COP)
  athleteId?: string;
  nombres?: string;
  documento?: string;
  legalIdType?: "CC" | "TI" | "CE" | "PP" | "NIT";
  email?: string;
  telefono?: string;
  plan?: string;
  concepto?: string;
  tipoPago?: "mensualidad" | "torneo";
}

export interface WompiSignatureResponse {
  ok: boolean;
  reference: string;
  referencia: string;
  amountInCents: number;
  "amount-in-cents": number;
  montoCOP: number;
  currency: "COP";
  signature: string;
  integrity: string;
  publicKey?: string;
  error?: string;
}

export interface WompiCheckoutOptions {
  currency?: "COP";
  amountInCents: number;
  reference: string;
  publicKey?: string;
  signatureIntegrity: string;
  redirectUrl?: string;
  customerData?: WompiCustomerData;
  onSuccess?: (transaction: any) => void;
  onError?: (error: any) => void;
  onClose?: (result: any) => void;
}

export interface WompiTransactionResult {
  id?: string;
  reference: string;
  status:
    | "APPROVED"
    | "DECLINED"
    | "VOIDED"
    | "ERROR"
    | "PENDING"
    | "CANCELLED_BY_USER";
  amountInCents: number;
  paymentMethodType?: string;
  raw?: any;
}

declare global {
  interface Window {
    WidgetCheckout?: new (config: {
      currency: "COP";
      amountInCents: number;
      reference: string;
      publicKey: string;
      signature: {
        integrity: string;
      };
      redirectUrl?: string;
      customerData?: {
        email?: string;
        fullName?: string;
        phoneNumber?: string;
        phoneNumberPrefix?: string;
        legalId?: string;
        legalIdType?: string;
      };
    }) => {
      open: (callback: (result: any) => void) => void;
    };
  }
}

/**
 * Solicita al backend (`POST /api/pagos/generar-firma`) la referencia única,
 * el monto en centavos y el hash SHA-256 firmado con el secreto de integridad en el servidor.
 */
export async function requestWompiSignatureFromBackend(
  payload: WompiSignatureRequestPayload
): Promise<WompiSignatureResponse> {
  const response = await fetch("/api/pagos/generar-firma", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(
      data?.error || `Error ${response.status} al generar firma en el servidor`
    );
  }

  return data as WompiSignatureResponse;
}

/**
 * Inyecta dinámicamente `<script type="text/javascript" src="https://checkout.wompi.co/widget.js"></script>`
 * en el DOM antes de instanciar `WidgetCheckout`.
 */
export function loadWompiWidgetScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    if (window.WidgetCheckout) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector(
      `script[src="${WOMPI_CONFIG.widgetScriptUrl}"]`
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true));
      existingScript.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = WOMPI_CONFIG.widgetScriptUrl;
    script.async = true;

    script.onload = () => {
      resolve(true);
    };

    script.onerror = (err) => {
      console.warn("⚠️ [Wompi] No se pudo cargar https://checkout.wompi.co/widget.js:", err);
      resolve(false);
    };

    document.head.appendChild(script);
  });
}

/**
 * Normaliza el teléfono a 10 dígitos locales para `customerData.phoneNumber` de Wompi
 * (ej. "573001234567" -> "3001234567").
 */
export function normalizeLocalPhoneForWompi(rawPhone?: string): string {
  if (!rawPhone) return "3001234567";
  const digits = String(rawPhone).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) {
    return digits.slice(2);
  }
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits || "3001234567";
}

/**
 * Abre el Widget de Wompi (`new WidgetCheckout({...})`) con la firma generada en el backend.
 */
export async function openWompiCheckout(
  options: WompiCheckoutOptions
): Promise<WompiTransactionResult> {
  const isLoaded = await loadWompiWidgetScript();
  const publicKey = options.publicKey || WOMPI_CONFIG.publicKey;

  return new Promise((resolve) => {
    if (isLoaded && window.WidgetCheckout) {
      try {
        const checkout = new window.WidgetCheckout({
          currency: options.currency || "COP",
          amountInCents: options.amountInCents,
          reference: options.reference,
          publicKey,
          signature: {
            integrity: options.signatureIntegrity
          },
          redirectUrl: options.redirectUrl || WOMPI_CONFIG.redirectUrl,
          customerData: options.customerData
            ? {
                email: options.customerData.email,
                fullName: options.customerData.fullName,
                phoneNumber: normalizeLocalPhoneForWompi(
                  options.customerData.phoneNumber
                ),
                phoneNumberPrefix:
                  options.customerData.phoneNumberPrefix || "+57",
                legalId: options.customerData.legalId,
                legalIdType: options.customerData.legalIdType || "CC"
              }
            : undefined
        });

        checkout.open((result: any) => {
          if (options.onClose) {
            options.onClose(result);
          }

          const tx = result?.transaction || result;
          if (tx && (tx.id || tx.status)) {
            const res: WompiTransactionResult = {
              id: tx.id,
              reference: tx.reference || options.reference,
              status: tx.status || "PENDING",
              amountInCents: tx.amountInCents || options.amountInCents,
              paymentMethodType: tx.paymentMethodType,
              raw: tx
            };
            if (options.onSuccess && tx.status === "APPROVED") {
              options.onSuccess(tx);
            }
            resolve(res);
          } else {
            resolve({
              reference: options.reference,
              status: "CANCELLED_BY_USER",
              amountInCents: options.amountInCents,
              raw: result
            });
          }
        });

        return;
      } catch (err) {
        console.error("❌ [Wompi] Error instanciando WidgetCheckout:", err);
        if (options.onError) options.onError(err);
      }
    }

    resolve({
      reference: options.reference,
      status: "PENDING",
      amountInCents: options.amountInCents
    });
  });
}
