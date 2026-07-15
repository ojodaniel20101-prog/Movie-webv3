#!/usr/bin/env python3
"""
Movie Scraper - Multi-Source Movie Streaming & Download Tool
===========================================================

A comprehensive CLI tool that scrapes multiple sources to provide:
  - Movie search by title
  - Stream URLs (proxied for CORS compatibility)
  - Trailer URLs (direct MP4 links)
  - Download URLs with quality options
  - Rich metadata (cast, ratings, subtitles, etc.)

Sources:
  - GZMovie API (gzmovieboxapi.septorch.tech) - Primary source for search, streams, downloads
  - XCASPER API (movieapi.xcasper.space) - Supplementary trailer & metadata

Usage:
    python movie_scraper.py
    python movie_scraper.py --query "Avatar"
    python movie_scraper.py --query "Avengers" --save results.json
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

VERSION = "1.0.0"
TIMEOUT = 30
MAX_RETRIES = 3

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

# ═══════════════════════════════════════════════════════════════
# ANSI COLOR CODES
# ═══════════════════════════════════════════════════════════════

class Colors:
    """ANSI color codes for terminal output."""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    UNDERLINE = "\033[4m"

    # Foreground colors
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"

    # Bright colors
    BRIGHT_BLACK = "\033[90m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"

    # Background colors
    BG_BLACK = "\033[40m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"
    BG_BLUE = "\033[44m"
    BG_MAGENTA = "\033[45m"
    BG_CYAN = "\033[46m"
    BG_WHITE = "\033[47m"


# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def supports_color() -> bool:
    """Check if the terminal supports ANSI color codes."""
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    return sys.stdout.isatty() and os.environ.get("TERM") not in ("dumb", "")


def c(text: str, color: str = "", bold: bool = False) -> str:
    """Colorize text if terminal supports colors."""
    if not supports_color():
        return text
    result = ""
    if bold:
        result += Colors.BOLD
    result += color + text + Colors.RESET
    return result


def format_duration(seconds: int) -> str:
    """Convert seconds to human-readable duration."""
    if seconds <= 0:
        return "N/A"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def format_file_size(size_str: str) -> str:
    """Convert size in bytes to human-readable format."""
    try:
        size = int(size_str)
        if size < 1024:
            return f"{size} B"
        elif size < 1024 ** 2:
            return f"{size / 1024:.1f} KB"
        elif size < 1024 ** 3:
            return f"{size / (1024 ** 2):.1f} MB"
        else:
            return f"{size / (1024 ** 3):.2f} GB"
    except (ValueError, TypeError):
        return "Unknown"


def truncate(text: str, max_length: int = 60) -> str:
    """Truncate text to max length with ellipsis."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def create_session() -> requests.Session:
    """Create a requests session with retry strategy."""
    session = requests.Session()
    retry_strategy = Retry(
        total=MAX_RETRIES,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=10)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(HEADERS)
    return session


# ═══════════════════════════════════════════════════════════════
# API CLIENTS
# ═══════════════════════════════════════════════════════════════

class GZMovieAPI:
    """Client for the GZMovie API - primary source for search, streams, and downloads."""

    BASE_URL = "https://gzmovieboxapi.septorch.tech"

    def __init__(self, session: requests.Session):
        self.session = session

    def search(self, query: str, subject_type: str = "ALL", page: int = 1, per_page: int = 24) -> dict:
        """Search for movies and TV series by title."""
        url = f"{self.BASE_URL}/api/search"
        params = {
            "query": query,
            "subjectType": subject_type,
            "page": page,
            "perPage": per_page,
        }
        resp = self.session.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def get_item_details(self, subject_id: str) -> dict:
        """Get detailed information about a specific movie/series."""
        url = f"{self.BASE_URL}/api/item-details"
        params = {"subjectId": subject_id}
        resp = self.session.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def get_media(self, subject_id: str, detail_path: str, season: int = 0, episode: int = 0) -> dict:
        """Get streaming and download links."""
        url = f"{self.BASE_URL}/api/media"
        params = {
            "subjectId": subject_id,
            "detailPath": detail_path,
            "season": season,
            "episode": episode,
        }
        resp = self.session.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()


