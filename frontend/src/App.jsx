import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.jsx";

// Admin pulls in Leaflet + Recharts — keep those out of the bundle every
// plain visitor to "/" has to download by loading this page lazily.
const Admin = lazy(() => import("./pages/Admin.jsx"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/admin"
        element={
          <Suspense fallback={<div className="card">Loading...</div>}>
            <Admin />
          </Suspense>
        }
      />
    </Routes>
  );
}
