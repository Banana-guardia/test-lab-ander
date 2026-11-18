import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

export const initialAthletes = [
  { id: "DVnGOXAzGKw6b9dZSdO9", name: "Andi Rojas", documento: "1093496820", age: 21, category: "Mayores", group: "Formativo Mañana", status: "Activo", phone: "3213248713", email: "andirojas0821@gmail.com", plan: "Plan Básico", financialStatus: "Al día", lastPaymentDate: "28 de oct de 2026", lastPaymentReference: "TX-SOUL-001" },
  { id: "WV5q6R9yc200hwJFGUdJ", name: "Angelica Maria Guzman Ramirez", documento: "1098765123", age: 17, category: "Juvenil", group: "Selección A", status: "Activo", phone: "3103079979", email: "angelica.guzman@gmail.com", plan: "Plan Básico", financialStatus: "En mora" },
  { name: "Carlos Ramírez", documento: "1023456789", age: 16, category: "Juvenil", group: "Selección A", status: "Activo", phone: "3101234567", email: "carlos.ramirez@gmail.com", plan: "Plan Alfa", financialStatus: "Al día", lastPaymentDate: "05 Oct 2026", lastPaymentReference: "TX-001" },
  { name: "Sofía Martínez", documento: "1098765432", age: 14, category: "Infantil", group: "Formativo Tarde", status: "Inactivo", phone: "3119876543", email: "sofia.m@gmail.com", plan: "Plan Básico", financialStatus: "En mora" },
  { name: "Diego Gómez", documento: "1014567890", age: 18, category: "Mayores", group: "Selección B", status: "Activo", phone: "3154567890", email: "diego.gomez@hotmail.com", plan: "Plan Beta", financialStatus: "Al día", lastPaymentDate: "10 Oct 2026", lastPaymentReference: "TX-005" },
  { name: "Valentina Torres", documento: "1032654987", age: 15, category: "Pre-Juvenil", group: "Formativo Mañana", status: "Activo", phone: "3206549871", email: "valen.torres@gmail.com", plan: "Plan Family", financialStatus: "Pago parcial", lastPaymentDate: "04 Oct 2026", lastPaymentReference: "TX-002" },
  { name: "Andrés Silva", documento: "1019876543", age: 17, category: "Juvenil", group: "Selección A", status: "Activo", phone: "3145678901", email: "andres.silva@outlook.com", plan: "Plan Plus", financialStatus: "Al día" },
  { name: "Mariana Restrepo", documento: "1028765432", age: 15, category: "Juvenil", group: "Formativo Mañana", status: "Activo", phone: "3124567890", email: "mariana.restrepo@gmail.com", plan: "Plan Básico", financialStatus: "Al día", lastPaymentDate: "03 Oct 2026", lastPaymentReference: "TX-006" },
  { name: "Juan Pablo Castaño", documento: "1017894561", age: 17, category: "Juvenil", group: "Selección A", status: "Activo", phone: "3139871234", email: "juanp.castano@gmail.com", plan: "Plan Alfa", financialStatus: "Al día", lastPaymentDate: "05 Oct 2026", lastPaymentReference: "TX-007" },
  { name: "Camila Andrea Vargas", documento: "1034567812", age: 14, category: "Infantil", group: "Formativo Tarde", status: "Activo", phone: "3187654321", email: "camila.vargas@outlook.com", plan: "Plan Básico", financialStatus: "En mora" },
  { name: "Santiago Mendoza", documento: "1021987654", age: 18, category: "Mayores", group: "Selección B", status: "Activo", phone: "3156781234", email: "santiago.mendoza@hotmail.com", plan: "Plan Beta", financialStatus: "Al día", lastPaymentDate: "08 Oct 2026", lastPaymentReference: "TX-008" },
  { name: "Isabella Morales", documento: "1012345678", age: 16, category: "Pre-Juvenil", group: "Formativo Mañana", status: "Activo", phone: "3214569870", email: "isabella.morales@gmail.com", plan: "Plan Plus", financialStatus: "Al día", lastPaymentDate: "02 Oct 2026", lastPaymentReference: "TX-009" },
  { name: "Mateo Hernández", documento: "1035678901", age: 15, category: "Juvenil", group: "Formativo Tarde", status: "Activo", phone: "3103456789", email: "mateo.hernandez@gmail.com", plan: "Plan Básico", financialStatus: "Al día", lastPaymentDate: "05 Oct 2026", lastPaymentReference: "TX-010" },
  { name: "Gabriela Rincón", documento: "1024567891", age: 16, category: "Juvenil", group: "Selección A", status: "Activo", phone: "3176543210", email: "gaby.rincon@gmail.com", plan: "Plan Family", financialStatus: "Al día", lastPaymentDate: "04 Oct 2026", lastPaymentReference: "TX-011" },
  { name: "Sebastián Quintero", documento: "1016789012", age: 17, category: "Mayores", group: "Selección B", status: "Activo", phone: "3198765432", email: "sebastian.quintero@hotmail.com", plan: "Plan Alfa", financialStatus: "Pago parcial", lastPaymentDate: "01 Oct 2026", lastPaymentReference: "TX-012" },
  { name: "Lucía Fernández", documento: "1025678912", age: 13, category: "Infantil", group: "Formativo Mañana", status: "Activo", phone: "3165432109", email: "lucia.fernandez@gmail.com", plan: "Plan Básico", financialStatus: "En mora" },
  { name: "Samuel David Ospina", documento: "1013456789", age: 19, category: "Mayores", group: "Selección A", status: "Activo", phone: "3129876543", email: "samuel.ospina@gmail.com", plan: "Plan Beta", financialStatus: "Al día", lastPaymentDate: "06 Oct 2026", lastPaymentReference: "TX-013" },
  { name: "Valeria Duarte", documento: "1031245678", age: 14, category: "Pre-Juvenil", group: "Formativo Tarde", status: "Activo", phone: "3143210987", email: "valeria.duarte@gmail.com", plan: "Plan Básico", financialStatus: "Al día", lastPaymentDate: "05 Oct 2026", lastPaymentReference: "TX-014" },
  { name: "Nicolás Bermúdez", documento: "1026789123", age: 16, category: "Juvenil", group: "Selección B", status: "Activo", phone: "3118765432", email: "nicolas.bermudez@gmail.com", plan: "Plan Alfa", financialStatus: "Al día", lastPaymentDate: "05 Oct 2026", lastPaymentReference: "TX-015" }
];

