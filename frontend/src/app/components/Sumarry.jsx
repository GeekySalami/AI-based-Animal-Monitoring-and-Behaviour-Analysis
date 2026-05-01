"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

// import dynamic from "next/dynamic";

// const Map = dynamic(() => import("./Map"), { ssr: false });

import Mapp from "./Mapp";

// Import shadcn/ui components
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// --- Chart Configuration ---
const chartConfig = {
  individuals: {
    label: "Individuals",
    color: "var(--chart-2)",
  },
};

function Summary() {
  // State for dropdowns
  const [speciesList, setSpeciesList] = useState([]);
  const [selectedSpecies, setSelectedSpecies] = useState("");
  const [yearList, setYearList] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");

  const [summData, setSummData] = useState({
    max_individuals_spotted: 0,
    favourite_activity: "N/A",
    top_3_most_visited: [],
    yearly_data: [],
  });
  const [isSummLoading, setIsSummLoading] = useState(true);
  const [summError, setSummError] = useState(null);

  // State for chart data
  const [chartData, setChartData] = useState([]);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [chartError, setChartError] = useState(null);

  // State for initial page load
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  //state for map points
  const [heatmapData,setHeatMapData] = useState([]);
  const [isLoadingHeatMap, setIsLoadingHeatMap] = useState(true);
  const [heatMapError, setHeatMapError] = useState(null);

  // --- Data Fetching Hooks ---

  // Effect to fetch species and years list on component mount
  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/animals/species/").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch species");
        return res.json();
      }),
      fetch("http://127.0.0.1:8000/animals/years/").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch years");
        return res.json();
      }),
    ])
      .then(([speciesData, yearsData]) => {
        setSpeciesList(speciesData);
        if (speciesData.length > 0) {
          setSelectedSpecies(speciesData[0]);
        }

        setYearList(yearsData);
        if (yearsData.length > 0) {
          setSelectedYear(yearsData[0]);
        }
      })
      .catch((error) => {
        console.error("Error fetching initial data:", error);
        setError(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Effect to fetch summary data whenever `selectedSpecies` changes
  useEffect(() => {
    if (!selectedSpecies) return;

    setIsSummLoading(true);
    setSummError(null);

    fetch(
      `http://127.0.0.1:8000/animals/yearly-summary/?year=${selectedYear}&species=${selectedSpecies}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        console.log("Fetched summary data:", data);
        setSummData(data);
      })
      .catch((error) => {
        console.error("Error fetching summary data:", error);
        setSummError("Failed to load summary data.");
      })
      .finally(() => {
        setIsSummLoading(false);
      });
  }, [selectedSpecies, selectedYear]);

  // Effect to fetch chart data whenever `selectedSpecies` changes

  useEffect(() => {
    if (!selectedSpecies) return;

    setIsChartLoading(true);
    setChartError(null);

    fetch(
      `http://127.0.0.1:8000/animals/monthly-summary/?year=${selectedYear}&species=${selectedSpecies}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        console.log("Fetched chart data:", data);
        setChartData(data);
      })
      .catch((error) => {
        console.error("Error fetching chart data:", error);
        setChartError("Failed to load chart data.");
      })
      .finally(() => {
        setIsChartLoading(false);
      });
  }, [selectedSpecies, selectedYear]);

  // Fetch Heatmap Data:
  useEffect(() => {
    if (!selectedSpecies) return;

    setIsLoadingHeatMap(true);
    setHeatMapError(null);

    fetch(
      `http://127.0.0.1:8000/animals/heatmap-data/?year=${selectedYear}&species=${selectedSpecies}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        console.log("Fetched heatmap data:", data);
        setHeatMapData(data);
      })
      .catch((error) => {
        console.error("Error fetching heatmap data:", error);
        setHeatMapError("Failed to load heatmap data.");
      })
      .finally(() => {
        setIsLoadingHeatMap(false);
      });
  }, [selectedSpecies, selectedYear]);

  // --- Conditional Rendering for Initial Load ---
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button variant="outline" disabled>
          Loading Report Data...
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button variant="destructive" disabled>
          Error: {error}
        </Button>
      </div>
    );
  }

  // --- Main Component Render ---
  return (
    <div className="bg-gray-900 text-white h-screen p-4 md:p-6">
      {/* Top Bar: Species Dropdown + Report Label */}
      <div className="flex items-center gap-2">
        <DropdownMenu className="bg-gray-800">
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className=" bg-gray-800 justify-between text-3xl font-semibold"
            >
              {selectedSpecies || "Select Species"}
              <ChevronDown className="ml-2 h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-gray-800 text-white">
            <DropdownMenuLabel className="bg-gray-800">Available Species</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={selectedSpecies}
              onValueChange={setSelectedSpecies}
              className="bg-gray-800"
            >
              {speciesList.map((speciesName) => (
                <DropdownMenuRadioItem key={speciesName} value={speciesName}>
                  {speciesName}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="text-3xl font-light">Report:</h1>
      </div>

      {/* Main Content Grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="flex flex-col gap-4">
          <div className="z-30">
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[120px] justify-between font-normal bg-gray-800 text-white"
                  >
                    {selectedYear || "Year"}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-gray-800 text-white">
                  <DropdownMenuLabel>Available Years</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={selectedYear}
                    onValueChange={setSelectedYear}
                  >
                    {yearList.map((year) => (
                      <DropdownMenuRadioItem key={year} value={year}>
                        {year}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-sm text-muted-foreground">
                yearly time intervals for yearly changing patterns
              </p>
            </div>
          </div>
          <div className="z-10 flex h-11/12 items-center justify-center rounded-lg border-2 border-dashed bg-card p-2 bg-gray-800 text-white">
            {/* The Mapp component goes here as the "Heatmap" */}
            <Mapp heatmapData={heatmapData}/>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-4">
          {/* <div className="space-y-2 rounded-lg border p-4">
            <h3 className="font-semibold">Details for {selectedYear}:</h3>
            <p>Max individuals spotted at a time: [Data Here]</p>
            <p>Favourite activity: [Data Here]</p>
            <div>
              <p>Top 3 most visited (latitude,longitude):</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                <li>Location A [Data Here]</li>
                <li>Location B [Data Here]</li>
                <li>Location C [Data Here]</li>
              </ul>
            </div>
          </div> */}
          <div className="space-y-2 rounded-lg border p-4">
            <h3 className="font-semibold">Details for {selectedYear}:</h3>
            <p>
              Max individuals spotted at a time:{" "}
              {summData.max_individuals_spotted}
            </p>
            <p>Favourite activity: {summData.favourite_activity}</p>
            <div>
              <p>Top visited (latitude, longitude):</p>
              {summData.top_3_most_visited.length > 0 ? (
                <ul className="ml-4 list-disc text-gray-500 ">
                  {summData.top_3_most_visited.map((location, index) => (
                    <li key={index} className="text-gray-300 p-2">
                      Location {String.fromCharCode(49 + index)}: (
                      {location.latitude}, {location.longitude})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ml-4 text-muted-foreground">
                  No location data available
                </p>
              )}
            </div>
          </div>

          <Card className="bg-gray-800 text-white">
            <CardHeader>
              <CardTitle>Analysis of population over the months</CardTitle>
              <CardDescription className="text-gray-300">
                Population trends for {selectedSpecies} across all months.
              </CardDescription>
            </CardHeader>
            <CardContent >
              {isChartLoading ? (
                <div className="flex h-[250px] items-center justify-center">
                  Loading Chart Data...
                </div>
              ) : chartError ? (
                <div className="flex h-[250px] items-center justify-center text-destructive ">
                  {chartError}
                </div>
              ) : (
                (() => {
                  // Transform the data
                  const monthOrder = [
                    "jan",
                    "feb",
                    "mar",
                    "apr",
                    "may",
                    "jun",
                    "jul",
                    "aug",
                    "sep",
                    "oct",
                    "nov",
                    "dec",
                  ];

                  // Debug: Check what chartData actually is
                  // console.log("Original chartData:", chartData);

                  const sourceData = Array.isArray(chartData)
                    ? chartData[0]
                    : chartData;
                  // console.log("Source data:", sourceData);

                  const transformedData = sourceData
                    ? monthOrder.map((month) => ({
                        month: month.charAt(0).toUpperCase() + month.slice(1),
                        count: sourceData[month] || 0,
                      }))
                    : [];

                  // console.log("Transformed data:", transformedData);

                  if (transformedData.length === 0) {
                    return (
                      <div className="flex h-[250px] items-center justify-center">
                        No data available
                      </div>
                    );
                  }

                  return (
                    <ChartContainer
                      config={chartConfig}
                      className="h-[250px] w-full"

                    >
                      <AreaChart
                        accessibilityLayer
                        data={transformedData}
                        margin={{ left: -20, right: 12 }}
                      >
                        <CartesianGrid vertical={false} className="text-gray-300"/>
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          tickCount={5}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent className="text-black"/>}
                        />
                        <Area
                          dataKey="count"
                          type="monotone"
                          fill="var(--color-individuals)"
                          fillOpacity={0.4}
                          stroke="var(--color-individuals)"
                        />
                      </AreaChart>
                    </ChartContainer>
                  );
                })()
              )}
            </CardContent>
            <CardFooter>
              <div className="text-sm text-muted-foreground">
                Showing data for all available years.
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Summary;
