import React, { useEffect, useState } from "react";
import { db, sendPortalPaymentNotification } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { PAYMENT_PLANS, ENROLLMENT_LABEL, getPlanDetails } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  User,
  MapPin,
  HeartPulse,
  Trophy,
  FileUp,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  UploadCloud,
  FileCheck2,
  Sparkles,
  Activity,
  Camera
} from "lucide-react";

/** Tarjeta táctil y responsiva para adjuntar fotos o PDFs en móvil y escritorio */
function DocumentUploadCard({
  label,
  hint,
  file,
  accept,
  capture,
  accent = "purple",
  loadedLabel = "Archivo cargado",
  onFileChange,
  extraWarning
}: {
  label: string;
  hint?: string;
  file: File | null;
  accept: string;
  capture?: "environment" | "user";
  accent?: "purple" | "amber";
  loadedLabel?: string;
  onFileChange: (nextFile: File | null) => void;
  extraWarning?: React.ReactNode;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isAmber = accent === "amber";
  const borderClass = isAmber
    ? "border-amber-300 bg-amber-50/70"
    : "border-slate-200 bg-slate-50/70";
  const titleClass = isAmber ? "text-amber-950" : "text-slate-800";
  const btnClass = isAmber
    ? "bg-white text-amber-900 hover:bg-amber-100/70 border-amber-300 shadow-xs"
    : "bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50 border-slate-300 shadow-xs";

  return (
    <div className={`p-3.5 sm:p-4 rounded-xl border space-y-2.5 ${borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className={`text-xs sm:text-sm font-bold flex items-start gap-2 leading-snug ${titleClass}`}>
          {accept === "image/*" ? (
            <Camera className={`w-4 h-4 shrink-0 mt-0.5 ${isAmber ? "text-amber-600" : "text-indigo-600"}`} />
          ) : (
            <UploadCloud className={`w-4 h-4 shrink-0 mt-0.5 ${isAmber ? "text-amber-600" : "text-indigo-600"}`} />
          )}
          <span>{label}</span>
        </label>
        {file && (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold shrink-0">
            <FileCheck2 className="w-3.5 h-3.5" /> {loadedLabel}
          </span>
        )}
      </div>

      {hint && <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">{hint}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {previewUrl && (
          <img
            src={previewUrl}
            alt={label}
            className="w-20 h-16 sm:w-16 sm:h-16 object-cover rounded-lg border border-slate-200 shadow-xs shrink-0"
          />
        )}

        <label
          className={`flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center sm:justify-start gap-2 cursor-pointer transition-colors active:scale-[0.99] ${btnClass}`}
        >
          <UploadCloud className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {file ? `Cambiar archivo (${file.name})` : "Seleccionar foto / archivo o usar cámara"}
          </span>
          <input
            type="file"
            accept={accept}
            {...(capture ? { capture } : {})}
            onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            className="sr-only"
          />
        </label>
      </div>

      {extraWarning}
    </div>
  );
}

export interface EnrollmentFormState {
  // 1. Datos Personales del Estudiante y Biométricos
  nombresCompletos: string;
  fechaNacimiento: string;
  edad: string;
  alturaCm: string;
  pesoKg: string;
  tipoDocumento: string;
  numeroDocumento: string;
  genero: string;

  // 2. Ubicación y Contacto
  localidad: string;
  barrio: string;
  direccion: string;
  telefonoContacto: string;
  nombresPadresAcudientes: string;

  // 3. Información Médica (¡CRÍTICO!)
  epsEstudiante: string;
  archivoCertificadoEps: File | null;
  alergias: string;

  // 4. Perfil Deportivo
  tallaIndumentaria: string;
  tiempoEntrenando: string;
  haPertenecidoAOtroClub: "Sí" | "No" | "";

  // 5. Documentación y Archivos
  archivoDocumentoFrente: File | null;
  archivoDocumentoReverso: File | null;
  archivoFotoTipoDocumento: File | null;
  archivoCartaLibertad: File | null;

  // 6. Cierre
  planAPagar: string;
}

const STEPS = [
  { id: 1, title: "Datos Personales", subtitle: "Identificación del estudiante", icon: User },
  { id: 2, title: "Ubicación y Contacto", subtitle: "Residencia y acudientes", icon: MapPin },
  { id: 3, title: "Información Médica", subtitle: "EPS obligatoria y alergias", icon: HeartPulse },
  { id: 4, title: "Perfil Deportivo", subtitle: "Talla, nivel y trayectoria", icon: Trophy },
  { id: 5, title: "Documentación", subtitle: "Soportes y archivos", icon: FileUp },
  { id: 6, title: "Cierre y Plan", subtitle: "Selección de plan oficial", icon: CreditCard }
];

const LOCALIDADES_BOGOTA = [
  "Suba",
  "Usaquén",
  "Engativá",
  "Chapinero",
  "Barrios Unidos",
  "Teusaquillo",
  "Kennedy",
  "Fontibón",
  "Bosa",
  "Puente Aranda",
  "San Cristóbal",
  "Santa Fe",
  "Tunjuelito",
  "Antonio Nariño",
  "Los Mártires",
  "La Candelaria",
  "Rafael Uribe Uribe",
  "Ciudad Bolívar",
  "Usme",
  "Sumapaz",
  "Cundinamarca (Chía, Cota, Cajicá, Soacha, otro)"
];

const TALLAS_INDUMENTARIA = [
  "6 (Infantil)",
  "8 (Infantil)",
  "10 (Infantil)",
  "12 (Juvenil)",
  "14 (Juvenil)",
  "16 (Juvenil)",
  "XS (Adulto)",
  "S (Adulto)",
  "M (Adulto)",
  "L (Adulto)",
  "XL (Adulto)",
  "XXL (Adulto)"
];

const TIEMPO_ENTRENANDO_OPTIONS = [
  "0 a 6 meses (Iniciación)",
  "1.5 a 2 años (Tecnificación)",
  "2.5 años o más (Selección)"
];

export default function EnrollmentWizard() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(false);

  const [form, setForm] = useState<EnrollmentFormState>({
    nombresCompletos: "",
    fechaNacimiento: "",
    edad: "",
    alturaCm: "",
    pesoKg: "",
    tipoDocumento: "TI",
    numeroDocumento: "",
    genero: "",
    localidad: "",
    barrio: "",
    direccion: "",
    telefonoContacto: "",
    nombresPadresAcudientes: "",
    epsEstudiante: "",
    archivoCertificadoEps: null,
    alergias: "",
    tallaIndumentaria: "",
    tiempoEntrenando: "",
    haPertenecidoAOtroClub: "",
    archivoDocumentoFrente: null,
    archivoDocumentoReverso: null,
    archivoFotoTipoDocumento: null,
    archivoCartaLibertad: null,
    planAPagar: "Plan Alfa"
  });

  const calculateAgeFromBirthdate = (dateStr: string): string => {
    if (!dateStr) return "";
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return "";
    const [year, month, day] = parts;
    const today = new Date();
    let age = today.getFullYear() - year;
    const mDiff = today.getMonth() + 1 - month;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < day)) {
      age--;
    }
    return age >= 0 && age <= 110 ? String(age) : "";
  };

  const calculateBmi = (alturaCmStr: string, pesoKgStr: string): string | null => {
    const h = Number(alturaCmStr);
    const w = Number(pesoKgStr);
    if (!h || !w || h < 80 || h > 240 || w < 15 || w > 200) return null;
    const meters = h / 100;
    return (w / (meters * meters)).toFixed(1);
  };

  const computedBmi = calculateBmi(form.alturaCm, form.pesoKg);

  // Validación estricta de EPS: rechaza vacío o palabras que indiquen no afiliación
  const isEpsInvalid = (rawEps: string): boolean => {
    const clean = rawEps.trim().toLowerCase();
    if (!clean || clean.length < 2) return true;
    const forbiddenValues = ["ninguna", "no tiene", "no tengo", "sin eps", "no", "na", "n/a", "ninguno"];
    return forbiddenValues.includes(clean);
  };

  // Validar paso actual antes de avanzar
  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!form.nombresCompletos.trim()) return "Ingresa los nombres completos del estudiante.";
      if (!form.fechaNacimiento) return "Selecciona la fecha de nacimiento del estudiante.";
      if (!form.tipoDocumento) return "Selecciona el tipo de documento.";
      if (!form.numeroDocumento.trim()) return "Ingresa el número de documento de identidad.";
      if (!form.genero) return "Selecciona el género del estudiante.";
      const ageNum = Number(form.edad);
      if (!form.edad || isNaN(ageNum) || ageNum < 4 || ageNum > 99) {
        return "Ingresa una edad válida (entre 4 y 99 años).";
      }
      const heightNum = Number(form.alturaCm);
      if (!form.alturaCm || isNaN(heightNum) || heightNum < 80 || heightNum > 240) {
        return "Ingresa una altura válida en centímetros (entre 80 y 240 cm).";
      }
      const weightNum = Number(form.pesoKg);
      if (!form.pesoKg || isNaN(weightNum) || weightNum < 15 || weightNum > 200) {
        return "Ingresa un peso válido en kilogramos (entre 15 y 200 kg).";
      }
    }

    if (step === 2) {
      if (!form.localidad) return "Selecciona la localidad de residencia.";
      if (!form.barrio.trim()) return "Ingresa el barrio de residencia.";
      if (!form.direccion.trim()) return "Ingresa la dirección de residencia.";
      if (!form.telefonoContacto.trim() || form.telefonoContacto.replace(/\D/g, "").length < 10) {
        return "Ingresa un número de teléfono de contacto válido (mínimo 10 dígitos).";
      }
      if (!form.nombresPadresAcudientes.trim()) {
        return "Ingresa los nombres completos de los padres o acudientes.";
      }
    }

    if (step === 3) {
      if (isEpsInvalid(form.epsEstudiante)) {
        return "BLOQUEO DE SEGURIDAD MÉDICA: No se puede realizar la inscripción sin estar afiliado activamente a una EPS.";
      }
      if (!form.archivoCertificadoEps) {
        return "Debes adjuntar el certificado o soporte verificable de afiliación a tu EPS (PDF o imagen).";
      }
      if (!form.alergias.trim()) {
        return 'El campo de alergias es obligatorio. Si no tiene alergias, escribe "Ninguna".';
      }
    }

    if (step === 4) {
      if (!form.tallaIndumentaria) return "Selecciona la talla para la indumentaria deportiva.";
      if (!form.tiempoEntrenando) return "Selecciona el tiempo entrenando voleibol.";
      if (!form.haPertenecidoAOtroClub) {
        return "Indica si el estudiante ha pertenecido a otro club anteriormente (Sí / No).";
      }
    }

    if (step === 5) {
      if (!form.archivoDocumentoFrente) {
        return "Debes adjuntar la foto de frente del documento de identidad.";
      }
      if (!form.archivoDocumentoReverso) {
        return "Debes adjuntar la foto de reverso del documento de identidad.";
      }
      if (!form.archivoFotoTipoDocumento) {
        return "Debes adjuntar la foto tipo documento actual.";
      }
      if (form.haPertenecidoAOtroClub === "Sí" && !form.archivoCartaLibertad) {
        return "Como perteneció a otro club, es obligatorio adjuntar la Carta de Libertad del club anterior.";
      }
    }

    if (step === 6) {
      if (!form.planAPagar) return "Selecciona el plan a pagar para finalizar la inscripción.";
      if (isEpsInvalid(form.epsEstudiante)) {
        return "No se puede enviar el formulario sin una EPS válida registrada.";
      }
      if (!form.archivoCertificadoEps) {
        return "Falta adjuntar el documento verificable de afiliación a la EPS en el Paso 3.";
      }
    }

    return null;
  };

  const handleNextStep = () => {
    const errorMsg = validateStep(currentStep);
    if (errorMsg) {
      setStepError(errorMsg);
      return;
    }
    setStepError(null);
    setCurrentStep((prev) => Math.min(STEPS.length, prev + 1));
  };

  const handlePrevStep = () => {
    setStepError(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  //Texto dinámico para el botón "Siguiente" según el paso actual
  const getNextButtonLabel = (step: number): string => {
    switch (step) {
      case 1:
        return "Siguiente: Ubicación y Contacto";
      case 2:
        return "Siguiente: Información Médica";
      case 3:
        return "Siguiente: Perfil Deportivo";
      case 4:
        return "Siguiente: Documentos y Archivos";
      case 5:
        return "Siguiente: Elegir Plan y Finalizar";
      default:
        return "Siguiente";
    }
  };

  // Convierte un archivo de imagen o PDF ligero a DataURL comprimido para visualización en el panel
  const fileToSafeDataUrl = (file: File | null): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!file) {
        resolve(null);
        return;
      }

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxDim = 650;
            let width = img.width;
            let height = img.height;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL("image/jpeg", 0.72));
            } else {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = String(ev.target?.result || "");
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
        return;
      }

      // Si es PDF u otro documento menor a 350 KB, guardarlo directamente
      if (file.size <= 350 * 1024) {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(String(ev.target?.result || ""));
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else {
        resolve(null);
      }
    });
  };

  const handleSubmitEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    for (let s = 1; s <= 6; s++) {
      const err = validateStep(s);
      if (err) {
        setCurrentStep(s);
        setStepError(err);
        return;
      }
    }

    try {
      setSubmitting(true);
      setStepError(null);

      const [
        epsCertPreviewUrl,
        docFrentePreviewUrl,
        docReversoPreviewUrl,
        fotoPreviewUrl,
        cartaPreviewUrl
      ] = await Promise.all([
        fileToSafeDataUrl(form.archivoCertificadoEps),
        fileToSafeDataUrl(form.archivoDocumentoFrente),
        fileToSafeDataUrl(form.archivoDocumentoReverso),
        fileToSafeDataUrl(form.archivoFotoTipoDocumento),
        form.haPertenecidoAOtroClub === "Sí"
          ? fileToSafeDataUrl(form.archivoCartaLibertad)
          : Promise.resolve(null)
      ]);

      const solicitudId = `sol-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const solicitudPayload = {
        // 1. Datos Personales y Biométricos
        nombre: form.nombresCompletos.trim(),
        fecha_nacimiento: form.fechaNacimiento,
        edad: Number(form.edad),
        altura_cm: Number(form.alturaCm),
        peso_kg: Number(form.pesoKg),
        datos_biometricos: {
          edad: Number(form.edad),
          alturaCm: Number(form.alturaCm),
          pesoKg: Number(form.pesoKg),
          imc: computedBmi ? Number(computedBmi) : null
        },
        tipo_documento: form.tipoDocumento,
        documento: form.numeroDocumento.trim(),
        genero: form.genero,
        // 2. Ubicación y Contacto
        localidad: form.localidad,
        barrio: form.barrio.trim(),
        direccion: form.direccion.trim(),
        telefono: form.telefonoContacto.trim(),
        acudientes: form.nombresPadresAcudientes.trim(),
        // 3. Información Médica
        eps: form.epsEstudiante.trim(),
        alergias: form.alergias.trim(),
        // 4. Perfil Deportivo
        talla: form.tallaIndumentaria,
        experiencia: form.tiempoEntrenando,
        pertenecio_otro_club: form.haPertenecidoAOtroClub,
        // 5. Metadatos y Vistas Previas de Archivos Cargados
        archivos: {
          certificadoEpsNombre: form.archivoCertificadoEps?.name || null,
          certificadoEpsDataUrl: epsCertPreviewUrl,
          documentoIdentidadFrenteNombre: form.archivoDocumentoFrente?.name || null,
          documentoIdentidadFrenteDataUrl: docFrentePreviewUrl,
          documentoIdentidadReversoNombre: form.archivoDocumentoReverso?.name || null,
          documentoIdentidadReversoDataUrl: docReversoPreviewUrl,
          fotoTipoDocumentoNombre: form.archivoFotoTipoDocumento?.name || null,
          fotoTipoDocumentoDataUrl: fotoPreviewUrl,
          cartaLibertadNombre:
            form.haPertenecidoAOtroClub === "Sí"
              ? form.archivoCartaLibertad?.name || null
              : "No aplica",
          cartaLibertadDataUrl: cartaPreviewUrl
        },
        // 6. Cierre y Plan
        plan: form.planAPagar,
        objetivo: `Inscripción Oficial - ${form.planAPagar}`,
        estado: "Nueva Solicitud",
        origen: "Formulario de Inscripción Paso a Paso",
        fecha_creacion_iso: new Date().toISOString()
      };

      let savedAnywhere = false;

      // 1. Guardar inmediatamente en almacenamiento local y emitir notificación instantánea
      const solicitudRecord = { id: solicitudId, ...solicitudPayload };
      try {
        const stored: any[] = JSON.parse(localStorage.getItem("soul_local_solicitudes") || "[]");
        stored.unshift(solicitudRecord);
        localStorage.setItem("soul_local_solicitudes", JSON.stringify(stored));
        window.dispatchEvent(new Event("soul-solicitudes-updated"));
        try {
          const bc = new BroadcastChannel("soul-solicitudes");
          bc.postMessage({ type: "new-solicitud", solicitud: solicitudRecord });
          bc.close();
        } catch {}
        savedAnywhere = true;
      } catch {}

      // 2. Enviar al servidor local (/api/solicitudes -> SSE push + alerta WhatsApp al administrador)
      // Nota: sin keepalive:true porque Chromium rechaza bodies > 64KB cuando hay documentos adjuntos.
      void (async () => {
        try {
          const apiRes = await fetch("/api/solicitudes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(solicitudRecord)
          });
          if (!apiRes.ok) {
            throw new Error(`HTTP ${apiRes.status}`);
          }
        } catch {
          // Respaldo liviano sin DataURLs para garantizar que llegue la notificación SSE y WhatsApp
          try {
            const lightweightRecord = {
              ...solicitudRecord,
              archivos: {
                ...solicitudRecord.archivos,
                certificadoEpsDataUrl: null,
                documentoIdentidadFrenteDataUrl: null,
                documentoIdentidadReversoDataUrl: null,
                fotoTipoDocumentoDataUrl: null,
                cartaLibertadDataUrl: null
              }
            };
            await fetch("/api/solicitudes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(lightweightRecord)
            });
          } catch {}
        }
      })();
      savedAnywhere = true;

      // 3. Sincronizar con Firestore en segundo plano (no bloqueante)
      void (async () => {
        try {
          await addDoc(collection(db, "solicitudes"), {
            ...solicitudPayload,
            fecha_creacion: serverTimestamp()
          });
        } catch (fsErr) {
          console.warn("Aviso Firestore al enviar inscripción (usando respaldo local/API):", fsErr);
        }
      })();

      if (!savedAnywhere) {
        throw new Error("No se pudo registrar la inscripción.");
      }

      await copyPlainAmountToClipboard(totalAmount);
      setSubmittedSuccess(true);
    } catch (err: any) {
      console.error("Error enviando inscripción:", err);
      setStepError(err?.message || "No se pudo registrar la inscripción en la base de datos.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlanDetails = getPlanDetails(form.planAPagar);
  const totalAmount = selectedPlanDetails?.prontoPagoPrice || 95000;
  const [copiedAgain, setCopiedAgain] = useState<boolean>(false);
  const progressPercentage = Math.round((currentStep / STEPS.length) * 100);

  const copyPlainAmountToClipboard = async (rawAmount: number): Promise<boolean> => {
    const plainDigits = String(Math.round(Number(rawAmount) || 0)).replace(/[^0-9]/g, "");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(plainDigits);
        return true;
      }
    } catch {
      // Fallback para navegadores móviles
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
    } catch {
      return false;
    }
  };

  if (submittedSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-4 sm:py-10 px-1 sm:px-4">
        <Card className="bg-white border border-slate-200 text-slate-900 shadow-lg shadow-slate-200/70 rounded-2xl sm:rounded-3xl">
          <CardContent className="p-5 sm:p-8 text-center space-y-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-8 h-8 sm:w-9 sm:h-9" />
            </div>
            <div className="space-y-1.5">
              <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px] sm:text-xs">
                INSCRIPCIÓN REGISTRADA • CLUB DE VOLEIBOL SOUL
              </Badge>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                ¡Valor copiado al portapapeles! ({formatCurrency(totalAmount)})
              </h2>
              <p className="text-slate-600 text-xs sm:text-sm max-w-md mx-auto">
                En la siguiente pantalla de <strong>Nequi / Wompi</strong>, solo mantén presionada la casilla del valor y selecciona{" "}
                <strong className="text-indigo-700 underline">Pegar</strong>.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 text-left text-xs space-y-1.5 font-mono text-slate-700 break-words">
              <div>• Estudiante: {form.nombresCompletos} ({form.tipoDocumento} {form.numeroDocumento})</div>
              <div>• Datos Biométricos: {form.edad} años | Altura: {form.alturaCm} cm | Peso: {form.pesoKg} kg{computedBmi ? ` | IMC: ${computedBmi}` : ""}</div>
              <div>• Acudiente(s): {form.nombresPadresAcudientes}</div>
              <div>• EPS Verificada: {form.epsEstudiante} (Soporte: {form.archivoCertificadoEps?.name || "Adjunto"}) | Alergias: {form.alergias}</div>
              <div>• Documentos: Frente ({form.archivoDocumentoFrente?.name || "OK"}) · Reverso ({form.archivoDocumentoReverso?.name || "OK"}) · Foto ({form.archivoFotoTipoDocumento?.name || "OK"})</div>
              <div>• Plan Elegido: {form.planAPagar} — Valor en portapapeles: <strong className="text-emerald-700">{totalAmount}</strong></div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <Button
                type="button"
                onClick={async () => {
                  const openedWindow = window.open("https://checkout.nequi.wompi.co/l/VPOS_1Bc0Ii", "_blank");
                  if (openedWindow) openedWindow.opener = null;
                  await copyPlainAmountToClipboard(totalAmount);
                  sendPortalPaymentNotification({
                    athleteName: form.nombresCompletos.trim() || "Nueva Inscripción",
                    amount: totalAmount,
                    concept: `Inscripción Oficial - ${form.planAPagar}`,
                    paymentMethod: "Nequi / Wompi (Inscripción por revisar)",
                    source: "enrollment_wizard"
                  }).catch(() => {});
                }}
                className="w-full sm:w-auto min-h-[46px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-6 shadow-sm"
              >
                Continuar a Nequi / Wompi
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await copyPlainAmountToClipboard(totalAmount);
                  setCopiedAgain(true);
                }}
                className="w-full sm:w-auto min-h-[44px] border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-semibold"
              >
                {copiedAgain ? "¡Valor copiado de nuevo!" : "Copiar valor de nuevo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-3 sm:py-6 px-1 sm:px-4 space-y-4 sm:space-y-6">
      {/* Encabezado Principal Corporativo */}
      <div className="text-center space-y-1.5 sm:space-y-2 px-1">
        <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] sm:text-xs font-semibold">
          <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 inline" />
          REGISTRO OFICIAL DE DEPORTISTAS • SOUL VOLLEY CLUB
        </Badge>
        <h1 className="text-xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
          Formulario de Inscripción de Deportistas
        </h1>
        <p className="text-slate-600 text-xs sm:text-sm max-w-xl mx-auto">
          Completa tu solicitud paso a paso desde tu celular o computador. La información será revisada por nuestra coordinación deportiva.
        </p>
      </div>

      {/* Barra de Progreso y Stepper Interactivo (6 Pasos) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="font-bold text-indigo-700">
            Paso {currentStep} de {STEPS.length}: {STEPS[currentStep - 1].title}
          </span>
          <span className="font-mono font-semibold text-emerald-700">{progressPercentage}% completado</span>
        </div>

        {/* Barra continua */}
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Indicadores de los 6 pasos */}
        <div className="grid grid-cols-6 gap-1 sm:gap-1.5 pt-0.5">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === currentStep;
            const isDone = s.id < currentStep;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < currentStep) {
                    setStepError(null);
                    setCurrentStep(s.id);
                  }
                }}
                className={`flex flex-col items-center justify-center min-h-[44px] p-1.5 sm:p-2 rounded-xl border text-center transition-all ${
                  isActive
                    ? "bg-indigo-50 border-indigo-600 text-indigo-800 shadow-xs"
                    : isDone
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 cursor-pointer hover:bg-emerald-100/70"
                    : "bg-slate-50 border-slate-200 text-slate-400 cursor-default"
                }`}
              >
                <div className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-xs font-bold mb-0.5 sm:mb-1">
                  {isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className="text-[10px] font-bold leading-tight hidden sm:block">{s.title}</span>
                <span className="text-[10px] font-bold sm:hidden">#{s.id}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Alerta de Error de Validación */}
      {stepError && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 flex items-start gap-2.5 sm:gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm font-medium">{stepError}</div>
        </div>
      )}

      {/* Contenedor Principal del Paso Actual */}
      <Card className="bg-white border border-slate-200 text-slate-900 shadow-md shadow-slate-200/60 rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 border-b border-slate-200 p-4 sm:p-6 pb-3.5 sm:pb-4">
          <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-slate-900">
            {React.createElement(STEPS[currentStep - 1].icon, {
              className: "w-5 h-5 text-indigo-600 shrink-0"
            })}
            <span>
              {currentStep}. {STEPS[currentStep - 1].title}
            </span>
          </CardTitle>
          <CardDescription className="text-slate-500 text-xs">
            {STEPS[currentStep - 1].subtitle} — Todos los campos marcados con * son obligatorios.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 pt-5">
          <form onSubmit={handleSubmitEnrollment} className="space-y-5">
            {/* =========================================================
                PASO 1: DATOS PERSONALES DEL ESTUDIANTE
                ========================================================= */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Nombres y Apellidos Completos del Estudiante *
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="Ej. Valentina Torres Rodríguez"
                    value={form.nombresCompletos}
                    onChange={(e) => setForm({ ...form, nombresCompletos: e.target.value })}
                    className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Fecha de Nacimiento *
                    </label>
                    <Input
                      type="date"
                      required
                      value={form.fechaNacimiento}
                      onChange={(e) => {
                        const nextBirth = e.target.value;
                        const autoAge = calculateAgeFromBirthdate(nextBirth);
                        setForm({
                          ...form,
                          fechaNacimiento: nextBirth,
                          edad: autoAge || form.edad
                        });
                      }}
                      className="bg-white border-slate-300 text-slate-900 focus-visible:ring-indigo-500 text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Género *
                    </label>
                    <select
                      required
                      value={form.genero}
                      onChange={(e) => setForm({ ...form, genero: e.target.value })}
                      className="w-full min-h-[44px] sm:min-h-[38px] rounded-md bg-white border border-slate-300 px-3 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="" disabled>
                        Selecciona el género...
                      </option>
                      <option value="Femenino">Femenino</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Otro / Prefiero no decir">Otro / Prefiero no decir</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Tipo de Documento *
                    </label>
                    <select
                      required
                      value={form.tipoDocumento}
                      onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value })}
                      className="w-full min-h-[44px] sm:min-h-[38px] rounded-md bg-white border border-slate-300 px-3 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="TI">Tarjeta de Identidad (T.I.)</option>
                      <option value="CC">Cédula de Ciudadanía (C.C.)</option>
                      <option value="RC">Registro Civil (R.C.)</option>
                      <option value="CE">Cédula de Extranjería (C.E.)</option>
                      <option value="PA">Pasaporte (P.A.)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Número de Documento *
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="Ej. 1023456789"
                      value={form.numeroDocumento}
                      onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })}
                      className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 font-mono text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                    />
                  </div>
                </div>

                {/* Sección de Datos Biométricos */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Datos Biométricos del Deportista
                      </span>
                    </div>
                    {computedBmi && (
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono">
                        IMC: {computedBmi} kg/m²
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Edad (años) *
                      </label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={4}
                        max={99}
                        required
                        placeholder="Ej. 15"
                        value={form.edad}
                        onChange={(e) => setForm({ ...form, edad: e.target.value })}
                        className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 font-mono text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Altura (cm) *
                      </label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={80}
                        max={240}
                        required
                        placeholder="Ej. 168"
                        value={form.alturaCm}
                        onChange={(e) => setForm({ ...form, alturaCm: e.target.value })}
                        className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 font-mono text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Peso (kg) *
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={15}
                        max={200}
                        required
                        placeholder="Ej. 60.5"
                        value={form.pesoKg}
                        onChange={(e) => setForm({ ...form, pesoKg: e.target.value })}
                        className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 font-mono text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================
                PASO 2: UBICACIÓN Y CONTACTO
                ========================================================= */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Localidad de Residencia *
                    </label>
                    <select
                      required
                      value={form.localidad}
                      onChange={(e) => setForm({ ...form, localidad: e.target.value })}
                      className="w-full min-h-[44px] sm:min-h-[38px] rounded-md bg-white border border-slate-300 px-3 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="" disabled>
                        Selecciona tu localidad...
                      </option>
                      {LOCALIDADES_BOGOTA.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Barrio *
                    </label>
                    <Input
                      type="text"
                      required
                      placeholder="Ej. Cedritos, Niza, Mirandela..."
                      value={form.barrio}
                      onChange={(e) => setForm({ ...form, barrio: e.target.value })}
                      className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Dirección de Residencia *
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="Ej. Calle 140 # 15-20, Torre 2 Apto 301"
                    value={form.direccion}
                    onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Teléfono de Contacto / WhatsApp *
                    </label>
                    <Input
                      type="tel"
                      inputMode="tel"
                      required
                      placeholder="Ej. 300 123 4567"
                      value={form.telefonoContacto}
                      onChange={(e) => setForm({ ...form, telefonoContacto: e.target.value })}
                      className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 font-mono text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Nombres Completos de los Padres o Acudientes *
                    </label>
                    <Input
                      type="text"
                      required
                      placeholder="Ej. Carlos Torres y María Rodríguez"
                      value={form.nombresPadresAcudientes}
                      onChange={(e) =>
                        setForm({ ...form, nombresPadresAcudientes: e.target.value })
                      }
                      className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================
                PASO 3: INFORMACIÓN MÉDICA (¡CRÍTICO!)
                ========================================================= */}
            {currentStep === 3 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Banner de Advertencia Crítica Obligatoria de EPS */}
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-3">
                  <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs leading-relaxed">
                    <p className="font-bold text-amber-900 uppercase tracking-wide">
                      Requisito Médico Obligatorio — Afiliación a EPS
                    </p>
                    <p>
                      Por normativa deportiva y seguridad del deportista,{" "}
                      <strong className="underline">
                        NO se puede realizar la inscripción sin estar afiliado activamente a una EPS
                      </strong>
                      . Si este campo está vacío, el sistema bloqueará el envío del formulario.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1.5">
                    EPS del Estudiante (Obligatorio para inscribirse) *
                  </label>
                  <Input
                    type="text"
                    required
                    list="colombia-eps-list"
                    placeholder="Ej. Sanitas, Sura, Compensar, Famisanar, Salud Total, Nueva EPS..."
                    value={form.epsEstudiante}
                    onChange={(e) => setForm({ ...form, epsEstudiante: e.target.value })}
                    className={`bg-white text-slate-900 placeholder:text-slate-400 text-base sm:text-sm min-h-[44px] sm:min-h-[38px] ${
                      form.epsEstudiante && isEpsInvalid(form.epsEstudiante)
                        ? "border-rose-500 focus-visible:ring-rose-500"
                        : "border-slate-300 focus-visible:ring-indigo-500"
                    }`}
                  />
                  <datalist id="colombia-eps-list">
                    <option value="EPS Sanitas" />
                    <option value="EPS Sura" />
                    <option value="Compensar EPS" />
                    <option value="Famisanar" />
                    <option value="Salud Total EPS" />
                    <option value="Nueva EPS" />
                    <option value="Aliansalud EPS" />
                    <option value="Coosalud" />
                    <option value="Capital Salud" />
                  </datalist>
                  {isEpsInvalid(form.epsEstudiante) && (
                    <span className="text-[11px] text-rose-600 font-semibold block mt-1">
                      * Debes ingresar una EPS activa válida para poder continuar con la inscripción.
                    </span>
                  )}
                </div>

                {/* Documento verificable de afiliación a EPS / ADRES */}
                <DocumentUploadCard
                  label="Documento Verificable de Afiliación a EPS / ADRES (PDF, JPG o PNG) *"
                  hint="Adjunta tu certificado vigente de EPS o el comprobante de consulta ADRES para que la coordinación deportiva verifique tu cobertura antes de unirte al equipo."
                  file={form.archivoCertificadoEps}
                  accept=".pdf,image/*"
                  accent="amber"
                  loadedLabel="Soporte cargado"
                  onFileChange={(file) => setForm({ ...form, archivoCertificadoEps: file })}
                  extraWarning={
                    form.archivoCertificadoEps &&
                    form.archivoCertificadoEps.type === "application/pdf" &&
                    form.archivoCertificadoEps.size > 350 * 1024 ? (
                      <p className="text-[11px] text-amber-800 font-medium">
                        ⚠️ Este PDF supera 350 KB; el nombre quedará registrado, pero si deseas vista previa directa en el panel te recomendamos comprimirlo o subir una captura en JPG/PNG.
                      </p>
                    ) : null
                  }
                />

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Alergias o Condiciones Médicas (Si no tiene, escribe &ldquo;Ninguna&rdquo;) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, alergias: "Ninguna" })}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 underline py-1"
                    >
                      Escribir &ldquo;Ninguna&rdquo;
                    </button>
                  </div>
                  <Input
                    type="text"
                    required
                    placeholder='Ej. Ninguna (o especifica alergia a medicamentos / alimentos)'
                    value={form.alergias}
                    onChange={(e) => setForm({ ...form, alergias: e.target.value })}
                    className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 text-base sm:text-sm min-h-[44px] sm:min-h-[38px]"
                  />
                </div>
              </div>
            )}

            {/* =========================================================
                PASO 4: PERFIL DEPORTIVO
                ========================================================= */}
            {currentStep === 4 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Talla (Para Indumentaria Oficial) *
                    </label>
                    <select
                      required
                      value={form.tallaIndumentaria}
                      onChange={(e) => setForm({ ...form, tallaIndumentaria: e.target.value })}
                      className="w-full min-h-[44px] sm:min-h-[38px] rounded-md bg-white border border-slate-300 px-3 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="" disabled>
                        Selecciona la talla...
                      </option>
                      {TALLAS_INDUMENTARIA.map((talla) => (
                        <option key={talla} value={talla}>
                          Talla {talla}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Tiempo Entrenando Voleibol *
                    </label>
                    <select
                      required
                      value={form.tiempoEntrenando}
                      onChange={(e) => setForm({ ...form, tiempoEntrenando: e.target.value })}
                      className="w-full min-h-[44px] sm:min-h-[38px] rounded-md bg-white border border-slate-300 px-3 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="" disabled>
                        Selecciona tu categoría de experiencia...
                      </option>
                      {TIEMPO_ENTRENANDO_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">
                    ¿Ha pertenecido a otro club anteriormente? *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                    {(["Sí", "No"] as const).map((opcion) => {
                      const active = form.haPertenecidoAOtroClub === opcion;
                      return (
                        <button
                          key={opcion}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              haPertenecidoAOtroClub: opcion,
                              archivoCartaLibertad:
                                opcion === "No" ? null : form.archivoCartaLibertad
                            })
                          }
                          className={`min-h-[48px] p-3.5 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                            active
                              ? "bg-indigo-50 border-indigo-600 text-indigo-800 shadow-xs"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          <span>{opcion === "Sí" ? "✅ Sí, pertenecí a otro club" : "❌ No, es mi primer club"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {form.haPertenecidoAOtroClub === "Sí" && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 font-medium">
                      ℹ️ En el siguiente paso te solicitaremos adjuntar la <strong>Carta de Libertad</strong> de tu club anterior.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* =========================================================
                PASO 5: DOCUMENTACIÓN Y ARCHIVOS (CARGA DE ARCHIVOS)
                ========================================================= */}
            {currentStep === 5 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Si estás en celular, puedes tomar la foto directamente con la cámara o elegirla de tu galería.
                </p>

                {/* 1 y 2. Documento de identidad: Frente y Reverso */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DocumentUploadCard
                    label="1. Foto de Frente del Documento de Identidad *"
                    hint="Parte frontal legible donde se vea foto, nombre y número."
                    file={form.archivoDocumentoFrente}
                    accept="image/*,.pdf"
                    loadedLabel="Frente cargado"
                    onFileChange={(file) => setForm({ ...form, archivoDocumentoFrente: file })}
                  />

                  <DocumentUploadCard
                    label="2. Foto de Reverso del Documento de Identidad *"
                    hint="Parte trasera legible (código de barras / fechas)."
                    file={form.archivoDocumentoReverso}
                    accept="image/*,.pdf"
                    loadedLabel="Reverso cargado"
                    onFileChange={(file) => setForm({ ...form, archivoDocumentoReverso: file })}
                  />
                </div>

                {/* 3. Foto tipo documento actual */}
                <DocumentUploadCard
                  label="3. Foto Tipo Documento Actual (JPG o PNG) *"
                  hint="Selfie o fotografía reciente del rostro de frente, fondo claro y buena iluminación."
                  file={form.archivoFotoTipoDocumento}
                  accept="image/*"
                  loadedLabel="Foto cargada"
                  onFileChange={(file) => setForm({ ...form, archivoFotoTipoDocumento: file })}
                />

                {/* 4. Carta de libertad del club anterior (SOLO SI RESPONDIÓ "Sí") */}
                {form.haPertenecidoAOtroClub === "Sí" && (
                  <div className="animate-in fade-in duration-200">
                    <DocumentUploadCard
                      label="4. Carta de Libertad del Club Anterior (Obligatorio por traslado) *"
                      hint="Adjunta el documento firmado de paz y salvo o carta de libertad de tu club previo."
                      file={form.archivoCartaLibertad}
                      accept=".pdf,image/*"
                      accent="amber"
                      loadedLabel="Carta cargada"
                      onFileChange={(file) => setForm({ ...form, archivoCartaLibertad: file })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* =========================================================
                PASO 6: CIERRE Y SELECCIÓN DEL PLAN A PAGAR
                ========================================================= */}
            {currentStep === 6 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                    Plan a Pagar (Planes Oficiales del Club) *
                  </label>
                  <select
                    required
                    value={form.planAPagar}
                    onChange={(e) => setForm({ ...form, planAPagar: e.target.value })}
                    className="w-full min-h-[46px] rounded-xl bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 px-3.5 text-base sm:text-sm font-semibold text-slate-900"
                  >
                    {PAYMENT_PLANS.map((plan) => (
                      <option key={plan.id} value={plan.name}>
                        {plan.name} — {plan.classesLabel} ({formatCurrency(plan.prontoPagoPrice)} Pronto Pago / {formatCurrency(plan.normalPrice)} Mes)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPlanDetails && (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="text-sm font-bold text-slate-900">
                        {selectedPlanDetails.name} ({selectedPlanDetails.classesLabel})
                      </span>
                      <span className="text-sm font-bold text-emerald-700">
                        {formatCurrency(selectedPlanDetails.prontoPagoPrice)} COP (Pronto Pago)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{selectedPlanDetails.tagline} • {selectedPlanDetails.scope}</p>
                    <p className="text-[11px] text-amber-800 font-medium">✨ {ENROLLMENT_LABEL}</p>
                  </div>
                )}

                {/* Resumen de verificación antes de enviar */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-700 break-words">
                  <p className="font-bold text-slate-900 mb-1">Resumen de tu Inscripción:</p>
                  <p>• <strong>Estudiante:</strong> {form.nombresCompletos} ({form.tipoDocumento} {form.numeroDocumento})</p>
                  <p>• <strong>Datos Biométricos:</strong> {form.edad} años • Altura: {form.alturaCm} cm • Peso: {form.pesoKg} kg{computedBmi ? ` • IMC: ${computedBmi} kg/m²` : ""}</p>
                  <p>• <strong>Ubicación:</strong> {form.localidad} - {form.barrio} ({form.direccion})</p>
                  <p>• <strong>Acudiente y Contacto:</strong> {form.nombresPadresAcudientes} ({form.telefonoContacto})</p>
                  <p>• <strong>EPS Activa:</strong> <span className="text-emerald-700 font-semibold">{form.epsEstudiante}</span> (Certificado: {form.archivoCertificadoEps?.name || "Adjunto"}) | <strong>Alergias:</strong> {form.alergias}</p>
                  <p>• <strong>Perfil Deportivo:</strong> Talla {form.tallaIndumentaria} • {form.tiempoEntrenando} • Otro club: {form.haPertenecidoAOtroClub}</p>
                  <p>• <strong>Documentos:</strong> Frente ({form.archivoDocumentoFrente?.name || "OK"}) • Reverso ({form.archivoDocumentoReverso?.name || "OK"}) • Foto ({form.archivoFotoTipoDocumento?.name || "OK"})</p>
                </div>
              </div>
            )}

            {/* Barra Inferior de Botones de Navegación ("Anterior", "Siguiente: ...", "Enviar") */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 pt-4 border-t border-slate-200">
              {currentStep > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevStep}
                  className="w-full sm:w-auto min-h-[44px] border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </Button>
              ) : (
                <div className="hidden sm:block" />
              )}

              {currentStep < STEPS.length ? (
                <Button
                  type="button"
                  onClick={handleNextStep}
                  disabled={currentStep === 3 && isEpsInvalid(form.epsEstudiante)}
                  className="w-full sm:w-auto min-h-[46px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs sm:text-sm px-5 gap-1.5 sm:ml-auto shadow-xs"
                >
                  <span>{getNextButtonLabel(currentStep)}</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={submitting || isEpsInvalid(form.epsEstudiante)}
                  className="w-full sm:w-auto min-h-[46px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs sm:text-sm px-6 py-2.5 shadow-sm sm:ml-auto gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {submitting
                      ? "Enviando Inscripción..."
                      : `Finalizar Inscripción (${form.planAPagar})`}
                  </span>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

