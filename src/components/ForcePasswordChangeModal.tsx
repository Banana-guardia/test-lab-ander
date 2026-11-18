import { useState } from "react";
import { auth, db, clearActiveSession, saveActiveSession } from "@/lib/firebase";
import { updatePassword, signOut } from "firebase/auth";
import { doc, setDoc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Lock, LogOut, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ForcePasswordChangeModal() {
  const { user, role, mustChangePassword, setMustChangePassword, setUser } = useAuthStore();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  if (!mustChangePassword || !user) {
    return null;
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (newPassword === "Soul2026*") {
      setError("Por favor elige una contraseña distinta a la provisional 'Soul2026*'.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden. Por favor verifícalas.");
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = (user.email || "").trim().toLowerCase();

      // 1. Actualizar contraseña en Firebase Auth si hay usuario activo de Firebase
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
      }

      // 2. Actualizar bandera en Firestore de forma no bloqueante (crea o actualiza)
      try {
        const userRef = doc(db, "users", user.uid);
        await setDoc(
          userRef,
          {
            uid: user.uid,
            email: cleanEmail,
            displayName: user.displayName || cleanEmail.split("@")[0],
            role: role || "coach",
            mustChangePassword: false,
            passwordUpdatedAt: serverTimestamp()
          },
          { merge: true }
        );

        if (cleanEmail) {
          const sameEmailSnap = await getDocs(
            query(collection(db, "users"), where("email", "==", cleanEmail))
          );
          await Promise.all(
            sameEmailSnap.docs.map((d) =>
              setDoc(
                doc(db, "users", d.id),
                { mustChangePassword: false, passwordUpdatedAt: serverTimestamp() },
                { merge: true }
              )
            )
          );
        }
      } catch {
        // Ignorar si las reglas de Firestore están restringidas
      }

      // 3. Guardar respaldo local de cambio de clave
      try {
        if (cleanEmail) {
          localStorage.setItem(`soul_password_changed_${cleanEmail}`, "true");
          const customPasswords = JSON.parse(localStorage.getItem("soul_user_passwords") || "{}");
          customPasswords[cleanEmail] = newPassword;
          localStorage.setItem("soul_user_passwords", JSON.stringify(customPasswords));

          const localUsers = JSON.parse(localStorage.getItem("soul_local_users") || "[]");
          const updatedLocalUsers = Array.isArray(localUsers)
            ? localUsers.map((u: any) =>
                (u.email || "").trim().toLowerCase() === cleanEmail
                  ? { ...u, mustChangePassword: false }
                  : u
              )
            : [];
          localStorage.setItem("soul_local_users", JSON.stringify(updatedLocalUsers));
        }
        saveActiveSession(user, role, false);
      } catch {}

      setSuccess(true);
      setTimeout(() => {
        setMustChangePassword(false);
      }, 1200);
    } catch (err: any) {
      console.error("Error al actualizar contraseña:", err);
      if (err.code === "auth/requires-recent-login") {
        setError("La sesión ha expirado. Por favor cierra sesión e ingresa nuevamente para cambiar tu clave.");
      } else {
        setError(err.message || "No se pudo actualizar la contraseña. Inténtalo de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    clearActiveSession();
    try {
      await signOut(auth);
    } catch {}
    setUser(null, null, false);
    navigate("/login");
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <Card className="w-full max-w-md border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 shadow-xl">
        <CardHeader className="text-center pb-4 pt-6">
          <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100 flex items-center justify-center gap-2">
            <span>Actualización de Contraseña</span>
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-zinc-400 text-sm mt-1.5 leading-relaxed">
            Has iniciado sesión con una clave provisional. Por seguridad de tu cuenta, define tu <strong className="text-slate-900 dark:text-zinc-100">contraseña personal</strong>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg flex items-start gap-2 text-rose-700 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg flex items-center gap-3 text-emerald-700 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">¡Contraseña actualizada con éxito!</p>
                <p className="text-xs opacity-80">Entrando al panel...</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-slate-700 dark:text-zinc-300 text-xs font-medium">Nueva Contraseña (mínimo 6 caracteres)</Label>
                <div className="relative">
                  <Input
                    id="new-pass"
                    type={showPassword ? "text" : "password"}
                    placeholder="Tu nueva clave segura"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-slate-700 dark:text-zinc-300 text-xs font-medium">Confirmar Contraseña</Label>
                <Input
                  id="confirm-pass"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repite tu nueva clave"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-semibold shadow-sm"
                >
                  {loading ? "Guardando..." : "Guardar Contraseña y Continuar"}
                </Button>

                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={handleLogout}
                  className="w-full text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 text-xs flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Cerrar Sesión por ahora
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
