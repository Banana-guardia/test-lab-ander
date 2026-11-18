import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initialCoaches, initialAthletes, initialGroups, initialFinances, initialInventory } from '@/lib/seedData';
import type { UserRole } from '@/store/authStore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Helper para crear cuenta de entrenador sin cerrar la sesión del admin activo
export async function createCoachAuthUser(email: string, password = "Soul2026*"): Promise<string> {
  const secondaryAppName = "SoulSecondaryAuth";
  const { getApps, getApp } = await import("firebase/app");
  const { createUserWithEmailAndPassword, signOut } = await import("firebase/auth");
  
  let secondaryApp;
  if (getApps().some((a) => a.name === secondaryAppName)) {
    secondaryApp = getApp(secondaryAppName);
  } else {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  }
  
  const secondaryAuth = getAuth(secondaryApp);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;
  await signOut(secondaryAuth);
  return uid;
}

const SESSION_STORAGE_KEY = "soul_active_session";

export interface ResolvedAccountInfo {
  found: boolean;
  role: Exclude<UserRole, null>;
  displayName: string;
  mustChangePassword: boolean;
  documento?: string;
}

/**
 * Resuelve la cuenta y el rol de un usuario buscando de forma segura en:
 * 1. Firestore (`users`, `coaches`, `athletes`) con manejo de errores si las reglas están restringidas
 * 2. Almacenamiento local (`soul_local_users`, `soul_local_coaches`, `soul_local_athletes`)
 * 3. Datos semilla de la base de datos (`initialCoaches`, `initialAthletes`) y administrador principal
 */
export async function resolveDatabaseAccount(emailInput: string, uid?: string): Promise<ResolvedAccountInfo> {
  const cleanEmail = (emailInput || "").trim().toLowerCase();
  const passwordChangedLocally = cleanEmail
    ? localStorage.getItem(`soul_password_changed_${cleanEmail}`) === "true"
    : false;

  // 1. Verificar Administrador Principal
  if (cleanEmail === "andirojas0821@gmail.com") {
    return {
      found: true,
      role: "admin",
      displayName: "Andi Rojas (Admin)",
      mustChangePassword: false,
      documento: "1093496820"
    };
  }

  // Helper para determinar si un registro de usuario debe cambiar contraseña en su primer ingreso
  const resolveMustChange = (data: Record<string, any>): boolean => {
    if (data.mustChangePassword === true) return true;
    if (data.mustChangePassword === false) return false;
    // Si nunca se registró actualización de contraseña ni cambio local, exigirla en el primer inicio
    return !data.passwordUpdatedAt && !passwordChangedLocally;
  };

  // 2. Intentar consultar en Firestore colección 'users' (por UID o por email)
  try {
    if (uid) {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const d = userDoc.data();
        return {
          found: true,
          role: (d.role as Exclude<UserRole, null>) || "coach",
          displayName: d.displayName || d.name || cleanEmail.split("@")[0],
          mustChangePassword: resolveMustChange(d)
        };
      }
    }
    if (cleanEmail) {
      const qUsers = query(collection(db, "users"), where("email", "==", cleanEmail));
      const snapUsers = await getDocs(qUsers);
      if (!snapUsers.empty) {
        const d = snapUsers.docs[0].data();
        return {
          found: true,
          role: (d.role as Exclude<UserRole, null>) || "coach",
          displayName: d.displayName || d.name || cleanEmail.split("@")[0],
          mustChangePassword: resolveMustChange(d)
        };
      }
    }
  } catch {
    // Firestore con reglas restringidas o sin conexión; continuar con respaldos locales/semilla
  }

  // 3. Intentar consultar en Firestore colección 'coaches'
  try {
    if (cleanEmail) {
      const qCoaches = query(collection(db, "coaches"), where("email", "==", cleanEmail));
      const snapCoaches = await getDocs(qCoaches);
      if (!snapCoaches.empty) {
        const d = snapCoaches.docs[0].data();
        return {
          found: true,
          role: "coach",
          displayName: d.name || cleanEmail.split("@")[0],
          mustChangePassword: !passwordChangedLocally
        };
      }
    }
  } catch {}

  // 4. Buscar en usuarios configurados localmente (`soul_local_users`)
  try {
    const localUsers = JSON.parse(localStorage.getItem("soul_local_users") || "[]");
    const matchedLocalUser = localUsers.find(
      (u: any) => (u.email || "").trim().toLowerCase() === cleanEmail
    );
    if (matchedLocalUser) {
      return {
        found: true,
        role: matchedLocalUser.role || "coach",
        displayName: matchedLocalUser.displayName || matchedLocalUser.name || cleanEmail.split("@")[0],
        mustChangePassword:
          typeof matchedLocalUser.mustChangePassword === "boolean"
            ? matchedLocalUser.mustChangePassword && !passwordChangedLocally
            : !passwordChangedLocally
      };
    }
  } catch {}

  // 5. Buscar en entrenadores locales (`soul_local_coaches`) e `initialCoaches`
  try {
    const localCoaches = JSON.parse(localStorage.getItem("soul_local_coaches") || "[]");
    const allCoaches = [...localCoaches, ...initialCoaches];
    const matchedCoach = allCoaches.find(
      (c: any) => (c.email || "").trim().toLowerCase() === cleanEmail
    );
    if (matchedCoach) {
      return {
        found: true,
        role: "coach",
        displayName: matchedCoach.name || cleanEmail.split("@")[0],
        mustChangePassword: !passwordChangedLocally
      };
    }
  } catch {}

  // 6. Buscar en deportistas de la base de datos (`soul_local_athletes` e `initialAthletes`)
  try {
    const localAthletes = JSON.parse(localStorage.getItem("soul_local_athletes") || "[]");
    const allAthletes = [...localAthletes, ...initialAthletes];
    const matchedAthlete = allAthletes.find(
      (a: any) => (a.email || "").trim().toLowerCase() === cleanEmail
    );
    if (matchedAthlete) {
      const isAdminEmail = cleanEmail === "andirojas0821@gmail.com";
      return {
        found: true,
        role: isAdminEmail ? "admin" : "admin",
        displayName: matchedAthlete.name || matchedAthlete.nombres || cleanEmail.split("@")[0],
        mustChangePassword: !passwordChangedLocally,
        documento: matchedAthlete.documento
      };
    }
  } catch {}

  return {
    found: false,
    role: "admin",
    displayName: cleanEmail ? cleanEmail.split("@")[0] : "Usuario SOUL",
    mustChangePassword: !passwordChangedLocally
  };
}

