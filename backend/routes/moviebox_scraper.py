#!/usr/bin/env python3
"""
MovieBox Scraper - Standalone Python Scraper
Extracts movies from MovieBox with search, details, and streaming URLs.

Features:
    - Search movies by title
    - Extract movie details (title, poster, year, rating, description)
    - Extract HLS/DASH streaming URLs with quality options
    - Parse MPD manifests to extract individual quality variants (360p-1080p)
    - Support multiple quality streams (360p, 480p, 720p, 1080p)
    - Return proper streaming URLs (not download links)
    - Error handling & retry logic with host fallback
    - Demo/fallback data when MovieBox is unreachable
    - Clean JSON output

Usage:
    from moviebox_scraper import MovieBoxScraper

    scraper = MovieBoxScraper()

    # Search for movies
    results = scraper.search_movies("Avatar")

    # Get movie details
    details = scraper.get_movie_details("1008009424004338096")

    # Get streaming URLs
    streams = scraper.get_streams("1008009424004338096")
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import random
import re
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import date, datetime
from enum import Enum, IntEnum
from typing import Any
from urllib.parse import parse_qs, urlparse, urlsplit

import httpx


# =============================================================================
# CONSTANTS
# =============================================================================

HOST_POOL: list[str] = [
    "https://api6.aoneroom.com",
    "https://api5.aoneroom.com",
    "https://api4.aoneroom.com",
    "https://api4sg.aoneroom.com",
    "https://api3.aoneroom.com",
    "https://api6sg.aoneroom.com",
    "https://api.inmoviebox.com",
]

WEB_API_BASE: str = "https://h5-api.aoneroom.com"

SECRET_KEY_DEFAULT: str = "76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O"
SECRET_KEY_ALT: str = "Xqn2nnO41/L92o1iuXhSLHTbXvY4Z5ZZ62m8mSLA"

SIGNATURE_BODY_MAX_BYTES: int = 102_400
RETRY_STATUS_CODES: frozenset[int] = frozenset({403, 407, 429, 500, 502, 503, 504})

SEARCH_PER_PAGE_LIMIT = 20


class SubjectType(IntEnum):
    MOVIE = 1
    TV_SERIES = 2
    ANIME = 3
    MUSIC = 4
    EDUCATION = 5
    SHORT_TV = 6


class ResolutionType(IntEnum):
    _360P = 360
    _480P = 480
    _720P = 720
    _1080P = 1080
    UNSPECIFIED = 0


# =============================================================================
# DEMO/FALLBACK DATA - Uses HLS streaming URLs
# =============================================================================

DEMO_MOVIES = [
    {
        "id": "1008009424004338096",
        "title": "Avatar",
        "poster": "https://image.tmdb.org/t/p/w500/kyeqWdyUXW608qlYkRqosgbbJyK.jpg",
        "year": 2009,
        "rating": 7.9,
        "description": "In the 22nd century, a paraplegic Marine is dispatched to the moon Pandora on a unique mission, but becomes torn between following orders and protecting the world he feels is his home.",
        "genre": ["Action", "Adventure", "Fantasy", "Sci-Fi"],
        "duration": "2h 42m",
        "language": ["English", "Spanish"],
        "country": "United States",
        "content_rating": "PG-13",
        "streams": [
            {
                "quality": "1080p",
                "url": "https://demo-stream.moviebox.ph/avatar/master.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 4500000
            },
            {
                "quality": "720p",
                "url": "https://demo-stream.moviebox.ph/avatar/720p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 2500000
            },
            {
                "quality": "480p",
                "url": "https://demo-stream.moviebox.ph/avatar/480p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 1000000
            },
            {
                "quality": "360p",
                "url": "https://demo-stream.moviebox.ph/avatar/360p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 600000
            }
        ],
        "subtitles": [
            {"language": "en", "url": "https://demo-stream.moviebox.ph/avatar/en.vtt"}
        ]
    },
    {
        "id": "1008009424004338097",
        "title": "Avatar: The Way of Water",
        "poster": "https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg",
        "year": 2022,
        "rating": 7.6,
        "description": "Jake Sully lives with his newfound family formed on the extrasolar moon Pandora. Once a familiar threat returns to finish what was previously started, Jake must work with Neytiri and the army of the Na'vi race to protect their home.",
        "genre": ["Action", "Adventure", "Fantasy", "Sci-Fi"],
        "duration": "3h 12m",
        "language": ["English"],
        "country": "United States",
        "content_rating": "PG-13",
        "streams": [
            {
                "quality": "1080p",
                "url": "https://demo-stream.moviebox.ph/avatar2/master.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 5000000
            },
            {
                "quality": "720p",
                "url": "https://demo-stream.moviebox.ph/avatar2/720p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 2800000
            },
            {
                "quality": "480p",
                "url": "https://demo-stream.moviebox.ph/avatar2/480p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 1200000
            }
        ],
        "subtitles": []
    },
    {
        "id": "1008009424004338098",
        "title": "Inception",
        "poster": "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
        "year": 2010,
        "rating": 8.8,
        "description": "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
        "genre": ["Action", "Adventure", "Sci-Fi", "Thriller"],
        "duration": "2h 28m",
        "language": ["English", "Japanese", "French"],
        "country": "United States",
        "content_rating": "PG-13",
        "streams": [
            {
                "quality": "1080p",
                "url": "https://demo-stream.moviebox.ph/inception/master.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 4200000
            },
            {
                "quality": "720p",
                "url": "https://demo-stream.moviebox.ph/inception/720p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 2200000
            },
            {
                "quality": "480p",
                "url": "https://demo-stream.moviebox.ph/inception/480p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 900000
            },
            {
                "quality": "360p",
                "url": "https://demo-stream.moviebox.ph/inception/360p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 500000
            }
        ],
        "subtitles": [
            {"language": "en", "url": "https://demo-stream.moviebox.ph/inception/en.vtt"},
            {"language": "es", "url": "https://demo-stream.moviebox.ph/inception/es.vtt"}
        ]
    },
    {
        "id": "1008009424004338099",
        "title": "The Matrix",
        "poster": "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
        "year": 1999,
        "rating": 8.7,
        "description": "When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth - the life he knows is the elaborate deception of an evil cyber-intelligence.",
        "genre": ["Action", "Sci-Fi"],
        "duration": "2h 16m",
        "language": ["English"],
        "country": "United States",
        "content_rating": "R",
        "streams": [
            {
                "quality": "1080p",
                "url": "https://demo-stream.moviebox.ph/matrix/master.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 4000000
            },
            {
                "quality": "720p",
                "url": "https://demo-stream.moviebox.ph/matrix/720p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 2000000
            }
        ],
        "subtitles": []
    },
    {
        "id": "1008009424004338100",
        "title": "The Dark Knight",
        "poster": "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
        "year": 2008,
        "rating": 9.0,
        "description": "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
        "genre": ["Action", "Crime", "Drama", "Thriller"],
        "duration": "2h 32m",
        "language": ["English", "Mandarin"],
        "country": "United States",
        "content_rating": "PG-13",
        "streams": [
            {
                "quality": "1080p",
                "url": "https://demo-stream.moviebox.ph/tdk/master.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 4500000
            },
            {
                "quality": "720p",
                "url": "https://demo-stream.moviebox.ph/tdk/720p.m3u8",
                "type": "hls",
                "codec": "h264",
                "bandwidth": 2200000
            }
        ],
        "subtitles": []
    }
]


# =============================================================================
# CRYPTO / SIGNING
# =============================================================================

def md5_hex(data: bytes) -> str:
    """Return lowercase hex MD5 of *data*."""
    return hashlib.md5(data).hexdigest()


def b64_decode(value: str) -> bytes:
    """Decode a standard-alphabet base64 string, adding padding if needed."""
    padding = (4 - len(value) % 4) % 4
    return base64.b64decode(value + "=" * padding)


def b64_encode(data: bytes) -> str:
    """Encode *data* to a standard base64 string (no newlines)."""
    return base64.b64encode(data).decode()


def generate_x_client_token(timestamp_ms: int | None = None) -> str:
    """token = '<ts>,<md5(reverse(<ts>))>'"""
    ts = str(timestamp_ms if timestamp_ms is not None else int(time.time() * 1000))
    reversed_ts = ts[::-1]
    hash_val = md5_hex(reversed_ts.encode())
    return f"{ts},{hash_val}"


def _sorted_query_string(url: str) -> str:
    """Rebuild the query string with keys in sorted order."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query, keep_blank_values=True)
    if not qs:
        return ""
    parts: list[str] = []
    for key in sorted(qs.keys()):
        for value in qs[key]:
            parts.append(f"{key}={value}")
    return "&".join(parts)


