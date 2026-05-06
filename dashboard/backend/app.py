from datetime import datetime, timedelta, timezone
import json
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOKI_URL = os.getenv("LOKI_URL", "http://localhost:3100")
DEFAULT_SINCE = "1h"
MAX_LIMIT = 1000
KNOWN_SERVICES = ["auth-service", "order-service", "payment-service"]
HEALTH_TIMEOUT = float(os.getenv("HEALTH_TIMEOUT", "2.5"))
SERVICE_HEALTH_URLS = {
    "auth-service": os.getenv("AUTH_SERVICE_URL", "http://localhost:5001/health"),
    "order-service": os.getenv("ORDER_SERVICE_URL", "http://localhost:5002/health"),
    "payment-service": os.getenv("PAYMENT_SERVICE_URL", "http://localhost:5003/health"),
}


def _escape_logql(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _parse_since(value: str) -> timedelta:
    if not value:
        return timedelta(hours=1)

    unit = value[-1].lower()
    amount = value[:-1]
    try:
        number = int(amount)
    except ValueError:
        return timedelta(hours=1)

    if unit == "s":
        return timedelta(seconds=number)
    if unit == "m":
        return timedelta(minutes=number)
    if unit == "h":
        return timedelta(hours=number)
    if unit == "d":
        return timedelta(days=number)

    return timedelta(hours=1)


def _normalize_filter(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if value.lower() == "all":
        return None
    return value


def _ns_to_iso(ns_value: str) -> str:
    try:
        seconds = int(ns_value) / 1_000_000_000
    except ValueError:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()


def _build_logql(
) -> str:
    return '{job="container_logs"}'


LOGFMT_PATTERN = re.compile(r'(?P<key>[\w.-]+)=(?P<value>"(?:\\.|[^"])*"|[^\s]+)')


def _parse_logfmt(line: str) -> Dict[str, str]:
    fields: Dict[str, str] = {}
    for match in LOGFMT_PATTERN.finditer(line):
        key = match.group("key")
        value = match.group("value")
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1].replace('\\"', '"')
        fields[key] = value
    return fields


def _categorize_entry(
    entry: Dict[str, Any],
    fields: Dict[str, Any],
    labels: Dict[str, str],
) -> str:
    service = entry.get("service")
    if service in KNOWN_SERVICES:
        return "service"

    component = entry.get("component") or fields.get("component")
    if component or entry.get("caller") or fields.get("caller"):
        return "system"

    container = labels.get("container") or labels.get("container_name")
    if container in ("loki", "promtail"):
        return "system"

    return "unknown"


def _apply_filters(
    entries: List[Dict[str, Any]],
    service: Optional[str],
    level: Optional[str],
    search: Optional[str],
    category: Optional[str],
) -> List[Dict[str, Any]]:
    filtered: List[Dict[str, Any]] = []
    search_term = search.lower() if search else None
    level_term = level.upper() if level else None

    for entry in entries:
        entry_service = entry.get("service") or entry.get("source")
        entry_level = entry.get("level")
        entry_category = entry.get("category")
        message = entry.get("message") or entry.get("raw") or ""

        if category and entry_category != category:
            continue
        if service and entry_service != service:
            continue
        if level_term and (entry_level or "").upper() != level_term:
            continue
        if search_term and search_term not in message.lower():
            continue

        filtered.append(entry)

    return filtered


def _fetch_loki(query: str, start: datetime, end: datetime, limit: int) -> Dict[str, Any]:
    params = {
        "query": query,
        "start": str(int(start.timestamp() * 1_000_000_000)),
        "end": str(int(end.timestamp() * 1_000_000_000)),
        "limit": limit,
        "direction": "BACKWARD",
    }
    response = requests.get(f"{LOKI_URL}/loki/api/v1/query_range", params=params, timeout=10)
    response.raise_for_status()
    return response.json()


def _parse_entries(result: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for stream in result:
        labels = stream.get("stream", {}) or {}
        for ts, line in stream.get("values", []):
            entry: Dict[str, Any] = {
                "timestamp": _ns_to_iso(ts),
                "raw": line,
            }
            if labels:
                entry["labels"] = labels

            fields: Dict[str, Any] = {}
            try:
                payload = json.loads(line)
                if isinstance(payload, dict):
                    docker_stream = payload.get("stream")
                    if docker_stream:
                        entry["stream"] = docker_stream

                    raw_log = payload.get("log") if isinstance(payload.get("log"), str) else None
                    if raw_log:
                        raw_log = raw_log.strip()
                        try:
                            nested = json.loads(raw_log)
                        except json.JSONDecodeError:
                            fields = _parse_logfmt(raw_log)
                            entry["message"] = (
                                fields.get("msg")
                                or fields.get("message")
                                or entry.get("message")
                                or raw_log
                            )
                        else:
                            if isinstance(nested, dict):
                                fields = nested
                            else:
                                entry["message"] = raw_log
                    else:
                        fields = payload
            except json.JSONDecodeError:
                fields = _parse_logfmt(line)
                entry["message"] = (
                    fields.get("msg") or fields.get("message") or entry.get("message") or line
                )

            if fields:
                entry.update(
                    {
                        "service": fields.get("service") or entry.get("service"),
                        "level": fields.get("level") or entry.get("level"),
                        "message": fields.get("message") or fields.get("msg") or entry.get("message"),
                        "event_time": fields.get("timestamp") or fields.get("time") or entry.get("event_time"),
                        "component": fields.get("component"),
                        "caller": fields.get("caller"),
                    }
                )

            entry["category"] = _categorize_entry(entry, fields, labels)
            entry["source"] = (
                entry.get("service")
                or entry.get("component")
                or labels.get("container")
                or labels.get("container_name")
                or entry.get("stream")
                or "unknown"
            )

            entries.append(entry)

    entries.sort(key=lambda item: item.get("timestamp", ""), reverse=True)
    return entries


def _ping(url: str) -> Dict[str, Any]:
    try:
        response = requests.get(url, timeout=HEALTH_TIMEOUT)
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc)}

    payload: Optional[Any]
    try:
        payload = response.json()
    except ValueError:
        payload = response.text[:200] if response.text else None

    return {
        "ok": response.ok,
        "status_code": response.status_code,
        "payload": payload,
    }


