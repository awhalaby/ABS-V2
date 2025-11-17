import { useState, useEffect } from "react";
import { inventoryAPI } from "../utils/api.js";
import { formatNumber } from "../utils/formatters.js";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";

export default function InventoryPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  const [editingItem, setEditingItem] = useState(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editRestockThreshold, setEditRestockThreshold] = useState("");

  useEffect(() => {
    loadInventory();
  }, [lookbackDays, leadTimeDays]);

  const loadInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await inventoryAPI.getAll(lookbackDays, leadTimeDays);
      setInventory(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item.itemGuid);
    setEditQuantity(item.currentQuantity.toString());
    setEditRestockThreshold(
      item.restockThreshold !== null && item.restockThreshold !== undefined
        ? item.restockThreshold.toString()
        : ""
    );
  };

  const handleSave = async (itemGuid) => {
    const quantity = parseInt(editQuantity, 10);
    if (isNaN(quantity) || quantity < 0) {
      setError("Quantity must be a non-negative number");
      return;
    }

    const restockThreshold =
      editRestockThreshold === "" ? null : parseInt(editRestockThreshold, 10);
    if (
      editRestockThreshold !== "" &&
      (isNaN(restockThreshold) || restockThreshold < 0)
    ) {
      setError("Restock threshold must be a non-negative number");
      return;
    }

    try {
      await inventoryAPI.update(itemGuid, quantity, null, restockThreshold);
      await loadInventory();
      setEditingItem(null);
      setEditQuantity("");
      setEditRestockThreshold("");
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to update inventory");
    }
  };

  const handleCancel = () => {
    setEditingItem(null);
    setEditQuantity("");
    setEditRestockThreshold("");
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "low":
        return "bg-red-100 text-red-800 border-red-300";
      case "reorder_soon":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "ok":
        return "bg-green-100 text-green-800 border-green-300";
      case "no_inventory":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "low":
        return "Low Stock";
      case "reorder_soon":
        return "Reorder Soon";
      case "ok":
        return "OK";
      case "no_inventory":
        return "No Inventory";
      default:
        return status;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Store Inventory
        </h2>
        <p className="text-gray-600">
          Track current inventory levels and get restock suggestions based on
          consumption patterns.
        </p>
      </div>

      {/* Settings */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6 max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lookback Period (days)
            </label>
            <input
              type="number"
              min="7"
              max="90"
              value={lookbackDays}
              onChange={(e) => setLookbackDays(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of days to analyze for consumption patterns
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lead Time (days)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Days until delivery from distributor
            </p>
          </div>
        </div>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current Qty
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Restock Threshold
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Daily Consumption
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days Until Restock
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Suggested Order
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th
                      className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-20 border-l border-gray-200"
                      style={{
                        width: "100px",
                        minWidth: "100px",
                        maxWidth: "100px",
                      }}
                    >
                      Actions
                    </th>
                    <th
                      className="px-2 py-2 bg-gray-50"
                      style={{
                        width: "20px",
                        minWidth: "20px",
                        maxWidth: "20px",
                      }}
                    ></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inventory.length === 0 ? (
                    <tr>
                      <td
                        colSpan="10"
                        className="px-6 py-4 text-center text-gray-500"
                      >
                        No inventory records found. Update quantities to get
                        started.
                      </td>
                    </tr>
                  ) : (
                    inventory.map((item) => (
                      <tr key={item.itemGuid} className="hover:bg-gray-50">
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {item.displayName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.itemGuid}
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {editingItem === item.itemGuid ? (
                            <input
                              type="number"
                              min="0"
                              value={editQuantity}
                              onChange={(e) => setEditQuantity(e.target.value)}
                              className="w-16 px-1 py-1 border border-gray-300 rounded text-sm"
                              autoFocus
                            />
                          ) : (
                            <span className="text-sm text-gray-900">
                              {formatNumber(item.currentQuantity)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {editingItem === item.itemGuid ? (
                            <input
                              type="number"
                              min="0"
                              value={editRestockThreshold}
                              onChange={(e) =>
                                setEditRestockThreshold(e.target.value)
                              }
                              placeholder="Auto"
                              className="w-16 px-1 py-1 border border-gray-300 rounded text-sm"
                            />
                          ) : (
                            <span className="text-sm text-gray-500">
                              {formatNumber(item.restockThreshold)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500">
                          {item.dailyConsumption > 0
                            ? formatNumber(item.dailyConsumption)
                            : "N/A"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500">
                          {item.daysUntilRestock !== null
                            ? `${item.daysUntilRestock} days`
                            : "N/A"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="text-sm font-medium text-blue-600">
                            {formatNumber(item.suggestedOrderQuantity)}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border ${getStatusColor(
                              item.status
                            )}`}
                          >
                            {getStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(item.lastUpdated)}
                        </td>
                        <td
                          className="px-2 py-2 text-sm font-medium sticky right-0 bg-white z-20 overflow-hidden border-l border-gray-200"
                          style={{
                            width: "100px",
                            minWidth: "100px",
                            maxWidth: "100px",
                          }}
                        >
                          <div className="flex gap-1 items-center justify-start min-h-[1.5rem] overflow-hidden">
                            {editingItem === item.itemGuid ? (
                              <>
                                <button
                                  onClick={() => handleSave(item.itemGuid)}
                                  className="text-blue-600 hover:text-blue-900 text-xs px-1 flex-shrink-0"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancel}
                                  className="text-gray-600 hover:text-gray-900 text-xs px-1 flex-shrink-0"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleEdit(item)}
                                className="text-blue-600 hover:text-blue-900 text-xs px-1 flex-shrink-0"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-2 py-2 bg-white"
                          style={{
                            width: "20px",
                            minWidth: "20px",
                            maxWidth: "20px",
                          }}
                        ></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          How Restock Suggestions Work
        </h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>
            <strong>Daily Consumption:</strong> Calculated from average sales
            over the lookback period
          </li>
          <li>
            <strong>Days Until Restock:</strong> Based on current inventory,
            restock threshold, and daily consumption
          </li>
          <li>
            <strong>Suggested Order:</strong> Calculated to reach target
            inventory level after accounting for lead time consumption
          </li>
          <li>
            <strong>Status:</strong> Low Stock (at/below threshold), Reorder
            Soon (within lead time), OK (sufficient stock)
          </li>
        </ul>
      </div>
    </div>
  );
}