class XCasperAPI:
    """Client for the XCASPER API - supplementary trailer & metadata."""

    BASE_URL = "https://movieapi.xcasper.space"

    def __init__(self, session: requests.Session):
        self.session = session

    def get_rich_detail(self, subject_id: str) -> dict:
        """Get rich details including direct trailer URL."""
        url = f"{self.BASE_URL}/api/rich-detail"
        params = {"subjectId": subject_id}
        resp = self.session.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()


# ═══════════════════════════════════════════════════════════════
# MOVIE SCRAPER
# ═══════════════════════════════════════════════════════════════

class MovieScraper:
    """Main scraper class that coordinates data from multiple sources."""

    def __init__(self):
        self.session = create_session()
        self.gzmovie = GZMovieAPI(self.session)
        self.xcasper = XCasperAPI(self.session)

    def search_movies(self, query: str, max_results: int = 10) -> list[dict]:
        """Search for movies and return parsed results."""
        result = self.gzmovie.search(query, per_page=max_results)
        if not result.get("success") and result.get("status") != "success":
            code = result.get("statusCode", result.get("code", "unknown"))
            error_msg = result.get("error", result.get("message", "Unknown error"))
            raise RuntimeError(f"Search failed (HTTP {code}): {error_msg}")

        items = result.get("data", {}).get("items", [])
        if not items:
            return []

        movies = []
        for item in items[:max_results]:
            subject_type = "Movie" if item.get("subjectType") == 1 else "TV Series"
            duration_sec = item.get("duration", 0)
            duration = duration_sec if duration_sec > 0 else None

            movie = {
                "subject_id": str(item.get("subjectId", "")),
                "title": item.get("title", "Unknown"),
                "type": subject_type,
                "year": (item.get("releaseDate", "")[:4] if item.get("releaseDate") else "N/A"),
                "genre": item.get("genre", "N/A"),
                "country": item.get("countryName", "N/A"),
                "imdb_rating": item.get("imdbRatingValue", "N/A"),
                "imdb_count": item.get("imdbRatingCount", 0),
                "description": item.get("description", ""),
                "duration": duration,
                "duration_formatted": format_duration(duration) if duration else "N/A",
                "cover_url": item.get("cover", {}).get("url", ""),
                "still_url": (item.get("stills") or {}).get("url", ""),
                "detail_path": item.get("detailPath", ""),
                "has_resource": item.get("hasResource", False),
                "subtitles": item.get("subtitles", ""),
            }
            movies.append(movie)

        return movies

    def get_movie_details(self, subject_id: str) -> dict:
        """Get full movie details including trailer, cast, and metadata."""
        # Get details from GZMovie API
        gz_result = self.gzmovie.get_item_details(subject_id)
        gz_data = gz_result.get("data", {})
        subject = gz_data.get("subject", {})
        stars = gz_data.get("stars", [])

        # Extract trailer URL
        trailer_url = ""
        trailer_cover = ""
        trailer_data = subject.get("trailer")
        if trailer_data and trailer_data.get("videoAddress"):
            trailer_url = trailer_data["videoAddress"].get("url", "")
            trailer_cover = (trailer_data.get("cover") or {}).get("url", "")

        # Try XCASPER API as supplementary source for trailer
        if not trailer_url:
            try:
                xc_result = self.xcasper.get_rich_detail(subject_id)
                xc_data = xc_result.get("data", {})
                trailer_url = xc_data.get("trailerUrl", "")
                trailer_cover = xc_data.get("trailerCover", "")
            except Exception:
                pass

        # Parse cast
        cast = []
        for star in stars:
            cast.append({
                "name": star.get("name", ""),
                "character": star.get("character", ""),
                "avatar": star.get("avatarUrl", ""),
            })

        # Parse resource info
        resource = gz_data.get("resource", {})
        source_site = resource.get("source", "")
        seasons_info = []
        for season_data in resource.get("seasons", []):
            resolutions = []
            for res in season_data.get("resolutions", []):
                resolutions.append({
                    "resolution": res.get("resolution", 0),
                    "episodes": res.get("epNum", 0),
                })
            seasons_info.append({
                "season": season_data.get("se", 0),
                "max_episode": season_data.get("maxEp", 0),
                "resolutions": resolutions,
            })

        release_date = subject.get("releaseDate", "")
        year = release_date[:4] if release_date else "N/A"

        return {
            "subject_id": subject_id,
            "title": subject.get("title", ""),
            "type": "Movie" if subject.get("subjectType") == 1 else "TV Series",
            "description": subject.get("description", ""),
            "release_date": release_date,
            "year": year,
            "genre": subject.get("genre", ""),
            "country": subject.get("countryName", ""),
            "imdb_rating": subject.get("imdbRatingValue", ""),
            "imdb_count": subject.get("imdbRatingCount", 0),
            "duration": subject.get("duration", 0),
            "duration_formatted": format_duration(subject.get("duration", 0)),
            "cover_url": subject.get("cover", {}).get("url", ""),
            "still_url": (subject.get("stills") or {}).get("url", ""),
            "trailer_url": trailer_url,
            "trailer_cover": trailer_cover,
            "cast": cast,
            "source_site": source_site,
            "seasons": seasons_info,
            "subtitles": subject.get("subtitles", ""),
            "has_resource": subject.get("hasResource", False),
        }

    def get_media_links(self, subject_id: str, detail_path: str) -> dict:
        """Get streaming and download links for a movie."""
        result = self.gzmovie.get_media(subject_id, detail_path)
        media_data = result.get("data", {})

        # Parse download/stream links
        downloads_raw = media_data.get("downloads", {})
        downloads_list = downloads_raw.get("data", {}).get("downloads", []) if isinstance(downloads_raw, dict) else []

        streams = []
        downloads = []

        for item in downloads_list:
            resolution = item.get("resolution", 0)
            quality = f"{resolution}p" if resolution else "Unknown"
            size_str = item.get("size", "0")
            duration = item.get("duration", 0)

            stream_entry = {
                "quality": quality,
                "format": "MP4",
                "size_bytes": size_str,
                "size_formatted": format_file_size(size_str),
                "duration_seconds": duration,
                "duration_formatted": format_duration(duration),
                "stream_url": item.get("streamUrl", ""),  # Proxied (CORS-friendly)
                "direct_url": item.get("url", ""),  # Direct (may need proxy)
            }
            streams.append(stream_entry)

            download_entry = {
                "quality": quality,
                "format": "MP4",
                "size_formatted": format_file_size(size_str),
                "download_url": item.get("downloadUrl", ""),  # Proxied download
                "direct_url": item.get("url", ""),
            }
            downloads.append(download_entry)

        # Sort by quality (highest first)
        def _quality_key(x):
            try:
                return int(x["quality"].replace("p", "").replace("Unknown", "0").strip() or 0)
            except (ValueError, AttributeError):
                return 0
        streams.sort(key=_quality_key, reverse=True)
        downloads.sort(key=_quality_key, reverse=True)

        # Parse subtitles
        subtitles = []
        subs_list = downloads_raw.get("data", {}).get("captions", []) if isinstance(downloads_raw, dict) else []
        for sub in subs_list:
            subtitles.append({
                "language": sub.get("lanName", sub.get("lan", "")),
                "code": sub.get("lan", ""),
                "url": sub.get("url", ""),
            })

        return {
            "streams": streams,
            "downloads": downloads,
            "subtitles": subtitles,
            "has_resource": media_data.get("downloads", {}).get("data", {}).get("downloads", []) != [] if isinstance(media_data.get("downloads"), dict) else False,
        }

    def get_full_movie_data(self, subject_id: str, detail_path: str) -> dict:
        """Get complete movie data: details + media links."""
        details = self.get_movie_details(subject_id)
        media = self.get_media_links(subject_id, detail_path)

        return {
            **details,
            "streams": media["streams"],
            "downloads": media["downloads"],
            "subtitle_tracks": media["subtitles"],
        }


