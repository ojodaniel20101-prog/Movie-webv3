#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
  ___            _        _             _     _               _
 / _ \\          | |      (_)           | |   | |             | |
/ /_\\ \\_ __ ___ | |_ _ __ _  __ _  __ _| |__ | |__   ___ _ __| |_ ___ _ __ ___
|  _  | '_ ` _ \\| __| '__| |/ _` |/ _` | '_ \\| '_ \\ / _ \\ '__| __/ _ \\ '__/ __|
| | | | | | | | | |_| |  | | (_| | (_| | |_) | |_) |  __/ |  | ||  __/ |  \\__ \\
\\_| |_/_| |_| |_|\\__|_|  |_|\\__, |\\__, |_.__/|_.__/ \\___|_|   \\__\\___|_|  |___/
                             __/ | __/ |
                            |___/ |___/
================================================================================
        S P O R T S   L I V E   S T R E A M   G R A B B E R   v3.0
================================================================================
Multi-Sport | Live Scores | Auto-Refresh | Stream Testing | Beautiful Terminal
================================================================================

TERMUX INSTALLATION:
    pkg update && pkg upgrade -y
    pkg install python -y
    pip install requests beautifulsoup4

USAGE:
    python sports_grabber_v3.py

FEATURES v3.0:
    + Multi-sport support (Football, Basketball, Tennis, Cricket, etc.)
    + Live scores with match minute display
    + Auto-refresh every 30 seconds
    + Beautiful ANSI terminal UI with styled cards
    + Stream speed testing and auto-ranking
    + Goal scorers display (when available)
    + English language for all team names
    + Color-coded: LIVE=red, UPCOMING=grey, FINISHED=green

