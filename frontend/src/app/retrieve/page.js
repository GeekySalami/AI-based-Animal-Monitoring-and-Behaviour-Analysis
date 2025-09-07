import React from "react";
import AnimalTable from "../components/AnimalTable";
import Heatmap from "../components/Heatmap";
import Summary from "../components/Sumarry";
import Camera from "../components/Camera";

function page() {
  return (
    <>
      <div className="min-h-screen bg-gray-900">
        <AnimalTable />
        <Camera />
      </div>
      <Summary />
    </>
  );
}

export default page;
