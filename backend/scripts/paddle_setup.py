"""Create or reuse Sipp's Paddle catalog and webhook configuration."""

from __future__ import annotations

import argparse
import json
import os
from urllib.parse import urlparse

import httpx


EVENTS = [
    "subscription.created",
    "subscription.updated",
    "subscription.activated",
    "subscription.trialing",
    "subscription.past_due",
    "subscription.paused",
    "subscription.resumed",
    "subscription.canceled",
    "transaction.completed",
    "transaction.paid",
    "transaction.payment_failed",
    "transaction.past_due",
    "adjustment.created",
    "adjustment.updated",
]
API_VERSION = 1

PLANS = {
    "basic": {
        "name": "Sipp Essentiel",
        "prices": {
            "month": ("599", "Essentiel mensuel"),
            "year": ("5990", "Essentiel annuel"),
        },
    },
    "plus": {
        "name": "Sipp Plus",
        "prices": {
            "month": ("1299", "Plus mensuel"),
            "year": ("12990", "Plus annuel"),
        },
    },
}


class SetupError(RuntimeError):
    pass


class PaddleAPI:
    def __init__(self, api_key: str, environment: str, dry_run: bool):
        self.dry_run = dry_run
        base_url = (
            "https://api.paddle.com"
            if environment == "production"
            else "https://sandbox-api.paddle.com"
        )
        self.http = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0,
        )

    def close(self) -> None:
        self.http.close()

    def call(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        body: dict | None = None,
    ) -> dict:
        if self.dry_run and method != "GET":
            raise AssertionError("--dry-run ne doit exécuter que des GET")
        try:
            response = self.http.request(method, path, params=params, json=body)
        except httpx.HTTPError as exc:
            raise SetupError(f"{method} {path}: {type(exc).__name__}") from exc
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if response.is_error:
            detail = payload.get("error") or payload.get("errors") or payload
            raise SetupError(
                f"{method} {path}: HTTP {response.status_code}: "
                f"{json.dumps(detail, ensure_ascii=False)[:800]}"
            )
        return payload

    def list_all(self, path: str, params: dict | None = None) -> list[dict]:
        query = {"per_page": 200, **(params or {})}
        items: list[dict] = []
        while True:
            page = self.call("GET", path, params=query)
            data = page.get("data") or []
            items.extend(data)
            pagination = (page.get("meta") or {}).get("pagination") or {}
            if not pagination.get("has_more"):
                return items
            if not data:
                raise SetupError(f"Pagination Paddle sans progression pour {path}")
            query["after"] = data[-1]["id"]


def marker(entity: dict) -> str | None:
    return (entity.get("custom_data") or {}).get("sipp_setup_key")


def unique(items: list[dict], description: str) -> dict | None:
    if len(items) > 1:
        ids = ", ".join(item.get("id", "?") for item in items)
        raise SetupError(f"Plusieurs entités correspondent à {description}: {ids}")
    return items[0] if items else None


def tag_entity(api: PaddleAPI, entity: dict, key: str, label: str, actions: list[str]) -> None:
    data = dict(entity.get("custom_data") or {})
    current = data.get("sipp_setup_key")
    if current and current != key:
        raise SetupError(f"{label} porte déjà une autre clé sipp_setup_key: {current}")
    if current == key:
        return
    data["sipp_setup_key"] = key
    if api.dry_run:
        actions.append(f"Marqueur à ajouter à {label} ({entity['id']})")
    else:
        path = f"/{'products' if entity['id'].startswith('pro_') else 'prices'}/{entity['id']}"
        api.call("PATCH", path, body={"custom_data": data})
        actions.append(f"Marqueur ajouté à {label} ({entity['id']})")


def ensure_product(
    api: PaddleAPI, product_list: list[dict], plan_key: str, plan: dict, actions: list[str]
) -> dict | None:
    key = f"product:{plan_key}"
    by_marker = [item for item in product_list if marker(item) == key]
    product = unique(by_marker, key)
    if product is None:
        product = unique(
            [item for item in product_list if item.get("name") == plan["name"]],
            f"le nom {plan['name']!r}",
        )
    if product:
        if product.get("status") == "archived":
            raise SetupError(f"Produit archivé {product['id']} ({plan['name']}); réactivez-le dans Paddle.")
        if product.get("name") != plan["name"] or product.get("tax_category") != "saas":
            raise SetupError(
                f"Produit existant {product['id']} incompatible: nom={product.get('name')!r}, "
                f"tax_category={product.get('tax_category')!r}; attendu {plan['name']!r}/saas."
            )
        tag_entity(api, product, key, plan["name"], actions)
        actions.append(f"Produit réutilisé: {plan['name']} ({product['id']})")
        return product

    body = {
        "name": plan["name"],
        "description": f"Abonnement {plan['name']} à Sipp.",
        "tax_category": "saas",
        "custom_data": {"sipp_setup_key": key},
    }
    if api.dry_run:
        actions.append(f"Produit à créer: {plan['name']} (tax_category=saas)")
        return None
    product = (api.call("POST", "/products", body=body).get("data") or {})
    actions.append(f"Produit créé: {plan['name']} ({product['id']})")
    return product