DEPENDENCIES: requests, beautifulsoup4
"""

import sys
import os
import re
import json
import time
import signal
import socket
import threading
import queue
from datetime import datetime
from urllib.parse import urljoin, urlparse, unquote
from collections import OrderedDict

# ─── Dependency Check ───────────────────────────────────────────────────────
MISSING_DEPS = []
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    MISSING_DEPS.append("requests")
try:
    from bs4 import BeautifulSoup
except ImportError:
    MISSING_DEPS.append("beautifulsoup4")

if MISSING_DEPS:
    print("=" * 60)
    print("  MISSING DEPENDENCIES")
    print("=" * 60)
    for dep in MISSING_DEPS:
        print(f"    pip install {dep}")
    print("\nFor Termux:")
    print("    pkg install python -y")
    print("    pip install " + " ".join(MISSING_DEPS))
    sys.exit(1)

# ─── ANSI Color Codes ───────────────────────────────────────────────────────
class C:
    """ANSI color codes for beautiful terminal UI"""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    ITALIC = "\033[3m"
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
    
    # Bright foreground colors
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
    
    # Bright backgrounds
    BG_BRIGHT_RED = "\033[101m"
    BG_BRIGHT_GREEN = "\033[102m"

# ─── Configuration ──────────────────────────────────────────────────────────
CONFIG = {
    "domains": [
        "https://sportslivetoday.com",
        "https://thesports.today",
        "https://moviebox.pk",
        "https://moviebox.ph",
    ],
    "api_base": "https://h5-sport-api.aoneroom.com",
    "timeout": 15,
    "max_retries": 3,
    "refresh_interval": 30,  # seconds
    "cache_file": "sports_streams.json",
    "proxy_port": 5000,
}

# Sport configuration
SPORTS = {
    "1": {"name": "Football", "icon": "⚽", "type": "football", "color": C.GREEN},
    "2": {"name": "Basketball", "icon": "🏀", "type": "basketball", "color": C.BRIGHT_YELLOW},
    "3": {"name": "Tennis", "icon": "🎾", "type": "tennis", "color": C.BRIGHT_GREEN},
    "4": {"name": "Cricket", "icon": "🏏", "type": "cricket", "color": C.BRIGHT_BLUE},
    "5": {"name": "Baseball", "icon": "⚾", "type": "baseball", "color": C.RED},
    "6": {"name": "Rugby", "icon": "🏉", "type": "rugby", "color": C.BRIGHT_MAGENTA},
    "7": {"name": "Hockey", "icon": "🏒", "type": "hockey", "color": C.CYAN},
}

# Headers
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://sportslivetoday.com/",
    "Origin": "https://sportslivetoday.com",
}

STREAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Referer": "https://sportslivetoday.com/",
    "Origin": "https://sportslivetoday.com",
    "Connection": "keep-alive",
}

# Global state
current_sport = "football"
last_matches = []
last_refresh_time = 0
proxy_stop_event = threading.Event()

# ─── Terminal Utilities ─────────────────────────────────────────────────────
def clear_screen():
    """Clear terminal screen (cross-platform)"""
    os.system("cls" if os.name == "nt" else "clear")

def move_cursor_up(n):
    """Move cursor up n lines"""
    print(f"\033[{n}A", end="")

def hide_cursor():
    """Hide terminal cursor"""
    print("\033[?25l", end="")

def show_cursor():
    """Show terminal cursor"""
    print("\033[?25h", end="")

def set_terminal_title(title):
    """Set terminal window title"""
    print(f"\033]0;{title}\007", end="")

# ─── Loading Spinner ────────────────────────────────────────────────────────
class Spinner:
    """Animated loading spinner for terminal"""
    FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    
    def __init__(self, message="Loading"):
        self.message = message
        self.running = False
        self.thread = None
        self.frame_idx = 0
    
    def _spin(self):
        while self.running:
            frame = self.FRAMES[self.frame_idx % len(self.FRAMES)]
            color = C.BRIGHT_CYAN if self.frame_idx % 2 == 0 else C.CYAN
            print(f"\r  {color}{frame}{C.RESET} {self.message}{C.DIM}...{C.RESET}", end="", flush=True)
            self.frame_idx += 1
            time.sleep(0.08)
        print("\r" + " " * (len(self.message) + 10) + "\r", end="")
    
    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._spin, daemon=True)
        self.thread.start()
    
    def stop(self, success=True):
        self.running = False
        if self.thread:
            self.thread.join(timeout=0.5)
        icon = f"{C.BRIGHT_GREEN}✓{C.RESET}" if success else f"{C.RED}✗{C.RESET}"
        print(f"  {icon} {self.message}{C.RESET}")

# ─── ASCII Art Banner ───────────────────────────────────────────────────────
def print_banner():
    """Display the Sports Live banner"""
    banner = f"""
{C.BRIGHT_CYAN}    ╔══════════════════════════════════════════════════════════════════╗
{C.BRIGHT_CYAN}    ║  {C.BRIGHT_WHITE}███████╗██████╗  ██████╗ ██████╗ ████████╗███████╗{C.BRIGHT_CYAN}          ║
{C.BRIGHT_CYAN}    ║  {C.BRIGHT_WHITE}██╔════╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝{C.BRIGHT_CYAN}          ║
{C.BRIGHT_CYAN}    ║  {C.BRIGHT_WHITE}███████╗██████╔╝██║   ██║██████╔╝   ██║   ███████╗{C.BRIGHT_CYAN}          ║
{C.BRIGHT_CYAN}    ║  {C.BRIGHT_WHITE}╚════██║██╔══██╗██║   ██║██╔══██╗   ██║   ╚════██║{C.BRIGHT_CYAN}          ║
{C.BRIGHT_CYAN}    ║  {C.BRIGHT_WHITE}███████║██║  ██║╚██████╔╝██║  ██║   ██║   ███████║{C.BRIGHT_CYAN}          ║
{C.BRIGHT_CYAN}    ║  {C.BRIGHT_WHITE}╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝{C.BRIGHT_CYAN}          ║
{C.BRIGHT_CYAN}    ║                                                                  ║
{C.BRIGHT_CYAN}    ║   {C.BRIGHT_GREEN}██╗     ██╗██╗   ██╗███████╗    ████████╗ ██████╗ ██████╗  █████╗ {C.BRIGHT_CYAN}║
{C.BRIGHT_CYAN}    ║   {C.BRIGHT_GREEN}██║     ██║██║   ██║██╔════╝    ╚══██╔══╝██╔═══██╗██╔══██╗██╔══██╗{C.BRIGHT_CYAN}║
{C.BRIGHT_CYAN}    ║   {C.BRIGHT_GREEN}██║     ██║██║   ██║█████╗         ██║   ██║   ██║██████╔╝███████║{C.BRIGHT_CYAN}║
{C.BRIGHT_CYAN}    ║   {C.BRIGHT_GREEN}██║     ██║╚██╗ ██╔╝██╔══╝         ██║   ██║   ██║██╔══██╗██╔══██║{C.BRIGHT_CYAN}║
{C.BRIGHT_CYAN}    ║   {C.BRIGHT_GREEN}███████╗██║ ╚████╔╝ ███████╗       ██║   ╚██████╔╝██║  ██║██║  ██║{C.BRIGHT_CYAN}║
{C.BRIGHT_CYAN}    ║   {C.BRIGHT_GREEN}╚══════╝╚═╝  ╚═══╝  ╚══════╝       ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝{C.BRIGHT_CYAN}║
{C.BRIGHT_CYAN}    ║                                                                  ║
{C.BRIGHT_CYAN}    ║           {C.BRIGHT_YELLOW}S T R E A M    G R A B B E R    v3.0{C.BRIGHT_CYAN}               ║
{C.BRIGHT_CYAN}    ║        {C.DIM}Multi-Sport | Live Scores | Auto-Refresh{C.BRIGHT_CYAN}              ║
{C.BRIGHT_CYAN}    ╚══════════════════════════════════════════════════════════════════╝{C.RESET}
"""
    print(banner)


# ─── Box Drawing ────────────────────────────────────────────────────────────
def draw_box_top(width=68):
    return f"{C.BRIGHT_CYAN}┌{'─' * width}┐{C.RESET}"

def draw_box_middle(text, width=68, color=C.BRIGHT_WHITE, align="left", prefix=""):
    text_str = str(text)
    if align == "center":
        padding = (width - len(text_str)) // 2
        line = " " * padding + text_str
    elif align == "right":
        line = text_str.rjust(width)
    else:
        line = prefix + text_str
    visible_len = len(line.replace(C.RESET, "").replace(color, "").replace(C.BOLD, "").replace(C.DIM, ""))
    padding = width - visible_len
    return f"{C.BRIGHT_CYAN}│{C.RESET} {color}{line}{C.RESET}{' ' * padding}{C.BRIGHT_CYAN}│{C.RESET}"

def draw_box_sep(width=68):
    return f"{C.BRIGHT_CYAN}├{'─' * width}┤{C.RESET}"

def draw_box_bottom(width=68):
    return f"{C.BRIGHT_CYAN}└{'─' * width}┘{C.RESET}"


# ─── Nuxt Payload Parser ────────────────────────────────────────────────────
def resolve_nuxt_ref(payload, ref, depth=0, max_depth=12, visited=None):
    """Resolve a Nuxt serialized reference recursively"""
    if visited is None:
        visited = set()
    if depth > max_depth or ref in visited:
        return None
    visited.add(ref)
    
    if not isinstance(ref, int) or ref < 0 or ref >= len(payload):
        return ref
    
    value = payload[ref]
    
    if isinstance(value, (str, int, float, bool)):
        return value
    elif isinstance(value, list):
        return [resolve_nuxt_ref(payload, item, depth + 1, max_depth, visited.copy()) for item in value]
    elif isinstance(value, dict):
        result = {}
        for key, val in value.items():
            if not key.startswith("$"):
                result[key] = resolve_nuxt_ref(payload, val, depth + 1, max_depth, visited.copy())
        return result
    return value


def extract_m3u8_from_url(url):
    """Extract direct m3u8 URL from various channel URL formats"""
    if not url:
        return None
    
    # Direct m3u8 URL
    if ".m3u8" in url and "url=" not in url:
        return url
    
    # Player page with m3u8 in query parameter
    if ".m3u8" in url and "url=" in url:
        m = re.search(r'[?&]url=(https?://[^&]+\.m3u8)', url)
        if m:
            return m.group(1)
    
    # Generic stream URL
    if url.startswith("http"):
        return url
    
    return None


def parse_nuxt_matches(payload_data):
    """Parse all matches from Nuxt serialized payload"""
    matches = []
    
    for i, item in enumerate(payload_data):
        if isinstance(item, dict) and "team1" in item and "team2" in item:
            try:
                match = resolve_nuxt_ref(payload_data, i)
                if not match or not isinstance(match, dict):
                    continue
                
                team1 = match.get("team1", {}) or {}
                team2 = match.get("team2", {}) or {}
                
                # Extract streams
                streams = []
                
                # Primary m3u8
                play_path = match.get("playPath", "") or ""
                if play_path and ".m3u8" in play_path:
                    streams.append({
                        "name": "Primary HD",
                        "url": play_path,
                        "type": "m3u8",
                        "quality": "HD"
                    })
                
                # Channel streams
                for ch in match.get("playSource", []) or []:
                    if isinstance(ch, dict):
                        ch_title = ch.get("title", "Channel")
                        ch_path = ch.get("path", "") or ""
                        if ch_path:
                            m3u8 = extract_m3u8_from_url(ch_path)
                            if m3u8:
                                streams.append({
                                    "name": ch_title,
                                    "url": m3u8,
                                    "type": "m3u8",
                                    "quality": "HD"
                                })
                            else:
                                streams.append({
                                    "name": ch_title,
                                    "url": ch_path,
                                    "type": "player",
                                    "quality": "?"
                                })
                
                # Status mapping
                raw_status = match.get("status", "Unknown") or "Unknown"
                status_map = {
                    "MatchNotStart": "UPCOMING",
                    "MatchIng": "LIVE",
                    "MatchEnded": "FINISHED",
                    "MatchEnd": "FINISHED",
                    "HalfTime": "HALF_TIME",
                    "NoStart": "UPCOMING",
                    "Finished": "FINISHED",
                }
                
                # Parse timestamps
                start_time_ms = match.get("startTime", "0") or "0"
                try:
                    start_time = int(start_time_ms) / 1000 if int(start_time_ms) > 0 else 0
                except (ValueError, TypeError):
                    start_time = 0
                
                # Get period scores
                t1_info = match.get("teamMatchInfo1", {}) or {}
                t2_info = match.get("teamMatchInfo2", {}) or {}
                
                period_scores = []
                t1_scores = t1_info.get("scores", []) or []
                t2_scores = t2_info.get("scores", []) or []
                if t1_scores and t2_scores:
                    for idx, (s1, s2) in enumerate(zip(t1_scores, t2_scores)):
                        period_names = ["1H", "2H", "ET1", "ET2", "P1", "P2", "P3"]
                        name = period_names[idx] if idx < len(period_names) else f"P{idx+1}"
                        period_scores.append({"name": name, "home": s1, "away": s2})
                
                # Get odds
                odds_info = match.get("oddsInfo", {}) or {}
                odds_list = []
                if odds_info:
                    for odd in odds_info.get("oddsList", []) or []:
                        odd_type = {1: "1", 2: "X", 3: "2"}.get(odd.get("type"), str(odd.get("type")))
                        odds_list.append({"type": odd_type, "value": odd.get("odds", "-")})
                
                clean_match = {
                    "id": str(match.get("id", "")),
                    "sport_type": match.get("type", "football") or "football",
                    "home_team": team1.get("name", "Unknown") or "Unknown",
                    "away_team": team2.get("name", "Unknown") or "Unknown",
                    "home_score": str(team1.get("score", "-") or "-"),
                    "away_score": str(team2.get("score", "-") or "-"),
                    "home_abbr": team1.get("abbreviation", "") or "",
                    "away_abbr": team2.get("abbreviation", "") or "",
                    "home_logo": team1.get("avatar", "") or "",
                    "away_logo": team2.get("avatar", "") or "",
                    "status": status_map.get(raw_status, raw_status),
                    "raw_status": raw_status,
                    "status_live": match.get("statusLive", ""),
                    "league": match.get("league", "") or "",
                    "round": match.get("matchRound", "") or "",
                    "start_time": start_time,
                    "streams": streams,
                    "period_scores": period_scores,
                    "odds": odds_list,
                    "highlights": match.get("highlights", []) or [],
                }
                matches.append(clean_match)
            except Exception:
                continue
    
    return matches


# ─── Fetch Matches ──────────────────────────────────────────────────────────
def fetch_matches(domain=None):
    """Fetch matches from the API"""
    global current_sport
    
    domains_to_try = [domain] if domain else CONFIG["domains"]
    
    for url_base in domains_to_try:
        if not url_base:
            continue
        try:
            # Remove trailing slash
            url_base = url_base.rstrip("/")
            
            # Try the Nuxt payload endpoint
            payload_url = f"{url_base}/_payload.json?live"
            
            resp = requests.get(
                payload_url,
                headers=BROWSER_HEADERS,
                timeout=CONFIG["timeout"],
                allow_redirects=True
            )
            
            if resp.status_code == 200 and len(resp.text) > 5000:
                try:
                    payload = json.loads(resp.text)
                    matches = parse_nuxt_matches(payload)
                    if matches:
                        return matches, url_base
                except (json.JSONDecodeError, Exception):
                    continue
        except Exception:
            continue
    
    return [], None


# ─── Match Display ──────────────────────────────────────────────────────────
def format_match_time(start_time):
    """Format match kickoff time"""
    if start_time <= 0:
        return "TBD"
    try:
        dt = datetime.fromtimestamp(start_time)
        now = datetime.now()
        
        if dt.date() == now.date():
            return f"Today {dt.strftime('%H:%M')}"
        elif (dt.date() - now.date()).days == 1:
            return f"Tomorrow {dt.strftime('%H:%M')}"
        else:
            return dt.strftime('%a %d %b %H:%M')
    except Exception:
        return "TBD"


def get_match_minute(match):
    """Get match minute for live matches"""
    status_live = match.get("status_live", "")
    if status_live == "Living":
        return "LIVE"
    if isinstance(status_live, (int, float)) and status_live > 0:
        return f"{int(status_live)}'"
    return ""


def format_score_display(match):
    """Format score line for display"""
    status = match["status"]
    home = match["home_team"]
    away = match["away_team"]
    hs = match["home_score"]
    aw = match["away_score"]
    
    if status == "LIVE":
        minute = get_match_minute(match)
        return f"{C.BRIGHT_WHITE}{home}{C.RESET} {C.BRIGHT_YELLOW}{hs} - {aw}{C.RESET} {C.BRIGHT_WHITE}{away}{C.RESET}  {C.RED}{minute}{C.RESET}"
    elif status == "HALF_TIME":
        return f"{C.BRIGHT_WHITE}{home}{C.RESET} {C.YELLOW}{hs} - {aw}{C.RESET} {C.BRIGHT_WHITE}{away}{C.RESET}  {C.YELLOW}HT{C.RESET}"
    elif status == "FINISHED":
        return f"{C.BRIGHT_WHITE}{home}{C.RESET} {C.BRIGHT_GREEN}{hs} - {aw}{C.RESET} {C.BRIGHT_WHITE}{away}{C.RESET}  {C.GREEN}FT{C.RESET}"
    else:
        kickoff = format_match_time(match["start_time"])
        return f"{C.WHITE}{home}{C.RESET} {C.DIM}vs{C.RESET} {C.WHITE}{away}{C.RESET}  {C.BRIGHT_BLUE}{kickoff}{C.RESET}"


def draw_match_card(match, index, width=68):
    """Draw a beautiful match card"""
    status = match["status"]
    sport_info = None
    for s in SPORTS.values():
        if s["type"] == match.get("sport_type", "football"):
            sport_info = s
            break
    
    icon = sport_info["icon"] if sport_info else "⚽"
    
    # Status colors
    if status == "LIVE":
        status_color = C.BRIGHT_RED
        status_bg = C.BG_BRIGHT_RED
        border_color = C.RED
        prefix = "🔴"
    elif status == "HALF_TIME":
        status_color = C.YELLOW
        border_color = C.YELLOW
        prefix = "⏸"
    elif status == "FINISHED":
        status_color = C.BRIGHT_GREEN
        border_color = C.GREEN
        prefix = "✅"
    else:
        status_color = C.BRIGHT_BLUE
        border_color = C.BRIGHT_BLUE
        prefix = "⚪"
    
    score_line = format_score_display(match)
    
    lines = []
    lines.append(f"{border_color}┌{'─' * width}┐{C.RESET}")
    lines.append(f"{border_color}│{C.RESET} {C.BOLD}{prefix} [{index}]{C.RESET} {icon} {C.DIM}{match.get('league', '')}{C.RESET}")
    lines.append(f"{border_color}│{C.RESET} {score_line}")
    
    # Period scores if available
    if match.get("period_scores"):
        period_line = ""
        for ps in match["period_scores"]:
            if ps["home"] != 0 or ps["away"] != 0:
                period_line += f"{ps['name']}:{ps['home']}-{ps['away']} "
        if period_line:
            lines.append(f"{border_color}│{C.RESET} {C.DIM}Periods: {period_line}{C.RESET}")
    
    # Round info
    if match.get("round"):
        lines.append(f"{border_color}│{C.RESET} {C.DIM}{match['round']}{C.RESET}")
    
    # Stream count
    stream_count = len(match.get("streams", []))
    if stream_count > 0:
        lines.append(f"{border_color}│{C.RESET} {C.BRIGHT_CYAN}📺 {stream_count} stream(s) available{C.RESET}")
    
    lines.append(f"{border_color}└{'─' * width}┘{C.RESET}")
    
    return "\n".join(lines)


# ─── Display Functions ──────────────────────────────────────────────────────
def display_sport_menu():
    """Display sport selection menu"""
    print()
    print(draw_box_top())
    print(draw_box_middle("SELECT SPORT", align="center", color=C.BOLD + C.BRIGHT_WHITE))
    print(draw_box_sep())
    
    for key, sport in SPORTS.items():
        line = f"  [{key}] {sport['icon']}  {sport['name']}"
        print(draw_box_middle(line, color=sport["color"]))
    
    print(draw_box_sep())
    print(draw_box_middle("  [0]  🏠  All Sports", color=C.BRIGHT_WHITE))
    print(draw_box_sep())
    print(draw_box_middle("  [Q]  Quit", color=C.RED))
    print(draw_box_bottom())
    print()


def display_matches(matches, sport_filter=None):
    """Display matches in beautiful cards"""
    clear_screen()
    print_banner()
    
    # Filter by sport
    if sport_filter:
        matches = [m for m in matches if m.get("sport_type") == sport_filter]
    
    # Sort: LIVE first, then HALF_TIME, then UPCOMING, then FINISHED
    status_order = {"LIVE": 0, "HALF_TIME": 1, "UPCOMING": 2, "FINISHED": 3}
    matches = sorted(matches, key=lambda m: status_order.get(m["status"], 4))
    
    # Sport header
    sport_display = "All Sports"
    if sport_filter:
        for s in SPORTS.values():
            if s["type"] == sport_filter:
                sport_display = f"{s['icon']} {s['name']}"
                break
    
    now_str = datetime.now().strftime("%H:%M:%S")
    
    print()
    print(draw_box_top())
    header = f"  {sport_display}  |  {len(matches)} matches  |  Updated: {now_str}"
    print(draw_box_middle(header, color=C.BOLD + C.BRIGHT_WHITE))
    print(draw_box_sep())
    
    # Category counts
    live_count = len([m for m in matches if m["status"] == "LIVE"])
    ht_count = len([m for m in matches if m["status"] == "HALF_TIME"])
    up_count = len([m for m in matches if m["status"] == "UPCOMING"])
    fin_count = len([m for m in matches if m["status"] == "FINISHED"])
    
    counts = []
    if live_count > 0:
        counts.append(f"{C.RED}🔴 LIVE: {live_count}{C.RESET}")
    if ht_count > 0:
        counts.append(f"{C.YELLOW}⏸ HT: {ht_count}{C.RESET}")
    if up_count > 0:
        counts.append(f"{C.BRIGHT_BLUE}⚪ UPCOMING: {up_count}{C.RESET}")
    if fin_count > 0:
        counts.append(f"{C.GREEN}✅ FINISHED: {fin_count}{C.RESET}")
    
    if counts:
        print(draw_box_middle("  " + " | ".join(counts), color=C.WHITE))
        print(draw_box_sep())
    print(draw_box_bottom())
    
    # Match cards
    if not matches:
        print()
        print(f"  {C.YELLOW}⚠ No matches found for this sport.{C.RESET}")
    else:
        for idx, match in enumerate(matches, 1):
            print()
            print(draw_match_card(match, idx))
    
    # Controls
    print()
    print(draw_box_top())
    print(draw_box_middle("CONTROLS", align="center", color=C.BOLD + C.BRIGHT_WHITE))
    print(draw_box_sep())
    print(draw_box_middle("  [1-N] Select match  |  [R] Refresh  |  [S] Change sport", color=C.WHITE))
    print(draw_box_middle("  [A] Auto-refresh: ON/OFF  |  [J] Save JSON  |  [Q] Quit", color=C.WHITE))
    print(draw_box_bottom())
    print()
    
    return matches


# ─── Stream Testing ─────────────────────────────────────────────────────────
def test_stream_speed(stream_url, timeout=8):
    """Test stream speed and return result dict"""
    result = {
        "url": stream_url,
        "speed": 0,
        "latency": 0,
        "status": "UNKNOWN",
        "quality": "?"
    }
    
    if not stream_url:
        result["status"] = "NO_URL"
        return result
    
    try:
        start = time.time()
        
        # Try a HEAD request first
        resp = requests.head(
            stream_url,
            headers=STREAM_HEADERS,
            timeout=timeout,
            allow_redirects=True
        )
        
        latency = time.time() - start
        result["latency"] = round(latency * 1000, 1)
        
        if resp.status_code in (200, 206):
            # Check content type for quality indicator
            ct = resp.headers.get("Content-Type", "").lower()
            cl = resp.headers.get("Content-Length", "0")
            
            # Determine quality from content
            if "mpegurl" in ct or "m3u8" in ct:
                result["quality"] = "HLS"
                result["status"] = "ONLINE"
            elif any(v in ct for v in ["video", "mp2t", "mpeg"]):
                result["quality"] = "HD"
                result["status"] = "ONLINE"
            elif int(cl) > 1000:
                result["quality"] = "SD"
                result["status"] = "ONLINE"
            else:
                result["quality"] = "?"
                result["status"] = "ONLINE"
            
            result["speed"] = round(1.0 / max(latency, 0.001), 1)
            
        elif resp.status_code == 403:
            result["status"] = "BLOCKED"
        else:
            result["status"] = f"HTTP_{resp.status_code}"
            
    except requests.Timeout:
        result["status"] = "TIMEOUT"
    except Exception as e:
        result["status"] = f"ERROR"
    
    return result


def rank_streams(streams):
    """Test all streams and rank by speed"""
    if not streams:
        return []
    
    results = []
    for stream in streams:
        print(f"  {C.DIM}Testing {stream['name']}...{C.RESET}", end="", flush=True)
        result = test_stream_speed(stream["url"])
        result["name"] = stream["name"]
        result["type"] = stream.get("type", "unknown")
        
        status_colors = {
            "ONLINE": C.BRIGHT_GREEN,
            "BLOCKED": C.YELLOW,
            "TIMEOUT": C.RED,
            "NO_URL": C.RED,
        }
        sc = status_colors.get(result["status"], C.RED)
        print(f"\r  {sc}{result['status']}{C.RESET} {C.DIM}{result['latency']}ms{C.RESET}")
        
        results.append(result)
    
    # Sort by status (ONLINE first) then by speed
    def sort_key(r):
        is_online = 1 if r["status"] == "ONLINE" else 0
        return (-is_online, -r["speed"])
    
    results.sort(key=sort_key)
    return results


# ─── Match Detail View ──────────────────────────────────────────────────────
def show_match_detail(match):
    """Show detailed match view with stream selection"""
    global proxy_stop_event
    
    while True:
        clear_screen()
        print_banner()
        
        sport_info = None
        for s in SPORTS.values():
            if s["type"] == match.get("sport_type", "football"):
                sport_info = s
                break
        
        icon = sport_info["icon"] if sport_info else "⚽"
        
        print()
        print(draw_box_top())
        print(draw_box_middle(f"  {icon} {match['home_team']} vs {match['away_team']}", 
                              color=C.BOLD + C.BRIGHT_WHITE))
        print(draw_box_sep())
        
        # Score
        status = match["status"]
        if status == "LIVE":
            minute = get_match_minute(match)
            score_color = C.BRIGHT_RED
            status_str = f"🔴 LIVE {minute}"
        elif status == "HALF_TIME":
            score_color = C.YELLOW
            status_str = "⏸ HALF TIME"
        elif status == "FINISHED":
            score_color = C.BRIGHT_GREEN
            status_str = "✅ FULL TIME"
        else:
            score_color = C.BRIGHT_BLUE
            status_str = f"⚪ {format_match_time(match['start_time'])}"
        
        score_line = f"  {C.BOLD}{score_color}{match['home_score']} - {match['away_score']}{C.RESET}"
        print(draw_box_middle(score_line, color=score_color))
        print(draw_box_middle(f"  {status_str}", color=C.WHITE))
        
        # League info
        if match.get("league"):
            print(draw_box_sep())
            print(draw_box_middle(f"  🏆 {match['league']}", color=C.BRIGHT_YELLOW))
        if match.get("round"):
            print(draw_box_middle(f"  📅 {match['round']}", color=C.WHITE))
        
        # Odds
        if match.get("odds"):
            odds_str = "  📊 Odds: " + " | ".join([f"{o['type']}: {o['value']}" for o in match["odds"]])
            print(draw_box_middle(odds_str, color=C.DIM))
        
        print(draw_box_bottom())
        
        # Streams section
        streams = match.get("streams", [])
        
        print()
        print(draw_box_top())
        print(draw_box_middle("STREAMS", align="center", color=C.BOLD + C.BRIGHT_CYAN))
        print(draw_box_sep())
        
        if not streams:
            print(draw_box_middle("  ⚠ No streams available", color=C.YELLOW))
        else:
            for idx, stream in enumerate(streams, 1):
                q = stream.get("quality", "?")
                t = stream.get("type", "?")
                line = f"  [{idx}] {stream['name']} [{q}/{t.upper()}]"
                print(draw_box_middle(line, color=C.BRIGHT_WHITE))
                # Truncate URL for display
                url_display = stream["url"][:55] + "..." if len(stream["url"]) > 55 else stream["url"]
                print(draw_box_middle(f"      {C.DIM}{url_display}{C.RESET}", color=C.DIM))
        
        print(draw_box_sep())
        print(draw_box_middle("  [T] Test all streams  |  [P] Start Proxy", color=C.WHITE))
        print(draw_box_middle("  [B] Back to matches", color=C.WHITE))
        print(draw_box_bottom())
        print()
        
        choice = input(f"  {C.BRIGHT_CYAN}>>>{C.RESET} ").strip().lower()
        
        if choice == "b":
            return
        elif choice == "t" and streams:
            print(f"\n  {C.BOLD}Testing all streams...{C.RESET}\n")
            ranked = rank_streams(streams)
            
            print(f"\n  {C.BOLD}Ranked Results:{C.RESET}")
            for r in ranked:
                sc = C.BRIGHT_GREEN if r["status"] == "ONLINE" else C.RED
                print(f"    {sc}{r['status']}{C.RESET} {r['name']} - {r['latency']}ms - {r['quality']}")
            
            input(f"\n  {C.DIM}Press Enter to continue...{C.RESET}")
        
        elif choice == "p" and streams:
            # Find best stream
            best = None
            for s in streams:
                if s.get("type") == "m3u8":
                    best = s
                    break
            if not best and streams:
                best = streams[0]
            
            if best:
                start_proxy_server(best["url"])
        
        elif choice.isdigit() and 1 <= int(choice) <= len(streams):
            stream = streams[int(choice) - 1]
            print(f"\n  {C.BRIGHT_WHITE}Selected:{C.RESET} {stream['name']}")
            print(f"  {C.DIM}URL:{C.RESET} {stream['url']}")
            
            if stream.get("type") == "m3u8":
                print(f"\n  {C.BRIGHT_GREEN}This is a direct m3u8 stream.{C.RESET}")
                print(f"  {C.DIM}You can play it with:{C.RESET}")
                print(f"    mpv \"{stream['url']}\"")
                print(f"    vlc \"{stream['url']}\"")
                print(f"\n  {C.BRIGHT_CYAN}[P]{C.RESET} Start proxy server")
                print(f"  {C.DIM}[Any key] Back{C.RESET}")
                sub = input(f"  {C.BRIGHT_CYAN}>>>{C.RESET} ").strip().lower()
                if sub == "p":
                    start_proxy_server(stream["url"])
            else:
                print(f"\n  {C.YELLOW}This is a player page, not a direct stream.{C.RESET}")
                m3u8 = extract_m3u8_from_url(stream["url"])
                if m3u8:
                    print(f"  {C.BRIGHT_GREEN}Extracted m3u8:{C.RESET} {m3u8}")
            
            input(f"\n  {C.DIM}Press Enter to continue...{C.RESET}")


# ─── Proxy Server (from original, preserved) ────────────────────────────────
class SegmentCache:
    """Thread-safe LRU cache for HLS segments"""
    
    def __init__(self, maxsize=30, ttl_seconds=60):
        self._cache = OrderedDict()
        self._lock = threading.RLock()
        self._maxsize = maxsize
        self._ttl = ttl_seconds
    
    def get(self, url):
        with self._lock:
            if url in self._cache:
                data, timestamp = self._cache[url]
                if time.time() - timestamp < self._ttl:
                    self._cache.move_to_end(url)
                    return data
                else:
                    del self._cache[url]
            return None
    
    def put(self, url, data):
        with self._lock:
            if url in self._cache:
                self._cache.move_to_end(url)
            self._cache[url] = (data, time.time())
            while len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)
    
    def has(self, url):
        return self.get(url) is not None


def start_proxy_server(target_m3u8_url):
    """Start HTTP proxy server for HLS streaming"""
    import http.server
    import socketserver
    
    global proxy_stop_event
    proxy_stop_event.clear()
    
    target_base = target_m3u8_url.rsplit("/", 1)[0] + "/"
    
    # Persistent session
    session = requests.Session()
    session.headers.update(STREAM_HEADERS)
    adapter = HTTPAdapter(
        pool_connections=20,
        pool_maxsize=50,
        max_retries=Retry(total=3, backoff_factor=0.3, status_forcelist=[500, 502, 503, 504])
    )
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    segment_cache = SegmentCache(maxsize=30, ttl_seconds=120)
    playlist_state = {
        "segments": [],
        "playlist_content": "",
        "last_update": 0,
        "lock": threading.RLock(),
    }
    local_stop = threading.Event()
    
    class StreamProxyHandler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        
        def log_message(self, format, *args):
            pass
        
        def _send_cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Connection", "keep-alive")
        
        def do_GET(self):
            path = self.path
            try:
                if path == "/" or path == "/playlist.m3u8":
                    resp = session.get(target_m3u8_url, timeout=10)
                    content = resp.text if resp.status_code == 200 else ""
                    
                    # Rewrite playlist
                    lines = content.split("\n")
                    rewritten = []
                    for line in lines:
                        stripped = line.strip()
                        if not stripped or stripped.startswith("#"):
                            rewritten.append(line)
                            continue
                        if not stripped.startswith("http"):
                            stripped = urljoin(target_base, stripped)
                        rewritten.append(f"/proxy/{stripped}")
                    
                    content_bytes = "\n".join(rewritten).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                    self.send_header("Content-Length", str(len(content_bytes)))
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(content_bytes)
                    return
                
                if path.startswith("/proxy/"):
                    original_url = unquote(path[7:])
                    cached = segment_cache.get(original_url)
                    
                    self.send_response(200)
                    self.send_header("Content-Type", "video/MP2T")
                    self._send_cors()
                    self.end_headers()
                    
                    if cached:
                        self.wfile.write(cached)
                    else:
                        resp = session.get(original_url, timeout=15, stream=True)
                        if resp.status_code == 200:
                            chunks = []
                            for chunk in resp.iter_content(chunk_size=16384):
                                if chunk:
                                    chunks.append(chunk)
                                    self.wfile.write(chunk)
                            if chunks:
                                segment_cache.put(original_url, b"".join(chunks))
                    return
                
                self.send_response(404)
                self.end_headers()
            except Exception:
                try:
                    self.send_response(500)
                    self.end_headers()
                except Exception:
                    pass
    
    class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True
    
    port = CONFIG["proxy_port"]
    for attempt in range(10):
        try:
            httpd = ThreadedHTTPServer(("", port), StreamProxyHandler)
            httpd.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            break
        except OSError:
            port += 1
    else:
        print(f"  {C.RED}✗ Could not find available port{C.RESET}")
        return
    
    try:
        print(f"\n  {C.BRIGHT_GREEN}🚀 Proxy started on http://localhost:{port}{C.RESET}")
        print(f"  {C.BRIGHT_CYAN}📺 Playlist: http://localhost:{port}/playlist.m3u8{C.RESET}")
        print(f"\n  {C.DIM}Press Ctrl+C to stop{C.RESET}\n")
        
        httpd.timeout = 1
        while not proxy_stop_event.is_set():
            httpd.handle_request()
    except KeyboardInterrupt:
        pass
    finally:
        local_stop.set()
        session.close()
        httpd.server_close()
        print(f"\n  {C.YELLOW}🛑 Proxy stopped{C.RESET}")
        input(f"  {C.DIM}Press Enter to continue...{C.RESET}")


# ─── JSON Save ──────────────────────────────────────────────────────────────
def save_to_json(matches):
    """Save matches to JSON file"""
    try:
        data = {
            "saved_at": datetime.now().isoformat(),
            "total_matches": len(matches),
            "matches": matches,
        }
        with open(CONFIG["cache_file"], "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\n  {C.BRIGHT_GREEN}💾 Saved {len(matches)} matches to {CONFIG['cache_file']}{C.RESET}")
    except Exception as e:
        print(f"\n  {C.RED}✗ Error saving: {e}{C.RESET}")


# ─── Auto Refresh ───────────────────────────────────────────────────────────
class AutoRefresh:
    """Handles auto-refresh functionality"""
    
    def __init__(self):
        self.enabled = False
        self.thread = None
        self.last_matches = []
        self.callback = None
    
    def start(self, callback):
        self.enabled = True
        self.callback = callback
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
    
    def stop(self):
        self.enabled = False
    
    def _loop(self):
        while self.enabled:
            for _ in range(CONFIG["refresh_interval"]):
                if not self.enabled:
                    return
                time.sleep(1)
            if self.enabled and self.callback:
                try:
                    self.callback()
                except Exception:
                    pass


# ─── Main ───────────────────────────────────────────────────────────────────
def main():
    global current_sport, last_matches
    
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    
    clear_screen()
    print_banner()
    
    # Show loading
    spinner = Spinner("Fetching matches")
    spinner.start()
    matches, working_domain = fetch_matches()
    spinner.stop(success=len(matches) > 0)
    
    if not matches:
        print(f"\n  {C.RED}✗ Could not fetch matches. Check your internet connection.{C.RESET}")
        sys.exit(1)
    
    last_matches = matches
    
    # Sport selection
    selected_sport = None
    while True:
        clear_screen()
        print_banner()
        display_sport_menu()
        
        choice = input(f"  {C.BRIGHT_CYAN}Select sport >>>{C.RESET} ").strip().lower()
        
        if choice == "q":
            print(f"\n  {C.BRIGHT_GREEN}👋 Goodbye!{C.RESET}\n")
            sys.exit(0)
        elif choice == "0":
            selected_sport = None
            break
        elif choice in SPORTS:
            selected_sport = SPORTS[choice]["type"]
            current_sport = selected_sport
            break
        else:
            print(f"  {C.RED}Invalid choice!{C.RESET}")
            time.sleep(1)
    
    # Auto-refresh setup
    auto_refresh = AutoRefresh()
    
    def refresh_callback():
        global last_matches
        try:
            new_matches, _ = fetch_matches(working_domain)
            if new_matches:
                last_matches = new_matches
        except Exception:
            pass
    
    # Main loop
    while True:
        try:
            # Display matches
            filtered = display_matches(last_matches, selected_sport)
            
            # Get user input
            print(f"  {C.DIM}Auto-refresh: {'ON' if auto_refresh.enabled else 'OFF'} | Interval: {CONFIG['refresh_interval']}s{C.RESET}")
            choice = input(f"  {C.BRIGHT_CYAN}>>>{C.RESET} ").strip().lower()
            
            if choice == "q":
                auto_refresh.stop()
                print(f"\n  {C.BRIGHT_GREEN}👋 Goodbye!{C.RESET}\n")
                sys.exit(0)
            
            elif choice == "r":
                spinner = Spinner("Refreshing")
                spinner.start()
                new_matches, _ = fetch_matches(working_domain)
                if new_matches:
                    last_matches = new_matches
                spinner.stop(success=len(new_matches) > 0)
            
            elif choice == "s":
                # Change sport
                clear_screen()
                print_banner()
                display_sport_menu()
                sub = input(f"  {C.BRIGHT_CYAN}Select sport >>>{C.RESET} ").strip().lower()
                if sub == "0":
                    selected_sport = None
                elif sub in SPORTS:
                    selected_sport = SPORTS[sub]["type"]
                elif sub == "q":
                    pass
            
            elif choice == "a":
                if auto_refresh.enabled:
                    auto_refresh.stop()
                    print(f"  {C.YELLOW}Auto-refresh OFF{C.RESET}")
                else:
                    auto_refresh.start(refresh_callback)
                    print(f"  {C.BRIGHT_GREEN}Auto-refresh ON ({CONFIG['refresh_interval']}s){C.RESET}")
                time.sleep(1)
            
            elif choice == "j":
                save_to_json(last_matches)
                input(f"  {C.DIM}Press Enter to continue...{C.RESET}")
            
            elif choice.isdigit():
                idx = int(choice)
                if 1 <= idx <= len(filtered):
                    show_match_detail(filtered[idx - 1])
            
            else:
                pass
        
        except KeyboardInterrupt:
            auto_refresh.stop()
            print(f"\n\n  {C.BRIGHT_GREEN}👋 Goodbye!{C.RESET}\n")
            sys.exit(0)
        except Exception as e:
            print(f"\n  {C.RED}Error: {e}{C.RESET}")
            time.sleep(2)


if __name__ == "__main__":
    main()
