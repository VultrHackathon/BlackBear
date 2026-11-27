from dataclasses import replace
from unittest import TestCase

from compare_offers import (
    OfferOption,
    PricedOffer,
    RankingPreference,
    ReputationPreference,
    SellerReputation,
    ServiceEvidence,
    compare_offers,
)


class CompareOffersTests(TestCase):
    def setUp(self) -> None:
        self.standard_delivery = OfferOption(
            option_id="store-a-delivery",
            seller_id="store-a",
            fulfillment="delivery",
            item_subtotal_ore=1_414_000,
            fulfillment_fee_ore=10_000,
            price_evidence_id="store-a-cart",
        )
        self.fast_delivery = OfferOption(
            option_id="store-b-delivery",
            seller_id="store-b",
            fulfillment="delivery",
            item_subtotal_ore=1_411_500,
            fulfillment_fee_ore=20_000,
            price_evidence_id="store-b-cart",
            services=(ServiceEvidence("next_day_delivery", "store-b-delivery-date"),),
            reputation=SellerReputation("store-b", 4.6, 650, "store-b-rating"),
        )

    def test_cheapest_confirmed_total_wins_by_default(self) -> None:
        result = compare_offers([self.fast_delivery, self.standard_delivery])

        self.assertEqual(result.by_price, (
            PricedOffer(self.standard_delivery, 1_424_000),
            PricedOffer(self.fast_delivery, 1_431_500),
        ))
        self.assertEqual(result.recommended, result.cheapest)
        self.assertEqual(result.preference_evidence_ids, ())

    def test_pickup_and_delivery_have_separate_prices(self) -> None:
        pickup = replace(
            self.standard_delivery,
            option_id="store-a-pickup",
            fulfillment="pickup",
            fulfillment_fee_ore=0,
            price_evidence_id="store-a-branch",
        )
        options = [self.standard_delivery, pickup]

        self.assertEqual(compare_offers(options).recommended, PricedOffer(pickup, 1_414_000))
        self.assertEqual(compare_offers(options, fulfillment="pickup").by_price, (
            PricedOffer(pickup, 1_414_000),
        ))
        self.assertEqual(compare_offers(options, fulfillment="delivery").by_price, (
            PricedOffer(self.standard_delivery, 1_424_000),
        ))

    def test_unknown_fee_and_missing_price_evidence_stay_provisional(self) -> None:
        unknown_fee = replace(
            self.fast_delivery,
            option_id="unknown-fee",
            item_subtotal_ore=1_200_000,
            fulfillment_fee_ore=None,
        )
        missing_evidence = replace(
            unknown_fee,
            option_id="unknown-evidence",
            fulfillment_fee_ore=0,
            price_evidence_id=None,
        )
        result = compare_offers([unknown_fee, missing_evidence, self.standard_delivery])

        self.assertEqual(result.provisional, (unknown_fee, missing_evidence))
        self.assertEqual(result.recommended, PricedOffer(self.standard_delivery, 1_424_000))
        self.assertIsNone(compare_offers([unknown_fee, missing_evidence]).recommended)

    def test_service_can_win_at_the_premium_limit(self) -> None:
        preference = RankingPreference(max_premium_ore=7_500, service="next_day_delivery")
        options = [self.standard_delivery, self.fast_delivery]

        result = compare_offers(options, preference=preference)
        self.assertEqual(result.cheapest, PricedOffer(self.standard_delivery, 1_424_000))
        self.assertEqual(result.recommended, PricedOffer(self.fast_delivery, 1_431_500))
        self.assertEqual(result.preference_evidence_ids, ("store-b-delivery-date",))

        lower_limit = replace(preference, max_premium_ore=7_499)
        result = compare_offers(options, preference=lower_limit)
        self.assertEqual(result.recommended, result.cheapest)

    def test_service_without_evidence_does_not_change_winner(self) -> None:
        unverified = replace(self.fast_delivery, services=(ServiceEvidence("next_day_delivery", ""),))
        result = compare_offers(
            [self.standard_delivery, unverified],
            preference=RankingPreference(max_premium_ore=10_000, service="next_day_delivery"),
        )

        self.assertEqual(result.recommended, PricedOffer(self.standard_delivery, 1_424_000))
        self.assertEqual(result.preference_evidence_ids, ())

    def test_actual_seller_reputation_can_change_winner(self) -> None:
        result = compare_offers(
            [self.standard_delivery, self.fast_delivery],
            preference=RankingPreference(
                max_premium_ore=10_000,
                reputation=ReputationPreference(minimum_score=4.5, minimum_reviews=100),
            ),
        )

        self.assertEqual(result.recommended, PricedOffer(self.fast_delivery, 1_431_500))
        self.assertEqual(result.preference_evidence_ids, ("store-b-rating",))

    def test_reputation_needs_matching_seller_sufficient_reviews_and_evidence(self) -> None:
        preference = RankingPreference(
            max_premium_ore=10_000,
            reputation=ReputationPreference(minimum_score=4.5, minimum_reviews=100),
        )
        ratings = [
            SellerReputation("marketplace", 4.6, 650, "marketplace-rating"),
            SellerReputation("store-b", 4.6, 99, "store-b-rating"),
            SellerReputation("store-b", 4.4, 650, "store-b-rating"),
            SellerReputation("store-b", 4.6, 650, ""),
            None,
        ]

        for rating in ratings:
            with self.subTest(rating=rating):
                candidate = replace(self.fast_delivery, reputation=rating)
                result = compare_offers([self.standard_delivery, candidate], preference=preference)
                self.assertEqual(result.recommended, PricedOffer(self.standard_delivery, 1_424_000))
                self.assertEqual(result.preference_evidence_ids, ())

    def test_combined_preferences_need_evidence_for_both(self) -> None:
        preference = RankingPreference(
            max_premium_ore=10_000,
            service="next_day_delivery",
            reputation=ReputationPreference(minimum_score=4.5, minimum_reviews=100),
        )
        service_only = replace(self.fast_delivery, reputation=None)

        result = compare_offers([self.standard_delivery, service_only], preference=preference)
        self.assertEqual(result.recommended, PricedOffer(self.standard_delivery, 1_424_000))

        result = compare_offers([self.standard_delivery, self.fast_delivery], preference=preference)
        self.assertEqual(result.recommended, PricedOffer(self.fast_delivery, 1_431_500))
        self.assertEqual(result.preference_evidence_ids, ("store-b-delivery-date", "store-b-rating"))

    def test_premium_cannot_override_budget(self) -> None:
        result = compare_offers(
            [self.standard_delivery, self.fast_delivery],
            budget_ore=1_424_000,
            preference=RankingPreference(max_premium_ore=10_000, service="next_day_delivery"),
        )

        self.assertEqual(result.by_price, (PricedOffer(self.standard_delivery, 1_424_000),))
        self.assertEqual(result.recommended, result.cheapest)
