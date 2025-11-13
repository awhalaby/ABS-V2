/**
 * Order data transformer - Converts various order formats to standard format
 */

/**
 * Detect if order is in nested format (with checks/selections)
 * @param {Object} order - Order object
 * @returns {boolean} True if nested format
 */
function isNestedFormat(order) {
  return (
    order.guid !== undefined &&
    order.checks !== undefined &&
    Array.isArray(order.checks)
  );
}

/**
 * Transform nested format order to flat format
 * One order with multiple checks/selections becomes multiple order records
 * @param {Object} nestedOrder - Order in nested format
 * @returns {Array<Object>} Array of flat order objects
 */
function transformNestedOrder(nestedOrder) {
  const orders = [];
  const orderId = nestedOrder.guid || nestedOrder.orderId;

  // Validate required fields
  if (!orderId) {
    console.warn("Nested order missing guid/orderId:", nestedOrder);
    return [];
  }

  if (!nestedOrder.paidDate) {
    console.warn("Nested order missing paidDate:", nestedOrder);
    return [];
  }

  if (!nestedOrder.checks || !Array.isArray(nestedOrder.checks)) {
    console.warn("Nested order missing checks array:", nestedOrder);
    return [];
  }

  nestedOrder.checks.forEach((check, checkIndex) => {
    if (!check || !check.selections || !Array.isArray(check.selections)) {
      console.warn(`Check ${checkIndex} missing selections:`, check);
      return;
    }

    check.selections.forEach((selection, selectionIndex) => {
      if (!selection) {
        console.warn(`Selection ${selectionIndex} is null/undefined`);
        return;
      }

      // Extract itemGuid from various possible locations
      const itemGuid =
        selection.item?.guid || selection.itemGuid || "";

      // Extract displayName
      const displayName = selection.displayName || "";

      // Extract quantity - must be a valid number > 0
      const quantity =
        typeof selection.quantity === "number" && selection.quantity > 0
          ? selection.quantity
          : typeof selection.quantity === "string"
          ? parseInt(selection.quantity, 10)
          : null;

      // Skip if essential fields are missing
      if (!itemGuid && !displayName) {
        console.warn(
          `Selection ${selectionIndex} missing both itemGuid and displayName:`,
          selection
        );
        return;
      }

      if (!quantity || quantity <= 0) {
        console.warn(
          `Selection ${selectionIndex} has invalid quantity:`,
          selection.quantity
        );
        return;
      }

      orders.push({
        orderId: String(orderId),
        paidDate: nestedOrder.paidDate,
        displayName: displayName,
        itemGuid: itemGuid,
        quantity: quantity,
        price: selection.price || nestedOrder.price || 0,
      });
    });
  });

  return orders;
}

/**
 * Transform flat format order (already in correct format)
 * @param {Object} flatOrder - Order in flat format
 * @returns {Array<Object>} Array with single order object
 */
function transformFlatOrder(flatOrder) {
  // Validate required fields
  const orderId = flatOrder.orderId || flatOrder.guid;
  if (!orderId) {
    console.warn("Flat order missing orderId/guid:", flatOrder);
    return [];
  }

  if (!flatOrder.paidDate) {
    console.warn("Flat order missing paidDate:", flatOrder);
    return [];
  }

  // Validate that we have either displayName or itemGuid
  const displayName = flatOrder.displayName || "";
  const itemGuid = flatOrder.itemGuid || "";
  if (!displayName && !itemGuid) {
    console.warn(
      "Flat order missing both displayName and itemGuid:",
      flatOrder
    );
    return [];
  }

  // Validate quantity
  let quantity = flatOrder.quantity;
  if (typeof quantity === "string") {
    quantity = parseInt(quantity, 10);
  }
  if (!quantity || quantity <= 0 || isNaN(quantity)) {
    console.warn("Flat order has invalid quantity:", flatOrder.quantity);
    return [];
  }

  return [
    {
      orderId: String(orderId),
      paidDate: flatOrder.paidDate,
      displayName: displayName,
      itemGuid: itemGuid,
      quantity: quantity,
      price: flatOrder.price ? Number(flatOrder.price) : 0,
    },
  ];
}

/**
 * Transform orders array to standard flat format
 * Handles both nested (checks/selections) and flat formats
 * @param {Array<Object>} ordersArray - Array of order objects in any format
 * @returns {Array<Object>} Array of orders in standard flat format
 */
export function transformOrders(ordersArray) {
  const transformedOrders = [];

  ordersArray.forEach((order) => {
    if (isNestedFormat(order)) {
      // Transform nested format
      const flatOrders = transformNestedOrder(order);
      transformedOrders.push(...flatOrders);
    } else {
      // Transform flat format
      const flatOrders = transformFlatOrder(order);
      transformedOrders.push(...flatOrders);
    }
  });

  return transformedOrders;
}
