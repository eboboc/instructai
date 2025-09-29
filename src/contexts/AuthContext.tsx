import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, getUserProfile, User } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface UserData {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  [key: string]: any;
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  isAdmin: false,
  loading: true
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Fetch additional user data from Firestore
        const { data } = await getUserProfile(user.uid);
        if (data) {
          setUserData(data as UserData);
        } else {
          // If no profile exists, create minimal userData
          setUserData({
            id: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: 'user'
          });
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Check if user is an admin
  const isAdmin = userData?.role === 'admin';

  const value = {
    currentUser,
    userData,
    isAdmin,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