def build_canonical_string(
    method: str, accept: str | None, content_type: str | None,
    url: str, body: str | None, timestamp_ms: int
) -> str:
    parsed = urlparse(url)
    path = parsed.path or ""
    query = _sorted_query_string(url)
    canonical_url = f"{path}?{query}" if query else path

    body_bytes: bytes | None = body.encode("utf-8") if body is not None else None
    if body_bytes is not None:
        truncated = body_bytes[:SIGNATURE_BODY_MAX_BYTES]
        body_hash = md5_hex(truncated)
        body_length = str(len(body_bytes))
    else:
        body_hash = ""
        body_length = ""

    return (
        f"{method.upper()}\n"
        f"{accept or ''}\n"
        f"{content_type or ''}\n"
        f"{body_length}\n"
        f"{timestamp_ms}\n"
        f"{body_hash}\n"
        f"{canonical_url}"
    )


def generate_x_tr_signature(
    method: str, accept: str | None, content_type: str | None,
    url: str, body: str | None = None, use_alt_key: bool = False,
    timestamp_ms: int | None = None
) -> str:
    """Returns the x-tr-signature header value."""
    ts = timestamp_ms if timestamp_ms is not None else int(time.time() * 1000)
    canonical = build_canonical_string(method, accept, content_type, url, body, ts)
    secret_b64 = SECRET_KEY_ALT if use_alt_key else SECRET_KEY_DEFAULT
    secret_bytes = b64_decode(secret_b64)
    mac = hmac.new(secret_bytes, canonical.encode("utf-8"), hashlib.md5)
    sig_b64 = b64_encode(mac.digest())
    return f"{ts}|2|{sig_b64}"


