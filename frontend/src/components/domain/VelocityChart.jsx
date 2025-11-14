import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

/**
 * Velocity chart component - supports multiple chart types
 */

export default function VelocityChart({
  type = "line", // "line" | "bar"
  data = [],
  xKey,
  yKey,
  labelKey,
  title,
  height = 300,
  showLegend = true,
  responsive = true,
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    // Group data by labelKey if provided (for multi-series charts)
    if (labelKey) {
      const labelsMap = new Map();
      const uniqueLabels = new Set();
      const uniqueXValues = new Set();

      // Collect all unique labels and x-values, tracking original dates for sorting
      const xValueToOriginalDate = new Map();
      data.forEach((item) => {
        const label = item[labelKey];
        uniqueLabels.add(label);
        uniqueXValues.add(item[xKey]);
        // Track original date for this x-value if available
        if (item._originalDate && !xValueToOriginalDate.has(item[xKey])) {
          xValueToOriginalDate.set(item[xKey], item._originalDate);
        }
      });

      // Sort x-values for proper ordering
      // Use original dates if available, otherwise fall back to string comparison
      const sortedXValues = Array.from(uniqueXValues).sort((a, b) => {
        // If both have original dates, sort by those
        const originalDateA = xValueToOriginalDate.get(a);
        const originalDateB = xValueToOriginalDate.get(b);

        if (originalDateA && originalDateB) {
          const dateA = new Date(originalDateA);
          const dateB = new Date(originalDateB);
          if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
            return dateA.getTime() - dateB.getTime();
          }
        }

        // Check if values look like "MMM dd" format (e.g., "Dec 01", "Nov 15")
        const datePattern = /^[A-Za-z]{3} \d{1,2}$/;
        if (datePattern.test(a) && datePattern.test(b)) {
          // For date strings without original dates, use string comparison
          // (This should only happen if data wasn't pre-sorted)
          return a.localeCompare(b);
        }

        // Default string comparison
        return a.localeCompare(b);
      });

      const datasets = Array.from(uniqueLabels).map((label, idx) => {
        const colors = [
          "rgba(59, 130, 246, 0.5)", // blue
          "rgba(16, 185, 129, 0.5)", // green
          "rgba(245, 101, 101, 0.5)", // red
          "rgba(251, 191, 36, 0.5)", // yellow
          "rgba(139, 92, 246, 0.5)", // purple
          "rgba(236, 72, 153, 0.5)", // pink
        ];

        // Create a map for quick lookup
        const dataMap = new Map();
        data
          .filter((item) => item[labelKey] === label)
          .forEach((item) => {
            dataMap.set(item[xKey], item[yKey]);
          });

        // Build data array ensuring all x-values are present
        const chartData = sortedXValues.map((xVal) => {
          return dataMap.get(xVal) || 0; // Use 0 for missing values
        });

        return {
          label: label,
          data: chartData,
          borderColor: colors[idx % colors.length],
          backgroundColor: colors[idx % colors.length],
          tension: type === "line" ? 0.4 : 0,
        };
      });

      return {
        labels: sortedXValues,
        datasets,
      };
    }

    // Single series chart
    // Sort by xKey to ensure proper ordering
    const sortedData = [...data].sort((a, b) => {
      if (typeof a[xKey] === "string" && typeof b[xKey] === "string") {
        return a[xKey].localeCompare(b[xKey]);
      }
      return a[xKey] - b[xKey];
    });

    return {
      labels: sortedData.map((item) => item[xKey]),
      datasets: [
        {
          label: title || yKey,
          data: sortedData.map((item) => item[yKey] || 0),
          borderColor: "rgba(59, 130, 246, 1)",
          backgroundColor: "rgba(59, 130, 246, 0.5)",
          tension: type === "line" ? 0.4 : 0,
        },
      ],
    };
  }, [data, xKey, yKey, labelKey, title, type]);

  const options = {
    responsive,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        position: "top",
      },
      title: {
        display: !!title,
        text: title,
      },
      tooltip: {
        mode: "index",
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value) {
            return typeof value === "number" && value >= 1000
              ? (value / 1000).toFixed(1) + "k"
              : value;
          },
        },
      },
    },
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No data available for chart
      </div>
    );
  }

  return (
    <div style={{ height: `${height}px` }}>
      {type === "line" ? (
        <Line data={chartData} options={options} />
      ) : (
        <Bar data={chartData} options={options} />
      )}
    </div>
  );
}
