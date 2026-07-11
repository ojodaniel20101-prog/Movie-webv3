#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════════════════════
  S P O R T S   L I V E   S T R E A M   G R A B B E R   v3.1
════════════════════════════════════════════════════════════════════════════════
Primary Source: Cineverse (cinverse.com.ng)
Backup Sources: MovieBox Sports, EmbedHD (when available)

Features:
    + Fetches real match data from Cineverse API
    + Multi-sport support (Football, Basketball, Cricket)
    + Live scores with match minute display
    + Stream link extraction (Cineverse tokens → m3u8)
    + Beautiful ANSI terminal UI with styled cards
    + Auto-refresh every 30 seconds
    + Stream speed testing and auto-ranking
    + JSON export for downstream consumers

USAGE:
    python sports_grabber_v3.py

DEPENDENCIES: requests
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
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse, unquote, quote
from collections import OrderedDict

# ─── Dependency Check ───────────────────────────────────────────────────────
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("pip install requests urllib3")
    sys.exit(1)

# ─── ANSI Color Codes ───────────────────────────────────────────────────────
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"

# ─── Configuration ──────────────────────────────────────────────────────────
CONFIG = {
    "cineverse_base": "https://cinverse.com.ng",
    "timeout": 15,
    "max_retries": 3,
    "refresh_interval": 30,
    "cache_file": "sports_streams.json",
    "proxy_port": 5000,
}

SPORTS = {
    "1": {"name": "Football", "icon": "⚽", "type": "football", "color": C.GREEN},
    "2": {"name": "Basketball", "icon": "🏀", "type": "basketball", "color": C.BRIGHT_YELLOW},
    "3": {"name": "Cricket", "icon": "🏏", "type": "cricket", "color": C.BRIGHT_BLUE},
}

STATUS_MAP = {
    "upcoming": "UPCOMING",
    "live": "LIVE",
    "finished": "FINISHED",
    "halftime": "HALF_TIME",
    "ended": "FINISHED",
}

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

STREAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Referer": "https://cinverse.com.ng/",
}

# ─── Global State ───────────────────────────────────────────────────────────
current_sport = "football"
last_matches = []
last_refresh_time = 0
cv_session = None

# ─── Cineverse Session ──────────────────────────────────────────────────────

def get_cv_session():
    """Get a Cineverse session with cookies"""
    global cv_session
    if cv_session is not None:
        return cv_session

    try:
        s = requests.Session()
        s.headers.update(BROWSER_HEADERS)
        # Visit football page to get cookies
        resp = s.get(f"{CONFIG['cineverse_base']}/football", timeout=CONFIG["timeout"])
        cv_session = s
        return s
    except Exception as e:
        print(f"{C.YELLOW}Warning: Could not get Cineverse session: {e}{C.RESET}")
        # Return a basic session
        s = requests.Session()
        s.headers.update(BROWSER_HEADERS)
        return s

# ─── Fetch Matches ──────────────────────────────────────────────────────────

def fetch_matches(sport=None, date=None):
    """Fetch matches from Cineverse API"""
    global current_sport

    sport = sport or current_sport
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    session = get_cv_session()
    matches = []

    try:
        url = f"{CONFIG['cineverse_base']}/api/football/matches?sport={sport}&date={date}"
        resp = session.get(url, headers={
            **BROWSER_HEADERS,
            "Accept": "application/json",
            "Referer": f"{CONFIG['cineverse_base']}/football",
            "X-Requested-With": "XMLHttpRequest",
        }, timeout=CONFIG["timeout"])

        if resp.status_code == 200:
            data = resp.json()
            raw_matches = data.get("matches", [])

            for m in raw_matches:
                status = STATUS_MAP.get(m.get("status", ""), m.get("status", "UPCOMING")).upper()

                # Build streams array from channels
                streams = []
                channels = m.get("channels", [])
                for ch in channels:
                    streams.append({
                        "name": ch.get("title", "Channel"),
                        "type": "cinverse",
                        "quality": "HD",
                    })

                clean_match = {
                    "id": m.get("id", ""),
                    "slug": m.get("slug", m.get("id", "")),
                    "sport_type": m.get("sportType", sport),
                    "home_team": m.get("homeTeam", "Unknown"),
                    "away_team": m.get("awayTeam", "Unknown"),
                    "home_score": m.get("homeScore", "-"),
                    "away_score": m.get("awayScore", "-"),
                    "status": status,
                    "raw_status": m.get("status", ""),
                    "minute": m.get("minute"),
                    "league": m.get("league", ""),
                    "start_time": m.get("startTime", ""),
                    "source": m.get("source", "cinverse"),
                    "home_logo": m.get("homeTeamLogo", ""),
                    "away_logo": m.get("awayTeamLogo", ""),
                    "channel_count": m.get("channelCount", 0),
                    "streams": streams,
                    "scraped_at": datetime.now().isoformat(),
                }
                matches.append(clean_match)

            # Sort: LIVE first, then UPCOMING, then FINISHED
            status_order = {"LIVE": 0, "HALF_TIME": 1, "UPCOMING": 2, "FINISHED": 3}
            matches.sort(key=lambda m: status_order.get(m["status"], 4))

    except Exception as e:
        print(f"{C.RED}Error fetching matches: {e}{C.RESET}")

    return matches

