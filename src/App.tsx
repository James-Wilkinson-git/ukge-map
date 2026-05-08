import React from "react";
import { Routes, Route } from "react-router";
import { Map } from "./Map";
import List from "./List";

const App = () => {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/list" element={<List />} />
        <Route index element={<Map />} />
        <Route path="*" element={<Map />} />
      </Routes>
    </div>
  );
};

export default App;
