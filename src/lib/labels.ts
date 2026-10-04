import type { EdgeKind } from "./relations";

type G = string | null;
const by = (g: G, f: string, m: string, n: string) => (g === "FEMALE" || g === "TRANSGENDER_FEMALE" ? f : g === "MALE" || g === "TRANSGENDER_MALE" ? m : n);

/**
 * What `relative` is to the person being viewed, e.g. "stepmother".
 * `relativeIsA` says whether the relative sits on the `a` side of a directed edge.
 */
export function relativeLabel(kind: EdgeKind, relativeIsA: boolean, gender: G, step: boolean): string {
  const s = step ? "step" : "";
  switch (kind) {
    case "parent":
      return s + (relativeIsA ? by(gender, "mother", "father", "parent") : by(gender, "daughter", "son", "child"));
    case "grandparent":
      return s + (relativeIsA ? by(gender, "grandmother", "grandfather", "grandparent") : by(gender, "granddaughter", "grandson", "grandchild"));
    case "auncle":
      return relativeIsA ? by(gender, "aunt", "uncle", "aunt/uncle") : by(gender, "niece", "nephew", "niece/nephew");
    case "sibling":
      return s + by(gender, "sister", "brother", "sibling");
    case "spouse":
      return "partner";
    case "cousin":
      return "cousin";
    default:
      return "related";
  }
}

export const KIND_COLOURS: Record<EdgeKind, string> = {
  parent: "var(--edge-parent)",
  grandparent: "var(--edge-parent)",
  auncle: "var(--edge-auncle)",
  sibling: "var(--edge-sibling)",
  spouse: "var(--edge-spouse)",
  cousin: "var(--edge-auncle)",
  family: "var(--edge-family)",
};