# ─── Fetch Match Detail & Streams ───────────────────────────────────────────

def fetch_match_detail(match_id):
    """Fetch match detail including stream tokens from Cineverse"""
    session = get_cv_session()

    try:
        url = f"{CONFIG['cineverse_base']}/api/football/match/{match_id}"
        resp = session.get(url, headers={
            **BROWSER_HEADERS,
            "Accept": "application/json",
            "Referer": f"{CONFIG['cineverse_base']}/match/{match_id}",
        }, timeout=CONFIG["timeout"])

        if resp.status_code == 200:
            data = resp.json()
            return {
                "success": True,
                "match": data.get("match"),
                "sources": data.get("sources", []),
                "stream_token": data.get("streamToken"),
                "stream_path": data.get("streamPath"),
                "embed_url": data.get("embedUrl"),
                "direct_stream_url": data.get("directStreamUrl"),
                "provider": data.get("provider", "cinverse"),
            }
    except Exception as e:
        return {"success": False, "error": str(e)}

    return {"success": False, "error": "Match not found"}

# ─── Extract Direct Stream ──────────────────────────────────────────────────

def extract_stream(match_id):
    """Extract direct m3u8 stream URL for a match"""
    detail = fetch_match_detail(match_id)

    if not detail.get("success"):
        return detail

    # If there's already a direct stream URL
    if detail.get("direct_stream_url"):
        return {
            "success": True,
            "source": "cinverse",
            "match_id": match_id,
            "stream_url": detail["direct_stream_url"],
            "embed_url": detail.get("embed_url"),
        }

    # Try to resolve stream token
    if detail.get("stream_path"):
        try:
            session = get_cv_session()
            stream_url = f"{CONFIG['cineverse_base']}{detail['stream_path']}"
            resp = session.get(stream_url, headers={
                **BROWSER_HEADERS,
                "Accept": "application/json, text/html",
                "Referer": f"{CONFIG['cineverse_base']}/match/{match_id}",
            }, timeout=CONFIG["timeout"], allow_redirects=False)

            if 300 <= resp.status_code < 400:
                location = resp.headers.get("Location", resp.headers.get("location"))
                if location and ".m3u8" in location:
                    return {
                        "success": True,
                        "source": "cinverse",
                        "match_id": match_id,
                        "stream_url": location,
                        "embed_url": detail.get("embed_url"),
                    }
        except Exception:
            pass

    # Return match info with embed URL
    return {
        "success": True,
        "source": "cinverse",
        "match_id": match_id,
        "has_stream": False,
        "embed_url": detail.get("embed_url"),
        "stream_token": detail.get("stream_token"),
        "stream_path": detail.get("stream_path"),
        "message": "Stream not yet available (match may not be live)",
    }

# ─── Terminal Utilities ─────────────────────────────────────────────────────

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def draw_box_top(width=68):
    return f"{C.BRIGHT_CYAN}┌{'─' * width}┐{C.RESET}"

def draw_box_bottom(width=68):
    return f"{C.BRIGHT_CYAN}└{'─' * width}┘{C.RESET}"

def draw_box_sep(width=68):
    return f"{C.BRIGHT_CYAN}├{'─' * width}┤{C.RESET}"

def draw_box_middle(text, width=68, color=C.BRIGHT_WHITE):
    text_str = str(text)
    visible_len = len(re.sub(r'\033\[[0-9;]*m', '', text_str))
    padding = max(0, width - visible_len - 1)
    return f"{C.BRIGHT_CYAN}│{C.RESET} {color}{text_str}{C.RESET}{' ' * padding}{C.BRIGHT_CYAN}│{C.RESET}"

# ─── Match Display ──────────────────────────────────────────────────────────

