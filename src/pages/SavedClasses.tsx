import React from 'react';
import { SavedClasses as SavedClassesComponent } from '@/components/SavedClasses';
import { BottomNavigation } from '@/components/BottomNavigation';
import { SavedClass } from '@/services/savedClassesService';
import { useNavigate } from 'react-router-dom';

const SavedClassesPage: React.FC = () => {
  const navigate = useNavigate();
  
  const handleLoadClass = (savedClass: SavedClass) => {
    // Store the selected class in session storage
    sessionStorage.setItem('selected_class', JSON.stringify(savedClass));
    // Navigate to app page which will load the class
    navigate('/app');
  };
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Main content area */}
      <div className="flex-1 p-4 pb-20">
        <div className="w-full max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-blue-500 to-purple-600 bg-clip-text text-transparent">
              Saved Classes
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Your library of saved workouts.
            </p>
          </div>
          
          <SavedClassesComponent onLoadClass={handleLoadClass} />
        </div>
      </div>
      
      {/* Bottom Navigation - Always visible */}
      <BottomNavigation />
    </div>
  );
};

export default SavedClassesPage;
