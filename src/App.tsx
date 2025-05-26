import React from "react";
import { Routes, Route } from "react-router";
import { Map } from "./Map";
import List from "./List";

const App = () => {
  return (
    <Routes>
      <Route path="/list" element={<List />} />
      <Route index path="*" element={<Map />} />
    </Routes>
  );
};

export default App;
