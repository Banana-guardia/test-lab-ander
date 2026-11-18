import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { createCoachAuthUser } from "@/lib/firebase";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ShieldCheck,
  UserPlus,
  Users,
  KeyRound,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Lock,
  Mail,
  X,
  Search,
  Sparkles,
  Eye
} from "lucide-react";

export type SystemRole = "admin" | "management" | "coach";

export interface SystemUser {
  id: string;
  uid?: string;
  email: string;
  displayName: string;
  role: SystemRole;
  mustChangePassword?: boolean;
  coachDocId?: string;
  createdAt?: any;
  updatedAt?: any;
}

const ROLE_INFO: Record<SystemRole, { label: string; badgeClass: string; desc: string; modules: string[] }> = {
  admin: {
    label: "👑 Administrador Total",
    badgeClass: "bg-pink-500/20 text-pink-300 border-pink-500/40",
    desc: "Acceso total a finanzas, deportistas, usuarios, inventario y configuración.",
    modules: ["Todos los 11 módulos del sistema + Gestión de Roles"]
  },
  management: {
    label: "💼 Coordinación / Gestión",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    desc: "Acceso administrativo a inscripciones, cartera, grupos, entrenadores e inventario.",
    modules: ["Dashboard", "Solicitudes", "Deportistas", "Planes", "Pagos", "Grupos", "Entrenadores", "Asistencia", "Finanzas", "Inventario"]
  },
  coach: {
    label: "🏐 Entrenador de Cancha",
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    desc: "Vista restringida y protegida. Solo ve sus horas, grupos y toma de asistencia (sin datos financieros ni teléfonos de alumnos).",
    modules: ["Mi Resumen de Cancha (Dashboard Profe)", "Grupos (Solo Nombre y Grupo)", "Asistencia & Mis Horas Dictadas"]
  }
};

