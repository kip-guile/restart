import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store.js";

export default function About() {
  const message = useSelector((s: RootState) => s.app.message);

  return (
    <>
      <h2>About</h2>
      <p>{message ?? "Loading..."}</p>
      <p>This project is for frontend system design practice.</p>
    </>
  );
}