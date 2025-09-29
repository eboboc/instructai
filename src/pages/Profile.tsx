import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from '@/components/BottomNavigation';
import UserProfileComponent from '@/components/auth/UserProfile';
import { InstructorProfile } from '@/components/InstructorProfile';
import { PastClasses } from '@/components/PastClasses';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('account');

  // Use browser history to go back
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/app');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleBack}
            className="p-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">Profile & Settings</h1>
        </div>
      </header>
      
      <main className="p-4 pb-20">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="instructor">Instructor Settings</TabsTrigger>
            <TabsTrigger value="past-classes">Past Classes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="account" className="mt-0">
            <UserProfileComponent />
          </TabsContent>
          
          <TabsContent value="instructor" className="mt-0">
            <InstructorProfile />
          </TabsContent>
          
          <TabsContent value="past-classes" className="mt-0">
            <PastClasses />
          </TabsContent>
        </Tabs>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default ProfilePage;
