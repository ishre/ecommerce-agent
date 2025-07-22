"use client";
import React from "react";
import { Chatbot } from "@/components/Chatbot";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10">
      {/* Main homepage content can go here */}
      <Chatbot />
    </div>
  );
}