def price_matches(price: dict, product_id: str, amount: str, interval: str) -> bool:
    cycle = price.get("billing_cycle") or {}
    unit_price = price.get("unit_price") or {}
    return (
        price.get("product_id") == product_id
        and cycle.get("interval") == interval
        and cycle.get("frequency") == 1
        and str(unit_price.get("amount")) == amount
        and unit_price.get("currency_code") == "EUR"
        and price.get("tax_mode") == "internal"
        and price.get("trial_period") is None
        and price.get("status") == "active"
    )


def ensure_price(
    api: PaddleAPI,
    price_list: list[dict],
    product: dict | None,
    plan_key: str,
    interval: str,
    amount: str,
    name: str,
    actions: list[str],
) -> dict | None:
    key = f"{plan_key}:{interval}"
    label = f"{PLANS[plan_key]['name']} {interval}"
    if product is None:
        actions.append(f"Prix à créer: {label}, {amount} EUR TTC")
        return None

    product_id = product["id"]
    tagged = unique([item for item in price_list if marker(item) == key], key)
    named = unique(
        [item for item in price_list if item.get("product_id") == product_id and item.get("name") == name],
        f"le prix {name!r}",
    )
    price = tagged or named
    if price is None:
        matching = [
            item
            for item in price_list
            if price_matches(item, product_id, amount, interval)
        ]
        price = unique(matching, f"la signature tarifaire {label}")

    if price:
        if not price_matches(price, product_id, amount, interval):
            raise SetupError(
                f"Prix existant {price['id']} incompatible avec {label}: vérifiez montant, fréquence, "
                "devise, tax_mode=internal et absence d'essai."
            )
        tag_entity(api, price, key, label, actions)
        actions.append(f"Prix réutilisé: {label} ({price['id']})")
        return price

    body = {
        "product_id": product_id,
        "name": name,
        "description": f"Sipp {PLANS[plan_key]['name'].removeprefix('Sipp ')} — {interval}, EUR TTC",
        "unit_price": {"amount": amount, "currency_code": "EUR"},
        "billing_cycle": {"interval": interval, "frequency": 1},
        "tax_mode": "internal",
        "custom_data": {"sipp_setup_key": key},
    }
    if api.dry_run:
        actions.append(f"Prix à créer: {label}, {amount} EUR TTC, sans essai")
        return None
    price = (api.call("POST", "/prices", body=body).get("data") or {})
    actions.append(f"Prix créé: {label} ({price['id']})")
    return price


def ensure_client_token(api: PaddleAPI, environment: str, actions: list[str]) -> str | None:
    name = f"Sipp web ({environment})"
    manual_token = os.environ.get("PADDLE_CLIENT_TOKEN", "").strip()
    expected_prefix = "live_" if environment == "production" else "test_"
    if manual_token and not manual_token.startswith(expected_prefix):
        actions.append(f"PADDLE_CLIENT_TOKEN ignoré: préfixe attendu {expected_prefix}")
        manual_token = ""
    try:
        tokens = api.list_all("/client-tokens", {"status": "active"})
    except SetupError as exc:
        actions.append(f"Token client manuel utilisé ou à créer (lecture API indisponible: {exc})")
        return manual_token or None
    token = unique([item for item in tokens if item.get("name") == name], name)
    if token:
        actions.append(f"Token client réutilisé: {name}")
        return token.get("token")
    if api.dry_run:
        actions.append(f"Token client à créer: {name}")
        return None
    try:
        token = api.call(
            "POST",
            "/client-tokens",
            body={"name": name, "description": "Paddle.js pour le web Sipp."},
        ).get("data") or {}
    except SetupError as exc:
        actions.append(f"Token client manuel utilisé ou à créer (écriture API indisponible: {exc})")
        return manual_token or None
    actions.append(f"Token client créé: {name}")
    return token.get("token")


