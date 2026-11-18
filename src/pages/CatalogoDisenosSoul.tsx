import { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ShoppingBag,
  Ticket,
  Newspaper,
  Users,
  Trophy,
  MapPin,
  Shield,
  Sparkles,
  CheckCircle2,
  X,
  Menu,
  ChevronRight,
  ClipboardList,
  Plus,
  Flame
} from "lucide-react";

type DesignId = "diario" | "entrenador" | "batalla" | "combate";
type NavSection = "equipo" | "partidos" | "noticias" | "tienda" | "boletos";

const PHOTOS = {
  spike: "/catalogo/spike.jpg",
  defense: "/catalogo/defense.jpg",
  block: "/catalogo/block.jpg",
  serve: "/catalogo/serve.jpg"
} as const;

const BACKGROUNDS = {
  diario: "/catalogo/bg-diario.jpg",
  entrenador: "/catalogo/bg-entrenador.jpg",
  entrenadorWall: "/catalogo/bg-entrenador-wall.jpg",
  batalla: "/catalogo/bg-batalla.jpg",
  combate: "/catalogo/bg-combate.jpg"
} as const;

/** Polígono SVG de borde rasgado realista (28 puntos irregulares) */
const TORN_PAPER_CLIP =
  "polygon(0% 1.5%, 4% 0%, 9% 2%, 14% 0.5%, 20% 1.8%, 26% 0%, 33% 1.4%, 40% 0.2%, 47% 2%, 54% 0.5%, 61% 1.6%, 68% 0%, 75% 1.9%, 82% 0.3%, 89% 1.7%, 95% 0.2%, 100% 1.6%, 98.8% 12%, 100% 24%, 98.6% 37%, 100% 50%, 98.5% 63%, 100% 76%, 98.9% 89%, 99.8% 98.5%, 94% 100%, 88% 98.2%, 81% 99.8%, 74% 98.4%, 67% 100%, 60% 98.5%, 52% 99.8%, 45% 98.2%, 38% 100%, 31% 98.4%, 24% 99.8%, 17% 98.3%, 10% 100%, 4% 98.5%, 0% 99.6%, 1.2% 87%, 0% 74%, 1.4% 60%, 0% 47%, 1.3% 33%, 0% 20%, 1.1% 9%)";

interface DesignMeta {
  id: DesignId;
  number: string;
  name: string;
  subtitle: string;
  headline: string;
  styleTag: string;
  description: string;
  coverPhoto: string;
  bgTexture: string;
  bwCover?: boolean;
  accentBg: string;
  surfacePreviewClass: string;
}

const DESIGNS: DesignMeta[] = [
  {
    id: "diario",
    number: "01",
    name: "DIARIO DE LA CANCHA",
    subtitle: "Editorial desgastado • Collage",
    headline: "SANGRE, SUDOR Y GLORIA",
    styleTag: "Papel Periódico & Polaroids",
    description:
      "Papel periódico envejecido con manchas de tinta y grano tipográfico, polaroids apiladas con cinta de enmascarar y bloques rasgados de horarios y precios.",
    coverPhoto: PHOTOS.defense,
    bgTexture: BACKGROUNDS.diario,
    accentBg: "bg-[#6b0f26]",
    surfacePreviewClass: "bg-[#ece8dd] text-zinc-950"
  },
  {
    id: "entrenador",
    number: "02",
    name: "MÉTODO DE ENTRENADOR",
    subtitle: "Pizarra táctica • Informal",
    headline: "MÉTODO DE TRABAJO",
    styleTag: "Tiza Blanca/Morada & Cuaderno",
    description:
      "Pizarra táctica oscura con jugadas X/O y flechas en tiza blanca y morada, fotos adheridas con cinta morada y tarifas sobre hojas de cuaderno rayadas.",
    coverPhoto: PHOTOS.serve,
    bgTexture: BACKGROUNDS.entrenador,
    accentBg: "bg-purple-700",
    surfacePreviewClass: "bg-[#101216] text-white"
  },
  {
    id: "batalla",
    number: "03",
    name: "ZONA DE BATALLA / COLLAGE CALLEJERO",
    subtitle: "Grunge urbano • Rudo",
    headline: "PASIÓN, SUDOR Y SANGRE",
    styleTag: "Concreto, Spray & Cartón",
    description:
      "Muro de concreto texturizado con salpicaduras y chorreados de spray morado y vinotinto, fotos con bordes quemados y tablas de combate sobre cartón.",
    coverPhoto: PHOTOS.spike,
    bgTexture: BACKGROUNDS.batalla,
    accentBg: "bg-[#6b0f26]",
    surfacePreviewClass: "bg-[#c6c6ca] text-zinc-950"
  },
  {
    id: "combate",
    number: "04",
    name: "ZONA DE COMBATE / GRUNGE MILITAR",
    subtitle: "Industrial oscuro • Metal oxidado",
    headline: "SANGRE, SUDOR Y VICTORIA",
    styleTag: "Metal, Malla, Stencil & B/N",
    description:
      "Placa metálica oxidada, malla eslabonada y manchas vinotinto de alto impacto, tipografía stencil desgastada, fotos B/N contrastadas y papel pintado.",
    coverPhoto: PHOTOS.block,
    bgTexture: BACKGROUNDS.combate,
    bwCover: true,
    accentBg: "bg-purple-700",
    surfacePreviewClass: "bg-[#0d0d10] text-white"
  }
];

const SHARED_ROSTER = [
  { num: "04", name: "Valentina Torres", pos: "Armadora", height: "1.74 m", badge: "Capitana", photo: PHOTOS.serve },
  { num: "09", name: "Camila Mendoza", pos: "Punta / Atacante", height: "1.81 m", badge: "MVP Fecha 4", photo: PHOTOS.spike },
  { num: "12", name: "Mateo Restrepo", pos: "Central", height: "1.92 m", badge: "Bloqueo #1", photo: PHOTOS.block },
  { num: "17", name: "Sofía Quintero", pos: "Líbero", height: "1.66 m", badge: "94% Defensa", photo: PHOTOS.defense }
];

const SHARED_MATCHES = [
  { rival: "Titanes Voley Club", date: "Sáb 18 Abr • 18:30", venue: "Coliseo Norte", comp: "Liga Distrital" },
  { rival: "Águilas Doradas", date: "Mié 22 Abr • 20:00", venue: "Cancha Central SOUL", comp: "Copa Apertura" },
  { rival: "Fénix Sub-21", date: "Dom 26 Abr • 16:00", venue: "Polideportivo Sur", comp: "Torneo Élite" }
];

const SHARED_NEWS = [
  {
    tag: "CRÓNICA DE PARTIDO",
    title: "Remontada épica 3-2 en el quinto set ante el campeón vigente",
    date: "Hace 2 días",
    summary: "Con 14 puntos directos de saque y muro impenetrable en zona 3, SOUL selló la victoria frente a 600 asistentes.",
    photo: PHOTOS.spike
  },
  {
    tag: "CONVOCATORIA 2026",
    title: "Pruebas abiertas para categorías Juvenil y Mayores",
    date: "Hace 5 días",
    summary: "Buscamos armadores, opuestos y líberos con disciplina competitiva para el circuito distrital y nacional.",
    photo: PHOTOS.defense
  },
  {
    tag: "METODOLOGÍA",
    title: "Nuevo bloque de potencia pliométrica y lectura táctica 5-1",
    date: "Hace 1 semana",
    summary: "Sesiones estructuradas de lunes a sábado enfocadas en salto vertical, cobertura y transición ofensiva.",
    photo: PHOTOS.block
  }
];

const SHARED_PRODUCTS = [
  { id: "p1", name: "Jersey Oficial SOUL Vinotinto / Morado", price: "$95.000", tag: "Match Kit 2026", photo: PHOTOS.spike },
  { id: "p2", name: "Rodilleras Pro-Impact Negras", price: "$68.000", tag: "Protección Pro", photo: PHOTOS.defense },
  { id: "p3", name: "Sudadera Calentamiento #EstiloSoul", price: "$135.000", tag: "Edición Urbana", photo: PHOTOS.serve }
];

const SHARED_TICKETS = [
  { id: "t1", match: "SOUL vs. Titanes Voley Club", zone: "Tribuna General", price: "$18.000" },
  { id: "t2", match: "SOUL vs. Titanes Voley Club", zone: "Zona Cancha VIP", price: "$35.000" },
  { id: "t3", match: "Abono Temporada Completa (6 Fechas)", zone: "Preferencial", price: "$85.000" }
];

