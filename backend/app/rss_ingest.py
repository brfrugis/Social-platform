"""Fetch RSS 2.0 or Atom feeds and normalize entries (no external deps)."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree

import httpx


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if tag.startswith("{") else tag


def _text(el: Any | None) -> str:
    if el is None:
        return ""
    parts: list[str] = []
    if el.text:
        parts.append(el.text.strip())
    for child in el:
        parts.append(_text(child))
        if child.tail:
            parts.append(child.tail.strip())
    return " ".join(p for p in parts if p).strip()


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    v = val.strip()
    # ISO-ish
    try:
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        pass
    # RFC 2822 subset (pubDate)
    try:
        from email.utils import parsedate_to_datetime

        dt = parsedate_to_datetime(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


def _external_key(link: str, guid: str | None) -> str:
    g = (guid or "").strip()
    if g:
        return g[:512]
    return hashlib.sha256(link.encode("utf-8")).hexdigest()


def parse_feed_xml(xml_bytes: bytes, *, limit: int = 200) -> list[dict[str, Any]]:
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError as e:
        raise ValueError(f"Invalid XML feed: {e}") from e
    tag = _strip_ns(root.tag).lower()
    out: list[dict[str, Any]] = []

    if tag == "rss":
        channel = root.find("channel")
        if channel is None:
            return []
        for item in channel.findall("item"):
            if len(out) >= limit:
                break
            title_el = item.find("title")
            link_el = item.find("link")
            desc_el = item.find("description") or item.find("{http://purl.org/rss/1.0/modules/content/}encoded")
            guid_el = item.find("guid")
            pub_el = item.find("pubDate")
            title = _text(title_el)
            link = (link_el.text or "").strip() if link_el is not None else ""
            if not link:
                continue
            summary = _text(desc_el) if desc_el is not None else ""
            guid = (guid_el.text or "").strip() if guid_el is not None else None
            pub = _parse_dt(pub_el.text if pub_el is not None else None)
            out.append(
                {
                    "title": title or link,
                    "link": link,
                    "summary": summary[:8000] if summary else "",
                    "published_at": pub,
                    "external_key": _external_key(link, guid),
                }
            )
        return out

    if tag == "feed":
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        entries = root.findall("atom:entry", ns) or root.findall("entry")
        for ent in entries:
            if len(out) >= limit:
                break
            title_el = ent.find("atom:title", ns) or ent.find("title")
            link_el = None
            for candidate in ent.findall("atom:link", ns) or ent.findall("link"):
                rel = (candidate.get("rel") or "alternate").lower()
                if rel == "alternate":
                    link_el = candidate
                    break
            if link_el is None:
                for candidate in ent.findall("atom:link", ns) or ent.findall("link"):
                    link_el = candidate
                    break
            href = (link_el.get("href") or "").strip() if link_el is not None else ""
            if not href:
                continue
            summary_el = (
                ent.find("atom:summary", ns)
                or ent.find("summary")
                or ent.find("atom:content", ns)
                or ent.find("content")
            )
            summary = _text(summary_el)
            updated_el = ent.find("atom:updated", ns) or ent.find("updated")
            published_el = ent.find("atom:published", ns) or ent.find("published")
            dt = _parse_dt((published_el.text if published_el is not None else None) or None)
            if dt is None:
                dt = _parse_dt(updated_el.text if updated_el is not None else None)
            id_el = ent.find("atom:id", ns) or ent.find("id")
            guid = (id_el.text or "").strip() if id_el is not None else None
            title = _text(title_el)
            out.append(
                {
                    "title": title or href,
                    "link": href,
                    "summary": summary[:8000] if summary else "",
                    "published_at": dt,
                    "external_key": _external_key(href, guid),
                }
            )
        return out

    raise ValueError(f"Unsupported feed root element: {tag!r} (expected rss or feed)")


async def fetch_feed_entries(feed_url: str, *, timeout_s: float = 45.0, limit: int = 200) -> list[dict[str, Any]]:
    url = feed_url.strip()
    if not url.startswith(("http://", "https://")):
        raise ValueError("feed_url must start with http:// or https://")
    headers = {
        "User-Agent": "GIGI-AI/1.0 (+https://github.com/) news-ingest",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    }
    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
        r = await client.get(url, headers=headers)
        r.raise_for_status()
        body = r.content
        _ctype = (r.headers.get("content-type") or "").lower()
        if "xml" not in _ctype and not re.search(br"<(rss|feed)\b", body[:500].lower()):
            pass  # still try ElementTree
    return parse_feed_xml(body, limit=limit)