def build_signed_headers(
    method: str, url: str, auth_token: str | None = None,
    accept: str = "application/json", content_type: str = "application/json",
    body: str | None = None, include_play_mode: bool = False,
    user_agent: str = "", client_info: str = ""
) -> dict[str, str]:
    """Assemble the full set of signed request headers."""
    ts = int(time.time() * 1000)
    headers: dict[str, str] = {
        "User-Agent": user_agent,
        "Accept": accept,
        "Content-Type": content_type,
        "Connection": "keep-alive",
        "X-Client-Token": generate_x_client_token(ts),
        "x-tr-signature": generate_x_tr_signature(method, accept, content_type, url, body, False, ts),
        "X-Client-Info": client_info,
        "X-Client-Status": "0",
    }
    if auth_token:
        url_component = urlsplit(url)
        if url_component.path not in set():
            headers["Authorization"] = f"Bearer {auth_token}"
    if include_play_mode:
        headers["X-Play-Mode"] = "2"
    return headers


def _random_hex(length: int) -> str:
    return "".join(random.choices("0123456789abcdef", k=length))


def _generate_client_info() -> tuple[str, str]:
    android_versions = [
        {"version": "13", "build": "TQ2A.230405.003"},
        {"version": "12", "build": "S1B.220414.015"},
        {"version": "11", "build": "RP1A.200720.011"},
    ]
    redmi_devices = [
        {"model": "23078RKD5C", "brand": "Redmi"},
        {"model": "2201117TY", "brand": "Redmi"},
        {"model": "22101316G", "brand": "Redmi"},
    ]
    version_codes = [50020042, 50020043, 50020044, 50020045, 50020046]
    network_types = ["NETWORK_WIFI", "NETWORK_MOBILE"]
    timezones = ["Asia/Kolkata", "Asia/Shanghai", "America/New_York", "Europe/London"]

    android = random.choice(android_versions)
    device = random.choice(redmi_devices)
    version_code = random.choice(version_codes)
    network = random.choice(network_types)
    timezone = random.choice(timezones)
    gaid = str(uuid.uuid4())
    device_id = _random_hex(32)

    user_agent = (
        f"com.community.oneroom/{version_code} "
        f"(Linux; U; Android {android['version']}; en_US; "
        f"{device['model']}; Build/{android['build']}; Cronet/135.0.7012.3)"
    )
    client_info = (
        f'{{"package_name":"com.community.oneroom","version_name":"3.0.03.0529.03",'
        f'"version_code":{version_code},"os":"android","os_version":"{android["version"]}",'
        f'"install_ch":"ps","device_id":"{device_id}","install_store":"ps",'
        f'"gaid":"{gaid}","brand":"{device["brand"]}","model":"{device["model"]}",'
        f'"system_language":"en","net":"{network}","region":"US",'
        f'"timezone":"{timezone}","sp_code":"40401","X-Play-Mode":"2"}}'
    )
    return user_agent, client_info


# =============================================================================
# MPD MANIFEST PARSER
# =============================================================================

def parse_mpd_manifest(mpd_xml: str, base_url: str) -> list[dict]:
    """
    Parse a DASH MPD manifest and extract individual quality stream info.

    Returns list of stream dicts with quality, bandwidth, width, height, codec.
    """
    streams = []
    try:
        root = ET.fromstring(mpd_xml)
        ns = {"dash": "urn:mpeg:dash:schema:mpd:2011"}

        for period in root.findall("dash:Period", ns):
            for adapt_set in period.findall("dash:AdaptationSet", ns):
                content_type = adapt_set.get("contentType", "")
                if content_type != "video":
                    continue

                for rep in adapt_set.findall("dash:Representation", ns):
                    bandwidth = int(rep.get("bandwidth", 0))
                    width = int(rep.get("width", 0))
                    height = int(rep.get("height", 0))
                    codecs = rep.get("codecs", "")
                    mime_type = rep.get("mimeType", "")

                    quality = f"{height}p" if height else "unknown"

                    stream_info = {
                        "quality": quality,
                        "bandwidth": bandwidth,
                        "width": width,
                        "height": height,
                        "codec": codecs,
                        "mime_type": mime_type,
                    }
                    streams.append(stream_info)
    except ET.ParseError:
        pass

    return streams


def parse_mpd_for_streams(mpd_xml: str, dash_url: str) -> list[dict]:
    """
    Parse MPD manifest and construct per-quality stream entries.
    Each entry represents a specific resolution that can be selected.
    """
    streams = []
    try:
        base_url = dash_url.rsplit("/", 1)[0] + "/"
        rep_list = parse_mpd_manifest(mpd_xml, base_url)

        for rep in rep_list:
            quality = rep["quality"]
            height = rep["height"]
            bandwidth = rep["bandwidth"]
            codecs = rep["codec"]

            # Codec name mapping
            codec_name = "h264"
            if "hev" in codecs.lower() or "hvc" in codecs.lower() or "265" in codecs:
                codec_name = "hevc"
            elif "av1" in codecs.lower():
                codec_name = "av1"

            stream_entry = {
                "quality": quality,
                "resolution": f"{rep['width']}x{height}",
                "bandwidth": bandwidth,
                "codec": codec_name,
                "type": "dash",
                "format": "mpd",
                "url": dash_url,
                "manifest_url": dash_url,
                "height": height,
                "width": rep["width"],
            }
            streams.append(stream_entry)

        # Sort by bandwidth descending (highest quality first)
        streams.sort(key=lambda x: x.get("bandwidth", 0), reverse=True)

    except Exception:
        pass

    return streams


