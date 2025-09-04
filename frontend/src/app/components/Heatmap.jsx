'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

// Main Heatmap component rewritten to use Leaflet directly, avoiding build-time import issues.
const Heatmap = () => {
    // State for all animal data fetched from the API
    const [allAnimals, setAllAnimals] = useState([]);
    // State to manage which species are visible on the map
    const [speciesVisibility, setSpeciesVisibility] = useState({});
    // Loading and error states for data fetching
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // State to track if mapping scripts are loaded and ready
    const [scriptsReady, setScriptsReady] = useState(false);

    // Refs to hold DOM element and Leaflet instances
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const heatLayerRef = useRef(null);

    // Effect to dynamically load Leaflet CSS and JS from a CDN
    useEffect(() => {
        // If scripts are already loaded or loading, do nothing.
        if (window.L || document.querySelector('script[src*="leaflet.js"]')) {
            if (window.L) setScriptsReady(true);
            return;
        }

        // Load Leaflet CSS
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(cssLink);

        // Load Leaflet JS
        const leafletScript = document.createElement('script');
        leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        leafletScript.async = true;
        
        leafletScript.onload = () => {
            // After Leaflet is loaded, load the heatmap plugin
            const heatScript = document.createElement('script');
            heatScript.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
            heatScript.async = true;
            heatScript.onload = () => {
                setScriptsReady(true); // All mapping scripts are ready
            };
            document.body.appendChild(heatScript);
        };
        
        document.body.appendChild(leafletScript);

        // Cleanup function to remove scripts and styles on component unmount
        return () => {
            document.head.removeChild(cssLink);
            document.body.removeChild(leafletScript);
            const heatScriptElement = document.querySelector('script[src*="leaflet-heat.js"]');
            if (heatScriptElement) {
                document.body.removeChild(heatScriptElement);
            }
        };
    }, []);

    // Effect to fetch animal data when the component mounts
    useEffect(() => {
        const fetchAllAnimals = async () => {
            setLoading(true);
            setError(null);
            const API_URL = `http://127.0.0.1:8000/animals/`;

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
                setError(`Failed to fetch data. Please check if your Django server is running. Error: ${e.message}`);
                console.error("Fetch error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchAllAnimals();
    }, []);

    // Effect to initialize the map once scripts are ready and the container is rendered
    useEffect(() => {
        if (scriptsReady && mapContainerRef.current && !mapRef.current) {
            mapRef.current = window.L.map(mapContainerRef.current).setView([1.29, 36.82], 8);
            window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            }).addTo(mapRef.current);
        }
    }, [scriptsReady]);

    // Memoize the list of unique species to avoid recalculating on every render
    const uniqueSpeciesList = useMemo(() => Object.keys(speciesVisibility).sort(), [speciesVisibility]);

    // **NEW**: Process data to group sightings and calculate density
    const processedData = useMemo(() => {
        if (allAnimals.length === 0) {
            return { pointsWithCount: [], maxCount: 1 };
        }

        const counts = {}; // e.g., { '1.2900-36.8200-Lion': { lat, lon, species, count } }
        allAnimals.forEach(animal => {
            // Round coordinates to 4 decimal places to group nearby sightings
            const lat = parseFloat(animal.latitude).toFixed(4);
            const lon = parseFloat(animal.longitude).toFixed(4);
            const key = `${lat}-${lon}-${animal.species}`;

            if (!counts[key]) {
                counts[key] = {
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                    species: animal.species,
                    count: 0
                };
            }
            // Sum the 'count' from each sighting record
            counts[key].count += animal.count;
        });

        const pointsWithCount = Object.values(counts);
        // Find the highest count to use for normalizing intensity
        const maxCount = Math.max(...pointsWithCount.map(p => p.count), 1);

        return { pointsWithCount, maxCount };
    }, [allAnimals]);


    // **UPDATED**: Filter the processed data and calculate intensity for the heatmap
    const heatmapPoints = useMemo(() => {
        const { pointsWithCount, maxCount } = processedData;

        return pointsWithCount
            .filter(point => speciesVisibility[point.species]) // Filter by selected species
            .map(point => {
                // Normalize intensity from 0.1 to 1.0 based on sighting count
                // This makes points with higher counts appear "hotter"
                const intensity = 0.1 + (point.count*100.0 / maxCount) * 0.9;
                console.log(`Point: (${point.lat}, ${point.lon}), Species: ${point.species}, Count: ${point.count}, Intensity: ${intensity}`);
                return [point.lat, point.lon, intensity]; // Format for leaflet.heat: [lat, lng, intensity]
            });
    }, [processedData, speciesVisibility]);

    // Effect to update the heatmap layer when the points change
    useEffect(() => {
        if (mapRef.current && scriptsReady) {
            if (heatLayerRef.current) {
                mapRef.current.removeLayer(heatLayerRef.current);
            }
            if (heatmapPoints.length > 0) {
                heatLayerRef.current = window.L.heatLayer(heatmapPoints, {
                    radius: 25,
                    blur: 15,
                    maxZoom: 18,
                }).addTo(mapRef.current);
            }
        }
    }, [heatmapPoints, scriptsReady]);


    // Handler to toggle the visibility of a species
    const handleToggleSpecies = (species) => {
        setSpeciesVisibility(prev => ({ ...prev, [species]: !prev[species] }));
    };

    if (loading) {
        return <div className="bg-gray-900 text-white min-h-screen p-8 text-center">Loading animal data...</div>;
    }
    if (error) {
        return <div className="bg-gray-900 text-white min-h-screen p-8 text-center text-red-400">{error}</div>;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen flex flex-col lg:flex-row font-sans">
            {/* Controls Sidebar */}
            <div className="w-full lg:w-1/4 xl:w-1/5 p-6 bg-gray-800 shadow-lg overflow-y-auto">
                <h2 className="text-2xl font-bold mb-4 text-cyan-400">Species Filter</h2>
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

            {/* Map Area */}
            <div className="flex-grow h-[70vh] lg:h-screen bg-gray-900 relative">
                 <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }}>
                    {!scriptsReady && <div className="flex items-center justify-center h-full text-gray-400">Loading map...</div>}
                 </div>
            </div>
        </div>
    );
};

export default Heatmap;

