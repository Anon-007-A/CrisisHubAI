import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext();
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const demoUser = {
  uid: 'demo-operator-123',
  email: 'operator@aegis-crisis.hub',
  displayName: 'Operator Alpha',
  role: 'operator',
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => (DEMO_MODE ? demoUser : null));
  const [loading, setLoading] = useState(() => !DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = (email, password) => {
    if (DEMO_MODE) return Promise.resolve();
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    if (DEMO_MODE) return Promise.resolve();
    return signOut(auth);
  };

  const value = {
    currentUser,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
