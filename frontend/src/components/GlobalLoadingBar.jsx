import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const GlobalLoadingBar = () => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const activeRequests = useRef(0);
  const timerRef = useRef(null);
  const fadeTimerRef = useRef(null);

  const startProgress = useCallback(() => {
    setVisible(true);
    setProgress(15);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) { clearInterval(timerRef.current); return 90; }
        // Slow down as it gets higher
        const increment = prev < 50 ? 8 : prev < 70 ? 4 : 1;
        return Math.min(prev + increment, 90);
      });
    }, 300);
  }, []);

  const completeProgress = useCallback(() => {
    clearInterval(timerRef.current);
    setProgress(100);
    clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 350);
  }, []);

  useEffect(() => {
    const reqInterceptor = axios.interceptors.request.use(config => {
      // Skip loading bar for lightweight/polling requests
      if (config.headers?.['X-No-Loading']) return config;
      activeRequests.current += 1;
      if (activeRequests.current === 1) startProgress();
      return config;
    });

    const resInterceptor = axios.interceptors.response.use(
      response => {
        if (!response.config.headers?.['X-No-Loading']) {
          activeRequests.current = Math.max(0, activeRequests.current - 1);
          if (activeRequests.current === 0) completeProgress();
        }
        return response;
      },
      error => {
        if (!error.config?.headers?.['X-No-Loading']) {
          activeRequests.current = Math.max(0, activeRequests.current - 1);
          if (activeRequests.current === 0) completeProgress();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(reqInterceptor);
      axios.interceptors.response.eject(resInterceptor);
      clearInterval(timerRef.current);
      clearTimeout(fadeTimerRef.current);
    };
  }, [startProgress, completeProgress]);

  if (!visible && progress === 0) return null;

  return (
    <div
      data-testid="global-loading-bar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease'
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa, #93c5fd)',
          borderRadius: '0 2px 2px 0',
          transition: progress === 100 ? 'width 0.2s ease' : 'width 0.4s ease',
          boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)'
        }}
      />
    </div>
  );
};

export default GlobalLoadingBar;
