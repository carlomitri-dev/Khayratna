import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
      await fetchOrganizations();
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get(`${API}/organizations`);
      setOrganizations(response.data);
      if (response.data.length > 0) {
        const savedOrgId = localStorage.getItem('currentOrgId');
        const org = response.data.find(o => o.id === savedOrgId) || response.data[0];
        setCurrentOrg(org);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
  };

  const login = async (email, password, selectedOrgId = null) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    await fetchOrganizations();
    
    // If org was selected on login, switch to it
    if (selectedOrgId) {
      localStorage.setItem('currentOrgId', selectedOrgId);
    }
    
    return userData;
  };

  const register = async (email, password, name, role = 'viewer') => {
    const response = await axios.post(`${API}/auth/register`, { email, password, name, role });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    await fetchOrganizations();
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentOrgId');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
  };

  const switchOrganization = (org) => {
    setCurrentOrg(org);
    localStorage.setItem('currentOrgId', org.id);
  };

  const hasPermission = (requiredRoles) => {
    if (!user) return false;
    return requiredRoles.includes(user.role);
  };

  const canEdit = () => hasPermission(['super_admin', 'admin', 'accountant']);
  const canAdmin = () => hasPermission(['super_admin', 'admin']);
  const isSuperAdmin = () => hasPermission(['super_admin']);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      organizations,
      currentOrg,
      login,
      register,
      logout,
      switchOrganization,
      hasPermission,
      canEdit,
      canAdmin,
      isSuperAdmin,
      fetchOrganizations
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
