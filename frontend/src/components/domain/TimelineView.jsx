import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core";
import BakeCard from "./BakeCard.jsx";
import BatchDetailsModal from "./BatchDetailsModal.jsx";
import { OVEN_CONFIG, BUSINESS_HOURS } from "../../config/constants.js";
import { formatTime } from "../../utils/formatters.js";

/**
 * TimelineView component - 2D timeline visualization
 * Y-axis: Racks (1-12)
 * X-axis: Time (06:00 to 17:00)
 *
 * @param {Array} batches - Array of batch objects
 * @param {Function} onBatchClick - Optional click handler for batches
 * @param {string} currentTime - Optional current time string (HH:MM format) to display indicator
 * @param {Object} options - Configuration options
 * @param {number} options.hourInterval - Time interval for grid (default: 1 hour)
 * @param {number} options.minutesPerPixel - Minutes per pixel for width calculation (default: 1)
 * @param {number} options.rackHeight - Height of each rack row in pixels (default: 120)
 */
export default function TimelineView({
  batches = [],
  onBatchClick,
  currentTime = null,
  options = {},
  onBatchDelete = null,
  onBatchMove = null,
  canEdit = true,
}) {
  const { hourInterval = 1, minutesPerPixel = 0.3, rackHeight = 140 } = options;
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dropPreviewTime, setDropPreviewTime] = useState(null);
  const [dropPreviewPosition, setDropPreviewPosition] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 300, // Require 300ms hold before drag activates
        tolerance: 5, // Allow 5px movement during delay
      },
    })
  );

  const handleBatchClick = (batch) => {
    setSelectedBatch(batch);
    // Also call the optional onBatchClick handler if provided
    if (onBatchClick) {
      onBatchClick(batch);
    }
  };

  const handleCloseModal = () => {
    setSelectedBatch(null);
  };

  // Drag handlers
  const handleDragStart = (event) => {
    const { active } = event;
    setActiveId(active.id);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over || !onBatchMove) {
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    // Get rack number from over.id (format: "rack-{number}")
    const rackId = over.id;
    if (!rackId || !rackId.startsWith("rack-")) {
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    const rackNum = parseInt(rackId.replace("rack-", ""), 10);
    if (isNaN(rackNum)) {
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    // Calculate time from mouse X position
    const rackContainer = document.querySelector(`[data-rack="${rackNum}"]`);
    if (!rackContainer) {
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    const rect = rackContainer.getBoundingClientRect();
    const mouseX = event.activatorEvent?.clientX || 0;
    const relativeX = mouseX - rect.left - 96; // Subtract rack label width (96px)

    if (relativeX < 0) {
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    // Calculate start/end minutes
    const startMinutes = parseTimeToMinutes(BUSINESS_HOURS.START) || 360;
    const endMinutes = parseTimeToMinutes(BUSINESS_HOURS.END) || 1020;
    const droppedMinutes = startMinutes + relativeX / minutesPerPixel;

    // Round to nearest 20-minute increment
    const roundToTwentyMinuteIncrement = (minutes) => {
      const increment = 20;
      return Math.round(minutes / increment) * increment;
    };
    const roundedMinutes = roundToTwentyMinuteIncrement(droppedMinutes);

    // Validate within business hours
    const batchBakeTime = active.data.current?.batch?.bakeTime || 0;
    if (
      roundedMinutes < startMinutes ||
      roundedMinutes + batchBakeTime > endMinutes
    ) {
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    const newStartTime = formatMinutesToTime(roundedMinutes);
    setDropTarget(rackNum);
    setDropPreviewTime(newStartTime);
    setDropPreviewPosition(relativeX);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || !onBatchMove || !activeId) {
      setActiveId(null);
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    const batch = active.data.current?.batch;
    if (!batch) {
      setActiveId(null);
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    // Get rack number from over.id
    const rackId = over.id;
    if (!rackId || !rackId.startsWith("rack-")) {
      setActiveId(null);
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    const rackNum = parseInt(rackId.replace("rack-", ""), 10);
    if (!rackNum || !dropPreviewTime) {
      setActiveId(null);
      setDropTarget(null);
      setDropPreviewTime(null);
      setDropPreviewPosition(null);
      return;
    }

    // Call move handler
    onBatchMove(activeId, dropPreviewTime, rackNum);

    setActiveId(null);
    setDropTarget(null);
    setDropPreviewTime(null);
    setDropPreviewPosition(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setDropTarget(null);
    setDropPreviewTime(null);
    setDropPreviewPosition(null);
  };

  // Parse time string to minutes from midnight
  const parseTimeToMinutes = useMemo(() => {
    return (timeStr) => {
      if (!timeStr || typeof timeStr !== "string") return null;
      const [hours, minutes] = timeStr.split(":").map(Number);
      if (isNaN(hours) || isNaN(minutes)) return null;
      return hours * 60 + minutes;
    };
  }, []);

  // Format minutes to time string
  const formatMinutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}`;
  };

  // Calculate timeline dimensions
  const timelineData = useMemo(() => {
    const startMinutes = parseTimeToMinutes(BUSINESS_HOURS.START) || 360; // 06:00
    const endMinutes = parseTimeToMinutes(BUSINESS_HOURS.END) || 1020; // 17:00
    const totalMinutes = endMinutes - startMinutes;
    const totalRacks = OVEN_CONFIG.TOTAL_RACKS;

    // Generate time slots
    const timeSlots = [];
    for (
      let minutes = startMinutes;
      minutes <= endMinutes;
      minutes += hourInterval * 60
    ) {
      timeSlots.push({
        minutes,
        time: formatMinutesToTime(minutes),
      });
    }

    // Filter scheduled batches
    const scheduledBatches = batches.filter(
      (b) => b.rackPosition !== null && b.startTime && b.endTime
    );

    // Calculate batch positions and handle overlaps
    const positionedBatches = scheduledBatches
      .map((batch) => {
        const startBatchMinutes = parseTimeToMinutes(batch.startTime);
        const endBatchMinutes = parseTimeToMinutes(batch.endTime);

        if (!startBatchMinutes || !endBatchMinutes) return null;

        // Calculate position based on actual bake duration
        const left = (startBatchMinutes - startMinutes) / minutesPerPixel;
        const width = (endBatchMinutes - startBatchMinutes) / minutesPerPixel;

        return {
          ...batch,
          left,
          right: left + width,
          width: Math.max(width, 20), // Minimum width of 20px to ensure visibility
          rackPosition: batch.rackPosition,
        };
      })
      .filter(Boolean);

    // Group batches by rack and handle overlaps
    const batchesByRack = {};
    positionedBatches.forEach((batch) => {
      const rack = batch.rackPosition;
      if (!batchesByRack[rack]) {
        batchesByRack[rack] = [];
      }
      batchesByRack[rack].push(batch);
    });

    // Sort batches by start time within each rack
    Object.keys(batchesByRack).forEach((rack) => {
      batchesByRack[rack].sort((a, b) => a.left - b.left);
    });

    // All batches on the same rack should be at the same vertical position
    // No vertical stacking - if batches overlap in time, that's a scheduling conflict
    // that should be visible, not hidden by stacking
    const cardHeight = rackHeight - 8; // Leave some padding
    const rackHeights = {}; // Track max height needed for each rack

    Object.keys(batchesByRack).forEach((rack) => {
      // All batches on this rack are at the same vertical level
      batchesByRack[rack].forEach((batch) => {
        batch.top = 4; // Fixed top position for all batches on the same rack
      });

      // Rack height is fixed - no dynamic expansion
      rackHeights[rack] = rackHeight;
    });

    // Calculate actual timeline width (ensure it's wide enough)
    // With minutesPerPixel = 0.3, 11 hours = 660 minutes = 2200px base width
    const calculatedWidth = totalMinutes / minutesPerPixel;

    // Ensure minimum width for good spacing (2200px minimum for 11-hour day)
    // This ensures cards have enough space and don't overlap
    const minWidth = 2200;
    const timelineWidth = Math.max(calculatedWidth, minWidth);

    return {
      startMinutes,
      endMinutes,
      totalMinutes,
      totalRacks,
      timeSlots,
      timelineWidth,
      positionedBatches,
      rackHeights,
    };
  }, [batches, hourInterval, minutesPerPixel, rackHeight]);

  const {
    timeSlots,
    timelineWidth,
    positionedBatches,
    totalRacks,
    rackHeights,
    startMinutes,
  } = timelineData;

  // Calculate current time position
  const currentTimePosition = useMemo(() => {
    if (!currentTime) return null;
    const parseTime = (timeStr) => {
      if (!timeStr || typeof timeStr !== "string") return null;
      const [hours, minutes] = timeStr.split(":").map(Number);
      if (isNaN(hours) || isNaN(minutes)) return null;
      return hours * 60 + minutes;
    };
    const currentMinutes = parseTime(currentTime);
    if (!currentMinutes || currentMinutes < startMinutes) return null;
    const position = (currentMinutes - startMinutes) / minutesPerPixel;
    return position;
  }, [currentTime, startMinutes, minutesPerPixel]);

  // Group racks by oven for visual separation
  const racksByOven = [];
  for (let oven = 1; oven <= OVEN_CONFIG.OVEN_COUNT; oven++) {
    const startRack = (oven - 1) * OVEN_CONFIG.RACKS_PER_OVEN + 1;
    const endRack = oven * OVEN_CONFIG.RACKS_PER_OVEN;
    racksByOven.push({
      oven,
      startRack,
      endRack,
      racks: Array.from(
        { length: OVEN_CONFIG.RACKS_PER_OVEN },
        (_, i) => startRack + i
      ),
    });
  }

  const activeBatch = activeId
    ? batches.find((b) => b.batchId === activeId)
    : null;

  // RackDropZone component for droppable racks
  function RackDropZone({ rackNum, actualRackHeight, children }) {
    const { setNodeRef, isOver } = useDroppable({
      id: `rack-${rackNum}`,
    });

    return (
      <div
        ref={setNodeRef}
        className={isOver ? "bg-blue-50 bg-opacity-30" : ""}
        style={{ height: `${actualRackHeight}px` }}
      >
        {children}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="timeline-view bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Scrollable timeline body */}
        <div
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: "900px" }}
        >
          <div
            style={{
              width: `${timelineWidth}px`,
              minHeight: `${totalRacks * rackHeight}px`,
            }}
          >
            {/* Rack rows */}
            {racksByOven.map((ovenGroup) => (
              <div key={`oven-${ovenGroup.oven}`}>
                {/* Oven header */}
                <div className="bg-blue-50 border-b border-blue-200 z-5">
                  <div className="flex items-center px-2 py-1">
                    <div className="w-24 flex-shrink-0 text-sm font-semibold text-blue-900">
                      Oven {ovenGroup.oven}
                    </div>
                    <div className="flex-1 h-6 relative">
                      {/* Time grid lines */}
                      {timeSlots.map((slot, idx) => (
                        <div
                          key={idx}
                          className="absolute border-l border-blue-200 h-full"
                          style={{
                            left: `${
                              (slot.minutes - timelineData.startMinutes) /
                              minutesPerPixel
                            }px`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Rack rows for this oven */}
                {ovenGroup.racks.map((rackNum) => {
                  const rackBatches = positionedBatches.filter(
                    (b) => b.rackPosition === rackNum
                  );
                  const actualRackHeight = rackHeights[rackNum] || rackHeight;

                  return (
                    <div
                      key={`rack-${rackNum}`}
                      className="relative border-b border-gray-200 hover:bg-gray-50"
                      style={{
                        height: `${actualRackHeight}px`,
                        minHeight: `${actualRackHeight}px`,
                      }}
                    >
                      {/* Rack label */}
                      <div className="absolute left-0 top-0 w-24 h-full flex items-center justify-center border-r border-gray-200 bg-gray-50 text-xs font-medium text-gray-700">
                        Rack {rackNum}
                      </div>

                      {/* Time grid lines - Droppable zone */}
                      <div className="absolute left-24 right-0 h-full">
                        <RackDropZone
                          rackNum={rackNum}
                          actualRackHeight={actualRackHeight}
                        >
                          <div
                            className="h-full relative"
                            style={{ height: `${actualRackHeight}px` }}
                            data-rack={rackNum}
                          >
                            {timeSlots.map((slot, idx) => (
                              <div
                                key={idx}
                                className="absolute border-l border-gray-200 h-full"
                                style={{
                                  left: `${
                                    (slot.minutes - timelineData.startMinutes) /
                                    minutesPerPixel
                                  }px`,
                                }}
                              />
                            ))}

                            {/* Current time indicator line */}
                            {currentTimePosition !== null && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none shadow-lg"
                                style={{
                                  left: `${currentTimePosition}px`,
                                }}
                              />
                            )}

                            {/* Snap indicators at 20-minute increments */}
                            {(() => {
                              const snapIndicators = [];
                              for (
                                let minutes = timelineData.startMinutes;
                                minutes <= timelineData.endMinutes;
                                minutes += 20
                              ) {
                                const left =
                                  (minutes - timelineData.startMinutes) /
                                  minutesPerPixel;
                                snapIndicators.push(
                                  <div
                                    key={`snap-${minutes}`}
                                    className="absolute top-0 bottom-0 w-px bg-blue-300 opacity-30 z-10 pointer-events-none"
                                    style={{ left: `${left}px` }}
                                  />
                                );
                              }
                              return snapIndicators;
                            })()}

                            {/* Drop zone highlight */}
                            {dropTarget === rackNum && dropPreviewTime && (
                              <div
                                className="absolute top-0 bottom-0 bg-blue-200 bg-opacity-20 border-2 border-blue-500 border-dashed z-15 pointer-events-none"
                                style={{
                                  left: `${dropPreviewPosition || 0}px`,
                                  width: `${
                                    (activeBatch?.bakeTime || 0) /
                                    minutesPerPixel
                                  }px`,
                                }}
                              />
                            )}

                            {/* Batch cards */}
                            {rackBatches.map((batch) => {
                              const cardHeight = rackHeight - 8;
                              return (
                                <BakeCard
                                  key={batch.batchId}
                                  batch={batch}
                                  onClick={() => handleBatchClick(batch)}
                                  style={{
                                    left: `${batch.left}px`, // Position relative to container (which already accounts for rack label)
                                    width: `${batch.width}px`,
                                    top: `${batch.top || 4}px`,
                                    height: `${cardHeight}px`,
                                    maxHeight: `${cardHeight}px`,
                                  }}
                                />
                              );
                            })}
                          </div>
                        </RackDropZone>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2">
          <div className="flex items-center gap-4 text-xs">
            <span className="font-semibold text-gray-700">Status:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-gray-400 border border-gray-500 rounded"></div>
              <span>Scheduled</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-blue-500 border border-blue-600 rounded"></div>
              <span>Baking</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-yellow-500 border border-yellow-600 rounded"></div>
              <span>Pulling</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-orange-400 border border-orange-500 rounded"></div>
              <span>Cooling</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-green-500 border border-green-600 rounded"></div>
              <span>Available</span>
            </div>
          </div>
        </div>

        {/* Batch Details Modal */}
        <BatchDetailsModal
          batch={selectedBatch}
          isOpen={selectedBatch !== null}
          onClose={handleCloseModal}
          onDelete={onBatchDelete}
        />

        {/* Drag Overlay - Ghost preview */}
        <DragOverlay>
          {activeBatch ? (
            <div
              className="border-2 border-dashed rounded-lg p-3 shadow-lg bg-gray-400 bg-opacity-50 border-gray-500"
              style={{
                width: `${(activeBatch.bakeTime || 0) / minutesPerPixel}px`,
              }}
            >
              <div className="text-white text-sm font-semibold truncate mb-1.5">
                {activeBatch.displayName || activeBatch.itemGuid}
              </div>
              {dropPreviewTime && (
                <div className="text-white text-xs opacity-90">
                  Drop at: {dropPreviewTime}
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
