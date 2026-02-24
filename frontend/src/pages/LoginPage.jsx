import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { AlertCircle, Loader2, Building2, CheckCircle } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    setLoadingOrgs(true);
    try {
      // Try to get organizations (public endpoint for login selection)
      const response = await axios.get(`${API}/organizations/public`);
      setOrganizations(response.data);
      if (response.data.length > 0) {
        setSelectedOrgId(response.data[0].id);
      }
    } catch (err) {
      // Organizations might not exist yet
      setOrganizations([]);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, selectedOrgId);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    setSeeding(true);
    setError('');
    setSuccess('');
    try {
      const response = await axios.post(`${API}/seed`);
      if (response.data.admin_email) {
        setEmail(response.data.admin_email);
        setPassword('admin123');
        setSuccess('Demo data created! Credentials filled automatically.');
        fetchOrganizations();
      }
    } catch (err) {
      if (err.response?.data?.message?.includes('already exists') || err.response?.data?.admin_email) {
        setEmail('admin@lebfinance.com');
        setPassword('admin123');
        setSuccess('Demo data exists. Credentials filled automatically.');
        fetchOrganizations();
      } else {
        setError('Failed to seed demo data');
      }
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen login-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            {/* KAIROS Logo */}
            <div className="w-16 h-16 sm:w-20 sm:h-20">
              <img 
                src="/kairos-logo.png" 
                alt="KAIROS Logo" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            KAIROS
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Digital Invoicing</p>
          <p className="text-muted-foreground/70 text-xs mt-0.5" dir="rtl">الفواتير الرقمية</p>
        </div>

        <Card className="bg-card/80 backdrop-blur-xl border-border">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg sm:text-xl" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Sign In
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm" data-testid="login-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm">{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 p-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-sm" data-testid="login-success">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm">{success}</span>
                </div>
              )}

              {organizations.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="organization" className="text-sm">Organization</Label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger data-testid="login-org-select" className="bg-background">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map(org => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name} ({org.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@lebfinance.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-background text-sm"
                  data-testid="login-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-background text-sm"
                  data-testid="login-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full btn-glow text-sm sm:text-base"
                disabled={loading}
                data-testid="login-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs sm:text-sm text-muted-foreground text-center mb-3">
                First time? Initialize demo data
              </p>
              <Button
                variant="outline"
                className="w-full text-sm"
                onClick={handleSeedData}
                disabled={seeding}
                data-testid="seed-data-btn"
              >
                {seeding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating demo data...
                  </>
                ) : (
                  'Load Demo Data'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4 sm:mt-6">
          Lebanese Chart of Accounts (LCOA) Compliant
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
