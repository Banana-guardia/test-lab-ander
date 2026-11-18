import { create } from 'zustand';
import type { User } from 'firebase/auth';

export type UserRole = 'admin' | 'coach' | 'management' | 'marketing' | null;

interface AuthState {
  user: User | null;
  role: UserRole;
  mustChangePassword: boolean;
  isLoading: boolean;
  setUser: (user: User | null, role?: UserRole, mustChangePassword?: boolean) => void;
  setMustChangePassword: (mustChange: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  mustChangePassword: false,
  isLoading: true,
  setUser: (user, role = null, mustChangePassword = false) => set({ user, role, mustChangePassword }),
  setMustChangePassword: (mustChangePassword) => set({ mustChangePassword }),
  setLoading: (isLoading) => set({ isLoading }),
}));
