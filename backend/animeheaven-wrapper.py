#!/usr/bin/env python3
import sys
import json
sys.path.insert(0, './routes')

from animeheaven_scraper import search_anime, get_episode_list, extract_video_source, SessionManager

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing action"}))
        return

    action = sys.argv[1]
    session = SessionManager()

    try:
        if action == 'search':
            query = sys.argv[2] if len(sys.argv) > 2 else ""
            results = search_anime(session, query)
            print(json.dumps({
                "success": True,
                "results": [{"title": r["title"], "id": r["id"], "url": r["url"]} for r in results]
            }))

        elif action == 'episodes':
            anime_id = sys.argv[2] if len(sys.argv) > 2 else ""
            anime_url = f"https://animeheaven.me/anime.php?{anime_id}"
            episodes = get_episode_list(session, anime_url, anime_id)
            print(json.dumps({
                "success": True,
                "episodes": [{"number": e["number"], "title": e["title"], "ep_id": e.get("ep_id", "")} for e in episodes]
            }))

        
        elif action == 'stream':
            anime_id = sys.argv[2] if len(sys.argv) > 2 else ""
            ep_number = sys.argv[3] if len(sys.argv) > 3 else ""
            ep_id = sys.argv[4] if len(sys.argv) > 4 else ""
            
            if ep_id:
                # Try direct CDN construction
                CDN_SUBDOMAINS = ['rk', 'fi', 'cc', 'la', 'ny', 'va', 'tx', 'ca', 'eu', 'us']
                for subdomain in CDN_SUBDOMAINS:
                    stream_url = f"https://{subdomain}.animeheaven.me/video.mp4?{ep_id}"
                    try:
                        import requests
                        resp = requests.head(stream_url, timeout=5)
                        if resp.status_code == 200:
                            download_url = f"https://{subdomain}.animeheaven.me/video.mp4?{ep_id}&d"
                            print(json.dumps({
                                "success": True,
                                "streamUrl": stream_url,
                                "downloadUrl": download_url,
                                "sourceType": "mp4"
                            }))
                            return
                    except:
                        continue
            
            print(json.dumps({"success": False, "error": "Could not extract video source"}))


if __name__