import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Store, User, Lock, Hash, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CashierLoginPage = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' or 'pin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if already logged in as cashier
    const token = localStorage.getItem('cashier_token');
    if (token) {
      navigate('/cashier-pos');
    }
    
    // Fetch organizations
    fetchOrganizations();
  }, [navigate]);

  const fetchOrganizations = async () => {
    try {
      const res = await axios.get(`${API}/organizations/public`);
      setOrganizations(res.data);
      if (res.data.length > 0) {
        setSelectedOrg(res.data[0].id);
      }
    } catch (error) {
      // Try fetching without public endpoint
      try {
        const res = await axios.get(`${API}/organizations`);
        setOrganizations(res.data);
        if (res.data.length > 0) {
          setSelectedOrg(res.data[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch organizations:', err);
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        organization_id: selectedOrg,
        email: email || undefined,
        password: loginMethod === 'password' ? password : undefined,
        pin: loginMethod === 'pin' ? pin : undefined,
      };

      const res = await axios.post(`${API}/cashier/login`, payload);
      
      // Store cashier token and user data separately from main app
      localStorage.setItem('cashier_token', res.data.token);
      localStorage.setItem('cashier_user', JSON.stringify(res.data.user));
      localStorage.setItem('cashier_org', selectedOrg);
      
      if (res.data.active_session) {
        localStorage.setItem('cashier_session', JSON.stringify(res.data.active_session));
      }

      navigate('/cashier-pos');
    } catch (error) {
      const detail = error.response?.data?.detail || 'Login failed';
      setError(typeof detail === 'string' ? detail : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const selectedOrgData = organizations.find(o => o.id === selectedOrg);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg mb-4">
            <Store className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">KAIROS POS</h1>
          <p className="text-gray-500 mt-1">Cashier Terminal</p>
        </div>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-center text-gray-700">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Organization Selector */}
              <div className="space-y-2">
                <Label className="text-gray-600 font-medium">Store / Organization</Label>
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger className="h-12 bg-white border-gray-200 focus:border-emerald-500 focus:ring-emerald-500 text-gray-900">
                    <SelectValue placeholder="Select store...">
                      {selectedOrgData?.name || 'Select store...'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {organizations.map(org => (
                      <SelectItem key={org.id} value={org.id} className="text-gray-900">
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Login Method Toggle */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setLoginMethod('password')}
                  className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                    loginMethod === 'password'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Lock className="w-4 h-4 inline-block mr-2" />
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod('pin')}
                  className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                    loginMethod === 'pin'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Hash className="w-4 h-4 inline-block mr-2" />
                  Quick PIN
                </button>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <Label className="text-gray-600 font-medium">Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="email"
                    placeholder="cashier@store.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 pl-10 bg-white border-gray-200 focus:border-emerald-500 focus:ring-emerald-500 text-gray-900"
                    required
                  />
                </div>
              </div>

              {/* Password/PIN Field */}
              {loginMethod === 'password' ? (
                <div className="space-y-2">
                  <Label className="text-gray-600 font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 pl-10 bg-white border-gray-200 focus:border-emerald-500 focus:ring-emerald-500 text-gray-900"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-gray-600 font-medium">PIN Code</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="password"
                      placeholder="Enter 4-6 digit PIN"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="h-12 pl-10 bg-white border-gray-200 focus:border-emerald-500 focus:ring-emerald-500 text-gray-900 text-center text-2xl tracking-widest"
                      maxLength={6}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading || !selectedOrg}
                className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-500/30"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  'Sign In to POS'
                )}
              </Button>
            </form>

            {/* Back to Main App Link */}
            <div className="mt-6 text-center">
              <a 
                href="/login" 
                className="text-sm text-gray-500 hover:text-emerald-600 transition-colors"
              >
                ← Back to Main Application
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-gray-400 text-sm">
          KAIROS Accounting System © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
};

export default CashierLoginPage;
