import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, UserPlus, ArrowRight } from 'lucide-react';

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // If user is already logged in, redirect to the main page
  React.useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-blue-500 to-purple-600 bg-clip-text text-transparent">
            Instruct AI (TEST)
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-12">
            The AI fitness bot that powers live group fitness classes.
          </p>

          <div className="space-y-4">
            <Button 
              onClick={() => navigate('/login')} 
              variant="outline" 
              size="lg" 
              className="w-full flex items-center justify-center gap-2 py-6"
            >
              <LogIn className="w-5 h-5" />
              <span>Log In</span>
            </Button>
            
            <Button 
              onClick={() => navigate('/signup')} 
              size="lg" 
              className="w-full flex items-center justify-center gap-2 py-6"
            >
              <UserPlus className="w-5 h-5" />
              <span>Create Account</span>
            </Button>
            
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
            
            <Button 
              onClick={() => navigate('/')} 
              variant="ghost" 
              className="w-full flex items-center justify-center gap-2"
            >
              <span>Continue as Guest</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Instruct AI. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Welcome;
