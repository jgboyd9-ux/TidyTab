import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [icalUrls, setIcalUrls] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (!u) {
        navigate("/");
      } else {
        setUser(u);
        fetchAllIcals(u);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const fetchAllIcals = async (user) => {
    try {
      const token = await user.getIdToken();
      const res = await fetch("http://localhost:3000/ical", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data.icalUrls)) {
        setIcalUrls(data.icalUrls);
      }
    } catch (err) {
      console.error("❌ Failed to fetch iCal URLs:", err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("✅ User logged out");
      navigate("/");
    } catch (err) {
      console.error("❌ Logout failed:", err.message);
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">👤 Profile</h1>

      {user ? (
        <div className="space-y-4">
          <div>
            <div className="text-gray-700 text-sm font-medium">Name:</div>
            <div className="text-gray-900">{user.displayName}</div>
          </div>

          <div>
            <div className="text-gray-700 text-sm font-medium">Email:</div>
            <div className="text-gray-900">{user.email}</div>
          </div>

          <div>
            <div className="text-gray-700 text-sm font-medium">UID:</div>
            <div className="text-gray-500 text-sm break-all">{user.uid}</div>
          </div>

          {icalUrls.length > 0 && (
            <div>
              <div className="text-gray-700 text-sm font-medium">Primary iCal:</div>
              <a
                href={icalUrls[0]}
                className="text-blue-600 underline break-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                {icalUrls[0]}
              </a>

              {icalUrls.length > 1 && (
                <div className="mt-4">
                  <div className="text-gray-700 text-sm font-medium">All Saved iCal URLs:</div>
                  <ul className="list-disc list-inside text-sm text-blue-700">
                    {icalUrls.map((url, idx) => (
                      <li key={idx} className="break-all">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="pt-10">
            <button
              onClick={handleLogout}
              className="text-red-600 hover:text-red-800 underline text-sm"
            >
              🚪 Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
