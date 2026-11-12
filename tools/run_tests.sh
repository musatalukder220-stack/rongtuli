#!/bin/bash
# Rebuild and run every browser test.  Usage: bash tools/run_tests.sh
# Needs once per machine:  pip install playwright && python3 -m playwright install chromium-headless-shell && sudo python3 -m playwright install-deps chromium
# test_http.py, test_sandbox_iframe.py, test_ai_cutout.py expect the app on http://localhost:8000  (python3 -m http.server 8000 --directory app)
cd "$(dirname "$0")/.." || exit 1
python3 build.py || exit 1
fail=0
for t in tools/tests/test_*.py; do
  out=$(python3 "$t" 2>&1); code=$?
  # a page that cannot reach the update news while offline is expected, not an error
  bad=$(echo "$out" | grep -E "PAGEERROR|console\.error|Traceback|console\.warning" \
              | grep -v "willReadFrequently" | grep -v "OTS parsing error" | grep -v "Forbidden" | grep -v "CORS policy" | grep -v "ERR_FAILED" | head -3)
  if [ $code -ne 0 ] || [ -n "$bad" ]; then echo "FAIL  $t"; echo "$out" | tail -6; fail=1; else echo "ok    $t"; fi
done
exit $fail
