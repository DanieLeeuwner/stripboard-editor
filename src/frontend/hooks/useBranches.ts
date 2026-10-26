"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError, activateBranch, commitMerge, createBranch, deleteBranch, getMergePrep, getProject, renameBranch, saveProject,
  type ProjectDetail, type ProjectHistory, type SaveResult,
} from "@/lib/api";
import { ask, tell } from "@/lib/dialog";
import { track } from "@/lib/track";
import { settleProject, useProjectStore } from "@/store/useProjectStore";
import { mergeProjects } from "@/components/branches/merge";
import type { BranchControls } from "@/components/branches/BranchDialog";
import type { Project } from "@/types";

/**
 * The branches of the stored project being edited: which one is open (saves
 * go to it) and the history, plus the actions behind the branch chip and
 * dialog. Shared by the editor of a stored project and the new-project page,
 * which gets its branches with its first save. Saving goes through the
 * store's saveNow, which both pages register for a stored project.
 */
export function useBranches(editUuid: string | null) {
  const loadProject = useProjectStore((s) => s.loadProject);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setStoreBranch = useProjectStore((s) => s.setBranchId);
  const branchRef = useRef<string | null>(null);
  // Set by the page's save while it runs: branch actions wait for it
  const savingRef = useRef(false);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [history, setHistory] = useState<ProjectHistory | null>(null);
  const [upstream, setUpstream] = useState<ProjectDetail["upstream"]>(null);

  /** Takes over the branches from a server response; `load` also puts that
   *  branch's design into the editor. */
  const adopt = useCallback((project: ProjectDetail, load = true) => {
    if (load) {
      loadProject(project.data as unknown as Project);
      setProjectName(project.name);
    }
    setHistory({ branches: project.branches, merges: project.merges });
    setUpstream(project.upstream);
    branchRef.current = project.branch;
    setBranchId(project.branch);
    setStoreBranch(project.branch);
  }, [loadProject, setProjectName, setStoreBranch]);

  /** A save's response carries the history as it is now. */
  const noteSaved = useCallback((saved: SaveResult) => {
    if (saved.branch === branchRef.current) setHistory({ branches: saved.branches, merges: saved.merges });
  }, []);

  /**
   * A save refused because the open branch was merged or deleted elsewhere
   * (another tab or window): the edits can still be kept, on a new branch
   * started from main, or dropped by opening main. True when the error was
   * that case and has been dealt with; the edits are then saved or dropped.
   */
  const rescuingRef = useRef(false);
  const rescue = useCallback(async (error: unknown): Promise<boolean> => {
    if (!editUuid || !(error instanceof ApiError)) return false;
    if (error.code !== "branch_closed" && error.code !== "branch_missing") return false;
    // Autosave may fail again while the question is open: one question is enough
    if (rescuingRef.current) return true;
    rescuingRef.current = true;
    try {
      const lost = history?.branches.find((b) => b.id === branchRef.current)?.name ?? "This branch";
      const answer = await ask({
        title: `"${lost}" was merged or deleted`,
        message: "That happened in another tab or window, so your latest changes could not be saved to it. Keep them on a new branch started from main, or discard them and open main.",
        // Closing the question must not lose work
        cancel: "keep",
        actions: [
          { label: "Discard and open main", value: "discard", style: "danger" },
          { label: "Save as a new branch", value: "keep", style: "primary" },
        ],
      });
      const main = await getProject(editUuid);
      track("branch-rescue", { answer, reason: error.code });
      if (answer === "discard") {
        useProjectStore.getState().markClean();
        adopt(main);
        return true;
      }
      const taken = new Set(main.branches.map((b) => b.name.toLowerCase()));
      let name = `${lost} (unsaved edits)`;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${lost} (unsaved edits ${n})`;
      const created = await createBranch(editUuid, name, main.branch);
      const store = useProjectStore.getState();
      const seq = store._editSeq;
      const data = store.exportProject();
      const saved = await saveProject(editUuid, data.name, data as unknown as Record<string, unknown>, created.branch);
      // The editor already shows these edits: only the branch changes under them
      adopt(created, false);
      noteSaved(saved);
      if (useProjectStore.getState()._editSeq === seq) useProjectStore.getState().markClean();
      return true;
    } finally {
      rescuingRef.current = false;
    }
  }, [editUuid, history, adopt, noteSaved]);

  // Another page must not think a branch of this project is open
  useEffect(() => () => setStoreBranch(null), [setStoreBranch]);

  const controls = ((): BranchControls | null => {
    if (!editUuid || !history || !branchId) return null;
    const save = async () => (await useProjectStore.getState().saveNow?.()) ?? false;

    const waitForSaves = async () => {
      while (savingRef.current) await new Promise((r) => setTimeout(r, 50));
    };

    /** Before another branch is loaded: unsaved changes are saved, or with
     *  auto-save off the user picks saving or discarding them. False when the
     *  user would rather stay. */
    const leaveBranch = async (): Promise<boolean> => {
      await waitForSaves();
      const store = useProjectStore.getState();
      if (store.isDirty) {
        const name = history.branches.find((b) => b.id === branchRef.current)?.name ?? "this branch";
        const answer = store.autoSave ? "save" : await ask({
          title: `Unsaved changes on "${name}"`,
          message: "Save them to this branch before switching, or discard them.",
          cancel: "cancel",
          actions: [
            { label: "Cancel", value: "cancel" },
            { label: "Discard and switch", value: "discard", style: "danger" },
            { label: "Save and switch", value: "save", style: "primary" },
          ],
        });
        if (answer === "cancel") return false;
        if (answer === "discard") {
          store.markClean();
          track("branch-discard");
        } else if (!(await save())) {
          throw new Error(`Couldn't save "${name}"`);
        }
      }
      await waitForSaves();
      return true;
    };

    return {
      history,
      current: branchId,
      upstreamName: upstream?.name ?? null,
      upstreamBranch: upstream?.branch ?? null,
      onOpen: async (id) => {
        if (!(await leaveBranch())) return;
        adopt(await getProject(editUuid, id));
        void activateBranch(editUuid, id);
        track("branch-switch", { source: "edit" });
      },
      onCreate: async (name, from) => {
        if (!(await leaveBranch())) return;
        const created = await createBranch(editUuid, name, from);
        adopt(created);
        track("branch-create", {
          from: from === branchRef.current ? "open" : "other",
          // Open branches the project has now, main included
          branches: created.branches.filter((b) => !b.closed_at).length,
        });
      },
      onPrepareMerge: async (target, source) => {
        // The merge starts from what is saved on both branches
        if (!(await leaveBranch())) return null;
        const prep = await getMergePrep(editUuid, target, source);
        const fromOriginal = source === upstream?.branch;
        const names = { target: prep.target.name, source: fromOriginal ? upstream!.name : prep.source.name };
        const base = prep.base as unknown as Project;
        const targetData = prep.target.data as unknown as Project;
        const sourceData = prep.source.data as unknown as Project;
        const eventKind = fromOriginal ? "from-original" : prep.kind;
        const first = mergeProjects(base, targetData, sourceData, {}, names);
        track("branch-merge-review", {
          kind: eventKind,
          conflicts: first.conflicts.length,
          board: first.boardChangedOnBoth ? "both" : "one-side",
          changes: first.changes.length,
        });
        return {
          kind: prep.kind,
          eventKind,
          targetName: names.target,
          sourceName: names.source,
          preview: (choices) => mergeProjects(base, targetData, sourceData, choices, names),
          commit: async (choices) => {
            const outcome = mergeProjects(base, targetData, sourceData, choices, names);
            const data = settleProject(outcome.data);
            adopt(await commitMerge(editUuid, prep, data as unknown as Record<string, unknown>));
            const kept = outcome.conflicts.map((c) => choices.items?.[c.id] ?? "target");
            track("branch-merge", {
              kind: eventKind,
              conflicts: outcome.conflicts.length,
              // How the conflicts were decided: the branch merged into, or the one merged in
              keptTarget: kept.filter((s) => s === "target").length,
              tookSource: kept.filter((s) => s === "source").length,
              board: outcome.boardChangedOnBoth ? choices.board ?? "combine" : "one-side",
            });
            if (outcome.boardChangedOnBoth && choices.board === "combine") {
              void tell(
                "Check the board",
                `Both boards were combined on "${names.target}". Overlapping parts are outlined, and the board status shows nets that are not finished.`,
              );
            }
          },
        };
      },
      onRename: async (id, name) => {
        setHistory(await renameBranch(editUuid, id, name));
        track("branch-rename");
      },
      onDelete: async (id) => {
        await waitForSaves();
        await deleteBranch(editUuid, id);
        track("branch-delete", { open: id === branchRef.current ? "yes" : "no" });
        if (id === branchRef.current) {
          // Its unsaved changes go with it; the server falls back to main
          useProjectStore.getState().markClean();
          adopt(await getProject(editUuid, "active"));
        } else {
          setHistory((h) => h && { ...h, branches: h.branches.filter((b) => b.id !== id) });
        }
      },
    };
  })();

  return { branchRef, savingRef, adopt, noteSaved, rescue, controls };
}
