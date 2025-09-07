import dynamic from "next/dynamic";

const Mapp = dynamic(() => import("./Map"), { ssr: false });
export default Mapp;