# =============================================================================
# STREAMING URL HELPERS
# =============================================================================

def parse_cookie_string(cookie_str: str) -> dict[str, str]:
    """Parse a semicolon-separated cookie string into a dict."""
    cookies = {}
    if not cookie_str:
        return cookies
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            key, val = part.split("=", 1)
            cookies[key.strip()] = val.strip()
    return cookies


def extract_quality_from_url(url: str) -> str:
    """Try to extract quality info from a URL."""
    patterns = [
        (r"[_-](\d{3,4})p[_-]?", 1),
        (r"/(\d{3,4})p/", 1),
        (r"[_-](\d{3,4})[_-]", 1),
    ]
    for pat, group in patterns:
        m = re.search(pat, url, re.IGNORECASE)
        if m:
            return f"{m.group(group)}p"
    return ""


# =============================================================================
# SCRAPER CLASS
# =============================================================================

class MovieBoxScraper:
    """
    Standalone MovieBox scraper for searching movies, getting details,
    and extracting streaming URLs (DASH/HLS).

    Args:
        timeout: Request timeout in seconds (default: 25)
        max_retries: Max retries per request (default: 3)
        use_demo_fallback: Use demo data when API fails (default: True)
        parse_mpd: Parse MPD manifests to extract quality variants (default: True)
    """

    # API Paths
    MAIN_PAGE_PATH: str = "/wefeed-mobile-bff/tab-operating"
    SEARCH_PATH: str = "/wefeed-mobile-bff/subject-api/search"
    SEARCH_PATH_V2: str = "/wefeed-mobile-bff/subject-api/search/v2"
    SUBJECT_GET_PATH: str = "/wefeed-mobile-bff/subject-api/get"
    SEASON_INFO_PATH: str = "/wefeed-mobile-bff/subject-api/season-info"
    PLAY_INFO_PATH: str = "/wefeed-mobile-bff/subject-api/play-info"
    RESOURCE_PATH: str = "/wefeed-mobile-bff/subject-api/resource"
    WEB_DETAIL_PATHS: list[str] = [
        "/wefeed-h5api-bff/page-api/subject/detail",
        "/wefeed-h5api-bff/page-api/subject/get",
    ]

    def __init__(
        self,
        timeout: float = 25.0,
        max_retries: int = 3,
        use_demo_fallback: bool = True,
        parse_mpd: bool = True,
    ):
        self.timeout = timeout
        self.max_retries = max_retries
        self.use_demo_fallback = use_demo_fallback
        self.parse_mpd = parse_mpd
        self._host_pool = HOST_POOL.copy()
        self._active_base = self._host_pool[0]
        self._runtime_token: str | None = None
        self._user_agent, self._client_info = _generate_client_info()
        self._initialized = False

    # ------------------------------------------------------------------
    # Internal Helpers
    # ------------------------------------------------------------------

    def _signed_headers(
        self, method: str, url: str, body: str | None = None, include_play_mode: bool = False
    ) -> dict[str, str]:
        return build_signed_headers(
            method=method,
            url=url,
            auth_token=self._runtime_token,
            body=body,
            include_play_mode=include_play_mode,
            user_agent=self._user_agent,
            client_info=self._client_info,
        )

    def _absorb_x_user(self, headers: httpx.Headers) -> None:
        x_user = headers.get("x-user", "")
        if not x_user:
            return
        try:
            payload = json.loads(x_user)
            token = payload.get("token", "")
            if token:
                self._runtime_token = token
        except (json.JSONDecodeError, AttributeError):
            pass

    def _url(self, path: str) -> str:
        return f"{self._active_base}{path}"

    def _process_response(self, response: httpx.Response) -> dict:
        """Extract data field from API response."""
        if response.status_code != 200:
            raise MovieBoxAPIError(f"HTTP {response.status_code}: {response.text[:200]}")
        data = response.json()
        code = data.get("code", -1)
        if code != 0:
            msg = data.get("message", f"API error code {code}")
            raise MovieBoxAPIError(f"API error: {msg}")
        return data.get("data", {})

    async def _request_with_fallback(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json_body: dict | None = None,
        include_play_mode: bool = False,
    ) -> dict:
        """Make request with host-pool fallback on retryable errors."""
        body_str = json.dumps(json_body, separators=(",", ":")) if json_body else None

        if params:
            from urllib.parse import urlencode
            path = f"{path}?{urlencode(params, doseq=True)}"

        last_error: Exception | None = None

        for base in self._host_pool:
            url = f"{base}{path}"
            headers = self._signed_headers(method, url, body_str, include_play_mode)

            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout, follow_redirects=True
                ) as client:
                    if method.upper() == "GET":
                        response = await client.get(url, headers=headers)
                    else:
                        response = await client.post(
                            url, headers=headers,
                            content=body_str.encode() if body_str else b""
                        )

                    self._absorb_x_user(response.headers)

                    if response.status_code not in RETRY_STATUS_CODES:
                        self._active_base = base
                        return self._process_response(response)

                    last_error = MovieBoxAPIError(
                        f"Host {base} returned {response.status_code}"
                    )

            except (httpx.TransportError, httpx.TimeoutException) as exc:
                last_error = exc
                continue
            except MovieBoxAPIError:
                raise
            except Exception as exc:
                last_error = exc
                continue

        raise MovieBoxAPIError(
            f"All hosts exhausted for {path}. Last error: {last_error}"
        )

    async def _fetch_mpd(self, url: str, cookies: dict[str, str]) -> str | None:
        """Fetch and return MPD manifest content."""
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, cookies=cookies)
                if resp.status_code == 200:
                    return resp.text
        except Exception:
            pass
        return None

    async def _init_auth(self) -> None:
        """Initialize authentication by fetching a token."""
        if self._initialized and self._runtime_token:
            return

        for base in self._host_pool:
            url = f"{base}{self.MAIN_PAGE_PATH}?page=1&tabId=0&version="
            headers = self._signed_headers("GET", url)
            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout, follow_redirects=True
                ) as client:
                    resp = await client.get(url, headers=headers)
                    self._absorb_x_user(resp.headers)
                    if self._runtime_token:
                        self._initialized = True
                        self._active_base = base
                        return
            except Exception:
                continue

        if not self.use_demo_fallback:
            raise MovieBoxAPIError("Unable to authenticate with any host")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def search_movies(
        self, query: str, page: int = 1, per_page: int = SEARCH_PER_PAGE_LIMIT
    ) -> list[dict]:
        """
        Search movies by title.

        Args:
            query: Movie title to search for
            page: Page number (default: 1)
            per_page: Results per page (default: 20)

        Returns:
            List of movie dictionaries with id, title, poster, year, rating, etc.
        """
        if not query or not query.strip():
            return []

        query = query.strip()

        try:
            await self._init_auth()

            body = {
                "keyword": query,
                "page": page,
                "perPage": per_page,
                "tabId": "All",
            }

            data = await self._request_with_fallback(
                "POST", self.SEARCH_PATH_V2, json_body=body
            )

            items = []
            results = data.get("results", [])
            for result_group in results:
                for subject in result_group.get("subjects", []):
                    item = self._parse_subject(subject)
                    if item:
                        items.append(item)

            return items

        except Exception as e:
            if self.use_demo_fallback:
                return self._demo_search(query)
            raise MovieBoxAPIError(f"Search failed: {e}")

    async def get_movie_details(self, movie_id: str) -> dict:
        """
        Get detailed information about a movie.

        Args:
            movie_id: MovieBox subject ID (17-21 digit number)

        Returns:
            Dictionary with title, poster, year, rating, description, genre, etc.
        """
        if not movie_id or not re.match(r"^\d{17,21}$", movie_id):
            raise ValueError(f"Invalid movie_id: {movie_id}")

        try:
            await self._init_auth()

            data = await self._request_with_fallback(
                "GET", self.SUBJECT_GET_PATH, params={"subjectId": movie_id}
            )

            return self._parse_detail(data)

        except Exception as e:
            if self.use_demo_fallback:
                demo = self._demo_get_by_id(movie_id)
                if demo:
                    return demo
            raise MovieBoxAPIError(f"Failed to get details: {e}")

    async def get_streams(
        self, movie_id: str, season: int = 0, episode: int = 0
    ) -> dict:
        """
        Get streaming URLs for a movie.

        Args:
            movie_id: MovieBox subject ID
            season: Season number (default: 0 for movies)
            episode: Episode number (default: 0 for movies)

        Returns:
            Dictionary with streaming URLs organized by quality:
            {
                "movie_id": "...",
                "title": "...",
                "streams": [
                    {
                        "quality": "1080p",
                        "resolution": "1920x1080",
                        "url": "...",
                        "type": "dash",
                        "format": "mpd",
                        "codec": "hevc",
                        "bandwidth": 2451120,
                        "cookies": {...}
                    },
                    ...
                ],
                "subtitles": [
                    {"language": "en", "url": "..."},
                    ...
                ]
            }
        """
        if not movie_id or not re.match(r"^\d{17,21}$", movie_id):
            raise ValueError(f"Invalid movie_id: {movie_id}")

        try:
            await self._init_auth()

            # Get play info (streaming URLs - DASH format)
            play_data = await self._request_with_fallback(
                "GET", self.PLAY_INFO_PATH,
                params={"subjectId": movie_id, "se": season, "ep": episode}
            )

            # Parse streams from play data
            streams, stream_meta = await self._parse_play_streams(play_data)

            # Get subtitle info from resource endpoint
            subtitles = []
            try:
                resource_data = await self._request_with_fallback(
                    "GET", self.RESOURCE_PATH,
                    params={"subjectId": movie_id, "se": season, "ep": episode}
                )
                subtitles = self._parse_subtitles(resource_data)
            except Exception:
                pass

            # Build title from available data
            title = stream_meta.get("title", "")
            if not title:
                try:
                    title = resource_data.get("subjectTitle", "")
                except Exception:
                    pass

            # If API returned empty streams, try demo fallback
            if not streams and self.use_demo_fallback:
                demo = self._demo_get_by_id(movie_id)
                if demo:
                    return {
                        "movie_id": movie_id,
                        "title": demo.get("title", title),
                        "subject_type": 1,
                        "streams": demo.get("streams", []),
                        "subtitles": demo.get("subtitles", []),
                        "streaming_format": "hls",
                        "total_episodes": 0,
                        "source": "demo_fallback"
                    }

            return {
                "movie_id": movie_id,
                "title": title,
                "subject_type": stream_meta.get("subject_type", 1),
                "streams": streams,
                "subtitles": subtitles,
                "streaming_format": "dash",
                "total_episodes": stream_meta.get("total_episodes", 0),
                "source": "api",
            }

        except Exception as e:
            if self.use_demo_fallback:
                demo = self._demo_get_by_id(movie_id)
                if demo:
                    return {
                        "movie_id": movie_id,
                        "title": demo.get("title", ""),
                        "subject_type": 1,
                        "streams": demo.get("streams", []),
                        "subtitles": demo.get("subtitles", []),
                        "streaming_format": "hls",
                        "total_episodes": 0,
                        "source": "demo_fallback"
                    }
            raise MovieBoxAPIError(f"Failed to get streams: {e}")

    # ------------------------------------------------------------------
    # Synchronous Wrappers
    # ------------------------------------------------------------------

    def search(self, query: str, page: int = 1, per_page: int = 20) -> list[dict]:
        """Synchronous wrapper for search_movies."""
        import asyncio
        return asyncio.run(self.search_movies(query, page, per_page))

    def details(self, movie_id: str) -> dict:
        """Synchronous wrapper for get_movie_details."""
        import asyncio
        return asyncio.run(self.get_movie_details(movie_id))

    def streams(self, movie_id: str, season: int = 0, episode: int = 0) -> dict:
        """Synchronous wrapper for get_streams."""
        import asyncio
        return asyncio.run(self.get_streams(movie_id, season, episode))

    # ------------------------------------------------------------------
    # Parsers
    # ------------------------------------------------------------------

    def _parse_subject(self, subject: dict) -> dict | None:
        """Parse a subject item from search results."""
        if not subject:
            return None

        cover = subject.get("cover", {}) or {}
        poster = cover.get("url", "") if isinstance(cover, dict) else ""

        release_date = subject.get("releaseDate", "")
        year = None
        if release_date:
            try:
                year = int(str(release_date)[:4])
            except (ValueError, TypeError):
                pass

        genre = subject.get("genre", [])
        if isinstance(genre, str):
            genre = [g.strip() for g in genre.split(",") if g.strip()]

        return {
            "id": subject.get("subjectId", ""),
            "title": subject.get("title", ""),
            "poster": poster,
            "year": year,
            "rating": float(subject.get("imdbRatingValue", 0) or 0),
            "description": subject.get("description", ""),
            "genre": genre,
            "duration": subject.get("duration", ""),
            "duration_seconds": subject.get("durationSeconds", 0),
            "language": subject.get("language", []),
            "country": subject.get("countryName", ""),
            "content_rating": subject.get("contentRating", ""),
            "subject_type": subject.get("subjectType", 1),
            "has_resource": subject.get("hasResource", False),
            "imdb_id": subject.get("opt", ""),
        }

    def _parse_detail(self, data: dict) -> dict:
        """Parse detailed movie info."""
        cover = data.get("cover", {}) or {}
        poster = cover.get("url", "") if isinstance(cover, dict) else ""

        release_date = data.get("releaseDate", "")
        year = None
        if release_date:
            try:
                year = int(str(release_date)[:4])
            except (ValueError, TypeError):
                pass

        genre = data.get("genre", [])
        if isinstance(genre, str):
            genre = [g.strip() for g in genre.split(",") if g.strip()]

        resource_detectors = data.get("resourceDetectors", [])
        qualities = []
        for detector in resource_detectors:
            if isinstance(detector, dict):
                res_list = detector.get("resolutionList", [])
                for res in res_list:
                    if isinstance(res, dict):
                        qualities.append({
                            "quality": f'{res.get("resolution", 0)}p',
                            "resolution": res.get("resolution", 0),
                            "codec": res.get("codecName", ""),
                            "episodes": res.get("epNum", 0),
                        })

        return {
            "id": data.get("subjectId", ""),
            "title": data.get("title", ""),
            "poster": poster,
            "year": year,
            "rating": float(data.get("imdbRatingValue", 0) or 0),
            "description": data.get("description", ""),
            "genre": genre,
            "duration": data.get("duration", ""),
            "duration_seconds": data.get("durationSeconds", 0),
            "language": data.get("language", []),
            "country": data.get("countryName", ""),
            "content_rating": data.get("contentRating", ""),
            "subject_type": data.get("subjectType", 1),
            "seasons": data.get("seNum", 0),
            "viewers": data.get("viewers", 0),
            "available_qualities": qualities,
            "aka": data.get("aka", ""),
            "subtitles": data.get("subtitles", []),
            "dubs": data.get("dubs", []),
        }

    async def _parse_play_streams(self, play_data: dict) -> tuple[list[dict], dict]:
        """
        Parse streaming URLs from play-info API response.

        Returns:
            Tuple of (streams_list, metadata_dict)
        """
        streams = []
        meta = {
            "title": play_data.get("title", ""),
            "subject_type": 1,
            "total_episodes": 0,
        }

        stream_list = play_data.get("streams", [])
        if not isinstance(stream_list, list):
            return streams, meta

        for stream in stream_list:
            if not isinstance(stream, dict):
                continue

            stream_format = stream.get("format", "").upper()
            stream_url = str(stream.get("url", ""))
            resolutions = stream.get("resolutions", "")
            codec_name = stream.get("codecName", "")
            duration = stream.get("duration", 0)
            size = stream.get("size", 0)
            stream_id = stream.get("id", "")
            sign_cookie = stream.get("signCookie", "")

            if not stream_url:
                continue

            # Parse cookies for authentication
            cookies = parse_cookie_string(sign_cookie)

            # DASH streaming
            if stream_format == "DASH" or stream_url.endswith(".mpd"):
                if self.parse_mpd:
                    # Fetch and parse MPD to get individual qualities
                    mpd_xml = await self._fetch_mpd(stream_url, cookies)
                    if mpd_xml:
                        mpd_streams = parse_mpd_for_streams(mpd_xml, stream_url)
                        for ms in mpd_streams:
                            ms["cookies"] = cookies
                            ms["cookie_string"] = sign_cookie
                            ms["duration"] = duration
                            ms["size"] = size
                            ms["stream_id"] = stream_id
                            ms["format"] = "DASH"
                            ms["manifest_type"] = "mpd"
                        streams.extend(mpd_streams)
                    else:
                        # Fallback: create entries from resolutions string
                        streams.extend(
                            self._streams_from_resolutions(
                                resolutions, stream_url, codec_name, duration, size, stream_id, cookies, sign_cookie
                            )
                        )
                else:
                    streams.extend(
                        self._streams_from_resolutions(
                            resolutions, stream_url, codec_name, duration, size, stream_id, cookies, sign_cookie
                        )
                    )

            # HLS streaming
            elif stream_format == "HLS" or ".m3u8" in stream_url:
                quality = extract_quality_from_url(stream_url) or "auto"
                streams.append({
                    "quality": quality,
                    "url": stream_url,
                    "type": "hls",
                    "format": "m3u8",
                    "codec": codec_name or "h264",
                    "duration": duration,
                    "size": size,
                    "stream_id": stream_id,
                    "cookies": cookies,
                    "cookie_string": sign_cookie,
                })

            # Direct MP4 streaming
            elif stream_url.endswith(".mp4"):
                quality = extract_quality_from_url(stream_url) or "unknown"
                streams.append({
                    "quality": quality,
                    "url": stream_url,
                    "type": "mp4",
                    "format": "mp4",
                    "codec": codec_name or "h264",
                    "duration": duration,
                    "size": size,
                    "stream_id": stream_id,
                    "cookies": cookies,
                    "cookie_string": sign_cookie,
                })

        # Sort by height/quality descending
        streams.sort(key=lambda x: int(x.get("height", 0) or x.get("quality", "0").replace("p", "") or 0), reverse=True)

        return streams, meta

    def _streams_from_resolutions(
        self, resolutions: str, manifest_url: str, codec_name: str,
        duration: int, size: int, stream_id: str,
        cookies: dict, cookie_string: str
    ) -> list[dict]:
        """Create stream entries from a comma-separated resolutions string."""
        result = []
        if not resolutions:
            return result

        codec = codec_name or "hevc"
        for res in resolutions.split(","):
            res = res.strip()
            if not res or not res.isdigit():
                continue
            height = int(res)
            quality = f"{height}p"

            result.append({
                "quality": quality,
                "resolution": f"?x{height}",
                "url": manifest_url,
                "type": "dash",
                "format": "mpd",
                "codec": codec,
                "height": height,
                "bandwidth": 0,
                "duration": duration,
                "size": size,
                "stream_id": stream_id,
                "cookies": cookies,
                "cookie_string": cookie_string,
            })

        return result

    def _parse_subtitles(self, resource_data: dict) -> list[dict]:
        """Parse subtitle/caption info from resource API response."""
        subtitles = []
        ext_captions = resource_data.get("extCaptions", [])
        if isinstance(ext_captions, list):
            for cap in ext_captions:
                if isinstance(cap, dict):
                    subtitles.append({
                        "language": cap.get("lan", ""),
                        "language_name": cap.get("lanName", ""),
                        "url": str(cap.get("url", "")),
                        "size": self._format_size(cap.get("size", 0)),
                    })
        return subtitles

    @staticmethod
    def _format_size(size_bytes) -> str:
        """Format bytes to human readable string."""
        try:
            size_bytes = int(size_bytes) if size_bytes else 0
        except (ValueError, TypeError):
            return str(size_bytes) if size_bytes else "Unknown"
        if not size_bytes:
            return "Unknown"
        size = float(size_bytes)
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} PB"

    # ------------------------------------------------------------------
    # Demo / Fallback Data
    # ------------------------------------------------------------------

    def _demo_search(self, query: str) -> list[dict]:
        """Return demo search results matching query."""
        query_lower = query.lower()
        results = []
        for movie in DEMO_MOVIES:
            if (query_lower in movie["title"].lower() or
                any(query_lower in g.lower() for g in movie.get("genre", []))):
                results.append({
                    "id": movie["id"],
                    "title": movie["title"],
                    "poster": movie["poster"],
                    "year": movie["year"],
                    "rating": movie["rating"],
                    "description": movie["description"],
                    "genre": movie["genre"],
                    "duration": movie["duration"],
                    "duration_seconds": 0,
                    "language": movie["language"],
                    "country": movie["country"],
                    "content_rating": movie["content_rating"],
                    "subject_type": 1,
                    "has_resource": True,
                    "imdb_id": "",
                    "source": "demo_fallback"
                })
        return results

    def _demo_get_by_id(self, movie_id: str) -> dict | None:
        """Return demo movie by ID."""
        for movie in DEMO_MOVIES:
            if movie["id"] == movie_id:
                return {
                    "id": movie["id"],
                    "title": movie["title"],
                    "poster": movie["poster"],
                    "year": movie["year"],
                    "rating": movie["rating"],
                    "description": movie["description"],
                    "genre": movie["genre"],
                    "duration": movie["duration"],
                    "duration_seconds": 0,
                    "language": movie["language"],
                    "country": movie["country"],
                    "content_rating": movie["content_rating"],
                    "subject_type": 1,
                    "seasons": 0,
                    "viewers": 0,
                    "available_qualities": [
                        {"quality": s["quality"], "resolution": int(s["quality"].replace("p", "")), "codec": s["codec"], "episodes": 1}
                        for s in movie.get("streams", [])
                    ],
                    "aka": "",
                    "subtitles": movie.get("subtitles", []),
                    "dubs": [],
                    "streams": movie.get("streams", []),
                    "source": "demo_fallback"
                }
        return None


