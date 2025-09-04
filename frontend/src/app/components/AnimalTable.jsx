'use client';

import React from 'react';

// Main component to display and filter animal data
const AnimalTable = () => {
    // State to store the list of animals fetched from the API
    const [animals, setAnimals] = React.useState([]);
    // State to manage the values of the filter inputs
    const [filters, setFilters] = React.useState({
        species: '',
        start_timestamp: '',
        end_timestamp: '',
        lat_min: '',
        lat_max: '',
        lon_min: '',
        lon_max: '',
    });
    // State to trigger the API refetch when filters are applied
    const [appliedFilters, setAppliedFilters] = React.useState(filters);
    // State to handle loading UI
    const [loading, setLoading] = React.useState(true);
    // State to handle potential fetch errors
    const [error, setError] = React.useState(null);

    // useEffect hook to fetch data when the component mounts or when filters are applied
    React.useEffect(() => {
        const fetchAnimals = async () => {
            setLoading(true);
            setError(null);

            // Use URLSearchParams to build the query string from the applied filters
            const params = new URLSearchParams();
            if (appliedFilters.species) {
                params.append('species', appliedFilters.species);
            }
            if (appliedFilters.start_timestamp) {
                // Ensure timestamp is in ISO format with 'Z' for UTC
                params.append('start_timestamp', new Date(appliedFilters.start_timestamp).toISOString());
            }
            if (appliedFilters.end_timestamp) {
                params.append('end_timestamp', new Date(appliedFilters.end_timestamp).toISOString());
            }
            // Add location bounding box filters
            if (appliedFilters.lat_min) params.append('latitude__gte', appliedFilters.lat_min);
            if (appliedFilters.lat_max) params.append('latitude__lte', appliedFilters.lat_max);
            if (appliedFilters.lon_min) params.append('longitude__gte', appliedFilters.lon_min);
            if (appliedFilters.lon_max) params.append('longitude__lte', appliedFilters.lon_max);


            // Note: Your Django server runs on port 8000 by default.
            const API_URL = `http://127.0.0.1:8000/animals/?${params.toString()}`;

            try {
                const response = await fetch(API_URL);
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                const data = await response.json();
                // The backend query already orders by most recent.
                // We slice to show only the top 1000 results on the frontend.
                // For very large datasets, backend pagination is a better solution.
                setAnimals(data.slice(0, 1000));
            } catch (e) {
                setError(`Failed to fetch data. Please check if your Django server is running on port 8000 and the endpoint is correct. Error: ${e.message}`);
                console.error("Fetch error:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchAnimals();
    }, [appliedFilters]); // This effect re-runs whenever 'appliedFilters' changes

    // Handle changes in the filter input fields
    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prevFilters => ({
            ...prevFilters,
            [name]: value,
        }));
    };

    // Apply the current filters and trigger a data refetch
    const handleApplyFilters = () => {
        setAppliedFilters(filters);
    };

    // Helper function to format the timestamp for display
    const formatTimestamp = (isoString) => {
        if (!isoString) return 'N/A';
        const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(isoString).toLocaleDateString(undefined, options);
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-cyan-400">Animal Sightings Dashboard</h1>
                <p className="mb-8 text-gray-400">Displaying the latest animal observation data.</p>

                {/* Filter Section */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
                    <h2 className="text-xl font-semibold mb-4 text-white">Filters</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div className="flex flex-col">
                            <label htmlFor="species" className="mb-2 text-sm font-medium text-gray-300">Species</label>
                            <input
                                type="text"
                                id="species"
                                name="species"
                                value={filters.species}
                                onChange={handleFilterChange}
                                placeholder="e.g., Lion"
                                className="bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label htmlFor="start_timestamp" className="mb-2 text-sm font-medium text-gray-300">Start Date</label>
                            <input
                                type="datetime-local"
                                id="start_timestamp"
                                name="start_timestamp"
                                value={filters.start_timestamp}
                                onChange={handleFilterChange}
                                className="bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label htmlFor="end_timestamp" className="mb-2 text-sm font-medium text-gray-300">End Date</label>
                            <input
                                type="datetime-local"
                                id="end_timestamp"
                                name="end_timestamp"
                                value={filters.end_timestamp}
                                onChange={handleFilterChange}
                                className="bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            />
                        </div>
                         <div className="flex flex-col">
                            <label htmlFor="lat_min" className="mb-2 text-sm font-medium text-gray-300">Min Latitude</label>
                            <input
                                type="number"
                                step="any"
                                id="lat_min"
                                name="lat_min"
                                value={filters.lat_min}
                                onChange={handleFilterChange}
                                placeholder="-90.0"
                                className="bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label htmlFor="lat_max" className="mb-2 text-sm font-medium text-gray-300">Max Latitude</label>
                            <input
                                type="number"
                                step="any"
                                id="lat_max"
                                name="lat_max"
                                value={filters.lat_max}
                                onChange={handleFilterChange}
                                placeholder="90.0"
                                className="bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label htmlFor="lon_min" className="mb-2 text-sm font-medium text-gray-300">Min Longitude</label>
                            <input
                                type="number"
                                step="any"
                                id="lon_min"
                                name="lon_min"
                                value={filters.lon_min}
                                onChange={handleFilterChange}
                                placeholder="-180.0"
                                className="bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label htmlFor="lon_max" className="mb-2 text-sm font-medium text-gray-300">Max Longitude</label>
                            <input
                                type="number"
                                step="any"
                                id="lon_max"
                                name="lon_max"
                                value={filters.lon_max}
                                onChange={handleFilterChange}
                                placeholder="180.0"
                                className="bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={handleApplyFilters}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out transform hover:scale-105"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>

                {/* Data Table Section */}
                <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-700">
                                <tr>
                                    <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">ID</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Species</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Count</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Behaviour</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Location (Lat, Lng)</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Camera ID</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 uppercase tracking-wider">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {loading ? (
                                    <tr><td colSpan="7" className="text-center p-8 text-gray-400">Loading data...</td></tr>
                                ) : error ? (
                                    <tr><td colSpan="7" className="text-center p-8 text-red-400">{error}</td></tr>
                                ) : animals.length > 0 ? (
                                    animals.map(animal => (
                                        <tr key={animal.id} className="hover:bg-gray-700 transition-colors duration-200">
                                            <td className="p-4 whitespace-nowrap">{animal.id}</td>
                                            <td className="p-4 whitespace-nowrap font-medium text-cyan-400">{animal.species}</td>
                                            <td className="p-4 whitespace-nowrap">{animal.count}</td>
                                            <td className="p-4 text-gray-300 max-w-xs truncate">{animal.behaviour}</td>
                                            <td className="p-4 whitespace-nowrap">{`${animal.latitude}, ${animal.longitude}`}</td>
                                            <td className="p-4 whitespace-nowrap">{animal.camera_id}</td>
                                            <td className="p-4 whitespace-nowrap">{formatTimestamp(animal.timestamp)}</td>
                                        </tr>
                                    ))
                                ) : (
                                     <tr><td colSpan="7" className="text-center p-8 text-gray-400">No animals found matching your criteria.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnimalTable;

