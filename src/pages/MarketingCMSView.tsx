import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone,
  Save,
  RefreshCw,
  ExternalLink,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Image as ImageIcon,
  MessageSquare,
  ShieldCheck,
  RotateCcw,
  Eye,
  AlertTriangle
} from "lucide-react";

/**
 * Interfaz estricta para el documento `configuracion/marketing_landing` en Firestore.
 */
export interface IMarketingContent {
  heroTitle: string;
  heroSubtitle: string;
  bannerImageUrl: string;
  announcementBar: string;
  whatsappContact: string;
  beneficios: string[];
  updatedAt?: unknown;
  updatedBy?: string;
}

export const MARKETING_COLLECTION = "configuracion";
export const MARKETING_DOC_ID = "marketing_landing";

export const DEFAULT_MARKETING_CONTENT: IMarketingContent = {
  heroTitle: "Eleva tu nivel. Domina la cancha.",
  heroSubtitle:
    "En SOUL formamos deportistas integrales de voleibol con metodología técnica de alto impacto, entrenadores certificados y ambientes diseñados para potenciar tu pasión competitiva.",
  bannerImageUrl: "assets/volleyball_hero.jpg",
  announcementBar: "🏐 ¡Temporada 2026–2027 • Inscripciones Abiertas! Solicita hoy tu 1ª Clase de Cortesía Gratuita",
  whatsappContact: "573001234567",
  beneficios: [
    "Entrenadores certificados y formación técnica de alto nivel",
    "Participación en torneos distritales y nacionales",
    "1ª Sesión de evaluación 100% gratuita y sin matrícula",
    "Sede Norte y Sede Central con horarios flexibles"
  ]
};

/**
 * Normaliza un número de teléfono al formato internacional de Colombia (573XXXXXXXXX)
 */
function sanitizeMarketingPhone(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("0057")) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return `57${digits}`;
  }
  return digits;
}

/**
 * Divide el título principal para resaltar la segunda frase con el degradado oficial del club
 */
function splitHeroTitle(title: string): { mainPart: string; gradientPart: string } {
  const trimmed = (title || "").trim();
  if (!trimmed) {
    return { mainPart: "Eleva tu nivel.", gradientPart: "Domina la cancha." };
  }
  const dotIndex = trimmed.indexOf(".");
  if (dotIndex !== -1 && dotIndex < trimmed.length - 1) {
    return {
      mainPart: trimmed.slice(0, dotIndex + 1).trim(),
      gradientPart: trimmed.slice(dotIndex + 1).trim()
    };
  }
  const words = trimmed.split(/\s+/);
  if (words.length >= 4) {
    const mid = Math.ceil(words.length / 2);
    return {
      mainPart: words.slice(0, mid).join(" "),
      gradientPart: words.slice(mid).join(" ")
    };
  }
  return { mainPart: trimmed, gradientPart: "" };
}