# ═══════════════════════════════════════════════════════════════
# UI / DISPLAY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def print_banner():
    """Print the application banner."""
    banner = f"""
{c("╔══════════════════════════════════════════════════════════════════╗", Colors.CYAN, bold=True)}
{c("║                                                                  ║", Colors.CYAN)}
{c("║", Colors.CYAN)}   {c("Movie Scraper", Colors.BRIGHT_CYAN, bold=True)} {c(f"v{VERSION}", Colors.DIM)}                                   {c("║", Colors.CYAN)}
{c("║", Colors.CYAN)}   {c("Multi-Source Movie Streaming & Download Tool", Colors.BRIGHT_BLACK)}          {c("║", Colors.CYAN)}
{c("║                                                                  ║", Colors.CYAN)}
{c("║", Colors.CYAN)}   Sources: {c("GZMovie API", Colors.BRIGHT_GREEN)}  |  {c("XCASPER API", Colors.BRIGHT_GREEN)}                       {c("║", Colors.CYAN)}
{c("║", Colors.CYAN)}   Features: {c("Search", Colors.BRIGHT_YELLOW)} · {c("Stream", Colors.BRIGHT_YELLOW)} · {c("Download", Colors.BRIGHT_YELLOW)} · {c("Trailers", Colors.BRIGHT_YELLOW)} · {c("Metadata", Colors.BRIGHT_YELLOW)}       {c("║", Colors.CYAN)}
{c("║                                                                  ║", Colors.CYAN)}
{c("╚══════════════════════════════════════════════════════════════════╝", Colors.CYAN, bold=True)}
"""
    print(banner)