export const initialGroups = [
  { name: "Selección A", category: "Juvenil", coach: "Juan Pérez", location: "Sede Norte", schedule: "Lun-Mié-Vie 18:00", athletes: 15 },
  { name: "Formativo Tarde", category: "Infantil", coach: "María González", location: "Sede Sur", schedule: "Mar-Jue 16:00", athletes: 22 },
  { name: "Selección B", category: "Mayores", coach: "Carlos Díaz", location: "Sede Central", schedule: "Lun-Mié 20:00", athletes: 12 },
  { name: "Formativo Mañana", category: "Pre-Juvenil", coach: "Ana López", location: "Sede Norte", schedule: "Sáb-Dom 08:00", athletes: 18 },
];

export const initialCoaches = [
  { name: "Juan Pérez", role: "Entrenador Principal", email: "juan.perez@soul.com", phone: "+57 300 123 4567", groups: ["Selección A", "Juvenil Especial"] },
  { name: "María González", role: "Entrenadora Asistente", email: "maria.g@soul.com", phone: "+57 310 987 6543", groups: ["Formativo Tarde"] },
  { name: "Carlos Díaz", role: "Entrenador", email: "carlos.diaz@soul.com", phone: "+57 320 555 1234", groups: ["Selección B"] },
  { name: "Ana López", role: "Preparadora Física", email: "ana.lopez@soul.com", phone: "+57 315 777 8888", groups: ["Formativo Mañana"] },
];

