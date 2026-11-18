import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, resolveDatabaseAccount, saveActiveSession, getActiveSession } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuthStore } from "@/store/authStore";

// Pages & Components
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Layout from "@/components/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";

import Athletes from "@/pages/Athletes";
import Groups from "@/pages/Groups";
import Coaches from "@/pages/Coaches";
import Attendance from "@/pages/Attendance";
import Finances from "@/pages/Finances";
import Prospects from "@/pages/Prospects";
import PaymentNotifications from "@/pages/PaymentNotifications";
import AthletePaymentPortal from "@/pages/AthletePaymentPortal";
import PortalPagosWompi from "@/pages/PortalPagosWompi";
import EnrollmentWizard from "@/pages/EnrollmentWizard";
import Inventory from "@/pages/Inventory";
import Tournaments from "@/pages/Tournaments";
import MarketingCMSView from "@/pages/MarketingCMSView";
import CatalogoDisenosSoul from "@/pages/CatalogoDisenosSoul";
import ClassPlanner from "@/pages/ClassPlanner";

function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const cleanEmail = (user.email || "").trim().toLowerCase();
          const accountInfo = await resolveDatabaseAccount(cleanEmail, user.uid);

          // Intentar sincronizar registro en Firestore de forma no bloqueante
          try {
            await setDoc(
              doc(db, "users", user.uid),
              {
                uid: user.uid,
                email: cleanEmail,
                displayName: accountInfo.displayName || user.displayName || cleanEmail.split("@")[0],
                role: accountInfo.role,
                mustChangePassword: accountInfo.mustChangePassword,
                createdAt: serverTimestamp()
              },
              { merge: true }
            );
          } catch {
            // Ignorar si las reglas de Firestore están restringidas
          }

          saveActiveSession(user, accountInfo.role, accountInfo.mustChangePassword);
          setUser(user, accountInfo.role, accountInfo.mustChangePassword);
        } catch (error) {
          console.error("Error fetching user role:", error);
          const fallbackRole = user.email?.toLowerCase() === "andirojas0821@gmail.com" ? "admin" : "coach";
          saveActiveSession(user, fallbackRole, false);
          setUser(user, fallbackRole, false);
        }
      } else {
        // Verificar si existe una sesión activa de cuenta de base de datos
        const savedSession = getActiveSession();
        if (savedSession) {
          setUser(savedSession.user, savedSession.role, savedSession.mustChangePassword);
        } else {
          setUser(null, null, false);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes for All Authenticated Staff */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            {/* Rutas compartidas (Dashboard, Grupos, Asistencia, Planificador, Inventario de Cancha) */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/planner" element={<ClassPlanner />} />
            <Route path="/planificador" element={<Navigate to="/planner" replace />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventario" element={<Navigate to="/inventory" replace />} />

            {/* Rutas exclusivas para Administradores / Gestión */}
            <Route element={<ProtectedRoute allowedRoles={["admin", "management"]} />}>
              <Route path="/prospects" element={<Prospects />} />
              <Route path="/athletes" element={<Athletes />} />
              <Route path="/plans" element={<Navigate to="/dashboard" replace />} />
              <Route path="/payment-notifications" element={<PaymentNotifications />} />
              <Route path="/portal-pagos" element={<Navigate to="/dashboard" replace />} />
              <Route path="/tournaments" element={<Tournaments />} />
              <Route path="/coaches" element={<Coaches />} />
              <Route path="/finances" element={<Finances />} />
              <Route path="/users-roles" element={<Navigate to="/dashboard" replace />} />
            </Route>

            {/* Ruta estrictamente exclusiva para Administrador Total o Rol Marketing (RBAC) */}
            <Route element={<ProtectedRoute allowedRoles={["admin", "marketing"]} />}>
              <Route path="/marketing" element={<MarketingCMSView />} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
        
        {/* Direct Public Athlete Payment Portal & Step-by-Step Enrollment Wizard */}
        <Route path="/inscripcion" element={<div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 text-slate-900 px-2.5 py-4 sm:p-8"><EnrollmentWizard /></div>} />
        <Route path="/pagos" element={<PortalPagosWompi />} />
        <Route path="/pagos-portal" element={<div className="min-h-screen bg-zinc-950 px-2.5 py-3 sm:p-6"><AthletePaymentPortal /></div>} />
        <Route path="/catalogo" element={<CatalogoDisenosSoul />} />
        <Route path="/disenos" element={<CatalogoDisenosSoul />} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
