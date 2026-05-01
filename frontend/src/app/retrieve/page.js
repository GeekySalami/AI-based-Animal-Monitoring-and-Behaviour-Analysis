import React from "react";
import AnimalTable from "../components/AnimalTable";
import Heatmap from "../components/Heatmap";
import Summary from "../components/Sumarry";
import Camera from "../components/Camera";
import Camview from "../components/Camview";

function page() {
  return (
    <>
      <div className="min-h-screen bg-gray-900">
        <AnimalTable />
        <Camera />
      </div>
      <Summary />
      <Camview/>
    </>
  );
}

export default page;
