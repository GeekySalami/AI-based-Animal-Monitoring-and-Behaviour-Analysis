"use client";
import React from 'react';

function Camera() {
  // State to store the list of cameras fetched from the API
  const [cameras, setCameras] = React.useState([]);
  // State to handle loading UI
  const [isLoading, setIsLoading] = React.useState(true);
  // State to handle potential fetch errors
  const [error, setError] = React.useState(null);

  // Helper function to format the timestamp for display
  const formatTimestamp = (isoString) => {
    if (!isoString) return 'N/A';
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    };
    return new Date(isoString).toLocaleString(undefined, options);
  };

  // useEffect hook to fetch data when the component mounts
  React.useEffect(() => {
    const fetchCameras = async () => {
      setIsLoading(true);
      setError(null);
      
      const API_URL = 'http://localhost:8000/cameras/';

      try {
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setCameras(data);
      } catch (e) {
        setError(`Failed to fetch data. Please check if your server is running. Error: ${e.message}`);
        console.error("Fetch error:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCameras();
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div className="bg-gray-900 text-white p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-cyan-400">Camera Dashboard</h1>
        <p className="mb-8 text-gray-400">Displaying all registered camera locations.</p>

        {/* Data Table Section */}
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-700">
                <tr>
                  <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">ID</th>
                  <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Location (Lat, Lng)</th>
                  <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Time Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {isLoading ? (
                  <tr><td colSpan="3" className="text-center p-8 text-gray-400">Loading data...</td></tr>
                ) : error ? (
                  <tr><td colSpan="3" className="text-center p-8 text-red-400">{error}</td></tr>
                ) : cameras.length > 0 ? (
                  cameras.map(camera => (
                    <tr key={camera.id} className="hover:bg-gray-700 transition-colors duration-200">
                      <td className="p-4 whitespace-nowrap">{camera.camera_id}</td>
                      <td className="p-4 whitespace-nowrap">{`${camera.latitude}, ${camera.longitude}`}</td>
                      <td className="p-4 whitespace-nowrap">{formatTimestamp(camera.addtime)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="3" className="text-center p-8 text-gray-400">No cameras found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Camera;