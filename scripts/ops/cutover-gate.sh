#!/usr/bin/env bash
# scripts/ops/cutover-gate.sh — cutover validation gate (spec §10).
# This file implements stage S1 (Phase 0a, --on-box against the DARK content origin
# http://127.0.0.1:3001) and --attest. Stages S2-S4 and the --via-box / --via-cf modes
# are added by Plan 3.
#
# On a box (the script travels on stdin; nothing is copied to the box):
#   ssh -i ~/.ssh/oci_wavemax ubuntu@<ip> "GATE_ATTESTED='<ids>' bash -s -- --stage S1 --on-box" < scripts/ops/cutover-gate.sh
# Every command below reads its input from a file or a pipe, never from inherited
# stdin, so it cannot swallow the rest of the script.
set -uo pipefail

STAGE=""; MODE=""; BASE="http://127.0.0.1:3001"; LOG="/dev/null"; ATTESTED_LOG=""
ATTEST=""; BY=""; EVIDENCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --stage) STAGE="$2"; shift 2 ;;
    --on-box) MODE="on-box"; shift ;;
    --base) BASE="$2"; shift 2 ;;
    --log) LOG="$2"; shift 2 ;;
    --attested-log) ATTESTED_LOG="$2"; shift 2 ;;
    --attest) ATTEST="$2"; shift 2 ;;
    --by) BY="$2"; shift 2 ;;
    --evidence) EVIDENCE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# §10.4 redaction, applied to stdout AND the log.
redact() { sed -E 's/(bag=)[0-9a-f]{32}/\1<redacted>/g; s/([?&](k|t)=)[^& "]+/\1<redacted>/g; s/x-expediter-token: [^ ]+/x-expediter-token: <redacted>/g'; }
emit() { local line; line=$(printf '%s\n' "$1" | redact); printf '%s\n' "$line"; printf '%s\n' "$line" >> "$LOG"; }

if [ -n "$ATTEST" ]; then
  if [ -z "$BY" ] || [ -z "$EVIDENCE" ]; then echo "--attest needs --by and --evidence" >&2; exit 2; fi
  emit "MANUAL $ATTEST PASS $BY $(date -u +%Y-%m-%dT%H:%M:%SZ) $EVIDENCE"
  exit 0
fi
if [ "$STAGE" != "S1" ] || [ "$MODE" != "on-box" ]; then echo "only --stage S1 --on-box is implemented" >&2; exit 2; fi

