import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DebugPanel } from "./components/DebugPanel";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";

// Pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SavedClasses from "./pages/SavedClasses";
import Profile from "./pages/Profile";
import Welcome from "./pages/Welcome";
import ClassBuilder from "./pages/ClassBuilder";

// Auth Components
import Login from "./components/auth/Login";
import Signup from "./components/auth/Signup";
import ResetPassword from "./components/auth/ResetPassword";
import { NavigationLogger } from "./components/NavigationLogger";

// Admin Components
import AdminDashboard from "./components/admin/AdminDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          {import.meta.env.DEV && <NavigationLogger />}
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Welcome />} />
            <Route path="/app" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Protected Routes */}
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/class-builder" element={ <ProtectedRoute> <ClassBuilder /> </ProtectedRoute> } />
            <Route path="/saved-classes" element={
              <ProtectedRoute>
                <SavedClasses />
              </ProtectedRoute>
            } />
            
            {/* Admin Routes */}
            <Route path="/admin" element={
              <ProtectedRoute requireAdmin={true}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            
            {/* Catch-all Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <DebugPanel />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