def print_search_results(movies: list[dict]):
    """Print search results in a formatted table."""
    if not movies:
        print(c("\n  No results found.\n", Colors.YELLOW))
        return

    count = len(movies)
    print(c(f"\n  Found {count} result(s):\n", Colors.BRIGHT_GREEN, bold=True))

    # Table header
    header = f"  {c(' # ', Colors.BOLD)} │ {c(' Title', Colors.BOLD):42} │ {c('Type', Colors.BOLD):10} │ {c('Year', Colors.BOLD):6} │ {c('IMDb', Colors.BOLD):6} │ {c('Genre', Colors.BOLD):20}"
    sep = "  " + "─" * 4 + "┼" + "─" * 43 + "┼" + "─" * 11 + "┼" + "─" * 7 + "┼" + "─" * 7 + "┼" + "─" * 21
    print(header)
    print(sep)

    for i, movie in enumerate(movies, 1):
        title = truncate(movie["title"], 40)
        movie_type = movie["type"]
        year = movie["year"]
        imdb = movie["imdb_rating"] if movie["imdb_rating"] else "N/A"
        genre = truncate(movie["genre"], 18)

        type_color = Colors.BRIGHT_CYAN if movie_type == "Movie" else Colors.BRIGHT_MAGENTA

        row = (
            f"  {c(f'{i:>2}', Colors.BRIGHT_YELLOW)} │ "
            f"{title:42} │ "
            f"{c(movie_type, type_color):10} │ "
            f"{year:6} │ "
            f"{c(imdb, Colors.BRIGHT_YELLOW):6} │ "
            f"{genre:20}"
        )
        print(row)

    print()


