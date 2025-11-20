import { Fragment, useEffect, useMemo, useState } from "react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [savingItem, setSavingItem] = useState(null);
  const [inlineError, setInlineError] = useState("");
  const statusFilterOptions = [
    { value: "all", label: "All" },
    { value: "low", label: "Low Stock" },
    { value: "reorder_soon", label: "Reorder Soon" },
    { value: "ok", label: "OK" },
    { value: "no_inventory", label: "No Inventory" },
  ];

  const summaryData = useMemo(() => {
    if (!inventory.length) {
      return {
        criticalCount: 0,
        reorderSoonCount: 0,
        suggestedUnits: 0,
        avgDaysUntilRestock: null,
      };
    }

    const totals = inventory.reduce(
      (acc, item) => {
        if (item.status === "low" || item.status === "no_inventory") {
          acc.criticalCount += 1;
        }
        if (item.status === "reorder_soon") {
          acc.reorderSoonCount += 1;
        }
        acc.suggestedUnits += item.suggestedOrderQuantity || 0;

        if (
          typeof item.daysUntilRestock === "number" &&
          item.daysUntilRestock >= 0
        ) {
          acc.daysUntilRestockValues.push(item.daysUntilRestock);
        }

        return acc;
      },
      {
        criticalCount: 0,
        reorderSoonCount: 0,
        suggestedUnits: 0,
        daysUntilRestockValues: [],
      }
    );

    const avgDaysUntilRestock =
      totals.daysUntilRestockValues.length > 0
        ? (
            totals.daysUntilRestockValues.reduce(
              (sum, value) => sum + value,
              0
            ) / totals.daysUntilRestockValues.length
          ).toFixed(1)
        : null;

    return {
      criticalCount: totals.criticalCount,
      reorderSoonCount: totals.reorderSoonCount,
      suggestedUnits: totals.suggestedUnits,
      avgDaysUntilRestock,
    };
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return inventory.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.displayName?.toLowerCase().includes(normalizedSearch) ||
        item.itemGuid?.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" ? true : item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [inventory, searchTerm, statusFilter]);

  const sortedInventory = useMemo(() => {
    if (!sortConfig?.key) {
      return filteredInventory;
    }

    const sorted = [...filteredInventory].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      if (typeof aValue === "number" && typeof bValue === "number") {
        return aValue - bValue;
      }

      return aValue.toString().localeCompare(bValue.toString());
    });

    return sortConfig.direction === "asc" ? sorted : sorted.reverse();
  }, [filteredInventory, sortConfig]);

  const noInventoryRecords = inventory.length === 0;
  const noFilteredResults = !noInventoryRecords && sortedInventory.length === 0;

  const handleSort = (key) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return { key, direction: "asc" };
    });
  };

  const getSortLabel = (key) => {
    if (sortConfig?.key !== key) return "";
    return sortConfig.direction === "asc" ? "(asc)" : "(desc)";
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSortConfig({ key: null, direction: "asc" });
  };

  const hasActiveFilters =
    statusFilter !== "all" || searchTerm.trim() !== "" || sortConfig.key;

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
    setInlineError("");
  };

  const handleSave = async (itemGuid) => {
    setInlineError("");
    const quantity = parseInt(editQuantity, 10);
    if (isNaN(quantity) || quantity < 0) {
      setInlineError("Quantity must be a non-negative number");
      return;
    }

    const restockThreshold =
      editRestockThreshold === "" ? null : parseInt(editRestockThreshold, 10);
    if (
      editRestockThreshold !== "" &&
      (isNaN(restockThreshold) || restockThreshold < 0)
    ) {
      setInlineError("Restock threshold must be a non-negative number");
      return;
    }

    try {
      setSavingItem(itemGuid);
      await inventoryAPI.update(itemGuid, quantity, null, restockThreshold);
      await loadInventory();
      setEditingItem(null);
      setEditQuantity("");
      setEditRestockThreshold("");
      setError(null);
      setInlineError("");
    } catch (err) {
      const message = err.message || "Failed to update inventory";
      setInlineError(message);
      setError(message);
    } finally {
      setSavingItem(null);
    }
  };

  const handleCancel = () => {
    setEditingItem(null);
    setEditQuantity("");
    setEditRestockThreshold("");
    setInlineError("");
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

  const formatRelativeTime = (dateString) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();

    if (diffMs < 0) {
      return "Upcoming";
    }

    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) {
      return "Just now";
    }

    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours < 24) {
      return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);

    if (diffDays < 30) {
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }

    const diffMonths = Math.floor(diffDays / 30);

    if (diffMonths < 12) {
      return `${diffMonths} mo${diffMonths === 1 ? "" : "s"} ago`;
    }

    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} yr${diffYears === 1 ? "" : "s"} ago`;
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Critical Items</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {summaryData.criticalCount}
          </p>
          <p className="text-xs text-red-600">
            Needs immediate restock attention
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Reorder Soon</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {summaryData.reorderSoonCount}
          </p>
          <p className="text-xs text-yellow-600">
            Plan purchases within lead time
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Suggested Units</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {formatNumber(summaryData.suggestedUnits)}
          </p>
          <p className="text-xs text-gray-500">
            Total recommended to order now
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Avg Days Until Restock</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {summaryData.avgDaysUntilRestock || "--"}
          </p>
          <p className="text-xs text-gray-500">
            Based on recent consumption trends
          </p>
        </div>
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

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search inventory
            </label>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by item name or ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {statusFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`px-3 py-1 text-sm rounded-full border transition ${
                  statusFilter === option.value
                    ? "bg-blue-50 text-blue-700 border-blue-400"
                    : "text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                aria-pressed={statusFilter === option.value}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Reset filters
            </button>
          )}
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
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() => handleSort("currentQuantity")}
                        className="inline-flex items-center gap-1 w-full justify-end"
                      >
                        <span>Current Qty</span>
                        {getSortLabel("currentQuantity") && (
                          <span className="text-[10px] text-gray-400">
                            {getSortLabel("currentQuantity")}
                          </span>
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() => handleSort("restockThreshold")}
                        className="inline-flex items-center gap-1 w-full justify-end"
                      >
                        <span>Restock Threshold</span>
                        {getSortLabel("restockThreshold") && (
                          <span className="text-[10px] text-gray-400">
                            {getSortLabel("restockThreshold")}
                          </span>
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() => handleSort("dailyConsumption")}
                        className="inline-flex items-center gap-1 w-full justify-end"
                      >
                        <span>Daily Consumption</span>
                        {getSortLabel("dailyConsumption") && (
                          <span className="text-[10px] text-gray-400">
                            {getSortLabel("dailyConsumption")}
                          </span>
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() => handleSort("daysUntilRestock")}
                        className="inline-flex items-center gap-1 w-full justify-end"
                      >
                        <span>Days Until Restock</span>
                        {getSortLabel("daysUntilRestock") && (
                          <span className="text-[10px] text-gray-400">
                            {getSortLabel("daysUntilRestock")}
                          </span>
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() => handleSort("suggestedOrderQuantity")}
                        className="inline-flex items-center gap-1 w-full justify-end"
                      >
                        <span>Suggested Order</span>
                        {getSortLabel("suggestedOrderQuantity") && (
                          <span className="text-[10px] text-gray-400">
                            {getSortLabel("suggestedOrderQuantity")}
                          </span>
                        )}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() => handleSort("lastUpdated")}
                        className="inline-flex items-center gap-1"
                      >
                        <span>Last Updated</span>
                        {getSortLabel("lastUpdated") && (
                          <span className="text-[10px] text-gray-400">
                            {getSortLabel("lastUpdated")}
                          </span>
                        )}
                      </button>
                    </th>
                    <th
                      className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-20 border-l border-gray-200"
                      style={{
                        width: "150px",
                        minWidth: "150px",
                        maxWidth: "150px",
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
                  {noInventoryRecords ? (
                    <tr>
                      <td
                        colSpan="10"
                        className="px-6 py-4 text-center text-gray-500"
                      >
                        No inventory records found. Update quantities to get
                        started.
                      </td>
                    </tr>
                  ) : noFilteredResults ? (
                    <tr>
                      <td
                        colSpan="10"
                        className="px-6 py-4 text-center text-gray-500"
                      >
                        No items match your filters.{" "}
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          Clear filters
                        </button>{" "}
                        to show all inventory.
                      </td>
                    </tr>
                  ) : (
                    sortedInventory.map((item) => {
                      const isEditing = editingItem === item.itemGuid;
                      const parsedQuantity = isEditing
                        ? parseInt(editQuantity, 10)
                        : null;
                      const parsedRestock =
                        isEditing && editRestockThreshold !== ""
                          ? parseInt(editRestockThreshold, 10)
                          : null;
                      const saveDisabled =
                        !isEditing ||
                        savingItem === item.itemGuid ||
                        editQuantity === "" ||
                        parsedQuantity === null ||
                        Number.isNaN(parsedQuantity) ||
                        parsedQuantity < 0 ||
                        (editRestockThreshold !== "" &&
                          (parsedRestock === null ||
                            Number.isNaN(parsedRestock) ||
                            parsedRestock < 0));
                      const lastUpdatedRelative = formatRelativeTime(
                        item.lastUpdated
                      );
                      const lastUpdatedExact = formatDate(item.lastUpdated);

                      return (
                        <Fragment key={item.itemGuid}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-2 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {item.displayName}
                              </div>
                              <div
                                className="text-xs text-gray-500 truncate"
                                title={item.itemGuid}
                              >
                                {item.itemGuid}
                              </div>
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editQuantity}
                                  onChange={(e) =>
                                    setEditQuantity(e.target.value)
                                  }
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                                  autoFocus
                                />
                              ) : (
                                <span className="text-sm text-gray-900">
                                  {formatNumber(item.currentQuantity)}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editRestockThreshold}
                                  onChange={(e) =>
                                    setEditRestockThreshold(e.target.value)
                                  }
                                  placeholder="Auto"
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                                />
                              ) : (
                                <span className="text-sm text-gray-500">
                                  {formatNumber(item.restockThreshold)}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap text-right text-sm text-gray-600">
                              {item.dailyConsumption > 0
                                ? formatNumber(item.dailyConsumption)
                                : "N/A"}
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap text-right text-sm text-gray-600">
                              {item.daysUntilRestock !== null
                                ? `${item.daysUntilRestock} days`
                                : "N/A"}
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap text-right">
                              <span className="text-sm font-semibold text-blue-600">
                                {formatNumber(item.suggestedOrderQuantity)}
                              </span>
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border ${getStatusColor(
                                  item.status
                                )}`}
                              >
                                {getStatusLabel(item.status)}
                              </span>
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-700">
                              <span title={lastUpdatedExact}>
                                {lastUpdatedRelative}
                              </span>
                              <span className="block text-xs text-gray-400">
                                {lastUpdatedExact}
                              </span>
                            </td>
                            <td
                              className="px-2 py-3 text-sm font-medium sticky right-0 bg-white z-20 overflow-hidden border-l border-gray-200"
                              style={{
                                width: "150px",
                                minWidth: "150px",
                                maxWidth: "150px",
                              }}
                            >
                              <div className="flex flex-wrap gap-2 items-center justify-start">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleSave(item.itemGuid)}
                                      className={`text-xs px-3 py-1 rounded border transition ${
                                        saveDisabled
                                          ? "text-gray-400 border-gray-200 cursor-not-allowed"
                                          : "text-white bg-blue-600 border-blue-600 hover:bg-blue-700"
                                      }`}
                                      disabled={saveDisabled}
                                    >
                                      {savingItem === item.itemGuid
                                        ? "Saving..."
                                        : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancel}
                                      className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(item)}
                                    className="text-xs px-3 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
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
                          {isEditing && inlineError && (
                            <tr>
                              <td
                                colSpan="10"
                                className="px-6 py-2 text-sm text-red-700 bg-red-50 border-t border-red-100"
                              >
                                {inlineError}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
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
