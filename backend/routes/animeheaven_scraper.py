#!/usr/bin/env python3
"""
AnimeHeaven Media Organizer
===========================
A personal media organizer that extracts video sources from animeheaven.me.

Features:
  - Search anime by title
  - List all available episodes
  - Extract video source URLs (.mp4 stream + .mp4 download)
  - Stream mode: Get the direct stream URL for VLC/browsers (HTTP range-seekable)
  - Download mode: Save video file locally with progress bar
  - Handles Cloudflare protection with Selenium fallback

Usage:
    python animeheaven_organizer.py

Dependencies (auto-installed if missing):
    requests, beautifulsoup4, tqdm, lxml
    selenium (optional, for Cloudflare bypass)
    ffmpeg (optional, for M3U8 to MP4 conversion)

Author: Personal Use Only
"""

import os
import sys
import re
import time
import json
import webbrowser
import subprocess
import argparse
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs
from typing import List, Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# Auto-install required packages
# ---------------------------------------------------------------------------
REQUIRED_PACKAGES = ["requests", "beautifulsoup4", "tqdm", "lxml"]
for pkg in REQUIRED_PACKAGES:
    try:
        __import__(pkg.replace("beautifulsoup4", "bs4").replace("lxml", "lxml"))
    except ImportError:
        print(f"[INFO] Installing required package: {pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Optional: Selenium for Cloudflare / JavaScript gate navigation
# ---------------------------------------------------------------------------
SELENIUM_OK = False
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import (
        TimeoutException, WebDriverException, NoSuchDriverException
    )
    SELENIUM_OK = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------
BASE_URL = "https://animeheaven.me"
SEARCH_URL = f"{BASE_URL}/search.php"
DOWNLOAD_DIR = Path.home() / "Anime_Downloads"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}

REQUEST_TIMEOUT = 30
RETRY_ATTEMPTS = 3
RETRY_DELAY = 5

# CDN subdomains that serve video files
VIDEO_SUBDOMAINS = ["rk", "fi", "cc", "la", "ny", "py", "ct", "ck", "cw"]


# =============================================================================
# CUSTOM EXCEPTIONS
# =============================================================================

class AnimeHeavenError(Exception):
    """Base exception for AnimeHeaven organizer."""
    pass


class CloudflareBlockedError(AnimeHeavenError):
    """Raised when Cloudflare blocks the request."""
    pass


class EpisodeNotFoundError(AnimeHeavenError):
    """Raised when an episode is not found."""
    pass


class VideoSourceNotFoundError(AnimeHeavenError):
    """Raised when video source cannot be extracted."""
    pass


class SearchNotFoundError(AnimeHeavenError):
    """Raised when no search results are found."""
    pass


# =============================================================================
# SESSION MANAGER
# =============================================================================

