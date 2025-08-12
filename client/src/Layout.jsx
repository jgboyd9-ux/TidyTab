import { Link, Outlet } from "react-router-dom";
import { useState } from "react";

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="w-full min-h-screen bg-white">
      {/* ✅ Header */}
      <div className="flex justify-between items-center px-6 py-6 border-b border-gray-200 bg-white relative">
        <Link to="/" className="select-none">
          <img
  src={process.env.PUBLIC_URL + "/tidytab-logo.png"}
  alt="TidyTab Logo"
  className="h-16 w-auto object-contain"
/>

        </Link>

        {/* ✅ Dropdown Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-gray-600 hover:text-gray-800 text-sm px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            ☰ Menu
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border rounded shadow z-10">
              <Link
                to="/"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setMenuOpen(false)}
              >
                🏠 Dashboard
              </Link>
              <Link
                to="/profile"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setMenuOpen(false)}
              >
                👤 Profile
              </Link>
              <Link
                to="/cleaners"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setMenuOpen(false)}
              >
                🧹 Cleaner Profiles
              </Link>
              <Link
                to="/assign-cleaners"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setMenuOpen(false)}
              >
                📅 Assign Cleaners
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Nested Page Content */}
      <main className="w-full">
        <Outlet />
      </main>
    </div>
  );
}
