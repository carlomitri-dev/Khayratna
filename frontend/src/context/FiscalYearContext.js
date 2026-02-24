import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const FiscalYearContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const FiscalYearProvider = ({ children }) => {
  const { currentOrg, token } = useAuth();
  const [fiscalYears, setFiscalYears] = useState([]);
  const [selectedFY, setSelectedFY] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchFiscalYears = useCallback(async () => {
    if (!currentOrg?.id || !token) {
      setFiscalYears([]);
      setSelectedFY(null);
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.get(`${API}/fiscal-years?organization_id=${currentOrg.id}`);
      const fys = response.data || [];
      setFiscalYears(fys);
      
      // Restore previously selected FY from localStorage, or pick the first open one
      const savedFYId = localStorage.getItem(`selectedFY_${currentOrg.id}`);
      const savedFY = fys.find(fy => fy.id === savedFYId);
      
      if (savedFY) {
        setSelectedFY(savedFY);
      } else {
        // Default to the first open FY, or the most recent one
        const openFY = fys.find(fy => fy.status === 'open');
        setSelectedFY(openFY || fys[0] || null);
        if (openFY || fys[0]) {
          localStorage.setItem(`selectedFY_${currentOrg.id}`, (openFY || fys[0]).id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch fiscal years:', error);
      setFiscalYears([]);
      setSelectedFY(null);
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id, token]);

  useEffect(() => {
    fetchFiscalYears();
  }, [fetchFiscalYears]);

  const switchFiscalYear = (fy) => {
    setSelectedFY(fy);
    if (fy && currentOrg) {
      localStorage.setItem(`selectedFY_${currentOrg.id}`, fy.id);
    }
  };

  const clearSelection = () => {
    setSelectedFY(null);
    if (currentOrg) {
      localStorage.removeItem(`selectedFY_${currentOrg.id}`);
    }
  };

  return (
    <FiscalYearContext.Provider value={{
      fiscalYears,
      selectedFY,
      loading,
      switchFiscalYear,
      clearSelection,
      fetchFiscalYears,
      hasFiscalYears: fiscalYears.length > 0
    }}>
      {children}
    </FiscalYearContext.Provider>
  );
};

export const useFiscalYear = () => {
  const context = useContext(FiscalYearContext);
  if (!context) {
    throw new Error('useFiscalYear must be used within a FiscalYearProvider');
  }
  return context;
};
