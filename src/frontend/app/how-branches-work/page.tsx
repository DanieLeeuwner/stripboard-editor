import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import ReadDepth from "@/components/ReadDepth";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "How Branches Work",
  description:
    "Branches in the Stripboard Editor, step by step: try an idea on a copy of your design, keep it up to date with main, merge it back, and follow the original project from a fork.",
  alternates: {
    canonical: "https://stripboard-editor.com/how-branches-work",
    types: { "text/markdown": "https://stripboard-editor.com/how-branches-work.md" },
  },
};

const H2 = ({ id, children }: { id: string; children: ReactNode }) => (
  <h2 id={id} className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--copper)] mb-3 mt-12 first:mt-0 scroll-mt-20">{children}</h2>
);
const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100 mt-7 mb-2">{children}</h3>
);
const P = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">{children}</p>
);
const UL = ({ children }: { children: ReactNode }) => (
  <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300 mb-3 list-disc pl-5">{children}</ul>
);

/** A screenshot in both themes: the one matching the page's theme is shown. */
const Shot = ({ name, alt, caption, narrow }: { name: string; alt: string; caption: ReactNode; narrow?: boolean }) => {
  const img = "rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm dark:shadow-neutral-900/30 w-full";
  return (
    <figure className={`my-5 ${narrow ? "max-w-md mx-auto" : ""}`}>
      <img src={`/branches/${name}.webp`} alt={alt} loading="lazy" className={`${img} dark:hidden`} />
      <img src={`/branches/${name}-dark.webp`} alt={alt} loading="lazy" className={`${img} hidden dark:block`} />
      <figcaption className="text-xs text-neutral-400 dark:text-neutral-500 mt-2 text-center">{caption}</figcaption>
    </figure>
  );
};

const CONTENTS: [string, string][] = [
  ["why", "Why branches"],
  ["start", "Starting a branch"],
  ["switch", "Switching between branches"],
  ["update", "Keeping up with main"],
  ["merge", "Merging back"],
  ["history", "Reading the history"],
  ["fork", "Forks"],
  ["view", "View links"],
  ["details", "Good to know"],
];

