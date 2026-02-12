"use client";

import React, { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { SCREENSHOT_SIZES } from "@/lib/constants";
import { toPng } from "html-to-image";
import {
  Download,
  Type,
  Image as ImageIcon,
  Monitor,
  Trash2,
  Plus,
  Mountain,
  Move,
  Scaling,
  Languages,
  LoaderCircle,
  Copy,
  RotateCw,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
};

type ScreenshotTransform = {
  x: number;
  y: number;
  scale: number;
};

type LanguageOption = {
  code: string;
  label: string;
};

const FONT_OPTIONS = [
  { label: "Space Grotesk", value: '"Space Grotesk", sans-serif' },
  { label: "Poppins", value: '"Poppins", sans-serif' },
  { label: "Playfair Display", value: '"Playfair Display", serif' },
  { label: "Bebas Neue", value: '"Bebas Neue", sans-serif' },
  { label: "DM Sans", value: '"DM Sans", sans-serif' },
];

const NUM_FRAMES = 3;
const BOARD_HEIGHT = 940;
const DEVICE_HEIGHT = 620;
const SCREEN_INSET = 18;
const DEFAULT_SIZE_ID = "iphone-6.7";
const SOURCE_LANGUAGE = "source";
const SOURCE_LANGUAGE_LABEL = "Original (English)";
const TRANSLATION_LANGUAGES: LanguageOption[] = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "ja", label: "Japanese" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese (Simplified)" },
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractJsonBlock(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return extractJsonBlock(trimmed);
  }
}

function normalizeTranslationList(value: unknown, textCount: number) {
  if (Array.isArray(value)) {
    return value.slice(0, textCount).map((item) => String(item ?? ""));
  }

  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  const preferredArray =
    (Array.isArray(candidate.translations) && candidate.translations) ||
    (Array.isArray(candidate.texts) && candidate.texts) ||
    (Array.isArray(candidate.items) && candidate.items) ||
    null;

  if (preferredArray) {
    return preferredArray.slice(0, textCount).map((item) => String(item ?? ""));
  }

  const numericEntries = Object.entries(candidate)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, item]) => String(item ?? ""));

  if (numericEntries.length) {
    return numericEntries.slice(0, textCount);
  }

  return null;
}

function normalizeRedmontTranslations(
  payload: Record<string, unknown>,
  targetLanguages: string[],
  textCount: number,
) {
  const normalized: Record<string, string[]> = {};

  const directCandidates = [
    payload.translations,
    payload.result,
    payload.data,
    parseMaybeJson(payload.output),
    parseMaybeJson(payload.content),
    payload,
  ];

  for (const rawCandidate of directCandidates) {
    const candidate = parseMaybeJson(rawCandidate);
    if (!candidate || typeof candidate !== "object") continue;
    const source = candidate as Record<string, unknown>;

    for (const code of targetLanguages) {
      if (normalized[code]) continue;
      const perLanguageRaw =
        source[code] ??
        (source.translations &&
        typeof source.translations === "object" &&
        !Array.isArray(source.translations)
          ? (source.translations as Record<string, unknown>)[code]
          : undefined);

      const normalizedList = normalizeTranslationList(perLanguageRaw, textCount);
      if (normalizedList?.length) {
        normalized[code] = normalizedList;
      }
    }
  }

  return Object.keys(normalized).length ? normalized : null;
}