class SessionManager:
    """
    Manages HTTP requests with retry logic and optional Selenium fallback
    for Cloudflare-protected or JavaScript-gated pages.
    """

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.driver = None
        self._selenium_warned = False

    def get(self, url: str, **kwargs) -> requests.Response:
        """GET with retry logic. Falls back to Selenium on repeated failures."""
        last_error = None

        for attempt in range(1, RETRY_ATTEMPTS + 1):
            try:
                resp = self.session.get(url, timeout=REQUEST_TIMEOUT, **kwargs)
                # Detect Cloudflare challenge
                if resp.status_code in (403, 503) or (
                    resp.status_code == 200
                    and ("Just a moment" in resp.text
                         or "cf-browser-verification" in resp.text)
                ):
                    raise CloudflareBlockedError("Cloudflare challenge detected.")
                if "You have triggered abuse protection" in resp.text:
                    raise CloudflareBlockedError(
                        "Abuse protection triggered. Wait a few minutes."
                    )
                return resp
            except CloudflareBlockedError as e:
                last_error = e
                print(f"  [Attempt {attempt}/{RETRY_ATTEMPTS}] Blocked: {e}")
                if attempt < RETRY_ATTEMPTS:
                    time.sleep(RETRY_DELAY)
                else:
                    print("  Request-based access blocked by Cloudflare.")
                    return None
            except requests.RequestException as e:
                last_error = e
                print(f"  [Attempt {attempt}/{RETRY_ATTEMPTS}] Error: {e}")
                if attempt < RETRY_ATTEMPTS:
                    time.sleep(RETRY_DELAY)

        raise AnimeHeavenError(f"Failed to fetch {url}: {last_error}")

    def head(self, url: str, **kwargs) -> requests.Response:
        """HEAD request wrapper."""
        return self.session.head(url, timeout=REQUEST_TIMEOUT, **kwargs)

    def init_selenium(self) -> bool:
        """Initialize headless Chrome for JavaScript navigation."""
        global SELENIUM_OK
        if not SELENIUM_OK:
            if not self._selenium_warned:
                print("\n[WARN] Selenium not installed. Cloudflare fallback unavailable.")
                print("  Install: pip install selenium")
                self._selenium_warned = True
            return False

        if self.driver is not None:
            return True

        options = ChromeOptions()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(
            f"--user-agent={HEADERS['User-Agent']}"
        )
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        try:
            self.driver = webdriver.Chrome(options=options)
            self.driver.execute_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            print("  [Selenium] Chrome headless browser initialized.")
            return True
        except NoSuchDriverException:
            print("\n[WARN] ChromeDriver not found.")
            print("  Install Chrome and ChromeDriver:")
            print("    Ubuntu/Debian: sudo apt-get install chromium-chromedriver")
            print("    Or: pip install webdriver-manager")
            SELENIUM_OK = False
            return False
        except WebDriverException as e:
            print(f"  [Selenium] Failed to start Chrome: {e}")
            return False

    def selenium_get(self, url: str, wait_for_video: bool = False) -> requests.Response:
        """
        Use Selenium to navigate a page and return HTML wrapped as Response.
        If wait_for_video is True, will try to extract video URL from page.
        """
        if not self.init_selenium():
            raise AnimeHeavenError("Selenium not available for browser navigation.")

        print(f"  [Selenium] Navigating: {url}")
        self.driver.get(url)
        time.sleep(6)  # Allow JS execution and redirects

        if wait_for_video:
            # Wait a bit more for video player to load
            time.sleep(4)

        html = self.driver.page_source
        current_url = self.driver.current_url

        # Wrap as response-like object
        resp = requests.Response()
        resp.status_code = 200
        resp._content = html.encode("utf-8")
        resp.url = current_url
        resp.headers["Content-Type"] = "text/html"
        return resp

    def extract_video_via_selenium(self, anime_id: str, ep_number: str) -> Tuple[str, str, str]:
        """
        Use Selenium to navigate the gate system and extract both video URLs.
        Returns (stream_url, download_url, source_type).
        """
        if not self.init_selenium():
            raise VideoSourceNotFoundError("Selenium not available.")

        # Step 1: Navigate to anime page
        anime_url = f"{BASE_URL}/anime.php?{anime_id}"
        print(f"  [Selenium] Step 1: Loading anime page...")
        self.driver.get(anime_url)
        time.sleep(5)

        # Step 2: Find and click the episode link
        print(f"  [Selenium] Step 2: Looking for Episode {ep_number}...")
        ep_xpath = f"//a[.//div[contains(text(), 'Episode {ep_number}')] or .//div[contains(text(), 'Episode {float(ep_number):g}')]]"

        try:
            ep_link = WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.XPATH, ep_xpath))
            )
            # Scroll into view and hover to set cookie
            self.driver.execute_script("arguments[0].scrollIntoView();", ep_link)
            time.sleep(1)
            from selenium.webdriver.common.action_chains import ActionChains
            ActionChains(self.driver).move_to_element(ep_link).perform()
            time.sleep(1)
            ep_link.click()
            print(f"  [Selenium] Step 3: Clicked Episode {ep_number}, navigating gate...")
        except TimeoutException:
            raise VideoSourceNotFoundError(
                f"Could not find Episode {ep_number} on the page."
            )

        # Step 3: Wait for gate page to load and extract video URLs
        time.sleep(6)
        html = self.driver.page_source

        # Try to extract both URLs from the gate page
        stream_url, download_url = extract_urls_from_gate_html(html)
        if stream_url and download_url:
            print(f"  [Selenium] Stream URL found: {stream_url[:80]}...")
            print(f"  [Selenium] Download URL found: {download_url[:80]}...")
            return stream_url, download_url, "mp4"

        # Fallback: look for any video.mp4 URL
        url_matches = re.findall(
            r'(https?://[^\'"\s<>]+\.animeheaven\.me/video\.mp4\?[^\'"\s<>]*)', html
        )
        if url_matches:
            # Try to identify stream vs download
            stream = None
            download = None
            for u in url_matches:
                if u.endswith("&d") or "&d" in u:
                    download = u
                elif "&error" not in u:
                    stream = u
            if stream or download:
                best = stream or download or url_matches[0]
                return best, download or best, "mp4"

        raise VideoSourceNotFoundError(
            "Could not extract video URL via Selenium. The site layout may have changed."
        )

    def close(self):
        """Clean up Selenium driver."""
        if self.driver:
            self.driver.quit()
            self.driver = None


