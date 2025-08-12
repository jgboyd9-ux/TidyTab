// client/src/App.js
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Dashboard from "./Dashboard";
import Profile from "./Profile";
import CleanerProfiles from "./CleanerProfiles";
import CleanerAssignmentsPage from "./CleanerAssignmentsPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="cleaners" element={<CleanerProfiles />} /> {/* ✅ Fixed path */}
          <Route path="assign-cleaners" element={<CleanerAssignmentsPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
