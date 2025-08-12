// client/src/CleanerProfiles.jsx
import { useState, useEffect, useRef } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "./utils/getCroppedImg";
import { auth, db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

function normalizePhoneNumber(phone) {
  return phone.replace(/\D/g, "");
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default function CleanerProfiles() {
  const [cleaners, setCleaners] = useState({});
  const [newCleaner, setNewCleaner] = useState({ phone: "", name: "", avatarUrl: "" });
  const [previewUrl, setPreviewUrl] = useState("");
  const [editingPhone, setEditingPhone] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const lastSavedRef = useRef({});

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(
      collection(db, "users", user.uid, "cleaners"),
      (snapshot) => {
        const updated = {};
        snapshot.forEach((doc) => {
          updated[doc.id] = doc.data();
        });
        setCleaners(updated);
        lastSavedRef.current = updated;
      }
    );

    return () => unsub();
  }, []);

  const saveCleaners = debounce(async (updated) => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();

    const hasChanges = JSON.stringify(updated) !== JSON.stringify(lastSavedRef.current);
    if (!hasChanges) return;

    fetch("http://localhost:3000/cleaners", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updated),
    })
      .then(() => {
        lastSavedRef.current = updated;
      })
      .catch((err) => console.error("❌ Failed to save cleaners:", err));
  }, 400);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewCleaner((prev) => ({ ...prev, [name]: value }));
    if (name === "avatarUrl") setPreviewUrl(value.trim());
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setCropModalOpen(true);
    }
  };

  const handleCropComplete = (croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  };

  const handleCropSave = async () => {
    if (!avatarFile || !croppedAreaPixels) return;

    try {
      const croppedBlob = await getCroppedImg(previewUrl, croppedAreaPixels);
      const formData = new FormData();
      formData.append("avatar", croppedBlob, "avatar.jpg");

      const response = await fetch("http://localhost:3000/upload-avatar", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setNewCleaner((prev) => ({ ...prev, avatarUrl: result.avatarUrl }));
        setPreviewUrl(result.avatarUrl);
      }
    } catch (err) {
      console.error("❌ Cropping/upload error:", err);
    }

    setCropModalOpen(false);
    setAvatarFile(null);
  };

  const handleSave = () => {
    const rawPhone = newCleaner.phone.trim();
    const phone = normalizePhoneNumber(rawPhone);
    const name = newCleaner.name.trim();

    if (!phone || !name) {
      alert("❌ Phone number and cleaner name are required");
      return;
    }

    const updated = {
      ...cleaners,
      [phone]: {
        name,
        avatarUrl: newCleaner.avatarUrl.trim() || null,
        favorite: cleaners[phone]?.favorite || false,
      },
    };

    saveCleaners(updated);
    setNewCleaner({ phone: "", name: "", avatarUrl: "" });
    setPreviewUrl("");
    setAvatarFile(null);
    setEditingPhone(null);
  };

  const handleEdit = (phone) => {
    const c = cleaners[phone];
    setNewCleaner({ phone, name: c.name || "", avatarUrl: c.avatarUrl || "" });
    setPreviewUrl(c.avatarUrl || "");
    setEditingPhone(phone);
    setAvatarFile(null);
  };

  const handleCancel = () => {
    setNewCleaner({ phone: "", name: "", avatarUrl: "" });
    setPreviewUrl("");
    setAvatarFile(null);
    setEditingPhone(null);
    setSearchTerm("");
  };

  const handleDelete = (phone) => {
    if (!window.confirm("Are you sure you want to delete this cleaner?")) return;
    const updated = { ...cleaners };
    delete updated[phone];
    saveCleaners(updated);
    if (editingPhone === phone) handleCancel();
  };

  const toggleFavorite = (phone) => {
    const updated = {
      ...cleaners,
      [phone]: {
        ...cleaners[phone],
        favorite: !cleaners[phone]?.favorite,
      },
    };
    saveCleaners(updated);
  };

  const filteredCleaners = Object.entries(cleaners)
    .filter(([phone, info]) => {
      const query = searchTerm.toLowerCase();
      return phone.includes(query) || (info.name?.toLowerCase().includes(query));
    })
    .sort(([, a], [, b]) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">🧹 Manage Cleaner Profiles</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <input
          name="phone"
          value={newCleaner.phone}
          onChange={handleChange}
          placeholder="Phone Number"
          className="border px-3 py-2 rounded"
          disabled={!!editingPhone}
        />
        <input
          name="name"
          value={newCleaner.name}
          onChange={handleChange}
          placeholder="Cleaner Name"
          className="border px-3 py-2 rounded"
        />
        <input
          name="avatarUrl"
          value={newCleaner.avatarUrl}
          onChange={handleChange}
          placeholder="Avatar Image URL"
          className="border px-3 py-2 rounded"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-600 mb-1">Upload Avatar (optional):</label>
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </div>

      {previewUrl && (
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-1">Avatar Preview:</p>
          <img
            src={previewUrl}
            alt="Preview"
            className="w-16 h-16 rounded-full object-cover border"
            onError={() => setPreviewUrl("")}
          />
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {editingPhone ? "✏️ Update Cleaner" : "➕ Save Cleaner"}
        </button>
        {editingPhone && (
          <button
            onClick={handleCancel}
            className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="🔍 Search by name or phone..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4 w-full border px-3 py-2 rounded"
      />

      <div className="space-y-2">
        {filteredCleaners.map(([phone, info]) => (
          <div
            key={phone}
            className="flex items-center gap-4 bg-white shadow px-4 py-2 rounded border"
          >
            <img
              src={info.avatarUrl || "/avatars/default-avatar.png"}
              alt={info.name || "Cleaner"}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/avatars/default-avatar.png";
              }}
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                {info.name}
                {info.favorite && <span className="text-yellow-500">★</span>}
              </div>
              <div className="text-sm text-gray-500">{phone}</div>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => toggleFavorite(phone)}
                title={info.favorite ? "Unfavorite" : "Favorite"}
                className="text-yellow-500 text-lg hover:scale-110"
              >
                {info.favorite ? "★" : "☆"}
              </button>
              <button
                onClick={() => handleEdit(phone)}
                className="text-blue-600 text-sm hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(phone)}
                className="text-red-500 text-sm hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filteredCleaners.length === 0 && (
          <p className="text-gray-500 text-sm mt-4 italic">No cleaners match your search.</p>
        )}
      </div>

      {cropModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-md relative max-w-lg w-full h-[500px]">
            <h2 className="text-lg font-semibold mb-4">✂️ Crop Image</h2>
            <div className="relative w-full h-80 bg-gray-100">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>
            <div className="mt-4 flex justify-between">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-2/3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setCropModalOpen(false)}
                  className="bg-gray-300 text-gray-800 px-4 py-2 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCropSave}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Save Crop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
