# Review 4 (read-only, round ex5-ex10)
Findings, worst first: 1 history survives server change (high); 2 Decide session survives server change; 3 reload after absence discards unregistered input; 4 connection test misleading (no token, saved vs typed address, stale result, TLS); 5 forward history not cleared on non-pop changes; 6 menu bar count stale in background; 7 drafts clipped silently; 8 drafts survive token removal; 9 stale Refocus open; 10 Cmd-K does nothing with main window closed.
Open without a todo: 6 (menu bar count only refreshes on activation).
Not verified by hand: Go menu enabled state refresh, keyWindow at activation, menu bar item Cmd-drag removal.

END-OF-REPORT
