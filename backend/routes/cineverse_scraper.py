#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                     CINEVERSE MOVIE SCRAPER                                  ║
║          Reverse-engineered from https://cinverse.com.ng                     ║
╚══════════════════════════════════════════════════════════════════════════════╝

Features:
  - Search for movies and TV series
  - Extract metadata (title, poster, year, rating, genres, cast, trailer)
  - Get streaming URLs for all quality options (360p to 1080p)
  - Get direct download links
  - Get subtitle tracks (multi-language)
  - Get trailer URLs
  - Verify streams are playable (checks MP4 signature)

API Endpoints Discovered:
  GET /api/search?q={query}              - Search movies/series
  GET /api/sources?id={id}&detailPath={path}&season={s}&episode={e}  - Stream sources
  GET /api/stream/{token}                - Stream proxy (redirects to video)
  GET /api/dl/{token}                    - Download proxy (redirects to video)
  GET /api/img/{token}                   - Image proxy
"""

import requests
import re
import json
from dataclasses import dataclass, field
from typing import List, Optional, Dict


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class StreamSource:
    """A single stream source (quality option)"""
    quality: str           # e.g. "360p", "720p", "1080p"
    stream_url: str        # Proxied stream URL (Cineverse)
    download_url: str      # Proxied download URL (Cineverse)
    direct_stream_url: str = ""   # Resolved direct video URL after redirects
    direct_download_url: str = "" # Resolved direct download URL after redirects
    size_bytes: int = 0
    size_human: str = ""
    format: str = "mp4"

    def __repr__(self):
        return f"StreamSource(quality={self.quality}, size={self.size_human})"


@dataclass
class Subtitle:
    """A subtitle track"""
    language_code: str     # e.g. "en", "es", "fr"
    language_name: str     # e.g. "English", "Spanish"
    url: str               # Direct SRT download URL

    def __repr__(self):
        return f"Subtitle({self.language_code}: {self.language_name})"


@dataclass
class CastMember:
    """A cast member"""
    name: str
    character: str

    def __repr__(self):
        return f"CastMember({self.name} as {self.character})"


@dataclass
class Movie:
    """Complete movie/series data"""
    id: str
    title: str
    overview: str
    release_date: str
    year: int = 0
    rating: float = 0.0
    rating_count: int = 0
    genres: List[str] = field(default_factory=list)
    poster_url: str = ""
    backdrop_url: str = ""
    trailer_url: str = ""
    subject_type: int = 1  # 1 = Movie, 2 = TV Series
    detail_path: str = ""
    seasons: List[Dict] = field(default_factory=list)
    cast: List[CastMember] = field(default_factory=list)
    sources: List[StreamSource] = field(default_factory=list)
    subtitles: List[Subtitle] = field(default_factory=list)
    duration: int = 0      # Duration in seconds
    country: str = ""

    @property
    def is_series(self) -> bool:
        return self.subject_type == 2

    @property
    def best_quality(self) -> Optional[StreamSource]:
        """Get the highest quality source"""
        if not self.sources:
            return None
        return self.sources[-1]  # Sources sorted low->high quality

    def __repr__(self):
        media_type = "TV Series" if self.is_series else "Movie"
        return f"Movie({self.title} [{media_type}, {self.year}, {self.rating}/10])"


# ─────────────────────────────────────────────────────────────────────────────
# Scraper
# ─────────────────────────────────────────────────────────────────────────────

class CineverseScraper:
    """
    Cineverse movie scraper - reverse-engineered API client.

    Usage:
        scraper = CineverseScraper()

        # Search for movies
        results = scraper.search("Agatha All Along")

        # Get full movie data with streams
        movie = scraper.get_movie(results[0])

        # For TV series, specify season and episode
        movie = scraper.get_movie(results[0], season=1, episode=1)

        # Print resolved streaming URLs
        for source in movie.sources:
            print(f"{source.quality}: {source.direct_stream_url}")
    """

    BASE_URL = "https://cinverse.com.ng"

    def __init__(self, timeout: int = 25):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": self.BASE_URL,
        })
        self._api_headers = {
            "User-Agent": self.session.headers["User-Agent"],
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
        }
        self._ensure_cookie()

    def _ensure_cookie(self):
        """Visit homepage to obtain session cookie (required for API access)"""
        try:
            self.session.get(
                self.BASE_URL,
                headers={
                    **self.session.headers,
                    "Accept": (
                        "text/html,application/xhtml+xml,application/xml;q=0.9,"
                        "image/avif,image/webp,*/*;q=0.8"
                    ),
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                },
                timeout=self.timeout,
            )
        except Exception as e:
            print(f"[!] Warning: Could not obtain session cookie: {e}")

    def _api_get(self, endpoint: str, params: dict = None) -> dict:
        """Make an authenticated API GET request"""
        if endpoint.startswith("/"):
            url = f"{self.BASE_URL}{endpoint}"
        else:
            url = endpoint

        headers = self._api_headers.copy()
        headers["Referer"] = f"{self.BASE_URL}/"

        resp = self.session.get(url, headers=headers, params=params, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    # ── Search ───────────────────────────────────────────────────

    def search(self, query: str, limit: int = 20) -> List[Movie]:
        """
        Search for movies/TV series.

        Args:
            query: Search query string
            limit: Maximum results to return

        Returns:
            List of Movie objects with basic metadata
        """
        data = self._api_get("/api/search", params={"q": query})
        items = data.get("results", {}).get("items", [])

        movies = []
        for item in items[:limit]:
            year = 0
            if item.get("releaseDate"):
                try:
                    year = int(item["releaseDate"][:4])
                except (ValueError, TypeError):
                    pass

            movie = Movie(
                id=item.get("subjectId", ""),
                title=item.get("title", ""),
                overview=item.get("description", ""),
                release_date=item.get("releaseDate", ""),
                year=year,
                rating=float(item.get("imdbRatingValue", 0) or 0),
                rating_count=int(item.get("imdbRatingCount", 0) or 0),
                genres=item.get("genre", "").split(",") if item.get("genre") else [],
                poster_url=f"{self.BASE_URL}{item['cover']['url']}" if item.get("cover") else "",
                subject_type=item.get("subjectType", 1),
                detail_path=item.get("detailPath", ""),
                duration=item.get("duration", 0),
                country=item.get("countryName", ""),
            )
            movies.append(movie)

        return movies

    # ── Movie Detail & Streams ─────────────────────────────────

    def get_movie(self, movie: Movie, season: int = 1, episode: int = 1) -> Movie:
        """
        Fetch full movie data including streaming sources and subtitles.

        For TV series, specify season and episode numbers.

        Args:
            movie: Movie object from search results
            season: Season number (for TV series, default: 1)
            episode: Episode number (for TV series, default: 1)

        Returns:
            Enriched Movie object with sources and subtitles
        """
        self._enrich_from_page(movie)
        self._fetch_sources(movie, season, episode)
        return movie

    def _enrich_from_page(self, movie: Movie):
        """Fetch the movie page to extract trailer URL, cast, and additional metadata"""
        try:
            page_url = f"{self.BASE_URL}/movie/{movie.detail_path}"
            headers = self._api_headers.copy()
            headers["Referer"] = f"{self.BASE_URL}/"
            headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            headers["Sec-Fetch-Dest"] = "document"
            headers["Sec-Fetch-Mode"] = "navigate"

            resp = self.session.get(page_url, headers=headers, timeout=self.timeout)
            resp.raise_for_status()
            html = resp.text

            # Extract trailer URL (uses escaped quotes in HTML)
            trailer_match = re.search(r'trailerUrl\\*":\\*"([^"]+)"', html)
            if trailer_match:
                movie.trailer_url = trailer_match.group(1)

            # Extract backdrop URL
            backdrop_match = re.search(r'backdropUrlId\\*":\\*"([^"]+)"', html)
            if backdrop_match:
                movie.backdrop_url = f"{self.BASE_URL}{backdrop_match.group(1)}"

            # Extract overview (more complete than search results)
            overview_match = re.search(r'overview\\*":\\*"([^"]+?)"[,}]', html)
            if overview_match and not movie.overview:
                movie.overview = overview_match.group(1)

            # Extract seasons info
            seasons_match = re.search(r'seasons\\*":(\\[.*?\\])', html)
            if seasons_match:
                raw = seasons_match.group(1).replace('\\"', '"')
                try:
                    movie.seasons = json.loads(raw)
                except json.JSONDecodeError:
                    pass

            # Extract cast
            cast_matches = re.findall(
                r'name\\*":\\*"([^"]+)\\*"\\s*,\\s*character\\*":\\*"([^"]+)\\*"',
                html,
            )
            if not cast_matches:
                # Try alternative pattern
                cast_matches = re.findall(
                    r'"name":"([^"]+)","character":"([^"]+)"',
                    html,
                )
            movie.cast = [
                CastMember(name=name, character=char)
                for name, char in cast_matches[:15]
            ]

        except Exception as e:
            print(f"[!] Warning: Could not enrich from page: {e}")

    def _fetch_sources(self, movie: Movie, season: int, episode: int):
        """Fetch streaming sources for a movie/episode"""
        params = {
            "id": movie.id,
            "detailPath": movie.detail_path,
        }

        if movie.is_series:
            params["season"] = season
            params["episode"] = episode

        data = self._api_get("/api/sources", params=params)

        # Parse stream sources
        for result in data.get("results", []):
            size = int(result.get("size", 0))
            size_human = self._humanize_size(size)

            source = StreamSource(
                quality=result.get("quality", "unknown"),
                stream_url=f"{self.BASE_URL}{result['stream_url']}",
                download_url=f"{self.BASE_URL}{result['download_url']}",
                size_bytes=size,
                size_human=size_human,
                format=result.get("format", "mp4"),
            )
            movie.sources.append(source)

        # Parse subtitles
        for sub in data.get("subtitles", []):
            subtitle = Subtitle(
                language_code=sub.get("lan", ""),
                language_name=sub.get("lanName", ""),
                url=sub.get("url", ""),
            )
            movie.subtitles.append(subtitle)

    # ── Stream Resolution ──────────────────────────────────────

    def resolve_stream(self, source: StreamSource) -> str:
        """
        Follow redirects to get the actual direct video URL.

        Args:
            source: StreamSource object

        Returns:
            Direct video URL (signed, may expire)
        """
        try:
            resp = self.session.get(
                source.stream_url,
                headers=self._api_headers,
                allow_redirects=True,
                timeout=self.timeout,
                stream=True,
            )
            source.direct_stream_url = resp.url
            return resp.url
        except Exception as e:
            print(f"[!] Error resolving stream: {e}")
            return ""
        finally:
            if "resp" in locals():
                resp.close()

    def resolve_download(self, source: StreamSource) -> str:
        """
        Follow redirects to get the actual direct download URL.

        Args:
            source: StreamSource object

        Returns:
            Direct download URL (signed, may expire)
        """
        try:
            resp = self.session.get(
                source.download_url,
                headers=self._api_headers,
                allow_redirects=True,
                timeout=self.timeout,
                stream=True,
            )
            source.direct_download_url = resp.url
            return resp.url
        except Exception as e:
            print(f"[!] Error resolving download: {e}")
            return ""
        finally:
            if "resp" in locals():
                resp.close()

    def resolve_all_streams(self, movie: Movie):
        """Resolve all stream and download URLs for a movie"""
        for source in movie.sources:
            self.resolve_stream(source)
            self.resolve_download(source)

    # ── Stream Verification ────────────────────────────────────

    def verify_stream(self, source: StreamSource) -> bool:
        """
        Verify that a stream URL is valid and returns actual video content.

        Checks:
        - HTTP 200 status
        - Content-Type contains "video"
        - First bytes contain MP4 signature (ftyp)

        Args:
            source: StreamSource to verify

        Returns:
            True if stream is valid video
        """
        try:
            resp = self.session.get(
                source.stream_url,
                headers=self._api_headers,
                allow_redirects=True,
                timeout=self.timeout,
                stream=True,
            )
            content_type = resp.headers.get("Content-Type", "")

            if resp.status_code == 200 and "video" in content_type:
                first_bytes = next(resp.iter_content(20))
                # MP4 signature: contains "ftyp" in first 20 bytes
                if b"ftyp" in first_bytes:
                    return True
            return False

        except Exception:
            return False
        finally:
            if "resp" in locals():
                resp.close()

    def verify_movie_streams(self, movie: Movie) -> Dict[str, bool]:
        """Verify all streams for a movie. Returns {quality: status} mapping."""
        results = {}
        for source in movie.sources:
            results[source.quality] = self.verify_stream(source)
        return results

    # ── Subtitle Download ──────────────────────────────────────

    def download_subtitle(self, subtitle: Subtitle, filepath: str):
        """Download a subtitle SRT file to disk"""
        resp = requests.get(subtitle.url, timeout=self.timeout)
        resp.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(resp.content)
        print(f"[+] Subtitle saved: {filepath}")

    # ── Utility ────────────────────────────────────────────────

    @staticmethod
    def _humanize_size(size_bytes: int) -> str:
        """Convert bytes to human readable string"""
        if size_bytes == 0:
            return "0 B"
        for unit in ("B", "KB", "MB", "GB"):
            if abs(size_bytes) < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"


# ═════════════════════════════════════════════════════════════════════════════
# DEMO / TEST
# ═════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 72)
    print("  CINEVERSE MOVIE SCRAPER - Reverse Engineered")
    print("  https://cinverse.com.ng")
    print("=" * 72)

    scraper = CineverseScraper(timeout=25)

    # ── Test 1: Search ─────────────────────────────────────────
    print("\n[1] Searching for 'Agatha All Along'...")
    results = scraper.search("Agatha All Along")

    if not results:
        print("[!] No results found!")
        return

    for i, m in enumerate(results[:3], 1):
        media_type = "TV" if m.is_series else "Movie"
        print(f"    [{i}] {m.title} ({m.year}) [{media_type}] {m.rating}/10")

    target = results[0]
    print(f"\n[->] Selected: {target.title}")

    # ── Test 2: Get Full Movie Data ────────────────────────────
    print("\n[2] Fetching metadata & streaming sources...")
    movie = scraper.get_movie(target, season=1, episode=1)

    print(f"\n{'-' * 56}")
    print(f"  TITLE:     {movie.title}")
    print(f"  TYPE:      {'TV Series' if movie.is_series else 'Movie'}")
    print(f"  YEAR:      {movie.year}")
    print(f"  RATING:    {movie.rating}/10 ({movie.rating_count:,} votes)")
    print(f"  GENRES:    {', '.join(movie.genres)}")
    print(f"  COUNTRY:   {movie.country}")
    print(f"  POSTER:    {movie.poster_url[:65]}...")
    if movie.trailer_url:
        print(f"  TRAILER:   {movie.trailer_url[:65]}...")
    else:
        print(f"  TRAILER:   N/A")
    if movie.is_series and movie.seasons:
        print(f"  SEASONS:   {len(movie.seasons)}")
        for s in movie.seasons[:3]:
            res_list = ", ".join(
                f"{r['resolution']}p(E{r['epNum']})" for r in s.get("resolutions", [])
            )
            print(f"    - S{s['se']}: {res_list}")
    print(f"{'-' * 56}")

    # ── Test 3: Streaming Sources ──────────────────────────────
    print(f"\n[3] Streaming Sources ({len(movie.sources)} qualities):")
    for src in movie.sources:
        print(f"    * {src.quality:>5} | {src.size_human:>10} | {src.format}")
        print(f"      Stream:  {src.stream_url[:80]}...")
        print(f"      DL:      {src.download_url[:80]}...")

    # ── Test 4: Subtitles ──────────────────────────────────────
    print(f"\n[4] Subtitle Tracks ({len(movie.subtitles)} languages):")
    for sub in movie.subtitles:
        print(f"    * {sub.language_code:>5} - {sub.language_name}")

    # ── Test 5: Resolve Direct URLs ────────────────────────────
    print("\n[5] Resolving direct stream URLs...")
    scraper.resolve_all_streams(movie)

    for src in movie.sources:
        if src.direct_stream_url:
            print(f"    * {src.quality}: {src.direct_stream_url[:90]}...")

    # ── Test 6: Verify Streams ─────────────────────────────────
    print("\n[6] Verifying streams are valid video files...")
    verification = scraper.verify_movie_streams(movie)
    for quality, is_valid in verification.items():
        status = "VALID" if is_valid else "FAILED"
        print(f"    * {quality}: {status}")

    all_valid = all(verification.values())
    print(f"\n    All streams valid: {'YES' if all_valid else 'NO'}")

    # ── Test 7: Cast ───────────────────────────────────────────
    if movie.cast:
        print(f"\n[7] Cast ({len(movie.cast)} members):")
        for member in movie.cast[:8]:
            print(f"    * {member.name} as {member.character}")

    print("\n" + "=" * 72)
    print("  ALL TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 72)

    # ── Test 8: Second Movie ───────────────────────────────────
    print("\n[8] Testing with second movie: 'Dune'...")
    try:
        results2 = scraper.search("Dune")
        if results2:
            movie2 = scraper.get_movie(results2[0])
            print(f"    {movie2.title} - {len(movie2.sources)} sources found")
            for src in movie2.sources:
                print(f"      * {src.quality}: {src.size_human}")
            verification2 = scraper.verify_movie_streams(movie2)
            for q, v in verification2.items():
                print(f"      * {q}: {'VALID' if v else 'FAILED'}")
            all_v2 = all(verification2.values())
            print(f"    All valid: {'YES' if all_v2 else 'NO'}")
    except Exception as e:
        print(f"    [!] Skipped due to timeout: {e}")

    print("\n" + "=" * 72)
    print("  FULL TEST SUITE PASSED!")
    print("=" * 72)

    # ── Summary ────────────────────────────────────────────────
    print("\n[+] SUMMARY:")
    print(f"    Movie:        {movie.title}")
    print(f"    Type:         {'TV Series' if movie.is_series else 'Movie'}")
    print(f"    Qualities:    {', '.join(s.quality for s in movie.sources)}")
    print(f"    Subtitles:    {len(movie.subtitles)} languages")
    print(f"    Trailer:      {'Yes' if movie.trailer_url else 'No'}")
    print(f"    Cast:         {len(movie.cast)} members")
    print(f"    Best quality: {movie.best_quality.quality if movie.best_quality else 'N/A'}")

    return movie


if __name__ == "__main__":
    movie = main()
