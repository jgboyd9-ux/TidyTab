import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, collection } from "firebase/firestore";

export default function CleanerAssignment() {
  const [properties, setProperties] = useState([]);
  const [cleaners, setCleaners] = useState({});
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const propertiesPerPage = 5;

  const cleanerCache = useRef(null);
  const assignmentsCache = useRef(null);

  const [globalAssign, setGlobalAssign] = useState({
    primary: "",
    backup: "",
    secondary: ""
  });

  const fetchData = async (user) => {
    setLoading(true);

    const cleaningsRef = collection(db, "users", user.uid, "cleanings");
    const cleanersRef = collection(db, "users", user.uid, "cleaners");
    const assignmentsRef = collection(db, "users", user.uid, "assignments");

    const unsubscribeCleanings = onSnapshot(cleaningsRef, (snapshot) => {
      const cleaningsData = snapshot.docs.map(doc => doc.data());
      console.log("🧹 Live cleanings snapshot:", cleaningsData);

      const props = [...new Set(cleaningsData.map(job => job.property))];
      setProperties(props);
    }, (error) => {
      console.error("❌ Firestore cleanings listener failed:", error.message);
    });

    const unsubscribeCleaners = onSnapshot(cleanersRef, (snapshot) => {
      const data = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data();
      });
      console.log("🧽 Live cleaners snapshot:", data);
      setCleaners(data);
      cleanerCache.current = data;
    }, (error) => {
      console.error("❌ Firestore cleaners listener failed:", error.message);
    });

    const unsubscribeAssignments = onSnapshot(assignmentsRef, (snapshot) => {
      const data = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data();
      });
      console.log("📡 Live assignment snapshot:", data);
      setAssignments(data);
      assignmentsCache.current = data;
    }, (error) => {
      console.error("❌ Firestore assignments listener failed:", error.message);
    });

    setLoading(false);

    return () => {
      unsubscribeCleanings();
      unsubscribeCleaners();
      unsubscribeAssignments();
    };
  };

  useEffect(() => {
    let unsubscribeAll = () => {};
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        unsubscribeAll = await fetchData(user);
      } else {
        console.warn("❌ No Firebase user found.");
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeAll();
    };
  }, []);

  const handleChange = (property, role, phone) => {
    setAssignments(prev => {
      const updated = {
        ...prev,
        [property]: {
          ...prev[property],
          [role]: phone || null,
        },
      };
      assignmentsCache.current = updated;
      return updated;
    });
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();

    for (const [property, assignment] of Object.entries(assignments)) {
      if (!assignment.primary || !assignment.backup) {
        alert(`❌ ${property} must have both a primary and backup cleaner`);
        return;
      }
    }

    try {
      const res = await fetch("http://localhost:3000/assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(assignments),
      });

      if (!res.ok) throw new Error("Failed to save assignments");
      alert("✅ Cleaner assignments saved to Firestore!");
    } catch (err) {
      console.error("❌ Error saving assignments:", err.message);
      alert("❌ Failed to save cleaner assignments.");
    }
  };

  const handleGlobalSelect = (role, phone) => {
    setGlobalAssign(prev => ({ ...prev, [role]: phone }));
  };

  const applyToAll = () => {
    const updated = {};
    for (const property of properties) {
      updated[property] = {
        primary: globalAssign.primary || "",
        backup: globalAssign.backup || "",
        secondary: globalAssign.secondary || ""
      };
    }
    assignmentsCache.current = updated;
    setAssignments(updated);
  };

  const refreshAll = () => {
    cleanerCache.current = null;
    assignmentsCache.current = null;
    setCurrentPage(1);
    setLoading(true);
    const user = auth.currentUser;
    if (user) fetchData(user);
  };

  if (loading) {
    return <div className="p-6 text-center">Loading assignments...</div>;
  }

  const totalPages = Math.ceil(properties.length / propertiesPerPage);
  const indexOfLast = currentPage * propertiesPerPage;
  const indexOfFirst = indexOfLast - propertiesPerPage;
  const currentProperties = properties.slice(indexOfFirst, indexOfLast);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">🏠 Assign Cleaners to Properties</h1>

      <button
        onClick={refreshAll}
        className="mb-4 text-blue-600 underline text-sm"
      >
        🔄 Refresh Cleaner List + Assignments
      </button>

      <div className="border p-4 mb-6 bg-blue-50 rounded shadow">
        <h2 className="text-lg font-semibold mb-3">Apply Same Cleaners to All Properties</h2>
        {["primary", "backup", "secondary"].map(role => (
          <div key={role} className="mb-2">
            <label className="block text-sm mb-1 capitalize">{role} Cleaner:</label>
            <select
              value={globalAssign[role]}
              onChange={(e) => handleGlobalSelect(role, e.target.value)}
              className="border p-2 rounded w-full"
            >
              <option value="">Select a cleaner</option>
              {Object.entries(cleaners).map(([phone, cleaner]) => (
                <option key={phone} value={phone}>
                  {cleaner.name || phone}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          onClick={applyToAll}
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          📋 Apply to All Properties
        </button>
      </div>

      {currentProperties.map(property => (
        <div key={property} className="border rounded p-4 mb-4 bg-white shadow">
          <h2 className="font-semibold mb-2">{property}</h2>
          {["primary", "backup", "secondary"].map(role => (
            <div key={role} className="mb-2">
              <label className="block text-sm mb-1 capitalize">{role} Cleaner:</label>
              <select
                value={assignments[property]?.[role] || ""}
                onChange={(e) => handleChange(property, role, e.target.value)}
                className="border p-2 rounded w-full"
              >
                <option value="">Select a cleaner</option>
                {Object.entries(cleaners).map(([phone, cleaner]) => {
                  const alreadyUsed = Object.entries(assignments[property] || {}).some(
                    ([r, p]) => r !== role && p === phone
                  );

                  return (
                    <option
                      key={phone}
                      value={phone}
                      disabled={alreadyUsed}
                    >
                      {cleaner.name || phone} {alreadyUsed ? "❌ already selected" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          ))}
        </div>
      ))}

      <button
        onClick={handleSave}
        className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700"
      >
        💾 Save Assignments
      </button>

      <div className="mt-6 flex justify-between items-center text-sm">
        <button
          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-3 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          ⬅️ Previous
        </button>

        <div>Page {currentPage} of {totalPages}</div>

        <button
          onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-3 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          Next ➡️
        </button>
      </div>
    </div>
  );
}
