"use client";
import React from "react";
import { Dashboard } from "../components/Dashboard";
import { Chatbot } from "../components/Chatbot";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10">
      <Dashboard />
      <Chatbot />
    </div>
  );
}