export function saveActiveSession(user: { uid: string; email: string | null; displayName?: string | null }, role: UserRole, mustChangePassword = false) {
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || (user.email ? user.email.split("@")[0] : "Usuario SOUL"),
        role: role || "admin",
        mustChangePassword
      })
    );
  } catch {}
}

export function getActiveSession(): { user: any; role: UserRole; mustChangePassword: boolean } | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.email) return null;
    return {
      user: {
        uid: parsed.uid || `local-${parsed.email.replace(/[^a-zA-Z0-9]/g, "_")}`,
        email: parsed.email,
        displayName: parsed.displayName || parsed.email.split("@")[0]
      },
      role: parsed.role || "admin",
      mustChangePassword: !!parsed.mustChangePassword
    };
  } catch {
    return null;
  }
}

export function clearActiveSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}
}

export interface UnifiedAthlete {
  id: string;
  name: string;
  nombres?: string;
  documento?: string;
  age?: number;
  category?: string;
  group: string;
  status?: "Activo" | "Inactivo" | string;
  phone?: string;
  telefono?: string;
  email?: string;
  plan?: string;
  estado_pago?: "al_dia" | "en_mora" | string;
  financialStatus?: "Al día" | "Pago parcial" | "En mora" | string;
  fechaVencimiento?: string | null;
  valorPendiente?: number | null;
  valorAbonado?: number;
  parentName?: string;
  parentPhone?: string;
  eps?: string;
  lastPaymentDate?: string;
  lastPaymentReference?: string;
  originalId?: string;
  originalDocumento?: string;
  originalName?: string;
}

export interface UnifiedCoach {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  groups: string[];
  assignedGroups?: string[];
}

export interface UnifiedGroup {
  id: string;
  name: string;
  category: string;
  coach: string;
  location: string;
  schedule: string;
  athletes: number;
  studentsList: UnifiedAthlete[];
}

/**
 * Unifica entrenadores desde Firestore + localStorage (`soul_local_coaches`) + `initialCoaches`
 */