export const initialFinances = [
  { id: "fin-001", txCode: "TX-SOUL-001", date: "28 Oct 2026", athlete: "Andi Rojas", athleteId: "DVnGOXAzGKw6b9dZSdO9", type: "income", amount: 95000, status: "completed", concept: "Mensualidad - Plan Básico", paymentMethod: "Nequi / Wompi" },
  { id: "fin-002", txCode: "TX-001", date: "05 Oct 2026", athlete: "Carlos Ramírez", type: "income", amount: 130000, status: "completed", concept: "Mensualidad - Plan Alfa (Pronto Pago)", paymentMethod: "Nequi / Wompi" },
  { id: "fin-003", txCode: "TX-002", date: "04 Oct 2026", athlete: "Valentina Torres", type: "income", amount: 60000, status: "completed", concept: "Abono Mensualidad - Plan Family", paymentMethod: "Transferencia" },
  { id: "fin-004", txCode: "TX-003", date: "01 Oct 2026", athlete: "Club SOUL", type: "expense", amount: 450000, status: "completed", concept: "Alquiler Canchas Sede Norte", paymentMethod: "Transferencia Bancaria" },
  { id: "fin-005", txCode: "TX-004", date: "28 Sep 2026", athlete: "Sofía Martínez", type: "income", amount: 110000, status: "pending", concept: "Mensualidad Septiembre - Plan Básico", paymentMethod: "Pendiente" },
  { id: "fin-006", txCode: "TX-005", date: "10 Oct 2026", athlete: "Diego Gómez", type: "income", amount: 180000, status: "completed", concept: "Mensualidad - Plan Beta", paymentMethod: "Nequi / Wompi" },
  { id: "fin-007", txCode: "TX-006", date: "03 Oct 2026", athlete: "Mariana Restrepo", type: "income", amount: 95000, status: "completed", concept: "Mensualidad - Plan Básico (Pronto Pago)", paymentMethod: "Nequi / Wompi" },
  { id: "fin-008", txCode: "TX-007", date: "05 Oct 2026", athlete: "Juan Pablo Castaño", type: "income", amount: 130000, status: "completed", concept: "Mensualidad - Plan Alfa (Pronto Pago)", paymentMethod: "Efectivo / Transferencia" },
  { id: "fin-009", txCode: "TX-008", date: "08 Oct 2026", athlete: "Santiago Mendoza", type: "income", amount: 180000, status: "completed", concept: "Mensualidad - Plan Beta", paymentMethod: "Nequi / Wompi" },
  { id: "fin-010", txCode: "TX-009", date: "02 Oct 2026", athlete: "Isabella Morales", type: "income", amount: 170000, status: "completed", concept: "Mensualidad - Plan Plus (Pronto Pago)", paymentMethod: "Nequi / Wompi" },
  { id: "fin-011", txCode: "TX-010", date: "05 Oct 2026", athlete: "Mateo Hernández", type: "income", amount: 95000, status: "completed", concept: "Mensualidad - Plan Básico (Pronto Pago)", paymentMethod: "Efectivo" },
  { id: "fin-012", txCode: "TX-011", date: "04 Oct 2026", athlete: "Gabriela Rincón", type: "income", amount: 80000, status: "completed", concept: "Mensualidad - Plan Family (Pronto Pago)", paymentMethod: "Nequi / Wompi" },
  { id: "fin-013", txCode: "TX-012", date: "01 Oct 2026", athlete: "Sebastián Quintero", type: "income", amount: 75000, status: "completed", concept: "Abono Parcial - Plan Alfa", paymentMethod: "Nequi / Wompi" },
  { id: "fin-014", txCode: "TX-013", date: "06 Oct 2026", athlete: "Samuel David Ospina", type: "income", amount: 180000, status: "completed", concept: "Mensualidad - Plan Beta", paymentMethod: "Transferencia" },
  { id: "fin-015", txCode: "TX-014", date: "05 Oct 2026", athlete: "Valeria Duarte", type: "income", amount: 95000, status: "completed", concept: "Mensualidad - Plan Básico (Pronto Pago)", paymentMethod: "Nequi / Wompi" },
  { id: "fin-016", txCode: "TX-015", date: "05 Oct 2026", athlete: "Nicolás Bermúdez", type: "income", amount: 130000, status: "completed", concept: "Mensualidad - Plan Alfa (Pronto Pago)", paymentMethod: "Nequi / Wompi" },
  { id: "fin-017", txCode: "TX-EXP-02", date: "12 Oct 2026", athlete: "Cuerpo Técnico SOUL", type: "expense", amount: 320000, status: "completed", concept: "Dotación de Balones e Implementos", paymentMethod: "Transferencia Bancaria" }
];