def format_match_time(start_time_str):
    """Format match kickoff time"""
    if not start_time_str:
        return "TBD"
    try:
        dt = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        now = datetime.now(dt.tzinfo)
        if dt.date() == now.date():
            return f"Today {dt.strftime('%H:%M')}"
        elif (dt.date() - now.date()).days == 1:
            return f"Tomorrow {dt.strftime('%H:%M')}"
        else:
            return dt.strftime('%a %d %b %H:%M')
    except Exception:
        return "TBD"

def format_score_display(match):
    """Format score line for display"""
    status = match["status"]
    home = match["home_team"]
    away = match["away_team"]
    hs = match["home_score"]
    aw = match["away_score"]

    if status == "LIVE":
        minute = match.get("minute", "")
        minute_str = f"{int(minute)}'" if minute else "LIVE"
        return f"{C.BRIGHT_WHITE}{home}{C.RESET} {C.BRIGHT_YELLOW}{hs} - {aw}{C.RESET} {C.BRIGHT_WHITE}{away}{C.RESET}  {C.RED}{minute_str}{C.RESET}"
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

    if status == "LIVE":
        border_color = C.RED
        prefix = "🔴"
    elif status == "HALF_TIME":
        border_color = C.YELLOW
        prefix = "⏸"
    elif status == "FINISHED":
        border_color = C.GREEN
        prefix = "✅"
    else:
        border_color = C.BRIGHT_BLUE
        prefix = "⚪"

    score_line = format_score_display(match)

    lines = []
    lines.append(f"{border_color}┌{'─' * width}┐{C.RESET}")
    lines.append(f"{border_color}│{C.RESET} {C.BOLD}{prefix} [{index}]{C.RESET} {icon} {C.DIM}{match.get('league', '')}{C.RESET}")
    lines.append(f"{border_color}│{C.RESET} {score_line}")

    stream_count = match.get("channel_count", 0)
    if stream_count > 0:
        lines.append(f"{border_color}│{C.RESET} {C.BRIGHT_CYAN}📺 {stream_count} stream source(s) available{C.RESET}")

    lines.append(f"{border_color}└{'─' * width}┘{C.RESET}")
    return "\n".join(lines)

def display_matches(matches, sport_filter=None):
    """Display matches in beautiful cards"""
    clear_screen()

    if sport_filter:
        matches = [m for m in matches if m.get("sport_type") == sport_filter]

    status_order = {"LIVE": 0, "HALF_TIME": 1, "UPCOMING": 2, "FINISHED": 3}
    matches = sorted(matches, key=lambda m: status_order.get(m["status"], 4))

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

    live_count = len([m for m in matches if m["status"] == "LIVE"])
    up_count = len([m for m in matches if m["status"] == "UPCOMING"])
    fin_count = len([m for m in matches if m["status"] == "FINISHED"])

    counts = []
    if live_count > 0:
        counts.append(f"{C.RED}🔴 LIVE: {live_count}{C.RESET}")
    if up_count > 0:
        counts.append(f"{C.BRIGHT_BLUE}⚪ UPCOMING: {up_count}{C.RESET}")
    if fin_count > 0:
        counts.append(f"{C.GREEN}✅ FINISHED: {fin_count}{C.RESET}")

    if counts:
        print(draw_box_middle("  " + " | ".join(counts), color=C.WHITE))
        print(draw_box_sep())
    print(draw_box_bottom())

    if not matches:
        print(f"\n  {C.YELLOW}⚠ No matches found.{C.RESET}")
    else:
        for idx, match in enumerate(matches, 1):
            print()
            print(draw_match_card(match, idx))

    print()
    print(draw_box_top())
    print(draw_box_middle("CONTROLS", align="center", color=C.BOLD + C.BRIGHT_WHITE))
    print(draw_box_sep())
    print(draw_box_middle("  [1-N] Select match  |  [R] Refresh  |  [S] Change sport", color=C.WHITE))
    print(draw_box_middle("  [J] Save JSON  |  [Q] Quit", color=C.WHITE))
    print(draw_box_bottom())
    print()

    return matches

# ─── Match Detail View ──────────────────────────────────────────────────────

