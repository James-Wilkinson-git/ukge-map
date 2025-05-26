import React from "react";
import { Routes, Route, Navigate } from "react-router";
import { Map } from "./Map";
import List from "./List";

const App = () => {
  return (
    <Routes>
      <Route path="/list" element={<List />} />
      <Route index element={<Map />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
