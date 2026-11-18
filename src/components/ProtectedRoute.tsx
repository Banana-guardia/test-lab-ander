import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import ForcePasswordChangeModal from "@/components/ForcePasswordChangeModal";

interface ProtectedRouteProps {
  allowedRoles?: Array<"admin" | "coach" | "management" | "marketing">;
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, role, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070709] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500/20 border-t-purple-400 rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 font-medium text-sm">Cargando SOUL Voley...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Si se definieron roles permitidos y el usuario no cumple
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Si un profesor intenta entrar a un módulo no permitido, redirigir a su Dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <ForcePasswordChangeModal />
      <Outlet />
    </>
  );
}