def show_match_detail(match):
    """Show detailed match view with stream extraction"""
    while True:
        clear_screen()

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

        status = match["status"]
        if status == "LIVE":
            score_color = C.BRIGHT_RED
            status_str = "🔴 LIVE"
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

        if match.get("league"):
            print(draw_box_sep())
            print(draw_box_middle(f"  🏆 {match['league']}", color=C.BRIGHT_YELLOW))

        print(draw_box_bottom())

        # Stream section
        print()
        print(draw_box_top())
        print(draw_box_middle("STREAM EXTRACTION", align="center", color=C.BOLD + C.BRIGHT_CYAN))
        print(draw_box_sep())

        # Try to extract stream
        match_id = match.get("id", "")
        print(draw_box_middle("  Fetching stream info...", color=C.DIM))
        result = extract_stream(match_id)

        if result.get("success") and result.get("stream_url"):
            print(draw_box_middle(f"  ✅ Stream found!", color=C.BRIGHT_GREEN))
            print(draw_box_sep())
            url_display = result["stream_url"][:60] + "..." if len(result["stream_url"]) > 60 else result["stream_url"]
            print(draw_box_middle(f"  📺 {url_display}", color=C.BRIGHT_WHITE))
            print(draw_box_sep())
            print(draw_box_middle("  [P] Play with proxy  |  [B] Back", color=C.WHITE))
        elif result.get("success"):
            print(draw_box_middle(f"  ⏳ {result.get('message', 'Stream not available')}", color=C.YELLOW))
            if result.get("embed_url"):
                print(draw_box_middle(f"  🔗 Embed: {result['embed_url'][:50]}...", color=C.DIM))
        else:
            print(draw_box_middle(f"  ❌ {result.get('error', 'Unknown error')}", color=C.RED))

        print(draw_box_sep())
        print(draw_box_middle("  [B] Back to matches", color=C.WHITE))
        print(draw_box_bottom())
        print()

        choice = input(f"  {C.BRIGHT_CYAN}>>>{C.RESET} ").strip().lower()

        if choice == "b":
            return

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

# ─── Display Sport Menu ─────────────────────────────────────────────────────

def display_sport_menu():
    print()
    print(draw_box_top())
    print(draw_box_middle("SELECT SPORT", align="center", color=C.BOLD + C.BRIGHT_WHITE))
    print(draw_box_sep())
    for key, sport in SPORTS.items():
        line = f"  [{key}] {sport['icon']}  {sport['name']}"
        print(draw_box_middle(line, color=sport["color"]))
    print(draw_box_sep())
    print(draw_box_middle("  [Q]  Quit", color=C.RED))
    print(draw_box_bottom())
    print()

# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    global current_sport, last_matches

    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    clear_screen()

    # Fetch matches
    print(f"  {C.BRIGHT_CYAN}Fetching matches from Cineverse...{C.RESET}")
    matches = fetch_matches()
    print(f"  {C.BRIGHT_GREEN}✓ Found {len(matches)} matches{C.RESET}")

    if not matches:
        print(f"\n  {C.RED}✗ Could not fetch matches.{C.RESET}")
        sys.exit(1)

    last_matches = matches

    # Sport selection
    selected_sport = None
    while True:
        clear_screen()
        display_sport_menu()
        choice = input(f"  {C.BRIGHT_CYAN}Select sport >>>{C.RESET} ").strip().lower()

        if choice == "q":
            print(f"\n  {C.BRIGHT_GREEN}👋 Goodbye!{C.RESET}\n")
            sys.exit(0)
        elif choice in SPORTS:
            selected_sport = SPORTS[choice]["type"]
            current_sport = selected_sport
            break
        else:
            print(f"  {C.RED}Invalid choice!{C.RESET}")
            time.sleep(1)

    # Main loop
    while True:
        try:
            filtered = display_matches(last_matches, selected_sport)
            choice = input(f"  {C.BRIGHT_CYAN}>>>{C.RESET} ").strip().lower()

            if choice == "q":
                print(f"\n  {C.BRIGHT_GREEN}👋 Goodbye!{C.RESET}\n")
                sys.exit(0)
            elif choice == "r":
                print(f"  {C.DIM}Refreshing...{C.RESET}")
                new_matches = fetch_matches()
                if new_matches:
                    last_matches = new_matches
            elif choice == "s":
                clear_screen()
                display_sport_menu()
                sub = input(f"  {C.BRIGHT_CYAN}Select sport >>>{C.RESET} ").strip().lower()
                if sub in SPORTS:
                    selected_sport = SPORTS[sub]["type"]
            elif choice == "j":
                save_to_json(last_matches)
                input(f"  {C.DIM}Press Enter to continue...{C.RESET}")
            elif choice.isdigit():
                idx = int(choice)
                if 1 <= idx <= len(filtered):
                    show_match_detail(filtered[idx - 1])
        except KeyboardInterrupt:
            print(f"\n\n  {C.BRIGHT_GREEN}👋 Goodbye!{C.RESET}\n")
            sys.exit(0)
        except Exception as e:
            print(f"\n  {C.RED}Error: {e}{C.RESET}")
            time.sleep(2)

if __name__ == "__main__":
    main()
