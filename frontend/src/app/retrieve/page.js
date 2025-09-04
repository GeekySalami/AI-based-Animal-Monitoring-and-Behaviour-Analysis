import React from 'react'
import AnimalTable from '../components/AnimalTable'
import Heatmap from '../components/Heatmap'

function page() {
  return(
    <>
        <div><AnimalTable/></div>
        <Heatmap/>
    </>
  )
}

export default page