export const initialInventory = [
  { name: "Balones Molten V5M5000 (Oficial Liga)", category: "Balones", quantity: 18, minQuantity: 6, condition: "Excelente", location: "Sede Central", unitValue: 320000, notes: "Balones profesionales para competencias oficiales y Selección A." },
  { name: "Balones Mikasa V200W (FIVB)", category: "Balones", quantity: 12, minQuantity: 5, condition: "Bueno", location: "Sede Norte", unitValue: 350000, notes: "Balones para entrenamiento táctico y saques con flotabilidad." },
  { name: "Balones de Iniciación Molten Soft", category: "Balones", quantity: 24, minQuantity: 8, condition: "Excelente", location: "Sede Norte", unitValue: 140000, notes: "Uso exclusivo en escuelas formativas de 0 a 6 meses." },
  { name: "Red Profesional con Varillas y Tensores", category: "Equipamiento de Cancha", quantity: 3, minQuantity: 2, condition: "Bueno", location: "Bodega Coliseo", unitValue: 550000, notes: "Red oficial con banda superior de 7cm y varillas de delimitación." },
  { name: "Juego de Petos de Entrenamiento (Set x40)", category: "Indumentaria & Uniformes", quantity: 40, minQuantity: 15, condition: "Excelente", location: "Sede Norte", unitValue: 25000, notes: "20 petos color azul rey y 20 naranja flúor numerados." },
  { name: "Uniformes Oficiales de Competencia 2026", category: "Indumentaria & Uniformes", quantity: 28, minQuantity: 10, condition: "Excelente", location: "Bodega Central", unitValue: 110000, notes: "Juegos titulares de juego para torneos distritales y departamentales." },
  { name: "Carros Portabalones Plegables con Ruedas", category: "Equipamiento de Cancha", quantity: 3, minQuantity: 2, condition: "Bueno", location: "Sede Central", unitValue: 280000, notes: "Capacidad para 24 balones c/u con estructura de aluminio." },
  { name: "Escaleras de Coordinación y Agilidad 6m", category: "Entrenamiento Físico", quantity: 6, minQuantity: 2, condition: "Bueno", location: "Sede Norte", unitValue: 65000, notes: "Peldaños ajustables para ejercicios de juego de pies y velocidad." },
  { name: "Bandas de Resistencia Elásticas (Set x5)", category: "Entrenamiento Físico", quantity: 15, minQuantity: 5, condition: "Excelente", location: "Sede Norte", unitValue: 45000, notes: "Diferentes tensiones para fortalecimiento de hombros y tren inferior." },
  { name: "Botiquín de Primeros Auxilios con Cold Packs", category: "Médico & Arbitraje", quantity: 2, minQuantity: 2, condition: "Excelente", location: "Enfermería Sede Central", unitValue: 180000, notes: "Equipado con vendas elásticas, compresas frías, antisépticos y férulas." },
  { name: "Pizarras Tácticas Magnéticas para Entrenador", category: "Médico & Arbitraje", quantity: 4, minQuantity: 2, condition: "Excelente", location: "Sede Central", unitValue: 85000, notes: "Con fichas magnéticas numeradas y marcador borrable." },
  { name: "Conos de Delimitación y Tráfico 30cm", category: "Entrenamiento Físico", quantity: 30, minQuantity: 10, condition: "Bueno", location: "Sede Norte", unitValue: 12000, notes: "Conos plásticos flexibles de alta visibilidad." }
];

