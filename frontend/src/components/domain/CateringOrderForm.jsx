import { useState, useEffect } from "react";
import { simulationAPI } from "../../utils/api.js";

/**
 * CateringOrderForm component - Form for placing catering orders
 */
export default function CateringOrderForm({
  simulationId,
  bakeSpecs = [],
  currentSimulationTime = null,
  autoApprove = false,
  onSubmit,
  onError,
}) {
  const [items, setItems] = useState([{ itemGuid: "", quantity: "" }]);
  const [pickupTime, setPickupTime] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Helper to round time to nearest 20-minute increment
  const roundToTwentyMinutes = (timeStr) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    const roundedMinutes = Math.round(totalMinutes / 20) * 20;
    const roundedHours = Math.floor(roundedMinutes / 60);
    const roundedMins = roundedMinutes % 60;
    return `${String(roundedHours).padStart(2, "0")}:${String(
      roundedMins
    ).padStart(2, "0")}`;
  };

  // Parse time string to minutes
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  // Format minutes to time string
  const formatMinutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  // Validate form
  const validate = () => {
    const newErrors = {};

    // Validate items
    const validItems = items.filter((item) => item.itemGuid && item.quantity);
    if (validItems.length === 0) {
      newErrors.items = "At least one item with quantity is required";
    }

    // Validate quantities
    items.forEach((item, index) => {
      if (item.itemGuid && (!item.quantity || item.quantity <= 0)) {
        newErrors[`item_${index}_quantity`] = "Quantity must be greater than 0";
      }
    });

    // Validate pickup time
    if (!pickupTime) {
      newErrors.pickupTime = "Pickup time is required";
    } else {
      const roundedTime = roundToTwentyMinutes(pickupTime);
      const pickupMinutes = parseTimeToMinutes(roundedTime);
      const currentMinutes = currentSimulationTime
        ? parseTimeToMinutes(currentSimulationTime)
        : null;

      if (!pickupMinutes) {
        newErrors.pickupTime = "Invalid time format";
      } else if (currentMinutes !== null) {
        const noticeMinutes = pickupMinutes - currentMinutes;
        if (noticeMinutes < 120) {
          const minTime = formatMinutesToTime(currentMinutes + 120);
          newErrors.pickupTime = `Catering orders require at least 2 hours notice. Earliest pickup time: ${minTime}`;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle pickup time change - round to 20 minutes
  const handlePickupTimeChange = (e) => {
    const rawTime = e.target.value;
    const roundedTime = roundToTwentyMinutes(rawTime);
    setPickupTime(roundedTime);
    // Clear error when user changes
    if (errors.pickupTime) {
      setErrors({ ...errors, pickupTime: null });
    }
  };

  // Handle item change
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
    // Clear error when user changes
    if (errors[`item_${index}_quantity`]) {
      const newErrors = { ...errors };
      delete newErrors[`item_${index}_quantity`];
      setErrors(newErrors);
    }
  };

  // Add new item row
  const handleAddItem = () => {
    setItems([...items, { itemGuid: "", quantity: "" }]);
  };

  // Remove item row
  const handleRemoveItem = (index) => {
    if (items.length > 1) {
      const newItems = items.filter((_, i) => i !== index);
      setItems(newItems);
    }
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const roundedTime = roundToTwentyMinutes(pickupTime);

      // Double-check that we have a valid time (validation should catch this, but be safe)
      if (!roundedTime || roundedTime === "") {
        setErrors({ submit: "Pickup time is required" });
        return;
      }

      const validItems = items
        .filter((item) => item.itemGuid && item.quantity)
        .map((item) => ({
          itemGuid: item.itemGuid,
          quantity: parseInt(item.quantity, 10),
        }));

      const result = await simulationAPI.createCateringOrder(simulationId, {
        items: validItems,
        requiredAvailableTime: roundedTime,
        autoApprove,
      });

      // Reset form
      setItems([{ itemGuid: "", quantity: "" }]);
      setPickupTime("");
      setErrors({});

      if (onSubmit) {
        onSubmit(result);
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.error?.message ||
        error.message ||
        "Failed to create catering order";
      setErrors({ submit: errorMessage });
      if (onError) {
        onError(error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate minimum pickup time (current time + 2 hours, rounded to 20 minutes)
  useEffect(() => {
    if (currentSimulationTime) {
      const currentMinutes = parseTimeToMinutes(currentSimulationTime);
      if (currentMinutes !== null) {
        const minPickupMinutes = currentMinutes + 120;
        const minPickupTime = formatMinutesToTime(minPickupMinutes);
        const roundedMinTime = roundToTwentyMinutes(minPickupTime);
        // If pickup time is before minimum, update it
        if (
          pickupTime &&
          parseTimeToMinutes(pickupTime) < parseTimeToMinutes(roundedMinTime)
        ) {
          setPickupTime(roundedMinTime);
        }
      }
    }
  }, [currentSimulationTime]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Place Catering Order
        </h3>

        {/* Items */}
        <div className="space-y-3 mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Items
          </label>
          {items.map((item, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1">
                <select
                  value={item.itemGuid}
                  onChange={(e) =>
                    handleItemChange(index, "itemGuid", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select item...</option>
                  {bakeSpecs.map((spec) => (
                    <option key={spec.itemGuid} value={spec.itemGuid}>
                      {spec.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    handleItemChange(index, "quantity", e.target.value)
                  }
                  placeholder="Qty"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                {errors[`item_${index}_quantity`] && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors[`item_${index}_quantity`]}
                  </p>
                )}
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="px-3 py-2 text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {errors.items && (
            <p className="text-sm text-red-600">{errors.items}</p>
          )}
          <button
            type="button"
            onClick={handleAddItem}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + Add Item
          </button>
        </div>

        {/* Pickup Time */}
        <div className="mb-4">
          <label
            htmlFor="pickup-time"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Pickup Time (rounded to 20-minute increments)
          </label>
          <input
            id="pickup-time"
            type="time"
            value={pickupTime}
            onChange={handlePickupTimeChange}
            step="1200"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.pickupTime && (
            <p className="text-sm text-red-600 mt-1">{errors.pickupTime}</p>
          )}
          {currentSimulationTime && (
            <p className="text-xs text-gray-500 mt-1">
              Current time: {currentSimulationTime} | Minimum notice: 2 hours
            </p>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Placing Order..." : "Place Order"}
          </button>
          {errors.submit && (
            <p className="text-sm text-red-600">{errors.submit}</p>
          )}
        </div>
      </div>
    </form>
  );
}
