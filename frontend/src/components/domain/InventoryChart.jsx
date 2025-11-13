import { useEffect, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { parseTimeToMinutes } from "../../utils/timeUtils.js";
import { formatMinutesToTime } from "../../utils/formatters.js";
import { BUSINESS_HOURS } from "../../config/constants.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * Inventory Chart Component
 * Shows expected inventory based on time-interval forecast and batches
 * Includes PAR min/max bands
 */
export default function InventoryChart({
  simulation,
  batches,
  completedBatches,
  timeIntervalForecast,
  parConfig,
}) {
  const [chartData, setChartData] = useState(null);

  // Store data in refs
  const batchesRef = useRef([]);
  const forecastRef = useRef(new Map()); // itemGuid -> array of forecast intervals
  const parConfigRef = useRef(new Map()); // itemGuid -> { parMin, parMax }

  // Store batches
  useEffect(() => {
    batchesRef.current = [...(batches || []), ...(completedBatches || [])];
  }, [batches, completedBatches]);

  // Store time-interval forecast
  useEffect(() => {
    forecastRef.current.clear();
    if (!timeIntervalForecast || timeIntervalForecast.length === 0) {
      return;
    }

    timeIntervalForecast.forEach((forecast) => {
      const itemGuid = forecast.itemGuid;
      if (!itemGuid) return;

      if (!forecastRef.current.has(itemGuid)) {
        forecastRef.current.set(itemGuid, []);
      }

      forecastRef.current.get(itemGuid).push(forecast);
    });

    // Sort each item's forecast by time interval
    forecastRef.current.forEach((forecasts, itemGuid) => {
      forecasts.sort((a, b) => a.timeInterval - b.timeInterval);
    });
  }, [timeIntervalForecast]);

  // Store PAR config
  useEffect(() => {
    parConfigRef.current.clear();
    if (!parConfig) return;

    Object.entries(parConfig).forEach(([itemGuid, config]) => {
      parConfigRef.current.set(itemGuid, {
        parMin: config.parMin || 0,
        parMax: config.parMax || null,
      });
    });
  }, [parConfig]);

  // Calculate chart data
  useEffect(() => {
    // Generate time points for full day (06:00 to 17:00) every 15 minutes
    const startMinutes = BUSINESS_HOURS.START_MINUTES;
    const endMinutes = BUSINESS_HOURS.END_MINUTES;
    const timeLabels = [];
    const timeMinutesArray = [];

    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 15) {
      const timeStr = formatMinutesToTime(minutes);
      timeLabels.push(timeStr);
      timeMinutesArray.push(minutes);
    }

    // Get all unique itemGuids
    const itemGuids = new Set();
    forecastRef.current.forEach((_, itemGuid) => itemGuids.add(itemGuid));
    batchesRef.current.forEach((batch) => {
      if (batch.itemGuid) itemGuids.add(batch.itemGuid);
    });

    if (itemGuids.size === 0) {
      setChartData(null);
      return;
    }

    // Generate colors for each SKU
    const colors = [
      "rgb(59, 130, 246)", // blue
      "rgb(16, 185, 129)", // green
      "rgb(245, 158, 11)", // yellow
      "rgb(239, 68, 68)", // red
      "rgb(139, 92, 246)", // purple
      "rgb(236, 72, 153)", // pink
    ];

    const datasets = [];
    let colorIndex = 0;

    Array.from(itemGuids).forEach((itemGuid) => {
      const color = colors[colorIndex % colors.length];
      colorIndex++;

      // Get forecast for this item
      const itemForecast = forecastRef.current.get(itemGuid) || [];
      const par = parConfigRef.current.get(itemGuid) || {
        parMin: 0,
        parMax: null,
      };

      // Get batches for this item
      const itemBatches = batchesRef.current.filter(
        (b) => b.itemGuid === itemGuid && b.availableTime
      );

      // Calculate expected inventory over time
      const expectedData = timeMinutesArray.map((timeMinutes) => {
        let inventory = 0;

        // Add batches that have become available by this time
        itemBatches.forEach((batch) => {
          const availableTimeMinutes = parseTimeToMinutes(batch.availableTime);
          if (availableTimeMinutes > 0 && availableTimeMinutes <= timeMinutes) {
            inventory += batch.quantity || 0;
          }
        });

        // Subtract forecasted demand up to this time
        itemForecast.forEach((forecast) => {
          if (forecast.timeInterval <= timeMinutes) {
            inventory = Math.max(0, inventory - forecast.forecast);
          }
        });

        return inventory;
      });

      // Get display name
      const displayName =
        itemForecast[0]?.displayName || itemBatches[0]?.displayName || itemGuid;

      // Expected inventory line (solid)
      datasets.push({
        label: `${displayName} (Expected)`,
        data: expectedData,
        borderColor: color,
        backgroundColor: color.replace("rgb", "rgba").replace(")", ", 0.2)"),
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
      });

      // PAR min line (red, dashed)
      if (par.parMin !== null && par.parMin !== undefined) {
        datasets.push({
          label: `${displayName} (PAR Min)`,
          data: timeMinutesArray.map(() => par.parMin),
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "transparent",
          borderWidth: 1,
          borderDash: [5, 5],
          fill: false,
          pointRadius: 0,
        });
      }

      // PAR max line (yellow, dashed)
      if (par.parMax !== null && par.parMax !== undefined) {
        datasets.push({
          label: `${displayName} (PAR Max)`,
          data: timeMinutesArray.map(() => par.parMax),
          borderColor: "rgb(245, 158, 11)",
          backgroundColor: "transparent",
          borderWidth: 1,
          borderDash: [5, 5],
          fill: false,
          pointRadius: 0,
        });
      }

      // PAR target zone (light green fill between min and max)
      // Note: Chart.js doesn't easily support filling between arbitrary datasets
      // We'll show PAR min/max lines and let users visually see the target zone
    });

    setChartData({
      labels: timeLabels,
      datasets,
    });
  }, [
    simulation?.currentTime,
    batches,
    completedBatches,
    timeIntervalForecast,
    parConfig,
  ]);

  if (!chartData || chartData.datasets.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Inventory Over Time
        </h3>
        <div className="text-center py-8 text-gray-500">
          No inventory data available yet. Start the simulation to see inventory
          trends.
        </div>
      </div>
    );
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12,
          },
          filter: function (legendItem) {
            // Hide PAR zone from legend (it's just visual)
            return !legendItem.text?.includes("PAR Zone");
          },
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: function (context) {
            return `${context.dataset.label}: ${context.parsed.y} units`;
          },
        },
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Time",
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          maxTicksLimit: 12,
        },
      },
      y: {
        title: {
          display: true,
          text: "Inventory (units)",
        },
        beginAtZero: true,
      },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Inventory Over Time
      </h3>
      <div className="h-96">
        <Line data={chartData} options={options} />
      </div>
      <div className="mt-4 text-xs text-gray-500">
        <span className="inline-block mr-4">
          <span className="inline-block w-3 h-3 bg-blue-500 mr-1"></span>
          Solid lines = Expected inventory
        </span>
        <span className="inline-block mr-4">
          <span className="inline-block w-3 h-3 border-2 border-red-500 border-dashed mr-1"></span>
          Red dashed = PAR Min (stockout threshold)
        </span>
        <span className="inline-block">
          <span className="inline-block w-3 h-3 border-2 border-yellow-500 border-dashed mr-1"></span>
          Yellow dashed = PAR Max (waste threshold)
        </span>
      </div>
    </div>
  );
}