export default function UsersRoles() {
  const { user: currentUser, role: currentRole, setUser } = useAuthStore();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Formulario para crear nuevo usuario en Firebase Authentication + Firestore
  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "Soul2026*",
    role: "coach" as SystemRole,
    mustChangePassword: true
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // Escuchar colección 'users' en tiempo real y asegurar que el admin actual esté registrado
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), async (snapshot) => {
      const list: SystemUser[] = [];
      let currentAdminFound = false;

      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (currentUser && (docSnap.id === currentUser.uid || d.email === currentUser.email)) {
          currentAdminFound = true;
        }
        list.push({
          id: docSnap.id,
          uid: d.uid || docSnap.id,
          email: d.email || "Sin correo",
          displayName: d.displayName || d.name || (d.email ? d.email.split("@")[0] : "Usuario SOUL"),
          role: (d.role as SystemRole) || (d.email === "andirojas0821@gmail.com" ? "admin" : "coach"),
          mustChangePassword: !!d.mustChangePassword,
          coachDocId: d.coachDocId,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        });
      });

      // Si el usuario actual de Firebase Auth no aparece aún en la colección users, registrarlo automáticamente
      if (currentUser && !currentAdminFound) {
        const defaultRole: SystemRole = currentUser.email === "andirojas0821@gmail.com" ? "admin" : "coach";
        try {
          await setDoc(doc(db, "users", currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName || "Administrador Principal SOUL",
            role: defaultRole,
            mustChangePassword: false,
            createdAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.error("Error auto-registrando usuario actual:", e);
        }
      }

      // También sincronizar entrenadores de la colección 'coaches' que tengan correo pero no estén en 'users'
      try {
        const coachesSnap = await getDocs(collection(db, "coaches"));
        const existingEmails = new Set(list.map((u) => u.email.toLowerCase().trim()));
        coachesSnap.forEach((cDoc) => {
          const cData = cDoc.data();
          const cEmail = (cData.email || "").trim().toLowerCase();
          if (cEmail && !existingEmails.has(cEmail)) {
            existingEmails.add(cEmail);
            list.push({
              id: `coach_${cDoc.id}`,
              email: cData.email,
              displayName: cData.name || cData.email.split("@")[0],
              role: "coach",
              mustChangePassword: true,
              coachDocId: cDoc.id
            });
          }
        });
      } catch {}

      list.sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (a.role !== "admin" && b.role === "admin") return 1;
        return (a.displayName || "").localeCompare(b.displayName || "");
      });

      setUsers(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Cambiar rol de un usuario en tiempo real
  const handleRoleChange = async (targetUser: SystemUser, newRole: SystemRole) => {
    try {
      setUpdatingId(targetUser.id);

      // Si era un registro virtual de coach, crear documento formal en 'users'
      const docId = targetUser.id.startsWith("coach_") ? targetUser.email.replace(/[^a-zA-Z0-9]/g, "_") : targetUser.id;

      await setDoc(doc(db, "users", docId), {
        uid: targetUser.uid || docId,
        email: targetUser.email,
        displayName: targetUser.displayName,
        role: newRole,
        updatedAt: serverTimestamp()
      }, { merge: true });

      showToast(`Rol de ${targetUser.displayName} actualizado a "${ROLE_INFO[newRole].label}"`);
    } catch (err) {
      console.error("Error al cambiar rol:", err);
      alert("No se pudo actualizar el rol en Firestore.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Alternar cambio obligatorio de contraseña en próximo inicio de sesión
  const handleToggleForcePassword = async (targetUser: SystemUser) => {
    try {
      setUpdatingId(targetUser.id);
      const nextState = !targetUser.mustChangePassword;
      const cleanEmail = targetUser.email.trim().toLowerCase();
      const docId = targetUser.id.startsWith("coach_") ? cleanEmail.replace(/[^a-zA-Z0-9]/g, "_") : targetUser.id;

      try {
        if (nextState) {
          localStorage.removeItem(`soul_password_changed_${cleanEmail}`);
        } else {
          localStorage.setItem(`soul_password_changed_${cleanEmail}`, "true");
        }
        const localUsers = JSON.parse(localStorage.getItem("soul_local_users") || "[]");
        const filtered = Array.isArray(localUsers)
          ? localUsers.filter((u: any) => (u.email || "").trim().toLowerCase() !== cleanEmail)
          : [];
        filtered.push({
          email: cleanEmail,
          displayName: targetUser.displayName,
          role: targetUser.role,
          mustChangePassword: nextState
        });
        localStorage.setItem("soul_local_users", JSON.stringify(filtered));
      } catch {}

      await setDoc(doc(db, "users", docId), {
        email: cleanEmail,
        displayName: targetUser.displayName,
        role: targetUser.role,
        mustChangePassword: nextState,
        updatedAt: serverTimestamp()
      }, { merge: true });

      showToast(
        nextState
          ? `Se exigirá cambio de contraseña a ${targetUser.displayName} en su próximo ingreso.`
          : `Se desactivó el cambio obligatorio de clave para ${targetUser.displayName}.`
      );
    } catch (err) {
      console.error("Error al actualizar estado de contraseña:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Crear usuario en Firebase Authentication + Asignar Rol en Firestore
  const handleCreateUserWithRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = formData.email.trim().toLowerCase();
    const cleanName = formData.displayName.trim();
    const cleanPass = formData.password.trim() || "Soul2026*";

    if (!cleanEmail || !cleanName) return;
    if (cleanPass.length < 6) {
      alert("La contraseña en Firebase Authentication debe tener mínimo 6 caracteres.");
      return;
    }

    try {
      setSubmitting(true);
      let newUid = "";

      try {
        // 1. Crear el usuario directamente en Firebase Authentication sin cerrar la sesión actual
        newUid = await createCoachAuthUser(cleanEmail, cleanPass);
      } catch (authErr: any) {
        // Si el usuario ya lo creaste manualmente en la consola de Firebase Authentication, vinculamos su correo
        console.warn("Aviso de Firebase Auth:", authErr.message);
        const existingQ = query(collection(db, "users"), where("email", "==", cleanEmail));
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) {
          newUid = existingSnap.docs[0].id;
        } else {
          newUid = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
        }
      }

      // 2. Guardar documento en colección 'users' con el rol elegido y respaldo local
      try {
        if (formData.mustChangePassword) {
          localStorage.removeItem(`soul_password_changed_${cleanEmail}`);
        }
        const localUsers = JSON.parse(localStorage.getItem("soul_local_users") || "[]");
        const filtered = Array.isArray(localUsers)
          ? localUsers.filter((u: any) => (u.email || "").trim().toLowerCase() !== cleanEmail)
          : [];
        filtered.push({
          email: cleanEmail,
          displayName: cleanName,
          role: formData.role,
          mustChangePassword: formData.mustChangePassword
        });
        localStorage.setItem("soul_local_users", JSON.stringify(filtered));
      } catch {}

      await setDoc(doc(db, "users", newUid), {
        uid: newUid,
        email: cleanEmail,
        displayName: cleanName,
        role: formData.role,
        mustChangePassword: formData.mustChangePassword,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 3. Si el rol es entrenador ('coach'), asegurar que también aparezca en el directorio de Entrenadores
      if (formData.role === "coach") {
        const coachesQ = query(collection(db, "coaches"), where("email", "==", cleanEmail));
        const coachesSnap = await getDocs(coachesQ);
        if (coachesSnap.empty) {
          await setDoc(doc(collection(db, "coaches")), {
            name: cleanName,
            role: "Entrenador Principal",
            email: cleanEmail,
            phone: "",
            groups: ["Selección A"],
            createdAt: serverTimestamp()
          });
        }
      }

      showToast(`Usuario "${cleanName}" (${cleanEmail}) configurado con rol ${ROLE_INFO[formData.role].label}`);
      setFormData({
        displayName: "",
        email: "",
        password: "Soul2026*",
        role: "coach",
        mustChangePassword: true
      });
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Error creando usuario:", err);
      alert("Error al registrar usuario: " + (err.message || "Verifica la consola."));
    } finally {
      setSubmitting(false);
    }
  };

  // Eliminar perfil de rol de Firestore
  const handleDeleteUserRole = async (targetUser: SystemUser) => {
    if (targetUser.email === "andirojas0821@gmail.com") {
      alert("No puedes eliminar al Administrador Principal del sistema.");
      return;
    }
    if (!confirm(`¿Quitar el perfil de acceso de ${targetUser.displayName} (${targetUser.email})?`)) return;

    try {
      await deleteDoc(doc(db, "users", targetUser.id));
      showToast(`Perfil de ${targetUser.displayName} eliminado.`);
    } catch (err) {
      console.error("Error eliminando perfil:", err);
    }
  };

  // Simulador de Vista en Vivo para que el Admin pruebe cómo se ve cada rol
  const handlePreviewRole = (previewRole: SystemRole) => {
    if (!currentUser) return;
    setUser(currentUser, previewRole, false);
    showToast(`Vista cambiada a: ${ROLE_INFO[previewRole].label}`);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-12">
      {/* Toast Flotante */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#241a2e] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-pink-500/15 border border-pink-500/30 text-pink-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Usuarios & Control de Roles (RBAC)
              </h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Vincula los correos de <strong className="text-purple-300">Firebase Authentication</strong> y asigna qué información puede ver cada perfil.
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-gradient-to-r from-[#7e1236] to-[#581c87] hover:from-[#961742] hover:to-[#6b21a8] text-white border border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.3)] font-semibold"
        >
          <UserPlus className="w-4 h-4 mr-2 text-purple-300" />
          Crear / Vincular Usuario con Rol
        </Button>
      </div>

      {/* Tarjeta de Simulador de Vista en Vivo para el Administrador */}
      <div className="bg-gradient-to-r from-purple-950/50 via-[#150c21] to-[#120c19] border border-purple-500/35 rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
            <Eye className="w-4 h-4 text-purple-400" />
            <span>Simulador de Separación de Información en Vivo</span>
          </div>
          <p className="text-xs text-zinc-300 max-w-2xl">
            ¿Quieres comprobar ahora mismo qué ve un <strong className="text-white">Entrenador</strong> frente a un <strong className="text-white">Administrador</strong>? Cambia tu vista activa con un clic (puedes volver a Administrador desde el menú lateral en cualquier momento):
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant={currentRole === "admin" ? "default" : "outline"}
            onClick={() => handlePreviewRole("admin")}
            className={
              currentRole === "admin"
                ? "bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold"
                : "border-pink-500/30 text-pink-300 hover:bg-pink-950/40 text-xs"
            }
          >
            👑 Vista Admin (Completa)
          </Button>
          <Button
            size="sm"
            variant={currentRole === "management" ? "default" : "outline"}
            onClick={() => handlePreviewRole("management")}
            className={
              currentRole === "management"
                ? "bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                : "border-amber-500/30 text-amber-300 hover:bg-amber-950/40 text-xs"
            }
          >
            💼 Vista Coordinación
          </Button>
          <Button
            size="sm"
            variant={currentRole === "coach" ? "default" : "outline"}
            onClick={() => handlePreviewRole("coach")}
            className={
              currentRole === "coach"
                ? "bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                : "border-purple-500/30 text-purple-300 hover:bg-purple-950/40 text-xs"
            }
          >
            🏐 Probar Vista Entrenador (Restringida)
          </Button>
        </div>
      </div>

      {/* Tarjetas Explicativas de Matriz de Permisos por Rol */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["admin", "management", "coach"] as SystemRole[]).map((rKey) => {
          const info = ROLE_INFO[rKey];
          const count = users.filter((u) => u.role === rKey).length;
          return (
            <div
              key={rKey}
              className="bg-[#120c19]/80 border border-[#2b1e36] rounded-xl p-5 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className={`${info.badgeClass} text-xs font-bold px-2.5 py-0.5`}>
                    {info.label}
                  </Badge>
                  <span className="text-xs font-mono text-zinc-400">
                    {count} {count === 1 ? "usuario" : "usuarios"}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">{info.desc}</p>
              </div>

              <div className="pt-3 border-t border-[#24192d]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
                  Módulos Autorizados:
                </span>
                <div className="flex flex-wrap gap-1">
                  {info.modules.map((m) => (
                    <span
                      key={m}
                      className="text-[11px] bg-[#070709] border border-[#2b1e36] text-zinc-300 px-2 py-0.5 rounded"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabla de Usuarios y Selector Directo de Rol */}
      <div className="bg-[#120c19]/70 border border-[#2b1e36] rounded-xl backdrop-blur-sm overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[#2b1e36] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-purple-400/70" />
            <Input
              placeholder="Buscar por correo, nombre o rol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-[#070709]/80 border-[#2b1e36] text-white text-xs"
            />
          </div>
          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Cambia el rol en el desplegable para aplicar permisos al instante</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#170f20]/90">
              <TableRow className="border-[#2b1e36] hover:bg-transparent">
                <TableHead className="text-zinc-400">Usuario / Nombre</TableHead>
                <TableHead className="text-zinc-400">Correo (Firebase Auth)</TableHead>
                <TableHead className="text-zinc-400">Rol Asignado (Separación de Datos)</TableHead>
                <TableHead className="text-zinc-400">Seguridad de Clave</TableHead>
                <TableHead className="text-right text-zinc-400">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
                    Cargando usuarios registrados...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-zinc-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                    No se encontraron usuarios.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const isMainAdmin = u.email.toLowerCase() === "andirojas0821@gmail.com";
                  return (
                    <TableRow key={u.id} className="border-[#24192d] hover:bg-purple-950/20 transition-colors">
                      <TableCell>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          <span>{u.displayName}</span>
                          {isMainAdmin && (
                            <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/40 text-[10px]">
                              Propietario
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          UID: {u.uid ? u.uid.slice(0, 12) + "..." : "Vinculado por Email"}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-200 font-mono">
                          <Mail className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>{u.email}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <select
                          value={u.role}
                          disabled={updatingId === u.id}
                          onChange={(e) => handleRoleChange(u, e.target.value as SystemRole)}
                          className={`text-xs font-bold rounded-lg px-3 py-1.5 border outline-none cursor-pointer transition-all ${
                            u.role === "admin"
                              ? "bg-pink-500/15 text-pink-300 border-pink-500/40"
                              : u.role === "management"
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                              : "bg-purple-500/15 text-purple-300 border-purple-500/40"
                          }`}
                        >
                          <option value="admin" className="bg-[#120c19] text-pink-300 font-bold">
                            👑 Administrador Total (Todo el sistema)
                          </option>
                          <option value="management" className="bg-[#120c19] text-amber-300 font-bold">
                            💼 Coordinación / Gestión Administrativa
                          </option>
                          <option value="coach" className="bg-[#120c19] text-purple-300 font-bold">
                            🏐 Entrenador de Cancha (Solo Asistencia, Grupos y Horas)
                          </option>
                        </select>
                      </TableCell>

                      <TableCell>
                        {u.mustChangePassword ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-[11px]"
                          >
                            <KeyRound className="w-3 h-3 mr-1" />
                            Pedirá cambiar clave al entrar
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[11px]"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Clave personal activa
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleForcePassword(u)}
                            className="h-7 px-2.5 text-[11px] border-purple-500/30 text-purple-300 hover:bg-purple-950/40"
                            title="Exigir o quitar cambio obligatorio de contraseña en su próximo login"
                          >
                            <KeyRound className="w-3 h-3 mr-1" />
                            {u.mustChangePassword ? "Quitar aviso clave" : "Exigir nueva clave"}
                          </Button>

                          {!isMainAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteUserRole(u)}
                              className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                              title="Eliminar perfil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modal para Crear / Vincular Usuario de Firebase Auth con Rol */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#120c19] border border-purple-500/40 rounded-2xl w-full max-w-lg p-6 shadow-[0_0_50px_rgba(168,85,247,0.25)] relative space-y-4">
            <div className="flex items-center justify-between border-b border-[#24192d] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Crear o Vincular Usuario con Rol</h3>
                  <p className="text-xs text-zinc-400">
                    Crea la cuenta en Firebase Authentication o asigna rol a un correo existente
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUserWithRole} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Nombre Completo *</label>
                <Input
                  required
                  placeholder="Ej: Profesor Carlos Díaz / Coordinadora Laura"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="bg-[#070709] border-[#2b1e36] text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Correo Electrónico (Login) *
                  </label>
                  <Input
                    required
                    type="email"
                    placeholder="usuario@soul.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-[#070709] border-[#2b1e36] text-white"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Contraseña Inicial *
                  </label>
                  <Input
                    required
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-[#070709] border-[#2b1e36] text-pink-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1.5">
                  Selecciona el Rol y Nivel de Acceso *
                </label>
                <div className="space-y-2">
                  {(["coach", "management", "admin"] as SystemRole[]).map((rOpt) => {
                    const info = ROLE_INFO[rOpt];
                    const selected = formData.role === rOpt;
                    return (
                      <div
                        key={rOpt}
                        onClick={() => setFormData({ ...formData, role: rOpt })}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          selected
                            ? "bg-purple-950/40 border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                            : "bg-[#070709] border-[#24192d] hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">{info.label}</span>
                          {selected && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">{info.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#070709] border border-[#2b1e36] cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.mustChangePassword}
                  onChange={(e) => setFormData({ ...formData, mustChangePassword: e.target.checked })}
                  className="rounded border-purple-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-white block">
                    Exigir cambio de contraseña en su primer inicio de sesión
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Cuando ingrese con "{formData.password}", el sistema le pedirá crear su propia clave privada.
                  </span>
                </div>
              </label>

              <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl flex items-start gap-2 text-[11px] text-purple-200">
                <Lock className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <span>
                  Si ya habías agregado este correo manualmente en el panel de <strong>Firebase Authentication</strong>, el sistema lo detectará automáticamente y le vinculará este rol sin duplicarlo.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#24192d]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-gradient-to-r from-[#7e1236] to-[#581c87] hover:from-[#961742] hover:to-[#6b21a8] text-white"
                >
                  {submitting ? "Guardando en Firebase..." : "Guardar Usuario y Rol"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
