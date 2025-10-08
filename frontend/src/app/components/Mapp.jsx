import dynamic from "next/dynamic";

const Mapp = dynamic(() => import("./Map"), { ssr: false });

// Wrapper component that passes props
export default function MappWrapper({ heatmapData = [] }) {
  return <Mapp heatmapData={heatmapData} />;
}