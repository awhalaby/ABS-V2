import { useState, useEffect } from "react";
import { bakespecsAPI } from "../utils/api.js";
import { formatNumber } from "../utils/formatters.js";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import { OVEN_CONFIG } from "../config/constants.js";

export default function BakeSpecsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bakeSpecs, setBakeSpecs] = useState([]);
  const [ovenConfig, setOvenConfig] = useState(null);
  const [editingSpec, setEditingSpec] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadBakeSpecs();
    loadOvenConfig();
  }, []);

  const loadBakeSpecs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await bakespecsAPI.getAll();
      setBakeSpecs(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load bake specs");
    } finally {
      setLoading(false);
    }
  };

  const loadOvenConfig = async () => {
    try {
      const response = await bakespecsAPI.getOvenConfig();
      setOvenConfig(response.data);
    } catch (err) {
      console.error("Failed to load oven config:", err);
    }
  };

  const handleSave = async (spec) => {
    try {
      await bakespecsAPI.createOrUpdate(spec);
      await loadBakeSpecs();
      setEditingSpec(null);
      setShowAddForm(false);
    } catch (err) {
      setError(err.message || "Failed to save bake spec");
    }
  };

  const handleDelete = async (itemGuid) => {
    if (!window.confirm("Are you sure you want to delete this bake spec?")) {
      return;
    }
    try {
      await bakespecsAPI.delete(itemGuid);
      await loadBakeSpecs();
    } catch (err) {
      setError(err.message || "Failed to delete bake spec");
    }
  };

  const handleBulkSave = async () => {
    try {
      await bakespecsAPI.bulkUpdate(bakeSpecs);
      await loadBakeSpecs();
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to save bake specs");
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Bake Specs Management
        </h2>
        <p className="text-gray-600">
          Configure how many items fit per rack, bake times, and oven
          assignments for each SKU.
        </p>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Oven Configuration Info */}
      {ovenConfig && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            Oven Configuration
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-blue-700">Ovens:</span>{" "}
              <span className="font-medium">{ovenConfig.ovenCount}</span>
            </div>
            <div>
              <span className="text-blue-700">Racks per Oven:</span>{" "}
              <span className="font-medium">{ovenConfig.racksPerOven}</span>
            </div>
            <div>
              <span className="text-blue-700">Total Racks:</span>{" "}
              <span className="font-medium">{ovenConfig.totalRacks}</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-blue-600">
            <div>Oven 1: Racks 1-{OVEN_CONFIG.RACKS_PER_OVEN}</div>
            <div>
              Oven 2: Racks {OVEN_CONFIG.RACKS_PER_OVEN + 1}-
              {OVEN_CONFIG.TOTAL_RACKS}
            </div>
          </div>
        </div>
      )}

      {/* Add New Spec Button */}
      <div className="mb-4">
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingSpec(null);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add New Bake Spec
        </button>
        <button
          onClick={handleBulkSave}
          className="ml-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          Save All Changes
        </button>
      </div>

      {loading && <LoadingSpinner />}

      {/* Bake Specs Table */}
      {!loading && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items per Rack
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bake Time (min)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cool Time (min)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Oven
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PAR Min
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PAR Max
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Active
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bakeSpecs.map((spec) => (
                <BakeSpecRow
                  key={spec.itemGuid}
                  spec={spec}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  isEditing={editingSpec === spec.itemGuid}
                  onEdit={() => setEditingSpec(spec.itemGuid)}
                  onCancel={() => setEditingSpec(null)}
                />
              ))}
              {showAddForm && (
                <BakeSpecRow
                  spec={{
                    itemGuid: "",
                    displayName: "",
                    capacityPerRack: 12,
                    bakeTimeMinutes: 20,
                    coolTimeMinutes: 10,
                    oven: null,
                    active: true,
                  }}
                  onSave={(spec) => {
                    handleSave(spec);
                    setShowAddForm(false);
                  }}
                  onDelete={() => setShowAddForm(false)}
                  isEditing={true}
                  isNew={true}
                  onCancel={() => setShowAddForm(false)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BakeSpecRow({
  spec,
  onSave,
  onDelete,
  isEditing,
  isNew = false,
  onEdit,
  onCancel,
}) {
  const [formData, setFormData] = useState(spec);

  useEffect(() => {
    setFormData(spec);
  }, [spec]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.itemGuid || !formData.displayName) {
      alert("Item GUID and Display Name are required");
      return;
    }
    onSave(formData);
  };

  if (isEditing) {
    return (
      <tr className="bg-yellow-50">
        <td colSpan="9" className="px-4 py-3">
          <form onSubmit={handleSubmit} className="grid grid-cols-8 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Item GUID *
              </label>
              <input
                type="text"
                value={formData.itemGuid}
                onChange={(e) =>
                  setFormData({ ...formData, itemGuid: e.target.value })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                required
                disabled={!isNew}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) =>
                  setFormData({ ...formData, displayName: e.target.value })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Items/Rack *
              </label>
              <input
                type="number"
                min="1"
                value={formData.capacityPerRack}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    capacityPerRack: parseInt(e.target.value, 10),
                  })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Bake Time (min) *
              </label>
              <input
                type="number"
                min="1"
                value={formData.bakeTimeMinutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bakeTimeMinutes: parseInt(e.target.value, 10),
                  })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cool Time (min)
              </label>
              <input
                type="number"
                min="0"
                value={formData.coolTimeMinutes || 10}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    coolTimeMinutes: parseInt(e.target.value, 10),
                  })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Oven
              </label>
              <select
                value={formData.oven || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    oven: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="">Any</option>
                <option value="1">Oven 1</option>
                <option value="2">Oven 2</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                PAR Min
              </label>
              <input
                type="number"
                min="0"
                value={formData.parMin ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    parMin: e.target.value
                      ? parseInt(e.target.value, 10)
                      : null,
                  })
                }
                placeholder="Min inventory"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                PAR Max
              </label>
              <input
                type="number"
                min="0"
                value={formData.parMax ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    parMax: e.target.value
                      ? parseInt(e.target.value, 10)
                      : null,
                  })
                }
                placeholder="Max inventory"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
            <div className="col-span-6 flex gap-2">
              <button
                type="submit"
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
        {spec.displayName}
        <div className="text-xs text-gray-500">{spec.itemGuid}</div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        {formatNumber(spec.capacityPerRack)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        {formatNumber(spec.bakeTimeMinutes)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        {formatNumber(spec.coolTimeMinutes || 10)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        {spec.oven ? `Oven ${spec.oven}` : "Any"}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        {spec.parMin !== null && spec.parMin !== undefined
          ? formatNumber(spec.parMin)
          : "-"}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        {spec.parMax !== null && spec.parMax !== undefined
          ? formatNumber(spec.parMax)
          : "-"}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <span
          className={`px-2 py-1 rounded-full text-xs ${
            spec.active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {spec.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        <button
          onClick={onEdit}
          className="text-blue-600 hover:text-blue-800 mr-3"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(spec.itemGuid)}
          className="text-red-600 hover:text-red-800"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
