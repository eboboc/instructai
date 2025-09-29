// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, Timestamp, limit } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import * as logger from '@/utils/logger';

// Check if Firebase configuration is valid
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

if (!apiKey || apiKey === 'placeholder-api-key' || !authDomain || !projectId) {
  console.error(
    'Firebase configuration is missing or using placeholder values.\n' +
    'Please update your .env file with valid Firebase configuration values.\n' +
    'You can find these values in your Firebase project settings.'
  );
}

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app;
let auth;
let db;
let storage;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  logger.info('Firebase', 'Firebase initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error);
  logger.error('Firebase', 'Error initializing Firebase', { error: String(error) });
  
  // Create mock implementations for development without Firebase
  logger.info('Firebase', 'Creating mock implementations for Firebase');
  
  // Mock auth object with localStorage persistence
  const mockCurrentUser = localStorage.getItem('mockUser') 
    ? JSON.parse(localStorage.getItem('mockUser') || 'null')
    : null;
    
  auth = {
    currentUser: mockCurrentUser,
    onAuthStateChanged: (callback: any) => {
      // Call immediately with current state
      callback(mockCurrentUser);
      
      // Set up storage event listener to detect changes
      const storageListener = (event: StorageEvent) => {
        if (event.key === 'mockUser') {
          const user = event.newValue ? JSON.parse(event.newValue) : null;
          callback(user);
        }
      };
      
      window.addEventListener('storage', storageListener);
      return () => window.removeEventListener('storage', storageListener);
    }
  } as any;
  
  // Mock db and storage
  db = {} as any;
  storage = {} as any;
  
  // Override the Firebase initialization flag
  Object.defineProperty(window, 'usingMockFirebase', {
    value: true,
    writable: false
  });
}

// Flag to track if Firebase is properly initialized
const isFirebaseInitialized = (!!auth && typeof auth.currentUser !== 'undefined') && !(window as any).usingMockFirebase;

// Authentication functions
export const registerUser = async (email: string, password: string) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to register user but Firebase is not initialized');
    return { user: null, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    logger.info('Firebase', 'User registered successfully', { email });
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error registering user', { email, error: error.message });
    return { user: null, error: error.message };
  }
};

export const loginUser = async (email: string, password: string) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to login user but Firebase is not initialized');
    return { user: null, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    logger.info('Firebase', 'User logged in successfully', { email });
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error logging in user', { email, error: error.message });
    return { user: null, error: error.message };
  }
};

export const logoutUser = async () => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to logout user but Firebase is not initialized');
    return { success: false, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    await signOut(auth);
    logger.info('Firebase', 'User logged out successfully');
    return { success: true, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error logging out user', { error: error.message });
    return { success: false, error: error.message };
  }
};

export const resetPassword = async (email: string) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to reset password but Firebase is not initialized');
    return { success: false, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    await sendPasswordResetEmail(auth, email);
    logger.info('Firebase', 'Password reset email sent', { email });
    return { success: true, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error sending password reset email', { email, error: error.message });
    return { success: false, error: error.message };
  }
};

// User profile functions
export const createUserProfile = async (userId: string, userData: any) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to create user profile but Firebase is not initialized');
    return { success: false, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    await setDoc(doc(db, 'users', userId), {
      ...userData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      role: 'user' // Default role
    });
    logger.info('Firebase', 'User profile created', { userId });
    return { success: true, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error creating user profile', { userId, error: error.message });
    return { success: false, error: error.message };
  }
};

export const getUserProfile = async (userId: string) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to get user profile but Firebase is not initialized');
    return { data: null, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      logger.info('Firebase', 'User profile retrieved', { userId });
      return { data: { id: docSnap.id, ...docSnap.data() }, error: null };
    } else {
      logger.warn('Firebase', 'User profile not found', { userId });
      return { data: null, error: 'User profile not found' };
    }
  } catch (error: any) {
    logger.error('Firebase', 'Error getting user profile', { userId, error: error.message });
    return { data: null, error: error.message };
  }
};

export const updateUserProfile = async (userId: string, userData: any) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to update user profile but Firebase is not initialized');
    return { success: false, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...userData,
      updatedAt: Timestamp.now()
    });
    logger.info('Firebase', 'User profile updated', { userId });
    return { success: true, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error updating user profile', { userId, error: error.message });
    return { success: false, error: error.message };
  }
};