export default function HowBranchesWorkPage() {
  return (
    <div className="min-h-screen font-mono bg-[#fafafa] dark:bg-[#121212] bg-[radial-gradient(var(--page-dot)_1px,transparent_1.5px)] [background-size:24px_24px] flex flex-col">
      <SiteHeader breadcrumb="how_branches_work" />
      <ReadDepth page="branches" />

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex-1">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm dark:shadow-neutral-900/30 px-5 sm:px-8 py-7 sm:py-9">
          <h1 className="font-mono text-xl sm:text-2xl font-bold text-[#113768] dark:text-[#5b9bd5] mb-3 tracking-tight">How Branches Work</h1>
          <P>
            A branch is a copy of your design that you can change without touching the version that works. Branches are
            fully optional: if you never start one, your project simply stays on main and works exactly as before.
          </P>
          <P>
            If you know branches from Git or GitHub, the editor implements a simplified version. There are no commits:
            a branch is always just its latest saved state, and merges work with those states directly. If you
            don&apos;t know Git, this page walks through one small project from start to finish.
          </P>

          <nav className="my-6 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40 px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400 mb-2">On this page</p>
            <ol className="text-sm space-y-1 list-decimal list-inside text-neutral-700 dark:text-neutral-300">
              {CONTENTS.map(([id, title]) => (
                <li key={id}><a href={`#${id}`} className="hover:text-[var(--copper)] hover:underline">{title}</a></li>
              ))}
            </ol>
          </nav>

          <H2 id="why">Why branches</H2>
          <P>
            Say your 555 LED blinker works and is laid out on a 13 by 9 board. You wonder whether it would fit on
            something smaller. Squeezing the layout could go wrong, and you would rather not lose the board you have.
          </P>
          <P>
            Without branches you would duplicate the project and end up with two that slowly drift apart. A branch keeps
            the experiment inside the same project: you can switch between the two at any time, carry changes from one to
            the other, and fold the experiment back in when it works out.
          </P>
          <Shot name="main-editor" alt="The 555 LED blinker in the editor, laid out on a 13 by 9 board" caption="The example project: a 555 LED blinker on main, laid out on a 13 by 9 board." />

          <H2 id="start">Starting a branch</H2>
          <P>
            Every project starts with one branch, called <strong>main</strong>. Its name sits next to the project name in
            the toolbar, so you always know which one you are editing. Click it for the branch menu.
          </P>
          <Shot name="chip-menu" alt="The branch menu open below the branch name in the toolbar" caption="The branch menu: every open branch, a new branch from the one you are on, and the full branches window." narrow />
          <P>
            <strong>New branch from main</strong> asks for a name. The new branch starts as an exact copy of main and
            opens right away. From then on the two are saved separately: nothing you do on the branch changes main.
          </P>
          <Shot name="new-branch" alt="The branches window asking for the new branch's name" caption="Naming the new branch. The window on the left already shows the project's history." />
          <P>
            On the new branch, called <em>smaller board</em> here, the board was laid out
            again. It now fits on 12 by 8. Main still has its 13 by 9 board.
          </P>
          <Shot name="branch-editor" alt="The same project on the branch smaller board, laid out on a 12 by 8 board" caption="The branch smaller board, laid out on 12 by 8. The toolbar shows which branch is open." />

          <H2 id="switch">Switching between branches</H2>
          <P>
            Pick another branch in the branch menu to open it. With auto-save on, your changes are saved first. With
            auto-save off, and changes not saved yet, the editor asks:
          </P>
          <Shot name="unsaved-changes" alt="A dialog offering Cancel, Discard and switch, and Save and switch" caption="Unsaved changes: save them to the branch you are leaving, throw them away, or stay." narrow />
          <P>
            The editor reopens the branch you last worked on, and each branch keeps its own board, schematic, notes and
            settings.
          </P>

          <H2 id="update">Keeping up with main</H2>
          <P>
            You may switch back and forth. In this example I switched back to main and made a small edit: the blink was slowed down on main by changing R2 from
            10k to 47k. The branch was started before that, so it still has 10k.
          </P>
          <P>
            After switching back to the &quot;smaller board&quot; branch, a small amber dot appears next to its name, and the branches window shows you what happened:
          </P>
          <Shot name="chip-dot" alt="The branch name in the toolbar with an amber dot" caption="The amber dot: the branch this one started from has changed." narrow />
          <Shot name="parent-changed" alt="The branches window with a note that main has changed" caption="The branches window explains the dot and offers to take the changes in." />
          <P>
            <strong>Update from main</strong> takes main&apos;s changes into the branch. Before anything is changed, a
            review lists what main brings in. The branch keeps everything it did on its own, so its smaller board stays.
          </P>
          <Shot name="update-review" alt="The review listing R2 as changed in the schematic" caption="The review before an update. Main brings in one change: R2." />
          <Shot name="graph-updated" alt="The history graph with an update from main" caption="Afterwards the history shows where the branch took in main's changes." narrow />

          <H2 id="merge">Merging back</H2>
          <P>
            The smaller board works, so it should become the real one. Open the branches window, select the branch and
            click <strong>Merge into main</strong>. Main takes in everything the branch changed.
          </P>
          <H3>When both changed the same thing</H3>
          <P>
            Before merging, R3 was changed on both branches: to 330 on the branch, to 1k on main. The editor cannot know
            which one you want, so it asks. Everything else is combined on its own; only things changed differently on
            both sides need a decision. This is called a merge conflict.
          </P>
          <Shot name="merge-review" alt="The merge review listing the changes and one conflict on R3" caption="The merge review. R3 was changed on both branches, so you pick which value to keep." />
          <H3>When both changed the board</H3>
          <P>
            If both branches moved parts, cuts or wires, the review asks how to bring the boards together. You can keep
            main&apos;s board, take the branch&apos;s, or combine both. Keeping one board is always clean: parts that
            board does not know yet arrive unplaced. Combining takes every move, cut and wire from both, which can leave
            parts overlapping, so the editor outlines any issue afterwards.
          </P>
          <H3>After the merge</H3>
          <P>
            The editor opens main with the merged design. The branch is done: it disappears from the branch menu, cannot
            be edited any more, and stays in the history so you can see where main&apos;s changes came from. To keep
            experimenting, start a new branch from main, which now has everything.
          </P>
          <Shot name="graph-merged" alt="The history graph with the branch merged back into main" caption="The finished branch ends where it was merged into main." narrow />

          <H2 id="history">Reading the history</H2>
          <P>
            <strong>Manage branches</strong> in the branch menu opens the history, newest at the top. Each branch has its
            own coloured line:
          </P>
          <UL>
            <li>A hollow dot is where a branch started. A filled dot is a merge or the last time the branch was saved.</li>
            <li>A curve between two lines is a branch starting from another, or changes moving from one to the other.</li>
            <li><em>Open</em> marks the branch you are editing. Click any row to see that branch and what you can do with it.</li>
          </UL>
          <Shot name="history" alt="The full history of the example project" caption="The whole story: smaller board started from main, took in main's changes, and was merged back." />
          <H3>Deleting a branch</H3>
          <P>
            An idea that did not work out can simply be deleted from the branches window. Unlike a merged branch, a deleted
            one is gone from the history too. Main cannot be deleted, and neither can a branch that other branches
            started from.
          </P>

          <H2 id="fork">Forks</H2>
          <P>
            Anyone with a view link can click <strong>Fork &amp; Edit</strong> to get their own editable copy of a
            project. A fork remembers where it came from: its main follows the original project&apos;s main.
          </P>
          <P>
            When the original changes, the fork gets the same amber dot, and <strong>Update from</strong> the original
            project takes those changes in, with the same review as before. In this example the LED in the original was
            changed from red to green, and the fork took it in.
          </P>
          <Shot name="fork-dialog" alt="The branches window of a fork, offering to update from 555 LED blinker" caption="A fork's main follows the original project and can take in its changes." />
          <P>
            It only works in that direction. A fork cannot change the original, so sharing a view link never lets anyone
            touch your project.
          </P>

          <H2 id="view">View links</H2>
          <P>
            A view link always opens main, the version you would show someone. When a project has more branches, the view
            page has the branch name in its header too, so visitors can look at the other branches and their history
            without being able to change anything.
          </P>
          <Shot name="view-link" alt="The view-only page with the branch name in its header" caption="The view link: main by default, other branches one click away." />

          <H2 id="details">Good to know</H2>
          <UL>
            <li><strong>Export</strong> and <strong>Print</strong> use the branch that is open.</li>
            <li><strong>Duplicate</strong> on the project list copies the whole project, every branch and its history included.</li>
            <li>The project list previews the branch you last worked on.</li>
            <li>
              A merge compares three versions: the two branches as they are now, and the last state they had in common.
              That is how it tells a part you added on one side from a part someone removed on the other.
            </li>
            <li>
              The schematic, the board and the settings are merged item by item. Parts are matched by their identity, cuts
              and board wires by where they sit, so a layout done again on one side does not double the wires.
            </li>
          </UL>
          <P>
            New to the editor itself? The{" "}
            <Link href="/guide" className="text-[var(--copper)] hover:underline font-semibold">quick guide</Link> covers
            everything else.
          </P>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
