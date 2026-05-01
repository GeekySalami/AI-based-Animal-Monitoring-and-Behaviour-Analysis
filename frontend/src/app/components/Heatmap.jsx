'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

const Heatmap = ({ speciesFilter = null, yearFilter = null, isEmbedded = false, dateFrom = null, dateTo = null }) => {
    const [allAnimals, setAllAnimals] = useState([]);
    const [speciesVisibility, setSpeciesVisibility] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scriptsReady, setScriptsReady] = useState(false);

    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const heatLayerRef = useRef(null);
    const markersLayerRef = useRef(null);

    // Load Leaflet scripts
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (window.L) {
            setScriptsReady(true);
            return;
        }

        const existing = document.querySelector('script[src*="leaflet.js"]');
        if (existing) {
            const check = setInterval(() => {
                if (window.L) { setScriptsReady(true); clearInterval(check); }
            }, 100);
            return () => clearInterval(check);
        }

        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(cssLink);

        const leafletScript = document.createElement('script');
        leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        leafletScript.async = true;
        
        leafletScript.onload = () => {
            const heatScript = document.createElement('script');
            heatScript.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
            heatScript.async = true;
            heatScript.onload = () => setScriptsReady(true);
            document.body.appendChild(heatScript);
        };
        
        document.body.appendChild(leafletScript);
    }, []);

    // Fetch animal data
    useEffect(() => {
        const fetchAllAnimals = async () => {
            setLoading(true);
            setError(null);
            
            let API_URL = `http://127.0.0.1:8000/animals/`;
            const params = new URLSearchParams();
            
            if (speciesFilter) params.append('species', speciesFilter);
            if (yearFilter) params.append('year', yearFilter);
            if (dateFrom) params.append('start_timestamp', dateFrom);
            if (dateTo) params.append('end_timestamp', dateTo);
            
            if (params.toString()) API_URL += `?${params.toString()}`;

            try {
                const response = await fetch(API_URL);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                const data = await response.json();
                setAllAnimals(data);
                
                const uniqueSpecies = [...new Set(data.map(animal => animal.species))];
                const initialVisibility = uniqueSpecies.reduce((acc, species) => {
                    acc[species] = true;
                    return acc;
                }, {});
                setSpeciesVisibility(initialVisibility);
            } catch (e) {
                setError(e.message);
                console.error("Fetch error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchAllAnimals();
    }, [speciesFilter, yearFilter, dateFrom, dateTo]);

    // Initialize map AFTER scripts ready AND container exists
    useEffect(() => {
        if (!scriptsReady || !mapContainerRef.current || mapRef.current) return;
        
        // Small delay to ensure the container has layout dimensions
        const timer = setTimeout(() => {
            if (!mapContainerRef.current) return;
            try {
                const map = window.L.map(mapContainerRef.current, { 
                    zoomControl: !isEmbedded,
                    attributionControl: !isEmbedded 
                }).setView([1.29, 36.82], 6);
                
                window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(map);
                
                mapRef.current = map;
                
                // Force Leaflet to recalculate container size
                setTimeout(() => { map.invalidateSize(); }, 200);
            } catch (err) {
                console.error("Map init error:", err);
            }
        }, 100);
        
        return () => clearTimeout(timer);
    }, [scriptsReady, isEmbedded]);

    // Process data
    const processedData = useMemo(() => {
        if (allAnimals.length === 0) return { pointsWithCount: [], maxCount: 1 };

        const counts = {};
        allAnimals.forEach(animal => {
            const lat = parseFloat(animal.latitude).toFixed(4);
            const lon = parseFloat(animal.longitude).toFixed(4);
            const key = `${lat}-${lon}-${animal.species}`;

            if (!counts[key]) {
                counts[key] = { lat: parseFloat(lat), lon: parseFloat(lon), species: animal.species, count: 0 };
            }
            counts[key].count += animal.count;
        });

        const pointsWithCount = Object.values(counts);
        const maxCount = Math.max(...pointsWithCount.map(p => p.count), 1);
        return { pointsWithCount, maxCount };
    }, [allAnimals]);

    const uniqueSpeciesList = useMemo(() => Object.keys(speciesVisibility).sort(), [speciesVisibility]);

    // Filtered points for the heatmap
    const heatmapPoints = useMemo(() => {
        const { pointsWithCount, maxCount } = processedData;
        return pointsWithCount
            .filter(point => speciesVisibility[point.species])
            .map(point => {
                const intensity = 0.1 + (point.count * 100.0 / maxCount) * 0.9;
                return [point.lat, point.lon, intensity];
            });
    }, [processedData, speciesVisibility]);

    // Update heatmap layer + auto-pan to most populated point
    useEffect(() => {
        if (!mapRef.current || !scriptsReady) return;

        if (heatLayerRef.current) {
            mapRef.current.removeLayer(heatLayerRef.current);
            heatLayerRef.current = null;
        }

        if (heatmapPoints.length > 0) {
            heatLayerRef.current = window.L.heatLayer(heatmapPoints, {
                radius: 25, blur: 15, maxZoom: 18,
            }).addTo(mapRef.current);

            // Auto-pan to the most populated (highest intensity) point
            const mostPopulated = heatmapPoints.reduce((best, curr) => curr[2] > best[2] ? curr : best, heatmapPoints[0]);
            if (mostPopulated) {
                mapRef.current.flyTo([mostPopulated[0], mostPopulated[1]], 10, { duration: 1.0 });
            }
        }
    }, [heatmapPoints, scriptsReady]);

    // Resize handler for embedded maps
    useEffect(() => {
        if (!mapRef.current || !isEmbedded) return;
        const observer = new ResizeObserver(() => {
            mapRef.current?.invalidateSize();
        });
        if (mapContainerRef.current) observer.observe(mapContainerRef.current);
        return () => observer.disconnect();
    }, [isEmbedded, scriptsReady]);

    const handleToggleSpecies = (species) => {
        setSpeciesVisibility(prev => ({ ...prev, [species]: !prev[species] }));
    };

    // ALWAYS render the map container — overlay loading/error on top
    return (
        <div className={`bg-gray-900 text-white flex flex-col lg:flex-row font-sans ${isEmbedded ? 'h-full w-full' : 'min-h-screen'}`}>
            {/* Controls Sidebar - Hidden if embedded */}
            {!isEmbedded && (
              <div className="w-full lg:w-1/4 xl:w-1/5 p-6 bg-gray-800 shadow-lg overflow-y-auto">
                  <h2 className="text-2xl font-bold mb-4 text-cyan-400">Species Filter</h2>
                  {speciesFilter && <p className="mb-2 text-sm text-cyan-300">Filtered by: {speciesFilter}</p>}
                  {yearFilter && <p className="mb-2 text-sm text-cyan-300">Year: {yearFilter}</p>}
                  <p className="mb-6 text-gray-400">Toggle visibility of species on the heatmap.</p>
                  <div className="space-y-3">
                      {uniqueSpeciesList.map(species => (
                          <label key={species} className="flex items-center space-x-3 cursor-pointer p-2 rounded-md hover:bg-gray-700 transition-colors">
                              <input
                                  type="checkbox"
                                  checked={speciesVisibility[species] || false}
                                  onChange={() => handleToggleSpecies(species)}
                                  className="h-5 w-5 rounded bg-gray-600 border-gray-500 text-cyan-500 focus:ring-cyan-600"
                              />
                              <span className="text-gray-200">{species}</span>
                          </label>
                      ))}
                  </div>
              </div>
            )}

            {/* Map Area — ALWAYS rendered */}
            <div className={`flex-grow bg-gray-900 relative ${isEmbedded ? 'h-full' : 'h-[70vh] lg:h-screen'}`}>
                 <div ref={mapContainerRef} style={{ height: '100%', width: '100%', borderRadius: isEmbedded ? '0.75rem' : '0', zIndex: 1 }}>
                 </div>
                 {/* Overlay loading/error states without blocking the map container */}
                 {(loading || error || !scriptsReady) && (
                     <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-[10] rounded-xl">
                         <span className={`text-sm ${error ? 'text-red-400' : 'text-gray-400'}`}>
                             {error ? `Error: ${error}` : 'Loading map data...'}
                         </span>
                     </div>
                 )}
            </div>
        </div>
    );
};

export default Heatmap;