// Workout functions
export const saveWorkout = async (userId: string, workout: any) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to save workout but Firebase is not initialized');
    return { success: false, id: null, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  if (!userId) {
    logger.error('Firebase', 'Cannot save workout without a user ID');
    return { success: false, id: null, error: 'User must be logged in to save workouts' };
  }
  
  try {
    logger.debug('Firebase', 'Starting workout save process', { userId });
    
    // Check if Firestore is accessible
    try {
      await getDocs(query(collection(db, 'workouts'), limit(1)));
      logger.debug('Firebase', 'Firestore is accessible');
    } catch (firestoreError: any) {
      logger.error('Firebase', 'Firestore access error', { error: firestoreError.message });
      return { success: false, id: null, error: `Firestore access error: ${firestoreError.message}` };
    }
    
    // Create a new document reference
    const workoutRef = doc(collection(db, 'workouts'));
    logger.debug('Firebase', 'Created workout document reference', { workoutId: workoutRef.id });
    
    // Prepare workout data
    const workoutData = {
      ...workout,
      userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    // Save to Firestore
    logger.debug('Firebase', 'Attempting to save workout data', { workoutId: workoutRef.id });
    await setDoc(workoutRef, workoutData);
    
    logger.info('Firebase', 'Workout saved successfully', { userId, workoutId: workoutRef.id });
    return { success: true, id: workoutRef.id, error: null };
  } catch (error: any) {
    console.error('Firebase error saving workout:', error);
    logger.error('Firebase', 'Error saving workout', { userId, error: error.message, stack: error.stack });
    return { success: false, id: null, error: error.message };
  }
};

export const getUserWorkouts = async (userId: string) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to get user workouts but Firebase is not initialized');
    return { data: [], error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    const q = query(collection(db, 'workouts'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const workouts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    logger.info('Firebase', 'User workouts retrieved', { userId, count: workouts.length });
    return { data: workouts, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error getting user workouts', { userId, error: error.message });
    return { data: [], error: error.message };
  }
};

export const deleteWorkout = async (workoutId: string) => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to delete workout but Firebase is not initialized');
    return { success: false, error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    await deleteDoc(doc(db, 'workouts', workoutId));
    logger.info('Firebase', 'Workout deleted', { workoutId });
    return { success: true, error: null };
  } catch (error: any) {
    logger.error('Firebase', 'Error deleting workout', { workoutId, error: error.message });
    return { success: false, error: error.message };
  }
};

// Admin functions
export const getAllUsers = async () => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to get all users but Firebase is not initialized');
    return { data: [], error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    // First check if we can access the Firestore database
    try {
      // Simple test query to check if Firestore is accessible
      await getDocs(query(collection(db, 'users'), limit(1)));
    } catch (dbError: any) {
      logger.error('Firebase', 'Firestore database access error', { error: dbError.message });
      return { 
        data: [], 
        error: 'Cannot access Firestore database. Make sure the database exists and you have proper permissions.' 
      };
    }
    
    // Try to get the users collection
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const users = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      logger.info('Firebase', 'All users retrieved', { count: users.length });
      return { data: users, error: null };
    } catch (queryError: any) {
      // Check for specific Firestore errors
      if (queryError.code === 'permission-denied') {
        logger.error('Firebase', 'Permission denied accessing users collection', { error: queryError.message });
        return { 
          data: [], 
          error: 'Permission denied: You do not have access to the users collection. Make sure you are logged in as an admin.' 
        };
      } else if (queryError.code === 'not-found') {
        logger.error('Firebase', 'Users collection not found', { error: queryError.message });
        return { 
          data: [], 
          error: 'The users collection does not exist yet. It will be created when the first user registers.' 
        };
      } else {
        logger.error('Firebase', 'Error getting all users', { error: queryError.message, code: queryError.code });
        return { data: [], error: queryError.message };
      }
    }
  } catch (error: any) {
    logger.error('Firebase', 'Unexpected error getting all users', { error: error.message, stack: error.stack });
    return { data: [], error: `Unexpected error: ${error.message}` };
  }
};

export const getAllWorkouts = async () => {
  if (!isFirebaseInitialized) {
    logger.warn('Firebase', 'Attempted to get all workouts but Firebase is not initialized');
    return { data: [], error: 'Firebase is not properly configured. Please check your environment variables.' };
  }
  
  try {
    // Try to get the workouts collection
    try {
      const querySnapshot = await getDocs(collection(db, 'workouts'));
      const workouts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      logger.info('Firebase', 'All workouts retrieved', { count: workouts.length });
      return { data: workouts, error: null };
    } catch (queryError: any) {
      // Check for specific Firestore errors
      if (queryError.code === 'permission-denied') {
        logger.error('Firebase', 'Permission denied accessing workouts collection', { error: queryError.message });
        return { 
          data: [], 
          error: 'Permission denied: You do not have access to the workouts collection. Make sure you are logged in as an admin.' 
        };
      } else if (queryError.code === 'not-found') {
        logger.error('Firebase', 'Workouts collection not found', { error: queryError.message });
        return { 
          data: [], 
          error: 'The workouts collection does not exist yet. It will be created when the first workout is saved.' 
        };
      } else {
        logger.error('Firebase', 'Error getting all workouts', { error: queryError.message, code: queryError.code });
        return { data: [], error: queryError.message };
      }
    }
  } catch (error: any) {
    logger.error('Firebase', 'Unexpected error getting all workouts', { error: error.message, stack: error.stack });
    return { data: [], error: `Unexpected error: ${error.message}` };
  }
};

export { auth, db, storage };
export type { User };

