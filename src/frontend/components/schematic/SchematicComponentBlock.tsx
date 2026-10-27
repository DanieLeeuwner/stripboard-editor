"use client";

import { useState, useRef } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { Component } from "@/types";
import { resolveComponentDef } from "@/utils/resolveComponentDef";
import SymbolRenderer, { getSymbolBounds, getRotatedPinPositions } from "./SymbolRenderer";
import { getSymbolDef } from "@/data/symbolDefs";

function ComponentLabelEditor({
  label,
  value,
  allowsValue,
  onCommit,
  onCancel,
}: {
  label: string;
  value: string;
  allowsValue: boolean;
  onCommit: (label: string, value: string) => void;
  onCancel: () => void;
}) {
  const [nextLabel, setNextLabel] = useState(label);
  const [nextValue, setNextValue] = useState(value);
  const commit = () => onCommit(nextLabel, nextValue);

  return (
    <div
      className="flex flex-col gap-0.5"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={nextLabel}
        onChange={(e) => setNextLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Ref"
        className="w-full bg-white dark:bg-neutral-800 border border-[#113768] dark:border-[#5b9bd5] rounded px-1 text-xs text-center text-neutral-900 dark:text-neutral-100 outline-none"
      />
      {allowsValue && (
        <input
          value={nextValue}
          onChange={(e) => setNextValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Value"
          className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-1 text-[10px] text-center text-neutral-700 dark:text-neutral-300 outline-none"
        />
      )}
    </div>
  );
}

interface Props {
  component: Component;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onPinMouseDown?: (componentId: string, pinId: string, e: React.MouseEvent) => void;
  getSVGPoint?: (e: React.MouseEvent) => { x: number; y: number };
  readOnly?: boolean;
  // The label/value editor is owned by the canvas, so a double click on either
  // layer (symbol or labels) opens the same editor.
  editingLabel?: boolean;
  onEditLabel?: () => void;
  onCloseEdit?: () => void;
  part?: "all" | "symbol" | "labels";
}

export default function SchematicComponentBlock({
  component,
  isSelected,
  onMouseDown,
  onPinMouseDown,
  getSVGPoint,
  readOnly = false,
  editingLabel = false,
  onEditLabel,
  onCloseEdit,
  part = "all",
}: Props) {
  const componentDefs = useProjectStore((s) => s.componentDefs);
  const netAssignments = useProjectStore((s) => s.netAssignments);
  const nets = useProjectStore((s) => s.nets);
  const updateLabel = useProjectStore((s) => s.updateLabel);
  const updateComponentValue = useProjectStore((s) => s.updateComponentValue);
  const transact = useProjectStore((s) => s.transact);
  const updatePinName = useProjectStore((s) => s.updatePinName);
  const updateLabelOffset = useProjectStore((s) => s.updateLabelOffset);
  const updatePinLabelOffset = useProjectStore((s) => s.updatePinLabelOffset);
  const pushSnapshot = useProjectStore((s) => s.pushSnapshot);
  const wireDrawMode = useProjectStore((s) => s.schematicWireDrawMode);
  const wireDrawing = useProjectStore((s) => !!s.schematicWireDrawingFrom);
  // While a wire is being made, labels are part of the wiring surface: they
  // must not move, open editors or swallow the click meant for the wire.
  const labelsFrozen = wireDrawMode || wireDrawing;
  const labelsLocked = useProjectStore((s) => s.labelMovement === false);

  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editPinValue, setEditPinValue] = useState("");
  const [draggingLabel, setDraggingLabel] = useState(false);
  const pinLabelSnapshotPushed = useRef(false);
  const labelSnapshotPushed = useRef(false);
  // A press that turns into a drag must not also count as the click that
  // opens the editor when the pointer is released.
  const labelMoved = useRef(false);

  const def = resolveComponentDef(component, componentDefs);
  if (!def) return null;
  const allowsValue = def.hasValue ?? false;
  const showSymbol = part !== "labels";
  const showLabels = part !== "symbol";

  const rotation = component.schematicRotation ?? 0;
  const mirrored = component.schematicMirrored ?? false;
  const symbolDef = getSymbolDef(def.symbol);
  const symbolLabelYOffset = symbolDef?.labelYOffset ?? 0;
  const bounds = getSymbolBounds(def.symbol, rotation, mirrored);

  // Label position: default above component, offset by user drag
  const defaultLabelX = (bounds.minX + bounds.maxX) / 2;
  const defaultLabelY = bounds.minY - 6 - symbolLabelYOffset;
  const labelOff = component.labelOffset ?? { x: 0, y: 0 };
  const labelX = defaultLabelX + labelOff.x;
  const labelY = defaultLabelY + labelOff.y;
  const hasCustomOffset = labelOff.x !== 0 || labelOff.y !== 0;

  // Build pin color map
  const pinColors: Record<string, string> = {};
  for (const a of netAssignments) {
    if (a.componentId === component.id) {
      const net = nets.find((n) => n.id === a.netId);
      if (net) pinColors[a.pinId] = net.color;
    }
  }

  const pinNames: Record<string, string> = {};
  for (const pin of def.pins) {
    pinNames[pin.id] = pin.name;
  }

  const handleOpenEditor = (e: React.MouseEvent) => {
    if (readOnly || labelsFrozen) return;
    e.stopPropagation();
    if (!editingLabel) onEditLabel?.();
  };

  const handleLabelClick = (e: React.MouseEvent) => {
    if (readOnly || labelsFrozen) return;
    if (labelMoved.current) {
      labelMoved.current = false;
      return;
    }
    e.stopPropagation();
    onEditLabel?.();
  };

  // With locked labels the press reaches the component and starts its drag.
  // Track the pointer so that a drop does not count as the opening click.
  const handleLockedLabelMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    labelMoved.current = false;
    const start = { x: e.clientX, y: e.clientY };
    const handleMove = (me: MouseEvent) => {
      if (labelMoved.current) return;
      const dx = me.clientX - start.x;
      const dy = me.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > 3) labelMoved.current = true;
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const commitLabel = (nextLabel: string, nextValue: string) => {
    const trimmedLabel = nextLabel.trim();
    const trimmedValue = nextValue.trim();
    const labelChanged = !!trimmedLabel && trimmedLabel !== component.label;
    const valueChanged = allowsValue && trimmedValue !== (component.value ?? "");
    if (labelChanged || valueChanged) {
      transact(() => {
        if (labelChanged) updateLabel(component.id, trimmedLabel);
        if (valueChanged) updateComponentValue(component.id, trimmedValue);
      });
    }
    onCloseEdit?.();
  };

  const handleLabelDragStart = (e: React.MouseEvent) => {
    if (readOnly || labelsFrozen || editingLabel) return;
    e.stopPropagation();
    e.preventDefault();
    // Defer the snapshot until the label actually moves — a double click on the
    // label (e.g. to rename) must not push a no-op entry / wipe redo.
    labelSnapshotPushed.current = false;
    labelMoved.current = false;
    setDraggingLabel(true);

    const start = getSVGPoint ? getSVGPoint(e) : null;
    const startOff = { x: labelOff.x, y: labelOff.y };

    const handleMove = (me: MouseEvent) => {
      labelMoved.current = true;
      if (!getSVGPoint || !start) return;
      const svgPt = getSVGPoint(me as unknown as React.MouseEvent);
      // Move by the pointer's travel, not to its position: the label keeps
      // the same point under the cursor instead of centring on it.
      const newOffX = startOff.x + (svgPt.x - start.x);
      const newOffY = startOff.y + (svgPt.y - start.y);
      if (!labelSnapshotPushed.current) {
        pushSnapshot();
        labelSnapshotPushed.current = true;
      }
      updateLabelOffset(component.id, { x: newOffX, y: newOffY });
    };

    const handleUp = () => {
      labelSnapshotPushed.current = false;
      setDraggingLabel(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handlePinLabelClick = (pinId: string, e: React.MouseEvent) => {
    if (readOnly || labelsFrozen) return;
    e.stopPropagation();
    setEditPinValue(pinNames[pinId] ?? pinId);
    setEditingPinId(pinId);
  };

  const commitPinName = () => {
    if (editingPinId) {
      const trimmed = editPinValue.trim();
      if (trimmed && trimmed !== pinNames[editingPinId]) {
        updatePinName(component.id, editingPinId, trimmed);
      }
      setEditingPinId(null);
    }
  };

  const handlePinMouseDown = (pinId: string, e: React.MouseEvent) => {
    onPinMouseDown?.(component.id, pinId, e);
  };

  return (
    <g
      transform={`translate(${component.schematicPos.x}, ${component.schematicPos.y})`}
      style={{ cursor: "grab", opacity: component.boardExcluded ? 0.45 : 1 }}
      onMouseDown={onMouseDown}
      onDoubleClick={handleOpenEditor}
    >
      {showSymbol && (
        <SymbolRenderer
          symbolId={def.symbol}
          rotation={rotation}
          mirrored={mirrored}
          selected={isSelected}
          pinColors={pinColors}
          onPinMouseDown={handlePinMouseDown}
          pinNames={pinNames}
          pinLabelOffsets={component.pinLabelOffsets ?? {}}
          labelsLocked={labelsLocked}
          labelsFrozen={labelsFrozen}
          showPinLabels={false}
        />
      )}

      {showLabels && (
        <>
          {/* Leader line from component center to label (when label is offset) */}
          {hasCustomOffset && !editingLabel && (
            <line
              x1={0} y1={0}
              x2={labelX} y2={labelY}
              stroke="var(--hole-stroke)"
              strokeWidth={0.8}
              strokeDasharray="2 2"
              pointerEvents="none"
            />
          )}

          {/* Label */}
          {!editingLabel && (
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill="var(--component-text)"
              stroke="var(--schematic-bg)"
              strokeWidth={3}
              strokeLinejoin="round"
              style={{ cursor: "grab", userSelect: "none", paintOrder: "stroke" }}
              onClick={handleLabelClick}
              onMouseDown={(e) => {
                if (labelsFrozen) {
                  if (e.button === 0) e.stopPropagation();
                  return;
                }
                if (labelsLocked) handleLockedLabelMouseDown(e);
                else handleLabelDragStart(e);
              }}
            >
              <tspan x={labelX}>{component.label}</tspan>
              {allowsValue && component.value && (
                <tspan x={labelX} dy="1.2em" fontWeight={400} fillOpacity={0.7}>
                  {component.value}
                </tspan>
              )}
              {component.offBoard && !component.boardExcluded && (
                <tspan x={labelX} dy="1.2em" fontSize={9} fontWeight={400} fontStyle="italic" fillOpacity={0.7}>
                  off board
                </tspan>
              )}
            </text>
          )}

          {/* Pin names are painted separately from the symbol, so they sit
              above every body and wire like the other labels. */}
          <SymbolRenderer
            symbolId={def.symbol}
            rotation={rotation}
            mirrored={mirrored}
            selected={isSelected}
            onPinLabelClick={readOnly || editingPinId ? undefined : handlePinLabelClick}
            pinNames={pinNames}
            pinLabelOffsets={component.pinLabelOffsets ?? {}}
            onPinLabelDrag={readOnly ? undefined : (pinId, offset) => {
              if (!pinLabelSnapshotPushed.current) {
                pushSnapshot();
                pinLabelSnapshotPushed.current = true;
              }
              updatePinLabelOffset(component.id, pinId, offset);
            }}
            onPinLabelDragEnd={readOnly ? undefined : () => { pinLabelSnapshotPushed.current = false; }}
            labelsLocked={labelsLocked}
            labelsFrozen={labelsFrozen}
            labelsOnly
            showPinLabels={!editingPinId}
          />

          {/* Editing overlays render after the labels so they stay on top. */}
          {editingLabel && (
            <foreignObject
              x={labelX - 55}
              y={labelY - 16}
              width={110}
              height={46}
            >
              <ComponentLabelEditor
                label={component.label}
                value={component.value ?? ""}
                allowsValue={allowsValue}
                onCommit={commitLabel}
                onCancel={() => onCloseEdit?.()}
              />
            </foreignObject>
          )}

          {/* Inline pin name editing overlay */}
          {editingPinId && (() => {
            const pinPositions = getRotatedPinPositions(def.symbol, rotation, mirrored);
            const pinPos = pinPositions.find((p) => p.pinId === editingPinId);
            if (!pinPos) return null;
            return (
              <foreignObject
                x={pinPos.x - 30}
                y={pinPos.y - 10}
                width={60}
                height={20}
              >
                <input
                  autoFocus
                  value={editPinValue}
                  onChange={(e) => setEditPinValue(e.target.value)}
                  onBlur={commitPinName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitPinName();
                    if (e.key === "Escape") setEditingPinId(null);
                  }}
                  className="w-full bg-white dark:bg-neutral-800 border border-[#113768] dark:border-[#5b9bd5] rounded px-1 text-[9px] text-center text-neutral-900 dark:text-neutral-100 outline-none"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </foreignObject>
            );
          })()}
        </>
      )}
    </g>
  );
}