def print_movie_details(movie: dict):
    """Print detailed movie information."""
    print()
    print(c("  ┌─────────────────────────────────────────────────────────────────┐", Colors.CYAN))
    print(c("  │", Colors.CYAN) + f" {c(movie['title'], Colors.BRIGHT_WHITE, bold=True):63}" + c("│", Colors.CYAN))
    print(c("  ├─────────────────────────────────────────────────────────────────┤", Colors.CYAN))

    # Basic info
    type_color = Colors.BRIGHT_CYAN if movie["type"] == "Movie" else Colors.BRIGHT_MAGENTA
    info_lines = [
        ("Type", c(movie["type"], type_color)),
        ("Year", movie["year"]),
        ("Genre", movie["genre"]),
        ("Country", movie["country"]),
        ("Duration", movie["duration_formatted"]),
        ("IMDb Rating", c(f"{movie['imdb_rating']} ({movie['imdb_count']:,} ratings)", Colors.BRIGHT_YELLOW) if movie["imdb_rating"] else "N/A"),
        ("Source", movie.get("source_site", "N/A")),
    ]

    for label, value in info_lines:
        print(f"  {c('│', Colors.CYAN)} {c(f'{label}:', Colors.BRIGHT_BLACK):15} {value:50} {c('│', Colors.CYAN)}")

    # Description
    print(c("  ├─────────────────────────────────────────────────────────────────┤", Colors.CYAN))
    desc = movie.get("description", "No description available.")
    if desc:
        # Word wrap description
        words = desc.split()
        lines = []
        current = ""
        for word in words:
            if len(current) + len(word) + 1 <= 62:
                current += " " + word if current else word
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)

        for line in lines[:5]:  # Max 5 lines
            print(f"  {c('│', Colors.CYAN)} {line:64} {c('│', Colors.CYAN)}")
        if len(lines) > 5:
            print(f"  {c('│', Colors.CYAN)} {'...':64} {c('│', Colors.CYAN)}")

    print(c("  └─────────────────────────────────────────────────────────────────┘", Colors.CYAN))

    # Trailer
    trailer_url = movie.get("trailer_url", "")
    if trailer_url:
        print()
        print(c("  ▶ TRAILER", Colors.BRIGHT_GREEN, bold=True))
        print(f"    URL: {c(trailer_url, Colors.BRIGHT_BLUE, bold=True)}")
        print(f"    Cover: {movie.get('trailer_cover', 'N/A')}")

    # Cast
    cast = movie.get("cast", [])
    if cast:
        print()
        print(c("  ★ CAST", Colors.BRIGHT_YELLOW, bold=True))
        for i, actor in enumerate(cast[:8], 1):
            name = actor.get("name", "")
            character = actor.get("character", "")
            char_str = f" as {c(character, Colors.DIM)}" if character else ""
            print(f"    {i:2}. {name}{char_str}")
        if len(cast) > 8:
            print(f"    ... and {len(cast) - 8} more")

    # Streams
    streams = movie.get("streams", [])
    if streams:
        print()
        print(c("  ▶ STREAM URLS (CORS-Enabled via Proxy)", Colors.BRIGHT_GREEN, bold=True))
        for stream in streams:
            quality = stream["quality"]
            size = stream["size_formatted"]
            duration = stream["duration_formatted"]
            stream_url = stream["stream_url"]
            print(f"    {c(quality, Colors.BRIGHT_CYAN, bold=True):8} │ {size:10} │ {duration:8} │ {c(stream_url, Colors.BRIGHT_BLUE)}")

    # Downloads
    downloads = movie.get("downloads", [])
    if downloads:
        print()
        print(c("  ▼ DOWNLOAD URLS", Colors.BRIGHT_MAGENTA, bold=True))
        for dl in downloads:
            quality = dl["quality"]
            size = dl["size_formatted"]
            dl_url = dl["download_url"]
            print(f"    {c(quality, Colors.BRIGHT_CYAN, bold=True):8} │ {size:10} │ {c(dl_url, Colors.BRIGHT_BLUE)}")

    # Subtitles
    subtitles = movie.get("subtitle_tracks", [])
    if subtitles:
        print()
        print(c("  🗣 SUBTITLE TRACKS", Colors.BRIGHT_CYAN, bold=True))
        langs = [sub["language"] for sub in subtitles[:10]]
        print(f"    {', '.join(langs)}")
        if len(subtitles) > 10:
            print(f"    ... and {len(subtitles) - 10} more")

    print()


def print_json_output(movie: dict):
    """Print movie data as formatted JSON."""
    print(json.dumps(movie, indent=2, ensure_ascii=False))


def save_to_file(movie: dict, filepath: str):
    """Save movie data to a JSON file."""
    output = {
        "scraped_at": datetime.now().isoformat(),
        "tool": f"Movie Scraper v{VERSION}",
        "movie": movie,
    }
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(c(f"  Results saved to: {filepath}", Colors.BRIGHT_GREEN, bold=True))


# ═══════════════════════════════════════════════════════════════
# INTERACTIVE MODE
# ═══════════════════════════════════════════════════════════════

