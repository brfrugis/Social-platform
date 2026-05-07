"""Optional OpenTelemetry (OTLP) for Coralogix or any OTLP-compatible backend."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)


def init_opentelemetry(app: "FastAPI") -> None:
    """When OTEL_EXPORTER_OTLP_ENDPOINT is set, export traces (Coralogix: use their OTLP host + headers)."""
    endpoint = (os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    if not endpoint:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning(
            "OTEL_EXPORTER_OTLP_ENDPOINT is set but OpenTelemetry packages are missing. "
            "Install opentelemetry-sdk and opentelemetry-exporter-otlp-proto-http (see requirements.txt).",
        )
        return

    service_name = (os.environ.get("OTEL_SERVICE_NAME") or "gigi-api").strip()
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)

    headers = (os.environ.get("OTEL_EXPORTER_OTLP_HEADERS") or "").strip()
    hdr_dict: dict[str, str] | None = None
    if headers:
        hdr_dict = {}
        for pair in headers.split(","):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                hdr_dict[k.strip()] = v.strip()

    exporter = OTLPSpanExporter(endpoint=endpoint, headers=hdr_dict)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    HTTPXClientInstrumentor().instrument()
    FastAPIInstrumentor.instrument_app(app)
    logger.info("OpenTelemetry OTLP tracing enabled for %s", service_name)
