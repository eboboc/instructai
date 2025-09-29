import { AnyClassPlan } from '@/types/timer';
import { auth, db, saveWorkout, getUserWorkouts, deleteWorkout } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, deleteDoc, Timestamp } from 'firebase/firestore';

export interface SavedClass {
  id: string;
  name: string;
  createdAt: string;
  plan: AnyClassPlan;
  format: string;
  duration: number;
  userId?: string;
}

const SAVED_CLASSES_KEY = 'saved_classes';

export class SavedClassesService {
  /**
   * Save a class workout to storage (Firebase if authenticated, localStorage if not)
   */
  static async saveClass(plan: AnyClassPlan, format: string): Promise<SavedClass> {
    const currentUser = auth.currentUser;
    const name = this.getClassPlanName(plan);
    const duration = this.getClassPlanDuration(plan);
    
    // If user is authenticated, save to Firebase
    if (currentUser) {
      try {
        const workoutData = {
          name,
          plan,
          format,
          duration,
          userId: currentUser.uid,
          createdAt: new Date().toISOString()
        };
        
        const result = await saveWorkout(currentUser.uid, workoutData);
        
        if (result.success && result.id) {
          return {
            id: result.id,
            name,
            createdAt: new Date().toISOString(),
            plan,
            format,
            duration,
            userId: currentUser.uid
          };
        } else {
          throw new Error(result.error || 'Failed to save workout to database');
        }
      } catch (error) {
        console.error('Error saving workout to Firebase:', error);
        // Fall back to local storage if Firebase fails
        return this.saveToLocalStorage(plan, format);
      }
    } else {
      // If not authenticated, save to local storage
      return this.saveToLocalStorage(plan, format);
    }
  }
  
  /**
   * Save a class workout to local storage
   */
  static saveToLocalStorage(plan: AnyClassPlan, format: string): SavedClass {
    // Get existing saved classes
    const savedClasses = this.getLocalSavedClasses();
    
    // Create a new saved class object
    const newClass: SavedClass = {
      id: crypto.randomUUID(), // Generate a unique ID
      name: this.getClassPlanName(plan),
      createdAt: new Date().toISOString(),
      plan,
      format,
      duration: this.getClassPlanDuration(plan)
    };
    
    // Add to saved classes
    savedClasses.push(newClass);
    
    // Save back to local storage
    localStorage.setItem(SAVED_CLASSES_KEY, JSON.stringify(savedClasses));
    
    return newClass;
  }
  
  /**
   * Get all saved classes (from Firebase if authenticated, localStorage if not)
   */
  static async getSavedClasses(): Promise<SavedClass[]> {
    const currentUser = auth.currentUser;
    
    // If user is authenticated, fetch from Firebase
    if (currentUser) {
      try {
        const result = await getUserWorkouts(currentUser.uid);
        
        if (result.error) {
          console.error('Error fetching workouts from Firebase:', result.error);
          // Fall back to local storage if Firebase fails
          return this.getLocalSavedClasses();
        }
        
        return result.data.map(workout => ({
          id: workout.id,
          name: workout.name || this.getClassPlanName(workout.plan),
          createdAt: workout.createdAt || new Date().toISOString(),
          plan: workout.plan,
          format: workout.format || '',
          duration: workout.duration || this.getClassPlanDuration(workout.plan),
          userId: workout.userId
        }));
      } catch (error) {
        console.error('Error fetching workouts from Firebase:', error);
        // Fall back to local storage if Firebase fails
        return this.getLocalSavedClasses();
      }
    } else {
      // If not authenticated, fetch from local storage
      return this.getLocalSavedClasses();
    }
  }
  
  /**
   * Get saved classes from local storage
   */
  static getLocalSavedClasses(): SavedClass[] {
    const savedClassesJson = localStorage.getItem(SAVED_CLASSES_KEY);
    if (!savedClassesJson) return [];
    
    try {
      return JSON.parse(savedClassesJson);
    } catch (error) {
      console.error('Error parsing saved classes:', error);
      return [];
    }
  }
  
  /**
   * Delete a saved class
   */
  static async deleteClass(id: string): Promise<boolean> {
    const currentUser = auth.currentUser;
    
    // If user is authenticated, delete from Firebase
    if (currentUser) {
      try {
        const result = await deleteWorkout(id);
        return result.success;
      } catch (error) {
        console.error('Error deleting workout from Firebase:', error);
        // Fall back to local storage if Firebase fails
        return this.deleteLocalClass(id);
      }
    } else {
      // If not authenticated, delete from local storage
      return this.deleteLocalClass(id);
    }
  }
  
  /**
   * Delete a saved class from local storage
   */
  static deleteLocalClass(id: string): boolean {
    const savedClasses = this.getLocalSavedClasses();
    const updatedClasses = savedClasses.filter(c => c.id !== id);
    
    if (updatedClasses.length !== savedClasses.length) {
      localStorage.setItem(SAVED_CLASSES_KEY, JSON.stringify(updatedClasses));
      return true;
    }
    
    return false;
  }
  
  /**
   * Get a saved class by ID
   */
  static async getClassById(id: string): Promise<SavedClass | undefined> {
    const currentUser = auth.currentUser;
    
    // If user is authenticated, fetch from Firebase
    if (currentUser) {
      try {
        // First check if it's in the user's workouts
        const workouts = await this.getSavedClasses();
        const workout = workouts.find(w => w.id === id);
        
        if (workout) {
          return workout;
        }
        
        return undefined;
      } catch (error) {
        console.error('Error fetching workout from Firebase:', error);
        // Fall back to local storage if Firebase fails
        return this.getLocalClassById(id);
      }
    } else {
      // If not authenticated, fetch from local storage
      return this.getLocalClassById(id);
    }
  }
  
  /**
   * Get a saved class by ID from local storage
   */
  static getLocalClassById(id: string): SavedClass | undefined {
    const savedClasses = this.getLocalSavedClasses();
    return savedClasses.find(c => c.id === id);
  }
  
  /**
   * Helper to get class name from plan
   */
  private static getClassPlanName(plan: AnyClassPlan): string {
    if ('metadata' in plan && plan.metadata?.class_name) {
      return plan.metadata.class_name;
    }
    
    if ('class_name' in plan && plan.class_name) {
      return plan.class_name;
    }
    
    return `Workout ${new Date().toLocaleDateString()}`;
  }
  
  /**
   * Helper to get class duration from plan in minutes
   */
  private static getClassPlanDuration(plan: AnyClassPlan): number {
    if ('metadata' in plan && plan.metadata?.duration_min) {
      return plan.metadata.duration_min;
    }
    
    if ('total_duration' in plan && plan.total_duration) {
      const duration = typeof plan.total_duration === 'string' 
        ? parseInt(plan.total_duration, 10) 
        : plan.total_duration;
      
      return Math.round(duration / 60); // Convert seconds to minutes
    }
    
    return 0;
  }
}