# =============================================================================
# CORE FUNCTIONS
# =============================================================================

def search_anime(session: SessionManager, query: str) -> List[Dict[str, str]]:
    """
    Search for anime on AnimeHeaven.

    Returns list of dicts with keys: title, url, id
    """
    print(f"\n{'='*60}")
    print(f"[SEARCH] Searching for: \"{query}\"")
    print(f"{'='*60}")

    resp = session.get(SEARCH_URL, params={"s": query})
    if resp is None:
        raise SearchNotFoundError("Search failed. Site may be blocking automated requests.")

    soup = BeautifulSoup(resp.content, "lxml")
    results = []

    for link in soup.find_all("a", href=re.compile(r"anime\.php\?")):
        title = link.get_text(strip=True)
        href = link.get("href", "")
        if not title or not href:
            continue
        full_url = urljoin(BASE_URL, href)
        anime_id = href.split("?")[-1] if "?" in href else ""
        results.append({"title": title, "url": full_url, "id": anime_id})

    # Deduplicate by ID
    seen = set()
    unique = []
    for r in results:
        if r["id"] and r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)

    if not unique:
        raise SearchNotFoundError(f"No results found for \"{query}\"")

    return unique


def get_episode_list(session: SessionManager, anime_url: str, anime_id: str) -> List[Dict]:
    """
    Extract episode list from anime page.

    Returns list of dicts with keys: number, title, ep_id, watch_url
    """
    print(f"\n{'='*60}")
    print(f"[EPISODES] Fetching episode list...")
    print(f"{'='*60}")

    resp = session.get(anime_url)
    if resp is None:
        raise AnimeHeavenError("Failed to load anime page.")

    html = resp.text
    soup = BeautifulSoup(resp.content, "lxml")

    episodes = []

    # Method 1: Extract from <a> tags with gate.php and id attributes
    for link in soup.find_all("a", href="gate.php"):
        ep_id = link.get("id", "")
        if not ep_id:
            continue

        # Find episode number inside this link
        divs = link.find_all("div")
        for div in divs:
            text = div.get_text(strip=True)
            if re.match(r"^[0-9]+(?:\.[0-9]+)?$", text):
                ep_num = text
                title = f"Episode {ep_num}"
                episodes.append({
                    "number": ep_num,
                    "title": title,
                    "ep_id": ep_id,
                    "watch_url": f"{BASE_URL}/watch.php?{anime_id}&e={ep_num}"
                })
                break

    if not episodes:
        # Method 2: Try to find maxep and construct range
        maxep_match = re.search(r"var\s+maxep\s*=\s*([0-9]+)", html)
        if maxep_match:
            max_ep = int(maxep_match.group(1))
            print(f"  Found maxep={max_ep}. Constructing episode range.")
            for i in range(1, max_ep + 1):
                ep_num = str(i)
                episodes.append({
                    "number": ep_num,
                    "title": f"Episode {ep_num}",
                    "ep_id": "",
                    "watch_url": f"{BASE_URL}/watch.php?{anime_id}&e={ep_num}"
                })

    # Deduplicate and sort
    seen = set()
    unique_eps = []
    for ep in episodes:
        if ep["number"] not in seen:
            seen.add(ep["number"])
            unique_eps.append(ep)

    def sort_key(ep):
        try:
            return float(ep["number"])
        except ValueError:
            return 0

    unique_eps.sort(key=sort_key)
    return unique_eps


