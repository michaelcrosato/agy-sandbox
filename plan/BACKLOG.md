# BACKLOG — adjacent ideas surfaced during execution

Items noticed mid-spec that are out of the current spec's scope. Triage into `specs/` when prioritized.

- **Tractor outfit mass (noticed during spec 020):** `engine/Outfitting.applyOutfitStats` only adds an
  outfit's `mass` for a *matched* stat type, so the stat-less `tractor` type (Tractor Beam Matrix, 200 kg)
  no longer contributes hull mass on buy/salvage. This was an incidental behaviour change when spec 007
  extracted the inline `outfit_buy` switch (the original applied mass unconditionally). Buy and salvage are
  now *consistent* (both skip it), so it's not a correctness regression between paths — but if tractor
  *should* add mass, add `case "tractor": break;` to `applyOutfitStats` (so `applied` is true and the mass
  branch runs) and add a regression test. Low priority.
