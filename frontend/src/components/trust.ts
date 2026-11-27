import { CircleQuestionMark, ShieldCheck, ShieldX, TriangleExclamationPoint, type LucideIcon } from "lucide-react";
import type { TrustLabel } from "../types";
import type { PillTone } from "./ui";

/** The auditor's verdict, as a short word, an icon and a tone. Colour never stands alone. */
export const TRUST: Record<
  TrustLabel,
  { icon: LucideIcon; tone: PillTone; short: string; heading: string; explain: string }
> = {
  real: {
    icon: ShieldCheck,
    tone: "safe",
    short: "Verified in cart",
    heading: "Verified in cart: the auditor checked it",
    explain:
      "Our agent put this item in a real guest cart, and the cart charged exactly what the page advertised. Where possible it was re-checked in a fresh sandbox.",
  },
  questionable: {
    icon: TriangleExclamationPoint,
    tone: "caution",
    short: "Questionable",
    heading: "Questionable: read before you buy",
    explain:
      "Something doesn't add up. For example, the promo wasn't applied in the guest cart (often members-only), the price changed on a re-check, or the 'discount' isn't below the 30-day lowest price.",
  },
  fake: {
    icon: ShieldX,
    tone: "danger",
    short: "Fake",
    heading: "Fake: the cart doesn't match the page",
    explain:
      "The real cart charged more than the page advertised, for example a hidden fee or a price that doesn't hold. It is never ranked.",
  },
  unknown: {
    icon: CircleQuestionMark,
    tone: "neutral",
    short: "Unverified",
    heading: "Unverified: not enough evidence",
    explain: "The agent couldn't read the cart total, so the price isn't cart-verified.",
  },
};
