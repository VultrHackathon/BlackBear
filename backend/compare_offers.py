from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from deal_math import delivered_total_ore

Fulfillment = Literal["delivery", "pickup"]


@dataclass(frozen=True)
class ServiceEvidence:
    service: str
    evidence_id: str


@dataclass(frozen=True)
class SellerReputation:
    seller_id: str
    trust_score: float
    review_count: int
    evidence_id: str


@dataclass(frozen=True)
class OfferOption:
    """One fulfillment option for an available offer that matches the request.

    The scout handoff supplies the subtotal for the requested quantity using
    promotions the shopper qualifies for. The fee includes remaining mandatory
    charges for this option. Use None when any required charge is unknown.
    """

    option_id: str
    seller_id: str
    fulfillment: Fulfillment
    item_subtotal_ore: int
    fulfillment_fee_ore: int | None
    price_evidence_id: str | None = None
    services: tuple[ServiceEvidence, ...] = ()
    reputation: SellerReputation | None = None


@dataclass(frozen=True)
class ReputationPreference:
    minimum_score: float
    minimum_reviews: int

    def __post_init__(self) -> None:
        if not 1 <= self.minimum_score <= 5 or self.minimum_reviews < 1:
            raise ValueError("Use a TrustScore from 1 to 5 and a positive review count.")


@dataclass(frozen=True)
class RankingPreference:
    """Allow a premium over the cheapest option when all chosen preferences qualify."""

    max_premium_ore: int = 0
    service: str | None = None
    reputation: ReputationPreference | None = None

    def evidence_for(self, option: OfferOption) -> tuple[str, ...]:
        evidence = []
        if self.service is not None:
            service = next(
                (
                    proof for proof in option.services
                    if proof.service == self.service and proof.evidence_id
                ),
                None,
            )
            if service is None:
                return ()
            evidence.append(service.evidence_id)

        if self.reputation is not None:
            rating = option.reputation
            if (
                rating is None
                or rating.seller_id != option.seller_id
                or not rating.evidence_id
                or not self.reputation.minimum_score <= rating.trust_score <= 5
                or rating.review_count < self.reputation.minimum_reviews
            ):
                return ()
            evidence.append(rating.evidence_id)

        return tuple(evidence)


@dataclass(frozen=True)
class PricedOffer:
    option: OfferOption
    total_ore: int


@dataclass(frozen=True)
class ComparisonResult:
    by_price: tuple[PricedOffer, ...]
    recommended: PricedOffer | None
    provisional: tuple[OfferOption, ...]
    preference_evidence_ids: tuple[str, ...]

    @property
    def cheapest(self) -> PricedOffer | None:
        return self.by_price[0] if self.by_price else None


def compare_offers(
    options: Iterable[OfferOption],
    *,
    fulfillment: Fulfillment | None = None,
    budget_ore: int | None = None,
    preference: RankingPreference = RankingPreference(),
) -> ComparisonResult:
    """Compare matching, available options by merchant total and verified preferences."""
    if budget_ore is not None and budget_ore < 0:
        raise ValueError("Budget must be non-negative.")
    if preference.max_premium_ore < 0:
        raise ValueError("Maximum premium must be non-negative.")

    priced = []
    provisional = []
    for option in options:
        if fulfillment is not None and option.fulfillment != fulfillment:
            continue
        total = delivered_total_ore(option.item_subtotal_ore, option.fulfillment_fee_ore)
        if total is None or not option.price_evidence_id:
            provisional.append(option)
        elif budget_ore is None or total <= budget_ore:
            priced.append(PricedOffer(option, total))

    by_price = tuple(sorted(priced, key=lambda offer: (offer.total_ore, offer.option.option_id)))
    if not by_price:
        return ComparisonResult(by_price, None, tuple(provisional), ())

    cheapest = by_price[0]
    price_limit = cheapest.total_ore + preference.max_premium_ore
    for offer in by_price:
        if offer.total_ore > price_limit:
            break
        evidence_ids = preference.evidence_for(offer.option)
        if evidence_ids:
            return ComparisonResult(by_price, offer, tuple(provisional), evidence_ids)

    return ComparisonResult(by_price, cheapest, tuple(provisional), ())
