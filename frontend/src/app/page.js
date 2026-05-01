'use client';
import React, { useState, useEffect } from 'react';
import { Camera, Power, Activity, LayoutGrid, AlertCircle, Trash2, MapPin, Clock, Database } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend
} from 'recharts';
import Heatmap from './components/Heatmap';

const API_BASE_URL = 'http://localhost:8000/det';

const COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Dashboard() {
  const [stats, setStats] = useState({
    active_cameras: [],
    recent_history: []
  });
  const [globalStreamActive, setGlobalStreamActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  
  // Camera Form State
  const [newCameraIp, setNewCameraIp] = useState('');
  const [addingCamera, setAddingCamera] = useState(false);
  const [cameraMsg, setCameraMsg] = useState('');
  const [registeredCameras, setRegisteredCameras] = useState([]);

  // Fetch registered cameras
  const fetchCameras = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/cam/ip-addresses/`);
      if (res.ok) {
        const data = await res.json();
        setRegisteredCameras(data);
      }
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    }
  };

  const handleDeleteCamera = async (camId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/cam/ip-addresses/${camId}/`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        setRegisteredCameras(prev => prev.filter(c => c.id !== camId));
      }
    } catch (err) {
      console.error('Failed to delete camera:', err);
    }
  };

  useEffect(() => { fetchCameras(); }, []);

  // Global Filter State
  const [filterSpecies, setFilterSpecies] = useState('ALL');
  const [filterBehavior, setFilterBehavior] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Compute unique dropdown options from live stats
  const uniqueSpeciesFromHist = [...new Set(stats.recent_history.map(item => item.species?.toUpperCase()).filter(Boolean))];

  // Behavior options scoped to selected species
  const filteredHistoryForBehavior = filterSpecies === 'ALL'
    ? stats.recent_history
    : stats.recent_history.filter(item => item.species?.toUpperCase() === filterSpecies);
  const uniqueBehaviorsFromHist = [...new Set(filteredHistoryForBehavior.map(item => item.behaviour?.toUpperCase()).filter(Boolean))];

  const availableSpecies = ['ALL', ...uniqueSpeciesFromHist];
  const availableBehaviors = ['ALL', ...uniqueBehaviorsFromHist];

  // Reset behavior filter when species changes
  useEffect(() => {
    setFilterBehavior('ALL');
  }, [filterSpecies]);

  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString());
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Setup SSE connection to receive live stats from backend
    const eventSource = new EventSource(`${API_BASE_URL}/live_stats/`);
    
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setStats(data);
        if (data.active_cameras && data.active_cameras.length > 0) {
          setGlobalStreamActive(true);
        } else {
          setGlobalStreamActive(false);
        }
      } catch (err) {
        console.error("Error parsing SSE data", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const toggleGlobalStream = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = globalStreamActive ? 'stop_stream' : 'start_stream';
      const response = await fetch(`${API_BASE_URL}/${endpoint}/`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Failed to ${endpoint}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCamera = async (e) => {
    e.preventDefault();
    if (!newCameraIp) return;
    setAddingCamera(true);
    setCameraMsg('');
    try {
      // Endpoint typically expects 'ip' explicitly based on standard serializers
      // Looking at routing: /det/cam/ip-addresses/
      const response = await fetch(`${API_BASE_URL}/cam/ip-addresses/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: newCameraIp })
      });
      if (!response.ok) throw new Error('Failed to add camera');
      setCameraMsg('Camera Added!');
      setNewCameraIp('');
      fetchCameras(); // Refresh list
      setTimeout(() => setCameraMsg(''), 3000);
    } catch (err) {
      setCameraMsg('Error adding camera.');
    } finally {
      setAddingCamera(false);
    }
  };

  // Base filtered data used across charts and table
  const filteredData = stats.recent_history.filter(record => {
    const sp = record.species?.toUpperCase();
    const bh = record.behaviour?.toUpperCase() || 'UNKNOWN';
    if (filterSpecies !== 'ALL' && sp !== filterSpecies) return false;
    if (filterBehavior !== 'ALL' && bh !== filterBehavior) return false;
    if (filterDateFrom) {
      const recDate = record.timestamp ? record.timestamp.split('T')[0] : '';
      if (recDate < filterDateFrom) return false;
    }
    if (filterDateTo) {
      const recDate = record.timestamp ? record.timestamp.split('T')[0] : '';
      if (recDate > filterDateTo) return false;
    }
    return true;
  });

  // Prepare LINE CHART data: pivot by timestamp so each row has all species
  const filteredHistory = filteredData.slice().reverse(); // oldest first

  // Build pivoted data: { time: '14:05', LION: 2, ELEPHANT: 1, ... }
  const timeMap = new Map();
  filteredHistory.forEach(record => {
    const t = record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '??';
    const sp = record.species?.toUpperCase();
    if (!timeMap.has(t)) timeMap.set(t, { time: t });
    const row = timeMap.get(t);
    row[sp] = (row[sp] || 0) + (record.count || 1);
  });
  const speciesLineData = Array.from(timeMap.values());

  // Unique species present in chart data
  const uniqueSpeciesInChart = [...new Set(filteredHistory.map(r => r.species?.toUpperCase()).filter(Boolean))];

  // Prepare PIE CHART data
  const behaviorRecords = filteredData;
  const aggregatedActivities = {};
  behaviorRecords.forEach(record => {
     const bh = record.behaviour?.toUpperCase() || 'UNKNOWN';
     aggregatedActivities[bh] = (aggregatedActivities[bh] || 0) + 1;
  });

  const activityData = Object.keys(aggregatedActivities).map(key => ({
      name: key,
      value: aggregatedActivities[key]
  }));

  // Behavior badge color map
  const BEHAVIOR_COLORS = {
    'STROLLING': { bg: 'rgba(6,182,212,0.15)', text: '#22d3ee', border: 'rgba(6,182,212,0.3)' },
    'CHASING':   { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
    'RESTING':   { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
    'EATING':    { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
    'RUNNING':   { bg: 'rgba(16,185,129,0.15)', text: '#34d399', border: 'rgba(16,185,129,0.3)' },
    'UNKNOWN':   { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
  };

  // Table uses the unified filtered data
  const filteredTableData = filteredData;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-[#121212] border-r border-[#222] flex flex-col justify-between shadow-2xl z-10 shrink-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto sidebar-scroll">
          <div className="p-6 border-b border-[#222]">
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 flex items-center gap-3">
              <Camera className="w-7 h-7 text-cyan-400" />
              WildCam AI
            </h1>
            <p className="text-sm text-gray-500 mt-2 font-medium tracking-wide">Monitoring Dashboard</p>
          </div>
          
          <div className="p-6 flex flex-col gap-6">
            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Master Control</h2>
              <button
                onClick={toggleGlobalStream}
                disabled={loading}
                className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-bold text-[15px] transition-all duration-300 ${
                  globalStreamActive 
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                } disabled:opacity-50`}
              >
                <Power className={`w-5 h-5 ${globalStreamActive ? 'animate-pulse' : ''}`} />
                {loading ? 'Processing...' : globalStreamActive ? 'STOP ALL CAMERAS' : 'START ALL CAMERAS'}
              </button>
              
              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#333]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-400">System Status</span>
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold tracking-wider ${globalStreamActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
                  {globalStreamActive ? 'LIVE' : 'IDLE'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-400">Active Sensors</span>
                <span className="text-xl font-mono font-bold text-cyan-400">{stats.active_cameras?.length || 0}</span>
              </div>
            </div>

            {/* Global Filters Form */}
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#333]">
              <h2 className="text-sm font-bold text-gray-400 mb-4">Global Data Filters</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Species Filter</label>
                  <select 
                    value={filterSpecies}
                    onChange={(e) => setFilterSpecies(e.target.value)}
                    className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-sm text-cyan-400 focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    {[...new Set(availableSpecies)].map(sp => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                  </select>
                </div>
                <div>
                   <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Behavior Filter</label>
                   <select 
                    value={filterBehavior}
                    onChange={(e) => setFilterBehavior(e.target.value)}
                    className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-sm text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    {[...new Set(availableBehaviors)].map(bh => (
                      <option key={bh} value={bh}>{bh}</option>
                    ))}
                  </select>
                </div>
                <div>
                   <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Date From</label>
                   <input 
                    type="date" 
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
                <div>
                   <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Date To</label>
                   <input 
                    type="date" 
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Add Camera Form */}
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#333]">
              <h2 className="text-sm font-bold text-gray-400 mb-3">Add IP Camera</h2>
              <form onSubmit={handleAddCamera} className="flex flex-col gap-3">
                <input 
                  type="text" 
                  value={newCameraIp}
                  onChange={(e) => setNewCameraIp(e.target.value)}
                  placeholder="e.g. 192.168.1.100:8080"
                  className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={addingCamera || !newCameraIp}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white font-bold py-2 rounded-lg text-sm transition-colors"
                >
                  {addingCamera ? 'Adding...' : 'Register Camera'}
                </button>
                {cameraMsg && (
                   <span className={`text-xs text-center ${cameraMsg.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                     {cameraMsg}
                   </span>
                )}
              </form>
            </div>

            {/* Registered Cameras List */}
            {registeredCameras.length > 0 && (
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#333]">
              <h2 className="text-sm font-bold text-gray-400 mb-3">Registered Cameras</h2>
              <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto custom-scrollbar">
                {registeredCameras.map(cam => (
                  <div key={cam.id} className="flex items-center justify-between bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-2 group hover:border-cyan-500/40 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <Camera className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                      <span className="text-xs font-mono text-gray-300 truncate">{cam.ip}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteCamera(cam.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-red-500/10 shrink-0"
                      title="Remove camera"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#1a1a1a] via-[#0a0a0a] to-[#0a0a0a]">
        {/* Topbar */}
        <header className="h-[72px] min-h-[72px] border-b border-[#222] flex items-center px-8 justify-between bg-[#121212]/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <LayoutGrid className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-200 tracking-wide">Live Telemetry</h2>
          </div>
          <div className="flex items-center gap-3 px-5 py-2 bg-black/40 rounded-full border border-[#333] shadow-inner">
            <Activity className={`w-4 h-4 ${globalStreamActive ? 'text-emerald-400 animate-pulse' : 'text-gray-500'}`} />
            <span className="text-sm font-mono font-medium text-gray-300">
              {currentTime}
            </span>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full min-h-[600px]">
            
            {/* Video Streams Panel */}
            <div className="xl:col-span-2 flex flex-col gap-4">
              <h3 className="text-[13px] font-bold text-gray-500 uppercase tracking-widest pl-1">Camera Feeds</h3>
              <div className="flex-1 bg-[#121212] rounded-2xl border border-[#222] p-5 shadow-2xl relative">
                {stats.active_cameras?.length > 0 ? (
                  <div className={`grid gap-4 h-full ${stats.active_cameras.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-2'}`}>
                    {stats.active_cameras.map((camId) => {
                      // Find the latest detection for this camera to get its GPS
                      const latestForCam = stats.recent_history?.find(r => r.camera_id === camId);
                      const lat = latestForCam?.latitude;
                      const lng = latestForCam?.longitude;
                      return (
                      <div key={camId} className="relative rounded-xl overflow-hidden bg-black border border-[#333] transition-all hover:border-cyan-500/50 shadow-lg min-h-[250px] aspect-video">
                        <img 
                          src={`${API_BASE_URL}/video_feed/${camId}/`}
                          alt={`Camera ${camId}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                          <span className="text-xs font-mono font-bold text-white tracking-wider">CAM_{camId}</span>
                        </div>
                        {lat != null && lng != null && (
                          <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[11px] font-mono text-emerald-300">
                              {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
                            </span>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                    <Camera className="w-20 h-20 mb-6 opacity-20" />
                    <p className="text-xl font-medium tracking-wide">No Active Streams</p>
                    <p className="text-sm mt-2 opacity-60">Click &apos;START ALL CAMERAS&apos; to begin monitoring</p>
                  </div>
                )}
              </div>

              {/* Historical Map Panel */}
              <h3 className="text-[13px] font-bold text-gray-500 uppercase tracking-widest pl-1 mt-4">Database History Map</h3>
              <div className="flex-1 bg-[#121212] rounded-2xl border border-[#222] p-1 shadow-2xl relative overflow-hidden min-h-[400px]">
                 <div className="absolute inset-0">
                    <Heatmap isEmbedded={true} speciesFilter={filterSpecies !== 'ALL' ? filterSpecies.toLowerCase() : null} dateFrom={filterDateFrom || null} dateTo={filterDateTo || null} />
                 </div>
              </div>
            </div>

            {/* Analytics Panel */}
            <div className="flex flex-col gap-8">
              
              {/* Species Chart */}
              <div className="flex-1 flex flex-col gap-4">
                <h3 className="text-[13px] font-bold text-gray-500 uppercase tracking-widest pl-1">Species Detection (Time Series)</h3>
                <div className="flex-1 bg-[#121212] rounded-2xl border border-[#222] p-6 shadow-2xl relative min-h-[250px]">
                  {speciesLineData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={speciesLineData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <defs>
                          {uniqueSpeciesInChart.map((sp, i) => (
                            <linearGradient key={sp} id={`grad-${sp}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.30}/>
                              <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.0}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 6" stroke="#222" vertical={false} />
                        <XAxis dataKey="time" stroke="#444" tick={{fill: '#888', fontSize: 10, fontWeight: 500}} axisLine={{stroke: '#333'}} tickLine={false} />
                        <YAxis stroke="#444" tick={{fill: '#888', fontSize: 11, fontWeight: 500}} axisLine={{stroke: '#333'}} tickLine={false} allowDecimals={false} />
                        <RechartsTooltip 
                          contentStyle={{backgroundColor: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: '12px', boxShadow: '0 12px 32px rgba(6,182,212,0.15)', padding: '10px 14px'}}
                          labelStyle={{color: '#888', fontSize: 11, marginBottom: 4}}
                          cursor={{stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '4 4'}}
                        />
                        <Legend wrapperStyle={{color: '#999', fontSize: 11, paddingTop: 8}} />
                        {uniqueSpeciesInChart.map((sp, i) => (
                          <Area 
                            key={sp}
                            type="monotone" 
                            dataKey={sp} 
                            name={sp}
                            stroke={COLORS[i % COLORS.length]} 
                            strokeWidth={2.5} 
                            fill={`url(#grad-${sp})`} 
                            dot={{ r: 3, fill: '#0e1117', stroke: COLORS[i % COLORS.length], strokeWidth: 2 }} 
                            activeDot={{ r: 5, fill: COLORS[i % COLORS.length], stroke: '#fff', strokeWidth: 2, style: { filter: `drop-shadow(0 0 6px ${COLORS[i % COLORS.length]}80)` } }} 
                            connectNulls
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                      <LayoutGrid className="w-8 h-8 opacity-20" />
                      <span className="text-sm tracking-wide font-medium">Awaiting Data...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Behavior Chart */}
              <div className="flex-1 flex flex-col gap-4">
                <h3 className="text-[13px] font-bold text-gray-500 uppercase tracking-widest pl-1">Behavior Analysis</h3>
                <div className="flex-1 bg-[#121212] rounded-2xl border border-[#222] p-6 shadow-2xl relative min-h-[250px] pb-16">
                   {activityData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={activityData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={6}
                          dataKey="value"
                          stroke="none"
                          cornerRadius={4}
                        >
                          {activityData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'}}
                          itemStyle={{color: '#fff', fontWeight: 600}}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                   ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                      <Activity className="w-8 h-8 opacity-20" />
                      <span className="text-sm tracking-wide font-medium">Awaiting Analysis...</span>
                    </div>
                   )}
                   {/* Custom Legend */}
                   {activityData.length > 0 && (
                     <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-x-5 gap-y-2 flex-wrap px-6">
                       {activityData.map((entry, index) => (
                         <div key={entry.name} className="flex items-center gap-2 text-[11px] font-bold text-gray-400 tracking-wider">
                           <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[(index + 2) % COLORS.length]}}></div>
                           {entry.name}
                         </div>
                       ))}
                     </div>
                   )}
                </div>
              </div>

            </div>
          </div>

          {/* Historical Data Table */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[13px] font-bold text-gray-500 uppercase tracking-widest">Recent Detections</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {filteredTableData.length} records
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Live · Last 100</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]"></div>
              </div>
            </div>
            <div className="bg-[#121212] rounded-2xl border border-[#222] shadow-2xl overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm" id="detection-history-table">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                        <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Species</th>
                        <th className="px-5 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Count</th>
                        <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Behaviour</th>
                        <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Location</th>
                        <th className="px-5 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Camera</th>
                        <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTableData.length > 0 ? (
                        filteredTableData.map((record, idx) => {
                          const bhKey = record.behaviour?.toUpperCase() || 'UNKNOWN';
                          const bhColor = BEHAVIOR_COLORS[bhKey] || BEHAVIOR_COLORS['UNKNOWN'];
                          const speciesDisplay = record.species?.replace(/_/g, ' ') || '—';
                          const tsDisplay = record.timestamp
                            ? new Date(record.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : '—';
                          return (
                            <tr
                              key={record.id || idx}
                              className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors duration-200 table-row-animate"
                              style={{ animationDelay: `${idx * 15}ms` }}
                            >
                              <td className="px-5 py-3 text-gray-600 font-mono text-xs">{idx + 1}</td>
                              <td className="px-5 py-3">
                                <span className="font-semibold text-gray-200 capitalize text-[13px]">{speciesDisplay}</span>
                              </td>
                              <td className="px-5 py-3 text-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-sm border border-cyan-500/20">
                                  {record.count ?? '—'}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider"
                                  style={{ backgroundColor: bhColor.bg, color: bhColor.text, border: `1px solid ${bhColor.border}` }}
                                >
                                  {bhKey}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                {record.latitude != null && record.longitude != null ? (
                                  <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span className="text-xs font-mono text-gray-400">
                                      {Number(record.latitude).toFixed(4)}, {Number(record.longitude).toFixed(4)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-600">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-400">
                                  <Camera className="w-3 h-3 text-gray-600" />
                                  {record.camera_id || '—'}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <span className="text-xs font-mono text-gray-500">{tsDisplay}</span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-5 py-16 text-center">
                            <div className="flex flex-col items-center gap-3 text-gray-600">
                              <Database className="w-10 h-10 opacity-20" />
                              <span className="text-sm font-medium tracking-wide">No detection records yet</span>
                              <span className="text-xs opacity-60">Records will appear here as animals are detected</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar,
        .sidebar-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track,
        .sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb,
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover,
        .sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        .sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
          transition: scrollbar-color 0.3s;
        }
        .sidebar-scroll:hover {
          scrollbar-color: #333 transparent;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: transparent;
          transition: background 0.3s;
        }
        .sidebar-scroll:hover::-webkit-scrollbar-thumb {
          background: #333;
        }
        .sidebar-scroll:hover::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        @keyframes tableRowFadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .table-row-animate {
          animation: tableRowFadeIn 0.3s ease-out both;
        }
      `}</style>
    </div>
  );
}
