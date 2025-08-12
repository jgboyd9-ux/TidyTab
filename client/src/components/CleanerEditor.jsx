import { useEffect, useState } from "react";

export default function CleanerEditor() {
  const [cleaners, setCleaners] = useState({});
  const [newCleaner, setNewCleaner] = useState({ phone: "", name: "", avatarUrl: "" });
  const [avatarPreview, setAvatarPreview] = useState("");
  const [saving, setSaving] = useState(false);

  // 🔄 Load cleaners from backend
  useEffect(() => {
    fetch("http://localhost:3000/api/cleaners")
      .then((res) => res.json())
      .then((data) => setCleaners(data))
      .catch((err) => console.error("❌ Failed to fetch cleaners:", err));
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewCleaner((prev) => ({ ...prev, [name]: value }));

    if (name === "avatarUrl") {
      if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
        setAvatarPreview(value);
      } else {
        setAvatarPreview("");
      }
    }
  };

  const handleFieldChange = (phone, field, value) => {
    setCleaners((prev) => ({
      ...prev,
      [phone]: {
        ...prev[phone],
        [field]: value,
      },
    }));
  };

  const saveToBackend = async (phone, name, avatarUrl) => {
    setSaving(true);
    try {
      const res = await fetch("http://localhost:3000/api/cleaners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, avatarUrl }),
      });
      const result = await res.json();
      if (!result.success) throw new Error("Failed to save");
    } catch (err) {
      console.error("❌ Error saving cleaner:", err);
      alert("❌ Error saving cleaner");
    } finally {
      setSaving(false);
    }
  };

  const deleteFromBackend = async (phone) => {
    try {
      const res = await fetch(`http://localhost:3000/api/cleaners/${phone}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (!result.success) throw new Error("Failed to delete");
    } catch (err) {
      console.error("❌ Error deleting cleaner:", err);
      alert("❌ Error deleting cleaner");
    }
  };

  const handleSaveNew = async () => {
    const { phone, name, avatarUrl } = newCleaner;
    if (!phone || !name) return alert("Please fill out phone and name");

    const updated = {
      ...cleaners,
      [phone]: { name, avatarUrl },
    };
    setCleaners(updated);
    setNewCleaner({ phone: "", name: "", avatarUrl: "" });
    setAvatarPreview("");
    await saveToBackend(phone, name, avatarUrl);
  };

  const handleSaveExisting = async (phone) => {
    const cleaner = cleaners[phone];
    await saveToBackend(phone, cleaner.name, cleaner.avatarUrl);
  };

  const handleDeleteCleaner = async (phone) => {
    if (!window.confirm("Delete this cleaner?")) return;

    const updated = { ...cleaners };
    delete updated[phone];
    setCleaners(updated);
    await deleteFromBackend(phone);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow border space-y-6 mt-6">
      <h2 className="text-2xl font-semibold">🧼 Cleaner Profiles</h2>

      {/* Existing Cleaners */}
      {Object.entries(cleaners).map(([phone, cleaner]) => (
        <div key={phone} className="space-y-2 border border-gray-200 p-4 rounded-md">
          <div className="text-xs text-gray-400">Phone: {phone}</div>
          <input
            value={cleaner.name}
            onChange={(e) => handleFieldChange(phone, "name", e.target.value)}
            placeholder="Cleaner Name"
            className="w-full p-2 border rounded"
          />
          <input
            value={cleaner.avatarUrl}
            onChange={(e) => handleFieldChange(phone, "avatarUrl", e.target.value)}
            placeholder="Avatar URL (optional)"
            className="w-full p-2 border rounded"
          />
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleSaveExisting(phone)}
              className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700 transition"
              disabled={saving}
            >
              💾 {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => handleDeleteCleaner(phone)}
              className="text-red-600 text-sm hover:underline"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      ))}

      {/* Add New Cleaner */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-2">➕ Add New Cleaner</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <input
            name="phone"
            value={newCleaner.phone}
            onChange={handleInputChange}
            placeholder="Phone Number (digits only)"
            className="border px-3 py-2 rounded"
          />
          <input
            name="name"
            value={newCleaner.name}
            onChange={handleInputChange}
            placeholder="Cleaner Name"
            className="border px-3 py-2 rounded"
          />
          <input
            name="avatarUrl"
            value={newCleaner.avatarUrl}
            onChange={handleInputChange}
            placeholder="Avatar Image URL (optional)"
            className="border px-3 py-2 rounded"
          />
        </div>

        {avatarPreview && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-gray-500">Preview:</span>
            <img
              src={avatarPreview}
              alt="Avatar Preview"
              className="w-10 h-10 rounded-full object-cover border"
            />
          </div>
        )}

        <button
          onClick={handleSaveNew}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
          disabled={saving}
        >
          ➕ {saving ? "Saving..." : "Save Cleaner"}
        </button>
      </div>
    </div>
  );
}
