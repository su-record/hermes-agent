#!/usr/bin/env python3
"""Importance-aware multi-source search — ranks by signal, not search order.

News by cross-outlet coverage, X by influential accounts, YouTube by view velocity.
Discovery + synthesis via Codex OAuth (free, ChatGPT subscription); YouTube metadata via yt-dlp.
Optional deep-fetch engine via IMPORTANCE_FETCH_DIR (insane-search style); falls back to plain HTTP.
Config: search_domains.json (next to this file)."""
import os
import sys
import json
import math
import subprocess
import urllib.request

sys.path.insert(0, os.path.expanduser("~/hermes-agent"))
from agent.auxiliary_client import (  # noqa: E402
    _read_codex_access_token, _codex_cloudflare_headers, _CODEX_AUX_BASE_URL)

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "search_domains.json")


def codex_call(prompt, instructions, with_search=False, timeout=200):
    tok = _read_codex_access_token()
    if not tok:
        return ""
    h = _codex_cloudflare_headers(tok)
    h["Authorization"] = "Bearer " + tok
    h["Content-Type"] = "application/json"
    p = {"model": "gpt-5.5", "instructions": instructions,
         "input": [{"type": "message", "role": "user", "content": [{"type": "input_text", "text": prompt}]}],
         "stream": True, "store": False}
    if with_search:
        p["tools"] = [{"type": "web_search"}]
    try:
        raw = urllib.request.urlopen(urllib.request.Request(_CODEX_AUX_BASE_URL + "/responses",
              data=json.dumps(p).encode(), headers=h, method="POST"), timeout=timeout).read().decode()
    except Exception:
        return ""
    out = ""
    for line in raw.splitlines():
        if line.startswith("data:"):
            try:
                ev = json.loads(line[5:].strip())
            except Exception:
                continue
            if ev.get("type") == "response.output_text.delta":
                out += ev.get("delta", "")
    return out.strip()


def yt_flat_search(query, n=8):
    """Flat search returns view_count without the bot-gate that blocks full extraction on datacenter IPs."""
    try:
        r = subprocess.run([sys.executable, "-m", "yt_dlp", "ytsearch%d:%s" % (n, query),
                            "--flat-playlist", "--dump-json", "--no-warnings"],
                           capture_output=True, text=True, timeout=90)
    except Exception:
        return []
    out = []
    for line in r.stdout.splitlines():
        try:
            v = json.loads(line)
            if v.get("id"):
                out.append({"title": v.get("title", ""), "url": "https://youtu.be/" + v["id"],
                            "views": v.get("view_count") or 0, "channel": v.get("channel", "") or "",
                            "duration": v.get("duration") or 0})
        except Exception:
            continue
    return out


def youtube_top(domain, k=3):
    items, seen = [], set()
    for q in domain.get("youtube_queries", []):
        for pos, it in enumerate(yt_flat_search(q, 8)):
            if it["url"] in seen:
                continue
            seen.add(it["url"])
            it["pos"] = pos
            items.append(it)
    items = [it for it in items if it["duration"] == 0 or it["duration"] >= 90]
    for it in items:
        it["score"] = math.log10(it["views"] + 1) - it["pos"] * 0.04
    items.sort(key=lambda x: x["score"], reverse=True)
    return items[:k]


def _parse_lines(ans):
    out = []
    for line in ans.splitlines():
        if "|" in line and ("http" in line or "@" in line):
            parts = [p.strip() for p in line.split("|")]
            out.append({"title": parts[0].lstrip("-* "), "src": parts[1] if len(parts) > 1 else "",
                        "url": next((p for p in parts if p.startswith("http")), "")})
    return out


def x_top(domain, k=3):
    accs = domain.get("x_influencers", [])
    if not accs:
        return []
    al = ", ".join("@" + a for a in accs)
    ans = codex_call("On X, find the most important recent posts (last 24-72h) from these influential accounts: " + al +
                     ". Field: " + domain.get("label", "") + ". Output up to " + str(k) +
                     " lines formatted: title | account | url. Most impactful first.",
                     "Find recent high-impact posts from the given influential X accounts.", with_search=True)
    return _parse_lines(ans)[:k]


def news_top(domain, k=3):
    kw = ", ".join(domain.get("keywords", []))
    ans = codex_call("Field '" + domain.get("label", "") + "' (" + kw + "): find today's most important news. "
                     "Importance = cross-outlet coverage + recency. Output up to " + str(k) +
                     " lines formatted: title | outlet | url, most important first.",
                     "Find today's most important news by cross-outlet coverage and recency.", with_search=True)
    return _parse_lines(ans)[:k]


def deep_fetch(url):
    fdir = os.environ.get("IMPORTANCE_FETCH_DIR")
    if fdir and os.path.isdir(fdir):
        try:
            r = subprocess.run([sys.executable, "-m", "engine", url, "--max-attempts", "5", "--timeout", "18"],
                               cwd=fdir, capture_output=True, text=True, timeout=80)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip()[:1500]
        except Exception:
            pass
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        return urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore")[:1500]
    except Exception:
        return ""


def run(domain_key):
    cfg = json.load(open(CONFIG))
    domain = cfg["domains"].get(domain_key) or list(cfg["domains"].values())[0]
    news, x, yt = news_top(domain), x_top(domain), youtube_top(domain)
    detail = deep_fetch(news[0]["url"]) if news else ""
    out = ["# Importance briefing — " + domain.get("label", domain_key), ""]
    out.append("## News (coverage / recency)")
    for n in news:
        out.append("- **%s** (%s)\n  %s" % (n["title"], n.get("src", ""), n["url"]))
    out.append("\n## X influencers")
    for t in x:
        out.append("- **%s** (%s)\n  %s" % (t["title"], t.get("src", ""), t.get("url", "")))
    out.append("\n## YouTube (by views)")
    for v in yt:
        out.append("- **%s** (%s)\n  %s views — %s" % (v["title"], v.get("channel", ""),
                                                       "{:,}".format(v["views"]), v["url"]))
    raw = "\n".join(out)
    insight = codex_call("Items today:\n" + raw[:2200] + (("\n\nTop news body:\n" + detail) if detail else "") +
                         "\n\nWrite ONLY a 2-line insight on why today's flow matters. No clichés.",
                         "Output ONLY a 2-line insight, no item list.")
    insight = "\n".join([line for line in insight.splitlines() if line.strip()][:2])
    return ("💡 " + insight + "\n\n" + raw) if insight else raw


if __name__ == "__main__":
    print(run(sys.argv[1] if len(sys.argv) > 1 else "ai-tech"))
