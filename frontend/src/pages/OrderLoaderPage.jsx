import { useState, useRef, useCallback, useEffect } from "react";
import { ordersAPI } from "../utils/api.js";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import { formatNumber, formatDate } from "../utils/formatters.js";

export default function OrderLoaderPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const [dateRanges, setDateRanges] = useState([]);
  const [stats, setStats] = useState(null);
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [deletingRange, setDeletingRange] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // Load date ranges on mount
  const loadDateRanges = useCallback(async () => {
    try {
      setLoadingRanges(true);
      const response = await ordersAPI.getDateRanges();
      setDateRanges(response.data || []);
    } catch (err) {
      console.error("Failed to load date ranges:", err);
    } finally {
      setLoadingRanges(false);
    }
  }, []);

  // Load date ranges on component mount
  useEffect(() => {
    loadDateRanges();
  }, [loadDateRanges]);

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setUploadResult(null);
    setValidation(null);

    // Read and preview file
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const jsonData = JSON.parse(content);

        if (!Array.isArray(jsonData)) {
          setError("File must contain a JSON array");
          return;
        }

        // Show preview (first 10 records)
        setPreview(jsonData.slice(0, 10));

        // Basic client-side validation (skip for nested format - let server handle it)
        const errors = [];
        const isNestedFormat =
          jsonData.length > 0 && jsonData[0].guid && jsonData[0].checks;

        if (!isNestedFormat) {
          // Only validate flat format on client side
          jsonData.forEach((order, index) => {
            if (!order.orderId && !order.guid)
              errors.push(`Row ${index + 1}: Missing orderId`);
            if (!order.paidDate)
              errors.push(`Row ${index + 1}: Missing paidDate`);
            if (!order.displayName && !order.itemGuid) {
              errors.push(`Row ${index + 1}: Missing displayName or itemGuid`);
            }
            if (!order.quantity || order.quantity <= 0) {
              errors.push(`Row ${index + 1}: Invalid quantity`);
            }
          });
        } else {
          // For nested format, just check basic structure
          jsonData.forEach((order, index) => {
            if (!order.guid) errors.push(`Row ${index + 1}: Missing guid`);
            if (!order.paidDate)
              errors.push(`Row ${index + 1}: Missing paidDate`);
            if (!order.checks || !Array.isArray(order.checks)) {
              errors.push(`Row ${index + 1}: Missing checks array`);
            }
          });
        }

        if (errors.length > 0) {
          setValidation({
            valid: false,
            errors: errors.slice(0, 20), // Show first 20 errors
            totalErrors: errors.length,
          });
        } else {
          setValidation({ valid: true, errors: [] });
        }
      } catch (err) {
        setError(`Invalid JSON: ${err.message}`);
      }
    };
    reader.readAsText(selectedFile);
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const selectedFile = e.target.files[0];
    handleFileSelect(selectedFile);
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file || !validation?.valid) return;

    setLoading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await ordersAPI.load(formData);
      setUploadResult(response.data);
      setFile(null);
      setPreview(null);
      setValidation(null);
      fileInputRef.current.value = "";

      // Reload date ranges
      await loadDateRanges();
    } catch (err) {
      setError(err.message || "Failed to upload orders");
    } finally {
      setLoading(false);
    }
  };

  // Handle delete date range
  const handleDeleteRange = async (startDate, endDate) => {
    if (
      !window.confirm(
        `Are you sure you want to delete all orders from ${startDate} to ${endDate}?`
      )
    ) {
      return;
    }

    setDeletingRange(`${startDate}-${endDate}`);

    try {
      await ordersAPI.deleteRange(startDate, endDate);
      await loadDateRanges();
    } catch (err) {
      setError(err.message || "Failed to delete orders");
    } finally {
      setDeletingRange(null);
    }
  };

  // Handle delete all orders
  const handleDeleteAll = async () => {
    const confirmed = window.confirm(
      "⚠️ WARNING: This will delete ALL orders in the database. This action cannot be undone.\n\nAre you absolutely sure you want to continue?"
    );

    if (!confirmed) {
      return;
    }

    // Double confirmation for safety
    const doubleConfirmed = window.confirm(
      `Final confirmation: This will permanently delete ALL ${dateRanges.reduce(
        (sum, r) => sum + r.orderCount,
        0
      )} orders across ${
        dateRanges.length
      } date range(s).\n\nClick OK to proceed with deletion.`
    );

    if (!doubleConfirmed) {
      return;
    }

    setDeletingAll(true);
    setError(null);

    try {
      const response = await ordersAPI.deleteAll();
      await loadDateRanges();
      setError(null);
      // Show success message
      alert(
        `Successfully deleted all ${formatNumber(
          response.data.deletedCount
        )} orders.`
      );
    } catch (err) {
      setError(err.message || "Failed to delete all orders");
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Loader</h2>
        <p className="text-gray-600">
          Upload JSON files containing order data to import into the system.
          Bake specs will be automatically created for any new SKUs found in the
          orders.
        </p>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* File Upload Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Upload Orders File
        </h3>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          } transition-colors`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileInputChange}
            className="hidden"
            id="file-input"
          />
          <label
            htmlFor="file-input"
            className="cursor-pointer flex flex-col items-center"
          >
            <svg
              className="w-12 h-12 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-gray-600 mb-2">
              Drag and drop a JSON file here, or{" "}
              <span className="text-blue-600 hover:text-blue-800">
                click to browse
              </span>
            </span>
            <span className="text-sm text-gray-500">
              JSON files only, max 10MB
            </span>
          </label>
        </div>

        {file && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setValidation(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {/* Validation Results */}
        {validation && (
          <div className="mt-4">
            {validation.valid ? (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4">
                <p className="font-medium">✓ File is valid</p>
                <p className="text-sm mt-1">
                  Ready to upload {preview?.length || 0} preview records
                </p>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
                <p className="font-medium">✗ Validation failed</p>
                <p className="text-sm mt-1">
                  Found {validation.totalErrors} error(s)
                </p>
                <ul className="list-disc list-inside mt-2 text-sm max-h-40 overflow-y-auto">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Upload Button */}
        {file && validation?.valid && (
          <div className="mt-4">
            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Uploading...
                </>
              ) : (
                "Upload Orders"
              )}
            </button>
          </div>
        )}

        {/* Upload Result */}
        {uploadResult && (
          <div className="mt-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-4">
            <p className="font-medium">✓ Upload successful!</p>
            <div className="mt-2 text-sm space-y-1">
              <p>Total received: {formatNumber(uploadResult.totalReceived)}</p>
              {uploadResult.totalTransformed && (
                <p>
                  Transformed: {formatNumber(uploadResult.totalTransformed)}{" "}
                  records
                </p>
              )}
              <p>Validated: {formatNumber(uploadResult.validated)}</p>
              <p>Inserted: {formatNumber(uploadResult.inserted)}</p>
              {uploadResult.duplicates > 0 && (
                <p className="text-yellow-700">
                  Duplicates skipped: {formatNumber(uploadResult.duplicates)}
                </p>
              )}
              {uploadResult.bakeSpecs && (
                <div className="mt-3 pt-3 border-t border-green-300">
                  <p className="font-medium mb-1">
                    Bake Specs Auto-Initialization:
                  </p>
                  <p>
                    Total SKUs found:{" "}
                    {formatNumber(uploadResult.bakeSpecs.total)}
                  </p>
                  {uploadResult.bakeSpecs.created > 0 && (
                    <p className="text-green-900">
                      ✓ Created {formatNumber(uploadResult.bakeSpecs.created)}{" "}
                      new bake spec(s)
                    </p>
                  )}
                  {uploadResult.bakeSpecs.existing > 0 && (
                    <p>
                      {formatNumber(uploadResult.bakeSpecs.existing)} bake
                      spec(s) already existed
                    </p>
                  )}
                  {uploadResult.bakeSpecs.skipped > 0 && (
                    <p className="text-yellow-700">
                      ⚠ Skipped {formatNumber(uploadResult.bakeSpecs.skipped)}{" "}
                      due to errors
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preview Section */}
      {preview && preview.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Preview (First 10 records)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Order ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Item
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {preview.map((order, idx) => {
                  // Handle nested format preview
                  const isNested = order.guid && order.checks;
                  const orderId = order.orderId || order.guid;
                  const paidDate = order.paidDate;

                  if (isNested) {
                    // Show first selection from first check
                    const firstCheck = order.checks?.[0];
                    const firstSelection = firstCheck?.selections?.[0];
                    const displayName = firstSelection?.displayName || "";
                    const itemGuid =
                      firstSelection?.item?.guid ||
                      firstSelection?.itemGuid ||
                      "";
                    const quantity = firstSelection?.quantity || 0;
                    const selectionCount =
                      order.checks?.reduce(
                        (sum, check) => sum + (check.selections?.length || 0),
                        0
                      ) || 0;

                    return (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {orderId}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatDate(paidDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {displayName || itemGuid || "-"}
                          {selectionCount > 1 && (
                            <span className="text-xs text-gray-500 ml-1">
                              (+{selectionCount - 1} more)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {quantity}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">-</td>
                      </tr>
                    );
                  }

                  // Flat format preview
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {orderId}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(paidDate)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {order.displayName || order.itemGuid}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {order.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {order.price ? `$${order.price.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Date Ranges Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Existing Date Ranges
          </h3>
          <div className="flex gap-3">
            <button
              onClick={loadDateRanges}
              disabled={loadingRanges}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
            >
              {loadingRanges ? "Loading..." : "Refresh"}
            </button>
            {dateRanges.length > 0 && (
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll || loadingRanges}
                className="text-sm text-red-600 hover:text-red-800 disabled:text-gray-400 font-medium"
              >
                {deletingAll ? "Deleting..." : "Delete All Orders"}
              </button>
            )}
          </div>
        </div>

        {loadingRanges ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : dateRanges.length === 0 ? (
          <EmptyState
            title="No orders found"
            message="Upload order files to see date ranges here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date Range
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Orders
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Items
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dateRanges.map((range, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {range.dateRange}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatNumber(range.orderCount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatNumber(range.itemCount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button
                        onClick={() =>
                          handleDeleteRange(range.startDate, range.endDate)
                        }
                        disabled={
                          deletingRange ===
                          `${range.startDate}-${range.endDate}`
                        }
                        className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        {deletingRange === `${range.startDate}-${range.endDate}`
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