const SHARED_SCHEDULES = [
  { day: "Lunes y Miércoles", time: "18:00 - 20:00", group: "Iniciación & Formativo" },
  { day: "Martes y Jueves", time: "19:00 - 21:00", group: "Tecnificación & Juvenil" },
  { day: "Sábados", time: "09:00 - 12:00", group: "Selección & Tope Táctico" }
];

const SHARED_PRICES = [
  { plan: "Plan Alpha (4 clases/mes)", price: "$85.000" },
  { plan: "Plan Alfa (8 clases/mes)", price: "$95.000" },
  { plan: "Plan Élite (12 clases/mes)", price: "$120.000" },
  { plan: "Plan Competitivo Ilimitado", price: "$155.000" }
];

/** Filtro SVG global de textura de papel/grano + spray + metal */
function SvgTextureDefs() {
  return (
    <svg className="hidden" width="0" height="0" aria-hidden="true">
      <defs>
        <filter id="soul-paper-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" result="noise" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.08 0" />
        </filter>
        <filter id="soul-rough-edge">
          <feTurbulence type="turbulence" baseFrequency="0.045" numOctaves="3" result="turb" />
          <feDisplacementMap in="SourceGraphic" in2="turb" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/** Manchas de spray realistas con gotas verticales en SVG */
function SpraySplatter({
  color,
  className = ""
}: {
  color: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 220 260" className={`pointer-events-none select-none ${className}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`mist-${color.replace("#", "")}`} cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.92" />
          <stop offset="55%" stopColor={color} stopOpacity="0.65" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="105" cy="95" r="78" fill={`url(#mist-${color.replace("#", "")})`} />
      <path
        d="M52,95 C46,62 72,38 106,42 C142,46 164,74 156,108 C148,142 112,155 76,142 C60,136 56,118 52,95 Z"
        fill={color}
        opacity="0.82"
      />
      {/* Chorreados de pintura */}
      <rect x="74" y="130" width="6" height="82" rx="3" fill={color} opacity="0.86" />
      <rect x="98" y="138" width="8" height="106" rx="4" fill={color} opacity="0.9" />
      <rect x="128" y="128" width="5" height="68" rx="2.5" fill={color} opacity="0.78" />
      <rect x="148" y="112" width="4" height="44" rx="2" fill={color} opacity="0.7" />
      {/* Gotas dispersas */}
      <circle cx="32" cy="48" r="5" fill={color} opacity="0.85" />
      <circle cx="176" cy="52" r="4" fill={color} opacity="0.8" />
      <circle cx="44" cy="170" r="3.5" fill={color} opacity="0.75" />
      <circle cx="172" cy="168" r="6" fill={color} opacity="0.75" />
      <circle cx="102" cy="252" r="4" fill={color} opacity="0.85" />
    </svg>
  );
}

/** Mancha de tinta / sangre seca editorial o militar */
function InkSplatter({ color, className = "" }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={`pointer-events-none select-none ${className}`} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M95,45 C118,32 146,48 152,72 C158,96 178,108 164,132 C150,156 122,162 98,154 C74,146 46,160 36,136 C26,112 44,88 54,68 C64,48 72,58 95,45 Z"
        fill={color}
        opacity="0.88"
      />
      <circle cx="30" cy="52" r="7" fill={color} opacity="0.8" />
      <circle cx="175" cy="60" r="5" fill={color} opacity="0.85" />
      <circle cx="160" cy="175" r="8" fill={color} opacity="0.78" />
      <circle cx="52" cy="176" r="4" fill={color} opacity="0.82" />
      <circle cx="182" cy="138" r="3.5" fill={color} opacity="0.7" />
    </svg>
  );
}

/** Navbar Universal idéntico en todos los diseños (logo circular izquierda, 5 enlaces centro, SOCIOS vinotinto + ENTRADAS morado derecha) */
function UniversalNavbar({
  onSelectSection,
  onOpenSocios,
  onOpenEntradas,
  activeSection
}: {
  onSelectSection: (section: NavSection) => void;
  onOpenSocios: () => void;
  onOpenEntradas: () => void;
  activeSection: NavSection;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { id: NavSection; label: string }[] = [
    { id: "equipo", label: "EQUIPO" },
    { id: "partidos", label: "PARTIDOS" },
    { id: "noticias", label: "NOTICIAS" },
    { id: "tienda", label: "TIENDA" },
    { id: "boletos", label: "BOLETOS" }
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-black/95 border-b border-purple-500/35 backdrop-blur-md shadow-[0_6px_25px_rgba(0,0,0,0.65)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Izquierda: Logo Circular */}
        <button
          type="button"
          onClick={() => onSelectSection("equipo")}
          className="flex items-center gap-3 shrink-0 group text-left"
        >
          <div className="w-10 h-10 rounded-full border-2 border-purple-500 p-0.5 bg-black flex items-center justify-center overflow-hidden shadow-[0_0_18px_rgba(124,58,237,0.5)]">
            <img src="/logo.png" alt="Logo Club SOUL" className="w-full h-full object-contain rounded-full" />
          </div>
          <div className="hidden sm:block leading-tight">
            <span className="block font-['Oswald'] text-base font-bold tracking-[0.12em] text-white uppercase">
              SOUL VOLLEYBALL
            </span>
            <span className="block text-[10px] font-bold tracking-[0.22em] text-purple-400 uppercase">#EstiloSoul</span>
          </div>
        </button>

        {/* Centro: Enlaces (EQUIPO, PARTIDOS, NOTICIAS, TIENDA, BOLETOS) */}
        <nav className="hidden lg:flex items-center gap-7">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`font-['Oswald'] text-sm font-semibold tracking-[0.18em] uppercase transition-all py-1.5 border-b-2 ${
                activeSection === item.id
                  ? "text-white border-purple-500"
                  : "text-zinc-300 border-transparent hover:text-white hover:border-[#6b0f26]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Derecha: SOCIOS (vinotinto) y ENTRADAS (morado) */}
        <div className="hidden sm:flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenSocios}
            className="px-4 py-2 rounded-md bg-[#6b0f26] hover:bg-[#881337] text-white font-['Oswald'] text-xs font-bold tracking-[0.18em] uppercase border border-[#9f1239]/60 transition-all shadow-sm"
          >
            SOCIOS
          </button>
          <button
            type="button"
            onClick={onOpenEntradas}
            className="px-4 py-2 rounded-md bg-purple-700 hover:bg-purple-600 text-white font-['Oswald'] text-xs font-bold tracking-[0.18em] uppercase border border-purple-400/50 transition-all shadow-sm"
          >
            ENTRADAS
          </button>
        </div>

        {/* Botón menú móvil */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="lg:hidden p-2 rounded-lg text-zinc-200 hover:bg-zinc-900 border border-zinc-800"
          aria-label="Abrir navegación"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Menú móvil desplegable */}
      {mobileOpen && (
        <div className="lg:hidden bg-zinc-950 border-t border-zinc-800 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  setMobileOpen(false);
                }}
                className={`text-left px-3 py-2.5 rounded-lg font-['Oswald'] text-xs font-bold tracking-widest uppercase ${
                  activeSection === item.id
                    ? "bg-purple-700/35 text-white border border-purple-500/50"
                    : "bg-zinc-900 text-zinc-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onOpenSocios();
                setMobileOpen(false);
              }}
              className="py-2.5 rounded-lg bg-[#6b0f26] text-white font-['Oswald'] text-xs font-bold tracking-widest uppercase"
            >
              SOCIOS
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenEntradas();
                setMobileOpen(false);
              }}
              className="py-2.5 rounded-lg bg-purple-700 text-white font-['Oswald'] text-xs font-bold tracking-widest uppercase"
            >
              ENTRADAS
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

/** Secciones complementarias de altura completa (min-h-screen) con fotografía real y acabado coherente en cada tema */
function FullHeightClubSections({
  theme,
  onAddCart,
  onReserveTicket
}: {
  theme: "paper" | "chalk" | "concrete" | "military";
  onAddCart: (name: string) => void;
  onReserveTicket: (ticketLabel: string) => void;
}) {
  const isDark = theme === "chalk" || theme === "military";

  const wrapperStyle: React.CSSProperties =
    theme === "paper"
      ? {
          backgroundColor: "#e8e3d7",
          backgroundImage: `linear-gradient(rgba(233,228,216,0.52), rgba(233,228,216,0.6)), url("${BACKGROUNDS.diario}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }
      : theme === "chalk"
      ? {
          backgroundColor: "#0c0f14",
          backgroundImage: `linear-gradient(rgba(10,12,17,0.48), rgba(10,12,17,0.62)), url("${BACKGROUNDS.entrenador}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }
      : theme === "concrete"
      ? {
          backgroundColor: "#c5c6ca",
          backgroundImage: `linear-gradient(rgba(202,203,208,0.42), rgba(190,191,196,0.5)), url("${BACKGROUNDS.batalla}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }
      : {
          backgroundColor: "#0a0a0d",
          backgroundImage: `linear-gradient(rgba(8,8,11,0.45), rgba(8,8,11,0.62)), url("${BACKGROUNDS.combate}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        };

  const cardTone =
    theme === "paper"
      ? "bg-[#f8f5ec] border-2 border-zinc-900 shadow-[6px_6px_0px_#18181b] text-zinc-950"
      : theme === "chalk"
      ? "bg-[#151820] border-2 border-dashed border-purple-400/45 text-white shadow-[0_12px_35px_rgba(0,0,0,0.6)]"
      : theme === "concrete"
      ? "bg-[#cdb489] border-2 border-zinc-900 shadow-[7px_7px_0px_#6b0f26] text-zinc-950"
      : "bg-zinc-950/95 border border-zinc-700/80 shadow-[0_14px_35px_rgba(0,0,0,0.85)] text-white";

  const subText = isDark ? "text-zinc-300" : "text-zinc-700";

  return (
    <>
      {/* SECCIÓN PARTIDOS (min-h-screen) */}
      <section
        id="sec-partidos"
        style={wrapperStyle}
        className={`min-h-screen w-full border-t-2 ${isDark ? "border-zinc-800 text-white" : "border-zinc-900 text-zinc-950"} py-16 px-4 sm:px-8 flex items-center`}
      >
        <div className="max-w-6xl mx-auto w-full space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-current/20 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#6b0f26] text-white font-['Oswald'] text-xs font-bold tracking-[0.2em] uppercase">
                <Trophy className="w-3.5 h-3.5" /> CALENDARIO OFICIAL
              </span>
              <h2 className="font-['Anton'] text-4xl sm:text-6xl uppercase tracking-wide mt-2 leading-none">
                PRÓXIMOS PARTIDOS
              </h2>
            </div>
            <span className="text-xs font-mono font-bold uppercase opacity-75">
              Temporada 2026 • Voleibol de Piso
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SHARED_MATCHES.map((m, idx) => (
              <div key={m.rival} className={`p-6 rounded-sm flex flex-col justify-between gap-5 ${cardTone}`}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-black uppercase">
                    <span className="px-2.5 py-0.5 bg-purple-700 text-white tracking-wider">{m.comp}</span>
                    <span className="font-mono opacity-75">FECHA 0{idx + 5}</span>
                  </div>
                  <h3 className="font-['Oswald'] text-2xl font-bold uppercase leading-tight">
                    SOUL vs. {m.rival}
                  </h3>
                  <div className={`text-xs space-y-2 font-medium ${subText}`}>
                    <p className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-500 shrink-0" /> {m.date}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#9f1239] shrink-0" /> {m.venue}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onReserveTicket(`SOUL vs. ${m.rival}`)}
                  className="w-full py-3 bg-[#6b0f26] hover:bg-[#881337] text-white font-['Oswald'] text-sm font-bold uppercase tracking-[0.16em] transition-colors"
                >
                  Reservar Entrada
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECCIÓN NOTICIAS Y PLANTEL (min-h-screen) */}
      <section
        id="sec-noticias"
        style={wrapperStyle}
        className={`min-h-screen w-full border-t-2 ${isDark ? "border-zinc-800 text-white" : "border-zinc-900 text-zinc-950"} py-16 px-4 sm:px-8 flex items-center`}
      >
        <div className="max-w-6xl mx-auto w-full space-y-10">
          <div className="border-b-2 border-current/20 pb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-700 text-white font-['Oswald'] text-xs font-bold tracking-[0.2em] uppercase">
              <Newspaper className="w-3.5 h-3.5" /> BOLETÍN DEL CLUB
            </span>
            <h2 className="font-['Anton'] text-4xl sm:text-6xl uppercase tracking-wide mt-2 leading-none">
              NOTICIAS & PLANTEL ESTELAR
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              {SHARED_NEWS.map((n) => (
                <article key={n.title} className={`p-4 sm:p-5 rounded-sm grid grid-cols-1 sm:grid-cols-12 gap-4 items-center ${cardTone}`}>
                  <div className="sm:col-span-4 h-28 overflow-hidden border border-current/20">
                    <img
                      src={n.photo}
                      alt={n.title}
                      className={`w-full h-full object-cover ${theme === "military" ? "grayscale contrast-125" : ""}`}
                    />
                  </div>
                  <div className="sm:col-span-8 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase">
                      <span className="text-purple-500">{n.tag}</span>
                      <span className="opacity-70 font-mono">{n.date}</span>
                    </div>
                    <h3 className="font-['Oswald'] text-lg font-bold leading-snug uppercase">{n.title}</h3>
                    <p className={`text-xs leading-relaxed ${subText}`}>{n.summary}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className={`lg:col-span-5 p-6 rounded-sm space-y-4 ${cardTone}`}>
              <div className="flex items-center justify-between border-b border-current/20 pb-3">
                <h3 className="font-['Oswald'] text-lg font-bold uppercase flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" /> Cuadro Titular
                </h3>
                <span className="text-[10px] font-black px-2.5 py-0.5 bg-[#6b0f26] text-white tracking-widest uppercase">
                  TEMPORADA 2026
                </span>
              </div>
              <div className="space-y-3">
                {SHARED_ROSTER.map((p) => (
                  <div
                    key={p.num}
                    className="flex items-center justify-between gap-3 p-2.5 bg-black/10 border border-current/15"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-11 h-11 overflow-hidden border border-current/30 shrink-0">
                        <img
                          src={p.photo}
                          alt={p.name}
                          className={`w-full h-full object-cover ${theme === "military" ? "grayscale contrast-125" : ""}`}
                        />
                        <span className="absolute bottom-0 right-0 bg-black text-white font-mono text-[9px] font-black px-1">
                          #{p.num}
                        </span>
                      </div>
                      <div>
                        <p className="font-['Oswald'] text-sm font-bold uppercase tracking-wide">{p.name}</p>
                        <p className={`text-[11px] ${subText}`}>
                          {p.pos} • {p.height}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 bg-purple-700/20 text-purple-400 border border-purple-500/30 uppercase">
                      {p.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN TIENDA (min-h-screen) */}
      <section
        id="sec-tienda"
        style={wrapperStyle}
        className={`min-h-screen w-full border-t-2 ${isDark ? "border-zinc-800 text-white" : "border-zinc-900 text-zinc-950"} py-16 px-4 sm:px-8 flex items-center`}
      >
        <div className="max-w-6xl mx-auto w-full space-y-10">
          <div className="border-b-2 border-current/20 pb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#6b0f26] text-white font-['Oswald'] text-xs font-bold tracking-[0.2em] uppercase">
              <ShoppingBag className="w-3.5 h-3.5" /> INDUMENTARIA OFICIAL
            </span>
            <h2 className="font-['Anton'] text-4xl sm:text-6xl uppercase tracking-wide mt-2 leading-none">
              TIENDA SOUL #ESTILOSOUL
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SHARED_PRODUCTS.map((prod) => (
              <div key={prod.id} className={`p-5 rounded-sm flex flex-col justify-between gap-4 ${cardTone}`}>
                <div className="space-y-3">
                  <div className="h-48 overflow-hidden border border-current/20 relative">
                    <img
                      src={prod.photo}
                      alt={prod.name}
                      className={`w-full h-full object-cover ${theme === "military" ? "grayscale contrast-125" : ""}`}
                    />
                    <span className="absolute top-2 left-2 px-2.5 py-0.5 bg-black/90 text-white text-[10px] font-black uppercase tracking-wider">
                      {prod.tag}
                    </span>
                  </div>
                  <h3 className="font-['Oswald'] text-lg font-bold uppercase">{prod.name}</h3>
                  <p className="text-2xl font-black text-purple-500 font-mono">{prod.price}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onAddCart(prod.name)}
                  className="w-full py-3 bg-purple-700 hover:bg-purple-600 text-white font-['Oswald'] text-sm font-bold uppercase tracking-[0.16em] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Agregar al Pedido
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECCIÓN BOLETOS (min-h-screen) */}
      <section
        id="sec-boletos"
        style={wrapperStyle}
        className={`min-h-screen w-full border-t-2 ${isDark ? "border-zinc-800 text-white" : "border-zinc-900 text-zinc-950"} py-16 px-4 sm:px-8 flex items-center`}
      >
        <div className="max-w-5xl mx-auto w-full space-y-10">
          <div className="border-b-2 border-current/20 pb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-700 text-white font-['Oswald'] text-xs font-bold tracking-[0.2em] uppercase">
              <Ticket className="w-3.5 h-3.5" /> TAQUILLA OFICIAL
            </span>
            <h2 className="font-['Anton'] text-4xl sm:text-6xl uppercase tracking-wide mt-2 leading-none">
              BOLETOS Y ABONOS DE CANCHA
            </h2>
          </div>

          <div className="space-y-4">
            {SHARED_TICKETS.map((t) => (
              <div
                key={t.id}
                className={`p-5 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${cardTone}`}
              >
                <div className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-purple-500">{t.zone}</span>
                  <h3 className="font-['Oswald'] text-xl font-bold uppercase">{t.match}</h3>
                </div>
                <div className="flex items-center gap-5">
                  <span className="text-2xl font-black font-mono">{t.price}</span>
                  <button
                    type="button"
                    onClick={() => onReserveTicket(`${t.match} (${t.zone})`)}
                    className="px-6 py-3 bg-[#6b0f26] hover:bg-[#881337] text-white font-['Oswald'] text-sm font-bold uppercase tracking-[0.16em] transition-colors"
                  >
                    Comprar Boleto
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/** DISEÑO 1: DIARIO DE LA CANCHA (Editorial desgastado, papel periódico envejecido, polaroids reales apiladas, papel rasgado) */
function DiarioCanchaView({
  onAddCart,
  onReserveTicket
}: {
  onAddCart: (name: string) => void;
  onReserveTicket: (label: string) => void;
}) {
  return (
    <div className="text-zinc-950">
      <section
        id="sec-equipo"
        className="relative min-h-screen w-full overflow-hidden flex items-center py-8 px-4 sm:px-8"
        style={{
          backgroundColor: "#e9e4d8",
          backgroundImage: `linear-gradient(rgba(236,232,222,0.28), rgba(226,220,206,0.34)), url("${BACKGROUNDS.diario}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        {/* Viñeta editorial y grano de imprenta real */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 110px rgba(0,0,0,0.35)" }}
        />

        {/* Manchas reales de tinta editorial */}
        <InkSplatter color="#09090b" className="absolute -bottom-8 -left-8 w-52 h-52 opacity-75" />
        <InkSplatter color="#6b0f26" className="absolute -top-6 right-4 w-44 h-44 opacity-30" />
        <InkSplatter color="#7c3aed" className="absolute bottom-6 right-1/3 w-28 h-28 opacity-20" />

        {/* Texto vertical lateral tipo imprenta */}
        <div className="hidden xl:block absolute right-3 top-1/2 -translate-y-1/2 rotate-90 origin-center font-mono text-[10px] font-bold tracking-[0.35em] text-zinc-600 uppercase">
          ARCHIVO DEPORTIVO • BOGOTÁ • VOL. IV
        </div>

        <div className="max-w-7xl mx-auto w-full space-y-5 relative z-10">
          {/* Cabecera tipo periódico deportivo */}
          <div className="border-t-4 border-b-2 border-zinc-950 py-2 flex flex-wrap items-center justify-between gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-zinc-900">
            <span>Abril 2026 • Edición Matchday</span>
            <span className="font-['Oswald'] text-base font-bold tracking-[0.28em]">SOUL VOLLEYBALL</span>
            <span className="text-[#6b0f26] font-black">#EstiloSoul</span>
          </div>

          {/* Título sólido tipografía editorial gigante */}
          <div className="text-center pt-1">
            <h1 className="font-['Anton'] text-5xl sm:text-7xl lg:text-[6.2rem] uppercase tracking-[0.02em] text-zinc-950 leading-[0.9]">
              SANGRE, SUDOR Y GLORIA
            </h1>
          </div>

          {/* Collage Polaroids Reales (izq) + Bloques Papel Rasgado (der) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-3">
            {/* 7 Cols: Polaroids apiladas con cinta de papel realista */}
            <div className="lg:col-span-7 relative min-h-[420px] sm:min-h-[460px] flex flex-wrap sm:block items-center justify-center gap-4">
              {/* Polaroid 1 */}
              <div className="sm:absolute sm:top-2 sm:left-2 w-60 sm:w-64 bg-[#faf8f2] p-3 pb-7 shadow-[0_18px_35px_rgba(0,0,0,0.38)] border border-zinc-300 -rotate-3 z-20">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-[#d6c59a]/80 border-x border-dashed border-zinc-500/40 -rotate-2 shadow-xs" />
                <div className="h-44 overflow-hidden bg-zinc-900">
                  <img src={PHOTOS.defense} alt="Defensa SOUL" className="w-full h-full object-cover contrast-110" />
                </div>
                <p className="mt-2 font-mono text-[11px] font-bold text-zinc-800 text-center uppercase tracking-wider">
                  Entrega en cada balón • Cancha 1
                </p>
              </div>

              {/* Polaroid 2 (Marco negro oscuro en contraste) */}
              <div className="sm:absolute sm:top-6 sm:right-4 w-56 sm:w-64 bg-zinc-950 p-3 pb-7 shadow-[0_20px_38px_rgba(0,0,0,0.45)] border-2 border-zinc-800 rotate-2 z-10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-18 h-5 bg-purple-700/80 rotate-2" />
                <div className="h-44 overflow-hidden">
                  <img src={PHOTOS.block} alt="Bloqueo SOUL" className="w-full h-full object-cover contrast-125" />
                </div>
                <p className="mt-2 font-mono text-[11px] font-bold text-purple-300 text-center uppercase tracking-wider">
                  Muro en la red • Selección
                </p>
              </div>

              {/* Polaroid 3 abajo centro-izq */}
              <div className="sm:absolute sm:bottom-0 sm:left-28 w-60 sm:w-64 bg-[#faf8f2] p-3 pb-7 shadow-[0_22px_40px_rgba(0,0,0,0.42)] border border-zinc-300 -rotate-2 z-30">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-[#d6c59a]/85 border-x border-dashed border-zinc-500/40 rotate-3" />
                <div className="h-40 overflow-hidden bg-zinc-900">
                  <img src={PHOTOS.spike} alt="Remate SOUL" className="w-full h-full object-cover contrast-115" />
                </div>
                <p className="mt-2 font-mono text-[11px] font-black text-[#6b0f26] text-center uppercase tracking-wider">
                  Remate imparable • #EstiloSoul
                </p>
              </div>

              {/* Polaroid 4 pequeña B/N abajo derecha */}
              <div className="sm:absolute sm:bottom-2 sm:right-6 w-52 bg-zinc-950 p-2.5 pb-5 shadow-[0_18px_32px_rgba(0,0,0,0.48)] rotate-3 z-20 hidden sm:block">
                <div className="absolute -top-2.5 left-6 w-14 h-5 bg-[#6b0f26]/85 -rotate-6" />
                <div className="h-32 overflow-hidden">
                  <img src={PHOTOS.serve} alt="Saque SOUL" className="w-full h-full object-cover grayscale contrast-125" />
                </div>
                <p className="mt-1.5 font-mono text-[10px] font-bold text-zinc-200 text-center uppercase">
                  Concentración Total
                </p>
              </div>
            </div>

            {/* 5 Cols: Bloques rasgados con sombra real via drop-shadow */}
            <div className="lg:col-span-5 space-y-6">
              <div style={{ filter: "drop-shadow(6px 8px 10px rgba(0,0,0,0.35))" }}>
                <div
                  className="bg-[#dfdad0] p-6 border-l-4 border-zinc-900"
                  style={{ clipPath: TORN_PAPER_CLIP }}
                >
                  <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2 mb-3.5">
                    <h2 className="font-['Anton'] text-3xl uppercase tracking-wide text-zinc-950">HORARIOS</h2>
                    <Calendar className="w-6 h-6 text-[#6b0f26]" />
                  </div>
                  <div className="space-y-2.5 font-mono text-xs">
                    {SHARED_SCHEDULES.map((s) => (
                      <div key={s.day} className="flex items-baseline justify-between gap-2 border-b border-dotted border-zinc-600 pb-1.5">
                        <div>
                          <span className="font-black text-zinc-950 block">{s.day}</span>
                          <span className="text-[10px] text-zinc-600 uppercase">{s.group}</span>
                        </div>
                        <span className="font-black text-[#6b0f26] text-sm">{s.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ filter: "drop-shadow(6px 8px 10px rgba(107,15,38,0.32))" }}>
                <div
                  className="bg-[#dcd6c8] p-6 border-l-4 border-[#6b0f26]"
                  style={{ clipPath: TORN_PAPER_CLIP }}
                >
                  <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2 mb-3.5">
                    <h2 className="font-['Anton'] text-3xl uppercase tracking-wide text-zinc-950">LISTA DE PRECIOS</h2>
                    <span className="px-2.5 py-0.5 bg-purple-700 text-white font-['Oswald'] text-xs font-bold tracking-widest uppercase">
                      2026
                    </span>
                  </div>
                  <div className="space-y-2 font-mono text-xs">
                    {SHARED_PRICES.map((p) => (
                      <div key={p.plan} className="flex items-baseline justify-between gap-2 border-b border-dotted border-zinc-600 pb-1.5">
                        <span className="font-bold text-zinc-900">{p.plan}</span>
                        <span className="font-black text-purple-800 text-sm">{p.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FullHeightClubSections theme="paper" onAddCart={onAddCart} onReserveTicket={onReserveTicket} />
    </div>
  );
}

/** DISEÑO 2: MÉTODO DE ENTRENADOR (Pizarra táctica oscura real, tiza blanca/morada, cinta morada, cuaderno espiral) */
function MetodoEntrenadorView({
  onAddCart,
  onReserveTicket
}: {
  onAddCart: (name: string) => void;
  onReserveTicket: (label: string) => void;
}) {
  return (
    <div className="text-white">
      <section
        id="sec-equipo"
        className="relative min-h-screen w-full overflow-hidden flex items-center py-8 px-4 sm:px-8"
        style={{
          backgroundColor: "#18181b",
          backgroundImage: `linear-gradient(rgba(12,12,15,0.68), rgba(12,12,15,0.78)), url("${BACKGROUNDS.entrenadorWall}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        {/* Tablero de Pizarra Táctica con textura real de tiza y polvo */}
        <div
          className="max-w-7xl mx-auto w-full rounded-xl p-5 sm:p-8 border-[8px] border-zinc-800/90 shadow-[0_30px_80px_rgba(0,0,0,0.95)] relative overflow-hidden"
          style={{
            backgroundColor: "#0c0f14",
            backgroundImage: `radial-gradient(circle at 50% 25%, rgba(124,58,237,0.14), transparent 55%), linear-gradient(rgba(9,11,16,0.36), rgba(9,11,16,0.48)), url("${BACKGROUNDS.entrenador}")`,
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        >
          {/* Diagrama Táctico de Cancha y Jugadas en Tiza Blanca y Morada */}
          <svg
            viewBox="0 0 1000 560"
            className="pointer-events-none absolute inset-0 w-full h-full opacity-55"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Contorno sutil de media cancha en tiza */}
            <rect x="275" y="55" width="450" height="450" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.5" strokeDasharray="10 8" />
            <line x1="275" y1="210" x2="725" y2="210" stroke="rgba(168,85,247,0.3)" strokeWidth="2.5" strokeDasharray="6 6" />
            {/* Trayectorias curvas blancas y moradas */}
            <path d="M 335 280 Q 430 130 585 155" stroke="#ffffff" strokeWidth="3.2" strokeDasharray="9 7" fill="none" />
            <path d="M 573 145 L 590 156 L 574 166" stroke="#ffffff" strokeWidth="3.2" fill="none" />
            <path d="M 365 340 Q 465 205 535 290" stroke="#a855f7" strokeWidth="3.5" fill="none" />
            <path d="M 522 288 L 538 293 L 534 277" stroke="#a855f7" strokeWidth="3.5" fill="none" />
            <path d="M 300 445 Q 420 435 495 452" stroke="#ffffff" strokeWidth="3" strokeDasharray="7 6" fill="none" />
            <path d="M 484 443 L 499 453 L 483 459" stroke="#ffffff" strokeWidth="3" fill="none" />
            <path d="M 555 215 Q 645 205 685 255" stroke="#9f1239" strokeWidth="3" strokeDasharray="6 5" fill="none" />
            {/* Marcas tácticas X y O */}
            <text x="352" y="200" fill="#ffffff" fontSize="30" fontFamily="monospace" fontWeight="bold">X</text>
            <text x="615" y="180" fill="#a855f7" fontSize="30" fontFamily="monospace" fontWeight="bold">O</text>
            <text x="452" y="265" fill="#ffffff" fontSize="26" fontFamily="monospace" fontWeight="bold">X</text>
            <circle cx="380" cy="340" r="12" stroke="#a855f7" strokeWidth="3" fill="none" />
            <circle cx="565" cy="340" r="12" stroke="#ffffff" strokeWidth="3" fill="none" />
            <text x="315" y="485" fill="#a855f7" fontSize="28" fontFamily="monospace" fontWeight="bold">X</text>
          </svg>

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Izquierda: 2 fotos reales sujetas con cinta morada y vinotinto */}
            <div className="lg:col-span-3 space-y-6 flex flex-col items-center">
              <div className="relative bg-white p-2.5 pb-4 shadow-[0_18px_32px_rgba(0,0,0,0.75)] -rotate-3 w-56 sm:w-60">
                <div className="absolute -top-3 -left-3 w-16 h-5 bg-[#6b0f26]/90 -rotate-45 shadow" />
                <div className="absolute -bottom-2 -right-3 w-14 h-5 bg-purple-600/90 -rotate-45 shadow" />
                <div className="h-36 overflow-hidden">
                  <img src={PHOTOS.defense} alt="Recepción táctica" className="w-full h-full object-cover" />
                </div>
                <p className="text-[11px] font-mono font-black text-zinc-900 mt-1.5 text-center uppercase">
                  Lectura Defensiva • Z-6
                </p>
              </div>

              <div className="relative bg-white p-2.5 pb-4 shadow-[0_18px_32px_rgba(0,0,0,0.75)] rotate-2 w-56 sm:w-60">
                <div className="absolute -bottom-2 -left-3 w-16 h-5 bg-purple-600/90 rotate-45 shadow" />
                <div className="h-36 overflow-hidden">
                  <img src={PHOTOS.serve} alt="Saque dirigido" className="w-full h-full object-cover" />
                </div>
                <p className="text-[11px] font-mono font-black text-purple-800 mt-1.5 text-center uppercase">
                  Saque Táctico Dirigido
                </p>
              </div>
            </div>

            {/* Centro: Títulos tipo tiza escrita + chips horarios */}
            <div className="lg:col-span-5 text-center space-y-6 py-4">
              <div className="inline-block px-3.5 py-1 rounded border border-purple-400/50 bg-purple-950/30 text-purple-300 font-mono text-xs font-bold tracking-[0.2em] uppercase">
                Pizarra Táctica • Sistema 5-1
              </div>

              <div>
                <h1
                  className="font-['Oswald'] text-4xl sm:text-6xl font-bold uppercase tracking-wider text-white leading-none"
                  style={{ textShadow: "0 0 14px rgba(255,255,255,0.32)" }}
                >
                  MÉTODO DE TRABAJO
                </h1>
                <div className="mx-auto mt-2 h-1 w-56 bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full" />
              </div>

              <div className="py-1 flex items-center justify-center gap-4 text-purple-300 font-mono text-sm font-black">
                <span>X → O</span>
                <span className="h-0.5 w-16 bg-white/40 border-b border-dashed border-white" />
                <span>TRANSICIÓN RÁPIDA</span>
              </div>

              <div>
                <h2
                  className="font-['Oswald'] text-3xl sm:text-5xl font-bold uppercase tracking-widest text-purple-200 leading-none"
                  style={{ textShadow: "0 0 12px rgba(168,85,247,0.48)" }}
                >
                  ENTRENAMIENTOS
                </h2>
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-2 font-mono text-xs">
                {SHARED_SCHEDULES.map((h) => (
                  <span
                    key={h.day}
                    className="px-3 py-1.5 rounded border border-dashed border-white/30 bg-white/5 text-zinc-100"
                  >
                    {h.day}: <strong className="text-purple-300">{h.time}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Derecha: Foto con cinta morada + 2 hojas de cuaderno rayadas con anillos */}
            <div className="lg:col-span-4 space-y-5">
              <div className="relative bg-white p-2.5 pb-4 shadow-[0_18px_32px_rgba(0,0,0,0.75)] rotate-3 max-w-[240px] mx-auto">
                <div className="absolute -top-3 -right-3 w-16 h-5 bg-purple-600/90 rotate-45 shadow" />
                <div className="h-32 overflow-hidden">
                  <img src={PHOTOS.spike} alt="Ataque zona 4" className="w-full h-full object-cover" />
                </div>
                <p className="text-[11px] font-mono font-black text-zinc-900 mt-1 text-center uppercase">
                  Ataque Diagonal Corto
                </p>
              </div>

              {/* Hoja de cuaderno rayada con perforaciones */}
              <div
                className="relative p-5 pl-8 rounded-sm shadow-[0_20px_40px_rgba(0,0,0,0.85)] text-zinc-900 -rotate-1"
                style={{
                  backgroundColor: "#faf8f2",
                  backgroundImage:
                    "linear-gradient(90deg, transparent 22px, #9f1239 23px, transparent 24px), repeating-linear-gradient(transparent 0px, transparent 26px, #cbd5e1 27px)"
                }}
              >
                {/* Perforaciones de cuaderno */}
                <div className="absolute left-2 top-5 bottom-5 flex flex-col justify-between">
                  {[0, 1, 2, 3, 4].map((dot) => (
                    <span key={dot} className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-600" />
                  ))}
                </div>

                <div className="flex items-center justify-between pb-1.5 mb-2 border-b-2 border-zinc-900">
                  <h3 className="font-['Oswald'] font-bold text-xl uppercase tracking-wide">TABLA DE PRECIOS</h3>
                  <ClipboardList className="w-4 h-4 text-purple-700" />
                </div>
                <div className="space-y-1 font-mono text-xs">
                  {SHARED_PRICES.map((item) => (
                    <div key={item.plan} className="flex justify-between gap-2 leading-[27px]">
                      <span className="font-bold">{item.plan}</span>
                      <span className="font-black text-[#6b0f26]">{item.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FullHeightClubSections theme="chalk" onAddCart={onAddCart} onReserveTicket={onReserveTicket} />
    </div>
  );
}

/** DISEÑO 3: ZONA DE BATALLA / COLLAGE CALLEJERO (Concreto con spray morado y vinotinto, bordes quemados, cartón) */
function ZonaBatallaView({
  onAddCart,
  onReserveTicket
}: {
  onAddCart: (name: string) => void;
  onReserveTicket: (label: string) => void;
}) {
  return (
    <div className="text-zinc-950">
      <section
        id="sec-equipo"
        className="relative min-h-screen w-full overflow-hidden flex items-center py-8 px-4 sm:px-8"
        style={{
          backgroundColor: "#c5c6ca",
          backgroundImage: `linear-gradient(rgba(218,219,224,0.22), rgba(188,190,196,0.26)), url("${BACKGROUNDS.batalla}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        {/* Viñeta de profundidad urbana */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 120px rgba(0,0,0,0.45)" }}
        />

        {/* Manchas y chorreados adicionales de spray morado y vinotinto */}
        <SpraySplatter color="#7c3aed" className="absolute -top-6 -left-6 w-64 h-72 opacity-80" />
        <SpraySplatter color="#6b0f26" className="absolute bottom-0 left-4 w-64 h-64 opacity-80" />
        <SpraySplatter color="#7c3aed" className="absolute top-0 -right-6 w-60 h-72 opacity-75" />
        <SpraySplatter color="#6b0f26" className="absolute -bottom-8 right-1/4 w-56 h-56 opacity-70" />

        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-7 items-center relative z-10">
          {/* Izquierda: 2 fotos reales con bordes quemados oscuros + cinta */}
          <div className="lg:col-span-4 space-y-5">
            <div style={{ filter: "drop-shadow(8px 12px 16px rgba(0,0,0,0.65))" }}>
              <div
                className="relative bg-zinc-950 p-2 -rotate-2 border-[5px] border-[#2e160d]"
                style={{ boxShadow: "inset 0 0 24px #000000" }}
              >
                <div className="absolute -top-3 left-6 w-18 h-5 bg-[#d6c297]/90 -rotate-12 shadow" />
                <div className="h-44 overflow-hidden relative">
                  <img src={PHOTOS.spike} alt="Ataque urbano SOUL" className="w-full h-full object-cover contrast-125" />
                  <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_28px_rgba(0,0,0,0.9)]" />
                </div>
              </div>
            </div>

            <div style={{ filter: "drop-shadow(8px 12px 16px rgba(0,0,0,0.65))" }}>
              <div className="relative bg-zinc-950 p-2 rotate-2 border-[5px] border-zinc-900 ml-3">
                <div className="absolute -bottom-3 right-6 w-16 h-5 bg-zinc-900/95 rotate-12 shadow" />
                <div className="h-40 overflow-hidden relative">
                  <img src={PHOTOS.block} alt="Bloqueo callejero SOUL" className="w-full h-full object-cover contrast-125" />
                  <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_28px_rgba(0,0,0,0.9)]" />
                </div>
              </div>
            </div>
          </div>

          {/* Centro: Título sólido de bloque + tabla recorte pegado */}
          <div className="lg:col-span-4 text-center space-y-6">
            <div className="space-y-2">
              <h1 className="font-['Anton'] text-5xl sm:text-7xl uppercase tracking-tight text-black leading-[0.88] drop-shadow-[2px_3px_0px_rgba(255,255,255,0.65)]">
                PASIÓN, SUDOR Y SANGRE
              </h1>
              <span className="inline-block px-4 py-1 bg-[#6b0f26] text-white font-['Oswald'] text-sm font-bold tracking-[0.22em] uppercase -rotate-2 shadow-lg">
                #ESTILOSOUL
              </span>
            </div>

            {/* Tabla collage con header vinotinto */}
            <div style={{ filter: "drop-shadow(7px 9px 0px #09090b)" }}>
              <div
                className="bg-[#f2efe7] border-2 border-zinc-950 overflow-hidden text-left -rotate-1"
                style={{ clipPath: TORN_PAPER_CLIP }}
              >
                <div className="grid grid-cols-3 bg-[#6b0f26] text-white font-['Oswald'] text-xs font-bold tracking-wider uppercase px-3 py-2">
                  <span>CATEGORÍA</span>
                  <span>HORARIO</span>
                  <span className="text-right">CUOTA</span>
                </div>
                <div className="divide-y divide-zinc-400 text-xs font-mono">
                  {SHARED_SCHEDULES.map((s, i) => (
                    <div key={s.day} className="grid grid-cols-3 px-3 py-2.5 font-bold">
                      <span className="truncate">{s.group.split("&")[0]}</span>
                      <span>{s.time.split("-")[0]}</span>
                      <span className="text-right text-purple-800 font-black">{SHARED_PRICES[i]?.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Derecha: Foto superior quemada + Bloque Cartón Corrugado "PRECIOS DE COMBATE" */}
          <div className="lg:col-span-4 space-y-5">
            <div style={{ filter: "drop-shadow(8px 12px 16px rgba(0,0,0,0.65))" }}>
              <div className="relative bg-zinc-950 p-2 rotate-2 border-[5px] border-[#2e160d]">
                <div className="absolute -top-3 right-8 w-16 h-5 bg-[#d6c297]/85 rotate-6 shadow" />
                <div className="h-36 overflow-hidden relative">
                  <img src={PHOTOS.defense} alt="Defensa combate" className="w-full h-full object-cover contrast-125" />
                  <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_26px_rgba(0,0,0,0.9)]" />
                </div>
              </div>
            </div>

            {/* Cartón corrugado con textura de estrías */}
            <div style={{ filter: "drop-shadow(8px 10px 0px #7c3aed)" }}>
              <div
                className="relative p-5 border-2 border-zinc-950"
                style={{
                  clipPath: TORN_PAPER_CLIP,
                  backgroundColor: "#c7ab7c",
                  backgroundImage:
                    "repeating-linear-gradient(0deg, rgba(0,0,0,0.045) 0px, rgba(0,0,0,0.045) 2px, transparent 2px, transparent 6px)"
                }}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#e6d5a9]/85 border border-zinc-600/40" />
                <h2 className="font-['Anton'] text-3xl uppercase text-center text-zinc-950 tracking-wide border-b-2 border-zinc-950 pb-2 mb-3">
                  PRECIOS DE COMBATE
                </h2>
                <div className="space-y-2 text-xs font-mono mb-4">
                  {SHARED_PRICES.map((p) => (
                    <div key={p.plan} className="flex justify-between border-b border-zinc-800/40 pb-1 font-bold">
                      <span>{p.plan}</span>
                      <span className="text-[#6b0f26] font-black text-sm">{p.price}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onReserveTicket("Inscripción Zona de Batalla")}
                  className="w-full py-3 bg-[#6b0f26] hover:bg-purple-700 text-white font-['Oswald'] text-sm font-bold uppercase tracking-[0.2em] transition-colors shadow-md"
                >
                  INSCRÍBETE YA
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FullHeightClubSections theme="concrete" onAddCart={onAddCart} onReserveTicket={onReserveTicket} />
    </div>
  );
}

/** DISEÑO 4: ZONA DE COMBATE / GRUNGE MILITAR (Metal oxidado remachado, malla eslabonada, manchas vinotinto, stencil, fotos B/N) */
function ZonaCombateView({
  onAddCart,
  onReserveTicket
}: {
  onAddCart: (name: string) => void;
  onReserveTicket: (label: string) => void;
}) {
  return (
    <div className="text-white">
      <section
        id="sec-equipo"
        className="relative min-h-screen w-full overflow-hidden flex items-center py-8 px-4 sm:px-8"
        style={{
          backgroundColor: "#0a0a0c",
          backgroundImage: `radial-gradient(circle at 52% 45%, rgba(0,0,0,0.28), rgba(0,0,0,0.72)), url("${BACKGROUNDS.combate}")`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        {/* Malla metálica eslabonada sutil sobre textura industrial */}
        <svg className="pointer-events-none absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="military-chainlink" width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M 0 13 L 13 0 L 26 13 L 13 26 Z" fill="none" stroke="#a1a1aa" strokeWidth="1.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#military-chainlink)" />
        </svg>

        {/* Junta vertical de chapa remachada al 39% */}
        <div className="hidden lg:flex flex-col justify-between py-6 items-center pointer-events-none absolute top-0 bottom-0 left-[39%] w-3 bg-gradient-to-r from-black/90 via-zinc-700/50 to-black/90 border-x border-zinc-800/80 z-0">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
            <span key={r} className="w-2 h-2 rounded-full bg-zinc-500 border border-black" />
          ))}
        </div>

        {/* Manchas vinotinto intensas en el metal */}
        <InkSplatter color="#7f1d1d" className="absolute -bottom-6 -left-6 w-56 h-56 opacity-85" />
        <InkSplatter color="#6b0f26" className="absolute top-12 left-1/3 w-48 h-48 opacity-55" />
        <InkSplatter color="#7f1d1d" className="absolute -bottom-8 -right-6 w-64 h-64 opacity-80" />

        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-7 items-center relative z-10">
          {/* Izquierda: 2 fotos B/N alto contraste con marcos desgastados */}
          <div className="lg:col-span-4 space-y-5">
            <div className="relative bg-zinc-300 p-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.9)] -rotate-3 border-2 border-zinc-500">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-18 h-5 bg-zinc-900 shadow" />
              <div className="h-44 overflow-hidden bg-black">
                <img
                  src={PHOTOS.defense}
                  alt="Combate defensivo B/N"
                  className="w-full h-full object-cover grayscale contrast-150 brightness-95"
                />
              </div>
            </div>

            <div className="relative bg-zinc-300 p-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.9)] rotate-2 border-2 border-zinc-500 ml-5">
              <div className="h-38 h-40 overflow-hidden bg-black">
                <img
                  src={PHOTOS.block}
                  alt="Bloqueo B/N"
                  className="w-full h-full object-cover grayscale contrast-150 brightness-95"
                />
              </div>
            </div>
          </div>

          {/* Centro: Título tipo STENCIL + bloques de papel pintado sobre metal */}
          <div className="lg:col-span-5 text-center space-y-6">
            <div className="space-y-3">
              <h1
                className="font-['Anton'] text-5xl sm:text-6xl lg:text-[4.25rem] uppercase tracking-[0.08em] text-zinc-100 leading-[0.94]"
                style={{
                  textShadow: "4px 4px 0px #000000",
                  WebkitMaskImage:
                    "repeating-linear-gradient(90deg, #000 0px, #000 38px, rgba(0,0,0,0.82) 39px, #000 41px)"
                }}
              >
                SANGRE, SUDOR Y VICTORIA
              </h1>
              <span className="inline-flex items-center gap-2 px-5 py-1.5 bg-[#6b0f26] border border-[#9f1239] text-white font-['Oswald'] text-xs font-bold tracking-[0.26em] uppercase shadow-lg">
                <Flame className="w-3.5 h-3.5" /> #ESTILO CLUB VOLLEYBALL
              </span>
            </div>

            {/* Bloques de precios y horarios tipo papel pintado rasgado sobre chapa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left text-zinc-950">
              <div style={{ filter: "drop-shadow(6px 8px 14px rgba(0,0,0,0.85))" }}>
                <div
                  className="relative bg-[#e6e2d8] p-5 border-2 border-zinc-950"
                  style={{ clipPath: TORN_PAPER_CLIP }}
                >
                  <p className="font-['Oswald'] font-bold text-sm uppercase tracking-wider text-zinc-900">
                    PRECIO OFICIAL
                  </p>
                  <p className="font-['Anton'] text-3xl text-[#6b0f26] tracking-wide mt-0.5">$95.000</p>
                  <p className="text-[11px] font-mono font-bold text-zinc-700">Plan Alfa • 8 sesiones</p>
                  <div className="border-t-2 border-zinc-900/25 mt-2.5 pt-2 flex justify-between items-baseline font-mono text-xs font-black">
                    <span>PLAN ÉLITE</span>
                    <span className="text-purple-800 text-sm">$120.000</span>
                  </div>
                  {/* Marcas de garra decorativas */}
                  <svg viewBox="0 0 60 30" className="absolute bottom-1 right-2 w-12 h-6 opacity-50">
                    <path d="M8,26 L28,4 M20,28 L40,6 M32,26 L52,8" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              <div style={{ filter: "drop-shadow(6px 8px 14px rgba(0,0,0,0.85))" }}>
                <div
                  className="bg-[#e6e2d8] p-5 border-2 border-zinc-950"
                  style={{ clipPath: TORN_PAPER_CLIP }}
                >
                  <p className="font-['Anton'] text-2xl uppercase tracking-wide border-b-2 border-zinc-900 pb-1 text-zinc-950">
                    HORARIOS
                  </p>
                  <div className="space-y-1.5 mt-2.5 font-mono text-xs font-black">
                    {SHARED_SCHEDULES.map((s) => (
                      <div key={s.day} className="flex justify-between gap-1">
                        <span className="truncate">{s.day.slice(0, 9)}</span>
                        <span className="text-[#6b0f26] shrink-0">{s.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Derecha: Foto B/N vertical de atleta con marco desgastado */}
          <div className="lg:col-span-3 flex justify-center">
            <div className="relative bg-zinc-300 p-2.5 pb-6 shadow-[0_22px_45px_rgba(0,0,0,0.92)] rotate-3 border-2 border-zinc-500 w-60">
              <div className="absolute -top-3 right-6 w-14 h-5 bg-zinc-950 shadow" />
              <div className="h-64 overflow-hidden bg-black">
                <img
                  src={PHOTOS.serve}
                  alt="Atleta SOUL B/N"
                  className="w-full h-full object-cover grayscale contrast-150 brightness-95"
                />
              </div>
              <p className="mt-2 font-mono text-[11px] font-black text-zinc-900 text-center uppercase tracking-wider">
                Unidad Competitiva SOUL
              </p>
            </div>
          </div>
        </div>
      </section>

      <FullHeightClubSections theme="military" onAddCart={onAddCart} onReserveTicket={onReserveTicket} />
    </div>
  );
}

/** APLICACIÓN PRINCIPAL DEL CATÁLOGO (Todo en un solo archivo) */
export default function CatalogoDisenosSoul() {
  const [selectedDesign, setSelectedDesign] = useState<DesignId | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>("equipo");
  const [modalMode, setModalMode] = useState<"socios" | "entradas" | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const handleNavigateSection = (sec: NavSection) => {
    setActiveSection(sec);
    const el = document.getElementById(`sec-${sec}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // VISTA A PANTALLA COMPLETA DEL DISEÑO SELECCIONADO
  if (selectedDesign) {
    return (
      <div className="min-h-screen w-full bg-black relative">
        <SvgTextureDefs />
        <UniversalNavbar
          activeSection={activeSection}
          onSelectSection={handleNavigateSection}
          onOpenSocios={() => setModalMode("socios")}
          onOpenEntradas={() => setModalMode("entradas")}
        />

        {/* Botón flotante para volver al Catálogo */}
        <button
          type="button"
          onClick={() => {
            setSelectedDesign(null);
            setActiveSection("equipo");
            setModalMode(null);
          }}
          className="fixed bottom-5 right-5 z-50 px-5 py-3 rounded-full bg-black/95 hover:bg-purple-700 text-white border-2 border-purple-400 shadow-[0_12px_32px_rgba(0,0,0,0.85)] flex items-center gap-2 font-['Oswald'] text-xs font-bold uppercase tracking-[0.18em] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Catálogo</span>
        </button>

        {selectedDesign === "diario" && (
          <DiarioCanchaView
            onAddCart={(name) => showToast(`Agregado al carrito: ${name}`)}
            onReserveTicket={(label) => showToast(`Pre-reserva seleccionada: ${label}`)}
          />
        )}
        {selectedDesign === "entrenador" && (
          <MetodoEntrenadorView
            onAddCart={(name) => showToast(`Agregado al carrito: ${name}`)}
            onReserveTicket={(label) => showToast(`Pre-reserva seleccionada: ${label}`)}
          />
        )}
        {selectedDesign === "batalla" && (
          <ZonaBatallaView
            onAddCart={(name) => showToast(`Agregado al carrito: ${name}`)}
            onReserveTicket={(label) => showToast(`Pre-reserva seleccionada: ${label}`)}
          />
        )}
        {selectedDesign === "combate" && (
          <ZonaCombateView
            onAddCart={(name) => showToast(`Agregado al carrito: ${name}`)}
            onReserveTicket={(label) => showToast(`Pre-reserva seleccionada: ${label}`)}
          />
        )}

        {/* Toast interactivo */}
        {feedbackToast && (
          <div className="fixed bottom-5 left-5 z-50 px-4 py-3 rounded-xl bg-zinc-950 border border-purple-500 text-white text-xs font-bold flex items-center gap-2 shadow-2xl">
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            <span>{feedbackToast}</span>
          </div>
        )}

        {/* Modal funcional para SOCIOS / ENTRADAS */}
        {modalMode && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-950 border-2 border-purple-500/60 rounded-2xl p-6 text-white space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-['Oswald'] text-xl font-bold uppercase flex items-center gap-2 tracking-wide">
                  {modalMode === "socios" ? (
                    <>
                      <Shield className="w-5 h-5 text-[#9f1239]" /> Portal Socios SOUL
                    </>
                  ) : (
                    <>
                      <Ticket className="w-5 h-5 text-purple-400" /> Taquilla & Entradas
                    </>
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {modalMode === "socios"
                  ? "Acceso exclusivo para deportistas afiliados y miembros del Club SOUL: consulta de estado de cuenta, calendario de entrenamientos y beneficios."
                  : "Selecciona tu localidad para los partidos oficiales en casa o solicita tu pase de clase de prueba."}
              </p>
              <div className="space-y-2 text-xs">
                {(modalMode === "socios"
                  ? SHARED_PRICES
                  : SHARED_TICKETS.map((t) => ({ plan: `${t.match} (${t.zone})`, price: t.price }))
                ).map((row) => (
                  <div
                    key={row.plan}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-800"
                  >
                    <span className="font-semibold">{row.plan}</span>
                    <span className="font-mono font-black text-purple-400">{row.price}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  showToast(
                    modalMode === "socios"
                      ? "Solicitud de acceso Socios registrada (demo catálogo)"
                      : "Entrada reservada correctamente (demo catálogo)"
                  );
                  setModalMode(null);
                }}
                className={`w-full py-3 rounded-xl font-['Oswald'] text-sm font-bold uppercase tracking-[0.16em] text-white ${
                  modalMode === "socios"
                    ? "bg-[#6b0f26] hover:bg-[#881337]"
                    : "bg-purple-700 hover:bg-purple-600"
                }`}
              >
                {modalMode === "socios" ? "Ingresar como Socio" : "Confirmar Reserva"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PANTALLA INICIAL: CATÁLOGO DE DISEÑOS (4 TARJETAS CON FOTOGRAFÍA REAL Y PORTADA TEXTURIZADA)
  return (
    <div
      className="min-h-screen w-full text-white py-10 px-4 sm:px-8 relative overflow-hidden"
      style={{
        backgroundColor: "#070709",
        backgroundImage:
          "radial-gradient(circle at 20% 0%, rgba(124,58,237,0.22) 0%, transparent 45%), radial-gradient(circle at 85% 95%, rgba(107,15,38,0.28) 0%, transparent 48%), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 80px)"
      }}
    >
      <SvgTextureDefs />
      <div className="max-w-6xl mx-auto space-y-10 relative z-10">
        {/* Encabezado del Catálogo */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-700/20 border border-purple-500/40 text-purple-300 text-xs font-black uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" /> Catálogo Exclusivo de Propuestas • SOUL VOLEY
          </div>
          <h1 className="font-['Anton'] text-4xl sm:text-6xl uppercase tracking-wide text-white leading-none">
            CATÁLOGO DE{" "}
            <span className="bg-gradient-to-r from-purple-400 via-white to-[#9f1239] bg-clip-text text-transparent">
              DISEÑOS
            </span>
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl mx-auto">
            Apartado independiente de exhibición visual. Selecciona cualquiera de las 4 propuestas para inspeccionar su versión completa e interactiva a pantalla completa.
          </p>
        </header>

        {/* Grid de 4 Tarjetas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
          {DESIGNS.map((design) => (
            <button
              key={design.id}
              type="button"
              onClick={() => {
                setSelectedDesign(design.id);
                setActiveSection("equipo");
              }}
              className="group text-left rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-purple-500 transition-all overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.65)] flex flex-col"
            >
              {/* Portada visual real con textura propia del diseño + foto deportiva */}
              <div
                className={`h-56 w-full ${design.surfacePreviewClass} p-5 flex flex-col justify-between relative overflow-hidden`}
                style={{
                  backgroundImage: `url("${design.bgTexture}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              >
                <div
                  className={`pointer-events-none absolute inset-0 ${
                    design.id === "diario" || design.id === "batalla"
                      ? "bg-gradient-to-r from-white/55 via-white/25 to-transparent"
                      : "bg-gradient-to-r from-black/75 via-black/45 to-transparent"
                  }`}
                />
                {/* Foto de fondo integrada con mezcla editorial */}
                <img
                  src={design.coverPhoto}
                  alt={design.name}
                  className={`absolute right-0 top-0 h-full w-3/5 object-cover transition-transform duration-500 group-hover:scale-105 ${
                    design.bwCover ? "grayscale contrast-150" : "contrast-115"
                  }`}
                  style={{
                    maskImage: "linear-gradient(to left, rgba(0,0,0,0.92) 35%, transparent 100%)",
                    WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.92) 35%, transparent 100%)"
                  }}
                />
                {design.id === "batalla" && (
                  <SpraySplatter color="#7c3aed" className="absolute -bottom-8 -left-6 w-36 h-40 opacity-75" />
                )}
                {design.id === "combate" && (
                  <InkSplatter color="#7f1d1d" className="absolute -bottom-6 -left-6 w-36 h-36 opacity-80" />
                )}

                <div className="relative z-10 flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-black text-white font-mono text-[11px] font-black tracking-wider">
                    PROPUESTA {design.number}
                  </span>
                  <span className="px-2.5 py-1 bg-black/80 text-white text-[10px] font-bold uppercase tracking-wider border border-white/15">
                    {design.styleTag}
                  </span>
                </div>

                <div className="relative z-10 max-w-[75%]">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] opacity-85">
                    {design.subtitle}
                  </p>
                  <h2 className="font-['Anton'] text-3xl sm:text-4xl uppercase tracking-tight leading-[0.92] mt-1">
                    {design.headline}
                  </h2>
                </div>
              </div>

              {/* Cuerpo de tarjeta */}
              <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4 bg-zinc-950 border-t border-zinc-800">
                <div className="space-y-1.5">
                  <h3 className="font-['Oswald'] text-xl font-bold uppercase tracking-wide text-white group-hover:text-purple-300 transition-colors">
                    {design.name}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{design.description}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-black border border-zinc-600" />
                    <span className="w-3 h-3 rounded-full bg-white" />
                    <span className="w-3 h-3 rounded-full bg-purple-600" />
                    <span className="w-3 h-3 rounded-full bg-[#6b0f26]" />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md ${design.accentBg} text-white font-['Oswald'] text-xs font-bold uppercase tracking-[0.16em] group-hover:brightness-110 transition-all`}
                  >
                    Ver Diseño Completo <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
