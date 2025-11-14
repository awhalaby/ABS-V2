import { useState, useEffect } from "react";
import { getCurrentBackendURL, setBackendURL } from "../../config/constants.js";

/**
 * Component to configure backend URL at runtime
 * Useful when accessing from different devices/networks
 */
export default function BackendConfig() {
  const [showConfig, setShowConfig] = useState(false);
  const [backendURL, setBackendURLState] = useState(getCurrentBackendURL());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    setBackendURLState(getCurrentBackendURL());
  }, []);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`${backendURL}/health`);
      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: `Connected! Database: ${data.database}`,
        });
      } else {
        setTestResult({
          success: false,
          message: `Server responded with status ${response.status}`,
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Connection failed: ${error.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (backendURL && backendURL.trim()) {
      setBackendURL(backendURL.trim());
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!showConfig ? (
        <button
          onClick={() => setShowConfig(true)}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-700 text-sm"
          title="Configure Backend Connection"
        >
          ⚙️ Backend Config
        </button>
      ) : (
        <div className="bg-white border border-gray-300 rounded-lg shadow-xl p-4 w-96 max-w-[calc(100vw-2rem)]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Backend Configuration
            </h3>
            <button
              onClick={() => setShowConfig(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Backend URL
              </label>
              <input
                type="text"
                value={backendURL}
                onChange={(e) => setBackendURLState(e.target.value)}
                placeholder="http://10.1.10.112:3001"
                className="touch-input w-full border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Current: {getCurrentBackendURL()}
              </p>
            </div>

            {testResult && (
              <div
                className={`p-2 rounded text-sm ${
                  testResult.success
                    ? "bg-green-50 text-green-800"
                    : "bg-red-50 text-red-800"
                }`}
              >
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={testConnection}
                disabled={testing || !backendURL}
                className="touch-button flex-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm"
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <button
                onClick={handleSave}
                disabled={!backendURL}
                className="touch-button flex-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm"
              >
                Save & Reload
              </button>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p>
                <strong>Tip:</strong> If orders aren't showing, check:
              </p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>Backend server is running</li>
                <li>You're on the same network</li>
                <li>Firewall allows connections</li>
                <li>Use the server's IP address</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