def ensure_webhook(
    api: PaddleAPI, webhook_url: str, actions: list[str]
) -> tuple[str | None, bool]:
    settings = api.list_all("/notification-settings")
    matches = [
        item for item in settings
        if item.get("type") == "url" and item.get("destination", "").rstrip("/") == webhook_url.rstrip("/")
    ]
    setting = unique(matches, webhook_url)
    if setting is None:
        if api.dry_run:
            actions.append(f"Destination webhook à créer: {webhook_url}")
            return None, False
        setting = api.call(
            "POST",
            "/notification-settings",
            body={
                "description": "Sipp Paddle webhook",
                "type": "url",
                "destination": webhook_url,
                "api_version": API_VERSION,
                "traffic_source": "all",
                "subscribed_events": EVENTS,
            },
        ).get("data") or {}
        actions.append(f"Destination webhook créée: {setting['id']}")
    else:
        detail = api.call("GET", f"/notification-settings/{setting['id']}").get("data") or {}
        current_events = sorted(event.get("name", "") for event in detail.get("subscribed_events", []))
        needs_update = (
            not detail.get("active")
            or detail.get("api_version") != API_VERSION
            or detail.get("traffic_source") != "all"
            or current_events != sorted(EVENTS)
        )
        if needs_update:
            if api.dry_run:
                actions.append(f"Destination webhook à mettre à jour: {setting['id']}")
            else:
                api.call(
                    "PATCH",
                    f"/notification-settings/{setting['id']}",
                    body={
                        "active": True,
                        "destination": webhook_url,
                        "api_version": API_VERSION,
                        "description": "Sipp Paddle webhook",
                        "traffic_source": "all",
                        "subscribed_events": EVENTS,
                    },
                )
                actions.append(f"Destination webhook mise à jour: {setting['id']}")
        else:
            actions.append(f"Destination webhook réutilisée: {setting['id']}")

    if api.dry_run and setting.get("endpoint_secret_key"):
        return setting["endpoint_secret_key"], True
    detail = api.call("GET", f"/notification-settings/{setting['id']}").get("data") or {}
    return detail.get("endpoint_secret_key"), True


def railway_command(service: str, variables: dict[str, str]) -> str:
    assignments = " ".join(
        f'--set "{name}={value}"' for name, value in variables.items()
    )
    return f"railway variables --service {service} {assignments}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", required=True, help="Origine de l'API Sipp; /billing/webhook/paddle sera ajouté")
    parser.add_argument("--dry-run", action="store_true", help="N'effectue que des GET Paddle")
    args = parser.parse_args()

    api_key = os.environ.get("PADDLE_API_KEY", "").strip()
    environment = os.environ.get("PADDLE_ENV", "").strip().lower()
    if not api_key:
        parser.error("définir PADDLE_API_KEY dans l'environnement")
    if environment not in {"sandbox", "production"}:
        parser.error("PADDLE_ENV doit valoir sandbox ou production")
    parsed_url = urlparse(args.api_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc or parsed_url.query or parsed_url.fragment:
        parser.error("--api-url doit être une URL http(s) d'origine, sans query ni fragment")

    webhook_url = f"{args.api_url.rstrip('/')}/billing/webhook/paddle"
    api = PaddleAPI(api_key, environment, args.dry_run)
    actions: list[str] = []
    try:
        products = api.list_all("/products", {"status": "active,archived"})
        prices: dict[str, list[dict]] = {}
        output: dict[str, str] = {"PADDLE_ENV": environment, "PADDLE_API_KEY": api_key}
        for plan_key, plan in PLANS.items():
            product = ensure_product(api, products, plan_key, plan, actions)
            if product:
                prices[product["id"]] = api.list_all(
                    "/prices", {"product_id": product["id"], "status": "active"}
                )
            for interval, (amount, name) in plan["prices"].items():
                price = ensure_price(
                    api,
                    prices.get(product["id"], []) if product else [],
                    product,
                    plan_key,
                    interval,
                    amount,
                    name,
                    actions,
                )
                if price:
                    suffix = "MONTH" if interval == "month" else "YEAR"
                    prefix = "BASIC" if plan_key == "basic" else "PLUS"
                    output[f"PADDLE_PRICE_{prefix}_{suffix}"] = price["id"]

        client_token = ensure_client_token(api, environment, actions)
        if client_token:
            output["PADDLE_CLIENT_TOKEN"] = client_token
        webhook_secret, _ = ensure_webhook(api, webhook_url, actions)
        if webhook_secret:
            output["PADDLE_WEBHOOK_SECRET"] = webhook_secret
    finally:
        api.close()

    print(f"Paddle {environment}" + (" — dry-run GET seulement" if args.dry_run else ""))
    for action in actions:
        print(f"- {action}")

    required = {
        "PADDLE_ENV",
        "PADDLE_API_KEY",
        "PADDLE_WEBHOOK_SECRET",
        "PADDLE_CLIENT_TOKEN",
        "PADDLE_PRICE_BASIC_MONTH",
        "PADDLE_PRICE_BASIC_YEAR",
        "PADDLE_PRICE_PLUS_MONTH",
        "PADDLE_PRICE_PLUS_YEAR",
    }
    print("\nVariables Railway à coller (secrets affichés uniquement dans cette sortie):")
    for name in sorted(required):
        value = output.get(name)
        print(f"{name}={value if value else '<à créer ou récupérer manuellement>'}")

    if required.issubset(output):
        print("\nCommandes Railway (PowerShell/bash):")
        for service in ("sipp-app", "sipp-worker"):
            print(railway_command(service, output))
    else:
        print("\nCommandes Railway non émises: terminez les créations manuelles puis relancez le script.")

    print(
        "\nÀ régler dans le dashboard: compte Paddle, default payment link et, en production, "
        "approbation du domaine et validation du compte. PUBLIC_APP_URL reste une variable Railway à définir."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SetupError as exc:
        raise SystemExit(f"Erreur Paddle: {exc}") from exc
