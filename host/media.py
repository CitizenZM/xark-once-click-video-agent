"""Ad-library sources and cover images: the extra engine arguments and the checks around them.

Kept apart from oneclick_host.py so the allowlist and the argument lists can be tested on their own.
"""
import os, re
from urllib.parse import parse_qs, urlparse

# TikTok CDN host suffixes seen on ads.tiktok.com (lf-creative-factory.tiktokcdn.com, v16m-default.tiktokcdn.com). Nothing else is fetched.
TIKTOK_CDN_SUFFIXES = ("tiktokcdn.com",)
META_AD = re.compile(r"^https?://(?:www\.)?facebook\.com/ads/library/\?(?:.*&)?id=\d+")
TIKTOK_CC = re.compile(r"^https://ads\.tiktok\.com/business/creativecenter/topads/(\d+)")


def source_of(url):
    """Library `source` of a page URL: "meta-ads", "tiktok-cc", or None for organic videos."""
    if META_AD.match(url or ""):
        return "meta-ads"
    if TIKTOK_CC.match(url or ""):
        return "tiktok-cc"
    return None


def cc_id(url):
    m = TIKTOK_CC.match(url or "")
    return m.group(1) if m else None


def direct_ok(url, direct):
    """A direct mp4 is only accepted for a Creative Center detail URL and only from a TikTok CDN host over https."""
    if source_of(url) != "tiktok-cc":
        return False
    d = urlparse(direct or "")
    host = (d.hostname or "").lower().rstrip(".")
    if d.scheme != "https" or d.username or d.password or not host:
        return False
    if not any(host == s or host.endswith("." + s) for s in TIKTOK_CDN_SUFFIXES):
        return False
    return d.path.lower().endswith(".mp4") or "video_mp4" in parse_qs(d.query).get("mime_type", [])


def extra_args(opts):
    """engine arguments for the optional features of one download."""
    args = []
    if opts.get("direct"):
        # The mp4 link is not on any site extractor, and the generic extractor would name the file after the signed URL
        # (hundreds of characters: "File name too long"), so the name comes from the ad id instead.
        args += ["--use-extractors", "generic", "-o", os.path.join(opts["dir"].replace("%", "%%"), "TikTok ad - %s.%%(ext)s" % opts["ad_id"])]
    if opts.get("cover"):
        args += ["--write-thumbnail", "--convert-thumbnails", "jpg"]
    return args


def finish(meta, url, direct):
    """Add the library fields that engine does not know about."""
    src = source_of(url)
    if src:
        meta["source"] = src
    if src == "meta-ads" and "like_count" in meta:
        # engine fills like_count from the advertiser page's likes, not the ad's: keep it out of the like-based rankings.
        meta["page_like_count"] = meta.pop("like_count")
    if src == "tiktok-cc":
        meta["webpage_url"] = url
        meta["extractor_key"] = "TikTokAds"
        meta["id"] = cc_id(url)
        if not meta.get("title") or direct:
            meta["title"] = "TikTok ad " + cc_id(url)
    return meta
