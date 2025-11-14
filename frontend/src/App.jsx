import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import OrderLoaderPage from "./pages/OrderLoaderPage.jsx";
import VelocityPage from "./pages/VelocityPage.jsx";
import ForecastPage from "./pages/ForecastPage.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import BakeSpecsPage from "./pages/BakeSpecsPage.jsx";
import SimulationPage from "./pages/SimulationPage.jsx";
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
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<OrderLoaderPage />} />
            <Route path="/velocity" element={<VelocityPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/abs" element={<SchedulePage />} />
            <Route path="/bakespecs" element={<BakeSpecsPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
          </Routes>
        </main>

        {/* Backend Configuration Component - allows runtime URL configuration */}
        <BackendConfig />
      </div>
    </Router>
  );
}

function Dashboard() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome to Bakehouse System
          </h2>
          <p className="text-gray-600">
            Select a module from the navigation menu to get started.
          </p>
        </div>
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
