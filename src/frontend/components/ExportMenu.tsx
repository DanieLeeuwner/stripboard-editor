"use client";

import { useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { track } from "@/lib/track";
import { toKicadNetlist, collectGeneratedFootprints, FOOTPRINT_LIB_NICKNAME } from "@/lib/netlistExport";
import { createZip } from "@/lib/zip";
import { Dropdown, DropdownItem } from "./ToolbarDropdown";

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** The Export menu of the editor and the view page: both export the project
 *  that is loaded in the store. */
export default function ExportMenu({ source }: { source: "edit" | "view" }) {
  // Number of generated footprints shipped with the last netlist export, or null.
  const [footprintNotice, setFootprintNotice] = useState<number | null>(null);

  const handleExport = () => {
    const data = useProjectStore.getState().exportProject();
    const json = JSON.stringify(data, null, 2);
    downloadBlob(new Blob([json], { type: "application/json" }), `${data.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
    track("export-project", { source });
  };

  const handleExportNetlist = () => {
    const s = useProjectStore.getState();
    const base = s.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const netlist = toKicadNetlist({
      name: s.name,
      components: s.components,
      componentDefs: s.componentDefs,
      nets: s.nets,
      netAssignments: s.netAssignments,
      date: new Date().toISOString(),
    });
    downloadBlob(new Blob([netlist], { type: "text/plain" }), `${base}.net`);
    track("export-net", { source });

    // Parts with no stock KiCad footprint (e.g. custom parts with non-numeric
    // pin ids) reference a generated footprint library; ship it alongside.
    const footprints = collectGeneratedFootprints(s.components, s.componentDefs);
    if (footprints.length > 0) {
      const zip = createZip(
        footprints.map((f) => ({ name: `${FOOTPRINT_LIB_NICKNAME}.pretty/${f.name}`, content: f.content }))
      );
      downloadBlob(zip, `${FOOTPRINT_LIB_NICKNAME}.pretty.zip`);
      setFootprintNotice(footprints.length);
    }
  };

  return (
    <>
      <Dropdown label="Export">
        <DropdownItem onClick={handleExport}>Raw project (.json)</DropdownItem>
        <DropdownItem onClick={handleExportNetlist}>Netlist (.net)</DropdownItem>
      </Dropdown>

      {/* Netlist export shipped a generated footprint library */}
      {footprintNotice !== null && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 font-sans"
          onClick={() => setFootprintNotice(null)}
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl dark:shadow-neutral-900/50 p-6 w-[30rem] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Footprint library included
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {footprintNotice} part{footprintNotice === 1 ? "" : "s"} in this design{" "}
              {footprintNotice === 1 ? "has" : "have"} no standard KiCad footprint, so{" "}
              <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-800 rounded px-1 py-0.5">
                {FOOTPRINT_LIB_NICKNAME}.pretty.zip
              </code>{" "}
              was downloaded alongside the netlist.
            </p>
            <ol className="text-sm text-neutral-600 dark:text-neutral-400 mb-5 space-y-1.5 list-decimal list-outside pl-5">
              <li>
                Unzip it to get the{" "}
                <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-800 rounded px-1 py-0.5">
                  {FOOTPRINT_LIB_NICKNAME}.pretty
                </code>{" "}
                folder.
              </li>
              <li>
                In KiCad, open{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  Preferences → Manage Footprint Libraries
                </span>
                .
              </li>
              <li>
                Add that folder with the nickname{" "}
                <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-800 rounded px-1 py-0.5">
                  {FOOTPRINT_LIB_NICKNAME}
                </code>
                .
              </li>
            </ol>
            <div className="flex justify-end">
              <button
                onClick={() => setFootprintNotice(null)}
                className="px-4 py-2 text-sm rounded bg-[#113768] text-white font-medium hover:bg-[#0d2a50] transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
