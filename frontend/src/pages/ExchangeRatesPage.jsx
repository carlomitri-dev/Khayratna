import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DateInput } from '../components/ui/date-input';
import { RefreshCw, Plus, Clock, Globe, Edit } from 'lucide-react';
import axios from 'axios';
import { formatLBP, getTodayForInput, formatDate, formatDateTime } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ExchangeRatesPage = () => {
  const { currentOrg, canEdit } = useAuth();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveRate, setLiveRate] = useState(null);
  
  const [newRate, setNewRate] = useState({
    date: getTodayForInput(),
    rate: '',
    source: 'manual'
  });

  useEffect(() => {
    if (currentOrg) {
      fetchRates();
    }
  }, [currentOrg]);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/exchange-rates?organization_id=${currentOrg.id}`);
      setRates(response.data);
    } catch (error) {
      console.error('Failed to fetch rates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveRate = async () => {
    setFetchingLive(true);
    try {
      const response = await axios.get(`${API}/exchange-rates/live`);
      setLiveRate(response.data);
      setNewRate(prev => ({ ...prev, rate: response.data.rate, source: 'api' }));
    } catch (error) {
      console.error('Failed to fetch live rate:', error);
      alert('Failed to fetch live rate');
    } finally {
      setFetchingLive(false);
    }
  };

  const handleSaveRate = async (e) => {
    e.preventDefault();
    if (!newRate.rate) {
      alert('Please enter a rate');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/exchange-rates`, {
        date: newRate.date,
        rate: parseFloat(newRate.rate),
        source: newRate.source,
        organization_id: currentOrg.id
      });
      setNewRate({ date: getTodayForInput(), rate: '', source: 'manual' });
      setLiveRate(null);
      fetchRates();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save rate');
    } finally {
      setSaving(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="exchange-rates-page">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Exchange Rates
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage USD to LBP exchange rates for multi-currency transactions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Rate Display */}
        <Card className="lg:col-span-2" data-testid="current-rate-card">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <p className="text-sm text-muted-foreground uppercase tracking-wider">Current Exchange Rate</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-bold font-mono text-primary" data-testid="current-rate-value">
                    {formatLBP(rates[0]?.rate || currentOrg.base_exchange_rate)}
                  </span>
                  <span className="text-lg text-muted-foreground">LBP / USD</span>
                </div>
                {rates[0] && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated: {formatDate(rates[0].date)} ({rates[0].source})
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={fetchLiveRate}
                  disabled={fetchingLive}
                  data-testid="fetch-live-rate-btn"
                >
                  <Globe className={`w-4 h-4 mr-2 ${fetchingLive ? 'animate-spin' : ''}`} />
                  {fetchingLive ? 'Fetching...' : 'Fetch Live Rate'}
                </Button>
              </div>
            </div>

            {liveRate && (
              <div className="mt-4 p-4 bg-primary/10 border border-primary/20 rounded-sm" data-testid="live-rate-result">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Live Rate from API</p>
                    <p className="text-2xl font-bold font-mono text-primary">
                      {formatLBP(liveRate.rate)} LBP
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Source: {liveRate.source}</p>
                    <p>{formatDateTime(liveRate.timestamp)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add New Rate */}
        {canEdit() && (
          <Card data-testid="add-rate-form">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                <Plus className="w-5 h-5" />
                Set New Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveRate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <DateInput
                    value={newRate.date}
                    onChange={(e) => setNewRate({ ...newRate, date: e.target.value })}
                    data-testid="rate-date-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Rate (LBP per 1 USD)</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 89500"
                    value={newRate.rate}
                    onChange={(e) => setNewRate({ ...newRate, rate: e.target.value, source: 'manual' })}
                    className="font-mono text-lg"
                    data-testid="rate-value-input"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {newRate.source === 'api' ? (
                    <>
                      <Globe className="w-3 h-3" />
                      <span>From live API</span>
                    </>
                  ) : (
                    <>
                      <Edit className="w-3 h-3" />
                      <span>Manual entry</span>
                    </>
                  )}
                </div>

                <Button type="submit" className="w-full btn-glow" disabled={saving} data-testid="save-rate-btn">
                  {saving ? 'Saving...' : 'Save Rate'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Rate History */}
        <Card className={canEdit() ? '' : 'lg:col-span-2'} data-testid="rate-history">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
              <Clock className="w-5 h-5" />
              Rate History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="spinner" />
              </div>
            ) : rates.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No exchange rates recorded yet
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {rates.map((rate, index) => (
                  <div
                    key={rate.id}
                    className={`flex items-center justify-between p-3 rounded-sm border ${
                      index === 0 ? 'bg-primary/10 border-primary/30' : 'bg-muted/20 border-border'
                    }`}
                    data-testid={`rate-row-${index}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{formatDate(rate.date)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {rate.source === 'api' ? (
                          <span className="flex items-center gap-1 text-xs text-blue-400">
                            <Globe className="w-3 h-3" />
                            API
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-amber-400">
                            <Edit className="w-3 h-3" />
                            Manual
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold font-mono">
                        {formatLBP(rate.rate)}
                      </p>
                      <p className="text-xs text-muted-foreground">LBP / USD</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExchangeRatesPage;
