set -u
push() { # name  value  sensitivity-flag
  out=$(npx vercel env add "$1" production --value "$2" --force --yes $3 2>&1)
  if printf '%s' "$out" | grep -qiE "added|created|saved"; then echo "OK    $1"
  else echo "ERR   $1 -> $(printf '%s' "$out" | grep -viE '^\s*$' | tail -1)"; fi
}
getv() { grep -m1 "^$1=" .env.local | cut -d'=' -f2- | tr -d '\r' | sed "s/^['\"]//; s/['\"]\$//"; }

# secrets (restent chiffres)
push DATABASE_URL            "$(getv DATABASE_URL)"            ""
push STRIPE_SECRET_KEY       "$(getv STRIPE_SECRET_KEY)"       ""
push RESEND_API_KEY          "$(getv RESEND_API_KEY)"          ""
push BUNNY_STREAM_API_KEY    "$(getv BUNNY_STREAM_API_KEY)"    ""
# non-secrets (lisibles => verifiables)
push RESEND_FROM             "$(getv RESEND_FROM)"             "--no-sensitive"
push BUNNY_STREAM_LIBRARY_ID "$(getv BUNNY_STREAM_LIBRARY_ID)" "--no-sensitive"
push NEXT_PUBLIC_USD_TO_HTG  "$(getv NEXT_PUBLIC_USD_TO_HTG)"  "--no-sensitive"
push ADMIN_DATA_SOURCE       "$(getv ADMIN_DATA_SOURCE)"       "--no-sensitive"
push ADMIN_BOOTSTRAP_EMAILS  "$(getv ADMIN_BOOTSTRAP_EMAILS)"  "--no-sensitive"
push NEXT_PUBLIC_SITE_URL    "https://pniceacademy.com"        "--no-sensitive"