def interactive_mode(scraper: MovieScraper):
    """Run the scraper in interactive mode."""
    print_banner()

    while True:
        try:
            query = input(c("  Search movie: ", Colors.BRIGHT_GREEN, bold=True)).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            print(c("  Goodbye!", Colors.CYAN, bold=True))
            break

        if not query:
            continue

        if query.lower() in ("quit", "exit", "q"):
            print(c("  Goodbye!", Colors.CYAN, bold=True))
            break

        try:
            print(c(f"  Searching for '{query}'...", Colors.DIM))
            movies = scraper.search_movies(query, max_results=10)

            if not movies:
                print(c(f"  No results found for '{query}'.", Colors.YELLOW))
                continue

            print_search_results(movies)

            # Ask user to select a movie
            try:
                choice = input(c("  Select a movie (number) or press Enter to search again: ", Colors.BRIGHT_CYAN)).strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break

            if not choice:
                continue

            try:
                idx = int(choice) - 1
                if idx < 0 or idx >= len(movies):
                    print(c("  Invalid selection.", Colors.RED))
                    continue
            except ValueError:
                print(c("  Invalid input. Please enter a number.", Colors.RED))
                continue

            selected = movies[idx]
            subject_id = selected["subject_id"]
            detail_path = selected["detail_path"]

            print(c(f"  Fetching details for '{selected['title']}'...", Colors.DIM))
            movie_data = scraper.get_full_movie_data(subject_id, detail_path)
            print_movie_details(movie_data)

            # Ask to save
            try:
                save_choice = input(c("  Save to file? (y/n/filename): ", Colors.BRIGHT_YELLOW)).strip().lower()
            except (EOFError, KeyboardInterrupt):
                print()
                break

            if save_choice in ("y", "yes"):
                safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in selected["title"]).strip()
                filename = f"{safe_title}.json"
                save_to_file(movie_data, filename)
            elif save_choice and save_choice not in ("n", "no"):
                save_to_file(movie_data, save_choice)

        except Exception as e:
            print(c(f"  Error: {e}", Colors.RED))
            continue


def search_and_display(scraper: MovieScraper, query: str, max_results: int = 10):
    """Search for movies and display results (non-interactive)."""
    print(c(f"Searching for '{query}'...", Colors.DIM))
    movies = scraper.search_movies(query, max_results=max_results)
    print_search_results(movies)
    return movies


def detail_and_display(scraper: MovieScraper, subject_id: str, detail_path: str, json_output: bool = False):
    """Get movie details and display (non-interactive)."""
    print(c(f"Fetching details for subject ID: {subject_id}...", Colors.DIM))
    movie_data = scraper.get_full_movie_data(subject_id, detail_path)
    if json_output:
        print_json_output(movie_data)
    else:
        print_movie_details(movie_data)
    return movie_data


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Movie Scraper - Search, stream, and download movies",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                              # Interactive mode
  %(prog)s --query "Avatar"             # Search for movies
  %(prog)s --query "Avengers" --limit 5 # Search with limit
  %(prog)s --id ID --path PATH          # Get details by ID and path
  %(prog)s --query "Avatar" --json      # Output as JSON
  %(prog)s --query "Avatar" --save out.json  # Save to file
        """,
    )
    parser.add_argument("--query", "-q", help="Search query (movie title)")
    parser.add_argument("--id", help="Subject ID for direct lookup")
    parser.add_argument("--path", help="Detail path for direct lookup")
    parser.add_argument("--limit", "-l", type=int, default=10, help="Maximum search results (default: 10)")
    parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
    parser.add_argument("--save", "-s", help="Save results to file")
    parser.add_argument("--version", "-v", action="version", version=f"%(prog)s {VERSION}")

    args = parser.parse_args()

    scraper = MovieScraper()

    # If no arguments, run interactive mode
    if not args.query and not args.id:
        interactive_mode(scraper)
        return

    # Search mode
    if args.query:
        movies = search_and_display(scraper, args.query, args.limit)
        if not movies:
            sys.exit(1)

        # If only one result, automatically show details
        if len(movies) == 1:
            movie_data = detail_and_display(
                scraper, movies[0]["subject_id"], movies[0]["detail_path"], args.json
            )
            if args.save:
                save_to_file(movie_data, args.save)
        elif args.id and args.path:
            movie_data = detail_and_display(scraper, args.id, args.path, args.json)
            if args.save:
                save_to_file(movie_data, args.save)

    # Direct ID lookup
    elif args.id and args.path:
        movie_data = detail_and_display(scraper, args.id, args.path, args.json)
        if args.save:
            save_to_file(movie_data, args.save)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