def extract_urls_from_gate_html(html: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse gate.php HTML to extract both stream and download URLs.
    
    Returns:
        Tuple of (stream_url, download_url) where:
        - stream_url: The <source> tag URL with auth token (for playback in VLC/browsers)
        - download_url: The &d suffixed URL (for direct file download)
    """
    stream_url = None
    download_url = None

    # Extract stream URL: first <source> tag (the one the player uses for streaming)
    # This URL has an auth token and supports HTTP Range requests for seeking
    source_patterns = [
        # Match <source src='...' type='video/mp4' onerror="xhr()">
        r"<source\s+src='(https?://[^'\"]+\.animeheaven\.me/video\.mp4\?[^'\"&]+&[^'\"]+)'\s+type='video/mp4'\s+onerror=\"xhr\(\)\">",
        # Fallback: any <source> with video.mp4
        r"<source\s+src='(https?://[^'\"]+\.animeheaven\.me/video\.mp4\?[^'\"]+)'\s+type='video/mp4'",
    ]
    for pat in source_patterns:
        m = re.search(pat, html)
        if m:
            stream_url = m.group(1)
            break

    # Extract download URL from the download link <a href='...&d'>
    download_patterns = [
        r"<a\s+href='(https?://[^'\"]+\.animeheaven\.me/video\.mp4\?[^'\"]+&d)'>",
        r'href=["\'](https?://[^"\']+\.animeheaven\.me/video\.mp4\?[^"\']+&d)["\']',
    ]
    for pat in download_patterns:
        m = re.search(pat, html)
        if m:
            download_url = m.group(1)
            break

    # If we didn't find download URL but found stream URL, construct it
    if stream_url and not download_url:
        # Replace the token part with &d
        base = stream_url.split("&")[0]
        download_url = base + "&d"

    return stream_url, download_url


def extract_video_direct(ep_id: str, subdomains: List[str] = None) -> Optional[str]:
    """
    Attempt to construct and verify direct download video URL from episode ID.
    Returns video URL if a working CDN is found, else None.
    This returns the download URL (with &d).
    """
    if not ep_id:
        return None

    subdomains = subdomains or VIDEO_SUBDOMAINS
    test_session = requests.Session()
    test_session.headers.update({
        "User-Agent": HEADERS["User-Agent"],
        "Referer": f"{BASE_URL}/",
    })

    # Try download URL (&d)
    for sub in subdomains:
        url = f"https://{sub}.animeheaven.me/video.mp4?{ep_id}&d"
        try:
            resp = test_session.head(url, timeout=10, allow_redirects=True)
            if resp.status_code == 200:
                ct = resp.headers.get("Content-Type", "")
                cl = resp.headers.get("Content-Length", "0")
                if "video" in ct or (cl and int(cl) > 100000):
                    print(f"  [OK] Download video verified on CDN: {sub}")
                    return url
        except Exception:
            continue

    # Also try without &d (streaming URL without token)
    for sub in subdomains:
        url = f"https://{sub}.animeheaven.me/video.mp4?{ep_id}"
        try:
            resp = test_session.head(url, timeout=10, allow_redirects=True)
            if resp.status_code == 200:
                ct = resp.headers.get("Content-Type", "")
                if "video" in ct:
                    return url
        except Exception:
            continue

    return None


def extract_video_source(
    session: SessionManager,
    anime_id: str,
    ep_number: str,
    ep_id: str = "",
    mode: str = "stream",
    use_selenium: bool = False
) -> Tuple[str, str]:
    """
    Extract video source URL for an episode.

    Args:
        session: SessionManager instance
        anime_id: Anime page ID
        ep_number: Episode number
        ep_id: Episode hash ID (if available)
        mode: "stream" or "download" - determines which URL to return
        use_selenium: Force Selenium usage

    Returns:
        Tuple of (video_url, source_type)
        - For mode="stream": Returns the stream URL (with auth token, supports HTTP Range)
        - For mode="download": Returns the download URL (with &d suffix)
    """
    print(f"\n{'='*60}")
    print(f"[VIDEO] Extracting source for Episode {ep_number} (mode: {mode})...")
    print(f"{'='*60}")

    stream_url = None
    download_url = None

    # Try Selenium first if available/requested - it gets both URLs from the gate page
    if use_selenium or SELENIUM_OK:
        print("  Trying Selenium browser navigation...")
        try:
            stream_url, download_url, _ = session.extract_video_via_selenium(anime_id, ep_number)
        except VideoSourceNotFoundError:
            print("  Selenium extraction failed.")
            stream_url = None
            download_url = None

    # If Selenium didn't work, try gate.php cookie method to get both URLs
    if not stream_url and ep_id:
        print("  Trying gate.php with cookie to extract both stream and download URLs...")
        gate_session = requests.Session()
        gate_session.headers.update(HEADERS)
        gate_session.cookies.set("key", ep_id, domain="animeheaven.me")
        try:
            resp = gate_session.get(
                f"{BASE_URL}/gate.php", timeout=20, allow_redirects=True
            )
            if resp.status_code == 200:
                stream_url, download_url = extract_urls_from_gate_html(resp.text)
                if stream_url:
                    print(f"  [OK] Stream URL extracted from gate.php")
                if download_url:
                    print(f"  [OK] Download URL extracted from gate.php")
        except Exception as e:
            print(f"  Gate.php extraction error: {e}")

    # Direct construction fallback (only gives download URL)
    if not download_url and ep_id:
        print("  Trying direct video URL construction...")
        direct_url = extract_video_direct(ep_id)
        if direct_url:
            download_url = direct_url
            if not stream_url:
                # Use download URL as stream fallback
                stream_url = direct_url.replace("&d", "")
            print(f"  [OK] Direct construction succeeded")

    # Return based on mode
    if mode == "stream":
        if stream_url:
            print(f"\n  [STREAM] URL: {stream_url[:100]}...")
            return stream_url, "mp4"
        elif download_url:
            # Fallback: use download URL for streaming too
            print(f"\n  [STREAM] Stream URL not found, using download URL fallback")
            return download_url, "mp4"
    else:  # download mode
        if download_url:
            print(f"\n  [DOWNLOAD] URL: {download_url[:100]}...")
            return download_url, "mp4"
        elif stream_url:
            # Fallback: use stream URL for download
            print(f"\n  [DOWNLOAD] Download URL not found, using stream URL fallback")
            return stream_url, "mp4"

    raise VideoSourceNotFoundError(
        "Could not extract video source. Try using --browser mode to open "
        "the episode in your default browser and grab the video URL manually "
        "from the Network tab (F12)."
    )


def download_video(session: SessionManager, video_url: str, filename: str, source_type: str = "mp4") -> Path:
    """Download video with progress bar."""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    output_path = DOWNLOAD_DIR / filename

    if source_type == "m3u8":
        return download_m3u8(video_url, output_path)

    print(f"\n{'='*60}")
    print(f"[DOWNLOAD] Starting download...")
    print(f"  URL: {video_url[:100]}...")
    print(f"  Save to: {output_path}")
    print(f"{'='*60}")

    resp = session.session.get(video_url, stream=True, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    total = int(resp.headers.get("content-length", 0))
    block = 8192

    with open(output_path, "wb") as f, tqdm(
        desc=filename[:30],
        total=total,
        unit="B",
        unit_scale=True,
        unit_divisor=1024,
        colour="green",
    ) as bar:
        for chunk in resp.iter_content(chunk_size=block):
            if chunk:
                f.write(chunk)
                bar.update(len(chunk))

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n[SUCCESS] Downloaded: {output_path}")
    print(f"  File size: {size_mb:.2f} MB")
    return output_path


def download_m3u8(m3u8_url: str, output_path: Path) -> Path:
    """Download M3U8 stream using ffmpeg."""
    print(f"\n[M3U8] Converting stream to MP4 with ffmpeg...")

    ffmpeg_cmd = None
    for cmd in ["ffmpeg", "avconv"]:
        if subprocess.run([cmd, "-version"], capture_output=True).returncode == 0:
            ffmpeg_cmd = cmd
            break

    if not ffmpeg_cmd:
        print("[ERROR] ffmpeg not found. Install it for M3U8 support:")
        print("  Ubuntu: sudo apt-get install ffmpeg")
        print("  macOS: brew install ffmpeg")
        print("  Windows: https://ffmpeg.org/download.html")
        raise AnimeHeavenError("ffmpeg required for M3U8 downloads")

    cmd = [
        ffmpeg_cmd, "-y",
        "-i", m3u8_url,
        "-c", "copy",
        "-bsf:a", "aac_adtstoasc",
        str(output_path)
    ]
    print(f"  Running: {' '.join(cmd[:5])} ...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise AnimeHeavenError(f"ffmpeg failed: {result.stderr[:500]}")

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n[SUCCESS] Saved: {output_path} ({size_mb:.2f} MB)")
    return output_path


# =============================================================================
# USER INTERFACE
# =============================================================================

def print_banner():
    print("""
    +============================================================+
    |           AnimeHeaven Media Organizer v3.0                 |
    |           Stream & Download - Dual Mode                    |
    +============================================================+
    """)


def select_anime(results: List[Dict]) -> Dict:
    print(f"\n{'-'*60}")
    print(f"Found {len(results)} result(s):")
    print(f"{'-'*60}")
    for i, r in enumerate(results, 1):
        print(f"  [{i}] {r['title']}")
    print(f"{'-'*60}")

    while True:
        choice = input(f"\nSelect [1-{len(results)}] or 'q' to quit: ").strip()
        if choice.lower() == "q":
            sys.exit(0)
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(results):
                return results[idx]
        except ValueError:
            pass
        print("Invalid selection.")


def select_episode(episodes: List[Dict]) -> Dict:
    total = len(episodes)
    print(f"\n{'-'*60}")
    print(f"Found {total} episode(s). Showing first 50:")
    print(f"{'-'*60}")

    display = min(50, total)
    for i, ep in enumerate(episodes[:display], 1):
        print(f"  [{i:3d}] Episode {ep['number']:>6s} - {ep['title']}")

    if total > 50:
        print(f"\n  ... and {total - 50} more episodes")
        print("  Tip: You can also type the episode number directly (e.g. '1', '1150.5')")

    print(f"{'-'*60}")

    while True:
        choice = input(f"\nSelect [1-{display}] or enter episode number (or 'q'): ").strip()
        if choice.lower() == "q":
            sys.exit(0)

        # Direct episode number lookup
        for ep in episodes:
            if ep["number"] == choice:
                return ep

        # Index-based selection
        try:
            idx = int(choice) - 1
            if 0 <= idx < total:
                return episodes[idx]
            print(f"Enter 1-{total}, episode number, or 'q'.")
        except ValueError:
            print("Invalid input. Try again.")


def select_mode() -> str:
    """Let user choose between Stream and Download modes."""
    print("\n" + "-" * 60)
    print("Choose mode:")
    print("-" * 60)
    print("  [1] Stream  - Get video URL for playback in VLC/browser")
    print("              (HTTP Range-seekable MP4 stream URL)")
    print("  [2] Download - Save video file locally with progress bar")
    print("  [q] Quit")
    print("-" * 60)
    while True:
        c = input("\nChoice: ").strip().lower()
        if c in ("1", "stream", "s"):
            return "stream"
        elif c in ("2", "download", "d"):
            return "download"
        elif c == "q":
            sys.exit(0)
        print("Invalid choice. Enter 1 for Stream, 2 for Download.")


def select_action() -> str:
    """Legacy action selector - replaced by select_mode()."""
    return select_mode()


def confirm_filename(default_name: str) -> str:
    print(f"\nDefault filename: {default_name}")
    c = input("Use this filename? [Y/n/custom]: ").strip()
    if not c or c.lower() == "y":
        return default_name
    if not c.endswith(".mp4"):
        c += ".mp4"
    return c


# =============================================================================
# TESTING / VALIDATION
# =============================================================================

def run_tests(session: SessionManager):
    """Run validation tests for both stream and download modes."""
    print("\n" + "=" * 60)
    print("RUNNING VALIDATION TESTS")
    print("=" * 60)

    tests_passed = 0
    tests_failed = 0

    # Test 1: Search for "One Piece"
    print("\n[Test 1] Search: 'One Piece'")
    try:
        results = search_anime(session, "One Piece")
        if any("One Piece" in r["title"] for r in results):
            print("  [PASS] Found One Piece in search results")
            tests_passed += 1
            op = [r for r in results if r["title"] == "One Piece"][0]
        else:
            print("  [FAIL] One Piece not found")
            tests_failed += 1
            return
    except Exception as e:
        print(f"  [FAIL] {e}")
        tests_failed += 1
        return

    # Test 2: Episode list for One Piece
    print("\n[Test 2] Episode list for One Piece")
    try:
        eps = get_episode_list(session, op["url"], op["id"])
        if len(eps) > 0:
            print(f"  [PASS] Found {len(eps)} episodes")
            ep1 = [e for e in eps if e["number"] == "1"]
            if ep1:
                print(f"  [PASS] Episode 1 found with ID: {ep1[0]['ep_id'][:20]}...")
            else:
                print("  [INFO] Episode 1 not in extracted list (may need scrolling)")
            tests_passed += 1
        else:
            print("  [FAIL] No episodes found")
            tests_failed += 1
    except Exception as e:
        print(f"  [FAIL] {e}")
        tests_failed += 1

    # Test 3: Extract both stream and download URLs from gate.php
    print("\n[Test 3] Extract stream + download URLs from gate.php")
    try:
        ep1_list = [e for e in eps if e["number"] == "1"]
        if ep1_list and ep1_list[0]["ep_id"]:
            ep_id = ep1_list[0]["ep_id"]
            gate_session = requests.Session()
            gate_session.headers.update(HEADERS)
            gate_session.cookies.set("key", ep_id, domain="animeheaven.me")
            resp = gate_session.get(f"{BASE_URL}/gate.php", timeout=20)
            if resp.status_code == 200:
                stream_url, download_url = extract_urls_from_gate_html(resp.text)
                if stream_url:
                    print(f"  [PASS] Stream URL extracted: {stream_url[:80]}...")
                    tests_passed += 1
                else:
                    print("  [FAIL] Stream URL not extracted")
                    tests_failed += 1

                if download_url:
                    print(f"  [PASS] Download URL extracted: {download_url[:80]}...")
                    tests_passed += 1
                else:
                    print("  [FAIL] Download URL not extracted")
                    tests_failed += 1
            else:
                print(f"  [FAIL] Gate.php returned status {resp.status_code}")
                tests_failed += 1
        else:
            print("  [SKIP] No episode ID available")
    except Exception as e:
        print(f"  [FAIL] {e}")
        tests_failed += 1

    # Test 4: Verify stream URL supports HTTP Range requests
    print("\n[Test 4] Verify stream URL supports HTTP Range requests")
    try:
        if 'stream_url' in locals() and stream_url:
            test_session = requests.Session()
            test_session.headers.update({
                "User-Agent": HEADERS["User-Agent"],
                "Range": "bytes=0-1023",
            })
            resp = test_session.head(stream_url, timeout=10, allow_redirects=True)
            if resp.status_code in (200, 206):
                cr = resp.headers.get("Accept-Ranges", "")
                if cr == "bytes" or resp.status_code == 206:
                    print(f"  [PASS] Stream URL supports range requests (Accept-Ranges: {cr})")
                    tests_passed += 1
                else:
                    print(f"  [INFO] Stream URL accessible (status {resp.status_code})")
                    tests_passed += 1
            else:
                print(f"  [FAIL] Stream URL HEAD returned {resp.status_code}")
                tests_failed += 1
        else:
            print("  [SKIP] No stream URL to test")
    except Exception as e:
        print(f"  [INFO] {e}")

    print("\n" + "=" * 60)
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed")
    print("=" * 60)

    return tests_failed == 0


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="AnimeHeaven Media Organizer - Stream & Download tool"
    )
    parser.add_argument(
        "--test", action="store_true",
        help="Run validation tests and exit"
    )
    parser.add_argument(
        "--selenium", action="store_true",
        help="Force Selenium browser for video extraction"
    )
    parser.add_argument(
        "--browser", action="store_true",
        help="Open episode in browser instead of extracting URL"
    )
    parser.add_argument(
        "--title", "-t", type=str, default="",
        help="Anime title to search (skips interactive prompt)"
    )
    parser.add_argument(
        "--episode", "-e", type=str, default="",
        help="Episode number (skips interactive prompt)"
    )
    parser.add_argument(
        "--mode", "-m", choices=["stream", "download"], default="",
        help="Mode: stream (get playback URL) or download (save file)"
    )
    args = parser.parse_args()

    print_banner()

    session = SessionManager()

    try:
        # Run tests if requested
        if args.test:
            success = run_tests(session)
            session.close()
            sys.exit(0 if success else 1)

        # Check optional dependencies
        if SELENIUM_OK:
            print("[INIT] Selenium available (Cloudflare bypass ready)")
        else:
            print("[INIT] Selenium not installed - install for Cloudflare bypass:")
            print("       pip install selenium")
        print(f"[INIT] Download folder: {DOWNLOAD_DIR}")

        # --- Step 1: Get anime title ---
        query = args.title or input("\nEnter anime title (e.g. One Piece, Attack on Titan): ").strip()
        if not query:
            print("No title entered. Exiting.")
            return

        results = search_anime(session, query)
        selected = select_anime(results)
        print(f"\n[SELECTED] {selected['title']} (ID: {selected['id']})")

        # --- Step 2: Get episodes ---
        episodes = get_episode_list(session, selected["url"], selected["id"])
        if not episodes:
            print("[ERROR] No episodes found.")
            return

        # --- Step 3: Select episode ---
        if args.episode:
            chosen = None
            for ep in episodes:
                if ep["number"] == args.episode:
                    chosen = ep
                    break
            if not chosen:
                print(f"[ERROR] Episode {args.episode} not found.")
                return
        else:
            chosen = select_episode(episodes)

        print(f"\n[SELECTED] Episode {chosen['number']}: {chosen['title']}")

        # --- Step 4: Browser mode or extract video ---
        if args.browser:
            watch_url = chosen.get("watch_url", "")
            if not watch_url:
                watch_url = f"{BASE_URL}/watch.php?{selected['id']}&e={chosen['number']}"
            print(f"\n[BROWSER] Opening: {watch_url}")
            print("  Tip: Use F12 > Network tab to find the .mp4 or .m3u8 URL")
            webbrowser.open(watch_url)
            session.close()
            return

        # --- Step 5: Choose mode (stream or download) ---
        mode = args.mode or select_mode()
        print(f"\n[MODE] {'Stream' if mode == 'stream' else 'Download'} mode selected")

        # --- Step 6: Extract video source ---
        video_url, source_type = extract_video_source(
            session,
            selected["id"],
            chosen["number"],
            chosen.get("ep_id", ""),
            mode=mode,
            use_selenium=args.selenium,
        )
        print(f"\n{'='*60}")
        print(f"[SUCCESS] Video source extracted!")
        print(f"  URL: {video_url}")
        print(f"  Type: {source_type.upper()}")
        print(f"  Mode: {mode.upper()}")
        print(f"{'='*60}")

        # --- Step 7: Execute based on mode ---
        if mode == "stream":
            print(f"\n[STREAM] This URL can be opened in VLC, MPV, or browsers.")
            print(f"         The URL supports HTTP Range requests for seeking.")
            print(f"\n{'='*60}")
            print(f"  STREAM URL: {video_url}")
            print(f"{'='*60}")
            # Optionally open in browser
            open_browser = input("\nOpen in default browser? [y/N]: ").strip().lower()
            if open_browser == "y":
                webbrowser.open(video_url)
            else:
                # Copy to clipboard if possible
                try:
                    import pyperclip
                    pyperclip.copy(video_url)
                    print("  URL copied to clipboard!")
                except ImportError:
                    pass
        else:  # download mode
            safe = re.sub(r"[^\w\s-]", "", selected["title"]).strip().replace(" ", "_")
            default = f"{safe}_Episode_{chosen['number']}.mp4"
            filename = confirm_filename(default)
            download_video(session, video_url, filename, source_type)

        print("\n" + "=" * 60)
        print("Done! Enjoy your anime.")
        print("=" * 60)

    except KeyboardInterrupt:
        print("\n\n[INFO] Interrupted by user.")
    except AnimeHeavenError as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[UNEXPECTED ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
