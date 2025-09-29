import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

export const NavigationLogger = () => {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.group(`[NAV] Route Change: ${location.pathname}${location.search}${location.hash}`);
      console.trace('Navigation triggered');
      console.groupEnd();
    }
  }, [location]);

  return null;
};