export async function seedInitialDataIfEmpty(force = false) {
  try {
    // Si ya se realizó la siembra inicial y no es forzada, no volver a sembrar para respetar borrados
    if (!force && localStorage.getItem("soul_seed_completed") === "true") {
      return;
    }

    // 1. Check Athletes
    const athletesSnap = await getDocs(collection(db, "athletes"));
    if (athletesSnap.empty || force) {
      for (const item of initialAthletes) {
        await addDoc(collection(db, "athletes"), {
          ...item,
          createdAt: serverTimestamp(),
        });
      }
    }

    // 2. Check Groups
    const groupsSnap = await getDocs(collection(db, "groups"));
    if (groupsSnap.empty || force) {
      for (const item of initialGroups) {
        await addDoc(collection(db, "groups"), {
          ...item,
          createdAt: serverTimestamp(),
        });
      }
    }

    // 3. Check Coaches
    const coachesSnap = await getDocs(collection(db, "coaches"));
    if (coachesSnap.empty || force) {
      for (const item of initialCoaches) {
        await addDoc(collection(db, "coaches"), {
          ...item,
          createdAt: serverTimestamp(),
        });
      }
    }

    // 4. Check Finances
    const financesSnap = await getDocs(collection(db, "finances"));
    if (financesSnap.empty || force) {
      for (const item of initialFinances) {
        await addDoc(collection(db, "finances"), {
          ...item,
          createdAt: serverTimestamp(),
        });
      }
    }

    // 5. Check Inventory
    const inventorySnap = await getDocs(collection(db, "inventory"));
    if (inventorySnap.empty || force) {
      for (const item of initialInventory) {
        await addDoc(collection(db, "inventory"), {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    localStorage.setItem("soul_seed_completed", "true");
  } catch (error) {
    console.error("Error sembrando datos iniciales en Firestore:", error);
  }
}

/**
 * Agrega deportistas adicionales a Firestore sin duplicar los que ya existen
 * (coteja por nombre y documento).
 */
export async function seedAdditionalAthletes(): Promise<number> {
  try {
    const athletesSnap = await getDocs(collection(db, "athletes"));
    const existingNames = new Set<string>();
    const existingDocs = new Set<string>();

    athletesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.name) existingNames.add(String(data.name).trim().toLowerCase());
      if (data.nombres) existingNames.add(String(data.nombres).trim().toLowerCase());
      if (data.documento) existingDocs.add(String(data.documento).trim());
      if (data.numeroIdentidad) existingDocs.add(String(data.numeroIdentidad).trim());
    });

    let addedCount = 0;
    for (const item of initialAthletes) {
      const nameKey = item.name.trim().toLowerCase();
      const docKey = String(item.documento).trim();

      if (!existingNames.has(nameKey) && !existingDocs.has(docKey)) {
        await addDoc(collection(db, "athletes"), {
          ...item,
          estado_pago: item.financialStatus === "En mora" ? "en_mora" : "al_dia",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        addedCount++;
      }
    }

    console.log(`[seedAdditionalAthletes] Se sincronizaron ${addedCount} nuevos deportistas en Firestore.`);
    return addedCount;
  } catch (error) {
    console.error("Error al sincronizar deportistas adicionales en Firestore:", error);
    return 0;
  }
}
