// ============================================================
// CivCraft 2 — Civilization / Capitol Center v0.5
// CLIENT SCRIPT
// Put in: kubejs/client_scripts/
// ============================================================

ItemEvents.modifyTooltips(event => {

    event.add('kubejs:civilization_ledger', [
        Text.of('§6Industrial-Age national administration.'),
        Text.of(''),
        Text.of('§eRight-click EMPTY AIR§7 in a Capitol Center district'),
        Text.of('§7to create/select its Civilization.'),
        Text.of('§eRight-click EMPTY AIR§7 in any already-linked Palace settlement'),
        Text.of('§7to select that Civilization.'),
        Text.of('§eShift + Right-click EMPTY AIR§7 inside another Palace settlement'),
        Text.of('§7to attach the WHOLE settlement to the selected Civilization.'),
        Text.of(''),
        Text.of('§eRight-click Capitol signs§7 with this ledger to bind national stats.')
    ])
})
