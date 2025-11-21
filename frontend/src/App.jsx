import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import OrderLoaderPage from "./pages/OrderLoaderPage.jsx";
import VelocityPage from "./pages/VelocityPage.jsx";
import ForecastPage from "./pages/ForecastPage.jsx";
import ForecastAccuracyPage from "./pages/ForecastAccuracyPage.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import BakeSpecsPage from "./pages/BakeSpecsPage.jsx";
import SimulationPage from "./pages/SimulationPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import HeadlessSimulationPage from "./pages/HeadlessSimulationPage.jsx";
import BackendConfig from "./components/common/BackendConfig.jsx";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <h1 className="text-xl font-bold text-gray-900">
                    Bakehouse System
                  </h1>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    to="/"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/orders"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Orders
                  </Link>
                  <Link
                    to="/velocity"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Velocity
                  </Link>
                  <Link
                    to="/forecast"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Forecast
                  </Link>
                  <Link
                    to="/forecast-accuracy"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Forecast Accuracy
                  </Link>
                  <Link
                    to="/abs"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Schedule
                  </Link>
                  <Link
                    to="/bakespecs"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Bake Specs
                  </Link>
                  <Link
                    to="/simulation"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Simulation
                  </Link>
                  <Link
                    to="/inventory"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Inventory
                  </Link>
                  <Link
                    to="/headless-simulation"
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Headless Sim
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="w-full py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<OrderLoaderPage />} />
            <Route path="/velocity" element={<VelocityPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route
              path="/forecast-accuracy"
              element={<ForecastAccuracyPage />}
            />
            <Route path="/abs" element={<SchedulePage />} />
            <Route path="/bakespecs" element={<BakeSpecsPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route
              path="/headless-simulation"
              element={<HeadlessSimulationPage />}
            />
          </Routes>
        </main>

        {/* Backend Configuration Component - allows runtime URL configuration */}
        <BackendConfig />
      </div>
    </Router>
  );
}

function Dashboard() {
  const modules = [
    {
      title: "Order Loader",
      description:
        "Import, validate, and replay historical orders to keep the system seeded with realistic demand.",
      to: "/orders",
      badge: "Data",
      badgeClass: "bg-blue-100 text-blue-700",
    },
    {
      title: "Velocity",
      description:
        "Track product velocity to understand which SKUs are driving the bake schedule and when to adjust mixes.",
      to: "/velocity",
      badge: "Insights",
      badgeClass: "bg-amber-100 text-amber-700",
    },
    {
      title: "Forecast",
      description:
        "Explore rolling demand forecasts, tweak assumptions, and export projections for weekly planning.",
      to: "/forecast",
      badge: "Planning",
      badgeClass: "bg-purple-100 text-purple-700",
    },
    {
      title: "Schedule",
      description:
        "Generate and review automated bake schedules with freshness windows and rack assignments.",
      to: "/abs",
      badge: "Operations",
      badgeClass: "bg-green-100 text-green-700",
    },
    {
      title: "Bake Specs",
      description:
        "Maintain the single source of truth for product formulas, bake/cool times, and freshness rules.",
      to: "/bakespecs",
      badge: "Admin",
      badgeClass: "bg-slate-100 text-slate-700",
    },
    {
      title: "Simulation",
      description:
        "Run what-if scenarios, stress test schedules, and simulate POS activity before going live.",
      to: "/simulation",
      badge: "Lab",
      badgeClass: "bg-rose-100 text-rose-700",
    },
    {
      title: "Inventory",
      description:
        "Monitor current stock, watch restock thresholds, and trigger purchase suggestions in real-time.",
      to: "/inventory",
      badge: "Supply",
      badgeClass: "bg-teal-100 text-teal-700",
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white p-8 shadow-lg">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-blue-200">
                Bakehouse Operating System
              </p>
              <h2 className="mt-2 text-3xl font-extrabold">
                Welcome back to the command center
              </h2>
              <p className="mt-3 text-blue-100 text-sm sm:text-base max-w-xl">
                Launch directly into forecasting, scheduling, inventory, or
                simulation workflows. Everything you need to run the bakehouse
                lives here.
              </p>
            </div>
          </div>
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                Explore modules
              </h3>
              <p className="text-sm text-gray-500">
                Jump straight into the workflow you need.
              </p>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <div
                key={module.title}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-900">
                    {module.title}
                  </h4>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${module.badgeClass}`}
                  >
                    {module.badge}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-600 flex-1">
                  {module.description}
                </p>
                <div className="mt-5">
                  <Link
                    to={module.to}
                    className="inline-flex items-center justify-center w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    Open {module.title}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function OrdersPlaceholder() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Order Loader</h2>
      <p className="text-gray-600">Order loader module coming soon...</p>
    </div>
  );
}

function VelocityPlaceholder() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Velocity Dashboard
      </h2>
      <p className="text-gray-600">Velocity dashboard module coming soon...</p>
    </div>
  );
}

function ForecastPlaceholder() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Forecast Engine</h2>
      <p className="text-gray-600">Forecast engine module coming soon...</p>
    </div>
  );
}

function ABSPlaceholder() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        ABS Schedule Generator
      </h2>
      <p className="text-gray-600">
        ABS schedule generator module coming soon...
      </p>
    </div>
  );
}

export default App;
