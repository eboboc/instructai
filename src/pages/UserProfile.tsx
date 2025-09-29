import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from '@/components/BottomNavigation';
import UserProfileComponent from '@/components/auth/UserProfile';

const UserProfilePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
            className="p-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">Your Profile</h1>
        </div>
      </header>
      
      <main className="p-4 pb-20">
        <UserProfileComponent />
      </main>

      <BottomNavigation />
    </div>
  );
};

export default UserProfilePage;
