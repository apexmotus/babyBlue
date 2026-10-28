#!/usr/bin/env bash
# Releases ONE batch of 100 practices, with every gate in order, and stops at the first one that fails.
#
#   scripts/directory/release-batch.sh <batchNumber> <prepared.json> <meta.json> [--verify-only]
#
# 1. emit the batch (skipped if its file is already there and uncommitted)   5. merge dev -> staging -> main (fast-forward only)
# 2. data tests + typecheck                                                   6. deploy to Vercel production
# 3. commit on dev                                                            7. check the LIVE site: counts, a new practice, key pages
# 4. push dev
#
# --verify-only runs just step 7 for a batch that is already released (safe to repeat).
#
# Production deploys need the owner's explicit say-so; this script exists because the owner asked for batches to go to
# production one at a time. Never run it in parallel and never edit a released batch.
set -euo pipefail

N="${1:?batch number}"; PREPARED="${2:?prepared.json}"; META="${3:?meta.json}"; MODE="${4:-}"
cd "$(dirname "$0")/../.."
BASE="https://babyblue-demo.vercel.app"
SCOPE="jameel-the-designers-projects"
PAD=$(printf '%03d' "$N")
FILE="src/data/practices/batch-$PAD.json"

fail() { echo "BATCH $N STOPPED: $1" >&2; exit 1; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 40 "$1"; }

emit_and_test() {
  if [ ! -f "$FILE" ]; then
    [ -z "$(git status --porcelain)" ] || fail "working tree is not clean"
    echo "== batch $N: emit"
    node scripts/directory/emit-batch.mjs "$PREPARED" "$N" "$META" >/dev/null
  else
    echo "== batch $N: using existing $FILE"
  fi
  echo "== batch $N: tests"
  local log; log=$(mktemp)
  npx vitest run tests/unit > "$log" 2>&1 || { tail -30 "$log"; rm -f "$log"; fail "data tests failed (nothing committed)"; }
  grep -E "Test Files|Tests " "$log" | sed -E 's/\x1b\[[0-9;]*m//g'; rm -f "$log"
  rm -rf .next/types .next/dev/types
  npx tsc --noEmit || fail "typecheck failed (nothing committed)"
}

commit_and_push() {
  echo "== batch $N: commit and push dev"
  git add -A
  git commit -q -F - <<MSG
feat: BabyBlue — directory batch $PAD (+$COUNT real practices, $TOTAL live)

Practices from OpenStreetMap (ODbL), cleaned and de-duplicated; emails, pharmacies and
laboratories are never kept. Each record keeps its OpenStreetMap id. Data tests and typecheck
passed before this commit. Not on BabyBlue, no reviews or ratings.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
  git push -q origin dev || fail "push to dev failed"
}

promote() {
  echo "== batch $N: staging then main (fast-forward only)"
  git checkout -q staging && git merge -q --ff-only dev && git push -q origin staging || { git checkout -q dev; fail "staging merge or push failed"; }
  git checkout -q main && git merge -q --ff-only staging && git push -q origin main || { git checkout -q dev; fail "main merge or push failed"; }
  git checkout -q dev
}

deploy() {
  echo "== batch $N: deploy to production"
  vercel deploy --prod --yes --scope "$SCOPE" 2>&1 | grep -E "Production:|Aliased:|rror" || true
}

verify() {
  echo "== batch $N: verify live"
  local ok="" got live i
  for i in 1 2 3 4 5 6; do
    live=$(curl -s --max-time 30 "$BASE/api/directory/stats?v=$RANDOM$RANDOM" || true)
    got=$(echo "$live" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.practices+"/"+j.batches)}catch{console.log("none")}})')
    [ "$got" = "$TOTAL/$N" ] && { ok=1; break; }
    echo "   live says $got, want $TOTAL/$N (try $i)"; sleep 8
  done
  [ -n "$ok" ] || fail "production is not serving $TOTAL practices in $N batches"
  [ "$(code "$BASE/")" = "200" ] || fail "home page is not 200"
  [ "$(code "$BASE/directory")" = "200" ] || fail "/directory is not 200"
  [ "$(code "$BASE/physiotherapy/cape-town")" = "200" ] || fail "a listing page is not 200"
  [ "$(code "$BASE/patient/signup")" = "200" ] || fail "sign-up page is not 200"
  # React puts comment markers between text nodes, so check the page by status and by the practice id it links to itself.
  [ "$(code "$BASE/directory/p/$FIRST_ID")" = "200" ] || fail "new practice $FIRST_ID is not served"
  curl -s --max-time 40 "$BASE/directory/p/$FIRST_ID" | grep -q "/directory/p/$FIRST_ID" || fail "the page for $FIRST_ID does not describe itself"
  [ "$(code "$BASE/directory/p/zzz")" = "404" ] || fail "an unknown practice should be a 404"
  echo "BATCH $N LIVE: $TOTAL practices in production ($BASE/directory/p/$FIRST_ID)"
}

[ "$(git branch --show-current)" = "dev" ] || fail "not on dev"

if [ "$MODE" != "--verify-only" ]; then emit_and_test; fi
[ -f "$FILE" ] || fail "$FILE does not exist"
COUNT=$(node -e 'console.log(require("./'"$FILE"'").length)')
FIRST_ID=$(node -e 'console.log(require("./'"$FILE"'")[0].id)')
FIRST_NAME=$(node -e 'console.log(require("./'"$FILE"'")[0].name)')
TOTAL=$(node -e 'let t=0;for(let i=1;i<='"$N"';i++){t+=require("./src/data/practices/batch-"+String(i).padStart(3,"0")+".json").length}console.log(t)')
echo "   $COUNT records, $TOTAL live in total after this batch. First: $FIRST_ID $FIRST_NAME"

if [ "$MODE" != "--verify-only" ]; then
  commit_and_push
  promote
  deploy
fi
verify
