# Home-cloned local patch (test-project work, nothing deployed)
Base: b214f29592e4f90b756130ee6b7258021cc4a3c5 (main, "Unlink: refuse and disable while accounts are not server-loaded")
Apply: git clone https://github.com/Usernew0/Home-cloned && cd Home-cloned && git checkout b214f29 && git apply --index home-cloned-local.patch
Verify: npm ci && npx tsc --noEmit && npm test   (expected 175/175 pass)
handoff/ holds SQL (sql/01_prep, 03_activation, 04_flip), cutover_order.md (rehearsal order), rules draft + emulator test, PGlite tests rt/t2,t3,t8. SQL/rules are NOT applied anywhere.
Evidence is synthetic/local only. No live rehearsal done.