export function AssetStudio() {
  const [selectedSize, setSelectedSize] = useState(
    SCREENSHOT_SIZES.find((size) => size.id === DEFAULT_SIZE_ID) ?? SCREENSHOT_SIZES[0],
  );
  const [screenshots, setScreenshots] = useState<Record<string, string | null>>({
    "frame-1": null,
    "frame-2": null,
    "frame-3": null,
  });
  const [panoramaImage, setPanoramaImage] = useState<string | null>(null);
  const [panoramaScale, setPanoramaScale] = useState(1);
  const [panoramaOffset, setPanoramaOffset] = useState({ x: 0, y: 0 });
  const [primaryBgColor, setPrimaryBgColor] = useState("#0ea5a8");
  const [secondaryBgColor, setSecondaryBgColor] = useState("#0f172a");

  const [textLayers, setTextLayers] = useState<TextLayer[]>([
    {
      id: uid("text"),
      text: "Build fast. Ship sharp.",
      x: 230,
      y: 88,
      width: 900,
      fontFamily: FONT_OPTIONS[0].value,
      fontSize: 84,
      fontWeight: 700,
      color: "#ffffff",
      textAlign: "left",
    },
  ]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(textLayers[0]?.id ?? null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [selectedTargetLanguages, setSelectedTargetLanguages] = useState<string[]>(["es", "fr", "ja"]);
  const [translatedTextByLanguage, setTranslatedTextByLanguage] = useState<Record<string, Record<string, string>>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [activeStoryboardLanguage, setActiveStoryboardLanguage] = useState(SOURCE_LANGUAGE);

  const canvasRef = useRef<HTMLDivElement>(null);

  const aspectRatio = selectedSize.width / selectedSize.height;
  const deviceWidth = Math.round(DEVICE_HEIGHT * aspectRatio);

  // Each panel matches the App Store screenshot aspect ratio exactly
  const panelWidth = BOARD_HEIGHT * aspectRatio;
  const boardWidth = panelWidth * NUM_FRAMES;

  const frameLayout = useMemo(() => {
    return Array.from({ length: NUM_FRAMES }, (_, index) => {
      const panelStartX = index * panelWidth;
      const frameX = panelStartX + (panelWidth - deviceWidth) / 2;
      return {
        id: `frame-${index + 1}`,
        x: frameX,
        y: 190,
        width: deviceWidth,
        height: DEVICE_HEIGHT,
      };
    });
  }, [deviceWidth, panelWidth]);

  const [selectedFrameId, setSelectedFrameId] = useState("frame-2");
  const [screenshotTransforms, setScreenshotTransforms] = useState<Record<string, ScreenshotTransform>>({
    "frame-1": { x: 0, y: 0, scale: 1.1 },
    "frame-2": { x: 0, y: 0, scale: 1.1 },
    "frame-3": { x: 0, y: 0, scale: 1.1 },
  });
  const [deviceOffsets, setDeviceOffsets] = useState<Record<string, { x: number; y: number }>>({
    "frame-1": { x: 0, y: 0 },
    "frame-2": { x: 0, y: 0 },
    "frame-3": { x: 0, y: 0 },
  });
  const [deviceRotations, setDeviceRotations] = useState<Record<string, number>>({
    "frame-1": 0,
    "frame-2": 0,
    "frame-3": 0,
  });

  const selectedText = textLayers.find((layer) => layer.id === selectedTextId) ?? null;
  const selectedTransform = screenshotTransforms[selectedFrameId] ?? { x: 0, y: 0, scale: 1 };
  const canEditSourceText = activeStoryboardLanguage === SOURCE_LANGUAGE;
  const hasAnyScreenshot = Object.values(screenshots).some(Boolean);

  const availableStoryboardLanguages = useMemo(() => {
    const translatedLanguages = selectedTargetLanguages
      .filter((code) => translatedTextByLanguage[code])
      .map((code) => ({
        code,
        label: TRANSLATION_LANGUAGES.find((lang) => lang.code === code)?.label ?? code.toUpperCase(),
      }));

    return [{ code: SOURCE_LANGUAGE, label: SOURCE_LANGUAGE_LABEL }, ...translatedLanguages];
  }, [selectedTargetLanguages, translatedTextByLanguage]);

  const textDragRef = useRef<{
    id: string;
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const screenshotDragRef = useRef<{
    frameId: string;
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const deviceDragRef = useRef<{
    frameId: string;
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const clearTranslations = () => {
    setTranslatedTextByLanguage({});
    setTranslationError(null);
    if (activeStoryboardLanguage !== SOURCE_LANGUAGE) {
      setActiveStoryboardLanguage(SOURCE_LANGUAGE);
    }
  };

  const getRenderedLayerText = (layer: TextLayer) => {
    if (activeStoryboardLanguage === SOURCE_LANGUAGE) {
      return layer.text;
    }

    return translatedTextByLanguage[activeStoryboardLanguage]?.[layer.id] ?? layer.text;
  };

  const waitForRender = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  };

  const updateSelectedText = (patch: Partial<TextLayer>) => {
    if (!selectedTextId) return;
    setTextLayers((current) =>
      current.map((layer) => (layer.id === selectedTextId ? { ...layer, ...patch } : layer)),
    );
  };

  const addTextLayer = () => {
    const newLayer: TextLayer = {
      id: uid("text"),
      text: "Click to edit",
      x: Math.round(boardWidth / 2 - 180),
      y: 130,
      width: 600,
      fontFamily: FONT_OPTIONS[1].value,
      fontSize: 64,
      fontWeight: 700,
      color: "#f8fafc",
      textAlign: "left",
    };
    setTextLayers((current) => [...current, newLayer]);
    clearTranslations();
    setSelectedTextId(newLayer.id);
    setEditingTextId(newLayer.id);
  };

  const removeSelectedText = () => {
    if (!selectedTextId) return;
    setTextLayers((current) => current.filter((layer) => layer.id !== selectedTextId));
    clearTranslations();
    setSelectedTextId(null);
    setEditingTextId(null);
  };

  // --- Export: capture full canvas then crop into individual panels ---

  const captureAndCropPanels = async () => {
    if (!canvasRef.current) return [];

    // Use actual element dimensions to calculate an accurate pixel ratio.
    const elWidth = canvasRef.current.offsetWidth;
    const elHeight = canvasRef.current.offsetHeight;
    const pixelRatio = selectedSize.height / elHeight;

    const fullDataUrl = await toPng(canvasRef.current, {
      pixelRatio,
      cacheBust: true,
      filter: (node: Node) => {
        if (node instanceof HTMLElement && node.hasAttribute("data-export-exclude")) return false;
        return true;
      },
    });

    const img = new window.Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.src = fullDataUrl;
    });

    const panels: string[] = [];

    for (let i = 0; i < NUM_FRAMES; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = selectedSize.width;
      canvas.height = selectedSize.height;
      const ctx = canvas.getContext("2d")!;

      // Use proportional boundaries to avoid rounding drift.
      const srcX = Math.round((i / NUM_FRAMES) * img.width);
      const srcXEnd = Math.round(((i + 1) / NUM_FRAMES) * img.width);
      const srcW = srcXEnd - srcX;

      // Crop to exact target aspect ratio, centering any excess.
      const targetAspect = selectedSize.width / selectedSize.height;
      const sourceAspect = srcW / img.height;

      let finalX = srcX;
      let finalY = 0;
      let finalW = srcW;
      let finalH = img.height;

      if (sourceAspect > targetAspect) {
        finalW = Math.round(img.height * targetAspect);
        finalX += Math.round((srcW - finalW) / 2);
      } else if (sourceAspect < targetAspect) {
        finalH = Math.round(srcW / targetAspect);
        finalY = Math.round((img.height - finalH) / 2);
      }

      ctx.drawImage(
        img,
        finalX, finalY, finalW, finalH,
        0, 0, selectedSize.width, selectedSize.height,
      );
      panels.push(canvas.toDataURL("image/png"));
    }
    return panels;
  };

  const handleExportScreenshots = async () => {
    const panels = await captureAndCropPanels();
    if (!panels.length) return;

    if (panels.length === 1) {
      const link = document.createElement("a");
      link.download = `screenshot-1-${selectedSize.id}.png`;
      link.href = panels[0];
      link.click();
      return;
    }

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    panels.forEach((dataUrl, i) => {
      const base64 = dataUrl.split(",")[1];
      zip.file(`screenshot-${i + 1}-${selectedSize.id}.png`, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `app-store-screenshots-${selectedSize.id}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleTranslate = async () => {
    if (!textLayers.length || !selectedTargetLanguages.length) return;

    setIsTranslating(true);
    setTranslationError(null);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLanguage: "en",
          targetLanguages: selectedTargetLanguages,
          texts: textLayers.map((layer) => layer.text),
        }),
      });

      const payload = (await response.json()) as {
        translations?: unknown;
        result?: unknown;
        data?: unknown;
        output?: unknown;
        content?: unknown;
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Translation failed.");
      }

      const normalizedTranslations = normalizeRedmontTranslations(
        payload as Record<string, unknown>,
        selectedTargetLanguages,
        textLayers.length,
      );

      if (!normalizedTranslations) {
        throw new Error(payload.error ?? "Translation failed: unexpected Redmont response shape.");
      }

      const mapped: Record<string, Record<string, string>> = {};

      for (const [languageCode, translatedTexts] of Object.entries(normalizedTranslations)) {
        const perLayer: Record<string, string> = {};
        textLayers.forEach((layer, index) => {
          perLayer[layer.id] = translatedTexts[index] ?? layer.text;
        });
        mapped[languageCode] = perLayer;
      }

      setTranslatedTextByLanguage(mapped);
      const firstTranslatedLanguage = selectedTargetLanguages.find((code) => mapped[code]);
      if (firstTranslatedLanguage) {
        setActiveStoryboardLanguage(firstTranslatedLanguage);
      }
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "Translation request failed.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleExportAll = async () => {
    if (!canvasRef.current) return;

    const languagesToExport = selectedTargetLanguages.filter((code) => translatedTextByLanguage[code]);

    if (!languagesToExport.length) {
      setTranslationError("Translate at least one selected language before exporting all.");
      return;
    }

    setIsExportingAll(true);
    setTranslationError(null);

    const previousLanguage = activeStoryboardLanguage;

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const code of languagesToExport) {
        setActiveStoryboardLanguage(code);
        await waitForRender();

        const panels = await captureAndCropPanels();
        panels.forEach((dataUrl, i) => {
          const base64 = dataUrl.split(",")[1];
          zip.file(`${code}/screenshot-${i + 1}-${selectedSize.id}.png`, base64, { base64: true });
        });
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `app-store-screenshots-${selectedSize.id}-all-languages.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "Failed to export all languages.");
    } finally {
      setActiveStoryboardLanguage(previousLanguage);
      setIsExportingAll(false);
    }
  };

  const handleScreenshotUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setScreenshots((current) => ({
        ...current,
        [selectedFrameId]: imageData,
      }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handlePanoramaUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setPanoramaImage(imageData);
    };
    reader.readAsDataURL(file);
  };

  const copyScreenshotToAllFrames = () => {
    const src = screenshots[selectedFrameId];
    if (!src) return;
    const transform = screenshotTransforms[selectedFrameId];
    setScreenshots((current) => {
      const next = { ...current };
      for (let i = 0; i < NUM_FRAMES; i++) {
        next[`frame-${i + 1}`] = src;
      }
      return next;
    });
    setScreenshotTransforms((current) => {
      const next = { ...current };
      for (let i = 0; i < NUM_FRAMES; i++) {
        next[`frame-${i + 1}`] = { ...transform };
      }
      return next;
    });
  };

  const toggleTargetLanguage = (code: string) => {
    setSelectedTargetLanguages((current) => {
      const next = current.includes(code) ? current.filter((item) => item !== code) : [...current, code];

      if (activeStoryboardLanguage !== SOURCE_LANGUAGE && !next.includes(activeStoryboardLanguage)) {
        setActiveStoryboardLanguage(SOURCE_LANGUAGE);
      }

      return next;
    });
  };

  const onTextPointerDown = (event: React.PointerEvent<HTMLDivElement>, layer: TextLayer) => {
    if (editingTextId === layer.id) return;
    event.stopPropagation();
    setSelectedTextId(layer.id);

    textDragRef.current = {
      id: layer.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: layer.x,
      startY: layer.y,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTextPointerMove = (event: React.PointerEvent<HTMLDivElement>, layerId: string) => {
    const drag = textDragRef.current;
    if (!drag || drag.id !== layerId) return;

    const deltaX = event.clientX - drag.pointerX;
    const deltaY = event.clientY - drag.pointerY;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      drag.moved = true;
    }

    setTextLayers((current) =>
      current.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              x: drag.startX + deltaX,
              y: drag.startY + deltaY,
            }
          : layer,
      ),
    );
  };

  const onTextPointerUp = (event: React.PointerEvent<HTMLDivElement>, layerId: string) => {
    const drag = textDragRef.current;
    if (!drag || drag.id !== layerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!drag.moved && canEditSourceText) {
      setEditingTextId(layerId);
      setSelectedTextId(layerId);
    }

    textDragRef.current = null;
  };

  const textResizeRef = useRef<{
    id: string;
    pointerX: number;
    startWidth: number;
  } | null>(null);

  const onTextResizePointerDown = (event: React.PointerEvent<HTMLDivElement>, layer: TextLayer) => {
    event.stopPropagation();
    textResizeRef.current = {
      id: layer.id,
      pointerX: event.clientX,
      startWidth: layer.width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTextResizePointerMove = (event: React.PointerEvent<HTMLDivElement>, layerId: string) => {
    const resize = textResizeRef.current;
    if (!resize || resize.id !== layerId) return;

    const newWidth = Math.max(80, resize.startWidth + (event.clientX - resize.pointerX));
    setTextLayers((current) =>
      current.map((layer) => (layer.id === layerId ? { ...layer, width: newWidth } : layer)),
    );
  };

  const onTextResizePointerUp = (event: React.PointerEvent<HTMLDivElement>, layerId: string) => {
    const resize = textResizeRef.current;
    if (!resize || resize.id !== layerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    textResizeRef.current = null;
  };

  const onScreenshotPointerDown = (event: React.PointerEvent<HTMLDivElement>, frameId: string) => {
    if (!screenshots[frameId]) return;
    event.stopPropagation();
    setSelectedFrameId(frameId);

    const transform = screenshotTransforms[frameId] ?? { x: 0, y: 0, scale: 1 };
    screenshotDragRef.current = {
      frameId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: transform.x,
      startY: transform.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onScreenshotPointerMove = (event: React.PointerEvent<HTMLDivElement>, frameId: string) => {
    const drag = screenshotDragRef.current;
    if (!drag || drag.frameId !== frameId) return;

    const deltaX = event.clientX - drag.pointerX;
    const deltaY = event.clientY - drag.pointerY;

    setScreenshotTransforms((current) => ({
      ...current,
      [frameId]: {
        ...(current[frameId] ?? { x: 0, y: 0, scale: 1 }),
        x: drag.startX + deltaX,
        y: drag.startY + deltaY,
      },
    }));
  };

  const onScreenshotPointerUp = (event: React.PointerEvent<HTMLDivElement>, frameId: string) => {
    const drag = screenshotDragRef.current;
    if (!drag || drag.frameId !== frameId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    screenshotDragRef.current = null;
  };

  const onDevicePointerDown = (event: React.PointerEvent<HTMLDivElement>, frameId: string) => {
    event.stopPropagation();
    setSelectedFrameId(frameId);

    const offset = deviceOffsets[frameId] ?? { x: 0, y: 0 };
    deviceDragRef.current = {
      frameId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: offset.x,
      startY: offset.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDevicePointerMove = (event: React.PointerEvent<HTMLDivElement>, frameId: string) => {
    const drag = deviceDragRef.current;
    if (!drag || drag.frameId !== frameId) return;

    const deltaX = event.clientX - drag.pointerX;
    const deltaY = event.clientY - drag.pointerY;

    setDeviceOffsets((current) => ({
      ...current,
      [frameId]: {
        x: drag.startX + deltaX,
        y: drag.startY + deltaY,
      },
    }));
  };

  const onDevicePointerUp = (event: React.PointerEvent<HTMLDivElement>, frameId: string) => {
    const drag = deviceDragRef.current;
    if (!drag || drag.frameId !== frameId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    deviceDragRef.current = null;
  };

  // Canvas background: gradient or panorama image applied behind the devices
  const canvasBackgroundStyle: React.CSSProperties = panoramaImage
    ? {
        backgroundImage: `url(${panoramaImage})`,
        backgroundSize: `${Math.round(boardWidth * panoramaScale)}px ${Math.round(BOARD_HEIGHT * panoramaScale)}px`,
        backgroundPosition: `${Math.round(panoramaOffset.x)}px ${Math.round(panoramaOffset.y)}px`,
        backgroundRepeat: "no-repeat",
      }
    : {
        background: `linear-gradient(130deg, ${primaryBgColor} 0%, ${secondaryBgColor} 100%)`,
      };

  return (
    <div className="flex min-h-screen bg-[#05070d] text-slate-100">
      <aside className="w-[360px] shrink-0 border-r border-white/10 bg-[#0a1020]">
        <div className="border-b border-white/10 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Store Assets Studio</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
            AppScreens-style Editor
          </h1>
        </div>

        <div className="custom-scrollbar h-[calc(100vh-129px)] space-y-8 overflow-y-auto p-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Monitor className="h-4 w-4" />
              <h2 className="text-xs uppercase tracking-[0.16em]">Target Size</h2>
            </div>
            <div className="space-y-2">
              {SCREENSHOT_SIZES.map((size) => (
                <button
                  key={size.id}
                  onClick={() => setSelectedSize(size)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedSize.id === size.id
                      ? "border-cyan-300/80 bg-cyan-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <p className="text-sm font-semibold">{size.name}</p>
                  <p className="text-xs text-slate-400">
                    {size.width} x {size.height}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Mountain className="h-4 w-4" />
              <h2 className="text-xs uppercase tracking-[0.16em]">Panoramic Background</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                <span className="mb-2 block text-slate-300">Primary</span>
                <input
                  type="color"
                  value={primaryBgColor}
                  onChange={(e) => setPrimaryBgColor(e.target.value)}
                  className="h-10 w-full rounded-md bg-transparent"
                />
              </label>
              <label className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                <span className="mb-2 block text-slate-300">Secondary</span>
                <input
                  type="color"
                  value={secondaryBgColor}
                  onChange={(e) => setSecondaryBgColor(e.target.value)}
                  className="h-10 w-full rounded-md bg-transparent"
                />
              </label>
            </div>
            <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm hover:bg-white/10">
              <ImageIcon className="mr-2 h-4 w-4" />
              {panoramaImage ? "Replace panorama image" : "Upload panorama image"}
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handlePanoramaUpload}
              />
            </label>
            {panoramaImage ? (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs">
                <label className="block">
                  <span className="mb-2 flex items-center gap-1 text-slate-300">
                    <Scaling className="h-3.5 w-3.5" /> Scale: {panoramaScale.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.01"
                    value={panoramaScale}
                    onChange={(e) => setPanoramaScale(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-slate-300">Offset X: {Math.round(panoramaOffset.x)}px</span>
                  <input
                    type="range"
                    min="-500"
                    max="500"
                    step="1"
                    value={panoramaOffset.x}
                    onChange={(e) => setPanoramaOffset((prev) => ({ ...prev, x: Number(e.target.value) }))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-slate-300">Offset Y: {Math.round(panoramaOffset.y)}px</span>
                  <input
                    type="range"
                    min="-500"
                    max="500"
                    step="1"
                    value={panoramaOffset.y}
                    onChange={(e) => setPanoramaOffset((prev) => ({ ...prev, y: Number(e.target.value) }))}
                    className="w-full"
                  />
                </label>
                <button
                  onClick={() => setPanoramaImage(null)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-rose-200 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove image
                </button>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-300">
              <ImageIcon className="h-4 w-4" />
              <h2 className="text-xs uppercase tracking-[0.16em]">Screenshots</h2>
            </div>

            {/* Frame selector thumbnails */}
            <div className="grid grid-cols-3 gap-2">
              {frameLayout.map((frame, i) => (
                <button
                  key={frame.id}
                  onClick={() => setSelectedFrameId(frame.id)}
                  className={`relative aspect-[9/16] overflow-hidden rounded-lg border transition ${
                    selectedFrameId === frame.id
                      ? "border-cyan-300/80 ring-2 ring-cyan-300/40"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  {screenshots[frame.id] ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${screenshots[frame.id]})` }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs text-slate-500">
                      #{i + 1}
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {i + 1}
                  </span>
                </button>
              ))}
            </div>

            {/* Upload for selected frame */}
            <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm hover:bg-white/10">
              <ImageIcon className="mr-2 h-4 w-4" />
              {screenshots[selectedFrameId]
                ? `Replace frame ${selectedFrameId.replace("frame-", "#")} screenshot`
                : `Upload frame ${selectedFrameId.replace("frame-", "#")} screenshot`}
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleScreenshotUpload}
              />
            </label>

            {/* Device controls - always visible for selected frame */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs">
              <p className="text-slate-300">Frame {selectedFrameId.replace("frame-", "#")} controls</p>
              <label className="block">
                <span className="mb-2 flex items-center gap-1 text-slate-300">
                  <RotateCw className="h-3.5 w-3.5" /> Rotation: {deviceRotations[selectedFrameId] ?? 0}°
                </span>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="1"
                  value={deviceRotations[selectedFrameId] ?? 0}
                  onChange={(e) =>
                    setDeviceRotations((current) => ({
                      ...current,
                      [selectedFrameId]: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              {screenshots[selectedFrameId] ? (
                <>
                  <label className="block">
                    <span className="mb-2 block text-slate-300">Screenshot Scale: {selectedTransform.scale.toFixed(2)}</span>
                    <input
                      type="range"
                      min="0.8"
                      max="2"
                      step="0.01"
                      value={selectedTransform.scale}
                      onChange={(e) =>
                        setScreenshotTransforms((current) => ({
                          ...current,
                          [selectedFrameId]: {
                            ...(current[selectedFrameId] ?? { x: 0, y: 0, scale: 1 }),
                            scale: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={copyScreenshotToAllFrames}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-slate-200 hover:bg-white/10"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy to all
                    </button>
                    <button
                      onClick={() =>
                        setScreenshots((current) => ({
                          ...current,
                          [selectedFrameId]: null,
                        }))
                      }
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-rose-200 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Languages className="h-4 w-4" />
              <h2 className="text-xs uppercase tracking-[0.16em]">Translation</h2>
            </div>
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
              {TRANSLATION_LANGUAGES.map((language) => {
                const checked = selectedTargetLanguages.includes(language.code);
                const translated = Boolean(translatedTextByLanguage[language.code]);
                return (
                  <label key={language.code} className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTargetLanguage(language.code)}
                        className="h-4 w-4 rounded border-white/30 bg-transparent"
                      />
                      <span>{language.label}</span>
                    </span>
                    <span className={`text-xs ${translated ? "text-emerald-300" : "text-slate-500"}`}>
                      {translated ? "Ready" : "Not translated"}
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              onClick={handleTranslate}
              disabled={!selectedTargetLanguages.length || !textLayers.length || isTranslating}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isTranslating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
              {isTranslating ? "Translating..." : "Translate Selected Languages"}
            </button>
            {translationError ? (
              <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {translationError}
              </p>
            ) : null}
            {!canEditSourceText ? (
              <p className="text-xs text-amber-200/90">Switch to Original (English) to edit text content.</p>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Type className="h-4 w-4" />
              <h2 className="text-xs uppercase tracking-[0.16em]">Text Layers</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={addTextLayer}
                disabled={!canEditSourceText}
                className="flex items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-sm hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add Text
              </button>
              <button
                onClick={removeSelectedText}
                disabled={!selectedText || !canEditSourceText}
                className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete
              </button>
            </div>
            <div className="space-y-2">
              {textLayers.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => {
                    setSelectedTextId(layer.id);
                    if (canEditSourceText) {
                      setEditingTextId(layer.id);
                    }
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    selectedTextId === layer.id
                      ? "border-cyan-300/70 bg-cyan-400/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  {getRenderedLayerText(layer) || "(empty text)"}
                </button>
              ))}
            </div>

            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs">
              <label className="block">
                <span className="mb-2 block text-slate-300">Font Family</span>
                <select
                  value={selectedText?.fontFamily ?? ""}
                  onChange={(e) => updateSelectedText({ fontFamily: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#0d1529] px-3 py-2 text-sm"
                  disabled={!selectedText}
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font.label} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-2 block text-slate-300">Alignment</span>
                <div className="grid grid-cols-3 gap-1">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => updateSelectedText({ textAlign: align })}
                      disabled={!selectedText}
                      className={`flex items-center justify-center rounded-lg border px-2 py-1.5 transition ${
                        selectedText?.textAlign === align
                          ? "border-cyan-300/80 bg-cyan-400/20 text-cyan-100"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {align === "left" && <AlignLeft className="h-3.5 w-3.5" />}
                      {align === "center" && <AlignCenter className="h-3.5 w-3.5" />}
                      {align === "right" && <AlignRight className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-2 block text-slate-300">Text Width: {Math.round(selectedText?.width ?? 0)}px</span>
                <input
                  type="range"
                  min="80"
                  max={Math.round(boardWidth * 0.95)}
                  step="10"
                  value={selectedText?.width ?? 600}
                  onChange={(e) => updateSelectedText({ width: Number(e.target.value) })}
                  className="w-full"
                  disabled={!selectedText}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-slate-300">Font Size: {selectedText?.fontSize ?? 0}px</span>
                <input
                  type="range"
                  min="28"
                  max="170"
                  step="1"
                  value={selectedText?.fontSize ?? 28}
                  onChange={(e) => updateSelectedText({ fontSize: Number(e.target.value) })}
                  className="w-full"
                  disabled={!selectedText}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-slate-300">Font Weight</span>
                <select
                  value={selectedText?.fontWeight ?? 700}
                  onChange={(e) => updateSelectedText({ fontWeight: Number(e.target.value) })}
                  className="w-full rounded-lg border border-white/10 bg-[#0d1529] px-3 py-2 text-sm"
                  disabled={!selectedText}
                >
                  {[400, 500, 600, 700, 800, 900].map((weight) => (
                    <option key={weight} value={weight}>
                      {weight}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-slate-300">Color</span>
                <input
                  type="color"
                  value={selectedText?.color ?? "#ffffff"}
                  onChange={(e) => updateSelectedText({ color: e.target.value })}
                  className="h-10 w-full rounded-lg bg-transparent"
                  disabled={!selectedText}
                />
              </label>
            </div>
          </section>
        </div>

        <div className="border-t border-white/10 p-6">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleExportScreenshots}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300"
            >
              <Download className="h-4 w-4" /> Export {NUM_FRAMES} Screens
            </button>
            <button
              onClick={handleExportAll}
              disabled={isExportingAll}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-3 font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isExportingAll ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExportingAll ? "Exporting..." : "Export All ZIP"}
            </button>
          </div>
          {hasAnyScreenshot ? (
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Each screenshot exports at {selectedSize.width} x {selectedSize.height}px
            </p>
          ) : null}
        </div>
      </aside>

      <main className="custom-scrollbar flex-1 overflow-auto bg-[radial-gradient(circle_at_top,#1d2747_0%,#05070d_55%)] p-8">
        <div className="mx-auto rounded-3xl border border-white/10 bg-[#080d1a]/70 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur" style={{ minWidth: Math.round(boardWidth) + 48 }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {availableStoryboardLanguages.map((language) => (
                <button
                  key={language.code}
                  onClick={() => {
                    setActiveStoryboardLanguage(language.code);
                    setEditingTextId(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    activeStoryboardLanguage === language.code
                      ? "border-cyan-300/80 bg-cyan-400/20 text-cyan-100"
                      : "border-white/20 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {language.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Storyboard language:{" "}
              {availableStoryboardLanguages.find((language) => language.code === activeStoryboardLanguage)?.label}
            </p>
          </div>

          <div
            className="mx-auto overflow-hidden rounded-3xl border border-white/15"
            style={{ width: boardWidth }}
          >
          <div
            ref={canvasRef}
            className="relative overflow-hidden"
            style={{ width: boardWidth, height: BOARD_HEIGHT, ...canvasBackgroundStyle }}
            onPointerDown={() => {
              setEditingTextId(null);
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 25% 12%, rgba(255,255,255,.22), transparent 35%), radial-gradient(circle at 75% 65%, rgba(255,255,255,.16), transparent 35%)",
              }}
            />

            {frameLayout.map((frame) => {
              const screenshotTransform = screenshotTransforms[frame.id] ?? { x: 0, y: 0, scale: 1 };
              const offset = deviceOffsets[frame.id] ?? { x: 0, y: 0 };
              const rotation = deviceRotations[frame.id] ?? 0;
              const frameScreenshot = screenshots[frame.id];

              return (
                <div
                  key={frame.id}
                  className="absolute cursor-grab rounded-[52px] border-[14px] border-slate-200 bg-[#e5e7eb] shadow-[0_20px_40px_rgba(0,0,0,0.35)] active:cursor-grabbing"
                  style={{
                    left: frame.x + offset.x,
                    top: frame.y + offset.y,
                    width: frame.width,
                    height: frame.height,
                    transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                    transformOrigin: "center center",
                  }}
                  onPointerDown={(event) => onDevicePointerDown(event, frame.id)}
                  onPointerMove={(event) => onDevicePointerMove(event, frame.id)}
                  onPointerUp={(event) => onDevicePointerUp(event, frame.id)}
                >
                  {/* Selection ring - excluded from export */}
                  {selectedFrameId === frame.id ? (
                    <div
                      data-export-exclude
                      className="pointer-events-none absolute -inset-1 rounded-[56px] ring-4 ring-cyan-300/70"
                    />
                  ) : null}
                  <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-[#121a2f]">
                    {frameScreenshot ? (
                      <div
                        className="absolute inset-0 cursor-grab active:cursor-grabbing"
                        onPointerDown={(event) => onScreenshotPointerDown(event, frame.id)}
                        onPointerMove={(event) => onScreenshotPointerMove(event, frame.id)}
                        onPointerUp={(event) => onScreenshotPointerUp(event, frame.id)}
                      >
                        <div
                          className="absolute"
                          style={{
                            left: SCREEN_INSET + screenshotTransform.x,
                            top: SCREEN_INSET + screenshotTransform.y,
                            width: frame.width - SCREEN_INSET * 2,
                            height: frame.height - SCREEN_INSET * 2,
                            transform: `scale(${screenshotTransform.scale})`,
                            transformOrigin: "top left",
                          }}
                        >
                          <Image
                            src={frameScreenshot}
                            alt="App screenshot"
                            width={Math.max(1, frame.width - SCREEN_INSET * 2)}
                            height={Math.max(1, frame.height - SCREEN_INSET * 2)}
                            unoptimized
                            draggable={false}
                            className="h-full w-full select-none object-cover"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {/* Dotted panel divider lines - excluded from export */}
            {Array.from({ length: NUM_FRAMES - 1 }, (_, i) => (
              <div
                key={`divider-${i}`}
                data-export-exclude
                className="pointer-events-none absolute top-0 z-40 h-full"
                style={{ left: (i + 1) * panelWidth }}
              >
                <div className="h-full w-0 border-l-[2px] border-dashed border-white/25" />
                <div
                  data-export-exclude
                  className="absolute -left-3 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/50 backdrop-blur-sm"
                >
                  {i + 1} | {i + 2}
                </div>
              </div>
            ))}

            {textLayers.map((layer) => (
              <div
                key={layer.id}
                className="absolute"
                style={{ left: layer.x, top: layer.y, width: layer.width }}
                onPointerDown={(event) => onTextPointerDown(event, layer)}
                onPointerMove={(event) => onTextPointerMove(event, layer.id)}
                onPointerUp={(event) => onTextPointerUp(event, layer.id)}
              >
                {/* Selection outline + resize handle - excluded from export */}
                {selectedTextId === layer.id && editingTextId !== layer.id ? (
                  <>
                    <div
                      data-export-exclude
                      className="pointer-events-none absolute -inset-2 rounded-lg border-2 border-dashed border-cyan-300/60"
                    />
                    <div
                      data-export-exclude
                      className="absolute -right-5 top-0 z-50 flex h-full w-4 cursor-col-resize items-center justify-center"
                      onPointerDown={(event) => onTextResizePointerDown(event, layer)}
                      onPointerMove={(event) => onTextResizePointerMove(event, layer.id)}
                      onPointerUp={(event) => onTextResizePointerUp(event, layer.id)}
                    >
                      <div className="h-10 w-1.5 rounded-full bg-cyan-300/80" />
                    </div>
                  </>
                ) : null}
                {editingTextId === layer.id ? (
                  <textarea
                    autoFocus
                    value={getRenderedLayerText(layer)}
                    onChange={(event) => {
                      clearTranslations();
                      setTextLayers((current) =>
                        current.map((entry) =>
                          entry.id === layer.id ? { ...entry, text: event.target.value } : entry,
                        ),
                      );
                    }}
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        setEditingTextId(null);
                      }
                    }}
                    className="min-h-[120px] w-full resize-none rounded-lg border border-cyan-200/70 bg-[#071028]/85 p-3 leading-none focus:outline-none"
                    style={{
                      fontFamily: layer.fontFamily,
                      fontSize: `${layer.fontSize}px`,
                      fontWeight: layer.fontWeight,
                      color: layer.color,
                      textAlign: layer.textAlign,
                    }}
                  />
                ) : (
                  <div
                    className="cursor-grab whitespace-pre-wrap leading-[0.94] active:cursor-grabbing"
                    style={{
                      fontFamily: layer.fontFamily,
                      fontSize: `${layer.fontSize}px`,
                      fontWeight: layer.fontWeight,
                      color: layer.color,
                      textAlign: layer.textAlign,
                    }}
                  >
                    {getRenderedLayerText(layer)}
                  </div>
                )}
              </div>
            ))}

            <div
              data-export-exclude
              className="pointer-events-none absolute bottom-5 left-6 flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-xs text-slate-200 backdrop-blur"
            >
              <Move className="h-3.5 w-3.5" />
              Drag devices to reposition. Drag screenshots inside frames. Click text to edit.
            </div>
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}
