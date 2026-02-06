"use client";

import React, { useState, useRef } from "react";
import { SCREENSHOT_SIZES } from "@/lib/constants";
import { toPng } from "html-to-image";
import { 
  Download, 
  Type, 
  Image as ImageIcon, 
  Monitor, 
  Trash2, 
  Plus, 
  ChevronRight,
  Maximize2,
  Palette
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AssetStudio() {
  const [selectedSize, setSelectedSize] = useState(SCREENSHOT_SIZES[0]);
  const [bgColor, setBgColor] = useState("#0D9488");
  const [title, setTitle] = useState("Perfect Photos");
  const [titleColor, setTitleColor] = useState("#ffffff");
  const [titleSize, setTitleSize] = useState(120);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (canvasRef.current === null) return;
    
    const dataUrl = await toPng(canvasRef.current, {
      width: selectedSize.width,
      height: selectedSize.height,
      style: {
        transform: "scale(1)",
      }
    });
    
    const link = document.createElement("a");
    link.download = `screenshot-${selectedSize.id}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshot(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 bg-neutral-900 border-r border-white/5 flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-black italic">A</div>
            <h1 className="text-xl font-black tracking-tighter uppercase italic">Asset Studio</h1>
          </div>
          <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">App Store Generator</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {/* Size Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <Monitor className="w-4 h-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">Dimensions</h3>
            </div>
            <div className="space-y-2">
              {SCREENSHOT_SIZES.map((size) => (
                <button
                  key={size.id}
                  onClick={() => setSelectedSize(size)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-bold",
                    selectedSize.id === size.id
                      ? "bg-white text-black border-white"
                      : "bg-white/5 text-neutral-400 border-transparent hover:bg-white/10"
                  )}
                >
                  <p className="truncate">{size.name}</p>
                  <p className="text-[10px] opacity-50">{size.width} x {size.height} px</p>
                </button>
              ))}
            </div>
          </div>

          {/* Background */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <Palette className="w-4 h-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">Background</h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              {["#0D9488", "#e31b23", "#000000", "#ffffff", "#ff6600", "#7c3aed"].map((color) => (
                <button
                  key={color}
                  onClick={() => setBgColor(color)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-transform active:scale-90",
                    bgColor === color ? "border-white scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input 
                type="color" 
                value={bgColor} 
                onChange={(e) => setBgColor(e.target.value)}
                className="w-8 h-8 rounded-full bg-transparent border-none cursor-pointer"
              />
            </div>
          </div>

          {/* Text Controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <Type className="w-4 h-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">Headline</h3>
            </div>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-orange-500/50 transition-all font-bold min-h-[100px]"
              placeholder="Headline text..."
            />
            <div className="flex items-center gap-4">
               <div className="flex-1 space-y-2">
                 <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Font Size</p>
                 <input 
                  type="range" 
                  min="40" 
                  max="200" 
                  value={titleSize} 
                  onChange={(e) => setTitleSize(parseInt(e.target.value))}
                  className="w-full accent-orange-600"
                 />
               </div>
               <input 
                type="color" 
                value={titleColor} 
                onChange={(e) => setTitleColor(e.target.value)}
                className="w-8 h-8 rounded-full bg-transparent border-none cursor-pointer mt-4"
              />
            </div>
          </div>

          {/* Screenshot Upload */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <ImageIcon className="w-4 h-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">App Screenshot</h3>
            </div>
            {screenshot ? (
              <div className="relative rounded-xl overflow-hidden group">
                <img src={screenshot} alt="Preview" className="w-full h-32 object-cover opacity-50" />
                <button 
                  onClick={() => setScreenshot(null)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-6 h-6 text-red-500" />
                </button>
              </div>
            ) : (
              <label className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all group">
                <Plus className="w-8 h-8 text-neutral-600 group-hover:text-white transition-colors" />
                <span className="text-[10px] font-black text-neutral-600 mt-2 uppercase tracking-widest group-hover:text-white transition-colors">Upload image</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-neutral-950/50 backdrop-blur-xl">
          <button 
            onClick={handleExport}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl font-black text-lg shadow-2xl shadow-orange-600/20 flex items-center justify-center gap-2 transition-all transform active:scale-95"
          >
            <Download className="w-5 h-5" />
            Export Image
          </button>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 relative flex items-center justify-center bg-neutral-950 p-12 overflow-auto custom-scrollbar">
        <div 
          className="relative shadow-[0_0_100px_rgba(0,0,0,0.5)] transform origin-center transition-all duration-500 overflow-hidden"
          style={{ 
            width: selectedSize.width, 
            height: selectedSize.height,
            transform: `scale(${Math.min(0.2, (800 / selectedSize.height))})`,
            backgroundColor: bgColor
          }}
          ref={canvasRef}
        >
          {/* Header Text */}
          <div className="absolute top-[10%] left-0 right-0 text-center px-20 z-10">
            <h2 
              className="font-black tracking-tighter leading-[0.9] whitespace-pre-wrap italic"
              style={{ fontSize: `${titleSize}px`, color: titleColor }}
            >
              {title}
            </h2>
          </div>

          {/* Screenshot Mockup */}
          {screenshot && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-[70%] z-0">
               <div className="relative w-full h-full bg-neutral-900 border-[16px] border-white rounded-[6rem] p-4 shadow-2xl overflow-hidden">
                  <div className="w-full h-full bg-black rounded-[4.5rem] overflow-hidden">
                     <img src={screenshot} alt="App Content" className="w-full h-full object-cover" />
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Canvas Background Glow */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20 blur-[150px]"
          style={{ backgroundColor: bgColor }}
        />
      </main>
    </div>
  );
}
