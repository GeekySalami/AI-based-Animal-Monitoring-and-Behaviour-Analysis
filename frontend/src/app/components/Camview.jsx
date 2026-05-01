'use client';
import React, { useState, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';

function Camview() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamActive, setStreamActive] = useState(false);
  const [stopping, setStopping] = useState(false);

  const API_BASE_URL = 'http://localhost:8000/det'; // Adjust to your backend URL

  // Fetch all cameras on component mount
  useEffect(() => {
    fetchCameras();
  }, []);

  const fetchCameras = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/cameras/`);
      if (!response.ok) throw new Error('Failed to fetch cameras');
      const data = await response.json();
      setCameras(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCameraSelect = async (camera) => {
    // Stop current stream if any
    if (streamActive) {
      setStreamActive(false);
      await stopStream();
      // Wait a bit for the backend to clean up
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setSelectedCamera(camera);
    setError(null);

    // Start stream for selected camera
    try {
      const response = await fetch(`${API_BASE_URL}/start_stream/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ camera_id: camera.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start stream');
      }

      const data = await response.json();
      console.log('Stream started:', data);

      if (data.status === 'success') {
        setStreamActive(true);
      }
    } catch (err) {
      setError(`Error starting stream: ${err.message}`);
      setSelectedCamera(null);
    }
  };

  const stopStream = async () => {
    try {
      setStreamActive(false);
      const response = await fetch(`${API_BASE_URL}/stop_stream/`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop stream');
      }

      const data = await response.json();
      console.log('Stream stopped:', data);
      setSelectedCamera(null);
    } catch (err) {
      console.error('Error stopping stream:', err);
      // Still update UI even if request fails
      setSelectedCamera(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamActive) {
        stopStream();
      }
    };
  }, [streamActive]);

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans">
      {/* Left Sidebar - Camera List */}
      <div className="w-80 bg-gray-800 shadow-lg p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
            <Camera className="w-6 h-6" />
            Cameras
          </h2>
          <button
            onClick={fetchCameras}
            className="p-2 hover:bg-gray-700 rounded-full transition-colors"
            title="Refresh camera list"
          >
            <RefreshCw className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-400">
            Loading cameras...
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-red-400 text-sm mt-1">{error}</p>
          </div>
        )}

        {!loading && cameras.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            No cameras available
          </div>
        )}

        <div className="space-y-3">
          {cameras.map((camera) => (
            <button
              key={camera.id}
              onClick={() => handleCameraSelect(camera)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedCamera?.id === camera.id
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-gray-700 hover:border-gray-600 hover:bg-gray-700'
                }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${selectedCamera?.id === camera.id
                  ? 'bg-cyan-600'
                  : 'bg-gray-600'
                  }`}>
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white">
                    {camera.name || `Camera ${camera.id}`}
                  </h3>
                  {/* <p className="text-sm text-gray-400">{(camera.latitude, camera.longitude) || 'Unknown location'}</p> */}
                  {/* <p className="text-sm text-gray-400">
                    {(camera?.latitude == null || camera?.longitude == null)
                      ? 'Unknown location'
                      : `${Number(camera.latitude).toFixed(3)}, ${Number(camera.longitude).toFixed(3)}`}
                  </p> */}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Side - Video Feed */}
      <div className="flex-1 p-6">
        <div className="bg-gray-800 rounded-lg shadow-lg h-full flex items-center justify-center">
          {!selectedCamera ? (
            <div className="text-center text-gray-400">
              <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select a camera to view live feed</p>
            </div>
          ) : streamActive ? (
            <div className="w-full h-full flex flex-col">
              <div className="bg-gray-700 text-white px-6 py-4 rounded-t-lg">
                <h3 className="text-xl font-semibold">
                  {selectedCamera.name || `Camera ${selectedCamera.id}`}
                </h3>
                <p className="text-sm text-gray-300">
                  {/* {selectedCamera.location || 'Unknown location'} */}
                </p>
              </div>
              <div className="flex-1 bg-black flex items-center justify-center">
                <img
                  src={`${API_BASE_URL}/video_feed/`}
                  alt="Live camera feed"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="bg-gray-700 px-6 py-4 rounded-b-lg flex justify-end">
                <button
                  onClick={stopStream}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
                >
                  Stop Stream
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
              <p>Connecting to camera...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Camview;