FAILS=0; PENDING=0
pass() { emit "PASS $1"; }
fail() { emit "FAIL $1 $2"; FAILS=$((FAILS+1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "want=[$3] got=[$2]"; fi; }
lc() { tr -d '\r' | tr '[:upper:]' '[:lower:]'; }
hdr() { grep -i "^$1:" "$2" | head -1 | tr -d '\r' | cut -d' ' -f2-; }
field() { printf '%s\n' "$1" | cut -d'|' -f"$2"; }
ctype() { local v; v=$(field "$1" 2); printf '%s' "${v%%;*}"; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
LOGO_MD5="${GATE_LOGO_MD5:-7f5332b870fe36482e4b8d27f5c9334f}"
LOGO_BYTES="${GATE_LOGO_BYTES:-5137}"
STORE_IP="${GATE_STORE_IP:-72.190.1.227}"
EXPECT_UIR="${GATE_EXPECT_UIR:-1}"
FP_HREFS="${GATE_FP_HREFS:-5}"
PARTNER_KEYS="${GATE_PARTNER_KEYS:-119}"
SEC_CONTACT="${GATE_SECURITY_CONTACT:-security@crhsent.com}"
D5="${GATE_D5:-pending}"
PORTAL="https://portal.atxwashdryfold.com"
CANON="https://atxwashdryfold.com"
TOK=0123456789abcdef0123456789abcdef
MKT="rundberglaundry.com runberglaundry.com atxwashateria.com atxwashdryfold.com"
DROPPED='facebook|local-marketing-reports|cloudflareinsights|jsdelivr|cdnjs|jquery|googleapis|gstatic|recaptcha|matterport|walibu|openstreetmap|wikimedia|flagcdn|firebaseapp|challenges\.cloudflare|stackpath|wavemaxlaundry|wavemax\.promo|osrm|graphhopper|openrouteservice|valhalla|nominatim'
MANUAL_IDS="C5-contact C6-mail C13-click C14-baseline P1 P2 P3 P8 P13 P14 R2-cors"

# get <name> <host> <path> [extra curl args] -> headers $TMP/<name>.h, body $TMP/<name>.b;
# prints "code|content_type|redirect_url"
get() {
  local n="$1" h="$2" p="$3"; shift 3
  local H=(); [ -n "$h" ] && H=(-H "Host: $h")
  curl -s -D "$TMP/$n.h" -o "$TMP/$n.b" -w '%{http_code}|%{content_type}|%{redirect_url}' "${H[@]}" "$@" "$BASE$p" </dev/null
}
code_of() { curl -s -o /dev/null -w '%{http_code}' "$@" </dev/null; }
not301() { if [ "$1" = 301 ]; then echo 301; else echo not301; fi; }

csp_cells() {
  local id="$1" hf="$2" bf="$3" csp ss n meta st fs fa third uir nl re
  csp=$(hdr content-security-policy "$hf")
  ss=$(printf '%s\n' "$csp" | grep -oP "(?<![-\w])script-src [^;]*" | head -1)
  re="^script-src 'self' 'nonce-([A-Za-z0-9+/=_-]+)'$"
  if [[ "$ss" =~ $re ]]; then n="${BASH_REMATCH[1]}"; else n=""; fi
  meta=$(grep -oP '<meta name="csp-nonce" content="\K[^"]+' "$bf" | head -1)
  st=$(printf '%s\n' "$csp" | grep -oP "(?<![-\w])style-src [^;]*" | head -1)
  fs=$(printf '%s\n' "$csp" | grep -oP "(?<![-\w])frame-src [^;]*" | head -1)
  fa=$(printf '%s\n' "$csp" | grep -oP "frame-ancestors [^;]*" | head -1)
  third=$(printf '%s\n' "$csp" | grep -Eic "$DROPPED")
  uir=$(printf '%s\n' "$csp" | grep -c 'upgrade-insecure-requests')
  nl=$(grep -oE '<script[^>]*src=[^>]*>' "$bf" | grep -vc 'nonce=')
  local nonce_ok=nonce-bad; [ -n "$n" ] && [ "$n" = "$meta" ] && nonce_ok=nonce-ok
  check "C10-csp $id" "$nonce_ok|$st|$fs|$fa|$third|$uir|$nl" "nonce-ok|style-src 'self' 'unsafe-inline'|frame-src 'none'|frame-ancestors 'self'|0|$EXPECT_UIR|0"
}

# §9.2 step 5 static checks: no external origin on any resource tag, stylesheets and
# inline styles pull no remote url()/@import (fonts self-hosted).
static_cells() {
  local id="$1" host="$2" bf="$3" tags sheets css=0 inl s
  tags=$(python3 - "$bf" <<'PY'
import re, sys
h = open(sys.argv[1], encoding='utf-8', errors='replace').read()
bad = 0
for t in re.findall(r'<(?:script|link|img|source|iframe|video|audio)\b[^>]*>', h, re.I):
    for v in re.findall(r'\b(?:src|href|srcset)\s*=\s*"([^"]*)"', t, re.I):
        if re.match(r'(?i)^\s*(https?:)?//', v) and not v.startswith('https://atxwashdryfold.com/'):
            bad += 1
print(bad)
PY
)
  sheets=$(python3 - "$bf" <<'PY'
import re, sys
h = open(sys.argv[1], encoding='utf-8', errors='replace').read()
for t in re.findall(r'<link\b[^>]*>', h, re.I):
    if re.search(r'rel\s*=\s*"[^"]*stylesheet', t, re.I):
        m = re.search(r'href\s*=\s*"(/[^"]*)"', t, re.I)
        if m:
            print(m.group(1))
PY
)
  for s in $sheets; do
    curl -s -o "$TMP/css" -H "Host: $host" "$BASE$s" </dev/null
    css=$((css + $(grep -cE "(url\(\s*['\"]?(https?:)?//|@import\s+(url\()?['\"]?(https?:)?//)" "$TMP/css")))
  done
  inl=$(grep -cE "url\(\s*['\"]?(https?:)?//" "$bf")
  check "C10-static $id" "$tags|$css|$inl" "0|0|0"
}

# ---- C9: /health for every Host and for no Host — 200 JSON, no-store, never a cookie ----
for h in $MKT crhsent.com portal.atxwashdryfold.com ""; do
  r=$(get health "$h" /health)
  check "C9-health ${h:-nohost}" "$(field "$r" 1)|$(ctype "$r")|$(cat "$TMP/health.b")|$(grep -ci '^set-cookie:' "$TMP/health.h")|$(hdr cache-control "$TMP/health.h" | lc)" '200|application/json|{"status":"ok"}|0|no-store'
done

# ---- R6 / R8 / R7 ----
check "R6-portal-404" "$(field "$(get r6 portal.atxwashdryfold.com /)" 1)" "404"
check "R8-unknown-404" "$(field "$(get r8 example.invalid /)" 1)" "404"
r=$(get r7 crhsent.com / -H 'X-Forwarded-Proto: https')
check "R7-crhsent" "$(field "$r" 1)|$(grep -ci '^set-cookie: __Host-crhsent\.sid=' "$TMP/r7.h")" "200|1"

# ---- C11: crhsent.com frame-ancestors ----
for p in / /wavemax/; do
  get c11 crhsent.com "$p" >/dev/null
  check "C11-frame-ancestors crhsent.com $p" "$(hdr content-security-policy "$TMP/c11.h" | grep -oP "frame-ancestors [^;]*")" "frame-ancestors 'self'"
done

# ---- R-3: a forged X-Forwarded-Host never steers a gate (Global Constraint 20) ----
r=$(get r3w crhsent.com /wavemax/ -H 'X-Forwarded-Host: rundberglaundry.com')
check "R3-xfh-wavemax" "$(field "$r" 1)|$(grep -c 'Documented record &mdash; access' "$TMP/r3w.b")|$(grep -c 'WaveMAX 3.0 platform' "$TMP/r3w.b")" "200|1|0"
r=$(get r3r crhsent.com /README.md -H 'X-Forwarded-Host: rundberglaundry.com')
check "R3-xfh-readme" "$(field "$r" 1)|$(grep -c 'This content is private.' "$TMP/r3r.b")" "401|1"
r=$(get c9bi crhsent.com /README.md -H 'X-Forwarded-Host: atxwashdryfold.com')
check "C9b-inverse crhsent.com" "$(field "$r" 1)|$(grep -c 'This content is private.' "$TMP/c9bi.b")" "401|1"

# ---- C7 logo on crhsent.com; C8 negative on crhsent.com ----
r=$(get logoc crhsent.com /assets/images/brand/logo.png)
check "C7-logo crhsent.com" "$(field "$r" 1)|$(ctype "$r")|$(md5sum < "$TMP/logoc.b" | cut -d' ' -f1)|$(stat -c %s "$TMP/logoc.b")" "200|image/png|$LOGO_MD5|$LOGO_BYTES"
r=$(get lwc crhsent.com /assets/images/brand/logo-wavemax.png)
check "C7-logo-wavemax-410 crhsent.com" "$(field "$r" 1)|$(grep -ci '^location:' "$TMP/lwc.h")" "410|0"
c=$(code_of -H 'Host: crhsent.com' -H "CF-Connecting-IP: $STORE_IP" "$BASE/")
check "C8-crhsent-not302" "$([ "$c" = 302 ] && echo 302 || echo not302)" "not302"

for H in $MKT; do
  # ---- C1 / C12 / C10 on / ----
  r=$(get home "$H" /)
  i18n=$(grep -c 'data-i18n="partner.hero.title"' "$TMP/home.b")
  meta=$(grep -oP '<meta name="csp-nonce" content="\K[^"]+' "$TMP/home.b" | head -1)
  bare=$(sed -E 's/<[^>]*>//g' "$TMP/home.b" | grep -oiE 'wavemax[a-z ]*' | grep -vic 'WaveMAX Austin')
  fp=$(grep -o 'href="https://www.wavemaxlaundry.com/austin-tx"' "$TMP/home.b" | wc -l | tr -d ' ')
  imm=$(hdr cache-control "$TMP/home.h" | grep -ci immutable)
  check "C1-home $H" "$(field "$r" 1)|$(ctype "$r")|$i18n|$([ -n "$meta" ] && echo filled || echo empty)|$bare|$fp|$imm" "200|text/html|1|filled|0|$FP_HREFS|0"
  check "C12-canonical $H /" "$(grep -o '<link rel="canonical" href="[^"]*">' "$TMP/home.b" | tr '\n' '#')" "<link rel=\"canonical\" href=\"$CANON/\">#"
  csp_cells "$H /" "$TMP/home.h" "$TMP/home.b"
  static_cells "$H /" "$H" "$TMP/home.b"

  # ---- C2 / C12 / C10 on /affiliate ----
  for p in /affiliate /affiliate/; do
    r=$(get aff "$H" "$p")
    check "C2-affiliate $H $p" "$(field "$r" 1)|$(grep -o '<link rel="canonical" href="[^"]*">' "$TMP/aff.b" | tr '\n' '#')" "200|<link rel=\"canonical\" href=\"$CANON/affiliate\">#"
  done
  check "C12-canonical $H /affiliate" "$(grep -o '<link rel="canonical" href="[^"]*">' "$TMP/aff.b" | tr '\n' '#')" "<link rel=\"canonical\" href=\"$CANON/affiliate\">#"
  csp_cells "$H /affiliate" "$TMP/aff.h" "$TMP/aff.b"
  static_cells "$H /affiliate" "$H" "$TMP/aff.b"

  # ---- C2 D5 (/wavemax-affiliate, PENDING COUNSEL until merged) ----
  if [ "$D5" = merged ]; then
    r=$(get d5 "$H" '/wavemax-affiliate?utm=1'); loc=$(field "$r" 3)
    case "$(field "$r" 1)|$loc" in
      "301|https://$H/affiliate?utm=1"|"301|$BASE/affiliate?utm=1") pass "C2-wavemax-affiliate $H" ;;
      *) fail "C2-wavemax-affiliate $H" "got=[$(field "$r" 1) $loc]" ;;
    esac
  else
    emit "SKIP C2-wavemax-affiliate $H D5 PENDING COUNSEL"
  fi

  # ---- C3 robots ----
  r=$(get rob "$H" /robots.txt); f="$TMP/rob.b"
  check "C3-robots $H" "$(field "$r" 1)|$(ctype "$r")|$(grep -c '^Disallow: /$' "$f")|$(grep -A1 '^User-agent: \*$' "$f" | grep -c '^Disallow: /$')|$(grep -c 'Content-Signal' "$f")|$(grep -c '^Disallow: /api/$' "$f")|$(grep -c "^Sitemap: $CANON/sitemap.xml$" "$f")|$(hdr cache-control "$TMP/rob.h" | grep -c 'max-age=3600')" "200|text/plain|9|0|0|1|1|1"

  # ---- C4 sitemap: well-formed, exactly the two canonical locs, each loc 200 ----
  r=$(get sm "$H" /sitemap.xml)
  wf=$(python3 -c 'import sys, xml.dom.minidom as m; m.parseString(open(sys.argv[1], "rb").read()); print("ok")' "$TMP/sm.b" 2>/dev/null </dev/null)
  locs=$(grep -o '<loc>[^<]*</loc>' "$TMP/sm.b" | sed 's/<[^>]*>//g' | tr '\n' ' ')
  bad=0
  for u in $locs; do
    case "$u" in
      "$CANON"/*) [ "$(code_of -H 'Host: atxwashdryfold.com' "$BASE${u#"$CANON"}")" = 200 ] || bad=$((bad+1)) ;;
      *) bad=$((bad+1)) ;;
    esac
  done
  check "C4-sitemap $H" "$(field "$r" 1)|$(ctype "$r")|$wf|$locs|$bad|$(hdr cache-control "$TMP/sm.h" | grep -c 'max-age=3600')" "200|application/xml|ok|$CANON/ $CANON/affiliate |0|1"

  # ---- C5 security.txt + favicon (address deliverability is MANUAL C5-contact) ----
  r=$(get sec "$H" /.well-known/security.txt); f="$TMP/sec.b"
  exp=$(grep -oP '^Expires: \K.*' "$f" | head -1)
  fut=past; [ -n "$exp" ] && [ "$(date -d "$exp" +%s 2>/dev/null || echo 0)" -gt "$(date +%s)" ] && fut=future
  check "C5-securitytxt $H" "$(field "$r" 1)|$(ctype "$r")|$(grep -c "^Contact: mailto:$SEC_CONTACT$" "$f")|$fut|$(grep -Eic 'franchis|wavemax' "$f")|$(grep -c "^Canonical: https://$H/.well-known/security.txt$" "$f")|$(grep -c '^Policy: https://portal.atxwashdryfold.com/privacy-policy$' "$f")" "200|text/plain|1|future|0|1|1"
  r=$(get fav "$H" /favicon.ico)
  check "C5-favicon $H" "$(field "$r" 1)|$(ctype "$r")" "200|image/png"

  # ---- C6 page-JS path + limiter-free negative (the mail itself is MANUAL C6-mail) ----
  curl -s -o "$TMP/pi.js" -H "Host: $H" "$BASE/assets/js/partner-inquiry.js" </dev/null
  curl -s -o "$TMP/ai.js" -H "Host: $H" "$BASE/assets/js/affiliate-inquiry.js" </dev/null
  check "C6-pagejs $H" "$(grep -c "fetch('/api/partner-inquiry'" "$TMP/pi.js")|$(grep -c '/api/v1/' "$TMP/pi.js")|$(grep -c "fetch('/api/affiliate-application'" "$TMP/ai.js")|$(grep -c '/api/v1/' "$TMP/ai.js")" "1|0|1|0"
  check "C6-v1-anything-else $H" "$(code_of -X POST -H "Host: $H" -H 'Content-Type: application/json' --data '{}' "$BASE/api/v1/anything-else")" "404"

  # ---- C7 B7 301s (byte-exact Location, GET and HEAD), negatives, logo, DMCA 410 ----
  for m in GET HEAD; do
    for q in "/embed-app-v2.html?route=/claim&bag=$TOK" "/embed-app-v2.html?route=/order-expediter&k=abc"; do
      if [ "$m" = HEAD ]; then
        r=$(curl -s -I -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" "$BASE$q" </dev/null)
      else
        r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" "$BASE$q" </dev/null)
      fi
      case "$q" in *claim*) id=C7-bagqr-301 ;; *) id=C7-expediter-301 ;; esac
      check "$id $H $m" "$r" "301 $PORTAL$q"
    done
  done
  for p in /admin /admin/ /operator /operator/ /operator-scan-embed.html /scanbag /scanbag/ /scanbag-manifest.json /scanbag-sw.js /monitoring-dashboard.html /api/v1/customers/verify-email/abc; do
    check "C7-legacy-301 $H $p" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" "$BASE$p" </dev/null)" "301 $PORTAL$p"
  done
  neg="$(code_of -X POST -H "Host: $H" "$BASE/api/v1/customers/register")|$(code_of -H "Host: $H" "$BASE/api/v1/customers/other")"
  neg="$neg|$(not301 "$(code_of -X POST -H "Host: $H" "$BASE/embed-app-v2.html")")|$(not301 "$(code_of -H "Host: $H" "$BASE/assets/x.css")")|$(not301 "$(code_of -H "Host: $H" "$BASE/locales/en/common.json")")"
  check "C7-negative $H" "$neg" "404|404|not301|not301|not301"
  r=$(get logo "$H" /assets/images/brand/logo.png)
  check "C7-logo $H" "$(field "$r" 1)|$(ctype "$r")|$(md5sum < "$TMP/logo.b" | cut -d' ' -f1)|$(stat -c %s "$TMP/logo.b")" "200|image/png|$LOGO_MD5|$LOGO_BYTES"
  r=$(get lw "$H" /assets/images/brand/logo-wavemax.png)
  check "C7-logo-wavemax-410 $H" "$(field "$r" 1)|$(grep -ci '^location:' "$TMP/lw.h")" "410|0"

  # ---- C8 store-IP 302 (on-box only; C8b is S3) ----
  for q in "/" "/affiliate?x=1" "/anything?x=1"; do
    r=$(curl -s -D "$TMP/s.h" -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" -H "CF-Connecting-IP: $STORE_IP" "$BASE$q" </dev/null)
    check "C8-storeip-302 $H $q" "$r|$(hdr cache-control "$TMP/s.h" | lc)" "302 $PORTAL$q|no-store"
  done
  check "C8-nonstore-200 $H" "$(code_of -H "Host: $H" -H 'CF-Connecting-IP: 203.0.113.10' "$BASE/?x=1")" "200"
  check "C8-legacy-wins $H" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" -H "CF-Connecting-IP: $STORE_IP" "$BASE/admin" </dev/null)" "301 $PORTAL/admin"
  emit "SKIP C8b $H on-box: header is edge-owned and re-stamped by nginx (S3 --via-box/--via-cf)"

  # ---- C9b spoof: 100 requests with X-Forwarded-Host: crhsent.com mint no cookie ----
  sc=0
  for i in $(seq 100); do
    curl -s -D "$TMP/sp.h" -o "$TMP/sp.b" -H "Host: $H" -H 'X-Forwarded-Host: crhsent.com' "$BASE/?sp=$i" </dev/null
    sc=$((sc + $(grep -ci '^set-cookie:' "$TMP/sp.h")))
  done
  check "C9b-spoof $H" "$sc|$(grep -c 'data-i18n="partner.hero.title"' "$TMP/sp.b")" "0|1"

  # ---- C13 locales: 200 JSON, ACAO *, 119 partner.* keys, no bare mark, identical key sets ----
  sets=""
  for l in en es pt de; do
    r=$(get loc "$H" "/locales/$l/common.json")
    out=$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const f=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?f(v,p+k+"."):[p+k]);const k=f(j);console.log(k.filter((x)=>x.startsWith("partner.")).length+"|"+/wavemax/i.test(JSON.stringify(j).replace(/WaveMAX Austin/g,""))+"|"+require("crypto").createHash("md5").update(k.sort().join(",")).digest("hex"))' "$TMP/loc.b" 2>/dev/null </dev/null || echo "parse-error|x|none-$l")
    check "C13-locales $H $l" "$(field "$r" 1)|$(ctype "$r")|$(hdr access-control-allow-origin "$TMP/loc.h")|${out%|*}" "200|application/json|*|$PARTNER_KEYS|false"
    sets="$sets ${out##*|}"
  done
  check "C13-keysets $H" "$(printf '%s\n' $sets | sort -u | wc -l | tr -d ' ')" "1"
done

# ---- MANUAL / REMOTE cells scheduled at S1, cleared only by --attest ----
for m in $MANUAL_IDS; do
  if { [ -n "$ATTESTED_LOG" ] && grep -q "^MANUAL $m PASS " "$ATTESTED_LOG" 2>/dev/null; } || [[ " ${GATE_ATTESTED:-} " == *" $m "* ]]; then
    emit "PASS $m attested"
  else
    emit "MANUAL $m PENDING"; PENDING=$((PENDING+1))
  fi
done
emit "SUMMARY S1 fails=$FAILS pending=$PENDING"
if [ "$FAILS" -eq 0 ] && [ "$PENDING" -eq 0 ]; then exit 0; else exit 1; fi