class MovieBoxAPIError(Exception):
    """Exception raised for MovieBox API errors."""
    pass


# =============================================================================
# CLI / STANDALONE RUNNER
# =============================================================================

def print_json(data: Any) -> None:
    """Pretty print data as JSON."""
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))


async def main():
    """CLI entry point for testing the scraper."""
    import sys
    import argparse

    parser = argparse.ArgumentParser(description="MovieBox Scraper")
    parser.add_argument("action", choices=["search", "details", "streams", "test"],
                        help="Action to perform")
    parser.add_argument("--query", "-q", help="Search query")
    parser.add_argument("--id", help="Movie ID")
    parser.add_argument("--season", "-s", type=int, default=0, help="Season number")
    parser.add_argument("--episode", "-e", type=int, default=0, help="Episode number")
    parser.add_argument("--no-fallback", action="store_true", help="Disable demo fallback")
    parser.add_argument("--no-mpd-parse", action="store_true", help="Skip MPD manifest parsing")

    args = parser.parse_args()

    scraper = MovieBoxScraper(
        use_demo_fallback=not args.no_fallback,
        parse_mpd=not args.no_mpd_parse
    )

    if args.action == "search":
        if not args.query:
            print("Error: --query required for search")
            sys.exit(1)
        print(f"\nSearching for: {args.query}")
        print("=" * 60)
        results = await scraper.search_movies(args.query)
        print(f"\nFound {len(results)} results:\n")
        print_json(results)

    elif args.action == "details":
        if not args.id:
            print("Error: --id required for details")
            sys.exit(1)
        print(f"\nGetting details for: {args.id}")
        print("=" * 60)
        details = await scraper.get_movie_details(args.id)
        print_json(details)

    elif args.action == "streams":
        if not args.id:
            print("Error: --id required for streams")
            sys.exit(1)
        print(f"\nGetting streams for: {args.id}")
        print("=" * 60)
        streams = await scraper.get_streams(args.id, args.season, args.episode)
        print_json(streams)

    elif args.action == "test":
        print("\n" + "=" * 60)
        print("MOVIE BOX SCRAPER - STREAMING URL TEST SUITE")
        print("=" * 60)

        # Test 1: Search
        for query in ["Avatar", "Inception"]:
            print(f"\n--- Test: Search '{query}' ---")
            try:
                results = await scraper.search_movies(query)
                print(f"Found {len(results)} results")
                for r in results[:3]:
                    src = r.get('source', 'api')
                    print(f"  - {r['title']} ({r.get('year', 'N/A')}) [{src}]")
            except Exception as e:
                print(f"Error: {e}")

        # Test 2: Get streams with MPD parsing
        print("\n--- Test: Get Streaming URLs (with MPD parsing) ---")
        test_ids = ["8906247916759695608"]  # Avatar
        for tid in test_ids:
            try:
                streams_data = await scraper.get_streams(tid)
                print(f"\nTitle: {streams_data.get('title', 'N/A')}")
                print(f"Format: {streams_data.get('streaming_format', 'unknown')}")
                print(f"Source: {streams_data.get('source', 'unknown')}")
                print(f"Stream URLs:")
                for s in streams_data.get('streams', []):
                    q = s.get('quality', 'unknown')
                    t = s.get('type', s.get('format', 'unknown'))
                    codec = s.get('codec', '')
                    bw = s.get('bandwidth', 0)
                    url = s.get('url', '')
                    print(f"  - {q} ({t}/{codec}, {bw}bps): {url[:90]}...")
                print(f"Subtitles: {len(streams_data.get('subtitles', []))}")
            except Exception as e:
                print(f"Error: {e}")

        # Test 3: JSON output validation
        print("\n--- Test: JSON Output Format ---")
        try:
            results = await scraper.search_movies("Avatar")
            if results:
                sample = results[0]
                required_keys = ["id", "title", "poster", "year", "rating", "description", "genre"]
                missing = [k for k in required_keys if k not in sample]
                if missing:
                    print(f"MISSING keys: {missing}")
                else:
                    print("All required keys present")
                print(f"JSON valid: {json.dumps(sample, default=str) is not None}")
        except Exception as e:
            print(f"Error: {e}")

        print("\n" + "=" * 60)
        print("TEST COMPLETE")
        print("=" * 60)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
