'use client';
import React, { useState } from 'react';

function Ipadd() {
  // State to hold the values of the input fields
  const [ipAddress, setIpAddress] = useState('');
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');

  // State to handle feedback messages (text and type for styling)
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Function to handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault(); // Prevent default page reload
    setIsSubmitting(true);
    setMessage({ text: '', type: '' }); // Clear previous messages

    const data = {
      ip: ipAddress,
      longitude: parseFloat(longitude),
      latitude: parseFloat(latitude),
    };

    const API_URL = 'http://localhost:8000/det/cam/ip-addresses/';

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setMessage({ text: 'Camera registered successfully!', type: 'success' });
        setIpAddress('');
        setLongitude('');
        setLatitude('');
      } else {
        const errorData = await response.json();
        setMessage({ text: `Error: ${errorData.detail || 'Something went wrong.'}`, type: 'error' });
      }
    } catch (error) {
      console.error('Submission error:', error);
      setMessage({ text: 'Failed to connect to the server. Please ensure it is running.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-900 text-white p-4 sm:p-6 lg:p-0 font-sans">
      {/* 'mx-auto' has been removed from this line 👇 */}
      <div className="max-w-8xl">
        <h1 className="text-xl sm:text-2xl font-bold mb-4 text-white">Register New Camera</h1>
        <p className="mb-6 text-gray-400 text-sm">Enter the camera details below.</p>

        {/* Form Section */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6">
          <form onSubmit={handleSubmit}>
            {/* Flex container for inputs */}
            <div className="flex flex-col md:flex-row md:gap-4 mb-6">
              {/* IP Address Input */}
              <div className="w-full mb-4 md:mb-0">
                <label htmlFor="ipAddress" className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wider">IP Address</label>
                <input
                  type="text"
                  id="ipAddress"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="192.168.1.10"
                  required
                  className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-200"
                />
              </div>

              {/* Latitude Input */}
              {/* <div className="w-full mb-4 md:mb-0">
                <label htmlFor="latitude" className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wider">Latitude</label>
                <input
                  type="number"
                  id="latitude"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="19.0760"
                  required
                  className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-200"
                />
              </div> */}

              {/* Longitude Input */}
              {/* <div className="w-full">
                <label htmlFor="longitude" className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wider">Longitude</label>
                <input
                  type="number"
                  id="longitude"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="72.8777"
                  required
                  className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-200"
                />
              </div> */}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full p-2 bg-cyan-600 text-white font-bold rounded-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500 transition-colors duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Add Camera'}
            </button>
          </form>

          {message.text && (
            <p className={`mt-4 text-center p-2 rounded-md text-xs ${message.type === 'success'
              ? 'bg-green-500/20 text-green-300'
              : 'bg-red-500/20 text-red-300'
              }`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Ipadd;