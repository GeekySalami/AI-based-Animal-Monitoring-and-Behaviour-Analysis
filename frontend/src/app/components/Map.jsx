// "use client";
// import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
// import "leaflet/dist/leaflet.css";
// import L from "leaflet";

// // Fix default marker icons (otherwise they won't show in Next.js)
// delete L.Icon.Default.prototype._getIconUrl;

// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: "/leaflet/marker-icon-2x.png",
//   iconUrl: "/leaflet/marker-icon.png",
//   shadowUrl: "/leaflet/marker-shadow.png",
// });

// export default function LeafletMap() {
//   return (
//     <MapContainer
//       center={[51.505, -0.09]}
//       zoom={13}
//       scrollWheelZoom={false}
//       style={{ height: "100%", width: "100%" }}
//     >
//       <TileLayer
//         attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
//         url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
//       />
//       <Marker position={[51.505, -0.09]}>
//         <Popup>
//           A pretty CSS3 popup. <br /> Easily customizable.
//         </Popup>
//       </Marker>
//     </MapContainer>
//   );
// }

"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat"; // This is the crucial import to extend L with heatLayer

// --- Fix default marker icons (keep this) ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});


// --- Our new, custom Heatmap component ---
const HeatmapComponent = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length === 0) return;
    console.log("points", points);
    
    const maxIntensity = Math.max(...points.map(p => p[2]));
    
    // Create the heat layer with adjusted options
    const heatLayer = L.heatLayer(points, { 
        radius: 25,
        blur: 15, // Increased blur for better visibility
        maxZoom: 18,
        max: maxIntensity, // Use actual max intensity from your data
        minOpacity: 0.5, // Add minimum opacity so even low values are visible
        gradient: {
          0.0: "blue",
          0.5: "lime",
          0.7: "yellow",
          1.0: "red",
        },
    });

    map.addLayer(heatLayer);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, points]);

  return null;
};

const ChangeView = ({ center, zoom }) => {
  const map = useMap(); // Get the map instance
  useEffect(() => {
    if (center) {
      map.setView(center, zoom); // Or map.flyTo(center, zoom) for a smooth animation
    }
  }, [center, zoom, map]); // Re-run this effect if center, zoom, or map changes

  return null; // This component doesn't render anything
};

// --- Your main Map component ---
export default function LeafletMap({ heatmapData = [], zoom = 13 }) {
  // Handle the case where data is not yet available to prevent errors
  if (!heatmapData || heatmapData.length === 0) {
    return (
        <div style={{ height: "100%", width: "100%", display: "grid", placeContent: "center" }}>
            Loading Map Data...
        </div>
    );
  }

  // The center is now derived from the heatmapData
  const newCenter = heatmapData[0];

  return (
    <MapContainer
      center={newCenter} // Set the initial center
      zoom={zoom}
      scrollWheelZoom={true}
      style={{ height: "100%", width: "100%" }}
    >
      {/* This component will handle all subsequent center changes */}
      <ChangeView center={newCenter} zoom={zoom} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <HeatmapComponent points={heatmapData} />
    </MapContainer>
  );
}