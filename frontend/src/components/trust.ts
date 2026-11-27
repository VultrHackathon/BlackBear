import { CircleQuestionMark, ShieldCheck, ShieldX, TriangleExclamationPoint, type LucideIcon } from "lucide-react";
import type { TrustLabel } from "../types";
import type { PillTone } from "./ui";

/** The auditor's verdict, as a short word, an icon and a tone. Colour never stands alone. */
export const TRUST: Record<TrustLabel, { icon: LucideIcon; tone: PillTone; short: string; heading: string }> = {
  real: { icon: ShieldCheck, tone: "safe", short: "Real deal", heading: "Real deal: the auditor checked it" },
  questionable: {
    icon: TriangleExclamationPoint,
    tone: "caution",
    short: "Questionable",
    heading: "Questionable: read before you buy",
  },
  fake: { icon: ShieldX, tone: "danger", short: "Fake deal", heading: "Fake deal: the discount doesn't hold up" },
  unknown: {
    icon: CircleQuestionMark,
    tone: "neutral",
    short: "Unverified",
    heading: "Unverified: not enough evidence",
  },
};
