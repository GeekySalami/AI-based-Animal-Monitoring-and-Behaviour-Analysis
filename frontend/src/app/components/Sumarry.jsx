"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
    color: "hsl(var(--chart-1))",
  },
};

function Summary() {
  // State for dropdowns
  const [speciesList, setSpeciesList] = useState([]);
  const [selectedSpecies, setSelectedSpecies] = useState("");
  const [yearList, setYearList] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");

  // State for chart data
  const [chartData, setChartData] = useState([]);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [chartError, setChartError] = useState(null);

  // State for initial page load
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Effect to fetch chart data whenever `selectedSpecies` changes
  useEffect(() => {
    if (!selectedSpecies) return;

    setIsChartLoading(true);
    setChartError(null);

    fetch(`http://127.0.0.1:8000//animals/yearly-summary/?year=${selectedYear}&species=${selectedSpecies}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        setChartData(data);
      })
      .catch((error) => {
        console.error("Error fetching chart data:", error);
        setChartError("Failed to load summary data.");
      })
      .finally(() => {
        setIsChartLoading(false);
      });
  }, [selectedSpecies]);

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
    <div className="h-screen p-4 md:p-6">
      {/* Top Bar: Species Dropdown + Report Label */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="justify-between text-3xl font-semibold"
            >
              {selectedSpecies || "Select Species"}
              <ChevronDown className="ml-2 h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Available Species</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={selectedSpecies}
              onValueChange={setSelectedSpecies}
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
                    className="w-[120px] justify-between font-normal"
                  >
                    {selectedYear || "Year"}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent >
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
          <div className="z-10 flex h-11/12 items-center justify-center rounded-lg border-2 border-dashed bg-card p-4">
            {/* The Mapp component goes here as the "Heatmap" */}
            <Mapp />
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-4">
          <div className="space-y-2 rounded-lg border p-4">
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
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Analysis of population over the years</CardTitle>
              <CardDescription>
                Population trends for {selectedSpecies} across all years.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isChartLoading ? (
                <div className="flex h-[250px] items-center justify-center">
                  Loading Chart Data...
                </div>
              ) : chartError ? (
                <div className="flex h-[250px] items-center justify-center text-destructive">
                  {chartError}
                </div>
              ) : (
                <ChartContainer
                  config={chartConfig}
                  className="h-[250px] w-full"
                >
                  <AreaChart
                    accessibilityLayer
                    data={chartData}
                    margin={{ left: -20, right: 12 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="year"
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
                      content={<ChartTooltipContent />}
                    />
                    <Area
                      dataKey="count"
                      type="natural"
                      fill="var(--color-individuals)"
                      fillOpacity={0.4}
                      stroke="var(--color-individuals)"
                    />
                  </AreaChart>
                </ChartContainer>
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