def _check_loki() -> Dict[str, Any]:
    return _ping(f"{LOKI_URL}/ready")


def _check_services() -> Dict[str, Any]:
    return {name: _ping(url) for name, url in SERVICE_HEALTH_URLS.items()}


@app.get("/")
def home() -> Dict[str, str]:
    return {"message": "Dashboard backend running"}


@app.get("/health")
def health() -> Dict[str, Any]:
    loki = _check_loki()
    services = _check_services()
    statuses = [loki.get("ok")] + [item.get("ok") for item in services.values()]
    if all(status is True for status in statuses):
        overall = "ok"
    elif any(status is True for status in statuses):
        overall = "degraded"
    else:
        overall = "down"

    return {
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "loki": loki,
        "services": services,
    }


@app.get("/services")
def list_services() -> Dict[str, List[str]]:
    return {"services": KNOWN_SERVICES}


@app.get("/logs")
def get_logs(
    service: Optional[str] = Query(default=None),
    level: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    since: str = Query(default=DEFAULT_SINCE),
    category: Optional[str] = Query(default="service"),
    limit: int = Query(default=200, ge=1, le=MAX_LIMIT),
) -> Dict[str, Any]:
    start = datetime.now(timezone.utc) - _parse_since(since)
    end = datetime.now(timezone.utc)
    category_filter = _normalize_filter(category)
    service_filter = _normalize_filter(service)
    level_filter = _normalize_filter(level)
    search_filter = search.strip() if search else None
    query = _build_logql()

    try:
        payload = _fetch_loki(query=query, start=start, end=end, limit=limit)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Loki request failed: {exc}") from exc

    result = payload.get("data", {}).get("result", [])
    entries = _parse_entries(result)
    entries = _apply_filters(
        entries,
        service=service_filter,
        level=level_filter,
        search=search_filter,
        category=category_filter,
    )

    return {
        "query": query,
        "entries": entries,
        "count": len(entries),
        "range": {"start": start.isoformat(), "end": end.isoformat()},
    }


@app.get("/errors")
def get_errors() -> Dict[str, Any]:
    return get_logs(level="ERROR")


@app.get("/logs/anomalies")
def get_anomalies() -> Dict[str, Any]:
    try:
        q_short = 'sum(count_over_time({job="container_logs"} |= "ERROR" [15m]))'
        resp_short = requests.get(f"{LOKI_URL}/loki/api/v1/query", params={"query": q_short}, timeout=5)
        resp_short.raise_for_status()
        
        q_long = 'sum(count_over_time({job="container_logs"} |= "ERROR" [24h]))'
        resp_long = requests.get(f"{LOKI_URL}/loki/api/v1/query", params={"query": q_long}, timeout=5)
        resp_long.raise_for_status()
        
        short_results = resp_short.json().get("data", {}).get("result", [])
        long_results = resp_long.json().get("data", {}).get("result", [])
        
        short_count = int(short_results[0]["value"][1]) if short_results else 0
        long_count = int(long_results[0]["value"][1]) if long_results else 0
        
        avg_15m = max(long_count / 96, 1)
        
        if short_count > avg_15m * 3 and short_count > 10:
            return {
                "alert": True, 
                "message": f"Error spike detected! {short_count} errors in the last 15m compared to a 24h average of {int(avg_15m)}."
            }
            
    except Exception as exc:
        return {"alert": False, "error": str(exc)}
    
    return {"alert": False, "message": "No anomalies"}
