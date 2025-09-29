import React from 'react';
import { Clock, Settings, BookOpen, LogIn, LogOut, User, ShieldCheck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logoutUser } from '../services/firebase';
import { toast } from '@/hooks/use-toast';

export const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isAdmin } = useAuth();

  const isActive = (path: string) => {
    if (path === '/app') {
      return location.pathname === '/app';
    }
    return location.pathname === path;
  };
  
  const handleLogout = async () => {
    try {
      const result = await logoutUser();
      if (result.success) {
        toast({
          title: "Logged Out",
          description: "You have been successfully logged out.",
        });
        navigate('/', { replace: true });
      } else {
        toast({
          title: "Logout Failed",
          description: result.error || "An error occurred during logout.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: "Logout Failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40">
      <div className="flex justify-center items-center h-16">
        <div className="flex space-x-6 md:space-x-8">
          <button 
            onClick={() => navigate('/app')}
            className={`flex flex-col items-center justify-center p-2 transition-colors ${
              isActive('/app') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-xs mt-1">My Timers</span>
          </button>
          
          <button 
            onClick={() => navigate('/saved-classes')}
            className={`flex flex-col items-center justify-center p-2 transition-colors ${
              isActive('/saved-classes') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-xs mt-1">Saved Classes</span>
          </button>
          
          
          <button 
            onClick={() => navigate('/profile')}
            className={`flex flex-col items-center justify-center p-2 transition-colors ${
              isActive('/profile') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-xs mt-1">Profile</span>
          </button>
          
          {isAdmin && (
            <button 
              onClick={() => navigate('/admin')}
              className={`flex flex-col items-center justify-center p-2 transition-colors ${
                isActive('/admin') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xs mt-1">Admin</span>
            </button>
          )}
          
          {currentUser ? (
            <button 
              onClick={handleLogout}
              className="flex flex-col items-center justify-center p-2 transition-colors text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-xs mt-1">Logout</span>
            </button>
          ) : (
            <button 
              onClick={() => navigate('/login')}
              className={`flex flex-col items-center justify-center p-2 transition-colors ${
                isActive('/login') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LogIn className="w-5 h-5" />
              <span className="text-xs mt-1">Login</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};