export function mergeCoachesData(firestoreCoaches: any[] = []): UnifiedCoach[] {
  let localCoaches: any[] = [];
  try {
    localCoaches = JSON.parse(localStorage.getItem("soul_local_coaches") || "[]");
  } catch {}

  const map = new Map<string, UnifiedCoach>();

  // 1. Base semilla
  initialCoaches.forEach((ic, idx) => {
    const key = (ic.email || ic.name || "").trim().toLowerCase();
    map.set(key, {
      id: `init-coach-${idx}`,
      name: ic.name,
      role: ic.role,
      email: ic.email,
      phone: ic.phone,
      groups: Array.isArray(ic.groups) ? ic.groups : []
    });
  });

  // 2. LocalStorage (sobreescribe o agrega nuevos entrenadores creados en el panel)
  localCoaches.forEach((lc, idx) => {
    const key = (lc.email || lc.name || `local-${idx}`).trim().toLowerCase();
    map.set(key, {
      id: lc.id || `local-coach-${idx}`,
      name: lc.name || "Entrenador SOUL",
      role: lc.role || "Entrenador",
      email: lc.email || "",
      phone: lc.phone || "",
      groups: Array.isArray(lc.groups) ? lc.groups : ["Selección A"]
    });
  });

  // 3. Firestore (prioridad en tiempo real)
  firestoreCoaches.forEach((fc) => {
    const key = (fc.email || fc.name || fc.id).trim().toLowerCase();
    map.set(key, {
      id: fc.id,
      name: fc.name || "Entrenador SOUL",
      role: fc.role || "Entrenador",
      email: fc.email || "",
      phone: fc.phone || "",
      groups: Array.isArray(fc.groups) ? fc.groups : ["Selección A"]
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Unifica deportistas desde Firestore + localStorage (`soul_local_athletes`) + `initialAthletes`
 * respetando todas las ediciones y eliminaciones hechas en el panel administrativo.
 */
export function mergeAthletesData(firestoreAthletes: any[] = []): UnifiedAthlete[] {
  let localAthletes: any[] = [];
  let deletedEntries: Array<{ id?: string; documento?: string; name?: string }> = [];
  try {
    localAthletes = JSON.parse(localStorage.getItem("soul_local_athletes") || "[]");
  } catch {}
  try {
    deletedEntries = JSON.parse(localStorage.getItem("soul_deleted_athletes") || "[]");
  } catch {}

  const list: UnifiedAthlete[] = [];

  const normalizeAthlete = (raw: any, fallbackId: string): UnifiedAthlete => {
    const nameStr = String(raw.name || raw.nombres || "Deportista SOUL").trim();
    const docStr = raw.documento ? String(raw.documento).trim() : "";
    const phoneStr = String(raw.phone || raw.telefono || "").trim();
    const finStatus =
      raw.financialStatus ||
      (raw.estado_pago === "en_mora"
        ? "En mora"
        : raw.estado_pago === "pago_parcial"
        ? "Pago parcial"
        : "Al día");
    const estPago =
      raw.estado_pago ||
      (finStatus === "Al día"
        ? "al_dia"
        : finStatus === "Pago parcial"
        ? "pago_parcial"
        : "en_mora");

    return {
      ...raw,
      id: raw.id || fallbackId,
      name: nameStr,
      nombres: nameStr,
      documento: docStr,
      age: raw.age !== undefined && raw.age !== null ? Number(raw.age) : 16,
      category: raw.category || "Juvenil",
      group: raw.group || "Selección A",
      status: raw.status || "Activo",
      phone: phoneStr,
      telefono: phoneStr,
      email: raw.email || "",
      plan: raw.plan || "Plan Alfa",
      financialStatus: finStatus,
      estado_pago: estPago
    };
  };

  const findMatchIndex = (candidate: any): number => {
    const cId = String(candidate.id || "").trim();
    const cOrigId = String(candidate.originalId || "").trim();
    const cDoc = String(candidate.documento || "").trim();
    const cOrigDoc = String(candidate.originalDocumento || "").trim();
    const cName = String(candidate.name || candidate.nombres || "").trim().toLowerCase();
    const cOrigName = String(candidate.originalName || "").trim().toLowerCase();

    return list.findIndex((item) => {
      const iId = String(item.id || "").trim();
      const iDoc = String(item.documento || "").trim();
      const iName = String(item.name || "").trim().toLowerCase();

      if (cId && iId === cId) return true;
      if (cOrigId && iId === cOrigId) return true;
      if (cOrigDoc && iDoc && iDoc === cOrigDoc) return true;
      if (cDoc && iDoc && iDoc === cDoc) return true;
      if (cOrigName && iName && iName === cOrigName) return true;
      if (cName && iName && iName === cName) return true;
      return false;
    });
  };

  // 1. Base semilla (18 deportistas iniciales)
  initialAthletes.forEach((ia: any, idx) => {
    list.push(normalizeAthlete(ia, ia.id || `demo-${idx}`));
  });

  // 2. Datos en vivo de Firestore
  firestoreAthletes.forEach((fa: any, idx) => {
    const normalized = normalizeAthlete(fa, fa.id || `fs-${idx}`);
    const matchIdx = findMatchIndex(normalized);
    if (matchIdx >= 0) {
      list[matchIdx] = { ...list[matchIdx], ...normalized };
    } else {
      list.push(normalized);
    }
  });

  // 3. Modificaciones y creaciones locales (`soul_local_athletes`) tienen máxima prioridad
  localAthletes.forEach((la: any, idx) => {
    const normalized = normalizeAthlete(la, la.id || `local-ath-${idx}`);
    const matchIdx = findMatchIndex(la);
    if (matchIdx >= 0) {
      list[matchIdx] = {
        ...list[matchIdx],
        ...normalized,
        id: normalized.id || list[matchIdx].id
      };
    } else {
      list.push(normalized);
    }
  });

  // 4. Filtrar eliminados
  const isDeleted = (item: UnifiedAthlete) => {
    const iId = String(item.id || "").trim();
    const iDoc = String(item.documento || "").trim();
    const iName = String(item.name || "").trim().toLowerCase();

    return deletedEntries.some((del) => {
      if (del.id && iId === del.id) return true;
      if (del.documento && iDoc && iDoc === del.documento) return true;
      if (del.name && iName === del.name.trim().toLowerCase()) return true;
      return false;
    });
  };

  return list
    .filter((item) => !isDeleted(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Guarda o actualiza un deportista en Firestore (`setDoc` con merge) y persiste inmediatamente
 * en `soul_local_athletes` para que las modificaciones funcionen siempre incluso con reglas restringidas.
 */
export async function saveAthleteToDatabase(
  payload: Record<string, any>,
  editingAthlete?: { id?: string; documento?: string; name?: string } | null
): Promise<UnifiedAthlete> {
  const { setDoc, addDoc, serverTimestamp } = await import("firebase/firestore");

  let targetId = editingAthlete?.id || payload.id || "";
  const isLocalOrDemoId =
    !targetId ||
    targetId.startsWith("demo-") ||
    targetId.startsWith("init-ath-") ||
    targetId.startsWith("seed-") ||
    targetId.startsWith("offline-");

  // Copia limpia para LocalStorage (sin objetos centinela de Firebase)
  const cleanPayload: Record<string, any> = { ...payload };
  delete cleanPayload.updatedAt;
  delete cleanPayload.createdAt;

  try {
    if (targetId && !isLocalOrDemoId) {
      await setDoc(
        doc(db, "athletes", targetId),
        {
          ...cleanPayload,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } else if (editingAthlete && targetId) {
      // Si era un deportista semilla (ej. demo-1), intentar usar su documento como ID en Firestore
      const docBasedId = cleanPayload.documento
        ? `ath_${String(cleanPayload.documento).trim()}`
        : targetId;
      await setDoc(
        doc(db, "athletes", docBasedId),
        {
          ...cleanPayload,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      targetId = docBasedId;
    } else {
      const ref = await addDoc(collection(db, "athletes"), {
        ...cleanPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      targetId = ref.id;
    }
  } catch {
    if (!targetId) {
      targetId = `athlete-local-${Date.now()}`;
    }
  }

  const savedRecord: UnifiedAthlete = {
    ...(cleanPayload as any),
    id: targetId || `athlete-local-${Date.now()}`,
    originalId: editingAthlete?.id || targetId,
    originalDocumento: editingAthlete?.documento || cleanPayload.documento || "",
    originalName: editingAthlete?.name || cleanPayload.name || ""
  };

  try {
    const stored: any[] = JSON.parse(localStorage.getItem("soul_local_athletes") || "[]");
    const filtered = stored.filter((item) => {
      if (item.id && (item.id === savedRecord.id || item.id === editingAthlete?.id)) return false;
      if (
        editingAthlete?.documento &&
        item.documento &&
        String(item.documento).trim() === String(editingAthlete.documento).trim()
      ) {
        return false;
      }
      if (
        editingAthlete?.name &&
        item.name &&
        String(item.name).trim().toLowerCase() === String(editingAthlete.name).trim().toLowerCase()
      ) {
        return false;
      }
      if (
        savedRecord.documento &&
        item.documento &&
        String(item.documento).trim() === String(savedRecord.documento).trim()
      ) {
        return false;
      }
      return true;
    });
    filtered.push(savedRecord);
    localStorage.setItem("soul_local_athletes", JSON.stringify(filtered));

    // Si estaba marcado como eliminado antes, quitarlo de la lista de eliminados
    const deleted: any[] = JSON.parse(localStorage.getItem("soul_deleted_athletes") || "[]");
    const cleanDeleted = deleted.filter(
      (d) =>
        d.id !== savedRecord.id &&
        d.documento !== savedRecord.documento &&
        (d.name || "").toLowerCase() !== (savedRecord.name || "").toLowerCase()
    );
    localStorage.setItem("soul_deleted_athletes", JSON.stringify(cleanDeleted));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soul-athletes-updated"));
  }

  return savedRecord;
}

/**
 * Elimina un deportista de Firestore y registra su baja en `soul_deleted_athletes` y `soul_local_athletes`
 */
export async function deleteAthleteFromDatabase(target: {
  id: string;
  name?: string;
  documento?: string;
}): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");

  try {
    await deleteDoc(doc(db, "athletes", target.id));
  } catch {}

  try {
    const stored: any[] = JSON.parse(localStorage.getItem("soul_local_athletes") || "[]");
    const filtered = stored.filter(
      (a) =>
        a.id !== target.id &&
        (!target.documento || a.documento !== target.documento) &&
        (!target.name || (a.name || "").trim().toLowerCase() !== target.name.trim().toLowerCase())
    );
    localStorage.setItem("soul_local_athletes", JSON.stringify(filtered));

    const deleted: any[] = JSON.parse(localStorage.getItem("soul_deleted_athletes") || "[]");
    deleted.push({
      id: target.id,
      name: target.name || "",
      documento: target.documento || ""
    });
    localStorage.setItem("soul_deleted_athletes", JSON.stringify(deleted));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soul-athletes-updated"));
  }
}

/**
 * Unifica grupos desde Firestore + localStorage (`soul_local_groups`) + `initialGroups`
 * y vincula automáticamente los deportistas reales de cada grupo y los grupos asignados a cada profe.
 */
export function mergeGroupsData(
  firestoreGroups: any[] = [],
  coaches: UnifiedCoach[] = [],
  athletes: UnifiedAthlete[] = []
): UnifiedGroup[] {
  let localGroups: any[] = [];
  try {
    localGroups = JSON.parse(localStorage.getItem("soul_local_groups") || "[]");
  } catch {}

  const map = new Map<string, Omit<UnifiedGroup, "athletes" | "studentsList">>();

  // 1. Base semilla
  initialGroups.forEach((ig, idx) => {
    const key = ig.name.trim().toLowerCase();
    map.set(key, {
      id: `init-grp-${idx}`,
      name: ig.name,
      category: ig.category,
      coach: ig.coach,
      location: ig.location,
      schedule: ig.schedule
    });
  });

  // 2. LocalStorage
  localGroups.forEach((lg, idx) => {
    if (!lg?.name) return;
    const key = lg.name.trim().toLowerCase();
    map.set(key, {
      id: lg.id || `local-grp-${idx}`,
      name: lg.name,
      category: lg.category || "Juvenil",
      coach: lg.coach || "Por asignar",
      location: lg.location || "Sede Norte",
      schedule: lg.schedule || "Horario por definir"
    });
  });

  // 3. Firestore
  firestoreGroups.forEach((fg) => {
    if (!fg?.name) return;
    const key = fg.name.trim().toLowerCase();
    map.set(key, {
      id: fg.id,
      name: fg.name,
      category: fg.category || "Juvenil",
      coach: fg.coach || "Por asignar",
      location: fg.location || "Sede Norte",
      schedule: fg.schedule || "Horario por definir"
    });
  });

  // 4. Asegurar que cualquier grupo asignado a un entrenador en `coaches` exista también en el mapa
  coaches.forEach((c) => {
    (c.groups || []).forEach((gName) => {
      const cleanG = (gName || "").trim();
      if (!cleanG) return;
      const key = cleanG.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: `coach-grp-${key.replace(/[^a-z0-9]/g, "_")}`,
          name: cleanG,
          category: cleanG.toLowerCase().includes("juvenil")
            ? "Juvenil"
            : cleanG.toLowerCase().includes("infantil")
            ? "Infantil"
            : cleanG.toLowerCase().includes("iniciación") || cleanG.toLowerCase().includes("iniciacion")
            ? "Iniciación"
            : "Formativo / Competitivo",
          coach: c.name,
          location: "Sede Norte",
          schedule: "Mar-Jue-Sáb 17:00"
        });
      }
    });
  });

  // 5. Vincular los deportistas reales de cada grupo
  return Array.from(map.values())
    .map((grp) => {
      const studentsList = athletes.filter(
        (a) => (a.group || "").trim().toLowerCase() === grp.name.trim().toLowerCase()
      );
      return {
        ...grp,
        athletes: studentsList.length,
        studentsList
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Identifica al entrenador logueado (por correo o nombre) y devuelve sus grupos asignados junto con sus deportistas.
 */
export function resolveCoachAssignedGroups(
  user: { email?: string | null; displayName?: string | null } | null,
  coaches: UnifiedCoach[],
  groups: UnifiedGroup[]
): {
  coachProfile: UnifiedCoach | null;
  assignedGroups: UnifiedGroup[];
  assignedGroupNames: string[];
} {
  if (!user) {
    return { coachProfile: null, assignedGroups: groups, assignedGroupNames: groups.map((g) => g.name) };
  }

  const cleanEmail = (user.email || "").trim().toLowerCase();
  const cleanDisplayName = (user.displayName || "").trim().toLowerCase();

  // Buscar perfil del entrenador por email o por nombre
  const coachProfile =
    coaches.find((c) => (c.email || "").trim().toLowerCase() === cleanEmail && cleanEmail !== "") ||
    coaches.find((c) => (c.name || "").trim().toLowerCase() === cleanDisplayName && cleanDisplayName !== "") ||
    null;

  const assignedNamesSet = new Set<string>();

  if (coachProfile) {
    (coachProfile.groups || []).forEach((g) => {
      if (g) assignedNamesSet.add(g.trim().toLowerCase());
    });
  }

  // También incluir cualquier grupo cuyo campo `coach` coincida con el nombre del entrenador
  const targetCoachName = (coachProfile?.name || cleanDisplayName || "").trim().toLowerCase();
  if (targetCoachName) {
    groups.forEach((g) => {
      const gCoach = (g.coach || "").trim().toLowerCase();
      if (gCoach && (gCoach === targetCoachName || gCoach.includes(targetCoachName) || targetCoachName.includes(gCoach))) {
        assignedNamesSet.add(g.name.trim().toLowerCase());
      }
    });
  }

  const assignedGroups = groups.filter((g) => assignedNamesSet.has(g.name.trim().toLowerCase()));

  // Si un entrenador recién creado no tenía grupos específicos encontrados, mostrar los grupos de su perfil o todos como respaldo
  const finalAssigned = assignedGroups.length > 0 ? assignedGroups : groups;

  return {
    coachProfile,
    assignedGroups: finalAssigned,
    assignedGroupNames: finalAssigned.map((g) => g.name)
  };
}

export interface UnifiedFinanceTx {
  id: string;
  txCode: string;
  date: string;
  athlete: string;
  athleteId?: string;
  type: "income" | "expense";
  amount: number;
  status: "completed" | "pending";
  concept: string;
  paymentMethod?: string;
  wompiReference?: string;
  wompiTxId?: string;
  revisado?: boolean;
  createdAt?: any;
}

/**
 * Unifica movimientos financieros desde `initialFinances` + Firestore + `soul_local_finances`
 * respetando estados editados y registros eliminados (`soul_deleted_finances`).
 */
export function mergeFinancesData(firestoreFinances: any[] = []): UnifiedFinanceTx[] {
  let localFinances: any[] = [];
  let deletedIds: string[] = [];
  try {
    localFinances = JSON.parse(localStorage.getItem("soul_local_finances") || "[]");
  } catch {}
  try {
    deletedIds = JSON.parse(localStorage.getItem("soul_deleted_finances") || "[]");
  } catch {}

  const map = new Map<string, UnifiedFinanceTx>();

  const normalizeTx = (raw: any, fallbackId: string): UnifiedFinanceTx => ({
    ...raw,
    id: raw.id || fallbackId,
    txCode: raw.txCode || raw.wompiReference || `TX-${String(raw.id || fallbackId).slice(-6)}`,
    date: raw.date || "Oct 2026",
    athlete: raw.athlete || "Deportista SOUL",
    athleteId: raw.athleteId,
    type: raw.type === "expense" ? "expense" : "income",
    amount: Number(raw.amount) || 0,
    status: raw.status === "pending" ? "pending" : "completed",
    concept: raw.concept || "Mensualidad",
    paymentMethod: raw.paymentMethod || "Nequi / Wompi",
    wompiReference: raw.wompiReference,
    wompiTxId: raw.wompiTxId,
    revisado: Boolean(raw.revisado)
  });

  // 1. Datos semilla
  initialFinances.forEach((item: any, idx) => {
    const tx = normalizeTx(item, item.id || `seed-fin-${idx}`);
    map.set(tx.txCode || tx.id, tx);
  });

  // 2. Datos Firestore
  firestoreFinances.forEach((item: any, idx) => {
    const tx = normalizeTx(item, item.id || `fs-fin-${idx}`);
    const key = tx.txCode || tx.id;
    map.set(key, { ...(map.get(key) || ({} as any)), ...tx });
  });

  // 3. Modificaciones y creaciones locales (`soul_local_finances`)
  localFinances.forEach((item: any, idx) => {
    const tx = normalizeTx(item, item.id || `local-fin-${idx}`);
    const key = tx.txCode || tx.id;
    map.set(key, { ...(map.get(key) || ({} as any)), ...tx });
  });

  return Array.from(map.values())
    .filter((tx) => !deletedIds.includes(tx.id) && !deletedIds.includes(tx.txCode))
    .reverse();
}

export async function saveFinanceTransaction(
  payload: Record<string, any>,
  editingId?: string
): Promise<UnifiedFinanceTx> {
  const { setDoc, addDoc, serverTimestamp } = await import("firebase/firestore");

  let targetId = editingId || payload.id || "";
  const isLocalId =
    !targetId ||
    targetId.startsWith("fin-") ||
    targetId.startsWith("seed-fin-") ||
    targetId.startsWith("local-fin-");

  const cleanPayload: Record<string, any> = { ...payload };
  delete cleanPayload.createdAt;
  delete cleanPayload.updatedAt;

  try {
    if (targetId && !isLocalId) {
      await setDoc(
        doc(db, "finances", targetId),
        { ...cleanPayload, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } else if (editingId && targetId) {
      await setDoc(
        doc(db, "finances", targetId),
        { ...cleanPayload, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } else {
      const ref = await addDoc(collection(db, "finances"), {
        ...cleanPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      targetId = ref.id;
    }
  } catch {
    if (!targetId) {
      targetId = `local-fin-${Date.now()}`;
    }
  }

  const savedTx: UnifiedFinanceTx = {
    ...(cleanPayload as any),
    id: targetId || `local-fin-${Date.now()}`,
    txCode: cleanPayload.txCode || `TX-${Date.now().toString().slice(-5)}`,
    date: cleanPayload.date || "Hoy",
    athlete: cleanPayload.athlete || "Deportista SOUL",
    type: cleanPayload.type === "expense" ? "expense" : "income",
    amount: Number(cleanPayload.amount) || 0,
    status: cleanPayload.status === "pending" ? "pending" : "completed",
    concept: cleanPayload.concept || "Mensualidad"
  };

  try {
    const stored: any[] = JSON.parse(localStorage.getItem("soul_local_finances") || "[]");
    const filtered = stored.filter(
      (t) => t.id !== savedTx.id && (!savedTx.txCode || t.txCode !== savedTx.txCode)
    );
    filtered.push(savedTx);
    localStorage.setItem("soul_local_finances", JSON.stringify(filtered));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soul-finances-updated"));
  }

  return savedTx;
}

/**
 * Envía una notificación automática de pago (estado pendiente por revisar)
 * al módulo de Notificaciones de Pago cuando el usuario hace clic en pagar desde el portal.
 */
export async function sendPortalPaymentNotification(params: {
  athleteName: string;
  athleteId?: string;
  amount: number;
  concept: string;
  paymentMethod?: string;
  source?: string;
}): Promise<{ reference: string; dateLabel: string }> {
  const reference = `SOUL-INT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const now = new Date();
  const dateLabel = now.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const cleanPayload = {
    txCode: reference,
    wompiReference: reference,
    date: dateLabel,
    athlete: params.athleteName || "Deportista SOUL",
    athleteId: params.athleteId || "",
    type: "income" as const,
    amount: Number(params.amount) || 0,
    status: "pending" as const,
    concept: params.concept || "Pago desde Portal",
    paymentMethod: params.paymentMethod || "Nequi / Wompi (Por revisar)",
    revisado: false,
    source: params.source || "portal_pagos",
    deviceTimestamp: now.toISOString()
  };

  const localFinId = `local-fin-${Date.now()}`;
  const localNotifId = `local-notif-${Date.now()}`;

  // 1. Persistencia local inmediata (0 ms) y notificación instantánea entre pestañas
  try {
    const storedFin: any[] = JSON.parse(localStorage.getItem("soul_local_finances") || "[]");
    const filteredFin = storedFin.filter((t) => t.txCode !== reference);
    filteredFin.push({ id: localFinId, ...cleanPayload });
    localStorage.setItem("soul_local_finances", JSON.stringify(filteredFin));
  } catch {}

  try {
    const storedNotifs: any[] = JSON.parse(localStorage.getItem("soul_local_payment_notifications") || "[]");
    const filteredNotifs = storedNotifs.filter((n) => n.txCode !== reference && n.wompiReference !== reference);
    filteredNotifs.unshift({ id: localNotifId, ...cleanPayload });
    localStorage.setItem("soul_local_payment_notifications", JSON.stringify(filteredNotifs));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soul-finances-updated"));
    window.dispatchEvent(new Event("soul-payment-notifications-updated"));
    try {
      const bc = new BroadcastChannel("soul-payment-notifications");
      bc.postMessage({ type: "new-notification", payload: { id: localNotifId, ...cleanPayload } });
      bc.close();
    } catch {}
  }

  // 2. Enviar de inmediato al servidor local (/api/pagos/notificar -> SSE push instantáneo)
  if (typeof fetch !== "undefined") {
    fetch("/api/pagos/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanPayload),
      keepalive: true
    }).catch(() => {});
  }

  // 3. Sincronizar con Firestore de forma segura (payment_notifications público + finances protegido)
  try {
    const { addDoc, serverTimestamp } = await import("firebase/firestore");
    await addDoc(collection(db, "payment_notifications"), {
      ...cleanPayload,
      createdAt: serverTimestamp()
    }).catch((err) => {
      console.warn("Aviso Firestore al crear payment_notifications:", err);
    });

    // Replicar en finances solo si hay sesión activa con permisos
    addDoc(collection(db, "finances"), {
      ...cleanPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }).catch(() => {});
  } catch {}

  return { reference, dateLabel };
}

export async function deleteFinanceTransaction(target: { id: string; txCode?: string }): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  try {
    await deleteDoc(doc(db, "finances", target.id));
  } catch {}

  try {
    const stored: any[] = JSON.parse(localStorage.getItem("soul_local_finances") || "[]");
    const filtered = stored.filter(
      (t) => t.id !== target.id && (!target.txCode || t.txCode !== target.txCode)
    );
    localStorage.setItem("soul_local_finances", JSON.stringify(filtered));

    const deleted: string[] = JSON.parse(localStorage.getItem("soul_deleted_finances") || "[]");
    deleted.push(target.id);
    if (target.txCode) deleted.push(target.txCode);
    localStorage.setItem("soul_deleted_finances", JSON.stringify(deleted));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soul-finances-updated"));
  }
}

export interface UnifiedInventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  condition: string;
  location: string;
  unitValue: number;
  notes?: string;
  assignedTo?: string;
  updatedAt?: any;
}

/**
 * Unifica el inventario deportivo desde `initialInventory` + Firestore + `soul_local_inventory`
 * respetando ajustes de stock, ediciones y eliminaciones (`soul_deleted_inventory`).
 */
export function mergeInventoryData(firestoreInventory: any[] = []): UnifiedInventoryItem[] {
  let localInventory: any[] = [];
  let deletedEntries: string[] = [];
  try {
    localInventory = JSON.parse(localStorage.getItem("soul_local_inventory") || "[]");
  } catch {}
  try {
    deletedEntries = JSON.parse(localStorage.getItem("soul_deleted_inventory") || "[]");
  } catch {}

  const list: UnifiedInventoryItem[] = [];

  const normalizeItem = (raw: any, fallbackId: string): UnifiedInventoryItem => ({
    ...raw,
    id: raw.id || fallbackId,
    name: String(raw.name || "Artículo Deportivo").trim(),
    category: raw.category || "Balones",
    quantity: raw.quantity !== undefined && raw.quantity !== null ? Number(raw.quantity) : 0,
    minQuantity: raw.minQuantity !== undefined && raw.minQuantity !== null ? Number(raw.minQuantity) : 2,
    condition: raw.condition || "Excelente",
    location: raw.location || "Sede Norte",
    unitValue: raw.unitValue !== undefined && raw.unitValue !== null ? Number(raw.unitValue) : 0,
    notes: raw.notes || "",
    assignedTo: raw.assignedTo || ""
  });

  const findMatchIndex = (candidate: any): number => {
    const cId = String(candidate.id || "").trim();
    const cOrigId = String(candidate.originalId || "").trim();
    const cName = String(candidate.name || "").trim().toLowerCase();
    const cOrigName = String(candidate.originalName || "").trim().toLowerCase();

    return list.findIndex((item) => {
      const iId = String(item.id || "").trim();
      const iName = String(item.name || "").trim().toLowerCase();
      if (cId && iId === cId) return true;
      if (cOrigId && iId === cOrigId) return true;
      if (cOrigName && iName === cOrigName) return true;
      if (cName && iName === cName) return true;
      return false;
    });
  };

  // 1. Base semilla (12 artículos de voleibol del club)
  initialInventory.forEach((ii: any, idx) => {
    list.push(normalizeItem(ii, ii.id || `inv-seed-${idx + 1}`));
  });

  // 2. Datos Firestore
  firestoreInventory.forEach((fi: any, idx) => {
    const normalized = normalizeItem(fi, fi.id || `inv-fs-${idx}`);
    const matchIdx = findMatchIndex(normalized);
    if (matchIdx >= 0) {
      list[matchIdx] = { ...list[matchIdx], ...normalized };
    } else {
      list.push(normalized);
    }
  });

  // 3. Modificaciones y creaciones locales (`soul_local_inventory`)
  localInventory.forEach((li: any, idx) => {
    const normalized = normalizeItem(li, li.id || `inv-local-${idx}`);
    const matchIdx = findMatchIndex(li);
    if (matchIdx >= 0) {
      list[matchIdx] = { ...list[matchIdx], ...normalized };
    } else {
      list.push(normalized);
    }
  });

  return list
    .filter(
      (item) =>
        !deletedEntries.includes(item.id) &&
        !deletedEntries.includes(item.name.trim().toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInventoryItem(
  payload: Record<string, any>,
  editingItem?: { id?: string; name?: string } | null
): Promise<UnifiedInventoryItem> {
  const { setDoc, addDoc, serverTimestamp } = await import("firebase/firestore");

  let targetId = editingItem?.id || payload.id || "";
  const isSeedOrLocalId =
    !targetId ||
    targetId.startsWith("inv-seed-") ||
    targetId.startsWith("inv-local-");

  const cleanPayload: Record<string, any> = { ...payload };
  delete cleanPayload.createdAt;
  delete cleanPayload.updatedAt;

  try {
    if (targetId && !isSeedOrLocalId) {
      await setDoc(
        doc(db, "inventory", targetId),
        { ...cleanPayload, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } else if (editingItem && targetId) {
      await setDoc(
        doc(db, "inventory", targetId),
        { ...cleanPayload, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } else {
      const ref = await addDoc(collection(db, "inventory"), {
        ...cleanPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      targetId = ref.id;
    }
  } catch {
    if (!targetId) {
      targetId = `inv-local-${Date.now()}`;
    }
  }

  const savedItem: UnifiedInventoryItem = {
    ...(cleanPayload as any),
    id: targetId || `inv-local-${Date.now()}`,
    originalId: editingItem?.id || targetId,
    originalName: editingItem?.name || cleanPayload.name
  };

  try {
    const stored: any[] = JSON.parse(localStorage.getItem("soul_local_inventory") || "[]");
    const filtered = stored.filter(
      (i) =>
        i.id !== savedItem.id &&
        i.id !== editingItem?.id &&
        (i.name || "").trim().toLowerCase() !== (editingItem?.name || savedItem.name || "").trim().toLowerCase()
    );
    filtered.push(savedItem);
    localStorage.setItem("soul_local_inventory", JSON.stringify(filtered));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soul-inventory-updated"));
  }

  return savedItem;
}

export async function deleteInventoryItem(target: { id: string; name?: string }): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  try {
    await deleteDoc(doc(db, "inventory", target.id));
  } catch {}

  try {
    const stored: any[] = JSON.parse(localStorage.getItem("soul_local_inventory") || "[]");
    const filtered = stored.filter(
      (i) =>
        i.id !== target.id &&
        (!target.name || (i.name || "").trim().toLowerCase() !== target.name.trim().toLowerCase())
    );
    localStorage.setItem("soul_local_inventory", JSON.stringify(filtered));

    const deleted: string[] = JSON.parse(localStorage.getItem("soul_deleted_inventory") || "[]");
    deleted.push(target.id);
    if (target.name) deleted.push(target.name.trim().toLowerCase());
    localStorage.setItem("soul_deleted_inventory", JSON.stringify(deleted));
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("soul-inventory-updated"));
  }
}