export default function MarketingCMSView() {
  const { user, role } = useAuthStore();
  const [formData, setFormData] = useState<IMarketingContent>(DEFAULT_MARKETING_CONTENT);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [newBeneficio, setNewBeneficio] = useState<string>("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const isAuthorized = role === "admin" || role === "marketing";

  // Cargar y escuchar en tiempo real `configuracion/marketing_landing` desde Firestore
  useEffect(() => {
    const docRef = doc(db, MARKETING_COLLECTION, MARKETING_DOC_ID);

    const unsubscribe = onSnapshot(
      docRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<IMarketingContent>;
          setFormData({
            heroTitle: data.heroTitle ?? DEFAULT_MARKETING_CONTENT.heroTitle,
            heroSubtitle: data.heroSubtitle ?? DEFAULT_MARKETING_CONTENT.heroSubtitle,
            bannerImageUrl: data.bannerImageUrl ?? DEFAULT_MARKETING_CONTENT.bannerImageUrl,
            announcementBar: data.announcementBar ?? DEFAULT_MARKETING_CONTENT.announcementBar,
            whatsappContact: data.whatsappContact ?? DEFAULT_MARKETING_CONTENT.whatsappContact,
            beneficios:
              Array.isArray(data.beneficios) && data.beneficios.length > 0
                ? data.beneficios
                : DEFAULT_MARKETING_CONTENT.beneficios
          });
        } else {
          // Si el documento aún no existe en Firestore, lo inicializamos con los valores base del club
          try {
            await setDoc(docRef, {
              ...DEFAULT_MARKETING_CONTENT,
              updatedAt: serverTimestamp(),
              updatedBy: user?.email || "system_init"
            });
          } catch (initErr) {
            console.warn("No se pudo inicializar marketing_landing automáticamente:", initErr);
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error leyendo configuracion/marketing_landing:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.email]);

  // Guardar / Publicar cambios en Firestore (`configuracion/marketing_landing`)
  const handlePublishChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) return;

    const cleanBenefits = formData.beneficios
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    if (!formData.heroTitle.trim() || !formData.heroSubtitle.trim()) {
      setFeedback({
        type: "error",
        message: "El título principal y el subtítulo son obligatorios."
      });
      return;
    }

    if (cleanBenefits.length === 0) {
      setFeedback({
        type: "error",
        message: "Agrega al menos 1 beneficio clave para mostrar en la página pública."
      });
      return;
    }

    const sanitizedPhone = sanitizeMarketingPhone(formData.whatsappContact);

    try {
      setSaving(true);
      setFeedback(null);

      const docRef = doc(db, MARKETING_COLLECTION, MARKETING_DOC_ID);
      const payload: IMarketingContent = {
        heroTitle: formData.heroTitle.trim(),
        heroSubtitle: formData.heroSubtitle.trim(),
        bannerImageUrl: formData.bannerImageUrl.trim() || "assets/volleyball_hero.jpg",
        announcementBar: formData.announcementBar.trim(),
        whatsappContact: sanitizedPhone || "573001234567",
        beneficios: cleanBenefits,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || "admin"
      };

      await setDoc(docRef, payload, { merge: true });

      const nowStr = new Intl.DateTimeFormat("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date());
      setLastSavedAt(nowStr);
      setFeedback({
        type: "success",
        message: `¡Cambios publicados en vivo (${nowStr})! La página pública ya muestra la nueva información.`
      });
    } catch (err: any) {
      console.error("Error al publicar marketing_landing en Firestore:", err);
      setFeedback({
        type: "error",
        message: `Error al guardar en Firestore: ${err?.message || "Verifica tu conexión"}`
      });
    } finally {
      setSaving(false);
    }
  };

  // Actualizar un beneficio individual por índice
  const handleUpdateBeneficio = (index: number, value: string) => {
    const updated = [...formData.beneficios];
    updated[index] = value;
    setFormData({ ...formData, beneficios: updated });
  };

  // Eliminar un beneficio
  const handleRemoveBeneficio = (index: number) => {
    if (formData.beneficios.length <= 1) return;
    const updated = formData.beneficios.filter((_, idx) => idx !== index);
    setFormData({ ...formData, beneficios: updated });
  };

  // Añadir nuevo beneficio
  const handleAddBeneficio = () => {
    const clean = newBeneficio.trim();
    if (!clean) return;
    if (formData.beneficios.length >= 6) {
      setFeedback({
        type: "error",
        message: "Puedes registrar máximo 6 beneficios destacados en el Hero."
      });
      return;
    }
    setFormData({
      ...formData,
      beneficios: [...formData.beneficios, clean]
    });
    setNewBeneficio("");
  };

  // Restaurar plantilla predeterminada
  const handleResetDefaults = () => {
    if (!confirm("¿Restaurar los textos e imagen predeterminados de Soul Volley Club en el editor?")) {
      return;
    }
    setFormData(DEFAULT_MARKETING_CONTENT);
    setFeedback({
      type: "success",
      message: "Valores predeterminados cargados en el editor. Haz clic en 'Publicar Cambios' para aplicarlos."
    });
  };

  if (!isAuthorized) {
    return (
      <div className="agy-card p-8 text-center max-w-lg mx-auto my-12 space-y-3">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Acceso Restringido (RBAC)
        </h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Este módulo de Gestión de Marketing y Contenido Público es exclusivo para usuarios con rol{" "}
          <strong>Administrador Total</strong> o <strong>Marketing</strong>.
        </p>
      </div>
    );
  }

  const { mainPart, gradientPart } = splitHeroTitle(formData.heroTitle);
  const previewPhone = sanitizeMarketingPhone(formData.whatsappContact) || "573001234567";
  const previewBannerSrc =
    formData.bannerImageUrl.startsWith("http") || formData.bannerImageUrl.startsWith("/")
      ? formData.bannerImageUrl
      : `http://localhost:3000/${formData.bannerImageUrl.replace(/^\//, "")}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ENCABEZADO DEL MÓDULO */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                  Gestión de Marketing & Contenido Público
                </h1>
                <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20 text-[10px] gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Exclusivo Admin / Marketing
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                Edita en vivo los titulares, anuncios, imagen principal, beneficios y WhatsApp de captación del portal público (
                <code className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                  configuracion/marketing_landing
                </code>
                ).
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="rounded-lg text-xs h-9 gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Base</span>
          </Button>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir Página Pública</span>
          </a>
        </div>
      </div>

      {/* ALERTA DE FEEDBACK AL GUARDAR */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="agy-card p-12 text-center text-slate-500 dark:text-zinc-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
          Cargando configuración actual de marketing desde Firestore...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* =================================================================
              COLUMNA IZQUIERDA (7 cols): FORMULARIO DE EDICIÓN CMS
              ================================================================= */}
          <form
            onSubmit={handlePublishChanges}
            className="xl:col-span-7 agy-card p-5 sm:p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  Parámetros de Captación y Promoción
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Los cambios que publiques se reflejan al instante en la Landing Page pública.
                </p>
              </div>
              {lastSavedAt && (
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  Publicado: {lastSavedAt}
                </span>
              )}
            </div>

            {/* 1. Barra de Anuncios Superior */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                <span>1. Barra de Anuncios Superior (`announcementBar`)</span>
                <span className="text-[11px] font-normal text-slate-400">Cintillo promocional y badge</span>
              </label>
              <Input
                value={formData.announcementBar}
                onChange={(e) => setFormData({ ...formData, announcementBar: e.target.value })}
                placeholder="Ej: ¡Inscripciones abiertas para la temporada 2027!"
                className="text-xs"
              />
            </div>

            {/* 2. Título Principal del Hero */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                <span>2. Título Principal del Hero (`heroTitle`) *</span>
                <span className="text-[11px] font-normal text-purple-500">
                  Tip: Usa un punto (.) para aplicar degradado a la segunda frase
                </span>
              </label>
              <Input
                required
                value={formData.heroTitle}
                onChange={(e) => setFormData({ ...formData, heroTitle: e.target.value })}
                placeholder="Ej: Únete a Soul Volley Club. Domina la cancha."
                className="text-sm font-semibold"
              />
            </div>

            {/* 3. Subtítulo / Eslogan Persuasivo */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                3. Subtítulo o Eslogan Persuasivo (`heroSubtitle`) *
              </label>
              <textarea
                required
                rows={3}
                value={formData.heroSubtitle}
                onChange={(e) => setFormData({ ...formData, heroSubtitle: e.target.value })}
                placeholder="Describe la propuesta de valor del club para padres y nuevos deportistas..."
                className="w-full rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>

            {/* 4. Imagen Principal del Banner + Contacto de WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-500" />
                  <span>4. URL Imagen Principal (`bannerImageUrl`)</span>
                </label>
                <Input
                  value={formData.bannerImageUrl}
                  onChange={(e) => setFormData({ ...formData, bannerImageUrl: e.target.value })}
                  placeholder="assets/volleyball_hero.jpg o https://..."
                  className="text-xs font-mono"
                />
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, bannerImageUrl: "assets/volleyball_hero.jpg" })
                    }
                    className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Usar foto oficial del club
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                  <span>5. WhatsApp de Captación (`whatsappContact`)</span>
                </label>
                <Input
                  value={formData.whatsappContact}
                  onChange={(e) => setFormData({ ...formData, whatsappContact: e.target.value })}
                  placeholder="573001234567"
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-slate-400">
                  Enlace activo: <code className="text-emerald-500">wa.me/{previewPhone}</code>
                </p>
              </div>
            </div>

            {/* 6. Lista de Beneficios Clave */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  6. Beneficios Clave del Club (`beneficios` — {formData.beneficios.length} puntos)
                </label>
                <span className="text-[11px] text-slate-400">Recomendado: 3 a 4 puntos</span>
              </div>

              <div className="space-y-2">
                {formData.beneficios.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-300 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <Input
                      value={item}
                      onChange={(e) => handleUpdateBeneficio(idx, e.target.value)}
                      placeholder={`Beneficio #${idx + 1}`}
                      className="text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={formData.beneficios.length <= 1}
                      onClick={() => handleRemoveBeneficio(idx)}
                      className="h-8 w-8 text-slate-400 hover:text-rose-500 shrink-0"
                      title="Eliminar beneficio"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Agregar nuevo beneficio */}
              {formData.beneficios.length < 6 && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newBeneficio}
                    onChange={(e) => setNewBeneficio(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddBeneficio();
                      }
                    }}
                    placeholder="Agregar nuevo beneficio (ej: Preparación física especializada)..."
                    className="text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddBeneficio}
                    className="rounded-xl text-xs h-9 gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Botón de Publicación */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
              <Button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold rounded-lg px-6 h-10 gap-2 shadow-sm"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Publicando en Firestore...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Publicar Cambios</span>
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* =================================================================
              COLUMNA DERECHA (5 cols): PREVISUALIZACIÓN EN VIVO DEL PORTAL PÚBLICO
              ================================================================= */}
          <div className="xl:col-span-5 space-y-3">
            <div className="agy-card overflow-hidden border-purple-500/30">
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Previsualización en Vivo (Portal Público)
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Vista Previa
                </span>
              </div>

              {/* Simulación de la Barra de Anuncios Superior */}
              {formData.announcementBar.trim() && (
                <div className="bg-gradient-to-r from-[#7e1236] via-[#581c87] to-[#3b0764] text-white text-[11px] font-semibold px-3 py-2 text-center">
                  {formData.announcementBar}
                </div>
              )}

              {/* Simulación del Hero de `public-portal/index.html` */}
              <div className="bg-[#070709] text-white p-5 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span>{formData.announcementBar || "Temporada Activa"}</span>
                </div>

                <h3 className="text-2xl font-black leading-tight tracking-tight">
                  {mainPart}{" "}
                  {gradientPart && (
                    <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400 bg-clip-text text-transparent block">
                      {gradientPart}
                    </span>
                  )}
                </h3>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  {formData.heroSubtitle}
                </p>

                {/* Lista de Beneficios en Previsualización */}
                <ul className="space-y-1.5 pt-1">
                  {formData.beneficios
                    .filter((b) => b.trim().length > 0)
                    .map((beneficio, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-zinc-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{beneficio}</span>
                      </li>
                    ))}
                </ul>

                {/* Imagen del Banner en Previsualización */}
                <div className="relative rounded-xl overflow-hidden border border-purple-500/30 bg-zinc-900 aspect-video">
                  <img
                    src={previewBannerSrc}
                    alt="Previsualización Banner SOUL"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "http://localhost:3000/assets/volleyball_hero.jpg";
                    }}
                  />
                </div>

                {/* Botones CTA simulados */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#7e1236] to-[#581c87] text-white">
                    Agendar Clase de Cortesía
                  </span>
                  <a
                    href={`https://wa.me/${previewPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors"
                  >
                    💬 Escríbenos (+{previewPhone})
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

